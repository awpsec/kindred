import Foundation

/// The HTTPS origin of one Kindred server. Accounts, web data, navigation and
/// credentialed requests are all scoped to exactly one origin.
public struct ServerOrigin: Hashable, Sendable, CustomStringConvertible {
    /// Lowercased ASCII host, without IPv6 brackets.
    public let host: String
    /// Explicit port, or nil for the HTTPS default.
    public let port: Int?

    init(validatedHost host: String, port: Int?) {
        self.host = host
        self.port = port == 443 ? nil : port
    }

    /// The origin exactly as a browser serializes `location.origin`.
    public var serialized: String {
        let authority = host.contains(":") ? "[\(host)]" : host
        if let port { return "https://\(authority):\(port)" }
        return "https://\(authority)"
    }

    public var description: String { serialized }

    /// Host and non-default port, for display.
    public var displayName: String {
        let authority = host.contains(":") ? "[\(host)]" : host
        if let port { return "\(authority):\(port)" }
        return authority
    }

    /// The server's root document.
    public var rootURL: URL {
        guard let url = URL(string: serialized + "/") else {
            preconditionFailure("A validated origin always forms a URL")
        }
        return url
    }

    /// An absolute URL on this origin. `path` must begin with "/".
    public func url(path: String) -> URL? {
        guard path.hasPrefix("/"), !path.hasPrefix("//") else { return nil }
        return URL(string: serialized + path)
    }

    /// The exact HTTPS origin of `url`, or nil for any other scheme, a URL
    /// carrying credentials, or an unusable host.
    public init?(url: URL) {
        guard url.scheme?.lowercased() == "https",
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              components.user == nil, components.password == nil,
              let rawHost = components.percentEncodedHost,
              let host = ServerOrigin.canonicalHost(rawHost) else { return nil }
        if let port = components.port, !(1...65535).contains(port) { return nil }
        self.init(validatedHost: host, port: components.port)
    }

    /// True only when `url` has exactly this origin.
    public func matches(_ url: URL?) -> Bool {
        guard let url, let other = ServerOrigin(url: url) else { return false }
        return other == self
    }

    /// Compares a WebKit security origin (`WKSecurityOrigin`), whose port is 0
    /// for the scheme default.
    public func matches(scheme: String, host otherHost: String, port otherPort: Int) -> Bool {
        guard scheme.lowercased() == "https",
              let canonical = ServerOrigin.canonicalHost(otherHost) else { return false }
        let normalizedPort: Int? = (otherPort == 0 || otherPort == 443) ? nil : otherPort
        return canonical == host && normalizedPort == port
    }

    /// Lowercases and validates a host. Accepts ASCII DNS names, IPv4 and
    /// bracketed or bare IPv6 literals; rejects zone IDs, percent-encoding,
    /// internationalized (non-punycode) names and empty labels.
    static func canonicalHost(_ raw: String) -> String? {
        var host = raw.lowercased()
        if host.hasPrefix("[") && host.hasSuffix("]") {
            host = String(host.dropFirst().dropLast())
        }
        guard !host.isEmpty, host.utf8.count <= 253 else { return nil }
        if host.contains(":") {
            let allowed = host.unicodeScalars.allSatisfy { scalar in
                scalar.isASCII && (scalar.properties.isASCIIHexDigit || scalar == ":" || scalar == ".")
            }
            return allowed ? host : nil
        }
        let allowed = host.unicodeScalars.allSatisfy { scalar in
            let value = scalar.value
            return (0x61...0x7A).contains(value) || (0x30...0x39).contains(value) || value == 0x2D || value == 0x2E
        }
        guard allowed, !host.hasPrefix("."), !host.hasSuffix("."), !host.contains("..") else { return nil }
        let labels = host.split(separator: ".", omittingEmptySubsequences: false)
        guard labels.allSatisfy({ !$0.isEmpty && $0.utf8.count <= 63 && !$0.hasPrefix("-") && !$0.hasSuffix("-") }) else {
            return nil
        }
        return host
    }
}

extension ServerOrigin: Codable {
    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let value = try container.decode(String.self)
        do {
            self = try ServerAddress.normalize(value)
        } catch {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid server origin")
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(serialized)
    }
}

public enum ServerAddressError: Error, Equatable, LocalizedError {
    case empty
    case invalid
    case insecureScheme
    case credentials
    case path
    case query
    case fragment

    public var errorDescription: String? {
        switch self {
        case .empty: return "Enter your Kindred server's address."
        case .invalid: return "That doesn't look like a server address. Use a name such as kindred.example.com."
        case .insecureScheme: return "Kindred for iOS connects over HTTPS only."
        case .credentials: return "Leave usernames and passwords out of the server address."
        case .path: return "Enter only the server address, without a path."
        case .query: return "Enter only the server address, without “?” parameters."
        case .fragment: return "Enter only the server address, without “#”."
        }
    }
}

public enum ServerAddress {
    /// Turns what someone typed into a canonical HTTPS origin. A missing scheme
    /// means HTTPS. Credentials, paths, queries and fragments are refused rather
    /// than silently dropped, so the saved server is exactly the one entered.
    public static func normalize(_ raw: String) throws -> ServerOrigin {
        let input = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !input.isEmpty else { throw ServerAddressError.empty }
        // Non-ASCII names must be entered in punycode so the saved origin is
        // exactly what WebKit and URLSession will compare.
        guard input.utf8.count <= 2048,
              input.unicodeScalars.allSatisfy({ $0.isASCII && $0.value >= 0x20 && $0.value != 0x7F && $0 != " " }),
              !input.contains("\\") else { throw ServerAddressError.invalid }
        if input.contains("@") { throw ServerAddressError.credentials }
        if input.contains("?") { throw ServerAddressError.query }
        if input.contains("#") { throw ServerAddressError.fragment }

        let candidate: String
        if let separator = input.range(of: "://") {
            let scheme = input[..<separator.lowerBound].lowercased()
            guard scheme == "https" else {
                throw scheme == "http" ? ServerAddressError.insecureScheme : ServerAddressError.invalid
            }
            candidate = "https://" + input[separator.upperBound...]
        } else {
            let lowered = input.lowercased()
            if lowered.hasPrefix("http:") { throw ServerAddressError.insecureScheme }
            if lowered.hasPrefix("https:") { throw ServerAddressError.invalid }
            candidate = "https://" + input
        }

        guard let components = URLComponents(string: candidate),
              let rawHost = components.percentEncodedHost, !rawHost.isEmpty else { throw ServerAddressError.invalid }
        if components.user != nil || components.password != nil { throw ServerAddressError.credentials }
        if components.query != nil { throw ServerAddressError.query }
        if components.fragment != nil { throw ServerAddressError.fragment }
        guard components.path.isEmpty || components.path == "/" else { throw ServerAddressError.path }
        if let port = components.port, !(1...65535).contains(port) { throw ServerAddressError.invalid }
        guard let host = ServerOrigin.canonicalHost(rawHost) else { throw ServerAddressError.invalid }
        return ServerOrigin(validatedHost: host, port: components.port)
    }
}
