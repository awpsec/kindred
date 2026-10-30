import KindredCore
import SwiftUI
import UIKit
import XCTest
@testable import Kindred

@MainActor
final class WebHostLifecycleTests: XCTestCase, WebSessionHost {
    func webSession(_ session: WebSession, didReceive message: SessionMessage) {}
    func webSessionRequestedAccounts(_ session: WebSession) {}
    func webSession(_ session: WebSession, show message: String, isError: Bool) {}
    func webSession(_ session: WebSession, didDownload file: URL) {}
    func testInactiveAndBackgroundScenesKeepContentUncovered() throws {
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        let origin = try ServerAddress.normalize("https://lifecycle-fixture.invalid")
        let session = WebSession(account: Account(origin: origin, login: "fixture"), token: "fixture-only", host: self)
        session.webView.stopLoading()
        let host = WebHostView()
        let controller = UIViewController()
        controller.view = host
        window.rootViewController = controller
        window.isHidden = false
        host.attach(session)
        host.layoutIfNeeded()
        let existing = window.subviews.map(ObjectIdentifier.init)
        defer { session.tearDown(); window.isHidden = true }
        for notification in [UIScene.willDeactivateNotification, UIScene.didEnterBackgroundNotification, UIScene.didActivateNotification] {
            NotificationCenter.default.post(name: notification, object: scene)
            XCTAssertEqual(window.subviews.map(ObjectIdentifier.init), existing, "The app switcher must capture content, without a window cover")
            XCTAssertTrue(session.webView.superview === host)
            XCTAssertEqual(session.webView.alpha, 1)
            XCTAssertFalse(session.webView.isHidden)
        }
    }

    func testDisplayReparentingRetainsWebViewAndNativeComposerWithoutAWindowCover() throws {
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let origin = try ServerAddress.normalize("https://lifecycle-fixture.invalid")
        let session = WebSession(account: Account(origin: origin, login: "fixture"), token: "fixture-only", host: self)
        session.webView.stopLoading()
        let original = session.webView
        let windows = [UIWindow(windowScene: scene), UIWindow(windowScene: scene)]
        defer { session.tearDown(); windows.forEach { $0.isHidden = true } }
        for window in windows {
            let controller = UIViewController(), host = WebHostView()
            controller.view = host
            window.rootViewController = controller
            window.isHidden = false
            host.attach(session)
            host.layoutIfNeeded()
            XCTAssertTrue(session.webView === original)
            XCTAssertTrue(original.superview === host)
            XCTAssertTrue(session.glassControls.superview === host)
            XCTAssertFalse(window.subviews.contains { $0 is UIVisualEffectView })
        }
    }

    func testLoadingAndRecoveryFitPhoneAndDuoInBothThemes() throws {
        for dark in [false, true] {
            for size in [CGSize(width: 382, height: 650), CGSize(width: 867, height: 645), CGSize(width: 594, height: 466)] {
                for failed in [false, true] {
                    let content = KindredLoadingView(canvas: dark ? .black : .white,
                        failure: failed ? "Your server didn’t respond. Check its connection and try again." : nil)
                        .environment(\.colorScheme, dark ? .dark : .light)
                        .frame(width: size.width, height: size.height)
                    let renderer = ImageRenderer(content: content)
                    let image = try XCTUnwrap(renderer.uiImage)
                    XCTAssertEqual(image.size, size)
                    let cg = try XCTUnwrap(image.cgImage)
                    let width = cg.width, height = cg.height
                    var pixels = [UInt8](repeating: 0, count: width * height * 4)
                    let painted = pixels.withUnsafeMutableBytes { buffer -> Bool in
                        guard let context = CGContext(data: buffer.baseAddress, width: width, height: height,
                            bitsPerComponent: 8, bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(),
                            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
                        context.draw(cg, in: CGRect(x: 0, y: 0, width: width, height: height))
                        return true
                    }
                    XCTAssertTrue(painted)
                    let accentPixels = stride(from: 0, to: pixels.count, by: 4).filter {
                        pixels[$0] > 180 && pixels[$0+1] > 75 && Double(pixels[$0]) > Double(pixels[$0+2]) * 1.4
                    }.count
                    XCTAssertGreaterThan(accentPixels, 100, "The loading mark must actually render, not just an empty canvas")
                    let attachment = XCTAttachment(image: image)
                    attachment.name = "workspace-\(failed ? "recovery" : "loading")-\(dark ? "dark" : "light")-\(Int(size.width))"
                    attachment.lifetime = .keepAlways
                    add(attachment)
                }
            }
        }
    }
}
