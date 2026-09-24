# Rendering regression results — September 23, 2026

**Subsequent production failure:** the artifact tests below originally omitted
the server’s HTTP security headers, including in native Linux. Those results
therefore did not establish that artifacts worked with production CSP. The
follow-up in `ARTIFACT_RENDERING.md` reproduces the blank page with those headers,
replaces inherited `srcdoc` policy with an isolated response, and adds policy
coverage to the artifact suites.

Final outcomes: 40 browser suite/engine combinations passed, plus three actual
Linux desktop webview checks. This is scoped rendering evidence, not a guarantee
for every document, operating system or live external service.

## Browser coverage

These 18 suites passed in both Chromium and Playwright WebKit on Linux:

- Connector stack formation, compact receipts, disclosure motion and stacks.
- Artifact rendering, studio, collaboration, fonts and workspace artifacts.
- Word layout and inline shards.
- Assigned group activity and quiet sidebar routing.
- Mention contrast, image paste, floating composer, settings responsiveness
  and pinned ordering.

Four additional suites passed in WebKit: connector stack accessibility,
1,000-message chat history, Composio settings and account-window polish.

Covered cases include dark/light and narrow layouts, initial history versus live
updates, NEW-divider expiry, quiet routine runs, keyboard disclosure controls,
reduced motion, pending approvals and failures, source auto-detection, sandbox
isolation, shared artifact state, conflicting edits, preserved unsaved drafts,
remote reader updates, and responsive account/settings controls.

The DOCX fixture contains 21 pages with page dimensions, headers and footers,
merged cells, a saved table of contents, images, numbering, text formatting and
embedded fonts. It also checks missing-font notices and blocked external/active
content. This does not establish a percentage of fidelity for arbitrary reports;
Word pagination and field recalculation remain separate limitations.

## Native Linux coverage

The actual Tauri/WebKitGTK desktop executable ran against current checkout UI
assets, disposable local API fixtures and temporary app profiles:

- HTML, React and the owner's saved running-list artifact rendered with the
  expected visible content and opaque iframe origins.
- DOCX, XLSX and PDF viewers opened and rendered without reported JS errors.
- Twenty-five connector receipts arrived in a burst, retained one stable group,
  cleaned up animation layers, preserved expanded disclosure, and stayed within
  the viewport in dark/light themes.

## Defect found and fixed

A fourth call arriving during the initial third-call collapse could leave both
formation and rollover animations active, duplicating moving rows briefly. The
rollover now settles the formation first. The regression failed before the fix
and passed afterward in Chromium and WebKit. The native burst check also passed.

The compact-receipt test still encoded the previous three-inline-call threshold
and older-active-call priority. It now verifies two inline calls and newest-call
ordering. Animation checks wait for a polled receipt to reach the DOM before
inspecting its transition. One intermediate-frame sample failed while multiple
renderers competed for memory; the serial focused runs passed without removing
the intermediate-opacity assertions.

## Repeatable checks and boundaries

`tools/frontend/test-recent-flows.py` now includes compact receipts, artifact
source rendering, Word layout, settings responsiveness and chat history in its
default WebKit regression set. Focused browser checks use
`KINDRED_PLAYWRIGHT_MODULE` and `WEBKIT=1` when appropriate.

For native Linux, set `KINDRED_NATIVE_EXE` to the development executable and run
`test-native-workspace-artifacts.cjs`, `test-native-document-previews.cjs`, and
`test-native-connector-stacks.cjs` through `xvfb-run -a` when headless.

Local logs and reviewed screenshots are retained in
`/opt/kindred/testing/render-stress-2026-09-23/`. Original failures are retained
alongside the final compact-receipt and overlap-fix logs. The private saved
artifact fixture is outside Git.

Native macOS/WKWebView and Windows/WebView2 were **not run** in this pass.
Playwright WebKit is not native macOS acceptance, and Chromium is not Windows
WebView2 acceptance. Mobile widths are layout tests, not mobile device tests.
Service/API responses were fixtures; these checks did not authenticate to or
operate Gmail, Venmo, a model provider or a production connector. No package was
published and no installed workspace was changed.
