# Browser acceptance checks

`test-connector-stack-formation.cjs` covers third-call grouping, subsequent
rollover, rapid arrivals and status updates, keyboard interruption, arrivals
while expanded, overlapping formation/rollover, reload and reduced motion.
Run with Chromium and `WEBKIT=1`. `test-connector-compact.cjs` checks two inline
calls, seventeen collapsed calls, newest-call ordering, themes, mobile layouts,
receipt access and visible failures. `test-connector-stacks.cjs` also checks
regrouping after the NEW divider fades without leaving the conversation.

`test-native-connector-stacks.cjs` exercises the actual Linux desktop webview
with 25 synthetic receipts, rapid rollover, expanded disclosure and both themes.
Set `KINDRED_NATIVE_EXE` to a built desktop executable and run through `xvfb-run -a`
on headless Linux. It uses temporary app data and local fixture endpoints; it
does not operate a live connector or change an installed profile. The native
artifact and document checks use the same setup. Browser WebKit on Linux is
not native macOS acceptance, and Chromium is not Windows WebView2 acceptance.
Those native clients still require checks on their respective operating systems.

`test-teaching.cjs` covers demonstrating and reviewing a task, pause/resume,
omitted typed text, failure recovery, saved-command discovery/use, reload,
replacement consent and narrow layouts. Run with Chromium and `WEBKIT=1`.
The computer and API are fixtures; `skill_import::tests` and `commands::tests`
cover real HTTP/SQLite persistence, workflow loading and immutable invocation.
See `docs/TEACH_A_TASK.md` for the feature's learning and verification boundaries.

`test-ui-consistency.cjs` checks settings and import layouts at 320, 390, 768 and
1320 pixels, in dark/light themes with 100% and 150% text. It covers provider
status wrapping, workspace descriptions, separated dialog actions, keyboard
disclosures, centered notification animation, and reduced motion.
`test-connector-disclosure-motion.cjs` samples expanding/collapsing connector
stacks during chat refresh, including rapid reversal, keyboard controls and
reduced motion. Run both with Chromium and `WEBKIT=1`, alongside
`test-task-recovery.cjs` and `test-connector-stack-accessibility.cjs`.

`test-profiles.cjs`, `test-account-session.cjs`, and `test-profile-settings.cjs`
cover account creation/sign-in, saved-account grouping across and within servers,
preserved access to older workspaces, session isolation, and account management.
Run in Edge and WebKit. `test-native-window-state.cjs` uses a disposable Windows
installation and Python's Win32 bindings in `tools/window-fixture.py` to move and
reopen the main and Accounts windows, test maximize/minimize, and recover saved
off-screen bounds. Set `KINDRED_NATIVE_EXE` to the built executable. The test
restores the pre-existing notification registry values when it finishes.

`test-skill-import.cjs` covers real folder/file selection with fixture import API
responses, supporting-file grouping, review, saving, catalogue refresh, slash
autocomplete and message receipt badges. Run in Edge and WebKit. Backend Rust
tests exercise real import transactions, local-device receipts and guest file
materialization separately. The fixture never starts a scan or provider call.

`test-claude-login.cjs` checks local OAuth browser dispatch, code submission and
clearing, verified connected status, cancellation and unexpected-URL rejection in
Edge and WebKit. Provider responses and the remote consent page are fixtures;
`deploy/test_provider_login.py` exercises the actual subprocess relay with a
keyless CLI stand-in. Real account consent is a separate manual acceptance step.

`test-commands.cjs` checks slash suggestions, keyboard and pointer selection, gray
parameter hints, quoted arguments, send validation, library creation/search/use,
bot-created command refresh, paste and mobile/light layouts. Run in Edge and with
`WEBKIT=1`. Rust tests cover actual expansion, immutable receipts and the Pi tool loop.

`test-profiles.cjs` checks account sign-in/registration, profile switching, session
rotation, unread counts capped at 9+, reload persistence and desktop/mobile layouts.
`test-native-profiles.cjs` exercises actual Windows WebView2 IPC in a disposable
installation: saved-session restoration, DPAPI, cross-server token separation,
notification counts, invalid-profile rejection and isolated local permissions.
Set `KINDRED_NATIVE_EXE` to the built Windows executable for the native check.


`node tools/frontend/test-provider-catalogue.cjs` verifies custom provider setup without
manual model fields, once-per-client startup warming, explicit refresh, retained models
on failure, unsaved-URL handling, multiple named provider cards with one fresh Add card,
rename/order preservation and discovered models in the bot picker. It captures desktop
dark/light and mobile layouts in Edge and WebKit. All catalogue and credential data are
fixtures. Rust catalogue tests cover authenticated/keyless network reads, startup reuse,
redirect rejection, invalid responses, bounded parsing, stale configuration races and
a discovered-model Pi tool loop.

`node tools/frontend/test-character-faces.cjs` also verifies circle-first picker
order, circularity through breathing and full working turns, and the pebble's
broader contour, alongside face containment and eye expressions for every shape.

`node tools/frontend/test-composer-motion.cjs` samples real animation frames for
reply expansion and cancellation. It checks a steady bottom edge, continuous
writing-area position, intermediate heights, monotonic movement, rapid reversal,
cleanup, draft preservation, multiline edits, stable polling, hover/focus borders,
attachments and both reduced-motion controls. It captures dark/light and mobile
layouts. Run with Edge and `WEBKIT=1`; API responses and uploads are fixtures.

`node tools/frontend/test-message-actions.cjs` checks the hover reply/reaction/menu
toolbar, Copy, reaction add/remove and reload, keyboard controls, chooser focus
through refresh, quote drafts across chat navigation, failed sends, cancelling a
quote without losing text, sent quotes and jumps to originals outside the loaded
page. It captures dark/light and mobile layouts. Clipboard and API writes are
fixtures; Rust tests and the live synthetic check cover persistence and routing.

`node tools/frontend/test-settings-screen.cjs` checks the compact Settings computer
selector, active-bot choices, screen-specific image routing, a delayed stale screenshot
response, view-only opening of the selected screen, unchanged chat selection and
desktop/mobile bounds. Edge and WebKit use synthetic screen images and API responses.

`node tools/frontend/test-chat-history.cjs` exercises a 1,000-message conversation:
older and newer paging, a 150-message rendered bound, unloading/reloading pages,
position preservation, delayed background refresh on cached switches, new arrivals
while reading, explicit retry after a failed page, historical run details outside
the recent-runs feed, six-chat cache eviction, and desktop/mobile layouts. It runs
in Edge and WebKit using the same variables below. Its conversations are synthetic.

`test-user-flows.cjs` exercises named account setup, popup sign-in, account selection,
isolated disconnect, human takeover and same-run completion, approval receipts,
responsive account dialogs, and the two neutral avatar colors. It uses a synthetic
provider, account catalog, conversations and computer. It does not sign in to a real
account or send requests to a real service API.

With Playwright and its Chromium browser available:

```sh
node tools/frontend/test-user-flows.cjs
```

Use `KINDRED_PLAYWRIGHT_MODULE` to resolve an existing Playwright installation outside
this directory, `KINDRED_TEST_BROWSER=edge` for installed Microsoft Edge, or
`WEBKIT=1` for an installed Playwright WebKit runtime. Set `KINDRED_TEST_ARTIFACTS`
to override the ignored `test-results` screenshot directory.

To check the actual assets of a deployed server, set `KINDRED_TEST_SERVER` to its
origin without a trailing slash. The test still replaces all API calls and sign-in
pages with fixtures; it fetches only the UI assets from that server. This verifies
frontend behavior, not real OAuth or model/provider execution. The Rust suite covers
the account-binding checks, human-subtask lease lifecycle and provider protocols.

`node tools/frontend/test-desktop-polish.cjs` checks persistent screenshot display,
enlargement, exact download bytes and reload; shape-following highlights, both eye
colors, the combined shape/color popover, notification preferences, and all three platform title
bars. It starts a temporary local fixture server and uses the same browser/runtime
environment variables above. Desktop command calls and browser notifications are
simulated in this test. Native OS notification delivery and window behavior require
the separate native acceptance check recorded in `docs/VERIFICATION.md`.
The popover checks include all eight shapes and fourteen colors, immediate saved
selections, retained keyboard focus, persistence after reload, and mobile touch layout.

`node tools/frontend/test-collaboration-pins.cjs` checks that DM mentions stay with
the selected bot, only backend handoffs introduce linked group chats, conversation
authors remain distinct, the group provider icon keeps its size, and bot/chat pins
persist across clients with current-message hover, keyboard and mobile previews.
Its conversation responses are fixtures; real provider acceptance is recorded in
`docs/VERIFICATION.md` separately.

`node tools/frontend/test-experience.cjs` checks live-refresh bottom following,
reader anchors and delayed screenshot loading; curved idle gaze without sleep or a
separate thinking morph; compact text editors; global notification frequency; file
uploads; the composer teaching menu; and an editable teammate draft before creation.
Its data and provider are fixtures. `test-conversation-motion.cjs` covers persistent
message previews, no sleep timeout, synchronized working motion, birth/morph order
and reduced motion. Both run in Edge and WebKit.

`node tools/frontend/test-character-faces.cjs` checks live welcome-avatar shape and
color updates without navigation, eye contours plus a safety margin inside all
eight silhouettes over sampled idle/front-facing working poses, four eye styles,
and blink-center stability. It also generates a 44/84 px gaze contact sheet for
visual review. Run with Edge or WEBKIT=1; the server data is a local fixture.
The full 23-second expression cycle is sampled across all silhouettes and eye
styles. Checks include circular wide eyes, thin squints, asymmetric questioning,
same-bot synchronization and stable reduced motion. It generates dark/light
expression sheets at 32 and 84 px for visual review.

`node tools/frontend/test-screen-menu.cjs` checks the themed computer menu's
chat-member list, DM scope, keyboard controls, narrow layout, outside dismissal,
and reconnect after a member is removed. `test-settings-screen.cjs` separately
covers the global preview selector and opening its selected computer. Both support
Edge and WEBKIT=1 with local fixture data.

`node tools/frontend/test-desktop-glass.cjs` checks theme-aware frosted letterboxing
at desktop and mobile widths, live color changes, sharp source canvas and pointer
targeting, original-frame teaching snapshots, reduced motion, reconnect and cleanup.
It uses a local RFB canvas fixture; actual noVNC read-only validation is recorded
separately in `docs/VERIFICATION.md`. Supports Edge and WEBKIT=1.
The fixture measures transformed bounds like noVNC and verifies compact monitor
opening, screen-click expansion and a final canvas that fills the available space.

`node tools/frontend/test-attention-profile.cjs` checks the exact 30-minute presence
boundary, fixed rest eyes on all eight shapes, DM/group unread dots, their geometry,
focused/covered/unrendered visibility gates and a new reply racing acknowledgment.
It also checks identity drafts during refresh and a delayed save concurrent with
avatar customization, preserved memory/instructions, mobile layout and deep settings.
Supports Edge and WEBKIT=1. Rust attention tests separately cover persisted read
cursors, stale acknowledgments, scoped validation, authentication, old activity and
transactional identity updates.

`node tools/frontend/test-group-presentation.cjs` checks CZ initials, bounded
two- and six-bot portraits without overlapping faces or counts, group rows aligned
with direct chats, composite headers, avatar gutters and consecutive sender
alignment, name contrast in both themes, and right-click/header chat menus.
It verifies rename persistence with retained members, pins, messages and bot memory,
keyboard dismissal/focus, unpinned rows and narrow-screen menu placement. It uses
local fixtures and supports Edge and WEBKIT=1.

`node tools/frontend/test-group-sequences.cjs` checks the sender name above the
first bubble and one avatar at the bottom-left of the final bubble. It covers
sender/user/time/system/handoff boundaries, avatar transfer on a newly arriving
reply, wrapped mobile actions, both themes and unchanged direct chats in Edge
and WEBKIT=1 with local fixture data.

`node tools/frontend/test-decisions-schedules.cjs` checks three selectable choices,
a custom response, retained answer receipts, draft text/caret across live refresh,
links, dark/light cards, the weekly schedule editor and narrow layouts. The mocked
answer endpoint validates UI routing; Rust provider fixtures separately verify
that questions end the current turn and answers create one contextual continuation.


`test-provider-local-settings.cjs` checks compact connected/disconnected cards, saved
keyless custom settings, global and per-bot desktop binding, provider-filtered cascading
usage, token/cost labels and narrow-screen placement in Edge and WebKit. The shared
fixture now includes the provider catalog and local-device list.

`test-usage-history.cjs` checks initial/background account prefetch without repeat menu checks,
pending status reads and a connection change racing an older catalog response,
keyboard focus retained through a delayed subscription update,
the five-bot cost preview, complete active/archived/deleted history with saved avatars,
every metric sort, status/search filters, reported/estimated/unpriced uncertainty,
manual refresh, disconnected custom history and empty providers. It verifies dialog
focus, keyboard dismissal, dark/light desktop/mobile bounds and reachable controls
in short/landscape viewports in Edge and WebKit.
All usage receipts and provider responses are synthetic local fixtures.

`test-native-local.cjs` requires Windows and `KINDRED_NATIVE_EXE` pointing to a compiled
Kindred desktop executable (with WebView2Loader.dll beside it). It copies them into a
disposable installation under test-results and uses an isolated WebView2 profile and
local fixture server. Real native IPC checks hosted-origin grant rejection, default-off,
workspace reads/writes, outside denial and Allow once, full access, command execution,
cancellation, disconnect and recovery of a persisted interrupted operation without
replay. It does not change the user's installed permissions or contact a model provider.

### Inbox monitors

`node tools/frontend/test-inbox-monitors.cjs` covers creating a Gmail monitor,
pausing/resuming it, native push setup, callback display, and missing-account
controls. Run with `WEBKIT=1` for WebKit; the default browser is Edge. Screenshots
include desktop dark and mobile light.


0.48: `test-inbox-monitors.cjs` exercises Routines as the shared home for scheduled checks and Constant activity monitors, creation through Monitor activity, lifecycle controls, and missing Gmail setup. Run it in Edge and WebKit, together with `test-decisions-schedules.cjs` for persistent choices and custom weekly schedules.


0.48.1: `test-chat-reload.cjs` checks selected-chat, draft and quoted-reply restoration across ordinary reloads, correct send destination, and isolation from another session token. Run in Edge and WebKit. `test-provider-catalogue.cjs` also checks every mobile settings tab stays in bounds and that Computer and Connections remain reachable. History tests explicitly signal a reading gesture before programmatic upward scrolling, and wait for the resulting scroll position; asynchronous dialogs are awaited before reading their fields.


0.48.2: `test-send-recovery.cjs` simulates an accepted message with a lost response, then verifies one receipt across a reload and retry, including uploaded attachment references and a quoted reply. It also checks successful-send cleanup and a fresh ID for an intentional later send. Set `KINDRED_RECOVERY_UPDATE=1` to exercise the web Update action instead of an ordinary reload. Run both modes in Edge and WebKit. Backend receipt tests are in `src/chat_send_tests.rs`.


0.48.3 adds `test-claude-usage.cjs` for compact empty history, provider links, token-based subscription details and quota failures with intact local history. `test-page-lifecycle.cjs` suspends the page while startup is waiting on an asynchronous digest, verifies that no message fetch starts, and then resumes the page. Run both in Edge and WebKit. The desktop polish suite deliberately delays `/api/bots` and verifies the details control stays disabled until ready.

`test-native-connection.cjs` uses a disposable Windows installation and real WebView2 to exercise refused connections, a proxy page, reconnection, reload recovery and closing during startup. Set `KINDRED_NATIVE_EXE` to the compiled executable, with `WebView2Loader.dll` beside it. It creates no real account or provider work. The existing native profile and local-access fixtures include the same document markers used by existing Kindred servers.

From Windows PowerShell, run `tools/test-shortcut-repair.ps1` for isolated shortcut migration and `tools/test-native-version-redirect.ps1 -Executable <path>` for a stale binary, BOM manifest and redirect-loop check. After publishing a signed channel, `tools/test-installed-upgrade.ps1 -PreviousArchive <zip> -ServerUrl <HTTPS origin> -ExpectedVersion <version>` exercises the previous installed updater in a disposable directory, verifies the new process, repaired taskbar pin and preserved profiles, then closes only that fixture process.


0.48.4 adds `test-claude-models.cjs`: pinned versions, model-specific effort, saved configuration payloads, provider draft restoration, failed-refresh preservation and provider credit notices. Run in Edge and WebKit. `python3 deploy/test_provider_cli.py -v` runs Linux CLI/MCP fixtures without subscriptions or model charges.

0.48.35 adds `test-team-chat-controls.cjs` for five-item connector summaries, expanding 15 records, scroll bounds, explicit steering, independent stop controls, Markdown handoffs, duplicate waiting-avatar prevention, and one-time instruction review. Run in Edge and WebKit alongside connector-artifacts, connector-edit-workflows, connector-catalog, concurrent-work, collaboration-notifications and live-work. Backend tests in team_chats, bot_instructions and conversation_updates cover membership, empty groups, paginated history, Unicode message chunks, idempotent posts, plain-name routing, concurrent replies, default queuing, authenticated steering, mandatory Full-access review and stale/cancelled edits.

Document/file UI: `node test-document-previews.cjs` covers compact receipts,
Office/PDF rendering with synthetic real files, malformed/oversized archives,
page/sheet navigation, close-during-load, web download bytes and native receipt
reveal. Set `WEBKIT=1` for WebKit. `node test-native-document-previews.cjs` runs
DOCX/XLSX/PDF smoke checks in an actual Linux desktop webview; set
`KINDRED_NATIVE_EXE` and run under an isolated display (e.g. xvfb-run).
