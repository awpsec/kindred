import XCTest

/// Uses XCTest's genuine multitouch injection; no constructed DOM TouchEvents.
final class ArtifactTouchUIKitTests:XCTestCase {
    func testTwentyPageWordNativeFitWidthPinchPanAndNavigation() throws { try documentGestures("word") }
    func testTwentyPageConvertedPDFNativeFitWidthPinchPanAndNavigation() throws { try documentGestures("pdf") }
    private func documentGestures(_ document:String) throws {
        #if !targetEnvironment(simulator)
        throw XCTSkip("This isolated loopback fixture is simulator-only")
        #else
        continueAfterFailure=false
        let app=XCUIApplication()
        app.launchEnvironment=["KINDRED_ARTIFACT_TOUCH_UI_TEST":"1","KINDRED_ARTIFACT_DOCUMENT":document]
        app.launch()
        defer{app.terminate()}
        let telemetry=app.staticTexts["artifact-touch-telemetry"]
        XCTAssertTrue(telemetry.waitForExistence(timeout:15))
        func state()->[String:Any]{guard let value=telemetry.value as? String,let data=value.data(using:.utf8) else{return [:]};return (try? JSONSerialization.jsonObject(with:data)) as? [String:Any] ?? [:]}
        func wait(_ label:String,timeout:TimeInterval=30,_ condition:@escaping([String:Any])->Bool){
            let predicate=NSPredicate{_,_ in condition(state())}
            let result=XCTWaiter.wait(for:[XCTNSPredicateExpectation(predicate:predicate,object:nil)],timeout:timeout)
            if result != .completed {
                let data=(try? JSONSerialization.data(withJSONObject:state(),options:[.prettyPrinted,.sortedKeys])) ?? Data()
                let a=XCTAttachment(data:data,uniformTypeIdentifier:"public.json");a.name=label+"-failure-state";a.lifetime = .keepAlways;add(a)
                let image=XCTAttachment(screenshot:app.screenshot());image.name=label+"-failure-screen";image.lifetime = .keepAlways;add(image)
            }
            XCTAssertEqual(result,.completed,label)
        }
        var receipt:[[String:Any]]=[]
        func capture(_ label:String){var s=state();s["phase"]=label;receipt.append(s);let a=XCTAttachment(screenshot:app.screenshot());a.name=label;a.lifetime = .keepAlways;add(a)}
        wait("twenty-word-pages",timeout:60){$0["ready"] as? Bool == true}
        capture("word-ready")
        let web=app.webViews["artifact-touch-webview"]
        XCTAssertTrue(web.exists)
        let zoom=app.buttons["kindred-glass-artifact-zoom"]
        XCTAssertTrue(zoom.waitForExistence(timeout:10));zoom.tap()
        let fit=app.buttons["Fit width"];XCTAssertTrue(fit.waitForExistence(timeout:8));fit.tap()
        wait("fit-width-menu-dismissed"){$0["fit"] as? String=="Fit width" && $0["nativeMenuPresented"] as? Bool==false}
        let initial=state(),before=(initial["zoom"] as? Double) ?? 0
        capture("native-fit-width")
        web.pinch(withScale:1.6,velocity:1)
        wait("trusted-two-finger-zoom") { s in (s["trustedPairs"] as? Int ?? 0)>0 && (s["zoom"] as? Double ?? 0)>before*1.15 }
        XCTAssertEqual(state()["rootScale"] as? Double,1)
        if document=="pdf"{XCTAssertGreaterThanOrEqual(state()["canvasMinDuringPinch"] as? Int ?? 0,1,"Real native pinch keeps a visible PDF canvas")}
        capture("native-pinch")
        let start=web.coordinate(withNormalizedOffset:CGVector(dx:0.75,dy:0.75)),end=web.coordinate(withNormalizedOffset:CGVector(dx:0.75,dy:0.35))
        start.press(forDuration:0.05,thenDragTo:end)
        wait("native-one-finger-pan"){($0["scrollTop"] as? Double ?? 0)>50}
        capture("native-pan")
        zoom.tap();let page=app.buttons["Fit page"];XCTAssertTrue(page.waitForExistence(timeout:8));page.tap()
        wait("fit-page-after-real-gesture"){$0["fit"] as? String=="Fit page" && $0["nativeMenuPresented"] as? Bool==false}
        let s=state()
        if s["libraryVisible"] as? Bool==true,let row=s["row"] as? [String:Double],let x=row["x"],let y=row["y"] {
            web.coordinate(withNormalizedOffset:.zero).withOffset(CGVector(dx:x,dy:y)).tap()
            wait("document-switch-after-gestures"){$0["title"] as? String=="Touch review two"}
            capture("native-document-switch")
        } else {
            let generation=s["generation"] as? Int ?? 0
            let actions=app.buttons["kindred-glass-artifact-document-more"];XCTAssertTrue(actions.exists);actions.tap()
            let refresh=app.buttons["Refresh document"];XCTAssertTrue(refresh.waitForExistence(timeout:8));refresh.tap()
            wait("native-refresh-after-gestures",timeout:60){($0["generation"] as? Int ?? 0)>generation && $0["ready"] as? Bool==true && $0["nativeMenuPresented"] as? Bool==false}
            capture("native-document-refresh")
        }
        let a=XCTAttachment(data:try JSONSerialization.data(withJSONObject:receipt,options:[.prettyPrinted,.sortedKeys]),uniformTypeIdentifier:"public.json");a.name="real-native-word-touch-receipt";a.lifetime = .keepAlways;add(a)
        #endif
    }
}
