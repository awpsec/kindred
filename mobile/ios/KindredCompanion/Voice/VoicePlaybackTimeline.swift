import Foundation

/// Schedule continuous PCM against the rendered sample clock, with a small
/// cushion for network jitter. Packet boundaries must not become audible gaps.
struct VoicePlaybackTimeline {
    static let rate: Double = 24_000
    static let leadFrames: Int64 = 2_880 // 120 ms; no pitch/rate adjustment.
    private(set) var nextFrame: Int64?
    private(set) var rebufferCount = 0

    mutating func reserve(frames: Int64, renderedFrame: Int64) throws -> Int64 {
        guard frames > 0, frames <= 48_000, renderedFrame >= 0 else { throw URLError(.cannotDecodeContentData) }
        let start: Int64
        if let nextFrame, nextFrame >= renderedFrame { start = nextFrame }
        else {
            if nextFrame != nil { rebufferCount += 1 }
            start = renderedFrame + Self.leadFrames
        }
        guard start + frames - renderedFrame <= 72_000 else { throw URLError(.cannotDecodeContentData) }
        nextFrame = start + frames
        return start
    }
    mutating func reset() { nextFrame = nil; rebufferCount = 0 }
}
