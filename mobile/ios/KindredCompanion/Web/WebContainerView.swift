import SwiftUI
import WebKit

/// A single concentric contour in web-host coordinates. Resolving the native
/// continuous shape avoids CSS's radius normalization on a 60-point avatar row.
enum DisplayCornerContour {
    static func commands(in rect: CGRect, radii: [String: Double], inset: CGFloat = 8) -> [[Double]] {
        guard inset.isFinite, inset >= 0,
              [rect.minX, rect.minY, rect.width, rect.height].allSatisfy(\.isFinite),
              rect.width > inset * 2, rect.height > inset * 2,
              radii.values.allSatisfy(\.isFinite) else { return [] }
        func radius(_ key: String) -> CGFloat { max(0, CGFloat(radii[key] ?? 0) - inset) }
        let shape = UnevenRoundedRectangle(topLeadingRadius: radius("topLeft"),
            bottomLeadingRadius: radius("bottomLeft"), bottomTrailingRadius: radius("bottomRight"),
            topTrailingRadius: radius("topRight"), style: .continuous)
        var commands: [[Double]] = []
        shape.path(in: rect.insetBy(dx: inset, dy: inset)).cgPath.applyWithBlock { pointer in
            let element = pointer.pointee
            let opcode: Double, count: Int
            switch element.type {
            case .moveToPoint: opcode = 0; count = 1
            case .addLineToPoint: opcode = 1; count = 1
            case .addQuadCurveToPoint: opcode = 2; count = 2
            case .addCurveToPoint: opcode = 3; count = 3
            case .closeSubpath: opcode = 4; count = 0
            @unknown default: return
            }
            var command = [opcode]
            for index in 0..<count {
                command.append(Double(element.points[index].x))
                command.append(Double(element.points[index].y))
            }
            commands.append(command)
        }
        return commands
    }
}

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
        host.setNeedsLayout()
    }
}

@MainActor
final class WebHostView: UIView {
    private weak var session: WebSession?
    private var hasDivision = false
    private var railSampleScheduled = false
    private var railOnLeft = false
    @objc private func sceneWillDeactivate(_ notification: Notification) {
        guard let scene = notification.object as? UIWindowScene,
              scene === window?.windowScene, let window, let session,
              hasDivision || session.presentation.usesNativeRail else { return }
        // Install before iOS transfers the retained page to its other display.
        session.displayHandoff.suspend(in: window, canvas: session.presentation.canvas)
    }

    @objc private func sceneDidActivate(_ notification: Notification) {
        guard let scene = notification.object as? UIWindowScene,
              scene === window?.windowScene else { return }
        setNeedsLayout()
    }

    private func updatePose(inner: Bool) {
        guard let window, let session else { return }
        var divisions = ""
        if #available(iOS 27.1, *) {
            divisions = window.reservedRegions(kind: .division, options: .includeInactive)
                .map { "\($0.isActive):\($0.frame)" }.sorted().joined(separator: "|")
        }
        let pose = DisplayHandoff.Pose(window: ObjectIdentifier(window), size: window.bounds.size,
            orientation: window.windowScene?.effectiveGeometry.interfaceOrientation.rawValue ?? 0,
            inner: inner, divisions: divisions)
        let layout = "\(bounds)|\(session.webView.frame)|\(session.webView.safeAreaInsets)|\(safeAreaInsets)|\(session.railRevision)"
        session.displayHandoff.update(pose: pose, layout: layout, in: window,
            canvas: session.presentation.canvas,
            active: window.windowScene?.activationState == .foregroundActive,
            waitForPaint: { [weak session] completion in
                guard let session else { completion(); return }
                session.waitForDisplayPaint(completion)
            })
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        session?.glassControls.frame = bounds
        updateEnvironment()
        scheduleRailSample()
    }

    private func scheduleRailSample() {
        guard !railSampleScheduled else { return }; railSampleScheduled = true
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }; self.railSampleScheduled = false
            self.sampleRailControls()
        }
    }

    private func sampleRailControls() {
        guard let session, let window, window.windowScene?.activationState == .foregroundActive else { return }
        let web = session.webView
        guard session.presentation.usesNativeRail else { session.updateRailFrame(nil); return }
        defer { updatePose(inner: session.presentation.isDuoInner) }
        if session.presentation.isDuoInner {
            let identity = session.toolbarIdentityFrame
            session.updateRailFrame(identity, identity: identity)
            return
        }
        let inset = railOnLeft ? web.safeAreaInsets.left : web.safeAreaInsets.right
        guard web.bounds.height > 0, inset > 0 else { session.updateRailFrame(nil); return }
        var union = CGRect.null
        var identity = session.toolbarIdentityFrame
        var pending: [UIView] = [window]
        // Native bars can route hit testing through the web host. Measure the
        // visible public controls in the reserved edge strip directly instead.
        // Skip the entire web subtree, including its editors and form controls.
        while let view = pending.popLast() {
            guard view !== web, view !== session.glassControls, !view.isHidden, view.alpha > 0.01 else { continue }
            pending.append(contentsOf: view.subviews)
            guard view is UIControl else { continue }
            let frame = web.convert(view.bounds, from: view)
            let inStrip = railOnLeft ? frame.midX <= inset : frame.midX >= web.bounds.maxX-inset
            guard inStrip, frame.width > 0, frame.width <= 100, frame.height > 0, frame.height <= 100,
                  frame.intersects(web.bounds) else { continue }
            if view.accessibilityIdentifier == "kindred-bot-identity" { identity = frame }
            union = union.union(frame)
        }
        session.updateRailFrame(union.isNull ? identity : union, identity: identity)
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
        railOnLeft = railSide == "left"
        guard let session else { return }
        // Cover Duo changes before publishing the new web geometry.
        if hasDivision || usesNativeRail { updatePose(inner: isDuoInner) }
        else { session.displayHandoff.cancel() }
        let keyboardVisible = session.webView.frame.maxY < bounds.maxY - safeAreaInsets.bottom - 1
        var insets = session.webView.safeAreaInsets
        if #available(iOS 27.1, *), usesNativeRail {
            insets = session.webView.edgeInsets(for: .safeArea(cornerAdaptation: .horizontal))
        }
        let ordinaryBottom = session.webView.safeAreaInsets.bottom
        var composerBottom = ordinaryBottom
        if #available(iOS 27.1, *), usesNativeRail, session.composerExtent > 0 {
            // Query the fixed bottom action row, excluding the growing editor.
            // The whole-view safe area also
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
        var corners: [String: Double] = [:]
        if #available(iOS 26.0, *) {
            corners = ["topLeft": Double(effectiveRadius(corner: .topLeft)),
                       "topRight": Double(effectiveRadius(corner: .topRight)),
                       "bottomLeft": Double(effectiveRadius(corner: .bottomLeft)),
                       "bottomRight": Double(effectiveRadius(corner: .bottomRight))]
        }
        let contour = DisplayCornerContour.commands(in: session?.webView.convert(bounds, from: self) ?? bounds,
                                                     radii: corners)
        session?.updateGeometry(width: session?.webView.bounds.width ?? bounds.width,
            height: session?.webView.bounds.height ?? bounds.height,
            windowWidth: window.bounds.width, windowHeight: window.bounds.height,
            safeArea: session?.webView.safeAreaInsets ?? safeAreaInsets, reservedRegions: regions,
            displayCorners: corners, displayContour: contour)
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
        if #available(iOS 26.0, *) {
            cornerConfiguration = .corners(radius: .containerConcentric(minimum: 0))
        }
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
        if self.session !== session { self.session?.displayHandoff.cancel() }
        self.session = session
        hasDivision = hasDivision || session.presentation.isDuo
        let webView = session.webView
        guard webView.superview !== self else { return }
        let restoreComposerFocus=session.glassControls.composer.editor.isFirstResponder
        subviews.forEach { $0.removeFromSuperview() }
        webView.removeFromSuperview()
        webView.translatesAutoresizingMaskIntoConstraints = false
        addSubview(webView)
        session.glassControls.removeFromSuperview()
        addSubview(session.glassControls)
        session.glassControls.frame = bounds
        if restoreComposerFocus { DispatchQueue.main.async { [weak session] in session?.glassControls.composer.editor.becomeFirstResponder() } }
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
