# Motion polish audit — September 23, 2026

Implemented with Claude Code on build-host using `claude-opus-5-5`, followed
by a supervising code review and independent production-header tests.

This pass reviewed every animated surface in the shared UI (`ui/`). Most
effects already followed the contract in `UI_MOTION.md`: finite effects settle
on completion, cancellation, backgrounding, blur and reduced motion, and
reversals start from the current visual state. The changes below address one
recurring problem: routine re-renders that restart, flash or drop state. They
also bring the few surfaces outside that contract into it. No layout, theme,
copy, bot routing or archive geometry changed.

## Timing families

The UI uses a small set of timings. This pass kept them and moved outliers onto
them rather than introducing new ones.

| Family | Timing | Surfaces |
| --- | --- | --- |
| Menus and popovers | 140–160 ms ease-out, opacity (menus above the composer also rise 4 px) | composer, slash/mention, message actions, accounts, themed selects, new/identity menus; now also chat context menus, screen picker, file actions, artifact add/context menus |
| Dialogs, toasts | 180–200 ms, 4–6 px rise | all dialogs; dismissal stays synchronous |
| Panes and moving layout | 220–240 ms `cubic-bezier(.2,.8,.2,1)` | details/computer panes, Settings content, connector formation, group strip, sidebar rows, artifact cards; now also the artifact library overlay (was `.2s ease`) |
| Ceremonial | 320 ms – 2.3 s | composer reply morph, computer expand, worker departure, bot archive |
| Status loops | 1.2 s pulse, 0.16 s stagger | working dots (sidebar, group, connector, retry, download) — previously 1.2/1.3 s and 0.15/0.16 s |

## Reviewed and kept unchanged

- Panes (`showPane`/`hidePane`), Settings content, computer expand/collapse:
  interruptible, inert while closing, focus returned, settled by blur/preference.
- Composer reply morph and multiline growth: grows over messages, no blur,
  ghost cleanup, reversal.
- Connector receipts: third-call formation, newest-row rollover, burst
  settlement, disclosure cards, keyboard interruption.
- DM worker departure, reply arrival fades, unfocused arrivals.
- Bot archive coffin morph and 3D lid/walls (geometry and timing untouched). It
  is still not tied to blur/preference changes mid-sequence; it already skips
  when motion is reduced or the page is hidden at the start.
- Character scheduler (visibility observer, hidden-page pause), tribute reveals.
- Dialog entrance, toast, jump-to-latest pill, unread divider fade, download
  confirmation, press feedback, avatar popover, computer preview hover.
- Loading: busy spinner, marketplace skeleton, “Loading preview…” text.
- Artifact library pin/reveal control. The pinned-pane fix and the isolated
  artifact response policy are untouched.
- CSS: `:root[data-motion="off"]` and `prefers-reduced-motion` already disable
  every CSS animation and transition globally. Script (WAAPI) effects are
  checked separately below.

## Changed

**Status loops keep their phase.** Routine renders recreate working dots and
the working glimmer. The sidebar alone rebuilds on every streamed output
change, so its dots restarted mid-pulse every few seconds. `continueLoops()`
pins these CSS animations to the document clock after reconciliation and
sidebar rebuilds, so a recreated indicator continues the same pulse.

**Sidebar rebuilds keep focus and move rows smoothly.** A rebuild previously
dropped keyboard focus to `<body>` and snapped reordered rows. The focused
control is now restored for keyboard focus (so pinned-tile previews do not
reappear after a click). Rows that shift a short distance glide from their
previous position. A conversation rising several rows settles in place with a
short fade instead of sweeping across the list. A rebuild during a glide starts
from the current positions. Search filtering and the first render do not
animate. A dropped pinned tile's neighbours glide too. Group-conversation
avatars in the sidebar and header are cached like DM avatars, so their live pose
does not restart on each rebuild.

**Group working strip.** Every change used to fade all labels, timers and dots
from zero and replace every avatar. Now unchanged rows stay steady, avatar
nodes are reused, and only new or reworded entries fade (the ticking timer is
not a change). Its motion joins the shared settle contract.

**Artifact cards.**
- Opening, loading, preview and collapse resize from the card's current height.
  A quick reopen continues from where the collapse was.
- These resize effects honor both preferences at the start. They also settle
  immediately on blur, backgrounding, either preference changing, disposal, or
  a dropped finish event. They have no fill, so settling cannot leave a stale
  height. Previously collapse ignored `data-motion=off`.
- A live revision sync used to replace the preview with “Loading preview…”,
  shrinking the card and regrowing it. The previous preview now stays in place
  until the new one is ready. Its messages are no longer read, so it is made
  inert and cannot accept edits that would be silently dropped. After 300 ms,
  a still-pending refresh dims the retained preview. Replacing stage content
  clears the stale frame-dirty flag, which could otherwise suspend live polling.
- Iframe loading, sandbox and response policy are unchanged.

**Chat loading.** Opening an uncached conversation showed the loading character
at once, which flashed on fast loads. It now fades in after 160 ms; errors still
appear immediately.

**Decision receipts.** The disclosure did not settle if the webview cancelled
the effect or dropped its finish event, and ignored live preference changes. It
now settles on cancellation, blur, backgrounding, preference changes or a
bounded fallback, and does not start new effects while unfocused.

**Menus.** Five menus appeared without the shared 140 ms fade that every other
menu uses; they now match. None is re-created while open, so the fade does not
replay during polling.

## Validation

`tools/frontend/test-render-motion-continuity.cjs` covers:
- loop phase across a rebuild
- keyboard focus through a reorder
- glide start positions, mid-glide reversal, settling and blur
- both reduced-motion controls
- group strip fades, avatar identity and rapid updates
- artifact reopen continuity and sync without a loading flash
- a stalled refresh: the old preview stays inert and dimmed, then is replaced
- artifact resize settling on app-preference change, blur and a stalled effect
- delayed loading reveal
- receipt settling on cancel, stall, blur and unfocused starts

It opens on synthetic chat history (no missing-fixture notices). An earlier
version of the suite, run against the unmodified sources, failed on loop phase,
focus, glides, the group strip, artifact `data-motion=off`, the loading reveal
and receipt settling. The later stalled-refresh and live-settle sections were
not run against the old sources.

Run serially on this host (headless Playwright, Linux), Chromium and WebKit:

- New suite (final version): passed in Chromium and in two consecutive WebKit runs.
- Passed in both: workspace artifacts, artifact studio, artifact policy,
  artifact collaboration, artifacts, decision receipts, pinned order, quiet
  sidebar routing, chat drop/bot section, group activity, assigned group
  activity, connector stack formation, connector disclosure motion, unfocused
  message motion, UI consistency.
- Chat opening: passed in WebKit; its Chromium case hard-codes Edge, which is
  not installed. A temporary copy using bundled Chromium passed.
- Unread opening: Chromium passed. WebKit failed once (the unread divider
  detached during a chat re-render, outside the code changed here), then passed
  twice.
- Motion polish: Windows and Linux platform cases passed in both engines. Both
  stop at the macOS narrow-layout title-bar overlap already recorded in
  `UNFOCUSED_CHAT_MOTION.md`.
- Screen menu (bundled Chromium copy and WebKit): times out finding the group row
  by name. It fails identically on the unmodified sources.
- One earlier artifact-studio run failed waiting for live refresh. That may have
  been the retained-preview dirty-state race fixed above; it was not reproduced.
  The suite passed in both engines after the fix.

## Supervising verification

An independent pass used `KINDRED_TEST_SECURITY_HEADERS=1`. The final continuity
suite passed in Chromium and WebKit, including the added unfocused-receipt guard.
Avatar continuity, archive animation (including restoration/failure handling),
artifact rendering and the current group-presentation suite also passed in both.
The legacy chat-transition suite stops at its outdated group-name locator before
reaching motion assertions; it is not counted as passed.

The composer motion regression passed in Chromium and WebKit after the fixture
corrections below.

The new suite now waits until WebKit has delivered an emulated media preference
before asserting that no effect starts. This fixes an intermittent test-stimulus
race without relaxing the no-animation assertion. The composer regression uses
a stable conversation ID and waits for bounded cleanup after rapid reversal.
Existing desktop-side media-emulation and cleanup-window fixes were preserved
and brought into the server copy. The new continuity suite is included in the
recent-flow runner.

## Limitations

- These are headless browser checks on Linux under host memory pressure. No
  native WebView2, WKWebView or WebKitGTK run was made for this pass, and no
  platform flag emulation substitutes for them. Visual review was limited to
  sampled assertions and screenshots.
- Loop continuity sets `startTime` on CSS animations (current Chromium and
  WebKit). Older webviews without `:focus-visible` restore any sidebar focus.
- Rows removed from the sidebar disappear immediately; archive remains the only
  exit animation. Group strip appearance/disappearance was not changed.
