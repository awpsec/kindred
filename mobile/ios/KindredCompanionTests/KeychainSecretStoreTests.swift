import KindredCore
import Security
import XCTest

/// Runs in the simulator/device test host, which has a real Keychain.
final class KeychainSecretStoreTests: XCTestCase {
    private var store: KeychainSecretStore!
    private let id = UUID()

    override func setUp() {
        super.setUp()
        store = KeychainSecretStore(service: "dev.kindred.companion.tests." + UUID().uuidString)
    }

    override func tearDown() {
        try? store.deleteToken(for: id)
        super.tearDown()
    }

    func testRoundTripOverwriteAndDelete() throws {
        XCTAssertNil(try store.token(for: id))
        try store.setToken("first-token-0123456789", for: id)
        XCTAssertEqual(try store.token(for: id), "first-token-0123456789")
        try store.setToken("second-token-0123456789", for: id)
        XCTAssertEqual(try store.token(for: id), "second-token-0123456789")
        try store.deleteToken(for: id)
        XCTAssertNil(try store.token(for: id))
        XCTAssertNoThrow(try store.deleteToken(for: id), "deleting a missing item is not an error")
    }

    func testItemsAreThisDeviceOnly() throws {
        try store.setToken("token-0123456789abcdef", for: id)
        XCTAssertEqual(try store.accessibility(for: id), kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly as String)
    }

    func testAccountsAreSeparate() throws {
        let other = UUID()
        defer { try? store.deleteToken(for: other) }
        try store.setToken("token-a-0123456789", for: id)
        try store.setToken("token-b-0123456789", for: other)
        XCTAssertEqual(try store.token(for: id), "token-a-0123456789")
        XCTAssertEqual(try store.token(for: other), "token-b-0123456789")
    }
}
