import Foundation
import CoreFoundation

/// A page can advertise navigation eligibility, never request native input.
public struct WebNavigation: Equatable {
    public enum Target: String { case chatList = "chat-list", botChat = "bot-chat", none }
    public let target: Target
    public let revision: Double

    public init?(body: Any) {
        guard let body = body as? [String: Any],
              let name = body["target"] as? String, let target = Target(rawValue: name),
              let number = body["revision"] as? NSNumber,
              CFGetTypeID(number) != CFBooleanGetTypeID() else { return nil }
        let revision = number.doubleValue
        guard revision.isFinite, revision >= 0, revision <= 9_007_199_254_740_991,
              revision.rounded(.towardZero) == revision else { return nil }
        self.target = target
        self.revision = revision
    }
}

public enum WebEdgeBack {
    public enum Phase: String { case begin, update, finish, cancel }

    public static func shouldCommit(progress: Double, velocity: Double, cancelled: Bool = false) -> Bool {
        guard !cancelled, progress.isFinite, velocity.isFinite else { return false }
        return progress >= 0.35 || (progress >= 0.08 && velocity >= 700)
    }

    /// Guard again at execution time, including document identity in shared code.
    public static func script(origin: ServerOrigin, phase: Phase, id: UUID,
                              revision: Double, progress: Double, commit: Bool,
                              startXFraction: Double = 0, startYFraction: Double = 0) -> String {
        let progress = progress.isFinite ? min(1, max(0, progress)) : 0
        let x = startXFraction.isFinite ? min(1, max(0, startXFraction)) : 0
        let y = startYFraction.isFinite ? min(1, max(0, startYFraction)) : 0
        return """
        if (window.top !== window.self || window.location.origin !== \(WebBootstrap.javaScriptString(origin.serialized)) ||
            window.__KINDRED_MOBILE_PLATFORM !== "ios" || typeof window.__KINDRED_EDGE_BACK !== "function") return false;
        return window.__KINDRED_EDGE_BACK({phase:\(WebBootstrap.javaScriptString(phase.rawValue)),
          id:\(WebBootstrap.javaScriptString(id.uuidString)), revision:\(revision), progress:\(progress), commit:\(commit),
          x:\(x) * window.innerWidth, y:\(y) * window.innerHeight} ) === true;
        """
    }
}
