# Teach a task

Teaching turns a user's explanation of a computer workflow into a persistent
skill and slash command. It does not train model weights or replay a recording.
The user demonstrates a step, describes what it means, reviews the procedure,
and supplies a success check. The bot later uses these instructions with its
normal tools and approval policy, adapting to the current interface.

## What is retained

- Reviewed skill name, purpose, ordered instructions and success check.
- An automatically assigned command, visible immediately in slash suggestions
  and Settings → Skills. Skills are shared by bots within the same profile.
- Instructions in the profile database, including across app/server restarts.
- An immutable workflow receipt when the user invokes its slash command, so
  editing or deleting the skill cannot silently change a queued task.

Clicks, navigation keys and screenshots exist only in the unsaved review.
Typed characters are omitted. None of that demonstration data is included in
the save request. A user must describe changing inputs, useful controls and
checks; demonstrating clicks alone is not sufficient to teach the procedure.
Saving does not run it. Invoke the command or ask a bot to use the saved skill.

## Functional corrections, 2026-09-18

- `skill_load` now reads ordinary and taught skills without requiring an imported
  package or a VM connection. Imported workflows retain their supporting-file
  materialization, explicit-invocation rules and frozen receipts.
- Keep teaching resumes recording after confirming computer control/connection.
- The control-return reminder no longer covers the teaching controls after a
  step/review dialog closes. Reminders for other paused bots remain available.
- Whitespace-only lesson fields are rejected. Review edits survive continued
  teaching. Failed saves keep the lesson and human control intact.
- The lesson limit matches the server's 48,000-byte skill limit. Purpose is also
  saved as a searchable description; command suggestions refresh after saving.
- Completion names the saved `/command` and points to the skill library.

## Verification

`tools/frontend/test-teaching.cjs` uses real DOM, keyboard and pointer events
with a synthetic computer/API. It covers the demonstration, omitted typing,
pause/resume, edited review, a lesson over 16 KB, failed-save recovery, command
discovery/invocation, reload/library access, declined replacement, discard and
narrow/light layout. Run with Chromium and `WEBKIT=1`.

Rust `skill_import::tests` and `commands::tests` exercise the actual HTTP save,
authentication, SQLite restart, skill/tool discovery and loading, named input
binding, immutable queued instructions and existing imported packages. No model
call or external-account action is needed for these checks. They verify that
the workflow reaches the bot correctly; they do not certify a model's successful
execution of an arbitrary application-specific task or native OS behavior.
