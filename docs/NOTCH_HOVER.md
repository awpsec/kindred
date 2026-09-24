# Notch notification hover — 2026-09-20

Hover scales the black notification silhouette by 2.5% from its top center over 160 ms. The ordinary three-second dismissal pauses while hovered; leaving starts a fresh three seconds. Hovering during automatic collapse cancels that dismissal. Clicking still opens the conversation and Escape dismisses explicitly. Reduced motion removes the scale transition.

The native window gains 16 points of transparent horizontal room while the resting silhouette retains its original width. Hover renews the native four-second fallback deadline every second through ID-bound `hold` actions; `release` restarts that deadline on exit. A stalled/crashed renderer therefore cannot pin the notification forever. Foreground suppression, test-notification exceptions and account generation checks remain in force.

Chromium and WebKit regressions passed. The browser fixture exercises actual pointer hover beyond 4.5 seconds, magnification, unclipped bounds, fallback lease renewals, leaving and expiry, click-through, reduced motion and existing rendering/settings behavior with mocked native IPC. Native macOS compilation and on-device acceptance remain outstanding. This includes native Rust changes and requires a matching macOS package; a UI-only repack of an older native binary is insufficient.
