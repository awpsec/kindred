# Experimental voice calls

The approved call tray replaces the empty composer during a call. Settings →
General contains a collapsed Voice (OpenAI API) section. Calls use the account's
OpenAI API key, independently of the selected bot's chat provider. The matching
server branch is required. No credentials are embedded in the mobile app.

Live uses the bot's allowed tools in a separate call workspace. It receives the
bot's instructions and a recent chat excerpt, including prior calls. Tool
results return to the voice session without starting the ordinary chat model
or posting progress into chat. Hangup saves one recap with useful results and
links. Durable action receipts prevent duplicate work after reconnects or
hangup. Approvals and choices still require the normal visible cards.

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
7. After ending, verify one quiet “Call ended · m:ss” receipt and one recap.
   Keep trailing words in the saved conversation without displaying a raw
   transcript or submitting it as new chat work. Test a bot whose chat provider
   is not OpenAI.
8. Ask for a harmless current lookup (for example a bicycle shop and its opening
   hours), then correct the location while it works. Verify Live performs the
   lookup through the call's tools and speaks only returned findings. No normal
   chat task or progress should appear. Names, verified links and phone numbers
   must remain readable in the recap afterward.
9. Exercise a pending choice and approval. Voice should direct the user to the
   card; saying “yes” must not bypass its approval controls. End while work is
   running and verify no external action is dispatched twice or replayed by the
   recap. Repeat after a dropped connection and server restart. Include a second
   call that refers to the earlier conversation, and excluded/deleted history.

Browser tests cover UI and bridge behavior, not ActivityKit or native audio:

### Physical startup configuration regression

The physical Duo test on source `51a4c08` reproduced a startup failure twice,
including with Device Hub fully quit: permission and foreground state were
correct, but the engine was stopped before its first PCM buffer. The route
changed during startup, with a 48 kHz input and a 44.1 kHz output snapshot.
Simulator passes did not reproduce this failure.

The startup repair handles one configuration-change notification before the
first converted PCM buffer. It rebuilds the input tap and converter using the
current format, then restarts the engine. It leaves the output connection format
automatic and keeps the existing capture deadline. Ending the call cancels any
queued recovery. Recovery does not restart an established call or reconnect a
provider session.

For acceptance, run `NativeVoiceCallTests` on both phone simulators, including
the startup recovery, cancellation and conversion tests. Then run
`NativeVoiceCallTests/testPhysicalVoiceCaptureProducesPCMBeforeFakeProviderConnects`
through the opt-in `KindredVoiceCaptureTests` scheme on the physical Duo with
Device Hub fully quit. Use three independent app launches. Each run must deliver
real PCM before the fake transport opens, continue capture beyond the four-second
watchdog, and close cleanly. Retain each result bundle and the
`voice-capture-metadata-no-audio` attachment; do not substitute simulated capture.
A silent buffer passes this probe. Also run
`NativeVoiceCallTests/testPhysicalVoiceDuplexMuteAndSecondCall`. It uses the real
capture and playback graph, plays a quiet synthetic tone, verifies capture keeps
running during playback and mute, and starts a second call after clean teardown.
Its fake transport discards microphone samples; only counters and safe metadata
are retained. Both physical test bodies are compiled by simulator builds, while
their execution remains explicitly restricted to opted-in physical devices.

After these pass, install the signed build using the existing bundle identity,
team and account data. Retain its source commit, version/build number and install
receipt. Verify an actual spoken call: the bot hears and answers a short phrase,
mute works, hangup stops audio, and the next call also connects. Test the Duo
closed and open and fold during the call. A rendered test tone or simulator pass
does not establish that a real two-way provider call works. Do not describe a
diagnostic installation as a verified microphone fix.

`KindredVoiceActivityTests` is an opt-in app-hosted scheme that requests the
production system Live Activity, updates its mute state and ends it. It does
not open the microphone or a provider session. For a simulator visual check,
set `KINDRED_TEST_ACTIVITY_VISUAL=1` in the test launch environment: the fixture
holds the unmuted activity for 45 seconds before updating and ending it. Inspect
the compact and expanded Island from the simulator Home screen. This checks
system rendering separately from a real call and its app-intent controls.

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

Keep browser, simulator, physical capture and actual provider-call receipts
separate. Record the exact source and test selection, including skipped tests.
Browser and local provider fixtures do not establish device verification.
