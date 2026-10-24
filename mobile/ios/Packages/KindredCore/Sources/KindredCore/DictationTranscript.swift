import Foundation

/// Apple may revise a hypothesis, return the entire recording, or start a new
/// hypothesis after a pause. Audio positions, not changes in wording, identify
/// which earlier words a timed result can replace.
public struct DictationTranscript {
    public struct Segment: Sendable {
        public let range: NSRange
        public let start: TimeInterval
        public let duration: TimeInterval

        public init(range: NSRange, start: TimeInterval, duration: TimeInterval) {
            self.range = range; self.start = start; self.duration = duration
        }
        var end: TimeInterval { start + duration }
    }

    private struct Chunk {
        let text: String
        let segments: [Segment]
        let precise: Bool
        var start: TimeInterval { segments[0].start }
        var end: TimeInterval { segments.map(\.end).max()! }
    }
    private var chunks: [Chunk] = []
    private var latestStart: TimeInterval = 0
    public private(set) var text = ""
    public init() {}

    /// Untimed hypotheses stay provisional. An exact leading prefix is used
    /// only to avoid repeating the visible history in a cumulative preview;
    /// it never merges or deduplicates audio windows (including repeated words).
    @discardableResult
    public mutating func update(_ hypothesis: String, segments: [Segment] = [],
                                speechStart: TimeInterval? = nil, speechDuration: TimeInterval? = nil) -> String {
        guard !hypothesis.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return text }
        let utf16 = Array(hypothesis.utf16)
        let length = utf16.count
        // Foundation's NSRange bridge differs between Darwin and Linux for
        // offsets inside a surrogate pair. Validate scalar boundaries directly.
        func isScalarBoundary(_ offset: Int) -> Bool {
            guard offset > 0 && offset < length else { return true }
            return !(0xD800...0xDBFF).contains(utf16[offset - 1]) ||
                   !(0xDC00...0xDFFF).contains(utf16[offset])
        }
        var timed = segments
        let valid = !timed.isEmpty && timed.allSatisfy {
            $0.start.isFinite && $0.start >= 0 && $0.duration.isFinite && $0.duration > 0 &&
            $0.end.isFinite && $0.range.location >= 0 && $0.range.length > 0 &&
            $0.range.location <= length && $0.range.length <= length - $0.range.location &&
            isScalarBoundary($0.range.location) && isScalarBoundary(NSMaxRange($0.range)) &&
            Range($0.range, in: hypothesis) != nil
        } && zip(timed, timed.dropFirst()).allSatisfy {
            $0.start <= $1.start && NSMaxRange($0.range) <= $1.range.location
        }
        if !valid {
            // Some on-device versions supply timing only when a phrase settles.
            // Metadata is a coarse window, not a claim that the task is final.
            if let start = speechStart, let duration = speechDuration,
               start.isFinite, start >= 0, duration.isFinite, duration > 0, (start + duration).isFinite {
                timed = [Segment(range: NSRange(location: 0, length: length), start: start, duration: duration)]
            } else {
                let history = joined(chunks.map(\.text))
                let last = chunks.last?.text.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                if history.isEmpty || hasLeadingHistory(hypothesis, history) {
                    text = hypothesis
                } else if !last.isEmpty && hasLeadingHistory(hypothesis, last) {
                    text = joined(chunks.dropLast().map(\.text) + [hypothesis])
                } else {
                    text = joined([history, hypothesis])
                }
                return text
            }
        }
        let incoming = Chunk(text: hypothesis, segments: timed, precise: valid)
        let tolerance = 0.02
        // Ignore delayed earlier-phrase callbacks, but allow revisions and a
        // cumulative snapshot that reaches the newest phrase.
        guard incoming.end >= latestStart - tolerance else { return text }
        var prefix: [Chunk] = []
        for chunk in chunks {
            if chunk.start >= incoming.start - tolerance { break }
            if chunk.end <= incoming.start + tolerance {
                prefix.append(chunk)
                continue
            }
            // A cumulative snapshot can later be followed by an utterance-only
            // revision. Keep its earlier words using the recognizer's UTF-16
            // ranges, preserving punctuation and non-ASCII text.
            let kept = chunk.segments.prefix { $0.end <= incoming.start + tolerance }
            if !kept.isEmpty, kept.count < chunk.segments.count {
                let cut = chunk.segments[kept.count].range.location
                guard let range = Range(NSRange(location: 0, length: cut), in: chunk.text) else { return text }
                prefix.append(Chunk(text: String(chunk.text[range]), segments: Array(kept), precise: chunk.precise))
            } else if kept.isEmpty && !chunk.precise {
                // Coarse metadata cannot split an overlapping phrase safely.
                // Retain the visible draft until a covering/timed result arrives.
                return text
            }
            break
        }
        chunks = prefix + [incoming]
        latestStart = max(latestStart, incoming.segments.last!.start)
        text = joined(chunks.map(\.text))
        return text
    }

    private func joined(_ pieces: [String]) -> String {
        pieces.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }.joined(separator: " ")
    }
    private func hasLeadingHistory(_ value: String, _ history: String) -> Bool {
        guard value.hasPrefix(history) else { return false }
        let rest = value.dropFirst(history.count)
        return rest.isEmpty || rest.first?.isWhitespace == true || rest.first?.isPunctuation == true
    }
}
