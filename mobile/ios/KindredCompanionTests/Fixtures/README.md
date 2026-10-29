dictation-speech.caf is a nonprivate generated speech fixture produced locally
with macOS `say`, Samantha, 145 words/minute, 16 kHz mono PCM. It says:

“The blue bicycle is beside the window.”

After a 1.5 second pause:

“The green garden is quiet today.”

The KindredSpeechTests scheme opts into real on-device Apple recognition using
this bundled file, without opening the microphone. Default simulator suites
continue to skip this opt-in test. Speech permission and installed on-device
language support are still required. The scheme uses the existing Personal
app signing and app-hosted tests without a separate UI-test runner app.
