#if DEBUG
import KindredCore
import SwiftUI
import UIKit

/// Opt-in synthetic UI-test host. Release builds contain none of this route.
@MainActor
final class AccountsAppearanceFixture {
    static let active: AccountsAppearanceFixture? = {
        let values = ProcessInfo.processInfo.environment
        guard values["KINDRED_ACCOUNTS_UI_TEST"] == "1" else { return nil }
        guard let scenario = values["KINDRED_ACCOUNTS_SCENARIO"],
              ["administrator", "owner", "user", "unknown", "signedOut", "longTitleOwner"].contains(scenario),
              let theme = values["KINDRED_ACCOUNTS_THEME"], ["light", "dark"].contains(theme),
              let text = values["KINDRED_ACCOUNTS_TEXT"], ["default", "ax"].contains(text),
              let launch = values["KINDRED_ACCOUNTS_LAUNCH"], UUID(uuidString: launch) != nil else {
            fatalError("Invalid synthetic Accounts UI-test configuration")
        }
        do { return try AccountsAppearanceFixture(scenario: scenario, theme: theme, text: text, launch: launch) }
        catch { fatalError("Synthetic Accounts UI-test initialization failed") }
    }()

    let model: AppModel
    let scenario: String
    let theme: String
    let text: String
    let title: String
    let launchID: String
    var phase: String { "accounts-\(theme)-\(text)-\(scenario)" }
    let accountID: UUID
    let folder: URL
    var category: UIContentSizeCategory { text == "ax" ? .accessibilityExtraExtraExtraLarge : .large }
    var style: UIUserInterfaceStyle { theme == "light" ? .light : .dark }

    private init(scenario: String, theme: String, text: String, launch: String) throws {
        self.scenario = scenario; self.theme = theme; self.text = text; self.launchID = launch
        title = scenario == "longTitleOwner"
            ? "A very long workspace title that must truncate before its role badge and status" : "Capture workspace"
        let origin = try ServerAddress.normalize("https://accounts-appearance.invalid")
        var account = Account(origin: origin, login: "capture")
        account.serverAccountID = "6f9619ff-8b86-d011-b42d-00cf4fc964ff"
        account.profileID = "capture-profile"; account.profileName = title
        account.push = PushRegistration(wanted: true, state: .registered(
            token: "synthetic-device-only", environment: .sandbox, at: Date(timeIntervalSince1970: 0)))
        if scenario == "signedOut" {
            account.applyIdentity(IdentitySummary(serverAccountID: account.serverAccountID!, username: "capture",
                activeProfileID: "capture-profile", activeProfileName: title, legacy: false, admin: true))
        }
        accountID = account.id
        folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        let repository = AccountRepository(fileURL: folder.appendingPathComponent("accounts.json"))
        try repository.save(AccountsSnapshot(accounts: [account], activeAccountID: account.id))
        let secrets = InMemorySecretStore()
        if scenario != "signedOut" { try secrets.setToken(String(repeating: "a1", count: 32), for: account.id) }
        let owner = scenario == "owner" || scenario == "longTitleOwner"
        let admin = owner || scenario == "administrator"
        let body: [String: Any] = ["account_id": account.serverAccountID!, "username": "capture",
            "active": "capture-profile", "legacy": false, "admin": admin, "owner_resolved": true,
            "role": owner ? "owner" : (admin ? "admin" : "user"),
            "profiles": [["id": "capture-profile", "name": title, "active": true]]]
        AccountsAppearanceURLProtocol.configure(status: scenario == "unknown" ? 503 : 200,
            body: try JSONSerialization.data(withJSONObject: scenario == "unknown" ? [:] : body))
        let configuration = KindredAPIClient.defaultConfiguration()
        configuration.protocolClasses = [AccountsAppearanceURLProtocol.self]
        model = AppModel(secrets: secrets, repository: repository, api: KindredAPIClient(configuration: configuration))
    }
}

/// Native host telemetry is distinct from XCUI queried row labels and bounds.
struct AccountsAppearanceFixtureView: UIViewControllerRepresentable {
    let fixture: AccountsAppearanceFixture
    func makeUIViewController(context: Context) -> AccountsAppearanceFixtureController {
        AccountsAppearanceFixtureController(fixture: fixture)
    }
    func updateUIViewController(_ controller: AccountsAppearanceFixtureController, context: Context) {}
}

@MainActor
final class AccountsAppearanceFixtureController: UIViewController {
    private let fixture: AccountsAppearanceFixture
    private let host: UIHostingController<AnyView>
    private let telemetry = UILabel()
    private var timer: Timer?

    init(fixture: AccountsAppearanceFixture) {
        self.fixture = fixture
        host = UIHostingController(rootView: AnyView(AccountsSheet().environment(fixture.model).tint(Theme.accent)))
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { fatalError("UI test fixture requires synthetic configuration") }
    override func viewDidLoad() {
        super.viewDidLoad()
        addChild(host); view.addSubview(host.view); host.didMove(toParent: self)
        host.view.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([host.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            host.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            host.view.topAnchor.constraint(equalTo: view.topAnchor), host.view.bottomAnchor.constraint(equalTo: view.bottomAnchor)])
        setOverrideTraitCollection(UITraitCollection(traitsFrom: [
            UITraitCollection(preferredContentSizeCategory: fixture.category),
            UITraitCollection(userInterfaceStyle: fixture.style)]), forChild: host)
        overrideUserInterfaceStyle = fixture.style
        // One visible 1pt telemetry mark, excluded from all account queries.
        // Its accessibility value carries only synthetic, measured host data.
        telemetry.text = "·"; telemetry.font = .systemFont(ofSize: 1)
        telemetry.isAccessibilityElement = true
        telemetry.accessibilityIdentifier = "accounts-fixture-telemetry"
        telemetry.accessibilityLabel = "Accounts fixture telemetry"
        view.addSubview(telemetry)
        timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.publish() }
        }
    }
    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        telemetry.frame = CGRect(x: view.bounds.maxX - 2, y: view.bounds.maxY - view.safeAreaInsets.bottom - 2, width: 1, height: 1)
        publish()
    }
    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated); timer?.invalidate(); timer = nil
    }
    private func publish() {
        guard let window = view.window else { return }
        let traits = host.traitCollection
        let font = UIFont.preferredFont(forTextStyle: .body, compatibleWith: traits)
        let values: [String: Any] = ["phase": fixture.phase, "launchID": fixture.launchID, "measurementSource": "DEBUG native app-host traits/font/safeArea",
            "scenario": fixture.scenario, "theme": fixture.theme, "textSize": fixture.text,
            "observedCategory": traits.preferredContentSizeCategory.rawValue,
            "requestedCategory": fixture.category.rawValue,
            "observedInterfaceStyle": traits.userInterfaceStyle.rawValue,
            "nativeBodyPointSize": font.pointSize, "nativeBodyFontName": font.fontName,
            "signedIn": fixture.model.isSignedIn(fixture.accountID),
            "role": fixture.model.account(fixture.accountID)?.administrativeRole?.rawValue ?? "none",
            "apiPaths": AccountsAppearanceURLProtocol.paths,
            "nativeReduceMotion": UIAccessibility.isReduceMotionEnabled,
            "nativeDarkerColors": UIAccessibility.isDarkerSystemColorsEnabled,
            "windowIsKey": window.isKeyWindow, "windowHidden": window.isHidden,
            "hostAttached": host.view.window === window,
            "orientation": window.windowScene?.interfaceOrientation.rawValue ?? 0,
            "windowBounds": ["x": 0, "y": 0, "width": window.bounds.width, "height": window.bounds.height],
            "safeArea": ["top": window.safeAreaInsets.top, "bottom": window.safeAreaInsets.bottom,
                "left": window.safeAreaInsets.left, "right": window.safeAreaInsets.right]]
        if let data = try? JSONSerialization.data(withJSONObject: values, options: [.sortedKeys]) {
            telemetry.accessibilityValue = String(data: data, encoding: .utf8)
        }
    }
}

private final class AccountsAppearanceURLProtocol: URLProtocol {
    private static let lock = NSLock()
    private static var requests: [String] = []
    private static var responseStatus = 403
    private static var responseBody = Data()
    static var paths: [String] { lock.lock(); defer { lock.unlock() }; return requests }
    static func configure(status: Int, body: Data) {
        lock.lock(); defer { lock.unlock() }
        requests = []; responseStatus = status; responseBody = body
    }
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        Self.lock.lock()
        Self.requests.append((request.httpMethod ?? "") + " " + (request.url?.path ?? ""))
        let allowed = request.httpMethod == "GET" && request.url?.host == "accounts-appearance.invalid"
            && request.url?.path == "/identity/profiles"
        let status = allowed ? Self.responseStatus : 403
        let body = allowed ? Self.responseBody : Data()
        Self.lock.unlock()
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1",
            headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: body); client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}
#endif
