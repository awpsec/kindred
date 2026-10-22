import XCTest
@testable import Kindred

@MainActor
final class ToolbarAvatarTests: XCTestCase {
    func testBridgeAcceptsCurrentCatalogAndStoredLegacyShapes() {
        for shape in ["wedge","blob","capsule","triangle","teardrop","cloud","round"] {
            XCTAssertTrue(BotToolbarAvatar.supports(shape: shape),shape)
        }
        XCTAssertFalse(BotToolbarAvatar.supports(shape: "untrusted-drawing-code"))
    }

    func testChangingShapeAtSameColorChangesTheRenderedImage() throws {
        let cloud = try XCTUnwrap(BotToolbarAvatar(shape: "cloud", color: "#2475ff").image(scale: 2)?.pngData())
        let triangle = try XCTUnwrap(BotToolbarAvatar(shape: "wedge", color: "#2475ff").image(scale: 2)?.pngData())
        let pill = try XCTUnwrap(BotToolbarAvatar(shape: "capsule", color: "#2475ff").image(scale: 2)?.pngData())
        XCTAssertNotEqual(cloud, triangle)
        XCTAssertNotEqual(cloud, pill)
        XCTAssertNotEqual(triangle, pill)
        XCTAssertEqual(cloud, BotToolbarAvatar(shape: "cloud", color: "#2475ff").image(scale: 2)?.pngData())
    }
}
