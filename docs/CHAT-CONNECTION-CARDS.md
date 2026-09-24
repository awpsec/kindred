# Chat connection cards

Bots can call `show_connector({"toolkit":"gmail"})` to place a connection card in their current chat. The tool requires an active run in an active chat and deduplicates a toolkit within that run. The message stores only the toolkit id. Account labels and status come from the signed-in workspace's current connection inventory; no account metadata or credentials are embedded in chat history.

The card shows the service logo, description, account labels, status, and Add account action. Connected chips open account management. Unfinished sign-ins reopen their existing authentication link. Expired or failed connections guide the person to add a replacement while preserving the original account. No monitor is silently reassigned or resumed, and no permission is granted by showing a card.

Composio recommends a fresh auth link for reauthentication: https://docs.composio.dev/kb/guide/platform-connected-accounts. Provider-owned Codex and Claude connections continue using their own settings; this card must not be used to silently substitute a Kindred connection.

Frontend coverage: `tools/frontend/test-chat-connections.cjs` (Chromium and WebKit), plus `test-user-flows.cjs` for approvals and computer handoff. The focused server regression is `connection_card_is_scoped_idempotent_and_contains_no_accounts`. Desktop and server UI must ship together; the new bot tool requires the updated server. Source pushes do not publish a release.

Validation on this workspace: Chromium/WebKit card checks and Chromium handoff/account flows passed. `cargo check --locked -j 1` passed. The focused Rust test build was interrupted after several minutes compiling under host contention, before the test executed; it remains a release verification item. Real OAuth and native desktop acceptance were not performed with user accounts.
