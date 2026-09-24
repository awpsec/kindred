# Gmail inbox monitors

Kindred supports scheduled reviews through an existing Claude Gmail connection,
as well as direct Gmail activity detection. These have different timing and usage.

## Reuse Gmail connected through Claude

When a Claude bot's connector inventory reports connected Gmail from its Claude
account, ask it to monitor that inbox or choose **Settings → Routines → Set up
Gmail through Claude**. Choose a review frequency and alert criteria. You do not
need to reconnect Gmail in Kindred. Existing connector permission prompts apply.

Each review runs Claude and uses the provider allowance, even when nothing changed.
This path supports timed schedules, not Constant activity detection or native push.
Kindred binds the routine to that Claude account and Gmail connector, prevents a
duplicate routine for the same connection, and permits supported Gmail read/search
operations only. A changed or unavailable connection fails visibly rather than
switching mailbox sources. Success requires a recorded successful connector read;
a failed read cannot quietly claim an empty inbox. Initial checks start at setup
time; later checks start from the previous verified review with overlap.

Saving confirms configuration, not that mail was read. No check runs immediately
from the setup form. Inspect the first scheduled result. Workspace transfer includes
the account binding but imports routines paused; the destination still needs the
same available Claude account. No OAuth credentials are copied. These paths have
fixture coverage; this change has not read the owner's live mailbox.

Claude documents availability of existing account connectors in
[Claude Code MCP connections](https://code.claude.com/docs/en/mcp#use-mcp-servers-from-claude-ai).

## Direct Gmail activity detection

Kindred wakes an assigned bot when its Gmail watcher finds new inbox messages.
The watcher runs in the server, independently of the bot VM and AI provider. An
unchanged inbox creates no model request. A browser sign-in alone cannot supply
these events; this direct activity detector needs **Marketplace → Gmail**.

## Start monitoring

Ask a bot, “Can you monitor my Gmail inbox?” It uses `inbox_monitor_setup` to show
persistent setup choices: connect Gmail if missing, choose an inbox when several
are connected, then choose **Monitor activity**, every 5 minutes, every 15 minutes,
every hour, or a custom schedule. A custom response is always available. The bot
resumes from your saved answer; it does not create work before you choose timing.
If you already specified timing, it uses that request without asking again.

**Monitor activity** creates a routine named **Monitor EMAIL inbox** with frequency
**Constant**. “Constant” describes the activity trigger; it does not promise instant
notification. Timed choices use the existing scheduler; custom days and hours use
its actual weekly schedule and timezone. Both types appear in **Routines** and in
the assigned bot's computer panel. Existing monitors appear there automatically,
without creating a duplicate scheduled job.

For manual setup, open **Settings → Routines → Add routine**, choose
**Monitor activity** under Schedule, then select Gmail, the bot and alert criteria.
Edit, pause, resume, check status or remove a paused activity routine from Routines.
The bot saves activity choices through `routine_create` with `trigger=activity`,
subject to the normal approval setting. Read-only Gmail access is sufficient. Monitoring does
not grant permission to send, reply, archive, delete, or modify mail.

**Fast checks**, the default, query Gmail history every 15 seconds. These are API
reads, not AI runs. After detection the bot's queue, provider and processing add
latency; the interval is not an end-to-end notification guarantee. This mode works
with Composio-managed Gmail OAuth and does not need a public callback.

Kindred begins at the current mailbox history cursor. It does not assign the old
inbox as a backlog. New messages receive durable, account-bound receipts. Repeated
history results and push deliveries cannot create another task for the same
message. Up to 25 messages are grouped into a task; further mail waits while the
bot is busy. The model fetches the exact message IDs using that connected account,
then follows the monitor's instructions. It can `finish_quietly` if no alert is
needed. Relevant results use the normal chat, unread and native notification path,
with the notification title “BOT has an inbox update.” Normal global and per-bot
mutes still apply; **Input needed** suppresses successful inbox-result alerts.
The desktop must remain running (minimized is supported), or the browser page
must remain open with notification permission, to show device notifications.

## Native Gmail push

Choose **Gmail push** when the following Google Cloud setup is available:

1. Use a custom Gmail OAuth client and Composio auth configuration in your own
   Google Cloud project. Set the requested scope explicitly to
   `https://www.googleapis.com/auth/gmail.readonly` for read-only access. Kindred
   exposes **Use a custom auth configuration** in Gmail's connection form and
   verifies the configured scopes match the chosen access; it does not accept
   broader Gmail grants under a read-only label. Optional identity scopes are
   allowed. Configure the OAuth client and secret in Composio, not in bot chat.
2. Enable Gmail and Pub/Sub APIs. Create a topic in that same OAuth client's
   project and grant `gmail-api-push@system.gserviceaccount.com` Pub/Sub Publisher
   permission on it. A topic in your project cannot be used with a different
   project's Composio-managed OAuth client.
3. Provide a public HTTPS origin for Kindred's callback. Forward only the necessary
   `/hooks/gmail/*` route through your reverse proxy. A private Tailscale Serve
   address is not reachable from Google; this release does not enable Funnel,
   publish the application, or replace existing proxy listeners automatically.
4. Create the monitor with that topic, public origin, and the service-account email
   that will authenticate your Pub/Sub push subscription. Save it, then expand
   **Google Cloud delivery setup** and copy the generated endpoint.
5. Create the topic's push subscription using that endpoint. Enable authenticated
   push with the configured service account. Set its audience to the exact endpoint
   URL. Apply Google's required IAM grants for creating authenticated push
   subscriptions and minting the service-account identity token.

Kindred requests Gmail `watch`, renews it daily, and stores its expiration. A valid
Google-signed identity token must match the expected issuer, audience, service
account and lifetime. The decoded Pub/Sub event must also identify the monitor's
mailbox. The body cannot specify a different bot or account. Receiving a valid
event durably schedules an immediate Gmail history fetch; it does not trust mail
content supplied by the request.

The UI shows **Waiting for push** until a verified delivery arrives. Fast checks
remain active in that state. After the first verified delivery, push is primary
and a five-minute history check catches missing events. A successful `watch` call
alone does not prove public delivery. Use the last push and last successful check
timestamps to inspect actual behavior.

Google documents delivery as typically occurring within seconds, with possible
delays or dropped notifications. See [Gmail push notifications](https://developers.google.com/workspace/gmail/api/guides/push)
and [authenticated Pub/Sub push](https://cloud.google.com/pubsub/docs/authenticate-push-subscriptions).

## Recovery and controls

- Cursors and message receipts survive server restarts. If Gmail's history cursor
  expires, a bounded inbox scan recovers messages since the last successful check
  with a short overlap; existing receipts remove duplicates. Incomplete or oversized
  results do not advance the cursor. Large backlogs become visible errors.
- API, permission and connection failures produce one attention notice per
  uninterrupted failure period. Read-only checks retry with backoff. The monitor
  does not label a failed check as healthy. A successful check clears the error.
- Pause stops new tasks and cancels inbox tasks that have not started. A task
  already executing can finish. Resume starts at current mail, without replaying
  the paused period. Remove is available after pausing; task/chat history remains.
  To change the assigned bot, remove the paused monitor and create a new one.
- A mailbox connection has one monitor per workspace. Use a dedicated inbox bot
  if other long tasks would delay its response. Archived bots, disabled accounts,
  and frozen workspace transfers do not receive new monitoring work.
- Monitor configuration is bound to the local connected account and is not part
  of portable workspace exports. Reconnect and configure it at the destination.
  Removing a native-push monitor does not delete your Google Cloud subscription;
  remove the unused subscription in Google Cloud as well.

## Validation boundary

Version 0.50.0 suppresses replies consisting only of an empty
`finish_quietly` XML marker. Some providers print this marker as text instead of
calling the tool; it previously became an empty chat bubble and a raw sidebar
preview. The server omits these routine results from delivery and notifications,
and repairs existing chat projections on startup without deleting run/event
history or treating the text as a successful tool call. Recorded tool/provider
errors get a readable notice and attachments remain accessible. Code examples,
ordinary replies, and user-authored text remain visible. Quiet completions do not
advance the sidebar's message time.

`cargo test quiet_output` covers repeated quiet checks, unread state, paginated
history, notifications, errors, attachments and restart repair. The fixture in
`tools/frontend/test-quiet-routines.cjs` covers Chromium/WebKit live completion,
sidebar previews and timestamps, reloads, errors and literal user/code content.
These tests do not connect to a real mailbox or run a paid provider session.

Tests cover empty checks, message deduplication, batching, busy bots, cursor expiry,
restart persistence, failure notices, scope/account binding, authenticated routing,
Google JWT signatures and claims, persisted push wakeups, and quiet versus alerting
completion. Browser tests cover creation, pause/resume, native push setup, and
missing-account states in Edge and WebKit. A live mailbox and real Google push
delivery still require the owner's connected account and Google Cloud setup.
