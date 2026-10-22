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

// Generated geometry is bundled locally; no server-provided drawing code.
private struct ToolbarArtwork: Decodable {
    let body: [[[Double]]]
    let eyes: [[[Double]]]
    static let catalog: [String: ToolbarArtwork] = {
        guard let url = Bundle.main.url(forResource: "BotToolbarArtwork", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let value = try? JSONDecoder().decode([String: ToolbarArtwork].self, from: data) else { return [:] }
        return value
    }()
    static func path(_ loops: [[[Double]]]) -> Path {
        var path = Path()
        for loop in loops {
            guard let first = loop.first, first.count == 2 else { continue }
            path.move(to: CGPoint(x: first[0], y: first[1]))
            for point in loop.dropFirst() where point.count == 2 {
                path.addLine(to: CGPoint(x: point[0], y: point[1]))
            }
            path.closeSubpath()
        }
        return path
    }
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
    override func layoutSubviews() {
        super.layoutSubviews()
        guard let window else { return }
        let frame = convert(bounds, to: window)
        // Publish after UIKit's bar layout, never the detached label's local box.
        DispatchQueue.main.async { [weak self] in self?.frameChanged?(frame) }
    }
}

struct BotToolbarAvatar: View {
    let shape: String
    let color: String

    static func supports(shape: String) -> Bool { ToolbarArtwork.catalog[shape] != nil }

    var body: some View {
        let value = UInt32(color.dropFirst(), radix: 16) ?? 0x2475ff
        let red = Double((value >> 16) & 255) / 255
        let green = Double((value >> 8) & 255) / 255
        let blue = Double(value & 255) / 255
        let ink: Color = red * 0.2126 + green * 0.7152 + blue * 0.0722 < 0.08 ? .white : .black
        Canvas { context, size in
            let transform = CGAffineTransform(scaleX: size.width / 100, y: size.height / 100)
            context.fill(characterPath.applying(transform), with: .color(Color(red: red, green: green, blue: blue)))
            if let artwork = ToolbarArtwork.catalog[shape] {
                context.fill(ToolbarArtwork.path(artwork.eyes).applying(transform), with: .color(ink))
            } else {
                for x in [40.0, 60.0] {
                    let eye = Path(ellipseIn: CGRect(x: x, y: 44, width: 7, height: 10))
                    context.fill(eye.applying(transform), with: .color(ink))
                }
            }
        }
        .frame(width: 30, height: 30)
        .accessibilityHidden(true)
    }

    // A real image lets the system vertical bar use the avatar as an icon,
    // rather than converting a custom Canvas label into its text fallback.
    func image(scale: CGFloat) -> UIImage? {
        // Draw synchronously. ImageRenderer can reuse a retained Canvas's
        // previous silhouette while a toolbar item's identity stays the same.
        let format = UIGraphicsImageRendererFormat()
        format.scale = scale
        let value = UInt32(color.dropFirst(), radix: 16) ?? 0x2475ff
        let r = CGFloat((value >> 16) & 255) / 255, g = CGFloat((value >> 8) & 255) / 255, b = CGFloat(value & 255) / 255
        return UIGraphicsImageRenderer(size: CGSize(width: 30, height: 30), format: format).image { image in
            let context = image.cgContext
            context.scaleBy(x: 0.3, y: 0.3)
            context.addPath(characterPath.cgPath)
            context.setFillColor(UIColor(red: r, green: g, blue: b, alpha: 1).cgColor)
            context.fillPath()
            if let artwork = ToolbarArtwork.catalog[shape] {
                context.addPath(ToolbarArtwork.path(artwork.eyes).cgPath)
                context.setFillColor((r * 0.2126 + g * 0.7152 + b * 0.0722 < 0.08 ? UIColor.white : UIColor.black).cgColor)
                context.fillPath()
            }
        }.withRenderingMode(.alwaysOriginal)
    }

    private var characterPath: Path {
        if let artwork = ToolbarArtwork.catalog[shape] { return ToolbarArtwork.path(artwork.body) }
        return Path(ellipseIn: CGRect(x: 10, y: 10, width: 80, height: 80))
    }
}
