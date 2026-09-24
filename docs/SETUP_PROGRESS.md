# Standalone progress and responsive settings

These changes follow the published 0.48.37 release and are source-only until the
next owner-approved desktop/server release. The standalone Accounts page is
bundled with the native desktop; General settings comes from the selected server.

## Standalone setup

Accounts shows five stages: checking Docker, preparing setup files, downloading
and building server software, starting the local server, and checking readiness.
The progress bar counts completed stages. It does not estimate download bytes or
remaining time. Elapsed time and expandable, live Docker output make the longer
build stage observable. Recent output is bounded and displayed as plain text.

The saved local profile is greyed out while setup runs, after a failed attempt,
or while the managed server is unavailable. Remote accounts remain usable. The
embedded Accounts tab also shows progress on the local profile itself. Native
profile switching checks setup state too, including clicks racing with setup.
Failed setup retains its stage and output, with an explicit retry action. A
missed status response keeps the worker marked as running and retries the check.

Setup uses the existing Compose project, configuration and data volume. Building
and starting are separate commands so their stages reflect actual work. Build
has a 30-minute limit, start has a three-minute limit, and readiness is checked
for 90 seconds. Readiness requires the local server to serve the desktop's
expected UI version. Status polling is serialized; it never launches setup.
The full local log remains in the existing standalone directory's `setup.log`.

## General settings

General renders its form immediately using cached account values. Only account
controls wait for the fresh server response; device controls load independently.
Account refresh has an eight-second limit and an inline retry action. Failed
refresh leaves account controls read-only to avoid saving stale values.

Microphone enumeration is bounded to three seconds; optional native settings and
dictation-status checks to five seconds. Each has a local retry action. Dictation
initialization and permission-view cleanup no longer hold up app or settings
navigation. Leaving General aborts its fetch, and a view-generation check ignores
late responses after navigation. It cannot replace a newer form or draft edit.

## Local validation

Run the native suite and the two focused browser checks:

```sh
CARGO_BUILD_JOBS=1 cargo test --manifest-path desktop/Cargo.toml --locked --bin kindred-desktop
node tools/frontend/test-setup-progress.cjs
WEBKIT=1 node tools/frontend/test-setup-progress.cjs
node tools/frontend/test-settings-responsiveness.cjs
WEBKIT=1 node tools/frontend/test-settings-responsiveness.cjs
```

`KINDRED_PLAYWRIGHT_MODULE` may point at an existing Playwright installation.
The setup check covers 12 viewport/text-size/theme combinations in each engine,
disabled local profiles, usable remote accounts, retry, live stage detail,
serialized polling, missed replies and embedded Accounts. The settings check
holds device and server replies open, exercises recovery, and verifies that old
responses cannot overwrite newer settings. Native tests run real child commands
to check streaming output and timeout cleanup without provisioning Docker or VMs.

Existing settings-polish, profile-settings, linux-setup-recovery and dictation
browser checks provide regression coverage. These local fixtures do not establish
fresh Docker provisioning, physical microphone behavior, KDE/Wayland behavior,
or native Windows/macOS acceptance. Those remain separate platform checks before
the next approved release. No GitHub Actions build or live server deployment is
needed for these source checks.
