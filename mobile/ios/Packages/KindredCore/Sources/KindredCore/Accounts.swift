import Foundation

/// One saved sign-in. This is metadata only; the session bearer lives in the
/// Keychain under `id`, and web data lives in `WKWebsiteDataStore(forIdentifier: id)`.
public struct Account: Codable, Hashable, Identifiable, Sendable {
    /// Local identifier: Keychain item, web data store and registration owner.
    public let id: UUID
    public var origin: ServerOrigin
    public var login: String
    /// The server's account UUID (`/identity/profiles` → `account_id`); push
    /// registrations and payloads use it.
    public var serverAccountID: String?
    public var profileID: String?
    public var profileName: String?
    public var createdAt: Date
    public var lastUsedAt: Date
    public var push: PushRegistration

    public init(id: UUID = UUID(), origin: ServerOrigin, login: String, now: Date = Date()) {
        self.id = id
        self.origin = origin
        self.login = login
        self.createdAt = now
        self.lastUsedAt = now
        self.push = PushRegistration()
    }

    public var title: String {
        if let profileName, !profileName.trimmingCharacters(in: .whitespaces).isEmpty { return profileName }
        return login
    }

    public var initial: String {
        guard let first = title.trimmingCharacters(in: .whitespaces).first else { return "K" }
        return String(first).uppercased()
    }
}

public struct PushRegistration: Codable, Hashable, Sendable {
    /// Per-account installation UUID used in `/api/mobile/devices/{id}`.
    /// Separate IDs keep two accounts (or servers) from overwriting or
    /// correlating each other's registration.
    public var installationID: UUID
    /// The person asked for alerts on this account.
    public var wanted: Bool
    public var state: PushRegistrationState

    public init(installationID: UUID = UUID(), wanted: Bool = false, state: PushRegistrationState = .notRegistered) {
        self.installationID = installationID
        self.wanted = wanted
        self.state = state
    }

    /// Whether a server-side registration might exist and must be deleted
    /// before credentials are discarded.
    public var mayExistOnServer: Bool {
        switch state {
        case .notRegistered, .endedWithSession: return false
        case .registered, .failed, .removalUnconfirmed: return true
        }
    }
}

public enum PushRegistrationState: Codable, Hashable, Sendable {
    case notRegistered
    /// The server accepted this device token for this account.
    case registered(token: String, environment: APNsEnvironment, at: Date)
    /// The last registration attempt failed; it may or may not exist.
    case failed(message: String, at: Date)
    /// Removal was requested but the server did not confirm it.
    case removalUnconfirmed(message: String, at: Date)
    /// The web page signed out before native removal could run. Servers with
    /// mobile push drop registrations bound to an ended session, but this
    /// device did not confirm it.
    case endedWithSession(at: Date)
}

public struct AccountsSnapshot: Codable, Equatable, Sendable {
    public var version: Int
    public var accounts: [Account]
    public var activeAccountID: UUID?
    /// Web data stores still to delete (they can't be removed while in use).
    public var pendingDataRemovals: [UUID]

    public init(accounts: [Account] = [], activeAccountID: UUID? = nil, pendingDataRemovals: [UUID] = []) {
        self.version = 1
        self.accounts = accounts
        self.activeAccountID = activeAccountID
        self.pendingDataRemovals = pendingDataRemovals
    }
}

/// JSON file in Application Support. Contains no secrets.
public final class AccountRepository {
    public let fileURL: URL

    public init(fileURL: URL) {
        self.fileURL = fileURL
    }

    public static func defaultLocation() throws -> URL {
        let support = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask,
                                                  appropriateFor: nil, create: true)
        return support.appendingPathComponent("Kindred", isDirectory: true).appendingPathComponent("accounts.json")
    }

    public func load() throws -> AccountsSnapshot {
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return AccountsSnapshot() }
        let data = try Data(contentsOf: fileURL)
        return try AccountRepository.decoder().decode(AccountsSnapshot.self, from: data)
    }

    public func save(_ snapshot: AccountsSnapshot) throws {
        try FileManager.default.createDirectory(at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        let data = try AccountRepository.encoder().encode(snapshot)
        #if os(iOS)
        try data.write(to: fileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        // Installation IDs and registration state belong to this device; a
        // restore onto another phone must not reuse them.
        var url = fileURL
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try url.setResourceValues(values)
        #else
        try data.write(to: fileURL, options: [.atomic])
        #endif
    }

    /// Moves an unreadable file aside instead of overwriting it.
    @discardableResult
    public func quarantine(now: Date = Date()) -> URL? {
        let stamp = Int(now.timeIntervalSince1970)
        let destination = fileURL.deletingLastPathComponent().appendingPathComponent("accounts.unreadable-\(stamp).json")
        do {
            try FileManager.default.moveItem(at: fileURL, to: destination)
            return destination
        } catch {
            return nil
        }
    }

    static func encoder() -> JSONEncoder {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }

    static func decoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }
}

public struct ServerGroup: Identifiable, Equatable, Sendable {
    public let origin: ServerOrigin
    public let accounts: [Account]
    public var id: String { origin.serialized }
}

public enum AccountGrouping {
    /// Servers alphabetically, accounts by title within each.
    public static func groups(_ accounts: [Account]) -> [ServerGroup] {
        let byOrigin = Dictionary(grouping: accounts, by: \.origin)
        return byOrigin.keys
            .sorted { $0.displayName.localizedStandardCompare($1.displayName) == .orderedAscending }
            .map { origin in
                let sorted = (byOrigin[origin] ?? []).sorted {
                    let order = $0.title.localizedStandardCompare($1.title)
                    return order == .orderedSame ? $0.createdAt < $1.createdAt : order == .orderedAscending
                }
                return ServerGroup(origin: origin, accounts: sorted)
            }
    }

    /// The saved account a sign-in belongs to: same origin and login
    /// (the server lowercases logins).
    public static func existing(in accounts: [Account], origin: ServerOrigin, login: String) -> Account? {
        let key = login.lowercased()
        return accounts.first { $0.origin == origin && $0.login.lowercased() == key }
    }

    /// Select the exact installation, including when a backend was cloned.
    /// Older payloads without that ID are usable only when the account is unique.
    public static func account(forServerAccountID id: String, installationID: UUID? = nil, in accounts: [Account]) -> Account? {
        let matches = accounts.filter { $0.serverAccountID == id && (installationID == nil || $0.push.installationID == installationID) }
        return matches.count == 1 ? matches.first : nil
    }
}
