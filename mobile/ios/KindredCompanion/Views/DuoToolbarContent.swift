import SwiftUI

/// A bounded native glass toolbar keeps every action directly reachable rather
/// than handing the last actions to UIKit’s automatic overflow menu.
@available(iOS 27.1, *)
@MainActor
struct DuoToolbarContent: ToolbarContent {
    let session: WebSession
    let manageAccounts: () -> Void
    @ToolbarContentBuilder
    var body: some ToolbarContent {
        if !session.presentation.toolbarVertical {
        ToolbarItem(placement: .topBarTrailing) {
            DuoRailButtons(session: session, manageAccounts: manageAccounts)
        }
        .sharedBackgroundVisibility(.hidden)
        .axisBehavior(.horizontalOnly)
        }
    }
}

@available(iOS 27.1, *)
@MainActor
struct DuoRailButtons: View {
    @Environment(\.displayScale) private var displayScale
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let session: WebSession
    let manageAccounts: () -> Void
    private var artifacts: Bool { ["artifacts", "artifact"].contains(session.presentation.route) }
    private var vertical: Bool { session.presentation.toolbarVertical }
    private var showsComputer: Bool {
        let p = session.presentation
        return (p.route == "bot-chat" && p.isDuoInner) || (p.route == "computer" && !p.hasBotCenter)
    }
    private var length: CGFloat { min(session.presentation.toolbarLength, CGFloat(buttonCount) * 44 + 8) }
    private var buttonCount: Int {
        let p = session.presentation, controls = p.artifactControls
        let back = !["chat-list", "artifacts"].contains(p.route) && !(["bot-chat", "artifact"].contains(p.route) && (p.listVisible || p.listToggleAvailable))
        return 4 + [
            p.toolbarIdentity && p.route == "bot-chat" && p.botDetailsAvailable,
            back, p.route == "details" && p.botSettingsAvailable,
            p.route == "computer" && p.computerExpandAvailable, p.listToggleAvailable,
            showsComputer,
            artifacts && p.artifactLibraryVisible && !(controls?.filters.isEmpty ?? true),
            artifacts && p.route == "artifact" && controls?.zoom != nil,
            artifacts && p.route == "artifact" && controls?.actions.contains(where: { $0.id == "refresh" }) == true,
            artifacts && p.route == "artifact" && controls?.actions.contains(where: { $0.id != "refresh" }) == true
        ].filter { $0 }.count
    }
    var body: some View {
        ScrollView(vertical ? .vertical : .horizontal) {
            (vertical ? AnyLayout(VStackLayout(spacing: 0)) : AnyLayout(HStackLayout(spacing: 0))) {
                buttons
            }
            .padding(4)
        }
        .scrollBounceBehavior(.basedOnSize)
        .scrollIndicators(.hidden)
        .frame(width: vertical ? 52 : length, height: vertical ? length : 52)
        .glassEffect(.regular, in: .capsule)
        .buttonStyle(.plain)
        .labelStyle(.iconOnly)
        .tint(.primary)
        .accessibilityIdentifier("kindred-duo-navigation-rail")
        .animation(reduceMotion || session.presentation.reduceMotion ? nil : .smooth(duration: 0.25), value: vertical)
        .animation(reduceMotion || session.presentation.reduceMotion ? nil : .smooth(duration: 0.25), value: length)
    }
    private func railLabel(_ title: String, systemImage: String) -> some View {
        Label(title, systemImage: systemImage)
            .font(.title3)
            .frame(width: 44, height: 44)
            .contentShape(Rectangle())
    }
    @ViewBuilder
    private var buttons: some View {
            Button {
                session.performDuoAction(.search)
            } label: { railLabel(artifacts ? "Search artifacts" : "Search chats", systemImage: "magnifyingglass") }
            .accessibilityIdentifier("kindred-duo-search")
            if artifacts {
                Button {
                    session.performDuoAction(.newChat)
                } label: { railLabel("New artifact", systemImage: "plus") }
                .accessibilityIdentifier("kindred-duo-new")
            } else {
                Menu {
                    Button("New bot", systemImage: "plus") { session.performDuoAction(.newBot) }
                    Button("New chat", systemImage: "bubble.left.and.bubble.right") { session.performDuoAction(.newConversation) }
                } label: { railLabel("New conversation", systemImage: "plus") }
                .accessibilityIdentifier("kindred-duo-new")
            }
        if session.presentation.toolbarIdentity,
           session.presentation.route == "bot-chat", session.presentation.botDetailsAvailable {
                ToolbarAvatarButton(image: BotToolbarAvatar(shape: session.presentation.botAvatarShape, color: session.presentation.botAvatarColor).image(scale: displayScale),
                                    title: session.presentation.chatTitle + " details",
                                    action: { session.performDuoAction(.botDetails) },
                                    frameChanged: { session.updateToolbarIdentityFrame(inWindow: $0) },
                                    collaboration: session.presentation.collaboration,
                                    interrupt: { session.interruptCollaboration(key: $0) })
                    .frame(width: 44, height: 44)
        }
            if !["chat-list", "artifacts"].contains(session.presentation.route) && !(["bot-chat", "artifact"].contains(session.presentation.route) && (session.presentation.listVisible || session.presentation.listToggleAvailable)) {
                Button {
                    session.performDuoAction(.back)
                } label: { railLabel(artifacts ? "Artifact list" : session.presentation.route == "bot-chat" ? "Chat list" : "Back",
                               systemImage: ["bot-chat", "artifact"].contains(session.presentation.route) ? "line.3.horizontal" : "chevron.backward") }
            }
            if session.presentation.route == "details" && session.presentation.botSettingsAvailable {
                Button {
                    session.performDuoAction(.botSettings)
                } label: { railLabel("Bot settings", systemImage: "gearshape") }
            }
            if session.presentation.route == "computer" && session.presentation.computerExpandAvailable {
                Button {
                    session.performDuoAction(.expandComputer)
                } label: {
                    railLabel(session.presentation.computerExpanded ? "Collapse computer" : "Expand computer",
                          systemImage: session.presentation.computerExpanded ? "arrow.down.right.and.arrow.up.left" : "arrow.up.left.and.arrow.down.right")
                }
            }
            if session.presentation.listToggleAvailable {
                Button {
                    session.performDuoAction(.chats)
                } label: { railLabel(artifacts ? (session.presentation.listVisible ? "Hide artifact list" : "Show artifact list") : (session.presentation.listVisible ? "Hide chat list" : "Show chat list"), systemImage: "sidebar.left") }
            }
            if showsComputer {
                Button {
                    session.performDuoAction(.computer)
                } label: { railLabel(session.presentation.route == "computer" ? "Close computer" : "Bot computer", systemImage: "desktopcomputer") }
                .accessibilityIdentifier("kindred-duo-computer")
            }
            if artifacts, let controls = session.presentation.artifactControls {
                if session.presentation.artifactLibraryVisible, !controls.filters.isEmpty {
                    Menu {
                        ForEach(controls.filters) { filter in
                            Picker(filter.label, selection: Binding(
                                get: { filter.value },
                                set: { session.performArtifactControl("filter", snapshot: controls, filter: filter.id, value: $0) }
                            )) {
                                ForEach(filter.options) { option in
                                    Text(option.label).tag(option.value).disabled(!option.enabled)
                                }
                            }
                        }
                    } label: { railLabel("Filter and sort artifacts", systemImage: "line.3.horizontal.decrease") }
                    .accessibilityIdentifier("kindred-duo-artifact-filter")
                }
                if session.presentation.route == "artifact", let zoom = controls.zoom {
                    Menu {
                        ForEach(controls.zoomOptions) { option in
                            Button {
                                session.performArtifactControl("zoom", snapshot: controls, value: option.id)
                            } label: {
                                if option.selected { Label(option.label, systemImage: "checkmark") }
                                else { Text(option.label) }
                            }
                            .disabled(!option.enabled)
                        }
                    } label: {
                        Text(zoom).font(.callout.monospacedDigit()).frame(minWidth: 36, minHeight: 44)
                    }
                    .accessibilityLabel("Document zoom, " + zoom)
                    .accessibilityIdentifier("kindred-duo-artifact-zoom")
                }
                if session.presentation.route == "artifact", let refresh = controls.actions.first(where: { $0.id == "refresh" }) {
                    Button {
                        session.performArtifactControl("refresh", snapshot: controls)
                    } label: { railLabel(refresh.label, systemImage: "arrow.clockwise") }
                    .disabled(!refresh.enabled)
                    .accessibilityIdentifier("kindred-duo-artifact-refresh")
                }
            }
            if artifacts, session.presentation.route == "artifact", let controls = session.presentation.artifactControls,
               controls.actions.contains(where: { $0.id != "refresh" }) {
                Menu {
                    ForEach(controls.actions.filter { $0.id != "refresh" }) { action in
                        Button(action.label, systemImage: action.id == "edit" ? "pencil" : "square.and.arrow.down") {
                            session.performArtifactControl(action.id, snapshot: controls)
                        }
                        .disabled(!action.enabled)
                    }
                } label: { railLabel("Document actions", systemImage: "ellipsis") }
                .accessibilityIdentifier("kindred-duo-artifact-more")
            }
            if artifacts {
                Button {
                    session.performDuoAction(.chatHome)
                } label: { railLabel("Chats", systemImage: "bubble.left.and.bubble.right") }
                .accessibilityIdentifier("kindred-duo-chats")
            } else {
                Button {
                    session.performDuoAction(.artifacts)
                } label: { railLabel("Artifacts", systemImage: "folder") }
                .accessibilityIdentifier("kindred-duo-artifacts")
            }
            Menu {
                Button("Accounts", systemImage: "person.crop.circle", action: manageAccounts)
                    .accessibilityIdentifier("kindred-duo-manage-accounts")
                Button("Settings", systemImage: "gearshape") {
                    session.performDuoAction(.settings)
                }
                .accessibilityIdentifier("kindred-duo-settings")
                Button("Marketplace", systemImage: "square.grid.2x2") {
                    session.performDuoAction(.marketplace)
                }
                .disabled(session.presentation.route == "marketplace")
                .accessibilityIdentifier("kindred-duo-marketplace")
            } label: { railLabel("Accounts, settings and marketplace", systemImage: "person.crop.circle") }
            .accessibilityIdentifier("kindred-duo-accounts")
    }
}
