import KindredCore
import UIKit
import WebKit

/// UIKit owns recognition/thresholds; the trusted page owns reversible visuals
/// and route state. This never invokes WebKit history or computer input.
@MainActor
final class EdgeBackGesture: NSObject, UIGestureRecognizerDelegate {
    weak var session: WebSession?
    private var navigation: WebNavigation?
    private var id: UUID?
    private var revision: Double = 0
    private var generation = 0
    private var accepted = false
    private var progress: Double = 0
    private var startXFraction: Double = 0
    private var startYFraction: Double = 0
    private var pendingEnd: (Bool, Double)?
    private lazy var pan: UIScreenEdgePanGestureRecognizer = {
        let recognizer = UIScreenEdgePanGestureRecognizer(target: self, action: #selector(changed))
        recognizer.edges = .left
        recognizer.delegate = self
        recognizer.delaysTouchesBegan = true
        recognizer.cancelsTouchesInView = true
        return recognizer
    }()

    init(session: WebSession) {
        self.session = session
        super.init()
        session.webView.addGestureRecognizer(pan)
    }

    func setNavigation(_ value: WebNavigation?) {
        if navigation != value { cancel() }
        navigation = value
    }

    func detach() {
        cancel()
        session?.webView.removeGestureRecognizer(pan)
    }

    func cancel() {
        if let id { dispatch(.cancel, id: id, progress: progress, commit: false) }
        generation += 1
        id = nil
        accepted = false
        pendingEnd = nil
    }

    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        guard let view = session?.webView else { return false }
        let point = touch.location(in: view)
        guard point.x >= 0, point.x <= 20, eligible else { return false }
        startXFraction = Double(point.x / max(1, view.bounds.width))
        startYFraction = Double(point.y / max(1, view.bounds.height))
        return true
    }

    func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        let velocity = pan.velocity(in: pan.view)
        return eligible && velocity.x > 0 && abs(velocity.x) > abs(velocity.y)
    }

    private var eligible: Bool {
        guard let session, session.canBeginEdgeBack,
              let navigation, navigation.target != .none else { return false }
        return true
    }

    @objc private func changed() {
        guard let session else { cancel(); return }
        progress = min(1, max(0, Double(pan.translation(in: session.webView).x / max(1, session.webView.bounds.width))))
        switch pan.state {
        case .began:
            guard eligible, let navigation else { cancel(); return }
            cancel()
            let newID = UUID()
            id = newID
            revision = navigation.revision
            let capturedGeneration = generation
            dispatch(.begin, id: newID, progress: 0, commit: false) { [weak self] allowed in
                guard let self, self.id == newID, self.generation == capturedGeneration else { return }
                guard allowed, self.eligible else { self.cancel(); return }
                self.accepted = true
                if let end = self.pendingEnd { self.finish(cancelled: end.0, velocity: end.1) }
                else { self.dispatch(.update, id: newID, progress: self.progress, commit: false) }
            }
        case .changed:
            guard eligible else { cancel(); return }
            if accepted, let id { dispatch(.update, id: id, progress: progress, commit: false) }
        case .ended, .cancelled, .failed:
            let cancelled = pan.state != .ended
            let velocity = Double(pan.velocity(in: session.webView).x)
            if accepted { finish(cancelled: cancelled, velocity: velocity) }
            else { pendingEnd = (cancelled, velocity) }
        default: break
        }
    }

    private func finish(cancelled: Bool, velocity: Double) {
        guard let id else { return }
        let commit = eligible && WebEdgeBack.shouldCommit(progress: progress, velocity: velocity, cancelled: cancelled)
        dispatch(commit ? .finish : .cancel, id: id, progress: progress, commit: commit)
        self.id = nil
        accepted = false
        pendingEnd = nil
    }

    private func dispatch(_ phase: WebEdgeBack.Phase, id: UUID, progress: Double, commit: Bool,
                          completion: ((Bool) -> Void)? = nil) {
        guard let session, session.origin.matches(session.webView.url) else { completion?(false); return }
        let script = WebEdgeBack.script(origin: session.origin, phase: phase, id: id,
                                       revision: revision, progress: progress, commit: commit,
                                       startXFraction: startXFraction, startYFraction: startYFraction)
        session.webView.callAsyncJavaScript(script, arguments: [:], in: nil, in: .page) { result in
            switch result {
            case .success(let value): completion?((value as? Bool) == true)
            case .failure: completion?(false)
            }
        }
    }
}
