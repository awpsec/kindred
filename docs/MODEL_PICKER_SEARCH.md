# Model picker polish — 2026-09-20

General settings uses a spaced Default model form with separate provider, model, thinking and save controls. The introductory explanation is removed. Saved feedback clears when the selection changes.

Both General and bot model controls opt into the shared themed picker's searchable mode. Opening focuses a separate sticky search field. Typing filters display names and model IDs with case-insensitive terms and normalized punctuation: `GLM 5.3` or `z-ai/glm-5.3` finds the same model. Search does not alter the underlying selection until a result is chosen. Arrow keys and Enter select from matching options; Escape restores focus without selecting, Tab moves onward, disabled choices remain disabled and an empty result has explicit feedback. Other select menus retain their existing behavior.

Validation: Chromium and WebKit model-default tests use a 2,003-model fixture and verify search in General settings and bot creation, stable query after typing pauses, original option/value mapping, keyboard selection, empty results, Escape, persisted defaults and desktop/mobile spacing. The existing Chromium themed-select regression passed. Browser fixtures do not replace native macOS acceptance. No backend change or release is included.
