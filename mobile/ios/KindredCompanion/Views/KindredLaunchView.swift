import SwiftUI

/// Cold-launch handoff over the live app, independent of scene activation.
/// The vector matches tools/kindred-mark.svg, with independently animated eyes.
struct KindredLaunchView: View {
    let ready: Bool
    let completion: () -> Void
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var contentReady = false
    @State private var curious = false
    @State private var gathered = false
    @State private var blooming = false
    @State private var opacity = 1.0

    private var canvas: Color { colorScheme == .dark ? .black : .white }

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                canvas
                ZStack {
                    KindredLaunchMark()
                        .fill(LinearGradient(colors: [Color(red: 1, green: 0.82, blue: 0.5),
                                                       Color(red: 1, green: 0.69, blue: 0.36),
                                                       Color(red: 0.95, green: 0.55, blue: 0.32)],
                                             startPoint: .topLeading, endPoint: .bottomTrailing))
                        .frame(width: 160, height: 160)
                    eye(right: false, diameter: hypot(geometry.size.width, geometry.size.height) * 3)
                    eye(right: true, diameter: hypot(geometry.size.width, geometry.size.height) * 3)
                }
                .frame(width: 160, height: 160)
            }
            .frame(width: geometry.size.width, height: geometry.size.height)
        }
        .ignoresSafeArea()
        .opacity(opacity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Opening Kindred")
        .onChange(of: ready) { _, value in contentReady = value }
        .task {
            contentReady = ready
            do {
                if !reduceMotion {
                    try await Task.sleep(for: .milliseconds(200))
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.62)) { curious = true }
                    try await Task.sleep(for: .milliseconds(650))
                } else {
                    try await Task.sleep(for: .milliseconds(150))
                }
                // Offline pages must still expose Reload and Accounts.
                let deadline = ContinuousClock.now + .seconds(6)
                while !contentReady && ContinuousClock.now < deadline {
                    try await Task.sleep(for: .milliseconds(100))
                }
                if !reduceMotion {
                    withAnimation(.easeInOut(duration: 0.18)) { gathered = true }
                    try await Task.sleep(for: .milliseconds(200))
                    withAnimation(.easeIn(duration: 0.38)) { blooming = true }
                    try await Task.sleep(for: .milliseconds(400))
                }
                withAnimation(.easeOut(duration: 0.2)) { opacity = 0 }
                try await Task.sleep(for: .milliseconds(210))
                completion()
            } catch { /* Removing the view cancels the handoff. */ }
        }
    }

    private func eye(right: Bool, diameter: CGFloat) -> some View {
        Capsule()
            .fill(blooming ? canvas : Color(red: 0.16, green: 0.13, blue: 0.12))
            .frame(width: blooming ? diameter : (gathered ? 4 : (curious && !right ? 14 : 8)),
                   height: blooming ? diameter : (gathered ? 4 : (curious ? (right ? 11 : 24) : 18)))
            .rotationEffect(.degrees(blooming || gathered ? 0 : -10))
            .offset(x: gathered ? -19 : (right ? -8 : -31), y: -12)
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
