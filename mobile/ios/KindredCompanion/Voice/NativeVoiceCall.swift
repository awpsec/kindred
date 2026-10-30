import ActivityKit
import AVFoundation
import Foundation
import UIKit

/// A single account-owned call. Audio and End call don't depend on WKWebView
/// timers, viewport shape, or a foreground JavaScript process.
@MainActor
final class NativeVoiceCall: NSObject {
    static let shared = NativeVoiceCall()
    private var id: String?
    private var owner: UUID?
    private var socket: VoiceCallConnection?
    private var receiveTask: Task<Void, Never>?
    private var heartbeat: Task<Void, Never>?
    private var deadline: Task<Void, Never>?
    private var audio: VoiceCallAudio?
    private var finishingAudio: VoiceCallAudio?
    private var audioFinishTask: Task<Void, Never>?
    private var captureWatchdog: Task<Void, Never>?
    private var captureStarted: Date?
    private var capturedAt: Date?
    private var diagnostics = VoiceCaptureDiagnostics()
    private var cues: Set<VoiceCallCue> = []
    private var activity: Activity<VoiceCallAttributes>?
    private var started = Date()
    private var muted = false
    private var ending = false
    private var ready = false
    private var emit: (([String: Any]) -> Void)?
    private var pendingFrames = 0
    private var serialSend: Task<Void, Never>?
    private var lastSpeakingNotice = Date.distantPast
    private var lastLevelNotice = Date.distantPast
    private var inputLevel: Double = 0
    private var outputLevel: Double = 0
    private var outputLevelAt = Date.distantPast
    private var lastEvent: (owner: UUID, id: String, payload: [String: Any])?
    // Reserve capture before asking permission. A queued dictation Start must
    // not open another audio engine while the call is connecting or draining.
    var isActive: Bool { id != nil || finishingAudio != nil }
    #if DEBUG
    struct TestHooks {
        var microphonePermission: () async -> Bool = { false }
        var foreground: () -> Bool = { true }
        var audio: (VoiceCaptureDiagnostics) throws -> VoiceCallAudio = { _ in throw URLError(.unsupportedURL) }
        var connection: (URL) throws -> VoiceCallConnection = { _ in throw URLError(.unsupportedURL) }
        var now: () -> Date = { Date() }
    }
    var testHooks: TestHooks?
    var debugCaptureDiagnostics: VoiceCaptureSnapshot { diagnostics.snapshot }
    #endif
    private var now: Date {
        #if DEBUG
        if let testHooks { return testHooks.now() }
        #endif
        return Date()
    }
    private func makeAudio() throws -> VoiceCallAudio {
        #if DEBUG
        if let testHooks { return try testHooks.audio(diagnostics) }
        #endif
        return VoiceAudioPipe(diagnostics: diagnostics)
    }
    private func makeConnection(_ url: URL) throws -> VoiceCallConnection {
        #if DEBUG
        if let testHooks { return try testHooks.connection(url) }
        #endif
        return VoiceCallSocket(url: url)
    }
    private var foreground: Bool {
        #if DEBUG
        if let testHooks { return testHooks.foreground() }
        #endif
        return UIApplication.shared.applicationState == .active
    }
    private var activitiesEnabled: Bool {
        #if DEBUG
        if testHooks != nil { return false }
        #endif
        return ActivityAuthorizationInfo().areActivitiesEnabled
    }
    private func authorizeMicrophone() async -> Bool {
        #if DEBUG
        if let testHooks { return await testHooks.microphonePermission() }
        #endif
        return await withCheckedContinuation { continuation in
            AVAudioApplication.requestRecordPermission { continuation.resume(returning: $0) }
        }
    }

    override init() {
        super.init()
        NotificationCenter.default.addObserver(self, selector: #selector(interrupted), name: AVAudioSession.interruptionNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(routeChanged), name: AVAudioSession.routeChangeNotification, object: nil)
        // A process restart cannot retain an audio socket. Remove stale activities.
        let stale = Activity<VoiceCallAttributes>.activities
        Task { for activity in stale { await activity.end(nil, dismissalPolicy: .immediate) } }
    }
    func start(id: String, owner: UUID, origin: URL, ticket: String, name: String, shape: String, color: String, emit: @escaping ([String: Any]) -> Void) {
        guard self.id == nil, UUID(uuidString: id) != nil,
              ticket.count == 64, ticket.allSatisfy({ $0.isHexDigit }),
              foreground else { return }
        stopFinishingAudio()
        self.id = id; self.owner = owner; self.emit = emit; ending = false; ready = false; muted = false; lastSpeakingNotice = .distantPast
        captureStarted = nil; capturedAt = nil; cues = []
        diagnostics = VoiceCaptureDiagnostics()
        diagnostics.record(.permission, foreground: foreground)
        lastLevelNotice = .distantPast; inputLevel = 0; outputLevel = 0; outputLevelAt = .distantPast
        deadline = Task { [weak self] in
            try? await Task.sleep(for: .seconds(25))
            guard !Task.isCancelled else { return }
            self?.fail(id: id, message: "The call did not connect. Try again.")
        }
        receiveTask = Task { [weak self] in
            let allowed = await self?.authorizeMicrophone() ?? false
            guard let self, self.id == id, !self.ending, !Task.isCancelled else { return }
            self.diagnostics.permission(allowed, foreground: self.foreground)
            self.diagnostics.record(.permission, foreground: self.foreground)
            guard allowed else { self.fail(id: id, message: "Allow microphone access in Settings to make a call."); return }
            do {
                // Dismissing the system permission sheet can leave the app
                // inactive briefly. Do not activate recording until it returns,
                // and never let cancellation or a replacement call cross this wait.
                if !self.foreground { self.diagnostics.record(.foregroundWait, foreground: false) }
                for _ in 0..<20 {
                    guard self.id == id, !self.ending, !Task.isCancelled else { return }
                    if self.foreground { break }
                    try await Task.sleep(for: .milliseconds(100))
                }
                guard self.id == id, !self.ending, !Task.isCancelled else { return }
                guard self.foreground else {
                    self.diagnostics.record(.foregroundTimeout, foreground: false)
                    self.fail(id: id, message: "Bring Kindred to the foreground, then try the call again.")
                    return
                }
                self.diagnostics.record(.foregroundReady, foreground: true)
                // Prove that the native capture graph produces PCM before opening
                // a billable session. Silent PCM is valid: this is not a speech gate.
                do {
                    let audio = try self.makeAudio()
                    self.audio = audio; self.captureStarted = self.now
                    try audio.start(capture: { [weak self] data in
                        Task { @MainActor in self?.capture(data, id: id) }
                    }, playbackLevel: { [weak self] level in
                        Task { @MainActor in self?.renderedOutput(level, id: id) }
                    })
                } catch {
                    let failure = (error as? VoiceCaptureStartupError) ?? VoiceCaptureStartupError(stage: .audioFactory, error: error)
                    self.diagnostics.record(failure.stage, error: failure.reason)
                    self.fail(id: id, message: failure.userMessage)
                    return
                }
                self.cue(.connecting)
                self.captureWatchdog = Task { [weak self] in
                    while !Task.isCancelled {
                        try? await Task.sleep(for: .seconds(1))
                        guard !Task.isCancelled, let self, self.id == id else { return }
                        self.checkCapture(id: id)
                    }
                }
                while self.id == id, !self.ending, self.capturedAt == nil {
                    try await Task.sleep(for: .milliseconds(20))
                }
                guard self.id == id, !self.ending else { return }
                var components = URLComponents(url: origin, resolvingAgainstBaseURL: false)!
                components.scheme = components.scheme == "https" ? "wss" : "ws"
                components.path = "/voice"; components.queryItems = [URLQueryItem(name: "ticket", value: ticket)]
                components.fragment = nil
                let socket = try self.makeConnection(components.url!)
                self.socket = socket
                while self.id == id {
                    let value = try await socket.receive()
                    guard self.id == id else { return }
                    switch value["type"] as? String {
                    case "started":
                        guard !self.ready, !self.ending else { continue }
                        self.checkCapture(id: id)
                        guard self.id == id else { return }
                        self.ready = true; self.started = Date(); self.deadline?.cancel(); self.cue(.connected)
                        if self.activitiesEnabled {
                            self.activity = try? Activity.request(attributes: VoiceCallAttributes(id: id, botName: String(name.prefix(80)), shape: shape, color: color), content: ActivityContent(state: .init(started: self.started, muted: false), staleDate: Date().addingTimeInterval(45)), pushType: nil)
                        }
                        self.emit?(["type": "started", "id": id, "started_ms": self.started.timeIntervalSince1970 * 1000])
                        self.heartbeat = Task { [weak self] in
                            while !Task.isCancelled {
                                try? await Task.sleep(for: .seconds(10))
                                guard !Task.isCancelled, self?.id == id else { return }
                                self?.send(["type": "ping"], id: id)
                                if let self, let activity = self.activity {
                                    await activity.update(ActivityContent(state: .init(started: self.started, muted: self.muted), staleDate: Date().addingTimeInterval(45)))
                                }
                            }
                        }
                    case "audio":
                        if !self.ending, let text = value["data"] as? String, let bytes = Data(base64Encoded: text), bytes.count <= 96000 {
                            try self.audio?.play(bytes)
                        }
                    case "ended":
                        self.finishAudio(cue: .ended)
                        self.terminal(["type": "ended", "id": id, "saved": value["saved"] as? Bool ?? false])
                        self.cleanup(id: id); return
                    case "error":
                        // Keep receiving the final saved receipt; no raw provider diagnostics.
                        self.finishAudio(cue: .error)
                        self.emit?(["type": "error", "id": id, "message": value["message"] as? String ?? "The voice connection ended."])
                        self.end(id: id)
                    default: break
                    }
                }
            } catch is CancellationError {
                return
            } catch {
                if self.id == id { self.fail(id: id, message: "Call disconnected. Your conversation so far is kept.") }
            }
        }
    }
    private func capture(_ bytes: Data, id: String) {
        guard self.id == id, !ending, !bytes.isEmpty, bytes.count % 2 == 0, bytes.count <= 48000 else { return }
        if capturedAt == nil { diagnostics.record(.firstPCM) }
        capturedAt = now
        guard ready else { return }
        inputLevel = muted ? 0 : VoiceAudioPipe.level(bytes)
        emitLevels()
        guard pendingFrames < 20 else { fail(id: id, message: "The call connection is too slow. Try again."); return }
        send(["type": "audio", "data": (muted ? Data(count: bytes.count) : bytes).base64EncodedString()], id: id)
    }
    private func renderedOutput(_ level: Double, id: String) {
        guard self.id == id, ready, !ending, level.isFinite else { return }
        outputLevel = min(1, max(0, level)); outputLevelAt = now
        emitLevels()
        // Meter rendered player output, not packet arrival. A packet can contain
        // seconds of queued speech or continuous silence between spoken turns.
        if outputLevel > 0.006, now.timeIntervalSince(lastSpeakingNotice) >= 0.5 {
            lastSpeakingNotice = now
            emit?(["type": "speaking", "id": id])
        }
    }
    private func send(_ value: [String: Any], id: String) {
        guard self.id == id, let socket else { return }
        let previous = serialSend; pendingFrames += 1
        serialSend = Task { [weak self] in
            await previous?.value
            guard let self, self.id == id, !Task.isCancelled else { return }
            defer { if self.id == id { self.pendingFrames = max(0, self.pendingFrames - 1) } }
            do { try await socket.send(value) }
            catch { self.fail(id: id, message: "The call connection ended.") }
        }
    }
    func setMuted(id: String, value: Bool) {
        guard self.id == id, ready, !ending else { return }
        muted = value
        inputLevel = 0; emitLevels(force: true)
        send(["type": "mute", "muted": value], id: id)
        emit?(["type": "mute", "id": id, "muted": value])
        if let activity { Task { await activity.update(ActivityContent(state: .init(started: started, muted: value), staleDate: Date().addingTimeInterval(45))) } }
    }
    func end(id: String) {
        guard self.id == id, !ending else { return }
        ending = true; finishAudio(cue: .ended); heartbeat?.cancel(); deadline?.cancel()
        emit?(["type": "ending", "id": id])
        // Remove the live indicator as soon as audio stops, while finalization drains.
        if let activity { Task { await activity.end(nil, dismissalPolicy: .immediate) }; self.activity = nil }
        if ready { send(["type": "end"], id: id) }
        else { terminal(["type": "ended", "id": id, "saved": true]); cleanup(id: id); return }
        deadline = Task { [weak self] in
            try? await Task.sleep(for: .seconds(16))
            guard !Task.isCancelled, let self, self.id == id else { return }
            self.terminal(["type": "ended", "id": id, "saved": false]); self.cleanup(id: id)
        }
    }
    func owns(owner: UUID, id: String) -> Bool { self.owner == owner && self.id == id }
    func snapshot(owner: UUID, id: String) -> [String: Any]? {
        if owns(owner: owner, id: id) {
            if ending { return ["type": "ending", "id": id] }
            if ready { return ["type": "started", "id": id, "started_ms": started.timeIntervalSince1970 * 1000, "muted": muted] }
            return nil
        }
        if let lastEvent, lastEvent.owner == owner, lastEvent.id == id { return lastEvent.payload }
        return nil
    }
    func end(owner: UUID) { if self.owner == owner, let id { end(id: id) } }
    private func terminal(_ payload: [String: Any]) {
        if let owner, let id { lastEvent = (owner, id, payload) }
        emit?(payload)
    }
    private func fail(id: String, message: String) {
        guard self.id == id else { return }
        finishAudio(cue: .error)
        terminal(["type": "error", "id": id, "message": message, "terminal": true]); cleanup(id: id)
    }
    private func cleanup(id: String) {
        guard self.id == id else { return }
        self.id = nil; owner = nil; ready = false; ending = false
        finishAudio(cue: nil); socket?.close(); socket = nil
        receiveTask?.cancel(); heartbeat?.cancel(); deadline?.cancel(); serialSend?.cancel(); pendingFrames = 0
        if let activity { Task { await activity.end(nil, dismissalPolicy: .immediate) }; self.activity = nil }
        emit = nil
    }
    // Called both by the timer and native fixtures. Muting keeps capture running
    // with zero PCM, so it must not bypass this health check.
    func checkCapture(id: String) {
        guard self.id == id, !ending, let began = captureStarted else { return }
        if now.timeIntervalSince(capturedAt ?? began) >= 4 {
            audio?.refreshDiagnostics()
            diagnostics.record(.captureStalled, foreground: foreground)
            let message = capturedAt == nil
                ? "The microphone is not sending audio. Check your audio device, then try again."
                : "The microphone stopped sending audio. Check your audio device, then call again."
            fail(id: id, message: message)
        }
    }
    private func cue(_ cue: VoiceCallCue) {
        guard !cues.contains(cue), let audio else { return }
        cues.insert(cue); _ = audio.playCue(cue)
    }
    private func emitLevels(force: Bool = false) {
        guard let id, ready, !ending, force || now.timeIntervalSince(lastLevelNotice) >= 0.1 else { return }
        lastLevelNotice = now
        emit?(["type": "levels", "id": id, "input": muted ? 0 : inputLevel,
               "output": now.timeIntervalSince(outputLevelAt) < 0.15 ? outputLevel : 0])
    }
    private func finishAudio(cue: VoiceCallCue?) {
        captureWatchdog?.cancel(); captureWatchdog = nil
        guard let audio else { return }
        self.audio = nil
        audio.stopCapture()
        guard let cue, !cues.contains(.ended), !cues.contains(.error) else { audio.stop(); return }
        cues.insert(cue)
        let duration = audio.playCue(cue)
        guard duration > 0 else { audio.stop(); return }
        finishingAudio = audio
        // Keep capture reserved until the short native tone ends. A stale stop
        // must not deactivate the audio session of a new call or dictation.
        audioFinishTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(Int((duration + 0.05) * 1000)))
            guard !Task.isCancelled else { return }
            self?.stopFinishingAudio()
        }
    }
    private func stopFinishingAudio() {
        audioFinishTask?.cancel(); audioFinishTask = nil
        finishingAudio?.stop(); finishingAudio = nil
    }
    @objc private func interrupted(_ notification: Notification) {
        guard let id, let type = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt else { return }
        audio?.refreshDiagnostics(); diagnostics.record(.interruption, reason: type)
        if type == AVAudioSession.InterruptionType.began.rawValue { end(id: id) }
    }
    @objc private func routeChanged(_ notification: Notification) {
        guard let id, let reason = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt else { return }
        audio?.refreshDiagnostics(); diagnostics.record(.routeChanged, reason: reason)
        if reason == AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue { end(id: id) }
    }
}

@MainActor
protocol VoiceCallConnection: AnyObject {
    func receive() async throws -> [String: Any]
    func send(_ value: [String: Any]) async throws
    func close()
}

private final class VoiceCallSocket: VoiceCallConnection {
    private let task: URLSessionWebSocketTask
    init(url: URL) {
        task = URLSession.shared.webSocketTask(with: url)
        task.maximumMessageSize = 128 * 1024
        task.resume()
    }
    func receive() async throws -> [String: Any] {
        let message = try await task.receive()
        guard case .string(let text) = message, let data = text.data(using: .utf8),
              let value = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw URLError(.cannotParseResponse) }
        return value
    }
    func send(_ value: [String: Any]) async throws {
        let data = try JSONSerialization.data(withJSONObject: value)
        guard let text = String(data: data, encoding: .utf8) else { throw URLError(.cannotParseResponse) }
        try await task.send(.string(text))
    }
    func close() { task.cancel(with: .normalClosure, reason: nil) }
}

protocol VoiceCallAudio: AnyObject {
    func start(capture: @escaping (Data) -> Void, playbackLevel: @escaping (Double) -> Void) throws
    func play(_ bytes: Data) throws
    func playCue(_ cue: VoiceCallCue) -> TimeInterval
    func stopCapture()
    func stop()
    func refreshDiagnostics()
}

extension VoiceCallAudio { func refreshDiagnostics() {} }

enum VoiceCallCue: Hashable, CaseIterable {
    case connecting, connected, ended, error
    /// Original soft tones shared with the desktop call UI. These play locally
    /// through the voice-processing graph; they aren't inserted into sent PCM.
    func samples(rate: Double = 24000) -> [Float] {
        let notes: (Double, Double, Double)
        switch self {
        case .connecting: notes = (392, 494, 0.09)
        case .connected: notes = (523, 659, 0.11)
        case .ended: notes = (494, 330, 0.12)
        case .error: notes = (330, 262, 0.14)
        }
        let count = Int(notes.2 * rate), gap = Int(0.025 * rate)
        var output = [Float](repeating: 0, count: count * 2 + gap)
        for (note, frequency) in [notes.0, notes.1].enumerated() {
            for frame in 0..<count {
                let t = Double(frame) / rate
                let envelope = min(1, min(t / 0.008, Double(count - 1 - frame) / rate / 0.035))
                output[note * (count + gap) + frame] = Float(sin(2 * .pi * frequency * t) * envelope * 0.065)
            }
        }
        return output
    }
}

final class VoiceAudioPipe: VoiceCallAudio {
    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private let cuePlayer = AVAudioPlayerNode()
    private var tapped = false
    private var playbackTapped = false
    private var active = false
    private let lock = NSLock()
    private var queuedSeconds: Double = 0
    private let diagnostics: VoiceCaptureDiagnostics
    private var configurationObserver: NSObjectProtocol?
    private let pcm = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 24000, channels: 1, interleaved: true)!
    private let playback = AVAudioFormat(standardFormatWithSampleRate: 24000, channels: 1)!
    init(diagnostics: VoiceCaptureDiagnostics = VoiceCaptureDiagnostics()) {
        self.diagnostics = diagnostics
        configurationObserver = NotificationCenter.default.addObserver(forName: .AVAudioEngineConfigurationChange,
            object: engine, queue: nil) { [weak self] _ in
                // Apple's audio callback queue must never synchronously wait for
                // engine inspection or teardown. Record evidence only; no retry.
                DispatchQueue.main.async { [weak self] in
                    guard let self, self.active else { return }
                    self.refreshDiagnostics()
                    self.diagnostics.record(.configurationChanged)
                }
            }
    }
    func start(capture: @escaping (Data) -> Void, playbackLevel: @escaping (Double) -> Void) throws {
        let session = AVAudioSession.sharedInstance()
        var stage = VoiceCaptureStage.category
        do {
            diagnostics.record(stage)
            try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.defaultToSpeaker, .allowBluetooth])
            stage = .activation; diagnostics.record(stage)
            try session.setActive(true)
            active = true
            stage = .voiceProcessing; diagnostics.record(stage)
            try engine.inputNode.setVoiceProcessingEnabled(true)
            stage = .inputFormat
            let input = engine.inputNode.outputFormat(forBus: 0)
            diagnostics.refresh(session: session, engine: engine, input: input); diagnostics.record(stage)
            guard input.sampleRate.isFinite, input.sampleRate > 0, input.channelCount > 0 else {
                throw NSError(domain: "KindredVoiceCapture", code: 1)
            }
            stage = .converter
            guard let converter = AVAudioConverter(from: input, to: pcm) else { throw NSError(domain: "KindredVoiceCapture", code: 2) }
            stage = .graph
            engine.attach(player); engine.connect(player, to: engine.mainMixerNode, format: playback)
            engine.attach(cuePlayer); engine.connect(cuePlayer, to: engine.mainMixerNode, format: playback)
            // This node contains bot speech only. Observing its rendered output
            // follows long/queued buffers and excludes the local call chimes.
            Self.installPlaybackMeter(on: player, format: playback, emit: playbackLevel)
            playbackTapped = true
            engine.inputNode.installTap(onBus: 0, bufferSize: 2048, format: input) { [pcm, diagnostics] buffer, _ in
                let bytes = Self.convertCapture(buffer, using: converter, to: pcm, onError: { diagnostics.conversionFailed($0) })
                diagnostics.capture(rawFrames: Int(buffer.frameLength), convertedFrames: (bytes?.count ?? 0) / 2)
                if let bytes { capture(bytes) }
            }
            tapped = true; stage = .engineStart; diagnostics.record(stage)
            engine.prepare(); try engine.start(); player.play(); cuePlayer.play()
            refreshDiagnostics(); diagnostics.record(.capturing)
        } catch {
            let failure = VoiceCaptureStartupError(stage: stage, error: error)
            refreshDiagnostics(); diagnostics.record(stage, error: failure.reason)
            stop(); throw failure
        }
    }
    func refreshDiagnostics() {
        diagnostics.refresh(session: .sharedInstance(), engine: engine,
            input: active ? engine.inputNode.outputFormat(forBus: 0) : nil,
            output: active ? engine.outputNode.inputFormat(forBus: 0) : nil,
            voiceProcessing: active ? engine.inputNode.isVoiceProcessingEnabled : nil)
    }
    func play(_ bytes: Data) throws {
        guard bytes.count > 0, bytes.count % 2 == 0 else { throw URLError(.cannotDecodeContentData) }
        let count = bytes.count / 2, duration = Double(count) / 24000
        lock.lock(); let behind = queuedSeconds > 3; if !behind { queuedSeconds += duration }; lock.unlock()
        guard !behind else { throw URLError(.cannotDecodeContentData) }
        let buffer = AVAudioPCMBuffer(pcmFormat: playback, frameCapacity: AVAudioFrameCount(count))!
        buffer.frameLength = AVAudioFrameCount(count)
        bytes.withUnsafeBytes { (raw: UnsafeRawBufferPointer) in
            for i in 0..<count { let value = UInt16(raw[i*2]) | UInt16(raw[i*2+1]) << 8; buffer.floatChannelData![0][i] = Float(Int16(bitPattern: value)) / 32768 }
        }
        player.scheduleBuffer(buffer, completionCallbackType: .dataPlayedBack) { [weak self] _ in
            guard let self else { return }; self.lock.lock(); self.queuedSeconds = max(0, self.queuedSeconds-duration); self.lock.unlock()
        }
    }
    static func convertCapture(_ buffer: AVAudioPCMBuffer, using converter: AVAudioConverter, to pcm: AVAudioFormat,
                               onError: ((Error) -> Void)? = nil) -> Data? {
        guard buffer.frameLength > 0, buffer.format.sampleRate > 0 else { return nil }
        let capacity = AVAudioFrameCount(ceil(Double(buffer.frameLength) * pcm.sampleRate / buffer.format.sampleRate)) + 16
        guard let output = AVAudioPCMBuffer(pcmFormat: pcm, frameCapacity: capacity) else { return nil }
        var used = false
        var error: NSError?
        let status = converter.convert(to: output, error: &error) { _, status in
            if used { status.pointee = .noDataNow; return nil }
            used = true; status.pointee = .haveData; return buffer
        }
        if status == .error || error != nil {
            onError?(error ?? NSError(domain: "KindredVoiceCapture", code: 3)); return nil
        }
        guard output.frameLength > 0, let samples = output.int16ChannelData?[0] else { return nil }
        return Data(bytes: samples, count: Int(output.frameLength) * 2)
    }
    static func level(_ bytes: Data) -> Double {
        guard !bytes.isEmpty, bytes.count % 2 == 0 else { return 0 }
        return bytes.withUnsafeBytes { (raw: UnsafeRawBufferPointer) in
            var squares: Double = 0
            for i in stride(from: 0, to: raw.count, by: 2) {
                let value = Double(Int16(bitPattern: UInt16(raw[i]) | UInt16(raw[i + 1]) << 8)) / 32768
                squares += value * value
            }
            return min(1, sqrt(squares / Double(raw.count / 2)))
        }
    }
    static func renderedLevel(_ buffer: AVAudioPCMBuffer) -> Double {
        guard buffer.frameLength > 0, buffer.format.channelCount > 0, let channels = buffer.floatChannelData else { return 0 }
        var squares: Double = 0
        for channel in 0..<Int(buffer.format.channelCount) {
            for frame in 0..<Int(buffer.frameLength) {
                let sample = Double(channels[channel][frame])
                guard sample.isFinite else { return 0 }
                squares += sample * sample
            }
        }
        return min(1, sqrt(squares / Double(buffer.frameLength) / Double(buffer.format.channelCount)))
    }
    static func installPlaybackMeter(on player: AVAudioPlayerNode, format: AVAudioFormat, emit: @escaping (Double) -> Void) {
        player.installTap(onBus: 0, bufferSize: 960, format: format) { buffer, _ in
            emit(Self.renderedLevel(buffer))
        }
    }
    func playCue(_ cue: VoiceCallCue) -> TimeInterval {
        guard active, engine.isRunning else { return 0 }
        let samples = cue.samples()
        guard let buffer = AVAudioPCMBuffer(pcmFormat: playback, frameCapacity: AVAudioFrameCount(samples.count)) else { return 0 }
        buffer.frameLength = AVAudioFrameCount(samples.count)
        for i in samples.indices { buffer.floatChannelData![0][i] = samples[i] }
        cuePlayer.stop(); cuePlayer.scheduleBuffer(buffer); cuePlayer.play()
        return Double(samples.count) / playback.sampleRate
    }
    func stopCapture() {
        if tapped { engine.inputNode.removeTap(onBus: 0); tapped = false }
        if playbackTapped { player.removeTap(onBus: 0); playbackTapped = false }
        player.stop()
    }
    func stop() {
        let wasActive = active
        stopCapture(); cuePlayer.stop(); engine.stop()
        if active { try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation); active = false }
        if wasActive { refreshDiagnostics(); diagnostics.record(.stopped) }
    }
    deinit {
        if let configurationObserver { NotificationCenter.default.removeObserver(configurationObserver) }
        stop()
    }
}
