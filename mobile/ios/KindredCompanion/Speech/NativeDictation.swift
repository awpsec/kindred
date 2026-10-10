import AVFoundation
import KindredCore
import Speech
import UIKit

/// One foreground utterance. Apple receives only on-device recognition requests;
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
    private var permissionTask: Task<Void, Never>?
    private var deadlineTask: Task<Void, Never>?
    private var finalizationTask: Task<Void, Never>?
    private var lastText = ""
    private(set) var phase = "idle"
    var emit: Emit?
    var availabilityChanged: (() -> Void)?
    // This is a real recognizer seam for app-hosted prerecorded-audio tests;
    // production always captures the microphone with AVAudioEngine.
    var testAudio: ((SFSpeechAudioBufferRecognitionRequest) throws -> Void)?
    #if DEBUG
    struct TestHooks {
        var speechPermission: () async -> SFSpeechRecognizerAuthorizationStatus? = { .authorized }
        var microphonePermission: () async -> Bool? = { true }
        var foreground: () -> Bool = { true }
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
            phase = "recording"; send("recording", operation)
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
            try audio.setActive(true, options: [])
            ownsAudioSession = true
            let input = engine.inputNode
            let format = input.outputFormat(forBus: 0)
            guard format.sampleRate > 0, format.channelCount > 0 else { throw NSError(domain: "NativeDictation", code: 1) }
            input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in request.append(buffer) }
            tapInstalled = true
            engine.prepare()
            try engine.start()
        }
        task = recognizer.recognitionTask(with: request) { [weak self] result, error in
            // Never log error descriptions: an underlying service can include
            // transcript data. The web receives only stable error categories.
            let text = result?.bestTranscription.formattedString
            let final = result?.isFinal == true
            let failed = error != nil
            Task { @MainActor [weak self] in
                self?.acceptRecognition(text: text, final: final, failed: failed, operation: operation)
            }
        }
        guard fence.accepts(operation) else { return }
        phase = "recording"; send("recording", operation)
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
    func acceptRecognition(text: String?, final: Bool, failed: Bool, operation: DictationOperation) {
        guard fence.accepts(operation) else { return }
        if let text {
            guard text.utf8.count <= 16_384 else { fail("transcript-limit", operation); return }
            lastText = text
            send(final ? "final" : "partial", operation, text: text)
            if final { send("stopped", operation, text: text); complete(operation); return }
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
        recognizer?.delegate = nil; emit = nil; availabilityChanged = nil
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
