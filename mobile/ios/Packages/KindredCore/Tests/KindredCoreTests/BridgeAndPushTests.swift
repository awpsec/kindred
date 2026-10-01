import XCTest
@testable import KindredCore

final class BridgeAndPushTests: XCTestCase {
    private let origin = try! ServerAddress.normalize("kindred.example.com")
    private let token = String(repeating: "ab12", count: 16)

    func testSessionMessageParsing() {
        XCTAssertEqual(SessionMessage(body: ["token": token, "profile_id": "p-1"]), .session(token: token, profileID: "p-1"))
        XCTAssertEqual(SessionMessage(body: ["token": token, "profile_id": ""]), .session(token: token, profileID: nil))
        XCTAssertEqual(SessionMessage(body: ["token": token]), .session(token: token, profileID: nil))
        XCTAssertEqual(SessionMessage(body: ["token": "", "profile_id": ""]), .signedOut)
        XCTAssertEqual(SessionMessage(body: ["token": NSNull()]), .signedOut)
        XCTAssertNil(SessionMessage(body: ["profile_id": "p"]))
        XCTAssertNil(SessionMessage(body: ["token": 5]))
        XCTAssertNil(SessionMessage(body: ["token": "has space and is long enough"]))
        XCTAssertNil(SessionMessage(body: ["token": "short"]))
        XCTAssertNil(SessionMessage(body: ["token": token, "profile_id": 3]))
        XCTAssertNil(SessionMessage(body: "token"))
    }

    func testAccountsMessage() {
        XCTAssertEqual(AccountsMessage(body: ["action": "open"]), .open)
        XCTAssertNil(AccountsMessage(body: ["action": "delete"]))
        XCTAssertNil(AccountsMessage(body: []))
    }

    func testBootstrapScriptIsScopedAndSeedsOnlyEmptySession() {
        let script = WebBootstrap.documentStartScript(origin: origin, token: token)
        XCTAssertTrue(script.contains("window.top !== window.self"))
        XCTAssertTrue(script.contains("window.location.origin !== \"https://kindred.example.com\""))
        XCTAssertTrue(script.contains("window.__KINDRED_MOBILE = true"))
        XCTAssertTrue(script.contains("window.__KINDRED_NATIVE_SESSION_BOOTSTRAP = true"))
        XCTAssertTrue(script.contains("localStorage.removeItem(\"kindred-token\")"))
        XCTAssertTrue(script.contains("var token = \"\(token)\""))
        XCTAssertTrue(script.contains("!window.sessionStorage.getItem(\"kindred-token\")"))

        let signedOut = WebBootstrap.documentStartScript(origin: origin, token: nil)
        XCTAssertTrue(signedOut.contains("var token = null"))
        let invalid = WebBootstrap.documentStartScript(origin: origin, token: "\"; alert(1); \"")
        XCTAssertTrue(invalid.contains("var token = null"))
    }

    func testJavaScriptStringEscaping() {
        XCTAssertEqual(WebBootstrap.javaScriptString("a\"b\\c"), "\"a\\\"b\\\\c\"")
        XCTAssertEqual(WebBootstrap.javaScriptString("</script>\n\u{2028}"), "\"\\u003C/script\\u003E\\n\\u2028\"")
        XCTAssertEqual(WebBootstrap.javaScriptString("\u{1}"), "\"\\u0001\"")
    }

    func testReadSessionResultRequiresExactOrigin() {
        XCTAssertEqual(WebBootstrap.sessionToken(fromReadResult: ["origin": "https://kindred.example.com", "token": token], origin: origin), token)
        XCTAssertNil(WebBootstrap.sessionToken(fromReadResult: ["origin": "https://evil.example", "token": token], origin: origin))
        XCTAssertNil(WebBootstrap.sessionToken(fromReadResult: ["origin": "https://kindred.example.com", "token": NSNull()], origin: origin))
        XCTAssertNil(WebBootstrap.sessionToken(fromReadResult: nil, origin: origin))
    }

    func testPushPayloadRouting() {
        let account = "6F9619FF-8B86-D011-B42D-00CF4FC964FF"
        let route = PushPayload.route(from: ["aps": ["alert": ["title": "Kindred"]], "account_id": account,
                                             "chat_id": "dm-1234abcd", "event_id": "42"])
        XCTAssertEqual(route, PushRoute(serverAccountID: account.lowercased(), chatID: "dm-1234abcd", eventID: "42"))

        let unsafe = PushPayload.route(from: ["account_id": account, "chat_id": "../x#y", "event_id": "4a"])
        XCTAssertEqual(unsafe, PushRoute(serverAccountID: account.lowercased(), chatID: nil, eventID: nil))

        XCTAssertNil(PushPayload.route(from: ["account_id": "not-a-uuid", "chat_id": "c"]))
        XCTAssertNil(PushPayload.route(from: ["chat_id": "c"]))
    }

    func testChatURL() {
        XCTAssertEqual(KindredRoutes.chatURL(origin: origin, chatID: "dm-abc-123")?.absoluteString,
                       "https://kindred.example.com/#kindred-chat=dm-abc-123")
        XCTAssertNil(KindredRoutes.chatURL(origin: origin, chatID: "a&b=c"))
        XCTAssertNil(KindredRoutes.chatURL(origin: origin, chatID: String(repeating: "a", count: 161)))
        XCTAssertEqual(KindredRoutes.percentEncode("a b&c/é~"), "a%20b%26c%2F%C3%A9~")
    }

    func testAPNsTokenAndEnvironment() {
        XCTAssertEqual(APNsToken.hex(Data([0x00, 0x0F, 0xA0, 0xFF])), "000fa0ff")
        XCTAssertEqual(APNsEnvironment(configurationValue: "development"), .sandbox)
        XCTAssertEqual(APNsEnvironment(configurationValue: "sandbox"), .sandbox)
        XCTAssertEqual(APNsEnvironment(configurationValue: " Production "), .production)
        XCTAssertNil(APNsEnvironment(configurationValue: "$(KINDRED_APS_ENVIRONMENT)"))
        XCTAssertNil(APNsEnvironment(configurationValue: nil))
    }

    func testPushStatusParsing() {
        let configured = PushServerStatus.parse(Data(#"{"enabled":true,"platforms":{"ios":true,"android":false},"registered":true}"#.utf8))
        XCTAssertEqual(configured.status, .configured)
        XCTAssertEqual(configured.registered, true)
        XCTAssertEqual(PushServerStatus.parse(Data(#"{"enabled":true,"platforms":{"ios":false,"android":true}}"#.utf8)).status, .notConfigured)
        XCTAssertEqual(PushServerStatus.parse(Data(#"{"ios":true}"#.utf8)).status, .unrecognized)
        XCTAssertEqual(PushServerStatus.parse(Data("nope".utf8)).status, .unrecognized)
    }

    func testRetryScheduleAndDownloadNames() {
        XCTAssertEqual(RetrySchedule.delay(attempt: 0), 30)
        XCTAssertEqual(RetrySchedule.delay(attempt: 2), 120)
        XCTAssertEqual(RetrySchedule.delay(attempt: 50), 1800)
        XCTAssertEqual(DownloadNaming.safeFilename("../../etc/passwd"), "_.._etc_passwd")
        XCTAssertEqual(DownloadNaming.safeFilename("  "), "download")
        XCTAssertEqual(DownloadNaming.safeFilename("report.pdf"), "report.pdf")
        let long = DownloadNaming.safeFilename(String(repeating: "x", count: 300) + ".pdf")
        XCTAssertEqual(long.count, 120)
        XCTAssertTrue(long.hasSuffix(".pdf"))
    }
}
