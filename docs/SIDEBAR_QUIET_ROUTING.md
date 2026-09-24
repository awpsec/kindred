# Quiet group routing in the sidebar

The group worker strip already withheld queued/running tasks whose server-provided
`activity_started` was explicitly false. Sidebar previews and avatar reactions
still interpreted these runs as work, exposing every bot's participation check.

Sidebar status, pinned/sidebar avatar busy state and avatar reactions now respect
the same signal. When a bot starts substantive work, the sidebar render key changes
and exposes its work immediately. DM tasks and older servers without the signal
retain their existing behavior. Approval/human waits and independent commands
remain visible. Quiet routing restores the prior conversation preview.

`test-sidebar-quiet-routing.cjs` covers four silent bots, a pinned bot, one bot
starting work, return to idle, approval/human waits, background commands, DMs and
legacy responses. It is included in the coordination preflight.

This presentation change does not speed up inference or alter group delivery.
The scheduler currently acquires the shared computer lease before provider
execution; bots using the same computer can queue behind each other. That is a
possible latency source, not a diagnosis of Piper's reported one-minute reply.
linux-client was unreachable over SSH during this investigation, and no matching run
was found in the inspected production-server profile. Actual run/event timestamps are
needed before changing scheduling or model settings.
