# Writing messages

Type `- `, `* ` or `+ ` at the start of a line to begin a bulleted list.
For a numbered list, type one to three digits followed by `. `, such as `1. `
or `100. `. The starting number is preserved when sent or restored. Four-digit
prefixes such as `2024. ` stay plain text.
**Enter** adds the next bullet or number; Enter on an empty item exits the list.
**Tab** indents and **Shift+Tab** outdents. Outside a list, Enter sends the
message and Shift+Enter inserts a line break. Ctrl/Cmd+Enter can send while
editing a list; the Send button remains available.

**Ctrl+Shift+7** (**Cmd+Shift+7** on macOS) toggles numbered lists.
**Ctrl+Shift+8** (**Cmd+Shift+8** on macOS) toggles bulleted lists. These
optional shortcuts convert selected lines or remove that list formatting. The composer + menu contains
Attach files and Teach a task. List formatting is part of typing.

Pasted Markdown and restored drafts support continuation and indentation too.
Lists are sent and saved as ordinary Markdown, including nested lists produced
by Chromium's and WebKit's different DOM structures. Mention chips and native
undo remain intact. Undo after autoformat restores the literal prefix; typing a
space next keeps that line as plain text.

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

## Leaving and returning to the page

Navigation pauses new API requests before the old document leaves. If you choose
Stay in the teaching confirmation, the first click or keystroke resumes updates
once that document can render again. Automatic polling waits for that interaction;
there is no portable event identifying a cancelled leave-page dialog. The original
action waits for recovery rather than being dropped or replayed. Returning through
page history also resumes updates.

A change already sent is kept intact if navigation is cancelled. If the page leaves
before its response is confirmed, the result is uncertain: check whether it completed
before retrying. A change waiting for page recovery is reported as not sent if the
page leaves first. Neither state automatically repeats a write.

## Verification scope

`tools/frontend/test-composer-lists.cjs` runs in Chromium and WebKit with Linux,
Windows, and macOS platform fixtures. It checks typed line breaks, intentional
blank lines, sent payloads and bubble height, typed markers, Enter continuation, Tab indentation, selected-line lists, continuation
and exit, undo, mention preservation, IME Enter, paste, draft reload, and reading
preferences. `test-numbered-lists.cjs` checks start values, numbered autoformat,
Enter/exit, native undo, four-digit plain text, multi-digit parent indentation
through actual sending and rendering, and marker containment under text scaling,
CSS zoom and different viewport widths. `test-feedback-library.cjs` checks the refresh icon at 1280, 800 and
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

## Working bots and queued messages

Settings → General saves **While a bot is working** for this workspace. The
initial choice is **Steer**. Send asks to add a message at the bot's next safe
boundary. If that is unavailable, it queues the message and says so. **Queue**
keeps new messages for a later task. Changing the setting does not change messages
already sent. Older clients keep their existing queue behavior.

Edit is available while every recipient delivery is still queued. With an existing
draft, choose **Add below**, **Replace draft**, or **Cancel**. The server removes
all queued deliveries together before restoring the text, attachments and reply.
A message already consumed by a recipient cannot be withdrawn. After editing,
Send submits a new message using the current setting.

## Pending requests and task progress

Simple approvals and choices appear in a tray above the composer. Its pager uses
request IDs and creation order. Minimize keeps the count and any custom answer.
Server-confirmed terminal request identities suppress older pending-feed reads,
including after a receipt page unloads. A different request keeps its own controls.
Approvals and choices each appear once; their terminal receipt stays at its
original chat position. Approved means permission was granted, not that an action
succeeded. Email reviews and computer handoffs remain in the conversation.

**Summaries** is an experimental fourth progress option. Balanced remains the
default. Each run records its mode when it starts; later preference changes apply
to new runs. Only explicitly tagged commentary for that run and phase can group.
Long tasks with at least three updates use an inset disclosure. Short tasks and
historical messages without tags remain ordinary messages. Final results, files,
errors and requests stay outside. Completion does not collapse a group being read
or one manually expanded.

Reminders created in one task share a stable pager. Scheduling edits and
cancellation keep each reminder's ID and position; an older untagged reminder
never joins a batch because it happens to be adjacent.

## Email review and delivery

Review opens the full email card. Save edits changes the reviewed revision and
never sends. Send requires approval of that exact revision. The card says Sent
only after the connector returns success. A pre-dispatch failure stays Not sent;
a lost or failed dispatch receipt is Delivery unknown. Check the Sent folder
before requesting another review.

Review to send again opens a prefilled editor and requests a fresh bot review task,
with a new card and approval. It cannot replay the old call. The old card and its
delivery state stay in history. This path requires the bot to prepare the new draft;
requesting review does not mean that the new draft is ready or sent.
