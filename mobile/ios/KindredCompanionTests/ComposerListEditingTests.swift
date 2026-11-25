import Foundation
import XCTest
@testable import Kindred

final class ComposerListEditingTests: XCTestCase {
    private func applying(_ edit: ComposerListEditing.Edit?, to source: String) -> String? {
        edit.map { (source as NSString).replacingCharacters(in: $0.range, with: $0.text) }
    }

    func testTypingAndSendingBullets() {
        for marker in ["-", "*", "+"] {
            XCTAssertEqual(applying(ComposerListEditing.insertion(" ", in: marker, at: NSRange(location: 1, length: 0)), to: marker), "• ")
        }
        XCTAssertEqual(ComposerListEditing.display("- restored\n  - nested"), "• restored\n  • nested")
        let draft = "• 🦋 first"
        let end = NSRange(location: (draft as NSString).length, length: 0)
        let next = applying(ComposerListEditing.insertion("\n", in: draft, at: end), to: draft)
        XCTAssertEqual(next, draft + "\n• ")
        XCTAssertEqual(ComposerListEditing.markdown(next! + "second"), "- 🦋 first\n- second")
    }

    func testSplitContinueAndExit() {
        for (text, offset, result) in [("12. beforeafter", 10, "12. before\n13. after"),
                                       ("  - item", 8, "  - item\n  - "),
                                       ("- one\n- ", 8, "- one\n\n"), ("• ", 2, "")] {
            XCTAssertEqual(applying(ComposerListEditing.insertion("\n", in: text, at: NSRange(location: offset, length: 0)), to: text), result)
        }
        XCTAssertNil(ComposerListEditing.insertion("\n", in: "plain", at: NSRange(location: 5, length: 0)))
        let literal = "```txt\n• literal\n- x"
        XCTAssertNil(ComposerListEditing.insertion("\n", in: literal, at: NSRange(location: (literal as NSString).length, length: 0)))
        XCTAssertEqual(ComposerListEditing.markdown(literal + "\n```\n• normal"), literal + "\n```\n- normal")
    }

    func testFormattingSelectionsAndRestoredLists() {
        let draft = "🦋 one\ntwo"
        let range = NSRange(location: 0, length: (draft as NSString).length)
        let numbers = ComposerListEditing.format(.numbers, in: draft, at: range)!
        XCTAssertEqual(applying(numbers, to: draft), "1. 🦋 one\n2. two")
        XCTAssertEqual(applying(ComposerListEditing.format(.numbers, in: numbers.text, at: numbers.selection!), to: numbers.text), draft)
        let text = "- parent\n- child"
        let end = NSRange(location: (text as NSString).length, length: 0)
        let indent = ComposerListEditing.format(.indent, in: text, at: end)!
        let nested = applying(indent, to: text)!
        XCTAssertEqual(nested, "- parent\n  - child")
        XCTAssertEqual(applying(ComposerListEditing.format(.outdent, in: nested, at: indent.selection!), to: nested), text)
    }
}
