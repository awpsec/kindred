# iOS / desktop UI synchronization — October 22, 2026

The integration branch `feat/ios-desktop-sync-20261022` merges the full Mac
`938f317b34d3fe8d2f9ee857500bf6149dc04542` ancestry with desktop
`b889429adf1ea2895bda57e70edffa8b0126a988`. The owner confirmed that the Mac run
finished before implementation resumed. Keep both parents when integrating.

## Behavior

- Native Search invokes the shared conversation/action palette. The server also
  intercepts the older installed adapter's Search button before it focuses the
  now-hidden sidebar filter. Older servers retain the bundled legacy fallback.
- Search waits for successful dismissal before opening a destination. Reopening
  cancels the pending action, including under Reduce Motion.
- Profile menus group Settings, Artifacts, Marketplace and account management on
  both ordinary iOS and the Duo native rail. Native overflow remains available.
- Details, Library and Computer share the new bot center with 44-point controls,
  safe-area clearance, touch file previews and retained computer transport.
  Tabletop retains the whole upper screen region for the computer; the native
  toolbar provides navigation in that pose. Ordinary tablets retain expansion.
- The existing Mac pane widths, bottom-anchored composer, fold-aware keyboard
  geometry, native rail and launch-handoff changes are preserved.
- Native toolbar silhouettes and neutral eyes are generated from the web artwork
  catalog, including stored legacy shapes. Native light/dark surfaces match the
  shared neutral palette. SVG-only changes do not trigger native layout scans;
  transcript mutations no longer force sidebar measurement in the pane observer.

## Verification and limits

Browser tests use WebKit, synthetic native geometry and isolated fixture
accounts/computers. They do not connect to user bots or production VMs.
`test-ios-bot-center.cjs` runs the current bundled adapter and the exact
pre-integration `938f317` adapter against the new server UI. It covers Search,
file preview, safe targets, tab navigation, draft retention and the same
computer transport. Retain that Git object when running the historical check.

Relevant existing suites cover Duo poses/content/sidebar, native menu routing,
edge navigation, message previews, progress layout, composer growth and motion.
Motion tests capture effects at creation and pause them to inspect their frames;
this verifies transitions and cleanup, not a device frame-rate claim.

Regenerate native artwork after renderer/catalog changes:

```
node tools/ios/generate-toolbar-artwork.mjs
node tools/ios/generate-toolbar-artwork.mjs --check
```

Xcode, SwiftUI compilation and native simulator execution are unavailable on the
Linux integration host. Before native distribution, regenerate the Xcode project
with XcodeGen on the Mac and run the app/core suites and actual Duo simulator
matrix. Confirm native profile/overflow menus, all selected toolbar shapes,
light/dark launch, Search keyboard dismissal, tablet expansion, folding while
editing, native Back, Library document/media preview and live computer control.
Physical-device acceptance remains distinct from simulator checks.

Matching shared UI changes must be deployed from the server integration branch.
No release version, signing material, live account data or production service was
changed during this integration; release packaging/deployment remain swarm-owned.
