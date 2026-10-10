import XCTest
import UIKit

/// Supported XCUI accessibility queries against a DEBUG-only synthetic host.
/// The target app renders its production AccountsSheet and owns host telemetry.
@MainActor
final class AccountsAppearanceUIKitTests: XCTestCase {
    private var app: XCUIApplication?
    private let scenarios = ["administrator", "owner", "user", "unknown", "signedOut", "longTitleOwner"]

    override func tearDown() {
        app?.terminate(); app = nil
        super.tearDown()
    }

    func testAccountsRolesLightDarkDefaultText() throws {
        try captureMatrix(text: "default")
    }
    func testAccountsRolesLightDarkAccessibilityText() throws {
        try captureMatrix(text: "ax")
    }

    private func captureMatrix(text: String) throws {
        for theme in ["light", "dark"] {
            var standardHeights: [CGFloat] = []
            for scenario in scenarios {
                app?.terminate()
                let current = XCUIApplication()
                app = current
                let launchID = UUID().uuidString
                current.launchEnvironment = ["KINDRED_ACCOUNTS_UI_TEST": "1",
                    "KINDRED_ACCOUNTS_SCENARIO": scenario, "KINDRED_ACCOUNTS_THEME": theme,
                    "KINDRED_ACCOUNTS_TEXT": text, "KINDRED_ACCOUNTS_LAUNCH": launchID]
                current.launch()
                let title = scenario == "longTitleOwner"
                    ? "A very long workspace title that must truncate before its role badge and status" : "Capture workspace"
                let role = scenario == "owner" || scenario == "longTitleOwner" ? "Owner, administrator"
                    : (scenario == "administrator" ? "Administrator" : "none")
                let phase = "accounts-\(theme)-\(text)-\(scenario)"
                let telemetryQuery = current.staticTexts.matching(identifier: "accounts-fixture-telemetry")
                let telemetry = telemetryQuery.firstMatch
                let rowQuery = current.buttons.matching(NSPredicate(format:
                    "label CONTAINS %@ AND NOT (label BEGINSWITH %@)", title, "Details for "))
                let row = rowQuery.firstMatch
                var metadata: [String: Any] = [:]
                var rowCount = 0
                var telemetryCount = 0
                var sampledRowFrame = CGRect.zero
                var sampledRowLabel = ""
                var previous: CGRect?
                var stable = 0
                let deadline = Date().addingTimeInterval(8)
                while Date() < deadline {
                    telemetryCount = telemetryQuery.count
                    if telemetryCount == 1, let value = telemetry.value as? String,
                       let data = value.data(using: .utf8),
                       let decoded = try? JSONSerialization.jsonObject(with: data) as? [String: Any] { metadata = decoded }
                    let ready = metadata["launchID"] as? String == launchID && metadata["phase"] as? String == phase
                        && metadata["scenario"] as? String == scenario
                        && metadata["theme"] as? String == theme && metadata["textSize"] as? String == text
                        && ((scenario == "signedOut") || !(metadata["apiPaths"] as? [String] ?? []).isEmpty)
                    rowCount = rowQuery.count
                    sampledRowFrame = rowCount == 1 ? row.frame : .zero
                    sampledRowLabel = rowCount == 1 ? row.label : ""
                    let labelMatches = rowCount == 1 && (role == "none" || sampledRowLabel.contains(role))
                    if ready, labelMatches, sampledRowFrame.width > 100, sampledRowFrame.height > 0, sampledRowFrame == previous {
                        stable += 1
                    } else { stable = 0 }
                    previous = rowCount == 1 ? sampledRowFrame : nil
                    if stable >= 2 { break }
                    Thread.sleep(forTimeInterval: 0.06)
                }
                let rowFrame = sampledRowFrame
                let rowLabel = sampledRowLabel
                let rowHittable = rowCount == 1 && row.isHittable
                let windowQuery = current.windows
                let windowFrame = windowQuery.count > 0 ? windowQuery.firstMatch.frame : .zero
                let notifications = current.images.matching(NSPredicate(format: "label == %@", "Notifications on"))
                let selection = current.images.matching(NSPredicate(format: "label == %@", "Current account"))
                let notificationsCount = notifications.count
                let selectionCount = selection.count
                let notificationRecords: [[String: Any]] = notificationsCount == 1
                    ? [["label": notifications.firstMatch.label, "frame": rect(notifications.firstMatch.frame)]] : []
                let selectionRecords: [[String: Any]] = selectionCount == 1
                    ? [["label": selection.firstMatch.label, "frame": rect(selection.firstMatch.frame)]] : []
                let forbiddenPredicate = "label CONTAINS[c] 'administrator'"
                let forbiddenCount = current.descendants(matching: .any).matching(
                    NSPredicate(format: "label CONTAINS[c] %@", "administrator")).count
                let forbiddenQuery: [String: Any] = ["predicate": forbiddenPredicate,
                    "source": "XCUIElementQuery matching supported NSPredicate against actual app descendants",
                    "count": forbiddenCount]
                let labels: [[String: Any]] = (rowCount == 1 ? [["label": rowLabel, "frame": rect(rowFrame)]] : [])
                    + notificationRecords + selectionRecords
                let appForeground = current.state == .runningForeground
                let nativeScreenshot = current.screenshot()
                var geometry = metadata
                geometry.merge(["schemaVersion": 2, "phase": phase, "scenario": scenario,
                    "theme": theme, "textSize": text, "expectedRoleLabel": role,
                    "rowLabel": rowLabel, "rowFrame": rect(rowFrame), "rowQueryCount": rowCount, "telemetryQueryCount": telemetryCount, "stableSamples": stable,
                    "notificationsQueryCount": notificationsCount, "currentAccountQueryCount": selectionCount,
                    "notificationsQuery": notificationRecords, "currentAccountQuery": selectionRecords,
                    "rowHittable": rowHittable,
                    "accessibilityScope": "required row/icon query projection",
                    "forbiddenAdministratorQuery": forbiddenQuery,
                    "xcuiWindowFrame": rect(windowFrame), "accessibility": labels,
                    "appRunningForeground": appForeground,
                    "screenshotCaptured": nativeScreenshot.image.size.width > 0 && nativeScreenshot.image.size.height > 0,
                    "screenshotSource": "XCUIApplication.screenshot of this launch; not drawHierarchy",
                    "screenshotSize": ["width": nativeScreenshot.image.size.width, "height": nativeScreenshot.image.size.height],
                    "accessibilityMeasurement": "XCUIElementQuery; no in-process UIView traversal",
                    "hostMeasurement": "DEBUG app-host telemetry; separately measured native traits/font/safeArea",
                    "measuredHost": metadata, "expectedLaunchID": launchID,
                    "coordinateSpace": "XCUI row/window frames in screen coordinates; native window safeArea is edge distances",
                    "proofScope": "actual native screenshot, queried accessibility labels/bounds and host traits; no audible VoiceOver/device/recognition proof"
                ]) { _, new in new }
                let screenshot = XCTAttachment(screenshot: nativeScreenshot)
                screenshot.name = phase + "-screenshot"; screenshot.lifetime = .keepAlways; add(screenshot)
                let data = try JSONSerialization.data(withJSONObject: geometry, options: [.sortedKeys])
                let attachment = XCTAttachment(data: data, uniformTypeIdentifier: "public.json")
                attachment.name = phase + "-geometry"; attachment.lifetime = .keepAlways; add(attachment)

                // Evidence is retained before failures; never waive missing labels.
                XCTAssertGreaterThanOrEqual(stable, 2, "Actual XCUI account row must settle in eight seconds")
                XCTAssertEqual(telemetryCount, 1, "Refuse missing or duplicated native host telemetry")
                XCTAssertEqual(rowCount, 1, "Refuse missing or duplicated account row")
                XCTAssertEqual(metadata["launchID"] as? String, launchID)
                XCTAssertEqual(metadata["phase"] as? String, phase)
                XCTAssertTrue(appForeground)
                XCTAssertGreaterThan(nativeScreenshot.image.size.width, 0)
                XCTAssertGreaterThan(nativeScreenshot.image.size.height, 0)
                XCTAssertEqual(rowCount, 1, "Production Accounts selection row must be accessible")
                XCTAssertTrue(rowHittable, "Actual selection row must be visible and hittable")
                XCTAssertTrue(rowLabel.contains(title))
                if role != "none" { XCTAssertTrue(rowLabel.contains(role)) }
                else { XCTAssertEqual(forbiddenCount, 0, "Actual app must expose no administrator label for this scenario") }
                XCTAssertEqual(metadata["signedIn"] as? Bool, scenario != "signedOut")
                XCTAssertEqual(metadata["observedCategory"] as? String, metadata["requestedCategory"] as? String)
                XCTAssertEqual(metadata["observedInterfaceStyle"] as? Int, theme == "light" ? 1 : 2)
                XCTAssertEqual(metadata["nativeReduceMotion"] as? Bool, true)
                XCTAssertEqual(metadata["windowIsKey"] as? Bool, true)
                XCTAssertEqual(metadata["windowHidden"] as? Bool, false)
                XCTAssertEqual(metadata["hostAttached"] as? Bool, true)
                let paths = metadata["apiPaths"] as? [String] ?? []
                XCTAssertTrue(paths.allSatisfy { $0 == "GET /identity/profiles" })
                if scenario == "signedOut" { XCTAssertTrue(paths.isEmpty) }
                else { XCTAssertFalse(paths.isEmpty) }
                XCTAssertEqual(notificationsCount, 1, "Require one actual accessible notification image")
                XCTAssertEqual(selectionCount, 1, "Require one actual accessible current-account image")
                let hostWindow = metadata["windowBounds"] as? [String: Double] ?? [:]
                XCTAssertEqual(windowFrame.width, hostWindow["width"] ?? -1, accuracy: 1)
                XCTAssertEqual(windowFrame.height, hostWindow["height"] ?? -1, accuracy: 1)
                let safe = metadata["safeArea"] as? [String: Double] ?? [:]
                XCTAssertGreaterThanOrEqual(rowFrame.minX, windowFrame.minX)
                XCTAssertLessThanOrEqual(rowFrame.maxX, windowFrame.maxX + 1)
                XCTAssertGreaterThanOrEqual(rowFrame.minY, windowFrame.minY + (safe["top"] ?? 0))
                XCTAssertLessThanOrEqual(rowFrame.maxY, windowFrame.maxY - (safe["bottom"] ?? 0) + 1)
                if scenario != "longTitleOwner" { standardHeights.append(rowFrame.height) }
                current.terminate()
            }
            if let low = standardHeights.min(), let high = standardHeights.max() {
                XCTAssertLessThanOrEqual(high - low, 1, "Role badge must not alter same-sized row height")
            }
        }
    }
    private func rect(_ value: CGRect) -> [String: CGFloat] {
        ["x": value.minX, "y": value.minY, "width": value.width, "height": value.height]
    }
}
