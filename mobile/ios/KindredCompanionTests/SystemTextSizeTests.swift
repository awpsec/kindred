import XCTest
import UIKit
@testable import KindredCompanion

@MainActor
final class SystemTextSizeTests: XCTestCase {
    func testLargeIsBaselineAndAllCategoriesRemainOrdered() {
        XCTAssertEqual(SystemTextSize.scale(for: .large), 1)
        let categories: [UIContentSizeCategory] = [
            .extraSmall, .small, .medium, .large, .extraLarge,
            .extraExtraLarge, .extraExtraExtraLarge, .accessibilityMedium,
            .accessibilityLarge, .accessibilityExtraLarge,
            .accessibilityExtraExtraLarge, .accessibilityExtraExtraExtraLarge,
        ]
        let scales = categories.map { SystemTextSize.scale(for: $0) }
        XCTAssertLessThan(scales[0], 1)
        for (smaller, larger) in zip(scales, scales.dropFirst()) {
            XCTAssertTrue(smaller.isFinite && smaller > 0)
            XCTAssertLessThan(smaller, larger)
        }
        XCTAssertGreaterThan(scales.last!, 3, "Largest accessibility size must not be capped at an app choice.")
    }
}
