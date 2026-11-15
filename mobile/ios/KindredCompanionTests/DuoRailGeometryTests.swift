import UIKit
import XCTest
@testable import Kindred

final class DuoRailGeometryTests: XCTestCase {
    func testSystemColumnWinsOverAsymmetricBarPadding() {
        let bounds = CGRect(x: 0, y: 0, width: 466, height: 678)
        let camera = CGRect(x: 399.6667, y: 29.3333, width: 37, height: 37)
        let status = CGRect(x: 382, y: 0, width: 84, height: 170)
        for barX: CGFloat in [390, 392, 394] {
            XCTAssertEqual(DuoRailGeometry.centerX(in: bounds,
                bar: CGRect(x: barX, y: 170, width: 52, height: 474),
                onLeft: false, edgeInset: 84, occlusions: [status, camera]), 418)
        }
    }

    func testColumnFollowsTheHardwareThroughRotation() {
        let bounds = CGRect(x: 0, y: 0, width: 678, height: 466)
        XCTAssertEqual(DuoRailGeometry.centerX(in: bounds,
            bar: CGRect(x: 602, y: 24, width: 52, height: 360), onLeft: false, edgeInset: 84,
            occlusions: [CGRect(x: 611.6667, y: 399.6667, width: 37, height: 37)]), 630)
        XCTAssertEqual(DuoRailGeometry.centerX(in: bounds,
            bar: CGRect(x: 24, y: 24, width: 52, height: 360), onLeft: true, edgeInset: 84,
            occlusions: [CGRect(x: 29.3333, y: 29.3333, width: 37, height: 37)]), 48)
    }

    func testUnrelatedOcclusionsDoNotChangeTheColumn() {
        XCTAssertEqual(DuoRailGeometry.centerX(in: CGRect(x: 0, y: 0, width: 466, height: 678),
            bar: CGRect(x: 392, y: 170, width: 52, height: 474), onLeft: false, edgeInset: 84,
            occlusions: [CGRect(x: 100, y: 100, width: 37, height: 37),
                         CGRect(x: 382, y: 0, width: 84, height: 170),
                         CGRect(x: 0, y: 440, width: 466, height: 238)]), 418)
    }
}
