import AVFoundation
import KindredCore
import Speech
import UIKit
#if DEBUG
import os
#endif

/// One foreground dictation session. Apple receives only on-device recognition requests;
/// unsupported languages never silently switch to network transcription.
@MainActor
final class NativeDictation: NSObject, SFSpeechRecognizerDelegate {
    typealias Emit = ([String: Any]) -> Void
    private var fence = DictationFence()
    private var recognizer: SFSpeechRecognizer?
    private var task: SFSpeechRecognitionTask?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private let engine = AVAudioEngine()
    private var tapInstalled = false
    private var ownsAudioSession = false
    private var previousRecordingHaptics: Bool?
    private var permissionTask: Task<Void, Never>?
    private var deadlineTask: Task<Void, Never>?
    private var finalizationTask: Task<Void, Never>?
    private var lastText = ""
    private var transcript = DictationTranscript()
    private(set) var phase = "idle"
    var emit: Emit?
    var feedback: ((InteractionFeedback) -> Void)?
    var availabilityChanged: (() -> Void)?
    // This is a real recognizer seam for app-hosted prerecorded-audio tests;
    // production always captures the microphone with AVAudioEngine.
    var testAudio: ((SFSpeechAudioBufferRecognitionRequest) throws -> Void)?
    #if DEBUG
    struct CaptureStatistics { var buffers = 0; var frames: UInt64 = 0; var peak: Float = 0 }
    private let captureStatistics = OSAllocatedUnfairLock(initialState: CaptureStatistics())
    var debugCaptureStatistics: CaptureStatistics { captureStatistics.withLock { $0 } }
    struct TestHooks {
        var speechPermission: () async -> SFSpeechRecognizerAuthorizationStatus? = { .authorized }
        var microphonePermission: () async -> Bool? = { true }
        var foreground: () -> Bool = { true }
        var voiceCallActive: () -> Bool = { false }
        var support: Bool = true
        var available: Bool = true
        var capture: ((DictationOperation) throws -> Void)?
    }
    var testHooks: TestHooks?
    #endif
    private var foreground: Bool {
        #if DEBUG
        if let testHooks { return testHooks.foreground() }
        #endif
        return UIApplication.shared.applicationState == .active
    }
    private var voiceCallActive: Bool {
        #if DEBUG
        if let testHooks { return testHooks.voiceCallActive() }
        #endif
        return NativeVoiceCall.shared.isActive
    }
    private func authorizeSpeech() async -> SFSpeechRecognizerAuthorizationStatus? {
        #if DEBUG
        if let testHooks { return await testHooks.speechPermission() }
        #endif
        return await Self.speechPermission()
    }
    private func authorizeMicrophone() async -> Bool? {
        #if DEBUG
        if let testHooks { return await testHooks.microphonePermission() }
        #endif
        return await Self.microphonePermission()
    }

    var locale: String { recognizer?.locale.identifier ?? Locale.current.identifier }
    var onDeviceAvailable: Bool {
        #if DEBUG
        if let testHooks { return testHooks.support }
        #endif
        return recognizer?.supportsOnDeviceRecognition == true
    }
    var recognizerAvailable: Bool {
        #if DEBUG
        if let testHooks { return testHooks.available }
        #endif
        return recognizer?.isAvailable == true
    }
    var operation: DictationOperation? { fence.current }

    override init() {
        super.init()
        selectLocale(nil)
        NotificationCenter.default.addObserver(self, selector: #selector(background), name: UIApplication.didEnterBackgroundNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(resignActive), name: UIApplication.willResignActiveNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(interrupted(_:)), name: AVAudioSession.interruptionNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(interrupted(_:)), name: AVAudioSession.routeChangeNotification, object: nil)
    }

    func selectLocale(_ identifier: String?) {
        guard fence.current == nil else { return }
        let requested = Locale(identifier: identifier ?? Locale.current.identifier)
        // SFSpeechRecognizer construction can still fail for an unsupported locale.
        recognizer?.delegate = nil
        recognizer = SFSpeechRecognizer(locale: requested)
        recognizer?.delegate = self
    }

    nonisolated func speechRecognizer(_ speechRecognizer: SFSpeechRecognizer, availabilityDidChange available: Bool) {
        Task { @MainActor [weak self] in
            guard let self, self.recognizer === speechRecognizer else { return }
            self.availabilityChanged?()
            if !available, let operation = self.fence.current { self.fail("recognizer-unavailable", operation) }
        }
    }

    func start(documentID: String, operationID: String, chatID: String, locale: String?) {
        guard fence.current == nil else { return }
        selectLocale(locale)
        let operation = fence.begin(documentID: documentID, operationID: operationID, chatID: chatID)
        lastText = ""
        transcript = DictationTranscript()
        #if DEBUG
        captureStatistics.withLock { $0 = CaptureStatistics() }
        #endif
        guard !voiceCallActive else { fail("voice-call-active", operation); return }
        guard onDeviceAvailable else { fail("on-device-unavailable", operation); return }
        guard recognizerAvailable else { fail("recognizer-unavailable", operation); return }
        phase = "authorizing"; send("authorizing", operation)
        permissionTask = Task { @MainActor [weak self] in
            guard let self else { return }
            let microphone: Bool?
            if self.testAudio != nil { microphone = true } else { microphone = await self.authorizeMicrophone() }
            guard self.fence.accepts(operation) else { return }
            guard let microphone else { self.fail("microphone-timeout", operation); return }
            guard self.fence.accepts(operation) else { return }
            guard microphone else { self.fail("microphone-denied", operation); return }
            let speech = await self.authorizeSpeech()
            guard self.fence.accepts(operation) else { return }
            guard let speech else { self.fail("speech-timeout", operation); return }
            guard self.fence.accepts(operation) else { return }
            guard speech == .authorized else {
                self.fail(speech == .restricted ? "speech-restricted" : "speech-denied", operation); return
            }
            // A system permission sheet may briefly leave the app inactive.
            // Background cancellation fences the callback; capture requires active.
            for _ in 0..<20 {
                if self.foreground { break }
                try? await Task.sleep(nanoseconds: 100_000_000)
                guard self.fence.accepts(operation), !Task.isCancelled else { return }
            }
            guard self.foreground else { self.fail("not-foreground", operation); return }
            guard self.onDeviceAvailable else { self.fail("on-device-unavailable", operation); return }
            guard self.recognizerAvailable else { self.fail("recognizer-unavailable", operation); return }
            guard !self.voiceCallActive else { self.fail("voice-call-active", operation); return }
            do { try self.capture(operation) } catch { self.fail("audio-start-failed", operation) }
        }
    }

    private static func speechPermission() async -> SFSpeechRecognizerAuthorizationStatus? {
        let status = SFSpeechRecognizer.authorizationStatus()
        if status != .notDetermined { return status }
        return await withCheckedContinuation { continuation in
            let reply = PermissionReply<SFSpeechRecognizerAuthorizationStatus>(continuation)
            reply.armTimeout()
            SFSpeechRecognizer.requestAuthorization { status in
                Task { @MainActor in reply.finish(status) }
            }
        }
    }
    private static func microphonePermission() async -> Bool? {
        await withCheckedContinuation { continuation in
            let reply = PermissionReply<Bool>(continuation)
            reply.armTimeout()
            AVAudioApplication.requestRecordPermission { allowed in
                Task { @MainActor in reply.finish(allowed) }
            }
        }
    }

    private func capture(_ operation: DictationOperation) throws {
        #if DEBUG
        if let testHooks {
            try testHooks.capture?(operation)
            guard fence.accepts(operation) else { return }
            phase = "recording"; send("recording", operation); feedback?(.recordingStarted)
            armRecordingDeadline(operation)
            return
        }
        #endif
        guard fence.accepts(operation), let recognizer else { return }
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.requiresOnDeviceRecognition = true
        request.shouldReportPartialResults = true
        request.taskHint = .dictation
        request.addsPunctuation = true
        self.request = request
        if testAudio == nil {
            let audio = AVAudioSession.sharedInstance()
            try audio.setCategory(.record, mode: .measurement, options: [])
            previousRecordingHaptics = audio.allowHapticsAndSystemSoundsDuringRecording
            // Recording otherwise suppresses the very cue that confirms the
            // microphone is ready. Restore this session option on every exit.
            try? audio.setAllowHapticsAndSystemSoundsDuringRecording(true)
            try audio.setActive(true, options: [])
            ownsAudioSession = true
            let input = engine.inputNode
            let format = input.outputFormat(forBus: 0)
            guard format.sampleRate > 0, format.channelCount > 0 else { throw NSError(domain: "NativeDictation", code: 1) }
            #if DEBUG
            let statistics = captureStatistics
            #endif
            input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
                #if DEBUG
                var peak: Float = 0
                if let channel = buffer.floatChannelData?[0] {
                    for index in 0..<Int(buffer.frameLength) { peak = max(peak, abs(channel[index])) }
                }
                statistics.withLock { $0.buffers += 1; $0.frames += UInt64(buffer.frameLength); $0.peak = max($0.peak, peak) }
                #endif
                request.append(buffer)
            }
            tapInstalled = true
            engine.prepare()
            try engine.start()
        }
        task = recognizer.recognitionTask(with: request) { [weak self] result, error in
            // Never log error descriptions: an underlying service can include
            // transcript data. The web receives only stable error categories.
            let text = result?.bestTranscription.formattedString
            let segments = result?.bestTranscription.segments.map {
                DictationTranscript.Segment(range: $0.substringRange, start: $0.timestamp, duration: $0.duration)
            } ?? []
            let speechStart = result?.speechRecognitionMetadata?.speechStartTimestamp
            let speechDuration = result?.speechRecognitionMetadata?.speechDuration
            let final = result?.isFinal == true
            let failed = error != nil
            Task { @MainActor [weak self] in
                self?.acceptRecognition(text: text, final: final, failed: failed, operation: operation,
                                        segments: segments, speechStart: speechStart, speechDuration: speechDuration)
            }
        }
        guard fence.accepts(operation) else { return }
        phase = "recording"; send("recording", operation); feedback?(.recordingStarted)
        if let testAudio { try testAudio(request) }
        armRecordingDeadline(operation)
    }

    private func armRecordingDeadline(_ operation: DictationOperation) {
        deadlineTask = Task { @MainActor [weak self] in
            do { try await Task.sleep(nanoseconds: 60_000_000_000) } catch { return }
            self?.stop(operationID: operation.operationID, chatID: operation.chatID, reason: "duration-limit")
        }
    }

    // Both real Apple callbacks and injectable lifecycle tests enter this fence.
    func acceptRecognition(text: String?, final: Bool, failed: Bool, operation: DictationOperation,
                           segments: [DictationTranscript.Segment] = [],
                           speechStart: TimeInterval? = nil, speechDuration: TimeInterval? = nil) {
        guard fence.accepts(operation) else { return }
        if let text {
            guard text.utf8.count <= 16_384 else { fail("transcript-limit", operation); return }
            var next = transcript
            let accumulated = next.update(text, segments: segments, speechStart: speechStart, speechDuration: speechDuration)
            guard accumulated.utf8.count <= 16_384 else { fail("transcript-limit", operation); return }
            transcript = next
            lastText = accumulated
            send(final ? "final" : "partial", operation, text: accumulated)
            if final {
                let wasRecording = phase == "recording"
                send("stopped", operation, text: accumulated); complete(operation)
                if wasRecording { feedback?(.recordingStopped) }
                return
            }
        }
        if failed { fail("recognition-failed", operation) }
    }

    func stop(operationID: String, chatID: String, reason: String? = nil) {
        guard let operation = fence.current, operation.operationID == operationID,
              operation.chatID == chatID else { return }
        if phase == "authorizing" { cancel(reason: "cancelled"); return }
        guard phase == "recording" else { return }
        phase = "finishing"
        releaseCapture()
        feedback?(.recordingStopped)
        request?.endAudio()
        send("finishing", operation, reason: reason)
        deadlineTask?.cancel(); deadlineTask = nil
        finalizationTask = Task { @MainActor [weak self] in
            do { try await Task.sleep(nanoseconds: 3_000_000_000) } catch { return }
            guard let self, self.fence.accepts(operation) else { return }
            // Preserve the last preview as draft; do not label it a confirmed
            // recognizer final or restart capture after a missing final receipt.
            self.send("stopped", operation, text: self.lastText, reason: "finalization-timeout")
            self.complete(operation)
        }
    }

    func cancel(reason: String = "cancelled") {
        guard let operation = fence.current else { return }
        send("cancelled", operation, text: lastText, reason: reason)
        finishResources()
        fence.invalidate()
        phase = "idle"
    }
    private func fail(_ code: String, _ operation: DictationOperation) {
        guard fence.accepts(operation) else { return }
        send("error", operation, text: lastText, reason: code)
        complete(operation)
        feedback?(.recordingError)
    }
    private func complete(_ operation: DictationOperation) {
        guard fence.accepts(operation) else { return }
        finishResources(); fence.invalidate(); phase = "idle"
    }
    private func releaseCapture() {
        if engine.isRunning { engine.stop() }
        if tapInstalled { engine.inputNode.removeTap(onBus: 0); tapInstalled = false }
        if ownsAudioSession {
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
            ownsAudioSession = false
        }
        if let previousRecordingHaptics {
            try? AVAudioSession.sharedInstance().setAllowHapticsAndSystemSoundsDuringRecording(previousRecordingHaptics)
            self.previousRecordingHaptics = nil
        }
    }
    private func finishResources() {
        permissionTask?.cancel(); permissionTask = nil
        deadlineTask?.cancel(); deadlineTask = nil
        finalizationTask?.cancel(); finalizationTask = nil
        releaseCapture(); request?.endAudio(); task?.cancel(); task = nil; request = nil
    }
    private func send(_ phase: String, _ operation: DictationOperation, text: String? = nil, reason: String? = nil) {
        guard let sequence = fence.nextSequence(for: operation) else { return }
        var payload: [String: Any] = ["operationID": operation.operationID, "chatID": operation.chatID,
            "documentID": operation.documentID, "phase": phase, "sequence": sequence]
        if let text { payload["text"] = text }
        if let reason { payload["errorCode"] = reason; if phase == "cancelled" { payload["reason"] = reason } }
        emit?(payload)
    }
    @objc private func background() { cancel(reason: "background") }
    @objc private func resignActive() {
        // Permission dialogs may make the app inactive while authorizing; they
        // do not permit capture until active again. Existing capture stops now.
        if phase == "recording" || phase == "finishing" { cancel(reason: "background") }
    }
    @objc private func interrupted(_ note: Notification) {
        if note.name == AVAudioSession.interruptionNotification {
            guard (note.userInfo?[AVAudioSessionInterruptionTypeKey] as? NSNumber)?.uintValue == AVAudioSession.InterruptionType.began.rawValue else { return }
        } else {
            let reason = (note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? NSNumber)?.uintValue
            guard reason == AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue
                || reason == AVAudioSession.RouteChangeReason.newDeviceAvailable.rawValue
                || reason == AVAudioSession.RouteChangeReason.override.rawValue else { return }
        }
        guard phase == "recording" || phase == "finishing", let operation = fence.current else { return }
        fail("audio-interrupted", operation)
    }
    func tearDown() {
        cancel(reason: "session-ended")
        NotificationCenter.default.removeObserver(self)
        recognizer?.delegate = nil; emit = nil; feedback = nil; availabilityChanged = nil
    }
}

/// Permission sheets can outlive a cancelled utterance; timeout resumes once,
/// and later system callbacks cannot bypass operation fences.
@MainActor
private final class PermissionReply<Value> {
    private var continuation: CheckedContinuation<Value?, Never>?
    private var timeout: Task<Void, Never>?
    init(_ continuation: CheckedContinuation<Value?, Never>) { self.continuation = continuation }
    func armTimeout() {
        timeout = Task { @MainActor [weak self] in
            do { try await Task.sleep(nanoseconds: 12_000_000_000) } catch { return }
            self?.finish(nil)
        }
    }
    func finish(_ value: Value?) {
        guard let continuation else { return }
        self.continuation = nil; timeout?.cancel(); timeout = nil
        continuation.resume(returning: value)
    }
}
