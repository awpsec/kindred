import XCTest
@testable import KindredCore

final class PushIsolationTests: XCTestCase {
    func testClonedBackendsNeedExactInstallation() throws {
        let owner = UUID().uuidString.lowercased()
        var a = Account(origin: try ServerAddress.normalize("https://first.example"), login: "person")
        var b = Account(origin: try ServerAddress.normalize("https://second.example"), login: "person")
        a.serverAccountID = owner
        b.serverAccountID = owner
        XCTAssertNil(AccountGrouping.account(forServerAccountID: owner, in: [a,b]))
        XCTAssertEqual(AccountGrouping.account(forServerAccountID: owner, installationID: a.push.installationID, in: [a,b])?.id, a.id)
        XCTAssertNil(AccountGrouping.account(forServerAccountID: owner, installationID: UUID(), in: [a,b]))
    }
    func testInvalidInstallationDoesNotFallBackToAccount() {
        let owner = UUID().uuidString.lowercased()
        XCTAssertNil(PushPayload.route(from: ["account_id":owner,"installation_uuid":"invalid"]))
        let installation = UUID()
        XCTAssertEqual(PushPayload.route(from: ["account_id":owner,"installation_uuid":installation.uuidString])?.installationID, installation)
    }
}
