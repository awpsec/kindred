import KindredCore
import SwiftUI
import UIKit
import XCTest
@testable import Kindred

/// Resolves the compiled catalog and renders production views on Apple SDKs.
/// Home Screen tint selection and the physical Duo remain separate acceptance.
@MainActor
final class BrandIdentityTests: XCTestCase {
    func testCompiledMarkKeepsOriginalColorsInBothAppearances() throws {
        var appearances: [Data] = []
        for style in [UIUserInterfaceStyle.light, .dark] {
            let traits = UITraitCollection(userInterfaceStyle: style)
            let image = try XCTUnwrap(UIImage(named: "KindredMark", in: .main, compatibleWith: traits))
            XCTAssertEqual(image.renderingMode, .alwaysOriginal)
            try assertTeamColors(image)
            appearances.append(try XCTUnwrap(image.pngData()))
            attach(image, name: "compiled-mark-\(style == .dark ? "dark" : "light")")
        }
        XCTAssertNotEqual(appearances[0], appearances[1], "The native catalog must resolve separate light and dark artwork")
    }

    func testWelcomeKeepsApprovedArtworkAcrossPhoneAndDuoThemes() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: folder) }
        let model = AppModel(secrets: InMemorySecretStore(),
            repository: AccountRepository(fileURL: folder.appendingPathComponent("accounts.json")))
        for dark in [false, true] {
            for size in [CGSize(width: 382, height: 650), CGSize(width: 867, height: 645), CGSize(width: 594, height: 466)] {
                let content = WelcomeView().environment(model)
                    .environment(\.colorScheme, dark ? .dark : .light)
                    .environment(\.accessibilityReduceMotion, true)
                    .frame(width: size.width, height: size.height)
                    .background(dark ? Color.black : Color.white)
                let image = try XCTUnwrap(ImageRenderer(content: content).uiImage)
                XCTAssertEqual(image.size, size)
                try assertTeamColors(image)
                attach(image, name: "welcome-\(dark ? "dark" : "light")-\(Int(size.width))")
            }
        }
        XCTAssertTrue(model.accounts.isEmpty, "Appearance checks must not create an account")
    }

    private func assertTeamColors(_ image: UIImage) throws {
        let cg = try XCTUnwrap(image.cgImage)
        var pixels = [UInt8](repeating: 0, count: cg.width * cg.height * 4)
        let drawn = pixels.withUnsafeMutableBytes { buffer -> Bool in
            guard let context = CGContext(data: buffer.baseAddress, width: cg.width, height: cg.height,
                bitsPerComponent: 8, bytesPerRow: cg.width * 4, space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
            context.draw(cg, in: CGRect(x: 0, y: 0, width: cg.width, height: cg.height))
            return true
        }
        XCTAssertTrue(drawn)
        var colors = [0, 0, 0]
        for i in stride(from: 0, to: pixels.count, by: 4) {
            let r = Int(pixels[i]), g = Int(pixels[i + 1]), b = Int(pixels[i + 2])
            if b > 160 && b > r + 50 && b > g + 50 { colors[0] += 1 }
            if r > 180 && r > g + 70 && g > b + 20 { colors[1] += 1 }
            if g > 100 && g > r + 50 && b > r + 30 { colors[2] += 1 }
        }
        for (name, count) in zip(["square", "happy circle", "curious triangle"], colors) {
            XCTAssertGreaterThan(count, 35, "The original-color \(name) must render")
        }
    }

    private func attach(_ image: UIImage, name: String) {
        let attachment = XCTAttachment(image: image)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
