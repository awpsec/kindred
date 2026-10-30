import AVFoundation
import Foundation
import XCTest
@testable import Kindred

/// No microphone, provider requests, or Live Activities are opened by these
/// fixtures. The conversion test does exercise Apple's real PCM converter.
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
    private func hooks(audio: VoiceAudioFixture, socket: VoiceSocketFixture) -> NativeVoiceCall.TestHooks {
        var hooks = NativeVoiceCall.TestHooks()
        hooks.microphonePermission = { true }
        hooks.audio = { audio }
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
        XCTAssertEqual(level?["input"] as? Double, 0)
        XCTAssertEqual(level?["output"] as? Double, 0, "Output meter decays when no fresh audible PCM arrives")
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
            audio.capture?(Data(count: 1920))
            XCTAssertEqual(events.last(where: { $0["type"] as? String == "levels" })?["output"] as? Double, 0)
        }
        XCTAssertFalse(events.contains { $0["type"] as? String == "speaking" }, "Queued speech must not animate over earlier silence")
        for _ in 0..<18 {
            let before = events.filter { $0["type"] as? String == "levels" }.count
            instant = instant.addingTimeInterval(0.12)
            audio.playbackLevel?(0.25)
            try await wait { events.filter { $0["type"] as? String == "levels" }.count > before }
            audio.capture?(Data(count: 1920))
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
        defer { player.removeTap(onBus: 0); player.stop(); engine.stop() }
        try engine.start(); player.play()
        func buffer(_ frames: AVAudioFrameCount, audible: Bool) throws -> AVAudioPCMBuffer {
            let buffer = try XCTUnwrap(AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames))
            buffer.frameLength = frames
            for frame in 0..<Int(frames) {
                buffer.floatChannelData![0][frame] = audible ? Float(sin(2 * .pi * 440 * Double(frame) / 24000) * 0.2) : 0
            }
            return buffer
        }
        player.scheduleBuffer(try buffer(9600, audible: false))
        player.scheduleBuffer(try buffer(48000, audible: true))
        player.scheduleBuffer(try buffer(9600, audible: false))
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
        fixture.audio = { newAudio }; call.testHooks = fixture
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
        fixture.audio = { newAudio }; call.testHooks = fixture
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
        for rate in [44100.0, 48000.0] {
            for channels in [AVAudioChannelCount(1), AVAudioChannelCount(2)] {
                for silent in [false, true] {
                    let source = try XCTUnwrap(AVAudioFormat(standardFormatWithSampleRate: rate, channels: channels))
                    let buffer = try XCTUnwrap(AVAudioPCMBuffer(pcmFormat: source, frameCapacity: 2048))
                    buffer.frameLength = 2048
                    for channel in 0..<Int(channels) {
                        for frame in 0..<2048 {
                            buffer.floatChannelData![channel][frame] = silent ? 0 : Float(sin(2 * .pi * 440 * Double(frame) / rate) * 0.2)
                        }
                    }
                    let converter = try XCTUnwrap(AVAudioConverter(from: source, to: target))
                    let bytes = try XCTUnwrap(VoiceAudioPipe.convertCapture(buffer, using: converter, to: target))
                    XCTAssertFalse(bytes.isEmpty); XCTAssertEqual(bytes.count % 2, 0)
                    XCTAssertLessThanOrEqual(bytes.count, Int(ceil(2048 * 24000 / rate)) * 2 + 32)
                    if silent { XCTAssertEqual(VoiceAudioPipe.level(bytes), 0) }
                    else { XCTAssertGreaterThan(VoiceAudioPipe.level(bytes), 0.01); XCTAssertLessThan(VoiceAudioPipe.level(bytes), 0.3) }
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
    var capture: ((Data) -> Void)?
    var playbackLevel: ((Double) -> Void)?
    var cues: [VoiceCallCue] = []
    var played: [Data] = []
    var captureStopped = false
    var stopped = false
    var cueDuration: TimeInterval = 0
    func start(capture: @escaping (Data) -> Void, playbackLevel: @escaping (Double) -> Void) throws {
        self.capture = capture; self.playbackLevel = playbackLevel
    }
    func play(_ bytes: Data) throws { played.append(bytes) }
    func playCue(_ cue: VoiceCallCue) -> TimeInterval { cues.append(cue); return cueDuration }
    func stopCapture() { captureStopped = true }
    func stop() { stopCapture(); stopped = true }
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
