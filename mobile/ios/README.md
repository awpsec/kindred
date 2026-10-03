# Kindred for iOS (companion app)

A native SwiftUI shell around the Kindred server's own web UI. Conversations,
settings and everything else are the shared web UI loaded in a `WKWebView`; the
native layer handles accounts, credentials, navigation safety, downloads and
notifications. iOS 17 or later, iPhone and iPad.

> **Mac verification (2026-10-02):** the app builds with Xcode 27.2 beta 2.
> The core suite passes all 39 tests; all 11 native sign-in, Keychain and
> layout/fallback tests pass on iOS 27.2. Live sign-in, account navigation, conversation switching,
> a sent message and received response, and portrait/landscape software-keyboard
> layouts were verified on iPhone 18 Pro. Drafts survive rotation. WebKit layout
> checks cover phone, landscape keyboard and tablet-size viewports. iPhone Duo
> hardware transitions and end-to-end APNs delivery still await verification.

## Layout

```
mobile/ios/
  project.yml                 XcodeGen spec (the .xcodeproj is generated, not committed)
  Config/                     xcconfigs: bundle ID, team, version, APNs environment
  KindredCompanion/           app target (SwiftUI + WebKit + UserNotifications)
    App/                      @main app, UIApplicationDelegate, notification delegate
    Model/AppModel.swift      accounts, sessions, sign-in/out, push registration
    Web/                      WebSession (WKWebView + policy + bridge), host view
    Views/                    root shell, Accounts sheet, Add Account sheet, detail
    Assets.xcassets           icon, accent/canvas/chrome colors, Kindred mark
  KindredCompanionTests/      simulator tests: Keychain, sign-in against a stub server
  Packages/KindredCore/       Foundation-only rules + XCTest (`swift test`)
  tools/render-assets.py      regenerates the icon PNGs from tools/*.svg
```

## Setup

1. Install Xcode 15.3+ and XcodeGen (`brew install xcodegen`), complete Xcode's
   first-run setup, and install an iOS simulator runtime. Xcode 27.2 beta 2 was
   used for the Mac verification above. For iPhone Duo, Apple's
   [27.2 release notes](https://developer.apple.com/documentation/xcode-release-notes/xcode-27_2-release-notes)
   require the SDK and simulator support supplied by Xcode 27.1 beta; the
   standard iOS 27.2 runtime does not support the Duo device type.
2. Create `Config/Local.xcconfig` (ignored by Git) with your values:
   ```
   KINDRED_BUNDLE_IDENTIFIER = com.example.kindred
   KINDRED_DEVELOPMENT_TEAM = ABCDE12345
   ```
   No team ID or bundle ID has been supplied yet; the committed defaults
   (`dev.kindred.companion`, empty team) only build for the simulator.
3. `cd mobile/ios && xcodegen generate && open KindredCompanion.xcodeproj`
4. For notifications, enable the Push Notifications capability for that
   App ID in the Apple Developer portal. The entitlement file already
   declares `aps-environment` from the build configuration.

## Tests

```
cd mobile/ios/Packages/KindredCore && swift test          # core rules (macOS or Linux)
cd mobile/ios && xcodebuild test -scheme KindredCompanion \
  -destination 'platform=iOS Simulator,name=iPhone 15'     # Keychain + sign-in flow
```

Core tests cover address normalization, exact-origin matching, navigation
decisions, the session/accounts message parsers, the document-start script,
push payload routing, request construction, response/redirect validation and
the account metadata store. App tests cover the Keychain store (round trip,
`…ThisDeviceOnly` accessibility) and `AppModel` sign-in/removal against a
`URLProtocol` stub.

Keep simulator code signing enabled when running the native tests. Ad hoc
simulator signing does not require a developer team, but an unsigned build
(`CODE_SIGNING_ALLOWED=NO`) fails the real Keychain tests with error -34018.
Removal tests cover both accounts that never opened a web page and accounts
with an existing persistent web data store.

## How it works

### Accounts and credentials

- **Sign in** happens in a native sheet: pick a saved server or enter a new
  one, then username and password. The app first checks `GET /identity/meta`
  answers `{"profiles":true}`, then sends `POST /identity/login
  {"login","password"}` and receives `{"token","profile_id"}`.
  `GET /identity/profiles` supplies the server account UUID, username and
  workspace name.
- **Server addresses** are HTTPS only. A missing scheme means `https://`.
  Addresses with credentials, a path, query, fragment, backslash, non-ASCII
  characters (use punycode) or an invalid port are refused with a specific
  message, not silently cleaned up. The saved form is the canonical origin
  (`https://host[:port]`, lowercased, default port dropped).
- **Session bearer** is stored only in the Keychain: one generic-password item
  per account, `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`, never
  synced or restored to another device. Account metadata (server, login,
  workspace name, server account UUID, notification state) is JSON in
  Application Support with file protection. Passwords are never stored.
- **Native HTTP** (`KindredAPIClient`) uses an ephemeral session without
  cookies, cache or credential storage, **refuses every redirect**, and
  rejects any response whose final URL is not the request's origin. No Origin
  header is sent (the server only checks Origin when one is present).
- **TLS:** default system trust only. There is no certificate bypass, no
  `NSAllowsArbitraryLoads`, and no authentication-challenge override.

### Web UI

- The app bundles `Web/MobileLayout.css` and `.js` so older servers also receive
  mobile text sizing, touch targets, a dismissible conversation drawer and
  native account navigation. These run only in the account's main-frame origin.
  The chat uses one header; native accounts/reload controls return if the web
  page fails to load. A very short landscape keyboard layout hides the chat
  header until there is room for it again. Messages stop above the composer.
- Run `node tools/frontend/test-ios-layout.cjs` from the repository root with
  Playwright/WebKit installed to check bundled layout resources and the bridge
  against the local frontend fixture. Set `KINDRED_PLAYWRIGHT_MODULE` when
  Playwright is installed outside this checkout.
- Each account has its own `WKWebsiteDataStore(forIdentifier: account UUID)`,
  so cookies, local/session storage and caches never mix between accounts.
  Removing an account deletes its data store (retried at next launch if the
  web content process still holds it).
- A document-start user script runs in the **main frame only** and only when
  `location.origin` is exactly the account's origin. It sets
  `window.__KINDRED_MOBILE = true` and `__KINDRED_NATIVE_SESSION_BOOTSTRAP`,
  removes `localStorage["kindred-token"]`, and seeds
  `sessionStorage["kindred-token"]` **only if the page has none yet**. The
  script is replaced every time the persisted token changes, so reloads,
  crash recovery and notification routes start from the latest token, and a
  page that already rotated its session (profile switch) keeps the newer one.
- **Bridge:** exactly two `WKScriptMessageHandler`s, matching the shared UI's
  `ui/mobile.js`:
  - `kindredSession.postMessage({token, profile_id})` after sign-in, profile
    switch or connect; `token: ""` means the page signed out.
  - `kindredAccounts.postMessage({action: "open"})` opens the native Accounts
    sheet (the web UI's "Manage accounts").

  Messages are accepted only from this web view's main frame with the exact
  origin (frame security origin and current URL both checked) and are
  validated before use. There is no file, HTTP, or native-execution bridge.
- When the scene goes inactive, the app reads the page's current token from
  an isolated content world in the main frame and saves it if it changed, in
  case a rotation message was missed.
- **Navigation:** the web view only shows its own origin. A link the person
  taps to another site, `mailto:`, `tel:` etc. opens in the system. Anything
  else that would leave the origin (script navigation, form posts, server
  redirects, cross-origin frames) is refused with a short notice. Main-frame
  responses and server redirects are checked again as a safety net.
- **Downloads** use `WKDownload` for same-origin, `blob:` and `data:` URLs and
  for responses marked `Content-Disposition: attachment` or not displayable.
  Files land in a temporary folder and open the share sheet (Save to Files,
  AirDrop…). The folder is cleared on the next launch.
- **Uploads** use WebKit's built-in `<input type=file>` picker (Photos,
  Camera, Files). Camera/microphone prompts for dictation are allowed for the
  server's main frame only, and iOS still asks the person.
- **Layout:** the web view sits inside the safe area and SwiftUI shrinks it
  above the keyboard; its scroll view doesn't add a second inset. The same
  `WKWebView` instance is kept across rotation, Split View / Stage Manager
  resizing and account switches (up to three live accounts), so page state
  survives size changes. Multiple windows are disabled because one web view
  can't appear in two scenes.

### Notifications

Server support is the `mobile_push` work in the server repository (routes
`PUT/DELETE /api/mobile/devices/{installation_uuid}` and
`GET /api/mobile/push-status`). At the time of writing that code is
**uncommitted work in progress** in `kindred-server`; servers without it
answer 404 and the app says notifications aren't offered.

- Permission is requested only when the person taps **Enable Alerts** on an
  account, and only after `GET /api/mobile/push-status` reports
  `platforms.ios == true`.
- Registration: authenticated `PUT /api/mobile/devices/{installation_uuid}`
  with `{"platform":"ios","token":"<APNs hex>","environment":"sandbox"|"production","account_id":"<server account UUID>"}`.
  The server registers the device in every workspace (profile) the account
  owns and moves registrations along when the session rotates (workspace
  switch, password change); `DELETE` removes it from all of them.
  Each saved account has its own random installation UUID, so two accounts or
  servers never overwrite or correlate each other's registration.
- The environment comes from the build configuration
  (`KINDRED_APS_ENVIRONMENT`: Debug `development` → reported as `sandbox`,
  Release `production`), which also sets the `aps-environment` entitlement.
  It is not hard-coded.
- Token lifecycle: the app re-requests the APNs token whenever it becomes
  active (if alerts are wanted) and re-registers every account whose recorded
  token or environment differs. Failures retry with backoff (30 s … 30 min)
  and again on the next activation. A rotated session (profile switch,
  re-sign-in) re-registers under the new session.
- Signing in again to a saved account asks the server for its saved
  workspace, ends the replaced session, and only then re-registers.
- **Turning off, signing out and removing** send `DELETE` first, while the
  session can still authenticate. Only a server response `{"removed": …}`
  counts as removed. If it fails, the state is shown as "removal wasn't
  confirmed", credentials are kept for a retry, and signing out/removing asks
  before continuing anyway. If the web page signs out first, the app forgets
  the session locally at once, then tries `DELETE` with the old token and
  otherwise records that it couldn't confirm removal (the server drops
  registrations bound to an ended session).
- Account metadata is excluded from device backups, so a restored phone
  never reuses another device's installation UUIDs.
- Payloads are opaque: `{"aps":{"alert":{generic}},"account_id","profile_id","installation_uuid","chat_id","event_id"}`.
  Tapping one picks the saved account by installation UUID (falling back to
  the server account UUID only when that is unambiguous), switches to the
  event's workspace if needed (`POST /identity/switch`), then loads
  `https://server/#kindred-chat=<chat id>`; the shared UI opens the
  conversation and clears the fragment. Unknown or ambiguous payloads are
  ignored with a notice; invalid IDs are dropped.
- The server needs `KINDRED_APNS_KEY_FILE`, `KINDRED_APNS_KEY_ID`,
  `KINDRED_APNS_TEAM_ID` and `KINDRED_APNS_TOPIC` (the bundle ID). No APNs key
  or team has been supplied, so **push has not been delivered end to end**.

## Known limitations

- Live server workflows, iPhone Duo transitions and UI on physical hardware
  have not yet been verified.
- HTTPS origins only; plain HTTP and self-signed certificates (without a
  trusted profile installed on the device) won't connect. Servers under a
  path prefix aren't supported.
- Downloads go through the share sheet; there is no in-app file browser.
  Pages that open blob URLs in new windows are saved as downloads rather
  than shown.
- `window.open`/`target=_blank` to the server's own origin loads in the
  same web view.
- A web-form sign-in inside an account's web view as a *different* user
  updates that account's session token but not its saved username.
- Legacy access-token servers (no `account_id`) can sign in but can't use
  notifications.
- Alerts appear while the app is open (`willPresent` shows a banner); there
  is no background refresh or badge management.

## Verifying on a Mac

1. `swift test` in `Packages/KindredCore`, then the app test scheme above.
2. Run on a simulator against an HTTPS Kindred server: add two accounts on
   one server and one on another; confirm grouping, switching keeps each
   page's state, and each account stays signed in after relaunch.
3. Switch workspace (profile) in the web UI, relaunch, and confirm the new
   workspace loads. Sign out in the web UI and confirm the native
   signed-out screen.
4. Tap an external link (opens Safari) and confirm a server redirect to
   another host is refused.
5. Download and upload a file; rotate and resize on iPad with the keyboard up.
6. With a team, APNs key on the server and a device: Enable Alerts, check
   the registration with `GET /api/mobile/push-status?installation_uuid=…`,
   trigger a message, tap the alert, then Turn Off Alerts and confirm
   `registered:false`.
