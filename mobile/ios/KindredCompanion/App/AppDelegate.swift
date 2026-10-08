import KindredCore
import UIKit
import UserNotifications
import WebKit

@MainActor
final class AppDelegate: NSObject, UIApplicationDelegate {
    let model = AppModel()
    private let notificationDelegate = NotificationDelegate()

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
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

    func application(_ application: UIApplication, supportedInterfaceOrientationsFor window: UIWindow?) -> UIInterfaceOrientationMask {
        ComputerOrientation.shared.mask(for: window)
    }
}

/// Remote typing on slab phones is portrait-only. Duo's inner display and
/// keyboard adapt to the scene's available space without forcing a pose.
@MainActor
final class ComputerOrientation {
    static let shared = ComputerOrientation()
    private weak var owner: WKWebView?
    func mask(for window: UIWindow?) -> UIInterfaceOrientationMask {
        if let owner, owner.window === window { return .portrait }
        return window?.traitCollection.userInterfaceIdiom == .phone ? .allButUpsideDown : .all
    }

    func update(webView: WKWebView, active: Bool, isSlab: Bool) {
        let lock = active && isSlab
        if lock {
            guard owner !== webView else { return }
            owner = webView
        } else {
            guard owner === webView else { return }
            owner = nil
        }
        guard let scene = webView.window?.windowScene else { return }
        let root = webView.window?.rootViewController
        root?.setNeedsUpdateOfSupportedInterfaceOrientations()
        root?.presentedViewController?.setNeedsUpdateOfSupportedInterfaceOrientations()
        // Retract the explicit portrait preference when an inner display or
        // returned control releases the lock. UIKit chooses the current pose.
        scene.requestGeometryUpdate(.iOS(interfaceOrientations: lock ? .portrait : mask(for: webView.window)))
    }
}

/// Kindred alerts are generic; only the identifiers in the payload are used,
/// and only to choose a saved account and conversation.
final class NotificationDelegate: NSObject, UNUserNotificationCenterDelegate {
    weak var model: AppModel?

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        let route = PushPayload.route(from: notification.request.content.userInfo)
        Task { @MainActor [weak model] in
            completionHandler(model?.shouldPresentNotification(route) == true ? [.banner, .list, .sound] : [])
        }
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
