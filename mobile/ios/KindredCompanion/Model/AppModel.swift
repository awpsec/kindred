import Foundation
import KindredCore
import Observation
import UIKit
import UserNotifications
import WebKit

enum SheetRoute: Identifiable, Equatable {
    case accounts
    case addAccount(AccountPrefill)

    var id: String {
        switch self {
        case .accounts: return "accounts"
        case .addAccount(let prefill): return "add-" + prefill.id.uuidString
        }
    }
}

/// Starting values for the native sign-in sheet.
struct AccountPrefill: Equatable, Identifiable {
    var id = UUID()
    var origin: ServerOrigin?
    var login = ""
}

struct Banner: Identifiable, Equatable {
    let id = UUID()
    let message: String
    let isError: Bool
}

struct DownloadedFile: Identifiable {
    let id = UUID()
    let url: URL
}

enum AccountActionError: LocalizedError {
    case invalidLogin
    case invalidPassword
    /// The server registration couldn't be removed; the caller may proceed anyway.
    case notificationsStillRegistered(String)

    var errorDescription: String? {
        switch self {
        case .invalidLogin: return "Enter your username."
        case .invalidPassword: return "Enter your password."
        case .notificationsStillRegistered(let message):
            return "This device couldn't be removed from the server's notifications: \(message)"
        }
    }
}

/// App state: saved accounts, which one is showing, live web sessions and
/// notification registration. Session bearers are only ever in the Keychain
/// (`secrets`) and in each account's own web view.
@MainActor
@Observable
final class AppModel {
    private(set) var accounts: [Account] = []
    private var pendingPushRoute: PushRoute?
    private var routingPush = false
    private var activationRevision = 0
    private(set) var activeAccountID: UUID?
    /// Accounts with a session token in the Keychain.
    private(set) var signedIn: Set<UUID> = []
    /// Process lifetime state: backgrounding, reloads and account switches never replay the launch.
    var hasCompletedLaunch = false
    var sheet: SheetRoute?
    var banner: Banner?
    var download: DownloadedFile?
    private(set) var notificationAuthorization: UNAuthorizationStatus = .notDetermined
    private(set) var deviceTokenHex: String?
    private(set) var remoteRegistrationError: String?

    let api: KindredAPIClient
    let secrets: SessionSecretStore
    /// From the build configuration (`KindredAPNsEnvironment` in Info.plist).
    let apnsEnvironment: APNsEnvironment?
    private let repository: AccountRepository?
    private let maxLiveSessions = 3

    @ObservationIgnored private var pendingDataRemovals: [UUID] = []
    @ObservationIgnored private var sessions: [UUID: WebSession] = [:]
    @ObservationIgnored private var sessionUse: [UUID] = []
    @ObservationIgnored private var bannerTask: Task<Void, Never>?
    @ObservationIgnored private var retryTasks: [UUID: Task<Void, Never>] = [:]
    @ObservationIgnored private var retryAttempts: [UUID: Int] = [:]
    /// Bumped on every native token write so a slow page read can't overwrite a newer token.
    @ObservationIgnored private var tokenGeneration: [UUID: Int] = [:]

    init(secrets: SessionSecretStore? = nil, repository: AccountRepository? = nil, api: KindredAPIClient = KindredAPIClient()) {
        let bundleID = Bundle.main.bundleIdentifier ?? "dev.kindred.companion"
        self.secrets = secrets ?? KeychainSecretStore(service: bundleID + ".session")
        self.api = api
        self.apnsEnvironment = APNsEnvironment(
            configurationValue: Bundle.main.object(forInfoDictionaryKey: "KindredAPNsEnvironment") as? String)
        if let repository {
            self.repository = repository
        } else if let location = try? AccountRepository.defaultLocation() {
            self.repository = AccountRepository(fileURL: location)
        } else {
            self.repository = nil
        }

        var snapshot = AccountsSnapshot()
        var loadProblem: String?
        if let store = self.repository {
            do {
                snapshot = try store.load()
            } catch {
                store.quarantine()
                loadProblem = "Saved accounts couldn't be read, so Kindred set them aside. Add your accounts again."
            }
        }
        accounts = snapshot.accounts
        activeAccountID = snapshot.activeAccountID.flatMap { id in snapshot.accounts.contains { $0.id == id } ? id : nil }
            ?? snapshot.accounts.max { $0.lastUsedAt < $1.lastUsedAt }?.id
        pendingDataRemovals = snapshot.pendingDataRemovals
        let store = self.secrets
        signedIn = Set(snapshot.accounts.compactMap { account in
            let token: String? = try? store.token(for: account.id)
            return token == nil ? nil : account.id
        })
        try? FileManager.default.removeItem(at: WebSession.downloadsFolder)
        if let loadProblem { show(loadProblem, error: true) }
    }

    // MARK: Queries

    var activeAccount: Account? { accounts.first { $0.id == activeAccountID } }
    var groups: [ServerGroup] { AccountGrouping.groups(accounts) }
    var savedOrigins: [ServerOrigin] { groups.map(\.origin) }

    func account(_ id: UUID) -> Account? { accounts.first { $0.id == id } }
    func isSignedIn(_ id: UUID) -> Bool { signedIn.contains(id) }

    private func storedToken(_ id: UUID) -> String? {
        let value: String? = try? secrets.token(for: id)
        return value
    }

    private func storeToken(_ token: String, for id: UUID) throws {
        tokenGeneration[id, default: 0] += 1
        try secrets.setToken(token, for: id)
    }

    private func forgetToken(_ id: UUID) throws {
        tokenGeneration[id, default: 0] += 1
        try secrets.deleteToken(for: id)
    }

    // MARK: Persistence

    private func persist() {
        guard let repository else { return }
        do {
            try repository.save(AccountsSnapshot(accounts: accounts, activeAccountID: activeAccountID,
                                                 pendingDataRemovals: pendingDataRemovals))
        } catch {
            show("Kindred couldn't save account details: \(error.localizedDescription)", error: true)
        }
    }

    private func update(_ id: UUID, _ change: (inout Account) -> Void) {
        guard let index = accounts.firstIndex(where: { $0.id == id }) else { return }
        change(&accounts[index])
        persist()
    }

    func show(_ message: String, error: Bool = false) {
        let banner = Banner(message: message, isError: error)
        self.banner = banner
        bannerTask?.cancel()
        bannerTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(error ? 7 : 4))
            guard let self, !Task.isCancelled, self.banner?.id == banner.id else { return }
            self.banner = nil
        }
    }

    // MARK: Web sessions

    /// The live web view for an account, created on first use. At most a few
    /// stay alive; switching back to an evicted account reloads it.
    func session(for account: Account) -> WebSession {
        if let existing = sessions[account.id] {
            touch(account.id)
            return existing
        }
        let created = WebSession(account: account, token: self.storedToken(account.id), host: self)
        sessions[account.id] = created
        touch(account.id)
        return created
    }

    private func touch(_ id: UUID) {
        sessionUse.removeAll { $0 == id }
        sessionUse.append(id)
        while sessionUse.count > maxLiveSessions, let victim = sessionUse.first(where: { $0 != activeAccountID }) {
            sessionUse.removeAll { $0 == victim }
            if let evicted = sessions.removeValue(forKey: victim) {
                Task { [weak self] in
                    await self?.captureLatestToken(from: evicted)
                    evicted.tearDown()
                }
            }
        }
    }

    private func discardSession(_ id: UUID) {
        sessionUse.removeAll { $0 == id }
        sessions.removeValue(forKey: id)?.tearDown()
    }

    func activate(_ id: UUID) {
        activationRevision += 1
        guard self.account(id) != nil else { return }
        activeAccountID = id
        update(id) { $0.lastUsedAt = Date() }
    }

    func reloadActive() {
        guard let account = activeAccount, isSignedIn(account.id) else { return }
        session(for: account).reload()
    }

    /// Scene going inactive: keep the newest session token the page holds, in
    /// case a rotation message was missed.
    func captureLatestTokens() async {
        let task = BackgroundTask(name: "Save Kindred sessions")
        for session in Array(sessions.values) {
            await captureLatestToken(from: session)
        }
        task.end()
    }

    private func captureLatestToken(from session: WebSession) async {
        let generation = tokenGeneration[session.accountID, default: 0]
        guard let observed = await session.readSessionToken(), account(session.accountID) != nil,
              isSignedIn(session.accountID), generation == tokenGeneration[session.accountID, default: 0] else { return }
        guard observed != self.storedToken(session.accountID) else { return }
        do {
            try storeToken(observed, for: session.accountID)
            signedIn.insert(session.accountID)
            session.updateToken(observed)
        } catch {
            show(error.localizedDescription, error: true)
        }
    }

    // MARK: Sign-in

    func signIn(origin: ServerOrigin, login rawLogin: String, password: String) async throws {
        let login = rawLogin.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !login.isEmpty, login.count <= 80 else { throw AccountActionError.invalidLogin }
        guard !password.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, password.utf8.count <= 1024 else {
            throw AccountActionError.invalidPassword
        }

        try await api.verifyKindredServer(origin)
        let saved = AccountGrouping.existing(in: accounts, origin: origin, login: login)
        let result = try await api.login(origin: origin, login: login, password: password, profileID: saved?.profileID)
        let identity = try? await api.identity(origin: origin, token: result.token)

        let existing = AccountGrouping.existing(in: accounts, origin: origin, login: identity?.username ?? login)
        let id = existing?.id ?? UUID()
        let previousToken = existing.flatMap { self.storedToken($0.id) }
        try storeToken(result.token, for: id)

        var account = existing ?? Account(id: id, origin: origin, login: (identity?.username ?? login).lowercased())
        account.profileID = identity?.activeProfileID ?? result.profileID
        if let name = identity?.activeProfileName { account.profileName = name }
        if let serverAccountID = identity?.serverAccountID { account.serverAccountID = serverAccountID }
        account.lastUsedAt = Date()
        if let index = accounts.firstIndex(where: { $0.id == id }) {
            accounts[index] = account
        } else {
            accounts.append(account)
        }
        signedIn.insert(id)
        activeAccountID = id
        persist()
        // A fresh web view starts from the new session instead of a stale one.
        discardSession(id)

        // End the replaced session before registering under the new one, so the
        // server's logout cleanup can't race the new registration.
        if let previousToken, previousToken != result.token {
            try? await api.logout(origin: origin, token: previousToken)
        }
        if account.push.wanted || account.push.mayExistOnServer {
            await syncPush(accountID: id, force: true)
        }
    }

    // MARK: Sign-out and removal

    /// Deletes this device's push registration while the session can still
    /// authenticate. Throws unless the server confirmed removal.
    private func unregisterPush(_ id: UUID, token suppliedToken: String? = nil) async throws {
        guard let account = self.account(id), account.push.mayExistOnServer else { return }
        cancelRetry(id)
        guard let token = suppliedToken ?? self.storedToken(id) else {
            update(id) { $0.push.state = .removalUnconfirmed(message: "Sign in again to remove this device.", at: Date()) }
            throw KindredAPIError.unauthorized(nil)
        }
        do {
            try await api.unregisterDevice(origin: account.origin, token: token, installationID: account.push.installationID)
            update(id) { $0.push.state = .notRegistered }
        } catch {
            update(id) { $0.push.state = .removalUnconfirmed(message: error.localizedDescription, at: Date()) }
            throw error
        }
    }

    /// Ends the session on the server and forgets it here; the account stays.
    func signOut(_ id: UUID, ignoringNotificationFailure: Bool) async throws {
        guard let account = self.account(id) else { return }
        do {
            try await unregisterPush(id)
        } catch {
            if !ignoringNotificationFailure { throw AccountActionError.notificationsStillRegistered(error.localizedDescription) }
        }
        if let token = self.storedToken(id) { try? await api.logout(origin: account.origin, token: token) }
        try forgetToken(id)
        signedIn.remove(id)
        discardSession(id)
    }

    func remove(_ id: UUID, ignoringNotificationFailure: Bool) async throws {
        guard self.account(id) != nil else { return }
        try await signOut(id, ignoringNotificationFailure: ignoringNotificationFailure)
        cancelRetry(id)
        accounts.removeAll { $0.id == id }
        CachedWebAppearance.clear(accountID: id)
        if activeAccountID == id {
            activeAccountID = accounts.max { $0.lastUsedAt < $1.lastUsedAt }?.id
        }
        pendingDataRemovals.append(id)
        persist()
        await removePendingWebsiteData()
    }

    /// Web data stores can only be deleted once no web view uses them; anything
    /// left is retried on the next launch.
    private func removePendingWebsiteData() async {
        guard !pendingDataRemovals.isEmpty else { return }
        let existing = Set(await WKWebsiteDataStore.allDataStoreIdentifiers)
        for id in pendingDataRemovals where sessions[id] == nil {
            // An account removed before opening its page has no web data store.
            // Avoid asking WebKit to delete a store that was never created.
            guard existing.contains(id) else {
                pendingDataRemovals.removeAll { $0 == id }
                continue
            }
            do {
                try await WKWebsiteDataStore.remove(forIdentifier: id)
                pendingDataRemovals.removeAll { $0 == id }
            } catch {
                continue
            }
        }
        persist()
    }

    // MARK: Messages from the shared web UI

    fileprivate func receive(_ message: SessionMessage, from session: WebSession) {
        let id = session.accountID
        guard let account = self.account(id) else { return }
        switch message {
        case .session(let newToken, let profileID):
            let profileChanged = profileID != nil && profileID != account.profileID
            guard newToken != self.storedToken(id) || profileChanged else { return }
            do {
                try storeToken(newToken, for: id)
            } catch {
                show(error.localizedDescription, error: true)
                return
            }
            signedIn.insert(id)
            session.updateToken(newToken)
            if let profileID { update(id) { $0.profileID = profileID }; session.updateProfile(profileID) }
            Task { [weak self] in await self?.refreshIdentity(id, resyncPush: true) }
        case .signedOut:
            Task { [weak self] in await self?.handleWebSignOut(id) }
        }
    }

    private func refreshIdentity(_ id: UUID, resyncPush: Bool) async {
        guard let account = self.account(id), let token = self.storedToken(id) else { return }
        if let identity = try? await api.identity(origin: account.origin, token: token) {
            update(id) { account in
                if let name = identity.activeProfileName { account.profileName = name }
                if let profile = identity.activeProfileID { account.profileID = profile }
                if let serverAccountID = identity.serverAccountID {
                    if let previous = account.serverAccountID, previous != serverAccountID {
                        // Someone signed in as a different user inside this web view;
                        // the old registration belonged to the previous user.
                        if let username = identity.username { account.login = username.lowercased() }
                        account.push.state = .notRegistered
                    }
                    account.serverAccountID = serverAccountID
                }
            }
        }
        // The server moves registrations to a rotated session (profile switch,
        // password change); re-registering confirms it even if the identity
        // read above failed, so a stale "registered" state can't linger.
        if resyncPush, self.account(id)?.push.wanted == true { await syncPush(accountID: id, force: true) }
    }

    /// The page already revoked its session. Removal is attempted with the
    /// old token in case the server still accepts it, and otherwise recorded
    /// as unconfirmed rather than claimed.
    private func handleWebSignOut(_ id: UUID) async {
        guard let account = self.account(id) else { return }
        // Forget locally first: the page reloads at once, and a reload must not
        // re-seed the revoked token or race a new web sign-in.
        let oldToken = self.storedToken(id)
        sessions[id]?.updateToken(nil)
        do {
            try forgetToken(id)
        } catch {
            show(error.localizedDescription, error: true)
        }
        signedIn.remove(id)
        discardSession(id)
        if account.push.mayExistOnServer {
            do {
                guard let oldToken else { throw KindredAPIError.unauthorized(nil) }
                try await unregisterPush(id, token: oldToken)
            } catch {
                update(id) { $0.push.state = .endedWithSession(at: Date()) }
            }
        }
    }

    fileprivate func openAccounts(from session: WebSession) {
        guard session.accountID == activeAccountID else { return }
        sheet = .accounts
    }

    // MARK: Notifications

    func applicationDidLaunch() {
        Task {
            await refreshNotificationAuthorization()
            if canReceiveAlerts, accounts.contains(where: { $0.push.wanted }) {
                UIApplication.shared.registerForRemoteNotifications()
            }
            await removePendingWebsiteData()
        }
    }

    func sceneBecameActive() {
        retryAttempts.removeAll()
        Task {
            // A failed identity read at sign-in leaves the server account unknown.
            for account in accounts where account.serverAccountID == nil && isSignedIn(account.id) {
                await refreshIdentity(account.id, resyncPush: false)
            }
            await removePendingWebsiteData()
            await refreshNotificationAuthorization()
            if canReceiveAlerts, accounts.contains(where: { $0.push.wanted }) {
                // Apple may rotate the token; asking again is cheap and returns it.
                UIApplication.shared.registerForRemoteNotifications()
            }
            await syncAllPush()
        }
    }

    var canReceiveAlerts: Bool {
        switch notificationAuthorization {
        case .authorized, .provisional, .ephemeral: return true
        default: return false
        }
    }

    func refreshNotificationAuthorization() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        notificationAuthorization = settings.authorizationStatus
    }

    func serverPushStatus(_ id: UUID) async -> Result<PushServerStatus, Error> {
        guard let account = self.account(id), let token = self.storedToken(id) else { return .failure(KindredAPIError.unauthorized(nil)) }
        do {
            let result = try await api.pushStatus(origin: account.origin, token: token, installationID: account.push.installationID)
            if result.registered == false, case .registered = account.push.state {
                // The server no longer has this registration (expired session, invalid token).
                update(id) { $0.push.state = .notRegistered }
                if account.push.wanted { await syncPush(accountID: id, force: true) }
            }
            return .success(result.status)
        } catch {
            return .failure(error)
        }
    }

    /// Only ever called from an explicit button press.
    func enableAlerts(_ id: UUID) async throws {
        guard let account = self.account(id), let token = self.storedToken(id) else { throw KindredAPIError.unauthorized(nil) }
        guard apnsEnvironment != nil else { throw PushSetupError.buildNotConfigured }
        guard account.serverAccountID != nil else { throw PushSetupError.legacyAccount }
        let status = try await api.pushStatus(origin: account.origin, token: token, installationID: nil).status
        guard status == .configured else { throw PushSetupError.server(status) }

        let granted = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])
        await refreshNotificationAuthorization()
        guard granted else { throw PushSetupError.permissionDenied }

        update(id) { $0.push.wanted = true }
        UIApplication.shared.registerForRemoteNotifications()
        if deviceTokenHex != nil {
            try await registerPush(id)
        }
    }

    func disableAlerts(_ id: UUID) async throws {
        update(id) { $0.push.wanted = false }
        try await unregisterPush(id)
    }

    func retryRemoval(_ id: UUID) async throws {
        try await unregisterPush(id)
    }

    func didRegisterForRemoteNotifications(deviceToken: Data) {
        deviceTokenHex = APNsToken.hex(deviceToken)
        remoteRegistrationError = nil
        Task { await syncAllPush() }
    }

    func didFailToRegisterForRemoteNotifications(_ error: Error) {
        remoteRegistrationError = error.localizedDescription
    }

    private func syncAllPush() async {
        for account in accounts {
            await syncPush(accountID: account.id, force: false)
        }
    }

    /// Brings one account's server registration in line with what was asked:
    /// registers the current token when alerts are wanted, retries unconfirmed
    /// removals when they are not.
    private func syncPush(accountID id: UUID, force: Bool) async {
        guard let account = self.account(id), isSignedIn(id) else { return }
        guard account.push.wanted else {
            if case .removalUnconfirmed = account.push.state { try? await unregisterPush(id) }
            return
        }
        guard let hex = deviceTokenHex, let environment = apnsEnvironment, account.serverAccountID != nil else { return }
        if !force, case .registered(let registered, let registeredEnvironment, _) = account.push.state,
           registered == hex, registeredEnvironment == environment {
            return
        }
        do {
            try await registerPush(id)
        } catch KindredAPIError.unauthorized(_) {
            return
        } catch {
            scheduleRetry(id)
        }
    }

    private func registerPush(_ id: UUID) async throws {
        guard let account = self.account(id), let token = self.storedToken(id), let hex = deviceTokenHex,
              let environment = apnsEnvironment else { return }
        guard let serverAccountID = account.serverAccountID else { throw PushSetupError.legacyAccount }
        do {
            try await api.registerDevice(origin: account.origin, token: token, installationID: account.push.installationID,
                                         deviceToken: hex, environment: environment, serverAccountID: serverAccountID)
            update(id) { $0.push.state = .registered(token: hex, environment: environment, at: Date()) }
            retryAttempts[id] = nil
        } catch {
            update(id) { $0.push.state = .failed(message: error.localizedDescription, at: Date()) }
            throw error
        }
    }

    private func scheduleRetry(_ id: UUID) {
        let attempt = retryAttempts[id, default: 0]
        guard attempt < 6 else { return }
        retryAttempts[id] = attempt + 1
        retryTasks[id]?.cancel()
        retryTasks[id] = Task { [weak self] in
            try? await Task.sleep(for: .seconds(RetrySchedule.delay(attempt: attempt)))
            guard !Task.isCancelled else { return }
            await self?.syncPush(accountID: id, force: false)
        }
    }

    #if DEBUG
    /// Lets tests start from a confirmed registration without APNs.
    func markRegisteredForTesting(_ id: UUID) {
        update(id) { account in
            account.push.wanted = true
            account.push.state = .registered(token: String(repeating: "0", count: 64), environment: .sandbox, at: Date())
        }
    }
    #endif

    private func cancelRetry(_ id: UUID) {
        retryTasks.removeValue(forKey: id)?.cancel()
        retryAttempts[id] = nil
    }

    /// Ignore stale pushes after alerts are turned off, sign-out, or account
    /// removal. APNs may still have an alert in flight during unregistering.
    func shouldPresentNotification(_ route: PushRoute?) -> Bool {
        guard let route,
              let account = AccountGrouping.account(forServerAccountID: route.serverAccountID,
                  installationID: route.installationID, in: accounts) else { return false }
        return account.push.wanted && isSignedIn(account.id)
    }

    /// A tapped alert: choose the saved account the server account ID maps to,
    /// then let the shared UI open the conversation from the URL fragment.
    func routeNotification(_ route: PushRoute) {
        pendingPushRoute = route
        guard !routingPush else { return }
        routingPush = true
        Task { [weak self] in
            guard let self else { return }
            defer { self.routingPush = false }
            while let next = self.pendingPushRoute {
                self.pendingPushRoute = nil
                guard let account = AccountGrouping.account(forServerAccountID: next.serverAccountID, installationID: next.installationID, in: self.accounts) else {
                    self.show("That notification's account isn't saved on this device.")
                    continue
                }
                guard self.isSignedIn(account.id), let token = self.storedToken(account.id) else {
                    self.sheet = .addAccount(AccountPrefill(origin: account.origin, login: account.login))
                    continue
                }
                let revision = self.activationRevision
                do {
                    if let profile = next.profileID, profile != account.profileID {
                        let result = try await self.api.switchProfile(origin: account.origin, token: token, profileID: profile)
                        guard self.account(account.id) != nil else {
                            try? await self.api.logout(origin: account.origin, token: result.token)
                            continue
                        }
                        // Save a rotated token even if another notification or an account switch arrived meanwhile.
                        try self.storeToken(result.token, for: account.id)
                        self.update(account.id) { $0.profileID = result.profileID }
                        self.discardSession(account.id)
                        await self.refreshIdentity(account.id, resyncPush: false)
                    }
                    guard self.pendingPushRoute == nil, revision == self.activationRevision, let current = self.account(account.id) else { continue }
                    self.activate(current.id)
                    self.sheet = nil
                    if let chatID = next.chatID, let url = KindredRoutes.chatURL(origin: current.origin, chatID: chatID) {
                        self.session(for: current).open(url)
                    }
                } catch { self.show(error.localizedDescription, error: true) }
            }
        }
    }

}

/// A background-time assertion that also ends itself if iOS runs out of time,
/// rather than letting the app be terminated.
@MainActor
private final class BackgroundTask {
    private var identifier = UIBackgroundTaskIdentifier.invalid

    init(name: String) {
        identifier = UIApplication.shared.beginBackgroundTask(withName: name) { [weak self] in
            MainActor.assumeIsolated { self?.end() }
        }
    }

    func end() {
        guard identifier != .invalid else { return }
        UIApplication.shared.endBackgroundTask(identifier)
        identifier = .invalid
    }
}

enum PushSetupError: LocalizedError {
    case buildNotConfigured
    case legacyAccount
    case server(PushServerStatus)
    case permissionDenied

    var errorDescription: String? {
        switch self {
        case .buildNotConfigured: return "This build of Kindred isn't configured for notifications."
        case .legacyAccount: return "Notifications need a Kindred account sign-in, not a legacy access token."
        case .server(let status): return status.message
        case .permissionDenied: return "Notifications are turned off for Kindred. You can turn them on in Settings."
        }
    }
}

extension AppModel: WebSessionHost {
    func webSession(_ session: WebSession, didReceive message: SessionMessage) {
        receive(message, from: session)
    }

    func webSessionRequestedAccounts(_ session: WebSession) {
        openAccounts(from: session)
    }

    func webSession(_ session: WebSession, show message: String, isError: Bool) {
        guard session.accountID == activeAccountID else { return }
        show(message, error: isError)
    }

    func webSession(_ session: WebSession, didDownload file: URL) {
        guard session.accountID == activeAccountID else { return }
        download = DownloadedFile(url: file)
    }
}
