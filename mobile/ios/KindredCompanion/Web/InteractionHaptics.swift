import UIKit

enum InteractionFeedback: Equatable {
    case selection, recordingStarted, recordingStopped, recordingError
}

/// Semantic, foreground-only feedback. UIKit owns hardware support and the
/// user's system haptics preferences; no custom vibration engine or sounds.
@MainActor
final class InteractionHaptics {
    private let selection = UISelectionFeedbackGenerator()
    private let impact = UIImpactFeedbackGenerator(style: .soft)
    private let notification = UINotificationFeedbackGenerator()
    private let foreground: () -> Bool
    private let clock: () -> TimeInterval
    private let output: ((InteractionFeedback) -> Void)?
    private var lastSelection: TimeInterval?

    init(foreground: @escaping () -> Bool = { UIApplication.shared.applicationState == .active },
         clock: @escaping () -> TimeInterval = { CACurrentMediaTime() },
         output: ((InteractionFeedback) -> Void)? = nil) {
        self.foreground = foreground; self.clock = clock; self.output = output
    }

    @discardableResult
    func play(_ feedback: InteractionFeedback) -> Bool {
        guard foreground() else { return false }
        if feedback == .selection {
            let now = clock()
            if let lastSelection, now - lastSelection < 0.08 { return false }
            lastSelection = now
        }
        if let output { output(feedback); return true }
        switch feedback {
        case .selection:
            selection.selectionChanged()
        case .recordingStarted:
            impact.impactOccurred(intensity: 0.65)
        case .recordingStopped:
            impact.impactOccurred(intensity: 0.45)
        case .recordingError:
            notification.notificationOccurred(.warning)
        }
        return true
    }
}
