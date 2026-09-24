# Long-lived bot continuity and computer cursor

Source change, not a release/deployment. No industry-specific workflow is required.

## Continuity

- SQLite FTS5 indexes persisted chat messages on first migration and updates transactionally on insert, edit and delete. Original history is retained. Search excludes suppressed messages and checks current conversation membership on every request.
- `history_search` returns up to eight attributed excerpts with message sequence IDs for `chat_read`. Explicit searches can cover the bot's current memberships; automatic recall stays in the current conversation. Search uses normalized literal words (not arbitrary FTS operators), with a twelve-word query bound. This is lexical retrieval, not embedding/semantic search.
- `continuity_save` / `continuity_read` provide conversation- and bot-scoped notes with stable topics, active/closed states, source run IDs, revision checks and an append-only revision audit. Updating an old topic promotes it into the recent-note selection. Notes and their revision history survive restart and workspace export/import; older packages without these tables still import.
- Provider-independent instructions ask bots to update concise notes after substantive work and before delegation/waits. These are model-authored working summaries, not guaranteed factual records. A bot can still fail to write a note; stored source history and an automatic recent-task excerpt journal remain available.
- Actual Pi SDK compaction summaries now persist as source-run events. The most recent same-bot/same-chat summary is available in subsequent task context. Failed/aborted compactions do not emit summaries. Other harnesses retain their own internal compaction behavior; this change does not extract private Claude/Codex/Kimi compaction payloads.
- The continuity packet is bounded to approximately 16 KB on full-context models and 4 KB on smaller ones, with omission metadata and explicit readback tools. It includes selected notes, relevant history, recent task outcomes, and a Pi summary when present. It never appends the bot's lifetime transcript to each prompt.
- Existing durable approvals, user decisions, command waits and collaboration state remain authoritative. Summaries are not authorization to repeat external actions. Newer corrections and current readbacks take precedence.

This is not a promise of perfect recall over years. Coverage includes a 10,000-message synthetic history, not 10,000 real paid model turns. No background summarizer makes extra provider requests, and no transcript is deleted to compact context. Bot-wide durable memory remains separate; its existing 16 KB limit is unchanged.

## Computer viewer

Watch-only noVNC connections omit local-cursor pseudo-encodings so x11vnc includes its actual remote cursor in framebuffer updates. Interactive connections retain their normal low-latency local cursor. The small source patch is reproducible in `tools/frontend/remote-cursor-plugin.mjs`, checked against pinned noVNC 1.7.0, and fails loudly on incompatible upgrades. Existing x11vnc installations need no configuration changes for this negotiation. Upstream documents the framebuffer fallback in [x11vnc options](https://github.com/LibVNC/x11vnc/blob/master/doc/OPTIONS.md).

Successful `computer_click` calls record only coordinates, button, bot ID and a receipt ID/time. The viewer briefly highlights the position using canvas bounds, including letterboxing. It never highlights declined/failed clicks, another bot's clicks, old receipts, or clicks during user takeover. The indicator follows the existing status refresh (up to roughly 2.5 seconds); the remote cursor itself follows the live stream. Fast multiple clicks between refreshes can collapse to the latest highlight. Shell-driven mouse movement appears in the stream, but shell clicks have no tool receipt ring. Reduced motion disables the pulse.

## Verification

- Full Rust suite: 377 passed; the final four continuity regressions also passed after adding migration/transfer/budget coverage.
- Actual Pi SDK suite: 26 passed, including emitted compaction summary content.
- Chromium and WebKit: watch vs interactive cursor negotiation, scaled/letterboxed coordinates, old/wrong-bot receipts, takeover, cleanup and reduced motion.
- Preview PNG/GIF uses the real CSS and cursor module over a synthetic browser screen; it is not a recording of the owner's VM.
- Native macOS and live VM end-to-end verification remain release checks. No production data, provider account, or VM was modified.
