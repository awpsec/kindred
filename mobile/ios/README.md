# Kindred for iOS (companion app)

A native SwiftUI shell around the Kindred server's own web UI. Conversations,
settings and everything else are the shared web UI loaded in a `WKWebView`; the
native layer handles accounts, credentials, navigation safety, downloads and
notifications. iOS 17 or later, iPhone and iPad.

> **Mac verification (2026-10-03):** the app builds with Xcode 27.2 beta 2.
> The core suite passes all 39 tests; all 25 native sign-in, Keychain, appearance and
> layout/fallback tests pass on iOS 27.2. Live sign-in, account navigation, conversation switching,
> a sent message and received response, and portrait/landscape software-keyboard
> layouts were verified on iPhone 18 Pro. The browser form-navigation toolbar is
> suppressed, and the system keyboard Dictate button is available. The profile settings sheet, section tabs, swipe dismissal and
> Accounts in both light and dark mode were also checked. Drafts survive rotation. WebKit layout
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

### Free Personal Team installation

For a seven-day personal-device test, choose the **KindredPersonal** scheme.
Its **Personal** configuration uses an empty entitlement file and no APNs
environment. Debug and Release retain their existing push configuration.
The app remains version 0.1.0, build 1; this is a direct Xcode installation.

Sign into Xcode's **Settings → Apple Accounts**, connect and unlock the iPhone,
trust the Mac, and enable Developer Mode on the phone when prompted. Select
your Personal Team under the app target's **Signing & Capabilities** with
automatic signing enabled. Select the physical iPhone as the destination and
Run. Rebuild and reinstall after the provisioning profile expires in seven days.

To preserve signing when regenerating the project, put the selected team ID
and a unique bundle identifier in ignored `Config/Local.xcconfig`, as above.
Keep the bundle identifier stable during renewals to retain the installation's
account data. Background push requires the paid signing configuration and APNs
server setup; it is unavailable in this Personal build.

For repeatable installs and renewals from exactly the pushed source, use:

```
DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer \
  python3 mobile/ios/tools/install-personal.py --device YOUR_IPHONE_IDENTIFIER
```

Run from the repository root after configuring local signing. The command refuses
uncommitted changes or a checkout that differs from its fetched upstream branch,
generates the project, signs/builds the app, checks parity again, then installs
and launches it. It records the source commit in the app's Versions display and
an ignored `DerivedData/PersonalDevice/installation.json` receipt. Use `--check`
to check source parity alone. Keep the phone connected/unlocked for installation.
Push completed iOS changes to GitHub before repeating this command; it updates
the existing installation with the same bundle identifier. GitHub pushes do not
automatically install updates on the phone, and the seven-day signature still
requires renewal from the Mac.

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
  separate full-screen chat/list views, floating navigation controls, a centered
  glass tag with the avatar beside the name, compact glass composer, and native account navigation. The
  profile circle opens a bottom settings sheet with horizontal section tabs;
  tapping the name card opens Accounts. Artifacts and Marketplace share the
  three-dot menu beside the profile circle.
  Artifacts uses separate list/document pages, with Chats, search and create
  circles in the list and a back circle in documents. Returning to the list
  preserves the current editor and draft. Refresh and Edit use glass circles;
  Download is hidden on iOS. Bot Details and Computer have no
  desktop pane divider. These bundled overrides apply only to the iOS app;
  desktop and ordinary mobile browsers retain their shared UI.
  Native accounts and sign-in sheets follow the selected app appearance. Native
  safe-area colors follow the page theme and select dropdowns use the iOS picker. These run only in the account's main-frame origin.
  The chat uses one header; native accounts/reload controls return if the web
  page fails to load. A very short landscape keyboard layout hides the chat
  header until there is room for it again. Messages scroll behind graduated fades and floating controls, with measured
  padding to keep the first and last messages reachable. Web controls use CSS
  glass styling; native sheets and press menus use system materials. Versions
  shows the installed iOS version/build and connected server version without an
  updater. Dictation uses the iPhone keyboard; desktop speech settings are hidden.
  The approved native K blink/tilt/lift/dissolve plays once per process, with a
  Reduce Motion fade and bounded reveal. The OS static launch screen follows device appearance;
  the animated handoff follows the cached account appearance.
  Slab phones use the entire computer screen without an expansion button; in
  landscape, watching keeps controls/resources beside the desktop. Taking
  control on a phone rotates the app upright and locks portrait until control
  is returned or the pane is closed. The keyboard stays available while the
  controlled screen is visible; reopening restores it. View-only screen taps
  have no expansion or remote-input action. UIKit's keyboard layout guide
  sizes the web view once, keeping the composer at the real keyboard edge
  through focus changes and rotation. A task's stop action appears only after
  tapping its status line; tapping elsewhere hides it, and status refreshes
  preserve the reveal. Notification preferences retain their server save but
  device setup uses native Accounts. Free Personal Team builds explain the
  push-signing limit rather than showing the browser/desktop warning. Division reserved
  regions (including inactive regions) retain foldable expansion controls.
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
  Camera, Files). Camera/microphone prompts for attachments are allowed for the
  server's main frame only, and iOS still asks the person.
- **Layout:** the web view respects the top/side safe areas and extends behind
  the home indicator with hardware padding supplied to the page. WebKit's
  visible viewport sets the page height above the keyboard; SwiftUI doesn't
  subtract that space again. A public `WKWebView.inputAccessoryView` override
  removes the browser's previous/next/Done toolbar while retaining the system
  keyboard, suggestions and editing controls. The same
  `WKWebView` instance is kept across rotation, Split View / Stage Manager
  resizing and account switches (up to three live accounts), so page state
  survives size changes. Multiple windows are disabled because one web view
  can't appear in two scenes.
- **Page scale:** the native web view honors a viewport fixed at 1×. Double
  taps and pinches cannot zoom the app shell. This does not change Safari,
  the app's reading-size setting, iOS accessibility Zoom, or gestures handled
  by computer/document content itself.

### Conversation press menus

Conversation rows and pinned cards use UIKit context menus (Haptic Touch),
without visible pin or overflow buttons. UIKit renders the existing server
menu actions, including nested mute durations. The trusted page supplies
bounded labels and opaque action IDs; selecting one invokes its existing
page action. Opening a menu never changes a conversation. Scrolling cancels
the target, and desktop drag-reordering is suppressed on pinned cards so
horizontal scrolling and the iOS press gesture remain available.

Tap menus also use UIKit action sheets: composer attachments/teaching, new
bot/chat, screen selection, avatar choices, library More, and artifact/file
actions. Desktop menu panels are suppressed before painting; action callbacks
stay with the server UI. See [the menu audit](design/menus.md) for the inventory
and regression coverage.

### Message gestures

On touch/mobile layouts, message action and timestamp rows are hidden. A
leftward hold/swipe reveals timestamps beside the bubbles; releasing returns
them to their hidden state. Vertical scrolling stays native. Pressing a
message opens UIKit's context menu on iOS with React, Reply and Copy message,
using the existing server actions. Queued-message editing is omitted on iOS.
Text selection is suppressed on message bubbles; use Copy message instead.
Links and existing reaction badges retain their normal actions.

The shared `ui/mobile-messages.js` module provides a touch press menu for
mobile browsers and Android. Desktop controls remain unchanged. iOS bundles
this module, so its gestures also work with older server UI. Other mobile
clients receive it with a future server release; source changes alone do not
update the running server.

WebKit fixture checks cover menu actions, stale action rejection, timestamps,
vertical scrolling and the portable press menu. Native tests cover UIKit menu
construction. A physical press/swipe on an iPhone still needs hands-on checking.

iOS also omits artifact source editing in the library and inline chat cards.
Preview, refresh, creation, and metadata controls remain available. Established
web navigation stays in charge during route changes/reloads so opening an
artifact cannot briefly restore the native account toolbar; a page failure
still exposes native recovery controls.

Conversation content extends behind the iOS status bar. A fading blur keeps
the system time and indicators readable, while hardware insets keep chat,
computer, list, and artifact buttons clear of the notch. Reduce Transparency
uses an opaque status material instead.

### Bot computer keyboard

Taking control opens the native iPhone keyboard; returning control or closing
the computer dismisses it. Native text entry forwards to the live noVNC canvas,
including Delete, Return, and composed text. Input is gated by the active control
session. The host uses public WKWebView focus to show the keyboard after the
asynchronous takeover finishes.

Portrait places the screen at the top and circular Paste and Take/Return control
icon buttons immediately below it. Teaching remains a desktop workflow.
Resources and routines collapse during keyboard
entry. The iOS app omits the decorative screen backdrop, reconnect button,
server address, and Computer settings shortcut. Landscape keeps controls beside
the screen.

When leaving a paused computer, one compact glass reminder above the chat
composer offers Return control. The desktop popup and duplicated composer
warnings are consolidated, with the server's bot/pause action and errors retained.

In Xcode 27 Device Hub, disable **Device → Keyboard → Simulate Hardware
Keyboard** when checking software keyboard behavior. **Toggle Software
Keyboard** can also show it manually.

### Notifications

Server support is the `mobile_push` work in the server repository (routes
`PUT/DELETE /api/mobile/devices/{installation_uuid}` and
`GET /api/mobile/push-status`). That support is committed in the server
source. Older running servers answer 404 and the app explains that background
notifications require mobile push support; installing this companion doesn't
upgrade the server. The account screen distinguishes missing server support
from missing APNs configuration and missing Apple push signing in the build.
An app can alert when it is actively receiving messages, but iOS can suspend
it in the background. Keeping a web connection open is not a substitute for
APNs. The companion's native notification delivery currently uses APNs;
these wording changes do not add local notification delivery.

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
- Foreground alerts are presented only for a saved, signed-in account that
  opted into alerts. Invalid, ambiguous or stale installation identifiers,
  and alerts arriving after opt-out or sign-out, are suppressed. Background
  delivery remains controlled by iOS and the server registration.
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

- Live sign-in, a chat roundtrip, settings/accounts appearance, computer views
  and library navigation have been checked in the simulator. iPhone Duo
  transitions and UI on physical hardware still await verification.
- Conversation menu data/actions and row-control removal pass checks. The
  native press gesture still awaits live verification; the Mac locked during
  the simulator check.
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

### Notification verification on the simulator

The account details screen on the currently running server reports that mobile
notifications are unavailable (push-status returns 404). Core request/payload
checks, native opt-out/sign-out and account-routing tests, and the server's
mobile-push tests pass. These checks do not establish APNs delivery: enabling
alerts, receiving a background banner and tapping it into a live conversation
still require a server offering iOS push plus matching APNs signing/configuration.

### Approved launch animation

The [wake-up animation handoff](design/launch/README.md) contains the approved
light/dark previews and exact motion reference. `KindredLaunchView` implements
its mark geometry and timing natively over the existing root, with separately
drawn pill eyes and no persistent branding added to navigation. The static OS
launch screen and raster assets are unchanged.

The real UI starts loading concurrently. Its fade/settle normally starts at
1.17 seconds; late content can delay that by at most 130 ms. The layer is removed
by 1.97 seconds even with an unavailable server, exposing the existing loading,
sign-in or error controls. Reduce Motion skips the mark animation and travel,
using a 220 ms opacity transition. Motion starts after scene activation so the
static iOS launch snapshot and animated mark do not overlap.

Simulator checks cover light and dark cold launches, Reduce Motion, signed-out
startup, the existing signed-in chat, background return without replay, and taps
after the layer disappears. Native keyframes were compared with the approved
GIFs. The 22 native tests also cover the exact motion phases, late/unavailable
content, opacity-only reduced motion, and completion surviving activation,
reload and account switches. Physical-device startup still awaits verification.
