import SwiftUI

@available(iOS 27.1, *)
@MainActor
struct DuoRailButtons: View {
    @Environment(\.displayScale) private var displayScale
    let session: WebSession
    let manageAccounts: () -> Void

    var body: some View {
        let items = controls
        let vertical = session.presentation.toolbarVertical
        let length = min(session.presentation.toolbarLength, CGFloat(items.count) * 44 + 8)
        DuoRailStrip(items: items, session: session, vertical: vertical)
            .frame(width: vertical ? 52 : length, height: vertical ? length : 52)
            .glassEffect(.regular.interactive(), in: .capsule)
    }

    private var controls: [RailItem] {
        let p = session.presentation
        let artifacts = ["artifacts", "artifact"].contains(p.route)
        var items: [RailItem] = []
        func action(_ id: String, _ title: String, _ icon: String, _ command: WebSession.DuoAction) {
            items.append(RailItem(id: id, title: title, image: UIImage(systemName: icon),
                                  activate: { session.performDuoAction(command) }))
        }
        func menu(_ id: String, _ title: String, _ icon: String?, _ children: [UIMenuElement], text: String? = nil) {
            items.append(RailItem(id: id, title: title, image: icon.flatMap { UIImage(systemName: $0) },
                                  text: text, menu: UIMenu(children: children)))
        }
        action("search", artifacts ? "Search artifacts" : "Search chats", "magnifyingglass", .search)
        if artifacts { action("new", "New artifact", "plus", .newChat) }
        else if p.route == "chat-list" {
            menu("new", "New conversation", "plus", [
                UIAction(title: "New bot", image: UIImage(systemName: "plus")) { _ in session.performDuoAction(.newBot) },
                UIAction(title: "New chat", image: UIImage(systemName: "bubble.left.and.bubble.right")) { _ in session.performDuoAction(.newConversation) }
            ])
        }
        if p.toolbarIdentity && p.route == "bot-chat" && p.botDetailsAvailable {
            let image = BotToolbarAvatar(shape: p.botAvatarShape, color: p.botAvatarColor).image(scale: displayScale)
            items.append(RailItem(id: "identity", title: p.chatTitle + " details", image: image ?? UIImage(systemName: "person.crop.circle"),
                                  activate: { session.performDuoAction(.botDetails) }))
        }
        if !["chat-list", "artifacts"].contains(p.route) &&
            !(["bot-chat", "artifact"].contains(p.route) && (p.listVisible || p.listToggleAvailable)) {
            let list = ["bot-chat", "artifact"].contains(p.route)
            action("back", artifacts ? "Artifact list" : list ? "Chat list" : "Back", list ? "line.3.horizontal" : "chevron.backward", .back)
        }
        if p.route == "details" && p.botSettingsAvailable { action("bot-settings", "Bot settings", "gearshape", .botSettings) }
        if p.route == "computer" && p.computerExpandAvailable {
            action("expand", p.computerExpanded ? "Collapse computer" : "Expand computer",
                   p.computerExpanded ? "arrow.down.right.and.arrow.up.left" : "arrow.up.left.and.arrow.down.right", .expandComputer)
        }
        if p.listToggleAvailable {
            action("list", (p.listVisible ? "Hide " : "Show ") + (artifacts ? "artifact list" : "chat list"), "sidebar.left", .chats)
        }
        if (p.route == "bot-chat" && p.isDuoInner) || (p.route == "computer" && !p.hasBotCenter) {
            action("computer", p.route == "computer" ? "Close computer" : "Bot computer", "desktopcomputer", .computer)
        }
        if artifacts, let controls = p.artifactControls {
            if p.artifactLibraryVisible && !controls.filters.isEmpty {
                menu("artifact-filter", "Filter and sort artifacts", "line.3.horizontal.decrease", controls.filters.map { filter in
                    UIMenu(title: filter.label, options: .displayInline, children: filter.options.map { option in
                        UIAction(title: option.label, attributes: option.enabled ? [] : .disabled,
                                 state: option.value == filter.value ? .on : .off) { _ in
                            session.performArtifactControl("filter", snapshot: controls, filter: filter.id, value: option.value)
                        }
                    })
                })
            }
            if p.route == "artifact" {
                if let zoom = controls.zoom {
                    menu("artifact-zoom", "Document zoom, " + zoom, nil, controls.zoomOptions.map { option in
                        UIAction(title: option.label, attributes: option.enabled ? [] : .disabled, state: option.selected ? .on : .off) { _ in
                            session.performArtifactControl("zoom", snapshot: controls, value: option.id)
                        }
                    }, text: zoom)
                }
                if let refresh = controls.actions.first(where: { $0.id == "refresh" }) {
                    items.append(RailItem(id: "artifact-refresh", title: refresh.label, image: UIImage(systemName: "arrow.clockwise"),
                                          enabled: refresh.enabled, activate: { session.performArtifactControl("refresh", snapshot: controls) }))
                }
                let other = controls.actions.filter { $0.id != "refresh" }
                if !other.isEmpty {
                    menu("artifact-more", "Document actions", "ellipsis", other.map { action in
                        UIAction(title: action.label, image: UIImage(systemName: action.id == "edit" ? "pencil" : "square.and.arrow.down"),
                                 attributes: action.enabled ? [] : .disabled) { _ in
                            session.performArtifactControl(action.id, snapshot: controls)
                        }
                    })
                }
            }
        }
        if artifacts { action("chats", "Chats", "bubble.left.and.bubble.right", .chatHome) }
        else { action("artifacts", "Artifacts", "folder", .artifacts) }
        let accounts = UIAction(title: "Accounts", image: UIImage(systemName: "person.crop.circle")) { _ in manageAccounts() }
        let settings = UIAction(title: "Settings", image: UIImage(systemName: "gearshape")) { _ in session.performDuoAction(.settings) }
        let marketplace = UIAction(title: "Marketplace", image: UIImage(systemName: "square.grid.2x2"),
                                   attributes: p.route == "marketplace" ? .disabled : []) { _ in session.performDuoAction(.marketplace) }
        accounts.accessibilityIdentifier = "kindred-duo-manage-accounts"
        settings.accessibilityIdentifier = "kindred-duo-settings"
        marketplace.accessibilityIdentifier = "kindred-duo-marketplace"
        menu("accounts", "Accounts, settings and marketplace", "person.crop.circle", [accounts, settings, marketplace])
        return items
    }
}

private struct RailItem {
    let id: String
    let title: String
    let image: UIImage?
    var text: String? = nil
    var enabled = true
    var menu: UIMenu? = nil
    var activate: (() -> Void)? = nil
}

@available(iOS 27.1, *)
private struct DuoRailStrip: UIViewRepresentable {
    let items: [RailItem]
    let session: WebSession
    let vertical: Bool

    func makeUIView(context: Context) -> RailScrollView { RailScrollView() }
    func updateUIView(_ view: RailScrollView, context: Context) {
        view.configure(items, vertical: vertical, session: session)
    }
}

/// Buttons own taps, menus, long presses and accessibility. A pan takes over
/// only on a rail that fits, cancelling the initial button before release.
@available(iOS 27.1, *)
private final class RailScrollView: UIScrollView {
    private var items: [RailItem] = []
    private var buttons: [UIButton] = []
    private let lens = UIVisualEffectView(effect: UIGlassEffect(style: .regular))
    private lazy var scrub = UIPanGestureRecognizer(target: self, action: #selector(track))
    private var vertical = false
    private weak var highlightedButton: UIButton?
    private var route = ""

    override init(frame: CGRect) {
        super.init(frame: frame)
        accessibilityIdentifier = "kindred-duo-navigation-rail"
        showsHorizontalScrollIndicator = false
        showsVerticalScrollIndicator = false
        delaysContentTouches = false
        contentInsetAdjustmentBehavior = .never
        lens.layer.cornerRadius = 22
        lens.clipsToBounds = true
        lens.isHidden = true
        lens.isUserInteractionEnabled = false
        lens.accessibilityElementsHidden = true
        addSubview(lens)
        scrub.maximumNumberOfTouches = 1
        addGestureRecognizer(scrub)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is unavailable") }

    func configure(_ next: [RailItem], vertical: Bool, session: WebSession) {
        let changed = items.map(\.id) != next.map(\.id)
        if changed || self.vertical != vertical || route != session.presentation.route {
            scrub.isEnabled = false
            highlight(nil)
            setContentOffset(.zero, animated: false)
        }
        self.vertical = vertical
        route = session.presentation.route
        items = next
        if changed {
            buttons.forEach { $0.removeFromSuperview() }
            buttons = items.map { item in
                let button: UIButton = item.id == "identity" ? MeasuredAvatarButton() : UIButton(type: .system)
                var config = UIButton.Configuration.plain()
                config.contentInsets = .zero
                config.preferredSymbolConfigurationForImage = UIImage.SymbolConfiguration(pointSize: 20)
                button.configuration = config
                button.tintColor = .label
                button.addTarget(self, action: #selector(pressed(_:)), for: [.touchDown, .touchDragEnter])
                button.addTarget(self, action: #selector(released), for: [.touchDragExit, .touchCancel, .touchUpInside, .touchUpOutside])
                button.addTarget(self, action: #selector(activate(_:)), for: .primaryActionTriggered)
                addSubview(button)
                return button
            }
        }
        for (index, item) in items.enumerated() {
            let b = buttons[index]
            b.configuration?.image = item.image
            b.configuration?.title = item.text
            b.isEnabled = item.enabled
            b.accessibilityLabel = item.title
            b.accessibilityIdentifier = item.id == "identity" ? "kindred-bot-identity" : "kindred-duo-" + item.id
            if let avatar = b as? MeasuredAvatarButton {
                avatar.frameChanged = { [weak session] in session?.updateToolbarIdentityFrame(inWindow: $0) }
                avatar.apply(collaboration: session.presentation.collaboration) { [weak session] in session?.interruptCollaboration(key: $0) }
            } else {
                b.menu = item.menu
                b.showsMenuAsPrimaryAction = item.menu != nil
            }
        }
        setNeedsLayout()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        let length = CGFloat(buttons.count) * 44 + 8
        let size = vertical ? CGSize(width: 52, height: length) : CGSize(width: length, height: 52)
        if contentSize != size { contentSize = size }
        let overflows = length > (vertical ? bounds.height : bounds.width) + 0.5
        if panGestureRecognizer.isEnabled != overflows { panGestureRecognizer.isEnabled = overflows }
        if scrub.isEnabled == overflows { scrub.isEnabled = !overflows }
        for (index, button) in buttons.enumerated() {
            let offset = 4 + CGFloat(index) * 44
            button.frame = CGRect(x: vertical ? 4 : offset, y: vertical ? offset : 4, width: 44, height: 44)
        }
    }

    private func highlight(_ button: UIButton?) {
        guard highlightedButton !== button else { return }
        let moving = !lens.isHidden
        highlightedButton = button
        lens.isHidden = button == nil
        guard let button else { lens.layer.removeAllAnimations(); return }
        if moving && !UIAccessibility.isReduceMotionEnabled {
            UIView.animate(withDuration: 0.12, delay: 0, options: [.beginFromCurrentState, .allowUserInteraction, .curveEaseOut]) { self.lens.frame = button.frame }
        } else { lens.frame = button.frame }
    }

    @objc private func pressed(_ button: UIButton) { highlight(button) }
    @objc private func released() { if scrub.state != .changed && scrub.state != .began { highlight(nil) } }
    @objc private func activate(_ button: UIButton) {
        guard let index = buttons.firstIndex(of: button) else { return }
        items[index].activate?()
    }
    @objc private func track() {
        let location = scrub.location(in: self)
        let target = buttons.first { $0.isEnabled && bounds.contains(location) && $0.frame.contains(location) }
        switch scrub.state {
        case .began, .changed: highlight(target)
        case .ended:
            highlight(nil)
            target?.performPrimaryAction()
        default: highlight(nil)
        }
    }
}
