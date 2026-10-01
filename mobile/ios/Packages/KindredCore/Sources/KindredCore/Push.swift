import Foundation

/// Which APNs gateway issued the device token. Comes from the build's
/// `aps-environment` entitlement value, never from code.
public enum APNsEnvironment: String, Codable, Hashable, Sendable {
    case sandbox
    case production

    /// Accepts the entitlement spelling ("development"/"production") or the
    /// server spelling ("sandbox"/"production").
    public init?(configurationValue raw: String?) {
        switch raw?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "development", "sandbox": self = .sandbox
        case "production": self = .production
        default: return nil
        }
    }
}

public enum APNsToken {
    public static func hex(_ data: Data) -> String {
        let digits = Array("0123456789abcdef".utf8)
        var output = [UInt8]()
        output.reserveCapacity(data.count * 2)
        for byte in data {
            output.append(digits[Int(byte >> 4)])
            output.append(digits[Int(byte & 0x0F)])
        }
        return String(decoding: output, as: UTF8.self)
    }
}

/// A tapped notification. Kindred payloads carry identifiers only; the alert
/// text is generic and the content is fetched by the web UI after unlock.
public struct PushRoute: Equatable, Sendable {
    /// The server-side account UUID the alert is for.
    public let serverAccountID: String
    public let installationID: UUID?
    public let profileID: String?
    public let chatID: String?
    public let eventID: String?

    public init(serverAccountID: String, chatID: String?, eventID: String?, installationID: UUID? = nil, profileID: String? = nil) {
        self.serverAccountID = serverAccountID
        self.installationID = installationID
        self.profileID = profileID
        self.chatID = chatID
        self.eventID = eventID
    }
}

public enum PushPayload {
    public static func route(from userInfo: [AnyHashable: Any]) -> PushRoute? {
        guard let rawAccount = userInfo["account_id"] as? String,
              let account = canonicalUUID(rawAccount) else { return nil }
        var installation: UUID?
        if let raw = userInfo["installation_uuid"] {
            guard let value = raw as? String, let canonical = canonicalUUID(value), let parsed = UUID(uuidString: canonical) else { return nil }
            installation = parsed
        }
        return PushRoute(
            serverAccountID: account,
            chatID: (userInfo["chat_id"] as? String).flatMap { KindredRoutes.isValidChatID($0) ? $0 : nil },
            eventID: (userInfo["event_id"] as? String).flatMap { isValidEventID($0) ? $0 : nil },
            installationID: installation,
            profileID: (userInfo["profile_id"] as? String).flatMap { KindredRoutes.isValidChatID($0) ? $0 : nil }
        )
    }

    /// Lowercased hyphenated UUID, or nil.
    public static func canonicalUUID(_ raw: String) -> String? {
        guard raw.utf8.count == 36, let uuid = UUID(uuidString: raw) else { return nil }
        return uuid.uuidString.lowercased()
    }

    static func isValidEventID(_ value: String) -> Bool {
        (1...32).contains(value.utf8.count) && value.unicodeScalars.allSatisfy { (0x30...0x39).contains($0.value) }
    }
}

public enum KindredRoutes {
    /// Matches the shared UI's `mobileRequestedChat` rule.
    public static func isValidChatID(_ value: String) -> Bool {
        guard (1...160).contains(value.utf8.count) else { return false }
        return value.unicodeScalars.allSatisfy { scalar in
            let v = scalar.value
            return (0x30...0x39).contains(v) || (0x41...0x5A).contains(v) || (0x61...0x7A).contains(v) || v == 0x2D
        }
    }

    /// `https://server/#kindred-chat=<id>`; the shared UI opens the chat on load
    /// or `hashchange` and then clears the fragment.
    public static func chatURL(origin: ServerOrigin, chatID: String) -> URL? {
        guard isValidChatID(chatID) else { return nil }
        return URL(string: origin.serialized + "/#kindred-chat=" + percentEncode(chatID))
    }

    /// RFC 3986 unreserved characters pass through; everything else is %XX.
    public static func percentEncode(_ value: String) -> String {
        var output = ""
        for byte in value.utf8 {
            let unreserved = (0x30...0x39).contains(byte) || (0x41...0x5A).contains(byte) || (0x61...0x7A).contains(byte)
                || byte == 0x2D || byte == 0x2E || byte == 0x5F || byte == 0x7E
            if unreserved {
                output.unicodeScalars.append(Unicode.Scalar(byte))
            } else {
                output += String(format: "%%%02X", byte)
            }
        }
        return output
    }
}

/// What `GET /api/mobile/push-status` says about iOS delivery.
public enum PushServerStatus: Equatable, Sendable {
    case configured
    case notConfigured
    /// The server predates mobile push (404).
    case unsupported
    case unrecognized

    /// `{"enabled":bool,"platforms":{"ios":bool,"android":bool},"registered"?:bool}`
    public static func parse(_ data: Data) -> (status: PushServerStatus, registered: Bool?) {
        guard let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else {
            return (.unrecognized, nil)
        }
        let registered = object["registered"] as? Bool
        if let platforms = object["platforms"] as? [String: Any], let ios = platforms["ios"] as? Bool {
            return (ios ? .configured : .notConfigured, registered)
        }
        return (.unrecognized, registered)
    }

    public var message: String {
        switch self {
        case .configured: return "This server can send iOS notifications."
        case .notConfigured: return "This server hasn't been set up to send iOS notifications."
        case .unsupported: return "This server doesn't offer mobile notifications yet."
        case .unrecognized: return "This server's notification status couldn't be read."
        }
    }
}

public enum RetrySchedule {
    /// 30 s, 60 s, 2 min, … capped at 30 min.
    public static func delay(attempt: Int) -> TimeInterval {
        let exponent = min(max(attempt, 0), 6)
        return min(30 * pow(2, Double(exponent)), 1800)
    }
}

public enum DownloadNaming {
    /// A single safe path component for a suggested download name.
    public static func safeFilename(_ suggested: String) -> String {
        var name = ""
        for scalar in suggested.unicodeScalars {
            if scalar == "/" || scalar == "\\" || scalar == ":" || scalar.value < 0x20 || scalar.value == 0x7F {
                name.unicodeScalars.append("_")
            } else {
                name.unicodeScalars.append(scalar)
            }
        }
        name = name.trimmingCharacters(in: CharacterSet(charactersIn: ". ").union(.whitespacesAndNewlines))
        if name.count > 120 {
            let ext = NSString(string: name).pathExtension
            let keep = ext.isEmpty || ext.count > 10 ? 120 : 119 - ext.count
            name = String(name.prefix(keep)) + (ext.isEmpty || ext.count > 10 ? "" : "." + ext)
        }
        return name.isEmpty ? "download" : name
    }
}
