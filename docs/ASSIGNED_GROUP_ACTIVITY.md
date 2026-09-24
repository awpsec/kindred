# Assigned group activity and natural addresses

Human requests such as “Don't worry about this further Atlas, lets move on.” now select Atlas before coordinator fallback. This extends the existing deterministic address parser to conservative human vocatives after an instruction. Explicit tags still win; quoted/code references and phrases such as “ask Atlas” or “check with Atlas” do not enter this path. Bot-to-bot routing is unchanged.

Shared chat activity now reconciles room worker snapshots with the same own-run feed used by the sidebar. Assignment/activity changes invalidate the chat render even when status and messages are unchanged. Missing or stale room snapshots no longer hide assigned response work; completed own runs remove stale indicators, while remote workers remain visible. New server worker payloads include run IDs; the UI retains compatibility with earlier payloads.

Recipient-selection reads remain hidden in both surfaces. Confirmed response work is visible before the first message or tool call. This repairs identified source paths; it is not a timing diagnosis of the reported live run.

Validation: 140 backend tests passed in the coordination preflight. The actual-app assigned activity regression passed in Chromium and WebKit, covering quiet observers, activity-only transitions, lagged/missing worker snapshots, completion and remote workers. The existing sidebar quiet-routing regression also passed in WebKit. Desktop/server shared UI files match. Screenshot: /opt/kindred/testing/assigned-activity-2026-09-21/assigned-orion.png.

Source change only; no release or deployment.
