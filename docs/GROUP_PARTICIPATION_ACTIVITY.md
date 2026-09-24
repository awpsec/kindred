# Quiet group participation checks

Group activity no longer advertises every queued or newly started model run. The server exposes `activity_started` for local and cross-account shared group runs. Reading the conversation, directory or Kindred guide, recalling/saving routing memory, and finishing quietly do not set it. A public assistant message or a substantive tool-start event does. Once set, the signal remains true for the run.

The group renderer hides queued/running entries explicitly marked false and omits the strip entirely when no visible workers remain. Approval waits, user waits, background-command waits and cancellation remain visible. Older servers without the field preserve their existing display. DMs are unchanged. Elapsed time still measures the original run, not time since the indicator appeared.

This is an observable-work signal, not access to a model's internal decision. A bot reasoning without a public message or tool action remains hidden in the group until it provides one. There is no timer that reveals unrelated bots after an arbitrary delay, and no tasks are cancelled or prevented from receiving relevant context.

Tests cover routing-only events, substantive tool work, public messages, persistent visibility, an entirely empty activity strip, one selected worker, approval waits, and existing cluster/stack animations.
