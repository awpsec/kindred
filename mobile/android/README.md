# Kindred for Android (preview)

A native Android account shell around the existing Kindred server UI. Bots run on your backend; this app does not run VMs or a standalone server on the phone.

## Build

Install JDK 17 or newer, Android SDK platform 36 and build tools 35.0.0. Set `ANDROID_HOME`, then:

```sh
./gradlew :app:assembleDebug :app:testDebugUnitTest :app:lintDebug
```

The locally installable debug APK is `app/build/outputs/apk/debug/app-debug.apk`. It is a development build, not a Play Store release. Use Android Studio's signed bundle workflow with a maintained upload key for distribution; do not commit signing keys.

## Connect

**Scan pairing code** connects this phone without a password. In Kindred on the computer, choose Connect mobile app, then scan the QR code, or tap **Paste pairing link**. A `kindred://pair` link opened from another app also works. Frames are decoded on the device with CameraX and ZXing. Camera permission is requested only when you open the scanner. The app shows the server and contacts it only after you tap **Connect**. Before the session is saved, the app checks that the server is a Kindred server and that the returned account and profile match the code. Pairing the same account again on the same server refreshes it and keeps your other accounts. Codes pointing at localhost, plain HTTP or redirects are refused. If the server can't be reached, an expandable Help lists what to check. If the connection drops after the code was sent, the result is unconfirmed and a new code is needed. An expired or used code also needs a new one. The app never retries on its own.

**Sign in with password** opens its own sign-in dialog. Choose a saved server or enter an HTTPS origin, then sign in with an existing Kindred username and password. Your server must be reachable from the phone, including through your VPN when applicable. This preview requires HTTPS with a trusted certificate; it does not bypass certificate errors or support plain HTTP servers.

Accounts on the same backend use separate Android WebView profiles. Session tokens live in an AES-GCM encrypted vault backed by Android Keystore; credentials are never sent across redirects. A current Android System WebView with multi-profile and document-start support is required. Android backup is disabled because the key cannot be transferred to another device.

## Alerts

Create a Firebase Android app with package `dev.kindred.mobile` and place its downloaded `google-services.json` in `app/` (ignored by Git). Rebuild, configure the matching FCM service account on your Kindred server, then choose **Enable alerts** in account options. Notification permission is requested only when enabling alerts. Without Firebase configuration the app still builds and connects; the alert control explains that push is unavailable.

Bot updates use generic push text and opaque routing IDs. Reminders include their text and scheduled time, subject to system notification-preview settings. Tapping it selects the saved account and chat. Native push registration requires the matching server update. Server mutes and notification preferences remain authoritative. A server that is asleep or offline cannot deliver new events.

## Adaptive behavior and validation

Rotation and fold/unfold resize the existing WebView rather than reload its chat. A separating physical hinge reserves a usable segment. The shared UI changes between a phone drawer and wider sidebar at its existing breakpoints. Drafts persist per isolated account and profile on updated servers. Native system and keyboard insets keep the composer accessible.

Local JVM tests cover pairing link parsing, loopback and ambiguous-host rejection, claim error classification, identity verification, account de-duplication and on-device QR decoding (including inverted codes). They also cover canonical server origins and reject credential-bearing, insecure, and ambiguous URLs. Shared UI tests cover phone/tablet/keyboard-sized viewports, reload recovery, notification navigation, and session bridging. Native device testing, including posture changes, permission flows, file attachments and background FCM delivery, remains a distribution gate. Do not interpret web-layout tests as real-device verification.

The notification channel uses Kindred’s existing brief pop sound; users can change it in system settings. Blob exports up to 32 MB open the system save dialog. Camera capture, file upload/download pickers, and provider sign-in popup flows still need device validation before production distribution.
