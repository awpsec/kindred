import KindredCore
import Observation
import UIKit
import WebKit

/// WebKit forwards its focused editor's accessory view to this public property.
/// Keep the system keyboard and editing tools, without the browser form toolbar.
@MainActor
final class KindredWebView: WKWebView {
    override var inputAccessoryView: UIView? { nil }
}

@MainActor
@Observable
final class WebPresentationState {
    var hasChatInterface = false
    var hasLoadedChats = false
    var canvas = UIColor(named: "Canvas") ?? .systemBackground
    var isDark: Bool?
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
/// The page gets exactly two message handlers (session rotation and native
/// presentation), accepted only from the main frame of the exact origin. There is
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
    private var conversationTarget: ConversationMenuTarget?
    private weak var nativeMenuAlert: UIAlertController?
    private var layoutTop: CGFloat = 0
    private var layoutBottom: CGFloat = 0
    private var layoutIsSlab = false
    private var layoutHeight: CGFloat = 0
    private var layoutIsPortrait = true
    private var computerInputWanted = false
    private var computerFocusPending = false
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
        configuration.ignoresViewportScaleLimits = false
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
        configuration.applicationNameForUserAgent = "KindredMobile/" + version
        webView = KindredWebView(frame: .zero, configuration: configuration)
        super.init()
        // Match a saved explicit appearance before the first web frame arrives.
        if let saved = CachedWebAppearance.load(accountID: account.id), !saved.followsSystem {
            presentation.canvas = saved.color
            presentation.isDark = saved.isDark
        }

        let controller = webView.configuration.userContentController
        let proxy = ScriptMessageProxy(session: self)
        controller.add(proxy, contentWorld: .page, name: WebSession.sessionHandler)
        controller.add(proxy, contentWorld: .page, name: WebSession.accountsHandler)
        installBootstrap(token: token)

        let interaction = UIContextMenuInteraction(delegate: self)
        webView.addInteraction(interaction)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = false
        webView.allowsLinkPreview = false
        webView.isOpaque = false
        webView.overrideUserInterfaceStyle = presentation.isDark.map { $0 ? .dark : .light } ?? .unspecified
        webView.backgroundColor = presentation.canvas
        webView.underPageBackgroundColor = presentation.canvas
        // The page handles hardware padding and WebKit's visible viewport.
        // Letting the scroll view add safe-area insets would count them twice.
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
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "—"
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "—"
        let revision = Bundle.main.object(forInfoDictionaryKey: "KindredSourceRevision") as? String ?? ""
        let versionLabel = "iOS " + version + " (" + build + ")" + (revision.isEmpty ? "" : " · " + String(revision.prefix(8)))
        let hasPushSigning = APNsEnvironment(configurationValue: Bundle.main.object(forInfoDictionaryKey: "KindredAPNsEnvironment") as? String) != nil
        let source = WebBootstrap.documentStartScript(origin: origin, token: token, profileID: profileID) + """
        ;(() => {
          if (window.top !== window.self || location.origin !== \(WebBootstrap.javaScriptString(origin.serialized))) return;
          window.__KINDRED_IOS_APP_VERSION = \(WebBootstrap.javaScriptString(versionLabel));
          window.__KINDRED_IOS_PUSH_AVAILABLE = \(hasPushSigning ? "true" : "false");
          const appearance = \(WebBootstrap.javaScriptString(presentation.isDark.map { $0 ? "dark" : "light" } ?? "system"));
          if (appearance !== 'system') document.documentElement.dataset.theme = appearance;
          // iPhone keyboard dictation owns speech input. Reset only this account's
          // isolated WebKit speech preference before the server module reads it.
          try {
            const key = 'kindred-dictation-v1';
            const saved = JSON.parse(localStorage.getItem(key) || '{}');
            localStorage.setItem(key, JSON.stringify({...saved, enabled:false, model:''}));
          } catch { localStorage.removeItem('kindred-dictation-v1'); }
        })();
        """
        controller.addUserScript(WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true, in: .page))
        // Bundle the presentation layer so an older server still fits an iPhone.
        // The same exact-origin check as the session bootstrap scopes this script.
        if let cssURL = Bundle.main.url(forResource: "MobileLayout", withExtension: "css"),
           let jsURL = Bundle.main.url(forResource: "MobileLayout", withExtension: "js"),
           let css = try? String(contentsOf: cssURL, encoding: .utf8),
           let js = try? String(contentsOf: jsURL, encoding: .utf8) {
            let messageGestures = Bundle.main.url(forResource: "mobile-messages", withExtension: "js")
                .flatMap { try? String(contentsOf: $0, encoding: .utf8) } ?? ""
            let layout = """
            (function () {
              if (window.top !== window.self || window.location.origin !== \(WebBootstrap.javaScriptString(origin.serialized))) return;
              const style = document.createElement('style');
              style.textContent = \(WebBootstrap.javaScriptString(css));
              document.head.append(style);
              \(messageGestures)
              \(js)
            })();
            """
            controller.addUserScript(WKUserScript(source: layout, injectionTime: .atDocumentEnd, forMainFrameOnly: true, in: .page))
        }
    }

    /// Presentation values only, delivered to the trusted main frame. The host
    /// extends behind system chrome while WebKit avoids the keyboard.
    func updateLayout(topInset: CGFloat, bottomInset: CGFloat, isSlab: Bool, viewportHeight: CGFloat = 0, isPortrait: Bool = true) {
        guard layoutTop != topInset || layoutBottom != bottomInset || layoutIsSlab != isSlab || layoutHeight != viewportHeight || layoutIsPortrait != isPortrait else { return }
        layoutTop = topInset
        layoutBottom = bottomInset
        layoutIsSlab = isSlab
        layoutHeight = viewportHeight
        layoutIsPortrait = isPortrait
        publishLayout()
    }

    private func publishLayout() {
        guard origin.matches(webView.url) else { return }
        let script = """
        if (window.top !== window.self || location.origin !== expectedOrigin) return;
        window.__KINDRED_IOS_LAYOUT = {topInset, bottomInset, isSlab, viewportHeight, isPortrait};
        window.dispatchEvent(new CustomEvent('kindred-ios-layout', {detail: window.__KINDRED_IOS_LAYOUT}));
        """
        webView.callAsyncJavaScript(script, arguments: ["expectedOrigin": origin.serialized,
            "topInset": Double(layoutTop), "bottomInset": Double(layoutBottom), "isSlab": layoutIsSlab,
            "viewportHeight": Double(layoutHeight), "isPortrait": layoutIsPortrait], in: nil, in: .page) { _ in }
    }

    func computerHostAttachmentChanged() {
        ComputerOrientation.shared.update(webView: webView, active: computerInputWanted && webView.window != nil)
    }

    func restoreComputerKeyboard(force: Bool = false) {
        guard computerInputWanted, layoutIsPortrait, webView.window != nil,
              UIApplication.shared.applicationState == .active, origin.matches(webView.url), !computerFocusPending else { return }
        computerFocusPending = true
        webView.evaluateJavaScript("window.__kindredComputerInput?.focus(\(force ? "true" : "false"))") { [weak self] _, _ in
            self?.computerFocusPending = false
        }
    }

    private func setComputerInput(_ enabled: Bool) {
        computerInputWanted = enabled
        webView.scrollView.keyboardDismissMode = enabled ? .none : .interactive
        computerHostAttachmentChanged()
        if enabled { restoreComputerKeyboard() }
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
            if let body = message.body as? [String: Any], body["action"] as? String == "computer-input",
               let enabled = body["enabled"] as? Bool {
                setComputerInput(enabled)
                return
            }
            if let body = message.body as? [String: Any], body["action"] as? String == "computer-keyboard" {
                restoreComputerKeyboard(force: true)
                return
            }
            if let body = message.body as? [String: Any], body["action"] as? String == "notification-settings" {
                if APNsEnvironment(configurationValue: Bundle.main.object(forInfoDictionaryKey: "KindredAPNsEnvironment") as? String) == nil {
                    host?.webSession(self, show: "Background notifications require Apple Developer Program push signing. This free Personal Team build cannot receive them.", isError: false)
                } else { host?.webSessionRequestedAccounts(self) }
                return
            }
            if let body = message.body as? [String: Any], body["action"] as? String == "native-menu" {
                if let menu = NativeActionMenu(body: body) { presentNativeMenu(menu) }
                return
            }
            if let body = message.body as? [String: Any], body["action"] as? String == "conversation-target" {
                conversationTarget = ConversationMenuTarget(body: body)
                return
            }
            if let body = message.body as? [String: Any], body["action"] as? String == "message-target" {
                conversationTarget = ConversationMenuTarget(body: body, kind: .message)
                return
            }
            if let body = message.body as? [String: Any], body["action"] as? String == "artifact-target" {
                conversationTarget = ConversationMenuTarget(body: body, kind: .artifact)
                return
            }
            if let body = message.body as? [String: Any], body["action"] as? String == "message-target-clear" {
                if conversationTarget?.kind == .message { conversationTarget = nil }
                return
            }
            if let body = message.body as? [String: Any], body["action"] as? String == "conversation-target-clear" {
                conversationTarget = nil
                return
            }
            if let body = message.body as? [String: Any], body["action"] as? String == "launch-ready" {
                presentation.hasLoadedChats = true
                return
            }
            if let body = message.body as? [String: Any], body["action"] as? String == "interface-ready" {
                presentation.hasChatInterface = true
                publishLayout()
                return
            }
            if let body = message.body as? [String: Any], body["action"] as? String == "appearance",
               let rgb = body["rgb"] as? [Double], rgb.count == 3,
               rgb.allSatisfy({ $0.isFinite && (0...255).contains($0) }) {
                let color = UIColor(red: rgb[0] / 255, green: rgb[1] / 255, blue: rgb[2] / 255, alpha: 1)
                if body["appearanceKnown"] as? Bool == true {
                    CachedWebAppearance(rgb: rgb, followsSystem: body["followsSystem"] as? Bool == true).save(accountID: accountID)
                }
                presentation.canvas = color
                presentation.isDark = body["followsSystem"] as? Bool == true ? nil : (rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722) < 128
                webView.overrideUserInterfaceStyle = presentation.isDark.map { $0 ? .dark : .light } ?? .unspecified
                webView.backgroundColor = color
                webView.underPageBackgroundColor = color
                webView.superview?.backgroundColor = color
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
        setComputerInput(false)
        // Keep established web navigation in charge while a route/reload starts.
        // Clearing this flag briefly restores the native account toolbar above
        // artifacts. A real page failure still restores recovery controls.
        presentation.hasLoadedChats = false
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

/// Presentation-only data from the trusted main frame. Action IDs are opaque;
/// the page retains the existing closures and validates their current context.
struct NativeActionMenu {
    struct Item {
        let title: String
        let id: String?
        let children: [Item]
        let disabled: Bool
        let selected: Bool
        let destructive: Bool

        init?(body: [String: Any], depth: Int = 0) {
            guard depth <= 2, let title = body["title"] as? String,
                  !title.isEmpty, title.count <= 100 else { return nil }
            self.title = title
            disabled = body["disabled"] as? Bool == true
            selected = body["selected"] as? Bool == true
            destructive = body["destructive"] as? Bool == true
            if let values = body["children"] as? [[String: Any]] {
                guard !values.isEmpty, values.count <= 40 else { return nil }
                let parsed = values.compactMap { Item(body: $0, depth: depth + 1) }
                guard parsed.count == values.count else { return nil }
                children = parsed; id = nil
            } else {
                guard let value = body["id"] as? String, !value.isEmpty, value.utf8.count <= 64 else { return nil }
                id = value; children = []
            }
        }
    }
    let key: String
    let title: String
    let rect: CGRect
    let items: [Item]

    init?(body: [String: Any]) {
        guard let target = ConversationMenuTarget(body: body),
              let values = body["items"] as? [[String: Any]], !values.isEmpty, values.count <= 40 else { return nil }
        let parsed = values.compactMap { Item(body: $0) }
        guard parsed.count == values.count else { return nil }
        key = target.key; rect = target.rect; items = parsed
        title = String((body["title"] as? String ?? "").prefix(100))
    }
}

extension WebSession {
    func nativeMenuSheet(_ menu: NativeActionMenu, items: [NativeActionMenu.Item]? = nil,
                         title: String? = nil) -> UIAlertController {
        let heading = title ?? menu.title
        let alert = UIAlertController(title: heading.isEmpty ? nil : heading, message: nil, preferredStyle: .actionSheet)
        alert.overrideUserInterfaceStyle = webView.overrideUserInterfaceStyle
        for item in items ?? menu.items {
            let label = (item.selected ? "✓ " : "") + item.title
            let action = UIAlertAction(title: label, style: item.destructive ? .destructive : .default) { [weak self, weak alert] _ in
                guard let self, self.origin.matches(self.webView.url) else { return }
                // Finish native dismissal before a file picker, submenu, or
                // server dialog opens. Never leave two presentations stacked.
                alert?.dismiss(animated: true) {
                    if !item.children.isEmpty {
                        self.presentNativeMenu(menu, items: item.children, title: item.title)
                    } else if let id = item.id {
                        self.webView.callAsyncJavaScript("window.__kindredNativeMenus?.perform(id);",
                            arguments:["id":id], in:nil, in:.page) { _ in }
                    }
                }
            }
            action.isEnabled = !item.disabled
            alert.addAction(action)
        }
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { [weak self] _ in
            self?.webView.callAsyncJavaScript("window.__kindredNativeMenus?.cancel(key);",
                arguments:["key":menu.key], in:nil, in:.page) { _ in }
        })
        if let popover = alert.popoverPresentationController {
            popover.sourceView = webView
            let anchor = menu.rect.intersection(webView.bounds)
            popover.sourceRect = anchor.isNull ? CGRect(x:webView.bounds.midX, y:webView.bounds.midY, width:1, height:1) : anchor
        }
        return alert
    }

    private func presentNativeMenu(_ menu: NativeActionMenu, items: [NativeActionMenu.Item]? = nil, title: String? = nil) {
        guard origin.matches(webView.url), webView.window != nil else { return }
        if let current = nativeMenuAlert, current.presentingViewController != nil {
            current.dismiss(animated:true) { [weak self] in self?.presentNativeMenu(menu, items:items, title:title) }
            return
        }
        guard let presenter = presenter(), !(presenter is UIAlertController) else { return }
        let alert = nativeMenuSheet(menu, items:items, title:title)
        nativeMenuAlert = alert
        presenter.present(alert, animated:true)
    }
}

/// Bounded presentation data from the trusted main frame; never URLs or code.
struct ConversationMenuTarget {
    enum Kind: String { case conversation, message, artifact }
    let kind: Kind
    let key: String
    let rect: CGRect
    let receivedAt = ProcessInfo.processInfo.systemUptime

    init?(body: [String: Any], kind: Kind = .conversation) {
        guard let key = body["key"] as? String, !key.isEmpty, key.utf8.count <= 200,
              let values = body["rect"] as? [Double], values.count == 4,
              values.allSatisfy({ $0.isFinite && abs($0) <= 10000 }), values[2] > 0, values[3] > 0 else { return nil }
        self.key = key
        self.kind = kind
        rect = CGRect(x: values[0], y: values[1], width: values[2], height: values[3])
    }
}

extension WebSession: UIContextMenuInteractionDelegate {
    func contextMenuInteraction(_ interaction: UIContextMenuInteraction,
                                configurationForMenuAtLocation location: CGPoint) -> UIContextMenuConfiguration? {
        guard origin.matches(webView.url), let target = conversationTarget,
              ProcessInfo.processInfo.systemUptime - target.receivedAt < 2,
              target.rect.contains(location) else { return nil }
        return UIContextMenuConfiguration(identifier: target.key as NSString, previewProvider: nil) { [weak self] _ in
            let deferred = UIDeferredMenuElement.uncached { completion in
                guard let self, self.origin.matches(self.webView.url) else { completion([]); return }
                self.webView.callAsyncJavaScript("return kind === 'message' ? window.__kindredMobileMessages?.describe(key) : kind === 'artifact' ? window.__kindredNativeMenus?.describeArtifact(key) : window.__kindredConversationMenu?.describe(key);",
                    arguments: ["key": target.key, "kind":target.kind.rawValue], in: nil, in: .page) { [weak self] result in
                    guard let self, self.origin.matches(self.webView.url), case .success(let value) = result,
                          let object = value as? [String: Any], let items = object["items"] as? [[String: Any]] else { completion([]); return }
                    completion(self.conversationMenuElements(items, kind: target.kind))
                }
            }
            return UIMenu(children: [deferred])
        }
    }

    /// Render fixed menu data with UIKit. Selecting an opaque action ID invokes
    /// its existing page button, with no general native-execution bridge.
    func conversationMenuElements(_ items: [[String: Any]], kind: ConversationMenuTarget.Kind = .conversation, depth: Int = 0) -> [UIMenuElement] {
        guard depth <= 1, items.count <= 20 else { return [] }
        return items.compactMap { item in
            guard let title = item["title"] as? String, !title.isEmpty, title.count <= 100 else { return nil }
            if let children = item["children"] as? [[String: Any]], depth == 0 {
                return UIMenu(title: title, image: UIImage(systemName: kind == .message ? "face.smiling" : "bell.slash"), children: conversationMenuElements(children, kind: kind, depth: 1))
            }
            guard let id = item["id"] as? String, id.utf8.count <= 64, !id.isEmpty else { return nil }
            let symbol: String?
            switch title {
            case "Reply": symbol = "arrowshape.turn.up.left"
            case "Copy message": symbol = "doc.on.doc"
            case "Edit queued message": symbol = "pencil"
            case "Pin", "Pin artifact": symbol = "pin"
            case "Unpin", "Unpin artifact": symbol = "pin.slash"
            case "Move to folder": symbol = "folder"
            case "Details": symbol = "info.circle"
            case "Edit bot", "Rename": symbol = "pencil"
            case "Instructions": symbol = "doc.text"
            case "Memory": symbol = "brain"
            case "Chat settings": symbol = "gearshape"
            case "Unmute": symbol = "bell"
            case "Archive bot", "Archive chat": symbol = "archivebox"
            default: symbol = nil
            }
            var attributes: UIMenuElement.Attributes = []
            if item["disabled"] as? Bool == true { attributes.insert(.disabled) }
            if item["destructive"] as? Bool == true { attributes.insert(.destructive) }
            return UIAction(title: title, image: symbol.flatMap(UIImage.init(systemName:)), attributes:attributes, state: item["selected"] as? Bool == true ? .on : .off) { [weak self] _ in
                guard let self, self.origin.matches(self.webView.url) else { return }
                self.webView.callAsyncJavaScript("if (kind === 'message') window.__kindredMobileMessages?.perform(id); else if (kind === 'artifact') window.__kindredNativeMenus?.perform(id); else window.__kindredConversationMenu?.perform(id);",
                    arguments: ["id": id, "kind":kind.rawValue], in: nil, in: .page) { _ in }
            }
        }
    }

    func contextMenuInteraction(_ interaction: UIContextMenuInteraction,
                                previewForHighlightingMenuWithConfiguration configuration: UIContextMenuConfiguration) -> UITargetedPreview? {
        guard let target = conversationTarget,
              let snapshot = webView.resizableSnapshotView(from: target.rect, afterScreenUpdates: false, withCapInsets: .zero) else { return nil }
        let parameters = UIPreviewParameters()
        parameters.backgroundColor = presentation.canvas
        parameters.visiblePath = UIBezierPath(roundedRect: CGRect(origin: .zero, size: target.rect.size), cornerRadius: 12)
        return UITargetedPreview(view: snapshot, parameters: parameters,
            target: UIPreviewTarget(container: webView, center: CGPoint(x: target.rect.midX, y: target.rect.midY)))
    }

    func contextMenuInteraction(_ interaction: UIContextMenuInteraction,
                                willEndFor configuration: UIContextMenuConfiguration, animator: UIContextMenuInteractionAnimating?) {
        // UIKit may end its animation before the selected page action runs.
        // Its next describe() replaces old closures; do not clear a pending action.
        conversationTarget = nil
    }
}

/// Public appearance preference only; no credentials or page content. Cache the
/// account's last known theme for cold launch before the server responds.
struct CachedWebAppearance: Codable {
    let rgb: [Double]
    let followsSystem: Bool
    var isDark: Bool { (rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722) < 128 }
    var color: UIColor { UIColor(red: rgb[0] / 255, green: rgb[1] / 255, blue: rgb[2] / 255, alpha: 1) }
    private static func location(accountID: UUID) -> URL? {
        guard let support = try? FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true) else { return nil }
        return support.appendingPathComponent("Kindred/Appearance", isDirectory: true).appendingPathComponent(accountID.uuidString + ".json")
    }
    static func load(accountID: UUID) -> Self? {
        guard let url = location(accountID: accountID), let data = try? Data(contentsOf: url),
              let saved = try? JSONDecoder().decode(Self.self, from: data), saved.rgb.count == 3,
              saved.rgb.allSatisfy({ $0.isFinite && (0...255).contains($0) }) else { return nil }
        return saved
    }
    static func clear(accountID: UUID) {
        if let url = location(accountID: accountID) { try? FileManager.default.removeItem(at: url) }
    }
    func save(accountID: UUID) {
        guard let url = Self.location(accountID: accountID), let data = try? JSONEncoder().encode(self) else { return }
        try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
}
