# iPhone Duo readiness — 21 October 2026

## What changed

Kindred's native companion retains one WKWebView per account. The web layout
already had partial fold handling, but the native app never supplied the flags
or reserved regions it expected, and several pane CSS rules were missing.

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
