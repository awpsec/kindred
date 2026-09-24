# Coordination preflight (2026-09-21)

Run the source regression gate from the `kindred-server` checkout before building
a release candidate:

```sh
KINDRED_PLAYWRIGHT_MODULE=/path/to/node_modules/playwright \
  python3 tools/testing/coordination-preflight.py
```

It compiles the current Rust tests once, runs focused backend suites, then runs
WebKit browser scenarios against isolated fixture servers. No release package,
production database, live model account, or real external send is used. Install
Playwright's WebKit runtime and system dependencies first. `--ui-only` and
`--backend-only` are available for focused follow-up. `--output /path` retains
per-check logs, screenshots, and `results.json`; any failed or empty backend
filter fails the gate. Do not treat a partial invocation as the full gate.

## Coverage

- Group creation, routing, attribution, description, current identity and membership.
- Cross-account isolation, shared files, delegated answers and notification scope.
- Bot handoffs, command waits, completion/failure/stop, recovery after restart,
  and exactly-once continuation/delivery.
- Group connector draft editing, stale approval rejection, exact edited arguments,
  preserved thread/attachment metadata, single dispatch and group-only receipt.
- Connector permission/revocation, Codex fake gateway, failure reporting,
  typed records, editable drafts, repeated clicks and unsaved editor state.
- Parallel group work, per-bot stopping, queued clarification steering,
  quiet routing workers, clustered activity and remote-owner control boundaries.
- Compact connector history, quote navigation, read/unread boundaries,
  disclosures, keyboard use, narrow layouts, enlarged text and both themes.
- Instruction/chat-change reviews, read receipts under the floating composer,
  and unfocused message animations.

## Issues found and changes

The compact group activity redesign had removed the Stop action supplied by the
old per-bot activity row. Restored a small hover/focus Stop control for each local
bot, with always-visible controls on touch devices. More than three workers keep
the avatar cluster and expose individual controls through Manage tasks. Shared
chats only expose controls for the current account's bots. Polling preserves the
open task menu and reflects newly available or stopping controls. The shared-chat
render key now includes local run changes: late-arriving runs expose their controls
without waiting for a new message, and successor runs cannot reuse an old Stop
handler.

Several older browser tests stopped before exercising their workflows because
they still expected pre-slug channel names, expanded connector cards, the former
stack layout, or the former waiting-row markup. Updated selectors and assertions
to the current intended presentation while retaining interaction, ownership,
error, approval and delivery assertions. Added a group version of the connector
approval/dispatch test and explicit clustered/shared-account stop checks.

## Recorded result

130 distinct backend tests passed across 18 selected suites. All 15 browser
scenarios passed in WebKit, including targeted reruns after the fixes. Screenshots
were inspected for the combined group/connector/approval flow. Shared UI files
match the desktop checkout. Evidence for this workspace is retained under
`/opt/kindred/testing/coordination-2026-09-21/`.

The command-wait layout assertion now checks the label's layout width rather
than its temporarily transformed animation bounds during viewport changes.

## Limits

These deterministic tests validate application behavior, not whether a particular
live model will select the best speaker, avoid redundant prose, or accurately
interpret a screenshot. Fake connector gateway tests do not establish Google,
Microsoft, or other live service health. Native packaged Linux startup/reconnection,
real account authentication, and live model coordination still need a release
candidate smoke test. No package or deployment was performed for this pass.
