import XCTest
@testable import KindredCore

final class NavigationPolicyTests: XCTestCase {
    private let policy = NavigationPolicy(origin: try! ServerAddress.normalize("kindred.example.com"))

    private func url(_ s: String) -> URL { URL(string: s)! }

    func testSameOriginLoadsInPlaceForAnyTrigger() {
        for trigger in [NavigationTrigger.userLink, .formSubmission, .backForward, .reload, .other] {
            XCTAssertEqual(policy.decide(url: url("https://kindred.example.com/artifacts/4"), isMainFrame: true, trigger: trigger), .allow)
        }
    }

    func testUserLinkToOtherSiteOpensExternally() {
        let external = url("https://docs.example.org/page")
        XCTAssertEqual(policy.decide(url: external, isMainFrame: true, trigger: .userLink), .openExternally(external))
        XCTAssertEqual(policy.decide(url: external, isMainFrame: false, trigger: .userLink), .openExternally(external))
        let mail = url("mailto:someone@example.org")
        XCTAssertEqual(policy.decide(url: mail, isMainFrame: true, trigger: .userLink), .openExternally(mail))
    }

    func testScriptOrRedirectToOtherSiteIsRefused() {
        let external = url("https://login.example.org/")
        XCTAssertEqual(policy.decide(url: external, isMainFrame: true, trigger: .other),
                       .refuse(.otherOrigin(host: "login.example.org")))
        XCTAssertEqual(policy.decide(url: external, isMainFrame: true, trigger: .formSubmission),
                       .refuse(.otherOrigin(host: "login.example.org")))
        XCTAssertEqual(policy.decide(url: url("http://kindred.example.com/"), isMainFrame: true, trigger: .other), .refuse(.insecure))
        XCTAssertEqual(policy.decide(url: url("tel:123"), isMainFrame: true, trigger: .other), .refuse(.unsupportedScheme("tel")))
    }

    func testCrossOriginFramesNeverLoad() {
        XCTAssertEqual(policy.decide(url: url("https://embed.example.org/"), isMainFrame: false, trigger: .other),
                       .refuse(.otherOrigin(host: "embed.example.org")))
    }

    func testFrameBlobsAndBlankDocuments() {
        XCTAssertEqual(policy.decide(url: url("about:blank"), isMainFrame: false, trigger: .other), .allow)
        XCTAssertEqual(policy.decide(url: url("about:srcdoc"), isMainFrame: false, trigger: .other), .allow)
        XCTAssertEqual(policy.decide(url: url("blob:https://kindred.example.com/0b7c"), isMainFrame: false, trigger: .other), .allow)
        XCTAssertNotEqual(policy.decide(url: url("blob:https://evil.example/0b7c"), isMainFrame: false, trigger: .other), .allow)
        XCTAssertNotEqual(policy.decide(url: url("blob:https://kindred.example.com/0b7c"), isMainFrame: true, trigger: .other), .allow)
        XCTAssertNotEqual(policy.decide(url: url("data:text/html,hi"), isMainFrame: true, trigger: .userLink), .allow)
        XCTAssertNotEqual(policy.decide(url: url("javascript:alert(1)"), isMainFrame: true, trigger: .userLink), .allow)
        XCTAssertNotEqual(policy.decide(url: url("file:///etc/passwd"), isMainFrame: true, trigger: .userLink), .allow)
        XCTAssertNotEqual(policy.decide(url: nil, isMainFrame: true, trigger: .userLink), .allow)
    }

    func testNewWindows() {
        XCTAssertEqual(policy.decideNewWindow(url: url("https://kindred.example.com/artifacts/1")), .allow)
        XCTAssertEqual(policy.decideNewWindow(url: url("https://example.org/")), .openExternally(url("https://example.org/")))
        XCTAssertEqual(policy.decideNewWindow(url: url("blob:https://kindred.example.com/9")), .download)
        XCTAssertNotEqual(policy.decideNewWindow(url: url("blob:https://evil.example/9")), .download)
        XCTAssertEqual(policy.decideNewWindow(url: url("javascript:void(0)")), .refuse(.unsupportedScheme("javascript")))
    }

    func testDownloadsAndResponses() {
        XCTAssertTrue(policy.allowsDownload(from: url("https://kindred.example.com/api/files/1")))
        XCTAssertTrue(policy.allowsDownload(from: url("blob:https://kindred.example.com/1")))
        XCTAssertTrue(policy.allowsDownload(from: url("data:text/plain,hi")))
        XCTAssertFalse(policy.allowsDownload(from: url("https://cdn.example.org/file.zip")))
        XCTAssertTrue(policy.allowsMainFrameResponse(from: url("https://kindred.example.com/")))
        XCTAssertFalse(policy.allowsMainFrameResponse(from: url("https://login.example.org/")))
    }
}
