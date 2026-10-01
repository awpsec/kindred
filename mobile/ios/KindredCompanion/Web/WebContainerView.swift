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
        host.attach(session.webView)
        return host
    }

    func updateUIView(_ host: WebHostView, context: Context) {
        host.attach(session.webView)
    }
}

final class WebHostView: UIView {
    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = UIColor(named: "Canvas")
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        backgroundColor = UIColor(named: "Canvas")
    }

    func attach(_ webView: WKWebView) {
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
