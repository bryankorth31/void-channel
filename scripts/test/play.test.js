// Play and Learn (PLAN-kids-play P3, P4): the engine rules, the content packs, and the mission lines the page must keep.
// Run: node --test scripts/test/play.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const P = require('../lib/play/core');
const { PACKS, WORDS } = require('../lib/play/packs');
const { ART } = require('../lib/play/art');
const { allLines, page, buildPlay } = require('../lib/play/build');

test('every pack is well formed: unique ids, known pictures, sorts and traces that point at real things', () => {
  const ids = new Set();
  for (const p of PACKS) {
    assert.ok(!ids.has(p.id), 'pack id twice: ' + p.id); ids.add(p.id);
    assert.ok(p.items.length >= 3, p.id + ' needs at least 3 items for Listen and tap');
    const items = new Set(p.items.map((x) => x.id));
    assert.strictEqual(items.size, p.items.length, p.id + ': item ids repeat');
    for (const it of p.items) {
      for (const look of [it.show, it.pair]) { assert.ok(look.text || look.dots || look.art, p.id + '/' + it.id + ': nothing to draw'); if (look.art) assert.ok(ART[look.art], 'no art for ' + look.art); }
      for (const k of ['name', 'ask', 'yes']) assert.ok(it[k] && it[k].trim(), p.id + '/' + it.id + ': no ' + k);
    }
    for (const s of p.sorts) {
      assert.strictEqual(s.bins.length, 2);
      for (const b of s.bins) if (b.art) assert.ok(ART[b.art], 'no art for bin ' + b.art);
      for (const [id, bin] of Object.entries(s.items)) { assert.ok(items.has(id), p.id + ' sort names unknown item ' + id); assert.ok(bin === 0 || bin === 1); }
      for (const b of [0, 1]) assert.ok(Object.values(s.items).filter((x) => x === b).length >= 2, p.id + ': each bin needs 2 or more things');
    }
    for (const t of p.trace) { assert.ok(t.strokes.length); for (const s of t.strokes) { const pts = P.strokePoints(s); assert.ok(pts.length > 5); for (const [x, y] of pts) assert.ok(x >= 0 && x <= 100 && y >= 0 && y <= 100, t.id + ' leaves the box'); } }
  }
});

test('every game has packs to play with', () => {
  for (const g of ['listen', 'match', 'sort', 'trace']) assert.ok(P.packsFor(PACKS, g).length >= 3, g);
});

test('Listen and tap: three different choices, the answer among them, no answer twice in a set', () => {
  for (const p of PACKS) for (let seed = 1; seed < 40; seed++) {
    const set = P.listenSet(p, P.SET_SIZE.listen, P.rng(seed));
    assert.strictEqual(new Set(set.map((r) => r.answer)).size, set.length);
    for (const r of set) { assert.strictEqual(r.choices.length, 3); assert.strictEqual(new Set(r.choices).size, 3); assert.ok(r.choices.includes(r.answer)); }
  }
});

test('Match pairs: each item exactly twice, one of each face; only the two cards of one item match', () => {
  for (const p of PACKS) {
    const b = P.board(p, p.pairs || 3, P.rng(7));
    assert.strictEqual(b.length, (p.pairs || 3) * 2);
    const by = {}; for (const c of b) (by[c.item] = by[c.item] || []).push(c);
    for (const cs of Object.values(by)) { assert.strictEqual(cs.length, 2); assert.ok(P.isMatch(cs[0], cs[1])); assert.ok(!P.isMatch(cs[0], cs[0])); }
    const [x, y] = Object.values(by); assert.ok(!P.isMatch(x[0], y[0]));
  }
});

test('Sort it: both bins come up, and every answer agrees with the pack', () => {
  for (const p of P.packsFor(PACKS, 'sort')) for (let seed = 1; seed < 30; seed++) {
    const S = P.sortSet(p, P.SET_SIZE.sort, P.rng(seed)), s = p.sorts[S.sort];
    assert.strictEqual(S.queue.length, P.SET_SIZE.sort);
    assert.deepStrictEqual(new Set(S.queue.map((q) => q.bin)), new Set([0, 1]));
    for (const q of S.queue) assert.strictEqual(q.bin, s.items[q.item]);
  }
});

test('Trace: following the line finishes the shape; starting away from the dot or scribbling does not', () => {
  const def = PACKS.find((p) => p.id === 'letters').trace.find((t) => t.id === 't-A');
  const st = P.traceStart(def);
  for (const S of st.strokes.slice()) { const [x0, y0] = S[0]; P.traceDown(st, x0 + 3, y0 + 2); assert.ok(st.on); for (const [x, y] of S) P.traceMove(st, x + 4, y - 3); P.traceUp(st); }
  assert.ok(st.done);
  const far = P.traceStart(def); P.traceDown(far, 90, 90); assert.ok(!far.on);
  const scrib = P.traceStart(def); P.traceDown(scrib, 50, 10); for (let i = 0; i < 200; i++) P.traceMove(scrib, (i * 37) % 100, (i * 53) % 100); assert.ok(!scrib.done);
  const circle = P.traceStart(PACKS.find((p) => p.id === 'shapes').trace[0]); P.traceDown(circle, 50, 18); for (const [x, y] of circle.strokes[0]) P.traceMove(circle, x, y); assert.ok(circle.done);
});

test('gentle stopping after a few sets, and nothing in the page counts points or keeps anything', () => {
  assert.ok(!P.shouldRest(P.SETS_BEFORE_REST - 1)); assert.ok(P.shouldRest(P.SETS_BEFORE_REST));
  assert.strictEqual(WORDS.allDone, 'All done for now. Time to go play!');
  const ui = fs.readFileSync(path.join(__dirname, '..', 'lib', 'play', 'ui.js'), 'utf8');
  for (const bad of ['localStorage', 'sessionStorage', 'indexedDB', 'document.cookie', 'fetch(', 'XMLHttpRequest', 'sendBeacon', 'http://', 'https://']) assert.ok(!ui.includes(bad), 'ui.js uses ' + bad);
  const words = JSON.stringify([PACKS, WORDS]).toLowerCase();
  for (const bad of ['coin', 'ticket', 'prize', 'streak', 'score', 'earn', 'level up', 'reward', 'hurry']) assert.ok(!new RegExp('\\b' + bad + '\\b').test(words), 'reward-loop word in the content: ' + bad);
  assert.ok(!/\u2014/.test(words), 'no em dashes');
});

test('every spoken line has a key, and the page carries only the clips it has', () => {
  const lines = allLines();
  assert.ok(Object.keys(lines).length > 150);
  for (const [k, t] of Object.entries(lines)) assert.strictEqual(P.voiceKey(t), k);
  const html = page({ siteName: 'voidtv.net kids', voice: {}, preview: false });
  assert.ok(!/<\/script>[\s\S]*<\/script>/.test(html.replace(/<script>/, '')), 'one script block, nothing closes it early');
  assert.ok(!/https?:\/\//.test(html), 'no addresses off the site');
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'play-')), cat = fs.mkdtempSync(path.join(os.tmpdir(), 'playcat-'));
  const k = Object.keys(lines)[0]; fs.mkdirSync(path.join(cat, 'play-voice')); fs.writeFileSync(path.join(cat, 'play-voice', k + '.mp3'), 'x'); fs.writeFileSync(path.join(cat, 'play-voice', 'unused.mp3'), 'x');
  const r = buildPlay({ out, catalogDir: cat, siteName: 'voidtv.net kids', preview: true });
  assert.strictEqual(r.clips, 1);
  assert.deepStrictEqual(fs.readdirSync(path.join(out, 'assets', 'kids', 'play-voice')), [k + '.mp3']);
  assert.ok(fs.readFileSync(path.join(out, 'play', 'index.html'), 'utf8').includes('noindex'));
  fs.rmSync(out, { recursive: true, force: true }); fs.rmSync(cat, { recursive: true, force: true });
});
