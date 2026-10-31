import AVFoundation
import Foundation
import UIKit
import XCTest
@testable import Kindred

/// Default fixtures never open the microphone, provider, or Live Activities.
/// The explicitly opted-in physical test captures real PCM into a fake socket
/// that discards audio; it never creates a provider session or stores samples.
@MainActor
final class NativeVoiceCallTests: XCTestCase {
    private let owner = UUID()
    private let origin = URL(string: "https://voice-fixture.invalid")!

    private func wait(_ predicate: () -> Bool, timeout: TimeInterval = 2) async throws {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if predicate() { return }
            try await Task.sleep(for: .milliseconds(10))
        }
        XCTFail("Native voice fixture did not converge")
        throw URLError(.timedOut)
    }
    private func drainMainQueue() async {
        await withCheckedContinuation { continuation in
            DispatchQueue.main.async { continuation.resume() }
        }
    }
    private func hooks(audio: VoiceAudioFixture, socket: VoiceSocketFixture) -> NativeVoiceCall.TestHooks {
        var hooks = NativeVoiceCall.TestHooks()
        hooks.microphonePermission = { true }
        hooks.audio = { _ in audio }
        hooks.connection = { _ in socket }
        return hooks
    }
    private func start(_ call: NativeVoiceCall, id: String, emit: @escaping ([String: Any]) -> Void = { _ in }) {
        call.start(id: id, owner: owner, origin: origin, ticket: String(repeating: "a", count: 64),
                   name: "Piper", shape: "round", color: "#2475ff", emit: emit)
    }
    private func connect(_ call: NativeVoiceCall, audio: VoiceAudioFixture, socket: VoiceSocketFixture,
                         id: String, emit: @escaping ([String: Any]) -> Void = { _ in }) async throws {
        start(call, id: id, emit: emit)
        try await wait { audio.capture != nil }
        audio.capture?(Data(count: 1920))
        try await wait { socket.receiving }
        socket.push(["type": "started"])
        try await wait { call.snapshot(owner: owner, id: id)?["type"] as? String == "started" }
    }

    func testPermissionGrantWaitsForForegroundBeforeStartingCapture() async throws {
        let call = NativeVoiceCall(), audio = VoiceAudioFixture(), socket = VoiceSocketFixture(), id = UUID().uuidString
        defer { call.end(owner: owner) }
        var active = true, opened = 0
        var fixture = hooks(audio: audio, socket: socket)
        fixture.foreground = { active }
        fixture.microphonePermission = { active = false; return true }
        fixture.connection = { _ in opened += 1; return socket }
        call.testHooks = fixture
        start(call, id: id)
        try await wait { call.debugCaptureDiagnostics.stage == .foregroundWait }
        try await Task.sleep(for: .milliseconds(150))
        XCTAssertNil(audio.capture); XCTAssertEqual(opened, 0)
        XCTAssertTrue(call.isActive, "The waiting call still reserves the microphone against dictation")
        active = true
        try await wait { audio.capture != nil }
        XCTAssertEqual(opened, 0, "Foreground permission is not proof of captured PCM")
        audio.capture?(Data(count: 1920))
        try await wait { opened == 1 && socket.receiving }
        XCTAssertTrue(call.debugCaptureDiagnostics.foreground)
        socket.push(["type": "started"])
        try await wait { call.snapshot(owner: owner, id: id)?["type"] as? String == "started" }
        call.end(id: id); socket.push(["type": "ended", "saved": true])
        try await wait { !call.isActive }
    }

    func testForegroundWaitTimesOutWithoutStartingAudioOrConnection() async throws {
        let call = NativeVoiceCall(), audio = VoiceAudioFixture(), socket = VoiceSocketFixture(), id = UUID().uuidString
        defer { call.end(owner: owner) }
        var active = true, factories = 0, opened = 0, events: [[String: Any]] = []
        var fixture = hooks(audio: audio, socket: socket)
        fixture.foreground = { active }
        fixture.microphonePermission = { active = false; return true }
        fixture.audio = { _ in factories += 1; return audio }
        fixture.connection = { _ in opened += 1; return socket }
        call.testHooks = fixture
        start(call, id: id) { events.append($0) }
        try await wait({ events.contains { $0["terminal"] as? Bool == true } }, timeout: 3)
        XCTAssertFalse(call.isActive); XCTAssertEqual(factories, 0); XCTAssertEqual(opened, 0)
        XCTAssertEqual(call.debugCaptureDiagnostics.stage, .foregroundTimeout)
        XCTAssertEqual(events.last?["message"] as? String, "Bring Kindred to the foreground, then try the call again.")
        XCTAssertEqual(events.filter { $0["type"] as? String == "error" }.count, 1)
    }

    func testCancelledForegroundWaitCannotStartOrAffectReplacementCall() async throws {
        let call = NativeVoiceCall(), oldAudio = VoiceAudioFixture(), newAudio = VoiceAudioFixture(), socket = VoiceSocketFixture()
        let old = UUID().uuidString, current = UUID().uuidString
        defer { call.end(owner: owner) }
        var active = true, opened = 0, oldEvents: [[String: Any]] = []
        var fixture = hooks(audio: oldAudio, socket: socket)
        fixture.foreground = { active }
        fixture.microphonePermission = { active = false; return true }
        fixture.connection = { _ in opened += 1; return socket }
        call.testHooks = fixture
        start(call, id: old) { oldEvents.append($0) }
        try await wait { call.debugCaptureDiagnostics.stage == .foregroundWait }
        call.end(owner: owner)
        XCTAssertFalse(call.isActive)
        active = true; fixture.microphonePermission = { true }; fixture.audio = { _ in newAudio }; call.testHooks = fixture
        start(call, id: current)
        try await wait { newAudio.capture != nil }
        try await Task.sleep(for: .milliseconds(150))
        XCTAssertNil(oldAudio.capture); XCTAssertEqual(opened, 0)
        XCTAssertEqual(oldEvents.last?["type"] as? String, "ended")
        call.end(id: old); call.checkCapture(id: old)
        XCTAssertTrue(call.owns(owner: owner, id: current)); XCTAssertFalse(newAudio.stopped)
        newAudio.capture?(Data(count: 1920)); try await wait { opened == 1 }
        socket.push(["type": "started"])
        try await wait { call.snapshot(owner: owner, id: current)?["type"] as? String == "started" }
        call.end(id: current); socket.push(["type": "ended", "saved": true])
        try await wait { !call.isActive }
    }

    func testAudioStartupFailureKeepsSafeStageWithoutOpeningConnection() async throws {
        for stage in [VoiceCaptureStage.activation, .inputFormat, .engineStart] {
            let call = NativeVoiceCall(), audio = VoiceAudioFixture(), socket = VoiceSocketFixture(), id = UUID().uuidString
            defer { call.end(owner: owner) }
            let privateMarker = "PRIVATE-TRANSCRIPT-TICKET-DEVICE"
            let failure = VoiceCaptureStartupError(stage: stage,
                error: NSError(domain: NSOSStatusErrorDomain, code: 561017449,
                               userInfo: [NSLocalizedDescriptionKey: privateMarker, "ticket": privateMarker]))
            audio.startError = failure
            var opened = 0, events: [[String: Any]] = []
            var fixture = hooks(audio: audio, socket: socket)
            fixture.connection = { _ in opened += 1; return socket }; call.testHooks = fixture
            start(call, id: id) { events.append($0) }
            try await wait { events.contains { $0["terminal"] as? Bool == true } }
            XCTAssertFalse(call.isActive); XCTAssertEqual(opened, 0); XCTAssertTrue(audio.stopped)
            XCTAssertEqual(events.last?["message"] as? String, failure.userMessage)
            let diagnostic = call.debugCaptureDiagnostics
            XCTAssertEqual(diagnostic.errorStage, stage)
            XCTAssertEqual(diagnostic.error?.domain, NSOSStatusErrorDomain); XCTAssertEqual(diagnostic.error?.code, 561017449)
            XCTAssertFalse(diagnostic.text.contains(privateMarker))
            XCTAssertFalse(String(describing: events).contains(privateMarker))
            XCTAssertEqual(events.filter { $0["type"] as? String == "error" }.count, 1)
        }
    }

    func testCaptureDiagnosticsBoundCountersAndRejectPrivateErrorDomains() throws {
        let diagnostic = VoiceCaptureDiagnostics()
        let privateMarker = "PRIVATE-DEVICE-NAME-OR-TOKEN"
        diagnostic.permission(true, foreground: true)
        diagnostic.capture(rawFrames: Int.max, convertedFrames: Int.max)
        diagnostic.capture(rawFrames: 512, convertedFrames: 0)
        diagnostic.conversionFailed(NSError(domain: privateMarker, code: -50, userInfo: [NSLocalizedDescriptionKey: privateMarker]))
        diagnostic.record(.captureStalled)
        let snapshot = diagnostic.snapshot
        XCTAssertEqual(snapshot.rawBuffers, 2); XCTAssertEqual(snapshot.convertedBuffers, 1)
        XCTAssertEqual(snapshot.rawFrames, 1_000_512); XCTAssertEqual(snapshot.convertedFrames, 1_000_000)
        XCTAssertEqual(snapshot.conversionFailures, 1); XCTAssertEqual(snapshot.conversionError?.domain, "other")
        XCTAssertEqual(snapshot.conversionError?.code, -50)
        XCTAssertFalse(snapshot.text.contains(privateMarker)); XCTAssertLessThan(snapshot.text.count, 2048)
        XCTAssertNotNil(try JSONSerialization.jsonObject(with: Data(snapshot.text.utf8)) as? [String: Any])
    }

    func testStartupConfigurationRecoveryReplacesConverterAndCoalescesNotifications() async throws {
        let recovery = VoiceCaptureStartupRecovery(), diagnostics = VoiceCaptureDiagnostics()
        let target = try XCTUnwrap(AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 24000, channels: 1, interleaved: true))
        let oldFormat = try XCTUnwrap(AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 1))
        let newFormat = try XCTUnwrap(AVAudioFormat(standardFormatWithSampleRate: 48000, channels: 2))
        var packets: [Data] = []
        var process = try VoiceAudioPipe.captureProcessor(input: oldFormat, pcm: target, diagnostics: diagnostics) { packets.append($0) }
        var running = false, rebuilds = 0, failures = 0
        recovery.begin()
        func notify() {
            recovery.configurationChanged(isRunning: { running }, hasPCM: { diagnostics.snapshot.convertedFrames > 0 }, rebuild: {
                rebuilds += 1; diagnostics.record(.configurationRecovery)
                process = try VoiceAudioPipe.captureProcessor(input: newFormat, pcm: target, diagnostics: diagnostics) { packets.append($0) }
                // A notification generated by restart must not recursively retry.
                notify(); running = true
            }, failed: { _ in failures += 1 })
        }
        notify(); notify()
        XCTAssertEqual(rebuilds, 0, "Recovery must leave the notification callback queue first")
        await drainMainQueue(); await drainMainQueue()
        XCTAssertEqual(rebuilds, 1); XCTAssertEqual(failures, 0)
        let buffer = try XCTUnwrap(AVAudioPCMBuffer(pcmFormat: newFormat, frameCapacity: 2048))
        buffer.frameLength = 2048
        for channel in 0..<2 {
            for frame in 0..<2048 { buffer.floatChannelData![channel][frame] = Float(sin(2 * .pi * 440 * Double(frame) / 48000) * 0.2) }
        }
        process(buffer); process(buffer)
        XCTAssertEqual(packets.count, 2)
        XCTAssertTrue(packets.allSatisfy { !$0.isEmpty && $0.count <= 2080 && VoiceAudioPipe.level($0) > 0.01 })
        XCTAssertEqual(diagnostics.snapshot.rawFrames, 4096)
        XCTAssertGreaterThan(diagnostics.snapshot.convertedFrames, 0); XCTAssertEqual(diagnostics.snapshot.conversionFailures, 0)
        XCTAssertEqual(diagnostics.snapshot.configurationRecoveries, 1)
        running = false; notify(); await drainMainQueue()
        XCTAssertEqual(rebuilds, 1, "Once PCM exists, this startup path cannot migrate a live call")
        recovery.cancel()
    }

    func testStartupRecoveryIgnoresRunningAndAlreadyCapturedGraphsWithoutConsumingAttempt() async {
        for initiallyRunning in [false, true] {
            let recovery = VoiceCaptureStartupRecovery()
            var running = initiallyRunning, captured = !initiallyRunning, rebuilds = 0
            recovery.begin()
            func notify() {
                recovery.configurationChanged(isRunning: { running }, hasPCM: { captured },
                    rebuild: { rebuilds += 1 }, failed: { _ in XCTFail("No failure expected") })
            }
            notify(); await drainMainQueue()
            XCTAssertEqual(rebuilds, 0)
            running = false; captured = false
            notify(); await drainMainQueue()
            XCTAssertEqual(rebuilds, 1, "An ignored notification must not consume the initial-graph attempt")
            notify(); await drainMainQueue()
            XCTAssertEqual(rebuilds, 1, "A restart that returns but stays stopped must not loop")
            recovery.cancel()
        }
    }

    func testStoppedCaptureInvalidatesQueuedRecoveryAndCannotAffectReplacement() async {
        let recovery = VoiceCaptureStartupRecovery()
        var oldRebuilds = 0, newRebuilds = 0
        recovery.begin()
        recovery.configurationChanged(isRunning: { false }, hasPCM: { false }, rebuild: { oldRebuilds += 1 }, failed: { _ in XCTFail() })
        // End call can leave the audio session active briefly for its final cue.
        // Releasing capture must still fence a previously queued notification.
        recovery.cancel()
        recovery.configurationChanged(isRunning: { false }, hasPCM: { false }, rebuild: { oldRebuilds += 1 }, failed: { _ in XCTFail() })
        recovery.begin()
        recovery.configurationChanged(isRunning: { false }, hasPCM: { false }, rebuild: { newRebuilds += 1 }, failed: { _ in XCTFail() })
        await drainMainQueue()
        XCTAssertEqual(oldRebuilds, 0); XCTAssertEqual(newRebuilds, 1)
        recovery.cancel()
        recovery.configurationChanged(isRunning: { false }, hasPCM: { false }, rebuild: { newRebuilds += 1 }, failed: { _ in XCTFail() })
        await drainMainQueue(); XCTAssertEqual(newRebuilds, 1)
    }

    func testFailedStartupRecoveryReportsOneSafeFailureAndNeverConnects() async throws {
        let call = NativeVoiceCall(), audio = VoiceAudioFixture(), socket = VoiceSocketFixture(), id = UUID().uuidString
        let recovery = VoiceCaptureStartupRecovery()
        defer { recovery.cancel(); call.end(owner: owner) }
        var diagnostics: VoiceCaptureDiagnostics?, opened = 0, rebuilds = 0, failures = 0, events: [[String: Any]] = []
        var fixture = hooks(audio: audio, socket: socket)
        fixture.audio = { diagnostics = $0; return audio }
        fixture.connection = { _ in opened += 1; return socket }; call.testHooks = fixture
        start(call, id: id) { events.append($0) }
        try await wait { audio.capture != nil }
        recovery.begin()
        func notify() {
            recovery.configurationChanged(isRunning: { false }, hasPCM: { false }, rebuild: {
                rebuilds += 1; diagnostics?.record(.configurationRecovery)
                throw NSError(domain: NSOSStatusErrorDomain, code: -50, userInfo: [NSLocalizedDescriptionKey: "PRIVATE-ROUTE"])
            }, failed: { error in
                failures += 1
                let failure = VoiceCaptureStartupError(stage: .configurationRecovery, error: error)
                diagnostics?.record(failure.stage, error: failure.reason)
                audio.failure?(failure)
            })
        }
        notify(); notify()
        try await wait { events.contains { $0["terminal"] as? Bool == true } }
        notify(); await drainMainQueue()
        XCTAssertEqual(rebuilds, 1); XCTAssertEqual(failures, 1); XCTAssertEqual(opened, 0)
        XCTAssertFalse(call.isActive); XCTAssertTrue(audio.stopped)
        XCTAssertEqual(call.debugCaptureDiagnostics.configurationRecoveries, 1)
        XCTAssertEqual(call.debugCaptureDiagnostics.errorStage, .configurationRecovery)
        XCTAssertEqual(call.debugCaptureDiagnostics.error?.code, -50)
        XCTAssertFalse(call.debugCaptureDiagnostics.text.contains("PRIVATE-ROUTE"))
        XCTAssertEqual(events.filter { $0["type"] as? String == "error" }.count, 1)
    }

    func testStartupRecoveryDoesNotExtendCaptureWatchdogAndLateFailureCannotEndNextCall() async throws {
        let call = NativeVoiceCall(), oldAudio = VoiceAudioFixture(), newAudio = VoiceAudioFixture(), socket = VoiceSocketFixture()
        let recovery = VoiceCaptureStartupRecovery(), old = UUID().uuidString, current = UUID().uuidString
        defer { recovery.cancel(); call.end(owner: owner) }
        var instant = Date(), opened = 0, rebuilds = 0
        var fixture = hooks(audio: oldAudio, socket: socket)
        fixture.now = { instant }; fixture.connection = { _ in opened += 1; return socket }; call.testHooks = fixture
        start(call, id: old); try await wait { oldAudio.capture != nil }
        instant = instant.addingTimeInterval(3.5)
        recovery.begin()
        recovery.configurationChanged(isRunning: { false }, hasPCM: { false }, rebuild: { rebuilds += 1 }, failed: { _ in XCTFail() })
        await drainMainQueue(); XCTAssertEqual(rebuilds, 1)
        instant = instant.addingTimeInterval(0.6); call.checkCapture(id: old)
        XCTAssertFalse(call.isActive); XCTAssertEqual(opened, 0)
        fixture.audio = { _ in newAudio }; call.testHooks = fixture
        start(call, id: current); try await wait { newAudio.capture != nil }
        oldAudio.failure?(VoiceCaptureStartupError(stage: .configurationRecovery, error: URLError(.cannotDecodeContentData)))
        await drainMainQueue()
        XCTAssertTrue(call.owns(owner: owner, id: current)); XCTAssertFalse(newAudio.stopped); XCTAssertEqual(opened, 0)
        call.end(id: current); XCTAssertFalse(call.isActive)
    }

    func testAudioInterruptionAndUnplugStillEndCapture() async throws {
        for interrupted in [false, true] {
            let call = NativeVoiceCall(), audio = VoiceAudioFixture(), socket = VoiceSocketFixture(), id = UUID().uuidString
            defer { call.end(owner: owner) }
            call.testHooks = hooks(audio: audio, socket: socket)
            try await connect(call, audio: audio, socket: socket, id: id)
            if interrupted {
                NotificationCenter.default.post(name: AVAudioSession.interruptionNotification, object: nil,
                    userInfo: [AVAudioSessionInterruptionTypeKey: AVAudioSession.InterruptionType.began.rawValue])
            } else {
                NotificationCenter.default.post(name: AVAudioSession.routeChangeNotification, object: nil,
                    userInfo: [AVAudioSessionRouteChangeReasonKey: AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue])
            }
            XCTAssertTrue(audio.captureStopped)
            XCTAssertEqual(call.snapshot(owner: owner, id: id)?["type"] as? String, "ending")
            try await wait { socket.sent.contains { $0["type"] as? String == "end" } }
            socket.push(["type": "ended", "saved": true]); try await wait { !call.isActive }
            XCTAssertEqual(audio.cues.last, .ended)
        }
    }

    private func requirePhysicalVoiceProbe() throws {
        #if targetEnvironment(simulator)
        throw XCTSkip("Voice microphone capture requires an explicitly selected physical device")
        #else
        guard ProcessInfo.processInfo.environment["KINDRED_TEST_VOICE_MICROPHONE"] == "1" else {
            throw XCTSkip("Real voice-call microphone capture is opt-in; stop Device Hub View Screen first")
        }
        #endif
    }

    private func physicalHooks(call: NativeVoiceCall, socket: VoiceDiscardingSocketFixture,
                               opened: @escaping () -> Void) -> NativeVoiceCall.TestHooks {
        var fixture = NativeVoiceCall.TestHooks()
        fixture.foreground = { UIApplication.shared.applicationState == .active }
        fixture.microphonePermission = {
            await withCheckedContinuation { continuation in
                AVAudioApplication.requestRecordPermission { continuation.resume(returning: $0) }
            }
        }
        fixture.audio = { VoiceAudioPipe(diagnostics: $0) }
        fixture.connection = { [weak call] _ in
            XCTAssertGreaterThan(call?.debugCaptureDiagnostics.rawFrames ?? 0, 0)
            XCTAssertGreaterThan(call?.debugCaptureDiagnostics.convertedFrames ?? 0, 0, "Actual capture must precede connection")
            opened(); return socket
        }
        return fixture
    }

    func testPhysicalVoiceCaptureProducesPCMBeforeFakeProviderConnects() async throws {
        try requirePhysicalVoiceProbe()
        let call = NativeVoiceCall(), socket = VoiceDiscardingSocketFixture(), id = UUID().uuidString
        var opened = 0, events: [[String: Any]] = []
        defer {
            call.end(owner: owner)
            let attachment = XCTAttachment(string: call.debugCaptureDiagnostics.text)
            attachment.name = "voice-capture-metadata-no-audio"; attachment.lifetime = .keepAlways
            add(attachment)
        }
        try await wait({ UIApplication.shared.applicationState == .active }, timeout: 3)
        call.testHooks = physicalHooks(call: call, socket: socket) { opened += 1 }
        start(call, id: id) { events.append($0) }
        try await wait({ socket.audioMessages >= 3 || events.contains { $0["type"] as? String == "error" } }, timeout: 30)
        XCTAssertFalse(events.contains { $0["type"] as? String == "error" }, call.debugCaptureDiagnostics.text)
        XCTAssertEqual(opened, 1); XCTAssertGreaterThanOrEqual(socket.audioMessages, 3)
        let initialFrames = socket.audioFrames
        try await Task.sleep(for: .seconds(5))
        XCTAssertTrue(call.isActive, "Capture must survive beyond the four-second watchdog")
        XCTAssertGreaterThan(socket.audioFrames, initialFrames)
        XCTAssertFalse(events.contains { $0["type"] as? String == "error" }, call.debugCaptureDiagnostics.text)
        XCTAssertGreaterThan(socket.audioFrames, 0)
        let snapshot = call.debugCaptureDiagnostics
        XCTAssertTrue(snapshot.permissionGranted); XCTAssertTrue(snapshot.inputAvailable); XCTAssertTrue(snapshot.engineRunning)
        XCTAssertGreaterThan(snapshot.inputRate, 0); XCTAssertGreaterThan(snapshot.inputChannels, 0)
        XCTAssertGreaterThanOrEqual(snapshot.rawBuffers, snapshot.convertedBuffers)
        XCTAssertGreaterThan(snapshot.convertedFrames, 0); XCTAssertEqual(snapshot.conversionFailures, 0)
        call.end(id: id); try await wait { !call.isActive }
        XCTAssertTrue(socket.closed)
    }

    func testPhysicalVoiceDuplexMuteAndSecondCall() async throws {
        try requirePhysicalVoiceProbe()
        let call = NativeVoiceCall()
        defer { call.end(owner: owner) }
        try await wait({ UIApplication.shared.applicationState == .active }, timeout: 3)
        for attempt in 1...2 {
            let socket = VoiceDiscardingSocketFixture(), id = UUID().uuidString
            var opened = 0, events: [[String: Any]] = []
            defer {
                let attachment = XCTAttachment(string: call.debugCaptureDiagnostics.text)
                attachment.name = "voice-duplex-attempt-\(attempt)-metadata-no-audio"
                attachment.lifetime = .keepAlways; add(attachment)
            }
            call.testHooks = physicalHooks(call: call, socket: socket) { opened += 1 }
            start(call, id: id) { events.append($0) }
            try await wait({ socket.audioMessages >= 3 || events.contains { $0["type"] as? String == "error" } }, timeout: 30)
            XCTAssertFalse(events.contains { $0["type"] as? String == "error" }, call.debugCaptureDiagnostics.text)
            XCTAssertEqual(opened, 1); XCTAssertGreaterThanOrEqual(socket.audioMessages, 3)

            // Synthetic, quiet playback exercises the production output graph
            // while the real microphone keeps running. Never retain mic samples.
            var tone = Data()
            for frame in 0..<14400 {
                let envelope = min(1.0, Double(min(frame, 14399 - frame)) / 240)
                let sample = Int16(sin(2 * .pi * 440 * Double(frame) / 24000) * 1200 * envelope)
                let bits = UInt16(bitPattern: sample)
                tone.append(UInt8(truncatingIfNeeded: bits)); tone.append(UInt8(truncatingIfNeeded: bits >> 8))
            }
            let initialFrames = socket.audioFrames
            socket.push(["type": "audio", "data": tone.base64EncodedString()])
            try await wait({ events.contains { $0["type"] as? String == "levels" && ($0["output"] as? Double ?? 0) > 0.006 } }, timeout: 3)
            XCTAssertGreaterThan(socket.audioFrames, initialFrames, "Capture must continue during rendered playback")

            call.setMuted(id: id, value: true)
            try await wait { socket.mutedAudioMessages >= 3 }
            let mutedFrames = socket.audioFrames
            try await Task.sleep(for: .seconds(5))
            XCTAssertTrue(call.isActive, "Muted capture must survive the four-second watchdog")
            XCTAssertGreaterThan(socket.audioFrames, mutedFrames)
            XCTAssertEqual(socket.nonzeroMutedMessages, 0, "Mute must transmit silence without stopping capture")
            call.setMuted(id: id, value: false)
            try await wait { !socket.muted }
            let unmutedFrames = socket.audioFrames
            try await wait { socket.audioFrames > unmutedFrames }
            XCTAssertFalse(events.contains { $0["type"] as? String == "error" }, call.debugCaptureDiagnostics.text)
            XCTAssertEqual(events.filter { $0["type"] as? String == "started" }.count, 1)
            XCTAssertEqual(call.debugCaptureDiagnostics.conversionFailures, 0)

            call.end(id: id); try await wait { !call.isActive }
            XCTAssertTrue(socket.closed)
            let endedFrames = call.debugCaptureDiagnostics.rawFrames
            try await Task.sleep(for: .milliseconds(150))
            XCTAssertEqual(call.debugCaptureDiagnostics.rawFrames, endedFrames, "Hangup must release the microphone before the next call")
            XCTAssertFalse(call.debugCaptureDiagnostics.engineRunning)
            XCTAssertEqual(call.snapshot(owner: owner, id: id)?["saved"] as? Bool, true)
        }
    }

    func testCapturePreflightAcceptsSilenceBeforeConnectingAndCuesPlayOnce() async throws {
        let call = NativeVoiceCall(), audio = VoiceAudioFixture(), socket = VoiceSocketFixture(), id = UUID().uuidString
        defer { call.end(owner: owner) }
        var opened = 0, events: [[String: Any]] = []
        var fixture = hooks(audio: audio, socket: socket)
        fixture.connection = { url in
            XCTAssertEqual(url.scheme, "wss"); XCTAssertEqual(url.path, "/voice")
            opened += 1; return socket
        }
        call.testHooks = fixture
        start(call, id: id) { events.append($0) }
        try await wait { audio.capture != nil }
        XCTAssertEqual(opened, 0, "Microphone permission and engine.start alone do not prove capture")
        XCTAssertNil(call.snapshot(owner: owner, id: id))
        XCTAssertEqual(audio.cues, [.connecting])
        audio.capture?(Data(count: 1920))
        try await wait { opened == 1 && socket.receiving }
        XCTAssertFalse(events.contains { $0["type"] as? String == "started" })
        socket.push(["type": "started"])
        try await wait { audio.cues.contains(.connected) }
        socket.push(["type": "started"])
        audio.capture?(Data(count: 1920))
        try await wait { socket.sent.contains { $0["type"] as? String == "audio" } }
        XCTAssertEqual(audio.cues, [.connecting, .connected])
        XCTAssertEqual(events.filter { $0["type"] as? String == "started" }.count, 1)
        XCTAssertFalse(events.contains { $0["type"] as? String == "speaking" })
        call.end(id: id); call.end(id: id)
        XCTAssertTrue(audio.captureStopped)
        try await wait { socket.sent.contains { $0["type"] as? String == "end" } }
        socket.push(["type": "ended", "saved": true])
        try await wait { !call.isActive }
        XCTAssertEqual(audio.cues, [.connecting, .connected, .ended])
        XCTAssertEqual(call.snapshot(owner: owner, id: id)?["saved"] as? Bool, true)
        XCTAssertNil(call.snapshot(owner: UUID(), id: id))
    }

    func testStalledCaptureFailsBeforeProviderConnectionAndAfterMute() async throws {
        for connected in [false, true] {
            let call = NativeVoiceCall(), audio = VoiceAudioFixture(), socket = VoiceSocketFixture(), id = UUID().uuidString
            defer { call.end(owner: owner) }
            var instant = Date(), opened = 0, events: [[String: Any]] = []
            var fixture = hooks(audio: audio, socket: socket)
            fixture.now = { instant }; fixture.connection = { _ in opened += 1; return socket }
            call.testHooks = fixture
            if connected {
                try await connect(call, audio: audio, socket: socket, id: id) { events.append($0) }
                call.setMuted(id: id, value: true)
            } else {
                start(call, id: id) { events.append($0) }
                try await wait { audio.capture != nil }
            }
            instant = instant.addingTimeInterval(4.1)
            call.checkCapture(id: id)
            XCTAssertFalse(call.isActive)
            XCTAssertEqual(opened, connected ? 1 : 0)
            XCTAssertEqual(events.last?["type"] as? String, "error")
            XCTAssertTrue((events.last?["message"] as? String)?.contains("microphone") == true)
            XCTAssertEqual(audio.cues.last, .error)
            XCTAssertTrue(audio.stopped)
            call.checkCapture(id: id)
            XCTAssertEqual(audio.cues.filter { $0 == .error }.count, 1)
        }
    }

    func testMutedCaptureSendsZerosAndSilentOutputDoesNotClaimSpeaking() async throws {
        let call = NativeVoiceCall(), audio = VoiceAudioFixture(), socket = VoiceSocketFixture(), id = UUID().uuidString
        defer { call.end(owner: owner) }
        var instant = Date(), events: [[String: Any]] = []
        var fixture = hooks(audio: audio, socket: socket); fixture.now = { instant }; call.testHooks = fixture
        try await connect(call, audio: audio, socket: socket, id: id) { events.append($0) }
        socket.push(["type": "audio", "data": Data(count: 1920).base64EncodedString()])
        try await wait { audio.played.count == 1 }
        XCTAssertFalse(events.contains { $0["type"] as? String == "speaking" })
        audio.playbackLevel?(0)
        try await wait { events.last?["type"] as? String == "levels" }
        XCTAssertEqual(events.last?["output"] as? Double, 0)
        let audible = Data(repeating: 32, count: 1920)
        instant = instant.addingTimeInterval(0.2)
        socket.push(["type": "audio", "data": audible.base64EncodedString()])
        try await wait { audio.played.count == 2 }
        XCTAssertFalse(events.contains { $0["type"] as? String == "speaking" }, "Receipt does not mean the queued audio played")
        audio.playbackLevel?(VoiceAudioPipe.level(audible))
        try await wait { events.contains { $0["type"] as? String == "speaking" } }
        XCTAssertGreaterThan(events.last(where: { $0["type"] as? String == "levels" })?["output"] as? Double ?? 0, 0.006)
        call.setMuted(id: id, value: true)
        instant = instant.addingTimeInterval(0.2)
        audio.capture?(audible)
        try await wait { socket.sent.contains { $0["type"] as? String == "audio" } }
        let sent = try XCTUnwrap(socket.sent.last(where: { $0["type"] as? String == "audio" })?["data"] as? String)
        XCTAssertEqual(Data(base64Encoded: sent), Data(count: audible.count))
        let level = events.last(where: { $0["type"] as? String == "levels" })
        XCTAssertEqual((level?["input"] as? NSNumber)?.doubleValue, 0)
        XCTAssertEqual((level?["output"] as? NSNumber)?.doubleValue, 0, "Output meter decays when no fresh audible PCM arrives")
        instant = instant.addingTimeInterval(3.9)
        audio.capture?(Data(count: 1920))
        try await Task.sleep(for: .milliseconds(20))
        call.checkCapture(id: id)
        XCTAssertTrue(call.isActive, "Valid muted PCM keeps the capture health check alive")
        socket.push(["type": "ended", "saved": true])
        try await wait { !call.isActive }
    }

    func testOutputLevelsFollowDelayedRenderAcrossLongQueuedPackets() async throws {
        let call = NativeVoiceCall(), audio = VoiceAudioFixture(), socket = VoiceSocketFixture(), id = UUID().uuidString
        defer { call.end(owner: owner) }
        var instant = Date(), events: [[String: Any]] = []
        var fixture = hooks(audio: audio, socket: socket); fixture.now = { instant }; call.testHooks = fixture
        try await connect(call, audio: audio, socket: socket, id: id) { events.append($0) }
        // The provider can deliver several seconds before the player reaches it.
        socket.push(["type": "audio", "data": Data(count: 96000).base64EncodedString()])
        socket.push(["type": "audio", "data": Data(repeating: 32, count: 96000).base64EncodedString()])
        try await wait { audio.played.count == 2 }
        XCTAssertFalse(events.contains { $0["type"] as? String == "speaking" })
        XCTAssertFalse(events.contains { ($0["output"] as? Double ?? 0) > 0 })
        for _ in 0..<18 {
            let before = events.filter { $0["type"] as? String == "levels" }.count
            instant = instant.addingTimeInterval(0.12)
            audio.playbackLevel?(0)
            try await wait { events.filter { $0["type"] as? String == "levels" }.count > before }
            let sent = socket.sent.filter { $0["type"] as? String == "audio" }.count
            audio.capture?(Data(count: 1920))
            try await wait { socket.sent.filter { $0["type"] as? String == "audio" }.count > sent }
            XCTAssertEqual(events.last(where: { $0["type"] as? String == "levels" })?["output"] as? Double, 0)
        }
        XCTAssertFalse(events.contains { $0["type"] as? String == "speaking" }, "Queued speech must not animate over earlier silence")
        for _ in 0..<18 {
            let before = events.filter { $0["type"] as? String == "levels" }.count
            instant = instant.addingTimeInterval(0.12)
            audio.playbackLevel?(0.25)
            try await wait { events.filter { $0["type"] as? String == "levels" }.count > before }
            let sent = socket.sent.filter { $0["type"] as? String == "audio" }.count
            audio.capture?(Data(count: 1920))
            try await wait { socket.sent.filter { $0["type"] as? String == "audio" }.count > sent }
            XCTAssertEqual(events.last(where: { $0["type"] as? String == "levels" })?["output"] as? Double, 0.25)
        }
        XCTAssertGreaterThan(events.filter { $0["type"] as? String == "speaking" }.count, 2,
                             "Long rendered speech keeps its speaking state after the original packet is old")
        instant = instant.addingTimeInterval(0.2); audio.playbackLevel?(0)
        try await wait { events.last(where: { $0["type"] as? String == "levels" })?["output"] as? Double == 0 }
        socket.push(["type": "ended", "saved": true]); try await wait { !call.isActive }
        let before = events.count
        audio.playbackLevel?(0.9); try await Task.sleep(for: .milliseconds(20))
        XCTAssertEqual(events.count, before, "Late render callbacks cannot revive a completed call")
    }

    func testActualPlayerTapMetersRenderedSilenceAndLongSpeechInsteadOfScheduling() async throws {
        let engine = AVAudioEngine(), player = AVAudioPlayerNode(), meter = VoiceMeterFixture()
        let format = try XCTUnwrap(AVAudioFormat(standardFormatWithSampleRate: 24000, channels: 1))
        engine.attach(player); engine.connect(player, to: engine.mainMixerNode, format: format)
        try engine.enableManualRenderingMode(.offline, format: format, maximumFrameCount: 960)
        VoiceAudioPipe.installPlaybackMeter(on: player, format: format) { meter.append($0) }
        defer {
            player.removeTap(onBus: 0); player.stop(); engine.stop()
            // Release the offline hardware mode explicitly: the next test may
            // open the real voice-processing graph in this same app process.
            engine.disableManualRenderingMode()
        }
        try engine.start(); player.play()
        func buffer(_ frames: AVAudioFrameCount, audible: Bool) throws -> AVAudioPCMBuffer {
            let buffer = try XCTUnwrap(AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames))
            buffer.frameLength = frames
            for frame in 0..<Int(frames) {
                buffer.floatChannelData![0][frame] = audible ? Float(sin(2 * .pi * 440 * Double(frame) / 24000) * 0.2) : 0
            }
            return buffer
        }
        // Select the synchronous overload explicitly. Awaiting playback here
        // would block the offline render loop that consumes these buffers.
        player.scheduleBuffer(try buffer(9600, audible: false), completionHandler: nil)
        player.scheduleBuffer(try buffer(48000, audible: true), completionHandler: nil)
        player.scheduleBuffer(try buffer(9600, audible: false), completionHandler: nil)
        try await Task.sleep(for: .milliseconds(20))
        XCTAssertFalse(meter.values.contains { $0 > 0.006 }, "Scheduling a two-second packet must not move the meter")
        let output = try XCTUnwrap(AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 960))
        func render(_ count: Int) async throws {
            for _ in 0..<count {
                XCTAssertEqual(try engine.renderOffline(960, to: output), .success)
                try await Task.sleep(for: .milliseconds(2))
            }
        }
        try await render(10)
        XCTAssertFalse(meter.values.contains { $0 > 0.006 }, "The first queued silence stays silent")
        try await render(25)
        try await wait { meter.values.contains { $0 > 0.006 } }
        let midpoint = meter.values.count
        try await render(25)
        try await wait { meter.values.count > midpoint }
        XCTAssertTrue(meter.values.dropFirst(midpoint).contains { $0 > 0.006 }, "The second second of the same packet remains audible")
        try await render(10)
        try await wait { meter.values.last == 0 }
        XCTAssertTrue(meter.values.allSatisfy { $0.isFinite && $0 >= 0 && $0 <= 1 })
    }

    func testCancelledCaptureCannotOpenSocketOrAffectNextCall() async throws {
        let call = NativeVoiceCall(), oldAudio = VoiceAudioFixture(), newAudio = VoiceAudioFixture(), socket = VoiceSocketFixture()
        let old = UUID().uuidString, current = UUID().uuidString
        defer { call.end(owner: owner) }
        var opened = 0
        var fixture = hooks(audio: oldAudio, socket: socket)
        fixture.connection = { _ in opened += 1; return socket }; call.testHooks = fixture
        start(call, id: old); try await wait { oldAudio.capture != nil }
        call.end(id: old)
        XCTAssertFalse(call.isActive)
        fixture.audio = { _ in newAudio }; call.testHooks = fixture
        start(call, id: current); try await wait { newAudio.capture != nil }
        oldAudio.capture?(Data(count: 1920)); call.end(id: old); call.checkCapture(id: old)
        try await Task.sleep(for: .milliseconds(40))
        XCTAssertEqual(opened, 0)
        XCTAssertTrue(call.owns(owner: owner, id: current))
        newAudio.capture?(Data(count: 1920)); try await wait { opened == 1 }
        XCTAssertFalse(newAudio.stopped)
    }

    func testEndingCueReservesAudioUntilFinishedAndCannotStopNewCall() async throws {
        let call = NativeVoiceCall(), oldAudio = VoiceAudioFixture(), newAudio = VoiceAudioFixture(), socket = VoiceSocketFixture()
        let old = UUID().uuidString, current = UUID().uuidString
        defer { call.end(owner: owner) }
        oldAudio.cueDuration = 0.05
        var fixture = hooks(audio: oldAudio, socket: socket); call.testHooks = fixture
        start(call, id: old); try await wait { oldAudio.capture != nil }
        call.end(id: old)
        XCTAssertTrue(oldAudio.captureStopped)
        XCTAssertTrue(call.isActive, "Dictation must not open a second session during the short ending tone")
        XCTAssertFalse(oldAudio.stopped)
        fixture.audio = { _ in newAudio }; call.testHooks = fixture
        start(call, id: current); try await wait { newAudio.capture != nil }
        XCTAssertTrue(oldAudio.stopped, "The old session must deactivate before a new audio graph starts")
        try await Task.sleep(for: .milliseconds(150))
        XCTAssertFalse(newAudio.stopped, "A cancelled ending task cannot deactivate the replacement call")
        XCTAssertTrue(call.owns(owner: owner, id: current))
    }

    func testProviderErrorUsesOneErrorCueWhileFinalReceiptDrains() async throws {
        let call = NativeVoiceCall(), audio = VoiceAudioFixture(), socket = VoiceSocketFixture(), id = UUID().uuidString
        defer { call.end(owner: owner) }
        var events: [[String: Any]] = []
        call.testHooks = hooks(audio: audio, socket: socket)
        try await connect(call, audio: audio, socket: socket, id: id) { events.append($0) }
        socket.push(["type": "error", "message": "The voice connection ended."])
        try await wait { events.contains { $0["type"] as? String == "ending" } }
        XCTAssertEqual(audio.cues, [.connecting, .connected, .error])
        XCTAssertTrue(audio.captureStopped)
        socket.push(["type": "ended", "saved": true]); try await wait { !call.isActive }
        XCTAssertEqual(audio.cues, [.connecting, .connected, .error])
        XCTAssertEqual(events.last?["saved"] as? Bool, true)
    }

    func testRealCaptureConversionResamplesMonoAndStereoIncludingSilence() throws {
        let target = try XCTUnwrap(AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 24000, channels: 1, interleaved: true))
        for rate in [8000.0, 16000.0, 24000.0, 44100.0, 48000.0] {
            for channels in [AVAudioChannelCount(1), AVAudioChannelCount(2)] {
                for silent in [false, true] {
                    let source = try XCTUnwrap(AVAudioFormat(standardFormatWithSampleRate: rate, channels: channels))
                    let buffer = try XCTUnwrap(AVAudioPCMBuffer(pcmFormat: source, frameCapacity: 2048))
                    buffer.frameLength = 2048
                    let converter = try XCTUnwrap(AVAudioConverter(from: source, to: target))
                    // Reuse the converter across callbacks, including narrowband
                    // Bluetooth rates, rather than checking only its first buffer.
                    for packet in 0..<4 {
                        for channel in 0..<Int(channels) {
                            for frame in 0..<2048 {
                                buffer.floatChannelData![channel][frame] = silent ? 0
                                    : Float(sin(2 * .pi * 440 * Double(packet * 2048 + frame) / rate) * 0.2)
                            }
                        }
                        var conversionErrors = 0
                        let bytes = try XCTUnwrap(VoiceAudioPipe.convertCapture(buffer, using: converter, to: target,
                            onError: { _ in conversionErrors += 1 }))
                        XCTAssertEqual(conversionErrors, 0); XCTAssertFalse(bytes.isEmpty); XCTAssertEqual(bytes.count % 2, 0)
                        XCTAssertLessThanOrEqual(bytes.count, Int(ceil(2048 * 24000 / rate)) * 2 + 32)
                        if silent { XCTAssertEqual(VoiceAudioPipe.level(bytes), 0) }
                        else { XCTAssertGreaterThan(VoiceAudioPipe.level(bytes), 0.01); XCTAssertLessThan(VoiceAudioPipe.level(bytes), 0.3) }
                    }
                }
            }
        }
    }

    func testCueBuffersAreShortQuietAndHaveSoftEdges() {
        for cue in VoiceCallCue.allCases {
            let samples = cue.samples()
            XCTAssertLessThan(samples.count, 24000 / 2)
            XCTAssertGreaterThan(samples.count, 24000 / 10)
            XCTAssertEqual(samples.first, 0); XCTAssertEqual(samples.last, 0)
            XCTAssertTrue(samples.allSatisfy { $0.isFinite && abs($0) <= 0.0651 })
            XCTAssertTrue(samples.contains { abs($0) > 0.01 })
        }
        XCTAssertEqual(VoiceAudioPipe.level(Data()), 0)
        XCTAssertEqual(VoiceAudioPipe.level(Data([255])), 0)
        XCTAssertEqual(VoiceAudioPipe.level(Data([0, 128, 255, 127])), 1, accuracy: 0.0001)
    }
}

private final class VoiceAudioFixture: VoiceCallAudio {
    var startError: Error?
    var capture: ((Data) -> Void)?
    var playbackLevel: ((Double) -> Void)?
    var failure: ((VoiceCaptureStartupError) -> Void)?
    var cues: [VoiceCallCue] = []
    var played: [Data] = []
    var captureStopped = false
    var stopped = false
    var cueDuration: TimeInterval = 0
    func start(capture: @escaping (Data) -> Void, playbackLevel: @escaping (Double) -> Void,
               failure: @escaping (VoiceCaptureStartupError) -> Void) throws {
        if let startError { throw startError }
        self.capture = capture; self.playbackLevel = playbackLevel; self.failure = failure
    }
    func play(_ bytes: Data) throws { played.append(bytes) }
    func playCue(_ cue: VoiceCallCue) -> TimeInterval { cues.append(cue); return cueDuration }
    func stopCapture() { captureStopped = true }
    func stop() { stopCapture(); stopped = true }
}

/// Real capture can exercise the entire native state machine without a network
/// connection. Only byte counts survive send(); no microphone samples are saved.
@MainActor
private final class VoiceDiscardingSocketFixture: VoiceCallConnection {
    var audioMessages = 0
    var audioFrames = 0
    var muted = false
    var mutedAudioMessages = 0
    var nonzeroMutedMessages = 0
    var closed = false
    private var initial = true
    private var pending: CheckedContinuation<[String: Any], Error>?
    private var queued: [[String: Any]] = []
    func receive() async throws -> [String: Any] {
        if closed { throw URLError(.cancelled) }
        if initial { initial = false; return ["type": "started"] }
        if !queued.isEmpty { return queued.removeFirst() }
        return try await withCheckedThrowingContinuation { pending = $0 }
    }
    func send(_ value: [String: Any]) async throws {
        if closed { throw URLError(.cancelled) }
        if value["type"] as? String == "audio", let encoded = value["data"] as? String,
           let bytes = Data(base64Encoded: encoded) {
            audioMessages += 1; audioFrames += bytes.count / 2
            if muted {
                mutedAudioMessages += 1
                if bytes.contains(where: { $0 != 0 }) { nonzeroMutedMessages += 1 }
            }
        } else if value["type"] as? String == "mute" {
            muted = value["muted"] as? Bool ?? false
        } else if value["type"] as? String == "end" {
            push(["type": "ended", "saved": true])
        }
    }
    func push(_ value: [String: Any]) {
        guard !closed else { return }
        if let pending { self.pending = nil; pending.resume(returning: value) }
        else { queued.append(value) }
    }
    func close() { closed = true; pending?.resume(throwing: URLError(.cancelled)); pending = nil; queued = [] }
}

private final class VoiceMeterFixture {
    private let lock = NSLock()
    private var levels: [Double] = []
    var values: [Double] { lock.lock(); defer { lock.unlock() }; return levels }
    func append(_ value: Double) { lock.lock(); levels.append(value); lock.unlock() }
}

private final class VoiceSocketFixture: VoiceCallConnection {
    var sent: [[String: Any]] = []
    private var pending: CheckedContinuation<[String: Any], Error>?
    private var queued: [[String: Any]] = []
    private var closed = false
    var receiving: Bool { pending != nil }
    func receive() async throws -> [String: Any] {
        if closed { throw URLError(.cancelled) }
        if !queued.isEmpty { return queued.removeFirst() }
        return try await withCheckedThrowingContinuation { pending = $0 }
    }
    func send(_ value: [String: Any]) async throws {
        if closed { throw URLError(.cancelled) }
        sent.append(value)
    }
    func push(_ value: [String: Any]) {
        if let pending { self.pending = nil; pending.resume(returning: value) }
        else { queued.append(value) }
    }
    func close() {
        closed = true
        pending?.resume(throwing: URLError(.cancelled)); pending = nil
    }
}
