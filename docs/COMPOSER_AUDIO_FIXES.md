# Composer and Linux audio fixes — 2026-09-15

These source changes are unreleased. Published 0.48.37 packages and production-server
remain unchanged.

## Behavior

- Linux microphone consent appears in a Kindred dialog. Not now and Escape
  deny access; Allow microphone grants audio access for the connected origin
  and current app session. Cancellation closes pending consent. Camera capture
  remains denied.
- The first recording attempt locks startup before waiting for the speech
  worker. Failed startup releases the microphone and audio context; retry and
  cancellation preserve the chosen microphone and existing draft.
- Linux packaging includes GStreamer's media framework in the AppImage and
  declares base, good and PulseAudio plugins for the DEB. The manual package
  workflow checks audio processing in the built AppImage before collection.
- Claude, OpenRouter and Kimi have local, theme-aware provider marks. Codex
  retains the OpenAI mark and custom providers use the neutral network icon.
  Sources and attribution are in [PROVIDER_MARKS.md](PROVIDER_MARKS.md).
- Typing `- `, `* ` or `+ ` starts a bulleted list. Enter continues it; Enter on
  an empty bullet exits. Tab indents and Shift+Tab outdents. Drafts retain
  nested Markdown. The + menu contains Attach files and Teach a task.

## Validation

The immutable 0.48.37 Linux AppImage reproduced the reported
`InvalidStateError: Failed to start the audio device`. Its runtime reported
missing `appsrc` and `autoaudiosink` GStreamer elements. The same audio smoke
test passed with the current native development client and host media plugins.
The test uses a real keyboard gesture and processes audio through a muted
WebAudio graph; it never opens a microphone.

The native Linux integration test passed themed denial, retry and consent,
synthetic microphone capture and track shutdown, session consent reuse, camera
denial, composer recording/cancellation with draft preservation, and real CPU
Whisper transcription of the pinned public JFK fixture. Worker residency,
inference cancellation/reload and disable/unload passed. Synthetic capture is
restricted to debug builds on loopback fixtures.

The server suite passed 314 tests and native desktop suite passed 25. Chromium
and WebKit passed list editing with Linux, Windows and macOS platform fixtures,
including nested indentation, Markdown drafts, undo, mention chips and IME.
Both engines passed provider marks in both themes, recording failure cleanup,
retry, late capture cancellation, delayed-worker startup locking, selected
device preservation and themed consent. The existing dictation UI regression
passed in both engines; real browser microphone/live transcript assertions run
in Chromium, while WebKit covers the UI and IPC fixture paths.

Actual linux-client/KDE microphone hardware, native Windows/macOS and a newly built
Linux package remain acceptance checks for the next approved release. No new
package, release, Actions run or backend deployment was performed for this work.

## Reproduce

Browser tests: `tools/frontend/test-composer-lists.cjs`,
`tools/frontend/test-composer-audio.cjs`, and
`tools/frontend/test-dictation.cjs`. Run with Node and set `WEBKIT=1` for WebKit;
`KINDRED_PLAYWRIGHT_MODULE` can select an existing Playwright installation.

Desktop-only tests: `tools/frontend/test-native-linux-dictation.cjs` and
`tools/frontend/test-native-linux-audio.cjs`. Run as a normal user under Xvfb
and a D-Bus session. Both use isolated app data and a local HTTP fixture.
The audio test needs `xdotool` and `KINDRED_NATIVE_EXE`; the full dictation test
also needs the pinned model and WAV paths described in [DICTATION.md](DICTATION.md).
