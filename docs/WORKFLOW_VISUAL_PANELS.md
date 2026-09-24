# Shopping, finance and chart panels

These changes are source-only, not an approved release or deployment.

## Bot-facing interface

`visual_panel` creates a data-only native panel in the current workspace conversation. `visual_panel_read` returns its saved data/revision. A stable key and expected revision update the original message in place; stale edits fail rather than overwriting an intervening change. Panels survive database restarts and workspace export/import. They also appear under Bot Details → Artifacts → Shopping, finance & charts. Existing packages without the new table still import.

- Shopping: one focused product with image, description, observed price/currency, merchant, source link and expandable compatibility details; alternative thumbnails switch focus. The first product is the bot's best match. Discuss this pick prepares a chat message containing the selected product ID, URL and panel key; it does not send it or place an order.
- Finance: up to eight responsive widgets for holdings, stocks, crypto or balances, with optional supplied prices, price changes, holdings value, P&L and history. Positive/negative movement gets both a signed number and color. Missing values/history are not fabricated. These are dated snapshots, not a streaming quote service.
- Charts: line, bar and scatter plots, labelled/scaled axes, series toggles, point inspection by pointer or keyboard, and a data table. Optional Z values encode bubble area with a visible label; this is not a 3D spatial renderer. Dates use Unix milliseconds; labelled categorical points display their labels. Bars include zero in the axis range; line plots may use a narrower labelled range.

The shared operating guide tells bots to obtain current evidence from available connectors, browsing or user-provided files, cite source/time, and avoid inventing compatibility, prices, account holdings, P&L or graph values. A panel does not itself connect a financial account or fetch prices. Later purchases/trades use the existing authorized bot/browser/connector workflow; selecting a product is not transaction approval. Unknown shipping addresses, product variants or order totals must not be inferred.

Initial scope is workspace DMs and groups. Cross-account server chats receive an explicit tool error with a text-summary fallback; native panel propagation there is not implemented.

## Rendering and storage

The renderer accepts structured values and uses textContent and fixed SVG primitives, with no executable model HTML. Links and image URLs must use HTTPS without embedded credentials; external links use noopener/noreferrer and images suppress referrer information. Product images are loaded by the client from the supplied source, not proxied through the server. Schema/runtime validation bounds strings, products, series, points and total payload size; numbers must be finite. Source/as-of fields are required.

Panel interaction state stays mounted across unchanged chat refreshes. Chart tooltips reserve space to avoid click/scroll jumps. The conversation context receives only panel metadata/readback keys instead of thousands of data points, preserving room for conversation. The saved full panel is available through its read tool. Displaying panels does not execute external actions.

## Verification and previews

- Backend regressions cover validation, malicious links, numeric limits, revision conflicts, single-message updates, bot isolation, artifact-library lookup and workspace transfer.
- Chromium/WebKit tests exercise the actual chat integration: product selection across refresh, source links, draft discussion, chart filtering/inspection, light/dark themes, narrower layouts, and inert untrusted strings.
- Current email review screenshot comes from the existing connector-artifact integration test with sample email data. No email was sent.
- New screenshots/GIF use clearly marked illustrative products and financial data, not real recommendations or live market/account information.
- Native macOS/Linux desktop end-to-end verification and live connector/model generation are not claimed by these fixture tests.

## Compact work views (2026-09-20)

The runtime now accepts `project`, `review`, `schedule`, `sources`, `upload`, and `monitor` through `visual_panel`, alongside shopping/finance/chart. All retain stable keys and revision checks. Ordinary text and the existing minimal activity/waiting indicators remain the default. No background-job or inbox-triage UI was added. Multiple-answer form variants remain design-only in `docs/previews/workflow-concepts.html`.

- **Project:** derives active collaboration edges from the current conversation and nested child requests, capped at 40. Shows three first, expands the rest, resolves actual bot identities and opens the corresponding chat. This is a conversation dependency view, not a replacement project database or an inferred project plan. It cannot invent a dependency from prose. An empty graph says so.
- **Review:** references an immutable `share_file` snapshot belonging to this conversation. Uses existing download/preview controls. Approval or requested changes are saved against the panel revision and file hash; approval is explicitly not sending. A new panel revision requires a new decision.
- **Scheduling:** 1–5 verified slots, account/calendar, attendees and IANA timezone. Slot selection queues an invitation-review request to the panel's bot. It does not send an invitation. The bot must recheck availability and use an existing supported connection and its normal approval flow. This does not add Apple Calendar, Notion, or any other connector support by itself.
- **Sources:** a minimal expandable list of up to 12 real HTTPS references, with optional verified icons. Prefer ordinary inline citations for simple answers.
- **Upload:** the shared immutable file, exact account and HTTPS folder destination, and editable filename. A user decision binds those values and queues the responsible bot. The bot must use existing connector/browser tools; no overwrite or sharing-permission change is implied. The receipt says upload approved, not uploaded.
- **Monitoring:** one quiet row for a saved scheduled routine or Constant Gmail watcher owned by the bot. State comes from storage. Enabled is not a claim of health; a recorded watcher error says Needs attention and can be expanded. Manage opens Routines.
- **Instruction changes:** existing real approval cards show only a small changed region inline (at most six total lines and 600 characters); larger edits are collapsed under View changes. Full instructions remain available on demand. Existing approval endpoints and ordering are retained.

User decisions are recorded in `workflow_responses`. The authenticated conversation-scoped endpoint validates current revision, performs the response insert, user message and targeted bot run in one SQLite transaction, and accepts an identical repeat without creating another run. Different decisions on the same revision are rejected. Changes to a panel invalidate its previous decision for the new revision. Responses are preserved in workspace transfers. Source panels cannot supply their own response, file metadata, dependency state or monitor state.

Validation: Rust tests cover revision/idempotency, scope, invalid/past slots, file binding, filename validation, nested dependencies and transfer preservation. `tools/frontend/test-workflow-panels.cjs` exercises actual app rendering in Chromium/WebKit with sample data, selection/rename/change requests, collapsed diffs, themes and narrow layouts. Live external writes and native desktop packaging are not part of these tests.

### Meeting format and selection controls

New scheduling panels require `meeting_options` (1–6 entries, unique IDs). Kinds are `none`, `google_meet`, `zoom`, `other`, and `in_person`. The user explicitly selects an option; nothing is preselected. An existing HTTPS meeting URL is optional for Meet/Zoom (without one the bot must create a real link through a supported connection), required for `other`, and prohibited for `none`/`in_person`. Physical meetings require a location. Meet and Zoom URLs are checked against their provider domains. The exact selected option is saved with the chosen time and sent to invitation review. Old scheduling panels without this data ask to be refreshed instead of silently assuming a format. Creation capability must be checked against actual connected tools, not inferred from the calendar name. Calendar defaults must not silently add conferencing to a `none` selection.

Shared choice checkboxes/radios use a muted periwinkle accent, distinct check/dot/mixed marks, keyboard focus, disabled styling, and reduced-motion support. Settings switches retain their toggle shape. Forced-colors mode restores native controls. `test-selection-controls.cjs` verifies both themes, checkboxes and radios, keyboard navigation and the switch/checkbox distinction.

### Cohesive calendar choices

The format picker uses fixed labels/order and allows one option per format. Creating or reusing a conferencing link no longer changes the label: Google Meet is always Google Meet. Link/location metadata appears only under Meeting details for the selected option. Scheduling guidance resolves the calendar/account first, checks that calendar's conferencing settings through available connected tools, and refreshes the entire panel/revision if the destination changes. This is connector-driven preparation, not a new automatic calendar-capability discovery service.

Notion Calendar is treated as a client of its underlying calendar and conferencing connections, not an additional conferencing provider. Its documented native/connected/custom conferencing distinction and per-calendar default are described at https://www.notion.com/help/notion-calendar-connections . A Notion database's calendar view does not by itself establish event-calendar or conferencing access.
