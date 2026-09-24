# Waiting for long commands

Bots can run long commands through `guest_exec` or `local_exec` with
`background: true`, a short `title`, and an optional `max_seconds` deadline.
The VM uses `/workspace`; desktop commands keep their existing selected device,
working directory, approval policy, and native local-access permission check.
Foreground command limits remain unchanged.

The launch returns a managed command ID. `command_wait` takes one or more IDs and
a short continuation plan. It ends the provider turn and releases the computer
and scheduler slot. A saved wait survives server restarts. If a bot ends its turn
without explicitly waiting on its outstanding commands, the scheduler saves a
wait for those launches. The server also reconciles a launch interrupted before
that wait was saved. It never repeats the launch to recover a missing receipt.

The server checks VM receipts in one batch every five seconds. Desktop receipts
travel over the existing authenticated local-access heartbeat. These checks make
**no model calls**. Once all commands in a wait finish, a transaction queues one
continuation in the original chat with the original task, continuation plan,
exit statuses, and bounded output tails. Routine and teammate ownership follow
the continuation; waiting routines do not queue repeated overlapping checks.
Normal model usage resumes for that continuation. Existing task/round budgets
still apply, and a blocked follow-up is reported rather than silently dropped.

Chat shows a quiet waiting avatar and “Waiting for X commands” below active
work. Expanding it shows one grey line per command and an unobtrusive stop
control. Active work takes visual priority. Status updates don't create messages,
notifications, or fake completion percentages. Bots can use `command_status` for
a requested progress report and `command_stop` to request cancellation. Model
access to receipts is scoped to the bot and conversation. Shared server chats
show a waiting indicator; private raw command output stays with the bot owner.

Each command uses a detached native worker with an exclusive lock, immutable
claim marker, incremental output, and an atomic final receipt. Repeating the
same launch ID cannot execute the command twice. It works without an open chat
window. Desktop receipt delivery resumes when the originating profile reconnects;
switching profiles does not move a command to another computer or account.

Cancellation reaches the managed shell/process group (a Job Object on Windows).
Already-completed remote effects are not undone. Native permission revocation,
account rejection, archived ownership, and task cancellation request a stop.
An offline machine cannot receive a new stop request until it reconnects; the
worker's existing deadline still applies. Default deadline: one day; maximum:
seven days. Up to 16 concurrent managed commands per account are supported.
Receipts retain the last 32 KiB of combined output with an explicit truncation
flag. Save full logs to files when needed. Journals stay in the profile's
`commands` directory (VM: `~/.local/share/kindred/commands`).

An offline target remains visibly waiting, without AI polling. A missing or
crashed worker returns an unknown outcome, not success or permission to retry.
An SSH command should keep its remote workload in the foreground. If SSH drops,
the remote job may still exist: inspect it before retrying. Programs deliberately
detached from the managed process group are not supervised by this worker.
This is command-completion continuity; it is not a general filesystem watcher.

Both updated server/guest and native client are needed for desktop execution.
An older paired client gets a clear upgrade requirement before any launch.
VM-only commands require the updated guest binary. VM maintenance and workspace
transfer wait for managed commands as well as active model turns. Releases must
include managed commands when inspecting active work before deploying/restarting.

Validation: backend lifecycle tests cover ordering, duplicate receipts, isolation,
stop propagation, restart, and routine continuity. `tools/test-managed-commands.py`
exercises real detached subprocesses with benign temporary files, including an
optional 65-second command beyond the old limit. The Chromium/WebKit UI test is
`tools/frontend/test-command-wait.cjs` in the desktop repository. Native Windows
and macOS acceptance remains separate from Linux and headless WebKit validation.

Implementation checks (build-host/production-server, isolated test data): full backend
suite passed 368 tests; the final focused lifecycle checks passed 17 tests after
adding coverage beyond the recent-history window. Chromium and WebKit passed
the quiet waiting UI at desktop and 390px widths, including six simultaneous
commands beneath active work. Real worker checks cover incremental receipts,
no duplicate launch, partial output/failure, cancellation with a full stdin pipe,
bounded output, and execution beyond the previous foreground timeout.
No release builds, paid CI, or production deployment were run for this change.
