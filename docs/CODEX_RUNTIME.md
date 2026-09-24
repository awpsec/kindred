# Complete Codex guest runtime

Rowan's September 15, 2026 persistence failure on production-server happened before
Kindred received a `remember` call. The guest's Codex logs recorded two attempts
to call `tools.remember` through code mode, both failing with:

```text
failed to spawn code-mode host /usr/local/bin/codex-code-mode-host: No such file or directory
```

The original installer extracted only the CLI from the pinned official Codex
0.153.4 package. That package also contains the code-mode host, package manifest,
PATH tools and sandbox resources. Losing those components breaks tool execution
even when account sign-in and ordinary responses work. This affects guest
installation on the backend, independently of the desktop operating system.

`deploy/download-codex.py TARGET` now verifies the official archive digest and
stages the complete versioned package, with TARGET pointing to its entrypoint.
`--install SOURCE TARGET` relocates that package offline under the target prefix
and atomically replaces the CLI entrypoint. A compatibility host symlink supports
already-running app-server processes. Existing versioned runtimes must match;
incomplete packages, archive links and unexpected members are rejected. Managed
guest startup requires the host and runs the complete installer before marking
the computer ready. Future releases must stage the new runtime and matching VM
bootstrap together; copying only `codex` is insufficient.

## Live repair receipt

The affected profile guest now has the complete official 0.153.4 runtime at
`/usr/local/lib/kindred/codex-runtime-0.153.4`. Its CLI SHA-256 is unchanged:
`56ef98ab4032d317ab26e9b5e5a175650717351edb16ed9cde0cb6d1734d62da`.
The verified upstream archive digest is
`a822187e1a2420c61c5926721bfbd878701ed95547c9bb0d4de4498a16ba1821`.
Guest backup and component receipts:
`/var/lib/kindred-release/provider-runtime-repair-20260916T010906Z`.
The Kindred host service stayed active with the same PID; no VM, account,
credential or release feed was replaced.

An ephemeral real Codex 5.6 Luna turn successfully delivered exactly one
`remember` call to an isolated verification harness after the repair. Receipt:
`/opt/kindred/testing/codex-runtime/live-verification.json` on build-host. This
verifies tool delivery; Rowan's failed memory write was not replayed or silently
reconstructed. Ask Rowan to retry the original save. The new-profile installer
changes remain source changes until the next approved release.

Offline tests: `python3 -m unittest discover -s deploy -p 'test_*.py'`.

## Preventing recurrence

Readiness now checks the tool runtime, not only account sign-in:

- The installer validates all six components, executable permissions, ELF
  architecture and package layout. Before switching the CLI, it verifies the
  installed CLI version and exercises the actual code-mode host.
- The offline host probe negotiates its protocol, executes JavaScript, receives
  one fixed fixture callback, returns its result and checks the final output.
  It uses no model, network, credentials, real bot memory or external tools.
  It has a four-second deadline, bounded frames and always reaps its helper.
- First boot repeats this check as the `bot` user before writing the ready marker.
  VM status rechecks the complete file layout, so an old marker cannot hide a
  missing helper or resource. An incomplete runtime gets an actionable failure.
  That failure blocks Codex account readiness; other working providers on an
  already-installed shared guest remain available.
- Every Codex RPC connection runs the full probe before app-server starts. The
  probe is embedded in the server binary and sent over SSH, so an existing guest
  does not need a new on-disk checker to be protected. A failure names the broken
  tool runtime instead of suggesting another sign-in or presenting a usable bot.
- Manual server verification now discovers **all** deployment tests, including
  installer/readiness tests. It remains manual; a source push does not run it.

The provider memory contract test sends a real `item/tool/call` protocol frame
through Kindred's dispatcher into a disk-backed SQLite database, checks the
success/failure response and Activity receipt, closes/reopens the database and
checks a fresh conversation's instructions. It also injects a storage failure
and an oversized write, verifying that both retain the prior memory and return
failure rather than a saved receipt. Another bot's memory stays isolated.
This is deterministic provider-protocol testing; the provider peer is a fixture,
not a paid model. The independent offline helper probe uses the official runtime.

Validation commands:

```sh
python3 -m unittest discover -s deploy -p 'test_*.py'
python3 deploy/check-codex.py /path/to/complete/runtime/bin/codex
KINDRED_PI_TEST_NODE="$(command -v node)" cargo test --locked
```

Local verification passed 322 server tests, followed by the final provider-specific
readiness regression; 42 deployment tests and six release-policy tests in each
repository also passed. Changed Rust files pass formatting checks. The repository
wide formatter still reports a pre-existing wrap in `src/notifications.rs`, which
this change does not modify.

The new checker passed against the official pinned package after a local offline
install/relocation, and against Rowan's repaired guest as its normal `bot` user.
The latter streamed the checker over SSH, without modifying guest files or memory.
These checks cannot guarantee model behavior or prevent future disk/network
failures; they detect this installation defect before a task, and verify that
Kindred reports failed memory writes accurately.

Rollout remains pending the next owner-approved release. Deploy the matching
server, complete guest software bundle and VM manager together. Existing flat
Codex installations need the complete verified package installed before they
will pass readiness; preserve their auth stores, profile data and disks. The
September 15 repair fixed Rowan's guest only, not every historical guest or the
currently deployed new-guest template. No new release or deployment is implied
by these source protections.
