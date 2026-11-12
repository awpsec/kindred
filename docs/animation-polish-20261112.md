# Desktop animation polish — 2026-11-12

Source work following 0.90.2. This is not a release, installation, or native-device acceptance receipt.

## Findings

| Before | After | Why |
| --- | --- | --- |
| Opening Details/Computer forced the floating identity to `left:16px`. | The identity stays centered in the available chat header; narrow overlay layouts exclude the obscured area. | The bot's identity stays with the conversation. |
| Clicking the identity always opened Details. | A second desktop click closes the active bot-center pane, including Library/Computer, using its existing close action. | One predictable toggle; native mobile navigation is retained. |
| Pane reservation/sidebar widths and computer dimensions animated for 320 ms, with a computer refit every animation frame. | Final layout is reserved once. The pane, header, transcript and composer translate over 240 ms; the empty composer background scales. | Stops repeated transcript wrapping, editor refitting and remote-screen refitting during the transition. |
| Moving the entire composer could still jump its edge controls when the draft rewrapped. | Each live control retains its starting position and translates to its final position. The bottom remains anchored. | Text and the caret are never scaled; controls move with the surface. |
| Desktop reply expansion animated the live form height. | Reply expansion scales the background and translates the editor/controls; reversal captures the current painted height. | Avoids propagating a height change through transcript clearance every frame. Native mobile retains its previous transition. |
| Composer input repeated unchanged empty-state/height writes, and clearance could repeat unchanged scroll restoration. | No-op writes and clearance changes are skipped. | Reduces avoidable work on the typing path. |
| Keyboard separator steps animated layout width. | Steps settle immediately; direct pointer resizing still follows the pointer. | Frequent keyboard actions do not start a second layout animation. |
| Several older regressions targeted hidden sidebar buttons, retired avatar internals, or the previous sticky-expanded composer policy. | Tests use current bot-center/account menus and current compact refitting. Avatar lifecycle/cadence checks use the dedicated current-renderer suites. | Tests exercise supported user flows and current implementations. |

## Motion review

**Performance:** Pane and desktop reply effects use transform/opacity; the editable text and remote screen are not scaled. The existing small, absolutely positioned name-tag status shell retains its isolated width/height transition so text does not stretch. It does not reserve transcript space. Gather and the existing hover/focus interrupt controls are preserved.

**Interruptibility and accessibility:** Pane and reply reversals capture their current visual state. System/app reduced motion, backgrounding, cancellation and fallback settlement remain covered. Native iOS uses its separate geometry/transition path.

**Verdict: Approve the source changes**, subject to the recorded regression results. Physical Linux compositor performance and native macOS/Windows/iOS acceptance are separate checks, not implied by browser platform mocks.

## Verification

Primary browser suites: `test-nametag-pane-position.cjs`, `test-pane-layout-motion.cjs`, `test-pane-chat-anchor.cjs`, `test-pane-window-fit.cjs`, `test-compact-composer.cjs`, `test-composer-input-work.cjs`, `test-composer-paint-motion.cjs`, `test-motion-polish.cjs`, `test-avatar-runtime.cjs`, `test-avatar-scale-cadence.cjs`.

The pane checks cover final geometry, intermediate motion, controls in a wrapped draft, reversal, pane switching, expansion/collapse, reduced motion and cleanup. Name-tag checks cover narrow laptop layouts, long labels, hover, tab switching and toggle-close. Scroll tests cover latest-message following, reading anchors and deliberate user scrolling during a transition.

A 150-message WebKit typing fixture preserves the full draft, caret and scroll position through repeated wrapping. It did not reproduce the reported 0.5–1-second Linux stall. Before/after frame timing varied with workload; do not infer a universal speedup or claim the laptop freeze is definitively fixed from this recording. Pane code and effect-frame checks establish the removal of per-frame layout animation.

Final logs, screenshots and the exact source/parity receipt are recorded with this task's test artifacts. No version, published asset, update feed, backend or installed application was changed.

The older `test-pane-resizing.cjs` suite still assumes the retired sidebar-search expansion and old sidebar controls. It is recorded as stale, not counted as a pass. Its source is left unchanged. Current viewport fitting covers saved sizes, minimum chat width, canceled drags and keyboard separator steps; pane motion and anchoring have separate current coverage.
