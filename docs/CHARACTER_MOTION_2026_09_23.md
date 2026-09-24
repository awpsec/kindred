# Character morph, gaze and turning polish

The owner requested a second Opus 5.5 pass specifically on bot morphs, then
provided four eye/gaze references and requested stronger depth during turns.
Claude Code with `claude-opus-5-5` on build-host implemented the core transition
rewrite and working-turn changes. Its session limit interrupted the pass before
gaze integration and verification; Codex completed those parts and reviewed it.

## Changes

- Match winding and start positions of sampled silhouettes before interpolation.
  Formerly, unrelated SVG path starting points could twist a shape into a sliver.
- Preserve the current outline, facial placement and body pose when changing
  tools, including interruption partway through a morph. Features glide into
  place; tool details fade over the handoff rather than the whole face vanishing.
- Carry tool poses into the next loop's starting pose. Mail folds use the same
  correspondence correction, keep their clipping outline current, and fade
  line details through the fold.
- Fuller rounded pill eyes, a higher upward/right resting gaze, eased glances,
  and separate perspective/occlusion for each eye as it travels around the body.
  Each body shape has its own safe face placement. Blinking uses the face's
  actual bounds so the higher gaze does not jump vertically.
- Working turns preserve volume (circular bodies stay circular). Noncircular
  bodies use a smooth rounded-depth projection. The ribbon and eyes follow the
  same rotation, with front/back layering. This remains flat-color SVG artwork,
  not a new 3D rendering engine.
- Tool completion first returns to the bot's body, then runs the existing exit.
  Hidden, detached and reduced-motion transitions settle and release effects.

The approved coffin path, solid side geometry, archive timing and tribute
artwork remain intact. The ordinary face overrides are local to characters.js;
tribute avatar data was not changed.

## Verification

`test-character-morphs.cjs` exercises all eight body shapes at 24, 36 and 84px,
outline volume during morphs, interrupted retargeting, full-turn eye occlusion,
loop seams, app/OS reduced motion, hidden windows and detached nodes.
`test-character-faces.cjs` checks eye containment, blink stability, expressions,
identity synchronization and circular silhouettes. Its wide-eye ratio now
accounts for the deliberately fuller resting pill (1.5 rather than 1.6).

Passed in Chromium and WebKit with production fixture headers: character-morphs,
character-faces, animation-continuity and archive-animation. Face containment
performed 576,000 checks per engine with zero failures. Morph retargeting showed
no outline jump; lifecycle cleanup and working-loop seams passed.

Actual-component GIFs and sampled visual review are in
`/opt/kindred/testing/opus-morph-polish/`: `bot-morphs.gif`, `bot-eyes.gif`,
`bot-turns.gif`, plus baseline/polished contact sheets. These use synthetic
profiles with the production renderer. Final logs are under `checks/`.
Native Windows/macOS desktop engines require separate verification; Linux
headless Chromium/WebKit checks do not substitute for those platforms.

## Visual refinement pass (Opus 5.5, second session)

The owner judged the first pass mechanically smoother but not visibly better.
This pass targets appearance: the four reference images (lone black idle bot
plus group shots), 3D turning, and completeness across shapes and tools.

### Changes

- **Eyes as surface decals.** Each body is an ellipsoid (`faces` in
  characters.js: centre, semi-axes, curvature `bend`, eye `gap`, `scale`). One
  3D frame per eye now drives position, foreshortening, lean and occlusion.
  The resting pose matches the black reference: pills sit high toward the
  upper-right limb, lean about 29° into the curve (reference ≈25–28°), and the
  far eye is about 0.74× the near eye's width. Flatter bodies (square, hexagon)
  keep their pills more upright through `bend`.
- **Glances instead of distortions.** Holds are left-up, centred on the viewer,
  and right. The old "right" glance squashed pills into horizontal slashes; now
  every body keeps pill aspect ≥1.5 through glances. Round and squint
  expressions stay occasional. Squints are shorter and thicker.
- **True limb behaviour.** An eye's footprint follows great circles over the
  surface and stops at the horizon. A turning eye compresses into the edge and
  never crosses the outline. Stroked "happy" arcs are inset by half the stroke.
- **Blinks in JS.** Blinks are phase-synced per bot and timed with the long
  glances (the CSS scaleY blink and its keyframes are removed). Rest uses
  relaxed, lidded pills rather than dots. Reduced motion shows the static
  resting pose with no blinks.
- **Solid turning for non-round bodies.** The front face turns about a
  vertical axis. A single swept wall path (back/middle/front cross-sections
  joined edge by edge, one winding, nonzero union) fills the sides in
  `--bot-side`: the bot colour mixed 76% with black, and #454545 for the
  light-theme adaptive black. The back face appears mirrored without a face;
  the front face darkens slightly edge-on. This is the flat side-shading
  language of the approved coffin, with no gradients. Spheres still turn only
  through their face. Walls and turn transforms exist only while `spin ≠ 0`.
- **Ribbon.** The orbit is wider and tipped the other way, so it rings the
  lower body instead of slashing across the raised gaze.
- **Tools and expressions.** Tool eyes use a defined separation (previously
  crowded). Investigate shows magnified bot-coloured eyes in the lens; before,
  ink-coloured eyes were invisible inside the transparent lens hole in both
  themes. Worried brows are placed from each projected eye, the worried gaze
  gathers above the mouth, and body-face mouths follow the eye midpoint. The
  weight blends continuously into tool faces.
- Tiny avatars (≤28px / ≤40px) get 1.16× / 1.08× eyes. Rest eyes at 24px
  measure ≈4.2px tall.

Unchanged: coffin path and archive solid/choreography, tribute avatars, morph
correspondence/continuity, loop handoffs, scheduler and visibility handling.

### Verification

`test-character-morphs.cjs` adds reference-pose assertions (placement, lean,
far/near ratio, pill size, 24px legibility), pill aspect through 48 glance
samples on all shapes, and edge-on solid depth with distinct side shading. It
also checks face occlusion on the back and a clean exit from mid-turn: idle,
tool morph, reduced motion, immediate, hidden page, arrival and departure all
end with no side walls or turn transform (and the setup is asserted
mid-turn). It also checks brow placement over the projected eyes. The
rapid-change check waits up to 2s for time-based settling on loaded software
renderers. Headless WebKit on this host was equally slow with the committed
baseline.

Chromium and WebKit (production fixture headers, serial) pass
character-faces (576,000 containment checks, 0 failures, full turns included),
character-morphs, animation-continuity and archive-animation. Two WebKit
faces runs failed only their final page-error check: an `/api/chats` poll was
aborted when the test navigated. Geometry passed, and a rerun passed
unchanged. `test-tribute-avatars.cjs` times out on the `#shape-options`
picker selector with the committed baseline too, so it was not used as
evidence. `test-live-work.cjs` needs msedge, which isn't installed here.

Visual evidence, from the production renderer with synthetic profiles:
`/opt/kindred/testing/opus-character-refinement/` holds `compare-{idle,shapes,turn,tools}.png`
(before = eb93ea5), `turns-frames.gif`, `glances-frames.gif`,
`morphs-frames.gif` with contact sheets, `after-worry.png` and dark/light
probes. Native Windows/macOS engines still need their own verification.

Supervisor verification: an independent small-avatar probe sampled 64,416 eye-contour points during full turns across all eight shapes, four eye styles, and 24px/36px sizes; no visible contour escaped its body. Fresh production-renderer eye and depth GIFs use measured frame durations. Native platform verification remains outstanding.

## Shape-specific solids (Opus 5.5, follow-up to 82c268a)

The owner asked for real solid shapes, not 2D outlines given uniform depth:
the pill should read as a pill, the triangle as a pyramid, every shape
appropriate. Later steering: keep the pill and pyramid ("Wow those look
GREAT!"), make the square a clear cube, turn the six-sided bot into a faceted,
soccer-ball-like ball, and add a briefly held long-pill eye stretch.

### Geometry (`renderSolid` in ui/characters.js; `faces[shape].solid`)

Every body turns about the vertical axis x=50 by `c.spin` during working turns.
Idle outlines are unchanged, and all of this appears only while `spin ≠ 0`.

| Shape | Solid | Rendering |
| --- | --- | --- |
| round | sphere | outline invariant; eyes wrap the surface |
| drop | surface of revolution (teardrop) | outline invariant; eyes wrap the surface |
| pebble, cloud | rounded ellipsoidal volumes (depth 0.74 / 0.8) | outline narrows smoothly, no facets; eye decals scale with it |
| capsule | cylinder + hemispherical caps | middle foreshortens by \|cos\|, caps keep radius 26.5; end-on it is a circle. Eyes use the capsule's depth map (cylindrical middle, spherical caps), foreshorten axially and hide as they turn away |
| triangle | rectangular pyramid (depth 30 vs half-base 41.8) | outline keeps its apex; the front face shears so every section converges on it; shaded side face |
| square | cube (depth = width) with rounded vertical edges | flat front turns rigidly (clipped to the outline). Both faces are lit by the same rule, 0.4·(1−facing), so they match at 45°; faint front seam |
| hexagon | faceted ball: a hexagonal cap and two bands of six broad faces falling to the idle hexagon equator, mirrored (26 faces) | the outline turns as a near-round volume derived from the current body outline. Visible faces supply flat tones only, in five bands, clipped to the body, with **no outlines or seams**. Tones fade in with \|sin\| and only on the bot's own body shape, so idle is the flat hexagon and tool morphs keep their true outline. No soccer markings |

The pill and pyramid are as previewed. The cloud is an approximation: its
lobed outline narrows as one ellipsoidal volume. Individual lobes do not
occlude each other. The cube has no camera pitch, so its top face never shows,
which keeps idle identical.

### Eyes

- Long-pill stretch: `eyeExpression` gains a fourth component, a narrower pill
  about 27% taller. It rises over 0.45 s, holds 1.2 s and eases back, in the
  23 s cycle between the round and squint expressions. Glances, blinks, round,
  squint and the uneven Oo are unchanged.
- The eye footprint projection now uses the actual eye height. This fixed a
  real limb crossing on the sphere during a stretched turn, which the
  containment test caught.

### Verification

`test-character-morphs.cjs` adds solid geometry checks that fail if bodies
regress to uniform extrusion:
- sphere/drop outlines are identical through the turn;
- pebble/cloud narrow to their depth with no side walls;
- the pill is a circle end-on (≤4% aspect difference) and long front-on;
- pyramid front faces converge on the silhouette apex (|Δx| < 0.01) and keep
  a narrow top at 45° and 90°;
- the cube shows its diagonal, is as deep as wide, and lights both faces
  equally at 45°;
- the ball is the flat hexagon at rest and shows 6–16 broad shaded faces while
  turning, keeping ≥94% of its width. It has zero stroked elements. A
  mid-turn ball→hammer handoff reshapes the rendered outline with no
  per-frame change above max(2, 0.12 × frame ms), and no face tones remain on
  the tool;
- the stretch is taller and narrower than the same gaze pose at rest.

Two settle waits after leaving a turn are now bounded at 2 s, for headless
WebKit's long frames. Prior containment assertions are unchanged.

Serial Chromium and WebKit runs with production fixture headers all passed:
character-faces (576,000 checks, 0 failures, turns of every solid included),
character-morphs, animation-continuity and archive-animation. JS cost stays
under 1 ms per turning avatar per frame and under 0.2 ms idle, in both
engines. Not run as evidence: `test-tribute-avatars` (stale picker selector,
also fails on the baseline) and `test-live-work` (msedge absent). Native
Windows/macOS engines need their own checks.

Previews from the production renderer are in `/opt/kindred/testing/opus-shape-solids/`:
- `turns-frames.gif`, `expressions-frames.gif` and `handoff-frames.gif`, with
  contact sheets. Durations come from measured capture timestamps
  (`timestamps.json`), so playback speed is real;
- `final-{turn,shapes,tools,idle}.png` stills;
- logs in `checks/`.

The before reference is `/opt/kindred/testing/opus-character-refinement/final-*-turn.png`.

### Final owner corrections (after the wireframe feedback)

- The ball's seam strokes are removed entirely, not softened. It now has 26
  larger faces instead of 50 triangulated ones. Tones are subtle (at most
  0.34 black) and only in flat fills.
- Fixed a real handoff defect. The ball drew a fixed polyhedron hull, so
  during a mid-turn tool morph its outline held the ball shape and fought the
  morph's writes (widths alternating 78–89), then snapped by 7.1 units.
  The outline now derives from the morphing `c.points`. Measured
  ball→hammer: the largest per-frame change is 0.77 units (Chromium) and 0.81
  (WebKit, standalone), with width growing smoothly from 74 to 85.
- The cube's front seam fades as the front goes edge-on, so a quarter turn
  shows a clean, full-size side with no thin dark strip.
- Kept as approved: pill, pyramid, cube. The cloud keeps its documented
  ellipsoidal approximation.

Targeted checks after these corrections, run serially: character-morphs and
character-faces in Chromium and WebKit. Faces passed 576,000 checks with 0
failures in both. Morphs passed in both after one change: the handoff snap
check is now rate-based. In the loaded suite, WebKit's long frames produced
a 6.4-unit step over one long frame, while the standalone per-ms rate matched
Chromium's (≈0.05 units/ms). One earlier WebKit morph run failed the
pre-existing fixed 650 ms "unsettled" wait while 24 avatars morphed at once.
That is the known slow-frame timing on this host; the next runs passed.
animation-continuity and archive-animation were not rerun, since these
corrections don't touch their paths; they passed in both engines earlier in
this pass. Previews are regenerated: `turns-frames.gif`, `handoff-frames.gif`
and `final-turn.png`.

Final supervisor check: 63,348 visible eye-contour samples across all eight shapes, four eye styles, and 24px/36px sizes passed during full turns. Shared source mirrored byte-for-byte to desktop.

Theme correction: adaptive black/white bots use light face tones in light mode, so black cubes and faceted balls retain readable depth. The focused light-theme browser probe verified computed fills and produced light-depth-review.png without browser errors. Other palettes keep dark face tones.

## Unshaded body trial

At the owner's request, cube, pyramid and six-sided body turns now use a single flat fill. Removed face tones, cube seams and the unused facet mesh rather than fading them at the turn boundaries. Silhouette projection, eye foreshortening, back-face visibility and tool morph continuity are retained. The archive coffin is unchanged.

Turn/morph regression checks pass in Chromium and WebKit, including matching side/body fills and absence of shading overlays. Actual renderer capture: /opt/kindred/testing/bot-unshaded/turns-frames.gif. Native desktop platforms were not separately run for this UI-only pass.

## Compact unshaded cube

Claude Code Opus 5.5 adjusted only the cube: restored 18-unit rounded edges and applied uniform, angle-dependent pullback to the silhouette and eye-carrying face together. Diagonal width is now about 1.09 times idle instead of 1.33, with equal front/side dimensions retained. No shading was added. Morph tests pass in Chromium and WebKit, now bounding diagonal width and aspect ratio. Actual capture: /opt/kindred/testing/cube-touchup/turns-frames.gif.
