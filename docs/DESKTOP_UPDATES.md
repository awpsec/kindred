# Windows installation and updates

For the new public release transport, see [GitHub release updates](GITHUB_UPDATES.md).
The server-hosted feed instructions below remain relevant to older clients and fallback hosting.

Search **Kindred** in Windows Start to open the installed app. Choose **Update
Kindred** using the small download icon beside your name at the bottom left, or under **You**. The compact download button appears only when a newer signed release is available,
and expands left to show Update on hover or keyboard focus. Availability is checked
at launch and every minute while visible. The native popout checks the
stable channel, downloads and verifies a newer release, then restarts the app.
If there is no newer release it displays the installed version. A network or
verification failure leaves the installed version in place.

## Install on another Windows computer

Download **Kindred-VERSION-Windows-Setup.exe** from the release and double-click it. The
same setup EXE handles first installation and upgrades from an existing ZIP-based
installation. Close Kindred when prompted, then finish setup. Profiles, settings,
local workspaces, and local server data are kept. Administrator access is not
required. Setup adds Kindred to Start and Windows Installed apps.

The setup EXE includes the existing signed update ZIP and verifies its signature
and hash before installation. It refuses downgrades and conflicting files under an
already-installed version. A missing Microsoft Edge WebView2 runtime is installed
using Microsoft's signed bootstrapper; that first dependency setup needs internet.
The Kindred setup EXE itself is not yet signed with a Windows publisher certificate.

To update manually later, close Kindred and run the newer setup EXE. Uninstalling
removes application files while retaining profiles and local server data. Updating
the desktop does not automatically rebuild an already-running Standalone server.

The ZIP remains available for advanced/manual installation. Extract it, then run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Install-Kindred.ps1 -Launch
```

New installations open the native profile window. Enter your HTTPS server address
and sign in, or choose Standalone with Docker installed and running. No SSH access
is required. The app remembers the most recent profile. Existing installations
with explicit SSH settings retain the legacy launcher until a profile is saved.

Installation is per user under `%LOCALAPPDATA%\Programs\Kindred`. The Start menu
shortcut uses the stable `Launch.vbs`/`Launch.ps1` entrypoint. `settings.json` stores
the server origin and SSH destination, without a token. `current.json` selects a
version directory; `previous.json` and older version directories remain available
for recovery. The updater preserves the old version until the new app starts.

The update stream currently updates the Windows desktop client. The Linux server,
guest binary and browser UI are deployed separately by the operator. Updating the
desktop does not stop server-side bot runs.

## Prepare Windows artifacts for an approved release

Follow [the manual cross-platform release policy](RELEASING.md). Every release requires both Mac DMGs and the Linux DEB/AppImage as well as these Windows artifacts. Preparing packages does not authorize publication; stop before promoting the feed until the owner approves the complete release. The complete-platform verifier is mandatory.

For the Windows portion, finish these steps:

1. Increase the desktop version in `desktop/Cargo.toml`, its matching lockfile
   package, and `desktop/tauri.conf.json`. Increase server/UI versions when those
   components change. Do not replace an existing release version with different
   contents.
2. Build and verify the Windows executable. Keep Tauri's `custom-protocol` feature
   enabled because the updater UI is a bundled local page. Build with the existing
   desktop toolchain and include its WebView2 loader in `dist`.
3. Run the release packager with the existing private signing key. Python 3.11+ and
   `cryptography` are needed only on the release machine:

   ```powershell
   python scripts/package-release.py --build path/to/verified-windows-build --private-key path/to/private-signing-key.pem --output release
   ```

   Run this from a clean desktop checkout at the exact commit in the Windows
   build manifest. The build directory must include that manifest and its native
   executable. The helper obtains the matching WebView2 loader from the crate
   pinned in Cargo.lock, or accepts `--webview-crate` for offline packaging.
   This produces `kindred-windows-N.N.N.zip` and `stable.json`. Keep the private key
   outside the repository, packages and server, with access restricted to the release
   operator. Back it up securely. The matching public key is
   `desktop/update-public-key.xml`. A different key requires an explicit trust
   migration or new installation; it cannot silently replace the existing channel.
4. Build the Windows setup EXE from that exact signed release. Download the
   Evergreen bootstrapper from Microsoft's official WebView2 download page, then
   prepare on Windows (its Microsoft Authenticode signature is checked):

   ```powershell
   python scripts/package-windows-installer.py --release-dir release --bootstrapper path/to/MicrosoftEdgeWebview2Setup.exe --stage build/setup --makensis path/to/makensis.exe --output release/Kindred-VERSION-Setup.exe
   ```

   NSIS 3.11 was used for the initial setup release. If NSIS is on another build
   machine, omit `--makensis` and `--output`, copy the prepared stage, and run
   `makensis Kindred.nsi` there. The prepared directory contains no private signing
   key or application credentials. Add the EXE and its SHA-256 to the GitHub release.
   Do not substitute a generic Tauri NSIS bundle: this installer preserves the
   versioned installation layout used by the signed in-app updater. Hosted Windows
   CI supplies the native client binary; signing and setup packaging are release
   operator steps. Rebuild `desktop/installer/banner.bmp` with
   `scripts/generate-installer-banner.cjs` only when the application mark changes.
5. **Only after the complete-platform gate passes and the owner approves publication**, copy the immutable ZIP to the server's `releases` directory beside its database
   (the current deployment uses `/var/lib/kindred/releases`). Read back and compare
   the ZIP's SHA-256 against the signed manifest. Upload `stable.json` under a
   temporary filename, then atomically rename it to `stable.json` **after** the ZIP
   is available. Do not overwrite a versioned ZIP with different bytes.
6. Exercise both setup and the in-app update button. Verify the resulting current.json,
   new process path, rendered application, and an unsent draft. Record the evidence
   in `docs/VERIFICATION.md`, then refresh the source and Windows download bundles.

`tools/test-windows-installer.py` tests the real setup EXE in isolated installation
folders, including an older ZIP install, preservation, repeat install, running-app
refusal, downgrade rejection, tampered payload rejection, and uninstall. The UI
test `tools/test-windows-installer-ui.py` checks the welcome/finish flow and captures
the setup screens. `/S` installs silently; `/NOSHORTCUTS` suppresses shortcut changes
for managed deployments and fixtures. No silent operation force-closes Kindred.

The feed is at `https://your-server/updates/stable.json`; ZIP names are derived from
the signed version. The manifest authenticates channel, platform, version, archive
size and SHA-256. The updater pins the public key and permits downloads only from
the configured HTTPS origin. It rejects redirects and malformed archives.

## Recovery and diagnostics

The main desktop window uses an app-colored custom title bar: Windows and Linux
have minimize, maximize/restore and close buttons; macOS has three traffic-light
buttons. Dragging the bar moves the window. Native completion/input notifications
continue while the window is minimized, provided the process remains open. Each
bot has a notification preference and a test button. The notification worker keeps
credentials in memory and receives generic notification text without task content.
The browser client uses the browser's permission prompt and needs an open page.

`update-status.json` records the most recent stage or error without credentials.
Reopen the update window to retry. Closing the popout cancels work before the
restart stage. The previous version is restored if the newly launched process
immediately fails; an application-level failure after startup may still require
operator recovery.

For read-only diagnostics, the installed helper supports:

```powershell
powershell -NoProfile -File .\Update-Kindred.ps1 -CheckOnly
powershell -NoProfile -File .\Update-Kindred.ps1 -VerifyOnly
```

Run those from the installed version directory. `CheckOnly` checks the signed feed;
`VerifyOnly` additionally downloads and validates the package without switching
versions or restarting Kindred. Neither command requires an account/provider key.

## Application icon assets

The original transparent K-bot mark lives in `desktop/icons/icon.svg`. Run
`node scripts/generate-icons.cjs` using the Playwright environment described in
[frontend testing](../tools/frontend/TESTING.md) to regenerate the 512 px PNG,
16/24/32/48/64/128/256 px Windows ICO, and matching `ui/favicon.svg`. Set
`KINDRED_TEST_BROWSER=edge` when using installed Edge. Update the favicon query
version in `ui/index.html` when changing the mark so browser caches fetch it again.
Tauri embeds the icon, and the installer shortcut and notification registration
reference the version's executable, so a desktop logo change needs a new client build.


## Sign-in continuity (0.48.9)

Updates restore the current account and profile. Saved desktop sessions live in
`profiles.json`, protected by Windows DPAPI, independently of browser storage.
The native launch supplies the saved persistence preference; a fresh browser cache
cannot silently turn a remembered session into a temporary one. Native sign-ins
use sessionStorage for the open window and the protected native store for durable
retention, rather than keeping another bearer token in localStorage.

If the user chose a temporary sign-in, an update can carry that live session through
its child process environment. The payload is bounded, tied to the server/profile,
expires after 15 minutes, and is consumed before the new app starts worker threads.
It is never placed in command-line arguments, an update-status file or an extra
credential file. The temporary session still disappears on a later ordinary
restart. Revoked and expired server sessions still require authentication.

When authentication is needed, the desktop shows saved account/profile choices,
with Continue or Sign in and an Add another account action. The bundled profile
window also shows saved sign-in availability and an expandable account connection
form. Adding another account on the same server starts a fresh sign-in without
reusing the previous account's browser token or restricting the new user to its
profile ID. Saved entries for other accounts remain available.

A temporary server failure while opening a profile preserves its saved credential.
Only an authentication rejection clears that account's saved session. A saved
sign-in badge indicates a locally retained session, not a guarantee that the server
will accept a credential after revocation or expiry.

Regression coverage includes an actual 0.48.8 Windows reproduction with empty
browser storage, repeated real WebView2 launches, DPAPI retention, temporary-session
semantics, fresh-account isolation, transient server failures and the signed update
handoff. These tests use fixture accounts and isolated installation/browser folders.
