import XCTest

/// Uses XCTest's genuine multitouch injection; no constructed DOM TouchEvents.
final class ArtifactTouchUIKitTests:XCTestCase {
    func testTwentyPageWordNativeFitWidthPinchPanAndNavigation() throws { try documentGestures("word") }
    func testTwentyPageConvertedPDFNativeFitWidthPinchPanAndNavigation() throws { try documentGestures("pdf") }
    func testCoverPortraitWordNativeGestures() throws { XCUIDevice.shared.orientation = .portrait; try documentGestures("word") }
    func testCoverPortraitPDFNativeGestures() throws { XCUIDevice.shared.orientation = .portrait; try documentGestures("pdf") }
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
        func capture(_ label:String){var s=state();s["phase"]=label;receipt.append(s);let data=(try? JSONSerialization.data(withJSONObject:s,options:[.prettyPrinted,.sortedKeys])) ?? Data();let trace=XCTAttachment(data:data,uniformTypeIdentifier:"public.json");trace.name=label+"-state";trace.lifetime = .keepAlways;add(trace);let a=XCTAttachment(screenshot:app.screenshot());a.name=label;a.lifetime = .keepAlways;add(a)}
        wait("twenty-word-pages",timeout:60){$0["ready"] as? Bool == true}
        capture("word-ready")
        let web=app.webViews["artifact-touch-webview"]
        XCTAssertTrue(web.exists)
        let duo=state()["nativeLayout"] as? [String:Any]
        let isDuo=duo?["isDuo"] as? Bool==true
        func reveal(_ button: XCUIElement) {
            let rail=app.scrollViews["kindred-duo-navigation-rail"]
            for _ in 0..<6 where !button.isHittable && rail.exists {
                let r=button.frame,b=rail.frame
                if b.height>b.width {if r.midY>b.midY {rail.swipeUp()} else {rail.swipeDown()}}
                else {if r.midX>b.midX {rail.swipeLeft()} else {rail.swipeRight()}}
            }
            XCTAssertTrue(button.isHittable,"Native rail action is reachable by scrolling")
        }
        if isDuo {
            let ids=["search","new","chats","marketplace","settings","accounts"]
            let buttons=ids.map { app.buttons["kindred-duo-"+$0] }
            var frames:[[String:Any]]=[]
            for (id,button) in zip(ids,buttons) {
                let exists=button.waitForExistence(timeout:3),r=button.frame
                frames.append(["id":id,"exists":exists,"hittable":button.isHittable,"x":r.minX,"y":r.minY,"width":r.width,"height":r.height])
            }
            let trace=XCTAttachment(data:try JSONSerialization.data(withJSONObject:frames,options:[.prettyPrinted,.sortedKeys]),uniformTypeIdentifier:"public.json");trace.name="native-direct-button-frames";trace.lifetime = .keepAlways;add(trace)
            let tree=XCTAttachment(string:app.debugDescription);tree.name="native-direct-toolbar-hierarchy";tree.lifetime = .keepAlways;add(tree)
            for button in buttons {XCTAssertTrue(button.exists,"All requested actions remain individual native buttons");reveal(button);XCTAssertGreaterThanOrEqual(button.frame.height,44)}
        }
        let zoom=app.buttons[isDuo ? "kindred-duo-artifact-zoom" : "kindred-glass-artifact-zoom"]
        XCTAssertTrue(zoom.waitForExistence(timeout:10));if isDuo{reveal(zoom)};zoom.tap()
        let fit=app.buttons["Fit width"];XCTAssertTrue(fit.waitForExistence(timeout:8));fit.tap()
        wait("fit-width-menu-dismissed"){$0["fit"] as? String=="Fit width" && $0["nativeMenuPresented"] as? Bool==false}
        capture("native-fit-width")
        if isDuo {
            XCTAssertTrue(state()["nativeDock"] as? Bool==true)
            XCTAssertFalse(state()["headerZoomVisible"] as? Bool==true,"No duplicate header zoom after dock takes ownership")
            let accounts=app.buttons["kindred-duo-accounts"],settings=app.buttons["kindred-duo-settings"]
            XCTAssertGreaterThan(accounts.frame.maxX,web.frame.midX,"The native toolbar is at the trailing edge")
            XCTAssertTrue(abs(zoom.frame.midX-accounts.frame.midX)<4 || abs(zoom.frame.midY-accounts.frame.midY)<4,"Zoom shares the native adaptive toolbar’s axis")
            if abs(settings.frame.midX-accounts.frame.midX)<4 {XCTAssertLessThan(settings.frame.midY,accounts.frame.midY)}
            else {XCTAssertLessThan(settings.frame.midX,accounts.frame.midX)}
            let refresh=app.buttons["kindred-duo-artifact-refresh"]
            XCTAssertTrue(refresh.exists)
            let generation=state()["generation"] as? Int ?? 0
            reveal(refresh);refresh.tap()
            wait("dock-refresh-after-fit-width",timeout:60){($0["generation"] as? Int ?? 0)>generation && $0["ready"] as? Bool==true}
            capture("native-dock-refresh")
            // Refresh can restore Fit Page; retain the actual menu and fit closures.
            reveal(zoom);zoom.tap();let width=app.buttons["Fit width"];XCTAssertTrue(width.waitForExistence(timeout:8));width.tap()
            wait("fit-width-after-refresh"){$0["fit"] as? String=="Fit width"}
            let more=app.buttons["kindred-duo-artifact-more"];XCTAssertTrue(more.exists);reveal(more);more.tap()
            let download=app.buttons["Download original"];XCTAssertTrue(download.waitForExistence(timeout:8))
            // Tap the same dock item to dismiss, without navigating away from the document.
            web.coordinate(withNormalizedOffset:CGVector(dx:0.5,dy:0.8)).tap()
            wait("dock-more-dismissed"){$0["nativeMenuPresented"] as? Bool==false}
        }
        wait("document-ready-before-double-tap"){$0["ready"] as? Bool==true}
        let fitted=state()["zoom"] as? Double ?? 0
        web.doubleTap()
        wait("genuine-double-tap-zooms-document") {($0["zoom"] as? Double ?? 0)>fitted*1.3 && $0["pinching"] as? Bool != true}
        XCTAssertEqual(state()["rootScale"] as? Double,1)
        capture("native-double-tap-zoom")
        web.doubleTap()
        wait("second-double-tap-restores-fit") {abs(($0["zoom"] as? Double ?? 0)-fitted)<0.02 && $0["pinching"] as? Bool != true}
        capture("native-double-tap-restore")
        let before=(state()["zoom"] as? Double) ?? 0
        web.pinch(withScale:1.6,velocity:1)
        wait("trusted-two-finger-zoom") { s in (s["trustedPairs"] as? Int ?? 0)>0 && (s["zoom"] as? Double ?? 0)>before*1.15 }
        XCTAssertEqual(state()["rootScale"] as? Double,1)
        if document=="pdf"{XCTAssertGreaterThanOrEqual(state()["canvasMinDuringPinch"] as? Int ?? 0,1,"Real native pinch keeps a visible PDF canvas")}
        capture("native-pinch")
        let start=web.coordinate(withNormalizedOffset:CGVector(dx:0.75,dy:0.75)),end=web.coordinate(withNormalizedOffset:CGVector(dx:0.75,dy:0.35))
        start.press(forDuration:0.05,thenDragTo:end)
        wait("native-one-finger-pan"){($0["scrollTop"] as? Double ?? 0)>50}
        capture("native-pan")
        if isDuo{reveal(zoom)};zoom.tap();let page=app.buttons["Fit page"];XCTAssertTrue(page.waitForExistence(timeout:8));page.tap()
        wait("fit-page-after-real-gesture"){$0["fit"] as? String=="Fit page" && $0["nativeMenuPresented"] as? Bool==false}
        if isDuo {
            if state()["libraryVisible"] as? Bool != true {
                let back=app.buttons["Artifact list"];XCTAssertTrue(back.exists);reveal(back);back.tap()
                wait("cover-hamburger-restores-library"){$0["libraryVisible"] as? Bool==true}
                capture("native-cover-library")
            }
            let filter=app.buttons["kindred-duo-artifact-filter"];XCTAssertTrue(filter.exists);reveal(filter);filter.tap()
            let name=app.buttons["Name A–Z"]
            if !name.waitForExistence(timeout:2),app.buttons["Sort artifacts"].exists {app.buttons["Sort artifacts"].tap()}
            XCTAssertTrue(name.waitForExistence(timeout:8));name.tap()
            wait("native-sort-selection-applied"){$0["sortValue"] as? String=="name"}
            capture("native-library-sort")
        }
        let s=state()
        if s["libraryVisible"] as? Bool==true,let row=s["row"] as? [String:Double],let x=row["x"],let y=row["y"] {
            web.coordinate(withNormalizedOffset:.zero).withOffset(CGVector(dx:x,dy:y)).tap()
            wait("document-switch-after-gestures"){$0["title"] as? String=="Touch review two"}
            capture("native-document-switch")
        } else {
            let generation=s["generation"] as? Int ?? 0
            if !isDuo {let actions=app.buttons["kindred-glass-artifact-document-more"];XCTAssertTrue(actions.exists);actions.tap()}
            let refresh=app.buttons[isDuo ? "kindred-duo-artifact-refresh" : "Refresh document"];XCTAssertTrue(refresh.waitForExistence(timeout:8));refresh.tap()
            wait("native-refresh-after-gestures",timeout:60){($0["generation"] as? Int ?? 0)>generation && $0["ready"] as? Bool==true && $0["nativeMenuPresented"] as? Bool==false}
            capture("native-document-refresh")
        }
        let a=XCTAttachment(data:try JSONSerialization.data(withJSONObject:receipt,options:[.prettyPrinted,.sortedKeys]),uniformTypeIdentifier:"public.json");a.name="real-native-word-touch-receipt";a.lifetime = .keepAlways;add(a)
        #endif
    }
}
