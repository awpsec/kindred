# Outcome, approvals, and marketplace polish

Source-only follow-up to Gather. The owner approved Outcome first and Clear approvals and requested marketplace cleanup. Publication, packaging, and deployment remain on hold.

| Before | After | Why |
| --- | --- | --- |
| Finished work retains active-job visual weight. | Finished Gather becomes a compact expandable receipt; desktop answers use unboxed prose. | Prioritize the outcome while retaining all history and multi-bot identity. |
| Completion changes the active chrome abruptly. | A bounded, inert outgoing surface settles with transform/opacity over 180–240ms. | Preserve continuity without animating transcript height. History refresh does not replay it; interaction, reduced motion, and backgrounding settle it. |
| Expanded email cards expose competing action groups. | Subject, recipients, excerpt and attachments precede one Review / options / Send email row. Optional actions use a local popover. | Make the action obvious while retaining complete review, editing, and recovery. At very narrow widths with enlarged text, the row wraps. |
| Sent email retains the draft card's weight. | Confirmed delivery becomes a quiet receipt with expandable details. | Make completion clear without implying that approval itself means delivery. |
| Marketplace repeats the catalog as an expandable wall of shortcuts. | Search, a Connected filter, and consistent catalog rows. | Remove redundant copy and controls while retaining app details and connection management. |

## Preserved behavior

- Active Gather, hidden-at-rest Stop control, hover/focus access on desktop, and expanded access on touch.
- Pending approvals remain actionable outside collapsed work. Editor opening/saving never sends. Missing previews and changed drafts block sending; remote drafts remain revision/digest-bound. Unknown delivery requires explicit fresh review and never silently resends.
- Reader history, drafts, selection, rich preview DOM, and media playback stay intact.
- Native mobile message bubbles remain unchanged. Shared approval/marketplace/Gather styling needs native acceptance before a later release.
- No model, connector execution, backend approval, or release behavior changes.

## Validation

Local Chromium and WebKit fixtures cover Gather, completion scheduling, retained rich previews, commentary folding, email review, email outcomes, connector editing, connector records, and marketplace behavior. Coverage includes light/dark, narrow layouts, enlarged text, reduced motion, rapid toggles, refreshes, keyboard focus, popover dismissal, duplicate actions, stale results, and failure recovery.

The iOS ComposerUIKitTests fixture fingerprints are updated in both gates to match the shared candidate. This is preparation for native testing, not a native pass.

Native Linux/macOS/Windows application acceptance and iOS/Duo acceptance remain pending. Browser results do not establish native input latency or frame performance. No release or device install was performed.
