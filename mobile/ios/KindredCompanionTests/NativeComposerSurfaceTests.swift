import UIKit
import WebKit
import XCTest
@testable import Kindred

@MainActor
final class NativeComposerSurfaceTests: XCTestCase {
    private func descriptor() -> [String: Any] {
        ["rect": [12.0, 590, 900, 64], "radius": 28.0, "opacity": 1.0, "dark": true]
    }

    func testSurfaceTracksRetainedEditorWithoutOwningTouches() throws {
        guard #available(iOS 26.0, *) else { throw XCTSkip("Liquid Glass requires iOS 26") }
        let host=UIView(frame:CGRect(x:0,y:0,width:1000,height:700))
        let web=WKWebView(frame:host.bounds), surface=NativeComposerSurface()
        host.addSubview(surface);host.addSubview(web)
        surface.prepare(try XCTUnwrap(NativeComposerSurface.Descriptor(descriptor())), in:web)
        surface.commit()
        XCTAssertEqual(surface.frame,CGRect(x:12,y:590,width:900,height:64))
        XCTAssertFalse(surface.isHidden)
        XCTAssertFalse(surface.isUserInteractionEnabled)
        XCTAssertTrue(surface.accessibilityElementsHidden)
        XCTAssertNil(surface.hitTest(CGPoint(x:20,y:20),with:nil))
        XCTAssertTrue((surface.subviews.first as? UIVisualEffectView)?.effect is UIGlassEffect)
        web.frame.origin.y=10;surface.updateGeometry()
        XCTAssertEqual(surface.frame.minY,600)
        surface.prepare(nil,in:web)
        XCTAssertTrue(surface.isPrepared,"retain material until the fallback ink is acknowledged")
        surface.commit();XCTAssertFalse(surface.isPrepared);XCTAssertTrue(surface.isHidden)
    }

    func testBridgeRejectsMalformedSurfaceAndResetsForNavigation() throws {
        guard #available(iOS 26.0, *) else { throw XCTSkip("Liquid Glass requires iOS 26") }
        let web=WKWebView(), glass=NativeGlassControls(), document=UUID().uuidString
        XCTAssertEqual(glass.update(["document":document,"controls":[],"composer":descriptor()],in:web),["composer"])
        XCTAssertTrue(glass.composerSurface.isPrepared)
        var invalid=descriptor();invalid["rect"]=[0.0,0,10000,64]
        XCTAssertNil(glass.update(["document":document,"controls":[],"composer":invalid],in:web))
        XCTAssertTrue(glass.composerSurface.isPrepared,"invalid payload does not replace the material")
        XCTAssertEqual(glass.update(["document":document,"controls":[]],in:web),[])
        glass.reveal(document:document);XCTAssertFalse(glass.composerSurface.isPrepared)
        _=glass.update(["document":document,"controls":[],"composer":descriptor()],in:web)
        glass.reset();XCTAssertFalse(glass.composerSurface.isPrepared);XCTAssertNil(glass.document)
    }
}
