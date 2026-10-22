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
