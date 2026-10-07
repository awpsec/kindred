# Server administration and startup fixes

The update check has its own section, separated from computer resource settings.
The initial page shows “Opening Kindred…” until account/session initialization and
connection settle, including artifact deep links. Signed-out users then see the
existing account flow. Local server activation reloads the existing main webview
after the expected server version responds; it no longer restarts the desktop
process. Reload errors are recorded in setup status.

## Local validation

From the relevant checkout, set
`KINDRED_PLAYWRIGHT_MODULE=/opt/aldabra-dev-tools/node_modules/playwright`.

- `node tools/frontend/test-profile-settings.cjs`: passed in Chromium and with
  `WEBKIT=1`. Includes deliberately delayed identity initialization, hidden sign-in,
  resource edits and local administration.
- `node tools/frontend/test-local-server-admin.cjs`: passed in Chromium.
- `WEBKIT=1 node tools/frontend/test-account-session.cjs`: passed; saved sessions,
  signed-out account selection and explicit sign-in remain usable.
- `node tools/frontend/test-artifact-studio.cjs`: passed in Chromium, including
  reloading an artifact deep link and retained edits.
- Desktop: `cd desktop && /root/.cargo/bin/cargo check --locked --offline`: passed
  on Linux, with one existing unused APP_ID warning.
- `git diff --check`: passed.
- `cargo fmt --manifest-path desktop/Cargo.toml -- --check`: fails on existing
  formatting differences; the original committed profiles.rs also fails rustfmt.
  Unrelated formatting has been left unchanged.

Browser tests use fixtures. They do not establish that the reported native white
window on idyllic is reproduced or resolved. No release or production update was
performed. No storage migration is involved.

## Native acceptance, after an approved build

1. Open Server administration on a managed local installation; verify the local
   updater and server update check are separated from Bot computer resources.
2. Prepare an update, then select Restart local server. Confirm the same desktop
   process/window reconnects and the displayed server version is correct.
3. Close and reopen with a remembered account; repeat on an artifact deep link.
   Only a neutral loading state should precede the workspace, never sign-in.
4. Repeat signed out; account selection/sign-in should appear normally.
5. Exercise failed server startup and retry; verify the error remains visible.

Native Windows/macOS update behavior still needs platform verification.

## 0.85.6 served-module incident

The published server omitted the `/standalone-access.js` route imported by
`profiles.js`. The missing transitive module aborted application evaluation, so
the initial “Opening Kindred…” screen remained in both desktop and browser.
This was independently reproduced from the published binary and confirmed by
read-only requests on Idyllic. Clearing storage or removing accounts cannot
repair an HTTP 404. Preserve accounts, configuration, databases and VM volumes;
use the corrected server package when selected by the release owner.

The correction serves this dependency with JavaScript MIME. A separate classic
`startup.js` runs before the main module graph, shows a retryable error after a
module error or a 30-second initialization deadline, and never clears saved
sessions or drafts. Try again reloads the document so a failed attempt cannot
complete later over the recovery screen. Desktop users can open the same server
in a browser, without putting credentials in the URL. This does not repair a
stalled native bridge itself; it bounds the visible failure.

`cargo test startup_module_graph_is_served_by_the_actual_router` starts the real
asset router and uses Node's SourceTextModule parser to traverse the HTTP static
module graph, including transitive dependencies and the early startup script.
Node with `--experimental-vm-modules` is required for this focused test.
`tools/frontend/test-startup-recovery.cjs` checks retained sessions/drafts,
missing modules, native stalls/rejection, API/identity failure, expired-session
sign-in, late completion and the older desktop command contract in Chromium
and WebKit. Its deadline is advanced with Playwright's clock. Native IPC is
simulated; these checks are not a new native or owner-host recovery claim.

Delayed main-module evaluation is also covered by `test-startup-late-module.cjs`: a held app.js response is released after the startup deadline, then DOMContentLoaded settles. The entry latch preserves recovery and does not begin native restoration after failure. Retry remains a separate document reload.
