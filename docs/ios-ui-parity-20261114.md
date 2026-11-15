# iOS UI parity audit — 2026-11-14

Based on Mac build 6 source `964163046b93010c59edf7849d5b0a00134c890c`. This includes the prior composer Return, control sizing, frost and edge-swipe fixes. Source only: no new release or production server change.

## Confirmed gaps and corrections

- Appearance omitted Bot messages on all mobile clients; prose CSS also excluded mobile. Expose Chat bubbles / Open text and apply the local preference consistently. Bubbles remain the default; drafts and existing message identity are retained.
- In-chat files and grouped files explicitly used the older cards on mobile. Use shared compact rows and groups, preserving 44px coarse-pointer preview/download controls and wrapping long names.
- Library file rows hid metadata and preview controls, and skipped managed download feedback on mobile. Enable the shared file row and delivery path. Native navigation/header composition stays mobile-specific.
- iOS settings inputs/selects used a 16pt base while neighboring labels used 13pt, with an additional minimum-size override. Native settings values now share the 13pt Dynamic Type base and scale with accessibility settings. This does not change Safari or the composer font.
- Artifact Edit/Finish editing were hidden by CSS AND blocked by a capturing click handler; export/download was hidden by CSS. Restore these existing actions through the native Document actions menu, retaining original action closures and save/conflict checks. Zoom stays in the header; the toolbar does not become a row of desktop buttons. Native menu source identity and disabled state still apply.
- The PDF/Word reader had buttons, keys and wheel zoom but no touch pinch. iOS disables page-wide pinch to protect app layout, leaving no document zoom gesture. Add two-finger zoom anchored under the fingers, with native single-finger scrolling/panning retained. Retain PDF canvases while fingers move and rerender at the settled scale; cancellation/disposal clears gesture ownership. Avoid repeatedly publishing unchanged zoom labels.

The live zeddserver served current shared style, reading-size and media modules with `Cache-Control: no-store`; the missing controls were explicit mobile exclusions, not evidence of a generally stale server UI. The installed native bundle still matters for mobile presentation. Both the shared server UI and native bundle must be updated to deliver this complete change.

## Verified locally

Playwright WebKit checks:

- `test-ios-ui-parity.cjs`, Duo and ordinary iPhone (`KINDRED_TEST_IPHONE=1`): Appearance choice and persistence, bubble/prose rendering, retained draft, 1x/1.5x/2x Dynamic Type alignment, responsive file rows/groups, 44px actions, preview, native-menu model, artifact export and edit/save/return-to-preview. Uses disposable fixture data only.
- `test-ios-bot-center.cjs`: both current and legacy navigation adapters, metadata/preview/touch targets, retained chat draft and navigation.
- `test-ios-duo-artifacts.cjs`: Fit Width, synthetic two-finger gesture with retained canvases, Fit Page, Refresh, document switching, search, creation controls, both rail sides, cover/inner/book/tabletop/fold layouts, occlusion, larger text and ordinary phone header fit.
- `test-document-continuous.cjs`: continuous PDF rendering, bounded canvases, keyboard/wheel/manual zoom, resize and lifecycle.
- `test-document-resize-end.cjs`: end-of-document position retained through fit/resize.
- `test-word-layout-fit.cjs`: real DOCX fallback, repeated layout settling/disposal; synthetic pinch changes actual paper scale, one-finger events remain unconsumed, horizontal pan and cancellation work.
- `test-bot-center.cjs` and `test-download-feedback.cjs`: desktop/library behavior, saved-file feedback and iOS delivery transport remain intact.

JS syntax and diff checks pass. Synthetic touch tests exercise the production handlers and geometry; they are not physical finger acceptance.

## Remaining native acceptance

The Mac task is investigating the owner's specific Fit Width lock. Its open-pose native reproduction dismissed the menu and allowed another document to open. That does NOT disprove the reported lock; closed-pose/device reproduction and testing this new touch implementation remain required. Do not label that specific hang fixed without evidence.

Run the matching shared fixture with the new native bundle, then verify actual gestures, native menu dismissal, editing/export, settings and both Duo poses. Preserve installed identity/accounts and real artifacts. New shared UI must eventually be deployed with the matching release; installing only the app cannot remove server-side exclusions from the live UI. No public release or server upgrade is authorized by this audit alone.
