import XCTest
import WebKit
@testable import Kindred

@MainActor
final class NativeVoiceTrayTests: XCTestCase {
    private func model(key: String = UUID().uuidString) -> [String: Any] {
        ["key": key, "rect": [12.0,12,358,64], "avatar": [12.0,14,36,36], "activity": [58.0,18,134,28],
         "shape": "cloud", "color": "#2475ff", "label": "Piper · 0:12", "status": "Listening…", "font": 12.0,
         "opacity": 1.0, "dark": true, "muted": false, "showingStatus": false, "interactive": true, "reduceMotion": false,
         "input": [0.0,0.4,0.7], "output": [0.1,0.3,0.1],
         "items": ["settings","mute","end"].enumerated().map { i, id in
             ["id": id, "label": id, "enabled": true, "rect": [Double(200+i*48),10,44,44]] as [String: Any]
         }]
    }

    func testRejectsInvalidMeterGeometryAndActions() {
        XCTAssertNotNil(NativeVoiceTray.Model(model()))
        for (key, value) in [("input", [Double.nan]), ("output", [1.1]), ("input", Array(repeating: 0.2, count: 41)),
                             ("rect", [0.0,0,Double.infinity,64]), ("avatar", [0.0,0,-1,36])] {
            var row = model(); row[key] = value; XCTAssertNil(NativeVoiceTray.Model(row), key)
        }
        var row = model(); row["key"] = "stale"; XCTAssertNil(NativeVoiceTray.Model(row))
        row = model(); row["reduceMotion"] = "off"; XCTAssertNil(NativeVoiceTray.Model(row))
        row = model(); row.removeValue(forKey: "reduceMotion"); XCTAssertNil(NativeVoiceTray.Model(row))
        row = model(); var items = row["items"] as! [[String: Any]]; items[0]["id"] = "end"; row["items"] = items
        XCTAssertNil(NativeVoiceTray.Model(row), "duplicate and unknown actions cannot reach native controls")
    }

    func testRealGlassRetainsCallAcrossResizesAndBlocksStaleTouches() throws {
        guard #available(iOS 26.0, *) else { throw XCTSkip("Liquid Glass requires iOS 26") }
        let host = UIView(frame: CGRect(x: 0, y: 0, width: 951, height: 669))
        let web = WKWebView(frame: host.bounds), chrome = NativeGlassControls(frame: host.bounds)
        host.addSubview(web); host.addSubview(chrome)
        let document = UUID().uuidString, key = UUID().uuidString
        var row = model(key: key)
        XCTAssertEqual(chrome.update(["document": document, "controls": [], "voice": row], in: web), ["voice"])
        let tray = try XCTUnwrap(chrome.voiceTray)
        XCTAssertEqual(tray.alpha, 0, "wait for the web foreground handoff before revealing UIKit")
        chrome.reveal(document: document)
        XCTAssertTrue(tray.material.effect is UIGlassEffect)
        XCTAssertEqual(tray.backgroundColor, .clear)
        XCTAssertEqual(tray.material.backgroundColor, .clear)
        XCTAssertTrue(tray.buttons.values.allSatisfy { $0.superview === tray.material.contentView })
        XCTAssertNil(chrome.hitTest(CGPoint(x: 800, y: 600), with: nil))
        var actions: [String] = []
        chrome.activateVoice = { action, receivedKey, doc in
            XCTAssertEqual(doc, document); XCTAssertEqual(receivedKey, key); actions.append(action)
        }
        tray.buttons["mute"]?.sendActions(for: .primaryActionTriggered)
        XCTAssertEqual(actions, ["mute"])
        row["rect"] = [40.0,90,358,64]; row["muted"] = true
        _ = chrome.update(["document": document, "controls": [], "voice": row], in: web)
        XCTAssertTrue(chrome.voiceTray === tray, "rotation moves the same glass surface")
        XCTAssertEqual(tray.frame.minY, 90)
        XCTAssertEqual(tray.buttons["mute"]?.accessibilityValue, "Muted")
        let oldEnd = try XCTUnwrap(tray.buttons["end"])
        _ = chrome.update(["document": document, "controls": [], "voice": model()], in: web)
        oldEnd.sendActions(for: .primaryActionTriggered)
        XCTAssertEqual(actions, ["mute"], "an earlier call's native End touch cannot target the next call")
        let nextTray = try XCTUnwrap(chrome.voiceTray)
        chrome.reset(); nextTray.buttons["end"]?.sendActions(for: .primaryActionTriggered)
        XCTAssertEqual(actions, ["mute"]); XCTAssertNil(chrome.voiceTray); XCTAssertTrue(chrome.subviews.isEmpty)
    }

    func testConnectingAndEndingStatesDisableUnavailableActions() throws {
        guard #available(iOS 26.0, *) else { throw XCTSkip("Liquid Glass requires iOS 26") }
        let tray = NativeVoiceTray(); var row = model()
        row["showingStatus"] = true; row["status"] = "Connecting…"
        var items = row["items"] as! [[String: Any]]; items[1]["enabled"] = false; row["items"] = items
        tray.apply(try XCTUnwrap(NativeVoiceTray.Model(row)))
        var actions: [String] = []; tray.activate = { actions.append($0) }
        tray.buttons["mute"]?.sendActions(for: .primaryActionTriggered); XCTAssertTrue(actions.isEmpty)
        tray.buttons["end"]?.sendActions(for: .primaryActionTriggered); XCTAssertEqual(actions, ["end"])
        row["interactive"] = false; tray.apply(try XCTUnwrap(NativeVoiceTray.Model(row)))
        tray.buttons["end"]?.sendActions(for: .primaryActionTriggered); XCTAssertEqual(actions, ["end"])
        XCTAssertTrue(tray.accessibilityElementsHidden)
    }

    func testMeterHonorsAppReducedMotionAndLivePreferenceChanges() throws {
        let tray = NativeVoiceTray(); var row = model()
        tray.apply(try XCTUnwrap(NativeVoiceTray.Model(row)))
        let layers = tray.material.contentView.subviews.flatMap { $0.layer.sublayers ?? [] }
            .compactMap { $0 as? CAShapeLayer }
        XCTAssertEqual(layers.count, 1, "one stationary row renders the current speaker")
        func assertMeterAnimation(_ enabled: Bool, file: StaticString = #filePath, line: UInt = #line) {
            for layer in layers { XCTAssertEqual(layer.animation(forKey: "meter") != nil, enabled, file: file, line: line) }
        }

        tray.updateMeter(input: [0.2, 0.8, 0.4], output: [0.6, 0.2, 0.1])
        assertMeterAnimation(!UIAccessibility.isReduceMotionEnabled)

        row["reduceMotion"] = true
        tray.apply(try XCTUnwrap(NativeVoiceTray.Model(row)))
        assertMeterAnimation(false) // The already-running tween is cancelled.
        tray.updateMeter(input: [0.1, 0.9, 0.3], output: [0.2, 0.7, 0.1])
        assertMeterAnimation(false)
        XCTAssertTrue(layers.allSatisfy { ($0.path?.boundingBox.height ?? 0) > 16 },
                      "reduced motion keeps real levels visible without interpolation")

        row["reduceMotion"] = false
        tray.apply(try XCTUnwrap(NativeVoiceTray.Model(row)))
        tray.updateMeter(input: [0.2, 0.6, 0.3], output: [0.7, 0.2, 0.1])
        assertMeterAnimation(!UIAccessibility.isReduceMotionEnabled)
        NotificationCenter.default.post(name: UIAccessibility.reduceMotionStatusDidChangeNotification, object: nil)
        assertMeterAnimation(false) // System preference changes stop in-flight ink too.
        tray.updateMeter(input: [0.4, 0.6, 0.2], output: [0.2, 0.6, 0.1])
        assertMeterAnimation(!UIAccessibility.isReduceMotionEnabled)
    }

    func testMeterKeepsPositionsAndUsesBotColorSpeakerShades() throws {
        let tray = NativeVoiceTray(); var row = model()
        tray.apply(try XCTUnwrap(NativeVoiceTray.Model(row)))
        let layer = try XCTUnwrap(tray.material.contentView.subviews.flatMap { $0.layer.sublayers ?? [] }.compactMap { $0 as? CAShapeLayer }.first)
        let zero = Array(repeating: 0.0, count: 3)
        tray.updateMeter(input: [0.2,0.8,0.4], output: zero, animated: false)
        let inputInk = try XCTUnwrap(layer.fillColor)
        let first = try XCTUnwrap(layer.path).boundingBox
        tray.updateMeter(input: [0.4,0.6,0.3], output: zero, animated: false)
        let second = try XCTUnwrap(layer.path).boundingBox
        XCTAssertEqual(first.minX, second.minX); XCTAssertEqual(first.maxX, second.maxX)
        XCTAssertEqual(first.midY, second.midY); XCTAssertNotEqual(first.height, second.height)
        tray.updateMeter(input: zero, output: [0.2,0.8,0.4], animated: false)
        XCTAssertNotEqual(inputInk, layer.fillColor)
        let outputInk = layer.fillColor
        let botColor = UIColor(red: 36.0/255, green: 117.0/255, blue: 1, alpha: 1)
        XCTAssertEqual(outputInk, botColor.cgColor, "bot speech uses the call avatar color")
        XCTAssertEqual(inputInk, botColor.withAlphaComponent(0.62).cgColor, "human speech uses a softer shade of that same color")
        tray.updateMeter(input: zero, output: Array(repeating: 0.107, count: 3), animated: false)
        XCTAssertNotEqual(outputInk, layer.fillColor)
        XCTAssertLessThanOrEqual(try XCTUnwrap(layer.path).boundingBox.height, 3.01)
        row["color"] = "#ef6611"; row["dark"] = false
        tray.apply(try XCTUnwrap(NativeVoiceTray.Model(row)))
        tray.updateMeter(input: zero, output: [0.2,0.8,0.4], animated: false)
        XCTAssertEqual(layer.fillColor, UIColor(red: 239.0/255, green: 102.0/255, blue: 17.0/255, alpha: 1).cgColor,
                       "an updated avatar changes the retained meter in either theme")
    }
}
