import Foundation
import XCTest
@testable import KindredCore

final class WebNavigationTests: XCTestCase {
    func testEligibilityRequiresSafeNumericRevisionAndKnownTarget() {
        for target in ["chat-list", "bot-chat", "none"] {
            XCTAssertNotNil(WebNavigation(body: ["target": target, "revision": 0]))
        }
        for bad: Any in [true, -1, 0.5, Double.infinity, Double.nan, 9_007_199_254_740_992.0, "1", NSNull()] {
            XCTAssertNil(WebNavigation(body: ["target": "chat-list", "revision": bad]))
        }
        XCTAssertNil(WebNavigation(body: ["target": "history", "revision": 1]))
    }

    func testSwipeNeverCommitsShortBackwardCancelledOrInvalidInput() {
        XCTAssertTrue(WebEdgeBack.shouldCommit(progress: 0.35, velocity: 0))
        XCTAssertTrue(WebEdgeBack.shouldCommit(progress: 0.08, velocity: 700))
        XCTAssertFalse(WebEdgeBack.shouldCommit(progress: 0.079, velocity: 900))
        XCTAssertFalse(WebEdgeBack.shouldCommit(progress: 0.2, velocity: -900))
        XCTAssertFalse(WebEdgeBack.shouldCommit(progress: 1, velocity: 900, cancelled: true))
        XCTAssertFalse(WebEdgeBack.shouldCommit(progress: .nan, velocity: 900))
    }
}
