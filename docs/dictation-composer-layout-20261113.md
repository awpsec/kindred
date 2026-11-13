# Dictation composer layout

Native macOS Dictation inserts marked text into WKWebView's contenteditable editor. The desktop resize handler returned for the whole composition, leaving its compact 32px grid row active even when the editor had four lines. The WebKit reproduction measured an 88px editor overflowing a 50px composer.

Allow the compact grid to expand during composition. Keep the marked DOM and selection intact, defer collapsing the grid until commit, and force a fit check when composition ends. The existing IME policy still avoids moving/clipping marked text through a paint animation. Ordinary dictation and typed changes continue using the existing composer/reading-edge animation. Mobile adapter sizing is unchanged.

Verification:
- `test-dictation-composer-layout.cjs`: native-start focus plus simulated composition input in Chromium/WebKit, hard newlines and natural wrapping, long-text scroll cap, controls/chat clearance, marked node/caret retention, correction/commit shrink, and reduced motion. The original source fails the four-line geometry assertion.
- `test-live-dictation.cjs`: local transcription, four-line composer containment, final drain, cancellation, native-start focus and long transcript scrolling in both engines. Updated its obsolete hidden settings-button selector to the current account Settings menu.
- `test-composer-wrap-motion.cjs` and `test-composer-reading-motion.cjs`: both engines; existing surface timing, synchronized chat movement, reversal, gesture cancellation and reduced motion. WebKit animation checks were rerun in isolation after concurrent browser load missed their short animation sampling window.

These are browser/IPC fixtures, not physical Mac microphone acceptance. No release, installation or backend deployment is performed by this source change.
