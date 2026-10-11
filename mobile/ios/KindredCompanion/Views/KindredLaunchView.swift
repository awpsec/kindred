import SwiftUI

/// Deterministic port of design/launch/preview.html's renderAt, in milliseconds.
/// Readiness may postpone the reveal by at most 130 ms, while the mark is still
/// dissolving. An unavailable server therefore reveals its real loading/error UI.
struct KindredLaunchFrame {
    let markOpacity: Double
    let scale: Double
    let travel: Double
    let angle: Double
    let squashX: Double
    let squashY: Double
    let gaze: Double
    let eyeY: Double
    let leftEyeHeight: Double
    let rightEyeHeight: Double
    let contentOpacity: Double
    let isComplete: Bool

    static func at(milliseconds t: Double, reduceMotion: Bool = false, readyAt: Double? = 0) -> Self {
        func progress(_ a: Double, _ b: Double) -> Double { min(1, max(0, (t - a) / (b - a))) }
        func smooth(_ k: Double) -> Double { k * k * (3 - 2 * k) }
        func out(_ k: Double) -> Double { 1 - pow(1 - k, 3) }
        func ease(_ k: Double) -> Double { k < 0.5 ? 4 * k * k * k : 1 - pow(-2 * k + 2, 3) / 2 }
        let blink = pow(sin(.pi * progress(260, 400)), 2)
        let curiosity = smooth(progress(400, 590)) * (1 - smooth(progress(770, 960)))
        let awake = out(progress(430, 620))
        let travel = ease(progress(830, 1480))
        let anticipation = sin(.pi * progress(730, 900))
        let height = (14.2 + (16.4 - 14.2) * awake) * (1 - 0.84 * blink)
        let revealStart = min(1300, max(1170, readyAt ?? 1300))
        return Self(markOpacity: reduceMotion ? 0 : out(progress(0, 170)) * (1 - smooth(progress(950, 1340))),
                    scale: reduceMotion ? 1.4 : 1.4 + (0.72 - 1.4) * travel,
                    travel: reduceMotion ? 0 : travel,
                    angle: reduceMotion ? 0 : -7 * curiosity + sin(.pi * travel) * 5,
                    squashX: reduceMotion ? 1 : 1 + 0.035 * anticipation,
                    squashY: reduceMotion ? 1 : 1 - 0.045 * anticipation,
                    gaze: reduceMotion ? 0 : curiosity * 1.5,
                    eyeY: reduceMotion ? 54 : 54 - 1.2 * curiosity,
                    leftEyeHeight: reduceMotion ? 15.6 : height * (1 - 0.15 * curiosity),
                    rightEyeHeight: reduceMotion ? 15.6 : height,
                    contentOpacity: out(reduceMotion ? progress(0, 220) : progress(revealStart, revealStart + 670)),
                    isComplete: t >= (reduceMotion ? 220 : revealStart + 670))
    }
}

/// A transient native layer above the real screen. The root retains the same
/// navigation/WebKit views and owns the once-per-process completion flag.
struct KindredLaunchView: View {
    let ready: Bool
    @Binding var frame: KindredLaunchFrame
    let completion: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @State private var contentReady = false
    @State private var isActive = false

    var body: some View {
        KindredLaunchArtwork(frame: frame)
            .ignoresSafeArea()
            .allowsHitTesting(false)
            .accessibilityHidden(true)
            .onChange(of: ready) { _, value in contentReady = value }
            .onChange(of: scenePhase) { _, value in isActive = value == .active }
            .task {
                contentReady = ready
                isActive = scenePhase == .active
                do {
                    // The system's static launch snapshot belongs to iOS. Let
                    // activation finish before starting the first rendered motion.
                    // Initialization and WebKit loading already run underneath.
                    while !isActive { try await Task.sleep(for: .milliseconds(16)) }
                    let clock = ContinuousClock()
                    let start = clock.now
                    var readyAt: Double? = contentReady ? 0 : nil
                    while !Task.isCancelled {
                        let elapsed = start.duration(to: clock.now).components
                        let milliseconds = Double(elapsed.seconds) * 1000 + Double(elapsed.attoseconds) / 1e15
                        if contentReady && readyAt == nil { readyAt = milliseconds }
                        frame = .at(milliseconds: milliseconds, reduceMotion: reduceMotion, readyAt: readyAt)
                        if frame.isComplete { completion(); return }
                        try await Task.sleep(for: .milliseconds(16))
                    }
                } catch { /* Removing the layer cancels all animation work. */ }
            }
    }
}

/// The body, highlight and independent pill eyes match tools/kindred-mark.svg.
/// No raster body containing embedded eyes is used here.
struct KindredLaunchArtwork: View {
    let frame: KindredLaunchFrame

    var body: some View {
        Canvas { context, size in
            let travelArc = sin(.pi * frame.travel)
            context.opacity = frame.markOpacity
            context.translateBy(x: size.width / 2 + travelArc * 10,
                                y: size.height * (0.455 + (0.29 - 0.455) * frame.travel) - travelArc * 12)
            context.rotate(by: .degrees(frame.angle))
            context.scaleBy(x: frame.scale * frame.squashX, y: frame.scale * frame.squashY)
            context.translateBy(x: -63.5, y: -65)
            let body = KindredLaunchMark().path(in: CGRect(x: 0, y: 0, width: 128, height: 128))
            context.fill(body, with: .linearGradient(Gradient(stops: [
                .init(color: Color(red: 1, green: 209/255, blue: 128/255), location: 0),
                .init(color: Color(red: 1, green: 177/255, blue: 91/255), location: 0.5),
                .init(color: Color(red: 243/255, green: 139/255, blue: 81/255), location: 1)
            ]), startPoint: CGPoint(x: 25, y: 12), endPoint: CGPoint(x: 98, y: 116)))
            context.stroke(body, with: .color(Color(red: 218/255, green: 128/255, blue: 69/255)),
                           style: StrokeStyle(lineWidth: 1.1, lineJoin: .round))
            var highlight = Path()
            highlight.move(to: CGPoint(x: 44, y: 13))
            highlight.addCurve(to: CGPoint(x: 62, y: 30), control1: CGPoint(x: 55, y: 13), control2: CGPoint(x: 62, y: 20))
            context.stroke(highlight, with: .color(Color(red: 1, green: 244/255, blue: 215/255).opacity(0.55)),
                           style: StrokeStyle(lineWidth: 2.2, lineCap: .round))
            for (x, height) in [(40.0, frame.leftEyeHeight), (58.0, frame.rightEyeHeight)] {
                let eye = CGRect(x: x - 3.5 + frame.gaze, y: frame.eyeY - height / 2, width: 7, height: height)
                let radius = min(3.5, height / 2)
                context.fill(Path(roundedRect: eye, cornerSize: CGSize(width: radius, height: radius)),
                             with: .color(Color(red: 41/255, green: 34/255, blue: 30/255)))
            }
        }
    }
}

private struct KindredLaunchMark: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: 44, y: 9))
        p.addCurve(to: CGPoint(x: 65, y: 40), control1: CGPoint(x: 61, y: 9), control2: CGPoint(x: 70, y: 22))
        p.addLine(to: CGPoint(x: 77, y: 25))
        p.addCurve(to: CGPoint(x: 110, y: 35), control1: CGPoint(x: 89, y: 10), control2: CGPoint(x: 110, y: 19))
        p.addCurve(to: CGPoint(x: 84, y: 65), control1: CGPoint(x: 110, y: 47), control2: CGPoint(x: 95, y: 57))
        p.addCurve(to: CGPoint(x: 111, y: 96), control1: CGPoint(x: 97, y: 74), control2: CGPoint(x: 111, y: 83))
        p.addCurve(to: CGPoint(x: 76, y: 109), control1: CGPoint(x: 111, y: 114), control2: CGPoint(x: 90, y: 122))
        p.addLine(to: CGPoint(x: 64, y: 98))
        p.addCurve(to: CGPoint(x: 41, y: 119), control1: CGPoint(x: 66, y: 114), control2: CGPoint(x: 56, y: 121))
        p.addCurve(to: CGPoint(x: 16, y: 87), control1: CGPoint(x: 22, y: 117), control2: CGPoint(x: 16, y: 105))
        p.addLine(to: CGPoint(x: 16, y: 42))
        p.addCurve(to: CGPoint(x: 44, y: 9), control1: CGPoint(x: 16, y: 23), control2: CGPoint(x: 26, y: 9))
        p.closeSubpath()
        return p.applying(CGAffineTransform(scaleX: rect.width / 128, y: rect.height / 128))
    }
}
