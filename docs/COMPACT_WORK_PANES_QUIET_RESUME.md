# Compact working panes and quiet foreground recovery

Status: approved source changes; no release, deployment or phone install.

## Working panes

Desktop Library and Computer use a compact identity row with the existing settings
and close controls, followed by the familiar tabs. Details retains the full avatar
and role. The existing computer session and detail form stay mounted across tabs.

Library rows show filename and kind/size with separate preview/download controls.
Chat file cards and grouped files use flatter styling. Preview-unavailable types
keep their existing filename/download action. Native file downloads use the shared
progress/receipt implementation: Library and chat share transfers and device-local
saved-file state; uploads/screenshots cannot borrow a deliverable receipt. Preview
continues through Beside chat, retaining draft and reading position.

Compact pane and file styling excludes the native mobile bridge. Phone layout is
unchanged by this desktop polish.

## Foreground recovery

Previously, 15 seconds without an activity snapshot immediately produced
“Connection lost,” including time the application spent suspended in the background.
Visibility/page lifecycle transitions now start one 10-second recovery window.
During recovery, retain the last activity caption quietly; do not manufacture a new
snapshot timestamp or advance stale step timers. A fresh accepted snapshot ends
recovery immediately. Focus/online events do not extend the window. If the activity
is still stale after recovery, show the normal connection warning again.

Only automatic refresh reads suppress transient network/5xx errors during this
window (or while hidden). Authentication/permission failures and user writes retain
their existing error handling. An uninterrupted foreground outage still uses the
existing 15-second stale threshold. BFCache restoration uses the same quiet read path.

Suspending during initial conversation loading also previously latched a failed
conversation. Page-leave/foreground-replacement cancellation now leaves the opening
recoverable; the next foreground read can finish without a manual Retry.

## Validation

Passed in Chromium and WebKit:

- Quiet resume: background/foreground, bounded grace, repeated foreground signals,
  normal outage, stale timer/snapshot preservation, transient versus auth failures,
  successful recovery and draft retention.
- Foreground refresh: immediate/coalesced refresh, replacement of suspended reads,
  preservation of an already dispatched write and draft.
- Full bot-center integration: working tabs, avatar palette, settings/routines,
  file opening, responsive bounds and one retained RFB connection.
- File-download feedback: progress, retries, native receipts, account/device isolation,
  iOS transport, original bytes, deleted local files and reduced motion.
- Library download adapter: shared chat/Library transfer and receipt; upload isolation.
- Beside chat document review: 17 checks per engine including draft, scroll anchor,
  bottom follow, retained renderer and unchanged mobile behavior.

The delayed-startup/pagehide/pageshow WebKit regression also passed. Its obsolete
media selector was updated to the current accessible image button.

Additional Chromium bot-center checks validate compact header height, row metadata,
explicit preview, keyboard tabs, paging/deduplication and retained forms/canvas.
The desktop checkout's iOS browser-adapter suite passed for current and legacy installed
adapters, including navigation, draft and landscape behavior.

Physical iPhone/Duo app-switch acceptance and native package verification remain
pending. Browser checks do not establish hardware installation or native acceptance.

The desktop navigation lifecycle fixture now waits for the current bot nametag
instead of the retired standalone Computer button. Its workspace-change case starts
on pointerdown so both engines actually exercise a pending recovery wait.
