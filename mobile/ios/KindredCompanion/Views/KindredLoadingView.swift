import SwiftUI

/// One startup surface from the first native frame until the workspace paints.
/// It never covers a retained conversation when the app resumes or changes pose.
struct KindredLoadingView: View {
    let canvas: Color
    var failure: String? = nil
    var retry: () -> Void = {}
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ViewThatFits(in: .vertical) {
            presentation
            ScrollView { presentation.frame(maxWidth: .infinity) }
                .scrollIndicators(.hidden)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(canvas.ignoresSafeArea())
        .accessibilityIdentifier(failure == nil ? "kindred-workspace-loading" : "kindred-workspace-error")
    }

    private var presentation: some View {
        VStack(spacing: 0) {
            Image("KindredMark")
                .resizable()
                .scaledToFit()
                .frame(width: 84, height: 84)
                .accessibilityHidden(true)
            Text("Kindred")
                .font(.system(size: 29, weight: .semibold, design: .rounded))
                .tracking(-0.8)
                .padding(.top, 14)
            if let failure {
                Text("Your workspace couldn’t open")
                    .font(.headline)
                    .padding(.top, 28)
                Text(failure)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 8)
                Button("Try again", action: retry)
                    .font(.body.weight(.semibold))
                    .buttonStyle(.borderedProminent)
                    .tint(Theme.accent)
                    .foregroundStyle(Theme.avatarInk)
                    .controlSize(.large)
                    .padding(.top, 24)
                    .accessibilityIdentifier("kindred-loading-retry")
            } else {
                Text("Opening your workspace")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .padding(.top, 9)
                TimelineView(.animation(minimumInterval: 1 / 20, paused: reduceMotion)) { context in
                    HStack(spacing: 6) {
                        ForEach(0..<3) { index in
                            Circle().fill(Theme.accent)
                                .frame(width: 5, height: 5)
                                .opacity(reduceMotion ? 0.6 : Self.dotOpacity(index: index, time: context.date.timeIntervalSinceReferenceDate))
                        }
                    }
                }
                .frame(height: 12)
                .padding(.top, 22)
                .accessibilityHidden(true)
            }
        }
        .frame(maxWidth: 320)
        .padding(.horizontal, 28)
        .padding(.vertical, 32)
    }

    static func dotOpacity(index: Int, time: TimeInterval) -> Double {
        let phase = time * 2 * .pi / 1.5 - Double(index) * 0.65
        return 0.25 + 0.65 * (sin(phase) + 1) / 2
    }
}
