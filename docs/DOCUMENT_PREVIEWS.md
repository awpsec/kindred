# Chat file previews

File receipts use a compact type icon, filename, size, Download split button,
and a secondary-action popover. Preview and validated Google Drive links live
in the popover. Native downloads expose an icon-only Show in folder/Finder
button only after save succeeds, using the existing opaque native receipt.
A native save shows animated downloading dots, then a persistent Saved checkmark
and a Downloads timestamp tooltip. The confirmation is stored per file on this
device; opaque reveal receipts stay in memory. The preview toolbar shares the
button state. Repeat copies require Download again in the menu, and a failed
save offers Retry download. Web downloads preserve original bytes and say
Download started, since a browser cannot confirm the final filesystem save.

Preview opens a modal without changing the chat's height. It supports DOCX,
XLSX, PDF and the existing text, Markdown, image, HTML and JSX types. Closing
or removing the owning card terminates active document workers and PDF tasks.
No external document viewing service is used.

- DOCX: Mammoth converts in a worker with a 20-second timeout. DOMPurify allows
  document structure only. A second check limits image sources to embedded
  PNG/JPEG/GIF/WebP data. Scripts, styles, event handlers, links, forms, author
  IDs, SVG and remote resources are removed before insertion. A shadow root
  isolates formatting; sanitization is the security boundary. Word pagination,
  floating layout and complex styles are approximate.
- XLSX: ExcelJS reads in the same bounded worker. SSF formats saved numeric
  values. Sheet selection and row/column labels support specific feedback.
  Formulas use cached results (or the formula text when no result exists),
  never execute. Charts, drawings and advanced formatting are not reproduced.
  Up to 30 visible sheets, 200 rows and 40 columns per sheet are shown with a
  visible truncation notice. Cell display text is limited to 4,000 characters.
- PDF: a local PDF.js worker and canvas renderer show one page at a time,
  with Previous/Next controls. The old page stays visible until its replacement
  has rendered. Script evaluation is disabled, no PDF actions or links execute,
  and password-protected files offer Download. Complex fonts/images may vary.

All previews enforce the existing 8 MB file limit. Office ZIP containers are
limited to 2,000 entries, 12 MB per entry and 24 MB expanded total before parsing;
converted Word markup is capped at 4 MB. Text/interactive previews retain the
256 KB limit. Unsupported, encrypted or invalid documents leave Download usable.

Build: `npm ci && npm run build` in tools/frontend. Assets are lazy-loaded.
Both desktop resources and server static routes include the new modules/workers.
`test-document-previews.cjs` exercises real DOCX/XLSX/PDF fixtures, pagination,
sheet selection, malformed/oversized archives, polling continuity, cancellation,
byte-preserving web download, native receipt reveal and keyboard menu dismissal.
`test-artifacts.cjs` retains HTML/JSX sandbox and chat reconciliation coverage.

Verification on 2026-09-17: Chromium and WebKit document suites and existing
HTML/JSX artifact regressions passed. An existing native Linux desktop binary
loaded the new UI against local fixtures and rendered DOCX, XLSX and PDF.
Server `cargo check --locked -j 1` and formatting of the modified router passed.
`npm audit --omit=dev` reported no vulnerabilities. Native Windows and macOS
package validation remains part of the next approved release.

Consecutive file attachments in one response now collapse into a stack when
there are more than three. The stack retains every card and its preview/download
state. Opening staggers cards downward; closing reverses that motion. Both
interrupted gestures and live reduced-motion changes settle cleanly. Disclosure
is treated as a reading action, preserving the chat anchor during height changes.
Groups of three or fewer and groups separated by screenshots remain separate.
`test-account-document-polish.cjs` covers thresholds, interruption, reduced motion,
polling continuity, download/reveal and account-menu positioning/focus.

## macOS Word preview and save feedback (2026-09-18)

The 0.53.0 Word viewer used an iframe with `srcdoc`. Wry 0.55.1's macOS
navigation delegate passes navigation URLs to the app's origin check without
excluding subframes. Kindred rejects `about:srcdoc` because it is not the
connected server origin. The iframe therefore stayed blank even though the
DOCX conversion succeeded. Static Word content now renders without a subframe;
the native origin restrictions remain intact. HTML/JSX artifacts retain their
separate sandboxed rendering path.

`test-download-feedback.cjs` blocks every attempted srcdoc assignment, verifies
real Word text still renders, checks that hostile markup cannot execute or
request external assets, and covers pending/saved/failure states, shared preview
controls, duplicate prevention, device confirmation persistence and explicit
repeat downloads. Native Mac package verification remains a release requirement.

Chat reconciliation compares stable file metadata instead of local save-button
markup, keeping an open preview mounted when a saved card receives a chat update.
Chromium and WebKit download-feedback tests, the full WebKit document suite,
and native Linux DOCX/XLSX/PDF content checks passed for this change.
