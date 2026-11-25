import Foundation

/// Ranges use UIKit's UTF-16 offsets. Only a list marker is rewritten; the
/// rest of a draft, including Unicode, is passed through unchanged.
enum ComposerListEditing {
    struct Edit {
        let range: NSRange
        let text: String
        var selection: NSRange?
    }

    private static let marker = try! NSRegularExpression(pattern: #"^([ \t]*)([-*+•]|[0-9]{1,9}\.)([ \t]+)"#)

    private static func paragraph(_ text: NSString, range: NSRange) -> NSRange {
        // The end of a selection at the next paragraph's start belongs to
        // the previous line. NSString.lineRange implements this convention.
        text.lineRange(for: range)
    }

    private static func match(_ line: NSString) -> NSTextCheckingResult? {
        marker.firstMatch(in: line as String, range: NSRange(location: 0, length: line.length))
    }

    private static func updateFence(_ open: inout String?, line: Substring) -> Bool {
        let stripped = line.drop(while: { $0 == " " || $0 == "\t" })
        guard let first = stripped.first, first == "`" || first == "~" else { return open != nil }
        let run = stripped.prefix(while: { $0 == first })
        guard run.count >= 3 else { return open != nil }
        if let fence = open {
            if run.first == fence.first && run.count >= fence.count &&
                stripped.dropFirst(run.count).allSatisfy(\.isWhitespace) { open = nil }
        } else { open = String(run) }
        return true
    }

    private static func insideFence(_ text: NSString, line: NSRange) -> Bool {
        let preceding = text.substring(to: line.location)
        guard preceding.contains("```") || preceding.contains("~~~") else { return false }
        var open: String?
        for row in preceding.split(separator: "\n") { _ = updateFence(&open, line: row) }
        return open != nil
    }

    static func insertion(_ key: String, in draft: String, at range: NSRange) -> Edit? {
        guard key == "\n" || key == " " else { return nil }
        let text = draft as NSString
        guard range.location <= text.length, range.length <= text.length - range.location else { return nil }
        let line = paragraph(text, range: NSRange(location: range.location, length: 0))
        let prefix = text.substring(with: NSRange(location: line.location, length: range.location - line.location))
        if key == " " {
            guard range.length == 0, let last = prefix.last, "-*+".contains(last),
                  prefix.dropLast().allSatisfy({ $0 == " " || $0 == "\t" }), !insideFence(text, line: line) else { return nil }
            return Edit(range: NSRange(location: range.location - 1, length: 1), text: "• ")
        }
        let head = prefix as NSString
        guard let m = match(head), NSMaxRange(range) <= NSMaxRange(line), !insideFence(text, line: line) else { return nil }
        let indent = head.substring(with: m.range(at: 1))
        let token = head.substring(with: m.range(at: 2))
        let content = head.substring(from: NSMaxRange(m.range))
        let tail = text.substring(with: NSRange(location: NSMaxRange(range), length: NSMaxRange(line)-NSMaxRange(range)))
        if (content + tail).trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return Edit(range: NSRange(location: line.location, length: NSMaxRange(range) - line.location),
                        text: line.location == 0 ? "" : "\n")
        }
        let next = token.hasSuffix(".") ? "\((Int(token.dropLast()) ?? 0) + 1)." : token
        return Edit(range: range, text: "\n" + indent + next + " ")
    }

    static func isList(in draft: String, at range: NSRange) -> Bool {
        let text = draft as NSString
        guard range.location <= text.length, range.length <= text.length - range.location else { return false }
        let line = paragraph(text, range: NSRange(location: range.location, length: 0))
        return match(text.substring(with: line) as NSString) != nil && !insideFence(text, line: line)
    }

    enum Format { case bullets, numbers, indent, outdent }

    static func format(_ kind: Format, in draft: String, at selection: NSRange) -> Edit? {
        let text = draft as NSString
        guard selection.location <= text.length, selection.length <= text.length - selection.location else { return nil }
        var region = paragraph(text, range: selection)
        if region.length > 0 && text.character(at: NSMaxRange(region)-1) == 10 { region.length -= 1 }
        let lines = text.substring(with: region).components(separatedBy: "\n")
        let remove = lines.allSatisfy { line in
            let ns = line as NSString
            guard let m = match(ns) else { return false }
            let numbered = ns.substring(with: m.range(at: 2)).hasSuffix(".")
            return kind == .numbers && numbered || kind == .bullets && !numbered
        }
        var caret = selection.location
        var result: [String] = []
        for (i, line) in lines.enumerated() {
            let ns = line as NSString, m = match(ns)
            let indent = String(line.prefix { $0 == " " || $0 == "\t" })
            let start = m.map { NSMaxRange($0.range) } ?? (indent as NSString).length
            let prefix: String
            switch kind {
            case .indent, .outdent:
                guard m != nil else { return nil }
                let marker = ns.substring(to: start)
                prefix = kind == .indent ? "  " + marker : String(marker.dropFirst(indent.hasPrefix("\t") ? 1 : min(2,indent.count)))
            case .bullets, .numbers:
                prefix = indent + (remove ? "" : kind == .bullets ? "• " : "\(i + 1). ")
            }
            if i == 0 { caret = region.location + (prefix as NSString).length + max(0, selection.location-region.location-start) }
            result.append(prefix + ns.substring(from: start))
        }
        let string = result.joined(separator: "\n")
        let next = selection.length == 0 ? NSRange(location: caret, length: 0) : NSRange(location: region.location, length: (string as NSString).length)
        return Edit(range: region, text: string, selection: next)
    }

    static func markdown(_ draft: String) -> String {
        guard draft.contains("•") else { return draft }
        return replacingMarkers(in: draft, pattern: #"(?m)^([ \t]*)•(?=[ \t])"#, template: "$1-")
    }

    static func display(_ markdown: String) -> String {
        guard markdown.contains("-") else { return markdown }
        return replacingMarkers(in: markdown, pattern: #"(?m)^([ \t]*)-(?=[ \t])"#, template: "$1•")
    }

    private static func replacingMarkers(in draft: String, pattern: String, template: String) -> String {
        if draft.contains("```") || draft.contains("~~~") {
            var open: String?
            return draft.components(separatedBy: "\n").map { line in
                updateFence(&open, line: line[...]) ? line : line.replacingOccurrences(of: pattern, with: template, options: .regularExpression)
            }.joined(separator: "\n")
        }
        return draft.replacingOccurrences(of: pattern, with: template, options: .regularExpression)
    }
}
