# Native macOS window frame

Main, Accounts and Local Access windows retain AppKit decorations on macOS so
AppKit owns rounded outer corners, resizing, shadows and fullscreen behavior.
The main window uses Tauri's Overlay titlebar style with a hidden title and native
traffic lights inset into the existing sidebar header. Its startup script sets
`__KINDRED_MAC_OVERLAY`; shared UI omits the HTML traffic-light buttons only when
that flag is present. Older installed clients retain their existing controls.

Accounts and Local Access use the standard native titlebar and the existing
`__KINDRED_NATIVE_FRAME` path to hide their HTML chrome. The updater already uses
a native decorated window. The special transparent notch surface stays borderless.

The builder APIs and macOS gates were checked against the pinned Tauri/Wry source.
Browser tests exercise both legacy and overlay startup flags, checking that no
extra top row or duplicate HTML controls are introduced. Browser screenshots do
not include native corners or native traffic lights.

A rebuilt Apple Silicon client is required; UI-only repackaging cannot change
NSWindow construction. Before release, verify all four corners in both themes,
traffic-light alignment/actions, resizing, maximize/restore, fullscreen entry/exit,
and the Accounts and Local Access windows on macOS. Native acceptance remains
pending; Linux compilation cannot validate the macOS-only builder configuration.

Validation: Chromium and WebKit UI checks passed. A cold Linux desktop dependency
build was stopped before completion; it does not verify the macOS-only branch.

## Window control sizing

The legacy HTML fallback now uses 14 px circles on 23 px centers, centered in the
57 px header independently of chat text scaling. Overlay clients still render
only AppKit's controls; the UI must not overlay a second set of colored circles.
On macOS 26 the main window explicitly requests noncompact control metrics on
its native frame view, guarded by selector availability on older systems.

Release builds select a macOS SDK >=26 (when installed) and fail clearly rather
than silently building with older appearance metrics. This does not raise the
app's deployment target. The SDK-dependent behavior is tracked upstream in
[Tauri #15434](https://github.com/tauri-apps/tauri/issues/15434); the native setting
is [NSView.prefersCompactControlSizeMetrics](https://developer.apple.com/documentation/appkit/nsview/preferscompactcontrolsizemetrics).

Verify the rebuilt app against a native window on the same Mac, at the same
screen scale: circle diameter, spacing, active/inactive appearance, hover glyphs,
close/minimize/fullscreen, and alignment after resize/fullscreen exit. Browser
checks cover the fallback dimensions/actions and suppression in overlay mode;
they cannot establish native visual parity. Reusing an old native binary in a
UI-only repack is insufficient for the native sizing change.
