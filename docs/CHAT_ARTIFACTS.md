# Rich chat, artifacts and files

**Bot Details → Artifacts** is the bot's saved record of files, interactive HTML/JSX
chat artifacts, graphs delivered as files, lists and reminders. Ask in chat to
create or maintain them. Filters and cursor pagination load 20 metadata entries
at a time, without loading file bytes or list items. Opening a record fetches its
content; Preview is a separate action. Only one record stays expanded, and leaving
the library or changing pages discards its contents and running preview. There is
no library polling or ever-growing list of loaded pages.

An indexed lookup finds existing HTML/JSX/React fenced chat artifacts without
copying their source into another store. Opening one message parses up to eight
complete artifacts, each limited to 256 KiB. Incomplete fences are omitted and
oversized snippets show a limit message. Attached files use the existing authenticated
download path and preview restrictions below.

Chat renders Markdown headings, tables, blockquotes, task lists, links and highlighted fenced code. Task-list marks in prose are a snapshot; use the persistent checklist card to change saved checklist state. Code blocks offer Copy. HTML and JSX code or attached source files offer an explicit Preview action. JSX uses bundled React; supported React imports are local. External packages, remote assets and arbitrary module imports are not supported. Mermaid and mathematical typesetting are not implemented.

Previews run in a separate opaque-origin iframe with scripts enabled. They cannot read the parent conversation, its storage or credentials, navigate the top page, or invoke authorized native file commands. Content security policy restricts connections and external assets. This is not a blanket network-isolation guarantee: an iframe may navigate itself. Untrusted previews should remain small and self-contained. Preview source is limited to 256 KiB. A running preview retains its state during ordinary chat polling; reopening the conversation resets it. Older native clients must update before interactive previews can run.

Bots must create the actual file in their workspace and call share_file. The resulting card is a downloadable snapshot, with filename and size, rather than a made-up local path link. Text/Markdown, images, HTML and JSX can be previewed where supported. DOCX and PDF are delivered as downloads, without an embedded Office editor. Files are capped at 8 MiB.

In the updated desktop app, Download saves to the user's Downloads directory using a sanitized collision-safe filename. Show in folder reveals that exact downloaded file. Its receipt is scoped to the active server and account session. Web browsers use their usual download behavior. An Open in Google Drive link appears only when the bot supplies a supported, valid Google Drive/Docs/Sheets/Slides URL for a real linked file; file creation does not silently upload to Drive.

For a report based on Drive material, the shared instructions require actual authorized source reads, source and structure fidelity, appropriate document libraries, rendering checks and honest verification claims. The guest image now includes python-docx, LibreOffice and PDF tools. Model output still needs review: inexpensive models in the live QA pass lost sections or missed page-count requirements before revision. Successful export is not proof of a faithful or client-ready report.

For browser verification or sign-in, the bot should observe the current screen, request a human subtask and wait for control to return. Runtime gates require a fresh screenshot after browser actions before handoff, and after a human step before a Codex conclusion. Skipping a step must not imply success. Screenshots prove an observation was supplied, not that a model interpreted it correctly. The live synthetic signup test exposed inaccurate screen interpretation by Luna low; no real CAPTCHA was solved and no real account was created.
