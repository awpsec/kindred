# In-chat activity and answer handoff — 2026-11-12

This candidate extends the pane/composer polish on `fix/animation-polish-20261112`.
Include both commits in the next approved release. Do not replace published 0.90.2.

## Behavior

- Direct-message activity has a retained 32px slot. Fresh same-run reasoning uses dots; tool work uses the bot avatar with a concise status. Ordinary refreshes preserve the row, slot, avatar, label and stop button.
- Status candidates settle for 220ms before changing. A return to the visible status cancels the candidate. Writing keeps the last meaningful status until the answer arrives; it does not introduce a speculative Typing label. Approvals, cancellation, queues, retries and lost/stale connection states bypass the settling delay.
- The completed-run feed can precede the final message page. Keep the existing activity until the written reply is actually present, then replace it in the same render. The answer enters immediately with the existing short rise. Remove the former 1.97-second avatar departure and height collapse. Silent completions, failures and cancellations never wait for a nonexistent answer. A new run from the same bot supersedes an undelivered old worker without creating duplicates.
- Gather remains the sole activity owner after promotion. Its header receives the same settled status treatment. Finishing or switching the owning run cancels pending text changes; a delayed callback cannot restore a live label. No threshold or promotion policy changes.
- The stop control keeps existing hover/focus access, including the existing touch policy. Drafts and transcript anchors remain owned by the existing composer/scroll systems.
- Reduced motion removes the pulse and visual transitions, while retaining status filtering. Hidden-page dots pause. Only transform and opacity animate in the new activity treatment.

## Motion timeline

| Element | Role | Starts | Duration | Motion | Relationship |
| --- | --- | --- | --- | --- | --- |
| Avatar / dots | Lead | When a settled semantic phase changes | 180ms | Crossfade and small scale | Both layers together in one fixed slot |
| Changed status text | Support | Same settled update | 140ms | Opacity .55 to 1 | Overlaps the slot change; never fully disappears |
| Answer | Lead | The reply exists in the reconciled transcript | 240ms | Existing 12px rise, no fade | Activity is removed in that render; no exit gate |
| Gather | Lead | Existing promotion rules qualify the task | Existing Gather timing | Existing inert note overlays converge | Takes over activity once; no additional row entrance |

The slot's dimensions do not animate. The composer and draft do not move in response to status text. Timers do not animate and are hidden in this compact direct-chat row. Gather's existing disclosure and stop-button behavior remain intact.

## Review

| Before | After | Why |
| --- | --- | --- |
| Rebuilt worker wrapper and label children on refresh | Retained worker/slot/label and updated text | Preserve avatar and dot continuity |
| Every provider label immediately visible | Settled semantic labels; writing holds the previous status | Avoid short speculative labels flashing |
| Avatar linger followed by transcript height collapse | Atomic activity-to-answer handoff with immediate answer entrance | No empty interval or delayed second layout change |
| Header text could be patched while updates were pending | Run-bound updates cancelled on terminal/owner changes | Prevent finished tasks becoming visually active again |

Review verdict: ready for source integration. Eight browser suites pass in both Chromium and WebKit (16 runs), including desktop and narrow layouts. Visual review must inspect the avatar/dot crossfade and the fourth note gathering. Browser checks do not establish native desktop or physical Duo performance.

## Validation and release boundary

Evidence: `/opt/kindred/testing/in-chat-work-20261112/VERIFICATION.json` and `final/results.json`.

The focused suite covers stable element identity, transient-label observation, immediate approvals, delayed final-message delivery sampled each frame, intentional silence/failure/cancellation, Gather ownership and completion, narrow layout, drafts, and both reduced-motion controls. Existing suites cover Gather rich iframe/video identity, disclosure completion scheduling, task ownership/continuation/cancellation, group-chat delivery and transcript selection/scroll continuity.

Recordings use synthetic local fixtures, not production conversations. Native Windows/macOS package checks and physical iOS/Duo acceptance are still required by the release workflow. No packages, tags, feeds or deployments are changed by this source integration.
