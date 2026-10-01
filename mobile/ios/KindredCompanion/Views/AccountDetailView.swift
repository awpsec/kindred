import KindredCore
import SwiftUI
import UIKit

/// One account: identity, notification state and the sign-out / remove
/// actions. Notification permission is only requested from the explicit
/// "Enable Alerts" button.
@MainActor
struct AccountDetailView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.openURL) private var openURL
    let accountID: UUID
    let onRemoved: () -> Void

    @State private var serverStatus: Result<PushServerStatus, Error>?
    @State private var working = false
    @State private var errorMessage: String?
    @State private var confirmingRemoval = false
    @State private var confirmingSignOut = false
    @State private var forcePrompt: ForcePrompt?

    private struct ForcePrompt: Identifiable {
        let id = UUID()
        let action: Action
        let message: String
    }

    private enum Action { case signOut, remove }

    var body: some View {
        if let account = model.account(accountID) {
            form(account)
                .navigationTitle(account.title)
                .navigationBarTitleDisplayMode(.inline)
                .task(id: model.isSignedIn(accountID)) { await loadStatus() }
        } else {
            ContentUnavailableView("Account Removed", systemImage: "person.crop.circle.badge.xmark")
        }
    }

    private func form(_ account: Account) -> some View {
        let signedIn = model.isSignedIn(account.id)
        return Form {
            Section {
                HStack(spacing: 14) {
                    AccountAvatar(account: account, size: 52)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(account.title).font(.headline)
                        Text(signedIn ? "Signed in" : "Signed out")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.vertical, 4)
                LabeledContent("Server", value: account.origin.displayName)
                LabeledContent("Username", value: account.login)
                if let profile = account.profileName {
                    LabeledContent("Workspace", value: profile)
                }
                if account.id != model.activeAccountID, signedIn {
                    Button("Switch to This Account") {
                        model.activate(account.id)
                        model.sheet = nil
                    }
                }
                if !signedIn {
                    Button("Sign In") {
                        model.sheet = .addAccount(AccountPrefill(origin: account.origin, login: account.login))
                    }
                }
            }

            notifications(account, signedIn: signedIn)

            if let errorMessage {
                Section {
                    Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                        .font(.footnote)
                        .foregroundStyle(.red)
                }
            }

            Section {
                if signedIn {
                    Button("Sign Out") { confirmingSignOut = true }
                }
                Button("Remove Account", role: .destructive) { confirmingRemoval = true }
            } footer: {
                Text("Removing deletes this account's saved session, notification registration and website data from this device.")
            }
        }
        .disabled(working)
        .confirmationDialog("Sign out of \(account.title)?", isPresented: $confirmingSignOut, titleVisibility: .visible) {
            Button("Sign Out", role: .destructive) { perform(.signOut, force: false) }
        }
        .confirmationDialog("Remove \(account.title)?", isPresented: $confirmingRemoval, titleVisibility: .visible) {
            Button("Remove Account", role: .destructive) { perform(.remove, force: false) }
        } message: {
            Text("You can add it again by signing in.")
        }
        .alert(item: $forcePrompt) { prompt in
            Alert(
                title: Text("Notifications Weren't Removed"),
                message: Text("\(prompt.message)\n\nThe server may keep sending generic alerts to this device until the registration ends there. Continue anyway?"),
                primaryButton: .destructive(Text(prompt.action == .remove ? "Remove Anyway" : "Sign Out Anyway")) {
                    perform(prompt.action, force: true)
                },
                secondaryButton: .cancel()
            )
        }
    }

    @ViewBuilder
    private func notifications(_ account: Account, signedIn: Bool) -> some View {
        Section {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Image(systemName: statusSymbol(account))
                    .foregroundStyle(Theme.accent)
                Text(statusText(account, signedIn: signedIn))
                    .font(.subheadline)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if account.push.wanted {
                Button("Turn Off Alerts", role: .destructive) { toggleAlerts(account, enable: false) }
            } else if case .removalUnconfirmed = account.push.state, signedIn {
                Button("Retry Removing This Device") { retryRemoval(account) }
            } else {
                Button("Enable Alerts") { toggleAlerts(account, enable: true) }
                    .disabled(!canEnable(account, signedIn: signedIn))
            }
            if model.notificationAuthorization == .denied {
                Button("Open Notification Settings") {
                    if let url = URL(string: UIApplication.openNotificationSettingsURLString) { openURL(url) }
                }
            }
        } header: {
            Text("Notifications")
        } footer: {
            Text("Alerts show only a generic message. Tapping one opens the conversation in Kindred.")
        }
    }

    private func canEnable(_ account: Account, signedIn: Bool) -> Bool {
        guard signedIn, model.apnsEnvironment != nil, account.serverAccountID != nil else { return false }
        if case .success(let status)? = serverStatus { return status == .configured }
        return false
    }

    private func statusSymbol(_ account: Account) -> String {
        switch account.push.state {
        case .registered: return "bell.badge.fill"
        case .failed, .removalUnconfirmed: return "exclamationmark.bubble"
        case .notRegistered, .endedWithSession: return account.push.wanted ? "bell" : "bell.slash"
        }
    }

    private func statusText(_ account: Account, signedIn: Bool) -> String {
        switch account.push.state {
        case .registered:
            return "On. This device is registered with the server."
        case .failed(let message, _):
            return account.push.wanted ? "Registration failed: \(message) Kindred will try again." : "Last registration failed: \(message)"
        case .removalUnconfirmed(let message, _):
            return "Removing this device wasn't confirmed by the server: \(message)"
        case .endedWithSession:
            if account.push.wanted && signedIn { return waitingText() }
            return "Signed out in the web app. Servers with mobile notifications drop a device when its session ends; this device didn't confirm it."
        case .notRegistered:
            break
        }
        if !signedIn { return "Sign in to manage notifications." }
        if model.apnsEnvironment == nil { return "This build of Kindred isn't configured for notifications." }
        if account.serverAccountID == nil { return "Notifications need a Kindred account sign-in, not a legacy access token." }
        if account.push.wanted { return waitingText() }
        switch serverStatus {
        case .none: return "Checking whether this server sends iOS notifications…"
        case .success(let status)?: return status == .configured ? "Off." : status.message
        case .failure(let error)?: return "Couldn't check notifications: \(error.localizedDescription)"
        }
    }

    private func waitingText() -> String {
        if let error = model.remoteRegistrationError { return "Apple didn't issue a notification token: \(error)" }
        return model.deviceTokenHex == nil ? "Waiting for Apple to issue a notification token…" : "Registering this device…"
    }

    private func loadStatus() async {
        guard model.isSignedIn(accountID) else {
            serverStatus = nil
            return
        }
        serverStatus = await model.serverPushStatus(accountID)
    }

    private func toggleAlerts(_ account: Account, enable: Bool) {
        working = true
        errorMessage = nil
        Task { @MainActor in
            do {
                if enable {
                    try await model.enableAlerts(account.id)
                } else {
                    try await model.disableAlerts(account.id)
                }
            } catch {
                errorMessage = error.localizedDescription
            }
            working = false
        }
    }

    private func retryRemoval(_ account: Account) {
        working = true
        errorMessage = nil
        Task { @MainActor in
            do {
                try await model.retryRemoval(account.id)
            } catch {
                errorMessage = error.localizedDescription
            }
            working = false
        }
    }

    private func perform(_ action: Action, force: Bool) {
        working = true
        errorMessage = nil
        Task { @MainActor in
            do {
                switch action {
                case .signOut:
                    try await model.signOut(accountID, ignoringNotificationFailure: force)
                case .remove:
                    try await model.remove(accountID, ignoringNotificationFailure: force)
                    onRemoved()
                }
            } catch AccountActionError.notificationsStillRegistered(let message) {
                forcePrompt = ForcePrompt(action: action, message: message)
            } catch {
                errorMessage = error.localizedDescription
            }
            working = false
        }
    }
}
