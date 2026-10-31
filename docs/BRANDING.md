# Kindred identity

The approved identity is **Team shadows**: a periwinkle square, happy orange
circle and curious green triangle with long, subtly tinted cast shadows.
The triangle is 92.5% of the circle's height. Preserve its source path, all three
expressions, face spacing/tilt and the quiet shadows. Orange is an accent.

## Sources and regeneration

`branding/team-shadows.json` contains the exact approved geometry and palettes;
`branding/wordmark.svg` contains the approved outlined wordmark. No runtime font
or remote image service is required for logos.

Run `python3 branding/generate.py` with Python 3, Pillow and librsvg (`rsvg-convert`).
Install the pinned Python dependency with `python3 -m pip install -r branding/requirements.txt`
inside your build virtual environment.
Use `--target web|desktop|macos|ios` to regenerate only one set. Existing Node
icon-generator commands and the iOS `render-assets.py` command are compatibility
entry points for this same source. Installer sidebar regeneration remains
`node scripts/generate-installer-banner.cjs` with Playwright and Python/Pillow.

| Surface | Artwork |
| --- | --- |
| macOS app and Dock | **Light**, always: `desktop/icons/macos.svg`, `.png`, `.icns` |
| Windows and Linux | Light composition in `desktop/icons/icon.svg`, `.png`, `.ico` |
| iOS Home Screen | Default light, dark, and grayscale tinted entries in `AppIcon` |
| iOS loading/recovery and welcome | Original-color `KindredMark`, light/dark at 1x/2x/3x |
| Browser tab | `ui/favicon.svg`, simplified to stay legible at small sizes |
| Browser notifications | `ui/brand-icon.png` |
| Web bookmark | `ui/apple-touch-icon.png` |
| Desktop first run | Theme-specific icon plus inline, outlined wordmark |
| Repository header | `ui/brand-icon.svg`, which adapts to system appearance |

The macOS source remains an opaque square using the light composition; ICNS
contains standard and Retina PNG representations. iOS app-icon sources are
opaque 1024px RGB squares. Let the platform apply its icon presentation; do not
add a second rounded tile to the iOS catalog. In-app marks retain their approved
rounded tile and original colors. See [Apple's icon guidance](https://developer.apple.com/design/human-interface-guidelines/app-icons)
and [asset catalog guidance](https://developer.apple.com/documentation/xcode/configuring-your-app-icon).

Tauri additionally needs an RGBA runtime icon. `desktop/icons/macos-runtime.png`
is a fully opaque copy of the approved light RGB master, with every RGB pixel
unchanged. The macOS configuration selects it alongside the original ICNS;
the approved master and ICNS bytes remain intact.

At 16px the optical variant keeps only the three heads. At 24/32px it omits eyes;
at 48/64px and above it retains the expressions. Small dark assets use restrained
flat shadows to keep the three presences distinct beside Dock neighbours.

First-run branding follows the app's selected theme even if the OS appearance
is opposite. The inline `data-kindred-wordmark` slot is generated from the same
outlined source; do not replace it with a different font or an old text logo.

## Loading behavior

The new logo occupies the existing iOS `KindredLoadingView` and welcome slots.
It does not add a timed intro, startup hold, animation overlay, or desktop splash.
The system launch storyboard remains canvas-only. Readiness, retries, account
switching, accessibility and Reduce Motion keep their existing behavior.

## Validation and integration

Run `python3 -m unittest discover -s branding -p 'test_*.py'` for platform-format
and appearance contracts. `tools/frontend/test-brand-appearance.cjs` checks the
actual first-run assets in light/dark app themes opposite to the OS setting.
Run it in Chromium and WebKit with the existing Playwright environment.

Keep the shared UI files identical in desktop and server. The release shared-UI
verifier now includes all identity assets. Server routes embed the new SVG/PNG
resources so hosted browsers and notifications can load them.

Before a release, verify Home Screen appearances, iOS loading/recovery/welcome
and the light macOS Dock artwork natively. Linux asset checks and browser
screenshots do not constitute native Apple verification. This source change
alone does not authorize or publish a release.
