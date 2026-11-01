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

    func stop(owner: UUID? = nil, id: String? = nil) {
        if let owner, self.owner != owner { return }
        if let id, self.id != id { return }
        finish()
    }

    private func finish(error: String? = nil) {
        let oldID = id, reply = emit
        id = nil; owner = nil; emit = nil
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
