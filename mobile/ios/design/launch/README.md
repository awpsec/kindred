# Approved iOS launch: wake up and dissolve

Owner approved this version on October 3, 2026. This folder is the handoff to the
Mac/Xcode implementation thread. The animation is implemented natively in
`KindredCompanion/Views/KindredLaunchView.swift` above the existing root content.
It is iOS-only. Do not add it to desktop or Android.

- [Dark preview](dark.gif)
- [Light preview](light.gif)
- [Deterministic animation reference](preview.html)

Serve the repository root and open `mobile/ios/design/launch/preview.html` at
390×844. Choose `?theme=light` or `?theme=dark`. For frame capture add `&paused=1`,
await `window.previewReady`, then call `window.renderAt(ms)`. The 3.6-second GIF
includes a final viewing pause; the real animation finishes in about 1.85 seconds.
The fonts load from the repository's existing `ui/fonts` directory.

## Approved motion

The orange Kindred mark appears on the plain theme background, blinks, makes a
small curious head tilt, then lifts and shrinks slightly while dissolving. The
controls and chats fade/settle in as it disappears. The pill eyes remain the
current bot shape. The exact curves, eye geometry and transforms are in
`renderAt` in the reference HTML.

| Time | Motion |
| --- | --- |
| 0–170 ms | Mark appears on the theme canvas. |
| 260–400 ms | One blink. |
| 400–770 ms | Curious gaze/head tilt; eyes open slightly. |
| 730–900 ms | Very slight anticipation squash. |
| 830–1480 ms | Mark rises from 45.5% to 29% of the screen height and shrinks. |
| 950–1340 ms | Mark dissolves completely. |
| 1170–1840 ms | UI fades/settles in; reference rows overlap with 28 ms offsets. |

There is **no logo or wordmark left in the header**, no reserved brand space, no
eye flood, no glow, no backdrop tint, no additional loading copy and no blank
screen hold. Preserve the current mobile navigation and controls. The reference
chat list is illustrative; do not replace the shipping layout with this mockup.

## Native integration handoff

Implement as a first app-rendered SwiftUI layer above the existing root/content,
using the current native startup implementation as the integration point. Keep
the static launch screen unchanged. Use the updated mark from
`mobile/ios/tools/kindred-mark.svg` with separately animatable pill eyes; do not
embed the eyes twice in the body image.

- Run once on a fresh app launch. Do not replay on scene activation, background
  return, account/profile switching, navigation, web reload or reconnect.
- Keep the real screen underneath. Do not reserve layout space for the mascot,
  move navigation buttons or inject a permanent logo.
- Start app initialization concurrently. Coordinate the reveal with existing
  content readiness. Never hold an indefinite splash waiting for a server,
  hide a sign-in/error state, or restart the animation when the web view loads.
- Remove the overlay and any animation work after completion. It should not
  capture touches after it disappears.
- With Reduce Motion, skip blink/tilt/travel and use a brief opacity transition.
- Adapt positioning to available bounds and safe areas. Preserve existing
  landscape, iPad and changing-window-width behavior without assuming a
  specific future device's dimensions.
- Keep preview timing deterministic during implementation. Match the accepted
  GIF first; do not substitute an earlier eye-expansion/header-logo design.

## Mac acceptance

Build and run in the iPhone simulator with both themes and Reduce Motion. Check
cold launch, warm return, signed-out startup, unavailable server, account switch,
and an already-loaded/fast startup. Check that the final UI and touch handling
are exactly the existing app's, with no retained logo or animation layer. Native
build/simulator validation was completed during native integration: light/dark
cold launches, Reduce Motion, signed-out startup, signed-in chat and background
return without replay. Native tests cover readiness bounds and account switching;
physical-device checks remain outstanding. See the main iOS README for details.

Keep work in the existing `awpsec/kindred` repository under `mobile/ios`. If the
Mac thread has uncommitted work, commit it on its working branch before fetching
and integrating this handoff; preserve its signing configuration and local work.
