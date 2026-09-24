# Manual, complete-platform releases

Effective 2026-09-14: after each implementation, verify, commit and push source changes to the actual GitHub repositories. Routine tasks do not publish releases. The owner must explicitly approve each publication. A significant change can be proposed once implementation, packages and checks are ready. Build approval is separate from publication approval.

## Cost and notification controls

All GitHub workflows use workflow_dispatch only. Ordinary pushes, version tags and releases start zero jobs. The server verification workflow stays disabled until specifically requested. The desktop workflow requires an explicit runner-usage approval and matching version, allows two platform jobs at a time, queues later builds for the same platform without interrupting a running package set and retains artifacts for seven days. It has read-only repository permissions and cannot publish releases. There are no automatic retries, schedules or per-task releases. If billing blocks a run, stop and report that exact condition rather than dispatching again.

## Build one candidate

Required targets are Windows x64, Linux x64 (DEB and AppImage), and Apple Silicon (DMG). Intel Mac builds are retired. Under the owner’s current Actions budget policy, build Linux and the server on owned hardware, reuse verified native artifacts only when compatible with the exact changes, and dispatch only the necessary Windows or Apple Silicon jobs. Do not launch the full Actions matrix. The Ubuntu 22.04 build baseline avoids unnecessarily raising Linux library requirements. DMGs must be built and checked on macOS. Each target emits build-TARGET.json with its version, exact source commit, file size and SHA-256; the local release gate requires all three targets. Preserve original build and repack provenance when reusing artifacts.

Windows uses a statically linked C runtime so the setup does not rely on a separate Visual C++ runtime already being installed. A targeted Windows-only or Mac-only correction can use an exact source_commit from an existing approved build and reuse its verified Mac/Linux artifacts. Select platforms=windows or platforms=macos for the single required native target. Retain completed packages if another target is blocked; retry only the blocked target after explicit owner authorization. Corrections use current collection tools with the pinned application checkout. They queue behind the current build and do not publish anything. Mac builds retain Tauri’s signed app, then create a native compressed DMG with an Applications link using hdiutil. This avoids the bundled writable-image wrapper and exposes native packaging diagnostics. The mounted-DMG and native-app checks still run before acceptance. Completed bundles and signed Mac app archives are retained for one day as explicitly unverified artifacts if later packaging or validation fails, so a packaging repair need not discard the expensive build. A failed run still requires owner approval before retrying.

Download the artifact set before its seven-day expiry. Build the existing compatible signed Windows ZIP and setup EXE from that exact Windows native binary using scripts/package-release.py and scripts/package-windows-installer.py. Keep signing keys local. Run tools/test-windows-installer.py and save its final JSON as installer-verification.json. A plain native EXE is not the installer.

The restored Windows ZIP helper runs locally against the clean desktop checkout:

```text
python scripts/package-release.py --build CANDIDATE/complete --private-key /secure/path/existing-key.pem --output CANDIDATE/complete
```

PEM and .NET RSA XML private keys are supported. The helper refuses a key that
does not match the public key already installed in Kindred clients, binds the
native executable to its build manifest, and verifies the WebView2 loader against
Cargo.lock. An optional `--webview-crate` permits offline packaging. Keep the key
outside the checkout; never place it in release candidates or GitHub artifacts.
The retained WebView2 license matches the verified 0.48.36 Windows package.

## Matching server payload

Commit the server implementation and version first, build that clean revision with
`cargo build --release --locked`, and run the server repository helper:

```text
python scripts/release/package-server.py --binary /absolute/path/to/kindred --output CANDIDATE/server
```

It includes the tracked deployment scripts and licenses, checks the native binary
version, and records the server commit and binary/archive hashes in SOURCE.json.
Copy the resulting kindred-standalone-VERSION.zip to the desktop repository's
`desktop/standalone.zip` before building the desktop candidate. The generated archive is not tracked; its SHA-256 and server source commit are verified by native CI and recorded with the candidate.
The helper never deploys a server or changes an existing desktop installation.

## Complete-platform gate

Place all artifacts, the three build manifests, the compatible Windows setup, its signed ZIP, stable.json and installer-verification.json in one candidate directory.
For releases after 0.51.0, also sign the complete Mac/Linux client feed with the
existing updater key (never regenerate it):

```sh
python scripts/release/sign-client-updates.py --directory CANDIDATE --version VERSION --source-commit DESKTOP_BUILD_COMMIT --private-key /secure/path/existing-key.pem
```

This verifies the native packages first, writes `client-stable.json` and creates
canonical copies of both Mac DMGs and the Linux AppImage. It does not publish or
promote anything. The final release gate requires this feed for newer releases,
checks its pinned signature and binds every package to the verified source build.
Then run:

```text
python scripts/release/verify-release.py --directory CANDIDATE --version VERSION --source-commit DESKTOP_BUILD_COMMIT
```

This read-only command blocks missing platforms, mixed versions/sources, changed hashes, invalid package headers, an invalid Windows update signature, a ZIP using a different native binary and an installer without verification for its exact bytes. Its result never authorizes publication. DMG verification checks image integrity plus the app version and Mach-O architecture on the Mac builder. Record launch/install tests and macOS signing/notarization status in the release review; a DMG build alone does not prove notarization or UI acceptance on a real Mac.

## Publish only after explicit owner approval

Use scripts/release/publish-github.py with the same candidate and exact build commit. It performs the complete-platform gate again and previews by default. Only add --publish and --approval "publish vVERSION" after the owner approves that version. It creates a draft, uploads and verifies all assets, then publishes. It never enables or dispatches CI. Existing published versions are immutable and are not overwritten.

The signed stable feed may be promoted only as part of that explicitly approved complete-platform release, after the immutable package is available and verified. Do not reuse old ad hoc work/publish-* or work/release-* scripts, and do not use a Windows-only success as permission to publish. Missing Mac or Linux packages block publication. Ordinary commits or source pushes are not releases.


## Windows installer without repeating native builds

When the signing key is on the operations host, sign the existing native package
locally. The desktop repository's manual `windows-installer.yml` workflow can then
prepare and verify the compatible Setup on a Windows runner using that exact ZIP.
Put only the signed ZIP, `stable.json` and Microsoft-signed WebView2 bootstrapper in
a dedicated private draft named `installer-inputs-VERSION-SUFFIX`. Supply the exact
application build commit and the previous published version for upgrade testing.
GitHub requires push access to read private draft releases, so this one job
requests contents: write and exposes its token only to the download step. It has
no publishing step and still requires explicit runner-usage approval. Other
workflows retain read-only contents permissions. Download its Setup, BUILD metadata and installer-verification.json
before the artifacts expire. Remove the temporary input draft after retaining the
results. Never upload the signing private key. Reuse completed Mac/Linux/native
Windows binaries; this job only wraps and tests the signed Windows package.

## Deploy the approved release to production-server

The owner has authorized the matching server package, production-server instance upgrade
and signed update-feed promotion with every approved release. Preserve the
existing native systemd deployment, configuration, credentials, profile data and
VM disks. Do not provision replacement VMs or move production state to build-host.

1. Inspect the live service, host compatibility, active bot runs and profile/guest
   inventory. Stage the exact server bundle and verify its SOURCE.json hashes and
   version. Compare deployed guest helpers and Pi harness with the candidate; only
   replace components that changed. Check the new binary on the target host.
   Inspect `KINDRED_GUEST_SOFTWARE` in the running service as well: new profile
   computers use that bundle, independently of existing guests. Stage the release's
   `kindred` binary and `deploy/` files there with the pinned Codex executable.
   Verify its binary version/hash and helper hashes against the published bundle.
   Keep attached content-addressed software ISOs immutable; update existing guest
   payloads separately after their setup and active work finish. Also install the
   matching host VM manager when its interface changes.
   Record every profile computer's saved CPU, RAM and disk settings and compare
   them after deployment. Preserve resource drop-ins such as
   `computer-resources.conf`; template defaults do not resize existing computers.
   Check effective `MemoryMax` and `CPUQuota` plus all service drop-ins. Managed
   QEMU children share the service's cgroup; an old server-only test cap can
   starve them even when the host has ample free memory and CPU.
2. Wait for active work to finish. Save restricted, consistent backups of the
   databases and credentials, config, previous binary/helpers, harness target and
   stable feed. Keep a concrete rollback procedure before changing live files.
3. Publish the verified desktop and matching server releases together. Promote
   only their exact immutable bytes. Switch the staged server during a short
   maintenance window, without changing VM disks or unrelated services.
4. Verify the running version, health, saved account login, current hosted UI,
   workspace endpoints and guest connectivity. Copy the verified signed Windows
   ZIP into the existing release directory before atomically replacing stable.json.
   Fetch both through the normal HTTPS endpoint and independently verify the
   existing public-key signature, version, size and SHA-256. Also stage all three
   canonical Mac/Linux packages and their `client-stable.json`. Verify and promote
   those as a set using `deploy/client-updates.py --directory STAGED --destination
   RELEASE_DIRECTORY --approval "promote client updates VERSION"`. This copies
   immutable package bytes before atomically switching the manifest. It does not
   replace `stable.json`; Windows requires its own matching feed and ZIP. Verify
   the index signature and every package hash through normal HTTPS afterward.
   The release Verification ZIP supplies `hosted-update-names.json` to map friendly
   GitHub download names back to these canonical hosting names.
5. Record the deployment and rollback location. Keep prior packages and backups.
   If validation fails, restore the prior binary/helpers/feed and, when needed,
   the consistent database backup while the service is stopped.

Hosted UI and native client versions are separate. Native Mac/Linux clients
through 0.51.0 require one manual install to gain the server updater. New clients
use `/updates/client-stable.json`; Windows continues using `/updates/stable.json`.
The server does not silently install a newer client. The signed availability
check offers **Update**, and installation/restart is a user action.

Native Mac acceptance remains mandatory: test Apple Silicon in a writable
Applications folder, signature/architecture validation, bundle replacement,
restart/session handoff, retained previous bundle, read-only/translocated app
errors and standalone server preservation. Linux unit/browser tests cannot prove
Mac install/restart acceptance. Test Windows's existing feed and Linux's installer
as well. Keep Mac signing/notarization status explicit.

## Public GitHub update channel

See [GitHub updates](GITHUB_UPDATES.md). Publish both signed manifest envelopes as
top-level release assets alongside the platform installers. The friendly publisher
stages them automatically. GitHub latest must always point to a complete stable
release; keep partial test releases as prereleases. Never publish signing keys.

## Public release descriptions

Use `# Kindred VERSION` followed by a few short bullets about changes people will notice (at most 200 words). Avoid internal project details, names, hosts, commit hashes and test logs. The publisher adds download guidance and links automatically. Store technical provenance and verification in the attached assets. Public repositories begin with fresh history: do not copy historical packages into them. Build and audit new packages from public source.
