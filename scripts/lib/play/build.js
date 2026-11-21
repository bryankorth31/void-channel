// PLAY AND LEARN build (PLAN-kids-play P3, P6): writes the games page into a kids site as <out>/play/index.html, one
// file with everything inline so it works offline once loaded, plus the voice clips its lines use.
//   site.js calls buildPlay() for the kids theme only, so voidtv.net's output is untouched.
//   node scripts/lib/play/build.js --lines <file.json>   writes { key: text } for every spoken line, which
//   scripts/voice-play.py turns into clips (Kokoro, af_heart, offline) in <kids catalog>/play-voice/.
const fs = require('fs');
const NAV = require('../kids-nav');
const path = require('path');
const { PACKS, WORDS } = require('./packs');
const { ART } = require('./art');
const core = require('./core');

// Every line the page can say, keyed the way the page looks them up.
function allLines() {
  const t = new Set([WORDS.hello, WORDS.lookAgain, WORDS.thinkAgain, WORDS.matchStart, WORDS.matchYes, WORDS.traceStart, WORDS.setDone, WORDS.allDone]);
  for (const g of Object.values(WORDS.games)) t.add(g.say);
  for (const p of PACKS) {
    t.add(p.say);
    for (const it of p.items) { t.add(it.name); t.add(it.ask); t.add(it.yes); }
    for (const s of p.sorts) { t.add(s.ask); for (const b of s.bins) t.add(b.yes); }
    for (const x of p.trace) { t.add(x.say); t.add(x.done); }
  }
  const out = {};
  for (const x of t) if (x) out[core.voiceKey(x)] = x;
  return out;
}

// Script text that is safe inside <script>: no "</" can close the tag early.
const js = (v) => JSON.stringify(v).replace(/</g, '\\u003c');

function page({ siteName, voice, preview }) {
  const here = __dirname, read = (f) => fs.readFileSync(path.join(here, f), 'utf8');
  const name = String(siteName || 'voidtv.net kids');
  const sp = name.indexOf(' ');
  const nameHtml = sp > 0 ? '<span class="w1">' + name.slice(0, sp) + '</span> <span class="w2">' + name.slice(sp + 1) + '</span>' : name;
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>Play and Learn | ' + name + '</title><meta name="description" content="Calm learning games: listen, match, sort and trace.">'
    + (preview ? '<meta name="robots" content="noindex">' : '')
    + '<link rel="icon" href="/assets/kids/mark.svg" type="image/svg+xml"><meta name="theme-color" content="#fff8e7">'
    + "<style>@font-face{font-family:'Unbounded';font-style:normal;font-weight:200 900;font-display:swap;src:url(/assets/brand/fonts/unbounded-latin.woff2) format('woff2')}\n" + read('play.css') + NAV.CSS + '</style></head><body>'
    + (preview ? '<div class="pl-prev">PREVIEW: not the live site</div>' : '')
    + NAV.bar('play')
    + '<main id="pl" aria-live="polite"></main>'
    + '<script>const PLAY=(function(){const module={exports:{}};' + read('core.js') + '\nreturn module.exports})();'
    + 'const PACKS=' + js(PACKS) + ';const WORDS=' + js(WORDS) + ';const ART=' + js(ART) + ';const VOICE=' + js(voice) + ';const VBASE="/assets/kids/play-voice/";\n'
    + read('ui.js') + '\n' + NAV.SCRIPT + '</script></body></html>';
}

// Write <out>/play/index.html and copy the clips that exist in <catalogDir>/play-voice. Returns counts for the log.
function buildPlay({ out, catalogDir, siteName, preview }) {
  const lines = allLines(), src = path.join(catalogDir, 'play-voice'), dst = path.join(out, 'assets', 'kids', 'play-voice');
  const voice = {};
  for (const k of Object.keys(lines)) { const f = path.join(src, k + '.mp3'); if (fs.existsSync(f)) { fs.mkdirSync(dst, { recursive: true }); fs.copyFileSync(f, path.join(dst, k + '.mp3')); voice[k] = 1; } }
  fs.mkdirSync(path.join(out, 'play'), { recursive: true });
  fs.writeFileSync(path.join(out, 'play', 'index.html'), page({ siteName, voice, preview }));
  return { lines: Object.keys(lines).length, clips: Object.keys(voice).length };
}

module.exports = { allLines, page, buildPlay };

if (require.main === module) {
  const i = process.argv.indexOf('--lines');
  if (i < 0) { console.error('usage: node scripts/lib/play/build.js --lines <file.json>'); process.exit(1); }
  const lines = allLines();
  fs.writeFileSync(process.argv[i + 1], JSON.stringify(lines, null, 1));
  console.log(Object.keys(lines).length + ' spoken lines -> ' + process.argv[i + 1]);
}
