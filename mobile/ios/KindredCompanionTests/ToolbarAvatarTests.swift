import XCTest
import UIKit
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

    func testPublishesFrameWhenLaidOutBeforeWindowAttachment() async throws {
        let button = MeasuredAvatarButton(frame: CGRect(x: 100, y: 200, width: 44, height: 44))
        var frames: [CGRect] = []
        button.frameChanged = { frames.append($0) }
        button.setNeedsLayout()
        button.layoutIfNeeded()
        await withCheckedContinuation { continuation in
            DispatchQueue.main.async { continuation.resume() }
        }
        XCTAssertTrue(frames.isEmpty, "a detached label cannot publish window coordinates")
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.rootViewController = UIViewController()
        window.isHidden = false
        defer { window.isHidden = true }
        window.rootViewController?.view.addSubview(button)
        await withCheckedContinuation { continuation in
            DispatchQueue.main.async { continuation.resume() }
        }
        XCTAssertEqual(try XCTUnwrap(frames.last), button.convert(button.bounds, to: window))
    }

}
