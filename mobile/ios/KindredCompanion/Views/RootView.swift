import KindredCore
import SwiftUI

/// The server's chat header owns navigation once it is ready. Native account
/// controls remain available during loading, sign-in and page failures.
@MainActor
struct RootView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        @Bindable var model = model
        NavigationStack {
            content
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(pageCanvas)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar { toolbar }
                .toolbarBackground(Theme.chrome, for: .navigationBar)
                .toolbarBackground(.visible, for: .navigationBar)
                .toolbar(isShowingConversation ? .hidden : .visible, for: .navigationBar)
                .sheet(item: $model.download) { file in
                    ShareSheet(items: [file.url])
                }
        }
        .background(pageCanvas.ignoresSafeArea())
        .preferredColorScheme(pageIsDark.map { $0 ? .dark : .light })
        .overlay(alignment: .top) {
            if let banner = model.banner {
                BannerView(banner: banner) { model.banner = nil }
                    .padding(.top, 52)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .animation(.snappy, value: model.banner)
        .sheet(item: $model.sheet) { route in
            Group {
                switch route {
                case .accounts:
                    AccountsSheet()
                        .environment(model)
                case .addAccount(let prefill):
                    AddAccountSheet(prefill: prefill)
                        .environment(model)
                }
            }
            .preferredColorScheme(pageIsDark.map { $0 ? .dark : .light })
        }
        .onChange(of: scenePhase) { _, phase in
            switch phase {
            case .active:
                model.sceneBecameActive()
            case .inactive, .background:
                Task { await model.captureLatestTokens() }
            @unknown default:
                break
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        if let account = model.activeAccount {
            if model.isSignedIn(account.id) {
                WebContainerView(session: model.session(for: account))
                    .id(account.id)
                    .ignoresSafeArea(.container, edges: .bottom)
                    // WebKit shrinks its visible viewport for the keyboard.
                    // Keep SwiftUI from subtracting the same space again.
                    .ignoresSafeArea(.keyboard)
            } else {
                SignedOutView(account: account)
            }
        } else {
            WelcomeView()
        }
    }

    private var pageCanvas: Color {
        guard let account = model.activeAccount, isShowingConversation else { return Theme.canvas }
        return Color(model.session(for: account).presentation.canvas)
    }

    private var pageIsDark: Bool? {
        guard let account = model.activeAccount, isShowingConversation else { return nil }
        return model.session(for: account).presentation.isDark
    }

    private var isShowingConversation: Bool {
        guard let account = model.activeAccount else { return false }
        return model.isSignedIn(account.id) && model.session(for: account).presentation.hasChatInterface
    }

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
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
        ToolbarItem(placement: .topBarLeading) {
            if let account = model.activeAccount, model.isSignedIn(account.id) {
                Button {
                    model.reloadActive()
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .accessibilityLabel("Reload")
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
                Text("Sign in to your Kindred server to pick up your conversations.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            Button {
                model.sheet = .addAccount(AccountPrefill())
            } label: {
                Text("Add Account")
                    .font(.body.weight(.semibold))
                    .frame(maxWidth: 280)
                    .padding(.vertical, 4)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
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
