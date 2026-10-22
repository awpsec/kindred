# iOS / desktop UI synchronization — October 22, 2026

The integration branch `feat/ios-desktop-sync-20261022` merges the full Mac
`938f317b34d3fe8d2f9ee857500bf6149dc04542` ancestry with desktop
`b889429adf1ea2895bda57e70edffa8b0126a988`. The owner confirmed that the Mac run
finished before implementation resumed. Keep both parents when integrating.

## Behavior

- Native Search invokes the shared conversation/action palette. The server also
  intercepts the older installed adapter's Search button before it focuses the
  now-hidden sidebar filter. Older servers retain the bundled legacy fallback.
- Search waits for successful dismissal before opening a destination. Reopening
  cancels the pending action, including under Reduce Motion.
- Profile menus group Settings, Artifacts, Marketplace and account management on
  both ordinary iOS and the Duo native rail. Native overflow remains available.
- Details, Library and Computer share the new bot center with 44-point controls,
  safe-area clearance, touch file previews and retained computer transport.
  Tabletop retains the whole upper screen region for the computer; the native
  toolbar provides navigation in that pose. Ordinary tablets retain expansion.
- The existing Mac pane widths, bottom-anchored composer, fold-aware keyboard
  geometry, native rail and launch-handoff changes are preserved.
- Native toolbar silhouettes and neutral eyes are generated from the web artwork
  catalog, including stored legacy shapes. Native light/dark surfaces match the
  shared neutral palette. SVG-only changes do not trigger native layout scans;
  transcript mutations no longer force sidebar measurement in the pane observer.

## Verification and limits

Browser tests use WebKit, synthetic native geometry and isolated fixture
accounts/computers. They do not connect to user bots or production VMs.
`test-ios-bot-center.cjs` runs the current bundled adapter and the exact
pre-integration `938f317` adapter against the new server UI. It covers Search,
file preview, safe targets, tab navigation, draft retention and the same
computer transport. Retain that Git object when running the historical check.

Relevant existing suites cover Duo poses/content/sidebar, native menu routing,
edge navigation, message previews, progress layout, composer growth and motion.
Motion tests capture effects at creation and pause them to inspect their frames;
this verifies transitions and cleanup, not a device frame-rate claim.

Regenerate native artwork after renderer/catalog changes:

```
node tools/ios/generate-toolbar-artwork.mjs
node tools/ios/generate-toolbar-artwork.mjs --check
```

Xcode, SwiftUI compilation and native simulator execution are unavailable on the
Linux integration host. Before native distribution, regenerate the Xcode project
with XcodeGen on the Mac and run the app/core suites and actual Duo simulator
matrix. Confirm native profile/overflow menus, all selected toolbar shapes,
light/dark launch, Search keyboard dismissal, tablet expansion, folding while
editing, native Back, Library document/media preview and live computer control.
Physical-device acceptance remains distinct from simulator checks.

Matching shared UI changes must be deployed from the server integration branch.
No release version, signing material, live account data or production service was
changed during this integration; release packaging/deployment remain swarm-owned.

## Mac follow-up: responsive native bot center

The installed iOS adapter now presents Computer in the same content destination
as Details and Library, beside the retained chat list. It removes the redundant
third column, computer separator and expansion action. Native Back retains the
computer connection and control ownership. Older server layouts keep their
existing fallback.

The computer fits its available width and height after resizing. CPU, memory and
disk share a compact summary row; the screen reserves the measured height of its
tabs, actions and resources. Normal viewports need neither horizontal nor vertical
scrolling. Larger accessibility text can still scroll rather than reducing the
screen to an unusable sliver.

On the closed Duo display, public UIKit hit testing measures the native rail's
actual control bounds without sending input. Messages reserve the rail gutter
only while alongside it and reclaim the space below. Latest messages uses the
full bottom lane; the chat-list action uses the horizontal-lines symbol. Native
avatars render synchronously from the catalog so changing shapes updates the
silhouette as well as the color.

Mac checks passed: `test-ios-native-center-layout.cjs`, `test-ios-duo.cjs`,
`test-ios-duo-content.cjs`, `test-ios-sidebar.cjs`, `test-ios-layout.cjs`,
`test-ios-bot-center.cjs` (current and historical adapter), and
`test-ios-duo-motion.cjs`. The focused center test checks phone/inner/outer layouts,
resizing, both scroll axes, retained connection/draft, avatar bridge data and
message clearance. Native `ToolbarAvatarTests` passed in Xcode 27.1 beta's Duo
simulator, comparing distinct cloud, wedge and capsule images at the same color.
An actual closed-display simulator capture confirms the measured rail and wider
messages below it. The subsequent unlocked native pass verified cloud, wedge and
capsule switching and the bot-details action.

The simulator uses an explicitly selected local redesign preview with sample
chats, not the older live-server UI. Existing account records are preserved.
These follow-up layout overrides are confined to the installed iOS app; they do
not modify the shared desktop UI or deploy a production server.

## Open portrait identity and preview uploads

The native toolbar's actual edge now controls identity placement. An open Duo
with a horizontal top bar uses the avatar in that bar; a vertical inner rail keeps
the centered name tag. Details reserves the top safe area in horizontal-bar
poses. Keyboard height does not change this placement.

A temporary inert, accessibility-hidden copy morphs between the retained web
tag and the native avatar's measured window coordinates. It fades the name while
changing size and position, preserves its painted bounds on reversal, and cleans
up under Reduce Motion, page hiding or a bounded timeout. The native avatar is a
44-point UIButton with a public layout callback; a detached SwiftUI label's
geometry is not its on-screen toolbar position. The bridge now validates shape
names against the bundled catalog, including canonical names such as `wedge`,
rather than rejecting them through the obsolete eight-shape allowlist.

`test-ios-duo-identity.cjs` passes portrait/landscape handoff, intermediate and final
bounds, quick reversal, Reduce Motion, keyboard stability, retained draft, Details
clearance and screenshot upload/read/delete. The existing Duo motion and center
resize suites pass. Both native ToolbarAvatarTests pass. Actual Xcode 27.1 beta
Duo checks cover portrait/landscape rotation, native avatar actions and shapes,
Details/Computer clearance, and closing the phone with the selected chat intact.
A recording of the inner display was inspected separately from the inactive
outer display.

The screenshot error was reproduced as HTTP 404 `Missing fixture /api/uploads`:
the preview server delegated that missing route to its desktop fixture. The Duo
fixture now supports authenticated, bounded, in-memory uploads, download,
removal and attachment metadata on sample messages. A 300 KB synthetic PNG goes
through the real composer path. Files disappear when the fixture exits; this
does not change or validate production-server upload handling.

## Alert corner and dock item changes

The list viewport now receives one continuous contour in native web-host
coordinates. UIKit resolves each display corner independently; the sharp folded
edge stays sharp, and the rounded corners follow rotation. Cards retain their
ordinary radius instead of combining a guessed 48-point row radius with a
second 56-point viewport radius. Selection and unread fills share the same
physical contour while rows scroll and reorder. The full host rectangle stays
physical when the keyboard shortens the web view.

Native navigation updates now share one SwiftUI animation transaction after
chat loading, so conditional dock items and their glass container can reflow
together. The installed adapter forwards the app/system Reduce Motion preference
to disable that transaction; UIKit's accessibility setting is also checked.

`test-ios-duo-content.cjs` passes both server adapters and left/right rails,
including row reordering and native Reduce Motion forwarding. The focused
`test-ios-display-contour.cjs` uses captured UIKit paths for open, closed and both
closed landscape orientations; it verifies normal/selected/unread hit exclusion,
sharp-edge hit inclusion, stable scrolling/reordering and malformed-path fallback.
`DisplayCornerContourTests` covers independent corners, keyboard bounds and invalid
geometry. Native Duo inspection confirms the open and rotated cover contours. The identity suite
passes, the native target builds, and a WebKit alert-card capture was inspected.
The subsequent unlocked native check recorded both collapse and expansion on
the actual inner display. Frame review shows the glass container resizing and
items fading/reflowing through intermediate positions in both directions.

## Search and creation sheets

The bundled iOS adapter now positions Search, New Bot, local New Chat and server
New Chat inside the current usable region. Open-display sheets are centered at
useful widths instead of retaining desktop dialogs against the left edge. A
real book/tabletop division still confines a sheet to one region. Cover-display
Search keeps the full lower lane; its heading, groups and individual results
avoid measured dock/status/camera rectangles only while alongside them. Scroll,
query replacement and native toolbar changes update that projection. Shared
Search's temporary opening scale is removed from collision measurements.

Creation forms keep their draft and participant selection through resizing.
Headers remain reachable while scrolling, primary creation actions stay visible,
and a single provider fills its form column. The bot avatar is centered. The Edit
Bot Details disclosure uses an aligned inline chevron, clearing the shared
absolute marker position and mask while retaining native disclosure semantics.

`test-ios-sheets.cjs` passes left/right dock clearance before/after scrolling,
lower-row width recovery, retained search query, bot/chat drafts and participants,
active book/tabletop regions, keyboard-height changes, creation/close action
visibility, both local and server chat forms, and disclosure toggling/marker
position. Existing Duo, iOS layout and bot-center (current and historical
installed adapter) suites pass. Xcode 27.1 beta builds successfully. Native Duo
checks cover cover/open Search, New Bot through folding with its draft intact,
New Chat, and Details; the local redesign sample server remains selected.

Changes are confined to the installed iOS presentation adapter and regression
coverage. No shared desktop assets, production server or signing data changed.

## Visual avatar picker

Tapping a bot's avatar now opens its actual desktop shape previews and palette
swatches together. The iOS action-menu adapter no longer turns those controls
into nested Shape/Color text menus. Existing selection markers, serialized avatar
writes, previews and custom-color action remain owned by the shared UI.

The visual picker uses a top-layer popover anchored to the avatar, with measured
pane/native-rail clearance and active fold-region bounds. Shape/color hit targets
are at least 44 points. Close, outside taps, Escape and navigation dismiss it;
Escape restores focus to the avatar. Opening/closing fades respect Reduce Motion.

The focused WebKit avatar suite verifies visual previews/swatches, successful
shape/palette saves, preservation of other bot details and the conversation
draft, matching native-avatar state, outer/inner resizing, custom-color access,
dismissal and Reduce Motion. Existing iOS menu/layout and sheet suites pass.
Actual Duo simulator checks cover the cover/open displays and immediate shape
updates without reopening a submenu. The sample bot's original shape was restored.

## Cover message motion

Bot replies keep one fixed line length on the closed display, ending six points
before the measured dock/status edge. Only user messages adjust dynamically.
A long user bubble keeps its leading edge steady and eases its trailing edge
into the full lower lane; short bubbles follow their natural right alignment.
The earlier fixed-width cap no longer leaves an unused strip below the menu.
A 280 ms ease continues from its current position on reversal. A small release
buffer prevents boundary chatter without holding the wider gutter well below
the controls. App/system Reduce Motion settles the geometry immediately.

An actual simulator inspection exposed a second cause: the native toolbar
measurement was null, so the page kept the older full-height reading gutter.
The host now measures visible public UIControls in the reserved edge strip,
excluding the entire web subtree, rather than relying on native hit testing.
The avatar reports its frame after window attachment as well as layout, and
navigation changes schedule a fresh host measurement.

`test-ios-message-clearance-motion.cjs` covers late-arriving toolbar geometry,
intermediate/final bubble widths, a steady leading edge, interruption/reversal,
fixed bot geometry, retained composer/draft, actual scroll crossings, immediate
space recovery below the dock, leading-edge rotation and Reduce Motion. The
native avatar test covers layout before window attachment. Native-center and
pane/fold/composer motion checks also pass. The native build and avatar tests
pass. Changes remain confined to iOS presentation and regression coverage.

Native cover-display verification confirms a valid 44-by-148-point menu frame
and a full 466-point reading viewport. User bubbles retain a distinct leading
gutter of 12% of the lane, bounded to 32–56 points, while their trailing edge
expands into the space below the controls. That inset remains steady throughout
the animation and keeps user replies visibly separate from bot replies. The
focused motion check verifies the inset alongside the existing recovery,
reversal and Reduce Motion checks. Stored accounts are preserved during
in-place simulator updates.

After a fold or navigation change, the host refreshes the measured rail through
the native toolbar's outgoing-item animation. Coalesced, bounded layout passes
replace the intermediate taller frame after its controls disappear. Native
open-to-closed verification confirms the final 148-point menu height, the same
leading user-message gutter beside and below it, and recovered trailing space
below the menu.

## Display handoff

Opening or closing the Duo now uses one session-owned frost and dissolve. It
survives host detachment and scene deactivation, covers the native toolbar along
with the retained page, and transfers to the incoming window before new web
geometry is published. Cold launch and same-display hinge/resize motion retain
their existing animations.

The cover holds through the native toolbar handoff, then waits for quiet layout,
finite web effects and two painted frames before its 280 ms dissolve. A late
toolbar measurement or quick reversal invalidates an earlier paint completion.
The bounded fallback also dissolves instead of abruptly removing the cover.
App/system Reduce Motion shortens the fade; Reduce Transparency uses an opaque
canvas. The account, WKWebView, conversation, draft and computer remain retained.

Five app-hosted UIKit tests cover cold launch/resize, transfer between windows,
inactive-to-active handoff, late layout/reversal, unresponsive-page fallback and
Reduce Motion cleanup. Native Duo recordings were inspected in both directions:
the layout settles under the cover and fades into view without a cleanup snap.
