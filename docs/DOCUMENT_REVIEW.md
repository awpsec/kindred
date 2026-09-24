# Document review fidelity

DOCX attachments use a layout renderer instead of the former Mammoth text-to-HTML conversion. It preserves document typography, section sizes/margins, explicit and saved page breaks, tables, headers/footers, raster illustrations, numbering, and saved field text. Document paper stays white in either application theme; changing the app theme must not change report colors.

Embedded fonts are loaded under private per-document font family names and released on close. Missing requested fonts are identified in the viewer. External relationships and active HTML chunks are excluded; Office archive expansion and worker execution remain bounded. Original download bytes are unchanged.

This is practical report review, not a Word layout engine. Automatic page flow, floating objects, complex fields, tracked changes and unusual Office drawing formats can differ. TOC/field values are the values saved by the author, not regenerated page numbers. Use an author-exported PDF for final pagination/sign-off. Do not interpret an unavailable font or omitted content as a defect in the author's file.

The workspace artifact hub currently edits Markdown, HTML and React sources and can export document artifacts as DOCX. Binary DOCX attachments use the document viewer; they are not editable Word documents in the artifact hub.

## Verification

`tools/frontend/test-word-layout.cjs` exercises a 21-page report in Chromium and WebKit: Letter geometry, explicit page breaks, headers/footers, merged table cells, font size/weight/color, embedded-font rendering and cleanup, missing-font reporting, raster image decoding, numbered text, saved TOC text and bookmark navigation, external-image blocking, active HTML omission, and narrow viewport preservation of page width.

`test-document-previews.cjs` covers DOCX/XLSX/PDF/text, malformed and oversized archives, opening/closing during loading, polling stability, download bytes and both appearance modes.

`test-artifact-studio.cjs` covers pin/unpin directly from the expanded pane, persistence, pointer departure, and the existing artifact editing/navigation flows.

Run with `KINDRED_PLAYWRIGHT_MODULE` pointing at the local Playwright installation; add `WEBKIT=1` for WebKit. These are browser-engine checks, not native Mac/Windows verification or a measured 90% fidelity certification across arbitrary reports.
