# Quiet switching, menus and routine recovery

Unreleased source work. No live workspace, account, package or device installation was changed.

## UI

- Uncached conversations use a small delayed opening status. Cached conversations remain immediate. Existing per-conversation draft and scroll-anchor storage stays in place.
- Select, conversation and message menus share row spacing, type, corners and shadows. Pointer entrances stay restrained; keyboard opening is immediate. Keyboard navigation, typeahead, search and viewport bounds remain supported.
- Routines remain in bot Details. Rows show the name, cadence and current state, with Review for issues and an options menu for management. Exact next-run time, instructions, inbox source and provider errors remain available in Details. Controls retain the existing shared request tracking and delete confirmation.

## Interruption lifecycle

Previously, each failed scheduled occurrence contributed its own recovery action to chat. Continuing a task retained a “Previous attempt · continued” row. The per-occurrence retry budget did not stop later scheduled occurrences from failing repeatedly.

Scheduled routines now have one current incident, calculated from authoritative execution history across pagination. Only the latest leaf of each occurrence counts. Three consecutive terminal failed checks automatically pause an enabled recurring schedule and cancel queued checks. Existing backlogs are consolidated on read and paused before their next due check. Internal provider retries keep their existing budget.

Resume routine / Retry check starts one check using the current saved instructions, shares an active check when present, and records a durable request receipt. It does not replay missed occurrences. A recurring schedule resumes at its next future time. A one-time routine stays consumed. Explicit resume resets the pause budget; it does not claim success. Stopping a recovery allows a subsequent explicit fresh retry.

Old incident cards hide while the new check is active; a new failure replaces the incident. A verified quiet or reported success clears the incident from normal chat. Unrelated work, cancellation and unclassified handoffs do not count as successful recovery. Ordinary task failures with an explicit continuation receipt also leave normal chat without a lingering “Task continued” acknowledgement. Unresolved ordinary failures remain actionable.

Underlying runs, events, reports and attachments are retained. Model-facing routine discovery keeps error summaries bounded; an explicit routine details lookup retains the full diagnostic and instructions. Old scheduled-occurrence Continue actions are rejected once a newer occurrence supersedes them. This is a rendering and recovery change, not deletion of audit history or a change to approvals, provider permissions or bot context.

## Validation scope

Focused Rust tests cover consolidation across paginated history, pause thresholds, durable recovery and restart, explicit resume, unrelated success, cancellation, legacy backlogs, and ordinary task continuation. Existing routine completion/recovery/control and task recovery regressions remain required.

Browser fixtures cover Chromium and WebKit: compact routine management, deletion confirmation and retries, shared request state, menu keyboard behavior, narrow layouts, quiet recovery, conversation draft/scroll retention and bounded history paging. Fixtures use synthetic data and do not send mail or invoke providers.

Native Windows/macOS and physical iOS/Duo acceptance are not implied by browser tests and remain release-time checks. No release was authorized for this polish pass.
