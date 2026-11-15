import XCTest

/// Opt-in checks of the normal signed app and disposable HTTPS artifacts.
/// No application fixture host, real artifact edits, downloads, or provider calls.
@MainActor
final class ArtifactPhysicalAcceptanceTests: XCTestCase {
    func testNormalAppDocumentGesturesAndNativeControls() throws {
        #if targetEnvironment(simulator)
        throw XCTSkip("This acceptance check requires the physical Duo")
        #else
        guard ProcessInfo.processInfo.environment["KINDRED_TEST_PHYSICAL_ARTIFACTS"] == "1" else {
            throw XCTSkip("Select the isolated Artifacts acceptance scheme explicitly")
        }
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launch()
        let web = app.webViews.firstMatch
        XCTAssertTrue(web.waitForExistence(timeout: 20))
        let rail = app.scrollViews["kindred-duo-navigation-rail"]
        func reveal(_ item: XCUIElement) {
            XCTAssertTrue(item.waitForExistence(timeout: 10))
            for _ in 0..<6 where !item.isHittable && rail.exists {
                let r = item.frame, b = rail.frame
                if b.height > b.width { if r.midY > b.midY { rail.swipeUp() } else { rail.swipeDown() } }
                else { if r.midX > b.midX { rail.swipeLeft() } else { rail.swipeRight() } }
            }
            XCTAssertTrue(item.isHittable)
        }
        func tap(_ id: String) { let item = app.buttons[id]; reveal(item); item.tap() }
        func library() {
            let artifacts = app.buttons["kindred-duo-artifacts"]
            if artifacts.exists { reveal(artifacts); artifacts.tap() }
            for label in ["Artifact list", "Show artifact list"] {
                let back = app.buttons[label]
                if back.exists { reveal(back); back.tap(); break }
            }
        }
        func level() -> Double {
            let label = app.buttons["kindred-duo-artifact-zoom"].label
            guard let range = label.range(of: "[0-9]{1,3}%", options: .regularExpression) else { return 0 }
            return Double(label[range].dropLast()) ?? 0
        }
        func wait(_ label: String, _ condition: @escaping () -> Bool) {
            let expectation = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in condition() }, object: nil)
            XCTAssertEqual(XCTWaiter.wait(for: [expectation], timeout: 20), .completed, label)
        }
        var receipt: [[String: Any]] = []
        for name in ["QA Word converted", "QA Word fallback"] {
            library()
            // Stop before interacting with content unless this exact disposable
            // QA library is active. Saved production accounts are never reset.
            let row = web.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Open " + name)).firstMatch
            XCTAssertTrue(row.waitForExistence(timeout: 20), "Select the disposable HTTPS QA account before running")
            row.tap()
            let zoom = app.buttons["kindred-duo-artifact-zoom"]
            reveal(zoom); zoom.tap()
            let width = app.buttons["Fit width"]
            XCTAssertTrue(width.waitForExistence(timeout: 8)); width.tap()
            wait("document fit is ready") { level() > 0 }
            let fitted = level()
            web.doubleTap()
            wait("real double tap zooms the document") { level() > fitted * 1.3 }
            let doubled = level()
            web.doubleTap()
            wait("second double tap restores fit") { abs(level() - fitted) <= 2 }
            web.pinch(withScale: 1.6, velocity: 1)
            wait("real two-finger pinch zooms the document") { level() > fitted * 1.2 }
            let pinched = level()
            web.swipeUp()
            tap("kindred-duo-artifact-refresh")
            reveal(zoom); zoom.tap()
            let page = app.buttons["Fit page"]
            XCTAssertTrue(page.waitForExistence(timeout: 8)); page.tap()
            wait("controls remain responsive after gestures and refresh") { level() > 0 }
            receipt.append(["disposable_document": name, "fitted_percent": fitted,
                            "double_tap_percent": doubled, "pinch_percent": pinched,
                            "normal_app": true, "real_device_gestures": true])
            let shot = XCTAttachment(screenshot: app.screenshot())
            shot.name = name + "-after-gestures"; shot.lifetime = .keepAlways; add(shot)
        }
        library()
        let notes = web.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Open Notes")).firstMatch
        XCTAssertTrue(notes.waitForExistence(timeout: 10)); notes.tap()
        let data = try JSONSerialization.data(withJSONObject: receipt, options: [.prettyPrinted, .sortedKeys])
        let attachment = XCTAttachment(data: data, uniformTypeIdentifier: "public.json")
        attachment.name = "normal-physical-artifact-acceptance"; attachment.lifetime = .keepAlways; add(attachment)
        // Leave the normal application open for the owner.
        #endif
    }
}
