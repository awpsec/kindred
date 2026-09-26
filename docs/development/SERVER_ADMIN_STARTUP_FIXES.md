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
