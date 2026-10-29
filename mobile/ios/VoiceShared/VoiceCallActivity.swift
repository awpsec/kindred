import ActivityKit
import AppIntents
import Foundation

struct VoiceCallAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var started: Date
        var muted: Bool
    }
    var id: String
    var botName: String
    var shape: String
    var color: String
}

// LiveActivityIntent is executed in the application process, including while
// backgrounded. The call ID fences delayed taps from an earlier call.
struct EndVoiceCallIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "End call"
    static var openAppWhenRun = false
    @Parameter(title: "Call") var callID: String
    init() {}
    init(id: String) { callID = id }
    func perform() async throws -> some IntentResult {
        #if !KINDRED_WIDGET
        await NativeVoiceCall.shared.end(id: callID)
        #endif
        return .result()
    }
}
struct MuteVoiceCallIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Mute microphone"
    static var openAppWhenRun = false
    @Parameter(title: "Call") var callID: String
    @Parameter(title: "Muted") var muted: Bool
    init() {}
    init(id: String, muted: Bool) { callID = id; self.muted = muted }
    func perform() async throws -> some IntentResult {
        #if !KINDRED_WIDGET
        await NativeVoiceCall.shared.setMuted(id: callID, value: muted)
        #endif
        return .result()
    }
}
