import UIKit
import XCTest

@MainActor
final class DuoRailScrubTests: XCTestCase {
    func testSlidingToArtifactsCommitsTheReleaseTarget() throws {
        guard ProcessInfo.processInfo.environment["KINDRED_TEST_PHYSICAL_ARTIFACTS"] == "1" else {
            throw XCTSkip("Requires the connected Duo and the isolated acceptance account")
        }
        let app = XCUIApplication()
        app.launch()
        let previous = XCUIDevice.shared.orientation
        defer { XCUIDevice.shared.orientation = previous }
        for orientation: UIDeviceOrientation in [.portrait, .landscapeLeft] {
            XCUIDevice.shared.orientation = orientation
            let rail = app.scrollViews["kindred-duo-navigation-rail"]
            let artifacts = app.buttons["kindred-duo-artifacts"]
            let search = app.buttons["kindred-duo-search"]
            let chats = app.buttons["kindred-duo-chats"]
            if chats.exists { chats.tap() }
            XCTAssertTrue(artifacts.waitForExistence(timeout: 10))
            XCTAssertTrue(search.isHittable)
            XCTAssertTrue(artifacts.isHittable)
            let horizontal = orientation == .portrait
            XCTAssertEqual(rail.frame.width > rail.frame.height, horizontal)
            let center = CGVector(dx: 0.5, dy: 0.5)
            search.coordinate(withNormalizedOffset: center)
                .press(forDuration: 0.18, thenDragTo: artifacts.coordinate(withNormalizedOffset: center))
            XCTAssertTrue(chats.waitForExistence(timeout: 5), "Only the released action should open")
            chats.tap()
        }
    }
}
