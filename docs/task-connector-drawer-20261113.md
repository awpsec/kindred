# Connector calls inside long jobs

The Calls drawer keeps connector receipts inside the owning long job, ahead of its uninterrupted progress timeline. A single collapsed row shows the connected services and call count. Expanded calls are grouped by their persisted progress anchor, with “Before the first update” or a short excerpt of the actual update. Unknown anchors retain an honest “Other linked calls” label.

Ownership still requires the existing same-chat, same-bot and same-run validation with a persisted group or progress anchor. Unrelated calls stay in the transcript. Brief work retains its existing inline connector receipts until Gather qualifies the job. Pending and changes-requested approvals stay outside the drawer and remain actionable while it is collapsed.

The drawer, existing call disclosures and connector card revisions survive refreshes. Resolved approvals transfer into the drawer, preserving keyboard focus at the drawer or the visible job header. Quoted-message navigation reveals the owning carousel page, job and drawer. Reduced motion follows the existing disclosure controls; the capsule, active bot outline, stacked appearance and hover-only stop control are unchanged.

## Validation

- `test-task-connector-drawer.cjs`: Chromium/WebKit at 1100, 390 and 320 px; both progress anchors; foreign chat/run exclusion; pending/resolved approvals; retained drawer and call DOM; new arrivals; drafts; quoted navigation; collapse/reopen; reduced motion; completion; three-to-four-update Gather transition.
- `test-connector-task-transfer.cjs`: Chromium/WebKit; focus, fast completion, burst resolution, background cleanup and reduced motion. Fixture now supplies qualifying sustained-work evidence and asserts the selected drawer presentation.
- `test-progress-gather-rich.cjs`: Chromium, 8 cases preserving iframe state, video position and open file preview.
- `test-job-timeline-accent.cjs`: WebKit at 1100, 951, 390 and 320 px; timeline alignment, disclosures, completion, bot accents and drafts.
- `test-activity-carousel.cjs`: Chromium, 45 cases including retained header geometry, hover stop control, interrupted motion, pagination and reader anchoring.

The older `test-task-presentation.cjs` stops at its assertion “Narration count never creates a job.” This assertion fails identically on the unchanged 0.90.5 source because the approved Gather behavior promotes the fourth update. It was not weakened as part of this change; the new regression directly tests that transition.

These are source/browser checks. No native package, phone installation or production deployment is included in this source change.
