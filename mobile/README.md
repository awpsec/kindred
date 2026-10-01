# Kindred mobile

Native companion apps for existing Kindred backends. The backend runs your bots; iOS and Android provide access to chats, artifacts, questions and computer views through the shared Kindred UI.

- [Android build and setup](android/README.md)
- [iOS build and setup](ios/README.md)

These are preview sources. Android builds locally on Linux; iOS needs macOS and Xcode for compilation and signing. No App Store, TestFlight, Play Store, or production push credentials are included. Accounts connect to trusted HTTPS server origins. Desktop standalone installation remains a desktop feature.

Separate native shells keep the platform-specific parts small: secure credentials, separate account web sessions, system permissions, external navigation, and push delivery. The server-hosted UI remains the single chat implementation. Native bridges accept only narrowly defined messages from the selected server's main frame. Android blob exports use a bounded transfer into the system save dialog; server pages cannot choose native filesystem paths or issue arbitrary native network commands.

Phone, tablet and foldable layouts respond to the usable viewport rather than a hardware model name. Opening a foldable should retain the same chat and draft. The iPhone Duo still needs validation with Apple's simulator/device support before compatibility can be promised.

The matching server update adds direct APNs/FCM support. Push setup is optional and off by default. Missing credentials must be shown as unavailable, not silently replaced by background polling: suspended mobile apps cannot reliably poll a server. See the server's mobile push documentation for deployment configuration.

## Local validation

```sh
KINDRED_PLAYWRIGHT_MODULE=/path/to/playwright node tools/frontend/test-mobile-companion.cjs
WEBKIT=1 KINDRED_PLAYWRIGHT_MODULE=/path/to/playwright node tools/frontend/test-mobile-companion.cjs
```

Those commands run from the repository root. They validate shared UI resizing, saved drafts, notification chat routing, and native bridge messages with a local fixture. They do not substitute for native-device acceptance tests or real APNs/FCM delivery.
