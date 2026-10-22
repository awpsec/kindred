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

/// Native toolbar identity uses the same original paths as the web characters.
struct BotToolbarAvatar: View {
    let shape: String
    let color: String

    var body: some View {
        let value = UInt32(color.dropFirst(), radix: 16) ?? 0x2475ff
        let red = Double((value >> 16) & 255) / 255
        let green = Double((value >> 8) & 255) / 255
        let blue = Double(value & 255) / 255
        let ink: Color = red * 0.2126 + green * 0.7152 + blue * 0.0722 < 0.08 ? .white : .black
        Canvas { context, size in
            let transform = CGAffineTransform(scaleX: size.width / 100, y: size.height / 100)
            context.fill(characterPath.applying(transform), with: .color(Color(red: red, green: green, blue: blue)))
            for x in [40.0, 60.0] {
                let eye = Path(ellipseIn: CGRect(x: x, y: 44, width: 7, height: 10))
                context.fill(eye.applying(transform), with: .color(ink))
            }
        }
        .frame(width: 30, height: 30)
        .accessibilityHidden(true)
    }

    // A real image lets the system vertical bar use the avatar as an icon,
    // rather than converting a custom Canvas label into its text fallback.
    func image(scale: CGFloat) -> UIImage? {
        let renderer = ImageRenderer(content: self)
        renderer.scale = scale
        return renderer.uiImage?.withRenderingMode(.alwaysOriginal)
    }

    private var characterPath: Path {
        var path = Path()
        switch shape {
        case "pebble":
            path.move(to: CGPoint(x: 54, y: 13))
            path.addCurve(to: CGPoint(x: 92, y: 50), control1: CGPoint(x: 76, y: 13), control2: CGPoint(x: 88, y: 30))
            path.addCurve(to: CGPoint(x: 58, y: 91), control1: CGPoint(x: 97, y: 73), control2: CGPoint(x: 80, y: 90))
            path.addCurve(to: CGPoint(x: 8, y: 58), control1: CGPoint(x: 37, y: 92), control2: CGPoint(x: 11, y: 78))
            path.addCurve(to: CGPoint(x: 54, y: 13), control1: CGPoint(x: 5, y: 38), control2: CGPoint(x: 30, y: 13))
            path.closeSubpath()
        case "square":
            path.move(to: CGPoint(x: 27, y: 13))
            path.addLine(to: CGPoint(x: 71, y: 11))
            path.addQuadCurve(to: CGPoint(x: 90, y: 29), control: CGPoint(x: 88, y: 11))
            path.addLine(to: CGPoint(x: 92, y: 69))
            path.addQuadCurve(to: CGPoint(x: 75, y: 90), control: CGPoint(x: 92, y: 88))
            path.addLine(to: CGPoint(x: 29, y: 92))
            path.addQuadCurve(to: CGPoint(x: 10, y: 75), control: CGPoint(x: 11, y: 92))
            path.addLine(to: CGPoint(x: 9, y: 32))
            path.addQuadCurve(to: CGPoint(x: 27, y: 13), control: CGPoint(x: 9, y: 15))
            path.closeSubpath()
        case "capsule":
            path.move(to: CGPoint(x: 31, y: 25))
            path.addLine(to: CGPoint(x: 69, y: 25))
            path.addCurve(to: CGPoint(x: 95, y: 51.5), control1: CGPoint(x: 85, y: 25), control2: CGPoint(x: 95, y: 36))
            path.addCurve(to: CGPoint(x: 69, y: 78), control1: CGPoint(x: 95, y: 67), control2: CGPoint(x: 85, y: 78))
            path.addLine(to: CGPoint(x: 31, y: 78))
            path.addCurve(to: CGPoint(x: 5, y: 51.5), control1: CGPoint(x: 15, y: 78), control2: CGPoint(x: 5, y: 67))
            path.addCurve(to: CGPoint(x: 31, y: 25), control1: CGPoint(x: 5, y: 36), control2: CGPoint(x: 15, y: 25))
            path.closeSubpath()
        case "triangle":
            path.move(to: CGPoint(x: 44, y: 13))
            path.addCurve(to: CGPoint(x: 56, y: 13), control1: CGPoint(x: 46.7, y: 8), control2: CGPoint(x: 53.3, y: 8))
            path.addLine(to: CGPoint(x: 90, y: 75))
            path.addCurve(to: CGPoint(x: 81, y: 92), control1: CGPoint(x: 94.5, y: 83.5), control2: CGPoint(x: 90.5, y: 92))
            path.addLine(to: CGPoint(x: 19, y: 92))
            path.addCurve(to: CGPoint(x: 10, y: 75), control1: CGPoint(x: 9.5, y: 92), control2: CGPoint(x: 5.5, y: 83.5))
            path.closeSubpath()
        case "hexagon":
            path.move(to: CGPoint(x: 43, y: 9))
            path.addQuadCurve(to: CGPoint(x: 57, y: 9), control: CGPoint(x: 50, y: 5))
            path.addLine(to: CGPoint(x: 82, y: 24))
            path.addQuadCurve(to: CGPoint(x: 89, y: 37), control: CGPoint(x: 89, y: 28))
            path.addLine(to: CGPoint(x: 89, y: 68))
            path.addQuadCurve(to: CGPoint(x: 82, y: 81), control: CGPoint(x: 89, y: 76))
            path.addLine(to: CGPoint(x: 57, y: 96))
            path.addQuadCurve(to: CGPoint(x: 43, y: 96), control: CGPoint(x: 50, y: 100))
            path.addLine(to: CGPoint(x: 18, y: 81))
            path.addQuadCurve(to: CGPoint(x: 11, y: 68), control: CGPoint(x: 11, y: 77))
            path.addLine(to: CGPoint(x: 11, y: 37))
            path.addQuadCurve(to: CGPoint(x: 18, y: 24), control: CGPoint(x: 11, y: 29))
            path.closeSubpath()
        case "cloud":
            path.move(to: CGPoint(x: 20, y: 41))
            path.addCurve(to: CGPoint(x: 39, y: 20), control1: CGPoint(x: 17, y: 27), control2: CGPoint(x: 27, y: 17))
            path.addCurve(to: CGPoint(x: 48, y: 26), control1: CGPoint(x: 43, y: 21), control2: CGPoint(x: 46, y: 23))
            path.addCurve(to: CGPoint(x: 77, y: 28), control1: CGPoint(x: 54, y: 15), control2: CGPoint(x: 71, y: 17))
            path.addCurve(to: CGPoint(x: 79, y: 40), control1: CGPoint(x: 79, y: 32), control2: CGPoint(x: 80, y: 36))
            path.addCurve(to: CGPoint(x: 94, y: 62), control1: CGPoint(x: 91, y: 41), control2: CGPoint(x: 97, y: 50))
            path.addCurve(to: CGPoint(x: 86, y: 73), control1: CGPoint(x: 93, y: 67), control2: CGPoint(x: 90, y: 71))
            path.addCurve(to: CGPoint(x: 65, y: 87), control1: CGPoint(x: 86, y: 84), control2: CGPoint(x: 76, y: 91))
            path.addCurve(to: CGPoint(x: 56, y: 81), control1: CGPoint(x: 61, y: 86), control2: CGPoint(x: 58, y: 84))
            path.addCurve(to: CGPoint(x: 24, y: 85), control1: CGPoint(x: 49, y: 92), control2: CGPoint(x: 33, y: 94))
            path.addCurve(to: CGPoint(x: 18, y: 77), control1: CGPoint(x: 21, y: 83), control2: CGPoint(x: 19, y: 80))
            path.addCurve(to: CGPoint(x: 6, y: 56), control1: CGPoint(x: 7, y: 76), control2: CGPoint(x: 2, y: 67))
            path.addCurve(to: CGPoint(x: 20, y: 41), control1: CGPoint(x: 9, y: 48), control2: CGPoint(x: 14, y: 43))
            path.closeSubpath()
        case "drop":
            path.move(to: CGPoint(x: 46, y: 7))
            path.addQuadCurve(to: CGPoint(x: 55, y: 9), control: CGPoint(x: 50, y: 2))
            path.addCurve(to: CGPoint(x: 87, y: 60), control1: CGPoint(x: 66, y: 23), control2: CGPoint(x: 86, y: 44))
            path.addCurve(to: CGPoint(x: 52, y: 96), control1: CGPoint(x: 90, y: 81), control2: CGPoint(x: 75, y: 96))
            path.addCurve(to: CGPoint(x: 16, y: 61), control1: CGPoint(x: 28, y: 96), control2: CGPoint(x: 13, y: 80))
            path.addCurve(to: CGPoint(x: 46, y: 7), control1: CGPoint(x: 18, y: 42), control2: CGPoint(x: 36, y: 23))
            path.closeSubpath()
        default:
            path.addEllipse(in: CGRect(x: 8, y: 10, width: 84, height: 84))
        }
        return path
    }
}
