# iPhone Duo compatibility

Kindred keeps each account's existing `WKWebView`, conversation, draft and
computer connection as the available space changes. This adaptation applies
only to the native iOS shell. Existing slab-phone navigation and its portrait
restriction while typing on a remote computer remain in place.

## Layout and native controls

- UIKit identifies Duo capability from the attached window's division regions,
  including inactive regions. Active regions come from the actual web view in
  its own coordinates; SDK margins are already included.
- The system positions standard SwiftUI toolbar actions, including the inner
  display's vertical bar. Matching HTML buttons are suppressed on Duo. The
  Bot Details gear joins these native actions. The centered bot tag remains
  in the conversation; there is no permanent logo.
- Duo Search uses a bounded field with a 44-point minimum height, readable
  text and independent safe-top spacing, including in a narrow landscape list.
  Native + presents the existing conversation or artifact-type menu through
  UIKit. It owns the visible page rather than the hidden HTML toolbar or a
  previous tap; folding, hiding the page or navigating invalidates stale choices.
- Flat inner space can show the chat list, conversation and computer together.
  Larger text or less space collapses panes before the conversation becomes
  unusable. Touch separators resize the list and computer while preserving a
  usable chat width. Dragging the list fully left hides it; the native sidebar
  action restores it, including in open portrait. Widths are saved per account.
  Active book/tabletop divisions use system geometry instead of manual resizing.
  A book division separates chat from computer, or list from chat.
- Tabletop places the computer display above the division and its controls
  below it. If the keyboard covers the lower half, Paste and Return control
  remain within the shortened viewport. Active occlusions move the bot tag or
  composer out of the obstructed area and reserve matching scroll clearance.
- All four web-view safe-area edges are independent. UIKit's keyboard layout
  guide owns keyboard avoidance once. Keyboard shrink alone preserves the
  navigation layout; Duo typing does not force portrait orientation.
- Native Back uses retained mobile navigation. Geometry changes invalidate
  in-flight gestures and remote-coordinate mappings; rejected input is never
  replayed. Settings and other editors keep focus during computer resizing.
- Both panes animate to their final positions during edge Back, so removing
  the preview does not snap the incoming list's margins. Settings sheets animate
  downward before closing; Reduce Motion bypasses that slide. The app bundles
  an incoming-pane correction for deployed v1 server navigation, retaining
  the server's original Back closure. Version 2 owns both animations itself.
- Maximize is available on the inner display and hidden on the outer display.
  Closing an expanded inner computer also clears expansion through its existing
  controller, without replacing the connection. Outer remote typing uses the
  slab portrait policy; releasing it retracts the explicit orientation preference.
- Document, workspace-artifact and screenshot previews have safe-area-aware
  headers with circular glass controls. Original dismissal and cleanup handlers
  remain intact. Touching Paste or Return control keeps keyboard geometry stable
  until release and activates once, including WKWebView's prevented-click path.

These choices follow Apple's
[resizability guidance](https://developer.apple.com/videos/play/tech-talks/111461/),
[reserved-region guidance](https://developer.apple.com/videos/play/tech-talks/111463/)
and [native toolbar guidance](https://developer.apple.com/videos/play/tech-talks/111462/).

The new Duo pane controller also requires the matching `ui/mobile.js` on the
server. Installing the iOS app does not deploy that server update. Older
servers still receive bundled preview, sheet, toolbar and edge-motion fixes;
the native sidebar toggle is offered only when its controller is available.

## Verification record — October 7, 2026

Xcode **27.1 beta, build 27A9269**; iOS **27.1, build 24A94232**;
genuine **iPhone Duo** simulator. Xcode 27.2 remains separately installed.
The native run uses an isolated fixture account and shipped web modules,
with a simulated computer transport and real noVNC keyboard listeners.
It does not contact user bots or generate real computer input.

| Check | Evidence / status |
| --- | --- |
| Xcode 27.1 app build | Passed on the genuine Duo destination |
| Core suite | 78 passed, including private-HTTP UUID bootstrap scope and CSPRNG behavior |
| App-hosted suite | 34 passed, including slab-only orientation ownership and account/Keychain behavior |
| Native outer launch / sign-in / unfold baseline | Observed before adaptation; opening retained the live page |
| Adapted inner display | Final cold launch succeeded on confirmed private HTTP without a browser UUID shim or startup errors; native right-edge toolbar, sidebar and chat observed |
| Native live Dynamic Type | Same document load ID at XXXL and accessibility-extra-large; CSS scale updated, panes collapsed as needed |
| WebKit outer/inner retention | Draft, selected range, reading anchor and remote connection retained; no accidental send or input |
| WebKit flat/book/tabletop | Three useful panes when space permits; division alignment and reachable computer controls passed |
| WebKit keyboard / safe areas / occlusions | Shortened viewport, independent asymmetric edges, camera and composer clearance passed |
| WebKit gestures / input | Cancelled fold-time gesture, retained Back/reopen, stale transform denial and no replay passed |
| WebKit themes / accessibility | Settings-driven light/dark, Reduce Motion and larger text passed |
| WebKit pane and toolbar regressions | Resize both boundaries, hide/restore list, cancel a drag during folding, Details gear, and inner-to-outer expansion reset passed |
| WebKit motion regressions | Incoming/outgoing edge animation sampled through completion; Settings reverse dismissal, interrupted entrance and Reduce Motion passed |
| Deployed-server compatibility | Historical v1 and current v2 installers both retain drafts and smooth incoming motion; no duplicate animation; invalid input and geometry cancellation retain ownership |
| WebKit preview regressions | All three existing preview modules retain cleanup and expose unobstructed 44-point glass close controls with a 59-point top safe area |
| WebKit control touches | Trusted touch returns control once; moved/cancelled/nonprimary/stale touches are rejected; compatibility click is suppressed |
| Slab and tablet web regressions | iOS layout and retained navigation tests passed |
| Native pane controls | Actual touch resized both boundaries, hid/restored the list in flat landscape and open portrait, and opened Bot Settings through the side toolbar |
| Native outer/inner computer retention | Same document load ID and zero RFB disconnects during closing/opening with control active; outer maximize hidden; expanded inner view normalized when closed |
| Native book/tabletop | Actual DeviceHub poses supplied vertical/horizontal 40-point divisions; panes avoided those divisions; tabletop controls remained above the real software keyboard |
| Native software keyboard / Return control | Real keyboard displayed on taking control; one touch returned control, dismissed the keyboard and restored Watching, including tabletop |
| Native artifact navigation | List, document and native Back observed without duplicate HTML menus |
| Native inner-landscape Search / + | Search filtered at a 160-point list width; cold + and + after Search opened native New bot/New chat menus and their original forms; artifact + opened its native type menu and the selected sheet form |
| WebKit Search / + regressions | Narrow field, larger text, asymmetric safe areas and keyboard geometry passed; one native menu, cancel/generation guards, fold/hide rejection and artifact type/form/route validity passed |
| Native edge gesture recognition / remaining matrix | **Pending** — automation drags did not trigger UIKit's edge recognizer; native Back worked. Remaining theme/launch/background, live-input and recovery checks are listed below |
| Physical Duo, live computer, APNs delivery | **Pending** — simulator/fixture checks do not prove these |

Interactive checks use actual DeviceHub folding, rotation and touch controls.
Synthetic viewport/reserved-region tests cover additional transitions but do
not establish physical-hardware acceptance. The remaining matrix below should
be completed by hand, especially edge recognition and live computer input.

## Reproduce automated checks

From the repository root, using an installed Playwright with WebKit:

```sh
node tools/frontend/test-ios-duo.cjs
node tools/frontend/test-ios-layout.cjs
node tools/frontend/test-ios-edge-compat.cjs
WEBKIT=1 node tools/frontend/test-mobile-navigation.cjs
```

Set `KINDRED_PLAYWRIGHT_MODULE` to the Playwright module path if it is outside
normal Node resolution. `KINDRED_TEST_ARTIFACTS` selects the Duo screenshot
folder. `test-ios-duo.cjs` starts and stops its own isolated server.

For native tests, select the 27.1 developer directory explicitly, generate the
project with XcodeGen and use a genuine Duo destination:

```sh
export DEVELOPER_DIR=/Applications/Xcode-27.1-beta.app/Contents/Developer
cd mobile/ios
xcodegen generate
xcodebuild test -project KindredCompanion.xcodeproj -scheme KindredCompanion \
  -destination 'platform=iOS Simulator,id=YOUR_DUO_UDID'
```

For an interactive fixture, run `node tools/frontend/fixtures/duo.cjs --port 8765`
and use its printed local origin. Fixture sign-in is `duo-test` / `fixture-only`.
Private HTTP requires the app's explicit confirmation. Probe/effect evidence is
available at `/fixture/state`; probes distinguish document reloads from resizing.
Stop the fixture when testing is finished.

## Remaining interactive acceptance

1. Cold-launch the final build on the outer display in light/dark and Reduce
   Motion. Return from background without replaying the approved launch animation.
2. Open a nondefault long conversation, select a draft range and scroll into
   history. Open/close the device mid-conversation; rotate in flat, book and
   tabletop poses. Confirm account, chat, draft, caret, anchor and load ID.
3. Disable hardware keyboard capture and use the actual software keyboard for
   chat, Settings and remote control in every pose. Check no blank composer gap,
   no focus theft, and Paste/Return control above the keyboard.
4. Exercise each native toolbar action and press menu on outer and inner
   displays, including artifact list/document Back, search, new artifact,
   marketplace, Settings and native Accounts sheets. No duplicate HTML menu.
5. Complete/cancel edge gestures, fold during a gesture, and drag within the
   computer canvas, selected text and horizontal scrollers. Confirm no unwanted
   navigation, send, pointer input or control release.
6. Repeat with accessibility text sizes, sheets open, account switching,
   background return and fixture network loss/recovery. Record failures
   separately; account data must survive retry and display transitions.
