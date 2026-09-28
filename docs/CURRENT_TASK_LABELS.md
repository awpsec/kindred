# Current task labels

A bot can have one short label describing its current assignment. It is shown as a subtle chip beside its name in the chat header. Sidebar role badges stay unchanged; the task remains available in hover text and search. Hover or focus the header label to remove it; on smaller screens, use **Bot actions → Remove task label**.

- `/task ACME External Pen` sets the label in a bot’s DM.
- `/task-remove` clears it.
- In a group, name one teammate: `/task @Seneca ACME External Pen` or `/task-remove @Seneca`.
- Plain-language requests are handled by the bot using `bot_task_update`. Bots can label themselves or teammates; they should set a teammate’s label before delegating with `send_to_bot`.

Setting or removing a label never starts, stops, schedules, or queues work. Labels persist through restarts, waiting and individual turns. Bots should clear them when the overall assignment ends, rather than whenever they finish a reply. Archiving a bot clears its label.

Direct commands update immediately without a model call or transcript message. API changes use the current revision. Bot changes also check the assignment snapshot from the start of their turn, preventing older work from clearing or restoring a label changed meanwhile. Preference edits preserve the saved label.

Existing custom commands named `task` or `task-remove` are retained under a unique `skill-task` or `skill-task-remove` name when the server updates.
