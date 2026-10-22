import SwiftUI
import WebKit

/// Hosts an account's existing WKWebView. The web view belongs to its
/// WebSession, not to SwiftUI, so rotation, split view, Stage Manager resizing
/// and account switches move the same view (and its page state) between hosts
/// instead of recreating it.
@MainActor
struct WebContainerView: UIViewRepresentable {
    let session: WebSession
    var navigationBlocked = false

    func makeUIView(context: Context) -> WebHostView {
        let host = WebHostView()
        session.setNativeNavigationBlocked(navigationBlocked)
        session.refreshSystemTextSize()
        host.attach(session)
        return host
    }

    func updateUIView(_ host: WebHostView, context: Context) {
        session.setNativeNavigationBlocked(navigationBlocked)
        session.refreshSystemTextSize()
        host.attach(session)
    }
}

@MainActor
final class WebHostView: UIView {
    private weak var session: WebSession?
    private var hasDivision = false
    // A local decoration covers intermediate web layouts without replacing the
    // account's WKWebView or disturbing its responder/input ownership.
    private struct Pose: Equatable {
        let window: ObjectIdentifier
        let size: CGSize
        let orientation: Int
        let inner: Bool
        let divisions: String
    }
    private var pose: Pose?
    private var frost: UIVisualEffectView?
    private var frostGeneration = 0
    private var frostActive = false
    private var frostRevision = 0
    private var frostLayout: String?
    private var frostSettle: DispatchWorkItem?
    private var frostDeadline: DispatchWorkItem?

    private func resetFrost() {
        frostGeneration += 1
        frostSettle?.cancel()
        frostDeadline?.cancel()
        frostSettle = nil
        frostDeadline = nil
        frostActive = false
        frostLayout = nil
        pose = nil
        frost?.layer.removeAllAnimations()
        frost?.isHidden = true
    }

    @objc private func sceneWillDeactivate(_ notification: Notification) {
        guard let scene = notification.object as? UIWindowScene,
              scene === window?.windowScene else { return }
        resetFrost()
    }

    @objc private func sceneDidActivate(_ notification: Notification) {
        guard let scene = notification.object as? UIWindowScene,
              scene === window?.windowScene else { return }
        setNeedsLayout() // Establish a fresh baseline without replaying a cover.
    }

    private func updatePose(inner: Bool) {
        guard let window, window.windowScene?.activationState == .foregroundActive else {
            resetFrost()
            return
        }
        var divisions = ""
        if #available(iOS 27.1, *) {
            divisions = window.reservedRegions(kind: .division, options: .includeInactive)
                .map { "\($0.isActive):\($0.frame)" }.sorted().joined(separator: "|")
        }
        let next = Pose(window: ObjectIdentifier(window), size: window.bounds.size,
                        orientation: window.windowScene?.effectiveGeometry.interfaceOrientation.rawValue ?? 0,
                        inner: inner, divisions: divisions)
        defer { pose = next }
        guard let previous = pose else { return } // Cold launch owns its animation.
        // Trigger on window pose only. Once covered, also wait for the local
        // host/keyboard guide/safe-area layout to settle before uncovering it.
        let layout = "\(bounds)|\(session?.webView.frame ?? .zero)|\(session?.webView.safeAreaInsets ?? .zero)|\(safeAreaInsets)"
        guard next != previous || (frostActive && frostLayout != layout) else { return }
        frostLayout = layout
        frostRevision += 1
        if !frostActive {
            frostGeneration += 1
            frostActive = true
            let view = frost ?? UIVisualEffectView()
            frost = view
            view.isUserInteractionEnabled = false
            view.accessibilityElementsHidden = true
            view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            view.frame = bounds
            view.overrideUserInterfaceStyle = session?.webView.overrideUserInterfaceStyle ?? .unspecified
            view.effect = UIAccessibility.isReduceTransparencyEnabled ? nil : UIBlurEffect(style: .systemMaterial)
            view.contentView.backgroundColor = (session?.presentation.canvas ?? .systemBackground)
                .withAlphaComponent(UIAccessibility.isReduceTransparencyEnabled ? 1 : 0.88)
            if view.superview !== self { addSubview(view) }
            bringSubviewToFront(view)
            view.layer.removeAllAnimations()
            view.alpha = 1
            view.isHidden = false
            let generation = frostGeneration
            // A fixed deadline prevents an interrupted/repeated resize from
            // leaving a cover behind. Further layouts cannot extend it.
            let deadline = DispatchWorkItem { [weak self] in self?.finishFrost(generation, animated: false) }
            frostDeadline = deadline
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.65, execute: deadline)
        } else {
            frost?.layer.removeAllAnimations()
            frost?.alpha = 1
        }
        frostSettle?.cancel()
        let generation = frostGeneration
        let revision = frostRevision
        let settle = DispatchWorkItem { [weak self] in
            guard let self, self.pose == next, self.frostRevision == revision else { return }
            self.finishFrost(generation, animated: true)
        }
        frostSettle = settle
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.12, execute: settle)
    }

    private func finishFrost(_ generation: Int, animated: Bool) {
        guard frostActive, frostGeneration == generation else { return }
        guard animated, window?.windowScene?.activationState == .foregroundActive else {
            resetFrostKeepingPose()
            return
        }
        let revision = frostRevision
        UIView.animate(withDuration: UIAccessibility.isReduceMotionEnabled ? 0.08 : 0.22,
                       delay: 0, options: [.beginFromCurrentState, .curveEaseOut, .allowUserInteraction]) {
            self.frost?.alpha = 0
        } completion: { [weak self] finished in
            guard let self, finished, self.frostGeneration == generation, self.frostRevision == revision else { return }
            self.resetFrostKeepingPose()
        }
    }

    private func resetFrostKeepingPose() {
        let previous = pose
        resetFrost()
        pose = previous
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        updateEnvironment()
    }

    override func safeAreaInsetsDidChange() {
        super.safeAreaInsetsDidChange()
        setNeedsLayout()
    }

    private func updateEnvironment() {
        var isDuoInner = false
        var usesNativeRail = false
        var railSide = "none"
        if #available(iOS 27.1, *) {
            isDuoInner = !(window?.reservedRegions(kind: .division, options: .includeInactive).isEmpty ?? true)
            hasDivision = hasDivision || isDuoInner
            usesNativeRail = isDuoInner || traitCollection.verticalBarEdge != .unspecified
            let rightToLeft = effectiveUserInterfaceLayoutDirection == .rightToLeft
            switch traitCollection.verticalBarEdge {
            case .leading: railSide = rightToLeft ? "right" : "left"
            case .trailing: railSide = rightToLeft ? "left" : "right"
            default: break
            }
        }
        guard let session else { return }
        // Cover Duo changes before publishing the new web geometry.
        if hasDivision || usesNativeRail { updatePose(inner: isDuoInner) }
        else { resetFrost() }
        let keyboardVisible = session.webView.frame.maxY < bounds.maxY - safeAreaInsets.bottom - 1
        var insets = session.webView.safeAreaInsets
        if #available(iOS 27.1, *), usesNativeRail {
            insets = session.webView.edgeInsets(for: .safeArea(cornerAdaptation: .horizontal))
        }
        let ordinaryBottom = session.webView.safeAreaInsets.bottom
        var composerBottom = ordinaryBottom
        if #available(iOS 27.1, *), usesNativeRail, session.composerExtent > 0 {
            // Query the actual bottom row; the whole-view safe area also
            // contains the vertical bar and can leave unnecessary blank space.
            let extent = min(session.webView.bounds.height, session.composerExtent + 16)
            let rowInsets = session.webView.edgeInsets(for: .bar(onEdge: UIRectEdge.bottom, extent: extent))
            let row = session.webView.bounds.inset(by: rowInsets)
            if [rowInsets.top, rowInsets.left, rowInsets.bottom, rowInsets.right].allSatisfy({ $0.isFinite && $0 >= 0 }),
               !row.isNull, row.width > 0, row.height > 0,
               row.minY >= 0, row.maxY <= session.webView.bounds.maxY + 0.5 {
                // A valid bar row can be displaced upward by system chrome.
                // This is a reduction-only optimization, never extra lift.
                composerBottom = min(rowInsets.bottom, ordinaryBottom)
            }
        }
        let windowBounds = window?.bounds ?? bounds
        session.updateLayout(topInset: insets.top, bottomInset: keyboardVisible ? 0 : insets.bottom,
                             leftInset: insets.left, rightInset: insets.right, isDuo: hasDivision || usesNativeRail,
                             isDuoInner: isDuoInner, usesNativeRail: usesNativeRail, railSide: railSide,
                             composerBottomInset: keyboardVisible ? 0 : composerBottom, keyboardVisible: keyboardVisible, isSlab: traitCollection.userInterfaceIdiom == .phone && !isDuoInner,
                             viewportHeight: session.webView.bounds.height,
                             isPortrait: windowBounds.height >= windowBounds.width)
        session.refreshSystemTextSize()
        publishGeometry()
        session.restoreComputerKeyboard()
    }

    @objc private func keyboardDidHide() {
        session?.restoreComputerKeyboard(force: true)
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        session?.computerHostAttachmentChanged()
        if window == nil {
            resetFrost()
            session?.detachVisibleHost()
        }
        setNeedsLayout()
    }

    deinit { NotificationCenter.default.removeObserver(self) }

    private func publishGeometry() {
        guard let window else { return }
        var regions: [[String: Any]] = []
        if #available(iOS 27.1, *), let webView = session?.webView {
            for (kind, name) in [(UIView.ReservedRegion.Kind.division, "division"), (.occlusion, "occlusion")] {
                for region in webView.reservedRegions(kind: kind, options: kind == .division ? .includeInactive : []) {
                    // Inactive folds can be zero-sized markers. Keep their
                    // presence for display classification without reserving space.
                    let rect = kind == .division || !region.isActive ? region.frame : region.frame.intersection(webView.bounds)
                    guard !rect.isNull, [rect.minX, rect.minY, rect.width, rect.height].allSatisfy(\.isFinite),
                          rect.width >= 0, rect.height >= 0 else { continue }
                    regions.append(["kind": name, "active": region.isActive, "x": rect.minX, "y": rect.minY,
                                    "width": rect.width, "height": rect.height])
                }
            }
        }
        session?.updateGeometry(width: session?.webView.bounds.width ?? bounds.width,
            height: session?.webView.bounds.height ?? bounds.height,
            windowWidth: window.bounds.width, windowHeight: window.bounds.height,
            safeArea: session?.webView.safeAreaInsets ?? safeAreaInsets, reservedRegions: regions)
    }
    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = UIColor(named: "Canvas")
        keyboardLayoutGuide.usesBottomSafeArea = false
        observeTextSize()
        NotificationCenter.default.addObserver(self, selector: #selector(keyboardDidHide), name: UIResponder.keyboardDidHideNotification, object: nil)
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        backgroundColor = UIColor(named: "Canvas")
        keyboardLayoutGuide.usesBottomSafeArea = false
        observeTextSize()
        NotificationCenter.default.addObserver(self, selector: #selector(keyboardDidHide), name: UIResponder.keyboardDidHideNotification, object: nil)
    }

    private func observeTextSize() {
        NotificationCenter.default.addObserver(self, selector: #selector(sceneWillDeactivate),
            name: UIScene.willDeactivateNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(sceneDidActivate),
            name: UIScene.didActivateNotification, object: nil)
        if #available(iOS 27.1, *) {
            registerForTraitChanges(UITraitCollection.systemTraitsAffectingVerticalBarEdge + [UITraitLayoutDirection.self]) { (view: WebHostView, _: UITraitCollection) in
                view.setNeedsLayout()
            }
        }
        registerForTraitChanges([UITraitPreferredContentSizeCategory.self]) { (view: WebHostView, _: UITraitCollection) in
            view.session?.refreshSystemTextSize()
            view.setNeedsLayout()
        }
    }

    func attach(_ session: WebSession) {
        if self.session !== session { resetFrost() }
        self.session = session
        hasDivision = hasDivision || session.presentation.isDuo
        let webView = session.webView
        guard webView.superview !== self else { return }
        subviews.forEach { $0.removeFromSuperview() }
        webView.removeFromSuperview()
        webView.translatesAutoresizingMaskIntoConstraints = false
        addSubview(webView)
        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: trailingAnchor),
            webView.topAnchor.constraint(equalTo: topAnchor),
            // UIKit tracks the real keyboard edge, including focus/rotation
            // animations. WebKit no longer has to subtract its height in CSS.
            webView.bottomAnchor.constraint(equalTo: keyboardLayoutGuide.topAnchor),
        ])
        setNeedsLayout()
    }
}
