import AVFoundation
import KindredCore
import Speech
import UIKit
import XCTest
@testable import Kindred

/// Injectable lifecycle proof is distinct from the opt-in actual Apple audio test.
@MainActor
final class NativeDictationTests: XCTestCase {
    private func wait(_ predicate: () -> Bool, timeout: TimeInterval = 2) async throws {
        let end = Date().addingTimeInterval(timeout)
        while Date() < end {
            if predicate() { return }
            try await Task.sleep(nanoseconds: 10_000_000)
        }
        XCTFail("Native dictation state did not converge")
        throw NSError(domain: "NativeDictationTests", code: 1)
    }
    private func start(_ service: NativeDictation) {
        service.start(documentID: UUID().uuidString, operationID: "test-op", chatID: "test-chat", locale: "en-US")
    }
    func testCumulativePartialsFinalAndDuplicateFinal() async throws {
        let service = NativeDictation(); defer { service.tearDown() }
        var hooks = NativeDictation.TestHooks(); var order: [String] = []
        hooks.microphonePermission = { order.append("microphone"); return true }
        hooks.speechPermission = { order.append("speech"); return .authorized }
        hooks.capture = { _ in order.append("capture") }
        service.testHooks = hooks
        var events: [[String: Any]] = []; service.emit = { events.append($0) }
        start(service); try await wait { service.phase == "recording" }
        XCTAssertEqual(order, ["microphone", "speech", "capture"])
        let op = try XCTUnwrap(service.operation)
        service.acceptRecognition(text: "hello", final: false, failed: false, operation: op)
        service.acceptRecognition(text: "hello world", final: false, failed: false, operation: op)
        service.acceptRecognition(text: "Hello world.", final: true, failed: false, operation: op)
        let count = events.count
        service.acceptRecognition(text: "duplicate", final: true, failed: false, operation: op)
        XCTAssertEqual(events.count, count)
        XCTAssertEqual(events.compactMap { $0["phase"] as? String }, ["authorizing", "recording", "partial", "partial", "final", "stopped"])
        XCTAssertEqual(events.compactMap { $0["sequence"] as? Int }, Array(1...6))
        XCTAssertEqual(events.last?["text"] as? String, "Hello world.")
        XCTAssertNil(service.operation)
    }
    func testPermissionDenialAndUnsupportedDoNotCapture() async throws {
        for code in ["speech-denied", "speech-restricted", "speech-timeout", "microphone-denied", "microphone-timeout", "on-device-unavailable", "recognizer-unavailable"] {
            let service = NativeDictation(); defer { service.tearDown() }
            var hooks = NativeDictation.TestHooks(); var captures = 0
            hooks.capture = { _ in captures += 1 }
            if code == "speech-denied" { hooks.speechPermission = { .denied } }
            if code == "speech-restricted" { hooks.speechPermission = { .restricted } }
            if code == "speech-timeout" { hooks.speechPermission = { nil } }
            if code == "microphone-denied" { hooks.microphonePermission = { false } }
            if code == "microphone-timeout" { hooks.microphonePermission = { nil } }
            if code == "on-device-unavailable" { hooks.support = false }
            if code == "recognizer-unavailable" { hooks.available = false }
            service.testHooks = hooks
            var events: [[String: Any]] = []; service.emit = { events.append($0) }
            start(service); try await wait { events.contains { $0["phase"] as? String == "error" } }
            XCTAssertEqual(events.last?["errorCode"] as? String, code)
            XCTAssertEqual(captures, 0)
        }
    }
    func testCancelledPermissionCannotStartOrEnterNewChat() async throws {
        let service = NativeDictation(); defer { service.tearDown() }
        var resume: CheckedContinuation<SFSpeechRecognizerAuthorizationStatus?, Never>?
        var hooks = NativeDictation.TestHooks(); var captures = 0
        hooks.speechPermission = { await withCheckedContinuation { resume = $0 } }
        hooks.capture = { _ in captures += 1 }; service.testHooks = hooks
        start(service); try await wait { resume != nil }
        let old = try XCTUnwrap(service.operation)
        service.cancel(reason: "context-changed")
        resume?.resume(returning: .authorized); resume = nil
        try await Task.sleep(nanoseconds: 20_000_000)
        XCTAssertEqual(captures, 0); XCTAssertNil(service.operation)
        service.testHooks = NativeDictation.TestHooks()
        service.start(documentID: UUID().uuidString, operationID: "fresh", chatID: "other-chat", locale: "en-US")
        try await wait { service.phase == "recording" }
        var events: [[String: Any]] = []; service.emit = { events.append($0) }
        service.acceptRecognition(text: "old result", final: true, failed: false, operation: old)
        XCTAssertTrue(events.isEmpty); XCTAssertEqual(service.operation?.chatID, "other-chat")
    }
    func testStopFallbackAndBackgroundPreserveLastPreview() async throws {
        let service = NativeDictation(); defer { service.tearDown() }
        service.testHooks = NativeDictation.TestHooks()
        var events: [[String: Any]] = []; service.emit = { events.append($0) }
        start(service); try await wait { service.phase == "recording" }
        let op = try XCTUnwrap(service.operation)
        service.acceptRecognition(text: "words so far", final: false, failed: false, operation: op)
        service.stop(operationID: op.operationID, chatID: op.chatID)
        try await wait({ service.operation == nil }, timeout: 4)
        XCTAssertEqual(events.last?["phase"] as? String, "stopped")
        XCTAssertEqual(events.last?["errorCode"] as? String, "finalization-timeout")
        XCTAssertEqual(events.last?["text"] as? String, "words so far")
        XCTAssertFalse(events.contains { $0["phase"] as? String == "final" })
        start(service); try await wait { service.phase == "recording" }
        let fresh = try XCTUnwrap(service.operation)
        service.acceptRecognition(text: "kept on background", final: false, failed: false, operation: fresh)
        service.cancel(reason: "background")
        XCTAssertEqual(events.last?["reason"] as? String, "background")
        XCTAssertEqual(events.last?["text"] as? String, "kept on background")
        let count = events.count
        service.acceptRecognition(text: "late", final: true, failed: false, operation: fresh)
        XCTAssertEqual(events.count, count)
    }
    func testErrorLimitAndAudioFailureNeverReplay() async throws {
        let service = NativeDictation(); defer { service.tearDown() }
        var hooks = NativeDictation.TestHooks()
        hooks.capture = { _ in throw NSError(domain: "synthetic", code: 1) }
        service.testHooks = hooks
        var events: [[String: Any]] = []; service.emit = { events.append($0) }
        start(service); try await wait { service.operation == nil }
        XCTAssertEqual(events.last?["errorCode"] as? String, "audio-start-failed")
        service.testHooks = NativeDictation.TestHooks()
        start(service); try await wait { service.phase == "recording" }
        let op = try XCTUnwrap(service.operation)
        service.acceptRecognition(text: String(repeating: "a", count: 16_385), final: false, failed: false, operation: op)
        XCTAssertEqual(events.last?["errorCode"] as? String, "transcript-limit")
        XCTAssertNil(service.operation)
    }

    /// Opt-in real recognizer route. Supply a nonprivate prerecorded PCM speech
    /// file after a selected Mac/device test authorizes Speech permission. It
    /// uses production SFSpeechRecognizer and never opens the microphone.
    func testActualOnDeviceRecordedAudioProducesPartialsAndFinal() async throws {
        guard let path = ProcessInfo.processInfo.environment["KINDRED_TEST_SPEECH_AUDIO_FILE"] else {
            throw XCTSkip("Actual Apple recognition requires an explicitly selected nonprivate audio fixture and supported device/locale")
        }
        let service = NativeDictation(); defer { service.tearDown() }
        service.selectLocale("en-US")
        guard service.onDeviceAvailable, service.recognizerAvailable else {
            throw XCTSkip("Selected simulator/device has no available on-device en-US recognizer; real device recognition remains unproved")
        }
        let file = try AVAudioFile(forReading: URL(fileURLWithPath: path))
        XCTAssertGreaterThan(file.length, 0)
        XCTAssertLessThanOrEqual(Double(file.length) / file.processingFormat.sampleRate, 15)
        var feedFailed = false
        service.testAudio = { [weak service] request in
            Task { @MainActor in
                do {
                    while file.framePosition < file.length {
                        guard service?.operation != nil else { return }
                        let buffer = try XCTUnwrap(AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: 2048))
                        try file.read(into: buffer)
                        request.append(buffer)
                        let delay = UInt64(Double(buffer.frameLength) / file.processingFormat.sampleRate * 1_000_000_000)
                        try await Task.sleep(nanoseconds: delay)
                    }
                    request.endAudio()
                } catch { feedFailed = true; request.endAudio() }
            }
        }
        var events: [[String: Any]] = []; service.emit = { events.append($0) }
        start(service)
        try await wait({ events.contains { $0["phase"] as? String == "final" } || events.contains { $0["phase"] as? String == "error" } }, timeout: 30)
        XCTAssertTrue(events.contains { $0["phase"] as? String == "partial" }, "Real partial result required; synthetic callbacks do not count")
        XCTAssertTrue(events.contains { $0["phase"] as? String == "final" && !($0["text"] as? String ?? "").isEmpty })
        XCTAssertEqual(events.last?["phase"] as? String, "stopped")
        XCTAssertFalse(feedFailed)
    }
}
