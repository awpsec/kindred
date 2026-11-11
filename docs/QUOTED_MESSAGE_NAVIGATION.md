# Quoted-message navigation

2026-11-11. Source-only follow-up; release hold remains in effect.

The previous message-actions suite failure is resolved. An old quote near the start of a conversation loaded a tiny page, then immediately loaded an adjacent page. Those successive renders consumed the short highlight interval and could replace the highlighted DOM row. The Outcome first desktop prose rule also overrode the highlight's box shadow.

| Before | After | Why |
| --- | --- | --- |
| A short destination page immediately triggers another visible page update | Fill the remaining page before painting the quote destination | Avoid consecutive layout changes on arrival |
| Highlight exists only on one DOM node | Track the destination by account, chat and message; restore its cue across row updates | Refreshing the conversation must not erase reader feedback |
| Desktop prose styling removes the cue's box shadow | Explicit transient quote styling on prose outcomes, with unchanged layout | The destination is visibly identifiable |
| Overlapping jumps can complete out of order | Serialize history access, cancel obsolete requests, and check navigation ownership | The latest quote/chat selection wins |
| An unavailable original can replace the visible history | Verify the returned page contains the requested message first | Missing originals and fetch failures preserve the current view and draft |

## Verification

- `test-message-actions.cjs`: full suite passes Chromium and WebKit, including the previously failing older-message jump, replies, reactions, Copy feedback, keyboard and narrow layouts.
- `test-quoted-navigation.cjs`: both engines cover loaded/old quotes, visible destination styling, focus, refresh with changed reactions, highlight expiry, short-page filling, missing original, failed fetch/retry, overlapping jumps, leaving/returning during a pending request, and retained draft.
- `test-chat-history.cjs`: passes in both engines; checks bounded paging, cached reading position, offloading/reloading, retry, and return to latest. Its cached-view test now holds the response until the cached view is verified rather than comparing a 500ms assertion against an 800ms network timer. This tests cache independence deterministically; it is not a new latency benchmark.

Development evidence: `/opt/kindred/testing/quoted-navigation-20261111/`. Browser checks are not native package acceptance. Desktop and server share the same UI changes. No version, package, installation, or deployment was changed.
