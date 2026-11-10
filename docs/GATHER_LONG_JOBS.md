# Gather long-job presentation

Approved design for the next release after 0.90.1. This source includes the pending fourth-update grouping fix; ship both together in matching desktop and server packages. Published releases are immutable.

| Before | After | Why |
| --- | --- | --- |
| One-line activity disclosure | Rounded two-line header with subtle stacked edges and the latest owned activity | Distinguish sustained work from ordinary replies |
| Plain grouped narration | Small rounded update bubbles under the deck | Preserve the selected Gather design |
| Updates fade near their former position | At most three inert text overlays converge into the header over 280–320ms | Explain grouping without animating transcript layout |
| Touch Stop always visible | Hover or keyboard focus reveals Stop; touch reveals it when expanded | Keep the resting header quiet without removing access |

The first three owned commentary updates stay inline; the fourth gathers them. Explicit staged plans and substantial recorded work retain their existing earlier promotion. Brief activity remains unchanged. Current tool state, pending human action and connection state take priority over the latest-update fallback. Final answers, approvals, pending questions and live artifact previews remain outside collapsed history.

Completed jobs show a static grayscale avatar and a subdued Finished/Stopped/Failed status. The existing cancellation endpoint and task identity are unchanged. Keyboard focus remains accessible; a pointer click alone does not keep Stop visible after leaving the header. Reduced motion skips gathering; history reloads do not replay it. Rich previews retain their iframe/video state and are never cloned into animation overlays.

## Verification and release acceptance

Run `tools/frontend/test-gather-design.cjs`, `test-progress-gather.cjs`, `test-progress-gather-rich.cjs`, `test-brief-progress.cjs`, `test-task-commentary-blocks.cjs` and `test-progress-completion-scheduling.cjs` in Chromium and WebKit. The new design suite covers light/dark desktop, 390px/320px touch, long titles, hover/keyboard/touch Stop, fast toggles, real cancellation dispatch, completed state and draft retention.

Shared UI must match byte for byte. The two ComposerUIKitTests app.js/progress.css fingerprints are updated. Browser checks are not native-platform acceptance: run the matching macOS/Windows validation and iPhone/Duo composer/history checks on the final combined release source. Preserve bundle identity, accounts and signing. No production data migration or new backend logic is introduced by this design patch.
