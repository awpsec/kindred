import Foundation

/// How WebKit says a navigation started. Only `userLink` counts as the person
/// choosing to leave Kindred.
public enum NavigationTrigger: Sendable {
    case userLink
    case formSubmission
    case backForward
    case reload
    case other
}

public enum NavigationDecision: Equatable, Sendable {
    /// Load inside the account's web view.
    case allow
    /// Hand to the system (Safari, Mail, Phone); never loaded in the app.
    case openExternally(URL)
    /// Save locally through WKDownload.
    case download
    case refuse(NavigationRefusal)
}

public enum NavigationRefusal: Equatable, Sendable {
    case otherOrigin(host: String?)
    case insecure
    case unsupportedScheme(String)

    public var message: String {
        switch self {
        case .otherOrigin(let host):
            if let host, !host.isEmpty { return "Kindred blocked a page from \(host). Only your Kindred server opens here." }
            return "Kindred blocked a page from another site. Only your Kindred server opens here."
        case .insecure:
            return "Kindred blocked an insecure (HTTP) page."
        case .unsupportedScheme:
            return "Kindred can't open that kind of link."
        }
    }
}

/// Decides every navigation for one account's web view. The web view may only
/// show its own server origin; other sites open in the system browser and only
/// when the person tapped a link. Redirects, scripts and forms that would leave
/// the origin are refused.
public struct NavigationPolicy: Sendable {
    public let origin: ServerOrigin

    public init(origin: ServerOrigin) {
        self.origin = origin
    }

    static let systemSchemes: Set<String> = ["mailto", "tel", "sms", "facetime", "facetime-audio"]

    public func decide(url: URL?, isMainFrame: Bool, trigger: NavigationTrigger) -> NavigationDecision {
        guard let url, let scheme = url.scheme?.lowercased() else { return .refuse(.unsupportedScheme("")) }
        switch scheme {
        case "https":
            if origin.matches(url) { return .allow }
            return leaving(url, trigger: trigger, otherwise: .otherOrigin(host: url.host))
        case "http":
            return leaving(url, trigger: trigger, otherwise: .insecure)
        case "about":
            let value = url.absoluteString.lowercased()
            if value == "about:blank" || value == "about:srcdoc" { return .allow }
            return .refuse(.unsupportedScheme(scheme))
        case "blob":
            // Same-origin blobs back previews inside frames. A blob replacing the
            // whole app would strand the session, so the main frame refuses it.
            if !isMainFrame, blobMatchesOrigin(url) { return .allow }
            return .refuse(.unsupportedScheme(scheme))
        default:
            if NavigationPolicy.systemSchemes.contains(scheme), trigger == .userLink { return .openExternally(url) }
            return .refuse(.unsupportedScheme(scheme))
        }
    }

    /// `target=_blank` and `window.open`. WebKit only asks after a user gesture
    /// because the configuration blocks automatic windows.
    public func decideNewWindow(url: URL?) -> NavigationDecision {
        guard let url, let scheme = url.scheme?.lowercased() else { return .refuse(.unsupportedScheme("")) }
        if origin.matches(url) { return .allow }
        if scheme == "blob" { return blobMatchesOrigin(url) ? .download : .refuse(.unsupportedScheme(scheme)) }
        if scheme == "data" { return .download }
        if scheme == "https" || scheme == "http" || NavigationPolicy.systemSchemes.contains(scheme) {
            return .openExternally(url)
        }
        return .refuse(.unsupportedScheme(scheme))
    }

    /// Downloads may come from the server itself or from data the page built.
    public func allowsDownload(from url: URL?) -> Bool {
        guard let url, let scheme = url.scheme?.lowercased() else { return false }
        switch scheme {
        case "https": return origin.matches(url)
        case "blob": return blobMatchesOrigin(url)
        case "data": return true
        default: return false
        }
    }

    /// A main-frame response must still be this origin (redirect safety net).
    public func allowsMainFrameResponse(from url: URL?) -> Bool {
        guard let url else { return false }
        if url.scheme?.lowercased() == "about" { return true }
        return origin.matches(url)
    }

    private func leaving(_ url: URL, trigger: NavigationTrigger, otherwise refusal: NavigationRefusal) -> NavigationDecision {
        trigger == .userLink ? .openExternally(url) : .refuse(refusal)
    }

    private func blobMatchesOrigin(_ url: URL) -> Bool {
        let value = url.absoluteString
        guard value.lowercased().hasPrefix("blob:"), let inner = URL(string: String(value.dropFirst(5))) else { return false }
        return origin.matches(inner)
    }
}
