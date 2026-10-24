# Native Liquid Glass chrome — October 23, 2026

The iOS 26+ companion uses `UIButton.Configuration.glass()` for the bot
nametag, Latest messages, ordinary-iPhone sidebar/header actions, and artifact
navigation buttons. The Duo's system toolbar already uses native materials.
Message bubbles, chat-list rows, form fields and the retained composer remain
content/editor surfaces. Composite group avatars retain the web renderer and
its existing translucent treatment rather than substituting one participant.
Older iOS hosts retain the existing WebKit fallback.

This follows Apple's distinction between navigation chrome and content:
[Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass)
and [UIKit's new design](https://developer.apple.com/videos/play/wwdc2025/284/).

The page publishes only a bounded list of known chrome identifiers, labels,
artwork and measured rectangles through the existing exact-origin, main-frame
bridge. Native controls forward activation to retained page closures. Per-page
UUIDs and geometry sequence acknowledgements reject stale actions/acks. Web
ink is hidden only after native acceptance, preserving layout and avoiding a
duplicate accessibility target. Native chrome resets on navigation and teardown.

The transparent host passes all other touches to WebKit. Small pills retain
44-point minimum touch targets. Native glass follows finite web morphs frame by
frame, including the temporary inert identity bridge, without introducing a
second position animation. The avatar stays 30 points while the name clips and
fades. Native chrome is excluded from the right-toolbar measurement so it cannot
create its own clearance feedback loop. Dialogs hide these controls; dismissal
restores them. The session retains the host across display changes and handles
measurements arriving before the host receives its real bounds.

System Liquid Glass supplies appearance, touch response and accessibility
material changes. Native labels use the measured web font size, preserving the
existing system/app text-size policy. Appearance changes do not rebuild the
page or editor. No shared desktop/server UI files changed.

Checks:

- `test-ios-glass-controls.cjs`: native/fallback capability, avatar identity,
  retained actions, stale actions/acks, intermediate identity morph frames,
  dialog coverage, retained draft and ordinary-iPhone sidebar buttons.
- `NativeGlassControlsTests`: bounded bridge data, retained control identity and
  action routing, transparent hit testing, reset and pre-attachment geometry.
- Existing `test-ios-duo-motion.cjs` and `test-ios-duo.cjs` regression suites.
- Native Duo inspection confirms the glass nametag, its Details action, rotation
  into the portrait toolbar, closing the phone and returning to the open chat.

The simulator uses the local sample-chat preview. Device installation remains a
separate action; this change does not update the physical Duo automatically.
