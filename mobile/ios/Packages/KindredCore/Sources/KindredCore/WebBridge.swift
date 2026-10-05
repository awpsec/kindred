import Foundation

/// Kindred session tokens are opaque bearer strings (currently 64 hex digits).
public enum SessionToken {
    public static func isValid(_ token: String) -> Bool {
        guard (16...512).contains(token.utf8.count) else { return false }
        return token.unicodeScalars.allSatisfy { scalar in
            let v = scalar.value
            return (0x30...0x39).contains(v) || (0x41...0x5A).contains(v) || (0x61...0x7A).contains(v)
                || v == 0x2D || v == 0x2E || v == 0x5F || v == 0x7E || v == 0x2B || v == 0x2F || v == 0x3D
        }
    }
}

/// Server profile IDs as accepted by the shared UI.
public enum ProfileIdentifier {
    public static func isValid(_ value: String) -> Bool {
        guard (1...160).contains(value.utf8.count) else { return false }
        return value.unicodeScalars.allSatisfy { $0.value > 0x20 && $0.value < 0x7F }
    }
}

/// `window.webkit.messageHandlers.kindredSession.postMessage({token, profile_id})`
/// from the shared UI (`ui/mobile.js`). An empty or null token means the page
/// signed out.
public enum SessionMessage: Equatable, Sendable {
    case session(token: String, profileID: String?)
    case signedOut

    public init?(body: Any) {
        guard let object = body as? [String: Any], object.keys.contains("token") else { return nil }
        let rawToken = object["token"]
        if rawToken == nil || rawToken is NSNull {
            self = .signedOut
            return
        }
        guard let token = rawToken as? String else { return nil }
        if token.isEmpty {
            self = .signedOut
            return
        }
        guard SessionToken.isValid(token) else { return nil }

        var profileID: String?
        if let rawProfile = object["profile_id"], !(rawProfile is NSNull) {
            guard let profile = rawProfile as? String else { return nil }
            if !profile.isEmpty {
                guard ProfileIdentifier.isValid(profile) else { return nil }
                profileID = profile
            }
        }
        self = .session(token: token, profileID: profileID)
    }
}

/// `window.webkit.messageHandlers.kindredAccounts.postMessage({action:"open"})`.
public enum AccountsMessage: Equatable, Sendable {
    case open

    public init?(body: Any) {
        guard let object = body as? [String: Any], let action = object["action"] as? String, action == "open" else {
            return nil
        }
        self = .open
    }
}

public enum WebBootstrap {
    public static let tokenKey = "kindred-token"

    /// Runs at document start in the page world, main frame only. It marks the
    /// page as hosted by the mobile app, removes any token a browser session
    /// may have left in localStorage, and seeds sessionStorage only when the
    /// page has no session yet. A page that already rotated its session (profile
    /// switch, web sign-in) keeps that newer token across reloads; the host also
    /// replaces this script whenever the persisted token changes.
    public static func documentStartScript(origin: ServerOrigin, token: String?, profileID: String? = nil) -> String {
        let tokenLiteral: String
        if let token, SessionToken.isValid(token) {
            tokenLiteral = javaScriptString(token)
        } else {
            tokenLiteral = "null"
        }
        return """
        (function () {
          "use strict";
          if (window.top !== window.self) { return; }
          if (window.location.origin !== \(javaScriptString(origin.serialized))) { return; }
          window.__KINDRED_MOBILE = true;
          window.__KINDRED_MOBILE_PLATFORM = "ios";
          window.__KINDRED_MOBILE_PROFILE = \(javaScriptString(profileID ?? ""));
          window.__KINDRED_NATIVE_SESSION_BOOTSTRAP = true;
          try {
            window.localStorage.removeItem(\(javaScriptString(tokenKey)));
            var token = \(tokenLiteral);
            if (token !== null && !window.sessionStorage.getItem(\(javaScriptString(tokenKey)))) {
              window.sessionStorage.setItem(\(javaScriptString(tokenKey)), token);
            }
          } catch (error) {}
        })();
        """
    }

    /// Function body for `callAsyncJavaScript` in an isolated content world, so
    /// page scripts cannot replace the functions it calls.
    public static let readSessionScript = """
    window.dispatchEvent(new Event('kindred-mobile-suspend'));
    return { origin: window.location.origin, token: window.sessionStorage.getItem("kindred-token") };
    """

    /// Validates the result of `readSessionScript` for `origin`.
    public static func sessionToken(fromReadResult result: Any?, origin: ServerOrigin) -> String? {
        guard let object = result as? [String: Any],
              let reportedOrigin = object["origin"] as? String, reportedOrigin == origin.serialized,
              let token = object["token"] as? String, SessionToken.isValid(token) else { return nil }
        return token
    }

    /// A double-quoted JavaScript string literal that cannot terminate early.
    public static func javaScriptString(_ value: String) -> String {
        var output = "\""
        for scalar in value.unicodeScalars {
            switch scalar {
            case "\"": output += "\\\""
            case "\\": output += "\\\\"
            case "\n": output += "\\n"
            case "\r": output += "\\r"
            case "\t": output += "\\t"
            case "<": output += "\\u003C"
            case ">": output += "\\u003E"
            case "\u{2028}": output += "\\u2028"
            case "\u{2029}": output += "\\u2029"
            default:
                if scalar.value < 0x20 || scalar.value == 0x7F {
                    output += String(format: "\\u%04X", scalar.value)
                } else {
                    output.unicodeScalars.append(scalar)
                }
            }
        }
        output += "\""
        return output
    }
}
