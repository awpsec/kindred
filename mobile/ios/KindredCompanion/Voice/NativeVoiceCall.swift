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
    private var socket: URLSessionWebSocketTask?
    private var receiveTask: Task<Void, Never>?
    private var heartbeat: Task<Void, Never>?
    private var deadline: Task<Void, Never>?
    private var audio: VoiceAudioPipe?
    private var activity: Activity<VoiceCallAttributes>?
    private var started = Date()
    private var muted = false
    private var ending = false
    private var ready = false
    private var emit: (([String: Any]) -> Void)?
    private var pendingFrames = 0
    private var serialSend: Task<Void, Never>?
    private var lastSpeakingNotice = Date.distantPast
    private var lastEvent: (owner: UUID, id: String, payload: [String: Any])?

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
              UIApplication.shared.applicationState == .active else { return }
        self.id = id; self.owner = owner; self.emit = emit; ending = false; ready = false; muted = false; lastSpeakingNotice = .distantPast
        deadline = Task { [weak self] in
            try? await Task.sleep(for: .seconds(25))
            guard !Task.isCancelled else { return }
            self?.fail(id: id, message: "The call did not connect. Try again.")
        }
        receiveTask = Task { [weak self] in
            let allowed = await withCheckedContinuation { continuation in
                AVAudioSession.sharedInstance().requestRecordPermission { continuation.resume(returning: $0) }
            }
            guard let self, self.id == id, !self.ending else { return }
            guard allowed else { self.fail(id: id, message: "Allow microphone access in Settings to make a call."); return }
            do {
                var components = URLComponents(url: origin, resolvingAgainstBaseURL: false)!
                components.scheme = components.scheme == "https" ? "wss" : "ws"
                components.path = "/voice"; components.queryItems = [URLQueryItem(name: "ticket", value: ticket)]
                components.fragment = nil
                let socket = URLSession.shared.webSocketTask(with: components.url!)
                self.socket = socket
                socket.maximumMessageSize = 128 * 1024
                socket.resume()
                while self.id == id {
                    let message = try await socket.receive()
                    guard case .string(let text) = message, let data = text.data(using: .utf8),
                          let value = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { continue }
                    switch value["type"] as? String {
                    case "started":
                        guard !self.ready, !self.ending else { continue }
                        self.ready = true; self.started = Date(); self.deadline?.cancel()
                        let audio = VoiceAudioPipe()
                        try audio.start { [weak self] data in
                            Task { @MainActor in self?.capture(data, id: id) }
                        }
                        self.audio = audio
                        if ActivityAuthorizationInfo().areActivitiesEnabled {
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
                            if Date().timeIntervalSince(self.lastSpeakingNotice) >= 0.5 {
                                self.lastSpeakingNotice = Date()
                                self.emit?(["type": "speaking", "id": id])
                            }
                        }
                    case "ended":
                        self.terminal(["type": "ended", "id": id, "saved": value["saved"] as? Bool ?? false])
                        self.cleanup(id: id); return
                    case "error":
                        // Keep receiving the final saved receipt; no raw provider diagnostics.
                        self.emit?(["type": "error", "id": id, "message": value["message"] as? String ?? "The voice connection ended."])
                        self.end(id: id)
                    default: break
                    }
                }
            } catch {
                if self.id == id { self.fail(id: id, message: "Call disconnected. Your conversation so far is kept.") }
            }
        }
    }
    private func capture(_ bytes: Data, id: String) {
        guard self.id == id, ready, !ending else { return }
        guard pendingFrames < 20 else { fail(id: id, message: "The call connection is too slow. Try again."); return }
        send(["type": "audio", "data": (muted ? Data(count: bytes.count) : bytes).base64EncodedString()], id: id)
    }
    private func send(_ value: [String: Any], id: String) {
        guard self.id == id, let socket, let data = try? JSONSerialization.data(withJSONObject: value), let text = String(data: data, encoding: .utf8) else { return }
        let previous = serialSend; pendingFrames += 1
        serialSend = Task { [weak self] in
            await previous?.value
            guard let self, self.id == id, !Task.isCancelled else { return }
            defer { if self.id == id { self.pendingFrames = max(0, self.pendingFrames - 1) } }
            do { try await socket.send(.string(text)) }
            catch { self.fail(id: id, message: "The call connection ended.") }
        }
    }
    func setMuted(id: String, value: Bool) {
        guard self.id == id, ready, !ending else { return }
        muted = value
        send(["type": "mute", "muted": value], id: id)
        emit?(["type": "mute", "id": id, "muted": value])
        if let activity { Task { await activity.update(ActivityContent(state: .init(started: started, muted: value), staleDate: Date().addingTimeInterval(45))) } }
    }
    func end(id: String) {
        guard self.id == id, !ending else { return }
        ending = true; audio?.stop(); audio = nil; heartbeat?.cancel(); deadline?.cancel()
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
        terminal(["type": "error", "id": id, "message": message, "terminal": true]); cleanup(id: id)
    }
    private func cleanup(id: String) {
        guard self.id == id else { return }
        self.id = nil; owner = nil; ready = false; ending = false
        audio?.stop(); audio = nil; socket?.cancel(with: .normalClosure, reason: nil); socket = nil
        receiveTask?.cancel(); heartbeat?.cancel(); deadline?.cancel(); serialSend?.cancel(); pendingFrames = 0
        if let activity { Task { await activity.end(nil, dismissalPolicy: .immediate) }; self.activity = nil }
        emit = nil
    }
    @objc private func interrupted(_ notification: Notification) {
        if let type = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt, type == AVAudioSession.InterruptionType.began.rawValue, let id { end(id: id) }
    }
    @objc private func routeChanged(_ notification: Notification) {
        if let reason = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt, reason == AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue, let id { end(id: id) }
    }
}

private final class VoiceAudioPipe {
    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private var tapped = false
    private var active = false
    private let lock = NSLock()
    private var queuedSeconds: Double = 0
    private let pcm = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 24000, channels: 1, interleaved: true)!
    private let playback = AVAudioFormat(standardFormatWithSampleRate: 24000, channels: 1)!
    func start(capture: @escaping (Data) -> Void) throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.defaultToSpeaker, .allowBluetooth])
        try session.setActive(true)
        active = true
        do {
            try engine.inputNode.setVoiceProcessingEnabled(true)
            let input = engine.inputNode.outputFormat(forBus: 0)
            guard let converter = AVAudioConverter(from: input, to: pcm) else { throw URLError(.cannotDecodeContentData) }
            engine.attach(player); engine.connect(player, to: engine.mainMixerNode, format: playback)
            engine.inputNode.installTap(onBus: 0, bufferSize: 2048, format: input) { [pcm] buffer, _ in
                let capacity = AVAudioFrameCount(ceil(Double(buffer.frameLength) * 24000 / input.sampleRate)) + 16
                guard let output = AVAudioPCMBuffer(pcmFormat: pcm, frameCapacity: capacity) else { return }
                var used = false
                var error: NSError?
                converter.convert(to: output, error: &error) { _, status in
                    if used { status.pointee = .noDataNow; return nil }
                    used = true; status.pointee = .haveData; return buffer
                }
                guard error == nil, output.frameLength > 0, let samples = output.int16ChannelData?[0] else { return }
                capture(Data(bytes: samples, count: Int(output.frameLength) * 2))
            }
            tapped = true; engine.prepare(); try engine.start(); player.play()
        } catch { stop(); throw error }
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
    func stop() {
        if tapped { engine.inputNode.removeTap(onBus: 0); tapped = false }
        player.stop(); engine.stop()
        if active { try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation); active = false }
    }
    deinit { stop() }
}
