import KindredCore
import SwiftUI
import UIKit
import WebKit
import XCTest
@testable import Kindred

/// Real app-hosted UIKit transitions, using production WebSession/WebContainerView
/// and the exact UI served by a disposable HTTPS fixture. No account or Keychain.
@MainActor
final class ComposerUIKitTests: XCTestCase, WebSessionHost {
    private var session: WebSession!
    private var window: UIWindow!
    private var previousWindow: UIWindow?
    private var delegate: LocalFixtureDelegate!
    private var keyboardFrame: CGRect = .zero
    private var keyboardShows = 0
    private var keyboardHides = 0
    private var observers: [NSObjectProtocol] = []

    override func setUp() async throws {
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        previousWindow = scene.windows.first(where: { $0.isKeyWindow })
        let origin = try XCTUnwrap(ServerOrigin(url: URL(string: "https://localhost:8765/")!))
        session = WebSession(account: Account(origin: origin, login: "composer-fixture"), token: "native-test-token-only", host: self)
        session.webView.stopLoading()
        delegate = LocalFixtureDelegate(session: session)
        session.webView.navigationDelegate = delegate
        session.webView.configuration.userContentController.addUserScript(WKUserScript(source: """
        window.__KINDRED_MOBILE=true; window.__KINDRED_MOBILE_PLATFORM='ios';
        window.__composerSends=[];
        const fixtureFetch=window.fetch.bind(window);
        window.fetch=(input,options={})=>{
          const url=new URL(typeof input==='string'?input:input.url,location.href);
          if(url.origin===location.origin && url.pathname==='/api/uploads' && options.method==='POST') {
            return Promise.resolve(new Response(JSON.stringify({id:'mobile-file',name:'notes.txt'}),{status:200,headers:{'Content-Type':'application/json'}}));
          }
          if(url.origin===location.origin && url.pathname==='/api/chats/dm-piper/messages' && options.method==='POST') {
            window.__composerSends.push(JSON.parse(options.body));
            return Promise.resolve(new Response(JSON.stringify({runs:[]}),{status:200,headers:{'Content-Type':'application/json'}}));
          }
          return fixtureFetch(input,options);
        };
        """, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        let root = NavigationStack {
            WebContainerView(session: session)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .principal) { Text("Composer fixture") }
                    ToolbarItem(placement: .topBarTrailing) { Button("Accounts") {} }
                }
        }
        window = UIWindow(windowScene: scene)
        window.rootViewController = UIHostingController(rootView: root)
        window.makeKeyAndVisible()
        observers.append(NotificationCenter.default.addObserver(forName: UIResponder.keyboardDidShowNotification, object: nil, queue: .main) { [weak self] note in
            MainActor.assumeIsolated {
                guard let self else { return }
                self.keyboardShows += 1
                self.keyboardFrame = (note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? NSValue)?.cgRectValue ?? .zero
            }
        })
        observers.append(NotificationCenter.default.addObserver(forName: UIResponder.keyboardDidHideNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.keyboardHides += 1 }
        })
        session.reload()
        try await waitFor("exact fixture UI and native geometry", timeout: 30) {
            try await self.boolean("!!document.querySelector('#prompt')?.getClientRects().length && !!document.querySelector('[data-message=\"1\"] [data-message-action=\"reply\"]') && !!window.__KINDRED_NATIVE_GEOMETRY && document.documentElement.hasAttribute('data-mobile')")
        }
        XCTAssertEqual(session.webView.url?.host, "localhost")
        XCTAssertEqual(session.webView.scrollView.contentInsetAdjustmentBehavior, .never)
        XCTAssertEqual(session.webView.scrollView.keyboardDismissMode, .interactive)
    }

    override func tearDown() async throws {
        // A failed landscape assertion must not contaminate the next test.
        window?.endEditing(true)
        if let scene = window?.windowScene, scene.interfaceOrientation.isLandscape {
            scene.requestGeometryUpdate(.iOS(interfaceOrientations: .portrait)) { error in
                XCTFail("Portrait cleanup failed: \(error)")
            }
            do {
                try await waitFor("portrait cleanup", timeout: 15) { scene.interfaceOrientation.isPortrait }
            } catch {
                // waitFor records the failure; still release the test window.
            }
        }
        observers.forEach { NotificationCenter.default.removeObserver($0) }
        observers.removeAll()
        session?.tearDown()
        window?.isHidden = true
        window?.rootViewController = nil
        previousWindow?.makeKeyAndVisible()
        delegate = nil
        session = nil
        window = nil
    }

    func testKeyboardOpenClosePreservesDraftAndToolbarAboveKeyboard() async throws {
        let draft = "Native draft\nSecond line\nThird line"
        _ = try await js("const p=document.querySelector('#prompt');p.textContent='Native draft\\nSecond line\\nThird line';p.dispatchEvent(new InputEvent('input',{bubbles:true}));p.focus();true")
        try await waitFor("actual UIKit software keyboard didShow") { self.keyboardShows > 0 && self.keyboardFrame.height > 100 }
        try await waitFor("SwiftUI host above actual keyboard") {
            self.session.webView.convert(self.session.webView.bounds, to: self.window).maxY <= self.window.convert(self.keyboardFrame, from: nil).minY + 2
        }
        try await checkComposer(label: "keyboard-open")
        _ = try await js("document.querySelector('[data-message=\"1\"] [data-message-action=\"reply\"]').click();const dt=new DataTransfer();dt.items.add(new File(['Fixture attachment'], 'notes.txt',{type:'text/plain'}));const f=document.querySelector('input[type=file]');f.files=dt.files;f.dispatchEvent(new Event('change',{bubbles:true}));true")
        try await waitFor("real reply and attachment rows") {
            try await self.boolean("!!document.querySelector('[aria-label=\"Remove notes.txt\"]') && document.querySelector('#composer-reply').getClientRects().length>0")
        }
        _ = try await js("document.querySelector('#prompt').focus();true")
        try await checkComposer(label: "keyboard-reply-attachment")
        let retainedDraft = try await js("document.querySelector('#prompt').textContent") as? String
        XCTAssertEqual(retainedDraft, draft)
        _ = try await js("document.querySelector('#prompt').blur();true")
        try await waitFor("actual UIKit keyboard didHide") { self.keyboardHides > 0 }
        try await checkComposer(label: "keyboard-closed")
        let closedDraft = try await js("document.querySelector('#prompt').textContent") as? String
        XCTAssertEqual(closedDraft, draft)
        _ = try await js("document.querySelector('#send').click();true")
        try await waitFor("one fixture send") { try await self.boolean("window.__composerSends.length===1 && document.querySelector('#prompt').textContent==='' ") }
        let sentDraft = try await js("window.__composerSends[0].prompt") as? String
        XCTAssertEqual(sentDraft, draft)
    }

    func testOrientationSafeAreaAndTextSizePreserveDraft() async throws {
        _ = try await js("const p=document.querySelector('#prompt');p.textContent='Rotation draft';p.dispatchEvent(new InputEvent('input',{bubbles:true}));true")
        let scene = try XCTUnwrap(window.windowScene)
        var rotationFailure: Error?
        window.rootViewController?.setNeedsUpdateOfSupportedInterfaceOrientations()
        scene.requestGeometryUpdate(.iOS(interfaceOrientations: .landscapeLeft)) { rotationFailure = $0 }
        try await waitFor("actual UIWindowScene landscape", timeout: 15) { scene.interfaceOrientation.isLandscape }
        XCTAssertNil(rotationFailure)
        try await waitFor("native geometry reconciles after rotation") {
            try await self.boolean("window.__KINDRED_NATIVE_GEOMETRY.windowWidth>window.__KINDRED_NATIVE_GEOMETRY.windowHeight")
        }
        _ = try await js("window.__KINDRED_SYSTEM_TEXT_SCALE=1.5;window.dispatchEvent(new CustomEvent('kindred-system-text-size',{detail:{scale:1.5}}));true")
        try await checkComposer(label: "landscape-150")
        let rotatedDraft = try await js("document.querySelector('#prompt').textContent") as? String
        XCTAssertEqual(rotatedDraft, "Rotation draft")
        scene.requestGeometryUpdate(.iOS(interfaceOrientations: .portrait)) { rotationFailure = $0 }
        try await waitFor("actual UIWindowScene portrait", timeout: 15) { scene.interfaceOrientation.isPortrait }
        XCTAssertNil(rotationFailure)
        try await waitFor("native portrait geometry") {
            try await self.boolean("window.__KINDRED_NATIVE_GEOMETRY.windowHeight>window.__KINDRED_NATIVE_GEOMETRY.windowWidth")
        }
        try await checkComposer(label: "portrait-150")
        let sends = try await js("window.__composerSends.length") as? Int
        XCTAssertEqual(sends, 0)
    }

    private func js(_ source: String) async throws -> Any? {
        try await session.webView.evaluateJavaScript(source)
    }
    private func boolean(_ source: String) async throws -> Bool { try await js(source) as? Bool == true }
    private func waitFor(_ label: String, timeout: TimeInterval = 12, predicate: () async throws -> Bool) async throws {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if try await predicate() { return }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        XCTFail("Missing native evidence: \(label)")
        throw NSError(domain: "ComposerUIKitTests", code: 1, userInfo: [NSLocalizedDescriptionKey: label])
    }

    private func checkComposer(label: String) async throws {
        // Wait for the real host's geometry bridge, not a fixed rendering delay.
        let expectedWidth = Double(session.webView.bounds.width)
        let expectedHeight = Double(session.webView.bounds.height)
        try await waitFor("native host geometry for " + label) {
            try await self.boolean("Math.abs(window.__KINDRED_NATIVE_GEOMETRY.width-\(expectedWidth))<2 && Math.abs(window.__KINDRED_NATIVE_GEOMETRY.height-\(expectedHeight))<2")
        }
        let source = """
        (()=>{const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};
        const c=document.querySelector('#composer'),p=document.querySelector('#prompt');
        const reply=document.querySelector('#composer-reply'),files=document.querySelector('.composer-files');
        return {composer:rect(c),prompt:rect(p),reply:reply?.getClientRects().length?rect(reply):null,files:files?.getClientRects().length?rect(files):null,viewport:{width:innerWidth,height:innerHeight},native:window.__KINDRED_NATIVE_GEOMETRY,
        controls:[...c.querySelectorAll('#composer-actions,#send,.dictation-button,.dictation-cancel')].filter(b=>b.getClientRects().length).map(b=>{const r=rect(b),h=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {...r,hit:h===b||b.contains(h)}})}})()
        """
        let rawMetrics = try await js(source)
        var metrics = try XCTUnwrap(rawMetrics as? [String: Any])
        metrics["keyboardNotifications"] = ["shows": keyboardShows, "hides": keyboardHides]
        metrics["keyboardFrame"] = ["x": keyboardFrame.minX, "y": keyboardFrame.minY, "width": keyboardFrame.width, "height": keyboardFrame.height]
        let c = try XCTUnwrap(metrics["composer"] as? [String: Double])
        let p = try XCTUnwrap(metrics["prompt"] as? [String: Double])
        let controls = try XCTUnwrap(metrics["controls"] as? [[String: Any]])
        XCTAssertGreaterThanOrEqual(controls.count, 2)
        XCTAssertGreaterThanOrEqual(p["height"] ?? 0, 24)
        if let reply = metrics["reply"] as? [String: Double], let files = metrics["files"] as? [String: Double] {
            XCTAssertLessThanOrEqual(reply["bottom"] ?? .infinity, (files["y"] ?? 0) + 1)
            XCTAssertLessThanOrEqual(files["bottom"] ?? .infinity, (p["y"] ?? 0) + 1)
        }
        for b in controls {
            XCTAssertGreaterThanOrEqual((b["width"] as? Double) ?? 0, 44)
            XCTAssertGreaterThanOrEqual((b["height"] as? Double) ?? 0, 44)
            XCTAssertEqual(b["hit"] as? Bool, true)
            XCTAssertGreaterThanOrEqual((b["x"] as? Double) ?? -1, c["x"] ?? 0)
            XCTAssertLessThanOrEqual((b["right"] as? Double) ?? .infinity, c["right"] ?? 0)
            XCTAssertLessThanOrEqual((b["bottom"] as? Double) ?? .infinity, c["bottom"] ?? 0)
        }
        let native = try XCTUnwrap(metrics["native"] as? [String: Any])
        let safe = try XCTUnwrap(native["safeArea"] as? [String: Double])
        XCTAssertEqual(safe["bottom"] ?? -1, Double(window.safeAreaInsets.bottom), accuracy: 2)
        XCTAssertEqual(safe["top"] ?? -1, Double(window.safeAreaInsets.top), accuracy: 2)
        XCTAssertEqual(safe["left"] ?? -1, Double(window.safeAreaInsets.left), accuracy: 2)
        XCTAssertEqual(safe["right"] ?? -1, Double(window.safeAreaInsets.right), accuracy: 2)
        let json = try JSONSerialization.data(withJSONObject: metrics, options: [.prettyPrinted, .sortedKeys])
        let attachment = XCTAttachment(data: json, uniformTypeIdentifier: "public.json")
        attachment.name = label + "-actual-UIKit-geometry"
        attachment.lifetime = .keepAlways
        add(attachment)
        let image = UIGraphicsImageRenderer(bounds: window.bounds).image { _ in window.drawHierarchy(in: window.bounds, afterScreenUpdates: true) }
        let screenshot = XCTAttachment(image: image)
        screenshot.name = label
        screenshot.lifetime = .keepAlways
        add(screenshot)
    }

    func webSession(_ session: WebSession, didReceive message: SessionMessage) {}
    func webSessionRequestedAccounts(_ session: WebSession) {}
    func webSession(_ session: WebSession, show message: String, isError: Bool) {}
    func webSession(_ session: WebSession, didDownload file: URL) {}
}

/// Test-only TLS acceptance for the disposable loopback certificate. Production
/// navigation policy is forwarded unchanged; no product trust/ATS setting changes.
@MainActor
private final class LocalFixtureDelegate: NSObject, WKNavigationDelegate {
    let session: WebSession
    init(session: WebSession) { self.session = session }
    func webView(_ webView: WKWebView, didReceive challenge: URLAuthenticationChallenge,
                 completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        guard challenge.protectionSpace.host == "localhost", challenge.protectionSpace.port == 8765,
              challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
              let trust = challenge.protectionSpace.serverTrust else {
            completionHandler(.cancelAuthenticationChallenge, nil); return
        }
        completionHandler(.useCredential, URLCredential(trust: trust))
    }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        session.webView(webView, decidePolicyFor: action, decisionHandler: decisionHandler)
    }
    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        session.webView(webView, decidePolicyFor: response, decisionHandler: decisionHandler)
    }
    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) { session.webView(webView, didStartProvisionalNavigation: navigation) }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { session.webView(webView, didFinish: navigation) }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { session.webView(webView, didFailProvisionalNavigation: navigation, withError: error) }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { session.webView(webView, didFail: navigation, withError: error) }
}
