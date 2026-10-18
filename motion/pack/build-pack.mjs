// Motion pack generator (studio kit). content.json -> one HyperFrames project per piece.
// Add a piece: add it to PIECES (fields) and BUILD (css/body/js). Theme fields become CSS variables.
// CLI: node build-pack.mjs [piece]     node build-pack.mjs --teach
import { mkdirSync, writeFileSync, copyFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { AD_PIECES, AD_BUILD } from "./ads.mjs";
import { NEON_PIECES, NEON_BUILD } from "./neon.mjs";

export const ROOT = dirname(fileURLToPath(import.meta.url));
export const CONTENT_FILE = join(ROOT, "content.json");
const SHARED = join(ROOT, "shared");

export const FONTS = { display: ["Unbounded", "Anton", "Bebas Neue", "Oswald", "Montserrat", "Playfair Display"], script: ["Great Vibes", "Allura", "Pacifico"] };
// Any .webp/.jpg/.png dropped in shared/assets becomes a background choice in the editor.
export const backgrounds = () => ["None", ...readdirSync(join(SHARED, "assets")).filter((f) => /\.(webp|jpe?g|png)$/i.test(f))];
export const THEME_FIELDS = () => [
  { key: "display", label: "Headline font", type: "font-display", def: "Unbounded" },
  { key: "script", label: "Script font", type: "font-script", def: "Great Vibes" },
  { key: "accentHi", label: "Accent highlight", type: "color", def: "#ffd1f0" },
  { key: "accent", label: "Accent", type: "color", def: "#ff4fc8" },
  { key: "accentDeep", label: "Accent shadow", type: "color", def: "#7a0f57" },
  { key: "second", label: "Second color", type: "color", def: "#0ac1e0" },
  { key: "glow", label: "Glow", type: "color", def: "#dc20a9" },
  { key: "text", label: "Text", type: "color", def: "#ffffff" },
  { key: "bg", label: "Background color", type: "color", def: "#07080c" },
  { key: "image", label: "Background image", type: "select", def: "None", options: backgrounds() },
];

const F = (key, label, def, max = 60) => ({ key, label, def, max });
export const PIECES = {
  "title-card": { title: "Title card", w: 1920, h: 1080, dur: 6, format: "mp4",
    fields: [F("script", "Script line", "Tonight on", 24), F("headline", "Headline", "voidtv.net", 28), F("tag", "Tag under it", "FREE TV · NO ADS · NO ACCOUNT", 40)] },
  "lower-third": { title: "Name plate", w: 1920, h: 1080, dur: 6, format: "webm", overlay: true,
    fields: [F("name", "Name", "voidtv.net", 26), F("line", "Line under", "FREE TV · A NONPROFIT PROJECT OF CASH", 44)] },
  "promo-vertical": { title: "Vertical promo", w: 1080, h: 1920, dur: 10, format: "mp4",
    fields: [F("big", "Big word", "FREE", 8), F("headline", "Headline", "4,600+ SHOWS", 26), F("script", "Script word", "press play", 16),
      F("step1", "Point 1", "Classic and cult TV, all free", 34), F("step2", "Point 2", "No ads. No account.", 34), F("step3", "Point 3", "A nonprofit project of CASH", 34), F("footer", "Footer", "voidtv.net", 30)] },
  "end-card": { title: "End card", w: 1920, h: 1080, dur: 8, format: "mp4",
    fields: [F("left", "Left label", "WATCH NEXT", 16), F("right", "Right label", "DONATE", 14), F("script", "Script line", "Thanks for watching", 24), F("button", "Button", "voidtv.net", 22)] },
};
Object.assign(PIECES, AD_PIECES); // voidtv.net promos and ads live in ads.mjs
Object.assign(PIECES, NEON_PIECES); // the neon alley scenes live in neon.mjs

export function defaultContent() {
  return { theme: Object.fromEntries(THEME_FIELDS().map((f) => [f.key, f.def])),
    pieces: Object.fromEntries(Object.entries(PIECES).map(([id, p]) => [id, { fields: Object.fromEntries(p.fields.map((f) => [f.key, f.def])), style: {} }])) };
}
export function loadContent() {
  if (!existsSync(CONTENT_FILE)) writeFileSync(CONTENT_FILE, JSON.stringify(defaultContent(), null, 2));
  const c = JSON.parse(readFileSync(CONTENT_FILE, "utf8")); const d = defaultContent();
  c.theme = { ...d.theme, ...(c.theme || {}) }; c.pieces = c.pieces || {};
  for (const id of Object.keys(PIECES)) { c.pieces[id] = c.pieces[id] || d.pieces[id]; c.pieces[id].fields = { ...d.pieces[id].fields, ...(c.pieces[id].fields || {}) }; c.pieces[id].style = c.pieces[id].style || {}; }
  return c;
}
export const saveContent = (c) => writeFileSync(CONTENT_FILE, JSON.stringify(c, null, 2));

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const escName = (s) => esc(s).replace(/(voidtv)(\.net)/gi, '$1<span class="net">$2</span>');
// Deterministic text fit: decide font size from character count at build time, never by measuring during render.
const fit = (text, boxPx, basePx, em = 0.58) => Math.round(Math.min(basePx, boxPx / Math.max(1, String(text).length * em)));
const GLINT = `<svg viewBox="-10 -10 20 20"><path d="M0-10L1.4-1.4 10 0 1.4 1.4 0 10-1.4 1.4-10 0-1.4-1.4Z" fill="#fff"/></svg>`;

const BASE_CSS = (w, h, overlay, t) => `
:root { --display: '${t.display}'; --script: '${t.script}'; --accentHi: ${t.accentHi}; --accent: ${t.accent}; --accentDeep: ${t.accentDeep};
  --second: ${t.second}; --glow: ${t.glow}; --text: ${t.text}; --bg: ${t.bg}; }
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: ${w}px; height: ${h}px; overflow: hidden; background: ${overlay ? "transparent" : "var(--bg)"}; }
#root { position: relative; width: ${w}px; height: ${h}px; overflow: hidden; background: ${overlay ? "transparent" : "var(--bg)"}; font-family: Inter, sans-serif; color: var(--text); }
.layer { position: absolute; inset: 0; }
.bgimg { background: ${t.image && t.image !== "None" ? `url(assets/${t.image}) center / cover no-repeat` : `radial-gradient(70% 60% at 50% 40%, color-mix(in srgb, var(--glow) 35%, var(--bg)), var(--bg))`}; }
.vig { background: radial-gradient(75% 70% at 50% 45%, transparent 35%, color-mix(in srgb, var(--bg) 92%, transparent) 100%); }
.disp { font-family: var(--display), sans-serif; font-weight: 400; letter-spacing: .04em; line-height: 1; }
.script { font-family: var(--script), cursive; }
.metal { background: linear-gradient(var(--accentHi), var(--accent) 30%, color-mix(in srgb, var(--accent) 50%, var(--accentDeep)) 58%, color-mix(in srgb, var(--accentHi) 55%, var(--accent)) 80%, var(--accentDeep));
  -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(0 4px 0 color-mix(in srgb, var(--accentDeep) 60%, black)) drop-shadow(0 10px 24px rgba(0,0,0,.6)); }
.bar { background: linear-gradient(var(--accentHi), var(--accent) 30%, color-mix(in srgb, var(--accent) 55%, var(--accentDeep)) 62%, color-mix(in srgb, var(--accentHi) 60%, var(--accent)) 82%, var(--accentDeep));
  color: color-mix(in srgb, var(--accentDeep) 30%, black); box-shadow: inset 0 2px 0 rgba(255,255,255,.7), 0 14px 34px rgba(0,0,0,.6); border-radius: 10px; }
.block2 { color: color-mix(in srgb, var(--second) 12%, black); background: linear-gradient(color-mix(in srgb, var(--second) 72%, white), var(--second) 50%, color-mix(in srgb, var(--second) 55%, black));
  box-shadow: inset 0 1px 0 rgba(255,255,255,.45), inset 0 0 0 3px var(--accent), 0 10px 30px rgba(0,0,0,.6); border-radius: 8px; }
.glowtext { color: #fff; text-shadow: 0 0 6px #fff, 0 0 14px color-mix(in srgb, var(--glow) 45%, white), 0 0 30px var(--glow), 0 0 60px var(--glow); }
.chip { font: 800 30px/1 Inter, sans-serif; letter-spacing: .08em; color: var(--accentHi); padding: 18px 26px; border-radius: 999px;
  background: color-mix(in srgb, var(--bg) 82%, transparent); box-shadow: inset 0 0 0 2px var(--accent), 0 10px 30px rgba(0,0,0,.5); }
.metal .net { background: linear-gradient(color-mix(in srgb, var(--second) 30%, white), var(--second) 30%, color-mix(in srgb, var(--second) 50%, black) 58%, color-mix(in srgb, var(--second) 55%, white) 80%, color-mix(in srgb, var(--second) 40%, black));
  -webkit-background-clip: text; background-clip: text; color: transparent; }
.glowtext .net { text-shadow: 0 0 6px #fff, 0 0 14px color-mix(in srgb, var(--second) 45%, white), 0 0 30px var(--second), 0 0 60px var(--second); }
.chip .net { color: color-mix(in srgb, var(--second) 55%, white); }
.shine { position: absolute; top: -20%; height: 140%; width: 22%; left: 0; background: linear-gradient(90deg, transparent, rgba(255,255,255,.85) 50%, transparent); mix-blend-mode: screen; }
.glint { position: absolute; width: 80px; height: 80px; margin: -40px 0 0 -40px; opacity: 0; }
.glint svg { width: 100%; height: 100%; filter: drop-shadow(0 0 10px rgba(255,255,255,.9)) drop-shadow(0 0 22px color-mix(in srgb, var(--accentHi) 70%, transparent)); }
`;
const page = ({ id, w, h, dur, overlay, t, css = "", body, js }) => `<!doctype html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=${w}, height=${h}" /><title>${id}</title>
<script src="gsap.min.js"></script><link rel="stylesheet" href="fonts/fonts.css" /><style>${BASE_CSS(w, h, overlay, t)}${css}</style></head>
<body><div id="root" data-composition-id="main" data-start="0" data-duration="${dur}" data-width="${w}" data-height="${h}">
${body}
</div><script>
window.__timelines = window.__timelines || {};
const tl = gsap.timeline({ paused: true });
const pop = (sel, t, s = 1) => tl.fromTo(sel, { opacity: 0, scale: 0, rotate: -30 }, { opacity: 1, scale: s, rotate: 15, duration: 0.22, ease: "back.out(2)" }, t)
  .to(sel, { opacity: 0, scale: 0.3, rotate: 45, duration: 0.35, ease: "power2.in" }, t + 0.3);
${js}
window.__timelines["main"] = tl;
tl.seek(0);
</script></body></html>`;
// Every timed element: class="clip" + data-start + data-duration + data-track-index (HyperFrames contract).
const clip = (id, dur, track, cls = "", inner = "") => `<div id="${id}" class="clip ${cls}" data-start="0" data-duration="${dur}" data-track-index="${track}">${inner}</div>`;

// Start states always live in GSAP fromTo, never in CSS transforms (HyperFrames lint rejects the mix).
const BUILD = {
  "title-card": (f) => ({
    css: `#script { position: absolute; left: 0; right: 0; top: 300px; text-align: center; font-size: 120px; color: var(--accentHi); clip-path: inset(0 100% 0 0); }
#hl { position: absolute; left: 0; right: 0; top: 440px; text-align: center; font-size: ${fit(f.headline, 1700, 190, 0.5)}px; opacity: 0; }
#tag { position: absolute; left: 0; right: 0; top: 720px; display: flex; justify-content: center; } #tag div { opacity: 0; }`,
    body: [clip("bgw", 6, 0, "layer", `<div class="layer bgimg" id="bgi"></div><div class="layer vig"></div>`),
      clip("stage", 6, 1, "layer", `<div id="script" class="script">${escName(f.script)}</div><div id="hl" class="disp metal">${escName(f.headline)}</div>
        <div id="tag"><div class="chip">${escName(f.tag)}</div></div><div class="glint" id="g1" style="left:1500px;top:470px">${GLINT}</div>`)].join("\n"),
    js: `tl.fromTo("#bgi", { scale: 1.1 }, { scale: 1, duration: 6, ease: "none" }, 0)
  .to("#script", { clipPath: "inset(0 0% 0 0)", duration: 0.9, ease: "power2.inOut" }, 0.3)
  .fromTo("#hl", { opacity: 0, y: 50, scale: 1.04 }, { opacity: 1, y: 0, scale: 1, duration: 0.8, ease: "power3.out" }, 0.9)
  .fromTo("#tag div", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }, 1.7);
pop("#g1", 1.6, 1.2); tl.to("#stage", { scale: 1.03, duration: 3.5, ease: "none" }, 2.5);` }),

  "lower-third": (f) => ({
    css: `#lt { position: absolute; left: 90px; top: 810px; }
#nm { position: relative; width: max-content; padding: 22px 44px 18px; overflow: hidden; font-size: ${fit(f.name, 740, 86)}px; white-space: nowrap; }
#ln { display: inline-block; margin: 14px 0 0 22px; font: 400 30px/1 var(--display), sans-serif; letter-spacing: .07em; padding: 10px 18px; white-space: nowrap; opacity: 0; }`,
    body: clip("w", 6, 0, "layer", `<div id="lt"><div id="nm" class="bar disp"><span>${escName(f.name)}</span><div class="shine" id="sh" data-layout-allow-overflow></div></div><div id="ln" class="block2">${escName(f.line)}</div></div>`),
    js: `tl.fromTo("#nm", { x: -1100 }, { x: 0, duration: 0.7, ease: "power4.out" }, 0.1)
  .fromTo("#ln", { opacity: 0, y: -16 }, { opacity: 1, y: 0, duration: 0.45, ease: "power3.out" }, 0.6)
  .fromTo("#sh", { xPercent: -140 }, { xPercent: 560, duration: 0.8, ease: "power2.inOut" }, 0.75)
  .to("#ln", { opacity: 0, y: -16, duration: 0.3 }, 5.1).to("#nm", { x: -1100, duration: 0.55, ease: "power3.in" }, 5.3);` }),

  "promo-vertical": (f) => ({
    css: `#big { position: absolute; left: 0; right: 0; top: 330px; text-align: center; font-size: ${fit(f.big, 960, 300, 0.5)}px; opacity: 0; }
#hl { position: absolute; left: 60px; right: 60px; top: 700px; padding: 26px 20px 20px; text-align: center; font-size: ${fit(f.headline, 900, 110, 0.5)}px; opacity: 0; }
#sc { position: absolute; left: 0; right: 0; top: 900px; text-align: center; font-size: 140px; color: var(--accentHi); clip-path: inset(0 100% 0 0); line-height: 1.2; }
#steps { position: absolute; left: 0; right: 0; top: 1180px; display: flex; flex-direction: column; align-items: center; gap: 22px; } #steps .chip { opacity: 0; }
#ft { position: absolute; left: 40px; right: 40px; top: 1660px; text-align: center; font: 800 ${fit(f.footer, 1000, 44, 0.68)}px/1.2 Inter, sans-serif; letter-spacing: .18em; opacity: 0; }`,
    body: [clip("bgw", 10, 0, "layer", `<div class="layer bgimg" id="bgi"></div><div class="layer vig"></div>`),
      clip("stage", 10, 1, "layer", `<div id="big" class="disp metal">${escName(f.big)}</div><div id="hl" class="disp bar">${escName(f.headline)}</div><div id="sc" class="script">${escName(f.script)}</div>
        <div id="steps"><div class="chip">${escName(f.step1)}</div><div class="chip">${escName(f.step2)}</div><div class="chip">${escName(f.step3)}</div></div><div id="ft" class="glowtext">${escName(f.footer)}</div>`)].join("\n"),
    js: `tl.fromTo("#bgi", { scale: 1.1 }, { scale: 1, duration: 10, ease: "none" }, 0)
  .fromTo("#big", { opacity: 0, y: 60 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, 0.3)
  .fromTo("#hl", { opacity: 0, y: 50 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, 0.9)
  .to("#sc", { clipPath: "inset(0 0% 0 0)", duration: 0.8, ease: "power2.inOut" }, 1.6)
  .fromTo("#steps .chip", { opacity: 0, x: -60 }, { opacity: 1, x: 0, duration: 0.45, ease: "power3.out", stagger: 0.35 }, 2.6)
  .set("#ft", { opacity: 0.6 }, 4.3).set("#ft", { opacity: 0.1 }, 4.36).to("#ft", { opacity: 1, duration: 0.3 }, 4.44);` }),

  "end-card": (f) => ({
    css: `.slot { position: absolute; border-radius: 14px; box-shadow: inset 0 0 0 4px var(--accent), inset 0 0 0 7px var(--accentDeep), 0 0 40px color-mix(in srgb, var(--glow) 40%, transparent);
  background: color-mix(in srgb, var(--bg) 60%, transparent); opacity: 0; }
#l { left: 150px; top: 330px; width: 900px; height: 506px; } #r { left: 1270px; top: 330px; width: 330px; height: 330px; border-radius: 50%; }
.lab { position: absolute; font-size: 44px; opacity: 0; } #ll { left: 150px; top: 270px; } #rl { left: 1270px; top: 270px; }
#cta { position: absolute; left: 1150px; top: 720px; width: 570px; text-align: center; opacity: 0; }
#cta .script { font-size: ${fit(f.script, 560, 80, 0.36)}px; line-height: 1.1; color: var(--accentHi); }
#cta .block2 { display: inline-block; margin-top: 10px; padding: 12px 20px; font: 400 ${fit(f.button, 520, 40, 0.55)}px/1 var(--display), sans-serif; letter-spacing: .06em; }`,
    body: [clip("bgw", 8, 0, "layer", `<div class="layer bgimg"></div><div class="layer vig"></div>`),
      clip("stage", 8, 1, "layer", `<div id="ll" class="lab disp metal">${escName(f.left)}</div><div id="l" class="slot"></div><div id="rl" class="lab disp metal">${escName(f.right)}</div><div id="r" class="slot"></div>
        <div id="cta"><div class="script">${escName(f.script)}</div><div class="block2">${escName(f.button)}</div></div>`)].join("\n"),
    js: `tl.fromTo(["#l", "#r"], { opacity: 0, scale: 0.94 }, { opacity: 1, scale: 1, duration: 0.6, ease: "power3.out", stagger: 0.15 }, 0.3)
  .to(["#ll", "#rl"], { opacity: 1, duration: 0.5, stagger: 0.15 }, 0.6)
  .fromTo("#cta", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, 1.1);` }),
};
Object.assign(BUILD, AD_BUILD);
Object.assign(BUILD, NEON_BUILD);

const FONT_FILES = ["fonts.css", ...[...FONTS.display, ...FONTS.script, "Inter"].map((n) => n.replace(/ /g, "") + ".woff2")];
export function generate(id, content = loadContent()) {
  const spec = PIECES[id]; if (!spec) throw new Error("unknown piece " + id);
  const item = content.pieces[id];
  const theme = { ...content.theme, ...Object.fromEntries(Object.entries(item.style || {}).filter(([, v]) => v)) };
  const html = page({ id, w: spec.w, h: spec.h, dur: spec.dur, overlay: !!spec.overlay, t: theme, ...BUILD[id](item.fields, spec, theme) });
  const dir = join(ROOT, id);
  for (const d of ["", "assets", "fonts", "renders"]) mkdirSync(join(dir, d), { recursive: true });
  if (!existsSync(join(dir, "hyperframes.json"))) copyFileSync(join(SHARED, "hyperframes.json"), join(dir, "hyperframes.json"));
  if (!existsSync(join(dir, "package.json"))) writeFileSync(join(dir, "package.json"), JSON.stringify({ name: id, private: true, type: "module" }, null, 2));
  if (!existsSync(join(dir, "meta.json"))) writeFileSync(join(dir, "meta.json"), JSON.stringify({ id, name: id }, null, 2));
  for (const a of new Set([...html.matchAll(/assets\/([\w.-]+\.(?:webp|jpe?g|png))/gi)].map((m) => m[1]))) copyFileSync(join(SHARED, "assets", a), join(dir, "assets", a));
  for (const f of FONT_FILES) if (existsSync(join(SHARED, "fonts", f))) copyFileSync(join(SHARED, "fonts", f), join(dir, "fonts", f));
  copyFileSync(join(SHARED, "gsap.min.js"), join(dir, "gsap.min.js"));
  writeFileSync(join(dir, "index.html"), html);
  return dir;
}

const TEACH = `
MOTION PACK, how it works
  content.json   every word, font and color (the editor writes it)
  build-pack.mjs PIECES = what can be edited. BUILD = how each piece looks and moves.
  generate(id)   writes <piece>/index.html: a HyperFrames composition with a paused GSAP timeline
  hq/server.mjs  the editor: saves content, regenerates, previews, renders with HyperFrames
Rules that keep renders clean
  - every timed element: class="clip" data-start data-duration data-track-index
  - start states in GSAP fromTo, never CSS transforms
  - size text at build time with fit(), never by measuring during render
  - animate transforms and opacity; never letter-spacing
  - overlays: html/body transparent + render --format webm (alpha)
Add a piece: copy one PIECES entry + its BUILD function, rename, run node build-pack.mjs
`;
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes("--teach")) { console.log(TEACH); process.exit(0); }
  const only = process.argv[2]; const c = loadContent();
  for (const id of only ? [only] : Object.keys(PIECES)) console.log(id.padEnd(16), "->", generate(id, c));
}
