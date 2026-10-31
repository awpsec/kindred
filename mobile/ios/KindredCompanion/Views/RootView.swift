import KindredCore
import SwiftUI

/// The server's chat header owns navigation once it is ready. Native account
/// controls remain available during loading, sign-in and page failures.
@MainActor
struct RootView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.displayScale) private var displayScale
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        @Bindable var model = model
        appContent
        .preferredColorScheme(pageIsDark.map { $0 ? .dark : .light })
        .sheet(item: $model.sheet) { route in
            Group {
                switch route {
                case .accounts:
                    AccountsSheet()
                        .environment(model)
                case .addAccount(let prefill):
                    AddAccountSheet(prefill: prefill)
                        .environment(model)
                case .pair(let request):
                    PairDeviceSheet(request: request)
                        .environment(model)
                }
            }
            .preferredColorScheme(pageIsDark.map { $0 ? .dark : .light })
        }
        // `kindred://pair` links from the camera app open the confirmation screen.
        .onOpenURL { model.handleOpenURL($0) }
        .onChange(of: scenePhase) { _, phase in
            switch phase {
            case .active:
                model.sceneBecameActive()
            case .inactive, .background:
                Task { await model.captureLatestTokens() }
            @unknown default:
                break
            }
            if let account = model.activeAccount, model.isSignedIn(account.id) {
                model.session(for: account).sceneActivityChanged(active: phase == .active)
            }
        }
    }

    private var appContent: some View {
        @Bindable var model = model
        return NavigationStack {
            content
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(pageCanvas)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar { toolbar }
                .tint(usesDuoNavigation ? Color.primary : Theme.accent)
                .toolbarBackground(Theme.chrome, for: .navigationBar)
                .toolbarBackground(isShowingConversation ? .hidden : .visible, for: .navigationBar)
                .toolbar(isShowingConversation && !usesDuoNavigation ? .hidden : .visible, for: .navigationBar)
                .sheet(item: $model.download) { file in
                    ShareSheet(items: [file.url])
                }
        }
        .background(pageCanvas.ignoresSafeArea())
        .preferredColorScheme(pageIsDark.map { $0 ? .dark : .light })
        .overlay(alignment: .top) {
            if let banner = model.banner {
                BannerView(banner: banner) { model.banner = nil }
                    .safeAreaPadding(.top)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .animation(.snappy, value: model.banner)
    }

    @ViewBuilder
    private var content: some View {
        if let account = model.activeAccount {
            if model.isSignedIn(account.id) {
                let session = model.session(for: account)
                ZStack {
                    WebContainerView(session: session, navigationBlocked: model.sheet != nil || model.download != nil)
                        .allowsHitTesting(session.presentation.hasLoadedChats && session.loadState.failure == nil)
                        .accessibilityHidden(!session.presentation.hasLoadedChats || session.loadState.failure != nil)
                    if let failure = session.loadState.failure {
                        KindredLoadingView(canvas: pageCanvas, failure: failure) { session.reload() }
                            .transition(.opacity)
                    } else if !session.presentation.hasLoadedChats {
                        KindredLoadingView(canvas: pageCanvas)
                            .transition(.opacity)
                    }
                }
                .animation(.easeOut(duration: reduceMotion ? 0.1 : 0.2), value: session.presentation.hasLoadedChats)
                .animation(.easeOut(duration: reduceMotion ? 0.1 : 0.2), value: session.loadState.failure)
                .id(account.id)
                .ignoresSafeArea(.container, edges: isShowingConversation ? (usesDuoNavigation ? .all : [.top, .bottom]) : .bottom)
                // WebHostView owns keyboard avoidance exactly once.
                .ignoresSafeArea(.keyboard)
            } else {
                SignedOutView(account: account)
            }
        } else {
            WelcomeView()
        }
    }

    private var pageCanvas: Color {
        guard let account = model.activeAccount, model.isSignedIn(account.id) else { return Theme.canvas }
        return Color(model.session(for: account).presentation.canvas)
    }

    private var pageIsDark: Bool? {
        guard let account = model.activeAccount, model.isSignedIn(account.id) else { return nil }
        return model.session(for: account).presentation.isDark
    }

    private var isShowingConversation: Bool {
        guard let account = model.activeAccount else { return false }
        return model.isSignedIn(account.id) && model.session(for: account).presentation.hasChatInterface
    }

    private var activeSession: WebSession? {
        guard let account = model.activeAccount, model.isSignedIn(account.id) else { return nil }
        return model.session(for: account)
    }

    private var usesDuoNavigation: Bool {
        isShowingConversation && activeSession?.presentation.usesNativeRail == true
    }

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        if #available(iOS 27.1, *), usesDuoNavigation, let session = activeSession {
            let artifacts = ["artifacts", "artifact"].contains(session.presentation.route)
            if #available(iOS 27.1, *), session.presentation.toolbarIdentity,
               session.presentation.route == "bot-chat", session.presentation.botDetailsAvailable {
                ToolbarItem(placement: .topBarTrailing) {
                    ToolbarAvatarButton(image: BotToolbarAvatar(shape: session.presentation.botAvatarShape, color: session.presentation.botAvatarColor).image(scale: displayScale),
                                        title: session.presentation.chatTitle + " details",
                                        action: { session.performDuoAction(.botDetails) },
                                        frameChanged: { session.updateToolbarIdentityFrame(inWindow: $0) })
                        .frame(width: 44, height: 44)
                }
                .axisBehavior(session.presentation.isDuoInner ? .automatic : .verticalPreferred)
            }
            ToolbarItemGroup(placement: .topBarTrailing) {
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
                if artifacts || session.presentation.route == "chat-list" || session.presentation.listVisible {
                    Menu {
                        Button("Settings", systemImage: "gearshape") { session.performDuoAction(.settings) }
                        if artifacts {
                            Button("Chats", systemImage: "bubble.left.and.bubble.right") { session.performDuoAction(.chatHome) }
                        } else {
                            Button("Artifacts", systemImage: "folder") { session.performDuoAction(.artifacts) }
                        }
                        Button("Marketplace", systemImage: "square.grid.2x2") { session.performDuoAction(.marketplace) }
                        Divider()
                        Button("Manage accounts", systemImage: "person.crop.circle") { model.sheet = .accounts }
                    } label: { Label("More options", systemImage: "ellipsis") }
                }
                if !artifacts && (session.presentation.route == "chat-list" || session.presentation.listVisible) {
                    Button {
                        session.performDuoAction(.search)
                    } label: { Label("Search chats", systemImage: "magnifyingglass") }
                    Menu {
                        Button("New bot", systemImage: "plus") { session.performDuoAction(.newBot) }
                        Button("New chat", systemImage: "bubble.left.and.bubble.right") { session.performDuoAction(.newConversation) }
                    } label: { Label("New conversation", systemImage: "plus") }
                }
                if session.presentation.route == "artifacts" || session.presentation.artifactLibraryVisible {
                    Button {
                        session.performDuoAction(.search)
                    } label: { Label("Search artifacts", systemImage: "magnifyingglass") }
                    Button {
                        session.performDuoAction(.newChat)
                    } label: { Label("New artifact", systemImage: "plus") }
                }
            }
        } else {
        ToolbarItem(placement: .principal) {
            if let account = model.activeAccount {
                VStack(spacing: 0) {
                    Text(account.title)
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)
                    Text(account.origin.displayName)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                .accessibilityElement(children: .combine)
            } else {
                Text("Kindred").font(.headline)
            }
        }
        if #available(iOS 27.1, *) {
            ToolbarItem(placement: .topBarTrailing) { accountsButton }
                .axisBehavior(.verticalPreferred)
        } else {
            ToolbarItem(placement: .topBarTrailing) { accountsButton }
        }
        }
    }

    private var accountsButton: some View {
        Button {
            model.sheet = .accounts
        } label: {
            AccountAvatar(account: model.activeAccount, size: 30)
        }
        .accessibilityLabel("Accounts")
    }
}

@MainActor
struct WelcomeView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        VStack(spacing: 18) {
            Spacer()
            Image("KindredMark")
                .renderingMode(.original)
                .resizable()
                .scaledToFit()
                .frame(width: 96, height: 96)
                .accessibilityHidden(true)
            VStack(spacing: 6) {
                Text("Kindred")
                    .font(.largeTitle.weight(.semibold))
                Text("Pair with Kindred on your computer, or sign in to your server to pick up your conversations.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            VStack(spacing: 10) {
                Button {
                    model.sheet = .pair(PairingRequest())
                } label: {
                    Label("Scan Pairing Code", systemImage: "qrcode.viewfinder")
                        .font(.body.weight(.semibold))
                        .frame(maxWidth: 280)
                        .padding(.vertical, 4)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                Button {
                    model.sheet = .addAccount(AccountPrefill())
                } label: {
                    Text("Sign In with Password")
                        .font(.body.weight(.medium))
                        .frame(maxWidth: 280)
                        .padding(.vertical, 4)
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
            }
            Spacer()
            Spacer()
        }
        .padding(32)
    }
}

@MainActor
struct SignedOutView: View {
    @Environment(AppModel.self) private var model
    let account: Account

    var body: some View {
        VStack(spacing: 16) {
            Spacer()
            AccountAvatar(account: account, size: 72)
            VStack(spacing: 6) {
                Text("Signed out")
                    .font(.title2.weight(.semibold))
                Text("\(account.login) on \(account.origin.displayName)")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            if case .removalUnconfirmed(let message, _) = account.push.state {
                Label("Notification removal wasn't confirmed: \(message)", systemImage: "bell.slash")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            Button {
                model.sheet = .addAccount(AccountPrefill(origin: account.origin, login: account.login))
            } label: {
                Text("Sign In")
                    .font(.body.weight(.semibold))
                    .frame(maxWidth: 280)
                    .padding(.vertical, 4)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            Button("Other Accounts") {
                model.sheet = .accounts
            }
            Spacer()
            Spacer()
        }
        .padding(32)
    }
}
