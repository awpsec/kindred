import XCTest
@testable import Kindred

@MainActor
final class InteractionHapticsTests: XCTestCase {
    func testForegroundOnlyAndRapidSelectionsAreCoalesced() {
        var active = true, time: TimeInterval = 10
        var played: [InteractionFeedback] = []
        let haptics = InteractionHaptics(foreground: { active }, clock: { time }, output: { played.append($0) })
        XCTAssertTrue(haptics.play(.selection))
        XCTAssertFalse(haptics.play(.selection))
        time += 0.1
        XCTAssertTrue(haptics.play(.selection))
        // A real microphone failure must remain distinguishable even directly
        // after another cue. Only repeated selection ticks are rate limited.
        XCTAssertTrue(haptics.play(.recordingStarted))
        XCTAssertTrue(haptics.play(.recordingError))
        active = false
        for value: InteractionFeedback in [.selection, .recordingStarted, .recordingStopped, .recordingError] {
            XCTAssertFalse(haptics.play(value))
        }
        XCTAssertEqual(played, [.selection, .selection, .recordingStarted, .recordingError])
    }
}
