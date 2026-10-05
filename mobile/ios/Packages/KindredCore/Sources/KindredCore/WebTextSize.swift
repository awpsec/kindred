import Foundation

/// The iOS host supplies Dynamic Type as a ratio, not a page zoom. The shared
/// reading-size module applies it once to its existing text-scale CSS variable.
public enum WebTextSize {
    public static func script(origin: ServerOrigin, scale: Double) -> String {
        let value = scale.isFinite && scale > 0 ? scale : 1
        return """
        (function () {
          "use strict";
          if (window.top !== window.self) { return; }
          if (window.location.origin !== \(WebBootstrap.javaScriptString(origin.serialized))) { return; }
          if (!window.__KINDRED_MOBILE || window.__KINDRED_MOBILE_PLATFORM !== "ios") { return; }
          var scale = \(value);
          window.__KINDRED_SYSTEM_TEXT_SCALE = scale;
          window.dispatchEvent(new CustomEvent("kindred-system-text-size", { detail: { scale: scale } }));
        })();
        """
    }
}
