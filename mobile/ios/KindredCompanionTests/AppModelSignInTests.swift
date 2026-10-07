import KindredCore
import XCTest
@testable import Kindred

/// Serves canned responses so sign-in runs without a network or server.
final class StubProtocol: URLProtocol {
    static var handler: ((URLRequest) -> (Int, Data))?
    static var paths: [String] = []

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let url = request.url else { return }
        StubProtocol.paths.append(url.path)
        let (status, body) = StubProtocol.handler?(request) ?? (404, Data())
        let headers = status == 302 ? ["Location": "https://evil.example/identity/login"] : ["Content-Type": "application/json"]
        let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: body)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

@MainActor
final class AppModelSignInTests: XCTestCase {
    private let token = String(repeating: "a1", count: 32)
    private let serverAccount = "6f9619ff-8b86-d011-b42d-00cf4fc964ff"
    private var folder: URL!
    private var secrets: InMemorySecretStore!
    private var model: AppModel!

    override func setUp() async throws {
        folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        secrets = InMemorySecretStore()
        let configuration = KindredAPIClient.defaultConfiguration()
        configuration.protocolClasses = [StubProtocol.self]
        StubProtocol.paths = []
        model = AppModel(secrets: secrets, repository: AccountRepository(fileURL: folder.appendingPathComponent("accounts.json")),
                         api: KindredAPIClient(configuration: configuration))
    }

    override func tearDown() async throws {
        StubProtocol.handler = nil
        try? FileManager.default.removeItem(at: folder)
    }

    private func serveKindred(loginStatus: Int = 200) {
        let token = self.token
        let account = serverAccount
        StubProtocol.handler = { request in
            switch request.url?.path {
            case "/identity/meta":
                return (200, Data(#"{"profiles":true,"version":"0.0.0"}"#.utf8))
            case "/identity/login":
                return (loginStatus, Data(#"{"token":"\#(token)","profile_id":"p-1"}"#.utf8))
            case "/identity/profiles":
                return (200, Data(#"{"active":"p-1","account_id":"\#(account)","username":"ada","legacy":false,"profiles":[{"id":"p-1","name":"Ada's Studio","active":true}]}"#.utf8))
            default:
                return (404, Data())
            }
        }
    }

    func testPrivateHTTPNeedsExactConfirmationBeforeAnyRequest() async throws {
        serveKindred()
        let origin = try ServerAddress.normalize("http://192.168.1.20:9444")
        for confirmation in [nil, try ServerAddress.normalize("https://192.168.1.20:9444"),
                             try ServerAddress.normalize("http://192.168.1.20:9445")] as [ServerOrigin?] {
            do {
                try await model.signIn(origin: origin, login: "ada", password: "pw", confirmedPrivateOrigin: confirmation)
                XCTFail("Unconfirmed origin must not send a request")
            } catch { XCTAssertEqual(error as? ServerAddressError, .privateConfirmation) }
            XCTAssertTrue(StubProtocol.paths.isEmpty)
            XCTAssertTrue(model.accounts.isEmpty)
        }
        try await model.signIn(origin: origin, login: "ada", password: "pw", confirmedPrivateOrigin: origin)
        XCTAssertEqual(model.accounts.first?.origin, origin)
        XCTAssertEqual(Array(StubProtocol.paths.prefix(3)), ["/identity/meta", "/identity/login", "/identity/profiles"])
    }

    func testPrivatePairingNeedsConfirmationBeforeCodeOrVerification() async throws {
        serveKindred()
        let code = String(repeating: "a", count: 64)
        let link = try PairingLink.parse("kindred://pair?server=http%3A%2F%2F192.168.1.20%3A9444#code=" + code)
        do {
            _ = try await model.pair(with: link)
            XCTFail("Unconfirmed pairing must not send a request")
        } catch { XCTAssertEqual(error as? ServerAddressError, .privateConfirmation) }
        XCTAssertTrue(StubProtocol.paths.isEmpty)
        XCTAssertFalse(model.isPairing)
        XCTAssertTrue(model.accounts.isEmpty)
    }

    func testSignInKeepsTheTokenOutOfMetadata() async throws {
        serveKindred()
        let origin = try ServerAddress.normalize("kindred.example.com")
        try await model.signIn(origin: origin, login: " Ada ", password: "correct horse")

        XCTAssertEqual(model.accounts.count, 1)
        let account = try XCTUnwrap(model.accounts.first)
        XCTAssertEqual(account.login, "ada")
        XCTAssertEqual(account.profileName, "Ada's Studio")
        XCTAssertEqual(account.serverAccountID, serverAccount)
        XCTAssertEqual(model.activeAccountID, account.id)
        XCTAssertTrue(model.isSignedIn(account.id))
        XCTAssertEqual(try secrets.token(for: account.id), token)
        XCTAssertEqual(Array(StubProtocol.paths.prefix(3)), ["/identity/meta", "/identity/login", "/identity/profiles"])

        let saved = try String(contentsOf: folder.appendingPathComponent("accounts.json"), encoding: .utf8)
        XCTAssertFalse(saved.contains(token))
        XCTAssertFalse(saved.contains("correct horse"))
    }

    func testSigningInAgainReusesTheSavedAccount() async throws {
        serveKindred()
        let origin = try ServerAddress.normalize("kindred.example.com")
        try await model.signIn(origin: origin, login: "ada", password: "pw")
        let first = try XCTUnwrap(model.accounts.first?.id)
        try await model.signIn(origin: origin, login: "ADA", password: "pw")
        XCTAssertEqual(model.accounts.map(\.id), [first])
    }

    func testRedirectedSignInIsRefusedAndNothingIsSaved() async throws {
        serveKindred(loginStatus: 302)
        let origin = try ServerAddress.normalize("kindred.example.com")
        do {
            try await model.signIn(origin: origin, login: "ada", password: "pw")
            XCTFail("redirected sign-in must fail")
        } catch {
            XCTAssertEqual(error as? KindredAPIError, .redirectRefused)
        }
        XCTAssertTrue(model.accounts.isEmpty)
        XCTAssertFalse(StubProtocol.paths.contains("/identity/profiles"))
    }

    func testNonKindredServerNeverReceivesThePassword() async throws {
        StubProtocol.handler = { _ in (200, Data(#"{"hello":"world"}"#.utf8)) }
        let origin = try ServerAddress.normalize("not-kindred.example.com")
        do {
            try await model.signIn(origin: origin, login: "ada", password: "pw")
            XCTFail("expected refusal")
        } catch {
            XCTAssertEqual(error as? KindredAPIError, .notKindredServer)
        }
        XCTAssertEqual(StubProtocol.paths, ["/identity/meta"])
    }

    func testRemoveForgetsTokenAndAccount() async throws {
        serveKindred()
        let origin = try ServerAddress.normalize("kindred.example.com")
        try await model.signIn(origin: origin, login: "ada", password: "pw")
        let id = try XCTUnwrap(model.accounts.first?.id)
        try await model.remove(id, ignoringNotificationFailure: false)
        XCTAssertTrue(model.accounts.isEmpty)
        XCTAssertNil(try secrets.token(for: id))
        XCTAssertNil(model.activeAccountID)
        XCTAssertTrue(StubProtocol.paths.contains("/identity/logout"))
    }

    func testRemovalStopsWhenNotificationRemovalFails() async throws {
        serveKindred()
        let origin = try ServerAddress.normalize("kindred.example.com")
        try await model.signIn(origin: origin, login: "ada", password: "pw")
        let id = try XCTUnwrap(model.accounts.first?.id)
        model.markRegisteredForTesting(id)

        StubProtocol.handler = { request in
            request.httpMethod == "DELETE" ? (500, Data(#"{"error":"database busy"}"#.utf8)) : (200, Data("{}".utf8))
        }
        do {
            try await model.remove(id, ignoringNotificationFailure: false)
            XCTFail("removal must stop while the server may still hold a registration")
        } catch AccountActionError.notificationsStillRegistered(let message) {
            XCTAssertEqual(message, "database busy")
        }
        XCTAssertEqual(model.accounts.map(\.id), [id])
        XCTAssertNotNil(try secrets.token(for: id), "credentials are kept so removal can be retried")
        guard case .removalUnconfirmed? = model.account(id)?.push.state else {
            return XCTFail("state must say removal is unconfirmed")
        }
    }
}
