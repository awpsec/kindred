# Compact group activity

Groups show one compact avatar/name/status/animated-dots/elapsed row per bot up to three bots. Four or more use an overlapping avatar cluster and count. Waiting for approval/input is labeled explicitly; mixed clustered states say "active" rather than claiming all bots are working. Duplicate command/run worker records count once per participant. Server worker records include run creation time; clients update timers without refetching.

The keyed activity element survives conversation reconciliation. Count changes animate height and avatar positions over 280 ms; unchanged polls preserve the dots. Reduced motion disables the transition. Both workspace and cross-account groups use the same renderer. DM activity is unchanged.

Group silence already had backend support, but the tool description incorrectly restricted quiet completion to routines and answered questions. The description, core guide and communication reference now agree: call finish_quietly without a public preamble when there is no useful contribution. This reduces prompting contradictions; it cannot guarantee every model always follows instructions.

Validation: test-group-activity.cjs exercises 3/4 transitions, waiting labels, elapsed time, reduced motion and narrow layouts in Chromium/WebKit. test-server-chats.cjs exercises actual shared worker rendering/deduplication/removal. Rust conversation_updates tests cover group quiet completion producing no message, alongside existing private-chat restrictions and deferred decisions.
