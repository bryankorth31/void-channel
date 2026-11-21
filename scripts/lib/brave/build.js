// BRAVE STEPS build: writes <out>/brave/index.html for the kids site (scripts/site.js, kids theme). One page, no
// network calls: progress and a grown-up's own ladder stay in this browser only (localStorage), nothing is sent.
// Spoken lines share the Play and Learn clip folder (keys from scripts/lib/play/core.js voiceKey).
//   node scripts/lib/brave/build.js --lines <file.json>   writes { key: text } for the voice clips
const fs = require('fs');
const NAV = require('../kids-nav');
const path = require('path');
const B = require('./ladders');
const { voiceKey } = require('../play/core');

function allLines() { const o = {}; for (const t of B.allLines()) o[voiceKey(t)] = t; return o; }

const CSS = `
.bv-hello{display:flex;gap:14px;align-items:center;justify-content:center;max-width:720px;margin:0 auto 22px;font-size:22px;font-weight:700}
.bv-ear{flex:none;width:56px;height:56px;border-radius:50%;border:4px solid var(--ink);background:var(--teal);font-size:24px;box-shadow:3px 3px 0 var(--ink)}
.bv-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:18px;max-width:820px;margin:0 auto}
.bv-pick{display:flex;flex-direction:column;align-items:center;gap:10px;padding:18px 12px;border:5px solid var(--ink);border-radius:26px;box-shadow:6px 6px 0 var(--ink);background:#fff;font-weight:800;font-size:22px;text-align:center}
.bv-pick svg{width:84px;height:84px}
.bv-ladder{max-width:680px;margin:0 auto;display:flex;flex-direction:column-reverse;gap:12px}
.bv-rung{display:flex;gap:12px;align-items:center;background:#fff;border:4px solid var(--ink);border-radius:20px;padding:12px 14px;box-shadow:4px 4px 0 var(--ink)}
.bv-rung.done{background:#e3f7f5}.bv-rung .n{flex:none;width:44px;height:44px;border-radius:50%;border:4px solid var(--ink);display:flex;align-items:center;justify-content:center;font-weight:900;background:var(--sun)}
.bv-rung.done .n{background:var(--teal)}.bv-rung p{flex:1;margin:0;font-weight:700}.bv-rung .bv-ear{width:46px;height:46px;font-size:20px}.bv-rung{flex-wrap:wrap}.bv-rung p{min-width:0;flex:1 1 160px}.bv-rung .acts{flex:1 0 100%;display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end}.pl-top{flex-wrap:wrap}
.bv-btn{font-weight:800;padding:12px 22px;border:4px solid var(--ink);border-radius:999px;background:var(--sun);box-shadow:4px 4px 0 var(--ink);text-decoration:none;color:var(--ink);display:inline-block}
.bv-btn.soft{background:#fff}.bv-row{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin:18px 0}
.bv-meter{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin:16px 0}
.bv-face{display:flex;flex-direction:column;align-items:center;gap:6px;width:112px;padding:10px 6px;border:4px solid var(--ink);border-radius:20px;background:#fff;box-shadow:4px 4px 0 var(--ink);font-weight:700;font-size:16px}
.bv-face svg{width:64px;height:64px}.bv-face.on{background:var(--sun)}
.bv-big{max-width:680px;margin:0 auto;text-align:center;font-size:24px;font-weight:800}
.bv-grown{max-width:680px;margin:34px auto 0;background:#fff;border:4px dashed var(--ink);border-radius:20px;padding:14px 18px;font-size:17px}
.bv-grown h3{margin:0 0 6px;font-family:Unbounded,system-ui,sans-serif;font-size:18px}.bv-grown p{margin:6px 0}
.bv-form{max-width:620px;margin:0 auto;display:flex;flex-direction:column;gap:10px}.bv-form input{font:inherit;padding:10px 14px;border:4px solid var(--ink);border-radius:14px}
`;

const UI = String.raw`
(function () {
  const $ = (s) => document.querySelector(s), main = $('#bv'), KEY = 'voidbrave.v1';
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } };
  const save = (d) => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { /* private window: it simply forgets */ } };
  function vkey(t) { let h = 2166136261; for (const ch of String(t)) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0; return h.toString(16).padStart(8, '0'); }
  const aud = new Audio(), QUIET = /quiet/.test(location.hash); let q = [];
  function say(lines) { aud.pause(); q = [].concat(lines).filter(Boolean); next(); }
  function next() { if (!q.length) return; const t = q.shift(), k = vkey(t); if (QUIET || !VOICE[k]) return next(); aud.src = VBASE + k + '.mp3'; aud.onended = next; aud.onerror = next; aud.play().catch(next); }
  const ear = (t) => '<button class="bv-ear" data-say="' + esc(t) + '" aria-label="Say it again">&#128264;</button>';
  const text = (s) => (typeof s === 'string' ? s : s.say);
  function ladderIcon(c) { return '<svg viewBox="0 0 100 100" aria-hidden="true"><rect x="22" y="6" width="10" height="88" rx="4" fill="' + c + '" stroke="#1b1f3b" stroke-width="4"/><rect x="68" y="6" width="10" height="88" rx="4" fill="' + c + '" stroke="#1b1f3b" stroke-width="4"/>' + [20, 40, 60, 80].map((y) => '<rect x="28" y="' + y + '" width="44" height="8" rx="3" fill="#fff" stroke="#1b1f3b" stroke-width="4"/>').join('') + '</svg>'; }
  function face(i) { // 0 calm to 4 too worried: the mouth turns down, the brows go up
    const fill = ['#9be15d', '#d7ec6a', '#ffd23f', '#ffa45c', '#ff7a8a'][i], m = [-14, -6, 0, 6, 12][i];
    return '<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="44" fill="' + fill + '" stroke="#1b1f3b" stroke-width="5"/><circle cx="35" cy="42" r="6" fill="#1b1f3b"/><circle cx="65" cy="42" r="6" fill="#1b1f3b"/>'
      + (i >= 3 ? '<path d="M24 30 L42 ' + (i === 4 ? 22 : 26) + ' M76 30 L58 ' + (i === 4 ? 22 : 26) + '" stroke="#1b1f3b" stroke-width="5" stroke-linecap="round"/>' : '')
      + '<path d="M30 ' + (70 + (m > 0 ? 6 : 0)) + ' Q50 ' + (70 - m) + ' 70 ' + (70 + (m > 0 ? 6 : 0)) + '" fill="none" stroke="#1b1f3b" stroke-width="6" stroke-linecap="round"/></svg>';
  }
  function ladders() { const d = load(), out = B.LADDERS.slice(); if (d.own && d.own.steps && d.own.steps.length) out.push({ id: 'own', name: d.own.name || B.LINES.own, color: '#ffe0a6', hello: '', steps: d.own.steps, own: true }); return out; }
  function doneOf(id) { const d = load(); return (d.done && d.done[id]) || []; }
  function setDone(id, i) { const d = load(); d.done = d.done || {}; const a = d.done[id] || []; a[i] = true; d.done[id] = a; save(d); }
  const grown = () => '<section class="bv-grown"><h3>For grown-ups</h3>' + B.GROWNUP.map((g) => '<p>' + esc(g) + '</p>').join('') + '</section>';

  let where = 'home';
  function home() {
    where = 'home';
    main.innerHTML = '<h1 class="pl-h">' + B.LINES.title + '</h1><div class="bv-hello">' + ear(B.LINES.hello) + '<span>' + B.LINES.hello + '</span></div>'
      + '<div class="bv-list">' + ladders().map((l) => '<button class="bv-pick" data-l="' + l.id + '" style="background:' + l.color + '22">' + ladderIcon(l.color) + esc(l.name) + '</button>').join('')
      + (ladders().some((l) => l.own) ? '' : '<button class="bv-pick" data-own="1">' + ladderIcon('#ffe0a6') + B.LINES.own + '</button>') + '</div>' + grown();
    say(B.LINES.hello);
  }
  function ladder(id) {
    const l = ladders().find((x) => x.id === id); if (!l) return home();
    cur = id; where = 'ladder'; const done = doneOf(id), nextI = l.steps.findIndex((s, i) => !done[i]);
    main.innerHTML = '<h1 class="pl-h">' + esc(l.name) + '</h1>' + (l.hello ? '<div class="bv-hello">' + ear(l.hello) + '<span>' + esc(l.hello) + '</span></div>' : '')
      + '<div class="bv-hello">' + ear(B.LINES.ladder) + '<span>' + B.LINES.ladder + '</span></div>'
      + '<div class="bv-ladder">' + l.steps.map((s, i) => '<div class="bv-rung' + (done[i] ? ' done' : '') + '"><span class="n">' + (done[i] ? '&#10003;' : i + 1) + '</span><p>' + esc(text(s)) + '</p>'
        + (l.own ? '' : ear(text(s)))
        + (s.village || i === nextI ? '<div class="acts">' + (s.village ? '<a class="bv-btn soft" href="/village/#' + s.village + '&from=' + encodeURIComponent('/brave/#' + id) + '">Go to the Village</a>' : '') + (i === nextI ? '<button class="bv-btn" data-try="' + i + '">Try it</button>' : '') + '</div>' : '') + '</div>').join('') + '</div>'
      + (nextI < 0 ? '<p class="bv-big">' + B.LINES.top + '</p>' : '')
      + '<div class="bv-row"><button class="bv-btn soft" data-home="1">All the worries</button>' + (l.own ? '<button class="bv-btn soft" data-forget="1">Clear this ladder</button>' : '') + '</div>' + grown();
    say(nextI < 0 ? B.LINES.top : [l.hello, B.LINES.ladder]);
  }
  function meter() { return '<div class="bv-meter">' + B.METER.map((m, i) => '<button class="bv-face" data-m="' + i + '">' + face(i) + m + '</button>').join('') + '</div>'; }
  // Trying one step: the worry meter before, the try itself (stay until it gets a little smaller), the meter after.
  let trying = null; // { id, i, phase: 'before' | 'go' | 'after', before }
  function tryScreen() {
    const t = trying, l = ladders().find((x) => x.id === t.id), s = text(l.steps[t.i]), back = '<button class="bv-btn soft" data-l="' + t.id + '">Back to the ladder</button>';
    const head = '<h1 class="pl-h">' + esc(s) + '</h1>';
    if (t.phase === 'before') { main.innerHTML = head + '<div class="bv-hello">' + ear(B.LINES.before) + '<span>' + B.LINES.before + '</span></div>' + meter() + '<div class="bv-row">' + back + '</div>'; say(l.own ? B.LINES.before : [s, B.LINES.before]); }
    if (t.phase === 'go') { main.innerHTML = head + '<div class="bv-hello">' + ear(B.LINES.go) + '<span>' + B.LINES.go + '</span></div><div class="bv-row"><button class="bv-btn" data-tried="1">' + B.LINES.tried + '</button>' + back + '</div>'; say(B.LINES.go); }
    if (t.phase === 'after') { main.innerHTML = head + '<div class="bv-hello">' + ear(B.LINES.after) + '<span>' + B.LINES.after + '</span></div>' + meter() + '<div class="bv-row">' + back + '</div>'; say(B.LINES.after); }
  }
  function onMeter(m) {
    const t = trying;
    if (t.phase === 'before') { t.before = m; t.phase = 'go'; return tryScreen(); }
    if (t.phase !== 'after') return;
    const calm = t.before === 0 && m === 0, line = calm ? B.LINES.calm : m < t.before ? B.smaller(t.before, m) : B.LINES.same;
    if (calm || m < t.before) setDone(t.id, t.i); // smaller, or calm all along: the step is done
    main.innerHTML = '<p class="bv-big" style="margin-top:30px">' + esc(line) + '</p><div class="bv-row"><button class="bv-btn" data-l="' + t.id + '">Back to the ladder</button></div>';
    trying = null; where = 'result'; say(line);
  }
  function own() {
    where = 'own';
    main.innerHTML = '<h1 class="pl-h">' + B.LINES.own + '</h1><p class="bv-hello">' + B.LINES.ownHello + '</p><form class="bv-form"><input name="name" maxlength="60" placeholder="The worry (for example: thunder)" required>'
      + [1, 2, 3, 4, 5].map((n) => '<input name="s' + n + '" maxlength="120" placeholder="Step ' + n + (n === 1 ? ': the easiest' : n === 5 ? ': the hardest' : '') + '">').join('')
      + '<div class="bv-row"><button class="bv-btn">Make the ladder</button><button type="button" class="bv-btn soft" data-home="1">Back</button></div></form>' + grown();
    main.querySelector('form').onsubmit = (e) => { e.preventDefault(); const f = new FormData(e.target), steps = [1, 2, 3, 4, 5].map((n) => String(f.get('s' + n) || '').trim()).filter(Boolean);
      if (!steps.length) return; const d = load(); d.own = { name: String(f.get('name') || '').trim(), steps }; if (d.done) delete d.done.own; save(d); ladder('own'); };
  }
  function route(e) {
    const b = e.target.closest('button,a'); if (!b) return;
    if (b.dataset.say) return say(b.dataset.say);
    if (b.dataset.home) return home();
    if (b.dataset.own) return own();
    if (b.dataset.forget) { const d = load(); delete d.own; if (d.done) delete d.done.own; save(d); return home(); }
    if (b.dataset.l) { trying = null; return ladder(b.dataset.l); }
    if (b.dataset.try !== undefined && cur) { trying = { id: cur, i: +b.dataset.try, phase: 'before', before: null }; return tryScreen(); }
    if (b.dataset.m !== undefined && trying) return onMeter(+b.dataset.m);
    if (b.dataset.tried && trying) { trying.phase = 'after'; return tryScreen(); }
  }
  let cur = null;
  main.onclick = route; window.bvSay = say;
  // The top bar's big arrow (scripts/lib/kids-nav.js): a try goes back to its ladder, a ladder to all the worries.
  window.kidsBackHere = function () { if (trying) { const id = trying.id; trying = null; ladder(id); return true; } if (where === 'result' && cur) { ladder(cur); return true; } if (where !== 'home') { home(); return true; } return false; };
  // /brave/#doctor opens that ladder (the Village's back arrow comes here).
  const start = location.hash.slice(1).split(/[&,]/).find((p) => ladders().some((l) => l.id === p));
  if (start) ladder(start); else home();
})();
`;

function page(voice, preview) {
  const css = fs.readFileSync(path.join(__dirname, '..', 'play', 'play.css'), 'utf8');
  const data = { LADDERS: B.LADDERS, LINES: B.LINES, METER: B.METER, GROWNUP: B.GROWNUP };
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>Brave steps | voidtv.net kids</title><meta name="description" content="Small brave steps for everyday worries, with a grown-up.">' + (preview ? '<meta name="robots" content="noindex">' : '')
    + '<link rel="icon" href="/assets/kids/mark.svg" type="image/svg+xml"><meta name="theme-color" content="#fff8e7">'
    + "<style>@font-face{font-family:'Unbounded';font-style:normal;font-weight:200 900;font-display:swap;src:url(/assets/brand/fonts/unbounded-latin.woff2) format('woff2')}\n" + css + CSS + NAV.CSS + '</style></head><body>'
    + NAV.bar('brave')
    + '<main id="bv" aria-live="polite"></main>'
    + '<script>const B=' + JSON.stringify(data).replace(/</g, '\\u003c') + ';B.smaller=function(a,b){return "Your worry went from "+B.METER[a].toLowerCase()+" to "+B.METER[b].toLowerCase()+". Staying made it smaller. That is brave!"};'
    + 'const VOICE=' + JSON.stringify(voice || {}) + ';const VBASE="/assets/kids/play-voice/";' + UI + '\n' + NAV.SCRIPT + '</script></body></html>';
}

function buildBrave(out, catalogDir, opts = {}) {
  const voice = {};
  if (catalogDir) { const src = path.join(catalogDir, 'play-voice'), dst = path.join(out, 'assets', 'kids', 'play-voice');
    for (const k of Object.keys(allLines())) { const f = path.join(src, k + '.mp3'); if (fs.existsSync(f)) { fs.mkdirSync(dst, { recursive: true }); fs.copyFileSync(f, path.join(dst, k + '.mp3')); voice[k] = 1; } } }
  fs.mkdirSync(path.join(out, 'brave'), { recursive: true });
  fs.writeFileSync(path.join(out, 'brave', 'index.html'), page(voice, !!opts.preview));
  return { lines: Object.keys(allLines()).length, clips: Object.keys(voice).length };
}

module.exports = { allLines, page, buildBrave };
if (require.main === module) {
  const a = process.argv.slice(2), li = a.indexOf('--lines');
  if (li >= 0) { const l = allLines(); fs.writeFileSync(a[li + 1], JSON.stringify(l, null, 1)); console.log(Object.keys(l).length + ' brave lines -> ' + a[li + 1]); process.exit(0); }
  if (!a[0]) { console.error('usage: node scripts/lib/brave/build.js <out dir> [<kids catalog dir>]   or   --lines <file.json>'); process.exit(1); }
  console.log(buildBrave(a[0], a[1]));
}
