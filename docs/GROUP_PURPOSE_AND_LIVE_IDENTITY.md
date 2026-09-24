# Group purpose, creation, and live identity

Chat settings now includes an optional description of up to 2,000 characters.
Both private workspace groups and shared server chats retain it; shared-chat
description edits require the room owner. Bots receive the current description
in their conversation context and through chats_list/chat_read. It expresses
purpose, update style and coordination roles, without overriding permissions or
approval rules. Existing clients that omit the field when editing a local chat
preserve its saved description.

The chat_create tool creates a named workspace group with two to six active bots,
including its caller, using exact teammate IDs. A stable key is scoped to that
bot and reused across retries. Creation is transactional, rejects duplicate or
unknown/archived members and inactive/foreign runs, and never silently replaces
a changed or archived group. It posts no messages, starts no tasks, and invites
no external accounts. Subsequent chat_post/send_to_bot calls use existing
delivery and delegation behavior. Bots should discover existing rooms first.

Current saved bot identity is loaded when constructing the provider prompt.
Core guidance makes the current name authoritative over former names in role
text, memory, summaries and history, without rewriting those records. During a
running task, changed name/role label/role description/chat description is
delivered as structured live configuration at the next completed tool boundary.
This does not interrupt generation, restart the task or replay an action.
Bot instruction edits retain their existing approval and future-task semantics.

The description column has an additive migration with an empty default.
Metadata edits are permitted during active work; membership/archive changes
remain blocked. Shared descriptions are synchronized into bot context mirrors.

Validation covers actual tool dispatch, membership and lifecycle checks,
creation retries, description persistence and owner checks, renames with stale
invocation data, live changes without replay, existing collaboration, migration
and workspace transfer. Chromium and WebKit cover local/shared description forms.

Requires the next matching server/UI release; no live deployment is included.
