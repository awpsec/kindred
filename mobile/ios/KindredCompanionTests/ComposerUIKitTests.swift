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
    private var keyboardVisible = false
    private var observers: [NSObjectProtocol] = []
    private var layoutEvidence: [String: Any] = [:]

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
                self.keyboardVisible = true
                self.keyboardFrame = (note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? NSValue)?.cgRectValue ?? .zero
            }
        })
        observers.append(NotificationCenter.default.addObserver(forName: UIResponder.keyboardDidHideNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.keyboardHides += 1; self?.keyboardVisible = false }
        })
        // The initializer's load was stopped before this delegate and fixture
        // script were installed. Its pending URL is not a committed document
        // to reload; issue one fresh request after the host is attached.
        session.webView.load(URLRequest(url: origin.rootURL))
        try await waitFor("exact fixture UI and native geometry", timeout: 30) {
            try await self.boolean("!!document.querySelector('#prompt')?.getClientRects().length && !!document.querySelector('[data-message=\"1\"] [data-message-action=\"reply\"]') && !!window.__KINDRED_NATIVE_GEOMETRY && document.documentElement.hasAttribute('data-mobile')")
        }
        XCTAssertEqual(session.webView.url?.host, "localhost")
        XCTAssertEqual(session.webView.scrollView.contentInsetAdjustmentBehavior, .never)
        XCTAssertEqual(session.webView.scrollView.keyboardDismissMode, .interactive)
        // Bind the fixture's exact shared candidate, not a stale connected UI.
        _ = try await js("fetch('/fixture/ready').then(r=>r.json()).then(m=>{window.__sendSurfaceFixture=m.ui_sha256}).catch(()=>{window.__sendSurfaceFixture=null});true")
        try await waitFor("exact Send candidate UI manifest") {
            try await self.boolean("window.__sendSurfaceFixture?.['style.css']==='d671527d986778cbfb9b2549de4d8fc6f60b4830623c18ba07aaaf4012d70424' && window.__sendSurfaceFixture?.['app.js']==='68dac6db2dc2562759ed718c9beab36fa77a94a0e4bff97efc22c0e82cc16c7f'")
        }
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
        try await checkSendSurfaceMatrix()
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
            do {
                if try await predicate() { return }
            } catch {
                await recordFailureEvidence(label)
                throw error
            }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        await recordFailureEvidence(label)
        XCTFail("Missing native evidence: \(label)")
        throw NSError(domain: "ComposerUIKitTests", code: 1, userInfo: [NSLocalizedDescriptionKey: label])
    }

    private func recordFailureEvidence(_ label: String) async {
        // Diagnose the failed condition without reading tokens, storage values,
        // input contents or account data. Failure evidence never counts as a
        // successful keyboard/orientation phase in the runner's acceptance gate.
        var evidence: [String: Any] = ["condition": label,
            "navigation": delegate?.milestones ?? [],
            "nativeLoadFailed": session?.loadState.failure != nil,
            "webViewLoading": session?.webView.isLoading ?? false,
            "estimatedProgress": session?.webView.estimatedProgress ?? 0]
        if !layoutEvidence.isEmpty { evidence["layoutTransition"] = layoutEvidence }
        if let url = session?.webView.url {
            evidence["url"] = ["scheme": url.scheme ?? "", "host": url.host ?? "",
                "port": url.port ?? 0, "path": url.path] as [String: Any]
        }
        let pageScript = """
            (()=>{const p=document.querySelector('#prompt');let sessionPresent=null,storageReadable=true;
              try {sessionPresent=!!sessionStorage.getItem('kindred-token')} catch {storageReadable=false}
              return {
              readyState:document.readyState,promptExists:!!p,promptVisible:!!p?.getClientRects().length,
              replyExists:!!document.querySelector('[data-message="1"] [data-message-action="reply"]'),
              geometry:window.__KINDRED_NATIVE_GEOMETRY??null,
              mobile:document.documentElement.hasAttribute('data-mobile'),
              bootstrap:window.__KINDRED_NATIVE_SESSION_BOOTSTRAP===true,
              fixtureScript:Array.isArray(window.__composerSends),
              sessionPresent,storageReadable,
              startupFailed:window.__KINDRED_STARTUP?.failed===true,
              startupVisible:!!document.querySelector('#startup-status')?.getClientRects().length
            }})()
            """
        if let window {
            evidence["window"] = ["width": window.bounds.width, "height": window.bounds.height,
                "safeArea": ["top": window.safeAreaInsets.top, "bottom": window.safeAreaInsets.bottom,
                    "left": window.safeAreaInsets.left, "right": window.safeAreaInsets.right]] as [String: Any]
            let image = UIGraphicsImageRenderer(bounds: window.bounds).image { _ in
                window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
            }
            let screenshot = XCTAttachment(image: image)
            screenshot.name = "failure-actual-UIKit"
            screenshot.lifetime = .keepAlways
            add(screenshot)
        }
        evidence.merge(await boundedFailurePage(pageScript)) { _, new in new }
        if let json = try? JSONSerialization.data(withJSONObject: evidence, options: [.prettyPrinted, .sortedKeys]) {
            let attachment = XCTAttachment(data: json, uniformTypeIdentifier: "public.json")
            attachment.name = "failure-actual-UIKit-readiness"
            attachment.lifetime = .keepAlways
            add(attachment)
        }
    }

    private func boundedFailurePage(_ source: String) async -> [String: Any] {
        await withCheckedContinuation { continuation in
            let probe = FailurePageProbe(continuation)
            let timeout = Task { @MainActor in
                do { try await Task.sleep(nanoseconds: 2_000_000_000) }
                catch { return }
                probe.finish(["javascriptTimeout": true])
            }
            session.webView.evaluateJavaScript(source) { value, error in
                timeout.cancel()
                if let error {
                    let failure = error as NSError
                    probe.finish(["javascriptFailure": ["domain": failure.domain,
                        "code": failure.code] as [String: Any]])
                } else {
                    probe.finish(["page": value ?? NSNull()])
                }
            }
        }
    }

    @discardableResult
    private func checkComposer(label: String) async throws -> (metrics: [String: Any], image: UIImage) {
        // A native bridge update precedes WebKit's applied CSS viewport in
        // some transitions. Require applied shell shape, never eventual hits.
        let source = """
        (()=>{const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};
        const c=document.querySelector('#composer'),p=document.querySelector('#prompt');
        const reply=document.querySelector('#composer-reply'),files=document.querySelector('.composer-files');
        const send=document.querySelector('#send'),surface=getComputedStyle(send,'::before'),arrow=send.querySelector('svg'),style=getComputedStyle(send);
        const colour=document.createElement('canvas').getContext('2d');colour.fillStyle=surface.backgroundColor;colour.fillRect(0,0,1,1);const rgba=[...colour.getImageData(0,0,1,1).data];
        return {sendSurface:{target:rect(send),arrow:rect(arrow),paint:{width:parseFloat(surface.width),height:parseFloat(surface.height),left:parseFloat(surface.left),top:parseFloat(surface.top),rgba},opacity:parseFloat(style.opacity),appearance:style.appearance,theme:document.documentElement.dataset.theme,hidden:send.hidden,disabled:send.disabled,fixture:window.__sendSurfaceFixture},layout:{shell:rect(document.querySelector('#app')),resizing:document.querySelector('#app').dataset.mobileResizing==='true',mode:document.documentElement.dataset.iosLayout??'',textScale:parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--text-scale'))||1},composer:rect(c),prompt:rect(p),reply:reply?.getClientRects().length?rect(reply):null,files:files?.getClientRects().length?rect(files):null,viewport:{width:innerWidth,height:innerHeight},native:window.__KINDRED_NATIVE_GEOMETRY,
        controls:[...c.querySelectorAll('#composer-actions,#send,.dictation-button,.dictation-cancel')].filter(b=>b.getClientRects().length).map(b=>{const r=rect(b),h=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {...r,hit:h===b||b.contains(h)}})}})()
        """
        var measured: [String: Any]?
        var previousStamp: String?
        var sampleCount = 0
        let started = Date()
        layoutEvidence = ["phase": label]
        try await waitFor("applied native and shared layout for " + label) {
            let raw = try await self.js(source)
            let sample = try XCTUnwrap(raw as? [String: Any])
            sampleCount += 1
            // Read the live UIKit host after this sample, not a pre-rotation size.
            let host = self.session.webView.bounds
            let stamp = Self.appliedLayoutStamp(sample,
                hostWidth: Double(host.width), hostHeight: Double(host.height))
            self.layoutEvidence["samples"] = sampleCount
            self.layoutEvidence["elapsedSeconds"] = Date().timeIntervalSince(started)
            self.layoutEvidence["liveHost"] = ["width": host.width, "height": host.height]
            self.layoutEvidence["latest"] = sample
            if self.layoutEvidence["first"] == nil { self.layoutEvidence["first"] = sample }
            let stable = stamp != nil && stamp == previousStamp
            previousStamp = stamp
            if stable { measured = sample }
            return stable
        }
        var metrics = try XCTUnwrap(measured)
        metrics["layoutTransition"] = layoutEvidence
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
        return (metrics, image)
    }

    private func checkSendSurfaceMatrix() async throws {
        for theme in ["dark", "light"] {
            for populated in [false, true] {
                for keyboard in [false, true] {
                    let label = "send-" + theme + (populated ? "-populated" : "-empty") + (keyboard ? "-open" : "-closed")
                    let draft = populated ? "Send surface fixture" : ""
                    _ = try await js("document.documentElement.dataset.theme='\(theme)';const p=document.querySelector('#prompt');p.textContent='\(draft)';p.dispatchEvent(new InputEvent('input',{bubbles:true}));p.\(keyboard ? "focus" : "blur")();true")
                    if !keyboard { window.endEditing(true) }
                    try await waitFor("actual keyboard state for " + label) { self.keyboardVisible == keyboard }
                    let observed = try await checkComposer(label: label)
                    try checkPaintedSend(observed.metrics, image: observed.image, theme: theme, label: label)
                    let retained = try await js("document.querySelector('#prompt').textContent") as? String
                    XCTAssertEqual(retained, draft)
                }
            }
        }
        window.endEditing(true)
        try await waitFor("Send matrix keyboard cleanup") { !self.keyboardVisible }
        _ = try await js("document.documentElement.dataset.theme='dark';const p=document.querySelector('#prompt');p.textContent='';p.dispatchEvent(new InputEvent('input',{bubbles:true}));true")
        let sends = try await js("window.__composerSends.length") as? Int
        XCTAssertEqual(sends, 1, "Paint matrix must not submit another message")
    }

    private func checkPaintedSend(_ metrics: [String: Any], image: UIImage, theme: String, label: String) throws {
        let send = try XCTUnwrap(metrics["sendSurface"] as? [String: Any])
        XCTAssertEqual(send["theme"] as? String, theme)
        XCTAssertEqual(send["hidden"] as? Bool, false)
        XCTAssertEqual(send["appearance"] as? String, "none")
        let target = try XCTUnwrap(send["target"] as? [String: Double])
        let arrow = try XCTUnwrap(send["arrow"] as? [String: Double])
        let paint = try XCTUnwrap(send["paint"] as? [String: Any])
        for key in ["width", "height"] {
            XCTAssertEqual(target[key] ?? 0, 44, accuracy: 0.5)
            XCTAssertEqual(arrow[key] ?? 0, 20, accuracy: 0.5)
            XCTAssertEqual((paint[key] as? Double) ?? 0, 36, accuracy: 0.5)
        }
        for key in ["left", "top"] { XCTAssertEqual((paint[key] as? Double) ?? 0, 4, accuracy: 0.5) }
        let centre = CGPoint(x: (target["x"] ?? 0) + 22, y: (target["y"] ?? 0) + 22)
        XCTAssertEqual((arrow["x"] ?? 0) + 10, Double(centre.x), accuracy: 0.5)
        XCTAssertEqual((arrow["y"] ?? 0) + 10, Double(centre.y), accuracy: 0.5)
        let colour = try XCTUnwrap(paint["rgba"] as? [Double])
        XCTAssertEqual(colour.count, 4)
        XCTAssertEqual(colour[3], 255)
        let opacity = try XCTUnwrap(send["opacity"] as? Double)
        var probes: [[String: Any]] = []
        // Cardinal samples avoid the 20px arrow. Radius17 must be painted;
        // radius19 must be outside the 36px circle but inside the 44px target.
        for (dx, dy) in [(1.0, 0.0), (-1.0, 0.0), (0.0, 1.0), (0.0, -1.0)] {
            let inside = session.webView.convert(CGPoint(x: centre.x + dx * 17, y: centre.y + dy * 17), to: window)
            let outside = session.webView.convert(CGPoint(x: centre.x + dx * 19, y: centre.y + dy * 19), to: window)
            let innerPixel = try Self.imagePixel(image, point: inside)
            let outerPixel = try Self.imagePixel(image, point: outside)
            let expected = (0..<3).map { opacity * colour[$0] + (1 - opacity) * outerPixel[$0] }
            XCTAssertGreaterThan(Self.colourDistance(expected, outerPixel), 12, "Paint must visibly differ from surroundings")
            XCTAssertLessThanOrEqual(Self.colourDistance(innerPixel, expected), 12, "Native bitmap must paint through radius17")
            probes.append(["direction": [dx, dy], "inside": innerPixel, "outside": outerPixel, "expected": expected])
        }
        let evidence: [String: Any] = ["sendSurface": send, "nativeBitmapProbes": probes]
        let data = try JSONSerialization.data(withJSONObject: evidence, options: [.prettyPrinted, .sortedKeys])
        let attachment = XCTAttachment(data: data, uniformTypeIdentifier: "public.json")
        attachment.name = label + "-painted-Send"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private static func colourDistance(_ a: [Double], _ b: [Double]) -> Double {
        zip(a.prefix(3), b.prefix(3)).map { abs($0 - $1) }.max() ?? 0
    }

    private static func imagePixel(_ image: UIImage, point: CGPoint) throws -> [Double] {
        let cg = try XCTUnwrap(image.cgImage)
        XCTAssertEqual(image.imageOrientation, .up)
        let x = floor(point.x * CGFloat(cg.width) / image.size.width)
        let y = floor(point.y * CGFloat(cg.height) / image.size.height)
        XCTAssertGreaterThanOrEqual(x, 0); XCTAssertGreaterThanOrEqual(y, 0)
        XCTAssertLessThan(x, CGFloat(cg.width)); XCTAssertLessThan(y, CGFloat(cg.height))
        let crop = try XCTUnwrap(cg.cropping(to: CGRect(x: x, y: y, width: 1, height: 1)))
        let space = try XCTUnwrap(CGColorSpace(name: CGColorSpace.sRGB))
        var rgba = [UInt8](repeating: 0, count: 4)
        let drawn = rgba.withUnsafeMutableBytes { buffer -> Bool in
            guard let context = CGContext(data: buffer.baseAddress, width: 1, height: 1,
                bitsPerComponent: 8, bytesPerRow: 4, space: space,
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue) else { return false }
            context.draw(crop, in: CGRect(x: 0, y: 0, width: 1, height: 1))
            return true
        }
        XCTAssertTrue(drawn)
        XCTAssertEqual(rgba[3], 255)
        return rgba.map(Double.init)
    }

    /// Pure shape/state predicate; control visibility and hits remain assertions.
    private static func appliedLayoutStamp(_ metrics: [String: Any],
        hostWidth: Double, hostHeight: Double) -> String? {
        guard let native = metrics["native"] as? [String: Any],
              let viewport = metrics["viewport"] as? [String: Double],
              let layout = metrics["layout"] as? [String: Any],
              let shell = layout["shell"] as? [String: Double],
              layout["resizing"] as? Bool == false,
              let nw = native["width"] as? Double, let nh = native["height"] as? Double,
              let vw = viewport["width"], let vh = viewport["height"],
              let sw = shell["width"], let sh = shell["height"],
              let scale = layout["textScale"] as? Double,
              [hostWidth, hostHeight, nw, nh, vw, vh, sw, sh, scale].allSatisfy({ $0.isFinite && $0 > 0 }),
              abs(nw - hostWidth) < 2, abs(nh - hostHeight) < 2,
              abs(vw - hostWidth) < 2, abs(vh - hostHeight) < 2,
              abs(sw - vw) < 2, abs(sh - vh) < 2 else { return nil }
        return "\(hostWidth)|\(hostHeight)|\(nw)|\(nh)|\(vw)|\(vh)|\(sw)|\(sh)|\(scale)|\(layout["mode"] as? String ?? "")"
    }

    func webSession(_ session: WebSession, didReceive message: SessionMessage) {}
    func webSessionRequestedAccounts(_ session: WebSession) {}
    func webSession(_ session: WebSession, show message: String, isError: Bool) {}
    func webSession(_ session: WebSession, didDownload file: URL) {}
}

/// The callback and diagnostic deadline compete on the main actor. Only the
/// first may resume the continuation; late WK completions have no effect.
@MainActor
private final class FailurePageProbe {
    private var continuation: CheckedContinuation<[String: Any], Never>?
    init(_ continuation: CheckedContinuation<[String: Any], Never>) {
        self.continuation = continuation
    }
    func finish(_ result: [String: Any]) {
        guard let continuation else { return }
        self.continuation = nil
        continuation.resume(returning: result)
    }
}

/// Test-only TLS acceptance for the disposable loopback certificate. Production
/// navigation policy is forwarded unchanged; no product trust/ATS setting changes.
@MainActor
private final class LocalFixtureDelegate: NSObject, WKNavigationDelegate {
    let session: WebSession
    private(set) var milestones: [String] = []
    init(session: WebSession) { self.session = session }
    func webView(_ webView: WKWebView, didReceive challenge: URLAuthenticationChallenge,
                 completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        guard challenge.protectionSpace.host == "localhost", challenge.protectionSpace.port == 8765,
              challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
              let trust = challenge.protectionSpace.serverTrust else {
            milestones.append("authentication-refused")
            completionHandler(.cancelAuthenticationChallenge, nil); return
        }
        milestones.append("localhost-TLS-trust")
        completionHandler(.useCredential, URLCredential(trust: trust))
    }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        milestones.append("navigation-action:" + (action.targetFrame?.isMainFrame == false ? "subframe" : "main"))
        session.webView(webView, decidePolicyFor: action) { [weak self] policy in
            self?.milestones.append("navigation-action-policy:" + String(policy.rawValue))
            decisionHandler(policy)
        }
    }
    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        milestones.append("navigation-response:" + String((response.response as? HTTPURLResponse)?.statusCode ?? 0))
        session.webView(webView, decidePolicyFor: response) { [weak self] policy in
            self?.milestones.append("navigation-response-policy:" + String(policy.rawValue))
            decisionHandler(policy)
        }
    }
    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) { milestones.append("navigation-start"); session.webView(webView, didStartProvisionalNavigation: navigation) }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { milestones.append("navigation-finish"); session.webView(webView, didFinish: navigation) }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { milestones.append("provisional-failure:\((error as NSError).domain):\((error as NSError).code)"); session.webView(webView, didFailProvisionalNavigation: navigation, withError: error) }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { milestones.append("navigation-failure:\((error as NSError).domain):\((error as NSError).code)"); session.webView(webView, didFail: navigation, withError: error) }
}
