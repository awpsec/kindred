import SwiftUI

@main
struct KindredCompanionApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(appDelegate.model)
                .tint(Theme.accent)
        }
    }
}
