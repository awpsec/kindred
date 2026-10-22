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

The final native simulator measurement confirmed a 951×669 full web viewport.
The whole-view safe area reserved 34 points at the bottom; the SDK bottom-bar
region reserved 16 for a 64-point row. The composer reports its measured action-row extent
through a bounded, deduplicated bridge; UIKit queries that bottom row
and publishes only its validated bottom clearance for the composer. It never
copies the row's large top inset into page padding. Keyboard-visible clearance
remains zero. Other surfaces retain their own safe-area policy. Native rail
presentation also removes the obsolete global top blur and legacy shell block
padding so the first conversation row is not blurred or offset.

The final on-device simulator keyboard check exposed the native rail covering the composer’s trailing action while typing. The host now publishes keyboard visibility alongside measured safe insets; the iOS shim reserves the measured right inset only while the keyboard is visible. Dismissal restores the full-width bottom lane. Both current and historical server fixtures verify this transition.

## Toolbar identity and overflow follow-up

The closed-display avatar now uses a true original-color image in an iOS 27.1 vertical-preferred toolbar item. The open display restores the existing centered avatar-and-name tag; its measured clearance grows with Dynamic Type. Other web navigation controls and the full-width status blur remain hidden.

Replaced the separate app More menu with the public ToolbarOverflowMenu, so Artifacts/Marketplace share one native ellipsis with any overflowing Search/New controls. No new keyboard state or navigation bridge was added. Actual Duo simulator checks confirmed the closed avatar appears in the rail and opens Details, the inner tag opens Details, and keyboard-visible native overflow presents one ellipsis with both New bot/New chat available.

## Content clearance and retained panes

Details overlays the conversation area while retaining the native chat-list width, including its 76px rail. The HTML Details header/back/resizer are hidden in the Duo build; native Back and Settings keep the original guarded actions. The list’s effective width is capped at one-quarter of the local open viewport without discarding its saved preference. The cap also applies to the separator’s keyboard and pointer limits. With a physical left-hand bar, the list reserves its measured gutter before the icon/content column; the saved 76px content preference is retained and the total occupied width still respects the cap.

The native host publishes the physical rail side from the local vertical-bar trait and effective layout direction. Messages, Latest messages, Details forms and the computer viewport/controls use the measured safe-side gutter. The composer retains its independent full bottom lane, with the existing keyboard clearance. No private bar children or fabricated hardware occlusion frames are used. Public navigation-bar geometry was zero-height in this simulator, while SDK occlusions represented the status/camera area rather than the glass controls.

The compact list is an explicit design rule: search and the first four visible rows below it stop before the measured safe side; when search is hidden, an additional row fills that slot. Lower rows use the full width. Scroll and reorder refresh classification against stable parent bounds, including the server’s finite row-glide animations; width changes animate unless Reduce Motion is enabled. A decorative 28px top-left curve distinguishes the first visible card; it is not a claimed measurement of the device corner.


## Fold frost, focused input and pane endpoints (October 22)

Native-only changes keep the retained account WebView and existing navigation/input guards. Closed landscape now uses a centered 640-point maximum composer; opened displays retain the full conversation lane. Both edges of the surrounding blur fade out. Bottom-row clearance can reduce ordinary UIKit bottom padding, but cannot lift the composer above that baseline. Corner/status avoidance measures the padded form rather than lifting its full-width wrapper a second time.

Single-line focus retains the idle input row and 44-point targets; multiline drafts, attachments, questions and replies retain their expanded layout. Page-root scroll offsets introduced by WebKit focus are reset without changing nested chat/editor scrolling. The chat scroller and indicator end above the input, without duplicate bottom padding. Tabletop retains its separate upper history/lower composer grid with no extra history margin.

The native host covers genuine local window/display-pose changes before publishing new web geometry, waits for local layout to settle, and fades a theme-matched material. The deadline is fixed at 650ms; normal settling is 120ms plus a 220ms fade, with a shorter opacity fade for Reduce Motion. Keyboard-only sizing, first attachment and background return do not start a cover. Scene deactivation, detachment and account replacement clear pending work. This supplements the approved cold-launch animation without replacing it.

The installed adapter settles only the server's temporary pane-frame animation through its existing cancellation callback. It then fades the retained pane at its final native geometry for 200ms. Closing content remains inert and out of flex until hidden; route ownership is unchanged. Resize, backgrounding, Reduce Motion, reversal and a bounded fallback clean up the effect. Desktop and server UI sources are unchanged.

Automated WebKit coverage includes current/historical navigation, left/right gutters, outer landscape bottom-corner status regions, focused/blurred input height, keyboard boundaries, scrollbar viewport, tabletop history fill, draft/anchor retention and controlled-input cancellation. The pane regression reproduces the former 240-point final-frame chat-width jump and now samples opacity and unchanged lane bounds through completion; it also covers rapid reversal, resize interruption and Reduce Motion. Native Swift build and source review cover the host lifecycle and guards.

Subsequent native checks after the Mac unlocked exercised closed/book/open transitions, pane opening/closing, and the software keyboard on both displays. Physical Duo verification remains pending.


## Continuous display chrome (October 22 follow-up)

The retained composer, centered identity and Latest messages control now animate actual pixel bounds across local display/hinge geometry changes. Text is not scaled. The 280ms coordinated motion samples the previous painted position, supports a reversed fold, and removes its effects at the natural destination. A centered pill accounts for its center anchor while its width grows. The editor keeps its natural height and live draft/caret; intermediate form widths do not repeatedly change the native bottom-row extent. A fixed 650ms fallback prevents lingering effects.

Keyboard-only viewport changes, initial attachment, background return, pane dragging and Reduce Motion retain their existing ownership. Host resize messages can arrive after a viewport resize; the old painted bounds are retained until native width agrees. A lighter theme-matched native frost is limited to outer/inner architecture changes. Same-display hinge/resizing transitions show their actual movement directly. Source changes remain confined to the installed iOS bundle, not desktop/server UI.

The motion fixture now samples closed-to-open and same-window half-open-book-to-flat transitions, including intermediate composer widths, centered identity growth, cleanup continuity, rapid fold reversal and keyboard/Reduce Motion exclusions under current and historical navigation. Existing geometry tests wait for finite chrome motion before checking their final bounds.

Messages comparison is unavailable in this iOS 27.1 runtime: installed-app metadata and the runtime Applications bundle contain Messages compose/extension services, but no Messages conversation app. The closed-screen reading/Latest clearance policy is unchanged. Native dark-mode fold, pane and software-keyboard checks were subsequently exercised after unlocking the Mac. Light mode and Reduce Motion remain automated coverage rather than completed native visual checks.


## Multiline composer anchoring (October 22)

The native simulator reproduced the draft-growth jump: a single line used a
12-point composer bottom inset, while a second line changed it to 34, lifting
the form by 22 points. The bottom-bar SDK query was receiving the entire form
height, including the editor. It now receives only the measured action row with
symmetric padding. The reported extent stays independent of draft wrapping,
reply content and width-driven editor growth. This is confined to the iOS bundle.

Native checks in the closed portrait display confirmed the form bottom remains
658 points through one-line and wrapped drafts without the software keyboard.
With the onboard keyboard visible, touch-key typing through expanded and wrapped
drafts kept the form bottom at 366 points, its action row bottom at 360, and
viewport-root scroll offsets at zero. Test drafts were cleared without sending.

Current and historical server motion fixtures now enable the native dictation UI
and assert that both the form trailing edge and mic remain stationary during
leftward book-to-flat expansion. Multiline, explicit line breaks, natural wrapping
and shrinking drafts assert a fixed form bottom and an unchanged native action-row
query. Existing sidebar, safe-area, keyboard and ordinary-phone checks also pass.
Simulator checks do not substitute for physical-device verification.
