import KindredCore
import UIKit
import UserNotifications

@MainActor
final class AppDelegate: NSObject, UIApplicationDelegate {
    #if DEBUG
    let model = AccountsAppearanceFixture.active?.model ?? AppModel()
    #else
    let model = AppModel()
    #endif
    private let notificationDelegate = NotificationDelegate()

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        #if DEBUG
        if AccountsAppearanceFixture.active != nil { return true }
        #endif
        // Set before launch finishes so a tap that launched the app is delivered.
        notificationDelegate.model = model
        UNUserNotificationCenter.current().delegate = notificationDelegate
        model.applicationDidLaunch()
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        model.didRegisterForRemoteNotifications(deviceToken: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        model.didFailToRegisterForRemoteNotifications(error)
    }
}

/// Kindred alerts are generic; only the identifiers in the payload are used,
/// and only to choose a saved account and conversation.
final class NotificationDelegate: NSObject, UNUserNotificationCenterDelegate {
    weak var model: AppModel?

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .list, .sound])
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        let route = PushPayload.route(from: response.notification.request.content.userInfo)
        let model = self.model
        Task { @MainActor in
            if let route { model?.routeNotification(route) }
            completionHandler()
        }
    }
}
