import XCTest
import CoreGraphics
@testable import Kindred

final class DisplayCornerContourTests: XCTestCase {
    private func path(_ commands: [[Double]]) -> CGPath {
        let path = CGMutablePath()
        for c in commands {
            func point(_ index: Int) -> CGPoint { CGPoint(x: c[index], y: c[index + 1]) }
            switch c[0] {
            case 0: path.move(to: point(1))
            case 1: path.addLine(to: point(1))
            case 2: path.addQuadCurve(to: point(3), control: point(1))
            case 3: path.addCurve(to: point(5), control1: point(1), control2: point(3))
            case 4: path.closeSubpath()
            default: XCTFail("Unexpected path command")
            }
        }
        return path
    }

    func testOpenAndRotatedCoverFollowTheirIndependentPhysicalCorners() {
        let rect = CGRect(x: 0, y: 0, width: 678, height: 466)
        for radii in [
            ["topLeft": 55.0, "topRight": 55, "bottomLeft": 55, "bottomRight": 55],
            ["topLeft": 8.0, "topRight": 59, "bottomLeft": 8, "bottomRight": 59],
            ["topLeft": 8.0, "topRight": 8, "bottomLeft": 59, "bottomRight": 59],
            ["topLeft": 59.0, "topRight": 8, "bottomLeft": 59, "bottomRight": 8],
            ["topLeft": 59.0, "topRight": 59, "bottomLeft": 8, "bottomRight": 8]
        ] {
            let commands = DisplayCornerContour.commands(in: rect, radii: radii)
            XCTAssertTrue(commands.count < 128 && !commands.isEmpty)
            XCTAssertTrue(commands.flatMap { $0 }.allSatisfy(\.isFinite))
            let contour = path(commands)
            XCTAssertEqual(contour.boundingBoxOfPath, rect.insetBy(dx: 8, dy: 8))
            for (name, point) in [
                ("topLeft", CGPoint(x: 12, y: 12)), ("topRight", CGPoint(x: 666, y: 12)),
                ("bottomLeft", CGPoint(x: 12, y: 454)), ("bottomRight", CGPoint(x: 666, y: 454))
            ] {
                XCTAssertEqual(contour.contains(point), radii[name] == 8, name)
            }
            XCTAssertTrue(contour.contains(CGPoint(x: 40, y: 40)), "the avatar's inset remains usable")
        }
    }

    func testPhysicalBottomDoesNotBecomeTheKeyboardEdge() {
        let fullHost = CGRect(x: 0, y: 0, width: 466, height: 678)
        let contour = path(DisplayCornerContour.commands(in: fullHost, radii: ["topLeft": 8, "bottomLeft": 8, "topRight": 59, "bottomRight": 59]))
        XCTAssertEqual(contour.boundingBoxOfPath.maxY, 670)
        XCTAssertTrue(contour.contains(CGPoint(x: 450, y: 400)), "shortening the web viewport leaves its new bottom square")
    }

    func testUnavailableAndInvalidGeometryCannotPublishAnInvalidPath() {
        XCTAssertTrue(DisplayCornerContour.commands(in: .zero, radii: [:]).isEmpty)
        XCTAssertTrue(DisplayCornerContour.commands(in: CGRect(x: 0, y: 0, width: 466, height: 678), radii: ["topLeft": .nan]).isEmpty)
    }
}
