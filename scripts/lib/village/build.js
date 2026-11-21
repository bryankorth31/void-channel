// VOID VILLAGE build (PLAN-void-village T4): writes <out>/village/index.html and copies three.js to
// <out>/assets/kids/three/three.min.js (one shared file, cached by the browser). site.js calls buildVillage() for the
// kids theme only; it can also run by hand into the kids preview.
//   node scripts/lib/village/build.js <out dir>        (for example profiles/kids/site-preview)
const fs = require('fs');
const path = require('path');
const NAV = require('../kids-nav');
const { COLORS, TOWN, PLACES, HELPERS, MODEL_NAMES } = require('./world');
const VT = require('./tasks');
const MSIM = require('../play/make/sim'), { JOBS } = require('../play/make/jobs');
// What the machine can say: each job's lines, every what-happened sentence, and the few words around them.
const MACHINE_LINES = ['Drag it into place.', 'Here it goes!', 'What will you change?', 'Look at your tries: each one taught you something.', 'Want to make it better? Could it work with fewer things? Try it and see. Then build a little machine at home, with a grown-up.'];
for (const j of JOBS) { MACHINE_LINES.push(...MSIM.explainLines(j), j.say.job + ' Pick something from your tray, drag it into place, then press Test.', j.say.job + ' This is the machine you built. Test it, or change it.'); }
// The spoken lines' keys match scripts/lib/play/core.js voiceKey, so village lines share the Play and Learn clip folder.
const { voiceKey } = require('../play/core');

function page(voice, preview) {
  const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
  const places = '{' + Object.entries(PLACES).map(([id, p]) => JSON.stringify(id) + ':{name:' + JSON.stringify(p.name) + ',smooth:' + !!p.smooth + ',task:' + JSON.stringify(p.task || null) + ',tasks:' + JSON.stringify(p.tasks || null) + ',hub:' + !!p.hub + ',machine:' + !!p.machine + ',doors:' + JSON.stringify(p.doors || null) + ',things:' + p.things.name + ',view:' + JSON.stringify(p.view) + ',town:' + JSON.stringify(p.town || null) + ',build:' + p.build.name + '}').join(',') + '}';
  const helpers = 'const TOWN=' + JSON.stringify(TOWN) + ';\n' + HELPERS.map((f) => f.toString()).join('\n') + '\n'; // street() reads the town's shape
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>Void Village</title>' + (preview ? '<meta name="robots" content="noindex">' : '') + '<link rel="icon" href="/assets/kids/mark.svg" type="image/svg+xml">'
    + "<style>@font-face{font-family:'Unbounded';font-weight:200 900;font-display:swap;src:url(/assets/brand/fonts/unbounded-latin.woff2) format('woff2')}"
    + '*{box-sizing:border-box}html,body{margin:0;height:100%;background:#fff8e7;}body{display:flex;flex-direction:column;color:#1b1f3b;font:18px/1.4 system-ui,Segoe UI,Roboto,sans-serif}'
    + '.top{display:flex;align-items:center;gap:12px;padding:10px 16px;border-bottom:4px solid #1b1f3b;flex-wrap:wrap}.top img{width:44px;height:44px}'
    + '.top b{font-family:Unbounded,system-ui,sans-serif;font-size:22px}.top .home{font-weight:800;color:#1b1f3b;text-decoration:none;border:3px solid #1b1f3b;border-radius:999px;padding:4px 12px;background:#fff}.top span{color:#3a3f66;font-size:15px}'
    + '#vv-places{margin-left:auto;display:flex;gap:10px;flex-wrap:nowrap;overflow-x:auto;max-width:100%;padding:2px 4px 6px}#vv-places button{flex:none;white-space:nowrap}#vv-places button{font:inherit;font-weight:800;padding:8px 16px;border:4px solid #1b1f3b;border-radius:999px;background:#fff;box-shadow:3px 3px 0 #1b1f3b;cursor:pointer}#vv-places button.on{background:#ffd23f}'
    // The task card sits beside the village (wide screens) or under it (phones), never on top of it.
    + '#vv-stage{flex:1;min-height:0;display:flex}#vv{position:relative;flex:1;min-width:0;min-height:0;background:linear-gradient(#cfefff,#fff8e7 70%)}#vv canvas{display:block;width:100%;height:100%;touch-action:none;cursor:grab}'
    + '#vv-task{flex:none;width:min(380px,34vw);overflow-y:auto;display:flex;flex-wrap:wrap;align-content:flex-start;align-items:center;gap:14px;background:#fff;border-left:4px solid #1b1f3b;padding:20px 18px}#vv-task[hidden]{display:none}'
    + '@media(max-width:700px){.top{padding:6px 12px;gap:6px}.top span{display:none}.top b{font-size:18px}}@media(max-width:800px){#vv-stage{flex-direction:column}#vv-task{width:auto;max-height:42vh;border-left:0;border-top:4px solid #1b1f3b;padding:12px 14px}}#vv-task p{flex:1;margin:0;font-size:20px;font-weight:700;min-width:200px}#vv-task .ear{font-size:26px;width:52px;height:52px;border-radius:50%;border:3px solid #1b1f3b;background:#2ec4b6;cursor:pointer}#vv-task .dots{display:flex;gap:6px;width:100%;justify-content:center}#vv-task .dots i{width:14px;height:14px;border-radius:50%;border:3px solid #1b1f3b;background:#fff}#vv-task .dots i.d{background:#2ec4b6}#vv-task.done{background:#ffd23f}#vv-task .acts{width:100%;display:flex;gap:10px;justify-content:center;flex-wrap:wrap}#vv-task .again{font:inherit;font-weight:800;padding:10px 18px;border:4px solid #1b1f3b;border-radius:999px;background:#fff;cursor:pointer}'
    + '#vv-machine{position:absolute;inset:0;background:linear-gradient(#f6e7cf,#fff8e7)}#vv-machine canvas{display:block;width:100%;height:100%;touch-action:none}'
    + '#vv-machine .m-card{position:absolute;left:50%;transform:translateX(-50%);top:10px;width:min(680px,calc(100% - 32px));display:flex;flex-wrap:wrap;gap:10px;align-items:center;background:#fff;border:4px solid #1b1f3b;border-radius:22px;box-shadow:4px 4px 0 #1b1f3b;padding:10px 14px}#vv-machine .m-card p{margin:0;flex:1;font-size:19px;font-weight:700;min-width:200px}#vv-machine .ear{font-size:22px;width:46px;height:46px;border-radius:50%;border:3px solid #1b1f3b;background:#2ec4b6;cursor:pointer}'
    + '#vv-machine .m-acts{width:100%;display:flex;gap:10px;flex-wrap:wrap;margin-top:8px}#vv-machine .m-acts button,#vv-machine .m-bar button{font:inherit;font-weight:800;padding:10px 16px;border:4px solid #1b1f3b;border-radius:999px;background:#fff;box-shadow:3px 3px 0 #1b1f3b;cursor:pointer}'
    + '#vv-machine .m-bar{position:absolute;left:12px;right:12px;bottom:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}#vv-machine .m-tray{display:flex;gap:8px;flex-wrap:wrap;flex:1}#vv-machine .m-tray i{display:inline-block;width:24px;height:24px;border:3px solid #1b1f3b;border-radius:6px;margin-right:8px;vertical-align:-5px}#vv-machine .m-tray span{font-weight:700}#vv-machine .m-tray button{font-size:21px;padding:12px 20px}#vv-machine .m-tools{display:flex;gap:8px;visibility:hidden}#vv-machine .m-test{background:#ffd23f!important;font-size:22px!important;padding:14px 26px!important}#vv-machine .m-test:disabled{opacity:.5}'
    + '#vv-machine .m-tries{position:absolute;right:12px;top:110px;display:flex;flex-direction:column;gap:8px;max-height:calc(100% - 200px);overflow:auto}#vv-machine figure{margin:0;background:#fff;border:3px solid #1b1f3b;border-radius:12px;padding:4px;width:120px}#vv-machine figure.ok{background:#ffd23f}#vv-machine figure svg{display:block;width:100%;height:auto}#vv-machine figcaption{font-size:13px;font-weight:800;text-align:center}'
    + '.hint{position:absolute;left:16px;top:12px;background:#fff;border:3px solid #1b1f3b;border-radius:999px;padding:4px 12px;font-size:14px}'
    + NAV.CSS + '</style></head><body>' + NAV.bar('village') + '<div class="top"><b>Void Village</b><span>Lessons on life found in the Void</span><div id="vv-places"></div></div>'
    + '<div id="vv-stage"><div id="vv"><div class="hint">Drag to turn. Pinch or scroll to look closer.</div></div><div id="vv-task" hidden aria-live="polite"></div></div>'
    + '<script src="/assets/kids/three/three.min.js"></script><script src="/assets/kids/three/planck.min.js"></script>'
    + '<script>const VT=(function(){const module={exports:{}};' + read('tasks.js') + '\nreturn module.exports})();const MSIM=(function(){const module={exports:{}};' + fs.readFileSync(path.join(__dirname, '..', 'play', 'make', 'sim.js'), 'utf8') + '\nreturn module.exports})();const MJOBS=(function(){const module={exports:{}};' + fs.readFileSync(path.join(__dirname, '..', 'play', 'make', 'jobs.js'), 'utf8') + '\nreturn module.exports})();const VOICE=' + JSON.stringify(voice || {}) + ';const VBASE="/assets/kids/play-voice/";const COLORS=' + JSON.stringify(COLORS) + ';const F=8;' + helpers + 'const MODELS={' + Object.entries(MODEL_NAMES).map(([k, f]) => k + ':' + f).join(',') + '};const PLACES=' + places + ';\n' + read('machine.js') + '\n' + read('view.js') + '\n' + NAV.SCRIPT + '</script></body></html>';
}

// Every line the village can say, keyed the same way the page looks them up.
function allLines() { const out = {}; for (const t of [...VT.lines(), ...MACHINE_LINES]) if (t) out[voiceKey(t)] = t; return out; }

function buildVillage(out, catalogDir, opts = {}) {
  const voice = {};
  if (catalogDir) { const src = path.join(catalogDir, 'play-voice'), dst = path.join(out, 'assets', 'kids', 'play-voice');
    for (const k of Object.keys(allLines())) { const f = path.join(src, k + '.mp3'); if (fs.existsSync(f)) { fs.mkdirSync(dst, { recursive: true }); fs.copyFileSync(f, path.join(dst, k + '.mp3')); voice[k] = 1; } } }
  fs.mkdirSync(path.join(out, 'village'), { recursive: true });
  fs.writeFileSync(path.join(out, 'village', 'index.html'), page(voice, !!opts.preview));
  fs.mkdirSync(path.join(out, 'assets', 'kids', 'three'), { recursive: true });
  fs.copyFileSync(path.join(__dirname, '..', 'play', 'vendor', 'three.min.js'), path.join(out, 'assets', 'kids', 'three', 'three.min.js'));
  fs.copyFileSync(path.join(__dirname, '..', 'play', 'vendor', 'planck.min.js'), path.join(out, 'assets', 'kids', 'three', 'planck.min.js'));
}

module.exports = { page, buildVillage, allLines };
if (require.main === module) {
  const a = process.argv.slice(2), li = a.indexOf('--lines');
  if (li >= 0) { const l = allLines(); fs.writeFileSync(a[li + 1], JSON.stringify(l, null, 1)); console.log(Object.keys(l).length + ' village lines -> ' + a[li + 1]); process.exit(0); }
  const out = a[0], cat = a[1]; if (!out) { console.error('usage: node scripts/lib/village/build.js <out dir> [<kids catalog dir>]   or   --lines <file.json>'); process.exit(1); }
  buildVillage(out, cat); console.log('Void Village -> ' + path.join(out, 'village'));
}
