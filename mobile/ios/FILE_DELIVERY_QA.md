# Chat file actions

File cards now have separate SVG download and preview buttons. Download progress
comes from received bytes. The ring completes only after the native save succeeds;
then the same control reveals that device's saved file. Markdown filenames still
open their saved copy in the default desktop app.

The shared UI uses native receipts, scoped to the server/account session. These are
stored locally, never in chat messages, settings sync, or workspace transfers.
A reload verifies the file still exists. Moving or deleting it restores Download.
Browsers cannot verify an OS save or reveal a filesystem folder, so retain Download.
Older mobile apps use their existing download/share flow without a false saved icon.

## Native iPhone / Duo checks required before release

- Run `NativeChatFilesTests`, then the normal `ComposerUIKitTests` using the updated
  source fingerprints. The new Swift bridge has not been compiled on this Linux host.
- Download a Word document, workbook and Markdown file. Watch byte progress and
  completion. Tap the folder: iOS should present its saved-file share sheet, from
  which the user can Save to Files or open another app. No download should repeat.
- Relaunch the app and verify its saved-file action persists. The local application
  support directory is excluded from backup; no saved state is written to the server.
- Sign into the same workspace on a second device: every not-yet-downloaded file
  must still show Download. Switch accounts on one phone and check isolation.
- Interrupt networking during download, then retry. No partial copy should appear
  as saved. Verify stale bridge replies after navigating/reloading are ignored.
- Check contracted, open portrait and landscape Duo layouts: the two actions must
  fit and have 44-point touch targets. Preview overlays must retain their existing
  safe-area behavior. Repeat with Reduce motion.
- Inspect the synthetic `default-namespace-drawing.xlsx` fixture. Its cell preview
  must open without the old `anchors` error. Download bytes must match the original.

## Verified here

Chromium and WebKit checks cover icon-only actions, real stream progress, duplicate
clicks, rerender/reload, native receipt lookup, deleted files, account/device isolation,
iOS bridge event filtering, failure/retry, reduced motion and unchanged original bytes.
Full chat document checks pass for DOCX, XLSX (including the drawing regression), PDF
and text in both engines. Markdown source/default-app checks pass in Chromium.
The Linux desktop and server pass `cargo check`; the production Rust receipt index
passes a standalone unit harness. Windows/macOS file-manager actions and native
WKDownload behavior still need their native-platform checks. No release was published.
