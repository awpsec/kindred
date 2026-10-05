# Kindred for iOS (companion app)

A native SwiftUI shell around the Kindred server's own web UI. Conversations,
settings and everything else are the shared web UI loaded in a `WKWebView`; the
native layer handles accounts, credentials, navigation safety, downloads and
notifications. iOS 17 or later, iPhone and iPad.

> **Status:** the app target has **not been compiled or run**; it was written
> on Linux without Xcode. `KindredCore` builds and its tests pass on Linux
> (Swift 6.1 container), and every app/test file passes `swiftc -parse`, but
> UIKit/SwiftUI/WebKit code is unchecked until the first Mac build (see
> "Verifying on a Mac").

## Layout

```
mobile/ios/
  project.yml                 XcodeGen spec (the .xcodeproj is generated, not committed)
  Config/                     xcconfigs: bundle ID, team, version, APNs environment
  KindredCompanion/           app target (SwiftUI + WebKit + UserNotifications)
    App/                      @main app, UIApplicationDelegate, notification delegate
    Model/AppModel.swift      accounts, sessions, sign-in/out, pairing, push registration
    Pairing/                  QR scanner (AVFoundation) and pairing sheet
    Web/                      WebSession (WKWebView + policy + bridge), host view
    Views/                    root shell, Accounts sheet, Add Account sheet, detail
    Assets.xcassets           icon, accent/canvas/chrome colors, Kindred mark
  KindredCompanionTests/      simulator tests: Keychain, sign-in against a stub server
  Packages/KindredCore/       Foundation-only rules + XCTest (`swift test`)
  tools/render-assets.py      regenerates the icon PNGs from tools/*.svg
```

## Setup

1. Install Xcode 15.3+ (Xcode 16 recommended) and XcodeGen
   (`brew install xcodegen`).
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

## How it works

### Accounts and credentials

- **Sign in** happens in a native sheet: pick a saved server or enter a new
  one, then username and password. The app first checks `GET /identity/meta`
  answers `{"profiles":true}`, then sends `POST /identity/login
  {"login","password"}` and receives `{"token","profile_id"}`.
  `GET /identity/profiles` supplies the server account UUID, username and
  workspace name.
- **Phone pairing** needs no password. In Kindred on the computer, choose
  Connect mobile app. On the phone, choose Scan Pairing Code, or paste the
  link: `kindred://pair?server=<HTTPS origin>#code=<64 hex>`. The camera
  app can also open that link. QR codes are decoded on the device with
  AVFoundation. The app shows the server and sends nothing until you choose
  Connect. It then checks `GET /identity/meta` and sends
  `POST /identity/mobile-pairing/claim {"code"}` without an Origin header.
  Redirects are refused. Before anything is saved, `GET /identity/profiles`
  must confirm the returned `account_id`, `login` and `profile_id`.
  Same server plus same account refreshes that saved account. Other accounts
  are untouched. Links pointing at loopback, plain HTTP or ambiguous numeric
  hosts are refused. If the server can't be reached, Help shows a checklist and the same code can be tried again. If the connection drops after the code was sent, the result is unconfirmed and a new code is needed. A
  rejected code says to create a new one. Nothing is retried automatically.
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

### System text size

The shared UI follows the iPhone/iPad Settings text size, including accessibility
sizes. The native host measures UIKit's preferred body font against the Large
body font, then supplies `window.__KINDRED_SYSTEM_TEXT_SCALE` before page startup.
It writes the global before dispatching `kindred-system-text-size` with
`detail.scale` on changes. `__KINDRED_MOBILE_PLATFORM` is `ios`; the shared
reading-size module applies this signal once, instead of a saved app percentage.
Desktop and Android reading-size preferences retain their existing behavior.

The script is confined to the selected origin's main frame. Content-size
notifications, return to the foreground, cached-account attachment and completed
loads keep the current page and its next bootstrap in sync. Updating the signal
does not reload the page, alter its session, or set `WKWebView.pageZoom`; the
remote computer canvas keeps its coordinate system. Native SwiftUI text retains
its semantic Dynamic Type fonts. These behaviors still need Mac/device acceptance.

To check the generated JavaScript without UIKit, from `mobile/ios`:

```sh
swiftc Packages/KindredCore/Sources/KindredCore/*.swift tools/text-size-fixtures.swift -o /tmp/kindred-text-size-fixtures
/tmp/kindred-text-size-fixtures > /tmp/kindred-text-size-fixtures.json
node tools/test-text-size-bridge.cjs /tmp/kindred-text-size-fixtures.json
```

This executes scripts emitted by the actual core implementation and checks
initial/live scale, frame/origin/platform boundaries and unchanged sessions.
It does not test UIKit's category mapping; `SystemTextSizeTests` belongs to the
Mac app test target.

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
  `https://server/#kindred-chat=<chat id>&kindred-event=<event id>` when a
  valid event ID is present. With the matching updated server and shared UI,
  that event is resolved within the authenticated workspace to open the
  request or explain its stale status,
  then clears the fragment. Older payloads without an event ID open the chat.
  Unknown or ambiguous payloads are ignored with a notice; invalid IDs are dropped.
- The server needs `KINDRED_APNS_KEY_FILE`, `KINDRED_APNS_KEY_ID`,
  `KINDRED_APNS_TEAM_ID` and `KINDRED_APNS_TOPIC` (the bundle ID). No APNs key
  or team has been supplied, so **push has not been delivered end to end**.

## Known limitations

- Not compiled, not run on a simulator or device, no UI review on hardware.
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

Pairing: scan a code from Connect mobile app and confirm the server screen.
Check a second scan of the same account, an expired or used code, a server
that is asleep (Help), a dark-mode QR, denied camera permission (paste
fallback) and opening the link from the Camera app.

1. `swift test` in `Packages/KindredCore`, then the app test scheme above.
   `SystemTextSizeTests` checks Large as baseline and all normal/accessibility
   categories in increasing order.
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

### Text-size and return-control acceptance on iPhone

Use an isolated test account/backend; do not use a payment/provider login for
this check. A Linux/WebKit fixture cannot establish these native results.

- With an old `kindred-text-size` value saved in the account's web store, change
  Settings → Display & Brightness → Text Size, then the Accessibility → Display
  & Text Size → Larger Text slider. Check xS, Large, XXXL, AX3 and AX5. The shared
  Settings screen must explain that iOS text size follows the system. The saved
  percentage must not block changes or be deleted as a side effect.
  Repeat using Control Center → Text Size with Kindred Only selected; verify
  the per-app override is reflected by UIKit and the shared web text.
- Leave a long chat open with a draft, table and code block. Change the system
  category via Accessibility Inspector while foregrounded, then via Settings
  while backgrounded. Confirm size updates without page reload, losing the
  draft, replaying motion, or jumping away from the visible conversation.
- Reload, switch to another saved account and back, and load a notification
  route. Each page must start at the current size and retain its own session.
  Change size while a page is loading to exercise the completed-load refresh.
- At the same categories check light/dark chat, sidebar, shared Settings and
  computer toolbar. Verify reachable composer above the keyboard, safe areas,
  wrapping/ellipsis, usable controls and at least 44pt touch targets. AX4/AX5
  failures need review with captures; do not silently cap the system setting.
- Take manual control in computer view, focus a browser text field, dismiss the
  keyboard, and tap Return control, both with and without the keyboard visible.
  Check the toolbar action reaches the intended bot and returns control without
  the reported white full-width bar; compare the working chat action. Rotate
  during input and check the host's resize/keyboard avoidance does not swallow
  the tap. Repeat once with a failed release to confirm a visible retry path.

### Approved launch animation

The [wake-up animation handoff](design/launch/README.md) contains the approved
light/dark previews and exact motion reference for native integration. It keeps
the mobile navigation unbranded; startup integration is pending Mac validation.
