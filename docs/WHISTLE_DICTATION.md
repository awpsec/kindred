# Whistle local dictation

Whistle is an explicit optional download beside Whisper; existing selections and
macOS Native remain unchanged. Audio stays in memory and goes through a resident,
killable child process. No Python installation is required by the user. The
worker disables Needle telemetry via NEEDLE_TELEMETRY=0 and DO_NOT_TRACK=1.

The 16,919,407-byte model is pinned to Hugging Face Cactus-Compute/whistle revision
b358ddadd89b7a713b5aa131f23032d3cca1b251 and verified by SHA-256. Engine 3.1.0
wheels are pinned by revision and hash in desktop/dictation/whistle-pins.json.
Only the native library is extracted from the wheels. The separate C++ adapter
uses the C API; the Python package and its telemetry wrapper are not shipped.
Apache-2.0 and LLVM runtime notices accompany the engine. Build scripts bundle
Linux x64, Windows x64 and macOS libraries. Windows runtime.zip contains the
cross-built adapter; native Windows/macOS acceptance is still required.

Scheduling waits at least one second between decode starts and adds a cooldown
proportional to the preceding inference duration (250 ms–2.5 s). There is only
one request in flight. Silence is not repeatedly decoded. Whistle windows stop
at observed pauses where possible; uninterrupted speech uses 28-second windows,
commits complete timestamped words through 24 seconds, then resumes at the last
committed word's end, preserving lookahead. Missing usable timestamps fail
visibly rather than silently truncating speech. Stop drains remaining windows;
its deadline scales with observed inference cost and pending audio, up to two
minutes, and Cancel remains available. Recording retains the existing 60-second
limit. Whisper's existing utterance-boundary behavior is preserved.

Validation: test-whistle.py exercises the real resident engine (speech, silence,
timestamps, oversized-input rejection and reuse). test-whistle-dictation.cjs
covers 55-second continuous speech, final draining and adaptive scheduling in
Chromium/WebKit. test-dictation-segments.cjs covers existing Whisper behavior.
A preliminary shared-host JFK sample comparison favored Whistle, but concurrent
build load makes those timings unsuitable as a default-selection benchmark.
More accents, background noise, technical names and native platforms need testing
before changing the default or removing Whisper.
