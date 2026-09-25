import {avatarData} from "./avatar-data.js";
import {tributeIdentity,tributeState,createTribute,applyTributeState,startTributeReveal,renderTribute} from "./tributes.js";
// Original SVG characters. No artwork or code is taken from the reference app.
const NS = "http://www.w3.org/2000/svg";
export const shapes = [
  "round",
  "pebble",
  "square",
  "capsule",
  "triangle",
  "hexagon",
  "cloud",
  "drop",
];
export const colors = [
  ["Black / white", "#ffffff"],
  ["Grey", "#858a8a"],
  ["Sky", "#21b3ff"],
  ["Blue", "#2475ff"],
  ["Periwinkle", "#7960ff"],
  ["Lilac", "#b24cf2"],
  ["Rose", "#f24d93"],
  ["Coral", "#ff6952"],
  ["Apricot", "#ff9638"],
  ["Honey", "#ffbe16"],
  ["Lime", "#a3d92b"],
  ["Sage", "#2ec767"],
  ["Mint", "#24d5a4"],
  ["Teal", "#14bfc7"],
];
export const defaultProfile = {
  label: "",
  description: "",
  shape: "round",
  color: "#2475ff",
  eyes: "curious",
  animated: true,
  pinned: false,
  archived: false,
  notifications: true,
};
function el(tag, attrs = {}) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}
const paths = {
  ...avatarData.paths,
  coffin: "M34 6H66L80 28L69 94H31L20 28Z",
  terminal: "M17 15H83Q94 15 94 27V73Q94 84 83 84H60V91H73Q79 91 79 97H21Q21 91 27 91H40V84H17Q6 84 6 73V27Q6 15 17 15Z",
  investigate:
    "M42 8C62 8 77 23 77 43C77 51 74 58 70 64L91 85Q97 91 89 98Q84 102 79 97L59 75C54 78 48 79 42 79C22 79 7 63 7 43C7 23 22 8 42 8Z",
  hammer:
    "M25 9L70 9Q75 9 78 14L91 28Q94 32 89 35L77 40L62 33L61 91Q61 98 51 98Q41 98 41 91L42 33L23 33L20 41L7 41L7 9L20 9L23 15Z",
  wrench:
    "M37 7L36 28L51 36L65 26L61 7C85 14 89 40 72 54L66 58L64 91Q64 102 52 102Q40 102 40 91L41 57C18 46 16 19 37 7Z",
  write: "M37 11Q37 5 44 5L60 5Q67 5 67 11L67 76L52 100L37 76Z",
  saw: "M16 23Q7 23 7 33L7 66Q7 74 16 74L33 69L40 78L46 69L52 78L58 69L64 78L70 69L76 78L82 69L91 72L88 36L33 29L30 23Z",
  drill:
    "M18 22Q11 22 11 30L11 50Q11 58 19 58L31 58L26 85Q25 93 33 93L55 93Q62 93 60 84L54 58L70 58L76 49L94 49L97 41L77 39L71 24Z",
  read: "M50 24Q29 11 8 19L8 86Q30 77 50 91Q70 77 92 86L92 19Q70 11 50 24Z",
  mail: "M17 21L83 21Q93 21 93 31L93 79Q93 89 83 89L17 89Q7 89 7 79L7 31Q7 21 17 21Z",
  success:
    "M50 5Q54 5 57 13L65 33L88 33Q101 33 91 44L73 60L81 84Q86 98 73 91L50 77L27 91Q14 98 19 84L27 60L9 44Q-1 33 12 33L35 33L43 13Q46 5 50 5Z",
  worry:
    "M48 12C73 6 87 30 84 51L91 83Q93 92 82 90L72 85Q46 96 24 83Q10 77 13 62L15 42Q17 15 48 12Z",
  waiting:
    "M50 13C74 13 88 30 88 53Q88 82 65 86L55 99Q51 105 46 98L40 87C19 82 11 68 12 49C14 28 29 13 50 13Z",
  clock:
    "M50 10C73 10 91 28 91 51C91 74 73 93 50 93C27 93 9 74 9 51C9 28 27 10 50 10Z",
  plane: "M8 39L94 14L65 91L47 64L26 77L30 53Z",
};
// Each body is a rounded solid and the eyes are decals on its surface: an
// ellipsoid centred at (cx, cy) with semi-axes rx/ry in the body's viewBox.
// `bend` is how strongly the surface curves away (a sphere is 1, a flat panel
// less), so broad faces keep their pills upright while spheres foreshorten.
// `scale` keeps the eyes proportionate on narrower silhouettes.
// `gap` is half the distance between the eyes. `solid` is the 3D form each
// body turns as (about a vertical axis through x=50); see renderSolid.
const faces = {
  round:{cx:50,cy:52,rx:40,ry:40,bend:1,scale:1,gap:10.5,solid:{kind:"revolve"}},
  pebble:{cx:50,cy:53,rx:38,ry:34,bend:.9,scale:1,gap:10.5,solid:{kind:"ellipsoid",depth:.74}},
  square:{cx:51,cy:53,rx:36,ry:36,bend:.62,scale:1,gap:11,solid:{kind:"box",half:41.5,corner:18,depth:41.5}},
  capsule:{cx:50,cy:53,rx:40,ry:24,bend:.78,scale:.92,gap:10.5,solid:{kind:"capsule",half:19,radius:26.5,cy:51.5}},
  triangle:{cx:50,cy:68,rx:24,ry:24,bend:.72,scale:.84,gap:8.5,solid:{kind:"pyramid",apex:9.3,base:92,depth:30}},
  hexagon:{cx:50,cy:53,rx:33,ry:36,bend:.72,scale:.96,gap:10,solid:{kind:"ball"}},
  cloud:{cx:50,cy:58,rx:30,ry:24,bend:.85,scale:.9,gap:9.5,solid:{kind:"ellipsoid",depth:.8}},
  drop:{cx:51,cy:64,rx:30,ry:26,bend:.9,scale:.9,gap:9,solid:{kind:"revolve"}},
};
const toolFace = {cx:54,cy:46,rx:18,ry:14,bend:.5,scale:1,gap:9.5};
const bodyAction = action => ['idle','rest','working','worry'].includes(action);
function targetLayout(c, action = c.action) {
  return bodyAction(action) ? faces[c.p.shape] || faces.round : toolFace;
}
function faceLayout(c) {
  const target = targetLayout(c), tr = c.transition;
  if (!tr) return target;
  const from = tr.from.layout, out = {};
  for (const key of ['cx','cy','rx','ry','bend','scale','gap']) out[key] = from[key] + (target[key] - from[key]) * tr.k;
  return out;
}
// Tools carry a smaller face placed on their broad surface.
const placements = {
  terminal:[0,-9,1], hammer:[18,-9,.66], wrench:[24,38,.56], investigate:[0,1,.86],
  write:[14,14,.72], saw:[27,19,.6], drill:[9,9,.6],
};
const mouths = {success:[42,62,7,10,14,0], worry:[46,65,4,-2,8,1], waiting:[46,65,3,0,6,0]};
const details = {
  coffin: "M50 35V58M42 43H58",
  terminal: "M22 62L29 67L22 72",
  investigate: "M42 20a23 23 0 1 0 0 46a23 23 0 1 0 0-46",
  mail: "M13 28L50 58L87 28M13 82L34 61M87 82L66 61",
  read: "M50 29V83M18 69q10-3 21 3M61 72q11-6 21-3",
  clock: "M50 23V52L68 65",
  write: "M39 22H65M39 76L52 82L65 76M47 91H57",
  wrench: "M48 89h9",
  hammer: "M45 84h12",
  saw: "M17 34v26l10-3V37Z",
  drill: "M20 31v16M25 31v16M76 40v9M84 41l-3 7",
};
export function character(profile = {}, size = 44, busy = false) {
  const p = { ...defaultProfile, ...profile };
  p.shape = ({bean:"hexagon",ghost:"cloud"})[p.shape] || p.shape;
  const box = document.createElement("span");
  box.className =
    "character animated" + (busy ? " working" : "");
  box.dataset.shape = p.shape;
  box.style.width = size + "px";
  box.style.height = size + "px";
  box.setAttribute("aria-hidden", "true");
  if (size < 60) box.classList.add("small-character");
  const vivid = avatarData.vivid;
  const color = vivid[p.color?.toLowerCase()] || (/^#[a-f\d]{6}$/i.test(p.color) ? p.color : "#2475ff");
  const channels = [1,3,5].map(i => parseInt(color.slice(i,i+2),16));
  box.style.setProperty("--bot-fill", color);
  if (Math.min(...channels) >= 210 && Math.max(...channels)-Math.min(...channels) < 22) box.classList.add("adaptive-white");
  const tribute=tributeIdentity(p);
  if(tribute){
    createTribute(box,p,tribute,busy);
    renderTribute(box,Date.now(),motionReduced());
    queueMicrotask(()=>animateCharacter(box));
    return box;
  }
  const svg = el("svg", { viewBox: "0 0 100 110", focusable: "false", "shape-rendering": "geometricPrecision" });
  const body = el("g", { class: "character-body" });
  body.append(
    el("path", {
      d: paths[p.shape] || paths.round,
      fill: "var(--bot-fill)",
    }),
  );
  const ink = "var(--bot-ink)";
  const eyes = el("g", { class: "character-eyes", fill: ink });
  if (p.eyes === "happy") {
    eyes.setAttribute("fill", "none");
    eyes.setAttribute("stroke", ink);
    eyes.setAttribute("stroke-width", "4.5");
    eyes.setAttribute("stroke-linecap", "round");
    eyes.append(el("path", { 'data-expression':'happy' }), el("path", { 'data-expression':'happy' }));
  } else if (p.eyes === "sleepy") {
    eyes.append(
      el("rect", { 'data-expression':'sleepy', width: 8, height: 3.6, rx: 1.8 }),
      el("rect", { 'data-expression':'sleepy', width: 8, height: 3.6, rx: 1.8 }),
    );
  } else {
    // Full, parallel-sided pills with round ends; "wide" is fuller still.
    const wide = p.eyes === "wide";
    eyes.append(
      el("path", {
        "data-eye": "true",
        "data-rx": wide ? 5 : 4.3,
        "data-ry": wide ? 10.2 : 9.6,
      }),
      el("path", {
        "data-eye": "true",
        "data-rx": wide ? 5 : 4.3,
        "data-ry": wide ? 10.2 : 9.6,
      }),
    );
  }
  body.append(eyes);
  const mouth = el("path", {
    class: "character-mouth",
    d: "M44 64q5 4 10 0",
    fill: "none",
    stroke: ink,
    "stroke-width": 2.5,
    "stroke-linecap": "round",
    opacity: 0,
  });
  body.append(mouth);
  const face = el("g", { class: "character-face" });
  const gaze = el("g", {class:"character-gaze"});
  gaze.append(eyes);face.append(gaze, mouth);
  const faceProjection = el("g", {class:"character-face-projection"});
  faceProjection.append(face);
  const faceClip = el("g", {class:"character-face-clip"});
  faceClip.append(faceProjection);
  body.append(faceClip);
  const maskId = "lens-" + crypto.randomUUID();
  const mask = el("mask", {
    id: maskId,
    maskUnits: "userSpaceOnUse",
    x: 0,
    y: 0,
    width: 100,
    height: 110,
  });
  const lens = el("circle", {
    cx: 42,
    cy: 43,
    r: 23,
    fill: "black",
    opacity: 0,
    class: "character-lens",
  });
  mask.append(el("rect", { width: 100, height: 110, fill: "white" }), lens);
  svg.append(mask);
  body.querySelector("path").setAttribute("mask", `url(#${maskId})`);
  const detail = el("path", {
    class: "character-detail",
    fill: "none",
    stroke: ink,
    "stroke-width": 2,
    "stroke-linecap": "round",
    opacity: 0,
  });
  body.append(detail);
  const terminalOutput = el("path", {class:"character-terminal-output",d:"M39 72H49M53 72H63M67 72H77",pathLength:1,fill:"none",stroke:ink,"stroke-width":2,"stroke-linecap":"round",opacity:0});
  const terminalCursor = el("path", {class:"character-terminal-cursor",d:"M0 63v10",fill:"none",stroke:ink,"stroke-width":2,"stroke-linecap":"round",opacity:0});
  body.append(terminalOutput,terminalCursor);
  const brows = el("path", {
    class: "character-brows",
    d: "M36 37q4-4 9-3M59 34l10 4",
    fill: "none",
    stroke: ink,
    "stroke-width": 2.2,
    "stroke-linecap": "round",
    opacity: 0,
  });
  face.append(brows);
  const sweat = el("path", {
    class: "character-sweat",
    d: "M83 19q-8 12-3 15q7 4 6-5Z",
    fill: ink,
    opacity: 0,
  });
  body.append(sweat);
  const clipId = "face-" + crypto.randomUUID();
  const clip = el("clipPath", {id:clipId,clipPathUnits:"userSpaceOnUse"});
  const clipShape = el("path", {d:paths[p.shape] || paths.round});
  clip.append(clipShape);svg.append(clip);
  faceClip.setAttribute("clip-path",`url(#${clipId})`);
  const ribbonId = "ribbon-" + crypto.randomUUID();
  const gradient = el("linearGradient", {id:ribbonId,x1:"0%",y1:"100%",x2:"100%",y2:"0%"});
  for(const [offset,color] of [["0%","#73d7e8"],["45%","#b7a2f7"],["100%","#cb83ef"]])
    gradient.append(el("stop",{offset,"stop-color":color}));
  svg.append(gradient);
  const ribbon = () => el("path", {class:"character-turn-ribbon",fill:`url(#${ribbonId})`,stroke:"none",opacity:0});
  const ribbonBack=ribbon(), ribbonFront=ribbon();
  // Solid silhouettes and eye projection carry depth without shading or seams.
  const solid=el("path",{class:"character-solid",fill:"var(--bot-fill)",style:"display:none"});
  const turn=el("g",{class:"character-turn"});turn.append(body);
  const turnClipId="turn-"+crypto.randomUUID(),turnClip=el("clipPath",{id:turnClipId,clipPathUnits:"userSpaceOnUse"}),turnClipShape=el("path");
  turnClip.append(turnClipShape);svg.append(turnClip);
  const turnFrame=el("g",{class:"character-turn-frame","data-clip":`url(#${turnClipId})`});turnFrame.append(turn);
  const motion=el("g",{class:"character-motion"});motion.append(ribbonBack,solid,turnFrame,ribbonFront);
  const presence=el("g",{class:"character-presence"});presence.append(motion);
  svg.append(presence);
  box.append(svg);
  box._character = {
    p,
    size,
    body,
    motion,
    presence,
    solid,
    turn,
    turnFrame,
    turnClipShape,
    faceClip,
    faceProjection,
    clipShape,
    ribbonBack,
    ribbonFront,
    loopStartedAt: Date.now(),
    workStartedAt: Date.now(),
    path: body.querySelector("path"),
    eyes,
    face,
    lens,
    mouth,
    detail,
    terminalOutput,
    terminalCursor,
    brows,
    sweat,
    gaze,
    gazeSeed: Math.random()*900,
    points: sample(paths[p.shape] || paths.round),
    action: "idle",
    frame: 0,
    placement: [0,0,1],
    mouthShape: [44,64,5,4,10,0],
    spin: 0,
    restWeight: 0,
  };
  box.dataset.action = "idle";
  renderGaze(box, Date.now());
  queueMicrotask(()=>animateCharacter(box));
  return box;
}
// Preserve live previews across routine renders. Only entering a matching
// identity reveals the Easter egg; reopening a chat does not replay it.
export function replaceCharacter(container,profile,size) {
  const previous=container.querySelector(':scope > .character');
  if(previous && JSON.stringify(previous._character?.p)===JSON.stringify({...defaultProfile,...profile}))return previous;
  const next=character(profile,size);
  container.replaceChildren(next);
  if(next.dataset.tribute && previous && previous.dataset.tribute!==next.dataset.tribute)revealCharacter(next);
  return next;
}
export function revealCharacter(box,startedAt=Date.now()) {
  if(!box?._character?.tribute)return;
  startTributeReveal(box,startedAt,motionReduced());
  renderCharacterMotion(box);animateCharacter(box);
}
const pointCache = new Map();
function sample(path) {
  if (pointCache.has(path)) return pointCache.get(path);
  const p = el("path", { d: path }),
    length = p.getTotalLength();
  const points = Array.from({ length: 240 }, (_, i) => {
    const v = p.getPointAtLength((length * i) / 240);
    return [v.x, v.y];
  });
  pointCache.set(path, points);
  return points;
}
function polygon(points) {
  return (
    points
      .map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`)
      .join("") + "Z"
  );
}
// Paths start at unrelated points and some wind the other way. Rotate and, if
// needed, reverse the target samples so each point travels the shortest way;
// otherwise the outline twists through itself and pinches midway.
function align(from, to) {
  const n = to.length;
  if (from.length !== n) return to;
  let best = 0, reverse = false, cost = Infinity;
  for (const r of [false, true])
    for (let shift = 0; shift < n; shift += 2) {
      let sum = 0;
      for (let i = 0; i < n && sum < cost; i += 6) {
        const q = to[r ? (shift - i + n) % n : (i + shift) % n];
        sum += (from[i][0] - q[0]) ** 2 + (from[i][1] - q[1]) ** 2;
      }
      if (sum < cost) { cost = sum; best = shift; reverse = r; }
    }
  return to.map((_, i) => to[reverse ? (best - i + n) % n : (i + best) % n]);
}
const opacityOf = (node, fallback = 0) => {
  const value = parseFloat(node.getAttribute("opacity"));
  return Number.isFinite(value) ? value : fallback;
};
const mouthPath = ([x,y,a,b,c,d]) => `M${x} ${y}q${a} ${b} ${c} ${d}`;
function placeFace(c, placement) {
  c.placement = placement;
  c.face.style.transform = "";
  c.face.setAttribute("transform", `translate(${placement[0]} ${placement[1]}) scale(${placement[2]})`);
}
// Everything a transition must continue from, read from what is on screen now.
function featureState(c) {
  const opacity = c.face.style.opacity;
  return {
    placement: c.placement.slice(),
    layout: {...faceLayout(c)},
    rest: c.restWeight,
    spin: ((c.spin % (Math.PI*2)) + Math.PI*2) % (Math.PI*2),
    face: opacity === "" ? 1 : Number(opacity),
    mouth: c.mouthShape.slice(), mouthOpacity: opacityOf(c.mouth),
    brows: opacityOf(c.brows), lens: opacityOf(c.lens), sweat: opacityOf(c.sweat),
    detail: c.detail.getAttribute("d") || "M0 0", detailOpacity: opacityOf(c.detail),
    detailWidth: Number(c.detail.getAttribute("stroke-width")) || 2,
    ribbons: [opacityOf(c.ribbonBack), opacityOf(c.ribbonFront)],
    terminal: [opacityOf(c.terminalOutput), opacityOf(c.terminalCursor)],
  };
}
function transitionFeatures(c, tr, t) {
  const f = tr.from, g = tr.to, k = tr.k = tr.ease(t);
  const mix = (a, b) => a + (b - a) * k, out = 1 - smooth(t / .35), inn = smooth((t - .6) / .4);
  placeFace(c, f.placement.map((v, i) => mix(v, g.placement[i])));
  // The face glides to its new surface instead of blinking out. Only the
  // faceless coffin lets it go, early enough for the archive lid to take over.
  c.face.style.opacity = g.face ? mix(f.face, 1) : f.face * (1 - smooth(t / .6));
  c.restWeight = mix(f.rest, g.rest);
  c.spin = tr.spin ? settledSpin(tr.spin, Date.now()) : mix(f.spin, g.spin);
  let mouth = f.mouth, mouthOpacity = f.mouthOpacity * out;
  if (g.mouthOpacity && f.mouthOpacity > .01) { mouth = f.mouth.map((v, i) => mix(v, g.mouth[i])); mouthOpacity = mix(f.mouthOpacity, 1); }
  else if (g.mouthOpacity) { mouth = g.mouth; mouthOpacity = inn; }
  c.mouthShape = mouth.slice();
  c.mouth.setAttribute("d", mouthPath(mouth));
  c.mouth.setAttribute("opacity", mouthOpacity);
  for (const key of ["brows", "lens", "sweat"]) c[key].setAttribute("opacity", f[key] * out + g[key] * inn);
  const sameDetail = f.detail === g.detail, early = !sameDetail && t < .5;
  c.detail.setAttribute("d", early ? f.detail : g.detail);
  c.detail.setAttribute("stroke-width", early ? f.detailWidth : g.detailWidth);
  c.detail.setAttribute("opacity", sameDetail ? mix(f.detailOpacity, g.detailOpacity) : early ? f.detailOpacity * out : g.detailOpacity * inn);
  c.ribbonBack.setAttribute("opacity", f.ribbons[0] * out);
  c.ribbonFront.setAttribute("opacity", f.ribbons[1] * out);
  c.terminalOutput.setAttribute("opacity", f.terminal[0] * out);
  c.terminalCursor.setAttribute("opacity", f.terminal[1] * out);
}
function originMatrix(matrix, origin = "0px 0px") {
  const [x = 0, y = 0] = origin.split(" ").map(parseFloat);
  return new DOMMatrix().translate(x, y).multiply(matrix).translate(-x, -y);
}
// The body's rendered pose: a CSS tool loop, an unfinished handoff or the
// paper plane's flight. Origins are folded in so poses can be compared.
function bodyPose(body) {
  const style = getComputedStyle(body);
  if (style.transform && style.transform !== "none") return originMatrix(new DOMMatrix(style.transform), style.transformOrigin);
  const list = body.transform?.baseVal;
  const own = list?.numberOfItems ? list.consolidate() : null;
  return own ? originMatrix(DOMMatrix.fromMatrix(own.matrix), style.transformOrigin) : new DOMMatrix();
}
// The first frame of the next CSS loop, so it begins exactly where the morph ends.
function loopStartPose(body) {
  const style = getComputedStyle(body);
  if (!style.animationName || style.animationName === "none") return new DOMMatrix();
  const loop = body.getAnimations().find(a => a.animationName === style.animationName);
  const first = loop?.effect?.getKeyframes().find(frame => frame.offset === 0 && frame.transform);
  try { return originMatrix(new DOMMatrix(first?.transform || "none"), style.transformOrigin); }
  catch { return new DOMMatrix(); }
}
const identity = m => m.isIdentity || ["a","b","c","d","e","f"].every(k => Math.abs(m[k] - (k === "a" || k === "d" ? 1 : 0)) < 1e-4);
// Cubic Hermite from the interrupted transition's speed to rest, so a retarget
// continues moving instead of stalling at zero velocity.
const hermite = m => t => m * (t*t*t - 2*t*t + t) + 3*t*t - 2*t*t*t;
const hermiteSlope = (m, t) => m * (3*t*t - 4*t + 1) + 6*t - 6*t*t;
function stopTransition(c) {
  cancelAnimationFrame(c.frame);
  c.bodySettle?.cancel(); c.bodySettle = null;
  c.transition = null; c.finishTransition = null; c.spinSettle = null;
}
const loops = {
  terminal: 3.2,
  idle: 4.8,
  hammer: 1.65,
  saw: 1.6,
  drill: 0.8,
  wrench: 2.4,
  investigate: 4.2,
  write: 2.1,
  success: 1.8,
  worry: 5.4,
  waiting: 4.5,
  mail: 3,
  read: 5,
};
export function activityState(activity, now, lastActive = 0) {
  const a = activity || {};
  let action = a.shape || "idle", label = a.label || "Ready when you are";
  const busy=['queued','running','awaiting_user','awaiting_approval','cancelling'].includes(a.status);
  const timestamp=Math.max(Number(a.last_active_at)||0,Number(a.completed_at)||0,Number(a.finished_at)||0,lastActive||0);
  const online=busy || (timestamp>0 && now-timestamp<1800);
  if(!busy && a.commands>0)return {action:"waiting",label:a.label||"Waiting for commands",online:true};
  if(!busy)return {action:online?'idle':'rest',label:online?'Ready when you are':'Resting',online};
  if (["think", "investigate", "read", "clock"].includes(action)) action = "working";
  if (a.status === "queued") return {action:"idle",label:"",online};
  if (a.status === "awaiting_user") return {action:"waiting",label:"Waiting for you",online};
  if (a.status === "running" && action === "hammer")
    action = ["hammer", "saw", "drill"][
      Math.floor(Math.max(0, now - (a.started_at || now)) / 9) % 3
    ];
  return { action, label, online };
}
export function syncCharacter(box, now = Date.now()) {
  // One phase per bot: sidebar and chat agree, while teammates blink independently.
  const offset =
    [...(box.dataset.botId || "")].reduce(
      (n, c) => (n * 31 + c.charCodeAt(0)) >>> 0,
      0,
    ) % 150000;
  // Restored DOM nodes keep the same phase instead of starting a new loop.
  for (const animation of box.getAnimations({ subtree: true })) {
    if (animation.effect?.getTiming().iterations === Infinity) {
      // Tool motion starts after its silhouette is complete, never mid-stroke.
      const elapsed = animation.effect.target === box._character?.body
        ? Math.max(0, now - box._character.loopStartedAt)
        : now + offset;
      const time = elapsed % (animation.effect.getTiming().duration || 1000);
      if (Math.abs((animation.currentTime || 0) - time) > 60)
        animation.currentTime = time;
    }
  }
  if (box._character != null)
    animateCharacter(box);
}
export function setActivity(box, action = "idle", { immediate = false, startedAt } = {}) {
  const c = box?._character;
  if (!c) return;
  if(c.tribute){
    const state=tributeState(action);
    if(c.action!==state){applyTributeState(box,state);renderCharacterMotion(box);animateCharacter(box);}
    return;
  }
  if (c.departureAt != null) return;
  if (action === "think") action = "working";
  if (action === "sleep") action = "idle";
  if (!paths[action] && !["working", "idle", "rest"].includes(action)) action = "idle";
  if (c.arrivalAt != null) {
    c.afterArrival = {action,options:{immediate,startedAt}};
    return;
  }
  if (c.action === action) return;
  c.workStartedAt = Number.isFinite(startedAt) ? startedAt : Date.now();
  const reduced = motionReduced();
  const animate = !immediate && !reduced && !document.hidden && box.isConnected && !(c.motionSeen && !c.motionVisible);
  // Everything continues from what is currently drawn, including a morph,
  // turn, flight or tool loop that is still in progress.
  const previous = c.transition, fromAction = c.action;
  const velocity = animate && previous ? previous.slope(performance.now()) : 0;
  const from = featureState(c);
  const bodyFrom = animate ? bodyPose(c.body) : null;
  const pose = getComputedStyle(c.motion).transform;
  stopTransition(c);
  c.deliveryTick = null;
  c.action = action;
  c.body.removeAttribute("transform");
  c.faceProjection.removeAttribute("transform");
  c.faceProjection.style.opacity = "";
  // Worry is an expression on the bot's own recognizable body.
  const targetPath = action === "worry" ? paths[c.p.shape] || paths.round : paths[action] || paths[c.p.shape] || paths.round;
  const reshape = c.path.getAttribute("d") !== targetPath;
  const target = reshape ? align(c.points, sample(targetPath)) : c.points, start = c.points.map(p => p.slice());
  // The coffin keeps its approved 520 ms silhouette timing.
  const duration = reshape ? 520 : 360;
  // Release the previous working pose on the same clock; tools should not inherit its tilt.
  c.poseSettle?.cancel(); c.motion.removeAttribute("transform");
  // A new working state rejoins the shared turn timeline; which of its turns
  // may play is decided once the morph has finished.
  c.turnShift = 0; c.turnGate = -Infinity; c.turnCutoff = null;
  if (animate && pose !== "none") c.poseSettle = c.motion.animate([{transform:pose},{transform:"matrix(1,0,0,1,0,0)"}],{duration,easing:"ease-in-out"});
  box.dataset.action = action;
  box.classList.toggle("working", !["idle", "rest", "success", "worry", "waiting", "coffin"].includes(action));
  box.style.setProperty("--loop-duration", `${loops[action] || 4.8}s`);
  box.classList.remove("morphing");
  const bodyTo = animate ? loopStartPose(c.body) : null;
  box.classList.toggle("morphing", animate);
  const m0 = Math.min(1.5, Math.max(0, velocity * duration));
  // Carry the old loop's pose into the first frame of the next one.
  if (animate && !(identity(bodyFrom) && identity(bodyTo)))
    c.bodySettle = c.body.animate([{transform:bodyFrom.toString(),transformOrigin:"0px 0px"},{transform:bodyTo.toString(),transformOrigin:"0px 0px"}],
      {duration,easing:m0 > .3 ? "cubic-bezier(.3,.45,.45,1)" : "cubic-bezier(.45,0,.55,1)",fill:"forwards"});
  const detail = details[action];
  const to = {
    placement: placements[action] || [0,0,1],
    face: action === "coffin" ? 0 : 1,
    rest: action === "rest" ? 1 : 0,
    spin: from.spin > Math.PI ? Math.PI*2 : 0,
    mouth: mouths[action] || from.mouth, mouthOpacity: mouths[action] ? 1 : 0,
    brows: action === "worry" ? 1 : 0, lens: action === "investigate" ? 1 : 0, sweat: action === "worry" ? .6 : 0,
    detail: detail || "M0 0", detailOpacity: detail ? (action === "coffin" ? 1 : .5) : 0, detailWidth: action === "coffin" ? 4 : 2,
  };
  const begun = performance.now(), ease = hermite(m0);
  const tr = c.transition = {from, to, fromAction, k:0, ease,
    slope: now => hermiteSlope(m0, Math.min(1, Math.max(0, (now - begun) / duration))) / duration};
  // A turn in progress finishes at its own pace rather than inside the morph.
  tr.spin = c.spinSettle = animate ? spinSettle(from.spin, Date.now()) : null;
  // Independent loops (sweat, blink) keep their phase from the first frame.
  if (animate) syncCharacter(box);
  function frame(now) {
    const skip = !animate || motionReduced() || document.hidden || !box.isConnected || (c.motionSeen && !c.motionVisible);
    const t = skip ? 1 : Math.min(1, Math.max(0, (now - begun) / duration));
    if (c.transition !== tr) return;
    if (skip) tr.spin = c.spinSettle = null;
    if (tr.morphed) {
      // The new pose is in place; only the unfinished turn is still settling.
      if (tr.spin && Date.now() < tr.spin.until) {
        c.spin = settledSpin(tr.spin, Date.now());renderGaze(box, Date.now());
        c.frame = requestAnimationFrame(frame); return;
      }
      c.transition = null; c.finishTransition = null; c.spinSettle = null;
      c.spin = 0; renderGaze(box, Date.now());
      return;
    }
    if (reshape) {
      const k = ease(t);
      c.points = start.map((p, i) => [p[0] + (target[i][0] - p[0]) * k, p[1] + (target[i][1] - p[1]) * k]);
      const d = t >= 1 ? targetPath : polygon(c.points);
      c.path.setAttribute("d", d);
      c.clipShape.setAttribute("d", d);
    }
    transitionFeatures(c, tr, t);
    renderGaze(box, Date.now());
    if (t < 1) { c.frame = requestAnimationFrame(frame); return; }
    tr.morphed = true;
    c.points = target;
    c.loopStartedAt = Date.now();
    c.motionReadyAt = skip ? null : c.loopStartedAt;
    // Only turns that can be watched from their start may play: never one
    // already underway, nor one that would overlap the turn still settling.
    if (!skip) c.turnGate = turnClock(c, Math.max(c.loopStartedAt, tr.spin?.until || 0));
    box.classList.remove("morphing");
    syncCharacter(box);
    c.bodySettle?.cancel(); c.bodySettle = null;
    if (action === "mail") delivery(box);
    frame(now);
  }
  c.finishTransition=()=>{tr.spin = c.spinSettle = null;frame(begun+duration);};
  frame(begun);
}

const movingCharacters = new Set();
const motionPreference = matchMedia("(prefers-reduced-motion: reduce)");
let motionFrame = 0;
const smooth = value => {const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t);};
const motionReduced = () => motionPreference.matches || document.documentElement.dataset.motion === "off";
// Observe visibility once per layout change, rather than forcing a layout read
// for every avatar on every frame. Clipped chat history needs no animation work.
const characterVisibility = new IntersectionObserver(entries=>{
  for(const {target:box,isIntersecting} of entries){
    if(!movingCharacters.has(box))continue;
    if(!box._character){retireCharacter(box);continue;}
    box._character.motionVisible=isIntersecting;box._character.motionSeen=true;
    box.toggleAttribute('data-motion-offscreen',!isIntersecting);
    if(isIntersecting)queueCharacterFrame();
  }
});
function queueCharacterFrame(){if(!motionFrame&&!document.hidden)motionFrame=requestAnimationFrame(tickCharacters);}
function retireCharacter(box){box._character?.finishTransition?.();box._character?.poseSettle?.cancel();movingCharacters.delete(box);characterVisibility.unobserve(box);}
function animateCharacter(box) {
  if(!box.isConnected||!box._character)return;
  if(!movingCharacters.has(box)){
    movingCharacters.add(box);box._character.motionVisible=false;
    box.setAttribute('data-motion-offscreen','');characterVisibility.observe(box);
  }
  // Reduced motion still renders the final pose, even before intersection arrives.
  queueCharacterFrame();
}
function tickCharacters() {
  motionFrame=0;let visible=false;const reduced=motionReduced(),now=Date.now();
  for (const box of movingCharacters) {
    if (!box.isConnected || !box._character) {retireCharacter(box);continue;}
    if(document.hidden||(!reduced&&!box._character.motionVisible))continue;
    resumeTurn(box._character,now);
    renderCharacterMotion(box,now);
    if (reduced || (box._character.tribute && (box._character.p.animated===false || !box.classList.contains('animated'))) || (box._character.action==='rest' && !box._character.transition && (!box._character.tribute || box._character.tribute==='vivienne') && box._character.revealAt==null && box._character.arrivalAt==null && box._character.departureAt==null))retireCharacter(box);
    else if(movingCharacters.has(box))visible=true;
  }
  if(visible)queueCharacterFrame();
}
function refreshCharacterMotion(){
  document.documentElement.toggleAttribute('data-page-hidden',document.hidden);
  cancelAnimationFrame(motionFrame);motionFrame=0;
  if(document.hidden||motionReduced())for(const box of movingCharacters){box._character?.finishTransition?.();box._character?.poseSettle?.cancel();}
  if(!document.hidden)for(const box of document.querySelectorAll('.character'))if(box._character)animateCharacter(box);
}
motionPreference.addEventListener('change',refreshCharacterMotion);
document.addEventListener('visibilitychange',refreshCharacterMotion);
new MutationObserver(refreshCharacterMotion).observe(document.documentElement,{attributes:true,attributeFilter:['data-motion']});
// An entirely offscreen list has no running frame to clean up detached avatars.
new MutationObserver(records=>{
  if(records.some(record=>record.removedNodes.length))for(const box of movingCharacters)if(!box.isConnected)retireCharacter(box);
}).observe(document.documentElement,{childList:true,subtree:true});

// A newly created bot, or a new working message, opens from a quiet colored dot.
// Cached avatars keep their birth time through ordinary refreshes.
export function arriveCharacter(box, startedAt = Date.now()) {
  const c=box?._character;
  if (!c || c.arrived || motionReduced() || Date.now()-startedAt>=1150) return;
  if(c.tribute){c.arrived=true;revealCharacter(box);return;}
  c.arrived=true;
  c.afterArrival={action:c.action,options:{immediate:false,startedAt:c.workStartedAt}};
  stopTransition(c);c.poseSettle?.cancel();c.deliveryTick=null;
  c.action="idle";box.dataset.action="idle";box.classList.remove("working","morphing");
  c.arrivalAt=startedAt;box.classList.add("arriving");
  c.body.removeAttribute("transform");c.motion.removeAttribute("transform");
  placeFace(c,[0,0,1]);c.spin=0;c.restWeight=0;
  c.faceProjection.removeAttribute("transform");c.faceProjection.style.opacity="";
  for(const part of [c.detail,c.lens,c.ribbonBack,c.ribbonFront,c.terminalOutput,c.terminalCursor,c.mouth,c.brows,c.sweat])part.setAttribute("opacity",0);
  renderCharacterMotion(box,startedAt);animateCharacter(box);
}

// Let the reply settle, then reverse the arrival into a quiet dot.
export function departCharacter(box, startedAt = Date.now()) {
  const c=box?._character;
  if (!c || c.departureAt != null) return;
  if(c.tribute){setActivity(box,'idle');return;}
  if(c.arrivalAt!=null){c.arrivalAt=null;delete c.afterArrival;box.classList.remove('arriving');c.presence.removeAttribute('transform');}
  // A tool first morphs home to the bot's own body, then the body folds away.
  setActivity(box,'working',{immediate:startedAt+1100-Date.now()<560,startedAt:c.workStartedAt});
  c.departureAt=startedAt+1100;
  // No new turn starts unless it can finish before the body folds away.
  c.turnCutoff=Math.max(turnClock(c,Date.now()),turnClock(c,c.departureAt)-TURN.length);
  box.classList.add('departing');renderCharacterMotion(box);animateCharacter(box);
}

// The body retains its volume during a turn. The face travels toward the edge,
// disappears behind the body, then returns on the other side; it never flips.
export function renderCharacterMotion(box, now = Date.now()) {
  const c=box?._character;if(!c)return;
  const reduced=motionReduced();
  if(c.tribute){renderTribute(box,now,reduced);return;}
  if(reduced)c.poseSettle?.cancel();
  // Turn angle first: the eyes wrap around the body with it.
  const turning=c.action==='working'&&!box.classList.contains('morphing')&&c.arrivalAt==null&&!(c.departureAt!=null&&(reduced||now>=c.departureAt));
  const turn=turning&&!reduced?workingTurn(c,now):null;
  // A turn carried over from before the morph keeps settling at its own pace.
  if(turning)c.spin=!turn?0:c.spinSettle?settledSpin(c.spinSettle,now):turn.angle;
  renderGaze(box, now);
  if(c.departureAt != null && (reduced || now>=c.departureAt)) {
    const t=reduced?1:Math.max(0,Math.min(1,(now-c.departureAt)/650));
    if(c.transition){stopTransition(c);box.classList.remove('morphing');placeFace(c,[0,0,1]);}
    // The working turn and its ribbon wind down rather than vanish.
    if(!c.departureSettled){
      c.departureSettled=true;const pose=getComputedStyle(c.motion).transform;
      c.poseSettle?.cancel();c.motion.removeAttribute('transform');
      if(!reduced&&pose!=='none')c.poseSettle=c.motion.animate([{transform:pose},{transform:'matrix(1,0,0,1,0,0)'}],{duration:320,easing:'ease-out'});
      c.spinSettle=reduced?null:spinSettle(((c.spin%(Math.PI*2))+Math.PI*2)%(Math.PI*2),now);c.ribbonFrom=[opacityOf(c.ribbonBack),opacityOf(c.ribbonFront)];
    }
    const settle=1-smooth(t/.35);
    // An unfinished turn completes at its natural pace while the body folds;
    // whatever remains when the avatar has faded out is no longer visible.
    c.spin=c.spinSettle&&t<1?settledSpin(c.spinSettle,now):0;
    c.ribbonBack.setAttribute('opacity',c.ribbonFrom[0]*settle);c.ribbonFront.setAttribute('opacity',c.ribbonFrom[1]*settle);
    const shape=paths[c.p.shape] || paths.round,target=sample(shape);
    const blend=smooth((t-.05)/.7),scale=1-.88*smooth((t-.08)/.7);
    c.points=target.map(([x,y])=>{const r=Math.hypot(x-50,y-55)||1;return[x+(50+(x-50)*40/r-x)*blend,y+(55+(y-55)*40/r-y)*blend];});
    const d=polygon(c.points);c.path.setAttribute('d',d);c.clipShape.setAttribute('d',d);renderSolid(c);
    c.faceProjection.removeAttribute('transform');
    c.presence.setAttribute('transform',`translate(50 55) scale(${scale}) translate(-50 -55)`);
    c.face.style.opacity=1-smooth(t/.35);box.style.opacity=1-smooth((t-.8)/.2);
    if(t===1)retireCharacter(box);
    return;
  }
  if(c.arrivalAt != null) {
    const t=reduced?1:Math.max(0,Math.min(1,(now-c.arrivalAt)/1150));
    const shape=paths[c.p.shape] || paths.round;
    const target=sample(shape),circle=target.map(([x,y])=>{const radius=Math.hypot(x-50,y-55)||1;return[50+(x-50)*40/radius,55+(y-55)*40/radius];});
    const blend=smooth((t-.57)/.28);
    c.points=circle.map((p,i)=>[p[0]+(target[i][0]-p[0])*blend,p[1]+(target[i][1]-p[1])*blend]);
    const scale=t<.48?.12:t<.77?.12+.95*smooth((t-.48)/.29):1+.07*(1-smooth((t-.77)/.23));
    const d=t===1?shape:polygon(c.points);c.path.setAttribute("d",d);c.clipShape.setAttribute("d",d);
    c.presence.setAttribute("transform",`translate(50 55) scale(${scale}) translate(-50 -55)`);
    c.face.style.opacity=smooth((t-.65)/.23);
    if(t===1) {
      c.arrivalAt=null;c.presence.removeAttribute("transform");box.classList.remove("arriving");c.face.style.opacity=1;
      const next=c.afterArrival;delete c.afterArrival;
      if(next)setActivity(box,next.action,{...next.options,immediate:reduced});
    }
    return;
  }
  if(c.action==='rest'&&!c.transition) {c.motion.removeAttribute('transform');c.faceProjection.removeAttribute('transform');c.faceProjection.style.opacity='';return;}
  if(c.action==='terminal' && !box.classList.contains('morphing')) {
    const elapsed=Math.max(0,now-c.loopStartedAt)/1000,cycle=elapsed%3.2;
    const written=reduced?1:smooth((cycle-.25)/1.25),fade=reduced?1:smooth(cycle/.18)*(1-smooth((cycle-2.55)/.4));
    c.terminalOutput.setAttribute('stroke-dasharray',`${written} 1`);
    c.terminalOutput.setAttribute('opacity',.58*fade);
    c.terminalCursor.setAttribute('transform',`translate(${43+38*written} 0)`);
    c.terminalCursor.setAttribute('opacity',fade*(reduced?.7:.25+.55*(1+Math.cos(elapsed*Math.PI*2/1.05))/2));
  }
  if(c.action==='mail'&&!box.classList.contains("morphing"))c.deliveryTick?.(performance.now(),reduced);
  if(c.action!=="working" || box.classList.contains("morphing")) return;
  if(!turn) {
    c.motion.removeAttribute("transform");c.faceProjection.removeAttribute("transform");c.faceProjection.style.opacity="";
    c.ribbonBack.setAttribute("opacity",0);c.ribbonFront.setAttribute("opacity",0);return;
  }
  const {cycle,wave,gain}=turn,angle=c.spin,side=Math.sin(angle);
  const roll=(4*Math.sin(wave)-8*side)*gain;
  // A sphere turns only through its face, keeping its circular silhouette;
  // other bodies turn as solids in renderSolid.
  const sphere=c.p.shape==='round',breath=1+.008*Math.sin(wave);
  const sx=sphere?breath:1+.012*Math.sin(wave);
  const sy=sphere?breath:1-.018*Math.sin(wave);
  c.motion.setAttribute("transform",`translate(50 ${55+1.3*Math.sin(wave*2)*gain}) rotate(${roll}) scale(${1+(sx-1)*gain} ${1+(sy-1)*gain}) translate(-50 -55)`);
  // The trail follows the same rotation as the face: it sweeps right across
  // the front and left behind. Each tapered segment is layered by its own depth.
  const trailAge=cycle-TURN.start;
  const trailOpacity=turn.plays&&!c.spinSettle?smooth(trailAge/.28)*(1-smooth((trailAge-1.4)/.55)):0;
  const head=angle+.45,tilt=.3,cosT=Math.cos(tilt),sinT=Math.sin(tilt),segments={front:[],back:[]};
  const point=(a,r)=>{
    const x=50*Math.sin(a)+r*Math.sin(a),y=15*Math.cos(a)+r*Math.cos(a);
    return [50+x*cosT-y*sinT,55+x*sinT+y*cosT];
  };
  for(let i=0;i<48;i++){
    const t=i/48,u=(i+1)/48,a=head-2.3+2.3*t,b=head-2.3+2.3*u;
    const width=v=>4.5*Math.sin(Math.PI*v*.92)*Math.sqrt(v);
    const corners=[point(a,width(t)),point(b,width(u)),point(b,-width(u)),point(a,-width(t))];
    const d=corners.map(([x,y],j)=>`${j?'L':'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join('')+'Z';
    segments[Math.cos((a+b)/2)>0?'front':'back'].push(d);
  }
  for(const [ribbon,layer] of [[c.ribbonBack,'back'],[c.ribbonFront,'front']]){
    ribbon.setAttribute('d',segments[layer].join(''));
    ribbon.setAttribute('opacity',.85*trailOpacity*gain);
  }
}
// One full turn in each 4.8 s cycle; 2π at the seam equals 0, so loops join.
// The timeline is shared, so sidebar and chat turn together. A turn plays only
// from its start: after a morph, a pause or ahead of a departure, one already
// underway (or unable to finish) is skipped and the body waits for the next,
// rather than racing to where the timeline has got to. The ramp-in gain eases
// the bob and roll only; it never scales the angle into a fast spin.
const TURN={cycle:4.8,start:1.5,length:1.65};
const turnClock=(c,now)=>(now-c.workStartedAt)/1000+(c.turnShift||0);
function workingTurn(c,now){
  const elapsed=Math.max(0,turnClock(c,now)),n=Math.floor(elapsed/TURN.cycle),cycle=elapsed-n*TURN.cycle,start=n*TURN.cycle+TURN.start;
  const gain=c.motionReadyAt==null?1:smooth((now-c.motionReadyAt)/450);
  const plays=start>=(c.turnGate??-Infinity)-1e-6&&start<=(c.turnCutoff??Infinity);
  return {cycle,wave:elapsed*Math.PI*2/TURN.cycle,angle:plays?smooth((cycle-TURN.start)/TURN.length)*Math.PI*2:0,plays,gain};
}
// Frames stop while the page is hidden, the avatar is scrolled away or the
// window is throttled. On return a turn that was showing continues from the
// pose it left (the clock advances by a single frame); otherwise the body
// waits for the next turn instead of jumping into the middle of one.
function resumeTurn(c,now){
  const last=c.tickedAt;c.tickedAt=now;
  if(c.action!=='working'||c.tribute||last==null||now-last<=200)return;
  const before=workingTurn(c,last),turning=before.plays&&before.cycle>TURN.start&&before.cycle<TURN.start+TURN.length;
  if(turning)c.turnShift=(c.turnShift||0)-(now-last-16)/1000;
  else c.turnGate=Math.max(c.turnGate??-Infinity,turnClock(c,now));
}
// Finish a turn along its own curve at its natural pace; one that has barely
// begun eases back instead. Angles are in [0, 2π).
function spinSettle(angle,at){
  const y=angle/(Math.PI*2);
  if(!(y>1e-4&&y<1-1e-4))return null;
  const u=.5-Math.sin(Math.asin(1-2*y)/3),dir=y<1/12?-1:1;
  return {u,dir,at,until:at+(dir>0?1-u:u)*TURN.length*1000};
}
const settledSpin=(s,now)=>smooth(s.u+s.dir*Math.max(0,now-s.at)/(TURN.length*1000))*Math.PI*2;
export function idleCompanion(box) {
  setActivity(box,"idle");
  const timer=setInterval(()=>{if(!box.isConnected){clearInterval(timer);return;}animateCharacter(box);},1000);
}
// Turn each body as its own solid about the vertical axis x=50, for c.spin:
//  revolve   sphere and drop are surfaces of revolution; the outline never changes.
//  ellipsoid pebble and cloud narrow smoothly to their depth, with no facets.
//  capsule   a cylinder with hemispherical ends: the middle foreshortens and the
//            caps keep their radius, so end-on it is a circle.
//  box       a cube with rounded vertical edges: its flat front turns rigidly
//            beside a side face, both using the same flat body colour.
//  ball      the six-sided bot: a near-round volume whose eyes wrap around
//            the surface. Its outline follows tool morphs continuously.
//  pyramid   a rectangular pyramid: the outline keeps its apex and the front
//            face shears toward it, so faces converge instead of extruding.
// Returns the turn angle the eye decals should wrap by (0 when the face rides
// a flat front, or is carried by the cylinder mapping in c.eyeMap).
// Idle bodies keep no extra paths, clips or transforms.
function renderSolid(c){
  const solid=(faces[c.p.shape]||faces.round).solid,kind=solid.kind;
  const angle=c.spin||0,s=Math.sin(angle),co=Math.cos(angle),cx=50;
  c.eyeMap=null;
  if(kind==="revolve")return angle;
  if(Math.abs(s)<.0015&&co>0){
    if(c.solidOn){
      c.solidOn=false;c.solid.style.display='none';c.turn.removeAttribute('transform');c.turnFrame.removeAttribute('clip-path');
      c.faceClip.style.opacity='';
      if(c.path.getAttribute('d')===c.solidMapped){c.path.setAttribute('d',c.solidBase);c.clipShape.setAttribute('d',c.solidBase);}
      c.solidMapped=null;
    }
    return kind==="ellipsoid"||kind==="ball"?angle:0;
  }
  c.solidOn=true;
  const outline=map=>{const d=polygon(c.points.map(([x,y])=>[cx+map(x-cx,y),y]));return d;};
  if(kind==="ball"){
    // The outline follows the current (possibly morphing) body, so handing off
    // to a tool never holds the ball shape and then snaps.
    const base=c.path.getAttribute('d');if(base!==c.solidMapped)c.solidBase=base;
    const k=Math.hypot(co,.95*s),d=outline(dx=>dx*k);
    c.path.setAttribute('d',d);c.clipShape.setAttribute('d',d);c.solidMapped=d;
    c.eyeMap=(x,y,cols)=>({x:cx+(x-cx)*k,y,cols:[cols[0]*k,cols[1],cols[2]*k,cols[3]],visible:1});
    return angle;
  }
  if(kind==="ellipsoid"||kind==="capsule"){
    // Curved solids: the body outline itself changes; no side faces.
    const base=c.path.getAttribute('d');if(base!==c.solidMapped)c.solidBase=base;
    let d;
    if(kind==="ellipsoid"){
      const k=Math.hypot(co,solid.depth*s);
      d=outline(dx=>dx*k);
      c.eyeMap=(x,y,cols)=>({x:cx+(x-cx)*k,y,cols:[cols[0]*k,cols[1],cols[2]*k,cols[3]],visible:1});
    }else{
      const L=solid.half,S=Math.abs(co),r=solid.radius;
      d=outline(dx=>{const u=Math.abs(dx);return Math.sign(dx)*(u<=L?u*S:L*S+u-L);});
      // Eyes sit on the cylinder: the axial direction foreshortens and each eye
      // rotates with the surface depth at its height, hiding as it turns away.
      c.eyeMap=(x,y,cols,height)=>{
        // Surface depth: cylindrical over the middle, spherical over the caps,
        // taken at the eye's farthest extent so the whole pill stays on the body.
        const dx=x-cx,reach=Math.max(Math.abs(y-height-solid.cy),Math.abs(y+height-solid.cy)),cap=Math.max(0,Math.abs(dx)+5-L);
        const z0=Math.sqrt(Math.max(0,(r-2.5)**2-reach**2-cap**2)),depth=-dx*s+z0*co;
        return {x:cx+dx*co+z0*s,y,cols:[cols[0]*co,cols[1],cols[2]*co,cols[3]],visible:smooth(depth/(.25*r))*smooth((Math.abs(co)-.04)/.16)};
      };
    }
    c.path.setAttribute('d',d);c.clipShape.setAttribute('d',d);c.solidMapped=d;
    return kind==="ellipsoid"?angle:0;
  }
  // Faceted solids: the flat front (with the face) turns as an affine plane in
  // front of a silhouette filled with the same flat body colour.
  c.solid.style.display='';
  const sign=co<0?-1:1,a=sign*Math.max(.002,Math.abs(co));
  let front,walls;
  if(kind==="box"){
    const H=solid.half,R=solid.corner,D=solid.depth,S=((H-R)*Math.abs(co)+(D-R)*Math.abs(s))/(H-R),U=H-R;
    // An unshaded cube seen corner-on is a much wider flat card. Pull the whole
    // cube back a little as its outline widens (1 at front, side and back), so
    // it stays compact while keeping equal width and depth.
    const k=1/(1+.55*(S*U+R-H)/H),cy=53;
    walls=polygon(c.points.map(([x,y])=>{const u=Math.abs(x-cx);return [cx+k*Math.sign(x-cx)*(u<=U?u*S:U*S+u-U),cy+k*(y-cy)];}));
    front=`matrix(${k*a} 0 0 ${k} ${cx-k*a*cx+k*sign*D*s} ${cy-k*cy})`;
    c.turnClipShape.setAttribute('d',walls);c.turnFrame.setAttribute('clip-path',c.turnFrame.dataset.clip);
  }else{
    // Pyramid: a cross-section at height y is a rectangle shrinking to the apex.
    const h=solid.base-solid.apex,W=Math.abs(co)+solid.depth/(cx-8.2)*Math.abs(s),near=sign*solid.depth;
    walls=outline(dx=>dx*W);
    front=`matrix(${a} 0 ${near*s/h} 1 ${cx-a*cx-near*s*solid.apex/h} 0)`;
  }
  c.solid.setAttribute('d',walls);
  c.turn.setAttribute('transform',front);
  c.faceClip.style.opacity=smooth((co-.02)/.16);
  return 0;
}
// Gaze poses: [seconds, yaw, pitch, roll] in radians on the body's surface.
// The resting pose looks high and to the right, eyes leaning into the curve;
// glances are held long enough to read as intent, not drift.
const gazePoses=[[0,.42,.52,.3],[3,.42,.52,.3],[3.45,-.4,.22,-.1],[5.7,-.4,.22,-.1],
  [6.25,.04,-.1,.02],[8.7,.04,-.1,.02],[9.15,.6,.14,.12],[11.5,.6,.14,.12],[12.2,.42,.52,.3],[17,.42,.52,.3]];
const restPose=[.2,-.28,.05];
// A blink every 6.3 s (a double one every third), plus one at the start of the
// two long glances, as eyes naturally do when the head moves.
function blinkAt(time,cycle){
  const pulse=q=>{const v=Math.max(0,1-Math.abs(q)/.085);return v*v*(3-2*v);};
  const phase=((time%6.3)+6.3)%6.3,round=Math.floor(time/6.3);
  return Math.min(1,Math.max(pulse(phase-5.95),round%3===1?pulse(phase-6.2):0,pulse(cycle-3.08),pulse(cycle-8.78)));
}
// Project a point on the unit sphere facing (yaw, pitch) with the face rolled by
// `roll`, offset sideways by the eye gap. Returns its normal and surface frame.
function surfaceFrame(yaw,pitch,roll,offset){
  const sy=Math.sin(yaw),cy=Math.cos(yaw),sp=Math.sin(pitch),cp=Math.cos(pitch),sr=Math.sin(roll),cr=Math.cos(roll);
  const n=[cp*sy,sp,cp*cy],u=[cy,0,-sy],v=[-sp*sy,cp,-sp*cy];
  const right=u.map((x,i)=>x*cr+v[i]*sr),up=v.map((x,i)=>x*cr-u[i]*sr);
  const so=Math.sin(offset),co=Math.cos(offset),q=n.map((x,i)=>x*co+right[i]*so);
  // Re-orthogonalise "up" on the eye's own spot of the surface.
  const dot=up[0]*q[0]+up[1]*q[1]+up[2]*q[2],w=up.map((x,i)=>x-dot*q[i]),len=Math.hypot(...w)||1;
  const upAt=w.map(x=>x/len),rightAt=[upAt[1]*q[2]-upAt[2]*q[1],upAt[2]*q[0]-upAt[0]*q[2],upAt[0]*q[1]-upAt[1]*q[0]];
  return {normal:q,right:rightAt,up:upAt};
}
function renderGaze(box, now) {
  const c=box._character, reduced=motionReduced();
  const seed=box.dataset.botId ? [...box.dataset.botId].reduce((n,v)=>(n*31+v.charCodeAt(0))%1009,0) : c.gazeSeed;
  const time=now/1000+seed, cycle=((time%17)+17)%17;
  let a=gazePoses[0],b=gazePoses[1];for(let i=1;i<gazePoses.length;i++)if(cycle<=gazePoses[i][0]){a=gazePoses[i-1];b=gazePoses[i];break;}
  const t=smooth((cycle-a[0])/(b[0]-a[0])), rest=c.restWeight;
  let [yaw,pitch,roll]=reduced?gazePoses[0].slice(1):[1,2,3].map(i=>a[i]+(b[i]-a[i])*t);
  yaw+=(restPose[0]-yaw)*rest;pitch+=(restPose[1]-pitch)*rest;roll+=(restPose[2]-roll)*rest;
  // Worry gathers the eyes above its mouth, glancing up, while still drifting a little.
  const worry=.82*opacityOf(c.brows);
  yaw+=(.06-yaw)*worry;pitch+=(.3-pitch)*worry;roll+=(.03-roll)*worry;
  // A tool's face has less room to wander; blend that constraint during morphs.
  const room=action=>bodyAction(action)?1:.45;
  const freedom=c.transition?room(c.transition.fromAction)+(room(c.action)-room(c.transition.fromAction))*c.transition.k:room(c.action);
  yaw*=freedom;pitch*=freedom;roll*=freedom;
  const face=faceLayout(c), expression=eyeExpression(time,reduced||rest>.99);
  // Rounded solids wrap the eyes around their surface; flat fronts carry them
  // rigidly (renderSolid transforms the face with the front plane).
  const spin=renderSolid(c);
  const [wide,question,stretch]=[expression[0],expression[2],expression[3]],squint=expression[1]+(.72-expression[1])*rest;
  // Tiny avatars get slightly fuller eyes so the pills stay legible at 24 px.
  const legible=c.size<=28?1.16:c.size<=40?1.08:1;
  const blink=reduced?0:blinkAt(time,cycle)*(1-wide*.6);
  c.eyes.style.transformBox="fill-box";c.eyes.style.transformOrigin="center";
  c.gaze.removeAttribute('transform');
  // Worried brows ride just above each projected eye, inner ends raised.
  const browing=opacityOf(c.brows)>0;let brows='',mid=[0,0];
  for(const [i,eye] of [...c.eyes.children].entries()) {
    const side=i===0?-1:1,offset=side*Math.asin(Math.min(.8,face.gap/face.rx));
    // Position and occlusion follow the full turn; the drawn frame follows the
    // surface's own curvature so flatter bodies keep their eyes upright.
    const at=surfaceFrame(spin+yaw,pitch,roll,offset);
    const drawn=surfaceFrame(spin+yaw*face.bend,pitch*face.bend,roll,offset*face.bend);
    // Each eye passes around the edge independently, never mirrors on the back.
    const facing=at.normal[2];
    eye.style.opacity=smooth((facing-.02)/.18);
    const scale=face.scale*legible;
    // Project the eye's real footprint: its edges follow great circles over the
    // surface and stop at the horizon, so a turning eye compresses toward the
    // limb and never crosses the outline. Flatter bodies keep the upright frame.
    // Stroked arcs sit inside by their stroke's half-width.
    const inset=eye.dataset.expression==='happy'?2.6:0;
    const screen=q=>[face.cx+(face.rx-inset)*q[0],face.cy-(face.ry-inset)*q[1]];
    const edgeAt=(axis,angle)=>{
      const n=at.normal,point=a=>n.map((v,j)=>v*Math.cos(a)+axis[j]*Math.sin(a));
      let a=angle;
      if(point(a)[2]<0&&n[2]>0){let lo=0,hi=angle;for(let k=0;k<10;k++){const mid=(lo+hi)/2;if(point(mid)[2]>=0)lo=mid;else hi=mid;}a=lo;}
      return screen(point(a));
    };
    // The footprint spans the eye's real height, including a held stretch.
    const tall=(9.6+2.6*stretch)*scale,halfW=4.6*scale/face.rx,halfH=tall/face.ry;
    const [r1,r2,t1,t2]=[edgeAt(at.right,halfW),edgeAt(at.right,-halfW),edgeAt(at.up,halfH),edgeAt(at.up,-halfH)];
    const sphere=[(r1[0]-r2[0])/(2*4.6*scale),(r1[1]-r2[1])/(2*4.6*scale),(t2[0]-t1[0])/(2*tall),(t2[1]-t1[1])/(2*tall)];
    const centre=[(r1[0]+r2[0]+t1[0]+t2[0])/4,(r1[1]+r2[1]+t1[1]+t2[1])/4];
    const flat=[drawn.right[0],-drawn.right[1],-drawn.up[0],drawn.up[1]],bend=face.bend;
    const cols=flat.map((v,j)=>v+(sphere[j]-v)*bend);
    let [x,y]=screen(at.normal).map((v,j)=>v+(centre[j]-v)*bend);
    if(c.eyeMap){const mapped=c.eyeMap(x,y,cols,(9.6+2.6*stretch)*scale*Math.abs(cols[3]));x=mapped.x;y=mapped.y;cols.splice(0,4,...mapped.cols);eye.style.opacity*=mapped.visible;}
    const matrix=`matrix(${cols[0]} ${cols[1]} ${cols[2]} ${cols[3]} ${x} ${y})`;
    mid[0]+=x/2;mid[1]+=y/2;
    if(browing){
      const at2=(lx,ly)=>`${(x+cols[0]*lx+cols[2]*ly).toFixed(2)} ${(y+cols[1]*lx+cols[3]*ly).toFixed(2)}`,top=-9.6*scale-4.2;
      brows+=`M${at2(side*5.4,top+1.2)}Q${at2(side*1,top-.6)} ${at2(-side*4.6,top-3.4)}`;
    }
    if(eye.dataset.eye) {
      const baseX=Number(eye.dataset.rx),baseY=Number(eye.dataset.ry);
      const rx=(baseX+(6.6-baseX)*wide+(5.6-baseX)*squint+(i===0?-.4:.5)*question-.55*stretch)*scale;
      const open=(baseY+(6.8-baseY)*wide+(2.6-baseY)*squint+(i===0?-3.4:.9)*question+2.6*stretch)*scale;
      const ry=Math.max(rx*.34,open*(1-.84*blink));
      eye.setAttribute('transform',`${matrix} translate(0 ${side*1.1*question}) rotate(${side*9*question})`);
      // Rounded capsules become almost circular when open and horizontal pills
      // when narrowed. Keep the same contour topology throughout the transition.
      const rr=Math.min(rx,ry),k=.55228475*rr;
      eye.setAttribute('d',`M${-rx+rr} ${-ry}H${rx-rr}C${rx-rr+k} ${-ry} ${rx} ${-ry+rr-k} ${rx} ${-ry+rr}L${rx} ${ry-rr}C${rx} ${ry-rr+k} ${rx-rr+k} ${ry} ${rx-rr} ${ry}H${-rx+rr}C${-rx+rr-k} ${ry} ${-rx} ${ry-rr+k} ${-rx} ${ry-rr}L${-rx} ${-ry+rr}C${-rx} ${-ry+rr-k} ${-rx+rr-k} ${-ry} ${-rx+rr} ${-ry}Z`);
    } else if(eye.dataset.expression==='happy') {
      eye.setAttribute('transform',`${matrix} scale(${scale})`);
      eye.setAttribute('d','M-4 2q4-8 8 0');
    } else if(eye.dataset.expression==='sleepy') {
      eye.setAttribute('transform',`${matrix} scale(${scale})`);
      eye.setAttribute('x',-4.2);eye.setAttribute('y',-1.9);eye.setAttribute('width',8.4);eye.setAttribute('height',3.8);eye.setAttribute('rx',1.9);
    }
  }
  if(browing)c.brows.setAttribute('d',brows);
  // On the bot's own body the mouth sits under wherever the eyes are; tool
  // faces keep their drawn mouths. The weight blends through morphs.
  const onBody=(freedom-.45)/.55;
  if(opacityOf(c.mouth)>0){const dx=(mid[0]-50)*onBody,dy=Math.max(-6,mid[1]+17-65)*onBody;c.mouth.setAttribute('transform',`translate(${dx.toFixed(2)} ${dy.toFixed(2)})`);}
}
// Brief expressions with pauses feel deliberate; never a continuous size pulse.
// Absolute time and the existing bot seed keep rebuilt avatars in the same pose.
// [wide, squint, question (uneven Oo), stretch (a briefly held long pill)].
function eyeExpression(time, reduced) {
  if(reduced)return [0,0,0,0];
  const poses=[[0,0,0,0,0],[3,0,0,0,0],[3.45,1,0,0,0],[5.2,1,0,0,0],[5.75,0,0,0,0],
    [6.7,0,0,0,0],[7.15,0,0,0,1],[8.35,0,0,0,1],[8.95,0,0,0,0],
    [9.4,0,0,0,0],[9.85,0,1,0,0],[11.1,0,1,0,0],[11.65,0,0,0,0],
    [16,0,0,0,0],[16.5,0,0,1,0],[18.6,0,0,1,0],[19.2,0,0,0,0],[23,0,0,0,0]];
  const phase=((time%23)+23)%23;
  for(let i=1;i<poses.length;i++)if(phase<=poses[i][0]){
    const a=poses[i-1],b=poses[i],t=smooth((phase-a[0])/(b[0]-a[0]));
    return a.slice(1).map((v,j)=>v+(b[j+1]-v)*t);
  }
  return [0,0,0,0];
}
// A continuous envelope -> fold -> wind-up -> looping flight -> landing sequence.
function delivery(box) {
  const c = box._character, envelope = sample(paths.mail), plane = align(envelope, sample(paths.plane));
  const begun = performance.now();
  const smooth = v => { v = Math.max(0,Math.min(1,v)); return v*v*(3-2*v); };
  c.deliveryTick = (now,reduced) => {
    const t = reduced ? 0 : ((now-begun) % 6500) / 6500;
    const fold = t < .28 ? smooth((t-.17)/.11) : t > .88 ? 1-smooth((t-.88)/.1) : 1;
    c.points = envelope.map((p,i) => [p[0]+(plane[i][0]-p[0])*fold,p[1]+(plane[i][1]-p[1])*fold]);
    c.path.setAttribute("d", fold === 0 ? paths.mail : fold === 1 ? paths.plane : polygon(c.points));
    c.clipShape.setAttribute("d",c.path.getAttribute("d"));
    c.detail.setAttribute("opacity",.5*Math.abs(2*fold-1));
    c.detail.setAttribute("d", fold < .5 ? "M13 28L50 58L87 28M13 82L34 61M87 82L66 61" : "M30 53L94 14L47 64M47 64L26 77");
    c.face.style.opacity = 1-smooth((fold-.1)/.7);
    let x=0,y=0,rotation=0,scale=1;
    if (t >= .28 && t < .4) { const wind = smooth((t-.28)/.12); x=-9*wind; rotation=-18*wind; }
    if (t >= .4 && t < .88) {
      const f=(t-.4)/.48, angle=f*Math.PI*2;
      x=-9+30*Math.sin(angle); y=-24*(1-Math.cos(angle));
      rotation=-18+360*f; scale=1-.24*Math.sin(Math.PI*f);
    }
    if (t >= .88) { const land=1-smooth((t-.88)/.1); x=-9*land; rotation=-18*land; }
    c.body.setAttribute("transform", `translate(${x} ${y}) translate(50 55) rotate(${rotation}) scale(${scale}) translate(-50 -55)`);
  };
  animateCharacter(box);
}
const iconPaths = {
  chat: "M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-3 3V11.5A8.5 8.5 0 0 1 9.5 3h3a8.5 8.5 0 0 1 8.5 8.5Z",
  list: "M4 6h.01M4 12h.01M4 18h.01M9 6h12M9 12h12M9 18h12",
  reply: "M9 5 4 10l5 5M4 10h10a6 6 0 0 1 0 12",
  smile: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M8 9h.01M16 9h.01M8 14q4 5 8 0",
  download: "M12 3v12m-4-4 4 4 4-4M5 15v5h14v-5",
  network: "M4 7h5l4 5h7M4 17h5l4-5M17 9l3 3-3 3",
  marketplace: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM17.5 13v9M13 17.5h9",
  plus: "M12 5v14M5 12h14",
  search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  settings:
    "m9 3-.5 3-2 1.2L4 6l-2 3.5 2.5 1.8v2.4L2 15.5 4 19l2.5-1.2 2 1.2.5 3h6l.5-3 2-1.2L20 19l2-3.5-2.5-1.8v-2.4L22 9.5 20 6l-2.5 1.2-2-1.2L15 3H9ZM15.5 12a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0",
  computer: "M3 4h18v13H3zM8 21h8M12 17v4",
  bot: "M3 4h18v13H3zM8 21h8M12 17v4M8 9h1M15 9h1M9 13h6",
  close: "m6 6 12 12M6 18 18 6",
  chevron: "m9 5 7 7-7 7",
  chevronUp: "m5 15 7-7 7 7",
  chevronDown: "m5 9 7 7 7-7",
  "chevrons-right": "m5 5 7 7-7 7m7-14 7 7-7 7",
  back: "m15 5-7 7 7 7",
  clock: "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0M12 6v6l4 3",
  send: "M12 20V4m-7 7 7-7 7 7",
  stop: "M6 6h12v12H6z",
  external: "M14 3h7v7M21 3l-11 11M10 3H3v18h18v-7",
  link: "M10 14l4-4M8 12l-2 2a3.5 3.5 0 0 0 5 5l2-2M16 12l2-2a3.5 3.5 0 0 0-5-5l-2 2",
  copy: "M9 9h12v12H9zM5 15H3V3h12v2",
  check: "m5 12 4 4L19 6",
  edit: "m15 4 5 5M3 21l5-1L21 7l-5-5L3 15v6",
  pin: "M9 3h6M10 3v6l-4 5v2h12v-2l-4-5V3M12 16v6",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  book: "M3 4h7l2 2 2-2h7v16h-7l-2 2-2-2H3V4ZM12 6v16",
  arrow: "M7 17 17 7M7 7h10v10",
  refresh: "M20 8a8 8 0 1 0 1 7M20 3v5h-5",
  expand: "M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5",
  restore: "M3 10a9 9 0 1 1 2.6 8M3 4v6h6",
  archive: "M3 3h18v5H3V3ZM5 8v13h14V8M9 12h6",
  trash: "M3 6h18M8 6V3h8v3M5 6l1 15h12l1-15M10 10v7M14 10v7",
  user: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 22v-3a8 8 0 0 1 16 0v3",
  pause: "M8 5v14M16 5v14",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4",
  play: "m7 4 14 8-14 8V4",
  key: "M10 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0M10 10h12M18 10v4M21 10v3",
  folder: "M2 5h8l2 3h10v13H2V5",
  paperclip: "m8 14 8-8a3 3 0 0 1 4 4L9 21a5 5 0 0 1-7-7L14 2",
  pointer: "m5 3 14 9-7 1-3 7-4-17Z",
  record: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10",
};
export function icon(name, size = 18) {
  const svg = el("svg", {
    viewBox: "0 0 24 24",
    width: size,
    height: size,
    fill: "none",
    stroke: "currentColor",
    "stroke-width": 1.5,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
    focusable: "false",
  });
  svg.classList.add("icon");
  if(name==='more')for(const cx of [5,12,19])svg.append(el('circle',{cx,cy:12,r:1.3,fill:'currentColor',stroke:'none'}));
  else svg.append(el("path", { d: iconPaths[name] || iconPaths.more }));
  return svg;
}
