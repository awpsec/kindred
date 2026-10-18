#if canImport(JavaScriptCore)
import JavaScriptCore
import XCTest
@testable import KindredCore

final class PrivateHTTPBootstrapTests: XCTestCase {
    func testMissingUUIDUsesRandomBytesAndRFC4122VersionAndVariant() throws {
        let context = try XCTUnwrap(JSContext())
        context.evaluateScript("""
        var window = globalThis; window.top = window; window.self = window;
        window.location = {origin:'http://10.0.0.1:9444'};
        var calls = 0;
        window.crypto = {getRandomValues:function(bytes) { calls++; for(var i=0;i<bytes.length;i++)bytes[i]=255-i; return bytes; }};
        """)
        let origin = try ServerAddress.normalize("http://10.0.0.1:9444")
        context.evaluateScript(WebBootstrap.documentStartScript(origin: origin, token: nil))
        XCTAssertNil(context.exception)
        XCTAssertEqual(context.evaluateScript("crypto.randomUUID()")?.toString(), "fffefdfc-fbfa-49f8-b7f6-f5f4f3f2f1f0")
        XCTAssertEqual(context.evaluateScript("calls")?.toInt32(), 1)
    }

    func testExistingUUIDAndUntrustedFrameAreUntouched() throws {
        let context = try XCTUnwrap(JSContext())
        context.evaluateScript("""
        var window = globalThis; window.top = window; window.self = window;
        window.location = {origin:'https://kindred.example'};
        window.crypto = {randomUUID:function() { return 'existing'; }};
        """)
        let origin = try ServerAddress.normalize("https://kindred.example")
        context.evaluateScript(WebBootstrap.documentStartScript(origin: origin, token: nil))
        XCTAssertEqual(context.evaluateScript("crypto.randomUUID()")?.toString(), "existing")
        context.evaluateScript("window.crypto = {}; window.location.origin = 'https://other.example';")
        context.evaluateScript(WebBootstrap.documentStartScript(origin: origin, token: nil))
        XCTAssertEqual(context.evaluateScript("typeof crypto.randomUUID")?.toString(), "undefined")
        context.evaluateScript("window.location.origin = 'https://kindred.example'; window.top = {};")
        context.evaluateScript(WebBootstrap.documentStartScript(origin: origin, token: nil))
        XCTAssertEqual(context.evaluateScript("typeof crypto.randomUUID")?.toString(), "undefined")
    }
}
#endif
