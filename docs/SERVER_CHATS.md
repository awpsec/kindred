# People and shared bots

Unreleased source feature. This requires an account on the same Kindred backend;
legacy token-only workspaces retain their existing private bot chats. The shared
web interface works in the Windows, Linux and macOS desktop clients and browsers.

Choose **+ → New chat**. Search loads people and available bots as you type;
Recents shows previous participants. People have a person icon; bots keep their
avatars. Select a colleague for a direct conversation, or select several people
and bots and give the group a name. Direct conversations between the same two
people reuse the existing history. Selecting just your own bot opens its private
conversation.

Bots are private initially. **Share bots** in the picker makes selected bots
searchable on that server. A bot's owner joins conversations that include it and
keeps responsibility for its connections and approvals. Turning off sharing
removes the bot from server chats and cancels its outstanding work there.
Members can instead use **Chat settings → Choose my bots for this chat** to add
their own private bots only to that room. No server-wide sharing is needed.

Address a bot by name or `@mention` to request a reply. Human conversation does
not wake bots by default. The chat creator can independently enable replies to
general messages and replies between bots. Each person can optionally choose
one of their own participating bots under **When I am mentioned**. It responds
under its own name, with verified context, rather than impersonating that person.
Automatic replies stop at the shared round's 24-task / 12-level budget.

A PM bot can use its owner's existing Monday, Gmail, Confluence or other
connections. Connect those services and configure the bot's normal permissions
in its owner's workspace. Existing routines can discover rooms with `chats_list`,
read them with `chat_read`, and post updates with `chat_post`. This feature does
not create monitoring routines or grant connector access automatically.

Messages, replies, reactions, question cards, history, unread state and desktop
notifications are shared with members. Pinning and archiving are personal.
The creator manages membership and group reply settings; each member controls
their own bot delegation and can leave. New members can read the room's existing
history. Leaving removes that account and its bots; the next person becomes the
creator if the original creator leaves.

Provider credentials, private conversations, model tool logs, computer access,
and approval payloads stay in the bot owner's profile. Shared tasks execute in
that original profile's runtime and VM. Owners see their approval cards and
computer controls; other members see a concise waiting status. Question cards
can be answered by room members; the first answer queues one continuation.
Bot errors are reduced to a generic status in the shared conversation, with
private diagnostic details retained by the owner.

This initial implementation shares text, links and question cards. File uploads,
file attachments and rich connector/checklist artifacts remain in private bot
chats. Bots can share useful text or authorized links from connected services.
Rooms are scoped to one backend; shared history is not federated between servers.

## Storage and delivery

The account registry owns shared room membership, public messages, per-account
read state, reactions and notification delivery. Each bot's private database has
a projection of only the rooms it belongs to. A local relay imports shared
history, queues the owning bot, and exports deliberate posts, final replies and
questions. Durable receipts make retries and restarts idempotent. Revocation
removes local membership, cancels work and prevents further exports. No bot VM is
created or woken for human-only chat.

The ordinary private-chat API cannot be used to access these projections.
Authenticated server-chat routes check current membership before reading or
writing, including reactions, question answers, portraits and notifications.
Notifications use the existing client transport, so no new native runtime is
required for this interface change.

## Verification

On 2026-09-17 the full server suite passed all 334 tests using the pinned local
Node runtime for the Pi fixtures. Seven new shared-chat tests cover attributed
messages, access boundaries, room-specific private bots, read state, pagination,
reactions, question answers, notification filtering, portraits, cancellation,
restart-safe delivery, and bounded cross-profile bot replies.

The real UI modules passed Chromium and WebKit browser checks with local API
fixtures: mixed live search, stale search responses, Recents, human-only sending,
author display, mentions, optional delegation, and a narrow 390px layout. Existing
private multi-bot controls also passed the WebKit regression. These are source
and browser-engine checks, not new native Windows/macOS build verification or
live tests against paid providers and external project-management services.

No release, production deployment, or GitHub Actions job accompanied this change.
