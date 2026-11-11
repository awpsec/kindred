# Local feedback and typography

Source-only UI polish, 2026-11-10. No release or native install.

| Before | After | Why |
| --- | --- | --- |
| Message Copy shows a checkmark and a global toast | Only the clicked button confirms success; repeated copies restart its confirmation interval | One acknowledgement per action, without overwriting unrelated notices |
| Themed dropdowns always use Inter | Dropdowns use the device's selected interface font | Menus match the surrounding interface, including the mobile system font |
| Bot-pane labels use fixed pixel sizes | Identity, tabs, Library labels/previews and computer resource labels follow the reading scale; tabs wrap when necessary | Text preferences carry through the pane without horizontal clipping |

Clipboard failures still use the existing error notice. Code and document fonts retain their separate families. This does not implement the proposed compact identity header, flatter file rows, or loading-state redesign.

## Verification

Passed in both Chromium and WebKit:

- `KINDRED_TEST_SCENARIO=copy node tools/frontend/test-message-actions.cjs`: real message action with a stub clipboard; local confirmation, no global success notice, repeated-click interval, failed clipboard/fallback error.
- `node tools/frontend/test-interface-font.cjs`: all three interface fonts in opened dropdowns, offline font loading, draft/persistence/storage synchronization, document/code font isolation, pane text at 100%/150% across 1180/390/320px, mobile system font preservation and simulated iOS text-size updates.
- `node tools/frontend/test-themed-selects.cjs`: pointer/keyboard selection, Escape/Tab dismissal, narrow dropdown bounds, light/dark theme switching.
- `node tools/frontend/test-bot-center.cjs`: retained detail form/computer canvas, keyboard tabs, responsive layouts, Library pagination and stale-response isolation.

The relevant existing test fixtures were updated to open Settings through the current account menu, expect the current dark panel color, and hold the first Library request explicitly instead of relying on a 60ms loading window.

The full message-actions suite also ran and failed its old quoted-message jump/highlight assertion after loading earlier history. The same failure reproduces with the original test and unchanged baseline `ui/app.js` at server commit `c2a97ebd3aac18cd7eac4fa15a2a2fc9ea12fd1c`. It is not counted as a passing suite or removed from the full test. Investigation of that separate navigation failure remains pending.

Browser checks do not replace native macOS/Windows/iOS acceptance. All changed UI and fixture files are synchronized between desktop and server. Test evidence and the unchanged-baseline reproduction are under `/opt/kindred/testing/local-feedback-typography-20261110/` in the development workspace.
