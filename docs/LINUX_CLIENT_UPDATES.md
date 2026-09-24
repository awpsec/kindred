# Update Kindred on Linux

For current AppImage and DEB installations, click **Update** when the app offers
an update, wait for installation, then click **Restart Kindred**. You can also
check in **Settings → General → Check for app updates**. Downloads come from
GitHub Releases and are checked against signed metadata before installation.

Both formats use the same per-user updater. For a DEB installation, this creates
a user-level Kindred application entry that takes precedence over the system
entry; it does not change the package version recorded by apt. Open Kindred from
Applications after updating, rather than invoking the older `/usr/bin` binary.
Accounts and local server data stay in place.

## Install a downloaded AppImage (fallback)

For the new public release transport, see [GitHub release updates](GITHUB_UPDATES.md).
The server-hosted feed instructions below remain relevant to older clients and fallback hosting.

The native updater is included starting with Kindred 0.51.0. It does
not require GitHub CLI authentication, a source checkout, sudo, compilation,
Docker builds, or FUSE. Download the Linux x86_64 AppImage from Kindred Releases
in your browser first.

## In the app

1. Open **Accounts → Update Linux client…**, or **Settings → General → Client
   updates → Install downloaded AppImage…**.
2. Choose the downloaded AppImage, then select **Install client**.
3. Watch copying, unpacking, checking and shortcut installation progress. You can
   keep using the current client while it prepares the replacement.
4. Select **Restart Kindred**, or quit and reopen from Applications later.

Accounts and the updater are bundled in the desktop, so that entry works even
when a standalone server serves an older Settings UI. Settings exposes the
shortcut only when the native client advertises the capability. Other platforms
keep their existing update paths.

Profiles, saved sign-ins, local permissions, models and standalone data remain in
their existing locations. The restart passes the current session directly to the
new process, including a session that the user chose not to remember. The current
UI also saves drafts and chat selection for restart; older server UIs may not
support that draft handoff.

The managed launcher marks this as a client-only launch. A newer bundled server
is not rebuilt automatically, including when the local server is offline. Use
**Accounts → Update local server** separately when you want to update the backend
and its hosted chat UI. An older client imported using the helper retains its
own existing startup behavior.

## Use the helper with an older client

Download the Linux update helper and matching AppImage from the
[latest release](https://github.com/awpsec/kindred/releases/latest), then run the
helper as your normal desktop user with the AppImage path as its argument.
Quit the old client and reopen **Kindred** from Applications when it finishes.
Python 3 is required; the bundled runtime needs no FUSE or Docker build.

The script is also available with the source; this command does not fetch source,
require GitHub credentials, or rebuild the app. A manually selected AppImage is
trusted executable software: use the official release download. This flow checks
package format, architecture and Kindred files, but does **not** claim a publisher
signature. If you have the published checksum, add `--sha256 HEX_CHECKSUM` to
verify the copied package before extracting it.

## Compatibility and recovery

The helper detects the existing system-library layout created by Linux Setup and
an extracted AppDir whose GStreamer directory points to host plugins. It keeps
that runtime choice. System mode checks the host WebKit/GTK libraries and the
input/output GStreamer plugins, and needs `patchelf` to remove the copied binary's
bundled search path. Missing dependencies stop the update before shortcut changes;
repair them once using Linux setup help. Updates never run a package manager.

`--runtime bundled` or `--runtime system` explicitly selects a different runtime
when needed. The original download and any manually modified AppDir are kept.
The helper does not copy arbitrary library removals into the new package.

Installations live in `$XDG_DATA_HOME/kindred/linux/versions/` (normally
`~/.local/share/kindred/linux/versions/`). A stable `kindred/bin/kindred` launcher
selects `linux/current`. The previous client remains available through
**Restore previous client** in the updater, or:

```bash
python3 "$HOME/.local/share/kindred/linux/update.py" --rollback
```

The installed helper is also retained at
`$XDG_DATA_HOME/kindred/linux/update.py`, normally
`~/.local/share/kindred/linux/update.py`. You can run that copy with `--rollback`
without downloading anything else, even if the client cannot open.

Then quit and reopen Kindred. An immediate startup failure leaves the current
app open with recovery controls; a later crash can be recovered with the helper.
Old version directories are retained, including after rollback; no profile or
server-data cleanup is performed by the updater.

Recognized per-user Kindred Applications/autostart shortcuts are redirected to the
stable launcher, preserving filenames for pinned launchers and existing autostart
choices. Original shortcut copies are retained under `linux/shortcut-backups`.
Unrecognized shortcuts and system-wide package entries are not modified. Launch
from Applications after updating, rather than an old download or old AppRun path.

The current source helper also recognizes PATH commands and `env` launchers,
preserving their environment choices, arguments, autostart preferences and desktop
actions. It updates `TryExec` along with `Exec`, and reuses existing menu filenames
instead of creating a second capitalized shortcut. If `Kindred.desktop` belongs
to an unrecognized launcher, installation still completes: that file is kept
unchanged and **Kindred (Updated)** is added separately. The completion message
identifies the preserved file. Repeated updates reuse the new shortcut.

These compatibility fixes are newer than the published 0.53.0 helper. Until a
release includes them, use the revised source helper directly with the downloaded
AppImage. Installing an AppImage with it does not patch the old native updater's
embedded helper; keep the revised script for subsequent manual updates.

### Recover a tiny Accounts window

Fully quit Kindred first, including its tray process. The current source helper
can back up and reset only the main/Accounts window placement:

```bash
python3 Kindred-Linux-Update.py --reset-window-state
```

Then reopen the client. Original placement files are kept under
`kindred/linux/window-state-backups/`; accounts, credentials, preferences and
standalone data are untouched. This option is newer than the published 0.53.0
helper. It is a geometry recovery step, not a guaranteed remedy for a blank
WebKit view. If the window remains blank at normal size, retain the terminal
startup output and `kindred/linux/current/install.json` to diagnose the selected
library runtime before changing it.

Current native source also refuses unusably small saved sizes and does not use
Linux's hidden-window geometry to calculate the frame. Measured frame sizes are
saved for stable restoration. Older placement files remain readable. These
native changes require a future approved build; running the helper alone does
not replace native code.

## Verification

The installer tests cover repeat updates, original-package preservation, literal
paths with spaces and shell characters, rollback to a previous or custom extracted
client, pinned/autostart migration, wrong formats/checksums, missing audio plugins,
failed extraction and shortcut writes, unsafe symlink targets, concurrent installs,
and the normal-user guard. Profile/standalone canaries must remain byte-identical.
The bundled updater is exercised in Chromium and WebKit for progress, duplicate
click protection, errors, rollback, restart failure and narrow-window layout.
A real Linux GTK/WebKit test under an isolated unprivileged account opens the
bundled updater from Accounts, chooses the existing released AppImage in the
native file picker, installs it, and restarts into the managed client. It verifies
that no server mutation commands ran. All 33 native unit tests and 19 Linux
installer/setup tests pass. These checks do not certify every distribution or
the owner's custom CachyOS installation.
