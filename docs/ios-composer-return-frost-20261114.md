# iOS composer and top frost — 2026-11-14

Based on the 0.90.6 source plus the earlier edge-navigation message-width fix (`eae3d6dffa00339b4251e295fcc09e8d8130ce84`). No publication or server deployment in this change.

- Start the progressive frost at the transcript's top, covering the safe area plus 28pt on Duo cover / 44pt elsewhere. Keep its four gradual blur layers.
- Native Return inserts a newline; the keyboard uses the default Return key. Return still selects visible mention/command completions. Stale completion events cannot submit. Explicit Send retains the original delivery handler.
- The web editor also inserts newlines on iOS, including question answers. Desktop Enter behavior stays unchanged. This shared handler is mirrored to the server; older servers require that update for the web-editor fallback, while native editing works with the new app bundle.
- Composer glyphs are 16pt, primary visible circles 30pt within 44pt controls. Web fallback and native glass match; voice/send contrast still follows the bot accent.

## Verification

Passed locally in Playwright WebKit:

- `test-ios-composer-return-frost.cjs`, Duo and `KINDRED_TEST_IPHONE=1`: multiple Return lines retained, composer grows, explicit Send submits once with exact multiline content; top frost has no gap with zero/nonzero safe areas and cover/inner layouts; gradual masks retained; compact glyphs retain 44pt targets; desktop Enter still sends.
- `test-ios-native-composer.cjs`: native bridge, stale Return rejection, mention/slash selection without sending, draft/revision/context retention, send and bot-accent projection.
- JavaScript syntax and diff checks.

The focused geometry test disables the unrelated fixture selection sampler: its Range offsets can be stale while a multiline draft clears. It reads geometry directly. Native command selection test now waits for selectionchange-driven row publication before pressing a native completion.

UIKit tests were extended in `ComposerUIKitTests.swift` for real Return insertion/no send, `.default` return type, compact circle insets, and preserved native button bounds. They require the Mac runner; no UIKit compile, simulator, or physical Duo acceptance is claimed here.

## Mac acceptance

Reconcile existing Mac work before applying. Run native composer tests, including slash selection, primary glyph contrast in both themes, multiline Return and keyboard growth. Check cover/inner Duo and ordinary iPhone safe areas; tap plus/mic/live voice/send and confirm compact ink with easy targets. Confirm prior edge-swipe width fix remains intact. Install a signed normal development build preserving app identity and accounts only after checks pass. Return source, test and installation receipts. Do not republish immutable 0.90.6 or deploy a new server release.
