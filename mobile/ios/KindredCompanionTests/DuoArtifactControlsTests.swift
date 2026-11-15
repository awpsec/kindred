import XCTest
@testable import Kindred

final class DuoArtifactControlsTests: XCTestCase {
    private func payload() -> [String: Any] {
        ["root": UUID().uuidString, "owner": UUID().uuidString, "zoom": "75%",
         "actions": [["id": "refresh", "label": "Refresh document", "enabled": true]],
         "filters": [["id": "type", "label": "Artifact type", "value": "",
                      "options": [["value": "", "label": "All types", "enabled": true],
                                  ["value": "document", "label": "Documents", "enabled": true]]]]]
    }

    func testLibraryAndDocumentControlsRetainTheirIdentitiesAndAllTypesValue() throws {
        let value = payload(), document = try XCTUnwrap(DuoArtifactControls(value))
        XCTAssertEqual(document.root, value["root"] as? String)
        XCTAssertEqual(document.owner, value["owner"] as? String)
        XCTAssertEqual(document.zoom, "75%")
        XCTAssertEqual(document.filters.first?.options.first?.value, "")
        var library = value
        library["owner"] = NSNull(); library["zoom"] = NSNull(); library["actions"] = [[String: Any]]()
        XCTAssertNotNil(DuoArtifactControls(library))
    }

    func testRejectsUnboundedControlsUnknownCommandsAndInvalidDocumentOwnership() {
        for change: [String: Any] in [
            ["root": "not-an-identity"], ["owner": "not-an-identity"],
            ["owner": NSNull()], ["zoom": "301%"], ["zoom": "0%"], ["zoom": "75% script"],
            ["actions": [["id": "execute", "label": "Run", "enabled": true]]],
            ["actions": Array(repeating: ["id": "refresh", "label": "Refresh", "enabled": true], count: 4)],
            ["filters": [["id": "type", "label": "Type", "value": "missing",
                           "options": [["value": "", "label": "All", "enabled": true]]]]]
        ] {
            XCTAssertNil(DuoArtifactControls(payload().merging(change) { _, new in new }))
        }
    }

    func testRejectsDuplicateActionsAndFilterOptions() {
        var value = payload()
        value["actions"] = Array(repeating: ["id": "refresh", "label": "Refresh", "enabled": true], count: 2)
        XCTAssertNil(DuoArtifactControls(value))
        value = payload()
        value["filters"] = [["id": "sort", "label": "Sort", "value": "modified",
                             "options": Array(repeating: ["value": "modified", "label": "Recent", "enabled": true], count: 2)]]
        XCTAssertNil(DuoArtifactControls(value))
    }
}
