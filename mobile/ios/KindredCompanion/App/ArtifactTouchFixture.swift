#if DEBUG && targetEnvironment(simulator)
import KindredCore
import SwiftUI
import UIKit
import WebKit

/// Simulator-only, opt-in host for real XCUI document gestures. It never opens
/// the saved-account repository or Keychain and only loads the loopback fixture.
@MainActor
final class ArtifactTouchFixture: NSObject, WebSessionHost, WKNavigationDelegate {
    static let active: ArtifactTouchFixture? = ProcessInfo.processInfo.environment["KINDRED_ARTIFACT_TOUCH_UI_TEST"] == "1" ? ArtifactTouchFixture() : nil
    let model: AppModel
    private(set) var session: WebSession!

    override init() {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory:true)
        model = AppModel(secrets:InMemorySecretStore(),repository:AccountRepository(fileURL:folder.appendingPathComponent("accounts.json")))
        super.init()
        let origin = ServerOrigin(url:URL(string:"https://localhost:8765/")!)!
        session = WebSession(account:Account(origin:origin,login:"artifact-touch-fixture"),token:"native-test-token-only",host:self)
        session.webView.stopLoading()
        session.webView.navigationDelegate = self
        session.webView.accessibilityIdentifier = "artifact-touch-webview"
        session.webView.configuration.userContentController.addUserScript(WKUserScript(source:"""
        window.__KINDRED_MOBILE=true;window.__KINDRED_MOBILE_PLATFORM='ios';
        window.__artifactUITarget="\(ProcessInfo.processInfo.environment["KINDRED_ARTIFACT_DOCUMENT"]=="pdf" ? "touch-pdf" : "touch-one")";
        window.__artifactUIProbe={opened:false,selected:false,trustedPairs:0,trustedTouches:0,generation:0,word:null};
        document.addEventListener('touchstart',event=>{const p=window.__artifactUIProbe;if(!event.isTrusted)return;p.trustedTouches++;if(event.touches.length===2&&event.target.closest?.('.document-word,.document-pdf'))p.trustedPairs++},{capture:true,passive:true});
        for(const type of ['touchstart','touchmove','touchend'])document.addEventListener(type,event=>{const p=__artifactUIProbe,v=event.target.closest?.('.document-word,.document-pdf');if(!event.isTrusted||!v)return;if(event.touches.length===2){const [a,b]=event.touches,d=Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);if(!p.pairActive){p.pairStart=d;p.pairActive=true}p.pairLast=d;if(v.matches('.document-pdf'))p.canvasMin=Math.min(p.canvasMin??Infinity,v.querySelectorAll('canvas').length)}else if(type==='touchend')p.pairActive=false},{capture:true,passive:true});
        """,injectionTime:.atDocumentStart,forMainFrameOnly:true))
    }
    func webSession(_ session:WebSession,didReceive message:SessionMessage) {}
    func webSessionRequestedAccounts(_ session:WebSession) {}
    func webSession(_ session:WebSession,show message:String,isError:Bool) {}
    func webSession(_ session:WebSession,didDownload file:URL) {}
    func webView(_ webView:WKWebView,didReceive challenge:URLAuthenticationChallenge,completionHandler:@escaping(URLSession.AuthChallengeDisposition,URLCredential?)->Void) {
        guard challenge.protectionSpace.host=="localhost",challenge.protectionSpace.port==8765,
              challenge.protectionSpace.authenticationMethod==NSURLAuthenticationMethodServerTrust,
              let trust=challenge.protectionSpace.serverTrust else {completionHandler(.cancelAuthenticationChallenge,nil);return}
        completionHandler(.useCredential,URLCredential(trust:trust))
    }
    func webView(_ webView:WKWebView,decidePolicyFor action:WKNavigationAction,decisionHandler:@escaping(WKNavigationActionPolicy)->Void){session.webView(webView,decidePolicyFor:action,decisionHandler:decisionHandler)}
    func webView(_ webView:WKWebView,decidePolicyFor response:WKNavigationResponse,decisionHandler:@escaping(WKNavigationResponsePolicy)->Void){session.webView(webView,decidePolicyFor:response,decisionHandler:decisionHandler)}
    func webView(_ webView:WKWebView,didStartProvisionalNavigation navigation:WKNavigation!){session.webView(webView,didStartProvisionalNavigation:navigation)}
    func webView(_ webView:WKWebView,didFinish navigation:WKNavigation!){session.webView(webView,didFinish:navigation)}
    func webView(_ webView:WKWebView,didFailProvisionalNavigation navigation:WKNavigation!,withError error:Error){session.webView(webView,didFailProvisionalNavigation:navigation,withError:error)}
    func webView(_ webView:WKWebView,didFail navigation:WKNavigation!,withError error:Error){session.webView(webView,didFail:navigation,withError:error)}
}

struct ArtifactTouchFixtureView:UIViewControllerRepresentable {
    let fixture:ArtifactTouchFixture
    func makeUIViewController(context:Context)->ArtifactTouchFixtureController{ArtifactTouchFixtureController(fixture:fixture)}
    func updateUIViewController(_ controller:ArtifactTouchFixtureController,context:Context){}
}

private struct ArtifactTouchContent: View {
    let session: WebSession
    var body: some View {
        NavigationStack {
            WebContainerView(session: session)
                .ignoresSafeArea()
                .ignoresSafeArea(.keyboard)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    if #available(iOS 27.1, *), session.presentation.usesNativeRail {
                        DuoToolbarContent(session: session, manageAccounts: {})
                    }
                }
                .toolbarBackground(.hidden, for: .navigationBar)
                .toolbar(session.presentation.usesNativeRail ? .visible : .hidden, for: .navigationBar)
                .tint(.primary)
        }
        .preferredColorScheme(.dark)
    }
}

@MainActor
final class ArtifactTouchFixtureController:UIViewController {
    let fixture:ArtifactTouchFixture
    private let host:UIHostingController<ArtifactTouchContent>
    private let telemetry=UILabel()
    private var timer:Timer?
    private var publishing=false
    private var started=false
    init(fixture:ArtifactTouchFixture){self.fixture=fixture;host=UIHostingController(rootView:ArtifactTouchContent(session:fixture.session));super.init(nibName:nil,bundle:nil)}
    required init?(coder:NSCoder){fatalError("Synthetic artifact fixture only")}
    override func viewDidLoad(){
        super.viewDidLoad();overrideUserInterfaceStyle = .dark
        addChild(host);view.addSubview(host.view);host.didMove(toParent:self)
        host.view.translatesAutoresizingMaskIntoConstraints=false
        NSLayoutConstraint.activate([host.view.leadingAnchor.constraint(equalTo:view.leadingAnchor),host.view.trailingAnchor.constraint(equalTo:view.trailingAnchor),host.view.topAnchor.constraint(equalTo:view.topAnchor),host.view.bottomAnchor.constraint(equalTo:view.bottomAnchor)])
        telemetry.text="·";telemetry.font = .systemFont(ofSize:1);telemetry.isAccessibilityElement=true
        telemetry.accessibilityIdentifier="artifact-touch-telemetry";telemetry.accessibilityLabel="Artifact touch telemetry";view.addSubview(telemetry)
        timer=Timer.scheduledTimer(withTimeInterval:0.1,repeats:true){[weak self] _ in MainActor.assumeIsolated{self?.publish()}}
    }
    override func viewDidAppear(_ animated:Bool){super.viewDidAppear(animated);if !started{started=true;fixture.session.webView.load(URLRequest(url:URL(string:"https://localhost:8765/")!))}}
    override func viewDidLayoutSubviews(){super.viewDidLayoutSubviews();telemetry.frame=CGRect(x:1,y:view.bounds.height-2,width:1,height:1)}
    private func publish(){
        guard !publishing else{return};publishing=true
        fixture.session.webView.evaluateJavaScript("""
        (()=>{
          const p=window.__artifactUIProbe;if(!p)return {ready:false};
          const opener=document.querySelector('#artifacts-button');
          if(!p.opened&&document.querySelector('#prompt')?.getClientRects().length&&window.__KINDRED_NATIVE_GEOMETRY&&typeof opener?.onclick==='function'){p.opened=true;opener.click()}
          if(!p.selected&&document.querySelector('[data-artifact-id="'+__artifactUITarget+'"]')?.getClientRects().length){p.selected=true;document.querySelector('[data-artifact-id="'+__artifactUITarget+'"]').click()}
          const v=document.querySelector('.document-word,.document-pdf'),paper=v?.shadowRoot?.querySelector('.paper');
          if(v&&p.word!==v){p.word=v;p.generation++}
          const wordPages=v?.shadowRoot?.querySelectorAll('section.docx').length||0,pdfPages=v?.querySelectorAll('.document-pdf-page').length||0,pages=wordPages||pdfPages;
          const row=document.querySelector('[data-artifact-id="touch-two"]'),r=row?.getBoundingClientRect(),library=document.querySelector('.artifact-studio-library');
          return JSON.parse(JSON.stringify({ready:pages===20&&(wordPages>0||!!v?.querySelector('canvas')),renderer:wordPages?'word-layout':'continuous-pdf',pages,opened:p.opened,selected:p.selected,nativeLayout:window.__KINDRED_IOS_LAYOUT||null,readyState:document.readyState,bodyText:document.body?.innerText.slice(0,200)||'',duoActions:!!window.__kindredDuoActions,mobile:window.__KINDRED_MOBILE===true,title:document.querySelector('.artifact-title-input')?.value||'',wordPages,
            zoom:paper?Number(paper.style.zoom):parseFloat(document.querySelector('.ios-document-zoom-trigger')?.textContent||'0')/100,
            fit:document.querySelector('.ios-document-zoom-menu button[aria-pressed=true]')?.textContent||'',
            scrollTop:v?.scrollTop||0,scrollLeft:v?.scrollLeft||0,rootScale:visualViewport?.scale||1,
            trustedPairs:p.trustedPairs,trustedTouches:p.trustedTouches,pinchStartDistance:p.pairStart||0,pinchLastDistance:p.pairLast||0,canvasMinDuringPinch:p.canvasMin??null,generation:p.generation,
            viewport:{width:innerWidth,height:innerHeight},
            nativeDock:document.querySelector('.artifact-studio')?.dataset.iosNativeArtifactDock==='true',
            headerZoomVisible:!!document.querySelector('.ios-document-zoom-trigger')?.getClientRects().length,
            filterValue:document.querySelector('select[aria-label="Artifact type"]')?.value||'',
            sortValue:document.querySelector('select[aria-label="Sort artifacts"]')?.value||'',
            previewRect:v?{x:v.getBoundingClientRect().x,y:v.getBoundingClientRect().y,width:v.clientWidth,height:v.clientHeight}:null,
            libraryVisible:!!library&&!library.inert&&getComputedStyle(library).visibility!=='hidden'&&!!row?.getClientRects().length,
            row:r?{x:r.x+r.width/2,y:r.y+r.height/2}:null}));
        })()
        """){[weak self] value,error in
            guard let self else{return};self.publishing=false
            var report=value as? [String:Any] ?? ["ready":false,"javascriptError":error != nil]
            report["nativeMenuPresented"]=self.view.window?.rootViewController?.presentedViewController != nil
            report["nativeURL"]=self.fixture.session.webView.url?.absoluteString ?? "none"
            report["nativeLoading"]=self.fixture.session.webView.isLoading
            report["nativeFailure"]=String(describing:self.fixture.session.loadState.failure)
            if JSONSerialization.isValidJSONObject(report), let data=try? JSONSerialization.data(withJSONObject:report,options:[.sortedKeys]){self.telemetry.accessibilityValue=String(data:data,encoding:.utf8)}
        }
    }
    deinit{timer?.invalidate()}
}
#endif
