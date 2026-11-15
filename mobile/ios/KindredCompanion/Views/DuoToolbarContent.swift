import SwiftUI

/// Shared native Duo navigation. Artifact controls retain the web action owners
/// so menus cannot act on a document or library that has since been replaced.
@available(iOS 27.1, *)
@MainActor
struct DuoToolbarContent: ToolbarContent {
    @Environment(\.displayScale) private var displayScale
    let session: WebSession
    let manageAccounts: () -> Void

    @ToolbarContentBuilder
    var body: some ToolbarContent {
        let artifacts = ["artifacts", "artifact"].contains(session.presentation.route)
        ToolbarItemGroup(placement: .topBarTrailing) {
            Button {
                session.performDuoAction(.search)
            } label: { Label(artifacts ? "Search artifacts" : "Search chats", systemImage: "magnifyingglass") }
            .accessibilityIdentifier("kindred-duo-search")
            if artifacts {
                Button {
                    session.performDuoAction(.newChat)
                } label: { Label("New artifact", systemImage: "plus") }
                .accessibilityIdentifier("kindred-duo-new")
            } else {
                Menu {
                    Button("New bot", systemImage: "plus") { session.performDuoAction(.newBot) }
                    Button("New chat", systemImage: "bubble.left.and.bubble.right") { session.performDuoAction(.newConversation) }
                } label: { Label("New conversation", systemImage: "plus") }
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
                } label: { Label(artifacts ? "Artifact list" : session.presentation.route == "bot-chat" ? "Chat list" : "Back",
                               systemImage: ["bot-chat", "artifact"].contains(session.presentation.route) ? "line.3.horizontal" : "chevron.backward") }
            }
            if session.presentation.route == "details" && session.presentation.botSettingsAvailable {
                Button {
                    session.performDuoAction(.botSettings)
                } label: { Label("Bot settings", systemImage: "gearshape") }
            }
            if session.presentation.route == "computer" && session.presentation.computerExpandAvailable {
                Button {
                    session.performDuoAction(.expandComputer)
                } label: {
                    Label(session.presentation.computerExpanded ? "Collapse computer" : "Expand computer",
                          systemImage: session.presentation.computerExpanded ? "arrow.down.right.and.arrow.up.left" : "arrow.up.left.and.arrow.down.right")
                }
            }
            if session.presentation.listToggleAvailable {
                Button {
                    session.performDuoAction(.chats)
                } label: { Label(artifacts ? (session.presentation.listVisible ? "Hide artifact list" : "Show artifact list") : (session.presentation.listVisible ? "Hide chat list" : "Show chat list"), systemImage: "sidebar.left") }
            }
            if session.presentation.route == "bot-chat" || (session.presentation.route == "computer" && !session.presentation.hasBotCenter) {
                Button {
                    session.performDuoAction(.computer)
                } label: { Label(session.presentation.route == "computer" ? "Close computer" : "Bot computer", systemImage: "desktopcomputer") }
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
                    } label: { Label("Filter and sort artifacts", systemImage: "line.3.horizontal.decrease") }
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
                        Text(zoom).font(.caption.monospacedDigit()).frame(minWidth: 36, minHeight: 44)
                    }
                    .accessibilityLabel("Document zoom, " + zoom)
                    .accessibilityIdentifier("kindred-duo-artifact-zoom")
                }
                if session.presentation.route == "artifact", let refresh = controls.actions.first(where: { $0.id == "refresh" }) {
                    Button {
                        session.performArtifactControl("refresh", snapshot: controls)
                    } label: { Label(refresh.label, systemImage: "arrow.clockwise") }
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
                } label: { Label("Document actions", systemImage: "ellipsis") }
                .accessibilityIdentifier("kindred-duo-artifact-more")
            }
            if artifacts {
                Button {
                    session.performDuoAction(.chatHome)
                } label: { Label("Chats", systemImage: "bubble.left.and.bubble.right") }
                .accessibilityIdentifier("kindred-duo-chats")
            } else {
                Button {
                    session.performDuoAction(.artifacts)
                } label: { Label("Artifacts", systemImage: "folder") }
                .accessibilityIdentifier("kindred-duo-artifacts")
            }
            Button {
                session.performDuoAction(.marketplace)
            } label: { Label("Marketplace", systemImage: "square.grid.2x2") }
            .disabled(session.presentation.route == "marketplace")
            .accessibilityIdentifier("kindred-duo-marketplace")
            Button {
                session.performDuoAction(.settings)
            } label: { Label("Settings", systemImage: "gearshape") }
            .accessibilityIdentifier("kindred-duo-settings")
            Button {
                manageAccounts()
            } label: { Label("Manage accounts", systemImage: "person.crop.circle") }
            .accessibilityIdentifier("kindred-duo-accounts")
        }
        .axisBehavior(.verticalPreferred)
    }
}
