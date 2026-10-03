import KindredCore
import XCTest
import UIKit
import WebKit
@testable import Kindred

/// Serves canned responses so sign-in runs without a network or server.
final class StubProtocol: URLProtocol {
    static var handler: ((URLRequest) -> (Int, Data))?
    static var paths: [String] = []

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let url = request.url else { return }
        StubProtocol.paths.append(url.path)
        let (status, body) = StubProtocol.handler?(request) ?? (404, Data())
        let headers = status == 302 ? ["Location": "https://evil.example/identity/login"] : ["Content-Type": "application/json"]
        let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: body)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

@MainActor
final class AppModelSignInTests: XCTestCase {
    private let token = String(repeating: "a1", count: 32)
    private let serverAccount = "6f9619ff-8b86-d011-b42d-00cf4fc964ff"
    private var folder: URL!
    private var secrets: InMemorySecretStore!
    private var model: AppModel!

    override func setUp() async throws {
        folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        secrets = InMemorySecretStore()
        let configuration = KindredAPIClient.defaultConfiguration()
        configuration.protocolClasses = [StubProtocol.self]
        StubProtocol.paths = []
        model = AppModel(secrets: secrets, repository: AccountRepository(fileURL: folder.appendingPathComponent("accounts.json")),
                         api: KindredAPIClient(configuration: configuration))
    }

    override func tearDown() async throws {
        StubProtocol.handler = nil
        try? FileManager.default.removeItem(at: folder)
    }

    private func serveKindred(loginStatus: Int = 200) {
        let token = self.token
        let account = serverAccount
        StubProtocol.handler = { request in
            switch request.url?.path {
            case "/identity/meta":
                return (200, Data(#"{"profiles":true,"version":"0.0.0"}"#.utf8))
            case "/identity/login":
                return (loginStatus, Data(#"{"token":"\#(token)","profile_id":"p-1"}"#.utf8))
            case "/identity/profiles":
                return (200, Data(#"{"active":"p-1","account_id":"\#(account)","username":"ada","legacy":false,"profiles":[{"id":"p-1","name":"Ada's Studio","active":true}]}"#.utf8))
            default:
                return (404, Data())
            }
        }
    }

    func testSignInKeepsTheTokenOutOfMetadata() async throws {
        serveKindred()
        let origin = try ServerAddress.normalize("kindred.example.com")
        try await model.signIn(origin: origin, login: " Ada ", password: "correct horse")

        XCTAssertEqual(model.accounts.count, 1)
        let account = try XCTUnwrap(model.accounts.first)
        XCTAssertEqual(account.login, "ada")
        XCTAssertEqual(account.profileName, "Ada's Studio")
        XCTAssertEqual(account.serverAccountID, serverAccount)
        XCTAssertEqual(model.activeAccountID, account.id)
        XCTAssertTrue(model.isSignedIn(account.id))
        XCTAssertEqual(try secrets.token(for: account.id), token)
        XCTAssertEqual(Array(StubProtocol.paths.prefix(3)), ["/identity/meta", "/identity/login", "/identity/profiles"])

        let saved = try String(contentsOf: folder.appendingPathComponent("accounts.json"), encoding: .utf8)
        XCTAssertFalse(saved.contains(token))
        XCTAssertFalse(saved.contains("correct horse"))
    }

    func testSigningInAgainReusesTheSavedAccount() async throws {
        serveKindred()
        let origin = try ServerAddress.normalize("kindred.example.com")
        try await model.signIn(origin: origin, login: "ada", password: "pw")
        let first = try XCTUnwrap(model.accounts.first?.id)
        try await model.signIn(origin: origin, login: "ADA", password: "pw")
        XCTAssertEqual(model.accounts.map(\.id), [first])
    }

    func testLaunchCompletionSurvivesActivationReloadAndAccountSwitch() async throws {
        serveKindred()
        let origin = try ServerAddress.normalize("kindred.example.com")
        XCTAssertFalse(model.hasCompletedLaunch)
        try await model.signIn(origin: origin, login: "ada", password: "pw")
        let first = try XCTUnwrap(model.activeAccountID)
        model.hasCompletedLaunch = true
        model.sceneBecameActive()
        model.reloadActive()
        XCTAssertTrue(model.hasCompletedLaunch)
        try await model.signIn(origin: origin, login: "bert", password: "pw")
        model.activate(first)
        XCTAssertTrue(model.hasCompletedLaunch)
        for account in model.accounts { model.session(for: account).webView.stopLoading() }
    }

    func testMobileLayoutIsBundledWithNativeNavigationFallback() async throws {
        serveKindred()
        let origin = try ServerAddress.normalize("kindred.example.com")
        try await model.signIn(origin: origin, login: "ada", password: "pw")
        let account = try XCTUnwrap(model.accounts.first)
        let session = model.session(for: account)
        XCTAssertTrue(session.webView is KindredWebView)
        XCTAssertFalse(session.webView.configuration.ignoresViewportScaleLimits, "The app must honor its fixed page scale")
        XCTAssertNil(session.webView.inputAccessoryView, "Chat inputs should not show the browser's form-navigation toolbar")
        let layout = try XCTUnwrap(session.webView.configuration.userContentController.userScripts.first { $0.injectionTime == .atDocumentEnd })
        XCTAssertTrue(layout.isForMainFrameOnly)
        XCTAssertTrue(layout.source.contains("window.location.origin !== \"https://kindred.example.com\""))
        XCTAssertTrue(layout.source.contains("text-size-adjust:100%"))
        XCTAssertTrue(layout.source.contains("maximum-scale=1, user-scalable=no"))
        XCTAssertTrue(layout.source.contains("ios-accounts"))
        session.webView.stopLoading()
        session.presentation.hasChatInterface = true
        session.webView(session.webView, didFailProvisionalNavigation: nil, withError: URLError(.cancelled))
        XCTAssertTrue(session.presentation.hasChatInterface, "A cancelled download must not restore duplicate navigation")
        session.webView(session.webView, didFailProvisionalNavigation: nil, withError: URLError(.notConnectedToInternet))
        XCTAssertFalse(session.presentation.hasChatInterface, "Native accounts/reload navigation must return after a page failure")
        try await model.remove(account.id, ignoringNotificationFailure: false)
    }

    func testRedirectedSignInIsRefusedAndNothingIsSaved() async throws {
        serveKindred(loginStatus: 302)
        let origin = try ServerAddress.normalize("kindred.example.com")
        do {
            try await model.signIn(origin: origin, login: "ada", password: "pw")
            XCTFail("redirected sign-in must fail")
        } catch {
            XCTAssertEqual(error as? KindredAPIError, .redirectRefused)
        }
        XCTAssertTrue(model.accounts.isEmpty)
        XCTAssertFalse(StubProtocol.paths.contains("/identity/profiles"))
    }

    func testNonKindredServerNeverReceivesThePassword() async throws {
        StubProtocol.handler = { _ in (200, Data(#"{"hello":"world"}"#.utf8)) }
        let origin = try ServerAddress.normalize("not-kindred.example.com")
        do {
            try await model.signIn(origin: origin, login: "ada", password: "pw")
            XCTFail("expected refusal")
        } catch {
            XCTAssertEqual(error as? KindredAPIError, .notKindredServer)
        }
        XCTAssertEqual(StubProtocol.paths, ["/identity/meta"])
    }

    func testRemoveForgetsTokenAndAccount() async throws {
        serveKindred()
        let origin = try ServerAddress.normalize("kindred.example.com")
        try await model.signIn(origin: origin, login: "ada", password: "pw")
        let id = try XCTUnwrap(model.accounts.first?.id)
        try await model.remove(id, ignoringNotificationFailure: false)
        XCTAssertTrue(model.accounts.isEmpty)
        XCTAssertNil(try secrets.token(for: id))
        XCTAssertNil(model.activeAccountID)
        XCTAssertTrue(StubProtocol.paths.contains("/identity/logout"))
    }

    func testRemoveDeletesExistingWebDataStore() async throws {
        serveKindred()
        let origin = try ServerAddress.normalize("kindred.example.com")
        try await model.signIn(origin: origin, login: "ada", password: "pw")
        let id = try XCTUnwrap(model.accounts.first?.id)
        var store: WKWebsiteDataStore? = WKWebsiteDataStore(forIdentifier: id)
        let cookie = try XCTUnwrap(HTTPCookie(properties: [
            .domain: "kindred.example.com", .path: "/", .name: "qa", .value: "test",
        ]))
        await store!.httpCookieStore.setCookie(cookie)
        store = nil
        let before = await WKWebsiteDataStore.allDataStoreIdentifiers
        XCTAssertTrue(before.contains(id))

        try await model.remove(id, ignoringNotificationFailure: false)

        let after = await WKWebsiteDataStore.allDataStoreIdentifiers
        XCTAssertFalse(after.contains(id), "removing an account deletes its persisted web data")
    }

    func testRemovalStopsWhenNotificationRemovalFails() async throws {
        serveKindred()
        let origin = try ServerAddress.normalize("kindred.example.com")
        try await model.signIn(origin: origin, login: "ada", password: "pw")
        let id = try XCTUnwrap(model.accounts.first?.id)
        model.markRegisteredForTesting(id)

        StubProtocol.handler = { request in
            request.httpMethod == "DELETE" ? (500, Data(#"{"error":"database busy"}"#.utf8)) : (200, Data("{}".utf8))
        }
        do {
            try await model.remove(id, ignoringNotificationFailure: false)
            XCTFail("removal must stop while the server may still hold a registration")
        } catch AccountActionError.notificationsStillRegistered(let message) {
            XCTAssertEqual(message, "database busy")
        }
        XCTAssertEqual(model.accounts.map(\.id), [id])
        XCTAssertNotNil(try secrets.token(for: id), "credentials are kept so removal can be retried")
        guard case .removalUnconfirmed? = model.account(id)?.push.state else {
            return XCTFail("state must say removal is unconfirmed")
        }
    }
    func testNotificationPresentationRequiresSignedInOptedInExactAccount() async throws {
        serveKindred()
        try await model.signIn(origin: ServerAddress.normalize("kindred.example.com"), login: "ada", password: "pw")
        let id = try XCTUnwrap(model.accounts.first?.id)
        let installation = try XCTUnwrap(model.account(id)?.push.installationID)
        let route = PushRoute(serverAccountID: serverAccount, chatID: "dm-piper", eventID: "123", installationID: installation)
        XCTAssertFalse(model.shouldPresentNotification(route), "Alerts start off until explicitly enabled")
        model.markRegisteredForTesting(id)
        XCTAssertTrue(model.shouldPresentNotification(route))
        XCTAssertFalse(model.shouldPresentNotification(nil))
        XCTAssertFalse(model.shouldPresentNotification(PushRoute(serverAccountID: serverAccount, chatID: nil, eventID: nil, installationID: UUID())))
        XCTAssertFalse(model.shouldPresentNotification(PushRoute(serverAccountID: UUID().uuidString, chatID: nil, eventID: nil)))
        let originalHandler = StubProtocol.handler
        StubProtocol.handler = { request in
            if request.url?.path.contains("/mobile/devices/") == true { return (200, Data(#"{"removed":true}"#.utf8)) }
            return originalHandler?(request) ?? (404, Data())
        }
        try await model.disableAlerts(id)
        XCTAssertFalse(model.shouldPresentNotification(route), "An in-flight alert must not appear after alerts are disabled")
        model.markRegisteredForTesting(id)
        try await model.signOut(id, ignoringNotificationFailure: false)
        XCTAssertFalse(model.shouldPresentNotification(route), "An in-flight alert must not appear after sign-out")
    }

    func testUnsupportedServerCannotEnableAlertsOrRegisterDevice() async throws {
        serveKindred()
        try await model.signIn(origin: ServerAddress.normalize("kindred.example.com"), login: "ada", password: "pw")
        let id = try XCTUnwrap(model.accounts.first?.id)
        do {
            try await model.enableAlerts(id)
            XCTFail("An older server must not offer working alerts")
        } catch PushSetupError.server(let status) {
            XCTAssertEqual(status, .unsupported)
        }
        XCTAssertFalse(try XCTUnwrap(model.account(id)).push.wanted)
        XCTAssertFalse(StubProtocol.paths.contains { $0.contains("/mobile/devices/") })
    }

    func testNotificationTapChoosesExactInstallationAcrossClonedServers() async throws {
        serveKindred()
        try await model.signIn(origin: ServerAddress.normalize("first.example"), login: "ada", password: "pw")
        let first = try XCTUnwrap(model.accounts.first)
        try await model.signIn(origin: ServerAddress.normalize("second.example"), login: "ada", password: "pw")
        XCTAssertNotEqual(model.activeAccountID, first.id)
        model.sheet = .accounts
        model.routeNotification(PushRoute(serverAccountID: serverAccount, chatID: nil, eventID: "1", installationID: first.push.installationID))
        for _ in 0..<30 where model.activeAccountID != first.id { try await Task.sleep(for: .milliseconds(10)) }
        XCTAssertEqual(model.activeAccountID, first.id)
        XCTAssertNil(model.sheet)
        model.session(for: first).webView.stopLoading()
    }

    func testNotificationTapForSignedOutAccountOpensSignIn() async throws {
        serveKindred()
        let origin = try ServerAddress.normalize("kindred.example.com")
        try await model.signIn(origin: origin, login: "ada", password: "pw")
        let account = try XCTUnwrap(model.accounts.first)
        try await model.signOut(account.id, ignoringNotificationFailure: false)
        model.routeNotification(PushRoute(serverAccountID: serverAccount, chatID: "dm-piper", eventID: "1", installationID: account.push.installationID))
        for _ in 0..<30 where model.sheet == nil { try await Task.sleep(for: .milliseconds(10)) }
        guard case .addAccount(let prefill) = model.sheet else { return XCTFail("Expected native sign-in") }
        XCTAssertEqual(prefill.origin, origin)
        XCTAssertEqual(prefill.login, "ada")
    }

    func testNativeConversationMenuKeepsNestedActionsAndRejectsUnboundedData() async throws {
        serveKindred()
        try await model.signIn(origin: ServerAddress.normalize("kindred.example.com"), login: "ada", password: "pw")
        let session = model.session(for: try XCTUnwrap(model.accounts.first))
        let items = session.conversationMenuElements([
            ["title":"Pin", "id":"1-0"],
            ["title":"Mute conversation", "children":[["title":"For 1 hour", "id":"1-1"], ["title":"Indefinitely", "id":"1-2"]]],
            ["title":"Archive bot", "id":"1-3"]
        ])
        XCTAssertEqual(items.map(\.title), ["Pin", "Mute conversation", "Archive bot"])
        XCTAssertEqual((items[1] as? UIMenu)?.children.map(\.title), ["For 1 hour", "Indefinitely"])
        XCTAssertTrue(session.conversationMenuElements([["title":String(repeating:"x",count:101), "id":"1"]]).isEmpty)
        XCTAssertNil(ConversationMenuTarget(body:["key":"bots:piper", "rect":[0.0,0.0,Double.infinity,44.0]]))
        XCTAssertNotNil(ConversationMenuTarget(body:["key":"bots:piper", "rect":[0.0,0.0,200.0,44.0]]))
        let messageTarget = try XCTUnwrap(ConversationMenuTarget(body:["key":"message-1", "rect":[0.0,0.0,200.0,44.0]], kind:.message))
        XCTAssertEqual(messageTarget.kind, .message)
        let messageItems = session.conversationMenuElements([
            ["title":"React", "children":[["title":"❤️ Heart", "id":"1", "selected":true]]],
            ["title":"Reply", "id":"2"], ["title":"Copy message", "id":"3"]
        ], kind:.message)
        XCTAssertEqual(messageItems.map(\.title), ["React", "Reply", "Copy message"])
        XCTAssertEqual(((messageItems[0] as? UIMenu)?.children.first as? UIAction)?.state, .on)
        session.webView.stopLoading()
    }

    func testColdLaunchRestoresExplicitAppearanceAndLeavesSystemAppearanceDynamic() async throws {
        serveKindred()
        try await model.signIn(origin: ServerAddress.normalize("kindred.example.com"), login: "ada", password: "pw")
        let account = try XCTUnwrap(model.accounts.first)
        defer { CachedWebAppearance.clear(accountID: account.id) }
        CachedWebAppearance(rgb: [0, 0, 0], followsSystem: false).save(accountID: account.id)
        let explicit = WebSession(account: account, token: nil, host: model)
        explicit.webView.stopLoading()
        XCTAssertFalse(explicit.presentation.hasChatInterface)
        XCTAssertEqual(explicit.presentation.isDark, true, "The first native frame should already follow the saved account appearance")
        XCTAssertEqual(explicit.webView.overrideUserInterfaceStyle, .dark)
        XCTAssertNil(CachedWebAppearance.load(accountID: UUID()), "Another account must not inherit the theme")
        CachedWebAppearance(rgb: [0, 0, 0], followsSystem: true).save(accountID: account.id)
        let system = WebSession(account: account, token: nil, host: model)
        system.webView.stopLoading()
        XCTAssertNil(system.presentation.isDark)
        XCTAssertEqual(system.webView.overrideUserInterfaceStyle, .unspecified)
    }

}
