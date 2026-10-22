# iPhone Duo readiness — 21 October 2026

## What changed

Kindred's native companion retains one WKWebView per account. The web layout
and native host already handled folds. This integration reconciles the newer
shared region policy with the existing UIKit geometry publisher and native controls.

The companion now observes system reserved regions in the web host's local,
physical coordinates. The web UI uses those regions rather than device names,
fixed screen dimensions, or guessed hinge angles. Inactive divisions identify a
fold-capable display; only active, intersecting regions affect placement.

- Flat inner display: available space determines chat/list/computer columns.
- Book pose: the chat list stays narrow and collapsible, never grows to fill
  half the display merely because it is folded. Conversation scrolling uses the
  remaining width; header/composer controls avoid the fold. An open computer
  can occupy the opposite region when both panes fit.
- Tabletop: conversation above the fold, composer below it. Computer overlays and
  dialogs stay in one usable region. Composer menus remain tappable.
- Outer display and ordinary iPhones/iPads: existing compact/regular navigation.
- Partial-window folds and active camera regions: clip coordinates to the window
  and keep important controls and transient surfaces clear.
- No reload, account change, control handoff, or remote action is caused by a
  pose change. Existing computer transform validation still gates remote input.

## Build requirement and validation boundary

Build with **Xcode 27.1 or later, with the iOS 27.1 SDK**. Runtime availability
checks preserve the iOS 17 minimum; they do not make the new APIs compile on an
older SDK. The manual CI job checks the SDK before generating/building the app.
No paid CI job or release was started for this change.

Linux browser tests simulate the native geometry payload. They are not native
Duo verification. Native compilation, scene transfer, keyboard avoidance,
system toolbar displacement, and real hinge motion must pass on the simulator
and device before advertising full Duo support.

## Tonight's simulator pass

1. Select Xcode 27.1, generate `mobile/ios/KindredCompanion.xcodeproj` with
   `cd mobile/ios && xcodegen generate`, and select an installed Duo simulator.
   Record Xcode/SDK, source commits, simulator model/runtime, and screenshots.
2. Open a long conversation, scroll away from the end, and type an unsent draft
   with a numbered list. Select text mid-draft. Test flat, book, tabletop, and
   closed/outer poses in Device Hub, in both orientations. Confirm the same chat,
   text, selection, scroll anchor, and account remain. Repeat with keyboard open.
3. Move the hinge while window dimensions stay unchanged. Columns and transient
   controls must still move clear of the reserved region. No frozen old gap.
4. In split multitasking, move/resize the app so the hinge is partly outside its
   window. No cropped edge controls, horizontal page overflow, or missing list.
5. Test 150% text, accessibility text, light/dark, Reduce Motion, and RTL. Include
   a native account sheet, sign-in, Settings, approval editor, document preview,
   composer + menu, mention/command suggestions, and contextual menus. Tap the
   actual options, not just inspect whether the menu looks visible.
6. With the inner camera active, inspect chat header/composer/computer controls,
   dialogs and menus. Safe-area insets must not be applied twice. Native toolbar
   buttons must follow the system's asymmetric safe areas.
7. Open the bot computer with control already held. Fold, unfold and rotate;
   check no new connection/control request and no input sent by the transition.
   Hold a pointer or modifier while folding: release the previous input once,
   then gate new input until the canvas transform is valid. Check paste is not
   replayed after interruption. Back to chat and reopen the retained connection.
8. Hide/restore the list on the flat inner display. Narrow the window or use large
   type, open the list again, and return to the chat. No inaccessible hidden pane.
9. Background/foreground and close/open the device during a running task. Confirm
   updates resume, the draft survives, and no duplicate task is submitted.

Repeat the pose, keyboard, camera, and computer-input cases on Friday's phone.
A browser simulation cannot substitute for those checks.

## Research references

Apple documents region-based layouts and native containers that adapt to folds:
[adaptive layouts](https://developer.apple.com/videos/play/tech-talks/111463/).
The companion keeps native navigation controls native and treats its web UI as
custom content that must explicitly consume geometry. See also
[prepare for Duo](https://developer.apple.com/iphone-duo/) and
[multiple displays and scenes](https://developer.apple.com/videos/play/tech-talks/111464/).
The physical-coordinate query is described in
[ReservedRegion](https://developer.apple.com/documentation/swiftui/reservedregion).

## Native integration validation, 21 October

The native branch integrates shared source `cf35310` with the existing iOS
companion. UIKit remains the single publisher of web-local geometry; inactive
and offscreen division metadata identify the inner display without reserving an
invisible gap. Shared placement converts viewport regions into pane coordinates
without treating asymmetric safe-area padding as a scale factor.

Local validation passed: Xcode 27.1 simulator compilation, bundled composer and
mobile menus/navigation in WebKit, six retained-computer poses, shared region
and pose policies, interrupted/native paste guards, and bundled tabletop chat,
camera/fold-safe controls, Settings and document-preview bounds. These browser
cases inject geometry and a disposable computer transport. They do not prove
physical hinge motion, native speech recognition or push delivery.

The real Duo simulator was updated in place and signed into the user's existing
server; live chats loaded. On-device hinge/keyboard acceptance still needs to be
repeated on the arriving phone. In particular, verify that same-bounds hinge
changes cause UIKit to republish reserved regions without a window resize.

The installed iOS adapter owns a compact, persisted inner-display chat-list
width even when an older server assigns half the display to it. Drag its divider
to a 76-point avatar rail or wider list; hiding/restoring the list retains that
preference. The composer fills the conversation pane without the desktop width
cap. New bot/chat choices use the native toolbar Menu and existing server
closures. Sign-in Accounts requests the native vertical toolbar on iOS 27.1.
Resize capture cancels across native sheets, host detach and scene deactivation.

Message context previews now snapshot the visible bubble rather than the entire
row: clip to the chat viewport and exclude overlapping header/composer/latest
controls. UIKit uses the same bounded preview for presentation and dismissal.
The message regression verifies clipping of an offscreen, long bubble and keeps
native action expiry/reply/copy/reaction behavior covered.

Outer-display chrome follows the current inner-display state, rather than the
remembered Duo capability. The inner computer has a compact resizable width in
flat side-by-side layouts; active folds retain system region placement. Native
right-toolbar expansion replaces the desktop screen title/picker/header.

### Final rail presentation

The later simulator review supersedes the initial closed-display chrome choice:
both outer and inner Duo displays use the system's native right/left rail when
its local trait supports one. Cold outer launch reads `verticalBarEdge` directly;
opening the inner screen is not a prerequisite. A separate `usesNativeRail`
bridge flag controls chrome while fresh `isDuoInner` controls pane architecture.
The bot identity is a native avatar-only Details button using the original
character paths and bounded shape/color fields. The web header has no empty row.

Signed-in rail content extends behind native chrome on all edges. Horizontal
corner adaptation and real active reserved regions protect controls locally,
instead of applying a full-height empty strip beside the composer. Existing
UIKit keyboard ownership and the ordinary iPhone safe-area behavior remain.

The final browser pass includes current/historical server controllers, native
avatar actions, full bottom lanes below localized rail occlusions, closed
portrait/landscape, and restored ordinary slab chrome without rail support.
The iOS-only progress pass covers 32 width/type/theme combinations and preserves
44-point timestamp targets without inflating narration rows or scrolling clipped
wrappers. A separate older-server preview test proves that the installed native
adapter corrects full-row targets while retaining the server's action closures.
