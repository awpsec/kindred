import Foundation
#if canImport(Security)
import Security
#endif

/// Where session bearers live. Only the Keychain implementation ships.
public protocol SessionSecretStore: AnyObject {
    func token(for accountID: UUID) throws -> String?
    func setToken(_ token: String, for accountID: UUID) throws
    func deleteToken(for accountID: UUID) throws
}

/// For tests and previews.
public final class InMemorySecretStore: SessionSecretStore {
    public private(set) var tokens: [UUID: String] = [:]

    public init() {}

    public func token(for accountID: UUID) throws -> String? { tokens[accountID] }
    public func setToken(_ token: String, for accountID: UUID) throws { tokens[accountID] = token }
    public func deleteToken(for accountID: UUID) throws { tokens[accountID] = nil }
}

#if canImport(Security)
public struct KeychainError: Error, Equatable, LocalizedError {
    public let status: OSStatus

    public var errorDescription: String? {
        "The Keychain couldn't store the session (\(status))."
    }
}

/// Generic-password items, one per account, readable after first unlock and
/// never synced or restored to another device (`…ThisDeviceOnly`).
public final class KeychainSecretStore: SessionSecretStore {
    public let service: String

    public init(service: String) {
        self.service = service
    }

    private func query(_ accountID: UUID) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: accountID.uuidString.lowercased(),
            kSecUseDataProtectionKeychain as String: true,
        ]
    }

    public func token(for accountID: UUID) throws -> String? {
        var request = query(accountID)
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(request as CFDictionary, &item)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = item as? Data else { throw KeychainError(status: status) }
        return String(data: data, encoding: .utf8)
    }

    public func setToken(_ token: String, for accountID: UUID) throws {
        let attributes: [String: Any] = [
            kSecValueData as String: Data(token.utf8),
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        var status = SecItemUpdate(query(accountID) as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            var item = query(accountID)
            item.merge(attributes) { _, new in new }
            status = SecItemAdd(item as CFDictionary, nil)
        }
        guard status == errSecSuccess else { throw KeychainError(status: status) }
    }

    public func deleteToken(for accountID: UUID) throws {
        let status = SecItemDelete(query(accountID) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw KeychainError(status: status) }
    }

    /// The stored item's accessibility class, for tests.
    public func accessibility(for accountID: UUID) throws -> String? {
        var request = query(accountID)
        request[kSecReturnAttributes as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(request as CFDictionary, &item)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let attributes = item as? [String: Any] else { throw KeychainError(status: status) }
        return attributes[kSecAttrAccessible as String] as? String
    }
}
#endif
