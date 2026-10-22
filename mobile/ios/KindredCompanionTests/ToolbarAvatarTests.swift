import XCTest
@testable import Kindred

@MainActor
final class ToolbarAvatarTests: XCTestCase {
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
