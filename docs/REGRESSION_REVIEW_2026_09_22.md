# Recent feature regression review — September 22, 2026

## Fix found during testing

Moving an artifact through its context menu while its source editor was open
advanced the stored revision but left the editor on the old revision. Its next
save falsely conflicted with its own metadata change. The editor now advances its
baseline only when it still matches the revision read for the metadata operation,
and carries the chosen folder into its pending source save. A genuinely newer
remote edit still causes a conflict and leaves the human draft intact.

## Browser coverage

40 focused suites passed in WebKit, covering:

- Artifact library, document/HTML/React rendering, fonts, source and shared-state
  editing, autosaved titles, folders, compact chat cards, deep links, reopening,
  sandboxing, mobile layout, and live author badges.
- Two open editors: stale-write rejection, retained drafts, reread/merge, live
  reader refresh, metadata changes during source editing, and remote changes
  arriving before a metadata save. This case also passed in Chromium.
- Native header event routing for Linux, macOS, and Windows; pinned DM/chat drag
  ordering and persistence. These use mocked desktop bridges, not OS window moves.
- Connector stack formation/disclosure, accessibility, receipts, approval edits,
  and preservation of expanded reading state during refresh.
- Group activity and silent routing, command waits, descriptions, notifications,
  handoffs, pins, unread opening, channel links, and mention contrast.
- Account windows, document previews, workflow panels, scheduling decisions,
  completed receipts, floating composers, draft overflow, and archived recovery.
- Clipboard images, native attachment fallback, file drop queues, bot-only chat
  sections, chart inspection, and financial/other visual panels.

Several first-pass timing checks failed while compiler and browser workloads
competed with unrelated resident VMs. Browser checks were rerun serially, with the
compiler paused. The disclosure test now inspects actual animation geometry at
fixed animation times before verifying completion and refresh continuity, rather
than requiring the headless compositor to deliver an intermediate wall-clock frame.

Older test fixtures were updated for channel slugs, collapsed answered questions,
and the server timezone-resolution endpoint. Pinned-order test teardown now waits
for intercepted routes to avoid reporting a closed browser as a feature failure.

## Repeatable check

`tools/frontend/test-recent-flows.py` runs the 40 suites serially against disposable
local fixtures and writes individual logs plus `results.json`. It also accepts a
subset, such as `artifact-studio artifact-collaboration pinned-order`. Set
`KINDRED_PLAYWRIGHT_MODULE` if Playwright is installed outside the checkout.
Timed-out tests have their process group terminated so orphan browsers do not
consume memory during later checks.

## Backend coverage

The artifact stress cases exercise the real tool dispatcher and authenticated
HTTP handlers. They create 128 artifacts across four formats, race 32 HTTP writes
at the same revision, verify one winner, and reject oversized, unauthorized, and
stale writes. Two different bot identities also race through 16 rounds, rereading
and merging after conflicts. All 32 contributions, the human introduction, shared
state, folder, stable URL, and revision history must survive, with one current
artifact card in the originating chat. Other cases cover latest-revision exports,
expiry/reopening, and workspace transfer/isolation.

Full backend result: **426 passed, 0 failed, 0 ignored**. The freshly compiled
Rust test binary was run with four test threads. On this host,
`KINDRED_PI_TEST_NODE=/usr/local/bin/node` is required because Pi clears the child
environment; omitting it in the initial run caused 12 harness-start failures.
Supplying the documented absolute runtime path resolved all 12 without a product
code change. The SDK integration tests use local mock provider endpoints.

## Scope

This review uses local test workspaces, browser automation, direct model-tool
dispatch, and mocked provider/connector responses. It does not claim live model
judgment, real third-party uploads, or native Windows/macOS package validation.
No live workspace content, installed application, or release feed was changed.
