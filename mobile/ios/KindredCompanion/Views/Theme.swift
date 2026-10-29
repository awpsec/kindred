import KindredCore
import SwiftUI

/// Kindred's calm palette: neutral canvas and chrome with the apricot accent
/// from the app mark. Colors live in the asset catalog with light/dark variants.
enum Theme {
    static let accent = Color("AccentColor")
    static let canvas = Color("Canvas")
    static let chrome = Color("Chrome")
    // The pairing checklist keeps dark text on its light accent badges.
    static let avatarInk = Color(red: 0.16, green: 0.13, blue: 0.12)
    static let accentGradient = LinearGradient(
        colors: [Color(red: 1.0, green: 0.82, blue: 0.50), Color(red: 1.0, green: 0.69, blue: 0.36), Color(red: 0.95, green: 0.55, blue: 0.32)],
        startPoint: .topLeading, endPoint: .bottomTrailing)
}

@MainActor
struct AccountAvatar: View {
    let account: Account?
    var size: CGFloat = 32

    var body: some View {
        ZStack {
            Circle().fill(Color(uiColor: .tertiarySystemFill))
            if let account {
                Text(account.initial)
                    .font(.system(size: size * 0.44, weight: .semibold, design: .rounded))
                    .foregroundStyle(.primary)
            } else {
                Image(systemName: "person.fill")
                    .font(.system(size: size * 0.46, weight: .semibold))
                    .foregroundStyle(.primary)
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

@MainActor
struct BannerView: View {
    let banner: Banner
    let dismiss: () -> Void

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Image(systemName: banner.isError ? "exclamationmark.triangle.fill" : "info.circle.fill")
                .foregroundStyle(banner.isError ? Color.red : Theme.accent)
            Text(banner.message)
                .font(.footnote)
                .foregroundStyle(.primary)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 11)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Color.primary.opacity(0.08)))
        .shadow(color: .black.opacity(0.12), radius: 12, y: 4)
        .padding(.horizontal, 12)
        .onTapGesture(perform: dismiss)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
        .accessibilityHint("Dismiss")
    }
}

/// System share sheet for a finished download (Save to Files, AirDrop, …).
struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}

/// Native toolbar identity shares the web catalog's static neutral silhouettes.
@MainActor
struct ToolbarAvatarButton: UIViewRepresentable {
    let image: UIImage?
    let title: String
    let action: () -> Void
    let frameChanged: (CGRect) -> Void

    func makeUIView(context: Context) -> MeasuredAvatarButton {
        let button = MeasuredAvatarButton()
        var configuration = UIButton.Configuration.plain()
        configuration.contentInsets = .zero
        button.configuration = configuration
        button.accessibilityIdentifier = "kindred-bot-identity"
        button.addAction(UIAction { [weak button] _ in button?.activate?() }, for: .primaryActionTriggered)
        return button
    }

    func updateUIView(_ button: MeasuredAvatarButton, context: Context) {
        button.configuration?.image = image ?? UIImage(systemName: "person.crop.circle")
        button.accessibilityLabel = title
        button.activate = action
        button.frameChanged = frameChanged
        button.setNeedsLayout()
    }
}

@MainActor
final class MeasuredAvatarButton: UIButton {
    var activate: (() -> Void)?
    var frameChanged: ((CGRect) -> Void)?
    private var frameScheduled = false
    private func publishFrame() {
        guard !frameScheduled else { return }
        frameScheduled = true
        // A bar may lay out its label before attaching it to the window and
        // never lay it out again. Measure after both layout and attachment.
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.frameScheduled = false
            guard let window = self.window else { return }
            self.frameChanged?(self.convert(self.bounds, to: window))
        }
    }
    override func layoutSubviews() {
        super.layoutSubviews()
        publishFrame()
    }
    override func didMoveToWindow() {
        super.didMoveToWindow()
        publishFrame()
    }
}
