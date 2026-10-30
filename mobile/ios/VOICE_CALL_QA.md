# Experimental voice calls

The approved call tray replaces the empty composer during a call. Settings →
General contains a collapsed Voice (OpenAI API) section. Calls use the account's
OpenAI API key, independently of the selected bot's chat provider. The matching
server branch is required. No credentials are embedded in the mobile app.

Live delegates requests to the originating bot's normal task system during the
call. That bot keeps its provider, tools, full context and approval rules; Live
gets a smaller recent chat excerpt, including prior calls. Public results are
returned to the voice and retained in chat with their full links. A durable
delegation ledger prevents end-of-call/restart from repeating dispatched work.
Approvals and choices still require the normal chat cards.

The dropdown consumes `/api/voice/settings`. That endpoint explicitly identifies
its source as OpenAI's documented GPT-Live catalog (31 built-in voices, verified
against the Live session API reference on 2026-10-29). OpenAI currently has no
public built-in voice-list endpoint; this is not live upstream discovery.

## Native implementation

`NativeVoiceCall` owns the audio engine and ticket-authenticated socket outside
WKWebView. `KindredVoiceActivity` is an embedded ActivityKit extension. Its compact
presentation has an avatar and OS-driven elapsed timer; its expanded and lock
screen presentations have mute and End call controls. On iOS 27, the timer uses
`isDynamicIslandLimitedInWidth` for the Duo's vertical presentation. UIKit decides
the placement. The existing bot avatar geometry is shared by both targets.

Folding and host reparenting retain the call. Account changes, full navigation,
audio interruptions and disconnected headphones end it. Live Activity controls
operate through app intents, without depending on JavaScript timers. Foreground
sync reconciles actions performed while WKWebView was inactive. A stale activity
stops displaying an active timer if its process no longer supplies heartbeats.

## Required Mac verification before release

Generate the project with the existing XcodeGen workflow and existing signing,
bundle identifier and saved-account configuration. The app embeds a new `.voice`
extension; verify its provisioning as well as the main app. Use Xcode 27.1 for
the Duo-specific API. Do not replace account data or change the bundle ID.

1. Compile the app, widget extension and tests. Run the existing
   `ComposerUIKitTests` against this branch's fixture (both fingerprints updated).
2. Test microphone permission allowed, denied and cancelled during startup.
   Confirm dictation and a call cannot capture simultaneously.
3. Make a brief call using an explicitly started test session. Confirm capture,
   audible playback, echo cancellation, interruptions, mute and immediate End.
   Keep DeviceHub **View Screen off** during physical microphone testing.
4. Switch between foreground, background and lock screen. Verify compact,
   expanded and minimal Dynamic Island layouts, timer and correct avatar.
   End and mute from the activity, then verify the foreground state matches.
5. Test Duo outer portrait, inner portrait and inner landscape. Fold while
   speaking; verify no reconnect, keyboard jump, covered controls or lost call.
   Capture compact/expanded activity screenshots on both phone and Duo.
6. Check denied Live Activities, audio interruption/headphone disconnect,
   network loss, force quit, stale activity, account switch and a second call.
   A delayed action from the first call must not affect the second.
7. After ending, verify one quiet “Call ended · m:ss” receipt. The transcript
   must reach the originating bot, including trailing words, without appearing
   as a chat transcript. Test a bot using a provider other than OpenAI.
8. Ask for a harmless current lookup (for example a bicycle shop and its opening
   hours), then correct the location while it works. Verify the configured bot
   does the lookup during the call, Live speaks only returned findings, and
   names, verified links and phone numbers remain readable in chat afterward.
9. Exercise a pending choice and approval. Voice should direct the user to the
   card; saying “yes” must not bypass its approval controls. End while work is
   running and verify it continues once, with no duplicated external action.
   Repeat after a dropped connection and server restart. Include a second call
   that refers to the earlier conversation, and excluded/deleted chat history.

Browser tests cover UI and bridge behavior, not ActivityKit or native audio:

```sh
node tools/frontend/test-voice-audio.cjs
node tools/frontend/test-voice.cjs
WEBKIT=1 node tools/frontend/test-voice.cjs
node tools/frontend/test-voice-integration.cjs
WEBKIT=1 node tools/frontend/test-voice-integration.cjs
```

The matching server needs its durable handoff and local WebSocket fixture tests:

```sh
cargo test --bin kindred -j1 voice:: -- --test-threads=1
```

Both browser engines passed the component and full native-adapter fixtures,
including all three Duo poses. PCM capture checks passed at 24, 44.1 and 48 kHz.
The server test harness compiled and all 15 `voice::` tests passed during release
preparation on 2026-10-30, including the local WebSocket relay, corrections,
public results, pending approvals, context and restart deduplication. Fixtures
now create the bot and its direct conversation through the production path.
No real OpenAI call or native build was verified by the Linux preparation task.
The native and real-provider checks above still require their own receipts;
browser and local provider fixtures do not establish device verification.
