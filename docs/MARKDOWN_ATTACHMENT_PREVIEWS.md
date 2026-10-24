# Markdown attachment actions

Markdown files (`.md` and `.markdown`, including skill drafts) use a source-file icon and a direct Preview action. Preview shows the original UTF-8 text with line numbers, a fixed-width font and horizontal scrolling. Markdown syntax, HTML and links remain plain text; previewing does not run or install anything. PDF and Word previews retain their existing document renderers.

A desktop app advertising `__KINDRED_MARKDOWN_OPEN` shows Open as the primary action. It uses the existing authenticated Downloads save and then sends the returned receipt to `open_chat_file`. Further clicks reuse that saved file during the app session. Download again remains available in the file menu. The native opener accepts only a current-session receipt pointing to a regular Markdown file, rejects symlinks and changed locations, and invokes the OS default app without a shell. If the computer has no suitable default app, the saved file remains available and the UI reports the opening failure.

Older desktop versions, browser clients and iOS retain their working Download action. They receive the same source preview without requiring new native APIs. This does not add a skill installation action.

## Verification

`tools/frontend/test-markdown-file-actions.cjs` covers the rendered transcript card and native command dispatch with a mock host, download-once/reopen, failure retry, exact Unicode source text, numbered lines, inert markup, narrow/light/dark layout, browser fallback bytes, and PDF/DOCX rendering. Run with the existing Playwright module, and repeat with `WEBKIT=1`.

`desktop/src/markdown_download.rs` has a standalone Rust unit test for allowed extensions, missing files, directories, executable-looking names and symlinks. It can be run with `rustc --edition 2024 --test` without building a desktop package.

Native OS association/launch behavior still requires a packaged Windows/macOS smoke check; the browser tests exercise command dispatch, not an installed editor.
