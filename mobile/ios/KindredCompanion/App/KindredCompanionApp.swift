import SwiftUI

@main
struct KindredCompanionApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    @ViewBuilder private var content: some View {
        #if DEBUG && targetEnvironment(simulator)
        if let fixture = ArtifactTouchFixture.active {
            ArtifactTouchFixtureView(fixture:fixture).ignoresSafeArea()
        } else if let fixture = AccountsAppearanceFixture.active {
            AccountsAppearanceFixtureView(fixture:fixture).ignoresSafeArea()
        } else { normalContent }
        #elseif DEBUG
        if let fixture = AccountsAppearanceFixture.active {
            AccountsAppearanceFixtureView(fixture: fixture).ignoresSafeArea()
        } else {
            normalContent
        }
        #else
        normalContent
        #endif
    }

    private var normalContent: some View {
        RootView().environment(appDelegate.model).tint(Theme.accent)
    }

    var body: some Scene {
        WindowGroup {
            content
        }
    }
}
