# Deferred tools and reviewed drafts

The provider-facing catalog keeps common conversation, memory and computer tools
available directly. `tool_describe` indexes the remaining scoped capabilities and
returns complete schemas for up to four names. `tool_execute` dispatches an exact
name and argument object through the existing runtime. The index is rebuilt from
the bot, provider, task and current access settings; discovery grants no access.
A deferred action keeps its original receipt identity, ownership checks,
approvals, cancellation behavior and quiet/routine completion semantics.

Call sessions use the same catalog with their existing restrictions. Wrapping a
call cannot create a chat question or post intermediate results into its origin
conversation. Durable call IDs continue preventing duplicate effects.

A remote email send freezes a complete same-account, same-task draft receipt,
including recipient fields, attachment metadata/references, provider version when
supplied, provenance and a SHA-256 digest. Approval submits the displayed digest.
A changed or unavailable current receipt blocks dispatch; the original review
remains readable. A missing preview requests a complete read, never a blind send.

When the provider's live schema explicitly exposes `if_match` or `ifMatch`, a
reviewed ETag is bound to that input before approval. No extra field is invented
for providers without this support. A receipt-bound review alone cannot detect
an external edit that the provider never reports; it is not a universal atomic
compare-and-send guarantee. Approval and unknown-outcome protections still apply.

The waiting-state projection reads approvals, questions, human handoffs,
collaboration and process waits without answering or waking anything. Chat
headers use it even when the pending question lies outside the loaded history
page. Existing detail cards and conversation grouping are retained.

Computer ownership survives bounded local bookkeeping (tool discovery, progress,
memory and continuity reads/writes). Network work and unrelated operations still
release it. Ownership expiry, takeover and fresh-screenshot checks remain intact.
