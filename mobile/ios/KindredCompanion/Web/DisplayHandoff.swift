import UIKit

/// Session-owned decoration: the same page can leave its host/window while iOS
/// switches displays. Cover native chrome as well as WebKit until both settle.
@MainActor
final class DisplayHandoff {
    struct Pose: Equatable {
        let window: ObjectIdentifier
        let size: CGSize
        let orientation: Int
        let inner: Bool
        let divisions: String
    }

    struct Timing {
        var minimum = 0.72
        var quiet = 0.14
        var deadline = 1.8
        var fade = 0.28
    }

    private let timing: Timing
    var reduceMotion = false
    private(set) var cover: UIVisualEffectView?
    private(set) var pose: Pose?
    private var layout = ""
    private var generation = 0
    private var revision = 0
    private var beganAt = 0.0
    private var active = false
    private var suspended = false
    private var settle: DispatchWorkItem?
    private var deadline: DispatchWorkItem?

    init(timing: Timing = Timing()) { self.timing = timing }

    func suspend(in window: UIWindow, canvas: UIColor) {
        guard pose != nil else { return } // The launch screen owns cold launch.
        suspended = true
        begin(in: window, canvas: canvas)
        cover?.layer.removeAllAnimations()
        cover?.alpha = 1
        settle?.cancel()
    }

    func update(pose next: Pose, layout: String, in window: UIWindow, canvas: UIColor,
                active sceneActive: Bool, waitForPaint: @escaping (@escaping () -> Void) -> Void) {
        let changedDisplay = pose.map { $0.inner != next.inner || $0.window != next.window } ?? false
        let changed = pose != next || self.layout != layout || suspended
        pose = next
        self.layout = layout
        guard sceneActive else {
            if changedDisplay || active {
                suspended = true
                begin(in: window, canvas: canvas)
            }
            return
        }
        if suspended {
            beganAt = CACurrentMediaTime()
            armDeadline()
        }
        suspended = false
        guard changedDisplay || active else { return }
        begin(in: window, canvas: canvas)
        if changedDisplay {
            cover?.layer.removeAllAnimations()
            cover?.alpha = 1
        }
        guard changed else { return }
        revision += 1
        let revision = revision, generation = generation
        settle?.cancel()
        let item = DispatchWorkItem { [weak self] in
            guard let self, self.active, self.generation == generation,
                  self.revision == revision, !self.suspended else { return }
            waitForPaint { [weak self] in
                guard let self, self.generation == generation, self.revision == revision,
                      !self.suspended else { return }
                self.reveal(generation: generation)
            }
        }
        settle = item
        let delay = max(timing.quiet, beganAt + timing.minimum - CACurrentMediaTime())
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: item)
    }

    private func begin(in window: UIWindow, canvas: UIColor) {
        if !active {
            active = true
            generation += 1
            beganAt = CACurrentMediaTime()
            armDeadline()
        }
        let view: UIVisualEffectView
        if let cover { view = cover }
        else {
            view = UIVisualEffectView(effect: UIAccessibility.isReduceTransparencyEnabled ? nil : UIBlurEffect(style: .systemThickMaterial))
            view.isUserInteractionEnabled = false
            view.accessibilityElementsHidden = true
            view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            view.contentView.backgroundColor = canvas.withAlphaComponent(UIAccessibility.isReduceTransparencyEnabled ? 1 : 0.82)
        }
        cover = view
        view.frame = window.bounds
        view.overrideUserInterfaceStyle = window.traitCollection.userInterfaceStyle
        if view.superview !== window { window.addSubview(view) }
        window.bringSubviewToFront(view)
        // Keep a running dissolve continuous if UIKit publishes another layout.
        // A reversed display handoff is covered before its new geometry paints.
        if view.isHidden || view.layer.animationKeys()?.isEmpty != false {
            view.alpha = 1
        }
        view.isHidden = false
    }

    private func armDeadline() {
        deadline?.cancel()
        let generation = generation
        // A stalled web process must not strand the decoration. Even the
        // fallback dissolves it; the previous deadline cut it off abruptly.
        let item = DispatchWorkItem { [weak self] in
            guard let self, !self.suspended else { return }
            self.reveal(generation: generation)
        }
        deadline = item
        DispatchQueue.main.asyncAfter(deadline: .now() + timing.deadline, execute: item)
    }

    private func reveal(generation: Int) {
        guard active, self.generation == generation, !suspended else { return }
        deadline?.cancel()
        deadline = nil
        let revision = revision
        UIView.animate(withDuration: reduceMotion || UIAccessibility.isReduceMotionEnabled ? 0.1 : timing.fade,
                       delay: 0, options: [.beginFromCurrentState, .curveEaseInOut, .allowUserInteraction]) {
            self.cover?.alpha = 0
        } completion: { [weak self] finished in
            guard let self, finished, self.generation == generation, self.revision == revision else { return }
            self.clearCover()
        }
    }

    private func clearCover() {
        generation += 1
        settle?.cancel()
        deadline?.cancel()
        settle = nil
        deadline = nil
        active = false
        cover?.layer.removeAllAnimations()
        cover?.removeFromSuperview()
        cover = nil
    }

    func cancel() {
        clearCover()
        pose = nil
        layout = ""
        suspended = false
    }
}
