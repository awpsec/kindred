# Connector cards and email review

The current, unreleased source keeps connector actions and structured results as persistent receipts. Ordinary calls appear as compact service-logo rows with the tool name and, when supplied, a target identifier. Selecting a row smoothly expands the full receipt. One to three consecutive calls stay inline; four or more calls from the same bot and run collapse under a tool count and service logos, with the active call (or latest completed call) visible underneath. Running calls show animated dots, respecting reduced-motion settings. Approvals, requested changes and uncertain outcomes remain fully visible. Grouping never crosses user messages, bot/run boundaries or the unread divider. The header identifies the service, connector route, tool and bot. Dedicated adapters cover 34 services through Kindred connections and supported Claude or Codex provider routes. They display supplied inputs and connector receipts; they do not connect accounts or grant execution permissions. The released 0.48.34 packages contain the earlier 26-service catalogue.

## Supported services

| Service | Detailed content |
| --- | --- |
| Gmail | Messages and email approvals |
| Google Drive | Files, folders and ownership |
| Google Docs | Document text and tab excerpts |
| Google Sheets | Spreadsheet tabs and cell ranges |
| Google Slides | Presentations and slide text |
| Google Calendar | Events, dates and attendees |
| Google Contacts | People, email addresses and organizations |
| Google Tasks | Tasks, due dates and notes |
| Google Chat | Space messages and threads |
| Google Meet | Meeting spaces and conference records |
| Google Forms | Forms and question outlines |
| Zoom | Meetings, agenda and scheduling |
| HubSpot | Contacts, companies, deals and tickets |
| Salesforce | Accounts, contacts, opportunities and cases |
| Slack | Channel messages and threads |
| Microsoft Teams | Chat messages and channel conversations |
| Outlook | Messages and email approvals |
| Notion | Pages, properties and block text |
| Asana | Tasks, assignees and due dates |
| Trello | Cards, labels and deadlines |
| Monday | Items, boards and column values |
| Jira | Issues, status and assignment |
| Confluence | Pages, versions and content excerpts |
| GitHub | Issues, pull requests and repositories |
| Zendesk | Support tickets, priority and ownership |
| QuickBooks | Invoices, customers and invoice lines |
| Linear | Issues, status and assignment |
| ClickUp | Tasks, statuses and assignees |
| Airtable | Base records and supplied field values |
| GitLab | Issues, labels and project links |
| Dropbox | Files, folders and paths |
| Box | Files, folders and shared links |
| Todoist | Tasks, due dates and labels |
| Stripe | Payment objects and source fields |

The marketplace has a Popular apps disclosure with shortcuts to live catalogue searches. Availability, tool names, authentication and scopes still come from the provider's live catalogue. Connect the relevant account through the normal connection flow before using its tools. Google Workspace means the eleven Google services listed above; it does not imply every Google product or operation has a custom layout.

Sheet ranges show literal cell values in a scrollable grid. Documents and slides show returned text excerpts; meetings show supplied timing, agenda and join links; CRM and task records preserve source field values. IDs stay labelled as IDs when names are unavailable. No extra API requests resolve names, fetch missing document content or calculate totals. Pending changes use a visible **Proposed details** label. Completed cards show returned records when recognized, and failed calls do not promote payloads into successful result records.

The shared catalogue lives in `ui/connector-catalog.json`, including source schema references. Run `python scripts/generate-connector-catalog.py` after changing it to regenerate browser metadata. Presentation adapters in `src/connector_records.rs` are independent of authorization.


## Review an email

A pending email card shows the supplied subject, recipients, sender and message. If the tool omits the sender, the card identifies the connected account or explicitly says the sender is resolved by it. Kindred does not invent a From address. Attachments and related fields are available in a disclosure.

- **Approve & send** approves that saved revision once. The card changes to in progress, then to the connector's confirmed outcome.
- **Edit draft** edits the supported recipient, Cc, Bcc, subject and body fields already supplied by the tool. **Save draft changes** saves without sending. Attachment IDs, thread IDs and other connector fields are preserved. The bot executes the edited input after approval.
- **Chat about this** on a pending action submits changes to the bot and declines that call. The bot receives the feedback and can prepare a revised action.
- **Decline** prevents that call from proceeding.
- **Chat about this** on a completed card attaches the saved card and its current state to your next message.

A stale approval or edit is rejected. Stopped and interrupted actions lose their approval controls. A successful email connector receipt confirms the send operation, not delivery to the recipient. Failed or interrupted mutations may have an uncertain external outcome; check the connected service before retrying.

While the draft editor is open, approval controls stay disabled, including **Approve & allow future emails**. Save the changes or cancel editing before deciding. A failed save keeps the typed draft available for correction.

## Review task, calendar and message fields

Pending task, calendar, meeting, chat-message, issue and support cards offer **Edit fields** when their input contains recognized string fields. This includes task names and notes, event summaries and descriptions, meeting agendas, message text and issue bodies. **Save field changes** updates the pending revision without executing the action. The connector receives the saved input after explicit approval.

Only fields already supplied by the tool are offered. IDs, assignments, attachments, numeric values, permissions and unknown nested structures are preserved. Dates and times remain in their original string representation, including any supplied offset; the editor does not guess a time zone or convert provider-specific formats. Read-only requests are not editable. Provider validation still applies to the edited input.

## Let a bot send without asking

Where the connector route supports persistent grants, each supported email connection has an **Email sending** setting: follow its connection permission, ask before sending, or allow without asking. This is scoped to that bot, connector route, account and connection. Changing it to ask overrides a broad connection grant for supported send/reply actions. Other connector actions retain their own permissions. Eligible pending sends also offer **Approve & allow future emails**. Codex connectors require approval for each call and do not offer a persistent grant.

You can ask the bot in chat to change this policy. Allowing unattended email produces a permission proposal for you to approve. Asking it to require review again applies the restriction immediately. Read-only account restrictions and provider-required approvals still apply. A permission change cannot retract an action already dispatched or your explicit approval of that individual call.

## Display limits and persistence

Card contents have a maximum visible height and scroll independently of the approval controls. Multi-record cards initially show five collapsed item summaries; **+N more** reveals the remaining supplied previews and **Show fewer** restores the compact list. Opening an item renders its fields on demand. A 15-record result therefore shows five items and **+10 more**. The content region supports keyboard scrolling.

Email editing supports common root-level strings and arrays of strings, plus the documented [Microsoft Graph message/sendMail JSON structure](https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0): `message.subject`, `message.body.content`, and structured To/Cc/Bcc recipients, also when the message object is supplied at the root. Graph recipient input accepts comma-separated addresses; existing matching display names are retained. The body content type, envelope options, headers and attachments are preserved. Encoded MIME, draft-ID-only calls, unfamiliar recipient objects, sender changes and attachment editing are not rewritten. HTML display removes active content and remote images; editing preserves the original body format.

Stripe amounts are labelled as values in the smallest currency unit and are not converted or summed. Airtable dynamic fields do not replace source record metadata, and credential-like field names are excluded from the typed record. These are bounded previews of supplied results, not full service clients.

ClickUp due timestamps and Stripe creation timestamps display readable UTC dates. Hovering the date exposes the original value and its unit; stored record fields retain the source value. ClickUp's unit follows its [date-format documentation](https://developer.clickup.com/docs/general-time); Stripe's follows the [PaymentIntent object schema](https://docs.stripe.com/api/payment_intents/object). This does not infer a user's local time zone or change a task deadline.

Structured Gmail payloads and Outlook email results receive readable email layouts. Records are extracted from common JSON/MCP wrappers, bounded to 30 items, 30 invoice lines and bounded field lengths. Sheet previews contain at most 20 rows and 8 columns; slide text covers at most 8 returned slides, form outlines 20 items, and document excerpts 16,000 characters. HTML excerpts remove active content and remote images. Source amounts are displayed without recalculating or inventing totals. Free-form connector prose and unknown nested schemas may not produce a typed result. Recognized routine reads do not fill chat with successful background result cards; any required approval remains visible.

Cards and their reviewed content survive history readback and profile transfers. Transfer does not copy unattended email permissions; old packages without connector cards still import. Restart marks unfinished cards interrupted and never replays their actions. Historical pre-0.48.32 tool activity is not retroactively converted into cards.

## Verification

Regression coverage includes exact edited HTTP connector payloads, no dispatch before approval, stale/double approval rejection, feedback and cancellation, per-bot/account/source email policy isolation, immediate revocation, forced review, read-only restrictions, Gmail/Outlook normalization, invoice fields, quoted context and transfer compatibility. Browser tests exercise editing, failed saves, feedback, double clicks, permission controls, safe source links and typed records in Edge and WebKit. Connector writes use controlled fixtures; this verification sends no real email and modifies no customer accounting or task records.

The 34-service fixture suite exercises schema-shaped responses through backend card completion and browser rendering in Edge and WebKit. These are synthetic controlled records, not evidence of live authentication or successful real-world operations against all 34 services. Free-form responses, unsupported record variants and content omitted by the connector retain the generic fallback.
