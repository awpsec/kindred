import AppKit
import Foundation

// Resolve the packaged application's Dock/Finder icon through AppKit. This
// does not change the system appearance or touch an installed user application.
guard CommandLine.arguments.count == 3 else { fatalError("Expected app path and output directory") }
let appPath = CommandLine.arguments[1]
let output = URL(fileURLWithPath: CommandLine.arguments[2], isDirectory: true)
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
_ = NSApplication.shared
var records: [[String: Any]] = []
for (name, appearanceName) in [("light", NSAppearance.Name.aqua), ("dark", NSAppearance.Name.darkAqua)] {
    let appearance = NSAppearance(named: appearanceName)!
    let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 256, pixelsHigh: 256,
        bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
        colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    appearance.performAsCurrentDrawingAppearance {
        let icon = NSWorkspace.shared.icon(forFile: appPath)
        icon.size = NSSize(width: 256, height: 256)
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
        icon.draw(in: NSRect(x: 0, y: 0, width: 256, height: 256), from: .zero, operation: .copy, fraction: 1)
        NSGraphicsContext.restoreGraphicsState()
    }
    var colors = [0, 0, 0]
    var palePixels = 0
    for y in 0..<256 {
        for x in 0..<256 {
            guard let color = bitmap.colorAt(x: x, y: y)?.usingColorSpace(.deviceRGB), color.alphaComponent > 0.9 else { continue }
            let r = color.redComponent * 255, g = color.greenComponent * 255, b = color.blueComponent * 255
            if b > 160 && b > r + 50 && b > g + 50 { colors[0] += 1 }
            if r > 180 && r > g + 70 && g > b + 20 { colors[1] += 1 }
            if g > 100 && g > r + 50 && b > r + 30 { colors[2] += 1 }
            if r > 180 && g > 180 && b > 180 { palePixels += 1 }
        }
    }
    precondition(colors.allSatisfy { $0 > 200 }, "AppKit did not resolve the approved three-color icon")
    precondition(palePixels > 15000, "The macOS app icon must retain its LIGHT canvas in both appearances")
    let filename = "macos-app-icon-\(name).png"
    try bitmap.representation(using: .png, properties: [:])!.write(to: output.appendingPathComponent(filename))
    records.append(["appearance": name, "teamColorPixels": colors, "lightCanvasPixels": palePixels, "image": filename])
}
let proof: [String: Any] = ["passed": true, "source": "NSWorkspace application icon rendered by AppKit",
    "systemAppearanceChanged": false, "installedUserAppChanged": false, "appearances": records]
try JSONSerialization.data(withJSONObject: proof, options: [.prettyPrinted, .sortedKeys])
    .write(to: output.appendingPathComponent("macos-brand.json"))
