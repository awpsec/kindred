import XCTest
@testable import KindredCore
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

final class APIAndAccountsTests: XCTestCase {
    private let origin = try! ServerAddress.normalize("kindred.example.com")
    private let token = String(repeating: "0f", count: 32)

    private func json(_ request: URLRequest) throws -> [String: String] {
        try JSONDecoder().decode([String: String].self, from: request.httpBody ?? Data())
    }

    func testLoginRequestCarriesOnlyLoginAndPassword() throws {
        let request = try KindredRequests.login(origin: origin, login: "ada", password: "p/ss \"word\"")
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.url?.absoluteString, "https://kindred.example.com/identity/login")
        XCTAssertEqual(try json(request), ["login": "ada", "password": "p/ss \"word\""])
        XCTAssertNil(request.value(forHTTPHeaderField: "Authorization"))
        XCTAssertNil(request.value(forHTTPHeaderField: "Origin"))
        XCTAssertFalse(request.httpShouldHandleCookies)
        XCTAssertEqual(request.cachePolicy, .reloadIgnoringLocalCacheData)
    }

    func testReSignInRequestsTheSavedWorkspace() throws {
        let request = try KindredRequests.login(origin: origin, login: "ada", password: "pw", profileID: "p-2")
        XCTAssertEqual(try json(request), ["login": "ada", "password": "pw", "profile_id": "p-2"])
        let invalid = try KindredRequests.login(origin: origin, login: "ada", password: "pw", profileID: "bad id\n")
        XCTAssertEqual(try json(invalid), ["login": "ada", "password": "pw"])
    }

    func testDeviceRegistrationRequests() throws {
        let installation = UUID(uuidString: "11111111-2222-3333-4444-555555555555")!
        let account = "6f9619ff-8b86-d011-b42d-00cf4fc964ff"
        let put = try KindredRequests.registerDevice(origin: origin, token: token, installationID: installation,
                                                     deviceToken: "ab" + String(repeating: "0", count: 62),
                                                     environment: .sandbox, serverAccountID: account)
        XCTAssertEqual(put.httpMethod, "PUT")
        XCTAssertEqual(put.url?.absoluteString, "https://kindred.example.com/api/mobile/devices/11111111-2222-3333-4444-555555555555")
        XCTAssertEqual(put.value(forHTTPHeaderField: "Authorization"), "Bearer " + token)
        XCTAssertEqual(try json(put), ["platform": "ios", "token": "ab" + String(repeating: "0", count: 62),
                                       "environment": "sandbox", "account_id": account])

        let delete = KindredRequests.unregisterDevice(origin: origin, token: token, installationID: installation)
        XCTAssertEqual(delete.httpMethod, "DELETE")
        XCTAssertEqual(delete.url, put.url)
        XCTAssertNil(delete.httpBody)

        let status = KindredRequests.pushStatus(origin: origin, token: token, installationID: installation)
        XCTAssertEqual(status.url?.absoluteString,
                       "https://kindred.example.com/api/mobile/push-status?installation_uuid=11111111-2222-3333-4444-555555555555")
    }

    private func response(_ url: String, _ status: Int) -> HTTPURLResponse {
        HTTPURLResponse(url: URL(string: url)!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: nil)!
    }

    func testResponseValidation() throws {
        let request = KindredRequests.profiles(origin: origin, token: token)
        XCTAssertNoThrow(try KindredAPIClient.validate(request: request, response: response("https://kindred.example.com/identity/profiles", 200), data: Data()))
        XCTAssertThrowsError(try KindredAPIClient.validate(request: request, response: response("https://kindred.example.com/x", 302), data: Data())) {
            XCTAssertEqual($0 as? KindredAPIError, .redirectRefused)
        }
        XCTAssertThrowsError(try KindredAPIClient.validate(request: request, response: response("https://evil.example/identity/profiles", 200), data: Data())) {
            XCTAssertEqual($0 as? KindredAPIError, .redirectRefused)
        }
        XCTAssertThrowsError(try KindredAPIClient.validate(request: request, response: response("https://kindred.example.com/identity/profiles", 401),
                                                           data: Data(#"{"error":"Sign in to your Kindred account."}"#.utf8))) {
            XCTAssertEqual($0 as? KindredAPIError, .unauthorized("Sign in to your Kindred account."))
        }
        XCTAssertThrowsError(try KindredAPIClient.validate(request: request, response: response("https://kindred.example.com/identity/profiles", 400),
                                                           data: Data(#"{"error":"Username or password was not accepted"}"#.utf8))) {
            XCTAssertEqual($0 as? KindredAPIError, .server("Username or password was not accepted"))
        }
        XCTAssertThrowsError(try KindredAPIClient.validate(request: request, response: response("https://kindred.example.com/identity/profiles", 404), data: Data())) {
            XCTAssertEqual($0 as? KindredAPIError, .notFound)
        }
    }

    func testRedirectDelegateNeverFollows() {
        let client = KindredAPIClient()
        defer { client.invalidate() }
        let session = URLSession(configuration: .ephemeral)
        let task = session.dataTask(with: URL(string: "https://kindred.example.com/")!)
        let decided = expectation(description: "redirect decision")
        client.urlSession(session, task: task, willPerformHTTPRedirection: response("https://kindred.example.com/", 302),
                          newRequest: URLRequest(url: URL(string: "https://evil.example/")!)) { next in
            XCTAssertNil(next)
            decided.fulfill()
        }
        wait(for: [decided], timeout: 1)
        task.cancel()
        session.invalidateAndCancel()
    }

    func testAccountStoreRoundTripAndQuarantine() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        let repository = AccountRepository(fileURL: folder.appendingPathComponent("accounts.json"))
        XCTAssertEqual(try repository.load(), AccountsSnapshot())

        var account = Account(origin: origin, login: "ada", now: Date(timeIntervalSince1970: 1_700_000_000))
        account.serverAccountID = "6f9619ff-8b86-d011-b42d-00cf4fc964ff"
        account.push.wanted = true
        account.push.state = .registered(token: "ab", environment: .production, at: Date(timeIntervalSince1970: 1_700_000_100))
        let snapshot = AccountsSnapshot(accounts: [account], activeAccountID: account.id, pendingDataRemovals: [UUID()])
        try repository.save(snapshot)
        XCTAssertEqual(try repository.load(), snapshot)

        let text = try String(contentsOf: repository.fileURL, encoding: .utf8)
        XCTAssertFalse(text.contains(token), "metadata must not contain session secrets")

        try Data("{broken".utf8).write(to: repository.fileURL)
        XCTAssertThrowsError(try repository.load())
        XCTAssertNotNil(repository.quarantine())
        XCTAssertEqual(try repository.load(), AccountsSnapshot())
    }

    func testGroupingAndLookup() throws {
        let other = try ServerAddress.normalize("alpha.example.com")
        var zed = Account(origin: origin, login: "zed")
        zed.profileName = "Zed"
        let amy = Account(origin: origin, login: "amy")
        var remote = Account(origin: other, login: "amy")
        remote.serverAccountID = "6f9619ff-8b86-d011-b42d-00cf4fc964ff"

        let groups = AccountGrouping.groups([zed, remote, amy])
        XCTAssertEqual(groups.map(\.origin), [other, origin])
        XCTAssertEqual(groups[1].accounts.map(\.login), ["amy", "zed"])

        XCTAssertEqual(AccountGrouping.existing(in: [zed, amy, remote], origin: origin, login: "AMY")?.id, amy.id)
        XCTAssertNil(AccountGrouping.existing(in: [zed], origin: other, login: "zed"))
        XCTAssertEqual(AccountGrouping.account(forServerAccountID: "6f9619ff-8b86-d011-b42d-00cf4fc964ff", in: [zed, remote])?.id, remote.id)
        XCTAssertNil(AccountGrouping.account(forServerAccountID: "00000000-0000-0000-0000-000000000000", in: [zed, remote]))
    }

    func testRegistrationStateDecidesRemovalNeed() {
        var push = PushRegistration()
        XCTAssertFalse(push.mayExistOnServer)
        push.state = .failed(message: "offline", at: Date())
        XCTAssertTrue(push.mayExistOnServer)
        push.state = .removalUnconfirmed(message: "offline", at: Date())
        XCTAssertTrue(push.mayExistOnServer)
        push.state = .endedWithSession(at: Date())
        XCTAssertFalse(push.mayExistOnServer)
    }

    func testInMemorySecretStore() throws {
        let store = InMemorySecretStore()
        let id = UUID()
        XCTAssertNil(try store.token(for: id))
        try store.setToken(token, for: id)
        XCTAssertEqual(try store.token(for: id), token)
        try store.deleteToken(for: id)
        XCTAssertNil(try store.token(for: id))
    }
}
