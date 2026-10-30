import AVFoundation
import Foundation
import OSLog

enum VoiceCaptureStage: String {
    case permission, foregroundWait, foregroundReady, foregroundTimeout, audioFactory
    case category, activation, voiceProcessing, inputFormat, converter, graph, engineStart
    case capturing, firstPCM, captureStalled, configurationChanged, configurationRecovery, routeChanged, interruption, stopped
}

/// Never retain an NSError's description, userInfo, or underlying errors. Even
/// its domain is restricted to known system domains before it can enter a log.
struct VoiceCaptureError: Equatable {
    let domain: String
    let code: Int
    init(_ error: Error) {
        let error = error as NSError
        let domains: Set<String> = [NSOSStatusErrorDomain, NSCocoaErrorDomain, NSURLErrorDomain,
            "AVFoundationErrorDomain", "com.apple.coreaudio.avfaudio", "KindredVoiceCapture"]
        domain = domains.contains(error.domain) ? error.domain : "other"
        code = error.code
    }
}

struct VoiceCaptureStartupError: Error {
    let stage: VoiceCaptureStage
    let reason: VoiceCaptureError
    init(stage: VoiceCaptureStage, error: Error) { self.stage = stage; reason = VoiceCaptureError(error) }
    var userMessage: String {
        switch stage {
        case .activation:
            return "The microphone is unavailable right now. Check your audio device, then try again."
        case .inputFormat:
            return "No microphone input is available. Check your audio device and try again."
        default:
            return "Microphone audio could not start. Try the device microphone or reconnect your audio device."
        }
    }
}

struct VoiceCaptureSnapshot {
    var stage: VoiceCaptureStage = .permission
    var errorStage: VoiceCaptureStage?
    var error: VoiceCaptureError?
    var foreground = false
    var permissionGranted = false
    var inputAvailable = false
    var inputPorts: [String] = []
    var outputPorts: [String] = []
    var inputRate: Double = 0
    var inputChannels: UInt32 = 0
    var outputRate: Double = 0
    var outputChannels: UInt32 = 0
    var sessionRate: Double = 0
    var sessionInputChannels = 0
    var sessionOutputChannels = 0
    var engineRunning = false
    var voiceProcessingEnabled = false
    var rawBuffers = 0
    var rawFrames = 0
    var convertedBuffers = 0
    var convertedFrames = 0
    var conversionFailures = 0
    var conversionError: VoiceCaptureError?
    var configurationChanges = 0
    var configurationRecoveries = 0
    var reasonCode: UInt?

    /// Only fixed labels, normalized route types and numeric metadata. No call,
    /// account or device identifiers, audio samples, transcripts, URLs or tickets.
    var text: String {
        let values: [String: Any] = [
            "stage": stage.rawValue, "error_stage": errorStage?.rawValue ?? "none",
            "error_domain": error?.domain ?? "none", "error_code": error?.code ?? 0,
            "foreground": foreground, "permission_granted": permissionGranted,
            "input_available": inputAvailable, "input_ports": inputPorts, "output_ports": outputPorts,
            "input_rate": inputRate, "input_channels": inputChannels, "output_rate": outputRate,
            "output_channels": outputChannels, "session_rate": sessionRate,
            "session_input_channels": sessionInputChannels, "session_output_channels": sessionOutputChannels,
            "engine_running": engineRunning, "voice_processing_enabled": voiceProcessingEnabled,
            "raw_buffers": rawBuffers, "raw_frames": rawFrames,
            "converted_buffers": convertedBuffers, "converted_frames": convertedFrames,
            "conversion_failures": conversionFailures, "conversion_error_domain": conversionError?.domain ?? "none",
            "conversion_error_code": conversionError?.code ?? 0, "configuration_changes": configurationChanges,
            "configuration_recoveries": configurationRecoveries,
            "reason_code": reasonCode ?? 0
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: values, options: .sortedKeys),
              let text = String(data: data, encoding: .utf8) else { return "voice-capture-diagnostic-unavailable" }
        return text
    }
}

/// One bounded diagnostic per call. Audio callbacks update counters only; log
/// formatting and session/engine inspection happen outside the audio callback.
final class VoiceCaptureDiagnostics {
    private static let logger = Logger(subsystem: "dev.kindred.companion", category: "VoiceCapture")
    private let lock = NSLock()
    private var value = VoiceCaptureSnapshot()
    private var loggedEvents = 0
    private var finalStages: Set<VoiceCaptureStage> = []
    var snapshot: VoiceCaptureSnapshot { lock.lock(); defer { lock.unlock() }; return value }

    func permission(_ allowed: Bool, foreground: Bool) {
        lock.lock(); value.permissionGranted = allowed; value.foreground = foreground; lock.unlock()
    }
    func record(_ stage: VoiceCaptureStage, error: VoiceCaptureError? = nil,
                foreground: Bool? = nil, reason: UInt? = nil) {
        lock.lock()
        value.stage = stage
        if let error { value.errorStage = stage; value.error = error }
        if let foreground { value.foreground = foreground }
        if let reason { value.reasonCode = reason }
        if stage == .configurationChanged { value.configurationChanges = min(1_000_000, value.configurationChanges + 1) }
        if stage == .configurationRecovery, error == nil { value.configurationRecoveries = min(1_000_000, value.configurationRecoveries + 1) }
        // Always retain the latest counters, but bound persistent event output.
        // Reserve final snapshots even if a noisy route emits many changes.
        let final = stage == .captureStalled || stage == .stopped
        let shouldLog = final ? finalStages.insert(stage).inserted : loggedEvents < 20
        if shouldLog && !final { loggedEvents += 1 }
        let captured = value
        lock.unlock()
        if shouldLog { Self.logger.notice("\(captured.text, privacy: .public)") }
    }
    func capture(rawFrames: Int, convertedFrames: Int) {
        lock.lock(); defer { lock.unlock() }
        value.rawBuffers = min(1_000_000_000, value.rawBuffers + 1)
        value.rawFrames = min(1_000_000_000_000, value.rawFrames + max(0, min(rawFrames, 1_000_000)))
        if convertedFrames > 0 {
            value.convertedBuffers = min(1_000_000_000, value.convertedBuffers + 1)
            value.convertedFrames = min(1_000_000_000_000, value.convertedFrames + min(convertedFrames, 1_000_000))
        }
    }
    func conversionFailed(_ error: Error) {
        let safe = VoiceCaptureError(error)
        lock.lock(); defer { lock.unlock() }
        value.conversionFailures = min(1_000_000_000, value.conversionFailures + 1)
        value.conversionError = safe
    }
    func refresh(session: AVAudioSession, engine: AVAudioEngine, input: AVAudioFormat? = nil,
                 output: AVAudioFormat? = nil, voiceProcessing: Bool? = nil) {
        let inputs = session.currentRoute.inputs.prefix(4).map { Self.portType($0.portType) }
        let outputs = session.currentRoute.outputs.prefix(4).map { Self.portType($0.portType) }
        let rate = session.sampleRate, available = session.isInputAvailable
        let inputChannels = session.inputNumberOfChannels, outputChannels = session.outputNumberOfChannels
        let running = engine.isRunning
        lock.lock(); defer { lock.unlock() }
        value.inputPorts = inputs; value.outputPorts = outputs; value.inputAvailable = available
        value.sessionRate = Self.rate(rate)
        value.sessionInputChannels = min(64, max(0, inputChannels)); value.sessionOutputChannels = min(64, max(0, outputChannels))
        value.engineRunning = running
        if let input { value.inputRate = Self.rate(input.sampleRate); value.inputChannels = min(64, input.channelCount) }
        if let output { value.outputRate = Self.rate(output.sampleRate); value.outputChannels = min(64, output.channelCount) }
        if let voiceProcessing { value.voiceProcessingEnabled = voiceProcessing }
    }
    private static func rate(_ value: Double) -> Double { value.isFinite && value >= 0 && value <= 384000 ? value : 0 }
    private static func portType(_ port: AVAudioSession.Port) -> String {
        switch port {
        case .builtInMic: return "built-in-mic"
        case .builtInReceiver: return "receiver"
        case .builtInSpeaker: return "speaker"
        case .headsetMic: return "headset-mic"
        case .headphones: return "headphones"
        case .bluetoothHFP: return "bluetooth-hfp"
        case .bluetoothA2DP: return "bluetooth-a2dp"
        case .bluetoothLE: return "bluetooth-le"
        case .usbAudio: return "usb"
        case .airPlay: return "airplay"
        case .lineIn: return "line-in"
        case .lineOut: return "line-out"
        default: return "other"
        }
    }
}
