# New-profile settings and provider setup

The Mac report exposed two server-side bugs that affect new accounts on every
desktop platform. A newly registered profile stored only some General settings,
so enabling Local Access sent a settings object without `identity` and failed
validation. Meanwhile, account/model checks treated the existence of a guest SSH
configuration as proof that provider installation had finished. During first
boot, Codex did not exist yet and the UI displayed a generic RPC disconnect.

The live native server also had an obsolete systemd test override: 128 MB and
25% CPU applied to the service and its new 6 GB QEMU child together. It overrode
the intended managed-profile budget and forced the guest into swap. The memory
check had examined only the cgroup mount root, missing native service limits.
The VM manager now checks its own cgroup and all visible parent limits before
launching QEMU, while retaining support for container-local cgroup mounts.

General settings now share defaults at profile creation and when read through
the Settings and time-zone APIs. Saving a response cached from an older server
preserves the previous identity when the field is absent; explicit invalid field
types still fail. Defaults do not grant Local Access.

Provider checks query the managed computer's setup state without starting it or
waiting for the setup lock. They distinguish an unstarted/stopped computer,
startup, software installation, completed setup, and failed first boot. Login
still waits for setup; a completed but failed cloud-init run stops that wait
with an actionable error. Codex, Claude and Kimi use the same readiness check.
Codex startup exit codes also distinguish a missing executable, an executable
that cannot run, and SSH failures, without exposing provider stderr.

Connections preserves setup messages and ignores account checks that finish
after sign-in begins. It retains the official device-code instructions until
the user checks the connection.

## Verification

- 320 Rust tests passed, including fresh-account settings round trips, sparse
  saved rows, identity preservation and type validation, all provider setup
  states, and Codex process-start errors. The first run passed 308; the 12 Pi
  integration tests passed when rerun after restoring the lockfile dependencies
  and setting `KINDRED_PI_TEST_NODE=/usr/local/bin/node` for this test host.
- Seven VM-manager tests cover non-starting status probes, bounded SSH failure,
  failed first boot, immutable software media, native/container memory limits,
  and refusing to start a VM when the service cannot accommodate it.
- `tools/frontend/test-provider-setup.cjs` passed in Chromium and WebKit, including
  a delayed account response overlapping sign-in, device-code instructions, and
  connection confirmation. The existing Claude browser-login test passed in
  WebKit, including code submission, completion, cancellation and URL validation.
- Changed Rust files pass rustfmt; JavaScript syntax and diff whitespace checks
  pass. The two repositories contain identical UI changes.

These changes do not alter native Mac code. Browser WebKit coverage is not a
physical Mac acceptance test. Source changes remain unreleased until a complete
desktop/server release is explicitly approved.

## Deployment requirement

Upgrade the host VM manager together with the server: the server uses its new
`connection-status` action. Check the configured `KINDRED_GUEST_SOFTWARE` bundle
as well as the host and existing VM binaries; the new-profile template is a
separate deployment target. Use exact released files and preserve attached
content-addressed ISOs and profile disks. See `RELEASING.md`.
Check effective systemd properties as well as individual drop-ins: later files
can override the managed-profile budget. The service's CPU and memory budget
must cover its managed QEMU children as well as the server process.
