# Linux UI validation

The hosted UI and native desktop are separate components. A newer desktop still displays the UI served by the selected backend. The changes described here are unreleased; do not package, publish, run GitHub Actions, or deploy without the owner's specific approval.

## Typography and editing

The main UI now serves Inter 4.1 variable regular and italic fonts with the app. Intermediate weights such as 550 and 650 no longer depend on which font files a distribution happens to install. Files are unmodified upstream assets; `ui/fonts/SOURCE.json` records the pinned revision and hashes, and `LICENSE.txt` contains the SIL Open Font License. No external font service is contacted.

Composer line height follows the reading-size preference. Browser rich-text shortcuts are suppressed because the composer serializes plain text and lists; previously Ctrl+B/I/U could change draft appearance even though sending or restoring the draft discarded that formatting. Explicit Markdown emphasis in messages is preserved. Sidebar names retain space while secondary labels and timestamps wrap.

History paging now retains a scroll request made during a background refresh. Refreshing visible messages also preserves a failed page's Retry action until explicit retry or navigation resolves it.

## Browser checks

With Playwright and its browser runtime installed:

```sh
WEBKIT=1 node tools/frontend/test-linux-layout.cjs
node tools/frontend/test-linux-layout.cjs
WEBKIT=1 node tools/frontend/test-history-refresh-race.cjs
node tools/frontend/test-history-refresh-race.cjs
```

Use `KINDRED_PLAYWRIGHT_MODULE` for an existing external installation and `KINDRED_TEST_ARTIFACTS` for screenshots/results. All API data is synthetic and local. The layout check covers four reading sizes, four viewport sizes, four raster densities, Settings bounds, regular/intermediate/italic font loading, intentional Markdown emphasis, long inline code, sidebar names, and plain-text shortcuts. The history race check holds an actual fixture response open while scrolling and verifies Retry survives a subsequent refresh.

Also run the existing composer-lists, composer-motion, send-flow, send-recovery, chat-reload, message-actions, paste-images, settings-polish, themed-selects, chat-history, chat-opening, chat-transitions, group-presentation, and group-sequences acceptance checks. The Settings fixture replaces `navigator.mediaDevices` itself because WebKit may return fresh wrappers; mutating an individual wrapper did not reliably install the synthetic devices.

## Native Linux checks

Run `tools/frontend/test-native-linux-layout.cjs` as a normal desktop user under an X11/Xvfb display with a D-Bus session, `KINDRED_NATIVE_EXE` set to the unpackaged candidate, and an optional writable `KINDRED_TEST_ARTIFACTS`. It requires xdotool and Python's GObject/Gdk bindings for input and screenshots. It uses isolated temporary profiles and never connects to a live backend.

The test starts the real Tauri/WebKitGTK app with GTK scale/DPI combinations 1/1, 1/1.25, 1/1.5, and 2/1. It checks 96 composer configurations in dark/light themes and 24 Settings tab visits, including native Ctrl+B behavior and exact whitespace preservation. Fractional viewport measurements allow the documented rounding difference between integer scrollWidth and fractional layout width. Optional `KINDRED_GTK_CONFIG=gtk-1-dpi-1.25` selects one configuration for focused investigation.

## Scope of the 2026-09-14 checks

Tested on build-host, Debian 13, using native WebKitGTK under Xvfb/Openbox and software rendering, plus Playwright WebKit and Chromium. These checks do not establish behavior on every distribution, KDE/KWin Wayland, a particular GPU, physical microphone, or real high-DPI panel. KDE-specific compositor and font-DPI settings on linux-client remain a separate device acceptance check. Server source compilation and local fixtures do not deploy anything to production-server.
