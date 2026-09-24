# Shared UI motion and responsiveness

This polish pass uses the shared desktop/server UI for Windows, macOS and Linux.
It does not change native audio capture, Whisper decoding, credentials or backend
runtime data.

Finite pane, Settings, reply, composer and computer-screen effects have a common
cleanup contract. Completion, browser cancellation and a bounded fallback settle
the destination. Reversing a pane transition starts from its current visible
position; an interrupted close cannot leave an invisible pane intercepting input.
Closing panes become inert immediately and return keyboard focus to their opener
when necessary. Dialog dismissal remains synchronous.

Changing the system or Kindred reduced-motion preference settles running effects,
including temporary computer geometry and composer reply ghosts. Backgrounding
also settles finite effects. CSS covers menus, pseudo-elements and progress bars;
read markers retain their final faded appearance when motion is disabled.

Settings navigation retains its DOM nodes and keyboard focus while requests run.
A fresh visit focuses its selected navigation item without restoring an old form
scroll position. A queued close event cannot abort a rapid reopening.
General animates when its cached controls appear, not when its later account
refresh completes. Request revisions prevent older Connections, Routines and
Skills responses from repainting a newer visit, including a return to the same
tab. Native desktop-permission content fades without translating the bounds used
to position its child webview.

Menus use short opacity transitions that preserve their anchors. Dialogs and
panes use small translations without text scaling. Buttons have one 1 px press
movement rather than two overlapping effects. Stable scrollbar gutters and
contained scrolling keep Settings, details and pickers from shifting or scrolling
the page underneath them. Keyboard navigation scrolls only the themed picker;
pointer hover does not scroll its options.

Avatar visibility is tracked with IntersectionObserver rather than a layout query
per avatar per frame. Clipped/offscreen avatars and hidden windows stop their
continuous motion, then resume from the current phase when visible. Mail gestures
share the same scheduler and honor live reduced-motion changes. Removed avatars
are unobserved even when no visible animation is running.

## Verification

Run these with `KINDRED_PLAYWRIGHT_MODULE` pointing to an installed Playwright
package if it is not available through normal Node resolution. Run once normally
for Chromium and again with `WEBKIT=1`. Older motion tests now default to bundled
Chromium; `KINDRED_TEST_BROWSER=edge` retains the installed Edge option.
`KINDRED_HEADED=1` selects a real window; on Linux, Playwright then uses its GTK
WebKit build instead of headless WPE. Run it within an isolated Xvfb display when
no interactive display is available.

- `tools/frontend/test-motion-polish.cjs`: Windows/Linux/macOS UI chrome, pane
  reversals, paused/canceled effects, focus, live system/app preferences,
  backgrounding, slow and out-of-order Settings responses, picker scrolling,
  avatar visibility/mail motion, dark/light themes, narrow windows and 150% text.
- `tools/frontend/test-composer-motion.cjs`: reply expansion, reversal, typing
  interruption, ghost cleanup, themes and reduced motion.
- `tools/frontend/test-composer-screen-layout.cjs`: composer/toolbar layout,
  computer expansion/collapse, resize/reversal, reduced motion and canvas identity.
- `tools/frontend/test-chat-transitions.cjs` and
  `tools/frontend/test-conversation-motion.cjs`: worker departure/reply arrival,
  no replay after navigation, avatar geometry and tool morph ordering.
- `tools/frontend/test-render-motion-continuity.cjs`: status-loop phase across
  re-renders, sidebar focus and row glides, group strip, artifact card resizing,
  delayed chat loading and receipt settlement (`MOTION_POLISH_2026_09_23.md`).
- `tools/frontend/test-desktop-polish.cjs` and
  `tools/frontend/test-themed-selects.cjs`: platform chrome, menus, keyboard
  controls, themes and existing UI interactions.
- `tools/frontend/test-native-linux-layout.cjs` (desktop repository): real Tauri/WebKitGTK with an
  isolated profile and fixture backend. Includes interrupted pane cleanup,
  live reduced motion, Settings focus and existing font/scale/whitespace checks.

Browser platform flags exercise shared layout and native command dispatch mocks;
they do not certify actual Windows WebView2 or macOS WKWebView behavior. Native
Windows/macOS acceptance remains required when preparing the next approved build.

### build-host verification (2026-09-16)

All seven Chromium suites passed. Headless WebKit passed the new interaction
matrix for all three platform layouts, the avatar/conversation suite, desktop
polish and themed selects. Three wall-clock suites failed frame-count,
intermediate-height or worker-departure timing assertions while this host was
under CPU/memory pressure. The unchanged HEAD reproduced the same insufficient-
frame failure. Separate repeated Settings
opens rendered correctly with both baseline and current source.

The actual native Linux app passed at GTK 1 / DPI 1.25, including 24 composer
size/theme/viewport combinations, six Settings pages, focus, live reduced motion,
interrupted pane cleanup and reply cleanup. Native computer expansion and collapse
captured multiple intermediate frames in both directions, with continuous dimensions and cleaned-up
geometry. This validates the real WebKitGTK runtime separately from headless WPE.
The Playwright-bundled GTK browser crashed on loading both baseline and current
Kindred; it is not counted as a passing platform check.

### Unread opening and menu review (2026-09-18)

Opening a conversation now refreshes its unread boundary on startup and explicit
visits, while background activity preserves the reader's position. Missing
first-unread hints fall back to paging forward from the saved read cursor. Read
receipts wait for this opening refresh. The opening anchor skips date separators
and uses the actual distance from the New divider to the first message, so a
long unread backlog opens with New near the top rather than jumping to the tail.

File-action popovers track their trigger during chat scrolling and window resizing
and constrain their dimensions to the viewport. Expanded layout coverage checks
Atlas/Tester spacing at 100%, 115%, and 150% text sizes, menu placement, small
settings windows, keyboard dismissal, and reduced motion.

`test-unread-opening.cjs` covers startup, fresh activity on a cached-chat visit,
long unread backlogs, a missing first-unread hint, and stable reading during
background refresh. `test-ui-consistency.cjs` includes the spacing and popover
checks. `test-composer-overflow.cjs` exercises continuing to type in a scrolling
draft at three text sizes without changing font weight or resetting layout.

Native Linux WebKitGTK also passed OS-keyboard typing through the overflow
threshold in a 720×600 window at 150% text size, checking normal weight, line
spacing, stable multiline layout, and visible caret, plus bot-action and slash
menus (`test-native-composer-menus.cjs`). This used Xvfb/software rendering;
it does not certify every Linux GPU, compositor, or distribution.

The review also found server/desktop UI drift: the server still expanded bot
name flex space, reset the scrolling composer on every keystroke, and lacked
the compact connector receipts and several disclosure/settings layout fixes.
The reviewed shared app and stylesheet now match across both checkouts, with
regression coverage copied to the server checkout as well.

### 0.53.0 release-source mismatch

The recorded 0.53.0 desktop commit `d03978228e70277699320c0b441f5e4e0484a546`
contains compact connector rows and `flex: 0 0 auto` for sidebar names. Its server
commit `4998e6d43bcbc11647b11a453e15687d32fe534b` still has bulky connector cards
and `flex: 1 0 auto`, which pushes role labels away from names. Native chat
windows load the connected server UI, so matching client/server version strings
did not establish matching UI behavior. Current sources contain the fixes;
published 0.53.0 packages remain immutable.

Release preparation in `scripts/release/publish-friendly.py` now compares the
exact desktop/server commits for shared chat, composer, document, and Accounts
modules using `verify-shared-ui.py`, before staging outputs. Both sibling Git
checkouts and their recorded source objects must be available. The verification
archive retains the matching source hashes. This source check rejects the actual
0.53.0 pair and passes the corrected sources; it does not replace package or
native-platform validation and does not authorize publication or deployment.

### Chat readability (2026-09-18)

Unread dots on bot rows are positioned outside the flex layout so they do not
reduce the available title width. A three-column title grid reserves the time
column and truncates the role badge instead of wrapping the timestamp. Active
bots replace message previews with plain status labels and subtle dots; labels
follow activity shapes without exposing tool identifiers, and idle rows restore
their message previews. Waiting/queued/stale states do not animate the dots.

Table headers use stronger theme-relative shading and a two-pixel bottom border;
alternating body rows have a restrained tint. New replies fade after mounting
without changing height. History, polling, and reduced-motion settings do not
replay the fade. Normal assistant message rows are covered as well as results.

Server guide version 15 adds a soft 100–200-word target for routine messages,
natural topic boundaries, and document delivery for exhaustive reports. Explicit
requests for detail override the target; no stored messages are truncated.
`test-chat-readability.cjs` covers alert geometry, activity transitions, table
styles, mounted animations, polling, and reduced motion.

### Message scrolling

Vertical wheel gestures over reply text, tables and code blocks scroll the conversation. Tables retain horizontal overscroll containment only; code blocks expand to their full height instead of creating a nested vertical scroller. Wide tables and code remain horizontally scrollable. `tools/frontend/test-message-scrolling.cjs` exercises real wheel input in both directions over each content type and checks horizontal scrolling separately.

### Provider account connector parity

Settings > Connections now exposes a Codex account connector panel alongside Claude. Refresh uses the existing `/codex/connectors` inventory, renders availability and per-call review information, and handles empty and failed refreshes without leaving stale rows. `test-account-connectors.cjs` covers these states and preserves the Claude panel.

### Account switching, updates and subtle actions

The account switcher loads the native saved-account directory independently of the current server, so an unavailable current server cannot block switching to another saved backend. Switching displays Opening in the chosen row and prevents competing clicks; failures leave the menu available and restore the previous native session/computer connection after preparation. Destination session validation and account isolation still use the existing native switch command. A destination that is offline or needs sign-in remains an explicit failure/sign-in case.

Updater copy distinguishes the desktop app on this device from the connected server and standalone local server. Attachment hover/focus uses restrained blue, green and red tints for Word/text, spreadsheets and PDFs, without shifting chat geometry. Continue task uses a soft hover glow, keyboard focus ring and small press scale. Reduced-motion preferences disable the transitions and press movement.

### Bot Details routines

Details lists the selected bot's scheduled routines and activity monitors in a compact Routines section, replacing the global Routines shortcut. Each row shows its name and cadence, with labeled SVG pause/resume, edit and delete controls below. Paused rows say “Paused” and use a play icon. Empty bots show “No routines yet.”

Edit opens the existing routine dialog over Details for its schedule and instructions; saving closes the dialog and refreshes the list. Editing a paused routine preserves its state. Expired one-time checks open the editor before resuming. Deletion requires confirmation, preserves chat/task history and pauses active monitors before removal. Failed actions remain retryable; if removal fails after pausing, the monitor stays visible as paused. An already running check follows the existing server lifecycle and is not stopped by removing its routine.

`tools/frontend/test-bot-detail-routines.cjs` checks bot scoping, pause/resume, pending controls, editor saves and failures, paused-state preservation, expired one-time checks, monitor deletion, empty states, and narrow/light and desktop/dark layouts at increased reading size in Chromium and WebKit. These browser checks do not certify native platform builds.
