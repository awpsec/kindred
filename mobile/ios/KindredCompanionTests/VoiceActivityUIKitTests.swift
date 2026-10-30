import ActivityKit
import XCTest
@testable import Kindred

/// Opt-in system ActivityKit coverage with the production widget extension.
/// No microphone, provider, account, or real call is opened.
@MainActor
final class VoiceActivityUIKitTests: XCTestCase {
    func testSystemActivityUpdatesMuteAndEnds() async throws {
        guard ProcessInfo.processInfo.environment["KINDRED_TEST_ACTIVITY"] == "1" else {
            throw XCTSkip("Set KINDRED_TEST_ACTIVITY=1 for the system Live Activity fixture")
        }
        XCTAssertTrue(ActivityAuthorizationInfo().areActivitiesEnabled)
        let id = UUID().uuidString, started = Date().addingTimeInterval(-83)
        let activity = try Activity<VoiceCallAttributes>.request(
            attributes: VoiceCallAttributes(id: id, botName: "Piper QA", shape: "cloud", color: "#2475ff"),
            content: ActivityContent(state: .init(started: started, muted: false), staleDate: Date().addingTimeInterval(120)),
            pushType: nil)
        do {
            XCTAssertTrue(Activity<VoiceCallAttributes>.activities.contains { $0.id == activity.id })
            XCTAssertEqual(activity.attributes.id, id)
            XCTAssertFalse(activity.content.state.muted)
            // A bounded optional hold lets Device Hub inspect the simulator's
            // real compact/expanded Island. It never enables device mirroring.
            if ProcessInfo.processInfo.environment["KINDRED_TEST_ACTIVITY_VISUAL"] == "1" {
                print("KINDRED_ACTIVITY_VISUAL_READY")
                try await Task.sleep(for: .seconds(45))
            }
            await activity.update(ActivityContent(state: .init(started: started, muted: true), staleDate: Date().addingTimeInterval(45)))
            XCTAssertTrue(activity.content.state.muted)
            XCTAssertEqual(activity.content.state.started, started)
            await activity.end(nil, dismissalPolicy: .immediate)
            XCTAssertEqual(activity.activityState, .ended)
        } catch {
            await activity.end(nil, dismissalPolicy: .immediate)
            throw error
        }
    }
}
