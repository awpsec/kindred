# Stable message layout during iOS Back

The Duo cover clearance code measured translated screen rectangles against the
stationary native toolbar. During an edge swipe, a clearance refresh therefore
treated navigation movement as less room for messages. That rewrapped bubbles
and moved the reading anchor even though the viewport had not changed.

The bundled iOS presentation now subtracts each pane's navigation translation
when calculating reading clearance. This applies during finger tracking and the
completion/cancellation animation, including the incoming list. Actual viewport,
fold and inner-display pane widths remain live; no fixed device width is stored.
The shared server UI and desktop layout are unchanged.

`tools/frontend/test-ios-edge-message-layout.cjs` reproduces the old failure
(scroll offset changed from 7054 to 7486 after a 12% swipe). It checks actual
bubble dimensions, text range line boxes, reading position and retained draft
through forward/reversed tracking, cancellation, completion and reduced motion.
It passes with the correction. Existing message-clearance motion and edge
compatibility tests also pass in WebKit, including older server navigation.
The new test also returns to the retained chat, unfolds during another swipe,
and verifies that the old gesture is rejected while real chat width changes.

The broader `test-ios-duo.cjs` suite stops at line 520's remote-pointer assertion
with two button-up/movement records. The same assertion fails when loading the
unchanged 0.90.6 native bundle (`25094e5`), so this is not introduced by the
clearance correction. Do not describe that broader suite as passed. Its earlier
inner-display pane-resizing checks completed before the failure.

Native Mac/Duo acceptance is still required: slowly drag and reverse the left
edge, cancel it, then complete it with long bot/user messages in view. Check
closed/front posture and ordinary phone layout, then unfold and resize an inner
pane to confirm real layout changes still reflow correctly. Preserve the draft
and reading position when returning. This source is for the next update; it does
not replace published 0.90.6 or deploy a backend.
