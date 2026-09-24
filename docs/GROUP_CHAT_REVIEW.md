# Group chat and command-wait review — 2026-09-19

## Changes

- Group command waits identify the bot and, for a single command, the command title. Long titles truncate within the chat width and remain available in the tooltip and expanded details.
- Same-chat handoffs show who is waiting for whom. Cross-chat handoffs retain their Open chat action. Wait rows no longer reserve an empty avatar column; their stop control is accessible without hover.
- Command details use the existing reduced-motion-aware disclosure animation. Refresh preserves the expanded state and respects an in-progress collapse.
- Shared-account worker status is shown at the latest messages, rather than inserted into older history pages.
- Explicit handoff results no longer also trigger ordinary mention-based reply routing. This prevents an answer addressed to the requester from waking it prematurely while another helper is still working, or scheduling an extra requester turn.
- Bot instructions explain that delegated command work should wait durably, inspect the result on continuation, and then return the real answer.

## Existing lifecycle covered by the regression

A requester delegates with `send_to_bot`; the helper launches a managed command and ends its turn with `command_wait`. The saved request remains pending. Once command receipts are terminal, a helper continuation is queued and the request is attached to that continuation. The requester resumes once the helper returns its answer. A failed command's receipt is included for the helper to diagnose, not reported as success. Stopping the original request also stops its descendant commands and suppresses automatic follow-up.

The regression advances saved command age beyond an hour and reopens the database. It exercises the actual database and routing code, not an hour-long live provider session. Real commands retain the existing one-day default/seven-day maximum deadline. The host executing a command must remain available; remote SSH disconnects do not prove remote work stopped. Existing approvals, membership restrictions, bounded collaboration turns, and no-replay rules remain in effect.

## Validation

Browser fixtures cover Chromium/WebKit, light/dark themes, narrow/desktop layouts, group identity and menus, sender grouping, command ownership, waiting relationships, refresh during disclosure, and targeted stop controls. They do not substitute for native macOS/Windows verification or a live multi-provider run.

Backend regression: `command_jobs::tests::group_helper_command_wait_survives_restart_and_returns_once` covers success, failure and cancellation, plus a mentioned requester waiting for both helpers and receiving exactly one continuation.

`cargo check --tests -j 1` passed for the final server code and tests. The full backend test build was terminated before producing a current executable on the memory-constrained development host. The new lifecycle regression is checked in but has not been executed in this pass; run it during release validation. Browser checks above did execute successfully.

This is a source-only change; no release or deployment is implied.
