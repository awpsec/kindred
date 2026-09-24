# Oliver and Vivienne

These two Easter eggs remember the owner's Golden Retriever Oliver, a companion
for 13 years, and Vivienne, their first bonsai, a natal plum in a teal ceramic pot.
The original SVG artwork was refined with the owner; Oliver has a pale golden
coat, darker golden ears and brow, a cream muzzle and shaggy chest, and an
irregular black marking on his left side of the tongue (the viewer's right).

The triggers require all three identity fields:

| Name | Shape | Palette color |
| --- | --- | --- |
| Oliver | Pebble | Honey (`#ffbe16`) |
| Vivienne | Triangle | Sage (`#2ec767`) |

Name matching ignores capitalization and surrounding whitespace. Legacy Honey
(`#dfc174`) and Sage (`#91c18f`) colors normalize through the ordinary palette.
The saved shape and color remain intact. Changing any trigger field restores
the ordinary avatar, without introducing a new profile type or migration.

When a creation or edit first matches a trigger, the ordinary shape shrinks,
swaps to the tribute at its smallest point, and expands gently over 600 ms.
Opening an existing bot or receiving an ordinary refresh does not replay this.
Reduced motion switches directly; static avatar previews do not animate.

Tributes have only three poses:

| State | Oliver | Vivienne |
| --- | --- | --- |
| Idle | Awake, gentle breathing and blinking | Very slight sway |
| Resting | Closed eyes, slow breathing, slight head tilt | Still |
| Working | Gentle pant, connected tongue and small ear movement | Brief canopy rustle followed by a pause |

Tool actions all map to Working. Waiting, completion and worry map to Idle.
Their paths never morph into monitors, tools, envelopes, planes or other task
shapes. Arrival/departure task effects also bypass those generic morphs. The
revealing scale transition does not change any path geometry.

`ui/avatar-data.js` owns the shared artwork and matching metadata.
`ui/tributes.js` handles matching and the three poses through the existing
visibility-aware character scheduler. Art is trusted bundled SVG; profile text
is not inserted into SVG markup. Generic avatar styles do not animate tribute
parts. The server's notification PNGs use the same paths in the idle pose;
notification cache identity includes the bot name. Shared chat portraits and
the macOS notch receive the name alongside avatar appearance.

Regression coverage: `test-tribute-avatars.cjs` exercises triggers, all task
shapes, reveal timing, edit reversal, create-dialog previews, unchanged-preview
reuse, static/reduced motion, and dark/light rendering in Chromium and WebKit.
Server avatar and notification tests check PNG matching and rename invalidation.
