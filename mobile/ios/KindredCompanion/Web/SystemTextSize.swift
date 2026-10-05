import UIKit

/// Ask UIKit for every category, including the accessibility categories. Do
/// not duplicate Apple's point-size table or cap the user's preferred size.
@MainActor
enum SystemTextSize {
    static func scale(for category: UIContentSizeCategory) -> Double {
        let preferred = UIFont.preferredFont(forTextStyle: .body,
            compatibleWith: UITraitCollection(preferredContentSizeCategory: category))
        let baseline = UIFont.preferredFont(forTextStyle: .body,
            compatibleWith: UITraitCollection(preferredContentSizeCategory: .large))
        return Double(preferred.pointSize / baseline.pointSize)
    }

    static var currentScale: Double {
        scale(for: UIApplication.shared.preferredContentSizeCategory)
    }
}
