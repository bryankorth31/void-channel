// The one background every Void area shares (assets/brand/atmos/atmos.js).
// Bryan, 21 Nov 2026: "the bgs on all the voids isnt to the level it needs to be. its not the correct opacity nor does it feels
// like it sits behind at a distance with the infinite detached paralax type or whatever scrolling"; 22 Nov 2026: "i want the bg
// sittuation to be fixed on all pages". Run: node --test tests/atmos.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const FILE = 'assets/brand/atmos/atmos.js';
const A = require('../' + FILE);
const SRC = read(FILE);

test('it sits behind at a distance: the house numbers are the ones Bryan set by eye, and every layer moves less than the page', () => {
  // Bryan, 22 Nov 2026, from the tuning box (?atmos=tune), pasted as they are.
  assert.deepEqual(A.HOUSE, { far: { o: 0.58, s: 0.22 }, mid: { o: 0.37, s: 0.22 }, near: { o: 0.43, s: 0.66 }, veilTop: 0.25, veilBottom: 0.43, grain: 0.05, void: 0.16 });
  const { far, mid, near } = A.HOUSE;
  assert.ok(far.s > 0 && far.s <= mid.s && mid.s < near.s && near.s < 1, 'behind the page, and the dust nearest');
  // 1000 px of scroll: the page moves 1000, the pictures 220.
  assert.equal(A.shift(1000, far.s, 99999, 0), -1000 * far.s);
});

test('it never ends: a strip wraps round after one pattern, on a page of any length, and shows the same picture at both ends', () => {
  const T = A.tileHeight(1278, 513), P = 5 * T;
  for (const y of [0, 513, 14000, 250000, 3e6]) {
    const s = A.shift(y, A.HOUSE.far.s, P, 0);
    assert.ok(s <= 0 && s > -P, 'between one pattern up and 0 at ' + y + ': ' + s);
    // One whole pattern further down the page, the strip is in the same place.
    assert.ok(Math.abs(A.shift(y + P / A.HOUSE.far.s, A.HOUSE.far.s, P, 0) - s) < 1e-6, 'periodic at ' + y);
  }
  // Enough tiles that the window is covered wherever the strip sits, with one to spare below (and one above, for the drift).
  for (const [W, VH, n, fit] of [[1278, 513, 5, ''], [1920, 1080, 2, ''], [1920, 1080, 1, 'cover'], [821, 1316, 5, ''], [821, 1316, 1, 'cover'], [412, 915, 1, 'cover']]) {
    const t = A.tileHeight(W, VH, fit), c = A.tileCount(t, n, VH);
    assert.ok(c * t >= n * t + VH + t - 1, W + 'x' + VH + ' ' + n + ' pictures: ' + c + ' tiles of ' + t);
  }
});

test('a tile has the picture\'s own shape, so the whole picture shows; "cover" is never shorter than the window', () => {
  assert.equal(A.tileHeight(1920, 1080), 1072);
  assert.equal(A.tileHeight(1278, 513), Math.round(1278 * 1072 / 1920));
  assert.equal(A.tileHeight(821, 1316, 'cover'), 1316, 'one picture fills a tall tablet');
  assert.equal(A.tileHeight(1920, 1080, 'cover'), 1080);
  assert.equal(A.tileHeight(412, 915), Math.round(412 * 1.25), 'a phone gets the taller phone copy');
});

test('pictures: a name is read beside the base, a phone gets the phone copy, a full address is left alone', () => {
  assert.equal(A.address('col/wall.jpg', '/assets/brand/bg/', false), '/assets/brand/bg/col/wall.jpg');
  assert.equal(A.address('trivianight.webp', '/assets/brand/bg/', true), '/assets/brand/bg/trivianight-m.webp');
  assert.equal(A.address('hall.jpg', 'img/bg/', true), 'img/bg/hall-m.jpg');
  assert.equal(A.address('https://voidtv.net/assets/brand/bg/col/wall.jpg', 'img/bg/', false), 'https://voidtv.net/assets/brand/bg/col/wall.jpg');
  // Every picture an area names is in the repo, with its phone copy, and light enough for a page.
  const named = ['col/wall.jpg', 'col/sign-pink.jpg', 'col/watcher-purple.jpg', 'col/sign-orange.jpg', 'col/watcher-orange.jpg', 'col/static-glitch.jpg', 'col/static-bolt.jpg', 'col/static-dark.jpg',
    'voidarcade-wall.webp', 'voidarcade-player.webp', 'trivianight.webp', 'factsnight.webp'];
  for (const n of named) for (const phone of [false, true]) {
    const p = path.join(REPO, A.address(n, 'assets/brand/bg/', phone));
    assert.ok(fs.existsSync(p) && fs.statSync(p).size < 500 * 1024, n + (phone ? ' (phone)' : ''));
  }
});

test('one strength for every area: tuned numbers stay inside their limits, and a bad one falls back to the house number', () => {
  const S = A.settings({ far: { o: 7, s: 5 }, mid: { o: -1 }, grain: 'x', veilTop: 0.3 });
  assert.equal(S.far.o, 1); assert.equal(S.far.s, 0.9); assert.equal(S.mid.o, 0); assert.equal(S.mid.s, A.HOUSE.mid.s);
  assert.equal(S.grain, 0); assert.equal(S.veilTop, 0.3); assert.equal(S.veilBottom, A.HOUSE.veilBottom);
  assert.deepEqual(A.settings(null), A.HOUSE);
});

// The file in a pretend page: what it builds, and what it does on a scroll.
function page({ width = 1278, height = 513, reduce = false, dataset = {}, search = '' } = {}) {
  const frames = []; const listeners = {};
  const mk = (tag) => { const e = { tagName: tag, className: '', style: {}, children: [], dataset: {}, parentNode: null, _html: '',
    classList: { toggle(c, on) { const s = new Set(e.className.split(' ').filter(Boolean)); (on === undefined ? !s.has(c) : on) ? s.add(c) : s.delete(c); e.className = [...s].join(' '); }, add(c) { this.toggle(c, true); } },
    setAttribute() {}, appendChild(c) { c.parentNode = e; e.children.push(c); return c; }, insertBefore(c) { c.parentNode = e; e.children.unshift(c); return c; },
    getContext: () => null, addEventListener() {}, querySelectorAll: () => [], querySelector: () => null,
    set innerHTML(v) { e._html = v; }, get innerHTML() { return e._html; }, get firstChild() { return e.children[0] || null; } }; return e; };
  const body = mk('body'), head = mk('head'), html = mk('html');
  const win = { innerWidth: width, innerHeight: height, scrollY: 0, location: { search },
    matchMedia: (q) => ({ matches: q.includes('reduced-motion') && reduce }),
    addEventListener: (t, f) => { listeners[t] = f; }, requestAnimationFrame: (f) => { frames.push(f); },
    setTimeout: (f) => f(), clearTimeout() {}, setInterval: () => 1, clearInterval() {}, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: { body, head, documentElement: html, hidden: false, currentScript: { src: 'https://voidtv.net/assets/brand/atmos/atmos.js?v=1', dataset },
      createElement: mk, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] } };
  win.window = win; win.localStorage = win.localStorage;
  vm.runInNewContext(SRC, win);
  const lo = body.children.find((c) => /\bvatm lo\b/.test(c.className)), hi = body.children.find((c) => /\bvatm hi\b/.test(c.className));
  const part = (name) => lo.children.find((c) => c.className.includes(name));
  const scroll = (y) => { win.scrollY = y; listeners.scroll && listeners.scroll(); while (frames.length) frames.shift()(); };
  return { win, body, lo, hi, part, scroll, style: head.children[0].textContent };
}
const ty = (el) => +/translate3d\(0,(-?[\d.]+)px/.exec(el.style.transform)[1];

test('on a page: the box goes in behind everything, the grain on top, and a scroll moves three layers by three amounts', () => {
  const p = page();
  assert.equal(p.body.children[0], p.lo, 'first in the page, so everything else sits over it');
  assert.equal(p.body.children[p.body.children.length - 1], p.hi, 'the grain is last');
  const far = p.part('vatm-far'), mid = p.part('vatm-mid'), near = p.part('vatm-near');
  // The main site's five pictures by default, from the folder beside the file, wherever the page is.
  const pics = [...far.children[0].innerHTML.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1]);
  assert.equal(pics[1], 'https://voidtv.net/assets/brand/bg/col/wall.jpg', 'the first picture on screen');
  assert.equal(pics[0], 'https://voidtv.net/assets/brand/bg/col/watcher-orange.jpg', 'the last picture waits above, so a downward drift shows no edge');
  assert.ok(mid.children[0].innerHTML.includes('col/static-bolt.jpg'), 'VoidTV\'s lightning static over them');
  p.scroll(1000);
  const H = A.HOUSE, near1 = +(-1000 * H.near.s).toFixed(1);
  assert.equal(ty(far), -1000 * H.far.s); assert.equal(ty(mid), -1000 * H.mid.s); assert.equal(ty(near), near1);
  assert.ok(ty(near) < ty(far), 'the dust has gone further than the pictures');
  // 14,000 px down the home page the strip has wrapped round and is still there: the same rule, any length of page.
  p.scroll(14000);
  assert.equal(ty(far), +A.shift(14000, H.far.s, 5 * A.tileHeight(1278, 513), 0).toFixed(1));
  assert.ok(ty(far) <= 0 && ty(far) > -5 * A.tileHeight(1278, 513));
});

test('an area passes its own pictures: PLAY\'s two whole, Trivia\'s one covering the window, University\'s from its own folder', () => {
  const play = page({ dataset: { far: 'voidarcade-wall.webp,voidarcade-player.webp' } });
  const html = play.part('vatm-far').children[0].innerHTML;
  assert.ok(html.includes('bg/voidarcade-wall.webp') && html.includes('bg/voidarcade-player.webp'));
  assert.ok(html.includes('height:714px'), 'the picture\'s own shape at 1278 wide ("use it like that")');
  const trivia = page({ width: 821, height: 1316, dataset: { far: 'trivianight.webp', fit: 'cover', strength: '0.8' } });
  assert.ok(trivia.part('vatm-far').children[0].innerHTML.includes('height:1316px'), 'never shorter than the window');
  assert.ok(Math.abs(trivia.part('vatm-far').children[0].style.opacity - A.HOUSE.far.o * 0.8) < 1e-9, 'a quieter background where words sit over the picture');
  const uni = page({ dataset: { base: 'img/bg/', far: 'hall.jpg,academy.jpg' } });
  assert.ok(uni.part('vatm-far').children[0].innerHTML.includes('url(img/bg/hall.jpg)'));
  assert.ok(uni.part('vatm-mid').children[0].innerHTML.includes('https://voidtv.net/assets/brand/bg/col/static-glitch.jpg'), 'the lightning still comes from voidtv.net');
});

test('a phone and anyone who asks for less motion get the same picture, standing still; a tablet moves', () => {
  const phone = page({ width: 412, height: 915, dataset: { far: 'factsnight.webp', fit: 'cover' } });
  assert.ok(phone.lo.className.includes('still'));
  assert.ok(phone.part('vatm-far').children[0].innerHTML.includes('factsnight-m.webp'), 'the phone copy');
  phone.scroll(2000); assert.equal(ty(phone.part('vatm-far')), 0);
  const calm = page({ reduce: true }); calm.scroll(2000);
  assert.equal(ty(calm.part('vatm-far')), 0); assert.ok(calm.lo.className.includes('still'));
  assert.match(calm.style, /prefers-reduced-motion:reduce\)\{[^}]*\.vatm-grain[^}]*animation:none/);
  // Bryan, 19 Nov 2026: "make the background drift on my tablet too".
  const tablet = page({ width: 821, height: 1316 }); tablet.scroll(2000);
  assert.equal(ty(tablet.part('vatm-far')), -2000 * A.HOUSE.far.s); assert.ok(!tablet.lo.className.includes('still'));
  assert.ok(!SRC.includes('pointer: coarse'), 'a touch screen is not a reason to stand still');
});

test('it keeps moving while a video plays, and nothing in it makes the page slow to scroll', () => {
  // The old layer returned at once while the player played, so the home page's pictures rode up with the rows.
  assert.ok(!/function frame\(\)\s*\{[^}]*vpx/.test(SRC), 'the scroll frame does not look at the player');
  assert.match(SRC, /html\.vp-playing \.vatm-grain\{display:none\}/, 'only the grain and the drift rest');
  const frame = /function frame\(\) \{([\s\S]*?)\n  \}/.exec(SRC)[1];
  for (const bad of ['scrollHeight', 'getBoundingClientRect', 'querySelector', 'offsetHeight', 'setProperty']) assert.ok(!frame.includes(bad), 'the scroll frame reads no layout: ' + bad);
  assert.match(SRC, /addEventListener\('scroll', onScroll, \{ passive: true \}\)/);
  assert.ok(!/\(function loop\(\)/.test(SRC), 'no loop that runs while nothing moves');
  assert.ok(!SRC.includes('filter:blur'), 'no live blur');
});

test('every area loads this one file, and none keeps a copy of its own', () => {
  // The main site: before its own script, never on kids, a sister site from voidtv.net.
  const app = read('scripts/lib/app.js');
  assert.match(app, /const atmosScript = PROFILE\.name === 'kids' \|\| mode === 'embed' \? '' : `<script src="\$\{PROFILE\.name === 'voidtv' \? base : 'https:\/\/voidtv\.net\/'\}assets\/brand\/atmos\/atmos\.js\?v=/);
  assert.ok(app.includes('<main id="main"></main>${atmosScript}'));
  assert.ok(app.includes("function atmosView(){") && app.includes('atmosView();'), 'each view asks for its picture');
  for (const old of ['class="atmos', '.bgimg', '.column', '.dust', '.grain{', 'function column()', "html:has(.vpx"]) assert.ok(!app.includes(old), 'the main site still has ' + old);
  assert.match(app, /html\.vp-playing header,[^{]*\{backdrop-filter:none!important/, 'the blurs rest while the player plays, by one class and named elements');
  assert.match(app, /footer\{position:relative;z-index:1;/, 'the footer sits over the background, not under it');
  // PLAY and Trivia.
  assert.ok(read('play/index.html').includes('<script src="/assets/brand/atmos/atmos.js" data-far="voidarcade-wall.webp,voidarcade-player.webp"></script>'));
  assert.ok(read('trivia/index.html').includes('<script src="/assets/brand/atmos/atmos.js" data-far="trivianight.webp" data-fit="cover" data-strength="0.8"></script>'));
  assert.ok(read('trivia/phone.html').includes('<script src="/assets/brand/atmos/atmos.js" data-far="factsnight.webp" data-fit="cover" data-strength="0.8"></script>'));
  assert.ok(!fs.existsSync(path.join(REPO, 'trivia/src/atmos.js')));
  for (const f of ['play/index.html', 'play/shelf.css', 'play/src/shelf.js', 'trivia/index.html', 'trivia/phone.html', 'trivia/trivia.css'])
    for (const old of ['class="atmos', '.bgimg', '.column i', '.column .', "className = 'column'", '.grain', 'requestAnimationFrame(loop)']) assert.ok(!read(f).includes(old), f + ' still has ' + old);
  // University: from voidtv.net, as it loads the menu, with its own pictures; only in the bright look.
  const uni = read('profiles/university/build.js');
  assert.ok(uni.includes('<script src="https://voidtv.net/assets/brand/atmos/atmos.js?v=') && uni.includes('defer data-base="img/bg/"'));
  assert.ok(uni.includes('html:not([data-look="bright"]) .vatm{display:none}'));
  for (const old of ['.bgimg', '.column', '.dust', '.grain', '__par']) assert.ok(!uni.includes(old), 'University still has ' + old);
  // The page's version of the file is the file's own hash, so a change reaches a browser at once.
  const v = require('../scripts/lib/areas-v');
  assert.match(v('atmos/atmos.js'), /^[0-9a-f]{10}$/); assert.notEqual(v('atmos/atmos.js'), v());
  assert.ok(read('scripts/site.js').includes("require('./lib/areas-v')('atmos/atmos.js')"), 'PLAY\'s page is stamped at build time');
});
