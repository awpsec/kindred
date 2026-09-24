# Writing messages

Type `- `, `* ` or `+ ` at the start of a line to begin a bulleted list.
**Enter** adds the next bullet; Enter on an empty bullet exits the list.
**Tab** indents and **Shift+Tab** outdents. Outside a list, Enter sends the
message and Shift+Enter inserts a line break. Ctrl/Cmd+Enter can send while
editing a list; the Send button remains available.

**Ctrl+Shift+8** (**Cmd+Shift+8** on macOS) remains an optional shortcut to
convert selected lines or remove list formatting. The composer + menu contains
Attach files and Teach a task. List formatting is part of typing.

Pasted Markdown and restored drafts support continuation and indentation too.
Lists are sent and saved as ordinary Markdown, including nested lists produced
by Chromium's and WebKit's different DOM structures. Mention chips and native
undo remain intact.

The shared UI serializes browser line wrappers without adding a trailing line or
joining adjacent lines. It preserves intentional internal blank lines. Sent user
messages render line breaks through Markdown instead of preserving incidental
whitespace between generated HTML elements. Single-line messages therefore have
one line of content plus the normal bubble padding. Plain-text fallback messages
keep their whitespace, and code blocks retain their existing formatting.

The Artifacts refresh control is an icon with the accessible name and tooltip
**Refresh artifacts**. Its fixed dimensions prevent the previous wrapped label
at narrow widths. Linux now defaults to 115% reading size; saved preferences are
not overwritten. The default change applies to shared chat UI and bundled
Accounts/permissions pages.

## Opening conversations

A small animated version of the selected bot appears while an uncached
conversation prepares its initial history and necessary task details. The
message area becomes visible and interactive after its scroll position is
restored. Ready cached conversations retain their immediate opening and saved
reading position. Sidebar navigation and the composer remain available.

When opening at the newest unread message returns only a short tail, Kindred
fetches preceding context up to the normal 50-message page before revealing it.
It does not load the entire history or wait for imaginary older messages in a
genuinely short conversation. Subsequent history paging preserves the existing
readable messages and scroll anchor. Failed opening requests show Retry; late
responses cannot replace another selected conversation. Reduced-motion settings
turn off the loading animation.

## Verification scope

`tools/frontend/test-composer-lists.cjs` runs in Chromium and WebKit with Linux,
Windows, and macOS platform fixtures. It checks typed line breaks, intentional
blank lines, sent payloads and bubble height, typed markers, Enter continuation, Tab indentation, selected-line lists, continuation
and exit, undo, mention preservation, IME Enter, paste, draft reload, and reading
preferences. `test-feedback-library.cjs` checks the refresh icon at 1280, 800 and
390 pixel widths, manual refresh, and explicit size persistence.

`test-chat-opening.cjs` holds history and historical task-detail responses
separately to verify that the bot remains visible until the first page can be
scrolled. It checks immediate cached opening, real single-message chats, failed
loads and Retry, navigation during a delayed response, and reduced motion in
Edge and WebKit. Existing history, reload, unread-attention, composer-motion and
connector-stack suites also cover the surrounding behavior.

The existing composer-motion, send-flow, send-recovery, commands, dictation,
artifacts and user-flows suites also pass in both engines. The dictation suite's
real browser microphone/transcript checks run in Edge only; WebKit covers its
local IPC fixture, settings and layout. No real provider request was sent.

These are source and browser-fixture checks, not acceptance of new native
packages on the owner's machines. The changes remain unreleased; a future
approved release must rebuild both desktop packages and the server, including
the standalone server bundle. A desktop-only update cannot replace an older
server's chat UI.
