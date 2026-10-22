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
        if #available(iOS 27.1, *) {
            isDuoInner = !(window?.reservedRegions(kind: .division, options: .includeInactive).isEmpty ?? true)
            hasDivision = hasDivision || isDuoInner
            usesNativeRail = isDuoInner || traitCollection.verticalBarEdge != .unspecified
        }
        guard let session else { return }
        let keyboardVisible = session.webView.frame.maxY < bounds.maxY - safeAreaInsets.bottom - 1
        var insets = session.webView.safeAreaInsets
        if #available(iOS 27.1, *), usesNativeRail {
            insets = session.webView.edgeInsets(for: .safeArea(cornerAdaptation: .horizontal))
        }
        var composerBottom = insets.bottom
        if #available(iOS 27.1, *), usesNativeRail, session.composerExtent > 0 {
            // Query the actual bottom row; the whole-view safe area also
            // contains the vertical bar and can leave unnecessary blank space.
            let extent = min(session.webView.bounds.height, session.composerExtent + 16)
            let rowInsets = session.webView.edgeInsets(for: .bar(onEdge: UIRectEdge.bottom, extent: extent))
            let row = session.webView.bounds.inset(by: rowInsets)
            if [rowInsets.top, rowInsets.left, rowInsets.bottom, rowInsets.right].allSatisfy({ $0.isFinite && $0 >= 0 }),
               !row.isNull, row.width > 0, row.height > 0,
               row.minY >= 0, row.maxY <= session.webView.bounds.maxY + 0.5 {
                composerBottom = rowInsets.bottom
            }
        }
        let windowBounds = window?.bounds ?? bounds
        session.updateLayout(topInset: insets.top, bottomInset: keyboardVisible ? 0 : insets.bottom,
                             leftInset: insets.left, rightInset: insets.right, isDuo: hasDivision || usesNativeRail,
                             isDuoInner: isDuoInner, usesNativeRail: usesNativeRail,
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
        if window == nil { session?.detachVisibleHost() }
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
        if #available(iOS 27.1, *) {
            registerForTraitChanges(UITraitCollection.systemTraitsAffectingVerticalBarEdge) { (view: WebHostView, _: UITraitCollection) in
                view.setNeedsLayout()
            }
        }
        registerForTraitChanges([UITraitPreferredContentSizeCategory.self]) { (view: WebHostView, _: UITraitCollection) in
            view.session?.refreshSystemTextSize()
            view.setNeedsLayout()
        }
    }

    func attach(_ session: WebSession) {
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
