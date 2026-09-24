# Configurable model defaults

Settings → General → Default model saves the provider to start new bots with and a model/thinking selection for that provider. Each provider retains its own saved selection. This is scoped to the current Kindred account/server, not a device-wide preference.

A bot whose model is empty follows its provider's General default when its next task starts. Explicit model selections are unchanged; an explicit thinking level overrides inherited thinking. Changing the preferred provider does not move existing bots to a different provider. With no configured Codex default, its existing provider-account default remains available. Other providers without a configured default need an explicit model and receive an actionable error rather than a guessed model or provider fallback.

General settings updates from older clients preserve these fields when omitted. The UI verifies the saved response before confirming success, so an older server that ignores the new fields cannot falsely report that the default was saved.

Validation: Chromium and WebKit browser fixtures cover saving model/thinking choices, switching providers without losing prior defaults, reload persistence and new-bot inheritance. Server tests cover explicit overrides, provider isolation, missing defaults, old-client preservation and invalid updates. `cargo check --tests` passes; the new Rust tests were compile-checked, not executed in this pass. Matching desktop/server source must ship together; no release was published.
