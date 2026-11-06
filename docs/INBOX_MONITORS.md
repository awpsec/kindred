# Gmail inbox monitors

Gmail monitoring uses the same Connections screen and teammate-scoped controls as Slack. It works with Claude, Codex, OpenRouter and other bot providers. Background checks do not start a model when no new mail arrives.

## Start monitoring

Open **Settings → Connections → Gmail**, or open a teammate's **Connections** and expand Gmail. Connect an account, choose **Add monitor**, assign the bot and describe when it should alert you. Saved monitors show their health and last successful check, with Edit, Pause, Resume and Remove controls. The save button remains visible on small screens while fields scroll. Existing inbox monitors remain available in Routines too.

You can also ask a bot to set up monitoring. `inbox_monitor_setup` returns existing accounts or a secure connection card. After you choose the verified mailbox, the bot resumes the original request, reads existing monitors and uses `inbox_monitor_save`. Connecting alone creates no monitor and grants no send permission. Declining or dismissing setup does not create a polling routine. Repeated setup/confirmation reuses the same question and continuation.

### Connect directly to Google

Choose **Connect Gmail**. The collapsed setup guide explains how to enable Gmail API, create a Web application OAuth client and register the displayed redirect address. Enter its client ID and secret in the secure form, continue to Google, then choose **Check connection**. Use a server address your browser can reach. Remote addresses require HTTPS; local HTTP loopback is supported.

The requested scope is `https://www.googleapis.com/auth/gmail.readonly`. Authorization uses PKCE and a single-use, ten-minute state bound to the workspace. Credentials stay in the private server credential store, not chat or database metadata. Access tokens are reused until expiry. Reconnecting the same mailbox retains its monitor identity and paused state. Pause the account's monitors before disconnecting.

This background authorization is separate from Gmail connected inside Claude or ChatGPT. Kindred does not extract those providers' private credentials. The chat connectors keep working as before. Existing Kindred/Composio Gmail accounts can also be used without reconnecting. Every bot can read the specific new messages assigned to its monitor through `inbox_message_read`, regardless of its chat provider. The tool cannot read arbitrary message IDs or send/modify mail.

### Preserve scheduled reviews

Explicitly scheduled Claude connector reviews remain supported, with their original account binding, timing, permissions and alert criteria. They use model allowance even when no mail changed. The legacy `source=claude` and `source=kindred` setup choices remain compatible with unfinished setups. New setup defaults to event monitoring rather than repeated model polling. Existing scheduled jobs are not silently converted or disabled; preserve business-hour and review semantics when replacing one.

**Fast checks**, the default, query Gmail history every 15 seconds. These are API
reads, not AI runs. After detection the bot's queue, provider and processing add
latency; the interval is not an end-to-end notification guarantee. This mode works with direct Google authorization and Composio-managed Gmail OAuth. It needs no public Pub/Sub callback.

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

1. Use the direct Google OAuth client configured in Connections → Gmail, or a custom Composio auth configuration in your own Google Cloud project. Set the requested scope explicitly to
   `https://www.googleapis.com/auth/gmail.readonly` for read-only access. Kindred
   exposes **Use a custom auth configuration** in Gmail's connection form and
   verifies the configured scopes match the chosen access; it does not accept
   broader Gmail grants under a read-only label. Optional identity scopes are
   allowed. Configure credentials in the secure connection form (or Composio for that route), never bot chat.
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
