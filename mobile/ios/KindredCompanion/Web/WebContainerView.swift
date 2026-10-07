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

    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window == nil { session?.detachVisibleHost() }
        else { publishGeometry() }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        publishGeometry()
    }

    override func safeAreaInsetsDidChange() {
        super.safeAreaInsetsDidChange()
        publishGeometry()
    }

    private func publishGeometry() {
        guard let window else { return }
        session?.updateGeometry(width: bounds.width, height: bounds.height,
            windowWidth: window.bounds.width, windowHeight: window.bounds.height,
            safeArea: window.safeAreaInsets)
    }
    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = UIColor(named: "Canvas")
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        backgroundColor = UIColor(named: "Canvas")
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
            webView.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
    }
}
