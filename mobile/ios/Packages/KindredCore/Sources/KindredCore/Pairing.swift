import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// A one-time phone pairing link issued by Kindred on a computer:
/// `kindred://pair?server=<percent-encoded explicit origin>#code=<64 hex>`.
///
/// Parsing never contacts the server. The person confirms `origin` before
/// `code` is sent anywhere, so an untrusted QR code cannot sign the app in to
/// an arbitrary endpoint on its own.
public struct PairingLink: Equatable, Sendable, CustomStringConvertible, CustomDebugStringConvertible {
    public let origin: ServerOrigin
    /// Lowercase hex. A bearer-equivalent secret until claimed: never log it.
    public let code: String

    public static let maximumLength = 2048
    static let codeLength = 64

    /// The secret is kept out of every string form.
    public var description: String { "kindred://pair?server=\(origin.serialized)#code=<redacted>" }
    public var debugDescription: String { description }

    public static func parse(_ raw: String) throws -> PairingLink {
        let input = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !input.isEmpty else { throw PairingLinkError.empty }
        guard input.utf8.count <= maximumLength,
              input.unicodeScalars.allSatisfy({ $0.isASCII && $0.value > 0x20 && $0.value != 0x7F }),
              let components = URLComponents(string: input),
              components.scheme?.lowercased() == "kindred" else { throw PairingLinkError.notPairingLink }
        guard components.host?.lowercased() == "pair", components.user == nil, components.password == nil,
              components.port == nil, components.percentEncodedPath.isEmpty || components.percentEncodedPath == "/" else {
            throw PairingLinkError.notPairingLink
        }

        guard let items = components.queryItems, items.count == 1, let item = items.first, item.name == "server",
              let server = item.value, !server.isEmpty else { throw PairingLinkError.invalidServer }
        if items.contains(where: { $0.name == "code" }) { throw PairingLinkError.invalidCode }
        // Manual entry may omit the scheme; a pairing link names it explicitly.
        guard server.lowercased().hasPrefix("https://") || server.lowercased().hasPrefix("http://") else {
            throw PairingLinkError.invalidServer
        }
        let origin: ServerOrigin
        do {
            origin = try ServerAddress.normalize(server)
        } catch ServerAddressError.phoneLoopback {
            throw PairingLinkError.loopbackServer
        } catch ServerAddressError.insecureScheme {
            throw PairingLinkError.insecureServer
        } catch ServerAddressError.publicHTTP {
            throw PairingLinkError.insecureServer
        } catch ServerAddressError.unsupportedHTTPAddress {
            throw PairingLinkError.insecureServer
        } catch {
            throw PairingLinkError.invalidServer
        }
        switch HostClass.of(origin.host) {
        case .loopback: throw PairingLinkError.loopbackServer
        case .ambiguous: throw PairingLinkError.invalidServer
        case .routable: break
        }

        guard let fragment = components.percentEncodedFragment, fragment.hasPrefix("code=") else {
            throw PairingLinkError.invalidCode
        }
        let code = String(fragment.dropFirst(5))
        guard code.utf8.count == codeLength, code.unicodeScalars.allSatisfy({ $0.properties.isASCIIHexDigit }) else {
            throw PairingLinkError.invalidCode
        }
        return PairingLink(origin: origin, code: code.lowercased())
    }

    /// Whether `raw` is at least shaped like a Kindred pairing link, so a
    /// scanner can tell "someone else's QR code" from "a broken Kindred code".
    public static func looksLikePairingLink(_ raw: String) -> Bool {
        let lowered = raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return lowered.hasPrefix("kindred://pair")
    }
}

public enum PairingLinkError: Error, Equatable, LocalizedError {
    case empty
    case notPairingLink
    case invalidServer
    case insecureServer
    case loopbackServer
    case invalidCode

    public var errorDescription: String? {
        switch self {
        case .empty: return "Paste the pairing link from Kindred on your computer."
        case .notPairingLink: return "That isn't a Kindred pairing code."
        case .invalidServer: return "This pairing code doesn't contain a usable server address."
        case .insecureServer: return "This pairing code needs HTTPS or a supported private IP address."
        case .loopbackServer:
            return "This code points to localhost, which a phone can't reach. Create it with the computer's reachable private IP or HTTPS address instead."
        case .invalidCode: return "This pairing code is incomplete. Create a new code on your computer and scan it again."
        }
    }
}

/// Classifies a canonical host (lowercase, IPv6 without brackets).
enum HostClass: Equatable {
    case routable
    /// Loopback or unspecified: on a phone this is the phone itself.
    case loopback
    /// Numeric forms resolvers read differently (`127.1`, `0x7f.0.0.1`, `2130706433`).
    case ambiguous

    static func of(_ host: String) -> HostClass {
        if host == "localhost" || host.hasSuffix(".localhost") { return .loopback }
        if host.contains(":") {
            guard let bytes = ipv6Bytes(host) else { return .ambiguous }
            let prefix = bytes[0..<10]
            if bytes[0..<15].allSatisfy({ $0 == 0 }) && (bytes[15] == 0 || bytes[15] == 1) { return .loopback }
            // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d) forms.
            if prefix.allSatisfy({ $0 == 0 }) && ((bytes[10] == 0xFF && bytes[11] == 0xFF) || (bytes[10] == 0 && bytes[11] == 0)) {
                return ipv4Class(Array(bytes[12..<16]))
            }
            return .routable
        }
        let labels = host.split(separator: ".", omittingEmptySubsequences: false)
        let numeric = labels.allSatisfy { label in
            !label.isEmpty && (label.allSatisfy(\.isASCIIDigit) || label.hasPrefix("0x"))
        }
        guard numeric else { return .routable }
        // Only canonical dotted-quad IPv4 is accepted.
        let octets = labels.compactMap { UInt8($0) }
        guard labels.count == 4, octets.count == 4,
              labels.allSatisfy({ $0.allSatisfy(\.isASCIIDigit) && ($0 == "0" || !$0.hasPrefix("0")) }) else { return .ambiguous }
        return ipv4Class(octets)
    }

    private static func ipv4Class(_ octets: [UInt8]) -> HostClass {
        if octets[0] == 127 || octets.allSatisfy({ $0 == 0 }) { return .loopback }
        return .routable
    }

    /// RFC 4291 text form, including `::` and a trailing dotted IPv4.
    static func ipv6Bytes(_ text: String) -> [UInt8]? {
        guard !text.contains("%"), text.components(separatedBy: "::").count <= 2 else { return nil }
        func groups(_ part: Substring, allowIPv4: Bool) -> [UInt16]? {
            if part.isEmpty { return [] }
            var result: [UInt16] = []
            let pieces = part.split(separator: ":", omittingEmptySubsequences: false)
            for (index, piece) in pieces.enumerated() {
                if allowIPv4 && index == pieces.count - 1 && piece.contains(".") {
                    let octets = piece.split(separator: ".", omittingEmptySubsequences: false)
                    guard octets.count == 4 else { return nil }
                    var values: [UInt16] = []
                    for octet in octets {
                        guard !octet.isEmpty, octet.count <= 3, octet.allSatisfy(\.isASCIIDigit),
                              let value = UInt16(octet), value <= 255 else { return nil }
                        values.append(value)
                    }
                    result.append(values[0] << 8 | values[1])
                    result.append(values[2] << 8 | values[3])
                } else {
                    guard (1...4).contains(piece.count), let value = UInt16(piece, radix: 16) else { return nil }
                    result.append(value)
                }
            }
            return result
        }
        let halves = text.components(separatedBy: "::")
        var words: [UInt16]
        if halves.count == 2 {
            guard let head = groups(Substring(halves[0]), allowIPv4: false),
                  let tail = groups(Substring(halves[1]), allowIPv4: true),
                  head.count + tail.count <= 7 else { return nil }
            words = head + Array(repeating: 0, count: 8 - head.count - tail.count) + tail
        } else {
            guard let all = groups(Substring(text), allowIPv4: true), all.count == 8 else { return nil }
            words = all
        }
        return words.flatMap { [UInt8($0 >> 8), UInt8($0 & 0xFF)] }
    }
}

private extension Character {
    var isASCIIDigit: Bool { ("0"..."9").contains(self) }
}

/// What `POST /identity/mobile-pairing/claim` returned.
public struct PairingClaim: Equatable, Sendable, CustomStringConvertible, CustomDebugStringConvertible {
    public let token: String
    public let profileID: String
    /// Canonical lowercase UUID.
    public let serverAccountID: String
    public let login: String

    public var description: String { "PairingClaim(account: \(serverAccountID), profile: \(profileID), token: <redacted>)" }
    public var debugDescription: String { description }

    /// The fresh session must belong to the account and profile the code was
    /// issued for before anything is saved.
    public func isConfirmed(by identity: IdentitySummary) -> Bool {
        guard !identity.legacy, identity.serverAccountID == serverAccountID,
              let username = identity.username, username.lowercased() == login.lowercased() else { return false }
        if let active = identity.activeProfileID, active != profileID { return false }
        return true
    }
}

/// Why pairing stopped. Nothing here is retried automatically.
public enum PairingError: Error, Equatable, LocalizedError {
    /// No HTTP response before the code was sent: offline, DNS, refused,
    /// timeout or TLS failure. The code is unspent.
    case unreachable(detail: String)
    /// The connection failed after the code was sent. The server may have
    /// consumed it, so the same code must not be offered again.
    case claimUnconfirmed(detail: String)
    case notKindredServer
    case redirected
    /// Invalid, expired or already used. A new code is needed.
    case codeRejected
    /// The server predates phone pairing.
    case unsupported
    case rateLimited
    case server(String)
    case invalidResponse
    /// The new session did not match the account the code named.
    case accountMismatch
    case storage(String)

    public var title: String {
        switch self {
        case .unreachable: return "Could not connect to server"
        case .claimUnconfirmed: return "Pairing wasn't confirmed"
        case .codeRejected: return "This pairing code can't be used"
        case .unsupported: return "Pairing isn't available on this server"
        default: return "Couldn't add the account"
        }
    }

    public var errorDescription: String? {
        switch self {
        case .unreachable: return "Your phone couldn't reach this server."
        case .claimUnconfirmed: return "The connection dropped after the code was sent, so it may already be used. Create a new code and scan it."
        case .notKindredServer: return "That address didn't answer like a Kindred server, so the pairing code wasn't sent."
        case .redirected: return "The server tried to redirect the request, so Kindred stopped. Pairing works only with the server's final server address."
        case .codeRejected: return "It's invalid, expired or already used. Create a new code in Kindred on your computer, then scan it."
        case .unsupported: return "This server doesn't support phone pairing yet. Update Kindred on the server, or sign in with your username and password."
        case .rateLimited: return "Too many pairing attempts. Wait a minute, then create a new code."
        case .server(let message): return message
        case .invalidResponse: return "The server sent a pairing response Kindred couldn't use. Nothing was saved."
        case .accountMismatch: return "The server's session didn't match the account in the code. Nothing was saved."
        case .storage(let message): return "Kindred couldn't save this sign-in securely: \(message)"
        }
    }

    /// Show the expandable connection checklist.
    public var showsConnectionHelp: Bool {
        switch self {
        case .unreachable, .claimUnconfirmed: return true
        default: return false
        }
    }

    /// Repeating the same code is offered only when it was never sent. The
    /// person chooses to; the app never does.
    public var allowsManualRetry: Bool {
        if case .unreachable = self { return true }
        return false
    }

    /// After the code is sent, a lost connection leaves its outcome unknown.
    public static func afterCodeSent(_ error: Error) -> PairingError {
        if case .unreachable(let detail) = from(error) { return .claimUnconfirmed(detail: detail) }
        return from(error)
    }

    /// Meta and identity calls reuse the general API client's errors.
    public static func from(_ error: Error) -> PairingError {
        if let error = error as? PairingError { return error }
        switch error as? KindredAPIError {
        case .transport(let detail)?: return .unreachable(detail: detail)
        case .redirectRefused?: return .redirected
        case .notKindredServer?, .notFound?: return .notKindredServer
        case .server(let message)?: return .server(message)
        case .http(let code)?: return .server("The server returned an error (\(code)).")
        case .unauthorized?, .invalidResponse?, nil: return .invalidResponse
        }
    }

    /// Steps shown under "Help" for connection failures.
    public static let connectionChecklist: [String] = [
        "Kindred is running and the computer is awake.",
        "For direct network access, Server admin › Network listens on All interfaces.",
        "This HTTPS address is trusted and listed in Server admin › Network › Connection addresses.",
        "Your phone is on the same network, or its VPN (such as Tailscale) is on.",
    ]
}

extension KindredRequests {
    /// No Origin, cookies or Authorization: the one-time code is the credential.
    public static func claimPairing(_ link: PairingLink) throws -> URLRequest {
        make("POST", link.origin, "/identity/mobile-pairing/claim", body: try json(["code": link.code]))
    }
}

public enum PairingResponse {
    /// Maps the claim response. Separate from transport so it is testable.
    public static func claim(request: URLRequest, response: HTTPURLResponse, data: Data) throws -> PairingClaim {
        guard let requestURL = request.url, let origin = ServerOrigin(url: requestURL) else { throw PairingError.invalidResponse }
        guard origin.matches(response.url ?? requestURL) else { throw PairingError.redirected }
        let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        let message = KindredAPIClient.serverMessage(data)
        switch response.statusCode {
        case 200..<300:
            break
        case 300..<400:
            throw PairingError.redirected
        case 400, 401, 403, 409, 410, 422:
            throw PairingError.codeRejected
        case 404:
            // A missing route has no Kindred error body; a rejected code does.
            throw message == nil ? PairingError.unsupported : PairingError.codeRejected
        case 429:
            throw PairingError.rateLimited
        default:
            throw PairingError.server(message ?? "The server returned an error (\(response.statusCode)).")
        }
        guard let object,
              let token = object["token"] as? String, SessionToken.isValid(token),
              let profile = object["profile_id"] as? String, ProfileIdentifier.isValid(profile),
              let account = (object["account_id"] as? String).flatMap(PushPayload.canonicalUUID),
              let login = (object["login"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines),
              !login.isEmpty, login.count <= 80 else { throw PairingError.invalidResponse }
        return PairingClaim(token: token, profileID: profile, serverAccountID: account, login: login.lowercased())
    }
}

extension KindredAPIClient {
    /// Spends the one-time code. Call only after the person confirmed the
    /// server and `verifyKindredServer` succeeded.
    public func claimPairing(_ link: PairingLink) async throws -> PairingClaim {
        let request = try KindredRequests.claimPairing(link)
        let data: Data
        let response: HTTPURLResponse
        do {
            (data, response) = try await send(request)
        } catch {
            throw PairingError.afterCodeSent(error)
        }
        return try PairingResponse.claim(request: request, response: response, data: data)
    }
}

extension AccountGrouping {
    /// The saved account a pairing refreshes. A matching server account ID
    /// comes first; older saves without one match by login.
    public static func existing(in accounts: [Account], origin: ServerOrigin, serverAccountID: String, login: String) -> Account? {
        if let match = accounts.first(where: { $0.origin == origin && $0.serverAccountID == serverAccountID }) { return match }
        let key = login.lowercased()
        return accounts.first { $0.origin == origin && $0.serverAccountID == nil && $0.login.lowercased() == key }
    }
}
