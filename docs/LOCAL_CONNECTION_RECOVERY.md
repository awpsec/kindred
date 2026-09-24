# Local desktop connection recovery (2026-09-19)

An account restart spawns its replacement before exiting. The local bridge previously tried its exclusive lock once and permanently stopped if the outgoing process still held it. It now retries lock contention without registering another bridge, changing identity or permissions, or claiming operations. Other lock errors still surface immediately.

Computer settings now displays native status errors even when no device ID is available, including IPC failures that previously became null silently. The current computer shows online, connecting, or disconnected explicitly. An in-flight refresh cannot replace an active rename form.

Arcadian incident: the supplied 0.56.0 screenshot shows a saved offline desktop with full access assigned to Rowan, but no current-device identification. This is compatible with initialization failure; the actual native error was hidden. The lock race is a verified code defect, not a confirmed diagnosis of that particular device. Fully quitting and reopening is a useful recovery check. Do not reset its saved pairing or permissions without further evidence.

Validation: JavaScript syntax, Rust formatting/parser check and shared UI parity passed. Chromium and WebKit settings regressions passed, including failed native IPC, initialization error without device ID and subsequent recovery. Full desktop cargo check was stopped during dependency compilation due to constrained host resources; no native macOS run was performed. Source changes require a future release before affecting installed clients.
