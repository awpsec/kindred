# Workspace bots and origin sync

Kindred can turn a coding-agent workspace (Claude Code, Codex, Pi or portable Markdown) into a bot using an existing bot's AI provider. The converter drafts an adaptation; the user reviews it before creation. This is an import of selected context, not a copy of an execution environment, provider session, repository or credentials.

## Import a workspace

1. Open **Settings → Skills → Import workspace**. Name the new bot (for example, Harold) and choose an existing, configured converter bot.
2. Choose an exact paired desktop and absolute workspace path, or select a folder snapshot. Paired desktop reads use the converter's existing local-access settings and the desktop's native folder permissions. Kindred must be open on the source desktop.
3. For folder uploads, explicitly add `.claude`, `.codex`, `.agents` and `.pi` under **Include hidden context folders** if the folder picker omits them. WebKit on Linux omits hidden directories when selecting their parent. The paired-desktop scanner includes these context directories automatically.
4. Choose **Prepare draft**. Selected context goes to the converter's AI provider. A card appears in its chat, and preparation survives closing the dialog. **Past imports** resumes pending, interrupted or completed reviews.
5. Review instructions, memories, conversion notes and every skill/command. Edit names, command aliases and entry instructions, or skip entries. Skills and slash commands are shared throughout the profile, so new imports should use a prefix such as `harold-review`.
6. Choose **Create bot**. The bot, memories, selected packages and structured origin commit together. Repeating the same request cannot create a duplicate. Provider/model default to the converter's. New bots use inherited approval settings; desktop access is enabled only if explicitly selected in the review.

You can also ask an existing bot: “Import `/home/me/project` on build-host as Harold.” It uses the same draft and review flow. Existing local permissions still apply.

## What is selected

The scanner finds `CLAUDE.md`, `CLAUDE.local.md`, `AGENTS.md`, `AGENTS.override.md`, `MEMORY.md`, `SYSTEM.md`, `APPEND_SYSTEM.md`, root `README.md`, supported memory folders and `.claude/rules/*.md`. Nested instruction files retain their relative paths so the converter can preserve scope. Bounded, relative `@file.md` references within the selected workspace are followed, up to four hops.

`SKILL.md` packages include their supporting files. Commands and prompt templates are also candidates. This includes `.claude/skills`, `.agents/skills`, `.codex/skills`, `.claude/commands`, `.codex/prompts`, `.codex/commands`, `.pi/skills`, `.pi/prompts` and `.pi/agent/{skills,prompts}`. Portable `commands/` and `prompts/` folders are recognized. Pi single-file Markdown skills with descriptive frontmatter are supported. Other ordinary directories containing `SKILL.md` are supported.

Limits: 5,000 candidate files, 12 directory levels, 64 documents (64 KiB each, 512 KiB combined), 256 workflows (128 files per workflow, 2 MiB per supporting file), and an 8 MiB encoded snapshot. Hidden credentials and ordinary project source are excluded from context discovery; files deliberately packaged inside a skill are included. Native reads reject linked files. No source hooks, scripts, shell commands, dependency installation, MCP settings or sessions are executed or enabled by importing. Global home-directory memories and skills outside the chosen workspace are not silently gathered.

Source workflow entries up to 256 KiB are retained for LLM conversion, including large existing skills that need condensing to the 48,000-byte saved-workflow limit. Document and workflow reads paginate with `next_offset`. The LLM adapts the package entry instructions; supporting files remain intact. Conversion notes identify incompatible tools and dependencies. Imports are not a guarantee that every source workflow can execute unchanged in Kindred's VM.

## Remembering and synchronizing origins

Origin information is appended to memory and stored separately: source type, exact desktop ID/path, previous source snapshot, timestamps, applied instructions/memory and workflow identities. Runtime context supplies the structured origin even after the bot rewrites its own instructions or memory. Profile export/transfer preserves origins and reviews; local-access grants are reset by the existing transfer policy.

Ask Harold to “sync with your origin workspace,” or open **Bot settings → Workspace origin → Prepare origin sync**. Paired origins re-read the saved device/path; offline sources never fall back to another desktop. Uploaded origins require a fresh selection of the source folder (browsers do not retain its absolute path).

The converter compares previous source, previously applied text and current Kindred edits. It proposes a merged update to instructions, memories, skills and commands. The user reviews that update in the UI or the bot's one-time Allow card. Source deletions are retained unless explicitly removed in the review. Reused names belonging to unrelated skills cannot be overwritten. Edits made during preparation/review cause a conflict instead of being overwritten; prepare again to include those edits. Applying the update is atomic and affects future tasks.

## Workflows for existing bots

Any bot can import workflows from any authorized workspace, independently of its AI provider and whether it has a workspace origin. Ask it to scan the selected workspace, preview/import new commands with `skill_import_local`, and refresh linked commands with `skill_refresh_local`. Updates retain the exact source desktop/path, names, command aliases and local edits. This does not create a replacement bot or change its origin. The shared profile catalogue holds up to 256 workflows; updating existing workflows remains possible at the cap.

## Self-editing

Bots can read and update their own instructions using `bot_instructions_get` and `bot_instructions_update` with `bot_id: "self"` (their actual ID also works). The complete proposed text is reviewed using the same one-time Allow policy as editing another bot, including Full access. The exact prior text is required, and denied, cancelled or stale edits do not commit. This changes persistent role instructions; it does not change permissions, provider settings or instructions already loaded by a running task.

## Development verification

- Server: `KINDRED_PI_TEST_NODE=/absolute/path/to/node cargo test -- --test-threads=1`. Install `harness/pi` lockfile dependencies with `npm ci --ignore-scripts` first. Node must meet the pinned harness requirements.
- Native scanner and desktop: `cargo test --manifest-path desktop/Cargo.toml -- --test-threads=1` in kindred-desktop.
- Browser UI: `KINDRED_PLAYWRIGHT_MODULE=/path/to/playwright node tools/frontend/test-workspace-import.cjs`. Exercises Chromium and WebKit; `WEBKIT=1` selects WebKit. Screenshots and JSON results go to `KINDRED_TEST_OUTPUT` (defaults to `/opt/kindred/testing/workspace-import`).

The source changes require a compatible backend and desktop client for paired workspace scans. They remain unreleased until the owner requests packaging/publication.
