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
        updateEnvironment()
    }

    private func updateEnvironment() {
        if #available(iOS 27.1, *) {
            hasDivision = hasDivision || !(window?.reservedRegions(kind: .division, options: .includeInactive).isEmpty ?? true)
        }
        guard let session else { return }
        let keyboardVisible = session.webView.frame.maxY < bounds.maxY - safeAreaInsets.bottom - 1
        session.updateLayout(topInset: safeAreaInsets.top, bottomInset: keyboardVisible ? 0 : safeAreaInsets.bottom,
                             isSlab: UIDevice.current.userInterfaceIdiom == .phone && !hasDivision,
                             viewportHeight: session.webView.bounds.height,
                             isPortrait: window?.windowScene?.interfaceOrientation.isPortrait ?? (bounds.height >= bounds.width))
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
        updateEnvironment()
    }

    deinit { NotificationCenter.default.removeObserver(self) }

    private func publishGeometry() {
        guard let window else { return }
        session?.updateGeometry(width: session?.webView.bounds.width ?? bounds.width,
            height: session?.webView.bounds.height ?? bounds.height,
            windowWidth: window.bounds.width, windowHeight: window.bounds.height,
            safeArea: window.safeAreaInsets)
    }
    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = UIColor(named: "Canvas")
        keyboardLayoutGuide.usesBottomSafeArea = false
        NotificationCenter.default.addObserver(self, selector: #selector(keyboardDidHide), name: UIResponder.keyboardDidHideNotification, object: nil)
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        backgroundColor = UIColor(named: "Canvas")
        keyboardLayoutGuide.usesBottomSafeArea = false
        NotificationCenter.default.addObserver(self, selector: #selector(keyboardDidHide), name: UIResponder.keyboardDidHideNotification, object: nil)
    }

    func attach(_ session: WebSession) {
        self.session = session
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
