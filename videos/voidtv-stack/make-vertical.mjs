// Generates the 9:16 variant as a self-contained project in ./vertical (one root composition per project).
// Same timeline and beat times: the composition script picks its 9:16 heap (2 sets wide, the big set at the
// bottom-middle, 104px name, push-in up into the safe zone) from the root size, so only the canvas is swapped here.
// Edit ../index.html only, then run:  node make-vertical.mjs
// Check/render the variant from its folder:  cd vertical && npx --yes hyperframes@0.8.169 check .
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";

const here = (p) => new URL(p, import.meta.url);
let html = readFileSync(here("./index.html"), "utf8").replace(/\r\n/g, "\n");

const swaps = [
  ['content="width=1920, height=1080"', 'content="width=1080, height=1920"'],
  ["<title>voidtv.net the message</title>", "<title>voidtv.net the message 9x16</title>"],
  ["width: 1920px;\n        height: 1080px;\n        overflow: hidden;", "width: 1080px;\n        height: 1920px;\n        overflow: hidden;"],
  ['data-width="1920"', 'data-width="1080"'],
  ['data-height="1080"', 'data-height="1920"'],
];
for (const [from, to] of swaps) {
  if (!html.includes(from)) throw new Error("make-vertical: anchor not found: " + from);
  html = html.replace(from, to);
}
html = html.replace(
  "<!doctype html>",
  "<!doctype html>\n<!-- GENERATED from ../index.html by ../make-vertical.mjs. Do not edit; edit ../index.html and re-run. -->",
);

for (const dir of ["./vertical/", "./vertical/assets/fonts/", "./vertical/assets/textures/"]) mkdirSync(here(dir), { recursive: true });
writeFileSync(here("./vertical/index.html"), html);
for (const f of ["assets/fonts/unbounded-latin.woff2", "assets/textures/noise.png"]) copyFileSync(here("./" + f), here("./vertical/" + f));

const cfg = JSON.parse(readFileSync(here("./hyperframes.json"), "utf8"));
delete cfg.registryItems;
writeFileSync(here("./vertical/hyperframes.json"), JSON.stringify(cfg, null, 2) + "\n");
writeFileSync(here("./vertical/meta.json"), JSON.stringify({ id: "voidtv-stack-9x16", name: "voidtv-stack-9x16" }, null, 2) + "\n");
const pkg = JSON.parse(readFileSync(here("./package.json"), "utf8"));
pkg.name = "voidtv-stack-9x16";
writeFileSync(here("./vertical/package.json"), JSON.stringify(pkg, null, 2) + "\n");
console.log("wrote vertical/ (1080x1920 project)");
