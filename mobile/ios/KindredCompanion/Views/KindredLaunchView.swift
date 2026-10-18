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
                    eyeY: reduceMotion ? 56 : 56 - 1.2 * curiosity,
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

/// The Soft K body, gradient and independent pill eyes match tools/kindred-mark.svg.
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
            // The SVG's 160pt canvas translates the mark by (16, 13).
            context.translateBy(x: -80 + 16, y: -80 + 13)
            let body = KindredLaunchMark().path(in: CGRect(x: 0, y: 0, width: 128, height: 128))
            let bounds = body.boundingRect
            context.fill(body, with: .linearGradient(Gradient(stops: [
                .init(color: Color(red: 1, green: 208/255, blue: 135/255), location: 0),
                .init(color: Color(red: 1, green: 163/255, blue: 79/255), location: 1)
            ]), startPoint: bounds.origin,
                endPoint: CGPoint(x: bounds.minX + bounds.width * 0.7, y: bounds.maxY)))
            for (x, height) in [(35.5, frame.leftEyeHeight), (50.5, frame.rightEyeHeight)] {
                let eye = CGRect(x: x - 3.5 + frame.gaze, y: frame.eyeY - height / 2, width: 7, height: height)
                let radius = min(3.5, height / 2)
                context.fill(Path(roundedRect: eye, cornerSize: CGSize(width: radius, height: radius)),
                             with: .color(Color(red: 48/255, green: 39/255, blue: 30/255)))
            }
        }
    }
}

private struct KindredLaunchMark: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: 43, y: 14))
        p.addCurve(to: CGPoint(x: 62, y: 36), control1: CGPoint(x: 55, y: 14), control2: CGPoint(x: 62, y: 23))
        p.addLine(to: CGPoint(x: 62, y: 43))
        p.addLine(to: CGPoint(x: 79, y: 24))
        p.addCurve(to: CGPoint(x: 111, y: 35), control1: CGPoint(x: 92, y: 10), control2: CGPoint(x: 111, y: 20))
        p.addCurve(to: CGPoint(x: 101, y: 53), control1: CGPoint(x: 111, y: 42), control2: CGPoint(x: 108, y: 47))
        p.addLine(to: CGPoint(x: 87, y: 65))
        p.addLine(to: CGPoint(x: 104, y: 81))
        p.addCurve(to: CGPoint(x: 93, y: 116), control1: CGPoint(x: 119, y: 96), control2: CGPoint(x: 109, y: 116))
        p.addCurve(to: CGPoint(x: 74, y: 106), control1: CGPoint(x: 85, y: 116), control2: CGPoint(x: 80, y: 112))
        p.addLine(to: CGPoint(x: 62, y: 94))
        p.addLine(to: CGPoint(x: 62, y: 100))
        p.addCurve(to: CGPoint(x: 42, y: 121), control1: CGPoint(x: 62, y: 114), control2: CGPoint(x: 54, y: 121))
        p.addCurve(to: CGPoint(x: 18, y: 96), control1: CGPoint(x: 26, y: 121), control2: CGPoint(x: 18, y: 111))
        p.addLine(to: CGPoint(x: 18, y: 40))
        p.addCurve(to: CGPoint(x: 43, y: 14), control1: CGPoint(x: 18, y: 23), control2: CGPoint(x: 27, y: 14))
        p.closeSubpath()
        return p.applying(CGAffineTransform(scaleX: rect.width / 128, y: rect.height / 128))
    }
}
