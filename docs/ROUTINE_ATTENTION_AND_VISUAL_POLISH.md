# Routine attention and desktop polish — 2026-09-23

Connector receipts remain in chat history and expandable call groups, but no longer contribute to the unread cursor, first-unread anchor, or latest-message read anchor. Existing connector-only history becomes read without a database rewrite. Real replies still advance unread state. Read receipts issued by older clients can still be acknowledged. Approval notifications use the separate notification path and are unchanged.

The routine editor offers **Every day** with a local time and named time zone. This saves the existing wall-clock schedule format with all seven days and matching start/end times, retaining daylight-saving semantics. Existing interval, selected-day, and one-time routines retain their mode. Routine settings rows use a larger assignee avatar (name on hover/focus), a flexible content column, and right-side controls. At narrow widths controls wrap below the content.

Claude Code Opus 5.5 consulted and implemented the group picture and computer visual pass: bounded member tiles, a dark neutral guest wallpaper with soft Kindred colours, matching Browser/Files/Terminal icons, live-screen reveal and closing-frame transitions, and keyboard-control focus treatment. Previously approved character geometry remains unchanged.

## Verification

- Four backend attention tests passed, including repeated connector-only receipts, real replies, old-client receipt compatibility, persistence and authenticated routes.
- Three existing wall-clock schedule tests passed, including weekday/time-zone preservation, DST transitions, and invalid input.
- New test-routine-daily-settings.cjs passes in Chromium and WebKit: create/edit AM and PM times, preserve timezone, and no overlapping controls at 1280/640/390px.
- New test-connector-unread.cjs passes in Chromium and WebKit: quiet calls are visible without a dot, then a real reply has a dot and the New divider belongs to that reply.
- Existing bot-detail routine editing, pause/resume, monitor deletion guards and responsive layout passed in Chromium.
- Real isolated Linux desktop check used Xvfb, Openbox, feh, librsvg and tint2. All SVG assets rendered, launcher icons loaded, dock background ID 1 selected, and _NET_WM_STRUT_PARTIAL confirmed a 56px bottom reservation. Temporary X processes were closed; production VMs and bot sessions were not touched.
- Computer reveal/closing-frame and reduced-motion checks passed in Chromium and WebKit. Group tiles, shared-chat activity, control handoff and desktop recovery checks passed. Motion checks passed Windows/Linux/macOS browser fixtures, including the compact Mac header clearance fix.
- Connector stacks ignore legacy receipt-only read boundaries, preserving a single expandable group without a false New divider.
- Broad test-desktop-polish.cjs WebKit regression remains failing its collected page-error assertion with local API access-control errors around context teardown, despite reaching the final assertion. This is not counted as a passing suite; focused WebKit tests above passed.
- Native macOS and Windows app runs are separate from browser-engine/fixture checks; no native package or release was published.

Previews and detailed logs: /opt/kindred/testing/visual-routines-polish/ and /opt/kindred/testing/opus-visual-polish/. Guest assets are delivered through the existing guest installer/update process; editing the source does not modify already-running desktops.
