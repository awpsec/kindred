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

> **Combined update verification (2026-10-07):** Xcode 27.2 beta 2 builds the
> latest main source together with the existing native mobile presentation. All
> 76 core tests and 34 app-hosted simulator tests pass. WebKit checks run with
> the real iOS navigation bridge enabled and an isolated connected VNC fixture,
> covering control, rotation, keyboard input and the native menu overrides.

> **Duo preparation (2026-10-07):** Xcode 27.1 beta 27A9269 and its genuine
> iPhone Duo simulator run all 34 native tests; all 78 core tests pass. The
> system places the native actions on the inner display's right edge. A live
> Dynamic Type change updates the open page without reloading it. Automated
> WebKit tests cover retained drafts, selection, reading position and computer
> connection across outer/inner geometry, book/tabletop divisions, keyboard
> shrink, asymmetric safe areas, camera clearance and light/dark/Reduce Motion.
> The remaining interactive simulator checks are recorded in
> [Duo compatibility](duo-compatibility.md); they are not hardware certification.

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

1. Install a current Xcode. Use **Xcode 27.1** for the owner-selected
   Duo simulator and adaptive native-toolbar checks; older SDKs cannot prove
   that layout. Install XcodeGen
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

### Private computer addresses

Manual entry accepts a bare private IP and port such as `192.168.1.20:9444`
as HTTP, while names default to HTTPS. An explicit `https://` is preserved;
there is no downgrade or retry over HTTP. IPv6 needs brackets, for example
`http://[fd7a::5]:9444`. Only literal addresses in `10.0.0.0/8`,
`172.16.0.0/12`, `192.168.0.0/16`, `100.64.0.0/10`, and **`fd00::/8`** may
use HTTP. DNS/MagicDNS names, public addresses, loopback, link-local addresses
and IPv4-mapped IPv6 cannot use HTTP.

Before verification, login or pairing sends anything, the native sheet displays
**Not encrypted · private network address**, the full origin, and **Connect
anyway**. Confirmation applies only to that scheme, host and port. HTTP and
HTTPS at the same host remain separate saved accounts, Keychain sessions and
web stores. Existing saved HTTPS origins retain HTTPS; prefills include the
scheme. All native navigation, bridge, downloads and API response checks still
require the exact origin. Redirects remain refused.

The app requires iOS 17. Apple's current ATS documentation supports CIDR
exceptions from iOS 17; `Info.plist` contains only these five HTTP exceptions
and a local-network permission description. It enables no global arbitrary
loads. See [Apple NSExceptionDomains](https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity/nsexceptiondomains).

Linux core tests verify parsing, isolation and confirmation policy; they do not
prove iPhone ATS, local-network permission, WKWebView or WebSocket behavior.
On a Mac/device, verify cancel sends nothing, private IPv4 and fd IPv6 login
and QR pairing, the local-network prompt and denied-permission recovery,
HTTP API and WebSocket connectivity, exact-origin redirects and account
switching, and existing HTTPS sessions. This requires a new native build;
a server update alone cannot add this phone transport support.

### Accounts and credentials

- **Sign in** happens in a native sheet: pick a saved server or enter a new
  one, then username and password. The app first checks `GET /identity/meta`
  answers `{"profiles":true}`, then sends `POST /identity/login
  {"login","password"}` and receives `{"token","profile_id"}`.
  `GET /identity/profiles` supplies the server account UUID, username and
  workspace name.
- **Phone pairing** needs no password. In Kindred on the computer, choose
  Connect mobile app. On the phone, choose Scan Pairing Code, or paste the
  link: `kindred://pair?server=<explicit server origin>#code=<64 hex>`. The camera
  app can also open that link. QR codes are decoded on the device with
  AVFoundation. The app shows the server and sends nothing until you choose
  Connect. It then checks `GET /identity/meta` and sends
  `POST /identity/mobile-pairing/claim {"code"}` without an Origin header.
  Redirects are refused. Before anything is saved, `GET /identity/profiles`
  must confirm the returned `account_id`, `login` and `profile_id`.
  Same server plus same account refreshes that saved account. Other accounts
  are untouched. Links pointing at loopback, unsupported HTTP or ambiguous numeric
  hosts are refused. Private HTTP needs the additional unencrypted confirmation. If the server can't be reached, Help shows a checklist and the same code can be tried again. If the connection drops after the code was sent, the result is unconfirmed and a new code is needed. A
  rejected code says to create a new one. Nothing is retried automatically.
- **Server addresses** use HTTPS for names and public IPs; a bare supported
  private literal IP means HTTP and requires confirmation.
  Addresses with credentials, a path, query, fragment, backslash, non-ASCII
  characters (use punycode) or an invalid port are refused with a specific
  message, not silently cleaned up. The saved form is the canonical origin
  (`http(s)://host[:port]`, canonical host, scheme-default port dropped).
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
  `https://server/#kindred-chat=<chat id>&kindred-event=<event id>` when a
  valid event ID is present. With the matching updated server and shared UI,
  the UI resolves that event within the authenticated workspace to open the
  request or explain its stale status, then clears the fragment. Older payloads without an event ID open the chat.
  Unknown or ambiguous payloads are ignored with a notice; invalid IDs are dropped.
- The server needs `KINDRED_APNS_KEY_FILE`, `KINDRED_APNS_KEY_ID`,
  `KINDRED_APNS_TEAM_ID` and `KINDRED_APNS_TOPIC` (the bundle ID). No APNs key
  or team has been supplied, so **push has not been delivered end to end**.

## Known limitations

- Live sign-in, a chat roundtrip, settings/accounts appearance, computer views
  and library navigation have been checked in the simulator. Duo's inner
  native toolbar and live text-size changes have also been checked. The full
  Duo touch, software-keyboard and fold-pose matrix remains incomplete; see
  [the acceptance record](duo-compatibility.md). Physical Duo verification is pending.
- Conversation menu data/actions and row-control removal pass checks. The
  native press gesture still awaits live verification; the Mac locked during
  the simulator check.
- Private literal-IP HTTP needs the updated native app and an explicit
  confirmation. HTTPS with an untrusted/self-signed certificate still requires
  a trusted profile installed on the device. Path-prefix servers are unsupported.
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

### Notification verification on the simulator

The account details screen on the currently running server reports that mobile
notifications are unavailable (push-status returns 404). Core request/payload
checks, native opt-out/sign-out and account-routing tests, and the server's
mobile-push tests pass. These checks do not establish APNs delivery: enabling
alerts, receiving a background banner and tapping it into a live conversation
still require a server offering iOS push plus matching APNs signing/configuration.

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

## Local update and adaptive-navigation acceptance

Use the instructor's accepted combined source commit, not an unreviewed task
branch. Keep the existing `Config/Local.xcconfig`, bundle identifier, development
team and signing identity when updating an installed phone. Do not uninstall the
app, reset simulator content, delete Keychain items, or change its bundle ID:
those operations can discard saved accounts or separate them from their sessions.

On the Mac, select the intended Xcode in Settings → Locations → Command Line
Tools, then from `mobile/ios` run `xcodegen generate` and open
`KindredCompanion.xcodeproj`. Select **KindredCompanion**, your connected unlocked
phone, and the existing team under Signing & Capabilities. Enable Developer Mode
on the phone when prompted, and use Product → Run to update the existing app.
A simulator can use the unsigned build; a physical phone needs the existing valid
signing configuration. No App Store or TestFlight step is required.

Run core tests locally, then the full app-hosted scheme on an available simulator:

```sh
cd mobile/ios/Packages/KindredCore
swift test
cd ../..
xcodegen generate
xcrun simctl list devices available
xcodebuild test -scheme KindredCompanion -destination 'platform=iOS Simulator,id=YOUR_UDID'
```

Record the actual SDK, simulator model, app build/source commit and test results.
Keep the existing Keychain/removal failures separate; do not report this source
update as fixing them. The generated test host must reference **Kindred.app**.

Follow Apple’s [Duo preparation guidance](https://developer.apple.com/iphone-duo/prepare/)
for SDK-specific simulator and native toolbar behavior. The
[acceptance record](duo-compatibility.md) distinguishes native simulator results
from automated web geometry checks. For Xcode 27.1 Duo and the actual phone, check:

- Open a long chat with a draft, numbered list and nonzero scroll position. Fold,
  unfold, rotate and resize with the keyboard open and closed. Keep the same
  account/chat, draft, caret and scroll anchor; the web view must not reload.
  Repeat with Settings, QR confirmation and an accessibility text size.
- Inspect all four safe areas and the native title/Accounts toolbar in outer,
  inner, portrait and landscape layouts. Let the system place native controls;
  no HTML imitation of a vertical native toolbar is used. Safe areas must not
  be applied twice, and keyboard shrink must not switch the navigation mode.
- At compact width, drag from the leftmost 20 points: chat returns to the list,
  computer returns to its chat. Complete at 35%, or flick after 8%; shorter or
  backwards/cancelled drags restore the view. Check draft and scroll retention,
  keyboard dismissal and no send. A resize during a drag cancels it.
- With computer control held, swipe back and reopen the same computer. Keep the
  VNC connection and control; do not release control or send remote input.
  Drag over the canvas, horizontal code/table scroller, text selection, dialogs,
  menus, request forms and native sheets: navigation must remain disabled.
  At regular side-by-side chat/list width the list is already present, so no
  chat-to-list edge gesture is offered.
- Enable Reduce Motion: no translating views, dim feedback and a brief fade.
  Repeat Cancel and resize. Confirm no accidental canvas input during geometry
  changes and validate current aspect-fit/letterbox coordinates before input
  becomes available again.
- Make an isolated server unavailable during page loading: **Try again** must
  be visible and preserve the account's web store. Restore it and retry once.
  WebKit process termination still reloads with the latest session bootstrap.
  Foregrounding refreshes text size/identity/push state; it does not forcibly
  reload a stale page or erase a draft. Check resumed polling/reconnection on
  the actual phone separately.

### QR diagnosis without exposing a pairing secret

The version label **0.1.0** does not identify an installed source revision.
The initial QR parser (`f5f08a0`) accepted only explicit HTTPS origins; this
build additionally accepts confirmed private literal-IP HTTP origins. An old
HTTPS-only build therefore rejects a private-HTTP code before contacting its
server, while a Tailscale HTTPS code uses the same link shape in both versions.
This is a compatibility boundary, not proof of the owner's incident cause.

The scanner reads an AVFoundation QR string, parses the explicit origin and
64-hex fragment locally, asks for confirmation, verifies server identity, then
claims once. Claim validation binds the response origin/account/profile before
saving a session. Expired/used codes, unreachable servers, denied camera access,
malformed codes and an unallowed origin are separate failure paths. Use Paste
Pairing Link to distinguish camera recognition from parsing/network failures.
Capture only the visible error, scheme/host/port, app source/build and whether
failure happened before confirmation or after Connect. Never copy a real code,
QR pixels, account token or claim response into logs. Create a fresh disposable
code for each claim attempt; do not automatically replay an uncertain claim.
