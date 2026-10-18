import SwiftUI
import XCTest
@testable import Kindred

@MainActor
final class LaunchAnimationTests: XCTestCase {
    func testApprovedWakeBlinkTiltAndDissolve() {
        let appearance = KindredLaunchFrame.at(milliseconds: 170)
        XCTAssertEqual(appearance.markOpacity, 1)
        XCTAssertEqual(appearance.scale, 1.4)
        XCTAssertEqual(appearance.leftEyeHeight, 14.2)
        XCTAssertEqual(appearance.rightEyeHeight, 14.2)
        let blink = KindredLaunchFrame.at(milliseconds: 330)
        XCTAssertEqual(blink.leftEyeHeight, 14.2 * 0.16, accuracy: 0.00001)
        let curious = KindredLaunchFrame.at(milliseconds: 620)
        XCTAssertEqual(curious.angle, -7)
        XCTAssertEqual(curious.gaze, 1.5)
        XCTAssertEqual(curious.leftEyeHeight, 16.4 * 0.85, accuracy: 0.00001)
        XCTAssertEqual(curious.rightEyeHeight, 16.4)
        let anticipation = KindredLaunchFrame.at(milliseconds: 815)
        XCTAssertEqual(anticipation.squashX, 1.035)
        XCTAssertEqual(anticipation.squashY, 0.955)
        let dissolved = KindredLaunchFrame.at(milliseconds: 1340)
        XCTAssertEqual(dissolved.markOpacity, 0)
        XCTAssertGreaterThan(dissolved.contentOpacity, 0)
        let finished = KindredLaunchFrame.at(milliseconds: 1840)
        XCTAssertTrue(finished.isComplete)
        XCTAssertEqual(finished.contentOpacity, 1)
        XCTAssertEqual(finished.markOpacity, 0)
        XCTAssertEqual(finished.travel, 1)
        XCTAssertEqual(finished.scale, 0.72, accuracy: 0.00001)
    }

    func testReadinessIsBoundedAndNeverLeavesABlankHold() {
        XCTAssertEqual(KindredLaunchFrame.at(milliseconds: 1170, readyAt: 0).contentOpacity, 0)
        XCTAssertEqual(KindredLaunchFrame.at(milliseconds: 1230, readyAt: 1230).contentOpacity, 0)
        for readiness in [nil, 4000.0] as [Double?] {
            let dissolved = KindredLaunchFrame.at(milliseconds: 1340, readyAt: readiness)
            XCTAssertEqual(dissolved.markOpacity, 0)
            XCTAssertGreaterThan(dissolved.contentOpacity, 0, "The real loading/error screen must already be revealing")
            XCTAssertTrue(KindredLaunchFrame.at(milliseconds: 1970, readyAt: readiness).isComplete)
        }
        for readiness in [0.0, 600, 1250, nil] as [Double?] {
            var previousOpacity = 0.0
            for t in stride(from: 0.0, through: 2100, by: 10) {
                let frame = KindredLaunchFrame.at(milliseconds: t, readyAt: readiness)
                XCTAssertGreaterThanOrEqual(frame.contentOpacity, previousOpacity)
                XCTAssertTrue((0...1).contains(frame.markOpacity))
                previousOpacity = frame.contentOpacity
            }
        }
    }

    func testReduceMotionOnlyFadesAndFinishesWithoutWaitingForServer() {
        for t in stride(from: 0.0, through: 220, by: 20) {
            let frame = KindredLaunchFrame.at(milliseconds: t, reduceMotion: true, readyAt: nil)
            XCTAssertEqual(frame.markOpacity, 0)
            XCTAssertEqual(frame.travel, 0)
            XCTAssertEqual(frame.angle, 0)
            XCTAssertEqual(frame.squashX, 1)
            XCTAssertEqual(frame.squashY, 1)
        }
        let final = KindredLaunchFrame.at(milliseconds: 220, reduceMotion: true, readyAt: nil)
        XCTAssertTrue(final.isComplete)
        XCTAssertEqual(final.contentOpacity, 1)
    }

    // Render the actual native drawing at deterministic times for comparison
    // with the approved GIF/HTML, independent of network and simulator speed.
    func testRenderApprovedKeyframes() throws {
        let directory = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("LaunchReferenceFrames", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        for dark in [false, true] {
            for time in [170.0, 330, 620, 1170, 1840] {
                let renderer = ImageRenderer(content: ZStack {
                    dark ? Color.black : Color.white
                    KindredLaunchArtwork(frame: .at(milliseconds: time))
                }.frame(width: 390, height: 844))
                let image = try XCTUnwrap(renderer.uiImage)
                try XCTUnwrap(image.pngData()).write(to: directory.appendingPathComponent("\(dark ? "dark" : "light")-\(Int(time)).png"))
            }
        }
    }
}
