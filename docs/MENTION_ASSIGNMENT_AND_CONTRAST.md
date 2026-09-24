# Mention assignment and badge contrast

Human group requests receive a durable `recipient_selected` receipt when the
server creates the selected run. Local and server-shared chats both use it. The
existing parser recognizes an explicit @mention anywhere in the message; no
model call selects the recipient. Structured mention IDs retain priority.

The receipt makes assigned work visible through `activity_started` before the
first assistant output or substantive tool call. Previously that visibility gate
could hide the selected bot throughout its initial model/context work. Queued
work still has queued status; this does not bypass another task on the same bot.
Unassigned bot-to-bot context reads retain the existing quiet behavior.

The model's task trigger now states that recipient selection is complete and it
should perform the request without deciding again whether to reply or narrating
routing. Later user corrections and already-completed work still take precedence.
This does not make provider generation or retrieval instantaneous, and it does
not establish the cause of the reported minute-long live run.

Mention badges use a dedicated foreground/background/hover palette, independent
of the message bubble's foreground override. Light mode uses #202020 text on
#e8e8e8; dark mode uses #ededed on #272727. Bot and channel badges share this rule,
including composer badges. Server and desktop CSS must stay identical.

Regression coverage includes trailing typed tags, structured mention IDs, shared
routing and quotes, immediate assigned activity, quiet unassigned context reads,
and browser contrast checks for normal and hover states in both themes. Browser
previews are rendered from the actual app CSS and mention components with fixture
messages, not from live bot replies.

Validation: all 139 backend coordination tests passed on the final source.
`test-mention-contrast.cjs` passed in Chromium and WebKit; the WebKit sidebar
quiet-routing regression also passed. Shared server/desktop CSS matches exactly.
Backend evidence: `/opt/kindred/testing/mentions-verified-2026-09-21/`.
Browser previews: `/opt/kindred/testing/mentions-2026-09-21/` (Chromium) and
`/opt/kindred/testing/mentions-webkit-2026-09-21/` (WebKit).
No release, deployment, or live-provider latency measurement was performed.
