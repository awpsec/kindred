# Unfocused chat motion

Finite presentation effects require a visible, focused document. Blurring the window settles tracked effects to their final state immediately. Incoming replies received while unfocused do not queue opacity fades, and message arrivals retain their original timestamp rather than restarting a fade when mounted later.

This addresses a concrete animation lifecycle gap that could contribute to recent-message flashes on Linux pointer re-entry. It has not been reproduced or verified in the native client on linux-client; a Linux compositor/WebKitGTK-specific cause is not ruled out.

The regression test covers three simultaneous reply fades, blur settlement, unfocused arrivals, pointer/focus re-entry and expired arrival timestamps in Chromium and WebKit. Existing foreground motion remains enabled.

The broader motion-polish test passed its Chromium Linux and Windows cases, then stopped on a macOS mobile-layout title-bar/menu overlap. That layout issue was not changed here.
