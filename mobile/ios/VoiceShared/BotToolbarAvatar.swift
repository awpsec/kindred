import SwiftUI
import UIKit

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
