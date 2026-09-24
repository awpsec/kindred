# Lists and reminders

Ask a bot to turn your objectives or action items into a shared checklist:

> Look at today's objectives on my Monday board and the scope we discussed in
> Confluence. Make a list for today, start with scope preparation, and remind me
> at noon to start scans for that client.

The bot can use context already established in this conversation and read the
relevant connected sources when access is available. It should resolve the actual
client name and retain source links. If the client or time is ambiguous, it asks
for the missing detail. A referenced document provides context; it does not grant
permission to perform the actions described in it.

## Work through a list together

A saved list appears as an interactive card in the conversation. The first item
is current unless you requested a different starting item. Use a checkbox or say
“that's done” to cross off the current item. Completing it moves focus to the
first remaining pending item. **Focus** selects another item. **Work on this**
sends a normal request to the list's bot in the same conversation, with the saved
list and source context available to it. Normal tool permissions still apply.

Checking an item or moving focus does not execute a task. A bot should only mark
its work done after verifying the result, and should wait for your confirmation
before marking your own work done. The rest of your list remains available as you
continue chatting.

Use **Edit** to rename a list, change item titles, add or remove items, reorder
them, or archive a finished list. You can also ask the bot to make these changes.
Edits retain item identities and check for intervening changes, so a bot cannot
silently overwrite a checkbox you just changed using an older revision.

Ask in chat to list, review or update saved lists and reminders. A browsable record
also lives under **Bot Details → Artifacts**, alongside files and interactive
artifacts. It loads 20 metadata records at a time and fetches a list's items only
when opened. Changing pages replaces the previous page; there is no background
polling of the library. Lists belong to their conversation and are shared with
its current members. They remain in the profile database after restart. Each list
supports up to 100 items.

If the artifact index or record cannot load, it shows the error and **Retry**.
A failed checkbox save restores the saved value and allows another try.
Save errors appear inside an open editor, which keeps your draft. If the server
confirms a save but the conversation cannot refresh, Kindred reports that the
save succeeded rather than asking you to submit it again.

## Set a one-time reminder

The bot saves the resolved message, exact local date and time, and named time
zone. Noon is 12:00 in that zone on the requested date. If that time has passed,
or falls in an ambiguous daylight-saving transition, the bot needs a future,
unambiguous time rather than silently moving it to tomorrow.

The reminder card confirms what was actually saved. **Edit** changes its message
or delivery time, and **Cancel** cancels it. You can make the same requests in
chat. Delivered reminders remain in history; another occurrence requires a new
reminder. Retries with the same occurrence key reuse the saved record.

Delivery adds one reminder message to the conversation and a notification event,
without queuing a bot run or waiting for its computer. A busy bot, unavailable AI
provider, or full worker queue does not prevent delivery. A reminder to start a
scan sends that reminder text; it does not start the scan.

The Kindred server must be running. If the server is down, the account is paused,
or the bot/conversation is archived, delivery waits until it is available again.
An overdue reminder then appears once; the chat labels late delivery. Desktop
alerts use the existing notification preferences and require a connected app.
Reminders remain in the conversation even if desktop alerts were disabled or
missed while the app was closed.

Workspace transfer includes lists and reminders. The source workspace freezes,
and pending reminders import as **Paused**. Choose a future time through **Edit**
or ask the bot to reschedule them in the destination. This prevents a transfer
from creating two active copies of a reminder.

For a future action that needs the bot to check something or run a workflow, use
a scheduled routine. Simple reminders use direct notification delivery.

## Implementation and verification

The same `planning_list`, `checklist_create`, `checklist_update`, `reminder_set`,
and `reminder_update` tools are available through each provider harness. Prompt
assembly includes conversation-scoped state, and tool boundaries expose current
revisions so a bot can fetch and merge recent user edits.

SQLite transactions keep delivery status, the chat message and notification
event atomic. Delivery commits separately from executable routine scheduling.
Tests cover repeat requests, stale edits, conversation scope, safe source URLs,
local noon and daylight-saving validation, cancellation and rescheduling,
delivery during an active run, transaction failure, restart, notification
preferences and workspace transfer. Browser fixtures cover the interactive
controls and responsive dark/light layouts. These fixtures use a synthetic
client and do not establish access to a real Monday board or Confluence page.
