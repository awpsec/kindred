# Progress-note entrances — 2026-11-12

Include this follow-up with the existing pane/composer and in-chat activity changes on `fix/animation-polish-20261112` in the next approved release. It does not change Gather qualification or publish a release.

New, live inline progress notes now enter with an 8px rise and an opacity transition from .45 to 1 over 220ms. Batched notes enter together without stagger or artificial delays. The effect is on the painted message row, so the transcript wrapper used for scroll anchoring does not move or resize.

Only unseen progress notes received during a live sync while following the latest messages qualify. Initial history, history replacement/paging, cached conversation switches, reduced motion, background/unfocused views and reading older messages do not play entrances. Refreshes and text edits do not replay existing notes. Notes already owned by Gather do not get a second entrance when the disclosure opens.

If Gather promotes a note during its entrance, its inert visual copy inherits the current transform and opacity. The source entrance is then finished before hiding or reparenting the original. Removed notes also settle their entrance; finite animations retain the existing lifecycle cleanup and timeout fallback.

## Motion review

| Element | Driver | Properties | Duration |
| --- | --- | --- | --- |
| New inline note's painted row | Web Animations API | transform, opacity | 220ms |
| Transcript wrapper / composer | No new animation | None | — |
| Mid-entrance Gather handoff | Existing Gather animation; captured paint | transform, opacity | Existing Gather duration |

Cause of the abrupt appearance: progress commentary was explicitly excluded from ordinary message entrances and had no separate entrance. This fix adds that separate path without height, margin, layout loops, a permanent GPU layer, or reparenting live media.

## Validation

All five suites passed in Chromium and WebKit (10 runs). Evidence is recorded under `/opt/kindred/testing/progress-arrival-20261112/`.

The focused test exercises actual transcript rendering at 1100px and 390px in Chromium and WebKit: individual and batched arrivals, no replay after refresh/history replacement, draft/caret preservation, stable old-history anchor, bottom following, both reduced-motion settings, and deterministic mid-flight Gather promotion at 70ms. The promotion test verifies the copied transform/opacity and that the source effect is stopped.

Regression suites cover Gather qualification/history, iframe/video preservation, transcript selection/identity, and the prior avatar/dots/answer handoff. The updated synthetic preview delivers the three pre-Gather notes individually, so their entrances can be inspected before the fourth gathers them.

Browser results do not establish frame performance on the user's Linux machine or native iOS/Duo. Native package/device acceptance remains part of the next release workflow. No production data or deployments are changed.
