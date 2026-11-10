# Beside chat file review

Status: implemented for source review. **Release hold: do not publish, package,
deploy or install this change without the owner's later instruction.**

| Before | After | Why |
| --- | --- | --- |
| Opening a chat file covered the conversation with a modal. | Desktop file previews occupy a pane beside the current conversation. | Read and discuss the file without leaving the draft. |
| A preview had to close before opening another file. | Up to four open files retain their mounted renderers behind filename tabs. | Preserve worksheet selection, PDF position and interactive HTML state. |
| Changing available chat width could feel abrupt. | The name tag, transcript and composer move together; the composer background also resizes smoothly. | Make space without animating transcript layout every frame. |
| A narrow side pane could crowd chat. | At conversation widths of 760 px or less, review uses a lower area and the composer moves above it. | Keep both surfaces usable without covering the composer. |

## Behavior

- Desktop app only. The ordinary browser and native iOS preview entry points
  retain their existing behavior. No native iOS feature change.
- Uses the existing authenticated document loaders, isolated HTML renderer,
  download handling, and document conversion/zoom controls.
- Enlarge and return keep the same renderer mounted. Switching files does too.
  A fifth file evicts the oldest inactive preview to bound resource use.
- Opening Details or Computer closes file review; opening file review closes
  those panes. It never stacks three competing panes beside the conversation.
- Draft/editor DOM is retained. Bottom-follow stays at the latest message;
  readers above the bottom retain their visible message and offset.
- Chat/account changes dispose the reading session. Transcript-card replacement
  alone does not dispose it. Close aborts work and disposes mounted previews.
- Escape returns from enlargement, then closes. Keyboard/reduced-motion paths
  settle immediately; pointer transitions use 240 ms transform/opacity motion.
  Closing is a shorter 180 ms fade/slide. Interrupted transitions settle safely.

## Verification

`tools/frontend/test-document-review.cjs` passes 17 checks in both Chromium and
WebKit using synthetic DOCX, XLSX, PDF and interactive HTML. It covers 320–1500 px
windows, draft retention, bottom-follow and reader anchoring, worksheet/iframe
state, enlargement, source-card replacement, refresh, reduced motion, pane
mutual exclusion, account cleanup, rapid reopening, and the iOS exclusion gate.
It samples the actual animation frames, including the composer surface's initial
position and width, and rejects layout-property keyframes.

Existing document-preview, preview-lifecycle, Word fitting and PDF resize/end
regressions passed in both engines. The pane/chat-anchor regression passed its
four Chromium configurations (browser/desktop flags, motion on/off).

The server passed `cargo check --locked --offline` using the existing local cache
(existing unrelated warnings remain). Shared UI and native fixture fingerprints
must match the final source pair. The Linux native document-preview test now
expects the desktop review pane.

Evidence: `/opt/kindred/testing/context-review-implementation-20261110/`.
The browser checks are not native platform acceptance. Windows/macOS/Linux
packaged-app verification remains pending; no package or installation was made.
Before a later release, exercise opening/closing and enlargement with real
keyboard focus, native file downloads, long chats and resized windows on each
native desktop platform. The existing iOS composer fixture gates are refreshed
for the shared assets; iOS simulator/device execution was not run here.
