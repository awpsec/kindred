Test-only Windows network phase diagnostic

This helper observes an instrumented form of the production PowerShell enumeration and uses the unchanged production setup runner. It never satisfies or changes the production native release gate. No native run or paid CI is authorized by its presence.

Production baseline: 9bf296ebcb30585f68ab6bfd5d3cf115348086ba. The helper refuses different discovery/runner/hidden-window source hashes and dependency lock bytes. No warm-up PowerShell instance is launched. Its only network commands are the existing Get-NetAdapter and Get-NetIPAddress reads. The original aggregation expression is preserved, but IP enumeration and aggregation are materialized separately for timing; that instrumented invocation is diagnostic only.

After independent review and explicit native selection, invoke from the immutable probe checkout on Windows x64 with Python 3.11+, Git, the Rust Windows toolchain, and cached Cargo dependencies:

```text
python scripts/release/test-windows-network-phases.py --source-commit 9bf296ebcb30585f68ab6bfd5d3cf115348086ba --expected-helper-sha256 41ea785a6a47e245b2a0b79f36bf792dbc85040899ced20b89cbaed76bf72427 --output phase-proof
```

The process budget remains ten seconds, with the production hidden-window flags, null stdin and owned output redirection/kill/reap path. Offline harness build is bounded at 180 seconds; its outer process guard is 30 seconds. If the outer guard fires, descendant cleanup is explicitly unproved and the diagnostic cannot report completion. A separately selected job must provide its own overall deadline. No automatic retry is implemented.

Fixed sidecar markers record only stage/elapsed time and engine version/bitness. No network identifiers, raw subprocess output, environment values or secret contents are returned. The output has source/helper/script hashes and typed process, sidecar and cleanup results. Sidecar identity, single-link/non-symlink status, nonce, size, encoding, ordering and monotonic times are checked. A missing script-entry marker leaves startup versus script initialization unresolved. A marker names the last observed boundary, not a proven cmdlet root cause. Temporary and output cleanup failures remain failed; they do not become phase stalls or success. Existing diagnostic receipts are not overwritten.

The helper's stdout and phase-proof/phase-receipt.json are safe diagnostic receipts. Raw enumeration output stays in the owned temporary directory and is removed. A diagnostic_completed result still contains native_release_gate_passed=false. The unchanged production discovery/Compose/background-worker/package gates remain required for release. Engine executable path/hash remains unobserved by the production runner; version/bitness is available only if script entry succeeds.

Local preparation checks (no Windows execution):

```text
python scripts/release/test-windows-network-phase-receipts.py
```

The local test doubles exercise startup/each phase stall, sidecar failures, nonzero/success output, build failure, outer timeout and cleanup failure. Linux compilation of the generated Rust does not compile or execute Windows-only branches.

No existing workflow accepts this standalone Windows probe: build.yml rebuilds packages, validate.yml is Mac-only, and the installer/repack workflows have fixed purposes. A new bounded manual test-only route would require separate source review and execution selection. Do not repurpose the installer, relax the gate or launch a third packaging attempt just to run this helper.
