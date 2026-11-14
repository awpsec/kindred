# iOS 0.90.6 native integration

Based on published desktop source `25094e557dd44648f12a45d2f3ebd8f91098f9a1`.
Retains the native Duo computer mapping/rotation and narration alignment fixes,
alongside the published voice preview streaming, attachments and chat chrome.
The private iOS build is 0.90.6 (4), using the existing application identity.

The bundled native collaboration adapter observes the existing same-origin API
reads and retains only bounded collaboration metadata. It makes no extra API
requests and does not retain chat contents. The native glass nametag shows a
compact subtitle; the Duo toolbar identity shows a status indicator. Both expose
the full status and a long-press Interrupt menu. Cancellation invokes retained
page handlers with their original parent/helper ownership. Context keys expire
across documents, conversation changes and status changes. A missing handler
disables Interrupt; it never guesses an HTTP cancellation target.

The shared desktop nametag remains gated. This integration does not modify the
published shared UI, server deployments, accounts, saved drafts or credentials.
Shared 0.90.6 features require a matching connected server; installing the native
app alone does not update an account's served UI.

Regression coverage:

- `test-ios-native-collaboration.cjs`: WebKit at 390, 951 and 320 points;
  requester/incoming/helper/queued states, native projection, correct cancellation,
  stale context rejection, terminal clearing and reduced motion.
- `ComposerUIKitTests/testNativeCollaborationStatusAndCancellationOwnership`:
  actual WebSession/bridge/UIKit identity or Duo toolbar model, with retained
  parent/helper cancellation and terminal clearing.
- `ComposerUIKitTests/testFourLineNativeDictationGrowsCommitsCancelsAndSends`:
  injected recognition through the real dictation bridge, native text containment,
  fixed composer bottom, commit/edit/shrink/send, cancel/stale-result rejection,
  keyboard/caret preservation and reduced motion. This is not microphone proof.
- `ComposerUIKitTests/testNativeCallDrawerRetainsOwnershipDisclosureAndDraft`:
  native host, original renderer, retained drawer/call nodes, approvals outside,
  unrelated call ownership, arrivals and a focused native draft.

Exact test, signing and device results belong in the private acceptance receipt;
these checks do not authorize replacing public 0.90.6 artifacts.
