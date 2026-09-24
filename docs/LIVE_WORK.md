# Live work and desktop selection

## Teammate handoffs and notifications (0.48.21)

When a bot asks a teammate for help, its original DM displays a compact "waiting for answer from" status and an Open chat link. The shared chat shows the actual working bots without duplicating a waiting avatar. The wait survives a page reload, including when the helper needs your answer to a question. Once all requested helpers finish, the bot continues in the original conversation with their results. Opening the helper chat does not abandon the original task. Hover or focus the activity row to reveal its stop icon. Stopping cancels that task and its requested collaborators and pending questions; independent parallel tasks and queued user messages continue.

Newly completed replies have a persistent delivery record. If Kindred stops after
saving a reply but before waking its teammate, it completes that delivery after
restart. A temporary delivery failure can be retried without repeating an
already-delivered reply. Historical messages without a pending delivery record
are not interpreted as new requests. Pending delivery pauses during workspace
transfer and travels with the workspace.

A failed delivery remains pending for retry without blocking other replies in
the recovery batch or preventing startup and task scheduling. Its error is logged.
Failed receipts move to the end of the pending queue so a full batch of failures
cannot indefinitely prevent later healthy replies from being delivered.

Stop remains authoritative when a provider reply arrives at the same time. If
the reply was already completed, stopping it prevents any still-pending teammate
follow-up while retaining its historical result. Group replies addressed to
several teammates are queued together; if a queue or conversation limit prevents
delivery to the full group, Kindred shows a pause notice instead of starting only
some of that requested work. Archiving requires the bot's tasks to be finished
or stopped and its routines to be paused; the server enforces these rules too.

Consecutive completed connector calls from the same bot and task appear in one
expandable stack. Its summary shows the action count, apps, bot and latest record;
each original receipt keeps its source, content and actions inside. Approval
requests, failures and uncertain outcomes stay visible as individual cards.
Messages, task changes and the unread boundary separate stacks. Expansion and
reading position survive live updates, and a quoted receipt opens its stack.
Editing a pending connector draft also retains keyboard focus when another
receipt updates, so typing is not interrupted by background chat refreshes.

Completion notifications use the bot's name and a plain-text preview of its actual reply. Input-needed notifications preview the question or approval request. Windows notifications use the name and message without a portrait; Linux and browser clients can also supply the bot's portrait, subject to their notification system. Clicking a supported notification opens its exact conversation while the client remains running. Native macOS portrait and click behavior have not been verified.

Each bot retains its own server desktop. Common keyboard aliases such as CTRL+L and ENTER are normalized before the Linux desktop receives them; unsupported key names fail visibly instead of being reported as a successful action.

Kindred 0.48.10 keeps a bot's selected desktop in its server profile. The choice survives switching clients, restarting Kindred, and the desktop going offline. An offline or unavailable selection remains visible. Another online computer is never substituted for a specifically assigned computer.

**All paired desktops** allows the bot to select a registered desktop in this workspace, including desktops paired later. Each local tool call must name one exact device ID; calls are never broadcast. Global access, the bot's access toggle, and each desktop's permission mode still apply independently. A saved selection does not grant permissions.

Ordinary follow-up messages stay queued for the next task. The small **Steer now** button above an eligible queued message delivers that selected message into the existing task after its next completed tool action. Their files and selected reply remain attached. The message shows whether it is queued, waiting for the selected boundary, or already included. The original task continues unless the user changes or cancels it, and a status question asks the bot to respond before doing more work. One bot shows one active character in a conversation.

This is delivery at an action boundary, not an immediate interruption of a model response or command. Commands, scheduled work, teammate messages, and question continuations retain their own queued execution. A message arriving after the last tool action can still run as a separate queued turn. An interrupted task retains its delivered follow-ups without automatically replaying its actions.

The activity label and elapsed timer distinguish a desktop request, an approval wait, a running command, failure and lost contact. A terminal-shaped character accompanies command activity. If the client cannot refresh activity, the last known timer freezes and the animation stops. The timer measures the recorded action's elapsed time; it does not claim that the command is making progress. Long conversations receive an instruction to provide a factual update at tool boundaries when no public update has appeared for about a minute. The model still writes those updates; scheduled quiet runs remain quiet.

Windows local commands accept whole multiline UTF-8 PowerShell scripts through standard input. Their timeout defaults to 60 seconds and can be set from 1 to 120 seconds. Failed and empty commands retain their exit code, timeout or stop result and elapsed duration. Cancellation and disconnect continue to stop the owned process tree. A timeout may follow partial effects and must not cause an automatic retry or an unsupported claim that permissions or WSL access are impossible.

Commands on one paired desktop are serialized. A desktop that is still stopping
its current command cannot claim the next queued operation. Work on another
desktop remains independent. The native command runner owns its child processes
and stops them on cancellation, timeout, or exit of the parent shell.

The stop icon confirms that a stop was requested, then remains disabled while stopping until
the server reports the outcome. If refreshing status fails after the stop was
accepted, the UI retains that request and reports the refresh problem. It does
not claim the command has already exited or automatically submit another stop.

Command capture retains at most 256 KiB each of standard output and standard
error. A clipped result includes an explicit warning and `output_truncated`,
`stdout_truncated`, and `stderr_truncated` flags. The exit code and timeout result
still describe the process outcome; clipped output must not be treated as a
complete log.

When the user defers an answered decision, the continuation can finish quietly: the answered card is already the acknowledgement. The bot is instructed not to narrate its interpretation of the user's choice.

Claude's model menu shows the normal family/context choices by default. **Show model versions** exposes equivalent fixed versions. An existing fixed selection is preserved and remains visible; cleaning up the menu never changes a saved model automatically.

The Windows host investigated during this release returned `wsl --version` promptly, while independent `wsl --status` probes timed out both directly and through PowerShell. This establishes a host-side status-command stall. The release fixes command transport and reporting; it does not claim to repair that WSL service behavior or change its permissions.


## WSL workflow scope (0.48.11)

Bots must resolve the intended distribution and work/project path from the current request or confirmed saved context before searching or importing. When either is ambiguous, the guide directs a focused decision card using the actual available distribution names. Windows defaults and home-folder scans do not establish user intent. A project can have its own .claude folder and nested project scopes; bounded discovery must state its limits.

The native Windows file and workflow tools accept the local WSL redirector paths for distributions registered to the current Windows user. General network hosts, unregistered distributions and device-path forms remain rejected. Workspace-only restrictions, outside-path approvals, link checks, package limits and fingerprint review continue to apply. This is file access support, not permission to start a broad system repair or execute imported instructions.


## Refreshing imported workflows (0.48.12)

Local imports save the verified source desktop/path and package baseline. Bots can list, preview and update existing imports using skill_refresh_local. A normal request to pull newer versions authorizes nonconflicting updates; unchanged items are skipped. Names, slash commands and custom settings remain stable. Both reviewed source and installed hashes are checked again before the atomic update. Frozen invocation receipts retain their earlier package.

Concurrent source/Kindred edits are reported as conflicts and preserved by default; replacing Kindred edits requires an explicit user choice. Missing or offline sources leave installed copies untouched. Refresh never deletes entire skills, starts a watcher, executes workflow scripts or reads a substitute desktop. Uploaded or old unlinked imports can be linked by a verified local re-import of the same unchanged package; client-supplied origin fields cannot forge a desktop binding.


## Persistent control handoffs (0.48.13)

Manual control is persisted per bot screen. A notification lists every paused screen in the current workspace, identifies its recorded cause when available, and offers Return control for that exact bot. It stays until dismissed or control is returned. Dismissal does not resume anything; a return action stays in the paused bot's chat. A new pause or newly queued work resurfaces the notice, and reopening Kindred reveals outstanding pauses. Older flags without provenance are described as unknown rather than attributed to the user.

Opening an app shortcut can acquire manual control, as can explicit control and teaching. New acquisitions record the action, start time and unique control ID. Rejoining a paused screen uses its existing hold without cancelling queued tasks. Returning control closes interactive sessions and releases only the selected screen, checks the notice's control ID, and does not cancel tasks or mark a requested human subtask complete. Pauses remain persisted across server restarts; there is no automatic takeover release.

## Shared conversation continuity (0.48.35)

Exact tags and ordinary direct names select group recipients, including names following a greeting or a sentence boundary. A general group message can start independent work for multiple bots. Explicit IDs are preferred when names are ambiguous. Teammate requests can wake addressed members; active members receive new teammate posts at tool boundaries. Courtesy mentions, code and block quotes do not create automatic reply chains. Chains retain the 24-turn and 12-level bounds.

Bots can discover their existing conversations with chats_list, including empty user-created groups, read saved history with chat_read, and actually post to an existing shared group with chat_post. Posts use stable receipt keys to prevent duplication. Recent excerpts from a bot's other shared chats supply continuity when returning to its DM. Full history remains paginated and long messages can be read in chunks. Other bots' private DMs and memories are excluded; shared messages remain attributed history.

The bot_instructions_get and bot_instructions_update tools support requested changes to another existing bot's role instructions. Every change requires the user's one-time Allow, including Full access. A declined, cancelled, archived or stale edit does not overwrite instructions. The review shows the current and proposed text. Only future tasks receive the revised instructions.
