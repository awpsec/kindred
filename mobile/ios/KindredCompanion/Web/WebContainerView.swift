import SwiftUI
import WebKit

/// Hosts an account's existing WKWebView. The web view belongs to its
/// WebSession, not to SwiftUI, so rotation, split view, Stage Manager resizing
/// and account switches move the same view (and its page state) between hosts
/// instead of recreating it.
@MainActor
struct WebContainerView: UIViewRepresentable {
    let session: WebSession

    func makeUIView(context: Context) -> WebHostView {
        let host = WebHostView()
        host.attach(session)
        return host
    }

    func updateUIView(_ host: WebHostView, context: Context) {
        host.attach(session)
    }
}

final class WebHostView: UIView {
    private weak var session: WebSession?
    private var hasDivision = false
    private var keyboardVisible = false

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
        session?.updateLayout(topInset: safeAreaInsets.top, bottomInset: keyboardVisible ? 0 : safeAreaInsets.bottom, isSlab: UIDevice.current.userInterfaceIdiom == .phone && !hasDivision)
    }
    @objc private func keyboardFrameChanged(_ notification: Notification) {
        guard let window, let frame = notification.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect else { return }
        let local = window.convert(frame, from: window.screen.coordinateSpace)
        keyboardVisible = local.minY < window.bounds.maxY - window.safeAreaInsets.bottom - 1
        updateEnvironment()
    }

    deinit { NotificationCenter.default.removeObserver(self) }

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = UIColor(named: "Canvas")
        NotificationCenter.default.addObserver(self, selector: #selector(keyboardFrameChanged(_:)), name: UIResponder.keyboardWillChangeFrameNotification, object: nil)
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        backgroundColor = UIColor(named: "Canvas")
        NotificationCenter.default.addObserver(self, selector: #selector(keyboardFrameChanged(_:)), name: UIResponder.keyboardWillChangeFrameNotification, object: nil)
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
