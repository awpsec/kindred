import Foundation
import XCTest
@testable import KindredCore

final class DictationTranscriptTests: XCTestCase {
    private func segment(_ text: String, start: Double, duration: Double = 1) -> [DictationTranscript.Segment] {
        [.init(range: NSRange(location: 0, length: (text as NSString).length), start: start, duration: duration)]
    }
    func testPartialCorrectionsReplaceOnlyTheCurrentHypothesis() {
        var value = DictationTranscript()
        XCTAssertEqual(value.update("I scream"), "I scream")
        XCTAssertEqual(value.update("Ice cream"), "Ice cream")
        XCTAssertEqual(value.update("Ice cream.", segments: segment("Ice cream.", start: 0)), "Ice cream.")
        XCTAssertEqual(value.update("And"), "Ice cream. And")
        XCTAssertEqual(value.update("And cake"), "Ice cream. And cake")
        XCTAssertEqual(value.update("And cake.", segments: segment("And cake.", start: 4)), "Ice cream. And cake.")
        XCTAssertEqual(value.update("And coffee.", segments: segment("And coffee.", start: 4)), "Ice cream. And coffee.")
    }
    func testRepeatedUtterancesAreNotDeduplicatedByTheirWords() {
        var value = DictationTranscript()
        let first = segment("Yes.", start: 1)
        XCTAssertEqual(value.update("Yes.", segments: first), "Yes.")
        XCTAssertEqual(value.update("Yes.", segments: first), "Yes.")
        // An untimed repeat is ambiguous; later audio positions distinguish it.
        XCTAssertEqual(value.update("Yes."), "Yes.")
        XCTAssertEqual(value.update("Yes.", segments: segment("Yes.", start: 5)), "Yes. Yes.")
        XCTAssertEqual(value.update("Yes.", segments: segment("Yes.", start: 5)), "Yes. Yes.")
    }
    func testCumulativeThenUtteranceOnlyAndBackPreservesHistory() {
        var value = DictationTranscript()
        let both: [DictationTranscript.Segment] = [
            .init(range: NSRange(location: 0, length: 6), start: 0.5, duration: 1),
            .init(range: NSRange(location: 7, length: 6), start: 4, duration: 1)
        ]
        XCTAssertEqual(value.update("First.", segments: segment("First.", start: 0.5)), "First.")
        XCTAssertEqual(value.update("First. Second"), "First. Second")
        XCTAssertEqual(value.update("First. Second", segments: both), "First. Second")
        XCTAssertEqual(value.update("Second!", segments: segment("Second!", start: 4)), "First. Second!")
        XCTAssertEqual(value.update("Third.", segments: segment("Third.", start: 8)), "First. Second! Third.")
        let all = both + [.init(range: NSRange(location: 15, length: 6), start: 8, duration: 1)]
        XCTAssertEqual(value.update("First. Second! Third.", segments: all), "First. Second! Third.")
        // A delayed callback for the first phrase cannot truncate newer speech.
        XCTAssertEqual(value.update("First?", segments: segment("First?", start: 0.5)), "First. Second! Third.")
    }
    func testMetadataOnlyPhraseBoundariesAndCumulativePreviews() {
        var value = DictationTranscript()
        XCTAssertEqual(value.update("Hello.", speechStart: 0, speechDuration: 1), "Hello.")
        XCTAssertEqual(value.update("More words"), "Hello. More words")
        XCTAssertEqual(value.update("More words.", speechStart: 3, speechDuration: 2), "Hello. More words.")
        XCTAssertEqual(value.update("More words. Still talking"), "Hello. More words. Still talking")
        XCTAssertEqual(value.update("Hello. More words. Still talking"), "Hello. More words. Still talking")
        XCTAssertEqual(value.update("Hello. More words. Still talking.", speechStart: 0, speechDuration: 8), "Hello. More words. Still talking.")
        // Coarse metadata cannot slice an overlapping cumulative window safely.
        XCTAssertEqual(value.update("More words!", speechStart: 3, speechDuration: 2), "Hello. More words. Still talking.")
    }
    func testCumulativeFirstResultRejectsAnEarlierPhraseCallback() {
        var value = DictationTranscript()
        let parts: [DictationTranscript.Segment] = [
            .init(range: NSRange(location: 0, length: 6), start: 0.5, duration: 1),
            .init(range: NSRange(location: 7, length: 6), start: 4, duration: 1)
        ]
        value.update("First. Second", segments: parts)
        XCTAssertEqual(value.update("First?", segments: segment("First?", start: 0.5)), "First. Second")
    }
    func testInvalidUTF16SplitDoesNotBecomeTimedHistory() {
        // Neither endpoint may cut a surrogate pair, including after ASCII.
        for (text, range) in [("😀", NSRange(location: 0, length: 1)),
                              ("😀", NSRange(location: 1, length: 1)),
                              ("A😀B", NSRange(location: 0, length: 2)),
                              ("A😀B", NSRange(location: 2, length: 2))] {
            var value = DictationTranscript()
            let split = [DictationTranscript.Segment(range: range, start: 0, duration: 1)]
            XCTAssertEqual(value.update(text, segments: split), text)
            XCTAssertEqual(value.update("Correction"), "Correction")
        }
    }
    func testWholeEmojiRangeBecomesTimedHistory() {
        var value = DictationTranscript()
        value.update("😀", segments: segment("😀", start: 0))
        XCTAssertEqual(value.update("Next", segments: segment("Next", start: 4)), "😀 Next")
    }
    func testZeroAndInvalidTimingsRemainProvisional() {
        for bad in [0.0, -1.0, Double.nan, Double.infinity] {
            var value = DictationTranscript()
            XCTAssertEqual(value.update("One", segments: segment("One", start: 0, duration: bad)), "One")
            XCTAssertEqual(value.update("Two", speechStart: 0, speechDuration: bad), "Two")
        }
        var value = DictationTranscript()
        let badRange = [DictationTranscript.Segment(range: NSRange(location: Int.max, length: 10), start: 0, duration: 1)]
        XCTAssertEqual(value.update("Safe", segments: badRange), "Safe")
        XCTAssertEqual(value.update("Correction"), "Correction")
    }
    func testEmptyFinalPreservesPreviewAndFreshSessionHasNoHistory() {
        var value = DictationTranscript()
        value.update("First.", segments: segment("First.", start: 0))
        XCTAssertEqual(value.update("Next words"), "First. Next words")
        XCTAssertEqual(value.update(""), "First. Next words")
        XCTAssertEqual(value.update(" \n"), "First. Next words")
        value = DictationTranscript()
        XCTAssertEqual(value.update("Fresh"), "Fresh")
    }
    func testPrefixMustBeAtATextBoundary() {
        var value = DictationTranscript()
        value.update("Go", segments: segment("Go", start: 0))
        XCTAssertEqual(value.update("Good morning"), "Go Good morning")
        XCTAssertEqual(value.update("Go again"), "Go again")
    }
    func testUTF16RangesPreserveUnicodeAndPunctuation() {
        var value = DictationTranscript()
        let original = "Café ☕️. Bonjour."
        let boundary = (original as NSString).range(of: "Bonjour").location
        let parts: [DictationTranscript.Segment] = [
            .init(range: NSRange(location: 0, length: boundary - 1), start: 0, duration: 1),
            .init(range: NSRange(location: boundary, length: 8), start: 4, duration: 1)
        ]
        value.update(original, segments: parts)
        XCTAssertEqual(value.update("Bonsoir!", segments: segment("Bonsoir!", start: 4)), "Café ☕️. Bonsoir!")
    }
    /// Export the actual normalizer output for replay through the browser's
    /// iOS bridge. This is synthetic recognition input, not microphone proof.
    func testComposerReplay() throws {
        var value = DictationTranscript()
        var replay: [[String: String]] = []
        func step(_ phrase: String, _ expected: String, start: Double? = nil, phase: String = "partial") {
            let result = value.update(phrase, segments: start.map { segment(phrase, start: $0) } ?? [])
            XCTAssertEqual(result, expected)
            replay.append(["phase": phase, "text": result])
        }
        step("First phrase.", "First phrase.", start: 0.5)
        step("Second", "First phrase. Second")
        step("Second phrase.", "First phrase. Second phrase.", start: 4)
        step("Second phrase!", "First phrase. Second phrase!", start: 4)
        step("Third phrase.", "First phrase. Second phrase! Third phrase.", start: 8, phase: "final")
        if let path = ProcessInfo.processInfo.environment["KINDRED_TEST_DICTATION_REPLAY"] {
            try JSONSerialization.data(withJSONObject: replay, options: [.prettyPrinted, .sortedKeys]).write(to: URL(fileURLWithPath: path))
        }
    }
}
