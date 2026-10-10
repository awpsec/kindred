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
                var previous: CGRect?
                var stable = 0
                let deadline = Date().addingTimeInterval(8)
                while Date() < deadline {
                    if telemetryQuery.count == 1, telemetry.exists, let value = telemetry.value as? String,
                       let data = value.data(using: .utf8),
                       let decoded = try? JSONSerialization.jsonObject(with: data) as? [String: Any] { metadata = decoded }
                    let ready = metadata["launchID"] as? String == launchID && metadata["phase"] as? String == phase
                        && metadata["scenario"] as? String == scenario
                        && metadata["theme"] as? String == theme && metadata["textSize"] as? String == text
                        && ((scenario == "signedOut") || !(metadata["apiPaths"] as? [String] ?? []).isEmpty)
                    let labelMatches = rowQuery.count == 1 && row.exists && (role == "none" || row.label.contains(role))
                    if ready, labelMatches, row.frame.width > 100, row.frame.height > 0, row.frame == previous {
                        stable += 1
                    } else { stable = 0 }
                    previous = row.exists ? row.frame : nil
                    if stable >= 2 { break }
                    Thread.sleep(forTimeInterval: 0.06)
                }
                let rowFrame = row.exists ? row.frame : .zero
                let rowLabel = row.exists ? row.label : ""
                let windowFrame = current.windows.firstMatch.exists ? current.windows.firstMatch.frame : .zero
                let notifications = current.images.matching(NSPredicate(format: "label == %@", "Notifications on"))
                let selection = current.images.matching(NSPredicate(format: "label == %@", "Current account"))
                let nativeScreenshot = current.screenshot()
                let elements = current.descendants(matching: .any).allElementsBoundByAccessibilityElement
                let labels = elements.map { ["label": $0.label, "frame": rect($0.frame),
                    "elementType": $0.elementType.rawValue] as [String: Any] }
                var geometry = metadata
                geometry.merge(["schemaVersion": 2, "phase": phase, "scenario": scenario,
                    "theme": theme, "textSize": text, "expectedRoleLabel": role,
                    "rowLabel": rowLabel, "rowFrame": rect(rowFrame), "rowQueryCount": rowQuery.count, "telemetryQueryCount": telemetryQuery.count, "stableSamples": stable,
                    "notificationsQueryCount": notifications.count, "currentAccountQueryCount": selection.count,
                    "notificationsQuery": notifications.allElementsBoundByAccessibilityElement.map { ["label": $0.label, "frame": rect($0.frame)] },
                    "currentAccountQuery": selection.allElementsBoundByAccessibilityElement.map { ["label": $0.label, "frame": rect($0.frame)] },
                    "xcuiWindowFrame": rect(windowFrame), "accessibility": labels,
                    "appRunningForeground": current.state == .runningForeground,
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
                XCTAssertEqual(telemetryQuery.count, 1, "Refuse missing or duplicated native host telemetry")
                XCTAssertEqual(rowQuery.count, 1, "Refuse missing or duplicated account row")
                XCTAssertEqual(metadata["launchID"] as? String, launchID)
                XCTAssertEqual(metadata["phase"] as? String, phase)
                XCTAssertTrue(current.state == .runningForeground)
                XCTAssertGreaterThan(nativeScreenshot.image.size.width, 0)
                XCTAssertGreaterThan(nativeScreenshot.image.size.height, 0)
                XCTAssertTrue(row.exists, "Production Accounts selection row must be accessible")
                XCTAssertTrue(row.isHittable, "Actual selection row must be visible and hittable")
                XCTAssertTrue(rowLabel.contains(title))
                if role != "none" { XCTAssertTrue(rowLabel.contains(role)) }
                else { XCTAssertFalse(elements.contains { $0.label.localizedCaseInsensitiveContains("administrator") }) }
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
                XCTAssertEqual(notifications.count, 1, "Require one actual accessible notification image")
                XCTAssertEqual(selection.count, 1, "Require one actual accessible current-account image")
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
