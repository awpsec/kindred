# Provider connection recovery

Transient provider failures now get up to five automatic retries after the initial attempt. The waits are 5, 10, 20, 40 and 60 seconds. Retries retain the task ID, original request, selected provider/model, approval context and completed tool receipts; they do not fall back to a different provider. The normal task deadline and action limit still apply. Stop remains available during both the delay and the provider call.

Chat shows `Connection issue - retrying (3/5)` in red with animated dots. Reduced-motion settings disable the dot animation. Once a retry produces real work, the normal activity indicator returns. Provider diagnostics stay in Activity rather than appearing as repeated assistant messages.

After all five retries fail, the task stops with `Connection issue - 5 retries failed.` and a Retry button. Retry uses the authenticated, idempotent task-continuation endpoint and its saved recovery context; it does not repeat the original request blindly or show the Continue task dialog. Normal failure notification delivery still alerts the user.

Configuration, validation and action-budget errors are not treated as connection blips. Automatic recovery also stops when an external tool has no execution receipt, a command timed out/stopped, a connector outcome is unconfirmed, or the turn is waiting for a saved user choice. Those cases retain their existing recovery flow so a retry cannot silently repeat an uncertain write.

Each new provider process has a distinct usage-receipt range, preserving token/cost records across attempts. Retry instructions include the same task's earlier activity and approvals. The task-wide action budget does not reset with the provider process.

Verification uses local fixtures, with no paid provider requests: backend recovery/cancellation/context/usage tests, the subscription bridge protocol tests, and Chromium/WebKit UI checks for each counter state, recovery, exhaustion, direct Retry, request failure, double-click protection and reduced motion.
