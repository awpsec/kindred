import XCTest
import WebKit
@testable import Kindred

@MainActor
final class NativeGlassControlsTests: XCTestCase {
    private func control(_ id: String = "identity") -> [String: Any] {
        ["id": id, "rect": [100.0,20,160,44], "title": "Piper", "label": "Piper details", "symbol": "", "shape": "cloud", "color": "#2475ff", "fontSize": 15.0, "opacity": 1.0, "titleOpacity": 1.0, "interactive": true]
    }

    func testRejectsInvalidFramesAndUnknownActionIDs() {
        XCTAssertNotNil(NativeGlassControl(control()))
        XCTAssertNil(NativeGlassControl(control("arbitrary-web-action")))
        for rect in [[0.0,0,.infinity,44],[0,0,44,-1],[0,0,2000,44]] {
            var value=control();value["rect"]=rect;XCTAssertNil(NativeGlassControl(value))
        }
        for (key,value) in [("titleRect",[0.0,0,Double.nan,20]),("titleRect",[0.0,0,-1,20]),("avatarCenter",[Double.infinity,19])] {
            var row=control();row[key]=value;XCTAssertNil(NativeGlassControl(row))
        }
    }

    func testCompactNametagFitsShortNameUsingMeasuredContentSlots() throws {
        guard #available(iOS 26.0, *) else { throw XCTSkip("Liquid Glass requires iOS 26") }
        let web=WKWebView(frame:CGRect(x:0,y:0,width:1000,height:720)),glass=NativeGlassControls(frame:web.bounds),document=UUID().uuidString
        // Actual compact Piper pill, measured in the shipped WebKit layout.
        var row=control();row["rect"]=[556.5,20,97.48,38];row["titleRect"]=[46.0,9,38.48,20];row["avatarCenter"]=[26.0,19]
        XCTAssertEqual(glass.update(["document":document,"controls":[row]],in:web),["identity"])
        let button=try XCTUnwrap(glass.subviews.first as? UIButton),label=try XCTUnwrap(button.subviews.compactMap{$0 as? UILabel}.first)
        XCTAssertEqual(button.frame.width,97.48,accuracy:0.01,"preserve the intended compact pill")
        XCTAssertEqual(label.frame,CGRect(x:46,y:9,width:38.48,height:20))
        XCTAssertLessThanOrEqual(label.sizeThatFits(CGSize(width:800,height:120)).width,label.bounds.width,"Piper must fit without shrinking its measured font or truncating")
        XCTAssertEqual(label.font.pointSize,15)
        let avatar=try XCTUnwrap(button.subviews.compactMap{$0 as? UIImageView}.first)
        XCTAssertEqual(avatar.frame,CGRect(x:11,y:4,width:30,height:30))
        row["interactive"]=false;row["rect"]=[720.0,10,38,38];row["titleRect"]=[34.0,9,0,20];row["avatarCenter"]=[19.0,19];row["titleOpacity"]=0.0
        _=glass.update(["document":document,"controls":[row]],in:web)
        XCTAssertTrue(glass.subviews.first === button)
        XCTAssertEqual(avatar.frame,CGRect(x:4,y:4,width:30,height:30),"the artwork remains fixed while moving into the toolbar")
        XCTAssertEqual(label.frame.width,0);XCTAssertEqual(label.alpha,0)
    }

    func testRetainsControlsThroughGeometryAndRestoresPassThroughOnReset() throws {
        guard #available(iOS 26.0, *) else { throw XCTSkip("Liquid Glass requires iOS 26") }
        let host=UIView(frame:CGRect(x:0,y:0,width:500,height:700)),web=WKWebView(frame:host.bounds),glass=NativeGlassControls(frame:host.bounds)
        host.addSubview(web);host.addSubview(glass)
        let document=UUID().uuidString
        XCTAssertEqual(glass.update(["document":document,"controls":[control()]],in:web),["identity"])
        glass.reveal(document:document)
        let button=try XCTUnwrap(glass.subviews.first as? UIButton)
        XCTAssertEqual(button.accessibilityLabel,"Piper details")
        XCTAssertTrue(button.subviews.compactMap { $0 as? UIImageView }.contains { $0.image != nil })
        XCTAssertNil(glass.hitTest(CGPoint(x:10,y:600),with:nil),"the overlay cannot swallow scrolling or composer touches")
        XCTAssertNotNil(glass.hitTest(CGPoint(x:110,y:30),with:nil))
        var moved=control();moved["rect"]=[150.0,30,180,44]
        _=glass.update(["document":document,"controls":[moved]],in:web)
        XCTAssertTrue(glass.subviews.first === button,"resizing moves the existing system glass control")
        XCTAssertEqual(button.frame,CGRect(x:150,y:30,width:180,height:44))
        var action:String?;glass.activate={id,doc in action=id+doc}
        button.sendActions(for:.primaryActionTriggered);XCTAssertEqual(action,"identity"+document)
        moved["interactive"]=false;moved["rect"]=[150.0,30,38,38];moved["titleOpacity"]=0.0
        _=glass.update(["document":document,"controls":[moved]],in:web)
        XCTAssertFalse(button.isAccessibilityElement);XCTAssertTrue(button.accessibilityElementsHidden)
        XCTAssertTrue(button.subviews.compactMap { $0 as? UIImageView }.contains { $0.frame.size == CGSize(width:30,height:30) },"the avatar cannot shrink or rubber-band during the tag morph")
        XCTAssertTrue(button.point(inside:CGPoint(x:20,y:-2),with:nil),"a small glass pill retains its minimum touch area")
        let oldButton=button;action=nil
        glass.reset();XCTAssertTrue(glass.subviews.isEmpty);XCTAssertNil(glass.document)
        _=glass.update(["document":UUID().uuidString,"controls":[control()]],in:web)
        oldButton.sendActions(for:.primaryActionTriggered);XCTAssertNil(action,"a stale native touch cannot act on a new document")
    }

    func testRejectsDuplicateAndOversizedActionSets() {
        let web=WKWebView(),glass=NativeGlassControls(),document=UUID().uuidString
        XCTAssertNil(glass.update(["document":document,"controls":[control(),control()]],in:web))
        XCTAssertNil(glass.update(["document":document,"controls":Array(repeating:control(),count:21)],in:web))
        XCTAssertNil(glass.update(["document":"not-a-document","controls":[control()]],in:web))
        XCTAssertTrue(glass.subviews.isEmpty)
    }

    func testChromePublishedBeforeHostAttachmentBecomesVisibleAfterLayout() throws {
        guard #available(iOS 26.0, *) else { throw XCTSkip("Liquid Glass requires iOS 26") }
        let web=WKWebView(frame:CGRect(x:0,y:0,width:500,height:700)),glass=NativeGlassControls(),document=UUID().uuidString
        _=glass.update(["document":document,"controls":[control()]],in:web)
        glass.reveal(document:document)
        let button=try XCTUnwrap(glass.subviews.first as? UIButton)
        XCTAssertTrue(button.isHidden)
        glass.frame=web.bounds;glass.setNeedsLayout();glass.layoutIfNeeded()
        XCTAssertFalse(button.isHidden);XCTAssertEqual(button.alpha,1)
    }
}
