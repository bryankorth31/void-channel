// Trivia Night on voidtv.net (B, 20 Nov 2026: "Yes, a Trivia row"): a home row with one card per deck, only on voidtv.net and only
// when the question bank is built; the site build copies the trivia pages and bank, nothing else. Run: node --test tests/trivia-door.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8').replace(/\r\n/g, '\n');

test('the home page carries the Trivia row only when the build hands it question counts', () => {
  const src = read('scripts/lib/app.js');
  assert.match(src, /const trivia = PROFILE\.name === 'voidtv' \? triviaCounts\(\) : null;/, 'voidtv.net only, never the kids site');
  assert.match(src, /const TRIVIA=\$\{JSON\.stringify\(trivia\)\};/);
  assert.match(src, /if\(TRIVIA\)h\+=triviaRow\(\);/);
  // Every card opens /trivia/ with a deck picked, and says what it is in a tip.
  const row = src.slice(src.indexOf('function triviaRow()'), src.indexOf('function triviaRow()') + 2000);
  for (const q of ['crowd=family', 'crowd=family&topics=tv', 'crowd=family&topics=games', 'crowd=after-dark', 'mode=loud']) assert.ok(row.includes("'" + q + "'"), q);
  assert.match(row, /href="'\+BASE\+'trivia\/\?'\+q\+'" title="Start /);
  assert.ok(!/[\u2013\u2014]/.test(row));
});

test('the host page reads a deck from its address', () => {
  const host = read('trivia/src/host.js');
  assert.match(host, /p\.get\('crowd'\)/);
  assert.match(host, /p\.get\('topics'\)/);
  assert.match(host, /p\.get\('mode'\)/);
});

test('the site build copies the trivia pages, scripts and bank on voidtv.net only, and no tools or tests', () => {
  const src = read('scripts/site.js');
  assert.match(src, /if \(PROFILE\.name === 'voidtv' && fs\.existsSync\(path\.join\(T, 'bank', 'index\.json'\)\)\)/);
  assert.match(src, /for \(const f of \['index\.html', 'phone\.html', 'trivia\.css'\]\) fs\.copyFileSync\(path\.join\(T, f\)/);
  assert.match(src, /for \(const d of \['src', 'bank'\]\) fs\.cpSync\(path\.join\(T, d\)/);
});

test('the bank is small enough to ship: few files, none near the Pages cap', () => {
  const dir = path.join(REPO, 'trivia', 'bank');
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  assert.ok(files.length < 100, files.length + ' files');
  for (const f of files) assert.ok(fs.statSync(path.join(dir, f)).size < 5 * 1024 * 1024, f);
});

test('triviaCounts sums the bank index per topic', () => {
  const app = read('scripts/lib/app.js');
  const body = app.slice(app.indexOf('function triviaCounts()'));
  const fn = new Function('readJson', 'path', '__dirname', body.slice(body.indexOf('{') + 1, body.indexOf('\n}\n')));
  const idx = { files: [{ category: 'tv', count: 500, family: 200 }, { category: 'tv', count: 100, family: 40 }, { category: 'games', count: 50, family: 50 }] };
  assert.deepEqual(fn(() => idx, path, __dirname), { tv: { family: 240, all: 600 }, games: { family: 50, all: 50 } });
  assert.equal(fn(() => null, path, __dirname), null);
});

// ---- Audit A34: the build stamp (Bryan, 20 Nov 2026: "Yes, fix it") ----
const { stampTrivia } = require('../scripts/trivia/stamp');

test('A34: every stylesheet and script both trivia pages load gets the build stamp, and nothing else changes', () => {
  for (const f of ['trivia/index.html', 'trivia/phone.html']) {
    const html = read(f);
    const out = stampTrivia(html, 'abc123def456');
    const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(scripts.length >= 2, f);
    for (const s of scripts) assert.ok(out.includes('<script src="' + s + '?v=abc123def456"'), f + ': ' + s);
    if (/<link rel="stylesheet" href="trivia\.css"/.test(html)) assert.ok(out.includes('href="trivia.css?v=abc123def456"'), f);
    assert.equal(out.replace(/\?v=abc123def456/g, ''), html, f + ': only the stamps were added');
  }
  assert.equal(stampTrivia('<script src="src/host.js"></script>', ''), '<script src="src/host.js"></script>', 'no commit, no stamp');
  assert.equal(stampTrivia('<script src="src/host.js"></script>', 'not-a-sha'), '<script src="src/host.js"></script>');
});

test('A34: the site build stamps the trivia pages with the commit it builds', () => {
  const src = read('scripts/site.js');
  assert.match(src, /const \{ stampTrivia \} = require\('\.\/trivia\/stamp'\);/);
  assert.match(src, /for \(const f of \['index\.html', 'phone\.html'\]\) fs\.writeFileSync\(path\.join\(dst, f\), stampTrivia\(/);
});

test('the site build copies the clip chat\'s timed questions (trivia/timed) when the folder exists', () => {
  const src = read('scripts/site.js');
  assert.match(src, /if \(fs\.existsSync\(path\.join\(T, 'timed'\)\)\) fs\.cpSync\(path\.join\(T, 'timed'\), path\.join\(dst, 'timed'\), \{ recursive: true \}\);/);
});

// Bryan, 20 Nov 2026: "use these with the other lighting type bg that voidtv uses and treat in the same way with how it scrolls".
test('both trivia pages carry VoidTV\'s atmosphere: Trivia Night behind the big screen, Facts Night behind the phone', () => {
  const pages = { 'trivia/index.html': 'trivianight', 'trivia/phone.html': 'factsnight' };
  for (const [f, pic] of Object.entries(pages)) {
    const html = read(f), css = f.endsWith('index.html') ? read('trivia/trivia.css') : html;
    assert.ok(html.includes('<div class="atmos lo" aria-hidden="true"><div class="bgimg"></div><div class="void"><i></i></div></div>'), f);
    assert.ok(html.includes('<script src="src/atmos.js"></script>\n<div class="atmos hi" aria-hidden="true"><div class="grain"></div></div>\n</body>'), f);
    assert.ok(css.includes('url(/assets/brand/bg/' + pic + '.webp) center/cover no-repeat;opacity:.5') && css.includes('url(/assets/brand/bg/' + pic + '-m.webp)'), f);
    assert.ok(css.includes('.bgimg{inset:-12% 0 -12% 0;') && css.includes('animation:grain .6s steps(6) infinite') && css.includes('url(/assets/brand/void-soft.webp)'), f);
    for (const s of ['', '-m']) {
      const p = path.join(REPO, 'assets', 'brand', 'bg', pic + s + '.webp');
      assert.ok(fs.existsSync(p) && fs.statSync(p).size < 300 * 1024, pic + s);
    }
  }
});

test('the trivia background moves with the scroll by voidtv.net\'s own rule, and holds still on touch screens and for less motion', () => {
  const vm = require('vm'), code = read('trivia/src/atmos.js');
  const run = ({ coarse = false, reduce = false, width = 1920 } = {}) => {
    const bg = { style: {} }, vd = { style: {} }; let raf = null;
    const win = { scrollY: 0, innerWidth: width, innerHeight: 1080, addEventListener() {}, requestAnimationFrame: (f) => { raf = f; },
      matchMedia: (q) => ({ matches: (q.includes('reduced-motion') && reduce) || (q.includes('coarse') && coarse) }),
      document: { hidden: false, documentElement: { scrollHeight: 3080 }, addEventListener() {}, querySelectorAll: () => [],
        querySelector: (s) => (s === '.atmos .bgimg' ? bg : s === '.atmos .void' ? vd : null) } };
    win.window = win;
    vm.runInNewContext(code, win);
    if (raf) { win.scrollY = 2000; raf(); }
    return { bg, vd, raf };
  };
  // voidtv.net's numbers at 2000 px down a page with 2000 px to scroll (scripts/lib/app.js): all the way down, two swells.
  const y = 2000, f = 1, w = Math.sin(y / 700), w2 = Math.sin(y / 430);
  const big = run();
  assert.equal(big.bg.style.transform, 'translate3d(0,' + (-f * 60 + w * 22) + 'px,0) scale(' + (1.06 + f * 0.05 + w2 * 0.015) + ')');
  assert.equal(big.vd.style.transform, 'translate3d(' + (w2 * 60) + 'px,' + (-f * 120 + w * 90) + 'px,0) rotate(' + (y * 0.06) + 'deg) scale(' + (1.05 + w2 * 0.12) + ')');
  assert.equal(run({ coarse: true }).bg.style.transform, '', 'a touch screen holds still');
  assert.equal(run({ width: 390 }).bg.style.transform, '', 'a phone holds still');
  const calm = run({ reduce: true });
  assert.equal(calm.raf, null, 'less motion: nothing runs');
  assert.equal(calm.bg.style.transform, undefined);
});
