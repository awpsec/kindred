import XCTest
@testable import KindredCore

final class AccountRoleTests: XCTestCase {
    private let origin = try! ServerAddress.normalize("one.example.com")
    private let otherOrigin = try! ServerAddress.normalize("two.example.com")
    private let accountID = "6f9619ff-8b86-d011-b42d-00cf4fc964ff"

    private func identity(admin: Bool, owner: Bool = false, id: String? = nil) -> IdentitySummary {
        IdentitySummary(serverAccountID: id ?? accountID, username: "Ada", activeProfileID: "p-2",
                        activeProfileName: "Workspace", legacy: false, admin: admin, owner: owner)
    }

    func testIdentityParserRequiresJSONBooleanAndLegacyNeverHasRole() throws {
        let trueIdentity = try IdentitySummary.parse(Data("{\"account_id\":\"\(accountID)\",\"admin\":true,\"role\":\"owner\",\"owner_resolved\":true}".utf8))
        XCTAssertTrue(trueIdentity.admin)
        XCTAssertTrue(trueIdentity.owner)
        for value in ["1", "\"true\"", "null", "[]", "{}", "false"] {
            let result = try IdentitySummary.parse(Data("{\"admin\":\(value),\"role\":\"owner\",\"owner_resolved\":true}".utf8))
            XCTAssertFalse(result.admin)
            XCTAssertFalse(result.owner)
        }
        XCTAssertFalse(try IdentitySummary.parse(Data("{}".utf8)).admin)
        let unresolved = try IdentitySummary.parse(Data("{\"admin\":true,\"role\":\"owner\",\"owner_resolved\":false}".utf8))
        XCTAssertTrue(unresolved.admin)
        XCTAssertFalse(unresolved.owner)
        XCTAssertFalse(try IdentitySummary.parse(Data("{\"admin\":true,\"owner\":true}".utf8)).owner)
        XCTAssertFalse(try IdentitySummary.parse(Data("{\"legacy\":true,\"admin\":true,\"role\":\"owner\",\"owner_resolved\":true}".utf8)).admin)
    }

    func testOldCacheDecodesUnknownAndNewRolePersistsWithoutSecrets() throws {
        let account = Account(origin: origin, login: "ada")
        let snapshot = AccountsSnapshot(accounts: [account], activeAccountID: account.id)
        let encoded = try AccountRepository.encoder().encode(snapshot)
        XCTAssertFalse(String(decoding: encoded, as: UTF8.self).contains("roleMetadata"))
        let old = try AccountRepository.decoder().decode(AccountsSnapshot.self, from: encoded)
        XCTAssertNil(old.accounts.first?.administrativeRole)
        var updated = old
        updated.accounts[0].applyIdentity(identity(admin: true))
        let stored = try AccountRepository.encoder().encode(updated)
        XCTAssertFalse(String(decoding: stored, as: UTF8.self).contains("sessionGeneration"))
        XCTAssertEqual(try AccountRepository.decoder().decode(AccountsSnapshot.self, from: stored), updated)
        XCTAssertEqual(updated.accounts[0].administrativeRole, .administrator)
    }

    func testRoleIsBoundToExactServerAndAccountNeverProfileOrUsername() {
        var account = Account(origin: origin, login: "ada")
        account.applyIdentity(identity(admin: true))
        account.profileID = "another-profile"
        account.profileName = "Another workspace"
        account.login = "new-name"
        XCTAssertEqual(account.administrativeRole, .administrator)
        account.origin = otherOrigin
        XCTAssertNil(account.administrativeRole)
        account.origin = origin
        account.serverAccountID = UUID().uuidString.lowercased()
        XCTAssertNil(account.administrativeRole)
    }

    func testSuccessfulDowngradeAndIdentityReplacementRemoveOldBadge() {
        var account = Account(origin: origin, login: "ada")
        account.applyIdentity(identity(admin: true, owner: true))
        XCTAssertEqual(account.administrativeRole, .owner)
        XCTAssertEqual(account.administrativeRole?.accessibilityLabel, "Owner, administrator")
        account.applyIdentity(identity(admin: false))
        XCTAssertNil(account.administrativeRole)
        account.applyIdentity(identity(admin: true))
        account.applyIdentity(identity(admin: false, id: UUID().uuidString.lowercased()))
        XCTAssertNil(account.administrativeRole)
        account.applyIdentity(identity(admin: true))
        account.applyIdentity(IdentitySummary(serverAccountID: nil, username: nil, activeProfileID: nil,
                                             activeProfileName: nil, legacy: false))
        XCTAssertNil(account.administrativeRole)
    }

    func testRefreshRejectsRotatedSessionAndOlderCompletion() {
        let account = Account(origin: origin, login: "ada")
        let receipt = AccountIdentityRefresh(account: account, sessionGeneration: 1, requestRevision: 1)
        XCTAssertTrue(receipt.matches(account, sessionGeneration: 1, requestRevision: 1))
        XCTAssertFalse(receipt.matches(account, sessionGeneration: 2, requestRevision: 1))
        XCTAssertFalse(receipt.matches(account, sessionGeneration: 1, requestRevision: 2))
        XCTAssertFalse(receipt.matches(nil, sessionGeneration: 1, requestRevision: 1))
    }

    func testRefreshRejectsDifferentSavedAccountAndOrigin() {
        var account = Account(origin: origin, login: "ada")
        let receipt = AccountIdentityRefresh(account: account, sessionGeneration: 1, requestRevision: 1)
        XCTAssertFalse(receipt.matches(Account(origin: origin, login: "ada"), sessionGeneration: 1, requestRevision: 1))
        account.origin = otherOrigin
        XCTAssertFalse(receipt.matches(account, sessionGeneration: 1, requestRevision: 1))
    }
}
