# Workflow interface design review

Open workflow-concepts.html through a static server rooted at the checkout. It uses the bundled Kindred font. This is a standalone design prototype, not served by the product and not connected to accounts, bot actions, or approval APIs. All data is fictional. Buttons display explicitly labelled demo feedback. The prototype uses trusted static markup, not model-generated HTML.

The owner approved these directions on 2026-09-20, with conversation remaining text-first:

- Project status: one compact dependency view across multiple bots, with downstream dependencies expandable. Production must resolve actual bot avatars/chat IDs and derive states from durable task records; prose alone must not invent a waiting dependency.
- Review and approve: preview and approve an exact immutable revision. Approval is not sending. Revision changes invalidate approval, and result messages follow the approval event.
- Changes: compact before/after using existing instruction approval semantics, full text on demand.
- Scheduling: selectable slots with explicit timezone, account, attendees and destination. Selection prepares an invitation; recheck availability and use the existing connector approval flow to send. Google Calendar, Apple Calendar and Notion are potential destinations only where an actual supported connection exists. These designs add no integration or availability claim.
- Decision form: one submission for several answers. Production needs persisted answer state, validation, duplicate submission protection and explicit editable/answered lifecycle.

Optional, not approved for product implementation: minimal expandable sources; upload destination preview with editable filename; one-line monitoring state shown on request. Upload approval must bind file revision, destination and filename and must be renewed after any edit. Research sources must use verified links/icons. No replacement background-job card and no inbox-triage view are proposed: the existing minimal activity display already covers those needs.

Normal messages remain the default. Panels must solve a specific comparison, coordination or decision problem, update the same artifact where possible, and not repeat their content in prose. This restraint is included in the active bot prompt guidance. The five new controls above still require production integration; these previews are not shipped functionality.

Implementation update: the approved compact work views are now wired into the product; see ../WORKFLOW_VISUAL_PANELS.md for the exact capabilities and constraints. This standalone HTML remains an illustrative prototype. The new Decision · handoff and Decision · meeting tabs are additional unshipped form examples for owner review.
