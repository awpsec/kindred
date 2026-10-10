import KindredCore
import SwiftUI
import UIKit
import XCTest
@testable import Kindred

/// Actual native AccountsSheet rendering. Every account, response and bearer is
/// synthetic. No Keychain, owner server, APNs registration or role mutation.
@MainActor
final class AccountsAppearanceUIKitTests: XCTestCase {
    private var window: UIWindow?
    private var previousWindow: UIWindow?
    private var folder: URL?
    private var model: AppModel?
    private var hosting: UIHostingController<AnyView>?

    private enum Scenario: String, CaseIterable {
        case administrator, owner, user, unknown, signedOut, longTitleOwner
        var signedIn: Bool { self != .signedOut }
        var owner: Bool { self == .owner || self == .longTitleOwner }
        var admin: Bool { owner || self == .administrator || self == .signedOut }
        var title: String {
            self == .longTitleOwner
                ? "A very long workspace title that must truncate before its role badge and status"
                : "Capture workspace"
        }
        var roleLabel: String? {
            guard signedIn else { return nil }
            if owner { return "Owner, administrator" }
            return self == .administrator ? "Administrator" : nil
        }
    }

    override func tearDown() async throws {
        releaseHost()
        AccountsAppearanceProtocol.handler = nil
        AccountsAppearanceProtocol.paths = []
    }

    func testAccountsRolesLightDarkDefaultText() async throws {
        try await captureMatrix(category: .large, textKey: "default")
    }

    func testAccountsRolesLightDarkAccessibilityText() async throws {
        try await captureMatrix(category: .accessibilityExtraExtraExtraLarge, textKey: "ax")
    }

    private func releaseHost() {
        window?.endEditing(true)
        window?.isHidden = true
        window?.rootViewController = nil
        previousWindow?.makeKeyAndVisible()
        hosting = nil
        window = nil
        model = nil
        if let folder { try? FileManager.default.removeItem(at: folder) }
        folder = nil
    }

    private func captureMatrix(category: UIContentSizeCategory, textKey: String) async throws {
        for style in [UIUserInterfaceStyle.light, .dark] {
            var normalRowHeights: [CGFloat] = []
            for scenario in Scenario.allCases {
                releaseHost()
                let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
                previousWindow = scene.windows.first(where: { $0.isKeyWindow })
                let origin = try ServerAddress.normalize("https://accounts-appearance.invalid")
                let accountID = "6f9619ff-8b86-d011-b42d-00cf4fc964ff"
                var account = Account(origin: origin, login: "capture")
                account.serverAccountID = accountID
                account.profileID = "capture-profile"
                account.profileName = scenario.title
                account.push = PushRegistration(wanted: true,
                    state: .registered(token: "synthetic-device-only", environment: .sandbox, at: Date(timeIntervalSince1970: 0)))
                // A signed-out saved admin must not display its stale role.
                if scenario == .signedOut {
                    account.applyIdentity(IdentitySummary(serverAccountID: accountID, username: "capture",
                        activeProfileID: "capture-profile", activeProfileName: scenario.title,
                        legacy: false, admin: true))
                }
                folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
                let repository = AccountRepository(fileURL: try XCTUnwrap(folder).appendingPathComponent("accounts.json"))
                try repository.save(AccountsSnapshot(accounts: [account], activeAccountID: account.id))
                let secrets = InMemorySecretStore()
                if scenario.signedIn { try secrets.setToken(String(repeating: "a1", count: 32), for: account.id) }
                AccountsAppearanceProtocol.paths = []
                AccountsAppearanceProtocol.handler = { request in
                    guard request.httpMethod == "GET", request.url?.host == "accounts-appearance.invalid",
                          request.url?.path == "/identity/profiles" else { return (403, Data()) }
                    if scenario == .unknown { return (503, Data("{}".utf8)) }
                    let object: [String: Any] = ["account_id": accountID, "username": "capture", "active": "capture-profile",
                        "legacy": false, "admin": scenario.admin, "owner_resolved": true,
                        "role": scenario.owner ? "owner" : (scenario.admin ? "admin" : "user"),
                        "profiles": [["id": "capture-profile", "name": scenario.title, "active": true]]]
                    return (200, try! JSONSerialization.data(withJSONObject: object))
                }
                let configuration = KindredAPIClient.defaultConfiguration()
                configuration.protocolClasses = [AccountsAppearanceProtocol.self]
                let current = AppModel(secrets: secrets, repository: repository,
                                       api: KindredAPIClient(configuration: configuration))
                model = current
                let host = UIHostingController(rootView: AnyView(AccountsSheet().environment(current)))
                hosting = host
                let parent = UIViewController()
                parent.addChild(host)
                parent.view.addSubview(host.view)
                host.view.translatesAutoresizingMaskIntoConstraints = false
                NSLayoutConstraint.activate([
                    host.view.leadingAnchor.constraint(equalTo: parent.view.leadingAnchor),
                    host.view.trailingAnchor.constraint(equalTo: parent.view.trailingAnchor),
                    host.view.topAnchor.constraint(equalTo: parent.view.topAnchor),
                    host.view.bottomAnchor.constraint(equalTo: parent.view.bottomAnchor)
                ])
                host.didMove(toParent: parent)
                parent.setOverrideTraitCollection(UITraitCollection(traitsFrom: [
                    UITraitCollection(preferredContentSizeCategory: category), UITraitCollection(userInterfaceStyle: style)
                ]), forChild: host)
                let captureWindow = UIWindow(windowScene: scene)
                captureWindow.overrideUserInterfaceStyle = style
                captureWindow.rootViewController = parent
                window = captureWindow
                captureWindow.makeKeyAndVisible()
                let theme = style == .light ? "light" : "dark"
                let name = "accounts-\(theme)-\(textKey)-\(scenario.rawValue)"
                var lastRecords: [AXRecord] = []
                var row: AXRecord?
                var previousFrame: CGRect?
                var stable = 0
                let deadline = Date().addingTimeInterval(8)
                while Date() < deadline {
                    captureWindow.layoutIfNeeded()
                    lastRecords = accessibilityRecords(captureWindow)
                    let candidates = lastRecords.filter {
                        $0.label.contains(scenario.title) && $0.button && !$0.label.hasPrefix("Details for ") &&
                        $0.frame.width > 100 && $0.frame.height > 0
                    }
                    row = candidates.max { $0.frame.width < $1.frame.width }
                    let hasRole = scenario.roleLabel.map { row?.label.contains($0) == true } ?? true
                    let readDone = !scenario.signedIn || !AccountsAppearanceProtocol.paths.isEmpty
                    if let frame = row?.frame, hasRole, readDone, frame == previousFrame { stable += 1 } else { stable = 0 }
                    previousFrame = row?.frame
                    if stable >= 2 { break }
                    try await Task.sleep(for: .milliseconds(60))
                }
                // Always retain the terminal native image/metadata before assertions.
                let records = lastRecords.map { ["label": $0.label, "button": $0.button, "frame": rect($0.frame)] as [String: Any] }
                let geometry: [String: Any] = ["schemaVersion": 1, "phase": name, "scenario": scenario.rawValue,
                    "theme": theme, "textSize": textKey, "requestedCategory": category.rawValue,
                    "observedCategory": host.traitCollection.preferredContentSizeCategory.rawValue,
                    "observedInterfaceStyle": host.traitCollection.userInterfaceStyle.rawValue,
                    "nativeBodyPointSize": UIFont.preferredFont(forTextStyle: .body, compatibleWith: host.traitCollection).pointSize,
                    "nativeBodyFontName": UIFont.preferredFont(forTextStyle: .body, compatibleWith: host.traitCollection).fontName,
                    "orientation": scene.interfaceOrientation.rawValue,
                    "windowBounds": rect(captureWindow.bounds), "safeArea": insets(captureWindow.safeAreaInsets),
                    "signedIn": current.isSignedIn(account.id), "role": current.account(account.id)?.administrativeRole?.rawValue ?? "none",
                    "expectedRoleLabel": scenario.roleLabel ?? "none", "rowLabel": row?.label ?? "", "rowFrame": rect(row?.frame ?? .zero),
                    "stableSamples": stable, "apiPaths": AccountsAppearanceProtocol.paths,
                    "windowIsKey": captureWindow.isKeyWindow, "windowHidden": captureWindow.isHidden,
                    "hostAttached": host.view.window === captureWindow,
                    "accessibility": records, "nativeReduceMotion": UIAccessibility.isReduceMotionEnabled,
                    "nativeDarkerColors": UIAccessibility.isDarkerSystemColorsEnabled,
                    "proofScope": "native rendering and accessible labels; no role authority, real push or device claim"]
                attach(name: name, geometry: geometry, window: captureWindow)
                XCTAssertGreaterThanOrEqual(stable, 2, "Native Accounts row must settle in eight seconds")
                XCTAssertTrue(captureWindow.isKeyWindow)
                XCTAssertFalse(captureWindow.isHidden)
                XCTAssertTrue(host.view.window === captureWindow)
                let selectedRow = try XCTUnwrap(row, "Native accessible account row must exist")
                XCTAssertEqual(host.traitCollection.preferredContentSizeCategory, category)
                XCTAssertEqual(host.traitCollection.userInterfaceStyle, style)
                XCTAssertEqual(current.isSignedIn(account.id), scenario.signedIn)
                XCTAssertTrue(AccountsAppearanceProtocol.paths.allSatisfy { $0 == "GET /identity/profiles" })
                if scenario.signedIn { XCTAssertFalse(AccountsAppearanceProtocol.paths.isEmpty) }
                else { XCTAssertTrue(AccountsAppearanceProtocol.paths.isEmpty) }
                if let roleLabel = scenario.roleLabel { XCTAssertTrue(selectedRow.label.contains(roleLabel)) }
                else { XCTAssertFalse(lastRecords.contains { $0.label.localizedCaseInsensitiveContains("administrator") }) }
                XCTAssertTrue(lastRecords.contains { $0.label.contains("Notifications on") }, "Actual cached bell is represented")
                XCTAssertTrue(lastRecords.contains { $0.label.contains("Current account") }, "Actual selection check is represented")
                let visible = captureWindow.convert(selectedRow.frame, from: nil)
                XCTAssertGreaterThanOrEqual(visible.minX, 0)
                XCTAssertLessThanOrEqual(visible.maxX, captureWindow.bounds.maxX + 1)
                XCTAssertGreaterThanOrEqual(visible.minY, captureWindow.safeAreaInsets.top)
                XCTAssertLessThanOrEqual(visible.maxY, captureWindow.bounds.maxY - captureWindow.safeAreaInsets.bottom + 1)
                if scenario != .longTitleOwner { normalRowHeights.append(selectedRow.frame.height) }
            }
            if let smallest = normalRowHeights.min(), let largest = normalRowHeights.max() {
                XCTAssertLessThanOrEqual(largest - smallest, 1, "Adding a role badge must not change row height")
            }
        }
    }

    private struct AXRecord { let label: String; let frame: CGRect; let button: Bool }
    private func accessibilityRecords(_ root: UIView) -> [AXRecord] {
        var records: [AXRecord] = []
        var visited = Set<ObjectIdentifier>()
        func walk(_ object: NSObject) {
            guard visited.insert(ObjectIdentifier(object)).inserted else { return }
            if let label = object.accessibilityLabel, !label.isEmpty {
                records.append(AXRecord(label: label, frame: object.accessibilityFrame,
                    button: object.accessibilityTraits.contains(.button)))
            }
            if let view = object as? UIView { view.subviews.forEach(walk) }
            if let elements = object.accessibilityElements { elements.compactMap { $0 as? NSObject }.forEach(walk) }
            let count = object.accessibilityElementCount()
            if count > 0 && count < 1000 {
                for index in 0..<count { if let element = object.accessibilityElement(at: index) as? NSObject { walk(element) } }
            }
        }
        walk(root)
        return records
    }

    private func rect(_ value: CGRect) -> [String: CGFloat] {
        ["x": value.minX, "y": value.minY, "width": value.width, "height": value.height]
    }
    private func insets(_ value: UIEdgeInsets) -> [String: CGFloat] {
        ["top": value.top, "left": value.left, "bottom": value.bottom, "right": value.right]
    }
    private func attach(name: String, geometry: [String: Any], window: UIWindow) {
        var rendered = false
        let image = UIGraphicsImageRenderer(bounds: window.bounds).image { _ in
            rendered = window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
        }
        var measured = geometry
        measured["renderSucceeded"] = rendered
        let data = try! JSONSerialization.data(withJSONObject: measured, options: [.sortedKeys])
        let metadata = XCTAttachment(data: data, uniformTypeIdentifier: "public.json")
        metadata.name = name + "-geometry"; metadata.lifetime = .keepAlways; add(metadata)
        let screenshot = XCTAttachment(image: image)
        screenshot.name = name + "-screenshot"; screenshot.lifetime = .keepAlways; add(screenshot)
        XCTAssertTrue(rendered, "Actual native view hierarchy must render")
    }
}

private final class AccountsAppearanceProtocol: URLProtocol {
    static var handler: ((URLRequest) -> (Int, Data))?
    static var paths: [String] = []
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        AccountsAppearanceProtocol.paths.append((request.httpMethod ?? "") + " " + (request.url?.path ?? ""))
        let (status, data) = Self.handler?(request) ?? (403, Data())
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}
