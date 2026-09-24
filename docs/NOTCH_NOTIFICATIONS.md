# macOS notch notifications

Settings → General → System → **Notch notifications** enables a local, opt-in
notification surface. It replaces Kindred's system banners while enabled. The
existing global and per-bot notification preferences still decide which alerts
are delivered. Custom previews appear during macOS Focus; the setting explains
this difference. They are silent. Notch alerts are suppressed while the Kindred application is active, including its Accounts/settings windows. Focus is rechecked before presentation and on each alert refresh; foreground alerts are discarded, not queued for later. The Settings test also respects this focus rule.

The bundled `notch.html` surface displays the bot's original animated avatar,
name and “sent you a message.” on one line. The entire notification is one button that brings Kindred forward;
it collapses back into the notch automatically after three seconds, including while hovered. There is no close button. Motion follows both the notification's account preference and the live
system Reduce Motion setting.

The native window follows the display containing Kindred, falling back to
`NSScreen.mainScreen` if necessary. Cocoa screen coordinates handle Retina and
monitors with negative or vertically stacked origins. On notched displays,
`safeAreaInsets` and the auxiliary top areas place content below the camera.
Other displays use a small top-center stem and rounded card. Display geometry
is refreshed while an alert is visible, including after docking or unplugging.

The window is transparent, borderless and non-focusable. `orderFrontRegardless`
shows it without making it key or activating Kindred. It joins Spaces and uses
the fullscreen auxiliary collection behavior. Tauri's `macos-private-api`
feature/configuration is needed for macOS webview transparency. This is the
directly distributed desktop app, not an App Store packaging configuration.

The native queue holds at most twelve alerts; overflow uses system banners.
An alert that fails to render within five seconds also falls back to a system
banner. Native expiry prevents a stalled webview from leaving a stuck overlay.
The queue is cleared on sign-out/profile change. Notification commands are
restricted to the bundled alert window; it receives neither API tokens nor
arbitrary navigation destinations. The open action uses the native saved
destination and checks the session generation.

## Verification

`tools/frontend/test-notch-notifications.cjs` exercises the actual bundled UI
in Chromium and WebKit, including avatar animation, long/untrusted previews,
notched and external layouts, open/dismiss, reduced motion, and Settings on all
three platform flags. Rust tests exercise screen placement and trusted URLs.
These tests do not substitute for native Mac testing.

Before releasing, verify an actual Apple Silicon build on macOS:
background delivery while typing in another app, fullscreen Spaces, VoiceOver,
multiple displays, docking/removal, clamshell mode, hover expiry, queue bursts,
profile changes, and system-banner fallback. Linux source validation cannot
establish native macOS focus, stacking, or fullscreen behavior.

References: [Apple screen safe areas](https://developer.apple.com/documentation/appkit/nsscreen/safeareainsets),
[Apple auxiliary top areas](https://developer.apple.com/documentation/AppKit/NSScreen/auxiliaryTopLeftArea-uglc),
[Tauri window configuration](https://v2.tauri.app/reference/config/).

Notch-extension layout: the visible black surface follows the measured hardware notch width plus 24 points on each side. The native window reserves another 8 transparent points on each side and 44 points below the safe-area inset. The bridge and content form one continuous rounded black silhouette, revealed downward from the notch and collapsed back into the notch after three seconds. Content uses a 20-point avatar and a single-line notification; long names truncate without wrapping. Displays without a notch use a 240-point reference width. Browser checks cover both engines and changing notch widths; the geometry test covers notched, external, stacked and narrow displays. Native Mac visual acceptance remains required for this revision.

## Clipped content correction (2026-09-19)

A native Mac report showed the content obscured by the camera area. The alert
now disables native HTML button appearance, uses an explicit height, and places
the avatar/text row absolutely below the camera clearance instead of relying on
button padding. Native geometry also checks auxiliary menu-bar areas even when
`safeAreaInsets.top` is zero; a known camera cutout cannot use the 12px external
monitor layout.

Browser regressions use 240×76 and 304×56 CSS-pixel viewports matching the native
frames, and verify content bounds with 32, 37 and 48-point camera clearances.
Both Chromium and WebKit pass. The native-independent geometry tests run with
`rustc --test desktop/src/notch_geometry.rs` and pass.

These are corrections to identified layout weaknesses, not a confirmed native
Mac acceptance result. The native positioning change requires rebuilding the
Apple Silicon client; resource-only repackaging is insufficient. Before release,
verify the visible content below the physical camera, three-second collapse,
and click-to-open on an actual notched Mac, including the display configuration
from the reported failure. Do not treat a browser mock as proof of native rendering.

## Tuneful motion reference

Reference inspected: Tuneful's official Notifications demo at
https://tuneful.app/ (https://tuneful.app/videos/notifications.mp4), sampled
through its browser video player. The observed treatment widens and deepens a
single black silhouette, with concave top shoulders and rounded lower corners;
content reveals during expansion and withdraws before contraction finishes.
Kindred implements that visual behavior independently, retaining its own avatar,
single-line message, click action and three-second timeout.

The native window remains fixed while an interpolated path changes the visible
silhouette. Opening settles over 440ms with a small overshoot; content enters
90ms later over 230ms. Closing contracts over 300ms, with content withdrawing
in the first 140ms. Interrupted openings close from their current shape. The
collapsed shape is prepared before `present`, avoiding a full-card first frame.
Reduce Motion presents/dismisses immediately. External-display corners are
bounded by the shorter collapsed height.

Browser motion previews are illustrative, not native macOS acceptance. The
previous native-camera clearance rebuild/verification requirement still applies.
