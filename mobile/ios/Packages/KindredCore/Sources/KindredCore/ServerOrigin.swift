import Foundation

/// One exact server origin. Transport is part of account and credential identity.
public struct ServerOrigin: Hashable, Sendable, CustomStringConvertible {
    public let scheme: String
    /// Canonical ASCII host, without IPv6 brackets.
    public let host: String
    public let port: Int?

    init(validatedHost host: String, port: Int?, scheme: String = "https") {
        self.scheme = scheme
        self.host = host
        self.port = port == (scheme == "http" ? 80 : 443) ? nil : port
    }

    public var isPrivateHTTP: Bool { scheme == "http" }
    public var serialized: String {
        let authority = host.contains(":") ? "[\(host)]" : host
        return "\(scheme)://\(authority)" + (port.map { ":\($0)" } ?? "")
    }
    public var description: String { serialized }
    public var displayName: String {
        if isPrivateHTTP { return serialized }
        let authority = host.contains(":") ? "[\(host)]" : host
        return authority + (port.map { ":\($0)" } ?? "")
    }
    public var rootURL: URL { URL(string: serialized + "/")! }
    public func url(path: String) -> URL? {
        guard path.hasPrefix("/"), !path.hasPrefix("//") else { return nil }
        return URL(string: serialized + path)
    }

    /// URL origin extraction allows existing HTTPS origins. HTTP requires a
    /// canonical private literal; DNS resolution never decides this policy.
    public init?(url: URL) {
        guard let scheme = url.scheme?.lowercased(), ["https", "http"].contains(scheme),
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              components.user == nil, components.password == nil,
              let rawHost = components.percentEncodedHost, let host = Self.canonicalHost(rawHost),
              scheme != "http" || Self.isPrivateLiteral(host) else { return nil }
        if let port = components.port, !(1...65535).contains(port) { return nil }
        self.init(validatedHost: host, port: components.port, scheme: scheme)
    }
    public func matches(_ url: URL?) -> Bool {
        guard let url, let other = ServerOrigin(url: url) else { return false }
        return other == self
    }
    public func matches(scheme otherScheme: String, host otherHost: String, port otherPort: Int) -> Bool {
        guard otherScheme.lowercased() == scheme, let canonical = Self.canonicalHost(otherHost),
              otherPort == 0 || (1...65535).contains(otherPort) else { return false }
        let defaultPort = scheme == "http" ? 80 : 443
        let normalized: Int? = (otherPort == 0 || otherPort == defaultPort) ? nil : otherPort
        return canonical == host && normalized == port
    }

    static func isPrivateLiteral(_ host: String) -> Bool {
        if host.contains(":") {
            // fd00::/8 only; mapped IPv4, fc00 and link-local are excluded.
            return HostClass.ipv6Bytes(host)?.first == 0xFD
        }
        let parts = host.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count == 4, parts.allSatisfy({ $0.allSatisfy(\.isASCIIDigit) && ($0 == "0" || !$0.hasPrefix("0")) }) else { return false }
        let values = parts.compactMap { UInt8($0) }
        guard values.count == 4 else { return false }
        return values[0] == 10 || (values[0] == 172 && (16...31).contains(values[1]))
            || (values[0] == 192 && values[1] == 168)
            || (values[0] == 100 && (64...127).contains(values[1]))
    }

    static func canonicalHost(_ raw: String) -> String? {
        var host = raw.lowercased()
        if host.hasPrefix("[") && host.hasSuffix("]") { host = String(host.dropFirst().dropLast()) }
        guard !host.isEmpty, host.utf8.count <= 253 else { return nil }
        if host.contains(":") {
            guard let bytes = HostClass.ipv6Bytes(host) else { return nil }
            let groups = stride(from: 0, to: 16, by: 2).map { UInt16(bytes[$0]) << 8 | UInt16(bytes[$0 + 1]) }
            var bestStart = 0, bestLength = 0, index = 0
            while index < 8 {
                guard groups[index] == 0 else { index += 1; continue }
                let start = index
                while index < 8 && groups[index] == 0 { index += 1 }
                if index - start > bestLength { bestStart = start; bestLength = index - start }
            }
            let text = groups.map { String($0, radix: 16) }
            if bestLength >= 2 {
                return text[..<bestStart].joined(separator: ":") + "::" + text[(bestStart + bestLength)...].joined(separator: ":")
            }
            return text.joined(separator: ":")
        }
        guard host.unicodeScalars.allSatisfy({ (0x61...0x7A).contains($0.value) || (0x30...0x39).contains($0.value) || $0 == "-" || $0 == "." }),
              !host.hasPrefix("."), !host.hasSuffix("."), !host.contains("..") else { return nil }
        let labels = host.split(separator: ".", omittingEmptySubsequences: false)
        guard labels.allSatisfy({ !$0.isEmpty && $0.utf8.count <= 63 && !$0.hasPrefix("-") && !$0.hasSuffix("-") }) else { return nil }
        return host
    }
}

extension ServerOrigin: Codable {
    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer(), value = try container.decode(String.self)
        // Legacy metadata without a scheme meant HTTPS. Never infer HTTP while
        // decoding saved accounts. Existing HTTPS loopback records are retained.
        let candidate = value.contains("://") ? value : "https://" + value
        guard let components = URLComponents(string: candidate),
              components.path.isEmpty || components.path == "/", components.query == nil, components.fragment == nil,
              let url = components.url, let origin = ServerOrigin(url: url) else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid server origin")
        }
        self = origin
    }
    public func encode(to encoder: Encoder) throws { var container = encoder.singleValueContainer(); try container.encode(serialized) }
}

public enum ServerAddressError: Error, Equatable, LocalizedError {
    case empty, invalid, insecureScheme, publicHTTP, unsupportedHTTPAddress, phoneLoopback, ipv6Brackets, invalidPort
    case credentials, path, query, fragment, privateConfirmation
    public var errorDescription: String? {
        switch self {
        case .empty: return "Enter your Kindred server's address."
        case .invalid: return "That doesn't look like a server address. Use a name such as kindred.example.com."
        case .insecureScheme: return "Names need HTTPS. Use the address's numbers, such as 100.101.102.103:9444, or your Tailscale HTTPS address."
        case .publicHTTP: return "This is a public address. Use an HTTPS address for public servers."
        case .unsupportedHTTPAddress: return "Use your computer's private IP address or its Tailscale HTTPS address."
        case .phoneLoopback: return "This address is only on this phone (localhost). Enter your computer's address."
        case .ipv6Brackets: return "Put IPv6 addresses in brackets, for example [fd7a::5]:9444."
        case .invalidPort: return "Port must be a number from 1 to 65535."
        case .credentials: return "Leave usernames and passwords out of the server address."
        case .path: return "Enter only the server address, without a path."
        case .query: return "Enter only the server address, without “?” parameters."
        case .fragment: return "Enter only the server address, without “#”."
        case .privateConfirmation: return "Confirm the private network address before connecting over HTTP."
        }
    }
}

public enum ServerAddress {
    public static func normalize(_ raw: String) throws -> ServerOrigin {
        let input = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !input.isEmpty else { throw ServerAddressError.empty }
        guard input.utf8.count <= 2048, input.unicodeScalars.allSatisfy({ $0.isASCII && $0.value >= 0x20 && $0.value != 0x7F && $0 != " " }), !input.contains("\\") else { throw ServerAddressError.invalid }
        if input.contains("@") { throw ServerAddressError.credentials }
        if input.contains("?") { throw ServerAddressError.query }
        if input.contains("#") { throw ServerAddressError.fragment }
        let explicitScheme: String?, tail: String
        if let separator = input.range(of: "://") {
            let scheme = input[..<separator.lowerBound].lowercased()
            guard scheme == "https" || scheme == "http" else { throw ServerAddressError.invalid }
            explicitScheme = scheme; tail = String(input[separator.upperBound...])
        } else {
            if input.lowercased().hasPrefix("http:") { throw ServerAddressError.insecureScheme }
            if input.lowercased().hasPrefix("https:") { throw ServerAddressError.invalid }
            explicitScheme = nil; tail = input
        }
        let pieces = tail.split(separator: "/", omittingEmptySubsequences: false)
        guard let first = pieces.first, !first.isEmpty else { throw ServerAddressError.invalid }
        guard pieces.count == 1 || (pieces.count == 2 && pieces[1].isEmpty) else { throw ServerAddressError.path }
        let authority = String(first), rawHost: String, portText: String?
        if authority.hasPrefix("[") {
            guard let end = authority.firstIndex(of: "]") else { throw ServerAddressError.ipv6Brackets }
            rawHost = String(authority[authority.index(after: authority.startIndex)..<end])
            guard rawHost.contains(":") else { throw ServerAddressError.invalid }
            let suffix = authority[authority.index(after: end)...]
            guard suffix.isEmpty || suffix.first == ":" else { throw ServerAddressError.invalid }
            portText = suffix.isEmpty ? nil : String(suffix.dropFirst())
        } else {
            guard !authority.contains("["), !authority.contains("]") else { throw ServerAddressError.invalid }
            guard authority.filter({ $0 == ":" }).count <= 1 else { throw ServerAddressError.ipv6Brackets }
            let parts = authority.split(separator: ":", omittingEmptySubsequences: false)
            rawHost = String(parts[0]); portText = parts.count == 2 ? String(parts[1]) : nil
        }
        let port: Int?
        if let portText {
            guard !portText.isEmpty, portText.allSatisfy(\.isASCIIDigit), let value = Int(portText), (1...65535).contains(value) else { throw ServerAddressError.invalidPort }
            port = value
        } else { port = nil }
        guard let host = ServerOrigin.canonicalHost(rawHost) else { throw ServerAddressError.invalid }
        guard HostClass.of(host) != .ambiguous else { throw ServerAddressError.invalid }
        guard HostClass.of(host) != .loopback else { throw ServerAddressError.phoneLoopback }
        let scheme = explicitScheme ?? (ServerOrigin.isPrivateLiteral(host) ? "http" : "https")
        if scheme == "http", !ServerOrigin.isPrivateLiteral(host) {
            if host.contains(":") {
                if host.hasPrefix("fc") || host.hasPrefix("fe8") || host.hasPrefix("fe9") || host.hasPrefix("fea") || host.hasPrefix("feb") || host.hasPrefix("::") { throw ServerAddressError.unsupportedHTTPAddress }
                throw ServerAddressError.publicHTTP
            }
            let labels = host.split(separator: ".")
            if labels.count == 4 && labels.allSatisfy({ UInt8($0) != nil }) {
                if labels[0] == "169" && labels[1] == "254" { throw ServerAddressError.unsupportedHTTPAddress }
                throw ServerAddressError.publicHTTP
            }
            throw ServerAddressError.insecureScheme
        }
        return ServerOrigin(validatedHost: host, port: port, scheme: scheme)
    }
}

/// A confirmation is tied to one origin; changing the scheme, host or port
/// requires another deliberate confirmation before native credentialed work.
public enum ServerConnectionConsent {
    public static func require(origin: ServerOrigin, confirmedPrivateOrigin: ServerOrigin?) throws {
        if origin.isPrivateHTTP && confirmedPrivateOrigin != origin { throw ServerAddressError.privateConfirmation }
    }
}

private extension Character {
    var isASCIIDigit: Bool { ("0"..."9").contains(self) }
}
