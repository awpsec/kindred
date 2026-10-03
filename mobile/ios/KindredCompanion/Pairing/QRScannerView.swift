import AVFoundation
import SwiftUI
import UIKit

/// On-device QR reading with AVFoundation. Frames never leave the phone and
/// nothing is decoded by a remote service.
struct QRScannerView: UIViewControllerRepresentable {
    /// Called once per code; scanning pauses until `resumeToken` changes.
    let onCode: (String) -> Void
    let onUnavailable: () -> Void
    /// Bumping this value resumes scanning after a code was rejected.
    var resumeToken: Int = 0

    func makeUIViewController(context: Context) -> QRScannerController {
        let controller = QRScannerController()
        controller.onCode = onCode
        controller.onUnavailable = onUnavailable
        return controller
    }

    func updateUIViewController(_ controller: QRScannerController, context: Context) {
        controller.onCode = onCode
        controller.onUnavailable = onUnavailable
        if context.coordinator.resumeToken != resumeToken {
            context.coordinator.resumeToken = resumeToken
            controller.resume()
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator(resumeToken: resumeToken) }

    static func dismantleUIViewController(_ controller: QRScannerController, coordinator: Coordinator) {
        controller.stop()
    }

    final class Coordinator {
        var resumeToken: Int
        init(resumeToken: Int) { self.resumeToken = resumeToken }
    }
}

final class QRScannerController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    var onCode: ((String) -> Void)?
    var onUnavailable: (() -> Void)?

    private let session = AVCaptureSession()
    private let sessionQueue = DispatchQueue(label: "dev.kindred.pairing.camera")
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private var rotation: AVCaptureDevice.RotationCoordinator?
    private var rotationObservation: NSKeyValueObservation?
    private var delivered = false
    private var configured = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back)
                ?? AVCaptureDevice.default(for: .video),
              let input = try? AVCaptureDeviceInput(device: device) else {
            DispatchQueue.main.async { [weak self] in self?.onUnavailable?() }
            return
        }
        let output = AVCaptureMetadataOutput()
        session.beginConfiguration()
        guard session.canAddInput(input), session.canAddOutput(output) else {
            session.commitConfiguration()
            DispatchQueue.main.async { [weak self] in self?.onUnavailable?() }
            return
        }
        session.addInput(input)
        session.addOutput(output)
        output.setMetadataObjectsDelegate(self, queue: .main)
        output.metadataObjectTypes = output.availableMetadataObjectTypes.contains(.qr) ? [.qr] : []
        session.commitConfiguration()

        let layer = AVCaptureVideoPreviewLayer(session: session)
        layer.videoGravity = .resizeAspectFill
        view.layer.addSublayer(layer)
        previewLayer = layer
        let coordinator = AVCaptureDevice.RotationCoordinator(device: device, previewLayer: layer)
        rotation = coordinator
        rotationObservation = coordinator.observe(\.videoRotationAngleForHorizonLevelPreview, options: [.initial, .new]) { [weak self] coordinator, _ in
            let angle = coordinator.videoRotationAngleForHorizonLevelPreview
            DispatchQueue.main.async { self?.previewLayer?.connection?.videoRotationAngle = angle }
        }
        configured = true
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer?.frame = view.bounds
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        start()
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        stop()
    }

    private func start() {
        guard configured else { return }
        let session = self.session
        sessionQueue.async { if !session.isRunning { session.startRunning() } }
    }

    func stop() {
        let session = self.session
        sessionQueue.async { if session.isRunning { session.stopRunning() } }
    }

    func resume() {
        delivered = false
        start()
    }

    nonisolated func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject],
                                    from connection: AVCaptureConnection) {
        // Delivered on the main queue (see `setMetadataObjectsDelegate`).
        MainActor.assumeIsolated {
            guard !delivered,
                  let code = metadataObjects.lazy.compactMap({ $0 as? AVMetadataMachineReadableCodeObject })
                    .first(where: { $0.type == .qr })?.stringValue,
                  !code.isEmpty else { return }
            delivered = true
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            onCode?(code)
        }
    }
}

enum CameraAccess {
    case allowed
    case denied
    case unavailable

    @MainActor
    static func request() async -> CameraAccess {
        guard UIImagePickerController.isSourceTypeAvailable(.camera) else { return .unavailable }
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: return .allowed
        case .notDetermined: return await AVCaptureDevice.requestAccess(for: .video) ? .allowed : .denied
        default: return .denied
        }
    }
}
