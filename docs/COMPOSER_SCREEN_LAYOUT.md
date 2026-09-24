# Composer and screen layout

Long drafts expand above the composer controls and span the full width, placing
the scrollbar above the rightmost Send/Dictate button. Short drafts retain the
compact single row. Wrapping is measured at the compact width to prevent layout
oscillation, including after window resizing, text-size changes, attachments,
reply previews and dictation state changes. The existing contenteditable node,
selection and draft are retained.

The computer toolbar uses icons at narrow panel widths, with the current action
as its accessible name and tooltip. Wider panels show text beside each icon.
Buttons keep a consistent height when switching between those presentations.

Screen expansion animates the panel's real position, width and height and the
screen's height. It does not scale the live canvas's ancestor: noVNC measures
that ancestor and previously scaled an already-scaled viewport, then snapped
back at animation completion. The same canvas and connection survive the
transition. Reversing takes the current interpolated bounds; resizing or closing
cleans up temporary geometry. Reduced motion changes the layout immediately.

`tools/frontend/test-composer-screen-layout.cjs` checks Chromium and WebKit at
390–1320 px and 100/150% text size, scrolling with dictation enabled, compact
actions, monotonic expansion/collapse, reversal, window resizing, reduced motion
and canvas identity. Existing composer reply-motion and dictation tests cover
the interacting states. Physical Mac animation acceptance remains separate.
