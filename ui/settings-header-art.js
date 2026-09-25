import {avatarData} from "./avatar-data.js";
// Decorative pile of still bots for the Settings header. Bodies and faces come
// from the avatar shapes; colour is applied by CSS (vivid in light, grey in dark).
const NS = "http://www.w3.org/2000/svg";
// Oversized, irregularly stacked silhouettes deliberately spill past the header.
// [shape, x, y, scale, tilt, light tone, dark grey, gaze, eye heights]
const bots = [
  ["round", 42, 15, .66, -22, "#7960ff", "#9a9a9a", 4, [25, 25]],
  ["square", 110, 4, .72, 19, "#14bfc7", "#8c8c8c", -3, [8, 8]],
  ["cloud", 184, 15, .76, -16, "#24d5a4", "#a6a6a6", 2, [27, 13]],
  ["round", 269, 4, .7, 25, "#ffbe16", "#858585", -4, [22, 22]],
  ["pebble", 327, 32, .67, -25, "#21b3ff", "#9c9c9c", -2, [24, 9]],
  ["cloud", 63, 78, .79, 13, "#ff9638", "#a0a0a0", 3, [12, 12]],
  ["triangle", 135, 65, .85, -13, "#f24d93", "#b8b8b8", -1, [23, 23]],
  ["capsule", 218, 72, .86, 18, "#2475ff", "#a8a8a8", -3, [29, 29]],
  ["hexagon", 300, 89, .79, -14, "#b24cf2", "#7a7a7a", 2, [12, 24]],
];
function el(tag, attrs = {}) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}
export function settingsHeaderArt() {
  const svg = el("svg", {
    class: "settings-header-art",
    viewBox: "0 0 350 80",
    preserveAspectRatio: "xMaxYMax meet",
    "aria-hidden": "true",
    focusable: "false",
  });
  for (const [shape, x, y, scale, tilt, tone, grey, gaze, eyes] of bots) {
    const face = avatarData.faces[shape] || avatarData.faces.round;
    const bot = el("g", {
      class: "settings-header-bot",
      transform: `translate(${x} ${y}) rotate(${tilt}) scale(${scale}) translate(-50 -52)`,
      style: `--art-tone:${tone};--art-grey:${grey}`,
    });
    bot.append(el("path", {class: "settings-header-bot-body", d: avatarData.paths[shape]}));
    // Eyes are drawn in the header colour so each bot reads as a cut-out.
    for (const side of [-1, 1]) {
      bot.append(el("rect", {
        class: "settings-header-bot-eye",
        x: face.x + gaze + side * face.spread - 4.3,
        y: face.y - eyes[(side + 1) / 2] / 2,
        width: 8.6,
        height: eyes[(side + 1) / 2],
        rx: 4.3,
      }));
    }
    svg.append(bot);
  }
  return svg;
}
