# Workflow imports and UI polish — 2026-09-15

Source changes for kindred-server and kindred-desktop, unreleased after 0.48.37.

## Behavior

- Workspace conversion, origin sync, individual skill creation/import and the complete shared catalogue support 256 workflows. Existing entries can be refreshed at the cap. New imports retain all entries through discovery, review and atomic apply.
- Browser and native discovery cover Claude Code, Codex, Pi and portable command/prompt/skill layouts, with AGENTS.md, CLAUDE.md, SYSTEM.md, APPEND_SYSTEM.md and supported memories. Large source workflow entries up to 256 KiB can be read in pages for conversion to the saved 48,000-byte workflow limit.
- Any bot can import or refresh linked workflows independently of its own provider or whether it has a workspace origin. Origin sync retains its exact device/path and merges existing Kindred edits. Source-specific argument conventions are preserved as instruction data.
- Pointer clicks no longer leave focus outlines on buttons or whole dialogs. Keyboard navigation retains a visible focus ring.
- Markdown tables keep short numeric cells intact and contain wide content within horizontal scrolling. Whisper download status and progress have balanced spacing inside the settings pane.
- The main + menu contains New bot and New chat. Full workspace import is in Settings → Skills; Open bot leaves Settings and displays the selected conversation.
- Inbox setup lives under Add routine → Monitor activity. Available provider connections are filtered by assigned bot, with neutral setup labels. Direct Kindred Gmail works independently of the bot's AI provider. Provider-backed scheduled reviews continue to use supported backend capabilities; this change does not add a new Codex Gmail execution integration or invent unavailable connections.

## Validation

- Server: 314 Rust tests passed, including 256-workflow import/catalogue/origin sync, rejection of a 257th entry, cross-harness refresh without a bot origin, and retaining large source skills. The suite includes installed Pi SDK fixture execution.
- Desktop: 25 Rust tests passed. A final focused run of both workspace scanner tests passed after adding Pi memory-folder parity and formatting.
- Chromium and Linux WebKit: 24 table/layout cases total across widths 390/800/1320, 100/150% text and dark/light themes. Focus modality, Whisper spacing, menu placement, 256-workflow browser discovery and provider-aware inbox entry passed.
- Workspace import UI: 48 review layouts total across Chromium/WebKit, including folder and paired-desktop import, review edits, stale-write conflicts, history, origin sync, interrupted preparation, discard/retry and opening the bot from Settings.
- Linux WebKit regressions: skill import, inbox monitors, feedback/artifact library, Codex connector preferences and Claude/Kindred connector preferences passed. These cover shared catalogue, slash receipts, inbox creation, provider account binding, mobile layouts, permissions and failure recovery.
- Rust formatting, JavaScript syntax, Git whitespace checks and equality of changed shared desktop/server files passed.

Browser tests use isolated API/native-IPC fixtures; no live provider calls, mailbox changes, Docker setup or VM creation were needed. Actual KDE installed-app and native Windows/macOS acceptance remain separate checks before release. No packages, GitHub Actions runs, release tags, release assets or production-server deployments are part of this implementation.

## Evidence

Logs: /opt/kindred/testing/workflow-polish-*.log
Browser screenshots: /opt/kindred/kindred-server/test-results/workflow-polish/
Workspace import screenshots/results: /opt/kindred/testing/workspace-import/
Automated browser result summary: results.json beside this report.
