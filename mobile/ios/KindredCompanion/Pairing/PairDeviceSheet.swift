import KindredCore
import SwiftUI

/// Pair this phone with the account signed in to Kindred on a computer:
/// scan (or paste) the one-time link, confirm the server it names, then claim.
/// No password is asked for and nothing is sent until the person confirms.
@MainActor
struct PairDeviceSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    let request: PairingRequest

    private enum Stage: Equatable {
        case scan
        case paste
        case confirm(PairingLink)
        case connecting(PairingLink)
        case failed(PairingLink?, PairingFailure)
    }

    /// A broken link and a failed claim share one failure screen.
    enum PairingFailure: Equatable {
        case link(PairingLinkError)
        case claim(PairingError)

        var title: String {
            switch self {
            case .link(.loopbackServer): return "This code can't reach your phone"
            case .link: return "This pairing code can't be used"
            case .claim(let error): return error.title
            }
        }

        var message: String {
            switch self {
            case .link(let error): return error.localizedDescription
            case .claim(let error): return error.localizedDescription
            }
        }

        var symbol: String {
            switch self {
            case .link(.loopbackServer), .claim(.unreachable), .claim(.claimUnconfirmed): return "wifi.exclamationmark"
            case .claim(.codeRejected), .link(.invalidCode): return "clock.badge.xmark"
            case .claim(.redirected), .claim(.accountMismatch), .claim(.notKindredServer), .link(.insecureServer):
                return "lock.trianglebadge.exclamationmark"
            default: return "exclamationmark.triangle"
            }
        }
    }

    @State private var stage: Stage = .scan
    @State private var camera: CameraAccess?
    @State private var pasted = ""
    @State private var pasteError: String?
    @State private var scanHint: String?
    @State private var resumeToken = 0
    @State private var prepared = false

    var body: some View {
        NavigationStack {
            content
                .navigationTitle(title)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { dismiss() }
                            .disabled(isConnecting)
                    }
                }
                .toolbarBackground(isScanning ? .hidden : .automatic, for: .navigationBar)
                .toolbarColorScheme(isScanning ? .dark : nil, for: .navigationBar)
                .animation(.snappy, value: stage)
        }
        .interactiveDismissDisabled(isConnecting)
        .onAppear(perform: prepare)
    }

    private var isScanning: Bool { stage == .scan && camera == .allowed }

    private func retryAction(_ link: PairingLink?, _ failure: PairingFailure) -> (() -> Void)? {
        guard let link, failure.allowsRetry else { return nil }
        return { connect(link) }
    }

    private var isConnecting: Bool {
        if case .connecting = stage { return true }
        return false
    }

    private var title: String {
        switch stage {
        case .scan: return "Scan Pairing Code"
        case .paste: return "Paste Pairing Link"
        case .confirm, .connecting: return "Connect Server"
        case .failed: return "Pairing"
        }
    }

    @ViewBuilder
    private var content: some View {
        switch stage {
        case .scan: scanStage
        case .paste: pasteStage
        case .confirm(let link): ConfirmServerView(link: link, connect: { connect(link) }, cancel: { dismiss() })
        case .connecting(let link): ConnectingView(origin: link.origin)
        case .failed(let link, let failure):
            PairingFailureView(failure: failure, origin: link?.origin,
                               retry: retryAction(link, failure),
                               scanAgain: restartScan, signInInstead: signInInstead)
        }
    }

    // MARK: Scan

    @ViewBuilder
    private var scanStage: some View {
        switch camera {
        case nil:
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        case .allowed?:
            ZStack {
                QRScannerView(onCode: received, onUnavailable: { camera = .unavailable }, resumeToken: resumeToken)
                    .ignoresSafeArea()
                ViewfinderOverlay()
                    .ignoresSafeArea()
                    .accessibilityHidden(true)
                VStack(spacing: 14) {
                    Spacer()
                    if let scanHint {
                        Label(scanHint, systemImage: "qrcode")
                            .font(.footnote.weight(.medium))
                            .padding(.horizontal, 14).padding(.vertical, 9)
                            .background(.ultraThinMaterial, in: Capsule())
                            .transition(.opacity.combined(with: .move(edge: .bottom)))
                    }
                    Text("Scan the pairing code shown in Kindred on your computer.")
                        .font(.callout.weight(.medium))
                        .multilineTextAlignment(.center)
                        .foregroundStyle(.white)
                        .shadow(color: .black.opacity(0.4), radius: 6)
                        .padding(.horizontal, 32)
                    Button {
                        stage = .paste
                    } label: {
                        Label("Paste Pairing Link", systemImage: "doc.on.clipboard")
                            .font(.body.weight(.semibold))
                            .padding(.horizontal, 6).padding(.vertical, 4)
                    }
                    .buttonStyle(.bordered)
                    .tint(.white)
                    .padding(.bottom, 28)
                }
                .animation(.snappy, value: scanHint)
            }
        case .denied?, .unavailable?:
            CameraUnavailableView(denied: camera == .denied,
                                  openSettings: { if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) } },
                                  paste: { stage = .paste })
        }
    }

    private func received(_ raw: String) {
        do {
            stage = .confirm(try PairingLink.parse(raw))
            scanHint = nil
        } catch let error as PairingLinkError where PairingLink.looksLikePairingLink(raw) {
            stage = .failed(nil, .link(error))
        } catch {
            // Someone else's QR code: say so briefly and keep scanning.
            scanHint = "That isn't a Kindred pairing code."
            Task { @MainActor in
                try? await Task.sleep(for: .seconds(1.2))
                resumeToken += 1
                try? await Task.sleep(for: .seconds(2))
                if scanHint != nil { scanHint = nil }
            }
        }
    }

    // MARK: Paste

    private var pasteStage: some View {
        Form {
            Section {
                TextField("kindred://pair?…", text: $pasted, axis: .vertical)
                    .font(.callout.monospaced())
                    .lineLimit(3...6)
                    .keyboardType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .onSubmit(submitPaste)
                PasteButton(payloadType: String.self) { values in
                    guard let value = values.first else { return }
                    Task { @MainActor in
                        pasted = value
                        submitPaste()
                    }
                }
                .labelStyle(.titleAndIcon)
            } header: {
                Text("Pairing link")
            } footer: {
                Text("In Kindred on your computer, choose to copy the pairing link instead of scanning. A link works once and expires after a few minutes.")
            }
            if let pasteError {
                Section {
                    Label(pasteError, systemImage: "exclamationmark.triangle.fill")
                        .font(.footnote)
                        .foregroundStyle(.red)
                }
            }
            Section {
                Button(action: submitPaste) {
                    Text("Continue").fontWeight(.semibold).frame(maxWidth: .infinity)
                }
                .disabled(pasted.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                if camera != .unavailable {
                    Button("Scan Instead") { restartScan() }
                        .frame(maxWidth: .infinity)
                }
            }
        }
    }

    private func submitPaste() {
        do {
            stage = .confirm(try PairingLink.parse(pasted))
            pasteError = nil
            pasted = ""
        } catch {
            pasteError = error.localizedDescription
        }
    }

    // MARK: Claim

    private func connect(_ link: PairingLink) {
        guard !isConnecting else { return }
        stage = .connecting(link)
        Task { @MainActor in
            do {
                let id = try await model.pair(with: link)
                let added = model.account(id)
                model.sheet = nil
                dismiss()
                if let added {
                    model.show("Connected \(added.title) on \(added.origin.displayName).")
                }
            } catch {
                stage = .failed(link, .claim(PairingError.from(error)))
            }
        }
    }

    /// Back to the scanner. Camera permission is asked for only when the
    /// scanner is opened, never for a link that arrived from outside.
    private func restartScan() {
        scanHint = nil
        pasteError = nil
        stage = .scan
        resumeToken += 1
        requestCameraIfNeeded()
    }

    private func requestCameraIfNeeded() {
        guard camera == nil else { return }
        Task { @MainActor in
            camera = await CameraAccess.request()
        }
    }

    private func signInInstead(_ origin: ServerOrigin?) {
        model.sheet = .addAccount(AccountPrefill(origin: origin))
        dismiss()
    }

    private func prepare() {
        guard !prepared else { return }
        prepared = true
        if let raw = request.link {
            do {
                stage = .confirm(try PairingLink.parse(raw))
            } catch let error as PairingLinkError {
                stage = .failed(nil, .link(error))
            } catch {
                stage = .failed(nil, .link(.notPairingLink))
            }
        } else {
            requestCameraIfNeeded()
        }
    }
}

private extension PairDeviceSheet.PairingFailure {
    var allowsRetry: Bool {
        if case .claim(let error) = self { return error.allowsManualRetry }
        return false
    }
    var showsConnectionHelp: Bool {
        switch self {
        case .claim(let error): return error.showsConnectionHelp
        case .link(.loopbackServer): return true
        case .link: return false
        }
    }
    var connectionDetail: String? {
        switch self {
        case .claim(.unreachable(let detail)), .claim(.claimUnconfirmed(let detail)): return detail
        default: return nil
        }
    }
    var offersPasswordSignIn: Bool {
        if case .claim(.unsupported) = self { return true }
        return false
    }
}

// MARK: - Pieces

/// Dimmed surround with a clear rounded window and accent corner marks.
private struct ViewfinderOverlay: View {
    var body: some View {
        GeometryReader { proxy in
            let side = min(proxy.size.width, proxy.size.height) * 0.66
            let rect = CGRect(x: (proxy.size.width - side) / 2, y: (proxy.size.height - side) / 2 - 40, width: side, height: side)
            ZStack {
                Path { path in
                    path.addRect(CGRect(origin: .zero, size: proxy.size))
                    path.addRoundedRect(in: rect, cornerSize: CGSize(width: 28, height: 28), style: .continuous)
                }
                .fill(Color.black.opacity(0.5), style: FillStyle(eoFill: true))
                ViewfinderCorners()
                    .stroke(Theme.accent, style: StrokeStyle(lineWidth: 5, lineCap: .round))
                    .frame(width: rect.width, height: rect.height)
                    .position(x: rect.midX, y: rect.midY)
            }
        }
    }
}

private struct ViewfinderCorners: Shape {
    func path(in rect: CGRect) -> Path {
        let arm = rect.width * 0.16
        let r: CGFloat = 28
        var path = Path()
        // Top-left, top-right, bottom-right, bottom-left.
        path.move(to: CGPoint(x: rect.minX, y: rect.minY + r + arm))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.minY + r))
        path.addQuadCurve(to: CGPoint(x: rect.minX + r, y: rect.minY), control: CGPoint(x: rect.minX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.minX + r + arm, y: rect.minY))
        path.move(to: CGPoint(x: rect.maxX - r - arm, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX - r, y: rect.minY))
        path.addQuadCurve(to: CGPoint(x: rect.maxX, y: rect.minY + r), control: CGPoint(x: rect.maxX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY + r + arm))
        path.move(to: CGPoint(x: rect.maxX, y: rect.maxY - r - arm))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - r))
        path.addQuadCurve(to: CGPoint(x: rect.maxX - r, y: rect.maxY), control: CGPoint(x: rect.maxX, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.maxX - r - arm, y: rect.maxY))
        path.move(to: CGPoint(x: rect.minX + r + arm, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.minX + r, y: rect.maxY))
        path.addQuadCurve(to: CGPoint(x: rect.minX, y: rect.maxY - r), control: CGPoint(x: rect.minX, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY - r - arm))
        return path
    }
}

private struct CameraUnavailableView: View {
    let denied: Bool
    let openSettings: () -> Void
    let paste: () -> Void

    var body: some View {
        ContentUnavailableView {
            Label(denied ? "Camera Access Is Off" : "No Camera Available", systemImage: "camera.badge.ellipsis")
        } description: {
            Text(denied
                 ? "Allow camera access in Settings, or paste the pairing link."
                 : "Paste the pairing link copied from Kindred on your computer.")
        } actions: {
            Button("Paste Pairing Link", action: paste)
                .buttonStyle(.borderedProminent)
            if denied {
                Button("Open Settings", action: openSettings)
            }
        }
    }
}

private struct ServerBadge: View {
    let symbol: String
    var tint: Color = Theme.accent

    var body: some View {
        Image(systemName: symbol)
            .font(.system(size: 30, weight: .semibold))
            .foregroundStyle(tint)
            .frame(width: 72, height: 72)
            .background(tint.opacity(0.14), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .accessibilityHidden(true)
    }
}

private struct ConfirmServerView: View {
    let link: PairingLink
    let connect: () -> Void
    let cancel: () -> Void

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                ServerBadge(symbol: "server.rack")
                    .padding(.top, 28)
                Text("Connect to this server?")
                    .font(.title2.weight(.semibold))
                Text(link.origin.displayName)
                    .font(.title3.monospaced().weight(.medium))
                    .multilineTextAlignment(.center)
                    .textSelection(.enabled)
                    .padding(.horizontal, 14).padding(.vertical, 10)
                    .frame(maxWidth: .infinity)
                    .background(Theme.chrome, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .accessibilityLabel("Server \(link.origin.displayName)")
                Text("Make sure this matches the address on your computer.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                HStack(spacing: 12) {
                    Button(action: cancel) {
                        Text("Cancel").frame(maxWidth: .infinity).padding(.vertical, 4)
                    }
                    .buttonStyle(.bordered)
                    Button(action: connect) {
                        Text("Connect").font(.body.weight(.semibold)).frame(maxWidth: .infinity).padding(.vertical, 4)
                    }
                    .buttonStyle(.borderedProminent)
                }
                .controlSize(.large)
                .padding(.top, 6)
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 24)
            .frame(maxWidth: 520)
            .frame(maxWidth: .infinity)
        }
        .background(Theme.canvas)
    }
}

private struct ConnectingView: View {
    let origin: ServerOrigin

    var body: some View {
        VStack(spacing: 18) {
            Spacer()
            ProgressView().controlSize(.large)
            Text("Connecting to \(origin.displayName)…")
                .font(.callout)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Spacer()
            Spacer()
        }
        .padding(32)
        .frame(maxWidth: .infinity)
        .background(Theme.canvas)
        .accessibilityElement(children: .combine)
    }
}

private struct PairingFailureView: View {
    let failure: PairDeviceSheet.PairingFailure
    let origin: ServerOrigin?
    let retry: (() -> Void)?
    let scanAgain: () -> Void
    let signInInstead: (ServerOrigin?) -> Void
    @State private var helpExpanded = false

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                ServerBadge(symbol: failure.symbol, tint: .orange)
                    .padding(.top, 28)
                VStack(spacing: 8) {
                    Text(failure.title)
                        .font(.title3.weight(.semibold))
                        .multilineTextAlignment(.center)
                    if let origin {
                        Text(origin.displayName)
                            .font(.callout.monospaced())
                            .foregroundStyle(.secondary)
                    }
                    Text(failure.message)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if failure.showsConnectionHelp {
                    DisclosureGroup(isExpanded: $helpExpanded) {
                        VStack(alignment: .leading, spacing: 12) {
                            ForEach(Array(PairingError.connectionChecklist.enumerated()), id: \.offset) { index, step in
                                HStack(alignment: .firstTextBaseline, spacing: 10) {
                                    Text("\(index + 1)")
                                        .font(.caption.weight(.bold))
                                        .foregroundStyle(Theme.avatarInk)
                                        .frame(width: 20, height: 20)
                                        .background(Theme.accentGradient, in: Circle())
                                        .accessibilityHidden(true)
                                    Text(step)
                                        .font(.subheadline)
                                        .fixedSize(horizontal: false, vertical: true)
                                }
                            }
                            if let detail = failure.connectionDetail {
                                Text(detail)
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                                    .padding(.top, 2)
                            }
                        }
                        .padding(.top, 10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    } label: {
                        Label("Help", systemImage: "questionmark.circle")
                            .font(.subheadline.weight(.semibold))
                    }
                    .padding(16)
                    .background(Theme.chrome, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                VStack(spacing: 10) {
                    if let retry {
                        Button(action: retry) {
                            Text("Try Again").font(.body.weight(.semibold)).frame(maxWidth: .infinity).padding(.vertical, 4)
                        }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.large)
                    }
                    Button(action: scanAgain) {
                        Text(retry == nil ? "Scan a New Code" : "Scan Again")
                            .frame(maxWidth: .infinity).padding(.vertical, 4)
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.large)
                    if failure.offersPasswordSignIn {
                        Button("Sign In with Password") { signInInstead(origin) }
                    }
                }
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 24)
            .frame(maxWidth: 520)
            .frame(maxWidth: .infinity)
        }
        .background(Theme.canvas)
    }
}
