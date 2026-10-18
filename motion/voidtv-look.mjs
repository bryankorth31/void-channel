// One-time: give this Motion Pack Kit copy the voidtv.net look (font, colours, default words).
// Safe to re-run: it only replaces the kit's original defaults, so a second run changes nothing.
import { readFileSync, writeFileSync } from "node:fs";
const f = new URL("./pack/build-pack.mjs", import.meta.url);
let s = readFileSync(f, "utf8");
const swap = (a, b) => { if (s.includes(a)) s = s.replace(a, b); else if (!s.includes(b)) throw new Error("anchor missing: " + a); };

swap('display: ["Anton",', 'display: ["Unbounded", "Anton",');
const theme = {
  display: ['"Anton"', '"Unbounded"'], accentHi: ['"#fff3bf"', '"#ffd1f0"'], accent: ['"#f0c84d"', '"#ff4fc8"'],
  accentDeep: ['"#8a5f0e"', '"#7a0f57"'], second: ['"#1d3fd1"', '"#0ac1e0"'], glow: ['"#a43cff"', '"#dc20a9"'], bg: ['"#07060a"', '"#07080c"'],
};
for (const [key, [from, to]] of Object.entries(theme)) {
  const start = s.indexOf(`{ key: "${key}",`);
  if (start < 0) throw new Error("theme field missing: " + key);
  const end = s.indexOf("}", start);
  const field = s.slice(start, end);
  if (field.includes(`def: ${from}`)) s = s.slice(0, start) + field.replace(`def: ${from}`, `def: ${to}`) + s.slice(end);
}
const words = [
  ['"Presents", 24', '"Tonight on", 24'], ['"YOUR SHOW NAME", 28', '"voidtv.net", 28'], ['"NEW EPISODE EVERY WEEK", 40', '"FREE TV · NO ADS · NO ACCOUNT", 40'],
  ['"GUEST NAME", 26', '"voidtv.net", 26'], ['"WHAT THEY DO · WHERE", 44', '"FREE TV · A NONPROFIT PROJECT OF CASH", 44'],
  ['"NEW", 8', '"FREE", 8'], ['"EPISODE OUT NOW", 26', '"4,600+ SHOWS", 26'], ['"tap in", 16', '"press play", 16'],
  ['"Watch the full episode", 34', '"Classic and cult TV, all free", 34'], ['"Share it with someone", 34', '"No ads. No account.", 34'],
  ['"Tell us who is next", 34', '"A nonprofit project of CASH", 34'], ['"LINK IN BIO", 30', '"voidtv.net", 30'],
  ['"SUBSCRIBE", 14', '"DONATE", 14'], ['"@yourhandle", 22', '"voidtv.net", 22'],
];
for (const [a, b] of words) swap(a, b);
// Chips keep text exactly as typed, so "voidtv.net" can never be forced into capitals.
swap("letter-spacing: .08em; text-transform: uppercase; color: var(--accentHi);", "letter-spacing: .08em; color: var(--accentHi);");
// The neon blue is bright, so the blue bar takes dark lettering (white on it fails contrast).
swap(".block2 { color: #fff;", ".block2 { color: color-mix(in srgb, var(--second) 12%, black);");

// Set "voidtv.net" like the neon sign wherever it is typed: "voidtv" in the pink, ".net" in the blue.
const insertAfter = (anchor, add, marker) => {
  if (s.includes(marker)) return;
  if (!s.includes(anchor)) throw new Error("anchor missing: " + anchor);
  s = s.replace(anchor, anchor + add);
};
const insertBefore = (anchor, add, marker) => {
  if (s.includes(marker)) return;
  if (!s.includes(anchor)) throw new Error("anchor missing: " + anchor);
  s = s.replace(anchor, add + anchor);
};
insertAfter('.replace(/"/g, "&quot;");',
  '\nconst escName = (s) => esc(s).replace(/(voidtv)(\\.net)/gi, \'$1<span class="net">$2</span>\');', "const escName");
s = s.replaceAll("${esc(f.", "${escName(f.");
insertBefore(".shine { position: absolute;",
  `.metal .net { background: linear-gradient(color-mix(in srgb, var(--second) 30%, white), var(--second) 30%, color-mix(in srgb, var(--second) 50%, black) 58%, color-mix(in srgb, var(--second) 55%, white) 80%, color-mix(in srgb, var(--second) 40%, black));
  -webkit-background-clip: text; background-clip: text; color: transparent; }
.glowtext .net { text-shadow: 0 0 6px #fff, 0 0 14px color-mix(in srgb, var(--second) 45%, white), 0 0 30px var(--second), 0 0 60px var(--second); }
.chip .net { color: color-mix(in srgb, var(--second) 55%, white); }
`, ".metal .net");
writeFileSync(f, s);
console.log("voidtv.net look applied to pack/build-pack.mjs");
