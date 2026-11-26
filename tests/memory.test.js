// The voidverse's one memory block (assets/brand/memory/memory.js; voidverse plan M1, decision H16).
// Bryan, 25 Nov 2026: "Yes, your picks" in the voidverse plan chat (M1), then "Yes, start it" and "Yes, voidtv:" in the Void TV owner chat.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const SRC = read('assets/brand/memory/memory.js');
const store = (init) => { const m = new Map(Object.entries(init || {})); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, has: (k) => m.has(k) }; };
function load(local, session) {
  const window = {}, localStorage = store(local), sessionStorage = store(session);
  vm.runInNewContext(SRC, { window, localStorage, sessionStorage });
  return { M: window.VoidMemory, localStorage, sessionStorage };
}

test('H16: one prefix and one list; every line says where, which room and why, and a name is either under the prefix or marked fixed', () => {
  const { M } = load();
  assert.equal(M.prefix, 'voidtv:');
  const keys = new Set();
  for (const e of Array.from(M.kept)) {
    assert.ok(!keys.has(e.key), e.key + ' is listed once'); keys.add(e.key);
    assert.ok(e.where === 'local' || e.where === 'session', e.key + ': where');
    assert.ok(e.room && e.why && e.why.length > 20, e.key + ': room and why');
    assert.ok(e.key.startsWith('voidtv:') || e.fixed, e.key + ': under the one prefix, or kept by its old name on purpose');
    assert.ok(!(e.fixed && e.was), e.key + ': a fixed name is not a renamed one');
    assert.doesNotMatch(e.why, /\u2014|\u2013/, e.key + ': no dashes');
  }
  // the names other rooms and older pages read are never changed
  for (const k of ['voidtv:me', 'voidtv:sid', 'voidtv:vol', 'voidtv:chan', 'voidtv:enjoy', 'voidtv-remote-room', 'voidtv-party']) assert.ok(Array.from(M.kept).find((e) => e.key === k && e.fixed), k + ' stays as named');
  // nothing of PLAY's is listed until PLAY's own chat adds it: its saves are never renamed from here
  assert.equal(Array.from(M.kept).filter((e) => /play|pad|cheat/.test(e.key)).length, 0);
});

test('H16: an old name is carried over on the first read and left where it is; a key that is not on the list is not read or written', () => {
  const a = load({ void_nocount: '1', 'va-turn': '41', stray: 'x' });
  assert.equal(a.M.get('voidtv:nocount'), '1');
  assert.equal(a.localStorage.getItem('voidtv:nocount'), '1', 'copied to the new name');
  assert.equal(a.localStorage.getItem('void_nocount'), '1', 'the old one is left for a page still open in another tab');
  assert.equal(a.M.get('voidtv:menu-turn'), '41');
  a.M.set('voidtv:nocount', '0');
  assert.equal(a.M.get('voidtv:nocount'), '0', 'once the new name holds a value, the old one is not read again');
  assert.equal(a.M.get('stray'), null);
  assert.equal(a.M.set('stray', 'y'), false);
  assert.equal(a.localStorage.getItem('stray'), 'x');
  a.M.remove('voidtv:nocount');
  assert.ok(!a.localStorage.has('voidtv:nocount') && !a.localStorage.has('void_nocount'), 'remove clears both, or the old value would come back');
  // tab-only keys go to the tab's own store
  const b = load({}, { 'voidtv-party': 'r1' });
  assert.equal(b.M.get('voidtv-party'), 'r1');
  b.M.set('voidtv-remote-room', 'abcd');
  assert.equal(b.sessionStorage.getItem('voidtv-remote-room'), 'abcd');
  assert.equal(b.localStorage.getItem('voidtv-remote-room'), null);
  // a browser that refuses storage does not break the page
  const window = {};
  vm.runInNewContext(SRC, { window, localStorage: { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); }, removeItem() { throw new Error('no'); } }, sessionStorage: {} });
  assert.equal(window.VoidMemory.get('voidtv:chan'), null);
  assert.equal(window.VoidMemory.set('voidtv:chan', 'x'), false);
});

test('H16: voidtv.net\'s own page and the menu file keep nothing that is not on the list', () => {
  const { M } = load();
  const listed = new Set(Array.from(M.kept, (e) => e.key));
  const old = new Set(Array.from(M.kept, (e) => e.was).filter(Boolean));
  for (const f of ['scripts/lib/app.js', 'assets/brand/areas/areas.js']) {
    const src = read(f);
    for (const m of src.matchAll(/(?:localStorage|sessionStorage)\.(?:getItem|setItem|removeItem)\('([^']+)'/g)) assert.ok(listed.has(m[1]) || old.has(m[1]), f + ' keeps ' + m[1] + ', which is not on the list');
    for (const m of src.matchAll(/(?:MEM|M)\.(?:get|set|remove)\('([^']+)'/g)) assert.ok(listed.has(m[1]), f + ' asks the block for ' + m[1] + ', which is not on the list');
  }
  const app = read('scripts/lib/app.js');
  for (const k of ['voidtv:me', 'voidtv:sid', 'voidtv:vol', 'voidtv:chan', 'voidtv:enjoy']) assert.ok(app.includes("'" + k + "'"), k);
  assert.doesNotMatch(app, /Item\('void_(nocount|inst_x)'/, 'the two odd names are written no more');
  assert.match(app, /const memoryScript = PROFILE\.name === 'voidtv' && mode !== 'embed' \?/, 'the block loads on voidtv.net\'s own page, before the page\'s script; never on Kids');
  assert.match(app, /const indexScript = memoryScript \+ momentsScript \+ areasScript/);
  assert.match(app, /const MEM=window\.VoidMemory\|\|\{get:/, 'a page without the block still works');
});
