import {avatarData} from "./avatar-data.js";
// Decorative pile of still bots for the Settings header. Bodies and faces come
// from the avatar shapes; colour is applied by CSS (vivid in light, grey in dark).
const NS = "http://www.w3.org/2000/svg";
// [shape, centre x, centre y, scale, tilt, light tone, dark grey, gaze]
const bots = [
  ["square", 72, 23, .31, 10, "#14bfc7", "#8c8c8c", 2],
  ["square", 106, 20, .28, -24, "#b24cf2", "#a6a6a6", 0],
  ["round", 40, 25, .29, 0, "#7960ff", "#9a9a9a", 3],
  ["cloud", 140, 23, .3, -6, "#24d5a4", "#7a7a7a", -2],
  ["round", 175, 24, .28, 0, "#2ec767", "#b0b0b0", -3],
  ["pebble", 206, 28, .24, 12, "#21b3ff", "#8f8f8f", 0],
  ["pebble", 22, 53, .32, -8, "#ff6952", "#7d7d7d", 2],
  ["cloud", 55, 53, .34, 4, "#ff9638", "#a0a0a0", 0],
  ["triangle", 89, 50, .37, -6, "#f24d93", "#b8b8b8", -1],
  ["round", 122, 54, .33, 0, "#ffbe16", "#858585", 3],
  ["capsule", 157, 51, .37, -14, "#2475ff", "#a8a8a8", 0],
  ["hexagon", 192, 53, .33, 10, "#a3d92b", "#7a7a7a", -2],
  ["drop", 223, 56, .26, -10, "#858a8a", "#9c9c9c", 0],
];
function el(tag, attrs = {}) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}
export function settingsHeaderArt() {
  const svg = el("svg", {
    class: "settings-header-art",
    viewBox: "0 0 240 70",
    preserveAspectRatio: "xMaxYMax meet",
    "aria-hidden": "true",
    focusable: "false",
  });
  for (const [shape, x, y, scale, tilt, tone, grey, gaze] of bots) {
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
        y: face.y - 9.6,
        width: 8.6,
        height: 19.2,
        rx: 4.3,
      }));
    }
    svg.append(bot);
  }
  return svg;
}
