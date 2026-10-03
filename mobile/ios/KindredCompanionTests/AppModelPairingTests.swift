import KindredCore
import XCTest
@testable import Kindred

/// Claim requests seen by the stub, which runs on URLSession's thread.
private final class ClaimRecorder: @unchecked Sendable {
    private let lock = NSLock()
    private var seen: [URLRequest] = []

    /// Records the request and returns its 1-based number.
    func record(_ request: URLRequest) -> Int {
        lock.lock(); defer { lock.unlock() }
        seen.append(request)
        return seen.count
    }

    var requests: [URLRequest] {
        lock.lock(); defer { lock.unlock() }
        return seen
    }
}

/// Pairing through `AppModel` with canned server responses (`StubProtocol`
/// from AppModelSignInTests).
@MainActor
final class AppModelPairingTests: XCTestCase {
    private let code = String(repeating: "5e", count: 32)
    private let serverAccount = "6f9619ff-8b86-d011-b42d-00cf4fc964ff"
    private var folder: URL!
    private var secrets: InMemorySecretStore!
    private var model: AppModel!
    private var recorder = ClaimRecorder()
    private var claimRequests: [URLRequest] { recorder.requests }

    override func setUp() async throws {
        folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        secrets = InMemorySecretStore()
        let configuration = KindredAPIClient.defaultConfiguration()
        configuration.protocolClasses = [StubProtocol.self]
        StubProtocol.paths = []
        recorder = ClaimRecorder()
        model = AppModel(secrets: secrets, repository: AccountRepository(fileURL: folder.appendingPathComponent("accounts.json")),
                         api: KindredAPIClient(configuration: configuration))
    }

    override func tearDown() async throws {
        StubProtocol.handler = nil
        try? FileManager.default.removeItem(at: folder)
    }

    private func link(_ host: String = "box.example") throws -> PairingLink {
        try PairingLink.parse("kindred://pair?server=https%3A%2F%2F\(host)#code=\(code)")
    }

    nonisolated private static func token(_ n: Int) -> String { String(repeating: "t\(n % 10)", count: 16) }
    private func token(_ n: Int) -> String { Self.token(n) }

    /// `identityAccount`/`identityUser` let a test make the session disagree with the claim.
    private func serve(claimStatus: Int = 200, claimBody: String? = nil, identityAccount: String? = nil,
                       identityUser: String = "ada", meta: String = #"{"profiles":true}"#) {
        let account = serverAccount
        let recorder = self.recorder
        StubProtocol.handler = { request in
            switch request.url?.path {
            case "/identity/meta":
                return (200, Data(meta.utf8))
            case "/identity/mobile-pairing/claim":
                let number = recorder.record(request)
                let body = claimBody ?? #"{"token":"\#(AppModelPairingTests.token(number))","profile_id":"p-1","account_id":"\#(account)","login":"ada"}"#
                return (claimStatus, Data(body.utf8))
            case "/identity/profiles":
                return (200, Data(#"{"active":"p-1","account_id":"\#(identityAccount ?? account)","username":"\#(identityUser)","legacy":false,"profiles":[{"id":"p-1","name":"Ada's Studio","active":true}]}"#.utf8))
            case "/identity/logout":
                return (200, Data("{}".utf8))
            case "/identity/login":
                return (200, Data(#"{"token":"\#(String(repeating: "b0", count: 16))","profile_id":"p-7"}"#.utf8))
            default:
                return (404, Data())
            }
        }
    }

    func testPairingAddsAnIndependentSessionWithoutSecretsInMetadata() async throws {
        serve()
        let id = try await model.pair(with: try link())

        let account = try XCTUnwrap(model.account(id))
        XCTAssertEqual(account.origin.serialized, "https://box.example")
        XCTAssertEqual(account.login, "ada")
        XCTAssertEqual(account.serverAccountID, serverAccount)
        XCTAssertEqual(account.profileID, "p-1")
        XCTAssertEqual(account.profileName, "Ada's Studio")
        XCTAssertEqual(model.activeAccountID, id)
        XCTAssertTrue(model.isSignedIn(id))
        XCTAssertEqual(try secrets.token(for: id), token(1))
        XCTAssertEqual(StubProtocol.paths, ["/identity/meta", "/identity/mobile-pairing/claim", "/identity/profiles"])

        let claim = try XCTUnwrap(claimRequests.first)
        XCTAssertNil(claim.value(forHTTPHeaderField: "Origin"))
        XCTAssertNil(claim.value(forHTTPHeaderField: "Authorization"))

        let saved = try String(contentsOf: folder.appendingPathComponent("accounts.json"), encoding: .utf8)
        XCTAssertFalse(saved.contains(token(1)))
        XCTAssertFalse(saved.contains(code))
    }

    func testPairingTheSameAccountRefreshesItAndKeepsOthers() async throws {
        serve()
        try await model.signIn(origin: try ServerAddress.normalize("other.example"), login: "ada", password: "pw")
        let other = try XCTUnwrap(model.accounts.first?.id)
        let first = try await model.pair(with: try link())
        StubProtocol.paths = []
        let second = try await model.pair(with: try link())

        XCTAssertEqual(first, second, "same server and account reuse one saved account")
        XCTAssertEqual(Set(model.accounts.map(\.id)), [other, first])
        XCTAssertEqual(try secrets.token(for: first), token(2))
        XCTAssertNotNil(try secrets.token(for: other), "other accounts keep their sessions")
        XCTAssertTrue(StubProtocol.paths.contains("/identity/logout"), "the replaced session is ended")
    }

    func testMismatchedSessionIsEndedAndNothingSaved() async throws {
        serve(identityAccount: "11111111-2222-3333-4444-555555555555")
        do {
            try await model.pair(with: try link())
            XCTFail("a session for a different account must not be saved")
        } catch {
            XCTAssertEqual(error as? PairingError, .accountMismatch)
        }
        XCTAssertTrue(model.accounts.isEmpty)
        XCTAssertTrue(StubProtocol.paths.contains("/identity/logout"))
    }

    func testRejectedCodeIsReportedOnceAndNotRetried() async throws {
        serve(claimStatus: 410, claimBody: #"{"error":"Pairing code expired"}"#)
        do {
            try await model.pair(with: try link())
            XCTFail("expected rejection")
        } catch {
            XCTAssertEqual(error as? PairingError, .codeRejected)
        }
        XCTAssertEqual(claimRequests.count, 1)
        XCTAssertTrue(model.accounts.isEmpty)
    }

    func testCodeIsNeverSentToANonKindredServer() async throws {
        serve(meta: #"{"hello":"world"}"#)
        do {
            try await model.pair(with: try link())
            XCTFail("expected refusal")
        } catch {
            XCTAssertEqual(error as? PairingError, .notKindredServer)
        }
        XCTAssertTrue(claimRequests.isEmpty)
    }

    func testOpenedLinkWaitsForConfirmation() throws {
        serve()
        model.handleOpenURL(URL(string: "kindred://pair?server=https%3A%2F%2Fbox.example#code=\(code)")!)
        guard case .pair(let request)? = model.sheet else { return XCTFail("pairing sheet should open") }
        XCTAssertNotNil(request.link)
        XCTAssertTrue(StubProtocol.paths.isEmpty, "nothing is sent before the person confirms")
    }
}
