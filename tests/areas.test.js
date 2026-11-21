// Every voidtv.net area in one list (assets/brand/areas/areas.js; Bryan, 20 Nov 2026, M1 + A1). Run: node --test tests/areas.test.js
// 1. The list: Void Cast is never in it; every area has its menu line and its card words; the copy keeps the house rules.
// 2. Where it loads: voidtv.net, PLAY, Trivia and University; never kids; University shows the menu with no card (Open Yale's terms).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const REPO = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8').replace(/\r\n/g, '\n');
const SRC = read('assets/brand/areas/areas.js');

function load(hostname, pathname) {
  const window = {};
  const ctx = { window, location: { hostname, pathname }, document: { currentScript: null, readyState: 'loading', addEventListener() {} },
    localStorage: { getItem() { return null; }, setItem() {} }, Math };
  vm.runInNewContext(SRC, ctx);
  return window.VoidAreas;
}

test('the list: no Void Cast, every live area complete, the house copy rules', () => {
  const A = load('voidtv.net', '/').areas;
  assert.ok(A.length >= 7);
  assert.doesNotMatch(SRC, /void-?cast|voidcast/i, 'Void Cast is Bryan\'s private viewer and is never listed');
  const ids = new Set();
  for (const a of A) {
    assert.ok(!ids.has(a.id), 'one line per area: ' + a.id); ids.add(a.id);
    for (const k of ['name', 'line', 'kicker', 'head', 'text', 'go', 'pic']) assert.ok(a[k], a.id + ' has ' + k);
    assert.ok(a.site === 'main' ? /^\//.test(a.path) : /^https:\/\/[a-z]+\.voidtv\.net\/$/.test(a.url), a.id + ' has an address');
    const words = [a.name, a.line, a.kicker, a.head, a.text, a.go].join(' ');
    assert.doesNotMatch(words, /—|–/, a.id + ': no em or en dashes');
    assert.doesNotMatch(words, /classic shows/i, a.id + ': never "classic shows"');
    assert.doesNotMatch(words, /VOIDtv|VoidTV|Void TV|Voidtv/, a.id + ': the name is voidtv.net');
  }
  for (const id of ['ondemand', 'live', 'play', 'trivia', 'university', 'kids', 'hindi']) assert.ok(A.find((a) => a.id === id && a.live), id + ' is listed and live');
});

test('where it loads: voidtv.net, PLAY, Trivia, University; never kids', () => {
  const APP = read('scripts/lib/app.js');
  assert.match(APP, /<span data-void-areas-menu><\/span>/);
  assert.match(APP, /PROFILE\.name === 'kids' \|\| mode === 'embed' \? '' : `<script src="[^`]*assets\/brand\/areas\/areas\.js/);
  assert.match(APP, /data-void-areas-ad/);
  for (const f of ['play/index.html', 'trivia/index.html']) {
    const h = read(f);
    assert.match(h, /<span data-void-areas-menu><\/span>/, f + ' has the menu');
    assert.match(h, /<script src="\/assets\/brand\/areas\/areas\.js(\?v=\d+)?" defer/, f + ' loads the list');   // Trivia's build stamps the version (A34)
  }
  const U = read('profiles/university/build.js');
  assert.match(U, /areas\.js\?v=\d+" defer data-site="university" data-here="university" data-ads="off"/, 'University: the menu, no card');
});

