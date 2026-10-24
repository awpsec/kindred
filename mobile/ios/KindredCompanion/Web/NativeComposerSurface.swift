import UIKit
import WebKit

/// A background surface below WebKit, never above the editor's text or caret.
/// The page retains keyboard ownership, hit testing and its measured geometry.
@MainActor
final class NativeComposerSurface: UIView {
    struct Descriptor {
        let frame: CGRect
        let radius: CGFloat
        let opacity: CGFloat
        let dark: Bool

        init?(_ body: [String: Any]) {
            guard let rect = body["rect"] as? [Double], rect.count == 4,
                  rect.allSatisfy(\.isFinite), abs(rect[0]) <= 20000, abs(rect[1]) <= 20000,
                  (1...2400).contains(rect[2]), (1...640).contains(rect[3]),
                  let radius = body["radius"] as? Double, radius.isFinite, (0...64).contains(radius),
                  let opacity = body["opacity"] as? Double, opacity.isFinite, (0...1).contains(opacity),
                  let dark = body["dark"] as? Bool else { return nil }
            frame = CGRect(x: rect[0], y: rect[1], width: rect[2], height: rect[3])
            self.radius = radius; self.opacity = opacity; self.dark = dark
        }
    }

    private let material = UIVisualEffectView()
    private weak var webView: WKWebView?
    private var descriptor: Descriptor?
    private var desired: Descriptor?
    var isPrepared: Bool { descriptor != nil }

    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        isAccessibilityElement = false; accessibilityElementsHidden = true
        isHidden = true
        addSubview(material)
        if #available(iOS 26.0, *) {
            let glass = UIGlassEffect(style: .regular)
            // This is a shared input shell, not another bouncing button.
            glass.isInteractive = false
            material.effect = glass
        }
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is unavailable") }

    func prepare(_ next: Descriptor?, in webView: WKWebView) {
        self.webView = webView; desired = next
        // Keep the old surface through revocation until WebKit acknowledges
        // restoring its fallback background. No empty frame during handoff.
        if let next { descriptor = next; updateGeometry() }
    }

    func commit() {
        descriptor = desired
        updateGeometry()
    }

    func reset() {
        desired = nil; descriptor = nil; webView = nil; isHidden = true
    }

    func updateGeometry() {
        guard let descriptor, let webView, superview != nil else { isHidden = true; return }
        frame = superview!.convert(descriptor.frame, from: webView)
        overrideUserInterfaceStyle = descriptor.dark ? .dark : .light
        alpha = descriptor.opacity
        if #available(iOS 26.0, *) {
            material.cornerConfiguration = .corners(radius: .fixed(descriptor.radius))
        }
        isHidden = !frame.intersects(superview!.bounds)
        material.frame = bounds
    }
    override func layoutSubviews() { super.layoutSubviews(); material.frame = bounds }
}
