// The back arrow and the remembered channel (Bryan, 23 Nov 2026: "fix the back arrow and channel memory").
// Found by the voidverse audit: the arrow icon was invisible on every page with "Browse", and the home page never
// reopened on the last channel because the old-key sweep removed voidtv:chan at every load.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const APP = fs.readFileSync(path.join(__dirname, '..', 'scripts/lib/app.js'), 'utf8');

test('the back button rule is scoped to the button, so it cannot reach the arrow icon inside it', () => {
  assert.ok(APP.includes('button.back{background:none;'), 'the back button keeps its plain look');
  assert.ok(!/(^|[}\n])\.back\{/.test(APP), 'no bare .back rule: it would also hit <i class="ico back"> and hide the arrow');
  assert.ok(APP.includes('<i class="ico back"></i> Browse'), 'the pages still draw the arrow icon');
});

function fakeStore(init) {
  const s = new Map(Object.entries(init));
  return {
    get length() { return s.size; },
    key(i) { return [...s.keys()][i] ?? null; },
    getItem(k) { return s.has(k) ? s.get(k) : null; },
    setItem(k, v) { s.set(k, String(v)); },
    removeItem(k) { s.delete(k); },
    has(k) { return s.has(k); },
  };
}

test('the old-key sweep moves only old per-show records and leaves every other voidtv: key alone', () => {
  const line = APP.split('\n').find((l) => l.includes("k.startsWith('voidtv:')"));
  assert.ok(line, 'the sweep line is in the page code');
  const sweep = new Function('localStorage', 'm', line);
  const store = fakeStore({
    'voidtv:me': '{}',
    'voidtv:chan': 'the-void-2',
    'voidtv:enjoy': '1763900000000',
    'voidtv:friends': '{"se":2,"e":5}',
    'voidtv:later-key': '"anything"',
    'other:key': 'x',
  });
  const m = { history: {} };
  sweep(store, m);
  assert.equal(store.getItem('voidtv:chan'), 'the-void-2', 'the last channel survives a page load');
  assert.equal(store.getItem('voidtv:enjoy'), '1763900000000');
  assert.ok(store.has('voidtv:later-key'), 'a key that is not an old record is never removed');
  assert.ok(store.has('other:key'));
  assert.ok(!store.has('voidtv:friends'), 'an old per-show record is removed');
  assert.deepEqual(m.history.friends, { se: 2, e: 5, at: 0, pos: 0 }, 'and moved into voidtv:me');
});

test('a numeric channel id is kept too (it parses as a number, not an old record)', () => {
  const line = APP.split('\n').find((l) => l.includes("k.startsWith('voidtv:')"));
  const sweep = new Function('localStorage', 'm', line);
  const store = fakeStore({ 'voidtv:chan2': '12' });
  sweep(store, { history: {} });
  assert.equal(store.getItem('voidtv:chan2'), '12');
});
