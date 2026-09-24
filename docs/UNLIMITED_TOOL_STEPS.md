# Tool-step default and approval receipts

The default max_steps is now 0 (no fixed Kindred tool-call cap).
Explicit values 1..100 remain supported for operators choosing a limit.
Pi model/tool counters, server retry accounting, Codex and CLI tool bridges
all respect 0. Kimi requires a numeric native turn ceiling, so the CLI bridge
uses Python's sys.maxsize when Kindred's limit is disabled.

Existing configuration files with max_steps = 24 retain that explicit value.
For the owner's next approved release, update the deployed configuration to
max_steps = 0, preserving its other settings. Do not deploy solely for this
source change. Package the updated server, Pi harness and provider CLI helper.
Cancellation, approvals, provider failure retries and timeouts are unchanged.

Completed-run approval/task cards now precede the final result bubble.
Instruction approvals display a green checkmark and state their approved status.
This changes display order; it does not change approval enforcement.

Checks: Pi SDK suite includes 30 calls in unlimited mode and explicit-budget
exhaustion; CLI protocol fixtures; Rust provider/retry/config tests; Chromium
and WebKit receipt ordering/single-render checks with screenshots.
