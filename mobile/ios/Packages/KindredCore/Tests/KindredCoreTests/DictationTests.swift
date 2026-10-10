import Foundation
import XCTest
@testable import KindredCore

final class DictationTests: XCTestCase {
    let document = UUID().uuidString
    func body(_ action: String) -> [String: Any] {
        ["action": action, "documentID": document, "operationID": "utterance-1", "chatID": "dm-test", "locale": "en-US"]
    }
    func testParseOnlyKnownBoundedOperations() {
        for action in ["status", "context", "start", "stop", "cancel", "settings"] {
            XCTAssertNotNil(DictationCommand(body: body(action)))
        }
        for field in ["documentID", "operationID", "chatID"] {
            for malformed: Any in [NSNull(), false, 3, [:], "", "\n", String(repeating: "x", count: 1024)] {
                var next = body("start"); next[field] = malformed
                XCTAssertNil(DictationCommand(body: next), field)
            }
        }
        var unknown = body("execute"); XCTAssertNil(DictationCommand(body: unknown))
        unknown = body("start"); unknown["locale"] = "en-US;console.log(1)"
        XCTAssertNil(DictationCommand(body: unknown))
    }
    func testContextCanClearChatWithoutAnOperation() {
        XCTAssertNotNil(DictationCommand(body: ["action": "context", "documentID": document, "chatID": NSNull()]))
        XCTAssertNotNil(DictationCommand(body: ["action": "status", "documentID": document]))
        XCTAssertNil(DictationCommand(body: ["action": "start", "documentID": document]))
    }
    func testPermissionCallbackAfterCancellationCannotStart() {
        var fence = DictationFence()
        let permission = fence.begin(documentID: document, operationID: "1", chatID: "A")
        fence.invalidate()
        XCTAssertFalse(fence.accepts(permission))
        XCTAssertNil(fence.nextSequence(for: permission))
    }
    func testLateFinalAfterConversationOrDocumentChangeCannotInsert() {
        var fence = DictationFence()
        let old = fence.begin(documentID: document, operationID: "1", chatID: "A")
        XCTAssertEqual(fence.nextSequence(for: old), 1)
        XCTAssertEqual(fence.nextSequence(for: old), 2)
        let fresh = fence.begin(documentID: UUID().uuidString, operationID: "1", chatID: "B")
        XCTAssertFalse(fence.accepts(old)); XCTAssertNil(fence.nextSequence(for: old))
        XCTAssertEqual(fence.nextSequence(for: fresh), 1)
        fence.invalidate()
        XCTAssertNil(fence.nextSequence(for: fresh))
    }
    func testReusingAnIDCannotReviveOldGeneration() {
        var fence = DictationFence()
        let old = fence.begin(documentID: document, operationID: "same", chatID: "A")
        let fresh = fence.begin(documentID: document, operationID: "same", chatID: "A")
        XCTAssertNotEqual(old.generation, fresh.generation)
        XCTAssertFalse(fence.accepts(old)); XCTAssertTrue(fence.accepts(fresh))
    }
    func testScriptUsesStructuredArgumentsAndFreshDocumentOriginGuard() throws {
        let origin = try XCTUnwrap(ServerOrigin(url: URL(string: "https://test.example:9444/")!))
        XCTAssertTrue(WebDictation.bootstrap(origin: origin).contains("crypto.getRandomValues("))
        for script in [WebDictation.eventScript(origin: origin), WebDictation.capabilityScript(origin: origin)] {
            XCTAssertTrue(script.contains("window.top!==window.self"))
            XCTAssertTrue(script.contains("location.origin!==\"https://test.example:9444\""))
            XCTAssertTrue(script.contains("documentID!==payload.documentID"))
            XCTAssertFalse(script.contains("eval("))
        }
        let capability = WebDictation.capabilityScript(origin: origin)
        XCTAssertLessThan(try XCTUnwrap(capability.range(of: "window.__KINDRED_IOS_DICTATION={")?.lowerBound), try XCTUnwrap(capability.range(of: "window.dispatchEvent")?.lowerBound))
    }
}

extension DictationTests {
    func testReversedNonceRepliesKeepContextBeforeStart() throws {
        var queue = DictationCommandQueue()
        let context = try XCTUnwrap(DictationCommand(body: body("context")))
        let start = try XCTUnwrap(DictationCommand(body: body("start")))
        let c = try XCTUnwrap(queue.enqueue(context)), s = try XCTUnwrap(queue.enqueue(start))
        XCTAssertTrue(queue.complete(s, valid: true).isEmpty)
        XCTAssertEqual(queue.complete(c, valid: true).map(\.action), [.context, .start])
        XCTAssertTrue(queue.complete(s, valid: true).isEmpty)
    }
    func testNewChatRejectsOldStartEvenWhenOldRepliesFinishLast() throws {
        var queue = DictationCommandQueue()
        let a = try XCTUnwrap(DictationCommand(body: body("context")))
        let old = try XCTUnwrap(DictationCommand(body: body("start")))
        var next = body("context"); next["chatID"] = "new-chat"
        let b = try XCTUnwrap(DictationCommand(body: next))
        next["action"] = "start"; next["operationID"] = "new-op"
        let fresh = try XCTUnwrap(DictationCommand(body: next))
        let tickets = try [a, old, b, fresh].map { try XCTUnwrap(queue.enqueue($0)) }
        for index in [3, 2, 1] { XCTAssertTrue(queue.complete(tickets[index], valid: true).isEmpty) }
        let accepted = queue.complete(tickets[0], valid: true)
        XCTAssertEqual(accepted, [b, fresh])
    }
    func testTimedOutNonceNeverRevivesAndNavigationDropsQueuedWork() throws {
        var queue = DictationCommandQueue()
        let command = try XCTUnwrap(DictationCommand(body: body("context")))
        let old = try XCTUnwrap(queue.enqueue(command))
        XCTAssertTrue(queue.complete(old, valid: false).isEmpty)
        XCTAssertTrue(queue.complete(old, valid: true).isEmpty)
        let next = try XCTUnwrap(queue.enqueue(command))
        queue.invalidate()
        XCTAssertTrue(queue.complete(next, valid: true).isEmpty)
    }
    func testQueueOverflowRevokesEarlierPendingStart() throws {
        var queue = DictationCommandQueue()
        let start = try XCTUnwrap(DictationCommand(body: body("start")))
        let tickets = try (0..<32).map { _ in try XCTUnwrap(queue.enqueue(start)) }
        let context = try XCTUnwrap(DictationCommand(body: body("context")))
        XCTAssertNil(queue.enqueue(context))
        for ticket in tickets { XCTAssertTrue(queue.complete(ticket, valid: true).isEmpty) }
        let fresh = try XCTUnwrap(queue.enqueue(context))
        XCTAssertEqual(queue.complete(fresh, valid: true), [context])
    }

}
