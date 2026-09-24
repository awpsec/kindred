# Continuing a stopped task

`POST /api/runs/{id}/continue` is an authenticated, workspace-scoped operation.
Only failed, interrupted or cancelled tasks in an active chat with an active
bot can start a continuation. It returns `{"run_id":"…"}`. Repeating the call,
including after an uncertain HTTP response, returns the same run.

The run, its compact `continuation` chat row, and two event receipts are written
in one database transaction. `task_continued` on the stopped run identifies the
new run; `task_recovery` on the new run records its source and original root.
The new run keeps the entire original request, without nesting retry prompts
or truncating a maximum-length request. Queued retries use the ordinary task
queue and current approval policy.

The shared instruction packet supplies recovery rules, bounded activity and
approval history from earlier attempts, and original attachment references.
Saved decisions belonging to the original continuation remain current. The bot
must check completed actions and uncertain outcomes before continuing and must
not override declined actions or repeat writes. Reduced diagnostic text in the
conversation keeps recovered failures from crowding out the user's work; the
full run/event history remains available.

Chat shows **Continuing task**. Provider and task errors for a continued run
share a collapsed **Previous attempt · continued** disclosure, including that
attempt's activity and attachments. Current unresolved failures remain visible.
Polling preserves an expanded disclosure; reloading defaults to the compact view.

Startup also repairs the projection of the former UI-generated retry messages.
It requires the durable send receipt, matching bot/chat/run identity and exact
generated prompt text. It never reclassifies arbitrary user prose. The original
run prompt, events and receipt are retained, and the repair is idempotent.

Verification in the server checkout: `cargo test task_recovery` covers authentication, concurrent HTTP
requests, restarts, full-length prompts, repeated failures, saved decisions,
attachments and quotes, archived bots, missing tasks and legacy projection repair. `tools/frontend/test-task-recovery.cjs` covers the
request payload, grouped diagnostics, message links and reload behavior in Chromium/WebKit.
