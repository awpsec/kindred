import KindredCore
import SwiftUI

/// The server's chat header owns navigation once it is ready. Native account
/// controls remain available during loading, sign-in and page failures.
@MainActor
struct RootView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var launchFrame = KindredLaunchFrame.at(milliseconds: 0)

    var body: some View {
        @Bindable var model = model
        ZStack {
            if !model.hasCompletedLaunch {
                (pageIsDark ?? (colorScheme == .dark) ? Color.black : Color.white)
                    .ignoresSafeArea()
            }
            appContent
                .opacity(model.hasCompletedLaunch ? 1 : launchFrame.contentOpacity)
                .offset(y: model.hasCompletedLaunch || reduceMotion ? 0 : (1 - launchFrame.contentOpacity) * 5)
                .allowsHitTesting(model.hasCompletedLaunch)
                .accessibilityHidden(!model.hasCompletedLaunch)
            if !model.hasCompletedLaunch {
                KindredLaunchView(ready: launchContentReady, frame: $launchFrame) { model.hasCompletedLaunch = true }
            }
        }
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
                    if let failure = session.loadState.failure {
                        VStack(spacing: 16) {
                            Text("Couldn't open Kindred").font(.headline)
                            Text(failure).foregroundStyle(.secondary)
                                .multilineTextAlignment(.center)
                            Button("Try again") { session.reload() }
                                .buttonStyle(.borderedProminent)
                        }
                        .padding(24)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(Theme.canvas)
                    }
                }
                .id(account.id)
                .ignoresSafeArea(.container, edges: isShowingConversation && !usesDuoNavigation ? [.top, .bottom] : .bottom)
                // WebHostView owns keyboard avoidance exactly once.
                .ignoresSafeArea(.keyboard)
            } else {
                SignedOutView(account: account)
            }
        } else {
            WelcomeView()
        }
    }

    private var launchContentReady: Bool {
        guard let account = model.activeAccount, model.isSignedIn(account.id) else { return true }
        return model.session(for: account).presentation.hasLoadedChats
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
        isShowingConversation && activeSession?.presentation.isDuo == true
    }

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        if usesDuoNavigation, let session = activeSession {
            ToolbarItem(placement: .topBarLeading) {
                if session.presentation.route != "chat-list" && !(session.presentation.route == "bot-chat" && (session.presentation.listVisible || session.presentation.listToggleAvailable)) {
                    Button {
                        session.performDuoAction(.back)
                    } label: { Label("Back", systemImage: "chevron.backward") }
                }
            }
            ToolbarItemGroup(placement: .topBarTrailing) {
                if session.presentation.route == "details" && session.presentation.botSettingsAvailable {
                    Button {
                        session.performDuoAction(.botSettings)
                    } label: { Label("Bot settings", systemImage: "gearshape") }
                }
                if session.presentation.listToggleAvailable {
                    Button {
                        session.performDuoAction(.chats)
                    } label: { Label(session.presentation.listVisible ? "Hide chat list" : "Show chat list", systemImage: "sidebar.left") }
                }
                if ["bot-chat", "computer"].contains(session.presentation.route) {
                    Button {
                        session.performDuoAction(.computer)
                    } label: { Label(session.presentation.route == "computer" ? "Close computer" : "Bot computer", systemImage: "desktopcomputer") }
                }
                if session.presentation.route == "chat-list" || session.presentation.listVisible {
                    Button {
                        session.performDuoAction(.settings)
                    } label: { Label("Settings and accounts", systemImage: "person.crop.circle") }
                    Menu {
                        Button("Artifacts", systemImage: "folder") { session.performDuoAction(.artifacts) }
                        Button("Marketplace", systemImage: "square.grid.2x2") { session.performDuoAction(.marketplace) }
                    } label: { Label("More", systemImage: "ellipsis") }
                    Button {
                        session.performDuoAction(.search)
                    } label: { Label("Search chats", systemImage: "magnifyingglass") }
                    Button {
                        session.performDuoAction(.newChat)
                    } label: { Label("New conversation", systemImage: "plus") }
                }
                if session.presentation.route == "artifacts" {
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
        ToolbarItem(placement: .topBarTrailing) {
            Button {
                model.sheet = .accounts
            } label: {
                AccountAvatar(account: model.activeAccount, size: 30)
            }
            .accessibilityLabel("Accounts")
        }
        }
    }
}

@MainActor
struct WelcomeView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        VStack(spacing: 18) {
            Spacer()
            Image("KindredMark")
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
