# Artifact rendering and editing regression

The production app CSP disallows inline scripts. Its previous policy also disallowed inline styles. A `srcdoc` frame inherits that policy, so its own more permissive meta policy cannot make an HTML/React artifact run. Earlier browser and native fixtures omitted those HTTP headers and therefore missed the production failure.

All executable artifact views now navigate to `/artifact-frame.html`, a static shell with its own HTTP policy. The parent sends the compiled document after the shell loads. The response enforces `sandbox allow-scripts` (without same-origin), blocks network/storage/parent access, and allows only inline code/styles and embedded media/fonts. The shell accepts its document only from its parent. The authenticated app retains `script-src 'self'`; local fonts, embedded document fonts, document workers and the same-origin frame endpoint are explicitly allowed. Inline styles are allowed for the sanitized DOCX renderer’s generated styles and document formatting; inline JavaScript remains blocked. The Word layout regression now runs with these production headers as well, rather than checking only that text appeared.

The Linux navigation callback also reports subframes. The exact same-server renderer path bypasses main-window connection tracking, so opening an artifact cannot start a false reconnection timeout. The old `about:srcdoc` guard remains for compatibility.

Full HTML documents retain their document/head/body structure. Renderer selection follows recognizable source content, rather than trusting stale format metadata. The source editor no longer exposes folder, kind or format selectors; it saves the detected format and preserves existing metadata. Folder organization remains available through the library context menu. The in-chat editor follows the same behavior.

A missing frame startup handshake now produces a visible error rather than an unexplained blank page. Script errors and CSP resource failures are also reported. This change does not add unrestricted external dependencies or new executable language runtimes.

Verification:

- `test-artifact-policy.cjs`: real response policies, inline-script rejection in the parent, and header-enforced frame isolation even without an HTML sandbox attribute.
- `test-artifact-rendering.cjs`: HTML/React with deliberately incorrect saved labels, full-document authored styling, opaque frame isolation, automatic detection on edit/save and absence of metadata controls. Optional `KINDRED_ARTIFACT_FIXTURE` loads a local JSON artifact without committing its private contents.
- `test-native-workspace-artifacts.cjs`: actual Linux desktop navigation, shared-state initialization, visible HTML/React content and optional saved artifact. Set `KINDRED_NATIVE_EXE` and run under a display or `xvfb-run`. The fixture now sends the production CSP/X-Frame-Options and loads its probe as a same-origin external script, rather than bypassing policy with an inline probe.
- `test-artifact-studio.cjs`: existing editing, revision conflict, folders, pinning and interactive-state regression coverage.

This change includes both server response policies/routes and desktop navigation handling. Package the matching server and desktop source. Do not treat a fixture without the production HTTP headers as acceptance for a hosted or standalone artifact.

When the artifact library is pinned, its page-level reveal control fades out and becomes inert/hidden to accessibility; the pane itself retains the pin control. Unpinning restores the page control.

2026-09-23 production-header follow-up: the saved running-list HTML rendered in Chromium, WebKit and the rebuilt Linux desktop. Browser checks also covered HTML/React, shard rendering, editing, shared state/conflicts, folders/pinning, fonts and response-enforced isolation. The native check waited beyond the connection watchdog and verified that the main window stayed visible without opening Accounts. Word layout checks in both browser engines verified 816×1056 page dimensions, embedded fonts, headings, headers/footers, images and merged table cells under the same app policy. Native macOS and Windows were not exercised in this follow-up.
