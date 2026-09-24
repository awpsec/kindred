# Private collaborative artifacts

Implemented for private workspace use over the existing reachable Kindred server (including Tailscale). No public sharing endpoint, embedded credential, new port or per-artifact server is created. Browser links load the normal Kindred application and require the workspace's existing authentication. Native links use the configured server address; that address must be reachable from the browser.

Bots use artifact_list, artifact_read, artifact_create and artifact_update. Create uses a stable per-chat key; updates keep the artifact ID/link and move one visible card to the latest chat position. Human source edits require Save. HTML/JSX controls can persist JSON through `await window.kindredArtifact.ready` and `await window.kindredArtifact.save(nextState)`. Markdown, HTML and React/JSX are supported. This is a client-side document runtime, not an arbitrary server-side application host. Source is limited to 64 KB and state to 32 KB.

The chat card starts collapsed at 460px maximum width with an inert source-text thumbnail. Clicking its title/thumbnail opens the browser link; Edit and Preview are separate controls. The interactive chat preview is capped at 320px (or 45vh on short windows), with its own scrolling. After three subsequent human messages in the visible conversation, an unedited preview collapses and removes the iframe/polling timer. Bot replies and tool events do not consume those turns. Opening again resets the counter. The artifact workspace opens a full-size preview and source editor. The same document opens through its private browser link and appears under Shared documents in the creator bot's artifact library. Open previews check for changes every five seconds; closed previews run no document code. Source, title and shared state are revision checked. Conflicts preserve the editor draft and require loading/merging the latest version rather than silent overwriting. Bots can read saved human state; state changes do not automatically start another bot task.

After 14 days without an edit, the document is considered archived on read: open previews stop execution and display Reopen. Content, state, stored revisions and stable link are preserved. Reopen resets the inactivity clock. No scheduled worker is necessary for expiry. Merely viewing does not extend its lifetime. Revision snapshots are stored for recovery; there is not yet a user-facing version-history browser.

Generated content runs in an opaque-origin sandbox. Its narrow message bridge is bound to the current iframe and writes only that artifact's shared JSON state. It receives no server token, native IPC or connector credentials. Preview CSP blocks external requests and the host frame policy blocks external frame navigation. Workspace authentication protects GET and PATCH; an artifact ID alone grants no access. Workspace transfers preserve the new tables and accept older packages without them.

Validation: backend checks cover idempotent creation, stable links, state saves, stale revisions, expiry/reopen, cross-workspace isolation, unauthenticated GET/PATCH denial and workspace transfer. Chromium and WebKit tests exercise shared-state saving, forged-message rejection, conflicts with retained drafts, source edits, expiry/reopen, external frame-navigation denial, actual chat preview retention and browser deep links. Existing HTML/JSX sandbox tests also pass in WebKit. Preview screenshots use synthetic client information.

Source changes only. No release, production deployment, public link or VM service was created. Native packaged verification is still required for a release.

## Native artifact workspace

Every model uses Kindred's artifact tools. `/artifacts` opens the workspace library; `/artifacts/<id>` opens the same persistent item directly. Legacy `/artifacts/<id>` links still resolve. External artifact URLs remain ordinary links, with no provider-specific cards or hosting recommendation.

The library is served by the existing Kindred server, including the standalone bundle. It adds no service, port, VM process or public sharing endpoint. Its API uses the same workspace authentication; private server/Tailscale reachability is still required. Source and data live in SQLite with revision snapshots. Only the active preview runs code in the browser; an offline artifact preserves its data without running a preview. Viewing does not reset the 14-day inactivity clock.

A searchable sidebar lists documents, slides, sheets and apps. The full-size workspace provides Preview and an explicit-save document/source editor. New artifacts can start from Markdown, an editable HTML sheet, an editable HTML slide deck or a React app with saved state. HTML supports embedded CSS and JavaScript in one source; JSX uses bundled React. These are Kindred formats, not Microsoft Office or Google editor integrations; arbitrary external packages and network access are not enabled.

Users and bots share the same source, state and optimistic revision checks. Sheet cells, slide content and app data save through the artifact bridge. `kindredArtifact.markDirty()` marks button-driven edits; input events do so automatically. Unsaved preview changes pause live replacement and block unconfirmed navigation. Conflicts retain the source draft instead of overwriting it. Browser creation uses a stable key for request retries. The chat card stays compact, with its existing limited preview and three-turn collapse behavior.

The API lists metadata without source/state, creates items in an existing conversation, and reads/updates by ID. Tests cover browser creation → user state edit → bot source update while retaining shared state, authentication on collection/item routes, stable page endpoints, revision conflicts, preserved expiry/reopening, and workspace transfer. Chromium and WebKit exercise all four starters, deep-link reload, human edits and responsive layouts.

## Shards versus hosted artifacts

Shards are small interactive views embedded directly in a message. Complete `shard-html` / `shard-jsx` fences render without code, Preview, Download or hosting controls. Existing `html`, `jsx` and `react` fences also render this way. Source examples can opt out with `html-source`, `jsx-source`, `text` or `javascript`. Bots receive this distinction in both the core guide and communication chapter; artifact_create describes the hosted path explicitly.

Shards start only when mounted near the visible viewport and after the closing fence arrives. They use the same opaque-origin/no-network sandbox and bundled React runtime. Content determines their height up to 480px, after which the frame scrolls. Interactions survive ordinary chat refreshes and appended prose around an unchanged top-level shard. Editing the shard source, leaving the chat or remounting the history resets local state; use a hosted artifact for persistent shared state. Removing the message removes its frame and listeners. Shards do not inherit hosted cards' three-turn auto-collapse behavior. The saved-items library recognizes explicit shard fences separately from source examples.

Validation adds HTML palette and React table interaction in Chromium/WebKit, light/dark examples, state retention across incoming messages and appended prose, incomplete streaming fences, code-only fences, and the existing sandbox/native isolation checks. Screenshots show synthetic examples, not production bot output.


## Artifact workspace regression checks

The library’s + menu offers New doc, New sheet, New slides and New app, with keyboard navigation and Escape dismissal. Each choice preselects its starter in the creation dialog.

Run `cargo test workspace_artifacts` for isolated database, HTTP and model-tool dispatcher coverage. The stress case creates 128 artifacts across all four kinds, verifies stable-key retries and complete metadata listings, races 32 HTTP writers against the same revision (exactly one must succeed), and verifies that a subsequent bot source edit preserves human state. Invalid types, oversized source/state, missing revisions and incorrect authentication must leave saved content unchanged. The existing cases also cover expiry/reopening, transfer and workspace isolation.

Run `tools/frontend/test-artifact-studio.cjs` in Chromium or WebKit for menu choices, keyboard dismissal, creation, all four interactive starters, conflicts, in-flight refresh draft protection, deep links and mobile layout. These tests use synthetic workspaces and direct tool dispatch; they do not assert that every live provider/model will choose the correct tool without prompting.

Artifact typography defaults to bundled Inter and Liberation Mono, including real italic/bold faces. The renderer caches the bundled font data and embeds it in each opaque-origin preview, without granting preview network access. HTML/JSX and shards expose CSS variables `--font-sans` and `--font-mono`; form controls inherit the document font. Starters use these variables. Explicit document CSS remains authoritative: authors can choose installed/system fonts or embed a custom font using a data-URL `@font-face` within the existing source-size limit. Remote font URLs and external stylesheets remain blocked; custom font licensing is the author's responsibility. Previously saved source that explicitly sets a font retains that choice.

Cross-bot regression coverage checks artifact tool availability in Claude, Codex and Pi tool catalogs, a second bot's read-only review, rejected stale corrections, successful revision-aware correction, and the original bot reading back the updated source/state at the same path. Creating a new artifact also respects an existing unsaved draft before opening the creation dialog. This verifies shared tool access, not live provider inference or a bot's visual review abilities.

## Library and report revisions

The full workspace opens directly on the document, with SVG controls for Refresh,
Edit and Download (in that order), and Modified timestamps. Editing uses a Finish
editing control to return to the document; there is no redundant View tab. Open in browser is available only inside the desktop app.
The library starts collapsed, reveals at the left edge or from its button, and can
be pinned. Folder names are workspace metadata on create/update; sorting supports
last modified (default), oldest first, and title, within folder groups.

`artifact_export` reads the latest saved revision and creates an authenticated chat
attachment. `include_content: true` also returns base64 bytes for a connector upload;
the returned attachment is not a physical Bot Computer file. Export does not itself
upload to a third-party service. Bots should read the latest artifact before further
edits, preserve human changes, and export only after those edits have been saved.
The browser Download action uses the same authenticated export endpoint.

Markdown documents export to DOCX with headings, emphasis, lists, links as text,
and tables. Images/raw HTML are rejected explicitly instead of silently omitted.
This is not a round-trip editor for uploaded Word files or arbitrary Word layouts.
HTML downloads are snapshots with saved shared state; persistent edits still belong
in Kindred. React source and state download as a portable Kindred JSON bundle.

Runtime errors inside the isolated document are surfaced above its content. The
workspace mounts the saved document directly rather than clicking a hidden chat
preview control. Piper's reported HTML was retrieved read-only and rendered in
local Chromium, including with the preceding UI; the original Brave blank-page
cause was not reproduced. No production artifact content was changed.

Artifact rows offer Rename, Move to folder, Details and Pin/Unpin in a right-click
menu (also keyboard Context Menu / Shift+F10). Item pins are a device preference,
sorting them first within their folder. Pin library is also in the context menu;
there is no header pin button. Each folder opens with five items and a Show more
control. Closing it resets that expansion. Details loads current metadata on demand;
creation time comes from saved history, and new artifacts record whether a bot or
workspace user created them. Older artifacts without creator provenance say Not recorded.

Bot authors in Details use the shared chat mention badge and navigate to their DM.
The badge resolves the bot by stable ID against the current bot list, refreshing
its name and portrait while Details is open. Unknown historical authors remain
unattributed. Workspace backgrounds use chat background/panel tokens; generated
HTML may still choose its own authored colors.

Sidebar visibility and the context-menu library pin action use pane-style SVGs.
All icon buttons retain accessible names and hover labels.

The title is editable directly in the header. Title-only saves debounce for 450 ms;
blur/Enter and workspace navigation flush pending edits. Empty titles are not saved,
failed saves retain the draft, and document source edits use revision checks so a
rename cannot silently overwrite concurrent content changes. The modified label
sits directly beneath the title with a compact one-pixel gap.

## Concurrent review regression coverage

`two_bots_merge_repeated_conflicts_without_losing_human_edits` runs two different
bots through the real tool dispatcher over 16 same-revision races. Each round must
accept exactly one write, reject the stale write, and allow the losing bot to reread
and merge. All 32 contributions, the human introduction, shared state, folder,
stable link, and complete revision history must survive, with one current chat card.

`test-artifact-collaboration.cjs` exercises two open source editors: rejected stale
saves retain the draft, a manual merge preserves both contributions, and readers
refresh to the saved result. Moving an artifact through its menu while editing now
advances the editor's baseline for that editor's own metadata change and updates
its folder field, without weakening checks against another writer's revision.
