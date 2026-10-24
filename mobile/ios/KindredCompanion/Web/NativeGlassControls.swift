import UIKit
import WebKit

@MainActor
private final class GlassChromeButton: UIButton {
    let avatar = UIImageView()
    let name = UILabel()
    var identity = false
    var imageInset: CGFloat = 8
    var imageGap: CGFloat = 8
    var titleFrame: CGRect?
    var avatarCenter: CGPoint?
    override init(frame: CGRect) {
        super.init(frame: frame)
        avatar.isUserInteractionEnabled = false; name.isUserInteractionEnabled = false
        avatar.isAccessibilityElement = false; name.isAccessibilityElement = false
        avatar.contentMode = .scaleAspectFit; name.lineBreakMode = .byTruncatingTail
        name.textColor = .label
        addSubview(avatar); addSubview(name)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is unavailable") }
    override func layoutSubviews() {
        super.layoutSubviews()
        // Follow the retained pill's actual content slots. Its compact layout
        // does not reserve space for a permanently visible trailing chevron.
        // Keep the artwork fixed in size while its slot moves during a morph.
        let center = avatarCenter ?? CGPoint(x: imageInset+15, y: bounds.midY)
        avatar.frame = CGRect(x: center.x-15,y: center.y-15,width:30,height:30)
        let leading = imageInset+30+imageGap
        name.frame = titleFrame ?? CGRect(x: leading,y: 0,width:max(0,bounds.width-leading-imageInset),height:bounds.height)
    }
    override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
        bounds.insetBy(dx: -max(0,44-bounds.width)/2,dy: -max(0,44-bounds.height)/2).contains(point)
    }
}

/// Only floating chrome is lifted above WebKit. The retained page still owns
/// layout, navigation and each action; message and form content stays in place.
struct NativeGlassControl {
    static let identifiers: Set<String> = ["identity", "latest", "accounts", "search", "new", "library", "chats", "computer", "bot-settings", "artifact-back", "artifact-chats", "artifact-search", "artifact-new"]
    let id: String
    let frame: CGRect
    let title: String
    let label: String
    let symbol: String
    let shape: String?
    let color: String
    let fontSize: CGFloat
    let opacity: CGFloat
    let titleOpacity: CGFloat
    let interactive: Bool
    let imageInset: CGFloat
    let imageGap: CGFloat
    let titleFrame: CGRect?
    let avatarCenter: CGPoint?

    init?(_ body: [String: Any]) {
        guard let id = body["id"] as? String, Self.identifiers.contains(id),
              let values = body["rect"] as? [Double], values.count == 4,
              values.allSatisfy(\.isFinite), abs(values[0]) <= 20000, abs(values[1]) <= 20000,
              values[2] >= 1, values[2] <= 800,
              values[3] >= 1, values[3] <= 120,
              let title = body["title"] as? String, title.count <= 160,
              let label = body["label"] as? String, !label.isEmpty, label.count <= 200,
              let symbol = body["symbol"] as? String, symbol.count <= 64,
              let fontSize = body["fontSize"] as? Double, fontSize.isFinite, (10...48).contains(fontSize),
              let opacity = body["opacity"] as? Double, opacity.isFinite, (0...1).contains(opacity),
              let titleOpacity = body["titleOpacity"] as? Double, titleOpacity.isFinite, (0...1).contains(titleOpacity)
        else { return nil }
        self.id = id; frame = CGRect(x: values[0], y: values[1], width: values[2], height: values[3])
        self.title = title; self.label = label; self.symbol = symbol
        shape = (body["shape"] as? String).flatMap { BotToolbarAvatar.supports(shape: $0) ? $0 : nil }
        color = (body["color"] as? String).flatMap { $0.range(of: "^#[0-9a-fA-F]{6}$", options: .regularExpression) != nil ? $0 : nil } ?? "#2475ff"
        self.fontSize = fontSize; self.opacity = opacity; self.titleOpacity = titleOpacity
        interactive = body["interactive"] as? Bool != false
        func spacing(_ key: String) -> CGFloat {
            guard let value = body[key] as? Double, value.isFinite, (0...40).contains(value) else { return 8 }
            return value
        }
        imageInset = spacing("imageInset"); imageGap = spacing("imageGap")
        if let value = body["titleRect"] {
            guard let rect = value as? [Double], rect.count == 4, rect.allSatisfy(\.isFinite),
                  abs(rect[0]) <= 800, abs(rect[1]) <= 120,
                  (0...800).contains(rect[2]), (0...120).contains(rect[3]) else { return nil }
            titleFrame = CGRect(x:rect[0],y:rect[1],width:rect[2],height:rect[3])
        } else { titleFrame = nil }
        if let value = body["avatarCenter"] {
            guard let center = value as? [Double], center.count == 2, center.allSatisfy(\.isFinite),
                  abs(center[0]) <= 800, abs(center[1]) <= 120 else { return nil }
            avatarCenter = CGPoint(x:center[0],y:center[1])
        } else { avatarCenter = nil }
    }
}

@MainActor
final class NativeGlassControls: UIView {
    private var buttons: [String: UIButton] = [:]
    private var contentKeys: [String: [String]] = [:]
    private var opacities: [String: CGFloat] = [:]
    private var ready: Set<String> = []
    private(set) var document: String?
    var activate: ((String, String) -> Void)?

    override func layoutSubviews() {
        super.layoutSubviews()
        // A retained page can publish its chrome before SwiftUI attaches this
        // host at its final size. Reveal it once the host gains real bounds.
        for button in buttons.values { button.isHidden = !button.frame.intersects(bounds) }
    }

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        let hit = super.hitTest(point, with: event)
        return hit === self ? nil : hit
    }

    func reset() {
        document = nil
        buttons.values.forEach { $0.removeFromSuperview() }; buttons.removeAll()
        contentKeys.removeAll(); opacities.removeAll(); ready.removeAll()
    }

    func reveal(document: String) {
        guard self.document == document else { return }
        ready = Set(buttons.keys)
        for (id,button) in buttons { button.alpha = opacities[id] ?? 0 }
    }

    /// Invalid or oversized messages never replace the existing action set.
    func update(_ body: [String: Any], in webView: WKWebView) -> [String]? {
        guard #available(iOS 26.0, *), let document = body["document"] as? String,
              UUID(uuidString: document) != nil,
              let rows = body["controls"] as? [[String: Any]], rows.count <= 20 else { return nil }
        let controls = rows.compactMap(NativeGlassControl.init)
        guard controls.count == rows.count, Set(controls.map(\.id)).count == controls.count else { return nil }
        if self.document != document { reset(); self.document = document }
        let ids = Set(controls.map(\.id))
        for id in Set(buttons.keys).subtracting(ids) {
            buttons.removeValue(forKey: id)?.removeFromSuperview(); contentKeys[id] = nil; opacities[id] = nil; ready.remove(id)
        }
        for item in controls {
            let button: UIButton
            if let existing = buttons[item.id] { button = existing }
            else {
                button = GlassChromeButton(type: .system)
                button.accessibilityIdentifier = "kindred-glass-" + item.id
                button.addAction(UIAction { [weak self, weak button] _ in
                    guard let self, self.document == document, self.buttons[item.id] === button else { return }
                    self.activate?(item.id, document)
                }, for: .primaryActionTriggered)
                buttons[item.id] = button; addSubview(button)
            }
            let key = [item.title,item.symbol,item.shape ?? "",item.color,String(Double(item.fontSize))]
            if contentKeys[item.id] != key {
                var configuration = UIButton.Configuration.glass()
                configuration.cornerStyle = .capsule
                configuration.baseForegroundColor = .label
                configuration.contentInsets = NSDirectionalEdgeInsets(top: 4, leading: item.id == "identity" ? 8 : 10, bottom: 4, trailing: 10)
                configuration.titleLineBreakMode = .byTruncatingTail
                configuration.imagePadding = 7
                if let shape = item.shape {
                    let image = BotToolbarAvatar(shape: shape, color: item.color).image(scale: traitCollection.displayScale)
                    if let button = button as? GlassChromeButton, item.id == "identity" { button.avatar.image = image }
                    else { configuration.image = image }
                } else {
                    configuration.image = UIImage(systemName: item.symbol, withConfiguration: UIImage.SymbolConfiguration(pointSize: item.title.isEmpty ? 20 : 15, weight: .regular))
                }
                var title = AttributedString(item.title)
                title.font = .systemFont(ofSize: item.fontSize, weight: item.id == "identity" ? .semibold : .regular)
                configuration.attributedTitle = item.id == "identity" ? AttributedString("") : title
                button.configuration = configuration
                if let button = button as? GlassChromeButton {
                    button.name.text = item.title
                    button.name.font = .systemFont(ofSize: item.fontSize, weight: .semibold)
                }
                contentKeys[item.id] = key
            }
            button.accessibilityLabel = item.label
            button.isAccessibilityElement = item.interactive
            button.accessibilityElementsHidden = !item.interactive
            button.isUserInteractionEnabled = item.interactive
            opacities[item.id] = item.opacity
            button.alpha = ready.contains(item.id) ? item.opacity : 0
            button.frame = convert(item.frame, from: webView)
            button.isHidden = !button.frame.intersects(bounds)
            if let button = button as? GlassChromeButton {
                button.identity = item.id == "identity"
                button.imageInset = item.imageInset; button.imageGap = item.imageGap
                button.titleFrame = item.titleFrame; button.avatarCenter = item.avatarCenter
                button.avatar.isHidden = !button.identity; button.name.isHidden = !button.identity
                button.name.alpha = item.titleOpacity
                button.setNeedsLayout()
            }
            button.layoutIfNeeded()
            button.titleLabel?.alpha = item.titleOpacity
        }
        return controls.map(\.id)
    }
}
