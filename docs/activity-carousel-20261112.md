# Activity carousel — source candidate

Consecutive long-job, artifact-update, conversation-start and reminder receipts now share one centered carousel. Normal messages and pending approvals remain separate. This change is not a release or deployment.

- Retains the actual transcript nodes and long-job history; rich previews never move into another parent. The first three progress notes and fourth-note Gather promotion retain their entrance behavior.
- Keeps the stacked job header, avatar and title in the same place through expansion and completion. The working bot supplies the thin outline color; completion fades it to neutral. Expanded history uses compact text, with the existing tools and controls intact.
- Uses a back arrow for disclosure, with no second collapse control. Stop stays hidden until hover or keyboard focus; touch exposes it when the job is opened.
- Caps pagination at five dots. Incoming updates follow only when the conversation and carousel are following latest, and the reader has no open disclosure, focus or text selection on that page. Otherwise a count offers the new updates. Older history is never counted as new.
- Artifact and conversation receipts retain their real destinations. Reminder details retain Edit, Cancel, Reschedule and Dismiss, revision checks and error feedback. Full reminder batches repeated by the server are deduplicated.
- Preserves selected pages across conversation changes, refreshes, history prepends and regrouping. A quoted destination reveals its page before navigation. Pending requests remain visible even when they interrupt a job's owned history.
- Opening a disclosure anchors its header rather than scrolling it upward to keep the enlarged page bottom aligned. User and system reduced-motion settings bypass transitions.

## Validation

Browser tests run against the actual shared application, using synthetic local fixture data. Coverage includes Chromium and WebKit at 1100, 390 and 320 pixels; light/dark and touch layouts; 36-update streams and repeated ten-reminder batches (including a partial history page); rapid expansion reversals; active-to-finished position/color; keyboard focus and selection; pending approvals; drafts, caret and scroll anchors; quote navigation; iframe state, video position and open file previews; reminder revision conflicts, duplicate save prevention, timezone/DST editing, cancellation and dismissal.

The focused suite consists of `test-activity-carousel`, `test-activity-carousel-state`, `test-progress-gather`, `test-progress-gather-rich`, `test-progress-arrival`, `test-gather-design`, `test-progress-completion-scheduling`, `test-quoted-navigation`, `test-reminder-editor`, `test-reminder-notifications-connections`, `test-artifact-updates`, and artifact-mode `test-chat-history-stacks`, each in both browser engines. The quote fixture observes its short-lived cue during rendering as well as checking destination focus and position. The progress and quote fixtures explicitly control polling, and the reminder fixture uses the current identity-menu Settings entry point.

Server `cargo check --locked --offline` and JavaScript syntax checks run locally. The server registers the new shared module route, and the shared-UI verification manifest includes it. Existing unrelated Rust warnings are unchanged.

Native macOS, Windows, iOS/Duo and on-device animation performance are not established by browser WebKit tests. No installers, signed updates, release tags, or live deployments were produced.
