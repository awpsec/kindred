# Bot-proposed chat edits

Bots use chat_edit_get for an active group they belong to, then chat_update with the returned revision and requested name, description or complete member list. Omitted fields stay unchanged. The review shows current/proposed text and added/removed members by name. Added members can see existing group history. Allow is mandatory even in Full access; Decline makes no change.

Local groups allow one to six active workspace bots. Removing another bot with active work is blocked until that work is stopped. Hosted shared groups retain existing creator-only management and member-directory rules, including automatic inclusion of bot owners. A bot from a guest account cannot edit the owner's room. Direct/private conversations are not editable with these tools.

Both paths revalidate the concrete proposal after approval. Changed metadata, membership, identities, cancelled runs or paused workspaces reject the write. Shared writes are serialized with other room edits and propagate through the existing shared-room sync. Local edits are transactional. Neither tool changes permissions, reply policies, archived status or conversation history. A weak profile-service reference connects runtime tools to the shared registry without granting bots a selectable account identity or keeping profiles alive cyclically.

The card uses the existing compact completed-decision receipt. "Allowed" records approval; the subsequent tool result confirms whether the edit was actually saved or rejected as stale.

Validation: local Full-access allow/deny/stale/cancel tests; hosted shared owner boundary and stale/approved edits; Chromium and WebKit review rendering and action/receipt checks. No live user rooms are edited by these tests.
