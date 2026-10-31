import UIKit

/// The call remains owned by the retained page and NativeVoiceCall. This view
/// replaces only its floating foreground, on real system glass above WebKit.
@MainActor
final class NativeVoiceTray: UIView {
    struct Model {
        struct Item {
            let id: String, label: String
            let frame: CGRect
            let enabled: Bool
        }
        static let actions: Set<String> = ["settings", "mute", "end"]
        let key: String, shape: String, color: String, label: String, status: String
        let frame: CGRect, avatar: CGRect, activity: CGRect
        let opacity: CGFloat, font: CGFloat
        let dark: Bool, muted: Bool, showingStatus: Bool, interactive: Bool, reduceMotion: Bool
        let items: [Item]
        let input: [Double], output: [Double]

        init?(_ body: [String: Any]) {
            func rect(_ raw: Any?, outer: Bool = false) -> CGRect? {
                guard let a = raw as? [Double], a.count == 4, a.allSatisfy(\.isFinite),
                      abs(a[0]) <= (outer ? 20000 : 800), abs(a[1]) <= (outer ? 20000 : 220),
                      (0...800).contains(a[2]), (0...220).contains(a[3]) else { return nil }
                return CGRect(x: a[0], y: a[1], width: a[2], height: a[3])
            }
            guard let key = body["key"] as? String, UUID(uuidString: key) != nil,
                  let frame = rect(body["rect"], outer: true), frame.width > 0, frame.height > 0,
                  let avatar = rect(body["avatar"]), let activity = rect(body["activity"]),
                  let shape = body["shape"] as? String, BotToolbarAvatar.supports(shape: shape),
                  let color = body["color"] as? String, color.range(of: "^#[0-9a-fA-F]{6}$", options: .regularExpression) != nil,
                  let label = body["label"] as? String, label.count <= 200,
                  let status = body["status"] as? String, status.count <= 512,
                  let opacity = body["opacity"] as? Double, opacity.isFinite, (0...1).contains(opacity),
                  let font = body["font"] as? Double, font.isFinite, (10...48).contains(font),
                  let dark = body["dark"] as? Bool, let muted = body["muted"] as? Bool,
                  let showingStatus = body["showingStatus"] as? Bool, let interactive = body["interactive"] as? Bool,
                  let reduceMotion = body["reduceMotion"] as? Bool,
                  let rows = body["items"] as? [[String: Any]], rows.count == Self.actions.count,
                  let input = Self.levels(body["input"]), let output = Self.levels(body["output"]) else { return nil }
            var items: [Item] = []
            for row in rows {
                guard let id = row["id"] as? String, Self.actions.contains(id),
                      let label = row["label"] as? String, !label.isEmpty, label.count <= 200,
                      let box = rect(row["rect"]), box.width > 0, box.height > 0,
                      let enabled = row["enabled"] as? Bool else { return nil }
                items.append(Item(id: id, label: label, frame: box, enabled: enabled))
            }
            guard Set(items.map(\.id)) == Self.actions else { return nil }
            self.key = key; self.frame = frame; self.avatar = avatar; self.activity = activity
            self.shape = shape; self.color = color; self.label = label; self.status = status
            self.opacity = opacity; self.font = font; self.dark = dark; self.muted = muted
            self.showingStatus = showingStatus; self.interactive = interactive; self.items = items
            self.reduceMotion = reduceMotion
            self.input = input; self.output = output
        }

        static func levels(_ raw: Any?) -> [Double]? {
            guard let levels = raw as? [Double], levels.count <= 40,
                  levels.allSatisfy({ $0.isFinite && (0...1).contains($0) }) else { return nil }
            return levels
        }
    }

    private final class Wave: UIView {
        private let meterLayer = CAShapeLayer()
        var input: [Double] = [], output: [Double] = []
        var reduceMotion = false
        var color: UIColor = .label
        override init(frame: CGRect) {
            super.init(frame: frame); isUserInteractionEnabled = false
            isAccessibilityElement = true; accessibilityTraits = .updatesFrequently
            layer.addSublayer(meterLayer)
            NotificationCenter.default.addObserver(self, selector: #selector(motionPreferenceChanged),
                name: UIAccessibility.reduceMotionStatusDidChangeNotification, object: nil)
        }
        deinit { NotificationCenter.default.removeObserver(self) }
        required init?(coder: NSCoder) { fatalError("init(coder:) is unavailable") }
        @objc private func motionPreferenceChanged() { paint(animated: false) }
        override func layoutSubviews() { super.layoutSubviews(); paint(animated: false) }
        func paint(animated: Bool) {
            // These are simultaneous positions from the retained page's meter,
            // not time histories. One speaker owns the single stationary row.
            let hearing = input.contains { $0 > 0 }
            let levels = hearing ? input : output
            let quiet = !hearing && !levels.contains { $0 > 0.108 }
            let ink = color.withAlphaComponent(quiet ? 0.36 : hearing ? 0.62 : 1)
            let path = UIBezierPath(), bar = min(3, bounds.width / CGFloat(max(1, levels.count)))
            for (index, level) in levels.enumerated() {
                let x = levels.count < 2 ? bounds.midX : CGFloat(index) * max(0, bounds.width-bar) / CGFloat(levels.count-1)
                let h = min(28, bounds.height) * level
                path.append(UIBezierPath(roundedRect: CGRect(x: x, y: (bounds.height-h)/2, width: bar, height: h), cornerRadius: bar/2))
            }
            let previous = meterLayer.presentation()?.path ?? meterLayer.path
            meterLayer.removeAnimation(forKey: "meter")
            CATransaction.begin(); CATransaction.setDisableActions(true)
            meterLayer.frame = bounds; meterLayer.path = path.cgPath
            meterLayer.fillColor = ink.resolvedColor(with: traitCollection).cgColor
            CATransaction.commit()
            if animated, !reduceMotion, !UIAccessibility.isReduceMotionEnabled, let previous {
                let motion = CABasicAnimation(keyPath: "path"); motion.fromValue = previous; motion.toValue = path.cgPath
                motion.duration = 0.1; meterLayer.add(motion, forKey: "meter")
            }
        }
    }

    let material = UIVisualEffectView()
    private let avatar = UIImageView(), status = UILabel(), wave = Wave()
    private(set) var model: Model?
    private var artwork = ""
    private(set) var buttons: [String: UIButton] = [:]
    var activate: ((String) -> Void)?

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        if #available(iOS 26.0, *) {
            let glass = UIGlassEffect(style: .regular); glass.isInteractive = true; material.effect = glass
        }
        material.backgroundColor = .clear; addSubview(material)
        avatar.contentMode = .scaleAspectFit; avatar.isAccessibilityElement = false; avatar.isUserInteractionEnabled = false
        status.font = .systemFont(ofSize: 12); status.textColor = .label; status.numberOfLines = 2
        status.accessibilityTraits = .updatesFrequently
        status.isUserInteractionEnabled = false
        for view in [avatar, status, wave] { material.contentView.addSubview(view) }
        for id in Model.actions {
            let button = UIButton(type: .system)
            button.backgroundColor = id == "end" ? UIColor(red: 0.78, green: 0.25, blue: 0.26, alpha: 1) : .tertiarySystemFill
            button.tintColor = id == "end" ? .white : .label
            button.accessibilityIdentifier = "kindred-voice-" + id
            button.addAction(UIAction { [weak self] _ in
                guard let self, self.model?.interactive == true, self.buttons[id]?.isEnabled == true else { return }
                self.activate?(id)
            }, for: .primaryActionTriggered)
            buttons[id] = button; material.contentView.addSubview(button)
        }
        accessibilityIdentifier = "kindred-voice-glass"
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is unavailable") }

    override func layoutSubviews() {
        super.layoutSubviews(); material.frame = bounds
        if #available(iOS 26.0, *) { material.cornerConfiguration = .corners(radius: .fixed(bounds.height/2)) }
    }

    func apply(_ model: Model) {
        self.model = model
        overrideUserInterfaceStyle = model.dark ? .dark : .light
        isUserInteractionEnabled = model.interactive; accessibilityElementsHidden = !model.interactive
        let key = model.shape + model.color
        if artwork != key { artwork = key; avatar.image = BotToolbarAvatar(shape: model.shape, color: model.color).image(scale: traitCollection.displayScale) }
        avatar.frame = model.avatar; avatar.isHidden = model.avatar.isEmpty
        status.frame = model.activity; status.text = model.status; status.font = .systemFont(ofSize: model.font)
        status.isHidden = !model.showingStatus || model.activity.isEmpty
        status.accessibilityLabel = model.label + ", " + model.status
        wave.frame = model.activity; wave.isHidden = model.showingStatus || model.activity.isEmpty
        let rgb = UInt32(model.color.dropFirst(), radix: 16) ?? 0x2475ff
        wave.color = UIColor(red: CGFloat((rgb >> 16) & 255) / 255,
                             green: CGFloat((rgb >> 8) & 255) / 255,
                             blue: CGFloat(rgb & 255) / 255, alpha: 1)
        wave.reduceMotion = model.reduceMotion
        wave.accessibilityLabel = model.label + ", " + model.status
        for item in model.items {
            guard let button = buttons[item.id] else { continue }
            button.frame = item.frame; button.layer.cornerRadius = min(item.frame.width, item.frame.height)/2
            button.isEnabled = item.enabled; button.accessibilityLabel = item.label
            button.accessibilityValue = item.id == "mute" && model.muted ? "Muted" : nil
            let symbol = item.id == "settings" ? "gearshape" : item.id == "end" ? "xmark" : model.muted ? "mic.slash" : "mic"
            button.setImage(UIImage(systemName: symbol, withConfiguration: UIImage.SymbolConfiguration(pointSize: 19, weight: .regular)), for: .normal)
        }
        updateMeter(input: model.input, output: model.output, animated: false)
        setNeedsLayout(); layoutIfNeeded()
    }

    func updateMeter(input: [Double], output: [Double], animated: Bool = true) {
        wave.input = input; wave.output = output; wave.paint(animated: animated)
    }
}
