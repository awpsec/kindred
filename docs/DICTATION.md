# Dictation

Enable **Settings → General → Dictation** to add a microphone to the composer. It is off by default, and the preference stays on this device. An empty composer shows the microphone as its main action. Typing reveals Send and moves the microphone beside it, keeping its gray circular background.

Click the microphone to record. Words appear in the draft while you speak; Whisper may revise that part of the draft as it hears more context. Click **Stop dictating** to finish. Escape or Cancel removes the current dictation and preserves the rest of the draft. Dictation never sends a message automatically. Recordings stop at 60 seconds.

## Live updates and finishing

Local Whisper processes successive audio snapshots, so updates arrive after each
decode rather than one word at a time. The first request starts after roughly
0.7 seconds of capture. Only one request runs at a time; slower decodes are
followed promptly by the latest audio instead of building a queue of stale
snapshots. While a request runs, the status says **Listening · transcribing
speech…**. The current transcript stays visible and its newest words remain in
view inside a scrolling composer.

Short CPU requests on all platforms use an encoder window sized for the audio, with padding and
a 10.24-second minimum, instead of always processing a full 30-second window.
Long recordings retain the full model window and normal segmentation; GPU
workers retain their prewarmed dimensions. The CPU optimization now also applies to newly built Windows and Mac workers.
Automatic language detection remains
enabled and all model choices remain available. This optimization requires a
new native desktop build.

The shared UI detects silence using the worker's conservative energy floor in
20 ms frames. Original PCM remains in memory; each snapshot trims only the
silent tail, retaining 300 ms of padding. Silence alone does not cause another
decode. Stop releases capture immediately, waits for any speech already being
decoded, and requests a final decode only if newer audible input needs it.
Finished text and the Send action do not wait for AudioContext cleanup. These UI
changes work with existing native workers too, once the selected backend serves
the updated UI.

`tools/frontend/test-live-dictation.cjs` exercises the actual composer in both
Chromium and WebKit with controlled PCM and delayed native replies. It verifies
visible words before Stop, silence skipping, final speech, stopping before the
first partial, cancellation during finalization, and native engine selection. Unlike the older browser microphone smoke test, these live
checks run in both engines.

The desktop repository's `tools/frontend/test-native-live-dictation.cjs` uses
real Linux WebKitGTK WebAudio callbacks, Tauri IPC, and the pinned Base model.
Set `KINDRED_NATIVE_EXE`, `KINDRED_DICTATION_MODEL`, and `KINDRED_DICTATION_WAV`
(the public Whisper JFK sample), and run under X11/Xvfb with D-Bus, xdotool and
a working audio output. The test injects a synthetic MediaStream from that WAV;
it never requests a hardware microphone or contacts a live backend. It requires
the spoken sentence to appear while recording is still active and checks that
Stop after a pause does not launch another decode. It reports first-visible and
stop timings. Model loading, cancellation and portable/AVX2 worker tests remain
separate checks. The worker regression also grows previews into recordings over
30 seconds and back to short previews, verifying that all repeated speech survives
the change in window size on both CPU variants.

On 2026-09-16, native testing on build-host reproduced delayed decoding rather
than a WebKit-only hold on displaying results: the baseline's first words
appeared at 23.3 seconds, before Stop, and repeated silence caused additional
long decodes. Across two native runs with these changes, first words appeared at 12.8–13.7
seconds and Stop after the completed transcript took 195–278 ms without another
decode. These are
observations on a busy N150 development server, not latency guarantees or a
physical-microphone test on linux-client. Windows and macOS native verification of
these changes remains separate.

## Download and load a model

Missing models have gray labels and a **+** button. Click **+** to download; a blue progress bar and percentage show progress. The same button cancels an active download. Downloading never loads the model automatically.

Downloaded models have normal text and can be selected. Selecting one loads it into memory, replacing the previous resident model. A checkmark and bold label identify the loaded model. Enabling dictation or changing the model selection never initiates a download.

| Model | Quantized download |
| --- | ---: |
| Base | 60 MB |
| Small | 190 MB |
| Medium | 539 MB |
| Large v3 Turbo | 574 MB |
| Large v3 | 1.08 GB |

All five models are multilingual. Internet access is needed for the explicit download; cached models work offline. Exact byte counts and SHA-256 hashes are pinned in `desktop/src/dictation.rs`. Downloads are verified before publication, and models are verified again before loading. Failed verification leaves the model unavailable until it is downloaded again.

## GPU and CPU

The Windows x64 app bundles Vulkan and CPU workers. It discovers compatible Vulkan devices from the installed graphics driver, preferring a dedicated GPU and then available memory. Vulkan covers supported NVIDIA, AMD, and Intel GPUs. The macOS build produces Metal and CPU workers for Apple Silicon or Intel Macs. Released Linux packages through 0.48.36 do not enable local dictation. The current source adds Linux x86_64 CPU workers: a portable baseline and an optimized AVX2 worker selected only after checking all its required CPU features. Intel and AMD CPUs are supported; Linux GPU acceleration is not yet bundled. This change requires a rebuilt desktop client, not a server update.

The indicator beneath the picker describes the loaded worker: green **GPU** with a GPU icon, or blue **CPU** with a CPU icon. Expand the caret for the GPU name/backend or the CPU reason. If no compatible GPU was found, the explanation reads “No compatible GPU runtime/GPU identified on this device.” A GPU load or inference failure has a separate fallback explanation.

The model remains resident between live transcription requests. GPU initialization and kernel preparation finish while the picker says Loading. If GPU loading fails, Kindred tries CPU. A GPU inference failure retries the same in-memory recording once on CPU. Cancelling inference stops the worker and reloads the selected model; disabling dictation, switching profiles, or closing the app unloads it. Downloaded models remain cached.

Windows NVIDIA inference is covered by native tests. The Metal build path and AMD/Intel Vulkan support require validation on those devices before claiming device-specific results.

## Microphone and privacy

The Mac app bundle declares `NSMicrophoneUsageDescription` and signs with the
`com.apple.security.device.audio-input` entitlement. These enable the native
microphone path used by WKWebView; a loaded Metal worker alone does not establish
capture capability. macOS still asks for microphone permission. If access was
denied, enable Kindred in **System Settings → Privacy & Security → Microphone**.
This packaging fix requires an updated native app; changing the hosted UI cannot
add permissions to an installed Mac bundle. Downloaded models are preserved.

Mac package validation checks the bundled purpose string, signed entitlement,
secure context, and actual WKWebView microphone/WebAudio API exposure without
recording. On a physical Mac, also verify that an explicit Dictate click prompts
for permission, words reach the draft through the selected local worker, Stop
releases capture, Cancel preserves the previous draft, and a later recording
works. Apple Silicon/Intel capture and Metal inference are separate checks.

Select a microphone in **Settings → General → System**. Opening Settings does not enumerate audio devices; use **Refresh microphones** to discover inputs. System Default follows the operating system; a named selection stays on this device. If the selected microphone is missing, recording reports an error and never silently uses another input. The explicit Choose a microphone action can briefly request permission to identify input devices, then immediately releases the stream.

Recordings and transcripts pass through memory-only pipes to the local worker. Kindred does not write recordings to disk or send them to its server, OpenRouter, or another transcription service. OpenRouter dictation has been removed. Switching conversations or profiles, cancelling, disabling dictation, or leaving the page releases the microphone; a late result cannot be inserted into another conversation.

## Build provenance

The worker source and Windows build are in `desktop/dictation/`. They pin [whisper.cpp](https://github.com/ggml-org/whisper.cpp/tree/371b5a7561823ab2bb32142d2751e35e7534727b) and the Khronos Vulkan/SPIR-V headers. The bundled runtime includes its build manifest and licenses. The macOS build uses the same worker and Whisper revision, compiling Metal shaders into the executable. Model weights come from the [Whisper model repository](https://huggingface.co/ggerganov/whisper.cpp).

## Linux CPU build and validation

Linux desktop builds require Python 3, Git, CMake and a C++ compiler. `desktop/dictation/build-linux.py` builds the same pinned Whisper revision during the Rust build and embeds a Linux runtime archive in the executable. Builds use one worker by default; set `KINDRED_DICTATION_BUILD_JOBS` from 1 to 8 to change build parallelism. Release builds retain the Ubuntu 22.04 baseline. Users need neither build tools nor Docker for dictation.

CPU support does not imply that every model transcribes faster than real time. Large models use more memory and computation; quantized download size is not resident memory usage. All five model choices remain available on Linux. Validate latency on the target laptop before selecting a model for live dictation.

For a built runtime, `python3 desktop/dictation/test-linux.py <runtime.zip> <ggml-base-q5_1.bin> <jfk.wav>` checks both supported CPU workers, real transcription, silence, residency and process cancellation. The Base model hash is pinned in the test. `tools/frontend/test-native-linux-dictation.cjs` additionally checks the actual Linux Tauri IPC, platform support, explicit loading, transcription, cancellation/reload and disable/unload. Run it as a normal user with a display and set `KINDRED_NATIVE_EXE`, `KINDRED_DICTATION_MODEL`, and `KINDRED_DICTATION_WAV`; it uses isolated temporary profile data and a loopback fixture, never a live server. These test files live in the desktop repository.

The Linux desktop handles WebKitGTK microphone consent with a themed dialog inside Kindred. **Allow this session** grants access until the app closes. **Always allow** saves permission on this computer, scoped to the server origin and account. General settings show the microphone picker without a permission status or reset button. Capture requests consent only when needed; disabling dictation prevents recording. The native gate runs before capture because WebKit can cache its own device grants. Not now, Escape, cancellation, navigation, expiry and window destruction deny pending requests; camera capture remains denied. The consent script ships in the native client and works with older server UI assets too.

Startup locks the microphone button before asynchronous checks, releases tracks and the audio context after a failed start, and stops captures that arrive after cancellation. A selected microphone is never silently replaced. Audio-engine errors distinguish successful microphone consent from failure to initialize the audio system.

The 0.48.37 AppImage omitted GStreamer `appsrc` and `autoaudiosink`; the released 0.48.38 AppImage includes the media framework, including autodetect and PulseAudio plugins. A locally converted installation can still lose those plugins when its GStreamer directory is redirected to an incomplete host installation. This was confirmed on CachyOS/PipeWire: capture permission succeeded but WebKit could not find `autoaudiosink`. The unmodified 0.48.38 AppImage successfully processed a synthetic microphone against a private PulseAudio server on build-host.

For a system-library installation, install the distribution's matching audio plugins. On Arch/CachyOS these come from [gst-plugins-good](https://archlinux.org/packages/extra/x86_64/gst-plugins-good/files/). Do not restore a disabled bundle wholesale or mix a bundled scanner with system libraries. The updated `desktop/linux/setup.sh --client` repairs client dependencies without installing or starting Docker. Pass an original AppImage path to create a verified compatibility launcher, or use `--native` for a system-linked executable. The helper verifies `appsrc`, `appsink`, `audioconvert`, `audioresample`, `autoaudiosink` and `pulsesink` before writing a launcher, and clears inherited GStreamer path/scanner/cache overrides in generated system-library launchers.

Settings closes synchronously, without waiting for a compositor animation to finish. Audio context cleanup and native cancellation have bounded waits; driver errors retain their original message. Native notification delivery does not hold the session lock used by Settings, and the test-notification IPC runs on a blocking worker. These address concrete blocking hazards; no on-device stack has yet tied the reported full-app freeze to a particular one.

`tools/frontend/test-native-linux-microphone.cjs` checks session consent, remembered consent across a real app restart, reset/deny, camera denial and immediate Settings closure. It requires a debug Linux build and uses only WebKit's loopback-scoped mock microphone. `test-composer-audio.cjs` covers stalled device discovery, stalled AudioContext cleanup and an animation that never finishes in Chromium and WebKit. The existing release audio smoke test uses an oscillator; it does not by itself prove live microphone capture or that a real output sink was selected.

The permission, responsiveness and recovery-helper changes above are source changes requiring the next approved desktop release. The helper can be run separately against an existing installation; no new release is needed to install a missing host plugin package.

CPU inference has a 15-minute response limit to accommodate large models and busy machines; worker startup and GPU replies retain their three-minute limit. Cancelling or disabling dictation still kills the worker promptly instead of waiting for that deadline.

## Native macOS and finalization update

Settings → General → Dictation is opt-in. macOS builds offer **Native (built-in)** in the engine picker alongside the downloaded Whisper models. Selecting Native unloads Whisper. The microphone button focuses the composer and dispatches AppKit's Start Dictation action. macOS owns recording, permission prompts, languages, microphone selection and completion; text arrives through the focused WKWebView's normal text-input path. Use the system dictation controls to finish. This is system Dictation, not a second implementation using the Speech framework, and does not promise that Apple's recognition always runs offline. Other platforms and older desktop builds do not advertise this option.

Whisper remains device-local and keeps its model resident between recordings. Live snapshots are requested at most once every 700 ms, with one decode at a time and silence skipped. CPU workers on all platforms use the short-audio context optimization previously limited to Linux. Whisper retains its fallback decoding for accuracy. These changes reduce overhead but are not a claim of measured Mac latency or instantaneous Small-model transcription.

Stop freezes capture, waits for the current result, and decodes any remaining speech before committing the draft. A 20-second finishing timeout preserves the words already displayed and reports the timeout. Cancel, switching chats, or disabling dictation invalidates late results. Dictation never sends the message automatically.

Validation: deterministic Chromium/WebKit tests cover live insertion, trailing speech, stopping before the first partial, cancellation during finalization, native option selection, Whisper unload, and focus before dispatch. Native AppKit dictation, macOS permission flows, and actual Apple Silicon Whisper performance require a real Mac check before release.
