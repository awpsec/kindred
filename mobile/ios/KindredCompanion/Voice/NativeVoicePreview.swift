import AVFoundation
import Foundation
import UIKit

/// An explicitly requested voice sample is media playback, not a browser sound
/// effect. Keep it audible in silent mode without opening the microphone.
@MainActor
final class NativeVoicePreview: NSObject, AVAudioPlayerDelegate {
    static let shared = NativeVoicePreview()
    private var player: AVAudioPlayer?
    private var owner: UUID?
    private var id: String?
    private var emit: (([String: Any]) -> Void)?
    private var ownsAudioSession = false
    private var streamTask: Task<Void, Never>?
    private var streamEngine: AVAudioEngine?
    private var streamPlayer: AVAudioPlayerNode?
    private var streamNext: Int64?
    private var streamFrames = 0
    private var streamBuffers = 0
    private var streamDone = false
    private static let streamFormat = AVAudioFormat(standardFormatWithSampleRate: 24_000, channels: 1)!


    override init() {
        super.init()
        NotificationCenter.default.addObserver(self, selector: #selector(interrupted), name: AVAudioSession.interruptionNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(backgrounded), name: UIApplication.didEnterBackgroundNotification, object: nil)
    }

    static func makePlayer(_ data: Data) throws -> AVAudioPlayer {
        guard data.count > 44, data.count <= 1_500_000,
              data.prefix(4) == Data("RIFF".utf8), data.dropFirst(8).prefix(4) == Data("WAVE".utf8) else {
            throw URLError(.cannotDecodeContentData)
        }
        let player = try AVAudioPlayer(data: data, fileTypeHint: AVFileType.wav.rawValue)
        guard player.duration.isFinite, player.duration > 0, player.duration <= 12 else {
            throw URLError(.cannotDecodeContentData)
        }
        return player
    }

    func start(id: String, owner: UUID, data: Data, emit: @escaping ([String: Any]) -> Void) {
        guard !NativeVoiceCall.shared.isActive else {
            emit(["id": id, "type": "preview_error", "message": "End your call before previewing a voice."]); return
        }
        stop()
        self.id = id; self.owner = owner; self.emit = emit
        do {
            let player = try Self.makePlayer(data)
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .spokenAudio)
            try session.setActive(true)
            ownsAudioSession = true
            self.player = player; player.delegate = self
            guard player.prepareToPlay(), player.play() else { throw URLError(.cannotDecodeContentData) }
            emit(["id": id, "type": "preview_playing"])
        } catch {
            finish(error: "The voice preview could not play. Check your audio output and try again.")
        }
    }

    /// The request is assembled by the trusted native host. Audio starts on the
    /// first provider chunk; no microphone, WebView audio or per-chunk rate change.
    func startStream(id: String, owner: UUID, request: URLRequest, session: URLSession = .shared, emit: @escaping ([String: Any]) -> Void) {
        guard !NativeVoiceCall.shared.isActive else {
            emit(["id": id, "type": "preview_error", "message": "End your call before previewing a voice."]); return
        }
        stop(); self.id = id; self.owner = owner; self.emit = emit
        streamTask = Task { [weak self] in
            do {
                let (bytes, response) = try await session.bytes(for: request, delegate: VoicePreviewRedirectGuard())
                guard let response = response as? HTTPURLResponse, response.statusCode == 200,
                      response.value(forHTTPHeaderField: "Content-Type")?.hasPrefix("application/x-ndjson") == true else {
                    throw URLError(.badServerResponse)
                }
                var received = 0, done = false
                for try await line in bytes.lines {
                    try Task.checkCancellation()
                    received += line.utf8.count
                    guard received <= 1_500_000, line.utf8.count <= 140_000, !done else { throw URLError(.dataLengthExceedsMaximum) }
                    guard let self, self.id == id else { return }
                    let event = try JSONSerialization.jsonObject(with: Data(line.utf8)) as? [String: Any]
                    switch event?["type"] as? String {
                    case "audio":
                        guard let encoded = event?["data"] as? String, let pcm = Data(base64Encoded: encoded) else { throw URLError(.cannotDecodeContentData) }
                        try self.appendStream(pcm, id: id)
                    case "done":
                        guard self.streamFrames > 0 else { throw URLError(.zeroByteResource) }
                        done = true; self.streamDone = true
                        if self.streamBuffers == 0 { self.finish() }
                    default: throw URLError(.badServerResponse)
                    }
                }
                guard done else { throw URLError(.networkConnectionLost) }
            } catch {
                guard let self, self.id == id, !Task.isCancelled else { return }
                self.finish(error: "The voice preview stopped. Try again.")
            }
        }
    }

    static func previewBuffer(_ pcm: Data) throws -> AVAudioPCMBuffer {
        guard !pcm.isEmpty, pcm.count % 2 == 0, pcm.count <= 96_000,
              let buffer = AVAudioPCMBuffer(pcmFormat: streamFormat, frameCapacity: AVAudioFrameCount(pcm.count / 2)),
              let channel = buffer.floatChannelData?[0] else { throw URLError(.cannotDecodeContentData) }
        buffer.frameLength = AVAudioFrameCount(pcm.count / 2)
        pcm.withUnsafeBytes { (bytes: UnsafeRawBufferPointer) in
            for i in 0..<Int(buffer.frameLength) {
                channel[i] = Float(Int16(bitPattern: UInt16(bytes[i * 2]) | UInt16(bytes[i * 2 + 1]) << 8)) / 32768
            }
        }
        return buffer
    }

    private func appendStream(_ pcm: Data, id: String) throws {
        let buffer = try Self.previewBuffer(pcm)
        streamFrames += Int(buffer.frameLength)
        guard streamFrames <= 240_000 else { throw URLError(.dataLengthExceedsMaximum) }
        if streamEngine == nil {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .default)
            try session.setActive(true); ownsAudioSession = true
            let engine = AVAudioEngine(), player = AVAudioPlayerNode()
            streamEngine = engine; streamPlayer = player
            engine.attach(player); engine.connect(player, to: engine.mainMixerNode, format: Self.streamFormat)
            engine.prepare(); try engine.start(); player.play()
        }
        guard let player = streamPlayer else { throw URLError(.cannotDecodeContentData) }
        let rendered = player.lastRenderTime.flatMap { player.playerTime(forNodeTime: $0)?.sampleTime } ?? 0
        let at = streamNext.flatMap { $0 >= rendered ? $0 : nil } ?? (rendered + 2_880)
        streamNext = at + Int64(buffer.frameLength); streamBuffers += 1
        player.scheduleBuffer(buffer, at: AVAudioTime(sampleTime: at, atRate: 24_000), options: [], completionCallbackType: .dataPlayedBack) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self, self.id == id else { return }
                self.streamBuffers -= 1
                if self.streamDone && self.streamBuffers == 0 { self.finish() }
            }
        }
        if streamFrames == Int(buffer.frameLength) { emit?(["id": id, "type": "preview_playing"]) }
    }

    func stop(owner: UUID? = nil, id: String? = nil) {
        if let owner, self.owner != owner { return }
        if let id, self.id != id { return }
        finish()
    }

    private func finish(error: String? = nil) {
        let oldID = id, reply = emit
        id = nil; owner = nil; emit = nil
        streamTask?.cancel(); streamTask = nil
        streamPlayer?.stop(); streamEngine?.stop(); streamPlayer = nil; streamEngine = nil
        streamNext = nil; streamFrames = 0; streamBuffers = 0; streamDone = false
        player?.delegate = nil; player?.stop(); player = nil
        if ownsAudioSession {
            ownsAudioSession = false
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        }
        if let oldID {
            var value: [String: Any] = ["id": oldID, "type": error == nil ? "preview_ended" : "preview_error"]
            if let error { value["message"] = error }
            reply?(value)
        }
    }

    func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        guard self.player === player else { return }
        finish(error: flag ? nil : "The voice preview stopped before it finished. Try again.")
    }
    func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
        guard self.player === player else { return }
        finish(error: "The voice preview could not be decoded. Try again.")
    }
    @objc private func interrupted(_ notification: Notification) {
        guard notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt == AVAudioSession.InterruptionType.began.rawValue else { return }
        finish(error: "Voice preview was interrupted. Tap play to try again.")
    }
    @objc private func backgrounded() { stop() }
    deinit { NotificationCenter.default.removeObserver(self) }
}

/// Preview authorization must never follow an HTTP redirect to another origin.
private final class VoicePreviewRedirectGuard: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    nonisolated func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
                    completionHandler: @escaping @Sendable (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}
