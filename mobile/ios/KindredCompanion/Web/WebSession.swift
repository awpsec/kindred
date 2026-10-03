import KindredCore
import Observation
import UIKit
import WebKit

@MainActor
@Observable
final class WebPresentationState {
    var hasChatInterface = false
}

@MainActor
protocol WebSessionHost: AnyObject {
    func webSession(_ session: WebSession, didReceive message: SessionMessage)
    func webSessionRequestedAccounts(_ session: WebSession)
    func webSession(_ session: WebSession, show message: String, isError: Bool)
    func webSession(_ session: WebSession, didDownload file: URL)
}

/// One account's web view: the server's own web UI, isolated in that account's
/// persistent data store, and allowed to show only that server's origin.
///
/// The page gets exactly two message handlers (session rotation and "open
/// accounts"), accepted only from the main frame of the exact origin. There is
/// no file, HTTP or native-execution bridge.
@MainActor
final class WebSession: NSObject {
    static let sessionHandler = "kindredSession"
    static let accountsHandler = "kindredAccounts"
    static var downloadsFolder: URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("Downloads", isDirectory: true)
    }

    let accountID: UUID
    let origin: ServerOrigin
    let webView: WKWebView
    let presentation = WebPresentationState()
    private var profileID: String?
    private var latestToken: String?
    private let policy: NavigationPolicy
    private weak var host: WebSessionHost?
    private var downloadDestinations: [ObjectIdentifier: URL] = [:]

    init(account: Account, token: String?, host: WebSessionHost) {
        accountID = account.id
        profileID = account.profileID
        latestToken = token
        origin = account.origin
        policy = NavigationPolicy(origin: account.origin)
        self.host = host

        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = WKWebsiteDataStore(forIdentifier: account.id)
        configuration.allowsInlineMediaPlayback = true
        configuration.dataDetectorTypes = []
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        configuration.preferences.isFraudulentWebsiteWarningEnabled = true
        configuration.defaultWebpagePreferences.preferredContentMode = .mobile
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
        configuration.applicationNameForUserAgent = "KindredMobile/" + version
        webView = WKWebView(frame: .zero, configuration: configuration)
        super.init()

        let controller = webView.configuration.userContentController
        let proxy = ScriptMessageProxy(session: self)
        controller.add(proxy, contentWorld: .page, name: WebSession.sessionHandler)
        controller.add(proxy, contentWorld: .page, name: WebSession.accountsHandler)
        installBootstrap(token: token)

        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = false
        webView.allowsLinkPreview = false
        webView.isOpaque = false
        webView.backgroundColor = UIColor(named: "Canvas")
        webView.underPageBackgroundColor = UIColor(named: "Canvas")
        // SwiftUI already lays the web view out inside the safe area and above
        // the keyboard; letting the scroll view inset again would double it.
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.keyboardDismissMode = .interactive
        #if DEBUG
        webView.isInspectable = true
        #endif
        webView.load(URLRequest(url: origin.rootURL))
    }

    /// Replaces the document-start script so the next load (reload, crash
    /// recovery, notification route) starts from the latest persisted token.
    func updateToken(_ token: String?) {
        latestToken = token
        installBootstrap(token: token)
    }

    func updateProfile(_ profile: String) {
        profileID = profile
        installBootstrap(token: latestToken)
    }

    private func installBootstrap(token: String?) {
        let controller = webView.configuration.userContentController
        controller.removeAllUserScripts()
        let source = WebBootstrap.documentStartScript(origin: origin, token: token, profileID: profileID)
        controller.addUserScript(WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true, in: .page))
        // Bundle the presentation layer so an older server still fits an iPhone.
        // The same exact-origin check as the session bootstrap scopes this script.
        if let cssURL = Bundle.main.url(forResource: "MobileLayout", withExtension: "css"),
           let jsURL = Bundle.main.url(forResource: "MobileLayout", withExtension: "js"),
           let css = try? String(contentsOf: cssURL, encoding: .utf8),
           let js = try? String(contentsOf: jsURL, encoding: .utf8) {
            let layout = """
            (function () {
              if (window.top !== window.self || window.location.origin !== \(WebBootstrap.javaScriptString(origin.serialized))) return;
              const style = document.createElement('style');
              style.textContent = \(WebBootstrap.javaScriptString(css));
              document.head.append(style);
              \(js)
            })();
            """
            controller.addUserScript(WKUserScript(source: layout, injectionTime: .atDocumentEnd, forMainFrameOnly: true, in: .page))
        }
    }

    func open(_ url: URL) {
        guard origin.matches(url) else { return }
        webView.load(URLRequest(url: url))
    }

    func reload() {
        // A script can leave the main frame on about:blank; start over at the root.
        if !origin.matches(webView.url) {
            webView.load(URLRequest(url: origin.rootURL))
        } else {
            webView.reload()
        }
    }

    /// Reads the page's current session token from an isolated content world,
    /// in the main frame, after checking the page is still on this origin.
    func readSessionToken() async -> String? {
        guard origin.matches(webView.url) else { return nil }
        return await withCheckedContinuation { (continuation: CheckedContinuation<String?, Never>) in
            webView.callAsyncJavaScript(WebBootstrap.readSessionScript, arguments: [:], in: nil, in: .defaultClient) { [origin] result in
                switch result {
                case .success(let value):
                    continuation.resume(returning: WebBootstrap.sessionToken(fromReadResult: value, origin: origin))
                case .failure:
                    continuation.resume(returning: nil)
                }
            }
        }
    }

    func tearDown() {
        presentation.hasChatInterface = false
        webView.stopLoading()
        let controller = webView.configuration.userContentController
        controller.removeAllScriptMessageHandlers()
        controller.removeAllUserScripts()
        webView.navigationDelegate = nil
        webView.uiDelegate = nil
        webView.removeFromSuperview()
    }

    // MARK: Bridge

    fileprivate func receive(_ message: WKScriptMessage) {
        guard message.webView === webView,
              message.frameInfo.isMainFrame,
              isTrusted(message.frameInfo.securityOrigin),
              origin.matches(webView.url) else { return }
        switch message.name {
        case WebSession.sessionHandler:
            if let parsed = SessionMessage(body: message.body) { host?.webSession(self, didReceive: parsed) }
        case WebSession.accountsHandler:
            if let body = message.body as? [String: Any], body["action"] as? String == "interface-ready" {
                presentation.hasChatInterface = true
                return
            }
            if AccountsMessage(body: message.body) != nil { host?.webSessionRequestedAccounts(self) }
        default:
            break
        }
    }

    private func isTrusted(_ securityOrigin: WKSecurityOrigin) -> Bool {
        origin.matches(scheme: securityOrigin.protocol, host: securityOrigin.host, port: securityOrigin.port)
    }

    private func notify(_ message: String) {
        host?.webSession(self, show: message, isError: true)
    }

    private static func trigger(_ type: WKNavigationType) -> NavigationTrigger {
        switch type {
        case .linkActivated: return .userLink
        case .formSubmitted, .formResubmitted: return .formSubmission
        case .backForward: return .backForward
        case .reload: return .reload
        case .other: return .other
        @unknown default: return .other
        }
    }

    private func presenter() -> UIViewController? {
        var controller = webView.window?.rootViewController
        while let presented = controller?.presentedViewController {
            controller = presented
        }
        return controller
    }
}

/// Holds the session weakly; WKUserContentController retains its handlers.
@MainActor
private final class ScriptMessageProxy: NSObject, WKScriptMessageHandler {
    weak var session: WebSession?

    init(session: WebSession) {
        self.session = session
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        session?.receive(message)
    }
}

extension WebSession: WKNavigationDelegate {
    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        presentation.hasChatInterface = false
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let url = navigationAction.request.url
        if navigationAction.shouldPerformDownload {
            decisionHandler(policy.allowsDownload(from: url) ? .download : .cancel)
            return
        }
        let isMainFrame = navigationAction.targetFrame?.isMainFrame ?? true
        switch policy.decide(url: url, isMainFrame: isMainFrame, trigger: WebSession.trigger(navigationAction.navigationType)) {
        case .allow:
            decisionHandler(.allow)
        case .openExternally(let external):
            decisionHandler(.cancel)
            UIApplication.shared.open(external)
        case .download:
            decisionHandler(.download)
        case .refuse(let reason):
            decisionHandler(.cancel)
            if isMainFrame { notify(reason.message) }
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse,
                 decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        let url = navigationResponse.response.url
        let disposition = (navigationResponse.response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Disposition")
        let attachment = disposition?.trimmingCharacters(in: .whitespaces).lowercased().hasPrefix("attachment") ?? false
        if attachment || !navigationResponse.canShowMIMEType {
            decisionHandler(policy.allowsDownload(from: url) ? .download : .cancel)
            return
        }
        if navigationResponse.isForMainFrame, !policy.allowsMainFrameResponse(from: url) {
            decisionHandler(.cancel)
            notify(NavigationRefusal.otherOrigin(host: url?.host).message)
            return
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, didReceiveServerRedirectForProvisionalNavigation navigation: WKNavigation!) {
        guard let url = webView.url, !origin.matches(url) else { return }
        webView.stopLoading()
        notify("Kindred stopped a redirect to \(url.host ?? "another site"). Only your Kindred server opens here.")
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        report(error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        report(error)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        presentation.hasChatInterface = false
        // Reloading runs the current bootstrap script, i.e. the latest token.
        reload()
    }

    private func report(_ error: Error) {
        let error = error as NSError
        if error.domain == NSURLErrorDomain && error.code == NSURLErrorCancelled { return }
        // WebKitErrorFrameLoadInterruptedByPolicyChange: downloads and refused loads.
        if error.domain == "WebKitErrorDomain" && error.code == 102 { return }
        presentation.hasChatInterface = false
        notify(KindredAPIClient.describe(error))
    }
}

extension WebSession: WKUIDelegate {
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        let url = navigationAction.request.url
        switch policy.decideNewWindow(url: url) {
        case .allow:
            if let url { webView.load(URLRequest(url: url)) }
        case .openExternally(let external):
            UIApplication.shared.open(external)
        case .download:
            if let url {
                webView.startDownload(using: URLRequest(url: url)) { [weak self] download in
                    download.delegate = self
                }
            }
        case .refuse(let reason):
            notify(reason.message)
        }
        return nil
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        guard isTrusted(frame.securityOrigin), let presenter = presenter() else {
            completionHandler()
            return
        }
        let alert = UIAlertController(title: origin.displayName, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        presenter.present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        guard isTrusted(frame.securityOrigin), let presenter = presenter() else {
            completionHandler(false)
            return
        }
        let alert = UIAlertController(title: origin.displayName, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
        presenter.present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        guard isTrusted(frame.securityOrigin), let presenter = presenter() else {
            completionHandler(nil)
            return
        }
        let alert = UIAlertController(title: origin.displayName, message: prompt, preferredStyle: .alert)
        alert.addTextField { $0.text = defaultText }
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(nil) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { [weak alert] _ in
            completionHandler(alert?.textFields?.first?.text ?? "")
        })
        presenter.present(alert, animated: true)
    }

    /// Camera and microphone (dictation, calls) for the server's own page only;
    /// iOS still shows its own permission prompt.
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(frame.isMainFrame && isTrusted(origin) ? .prompt : .deny)
    }
}

extension WebSession: WKDownloadDelegate {
    func download(_ download: WKDownload, willPerformHTTPRedirection response: HTTPURLResponse,
                  newRequest request: URLRequest,
                  decisionHandler: @escaping (WKDownload.RedirectPolicy) -> Void) {
        decisionHandler(policy.allowsDownload(from: request.url) ? .allow : .cancel)
    }

    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String,
                  completionHandler: @escaping (URL?) -> Void) {
        do {
            let folder = WebSession.downloadsFolder.appendingPathComponent(UUID().uuidString, isDirectory: true)
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            let destination = folder.appendingPathComponent(DownloadNaming.safeFilename(suggestedFilename))
            downloadDestinations[ObjectIdentifier(download)] = destination
            completionHandler(destination)
        } catch {
            completionHandler(nil)
            notify("Kindred couldn't prepare the download.")
        }
    }

    func downloadDidFinish(_ download: WKDownload) {
        guard let file = downloadDestinations.removeValue(forKey: ObjectIdentifier(download)) else { return }
        host?.webSession(self, didDownload: file)
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        downloadDestinations.removeValue(forKey: ObjectIdentifier(download))
        notify("The download didn't finish: \(KindredAPIClient.describe(error))")
    }
}
