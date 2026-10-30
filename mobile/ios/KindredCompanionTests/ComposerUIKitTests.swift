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
    private var startedLandscape = false
    private var delegate: LocalFixtureDelegate!
    private var keyboardFrame: CGRect = .zero
    private var keyboardShows = 0
    private var keyboardHides = 0
    private var keyboardVisible = false
    private var observers: [NSObjectProtocol] = []
    private var layoutEvidence: [String: Any] = [:]
    private var keyboardOwnershipEvents: [[String: Any]] = []
    private static let contractedDiagnosticMethods = [
        "testKeyboardOwnershipContractedOrdinaryFocus",
        "testKeyboardOwnershipContractedPreventScrollFocus",
    ]
    private var isContractedDiagnostic: Bool {
        Self.contractedDiagnosticMethods.contains { method in
            name == method || name.hasSuffix(".\(method)") || name.hasSuffix(" \(method)]")
        }
    }

    override func setUp() async throws {
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        previousWindow = scene.windows.first(where: { $0.isKeyWindow })
        startedLandscape = scene.interfaceOrientation.isLandscape
        let origin = try XCTUnwrap(ServerOrigin(url: URL(string: "https://localhost:8765/")!))
        session = WebSession(account: Account(origin: origin, login: "composer-fixture"), token: "native-test-token-only", host: self)
        session.webView.stopLoading()
        // Actual WebSession/bridge/UIKit, injected speech lifecycle only. This
        // never grants permission or records audio and is not recognition proof.
        session.dictation.testHooks = NativeDictation.TestHooks()
        delegate = LocalFixtureDelegate(session: session)
        session.webView.navigationDelegate = delegate
        session.webView.configuration.userContentController.addUserScript(WKUserScript(source: """
        window.__KINDRED_MOBILE=true; window.__KINDRED_MOBILE_PLATFORM='ios';
        window.__composerSends=[];
        window.__composerDictationEvents=[];
        window.__composerFocusTrace=[];
        const focusGeometry=kind=>({kind,time:performance.now(),
          viewport:{width:innerWidth,height:innerHeight},
          visual:visualViewport?{width:visualViewport.width,height:visualViewport.height,offsetTop:visualViewport.offsetTop,offsetLeft:visualViewport.offsetLeft,scale:visualViewport.scale}:null,
          scroll:{x:scrollX,y:scrollY,top:document.scrollingElement?.scrollTop??0,left:document.scrollingElement?.scrollLeft??0,
            height:document.scrollingElement?.scrollHeight??0,clientHeight:document.documentElement.clientHeight}});
        const focusTrace=kind=>{const entry=focusGeometry(kind);window.__composerFocusTrace.push(entry);
          if(window.__composerFocusTrace.length>24)window.__composerFocusTrace.shift();return entry};
        document.addEventListener('focusin',event=>{
          const entry=focusTrace(event.target?.id==='prompt'?'prompt-focusin':'other-focusin');
          if(event.target?.id==='prompt'&&!window.__composerFirstPromptFocus)window.__composerFirstPromptFocus=entry;
        },true);
        document.addEventListener('focusout',event=>focusTrace(event.target?.id==='prompt'?'prompt-focusout':'other-focusout'),true);
        window.addEventListener('resize',()=>focusTrace('window-resize'));
        visualViewport?.addEventListener('resize',()=>focusTrace('visual-resize'));
        visualViewport?.addEventListener('scroll',()=>focusTrace('visual-scroll'));
        window.addEventListener('kindred-ios-dictation',event=>{const p=event.detail;
          window.__composerDictationEvents.push({phase:p.phase,reason:p.reason??p.errorCode??null,
            sequence:p.sequence,textLength:typeof p.text==='string'?p.text.length:0});
        });
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
                .ignoresSafeArea(.container, edges: [.top, .bottom])
                .toolbar(.hidden, for: .navigationBar)
        }
        window = UIWindow(windowScene: scene)
        if isContractedDiagnostic {
            // Diagnostic comparison only: ordinary tests match RootView's
            // single keyboard owner, WebHostView's UIKit layout guide.
            window.rootViewController = UIHostingController(rootView: root)
        } else {
            window.rootViewController = UIHostingController(rootView: root.ignoresSafeArea(.keyboard))
        }
        window.makeKeyAndVisible()
        observers.append(NotificationCenter.default.addObserver(forName: UIResponder.keyboardDidShowNotification, object: nil, queue: .main) { [weak self] note in
            MainActor.assumeIsolated {
                guard let self else { return }
                self.keyboardShows += 1
                self.keyboardVisible = true
                self.keyboardFrame = (note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? NSValue)?.cgRectValue ?? .zero
                self.keyboardOwnershipEvents.append(["event": "keyboardDidShow",
                    "time": ProcessInfo.processInfo.systemUptime,
                    "frame": ["x": self.keyboardFrame.minX, "y": self.keyboardFrame.minY,
                        "width": self.keyboardFrame.width, "height": self.keyboardFrame.height]])
            }
        })
        observers.append(NotificationCenter.default.addObserver(forName: UIResponder.keyboardDidHideNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated {
                self?.keyboardHides += 1; self?.keyboardVisible = false
                self?.keyboardOwnershipEvents.append(["event": "keyboardDidHide",
                    "time": ProcessInfo.processInfo.systemUptime])
            }
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
            try await self.boolean("window.__sendSurfaceFixture?.['style.css']==='61733dc3eb2ac9e551333e9daf0d982a6dd98a19775d453f50bccec2d5d80a5c' && window.__sendSurfaceFixture?.['app.js']==='d8e01fc9452bc61b5d2e93e559b609f6680e8b5c723dd7825c73b48954c8cfda' && window.__sendSurfaceFixture?.['progress.css']==='2d9008b00da3d458ab4998a8ed210ae1efbb3ba408c47e73ee88c75567d7da7e' && window.__sendSurfaceFixture?.['commands.js']==='5f4f2e6b9ee5cd0141ab36625da8c60fe6e98aa0488abf1a20e3e33d97095046' && window.__sendSurfaceFixture?.['dictation.js']==='c877a031e2f279deb18ea44450689b1db14848d74e1b5855d79f495976bd6121' && window.__sendSurfaceFixture?.['voice.js']==='dd3f0c713d77f319ac80ce61c01fbf2db6975fc00574687d9296cff876df64be' && window.__sendSurfaceFixture?.['slack-monitoring.js']==='8a885993ecd5da1c6d0b3917c79a2940e0f5a9fb6bf2f607b49b117d6f70fe10' && window.__sendSurfaceFixture?.['characters.js']==='2e6283b9f301283ea5c695856cc11b8eb539c31bdbd7a08975eeb45434c2c040'")
        }
        try await waitFor("injected native capability reconciles through bridge") {
            try await self.boolean("window.__KINDRED_IOS_DICTATION?.onDeviceAvailable===true && window.__KINDRED_IOS_DICTATION?.recognizerAvailable===true")
        }
        if #available(iOS 26.0,*) {
            try await waitFor("native foreground acknowledged") { self.session.glassControls.composer.model != nil && !self.session.glassControls.composer.isHidden }
        }

    }

    override func tearDown() async throws {
        // A failed landscape assertion must not contaminate the next test.
        window?.endEditing(true)
        if let scene = window?.windowScene, scene.interfaceOrientation.isLandscape, !startedLandscape {
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

    func testNativeComposerPrimaryGlyphPaintsInBothThemes() async throws {
        guard #available(iOS 26.0,*) else { throw XCTSkip("Native Liquid Glass requires iOS 26") }
        for theme in ["dark","light"] {
            try await setFixtureAppearance(theme)
            try await waitFor("native primary glyph model") { self.session.glassControls.composer.model?.dark == (theme=="dark") && !self.session.glassControls.composer.isHidden }
            let composer=session.glassControls.composer,item=try XCTUnwrap(composer.model?.items.first(where:{$0.primary}))
            let button=try XCTUnwrap(composer.material.contentView.subviews.compactMap {$0 as? UIButton}.first(where:{$0.accessibilityIdentifier=="kindred-native-composer-"+item.id}))
            window.layoutIfNeeded();button.layoutIfNeeded()
            let image=UIGraphicsImageRenderer(bounds:window.bounds).image {_ in window.drawHierarchy(in:window.bounds,afterScreenUpdates:true)}
            let center=button.convert(CGPoint(x:button.bounds.midX,y:button.bounds.midY),to:window)
            var ink=0
            for x in stride(from:-10,through:10,by:2) { for y in stride(from:-10,through:10,by:2) {
                let pixel=try Self.imagePixel(image,point:CGPoint(x:center.x+CGFloat(x),y:center.y+CGFloat(y)))
                if theme=="dark" ? pixel.prefix(3).allSatisfy({$0<100}) : pixel.prefix(3).allSatisfy({$0>155}) { ink+=1 }
            }}
            let a=XCTAttachment(image:image);a.name="native-primary-glyph-"+theme;a.lifetime = .keepAlways;add(a)
            let info:[String:Any]=["theme":theme,"inkSamples":ink,"symbol":item.symbol,"imageFrame":button.imageView?.frame.debugDescription ?? "nil","imageAlpha":button.imageView?.alpha ?? -1,"tint":button.imageView?.tintColor.resolvedColor(with:button.traitCollection).description ?? "nil","style":button.traitCollection.userInterfaceStyle.rawValue]
            let data=XCTAttachment(data:try JSONSerialization.data(withJSONObject:info,options:[.prettyPrinted,.sortedKeys]),uniformTypeIdentifier:"public.json");data.name="native-primary-glyph-geometry";data.lifetime = .keepAlways;add(data)
            XCTAssertGreaterThan(ink,5,"Native primary control must paint a contrasting symbol inside its circle")
        }
    }

    func testNativeComposerTypingKeyboardAndSend() async throws {
        guard #available(iOS 26.0,*) else { throw XCTSkip("Native Liquid Glass requires iOS 26") }
        try await waitFor("genuine native composer") { self.session.glassControls.composer.model != nil && !self.session.glassControls.composer.isHidden }
        let composer=session.glassControls.composer
        XCTAssertTrue(composer.material.effect is UIGlassEffect)
        XCTAssertTrue(composer.editor.superview === composer.material.contentView)
        XCTAssertFalse(session.webView.backgroundColor == .clear)
        composer.editor.becomeFirstResponder()
        try await waitFor("native editor first responder") { composer.editor.isFirstResponder }
        try await waitFor("real native keyboard notification") { self.keyboardShows>0 && self.keyboardFrame.height>100 }
        composer.editor.insertText("Native 🦋 draft with a second line that will wrap when the phone narrows.")
        try await waitFor("native draft reaches retained delivery model") { try await self.boolean("document.querySelector('#prompt').value==='Native 🦋 draft with a second line that will wrap when the phone narrows.'") }
        let retainedEditor=composer.editor
        let bottom=composer.material.frame.maxY
        composer.editor.insertText(" More words to grow the native text view without moving its bottom edge.")
        try await waitFor("growing native foreground settles") { abs(composer.material.frame.maxY-bottom)<1 }
        XCTAssertTrue(composer.editor === retainedEditor)
        XCTAssertTrue(composer.editor.isFirstResponder)
        _ = try await js("document.querySelector('[data-message=\"1\"] [data-message-action=\"reply\"]').click();true")
        try await waitFor("native reply cancellation control") { try await self.boolean("!!document.querySelector('#composer-reply:not([hidden])')") }
        let draft=composer.editor.text!
        composer.emit("send")
        try await waitFor("one native send through original handler") { try await self.boolean("window.__composerSends.length===1 && document.querySelector('#prompt').value==='' ") }
        let sent=try await js("window.__composerSends[0].prompt") as? String
        XCTAssertEqual(sent,draft)
        XCTAssertTrue(composer.editor.isFirstResponder)
        XCTAssertGreaterThan(composer.indicatorSurfaces,0,"native reading scroll view found for standard indicator inset")
        let report:[String:Any]=["nativeGlass":true,"nativeEditor":true,"keyboardShows":keyboardShows,"nativeIndicatorSurfaces":composer.indicatorSurfaces,"draftPreserved":true,"singleSend":true]
        let evidence=XCTAttachment(data:try JSONSerialization.data(withJSONObject:report,options:[.prettyPrinted]),uniformTypeIdentifier:"public.json");evidence.name="native-composer-input";evidence.lifetime = .keepAlways;add(evidence)
    }

    func testNativeCommandPickerReadableRowsAndStableSelection() async throws {
        guard #available(iOS 26.0,*) else { throw XCTSkip("Native Liquid Glass requires iOS 26") }
        _ = try await js("""
        const original=window.fetch.bind(window);
        window.fetch=(input,options={})=>{
          const url=new URL(typeof input==='string'?input:input.url,location.href);
          if(url.pathname!=='/api/commands')return original(input,options);
          return Promise.resolve(new Response(JSON.stringify(Array.from({length:8},(_,i)=>({name:'entry-'+i+'-long-command-name',description:'A detailed command description that should truncate cleanly rather than colliding with other rows or the source badge.',source:i%2?'Gmail':'built-in',action:'run',parameters:[],usage:'/entry-'+i}))),{status:200,headers:{'Content-Type':'application/json'}}));
        };
        window.__KINDRED_IOS_TOOLBAR={x:innerWidth-100,y:80,width:84,height:Math.max(1,innerHeight-160)};true
        """)
        let composer=session.glassControls.composer
        for theme in ["dark","light"] {
            try await setFixtureAppearance(theme)
            try await waitFor("native picker editor") { composer.model != nil && !composer.isHidden }
            composer.editor.becomeFirstResponder()
            try await waitFor("picker software keyboard") { composer.editor.isFirstResponder && self.keyboardVisible }
            composer.editor.selectedRange=NSRange(location:0,length:(composer.editor.text as NSString).length)
            composer.editor.insertText("/")
            try await waitFor("eight structured command rows") { !composer.popup.isHidden && composer.model?.dark==(theme=="dark") && composer.model?.ack==composer.revision && composer.model?.items.filter({$0.title != nil}).count==8 }
            window.layoutIfNeeded()
            XCTAssertLessThanOrEqual(composer.popup.bounds.width,440)
            XCTAssertLessThanOrEqual(composer.popup.frame.maxY,composer.material.frame.minY-5)
            XCTAssertGreaterThan(composer.popup.frame.minY,0)
            for exclusion in composer.model?.popupExclusions ?? [] {
                XCTAssertFalse(composer.popup.frame.intersects(composer.convert(exclusion,from:session.webView)),"picker avoids the native dock and display exclusions")
            }
            let buttons=composer.suggestionScroll.subviews.compactMap {$0 as? UIButton}
            XCTAssertEqual(buttons.count,8)
            for button in buttons {
                button.layoutIfNeeded()
                let labels=button.subviews.compactMap {$0 as? UILabel}
                let title=try XCTUnwrap(labels.first(where:{$0.accessibilityIdentifier=="kindred-command-title"}))
                let detail=try XCTUnwrap(labels.first(where:{$0.accessibilityIdentifier=="kindred-command-description"}))
                let badge=try XCTUnwrap(labels.first(where:{$0.accessibilityIdentifier=="kindred-command-source"}))
                XCTAssertEqual(title.frame.minX,detail.frame.minX)
                XCTAssertGreaterThanOrEqual(detail.frame.minY,title.frame.maxY+2)
                XCTAssertGreaterThan(title.font.pointSize,detail.font.pointSize)
                XCTAssertEqual(detail.numberOfLines,1)
                XCTAssertGreaterThanOrEqual(button.bounds.height,44)
                if !badge.isHidden { XCTAssertLessThan(title.frame.maxX,badge.frame.minX) }
            }
            let retained=buttons.first
            for _ in 0..<5 { composer.emit("selection") }
            try await Task.sleep(nanoseconds:200_000_000)
            XCTAssertTrue(composer.suggestionScroll.subviews.contains(where:{$0 === retained}),"selection acknowledgements retain the visible rows in \(theme): \(retained?.accessibilityIdentifier ?? "nil")")
            for _ in 0..<7 { composer.editor.key?("ArrowDown") }
            try await waitFor("native picker scrolls selected row") { composer.model?.items.first(where:{$0.selected})?.title=="/entry-7-long-command-name" && composer.suggestionScroll.contentOffset.y>0 }
            let screenshot=XCTAttachment(image:UIGraphicsImageRenderer(bounds:window.bounds).image { _ in window.drawHierarchy(in:window.bounds,afterScreenUpdates:true) });screenshot.name="native-command-picker-"+theme;screenshot.lifetime = .keepAlways;add(screenshot)
            composer.editor.resignFirstResponder()
            try await waitFor("picker keyboard dismissal") { !self.keyboardVisible }
        }
    }

    func testNativeSlashCommandsLoadingFilteringAndSelection() async throws {
        guard #available(iOS 26.0,*) else { throw XCTSkip("Native Liquid Glass requires iOS 26") }
        _ = try await js("""
        const original=window.fetch.bind(window);
        window.__slashMode='hold';window.__slashRequests=0;window.__slashKeys=[];
        document.querySelector('#prompt').addEventListener('keydown',event=>queueMicrotask(()=>window.__slashKeys.push({key:event.key,prevented:event.defaultPrevented,text:document.querySelector('#prompt').value,menuHidden:document.querySelector('#command-options').hidden})),true);
        window.fetch=(input,options={})=>{
          const url=new URL(typeof input==='string'?input:input.url,location.href);
          if(url.pathname!=='/api/commands')return original(input,options);
          window.__slashRequests++;
          const response=()=>new Response(JSON.stringify([{name:'domain-review',description:'Review a domain',source:'skill',action:'run',parameters:[{name:'domain',required:true,rest:false}],usage:'/domain-review <domain>'}]),{status:200,headers:{'Content-Type':'application/json'}});
          return window.__slashMode==='hold'?new Promise(resolve=>window.__releaseSlash=()=>resolve(response())):Promise.resolve(response());
        };true
        """)
        let composer=session.glassControls.composer
        try await waitFor("native composer ready for slash") { composer.model != nil && !composer.isHidden }
        composer.editor.becomeFirstResponder()
        try await waitFor("native slash keyboard") { composer.editor.isFirstResponder && self.keyboardVisible }
        composer.editor.insertText("/")
        try await waitFor("native command loading status") { !composer.popup.isHidden && composer.model?.items.contains(where: { $0.kind=="suggestion-label" && $0.text.contains("Loading commands") })==true }
        XCTAssertTrue(composer.popup.effect is UIGlassEffect)
        let webFocused=try await boolean("document.activeElement===document.querySelector('#prompt')")
        XCTAssertFalse(webFocused,"the native editor keeps keyboard ownership")
        _ = try await js("window.__slashMode='ready';window.__releaseSlash();true")
        try await waitFor("slash choices in native material") { composer.model?.items.contains(where: { $0.kind=="suggestion" && $0.text.contains("/domain-review") })==true }
        let image=XCTAttachment(image:UIGraphicsImageRenderer(bounds:window.bounds).image { _ in window.drawHierarchy(in:window.bounds,afterScreenUpdates:true) });image.name="native-slash-commands";image.lifetime = .keepAlways;add(image)
        composer.editor.selectedRange=NSRange(location:0,length:(composer.editor.text as NSString).length)
        composer.editor.insertText("/dom")
        try await waitFor("native command filter") { composer.model?.text=="/dom" && composer.model?.items.contains(where: { $0.kind=="suggestion" && $0.text.contains("/domain-review") })==true }
        let button=try XCTUnwrap(composer.suggestionScroll.subviews.compactMap {$0 as? UIButton}.first(where: {$0.accessibilityLabel?.contains("/domain-review")==true}))
        let center=button.convert(CGPoint(x:button.bounds.midX,y:button.bounds.midY),to:window)
        XCTAssertTrue(window.hitTest(center,with:nil)===button,"the native command row is tappable above the keyboard")
        button.sendActions(for:.primaryActionTriggered)
        try await waitFor("tap inserts command and caret") { composer.editor.text=="/domain-review " && composer.editor.selectedRange.location==15 }
        XCTAssertTrue(composer.editor.isFirstResponder)
        composer.editor.selectedRange=NSRange(location:0,length:(composer.editor.text as NSString).length)
        composer.editor.insertText("/dom")
        try await waitFor("Return choice loaded") { composer.editor.hasSuggestions && composer.model?.text=="/dom" }
        composer.editor.insertText("\n")
        try await Task.sleep(nanoseconds:200_000_000)
        let debug:[String:Any]=["nativeText":composer.editor.text ?? "", "selection":composer.editor.selectedRange.debugDescription,"modelText":composer.model?.text ?? "", "page":try await js("({keys:window.__slashKeys,text:document.querySelector('#prompt').value,menuHidden:document.querySelector('#command-options').hidden,sends:window.__composerSends.length})") ?? [:]]
        let trace=XCTAttachment(data:try JSONSerialization.data(withJSONObject:debug,options:[.prettyPrinted]),uniformTypeIdentifier:"public.json");trace.name="native-slash-return-state";trace.lifetime = .keepAlways;add(trace)
        try await waitFor("Return chooses command without sending") { composer.editor.text=="/domain-review " }
        let unsent=try await js("window.__composerSends.length") as? Int
        XCTAssertEqual(unsent,0)
        composer.editor.insertText("acme.test")
        try await waitFor("command parameter reaches original draft") { try await self.boolean("document.querySelector('#prompt').value==='/domain-review acme.test'") }
        composer.editor.insertText("\n")
        try await waitFor("command sends exactly once") { try await self.boolean("window.__composerSends.length===1 && window.__composerSends[0].prompt==='/domain-review acme.test' && document.querySelector('#prompt').value===''") }
        composer.editor.insertText("/zz")
        try await waitFor("native empty command status") { !composer.popup.isHidden && composer.model?.items.contains(where: { $0.kind=="suggestion-label" && $0.text.contains("No matching commands") })==true }
        composer.editor.resignFirstResponder()
        try await waitFor("command popup dismisses with focus") { composer.popup.isHidden && !self.keyboardVisible }
        let report:[String:Any]=["nativeGlass":true,"loading":true,"filteredChoices":true,"tapAndReturnSelection":true,"caretPreserved":true,"keyboardRetained":true,"oneOriginalSend":true,"emptyStatus":true,"blurDismisses":true]
        let evidence=XCTAttachment(data:try JSONSerialization.data(withJSONObject:report,options:[.prettyPrinted]),uniformTypeIdentifier:"public.json");evidence.name="native-slash-commands-result";evidence.lifetime = .keepAlways;add(evidence)
    }

    func testComposerBackdropFollowsScrollingContent() async throws {
        guard #available(iOS 26.0,*) else { throw XCTSkip("Native Liquid Glass requires iOS 26") }
        for theme in ["dark","light"] {
            try await setFixtureAppearance(theme)
            try await waitFor("native material acknowledged") { self.session.glassControls.composer.model != nil && !self.session.glassControls.composer.isHidden }
            XCTAssertTrue(session.glassControls.composer.material.effect is UIGlassEffect)
            let contained=try await boolean("(()=>{const c=document.querySelector('#composer').getBoundingClientRect(),a=document.querySelector('#content').getBoundingClientRect();return a.bottom>=c.bottom && getComputedStyle(document.querySelector('#composer')).backdropFilter==='none' && getComputedStyle(document.querySelector('#composer-area'),'::before').content==='none' && document.querySelector('#composer').hasAttribute('data-ios-native-composer')})()")
            XCTAssertTrue(contained,"the reading viewport continues beneath the composer without a footer layer")
            _ = try await js("""
            window.__backdropProbe?.remove();
            const area=document.querySelector('#content'),probe=document.createElement('div');
            probe.style.cssText='height:2000px;min-height:2000px;width:100%;background:linear-gradient(#ff2040 0 50%,#00dd70 50% 100%)';
            area.append(probe);window.__backdropProbe=probe;
            window.__moveBackdrop=center=>{const c=document.querySelector('#composer').getBoundingClientRect();area.scrollTop+=probe.getBoundingClientRect().top-(c.top+8)+center;};true
            """)
            try await Task.sleep(nanoseconds:200_000_000)
            var pixels:[[Double]]=[]
            for (label,center) in [("red",500),("green",1500)] {
                _ = try await js("window.__moveBackdrop(\(center));true")
                try await waitFor("scrolling backdrop reaches sample") {
                    try await self.boolean("Math.abs(document.querySelector('#composer').getBoundingClientRect().top+8-window.__backdropProbe.getBoundingClientRect().top-\(center))<1")
                }
                try await Task.sleep(nanoseconds:150_000_000)
                let samplePoint=try await js("(()=>{const r=document.querySelector('#composer').getBoundingClientRect();return [r.x+r.width/2,r.y+8]})()") as? [Double]
                let point=try XCTUnwrap(samplePoint)
                let image=UIGraphicsImageRenderer(bounds:window.bounds).image { _ in window.drawHierarchy(in:window.bounds,afterScreenUpdates:true) }
                pixels.append(try Self.imagePixel(image,point:session.webView.convert(CGPoint(x:point[0],y:point[1]),to:window)))
                let attachment=XCTAttachment(image:image);attachment.name="live-composer-\(theme)-\(label)";attachment.lifetime = .keepAlways;add(attachment)
            }
            XCTAssertGreaterThan(pixels[0][0]-pixels[0][1],20,"red conversation content shows through the input")
            XCTAssertGreaterThan(pixels[1][1]-pixels[1][0],20,"scrolling green content changes the material")
            XCTAssertGreaterThan(Self.colourDistance(pixels[0],pixels[1]),50,"the composer must not sample a static canvas")
            let nativeIndicator=try await boolean("!document.querySelector('.ios-reading-indicator') && getComputedStyle(document.querySelector('#content')).scrollbarWidth!=='none'")
            XCTAssertTrue(nativeIndicator,"retain the standard scroll indicator, with no fake thumb")
            _ = try await js("window.__backdropProbe.remove();true")
        }
    }

    func testKeyboardOpenClosePreservesDraftAndToolbarAboveKeyboard() async throws {
        try await checkComposer(label: "idle-centered")
        let draft = "Native draft\nSecond line\nThird line"
        _ = try await js("const p=document.querySelector('#prompt');p.textContent='Native draft\\nSecond line\\nThird line';p.dispatchEvent(new InputEvent('input',{bubbles:true}));p.focus({preventScroll:true});true")
        try await waitFor("actual UIKit software keyboard didShow") { self.keyboardShows > 0 && self.keyboardFrame.height > 100 }
        try await waitFor("SwiftUI host above actual keyboard") {
            self.session.webView.convert(self.session.webView.bounds, to: self.window).maxY <= self.window.convert(self.keyboardFrame, from: nil).minY + 2
        }
        try await checkComposer(label: "keyboard-open")
        _ = try await js("document.querySelector('[data-message=\"1\"] [data-message-action=\"reply\"]').click();const dt=new DataTransfer();dt.items.add(new File(['Fixture attachment'], 'notes.txt',{type:'text/plain'}));const f=document.querySelector('input[type=file]');f.files=dt.files;f.dispatchEvent(new Event('change',{bubbles:true}));true")
        try await waitFor("real reply and attachment rows") {
            try await self.boolean("!!document.querySelector('[aria-label=\"Remove notes.txt\"]') && document.querySelector('#composer-reply').getClientRects().length>0")
        }
        _ = try await js("document.querySelector('#prompt').focus({preventScroll:true});true")
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

    /// Production send/poll rendering in WKWebView; only disposable responses
    /// and the passive animation recorder are substituted.
    func testMessageMotionRefreshAndFocusedDraftPreservation() async throws {
        let expected = UIAccessibility.isReduceMotionEnabled ? 0 : 2
        _ = try await js("window.__expectedMotionArrivals=\(expected);true")
        _ = try await js("fetch('/api/chats/dm-piper').then(r=>r.json()).then(v=>window.__motionMessages=v.messages);true")
        try await waitFor("motion fixture messages") { try await self.boolean("Array.isArray(window.__motionMessages)") }
        _ = try await js("""
        window.__motionArrivals=[];
        const animate=Element.prototype.animate;
        Element.prototype.animate=function(frames,options){
          if(this.classList.contains('reply-arriving'))window.__motionArrivals.push({seq:this.dataset.message,frames,options});
          return animate.call(this,frames,options);
        };
        const baseFetch=window.fetch.bind(window);
        window.__motionNext=100;
        window.__motionAppend=(sender,text)=>window.__motionMessages.push({seq:window.__motionNext++,sender,kind:'message',text,created:Math.floor(Date.now()/1000)});
        window.fetch=(input,options={})=>{
          const url=new URL(typeof input==='string'?input:input.url,location.href);
          const json=value=>Promise.resolve(new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}}));
          if(url.origin===location.origin&&url.pathname==='/api/chats/dm-piper/messages'&&options.method==='POST'){
            window.__motionAppend('user',JSON.parse(options.body).prompt);return json({runs:[]});
          }
          if(url.origin===location.origin&&url.pathname==='/api/chats/dm-piper')return json({chat:{id:'dm-piper',name:'Piper',members:['piper']},messages:window.__motionMessages,page:{has_before:false,has_after:false}});
          return baseFetch(input,options);
        };
        const p=document.querySelector('#prompt');p.textContent='Native motion send';p.dispatchEvent(new InputEvent('input',{bubbles:true}));p.focus({preventScroll:true});true
        """)
        try await waitFor("foreground focused composer") { try await self.boolean("!document.hidden && (document.activeElement===document.querySelector('#prompt') || window.__KINDRED_NATIVE_COMPOSER_FOCUSED===true)") }
        _ = try await js("document.querySelector('#composer').requestSubmit();true")
        try await waitFor("user entrance and accepted send") { try await self.boolean("!!document.querySelector('[data-message=\"100\"]') && document.querySelector('#prompt').textContent==='' ") }
        _ = try await js("const p=document.querySelector('#prompt');p.textContent='Unsent native draft';p.dispatchEvent(new InputEvent('input',{bubbles:true}));p.focus({preventScroll:true});window.__motionEditor=p;window.__motionAppend('piper','Native received reply');window.dispatchEvent(new Event('online'));true")
        try await waitFor("bot entrance", timeout: 20) { try await self.boolean("!!document.querySelector('[data-message=\"101\"]')") }
        _ = try await js("window.__motionRow=document.querySelector('[data-message=\"101\"]');window.dispatchEvent(new Event('online'));true")
        try await Task.sleep(nanoseconds: 3_000_000_000)
        let motionState = try await js("({arrivals:window.__motionArrivals.length,expected:window.__expectedMotionArrivals,sameRow:window.__motionRow===document.querySelector('[data-message=\"101\"]'),nativeFocused:window.__KINDRED_NATIVE_COMPOSER_FOCUSED===true,domFocused:document.activeElement===window.__motionEditor,sameEditor:window.__motionEditor===document.querySelector('#prompt'),text:window.__motionEditor.textContent})")
        let motionEvidence = XCTAttachment(data:try JSONSerialization.data(withJSONObject:["state":motionState ?? [:],"nativeFirstResponder":session.glassControls.composer.editor.isFirstResponder],options:[.prettyPrinted,.sortedKeys]),uniformTypeIdentifier:"public.json");motionEvidence.name="motion-refresh-state";motionEvidence.lifetime = .keepAlways;add(motionEvidence)
        let refreshOK = try await boolean("window.__motionArrivals.length===window.__expectedMotionArrivals && window.__motionRow===document.querySelector('[data-message=\"101\"]') && (document.activeElement===window.__motionEditor || window.__KINDRED_NATIVE_COMPOSER_FOCUSED===true) && window.__motionEditor===document.querySelector('#prompt') && window.__motionEditor.textContent==='Unsent native draft'")
        XCTAssertTrue(refreshOK)
        let entrancesOK = try await boolean("window.__motionArrivals.every(a=>a.options.duration===240&&a.options.easing==='cubic-bezier(.23,1,.32,1)'&&JSON.stringify(a.frames)===JSON.stringify([{transform:'translateY(12px)'},{transform:'translateY(0)'}]))")
        XCTAssertTrue(entrancesOK)
        _ = try await js("window.__motionMessages.unshift({seq:0,sender:'piper',kind:'message',text:'Older native history',created:1});window.dispatchEvent(new Event('online'));true")
        try await waitFor("history backfill") { try await self.boolean("!!document.querySelector('[data-message=\"0\"]')") }
        _ = try await js("document.documentElement.dataset.motion='off';window.__motionAppend('piper','Reduced motion native reply');window.dispatchEvent(new Event('online'));true")
        try await waitFor("Reduced Motion reply") { try await self.boolean("!!document.querySelector('[data-message=\"102\"]')") }
        let preserved = try await boolean("window.__motionArrivals.length===window.__expectedMotionArrivals && (document.activeElement===window.__motionEditor || window.__KINDRED_NATIVE_COMPOSER_FOCUSED===true) && window.__motionEditor.textContent==='Unsent native draft'")
        XCTAssertTrue(preserved)
        let report: [String: Any] = ["nativeHost": true, "scene": window.bounds.debugDescription,
            "systemReducedMotion": UIAccessibility.isReduceMotionEnabled, "keyboardShows": keyboardShows,
            "keyboardVisible": keyboardVisible, "uiManifest": try await js("window.__sendSurfaceFixture") ?? [:],
            "arrivals": try await js("window.__motionArrivals") ?? [], "draftAndFocusRetained": preserved,
            "refreshAndHistoryDidNotReplay": refreshOK, "appReducedMotionSuppressed": preserved]
        let data = try JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys])
        let attachment=XCTAttachment(data:data,uniformTypeIdentifier:"public.json");attachment.name="native-message-motion";attachment.lifetime = .keepAlways;add(attachment)
    }

    func testNametagWithinNativeViewport() async throws {
        try await Task.sleep(nanoseconds: 500_000_000)
        let metrics=try await js("(()=>{const n=document.querySelector('#bot-details'),h=n.parentElement,r=x=>{const b=x.getBoundingClientRect(),s=getComputedStyle(x);return {x:b.x,y:b.y,width:b.width,height:b.height,position:s.position,left:s.left,right:s.right,transform:s.transform,translate:s.translate,marginLeft:s.marginLeft,inline:x.getAttribute('style')}};return {html:{...document.documentElement.dataset},viewport:innerWidth,tag:r(n),header:r(h),parent:r(h.parentElement)}})()") as? [String:Any] ?? [:]
        let a=XCTAttachment(data:try JSONSerialization.data(withJSONObject:metrics,options:[.prettyPrinted,.sortedKeys]),uniformTypeIdentifier:"public.json");a.name="native-nametag-geometry";a.lifetime = .keepAlways;add(a)
        let tag=metrics["tag"] as? [String:Any] ?? [:],width=metrics["viewport"] as? Double ?? 0
        let x=tag["x"] as? Double ?? -1,w=tag["width"] as? Double ?? 0
        XCTAssertGreaterThanOrEqual(x,0);XCTAssertLessThanOrEqual(x+w,width)
    }

    func testCombinedCandidateTaskNestingAndMarkdownSource() async throws {
        _ = try await js("""
        const now=Math.floor(Date.now()/1000),id='native-long-job';
        const run={id,bot_id:'piper',chat_id:'dm-piper',status:'running',created:now-480,progress_started:now-240,prompt:'Check native combined polish',task_title:'Native long job',output:'',error:''};
        const progress={mode:'summaries',phase:'commentary',run_id:id,group_id:id,task_title:run.task_title,activity:{completed:2,recent:[{label:'Inspect saved source',created:now-30}]}};
        window.__candidateSource=['# Résumé 🦋','日本語 source','<script>window.sourceExecuted=true</script>','Long source '.repeat(90),''].join(String.fromCharCode(10));
        const messages=[{seq:1,sender:'user',kind:'message',text:run.prompt,created:now-245},
          {seq:2,sender:'piper',kind:'task_progress',text:'',run_id:id,created:now-240,progress:{...progress,presentation:{mode:'staged',stages:['Inspect layout','Verify behavior'],current_stage:1,promoted:true}}},
          {seq:3,sender:'piper',kind:'assistant',text:'I am checking the task layout on this native display.',run_id:id,created:now-230,progress},
          {seq:4,sender:'piper',kind:'assistant',text:'The retained reading position and draft are being checked.',run_id:id,created:now-200,progress},
          {seq:5,sender:'piper',kind:'result',run_id:'run-screenshot',text:'Source file for native preview.',created:now,attachments:[{id:'native-skill',kind:'file',name:'skill.md',size:1200}]}];
        const original=window.fetch.bind(window),json=v=>Promise.resolve(new Response(JSON.stringify(v),{status:200,headers:{'Content-Type':'application/json'}}));
        window.fetch=(input,options={})=>{const path=new URL(typeof input==='string'?input:input.url,location.href).pathname;
          if(path==='/api/chats/dm-piper')return json({chat:{id:'dm-piper',name:'Piper',members:['piper']},messages,page:{has_before:false,has_after:false}});
          if(path==='/api/runs')return json([run]);if(path==='/api/runs/'+id)return json({run,events:[],attachments:[],approvals:[]});
          if(path==='/api/activity')return json({});
          if(path==='/api/deliverables/native-skill')return Promise.resolve(new Response(window.__candidateSource,{status:200,headers:{'Content-Type':'text/markdown;charset=utf-8'}}));
          return original(input,options);};
        const p=document.querySelector('#prompt');window.__candidateEditor=p;p.textContent='Combined candidate draft';p.dispatchEvent(new InputEvent('input',{bubbles:true}));window.dispatchEvent(new Event('online'));true
        """)
        try await waitFor("native long-job header and source attachment", timeout:20) {
            try await self.boolean("!!document.querySelector('[data-progress-group=\"native-long-job\"]') && !!document.querySelector('[aria-label=\"File: skill.md\"]')")
        }
        _ = try await js("const d=document.querySelector('[data-progress-group=\"native-long-job\"] details');if(!d.open)d.querySelector('summary').click();true")
        try await waitFor("expanded native task commentary") { try await self.boolean("!!document.querySelector('.progress-commentary')?.getClientRects().length") }
        let nesting=try await boolean("[...document.querySelectorAll('.progress-commentary')].every(n=>{const h=document.querySelector('[data-progress-group=\"native-long-job\"]'),p=n.querySelector('.message-text-content'),a=h.querySelector('.summary-progress-activity');return h.compareDocumentPosition(n)&Node.DOCUMENT_POSITION_FOLLOWING && p.getBoundingClientRect().top>=h.querySelector('summary').getBoundingClientRect().bottom && Math.abs(p.getBoundingClientRect().x-a.getBoundingClientRect().x-parseFloat(getComputedStyle(a).paddingInlineStart))<1 && p.getBoundingClientRect().right<=innerWidth})")
        XCTAssertTrue(nesting)
        _ = try await js("[...document.querySelectorAll('[aria-label=\"File: skill.md\"] button')].find(b=>b.textContent==='Preview').click();true")
        try await waitFor("native Markdown source dialog") { try await self.boolean("!!document.querySelector('.document-dialog[open] .document-source-code')") }
        try await waitFor("settled native source modal") { try await self.boolean("(()=>{const n=document.querySelector('.document-dialog[open]'),s=n&&getComputedStyle(n);return !!n && Number(s.opacity)===1 && s.transform==='none' && !n.getAnimations().some(a=>a.playState==='running')})()") }
        let sourceOK=try await boolean("document.querySelector('.document-source-code').textContent===window.__candidateSource && document.querySelector('.document-source-gutter').textContent===[1,2,3,4,5].join(String.fromCharCode(10)) && !document.querySelector('.document-source script,.document-source img,.document-source a') && !window.sourceExecuted && document.documentElement.scrollWidth<=innerWidth && document.querySelector('.document-source').scrollWidth>document.querySelector('.document-source').clientWidth")
        XCTAssertTrue(sourceOK)
        let screenshot=XCTAttachment(image:UIGraphicsImageRenderer(bounds: window.bounds).image { _ in window.drawHierarchy(in: window.bounds, afterScreenUpdates: true) });screenshot.name="native-markdown-source";screenshot.lifetime = .keepAlways;add(screenshot)
        _ = try await js("document.querySelector('.document-dialog[open]').close();true")
        let preserved=try await boolean("window.__candidateEditor===document.querySelector('#prompt') && window.__candidateEditor.textContent==='Combined candidate draft'")
        XCTAssertTrue(preserved)
        let centered=try await boolean("(()=>{const n=document.querySelector('#bot-details'),r=n.getBoundingClientRect();return getComputedStyle(n).position==='absolute' && r.left>=0 && r.right<=innerWidth})()")
        XCTAssertTrue(centered)
        let report:[String:Any]=["nativeHost":true,"uiManifest":try await js("window.__sendSurfaceFixture") ?? [:],"scene":window.bounds.debugDescription,"taskNesting":nesting,"markdownSource":sourceOK,"draftRetained":preserved,"nametagWithinViewport":centered]
        let attachment=XCTAttachment(data:try JSONSerialization.data(withJSONObject:report,options:[.prettyPrinted,.sortedKeys]),uniformTypeIdentifier:"public.json");attachment.name="native-combined-polish";attachment.lifetime = .keepAlways;add(attachment)
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

    func testNativeDictationComposerStatesKeepDraftAndKeyboard() async throws {
        for theme in ["dark", "light"] {
            for scale in [1.0, 1.5] {
                for keyboard in [false, true] {
                    let prefix = "dictation-" + theme + (scale == 1 ? "-100" : "-150") + (keyboard ? "-open" : "-closed")
                    _ = try await js("document.documentElement.dataset.theme='\(theme)';window.__KINDRED_SYSTEM_TEXT_SCALE=\(scale);window.dispatchEvent(new CustomEvent('kindred-system-text-size',{detail:{scale:\(scale)}}));const p=document.querySelector('#prompt');p.textContent='';p.dispatchEvent(new InputEvent('input',{bubbles:true}));p.\(keyboard ? "focus({preventScroll:true})" : "blur()");true")
                    if !keyboard { window.endEditing(true) }
                    try await waitFor("native keyboard state " + prefix) { self.keyboardVisible == keyboard }
                    try await waitFor("native capability reconciled") {
                        try await self.boolean("window.__KINDRED_IOS_DICTATION?.onDeviceAvailable===true && !!document.querySelector('.dictation-button')?.getClientRects().length")
                    }
                    _ = try await checkComposer(label: prefix + "-empty")
                    _ = try await js("const p=document.querySelector('#prompt');p.textContent='Left Right';p.dispatchEvent(new InputEvent('input',{bubbles:true}));const r=document.createRange();r.setStart(p.firstChild,5);r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r);true")
                    _ = try await checkComposer(label: prefix + "-typing")
                    _ = try await js("const m=document.querySelector('.dictation-button');m.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerType:'touch'}));m.click();true")
                    try await waitFor("native injected recording") { self.session.dictation.phase == "recording" }
                    let operation = try XCTUnwrap(session.dictation.operation)
                    session.dictation.acceptRecognition(text: "spoken words", final: false, failed: false, operation: operation)
                    try await waitFor("live native partial in current draft") {
                        try await self.boolean("document.querySelector('#prompt').textContent==='Left spoken words Right'")
                    }
                    XCTAssertEqual(keyboardVisible, keyboard, "Dictation must not change keyboard visibility")
                    _ = try await checkComposer(label: prefix + "-dictating")
                    _ = try await js("document.querySelector('.dictation-button').click();true")
                    try await waitFor("native stop received") { self.session.dictation.phase == "finishing" }
                    session.dictation.acceptRecognition(text: "spoken words", final: true, failed: false, operation: operation)
                    try await waitFor("final committed once and editable") {
                        try await self.boolean("!document.querySelector('#prompt .dictation-transcript') && document.querySelector('#prompt').textContent==='Left spoken words Right'")
                    }
                    XCTAssertEqual(keyboardVisible, keyboard)
                    _ = try await checkComposer(label: prefix + "-stopped")
                    _ = try await js("const m=document.querySelector('.dictation-button');m.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerType:'touch'}));m.click();true")
                    try await waitFor("second native operation") { self.session.dictation.phase == "recording" }
                    let cancelled = try XCTUnwrap(session.dictation.operation)
                    session.dictation.acceptRecognition(text: "discard words", final: false, failed: false, operation: cancelled)
                    try await waitFor("second native partial") { try await self.boolean("document.querySelector('#prompt').textContent.includes('discard words')") }
                    _ = try await js("document.querySelector('.dictation-cancel').click();true")
                    try await waitFor("cancel removes only current span") {
                        try await self.boolean("!document.querySelector('#prompt .dictation-transcript') && document.querySelector('#prompt').textContent==='Left spoken words Right'")
                    }
                    session.dictation.acceptRecognition(text: "late words", final: true, failed: false, operation: cancelled)
                    XCTAssertEqual(keyboardVisible, keyboard)
                    _ = try await checkComposer(label: prefix + "-cancelled")
                    let sendCount = try await js("window.__composerSends.length") as? Int
                    XCTAssertEqual(sendCount, 0, "Dictation never sends")
                }
            }
        }
    }

    func testDictationRestartsAfterAccountsSheetAndCachedHostSuspension() async throws {
        _ = try await js("const p=document.querySelector('#prompt');p.textContent='Retained draft';p.dispatchEvent(new InputEvent('input',{bubbles:true}));true")
        for suspension in ["accounts-sheet", "cached-host"] {
            _ = try await js("document.querySelector('.dictation-button').click();true")
            try await waitFor("recording before " + suspension) { self.session.dictation.phase == "recording" }
            if suspension == "accounts-sheet" { session.setNativeNavigationBlocked(true) }
            else { session.detachVisibleHost() }
            try await waitFor("suspended utterance cancelled") {
                guard self.session.dictation.operation == nil else { return false }
                return try await self.boolean("!document.querySelector('#composer').classList.contains('is-dictating')")
            }
            session.setNativeNavigationBlocked(false)
            _ = try await js("document.querySelector('.dictation-button').click();true")
            try await waitFor("same document restarts after " + suspension) { self.session.dictation.phase == "recording" }
            _ = try await js("document.querySelector('.dictation-cancel').click();true")
            try await waitFor("restart cancelled without sending") { self.session.dictation.operation == nil }
            let draft = try await js("document.querySelector('#prompt').textContent") as? String
            XCTAssertEqual(draft, "Retained draft")
            let sends = try await js("window.__composerSends.length") as? Int
            XCTAssertEqual(sends, 0)
        }
    }

    func testKeyboardOwnershipContractedOrdinaryFocus() async throws {
        try await captureKeyboardOwnership(fullHeight: false, preventScroll: false)
    }
    func testKeyboardOwnershipFullHeightOrdinaryFocus() async throws {
        try await captureKeyboardOwnership(fullHeight: true, preventScroll: false)
    }
    func testKeyboardOwnershipContractedPreventScrollFocus() async throws {
        try await captureKeyboardOwnership(fullHeight: false, preventScroll: true)
    }
    func testKeyboardOwnershipFullHeightPreventScrollFocus() async throws {
        try await captureKeyboardOwnership(fullHeight: true, preventScroll: true)
    }

    private func captureKeyboardOwnership(fullHeight: Bool, preventScroll: Bool) async throws {
        XCTAssertEqual(!isContractedDiagnostic, fullHeight)
        let phase = "keyboard-ownership-\(fullHeight ? "full-height" : "contracted")-\(preventScroll ? "prevent-scroll" : "ordinary")"
        let start = ProcessInfo.processInfo.systemUptime
        // Fixed synthetic input only. Serialize equality, never editable text.
        let draft = await boundedFailurePage("""
            (()=>{const p=document.querySelector('#prompt');
              p.textContent='Keyboard ownership fixture draft';
              p.dispatchEvent(new InputEvent('input',{bubbles:true}));
              return {staged:p.textContent==='Keyboard ownership fixture draft'};})()
            """)
        let before = await keyboardOwnershipSample(start: start)
        let focusStarted = ProcessInfo.processInfo.systemUptime
        let focus = await boundedFailurePage("""
            (()=>{const p=document.querySelector('#prompt');
              \(preventScroll ? "p.focus({preventScroll:true});" : "p.focus();")
              return {focused:document.activeElement===p};})()
            """)
        var samples: [[String: Any]] = []
        let observationEnd = focusStarted + 8
        while ProcessInfo.processInfo.systemUptime < observationEnd {
            let remaining = observationEnd - ProcessInfo.processInfo.systemUptime
            samples.append(await keyboardOwnershipSample(start: start, timeoutSeconds: min(2, remaining)))
            try await Task.sleep(nanoseconds: 250_000_000)
        }
        // A keyboard notification is evidence, not inferred from a shorter view.
        while !keyboardVisible && ProcessInfo.processInfo.systemUptime - focusStarted < 12 {
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        let after = await keyboardOwnershipSample(start: start)
        let renderer = UIGraphicsImageRenderer(bounds: window.bounds)
        var rendered = false
        let image = renderer.image { _ in
            rendered = window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
        }
        let evidence: [String: Any] = ["schemaVersion": 1, "diagnosticOnly": true,
            "phase": phase, "method": name,
            "methodIdentifier": "ComposerUIKitTests/testKeyboardOwnership\(fullHeight ? "FullHeight" : "Contracted")\(preventScroll ? "PreventScroll" : "Ordinary")Focus()",
            "intent": ["hostContract": fullHeight ? "full-height" : "contracted",
                "focusMode": preventScroll ? "prevent-scroll" : "ordinary"],
            "beforeFocus": before, "focusStartedAt": focusStarted, "observationEnd": observationEnd,
            "focusResult": focus, "samples": samples, "after": after,
            "keyboardEvents": keyboardOwnershipEvents, "keyboardVisible": keyboardVisible,
            "keyboardShows": keyboardShows, "keyboardHides": keyboardHides,
            "focusToEndSeconds": ProcessInfo.processInfo.systemUptime - focusStarted,
            "screenshot": ["captured": rendered, "width": image.size.width, "height": image.size.height,
                "source": "fixture UIWindow.drawHierarchy; system keyboard window may be excluded"],
            "proofScope": "four-condition diagnostic only; not original Composer release acceptance"]
        let png = XCTAttachment(image: image); png.name = phase + "-screenshot"; png.lifetime = .keepAlways; add(png)
        let json = try JSONSerialization.data(withJSONObject: evidence, options: [.sortedKeys])
        let attachment = XCTAttachment(data: json, uniformTypeIdentifier: "public.json")
        attachment.name = phase + "-geometry"; attachment.lifetime = .keepAlways; add(attachment)
        // Observational completeness only: zero viewport/hits stay recorded.
        XCTAssertEqual((draft["page"] as? [String: Any])?["staged"] as? Bool, true)
        XCTAssertEqual((before["native"] as? [String: Any])?["keyboardVisible"] as? Bool, false)
        XCTAssertTrue(rendered)
        XCTAssertTrue(keyboardVisible)
        XCTAssertGreaterThanOrEqual(keyboardShows, 1)
        XCTAssertTrue(keyboardOwnershipEvents.contains { event in
            event["event"] as? String == "keyboardDidShow" &&
                ((event["time"] as? TimeInterval).map { $0 >= focusStarted && $0 <= focusStarted + 12 } ?? false)
        }, "Missing keyboard notification within the focus-anchored twelve-second budget")
        XCTAssertEqual((focus["page"] as? [String: Any])?["focused"] as? Bool, true)
        XCTAssertGreaterThanOrEqual(samples.count, 2)
        for sample in [before] + samples + [after] {
            let native = try XCTUnwrap(sample["native"] as? [String: Any])
            XCTAssertEqual(native["webInFixtureWindow"] as? Bool, true)
            XCTAssertEqual(native["fixtureWindowKey"] as? Bool, true)
            XCTAssertEqual(native["fixtureWindowHidden"] as? Bool, false)
            let result = try XCTUnwrap(sample["javascript"] as? [String: Any])
            let page = try XCTUnwrap(result["page"] as? [String: Any], "Missing bounded JS observation")
            XCTAssertEqual(page["draftMatches"] as? Bool, true)
            XCTAssertEqual(page["sendCount"] as? Int, 0)
            XCTAssertEqual(page["uiMatches"] as? Bool, true)
        }
    }

    private func keyboardOwnershipSample(start: TimeInterval, timeoutSeconds: TimeInterval = 2) async -> [String: Any] {
        let requested = ProcessInfo.processInfo.systemUptime
        let page = await boundedFailurePage("""
            (()=>{const rect=e=>{if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}};
              const p=document.querySelector('#prompt'),shell=document.querySelector('#app'),v=visualViewport;
              return {draftMatches:p?.textContent==='Keyboard ownership fixture draft',sendCount:window.__composerSends.length,
                uiMatches:window.__sendSurfaceFixture?.['style.css']==='61733dc3eb2ac9e551333e9daf0d982a6dd98a19775d453f50bccec2d5d80a5c'&&window.__sendSurfaceFixture?.['app.js']==='d8e01fc9452bc61b5d2e93e559b609f6680e8b5c723dd7825c73b48954c8cfda' && window.__sendSurfaceFixture?.['progress.css']==='2d9008b00da3d458ab4998a8ed210ae1efbb3ba408c47e73ee88c75567d7da7e'&&window.__sendSurfaceFixture?.['commands.js']==='5f4f2e6b9ee5cd0141ab36625da8c60fe6e98aa0488abf1a20e3e33d97095046' && window.__sendSurfaceFixture?.['dictation.js']==='c877a031e2f279deb18ea44450689b1db14848d74e1b5855d79f495976bd6121' && window.__sendSurfaceFixture?.['voice.js']==='dd3f0c713d77f319ac80ce61c01fbf2db6975fc00574687d9296cff876df64be' && window.__sendSurfaceFixture?.['slack-monitoring.js']==='8a885993ecd5da1c6d0b3917c79a2940e0f5a9fb6bf2f607b49b117d6f70fe10' && window.__sendSurfaceFixture?.['characters.js']==='2e6283b9f301283ea5c695856cc11b8eb539c31bdbd7a08975eeb45434c2c040',
                uiManifest:window.__sendSurfaceFixture,viewport:{width:innerWidth,height:innerHeight},
                client:{width:document.documentElement.clientWidth,height:document.documentElement.clientHeight},
                visual:v?{width:v.width,height:v.height,offsetTop:v.offsetTop,offsetLeft:v.offsetLeft,scale:v.scale}:null,
                shell:rect(shell),resizing:shell?.dataset.mobileResizing==='true',
                windowScroll:{x:scrollX,y:scrollY,top:document.scrollingElement?.scrollTop??0},
                firstPromptFocus:window.__composerFirstPromptFocus??null,focusTrace:window.__composerFocusTrace,
                controls:[...document.querySelectorAll('#composer-actions,#send,.dictation-button')].filter(e=>e.getClientRects().length).map(e=>{const r=rect(e),h=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {...r,hit:h===e||e.contains(h)}})};})()
            """, timeoutSeconds: timeoutSeconds)
        return ["elapsed": ProcessInfo.processInfo.systemUptime - start,
            "pageRequestedAt": requested, "pageTimeoutSeconds": timeoutSeconds, "pageReturnedAt": ProcessInfo.processInfo.systemUptime,
            "javascript": page, "nativeTakenAt": ProcessInfo.processInfo.systemUptime,
            "native": nativeAttachmentEvidence()]
    }

    private func js(_ source: String) async throws -> Any? {
        // A WK page retains its global lexical environment between evaluations.
        // A block isolates const/let while preserving expression/Promise results.
        return try await withCheckedThrowingContinuation { continuation in
            session.webView.evaluateJavaScript("{\n\(source)\n}") { value, error in
                if let error { continuation.resume(throwing: error) }
                else { continuation.resume(returning: value) }
            }
            // Pair the queued script with UIKit focus immediately, before the
            // asynchronous DOM focus runs. Actual touch is a separate check.
            if source.contains(".focus("), session.glassControls.composer.isHidden { session.webView.becomeFirstResponder() }
        }
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
        evidence["nativeAttachment"] = nativeAttachmentEvidence()
        if let url = session?.webView.url {
            evidence["url"] = ["scheme": url.scheme ?? "", "host": url.host ?? "",
                "port": url.port ?? 0, "path": url.path] as [String: Any]
        }
        let pageScript = """
            (()=>{const p=document.querySelector('#prompt');let sessionPresent=null,storageReadable=true;
              try {sessionPresent=!!sessionStorage.getItem('kindred-token')} catch {storageReadable=false}
              return {
              visibility:document.visibilityState,documentFocused:document.hasFocus(),nativeComposerFocused:window.__KINDRED_NATIVE_COMPOSER_FOCUSED===true,nativeComposerActive:p?.parentElement.hasAttribute('data-ios-native-composer'),
              focusTrace:window.__composerFocusTrace??[],firstPromptFocus:window.__composerFirstPromptFocus??null,
              windowScroll:{x:scrollX,y:scrollY,top:document.scrollingElement?.scrollTop??0,left:document.scrollingElement?.scrollLeft??0,
                height:document.scrollingElement?.scrollHeight??0,clientHeight:document.documentElement.clientHeight},
              viewport:{width:innerWidth,height:innerHeight,clientWidth:document.documentElement.clientWidth,clientHeight:document.documentElement.clientHeight,
                visual:visualViewport?{width:visualViewport.width,height:visualViewport.height,offsetLeft:visualViewport.offsetLeft,offsetTop:visualViewport.offsetTop,scale:visualViewport.scale}:null},
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

    /// Read-only geometry and attachment diagnostics. No view/input text,
    /// URLs, credentials or private UIKit child descriptions are serialized.
    private func nativeAttachmentEvidence() -> [String: Any] {
        func rect(_ value: CGRect) -> [String: Double] {
            ["x": Double(value.minX), "y": Double(value.minY),
             "width": Double(value.width), "height": Double(value.height)]
        }
        var ancestors: [[String: Any]] = []
        var view: UIView? = session.webView
        while let current = view, ancestors.count < 12 {
            ancestors.append(["class": String(describing: type(of: current)),
                "bounds": rect(current.bounds), "frame": rect(current.frame),
                "hidden": current.isHidden, "alpha": Double(current.alpha),
                "hasWindow": current.window != nil,
                "inFixtureWindow": current.window === window])
            view = current.superview
        }
        let web = session.webView
        let scroll = web.scrollView
        let webFrame = web.convert(web.bounds, to: window)
        let keyboardInWindow = window.convert(keyboardFrame, from: nil)
        let intersection = webFrame.intersection(keyboardInWindow)
        func insets(_ value: UIEdgeInsets) -> [String: Double] {
            ["top": Double(value.top), "bottom": Double(value.bottom),
             "left": Double(value.left), "right": Double(value.right)]
        }
        let contentViews: [[String: Any]] = scroll.subviews.prefix(8).map { view in
            ["class": String(describing: type(of: view)), "bounds": rect(view.bounds),
             "frame": rect(view.frame), "frameInFixtureWindow": rect(view.convert(view.bounds, to: window)),
             "hidden": view.isHidden, "alpha": Double(view.alpha)]
        }
        let composer=session.glassControls.composer
        return ["nativeComposer":["firstResponder":composer.editor.isFirstResponder,"canFocus":composer.editor.canBecomeFirstResponder,"editable":composer.editor.isEditable,"hidden":composer.isHidden,"hasModel":composer.model != nil,"inFixtureWindow":composer.window === window,"focusRequests":composer.focusRequests,"focusAccepted":composer.focusAccepted],"ancestors": ancestors, "fixtureWindowKey": window.isKeyWindow,
            "fixtureWindowHidden": window.isHidden,
            "sceneActivation": window.windowScene?.activationState.rawValue ?? -1,
            "applicationState": UIApplication.shared.applicationState.rawValue,
            "webInFixtureWindow": web.window === window,
            "webHasSuperview": web.superview != nil,
            "webFrameInFixtureWindow": rect(web.convert(web.bounds, to: window)),
            "scrollBounds": rect(web.scrollView.bounds),
            "scrollOffset": ["x": Double(web.scrollView.contentOffset.x), "y": Double(web.scrollView.contentOffset.y)],
            "zoomScale": Double(web.scrollView.zoomScale),
            "scrollContentSize": ["width": Double(scroll.contentSize.width), "height": Double(scroll.contentSize.height)],
            "scrollContentInset": insets(scroll.contentInset), "scrollAdjustedContentInset": insets(scroll.adjustedContentInset),
            "scrollEnabled": scroll.isScrollEnabled, "scrollDragging": scroll.isDragging,
            "scrollDecelerating": scroll.isDecelerating, "scrollContentViews": contentViews,
            "keyboardFrameInFixtureWindow": rect(keyboardInWindow),
            "keyboardIntersectionHeight": keyboardVisible && !intersection.isNull ? Double(intersection.height) : 0,
            "keyboardVisible": keyboardVisible, "keyboardFrame": rect(keyboardFrame)]
    }

    private func boundedFailurePage(_ source: String, timeoutSeconds: TimeInterval = 2) async -> [String: Any] {
        await withCheckedContinuation { continuation in
            let probe = FailurePageProbe(continuation)
            let timeout = Task { @MainActor in
                do { try await Task.sleep(nanoseconds: UInt64(max(0, min(2, timeoutSeconds)) * 1_000_000_000)) }
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
            if source.contains(".focus("), session.glassControls.composer.isHidden { session.webView.becomeFirstResponder() }
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
        const send=document.querySelector('#send')?.getClientRects().length?document.querySelector('#send'):document.querySelector('.dictation-button'),surface=getComputedStyle(send,'::before'),arrow=send.querySelector('svg'),style=getComputedStyle(send);
        const colour=document.createElement('canvas').getContext('2d');colour.fillStyle=surface.backgroundColor;colour.fillRect(0,0,1,1);const rgba=[...colour.getImageData(0,0,1,1).data];
        const primarySurface={selector:send.id==='send'?'#send':'.dictation-button',controlKind:send.id==='send'?'send':'microphone',capability:window.__KINDRED_IOS_DICTATION};
        const target=rect(send),edgeHits=[[20,0],[-20,0],[0,20],[0,-20]].map(([dx,dy])=>{const h=document.elementFromPoint(target.x+target.width/2+dx,target.y+target.height/2+dy);return h===send||send.contains(h)});
        return {focusTrace:window.__composerFocusTrace??[],firstPromptFocus:window.__composerFirstPromptFocus??null,windowScroll:{x:scrollX,y:scrollY,top:document.scrollingElement?.scrollTop??0,left:document.scrollingElement?.scrollLeft??0,height:document.scrollingElement?.scrollHeight??0},dictationState:{draftPresent:!!p.textContent.trim(),transientSpan:!!p.querySelector('.dictation-transcript'),dictating:c.classList.contains('is-dictating'),lastEvent:window.__composerDictationEvents.at(-1)??null,sendCount:window.__composerSends.length,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches},primarySurface:{...primarySurface,edgeHits,target,arrow:rect(arrow),paint:{width:parseFloat(surface.width),height:parseFloat(surface.height),left:parseFloat(surface.left),top:parseFloat(surface.top),rgba},opacity:parseFloat(style.opacity),appearance:style.appearance,theme:document.documentElement.dataset.theme,hidden:send.hidden,disabled:send.disabled,fixture:window.__sendSurfaceFixture},layout:{shell:rect(document.querySelector('#app')),resizing:document.querySelector('#app').dataset.mobileResizing==='true',mode:document.documentElement.dataset.iosLayout??'',textScale:parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--text-scale'))||1},composer:rect(c),prompt:rect(p),reply:reply?.getClientRects().length?rect(reply):null,files:files?.getClientRects().length?rect(files):null,viewport:{width:innerWidth,height:innerHeight},native:window.__KINDRED_NATIVE_GEOMETRY,
        controls:[...c.querySelectorAll('#composer-actions,#send,.dictation-button,.dictation-cancel')].filter(b=>b.getClientRects().length).map(b=>{const r=rect(b),h=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {...r,enabled:!b.disabled,hit:h===b||b.contains(h)}})}})()
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
            self.layoutEvidence["latestNativeAttachment"] = self.nativeAttachmentEvidence()
            if self.layoutEvidence["firstNativeAttachment"] == nil { self.layoutEvidence["firstNativeAttachment"] = self.layoutEvidence["latestNativeAttachment"] }
            self.layoutEvidence["latest"] = sample
            if self.layoutEvidence["first"] == nil { self.layoutEvidence["first"] = sample }
            let nativeComposer=self.session.glassControls.composer
            let sourceControls=sample["controls"] as? [[String:Any]] ?? []
            let nativeReady = nativeComposer.isHidden || sourceControls.allSatisfy { row in
                let r=CGRect(x:(row["x"] as? Double) ?? 0,y:(row["y"] as? Double) ?? 0,width:(row["width"] as? Double) ?? 0,height:(row["height"] as? Double) ?? 0)
                return nativeComposer.model?.items.contains { item in
                    item.kind=="button" && abs(item.frame.minX-r.minX)<1 && abs(item.frame.minY-r.minY)<1 && abs(item.frame.width-r.width)<1 && abs(item.frame.height-r.height)<1
                } == true
            }
            let stable = stamp != nil && stamp == previousStamp && nativeReady
            previousStamp = stamp
            if stable { measured = sample }
            return stable
        }
        var metrics = try XCTUnwrap(measured)
        metrics["layoutTransition"] = layoutEvidence
        metrics["recognitionSource"] = "injected native coordinator; not actual speech"
        metrics["nativeReduceMotion"] = UIAccessibility.isReduceMotionEnabled
        metrics["keyboardVisible"] = keyboardVisible
        metrics["nativeSpeechPhase"] = session.dictation.phase
        metrics["nativeSpeechOperationActive"] = session.dictation.operation != nil
        metrics["keyboardNotifications"] = ["shows": keyboardShows, "hides": keyboardHides]
        metrics["keyboardFrame"] = ["x": keyboardFrame.minX, "y": keyboardFrame.minY, "width": keyboardFrame.width, "height": keyboardFrame.height]
        let c = try XCTUnwrap(metrics["composer"] as? [String: Double])
        let p = try XCTUnwrap(metrics["prompt"] as? [String: Double])
        let controls = try XCTUnwrap(metrics["controls"] as? [[String: Any]])
        XCTAssertGreaterThanOrEqual(controls.count, 2)
        XCTAssertGreaterThanOrEqual(p["height"] ?? 0, 24)
        if (c["height"] ?? .infinity) <= 60 {
            XCTAssertEqual((p["y"] ?? 0) + (p["height"] ?? 0) / 2,
                           (c["y"] ?? 0) + (c["height"] ?? 0) / 2, accuracy: 1,
                           "Idle text must be centered in the composer pill")
        }
        let providerHidden = try await boolean("!document.querySelector('#composer-hint').getClientRects().length")
        XCTAssertTrue(providerHidden, "Native composer omits the provider in every state")
        if let reply = metrics["reply"] as? [String: Double], let files = metrics["files"] as? [String: Double] {
            XCTAssertLessThanOrEqual(reply["bottom"] ?? .infinity, (files["y"] ?? 0) + 1)
            XCTAssertLessThanOrEqual(files["bottom"] ?? .infinity, (p["y"] ?? 0) + 1)
        }
        for b in controls {
            XCTAssertGreaterThanOrEqual((b["width"] as? Double) ?? 0, 44)
            XCTAssertGreaterThanOrEqual((b["height"] as? Double) ?? 0, 44)
            if !session.glassControls.composer.isHidden,session.glassControls.composer.model != nil {
                let rect=CGRect(x:(b["x"] as? Double) ?? 0,y:(b["y"] as? Double) ?? 0,width:(b["width"] as? Double) ?? 0,height:(b["height"] as? Double) ?? 0)
                _ = try nativeButton(rect:rect,enabled:b["enabled"] as? Bool != false)
            } else { XCTAssertEqual(b["hit"] as? Bool,true) }
            XCTAssertGreaterThanOrEqual((b["x"] as? Double) ?? -1, c["x"] ?? 0)
            XCTAssertLessThanOrEqual((b["right"] as? Double) ?? .infinity, c["right"] ?? 0)
            XCTAssertLessThanOrEqual((b["bottom"] as? Double) ?? .infinity, c["bottom"] ?? 0)
        }
        let native = try XCTUnwrap(metrics["native"] as? [String: Any])
        let safe = try XCTUnwrap(native["safeArea"] as? [String: Double])
        let webInsets = session.webView.safeAreaInsets
        XCTAssertEqual(safe["bottom"] ?? -1, Double(webInsets.bottom), accuracy: 2)
        XCTAssertEqual(safe["top"] ?? -1, Double(webInsets.top), accuracy: 2)
        XCTAssertEqual(safe["left"] ?? -1, Double(webInsets.left), accuracy: 2)
        XCTAssertEqual(safe["right"] ?? -1, Double(webInsets.right), accuracy: 2)
        if keyboardVisible {
            let composerBottom = session.webView.convert(CGPoint(x: 0, y: c["bottom"] ?? 0), to: window).y
            let keyboardTop = window.convert(keyboardFrame, from: nil).minY
            XCTAssertGreaterThanOrEqual(keyboardTop - composerBottom, 6)
            XCTAssertLessThanOrEqual(keyboardTop - composerBottom, 18,
                                     "Composer stays adjacent to the real keyboard, without an empty gap")
        }
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

    private func setFixtureAppearance(_ theme: String) async throws {
        window.endEditing(true)
        try await waitFor("Appearance setting keyboard dismissal") { !self.keyboardVisible }
        _ = try await js("document.querySelector('#settings-button').click();true")
        try await waitFor("Appearance Theme control is loaded") {
            try await self.boolean("!!document.querySelector('#settings-dialog[open] select[aria-label=Theme]:not(:disabled)')")
        }
        // applyGeneral owns the DOM theme. A DOM-only override leaves the
        // saved account setting dark and is reverted by UIKit's media change.
        _ = try await js("const theme=document.querySelector('#settings-dialog select[aria-label=Theme]');theme.value='\(theme)';theme.dispatchEvent(new Event('change',{bubbles:true}));true")
        try await waitFor("Appearance Theme is saved") {
            try await self.boolean("document.querySelector('.general-settings-form .preference-status')?.textContent==='Saved' && document.documentElement.dataset.theme==='\(theme)'")
        }
        _ = try await js("window.__composerSavedTheme=null;fetch('/api/settings').then(r=>r.json()).then(v=>window.__composerSavedTheme=v.theme);true")
        try await waitFor("Appearance Theme persists in the fixture") {
            try await self.boolean("window.__composerSavedTheme==='\(theme)'")
        }
        _ = try await js("document.querySelector('#settings-close').click();true")
        try await waitFor("Appearance setting dismissal") {
            try await self.boolean("!document.querySelector('#settings-dialog').open")
        }
    }

    private func checkSendSurfaceMatrix() async throws {
        for theme in ["dark", "light"] {
            try await setFixtureAppearance(theme)
            for populated in [false, true] {
                for keyboard in [false, true] {
                    let label = "send-" + theme + (populated ? "-populated" : "-empty") + (keyboard ? "-open" : "-closed")
                    let draft = populated ? "Send surface fixture" : ""
                    _ = try await js("const p=document.querySelector('#prompt');p.textContent='\(draft)';p.dispatchEvent(new InputEvent('input',{bubbles:true}));p.\(keyboard ? "focus({preventScroll:true})" : "blur()");true")
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
        try await setFixtureAppearance("dark")
        _ = try await js("const p=document.querySelector('#prompt');p.textContent='';p.dispatchEvent(new InputEvent('input',{bubbles:true}));true")
        let sends = try await js("window.__composerSends.length") as? Int
        XCTAssertEqual(sends, 1, "Paint matrix must not submit another message")
    }

    private func nativeButton(rect:CGRect,enabled:Bool=true) throws -> UIButton {
        if !enabled {
            let button=try XCTUnwrap(session.glassControls.composer.material.contentView.subviews.compactMap {$0 as? UIButton}.first { view in
                let f=session.webView.convert(view.bounds,from:view)
                return abs(f.minX-rect.minX)<1 && abs(f.minY-rect.minY)<1 && abs(f.width-rect.width)<1 && abs(f.height-rect.height)<1
            },"disabled action retains its native control and geometry")
            XCTAssertFalse(button.isEnabled,"Dictation disables sending while recording")
            return button
        }
        let point=session.webView.convert(CGPoint(x:rect.midX,y:rect.midY),to:window)
        var hit=window.hitTest(point,with:nil)
        while let candidate=hit,!(candidate is UIButton) { hit=candidate.superview }
        if !(hit is UIButton) {
            func describe(_ view:UIView)->[String:Any] { ["type":String(describing:type(of:view)),"id":view.accessibilityIdentifier ?? "","frame":session.webView.convert(view.bounds,from:view).debugDescription,"hidden":view.isHidden,"alpha":view.alpha,"interaction":view.isUserInteractionEnabled,"enabled":(view as? UIControl)?.isEnabled ?? true] }
            let composer=session.glassControls.composer
            let evidence:[String:Any]=["phase":layoutEvidence["phase"] ?? "","point":point.debugDescription,"rect":rect.debugDescription,"hit":window.hitTest(point,with:nil).map(describe) ?? [:],"composer":describe(composer),"material":describe(composer.material),"children":composer.material.contentView.subviews.map(describe)]
            let data=try JSONSerialization.data(withJSONObject:evidence,options:[.prettyPrinted,.sortedKeys]);let a=XCTAttachment(data:data,uniformTypeIdentifier:"public.json");a.name="native-button-hit-failure";a.lifetime = .keepAlways;add(a)
        }
        let button=try XCTUnwrap(hit as? UIButton,"native foreground owns the actual UIKit touch")
        XCTAssertTrue(button.accessibilityIdentifier?.hasPrefix("kindred-native-composer-")==true)
        let frame=session.webView.convert(button.bounds,from:button)
        XCTAssertEqual(frame.minX,rect.minX,accuracy:1);XCTAssertEqual(frame.minY,rect.minY,accuracy:1)
        XCTAssertEqual(frame.width,rect.width,accuracy:1);XCTAssertEqual(frame.height,rect.height,accuracy:1)
        return button
    }

    private func checkPaintedSend(_ metrics: [String: Any], image: UIImage, theme: String, label: String) throws {
        let send = try XCTUnwrap(metrics["primarySurface"] as? [String: Any])
        let empty = label.contains("-empty-")
        XCTAssertEqual(send["selector"] as? String, empty ? ".dictation-button" : "#send")
        XCTAssertEqual(send["controlKind"] as? String, empty ? "microphone" : "send")
        let capability = try XCTUnwrap(send["capability"] as? [String: Any])
        XCTAssertEqual(capability["supported"] as? Bool, true)
        XCTAssertEqual(capability["onDeviceAvailable"] as? Bool, true)
        XCTAssertEqual(capability["engine"] as? String, "apple-on-device")
        XCTAssertEqual(send["theme"] as? String, theme)
        XCTAssertEqual(send["hidden"] as? Bool, false)
        XCTAssertEqual(send["appearance"] as? String, "none")
        if session.glassControls.composer.model != nil,!session.glassControls.composer.isHidden {
            let t=try XCTUnwrap(send["target"] as? [String:Double])
            let rect=CGRect(x:t["x"]!,y:t["y"]!,width:t["width"]!,height:t["height"]!)
            let button=try nativeButton(rect:rect)
            XCTAssertNotNil(button.configuration?.image)
            XCTAssertEqual(button.configuration?.background.backgroundInsets,NSDirectionalEdgeInsets(top:4,leading:4,bottom:4,trailing:4))
            let nativeColor=try XCTUnwrap(button.configuration?.baseBackgroundColor).resolvedColor(with:button.traitCollection)
            var r:CGFloat=0,g:CGFloat=0,b:CGFloat=0,a:CGFloat=0;nativeColor.getRed(&r,green:&g,blue:&b,alpha:&a)
            let expected=[Double(r*255),Double(g*255),Double(b*255)]
            for (dx,dy) in [(1.0,0.0),(-1.0,0.0),(0.0,1.0),(0.0,-1.0)] {
                XCTAssertTrue(button.point(inside:CGPoint(x:22+dx*20,y:22+dy*20),with:nil))
                let point=session.webView.convert(CGPoint(x:rect.midX+dx*17,y:rect.midY+dy*17),to:window)
                let actual=try Self.imagePixel(image,point:point)
                XCTAssertLessThanOrEqual(Self.colourDistance(actual,expected),12,"native primary circle is painted with its semantic color")
            }
            return
        }
        let edgeHits = try XCTUnwrap(send["edgeHits"] as? [Bool])
        XCTAssertEqual(edgeHits.count, 4)
        XCTAssertTrue(edgeHits.allSatisfy { $0 }, "Outer target must hit the primary control beyond the painted circle")
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
        let evidence: [String: Any] = ["primarySurface": send, "nativeBitmapProbes": probes]
        let data = try JSONSerialization.data(withJSONObject: evidence, options: [.prettyPrinted, .sortedKeys])
        let attachment = XCTAttachment(data: data, uniformTypeIdentifier: "public.json")
        attachment.name = label + "-painted-primarySurface"
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
