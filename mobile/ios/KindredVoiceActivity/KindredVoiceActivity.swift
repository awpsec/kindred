import ActivityKit
import SwiftUI
import WidgetKit

@main
struct KindredVoiceWidgets: WidgetBundle {
    var body: some Widget { KindredVoiceActivity() }
}
struct KindredVoiceActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: VoiceCallAttributes.self) { context in
            HStack(spacing: 14) {
                BotToolbarAvatar(shape: context.attributes.shape, color: context.attributes.color)
                VStack(alignment: .leading, spacing: 3) {
                    Text(context.attributes.botName).font(.headline).lineLimit(1)
                    if context.isStale { Text("Call inactive").font(.caption) }
                    else { CallTimer(started: context.state.started, narrow: false) }
                }
                Spacer(minLength: 4)
                CallControls(context: context)
            }.padding(16).activityBackgroundTint(Color.black.opacity(0.85)).foregroundStyle(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    BotToolbarAvatar(shape: context.attributes.shape, color: context.attributes.color)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if context.isStale { Image(systemName: "phone.down") }
                    else { CallTimer(started: context.state.started, narrow: false) }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        Text(context.attributes.botName).lineLimit(1)
                        Spacer(minLength: 8)
                        CallControls(context: context)
                    }
                }
            } compactLeading: {
                BotToolbarAvatar(shape: context.attributes.shape, color: context.attributes.color)
                    .scaleEffect(0.8).frame(width: 28, height: 28)
            } compactTrailing: {
                if context.isStale { Image(systemName: "phone.down").frame(width: 28, height: 28) }
                else if #available(iOS 27.0, *) {
                    AdaptiveCallTimer(started: context.state.started)
                } else {
                    CallTimer(started: context.state.started, narrow: false)
                }
            } minimal: {
                BotToolbarAvatar(shape: context.attributes.shape, color: context.attributes.color)
                    .scaleEffect(0.8).frame(width: 28, height: 28)
            }
            .keylineTint(Color.secondary)
        }
    }
}
// The system chooses vertical placement on Duo; never rotate a horizontal pill.
@available(iOS 27.0, *)
private struct AdaptiveCallTimer: View {
    @Environment(\.isDynamicIslandLimitedInWidth) private var limited
    let started: Date
    var body: some View { CallTimer(started: started, narrow: limited) }
}
private struct CallTimer: View {
    let started: Date
    let narrow: Bool
    var body: some View {
        Text(timerInterval: started...started.addingTimeInterval(3600), countsDown: false)
            .monospacedDigit().font(.system(size: narrow ? 10 : 14, weight: .medium))
            .frame(width: narrow ? 28 : 48).lineLimit(1).minimumScaleFactor(0.7)
            .accessibilityLabel("Call elapsed time")
    }
}
private struct CallControls: View {
    let context: ActivityViewContext<VoiceCallAttributes>
    var body: some View {
        HStack(spacing: 12) {
            Button(intent: MuteVoiceCallIntent(id: context.attributes.id, muted: !context.state.muted)) {
                Image(systemName: context.state.muted ? "mic.slash.fill" : "mic.fill")
                    .frame(width: 44, height: 44)
            }.buttonStyle(.plain).disabled(context.isStale).accessibilityLabel(context.state.muted ? "Unmute microphone" : "Mute microphone")
            Button(intent: EndVoiceCallIntent(id: context.attributes.id)) {
                Image(systemName: "phone.down.fill").frame(width: 44, height: 44)
                    .background(.red, in: Circle()).foregroundStyle(.white)
            }.buttonStyle(.plain).accessibilityLabel("End call")
        }
    }
}
