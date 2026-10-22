import UIKit
import XCTest
@testable import Kindred

@MainActor
final class DisplayHandoffTests: XCTestCase {
    private var windows: [UIWindow] = []

    override func tearDown() {
        windows.forEach { $0.isHidden = true }
        windows.removeAll()
        super.tearDown()
    }

    private func window() throws -> UIWindow {
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.rootViewController = UIViewController()
        window.isHidden = false
        windows.append(window)
        return window
    }

    private func pose(_ window: UIWindow, inner: Bool, width: CGFloat = 466) -> DisplayHandoff.Pose {
        .init(window: ObjectIdentifier(window), size: CGSize(width: width, height: 678),
              orientation: 1, inner: inner, divisions: inner ? "division" : "")
    }

    private func wait(_ message: String, _ condition: () -> Bool) async throws {
        let deadline = CACurrentMediaTime() + 2
        while !condition(), CACurrentMediaTime() < deadline {
            try await Task.sleep(for: .milliseconds(10))
        }
        XCTAssertTrue(condition(), message)
    }

    func testColdLaunchAndSameDisplayResizeDoNotCoverContent() throws {
        let window = try window(), handoff = DisplayHandoff()
        defer { handoff.cancel() }
        for width: CGFloat in [466, 678, 520] {
            handoff.update(pose: pose(window, inner: false, width: width), layout: "\(width)",
                in: window, canvas: .black, active: true) { _ in XCTFail("no display handoff") }
            XCTAssertNil(handoff.cover)
        }
    }

    func testCoverSurvivesWindowTransferUntilTheNewPagePaints() async throws {
        let old = try window(), new = try window()
        let handoff = DisplayHandoff(timing: .init(minimum: 0.02, quiet: 0.01, deadline: 1, fade: 0.05))
        defer { handoff.cancel() }
        handoff.update(pose: pose(old, inner: false), layout: "outer", in: old, canvas: .black, active: true) { _ in }
        handoff.suspend(in: old, canvas: .black)
        let cover = try XCTUnwrap(handoff.cover)
        XCTAssertTrue(cover.superview === old)
        XCTAssertFalse(cover.isUserInteractionEnabled)
        XCTAssertTrue(cover.accessibilityElementsHidden)
        var painted: (() -> Void)?
        handoff.update(pose: pose(new, inner: true), layout: "inner", in: new, canvas: .black, active: false) { _ in XCTFail("inactive page") }
        XCTAssertTrue(handoff.cover === cover)
        XCTAssertTrue(cover.superview === new, "cover also shields the incoming native toolbar")
        handoff.update(pose: pose(new, inner: true), layout: "inner", in: new, canvas: .black, active: true) { painted = $0 }
        try await wait("waits for the incoming page's paint") { painted != nil }
        XCTAssertEqual(cover.alpha, 1)
        XCTAssertTrue(cover.superview === new)
        painted?()
        try await wait("removes the cover after its dissolve") { handoff.cover == nil }
        XCTAssertNotNil(handoff.pose, "remember display pose after uncovering")
    }

    func testStalePaintCannotRevealAReversedOrResizedHandoff() async throws {
        let window = try window()
        let handoff = DisplayHandoff(timing: .init(minimum: 0.02, quiet: 0.01, deadline: 1, fade: 0.05))
        defer { handoff.cancel() }
        var callbacks: [() -> Void] = []
        let paint: (@escaping () -> Void) -> Void = { callbacks.append($0) }
        handoff.update(pose: pose(window, inner: false), layout: "outer", in: window, canvas: .black, active: true, waitForPaint: paint)
        handoff.update(pose: pose(window, inner: true), layout: "inner", in: window, canvas: .black, active: true, waitForPaint: paint)
        try await wait("first paint request") { callbacks.count == 1 }
        handoff.update(pose: pose(window, inner: false), layout: "outer", in: window, canvas: .black, active: true, waitForPaint: paint)
        callbacks[0]()
        XCTAssertEqual(handoff.cover?.alpha, 1, "old paint cannot uncover the reversed display")
        try await wait("replacement paint request") { callbacks.count == 2 }
        handoff.update(pose: pose(window, inner: false), layout: "final-toolbar", in: window, canvas: .black, active: true, waitForPaint: paint)
        callbacks[1]()
        XCTAssertEqual(handoff.cover?.alpha, 1, "late toolbar layout invalidates earlier paint")
        try await wait("final paint request") { callbacks.count == 3 }
        callbacks[2]()
        try await wait("final display revealed") { handoff.cover == nil }
    }

    func testUnresponsivePageUsesADissolveInsteadOfAHardCut() async throws {
        let window = try window()
        let handoff = DisplayHandoff(timing: .init(minimum: 0.01, quiet: 0.01, deadline: 0.05, fade: 0.35))
        defer { handoff.cancel() }
        handoff.update(pose: pose(window, inner: false), layout: "outer", in: window, canvas: .black, active: true) { _ in }
        handoff.update(pose: pose(window, inner: true), layout: "inner", in: window, canvas: .black, active: true) { _ in }
        try await wait("fallback starts fading") { handoff.cover?.alpha == 0 }
        XCTAssertNotNil(handoff.cover?.superview, "the deadline starts an animation instead of removing the cover")
        try await wait("fallback eventually clears") { handoff.cover == nil }
    }

    func testSuspendingPastTheDeadlineStillRevealsAfterActivation() async throws {
        let window = try window()
        let handoff = DisplayHandoff(timing: .init(minimum: 0.02, quiet: 0.01, deadline: 0.04, fade: 0.05))
        handoff.reduceMotion = true
        defer { handoff.cancel() }
        handoff.update(pose: pose(window, inner: false), layout: "outer", in: window, canvas: .black, active: true) { _ in }
        handoff.suspend(in: window, canvas: .black)
        try await Task.sleep(for: .milliseconds(80))
        XCTAssertEqual(handoff.cover?.alpha, 1, "backgrounding cannot uncover an unfinished display")
        handoff.update(pose: pose(window, inner: true), layout: "inner", in: window, canvas: .black, active: true) { $0() }
        try await wait("activation rearms bounded cleanup, including Reduce Motion") { handoff.cover == nil }
    }
}
