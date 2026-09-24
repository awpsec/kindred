# Commands and reusable skills

Type `/` in any bot chat. Suggestions appear above the composer and filter as you
continue typing. Choose with a click, or use ↑/↓ and Enter/Tab. Selection inserts
the command without running it. Gray `<required>` and `[optional]` hints show the
remaining inputs; the hints are never sent as part of your message.

Suggestions follow the caret, including within a sentence, a multiline draft or a
list. Selecting one replaces only the `/prefix` being edited and preserves the
surrounding text and mentions. `Explain /domain-review before we use it` is an
ordinary message with a command reference, not a command invocation. The bot's
live context identifies matching references and its read-only `command_read` tool
retrieves saved instructions and parameter definitions before responding. Reading
leaves placeholders unresolved and does not run scripts or grant execution scope.
Unknown references remain ordinary message text. URLs, file paths and `//` literals
are excluded from automatic reference discovery.

Workspace commands are private to the signed-in profile. Shared server rooms show
an explanatory note instead of silently hiding the picker; use a private bot chat
for workflow invocation. A failed catalogue request offers Retry without clearing
the draft.

## Defaults

| Command | Purpose |
| --- | --- |
| `/skills` or `/commands` | Open the library without starting a bot task |
| `/new-skill <description>` | Ask the bot to save a reusable command |
| `/summarize [focus]` | Summarize the conversation or a quoted message |
| `/remember <fact>` | Save a lasting fact in this bot's memory |
| `/routine <instructions>` | Create or update a scheduled task |
| `/check-email [focus]` | Check connected Gmail |
| `/send-email <recipient> <message>` | Prepare and send through Gmail |
| `/calendar [when]` | Read connected Google Calendar |
| `/schedule <when> <event>` | Create a Google Calendar event |

Gmail/Calendar commands appear only with an active connected account. Sending and
scheduling also require an account configured to allow actions with approval.
Commands use the same account permissions and approval flow as ordinary requests.
Ambiguous accounts, recipients, event times or missing details may require a question.
These defaults are supplied by Kindred; installing a connector does not import an
arbitrary third-party slash-command package.

Examples:

```text
/check-email messages needing a reply today
/schedule "tomorrow at 2 PM Eastern" 30-minute project review
/new-skill Create /domain-review with domain and userlist inputs. Review the supplied domain and list, then return a concise report without making changes.
/domain-review example.com "C:\workspace\user list.csv"
```

## Make a skill yourself

Open **Settings → Skills → Add skill**. Give it a name, slash command, short
description and instructions. Specify parameter names separated by spaces, such as
`domain userlist [notes...]`. Brackets make an input optional. A final `...` input
collects the rest of the message. Required inputs come first; at most eight are
supported. Use `{{domain}}` or `{{userlist}}` in the instructions to refer to inputs.

Quote an input containing spaces. Apostrophes within words are literal, so
`today's` and `don't` need no escaping. Paragraphs and line breaks in a final
`...` input are preserved. Instructions and named inputs are delivered to
the bot separately; this is a reusable model workflow, not direct shell execution.
The bot still needs to inspect the relevant files or connected apps and verify its
work. Command selection alone does not execute anything.

The library is shared by bots in your profile. Each profile has its own library.
Bots can save or update skills through `skill_save`; `/new-skill` asks for creation
without executing the newly saved workflow. Editing or deleting a skill affects
future invocations; already queued tasks retain their original instructions and inputs.

Leave the slash command blank while editing to retain a skill without exposing an
alias. Existing skills receive stable aliases on upgrade. Commands must use lowercase
letters, numbers, hyphens or underscores, start with a letter, and be unique. Built-in
names are reserved. Use `//command` to send literal slash-prefixed text.

## Use a command in a routine

A routine can contain a saved command, such as `/domain-review example.com "staff.csv"`.
Both the schedule and **Run now** resolve it when the task is queued. Each run keeps
its instructions and inputs even if you edit the skill afterward. Future runs use
the updated skill. If its alias is deleted or its required inputs change, that run
fails visibly before starting the computer or requesting a model; other routines
continue normally. Edit the routine to use the current command and inputs.

## Routine results

Routine runs keep working details in task history and deliver only their final
report to chat. If a check has nothing to report and its instructions call for silence,
`finish_quietly` completes without a new reply or completion notification. Questions,
approvals and genuine failures remain visible. Old redundant chat deliveries are
hidden without deleting their underlying records.

## Import workspace workflows

Open **Settings → Skills → Import workflows**. Choose a workspace or `.claude`, `.codex`, `.agents` or `.pi` context folder,
one complete skill folder, or individual command/prompt `.md` files. Review the
instructions, included files and compatibility notes; select workflows and import.
For a skill with supporting scripts or templates, choose its entire folder.
Imports create profile-owned copies. Existing names require a rename or an explicit
reviewed replacement; unchanged packages are idempotent.

With Local access enabled and your desktop paired, you can also ask a bot:

> Find, review and import commands, prompts and skills from my selected workspace into this profile.

The bot uses `local_skill_scan` on the selected workspace or context folder.
An empty path checks known `.claude`, `.codex`, `.agents` and `.pi/agent` home
locations without traversing unrelated home files. It then previews and
imports each package through `skill_import_local`. Your desktop's workspace/ask/full
permissions still apply. A missing or offline desktop cannot be replaced by the VM.
Imports do not run workflows or copy provider logins.

Imported aliases appear in the composer suggestions with a **Workspace import** label.
New chat invocations carry a badge backed by their persisted command receipt; plain
slash-prefixed text does not get a badge. Bots discover the shared library through
`skills_list` and use `skill_load` to make the saved scripts, references and binary
templates available in a task-specific VM directory. A queued slash invocation pins
both its instructions and supporting files, including across later edits/deletion.
Loading files does not execute scripts; normal bot tools and action permissions do.

Imported `$1`, `$2`, `$0` and `$ARGUMENTS[N]` placeholders are bound to parsed,
quoted inputs and substituted once into the instruction text before the task is
queued. `$ARGUMENTS` contains the entire raw input, preserving quotes; it is not
only the trailing remainder. Input values are never recursively expanded or run
as shell code. Missing referenced positions reject the invocation before work
starts. Simple `argument-hint` fields supply names in the command menu. Complex
hints retain free-form input while positions still receive explicit bindings.
The command receipt and `skill_load` retain the same expanded instructions across
later edits, refreshes and restarts. Saved supporting files remain unchanged.
`${CLAUDE_SKILL_DIR}` refers to the materialized VM path. Frontmatter descriptions,
argument hints and invocation visibility are retained. `disable-model-invocation`
requires a user slash invocation; `user-invocable: false` hides the composer alias.
Source-specific model, agent, fork, hook, tool-permission and dynamic-shell directives
are preserved as metadata/instructions and shown as compatibility notes. They do not
automatically configure Kindred or execute at import. Workflows requiring a particular
MCP tool, original project path, credentials or installed dependency need that
capability available to the chosen bot or an adapted step.

A package can contain up to 128 files, 2 MiB each and 8 MiB total, with entry
instructions up to 48,000 bytes. Linked paths, credential files and traversal paths
are rejected; hidden/cache directories are excluded from folder discovery. Use a
complete portable skill folder for external supporting files.

For example, a saved Nessus workflow can describe selecting a scan template,
copying it, setting the requested hosts, scheduling, checking for completion,
exporting `.nessus`, and using an imported tracker skill. Importing that workflow
provides its method and supporting files; a real run still needs the Nessus access,
targets, schedule and tracker inputs supplied by the user.

The profile supports 256 workflows. Full workspace-to-bot conversion lives in
**Settings → Skills → Import workspace**, where AGENTS.md / CLAUDE.md and memories
can be adapted together with commands. Individual imported workflows retain
source argument conventions: current Claude skills use zero-based inputs; Codex
and Pi prompt templates use one-based inputs. Older `.claude/commands` files
using bare `$1` without `$0` or `$ARGUMENTS[N]` infer legacy one-based indexing,
with a compatibility note. This inference cannot prove the author's intent:
**Settings → Skills → Edit skill → Positional arguments** selects which convention
to use. An explicit selection survives source refresh. Existing imports receive
corrected warnings and inferred parameter names without reimporting, while
custom parameter schemas are preserved. Pi defaults/slices are described to the
bot as data, never evaluated as shell code. See the upstream
[Pi prompt format](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/prompt-templates.md)
and [skill layouts](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/skills.md).

Dynamic-shell detection requires a complete opening expression at a whitespace
boundary, or a complete shell-injection fence. A value ending in `!` inside a
Markdown code span does not trigger it. Actual expressions retain a compatibility
note even without `allowed-tools`: current Claude can obtain permission from
session rules, and that field grants permissions rather than defining an exclusive
allowlist. Kindred does not execute imported shell expressions automatically;
source-computer context still needs normal local-access permissions, and missing
or offline context must be reported. See [Claude's argument and dynamic-context
reference](https://code.claude.com/docs/en/skills).

Any bot can use `skill_refresh_local` to update linked workflows from their saved
desktop/path, even if that bot was created normally or uses a different provider
from the source workspace. Updates preserve aliases and surface conflicting local
edits. A workspace bot can sync its full saved origin separately.

The unreleased import-argument correction has regressions for punctuation in
Markdown code spans, genuine shell expressions, legacy and modern indexing,
quoted/literal placeholder input, missing-input rollback, unchanged source files,
and frozen invocation instructions. Browser checks exercise named parameters and
the indexing editor in Chromium and WebKit. These use synthetic files and inputs;
they do not execute imported scripts or access a user's source workspace.
