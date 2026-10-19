// "Mine" saving and importing (audit SP-012). Run: node --test tests/app-me.test.js
// Two parts. (1) The real page code for saving: the block of scripts/lib/app.js from `const ME_KEY` to the first `meSync();`
// is cut out of the source and run inside a bare vm context with a fake localStorage that two "tabs" share, with storage
// events delivered like a browser does. So these tests exercise the code that ships, not a copy. (2) The pure merge and import
// functions (scripts/lib/app-me.js) on their own. No network, no browser.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { meApply, meDiff, meClean, meImportMerge, meSource } = require('../scripts/lib/app-me');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'lib', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const a0 = SRC.indexOf("const ME_KEY='voidtv:me';");
const a1 = SRC.indexOf('\nmeSync();', a0) + '\nmeSync();'.length;
assert.ok(a0 > 0 && a1 > a0, 'the saving block is where this test expects it');
const BLOCK = 'let VP=null;\n' + SRC.slice(a0, a1).replace('${ME_SRC}', meSource);
const plain = (x) => JSON.parse(JSON.stringify(x));

// One shared "disk" (localStorage of one site) and any number of tabs on it.
function makeSite(initial) {
  const m = new Map(Object.entries(initial || {}));
  const site = { m, tabs: [], deliver: true, failWrites: 0, unreadable: false };
  site.open = (id) => {
    const handlers = { storage: [], visibilitychange: [] };
    const owner = { handlers };
    const localStorage = {
      get length() { return m.size; },
      key: (i) => [...m.keys()][i] ?? null,
      getItem: (k) => { if (site.unreadable) throw new Error('blocked'); return m.has(k) ? m.get(k) : null; },
      setItem: (k, v) => { if (site.failWrites > 0) { site.failWrites--; throw new Error('quota'); } m.set(k, String(v)); if (site.deliver) for (const t of site.tabs) if (t !== owner) for (const f of t.handlers.storage) f({ key: k }); },
      removeItem: (k) => { m.delete(k); },
    };
    const calls = { render: 0, acts: 0 };
    // No sessionStorage and no crypto in the fake page: the saving code must not need either (nothing may identify a tab).
    const ctx = {
      localStorage,
      window: { addEventListener: (t, f) => handlers[t].push(f) }, document: { hidden: false, addEventListener: (t, f) => handlers[t].push(f), querySelectorAll: () => [] },
      state: { view: '', show: null }, render: () => { calls.render++; }, acts: () => '',
    };
    vm.createContext(ctx);
    vm.runInContext(BLOCK + '\n;globalThis.__t = { ME, saveMe, meSync, setVP: (v) => { VP = v; } };', ctx);
    owner.id = id; owner.ctx = ctx; owner.calls = calls;
    owner.ME = ctx.__t.ME; owner.save = ctx.__t.saveMe; owner.sync = ctx.__t.meSync; owner.setVP = ctx.__t.setVP;
    site.tabs.push(owner);
    return owner;
  };
  site.stored = () => JSON.parse(m.get('voidtv:me') || 'null');
  return site;
}

test('the audit repro: a tab loaded earlier that only plays does not erase a like saved in another tab (events off, as in a frozen tab)', () => {
  const site = makeSite();
  site.deliver = false;
  const playing = site.open('tab-B');
  const other = site.open('tab-A');
  other.ME.likes.show1 = 1; other.ME.list.show2 = 5000; other.save();
  playing.ME.history.show1 = { se: 0, e: 0, at: 10000, pos: 0 }; playing.save();
  for (let s = 1; s <= 3; s++) { playing.ME.history.show1.pos = s * 5; playing.ME.history.show1.at = 10000 + s * 5000; playing.save(); }
  const after = site.open('tab-C');
  assert.equal(after.ME.likes.show1, 1, 'the like survives');
  assert.equal(after.ME.list.show2, 5000, 'the list entry survives');
  assert.equal(after.ME.history.show1.pos, 15);
  assert.deepEqual(plain(after.ME.history.show1), { se: 0, e: 0, at: 25000, pos: 15 }, 'the record is the plain old shape, nothing about the tab');
  assert.equal(playing.ME.likes.show1, 1, 'the playing tab picked the like up on its first save');
});

test('with storage events delivered, an idle tab sees the other tab\'s save at once and the page is told what to redraw', () => {
  const site = makeSite();
  const b = site.open('tab-B');
  const a = site.open('tab-A');
  a.ME.likes.s = 1; a.save();
  assert.equal(b.ME.likes.s, 1, 'no reload needed');
  b.ctx.state.view = 'me';
  a.ME.list.t = 7000; a.save();
  assert.equal(b.ME.list.t, 7000);
  assert.equal(b.calls.render, 1, 'the Mine page is redrawn when another tab changes it');
});

test('a removal in one tab is not brought back by another tab\'s later save', () => {
  const site = makeSite({ 'voidtv:me': JSON.stringify({ v: 1, list: { s1: 100, s2: 200 }, likes: {}, history: {}, reports: {} }) });
  site.deliver = false;
  const a = site.open('tab-A');
  const b = site.open('tab-B');
  delete b.ME.list.s1; b.save();
  assert.deepEqual(Object.keys(site.stored().list), ['s2']);
  a.ME.list.s3 = 300; a.save();
  assert.deepEqual(Object.keys(site.stored().list).sort(), ['s2', 's3'], 'tab A still held s1 but did not change it, so it does not write it back');
  assert.deepEqual(Object.keys(a.ME.list).sort(), ['s2', 's3'], 'and its own view caught up');
});

test('a removal does not delete a value another tab changed in the meantime', () => {
  const site = makeSite({ 'voidtv:me': JSON.stringify({ v: 1, list: { s1: 100 }, likes: {}, history: {}, reports: {} }) });
  site.deliver = false;
  const a = site.open('tab-A');
  const b = site.open('tab-B');
  b.ME.list.s1 = 900; b.save();
  delete a.ME.list.s1; a.save();
  assert.equal(site.stored().list.s1, 900);
});

test('the same show changed in both tabs: the newest history record wins, with one tab\'s position and the other\'s episode never mixed', () => {
  const site = makeSite({ 'voidtv:me': JSON.stringify({ v: 1, list: {}, likes: {}, history: { s: { se: 0, e: 0, at: 1000, pos: 10 } }, reports: {} }) });
  site.deliver = false;
  const a = site.open('tab-A');
  const b = site.open('tab-B');
  a.ME.history.s = { se: 0, e: 4, at: 5000, pos: 0 }; a.save();
  b.ME.history.s = { se: 0, e: 2, at: 4000, pos: 99 }; b.save();
  assert.deepEqual(plain(site.stored().history.s), { se: 0, e: 4, at: 5000, pos: 0 }, 'B\'s record is older, so A\'s stays');
  assert.deepEqual(plain(b.ME.history.s), plain(site.stored().history.s));
});

test('a tab that has not started playing does not overwrite the position of a tab that is playing the same episode right now', () => {
  const now = Date.now();
  const site = makeSite({ 'voidtv:me': JSON.stringify({ v: 1, list: {}, likes: {}, history: { s: { se: 1, e: 2, at: now - 60000, pos: 100 } }, reports: {} }) });
  site.deliver = false;
  const stale = site.open('tab-stale');
  const live = site.open('tab-live');
  live.ME.history.s.pos = 900; live.ME.history.s.at = now - 2000; live.save();
  stale.ME.history.s = { se: 1, e: 2, at: now, pos: 100 };
  stale.save();
  assert.equal(site.stored().history.s.pos, 900, 'the playing tab\'s position stays');
  assert.equal(stale.ME.history.s.pos, 900, 'and the stale tab now knows it');
  stale.setVP({ _cur: { slug: 's', se: 1, e: 2 }, v: { paused: false } });
  stale.ME.history.s.pos = 950; stale.ME.history.s.at = Date.now(); stale.save();
  assert.equal(site.stored().history.s.pos, 950, 'once the stale tab really plays that episode it may write the position');
});

test('a tab\'s own earlier write is not mistaken for another tab\'s: it can change its own record again within seconds', () => {
  const now = Date.now();
  const site = makeSite({ 'voidtv:me': JSON.stringify({ v: 1, list: {}, likes: {}, history: { s: { se: 1, e: 2, at: now - 60000, pos: 100 } }, reports: {} }) });
  site.deliver = false;
  const a = site.open('tab-A');
  const b = site.open('tab-B');
  a.ME.history.s.pos = 300; a.ME.history.s.at = now - 3000; a.save();
  b.ME.history.s = { se: 1, e: 2, at: now - 2000, pos: 100 };                // the other tab, stale, not playing: held back by the live rule
  b.save();
  assert.equal(site.stored().history.s.pos, 300, 'B did not overwrite the position A wrote 3 s ago');
  a.ME.history.s = { se: 1, e: 2, at: now - 1000, pos: 310 };                // A, paused, presses play on the same episode: its own record, so it goes through
  a.save();
  assert.equal(site.stored().history.s.pos, 310, 'A may change what A wrote, however recent');
});

test('nothing identifies a tab: no id in storage, in the blob, in the records or in an export, and the saving code uses no session storage or random id', () => {
  assert.ok(!/sessionStorage|randomUUID|Math\.random|crypto/.test(BLOCK), 'the saving code never asks for an id');
  const site = makeSite();
  site.deliver = false;
  const a = site.open('tab-A');
  const b = site.open('tab-B');
  a.ME.history.s = { se: 0, e: 1, at: Date.now() - 500, pos: 5 }; a.ME.likes.s = 1; a.save();
  b.ME.history.t = { se: 2, e: 0, at: Date.now(), pos: 0 }; b.save();
  a.ME.history.s.pos = 9; a.ME.history.s.at = Date.now(); a.save();
  assert.deepEqual([...site.m.keys()], ['voidtv:me'], 'the only thing written to storage is the blob');
  const text = JSON.stringify(site.stored());
  assert.ok(!/"tab"/.test(text) && !/tab-[AB]/.test(text), 'no tab field and no tab name in the stored blob');
  const exported = JSON.parse(JSON.stringify(b.ME));                          // what exportMe writes: JSON.stringify(ME)
  assert.deepEqual(Object.keys(exported).sort(), ['history', 'likes', 'list', 'reports', 'v']);
  for (const rec of Object.values(exported.history)) assert.deepEqual(Object.keys(rec).sort(), ['at', 'e', 'pos', 'se'], 'a history record is se, e, at, pos and nothing else');
});

test('the format of a stored blob from before this change loads as it is: nothing is written at start, a leftover tab field is dropped on the next save', () => {
  const old = { v: 1, list: { a: 5 }, likes: { a: 1 }, history: { s: { se: 0, e: 0, at: 100, pos: 7 }, t: { se: 1, e: 1, at: 200, pos: 0, tab: 'old-id' } }, reports: { 'a/1/1': { show: 'A', season: 1, ep: 1, name: 'n', item: 'i', url: 'u', at: 3 } }, adult: 99 };
  const text = JSON.stringify(old);
  const site = makeSite({ 'voidtv:me': text });
  const t = site.open('tab-A');
  assert.equal(site.m.get('voidtv:me'), text, 'loading and the start-up sync write nothing');
  assert.deepEqual(plain(t.ME.history.s), old.history.s);
  assert.deepEqual(plain(t.ME.list), old.list);
  assert.equal(t.ME.adult, 99);
  assert.equal('tab' in t.ME.history.t, false, 'a leftover tab field is not kept in memory');
  t.ME.likes.b = 1; t.save();
  assert.equal(JSON.stringify(site.stored()).includes('old-id'), false, 'and is gone from storage once the tab saves');
  assert.deepEqual(plain(site.stored().history.s), old.history.s);
  assert.deepEqual(plain(site.stored().reports), old.reports);
});

test('old per-show keys are moved into history and the move is saved at once (it used to be lost unless something else saved)', () => {
  const site = makeSite({ 'voidtv:old-show': JSON.stringify({ se: 2, e: 4 }), 'voidtv:vol': '0.5', 'voidtv:sid': '{}' });
  const t = site.open('tab-A');
  assert.equal(site.m.has('voidtv:old-show'), false, 'the old key is gone');
  assert.equal(site.m.get('voidtv:vol'), '0.5', 'the player\'s own keys are left alone');
  assert.deepEqual(plain(site.stored().history['old-show']), { se: 2, e: 4, at: 0, pos: 0 });
  assert.deepEqual(plain(t.ME.history['old-show']), plain(site.stored().history['old-show']));
});

test('settings that another version of the page keeps in the blob are kept', () => {
  const site = makeSite({ 'voidtv:me': JSON.stringify({ v: 1, list: {}, likes: {}, history: {}, reports: {}, adult: 1234, future: { x: 1 } }) });
  const t = site.open('tab-A');
  t.ME.likes.s = 1; t.save();
  assert.equal(site.stored().adult, 1234);
  assert.deepEqual(plain(site.stored().future), { x: 1 });
  t.ME.adult = 0; t.save();
  assert.equal(site.stored().adult, 0);
});

test('storage that cannot be read or written never throws and never loses what the tab holds', () => {
  const site = makeSite();
  const t = site.open('tab-A');
  site.unreadable = true;
  t.ME.likes.s = 1;
  assert.doesNotThrow(() => t.save());
  assert.equal(t.ME.likes.s, 1);
  site.unreadable = false;
  site.failWrites = 1;
  t.ME.likes.u = 1;
  assert.doesNotThrow(() => t.save());
  assert.equal(t.ME.likes.u, 1);
  assert.equal(site.stored(), null, 'nothing was written yet');
  t.save();
  assert.deepEqual(plain(site.stored().likes), { s: 1, u: 1 }, 'the next save writes both');
});

test('a corrupt stored blob is replaced by the tab\'s own on the next save', () => {
  const site = makeSite({ 'voidtv:me': '{not json' });
  const t = site.open('tab-A');
  t.ME.likes.s = 1; t.save();
  assert.deepEqual(plain(site.stored().likes), { s: 1 });
});

test('meDiff names adds, edits and deletes in every section', () => {
  const base = { v: 1, list: { a: 1, b: 2 }, likes: { a: 1 }, history: {}, reports: {}, adult: 5 };
  const mine = { v: 1, list: { a: 1, c: 3 }, likes: { a: -1 }, history: { h: { se: 0, e: 0, at: 1, pos: 0 } }, reports: {} };
  const ops = meDiff(base, mine).map((o) => (o.del ? 'del ' : 'set ') + (o.s || 'top') + '.' + o.k).sort();
  assert.deepEqual(ops, ['del list.b', 'del top.adult', 'set history.h', 'set likes.a', 'set list.c']);
  assert.deepEqual(meDiff(mine, mine), []);
});

test('meApply: a clash on a report or a list entry goes to the newer one', () => {
  const stored = { v: 1, list: { s: 900 }, likes: {}, history: {}, reports: { 'a/1/2': { at: 500, name: 'newer' } } };
  const ops = [{ s: 'list', k: 's', set: 400, was: 100 }, { s: 'reports', k: 'a/1/2', set: { at: 300, name: 'older' }, was: { at: 100, name: 'x' } }];
  const out = meApply(stored, ops, { now: 10, wrote: {} });
  assert.equal(out.list.s, 900);
  assert.equal(out.reports['a/1/2'].name, 'newer');
});

test('meApply: the live rule needs only the in-memory record of what this tab wrote', () => {
  const stored = { v: 1, list: {}, likes: {}, reports: {}, history: { s: { se: 1, e: 2, at: 9000, pos: 500 } } };
  const ops = [{ s: 'history', k: 's', set: { se: 1, e: 2, at: 9500, pos: 10 }, was: { se: 1, e: 2, at: 1000, pos: 10 } }];
  const held = meApply(stored, ops, { now: 10000, wrote: {}, playing: () => false });
  assert.equal(held.history.s.pos, 500, 'a record from a few seconds ago that this tab did not write is another tab\'s and stays');
  const wrote = { s: 9000 };
  const own = meApply(stored, ops, { now: 10000, wrote, playing: () => false });
  assert.equal(own.history.s.pos, 10, 'the same record, when its time is the one this tab wrote, is this tab\'s own');
  assert.equal(wrote.s, 9500, 'and the tab notes the new time it wrote');
  const old = meApply(stored, ops, { now: 60000, wrote: {}, playing: () => false });
  assert.equal(old.history.s.pos, 10, 'a record older than 15 s is nobody\'s to protect: the newer time wins');
  const noMemory = meApply(stored, ops, { now: 10000 });
  assert.equal(noMemory.history.s.pos, 10, 'with no memory of writes given, only the newer time decides');
  assert.deepEqual(Object.keys(own.history.s).sort(), ['at', 'e', 'pos', 'se']);
});

// ---- import ----

const mine = () => ({ v: 1, list: {}, likes: {}, history: {}, reports: {} });
const rep = (slug, season, ep, at, extra) => Object.assign({ show: 'A Show', season, ep, name: 'Pilot', item: 'it', url: 'https://archive.org/download/it/f.mp4', at }, extra || {});

test('import: reported files are kept (their keys have slashes), and show, season and episode must be real numbers that match the key', () => {
  const me = mine();
  const n = meImportMerge(me, { v: 1, reports: {
    'a-show/1/2': rep('a-show', 1, 2, 100),
    'a-show/1/3': rep('a-show', '1<img src=x onerror=alert(1)>', 3, 100),
    'a-show/2/3': rep('a-show', 2, 4, 100),
    'a-show/x/3': rep('a-show', 'x', 3, 100),
    'a-show/1/4': rep('a-show', 1, 4, 'soon'),
    '../etc/passwd': rep('a-show', 1, 1, 1),
    'a-show/1': rep('a-show', 1, 1, 1),
  } });
  assert.deepEqual(Object.keys(me.reports), ['a-show/1/2']);
  assert.equal(n.reports, 1);
  assert.equal(n.skipped, 6);
  assert.equal(typeof me.reports['a-show/1/2'].season, 'number');
});

test('import: an older export never replaces newer history or a newer report, and a newer one does', () => {
  const me = mine();
  me.history.s = { se: 3, e: 1, at: 5000, pos: 700 };
  me.reports['s/1/1'] = rep('s', 1, 1, 5000, { name: 'local' });
  me.list.s = 5000;
  meImportMerge(me, { v: 1, history: { s: { se: 0, e: 0, at: 1000, pos: 1 }, t: { se: 1, e: 1, at: 2000, pos: 30.7 } }, reports: { 's/1/1': rep('s', 1, 1, 1000, { name: 'old' }) }, list: { s: 1000, t: 3000 } });
  assert.deepEqual(plain(me.history.s), { se: 3, e: 1, at: 5000, pos: 700 });
  assert.equal(me.history.t.pos, 30);
  assert.equal(me.reports['s/1/1'].name, 'local');
  assert.equal(me.list.s, 5000);
  assert.equal(me.list.t, 3000);
  meImportMerge(me, { v: 1, history: { s: { se: 4, e: 0, at: 9000, pos: 5 } }, reports: { 's/1/1': rep('s', 1, 1, 9000, { name: 'new' }) } });
  assert.equal(me.history.s.se, 4);
  assert.equal(me.reports['s/1/1'].name, 'new');
});

test('import: likes only fill gaps (they carry no time, so a choice made here is kept); bad values and keys are skipped; extra fields are dropped', () => {
  const me = mine();
  me.likes.kept = -1;
  const n = meImportMerge(me, { v: 1, likes: { kept: 1, fresh: 1, zero: 0, bad: 5, 'Bad Key': 1 }, list: { a: 'x', b: -3, c: 12 }, history: { h: { se: -1, e: 0, at: 1, pos: 0 }, ok: { se: 0, e: 0, at: 1, pos: 'x', evil: '<b>' } }, adult: 1 });
  assert.deepEqual(plain(me.likes), { kept: -1, fresh: 1, zero: 0 });
  assert.deepEqual(plain(me.list), { c: 12 });
  assert.deepEqual(plain(me.history), { ok: { se: 0, e: 0, at: 1, pos: 0 } });
  assert.equal(me.adult, undefined, 'the 18+ door is never imported');
  assert.ok(n.skipped >= 5);
});

test('import: a file that is not an export is refused, and nothing is changed', () => {
  const me = mine();
  assert.throws(() => meImportMerge(me, null));
  assert.throws(() => meImportMerge(me, { v: 2, list: { a: 1 } }));
  assert.throws(() => meImportMerge(me, []));
  assert.deepEqual(plain(me), plain(mine()));
  assert.deepEqual(plain(meClean({ v: 1, list: [], likes: 'x' })), plain(mine()), 'sections of the wrong kind become empty ones');
});

test('the inlined text has no line comment after code and no end-of-script tag (scripts/site.js refuses a page that does)', () => {
  const stripped = (l) => l.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g, '');
  const bad = meSource.split('\n').filter((l) => { const s = stripped(l); return !/^\s*\/\//.test(s) && /[^:]\/\//.test(s); });
  assert.deepEqual(bad, []);
  assert.ok(!/<\/script/i.test(meSource));
  assert.ok(!meSource.includes('\r'));
});
