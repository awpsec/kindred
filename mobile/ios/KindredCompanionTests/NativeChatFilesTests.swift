import XCTest
import WebKit
@testable import Kindred

@MainActor
final class NativeChatFilesTests: XCTestCase {
    func testLocalReceiptsSurviveReloadAndNeverCrossDevicesOrAccounts() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let receipt = UUID().uuidString, account = UUID(), id = UUID().uuidString
        let folder = root.appendingPathComponent(receipt, isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let file = folder.appendingPathComponent("report.xlsx")
        try Data("original bytes".utf8).write(to: file)
        let scope = NativeChatFiles.scope(origin: "https://example.test", token: "account-one")
        let otherScope = NativeChatFiles.scope(origin: "https://example.test", token: "account-two")
        let records = [receipt: NativeChatFiles.Record(id: id, scope: scope, name: "report.xlsx")]
        try JSONEncoder().encode(records).write(to: root.appendingPathComponent("index.json"))
        let store = NativeChatFiles(account: account, directory: root)
        XCTAssertEqual(store.lookup(id: id, scope: scope), receipt)
        XCTAssertEqual(try store.reveal(receipt: receipt, scope: scope), file)
        XCTAssertNil(store.lookup(id: id, scope: otherScope))
        XCTAssertThrowsError(try store.reveal(receipt: receipt, scope: otherScope))
        XCTAssertNil(NativeChatFiles(account: account, directory: root.appendingPathComponent("other-device")).lookup(id: id, scope: scope))
        XCTAssertEqual(NativeChatFiles(account: account, directory: root).lookup(id: id, scope: scope), receipt)
        try FileManager.default.removeItem(at: file)
        XCTAssertNil(store.lookup(id: id, scope: scope))
        XCTAssertThrowsError(try store.reveal(receipt: receipt, scope: scope))
        try FileManager.default.createSymbolicLink(at: file, withDestinationURL: root.appendingPathComponent("index.json"))
        XCTAssertNil(store.lookup(id: id, scope: scope))
    }
}
