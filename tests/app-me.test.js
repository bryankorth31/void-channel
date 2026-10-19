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
    const ss = new Map([['voidtv:tab', id]]);
    const calls = { render: 0, acts: 0 };
    const ctx = {
      localStorage, sessionStorage: { getItem: (k) => (ss.has(k) ? ss.get(k) : null), setItem: (k, v) => ss.set(k, v) },
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
  assert.equal(after.ME.history.show1.tab, 'tab-B', 'the record says which tab wrote the position');
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
  assert.deepEqual(plain(site.stored().history.s), { se: 0, e: 4, at: 5000, pos: 0, tab: 'tab-A' }, 'B\'s record is older, so A\'s stays');
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
  assert.equal(site.stored().history.s.tab, 'tab-live');
  assert.equal(stale.ME.history.s.pos, 900, 'and the stale tab now knows it');
  stale.setVP({ _cur: { slug: 's', se: 1, e: 2 }, v: { paused: false } });
  stale.ME.history.s.pos = 950; stale.ME.history.s.at = Date.now(); stale.save();
  assert.equal(site.stored().history.s.pos, 950, 'once the stale tab really plays that episode it may write the position');
  assert.equal(site.stored().history.s.tab, 'tab-stale');
});

test('old per-show keys are moved into history and the move is saved at once (it used to be lost unless something else saved)', () => {
  const site = makeSite({ 'voidtv:old-show': JSON.stringify({ se: 2, e: 4 }), 'voidtv:vol': '0.5', 'voidtv:sid': '{}' });
  const t = site.open('tab-A');
  assert.equal(site.m.has('voidtv:old-show'), false, 'the old key is gone');
  assert.equal(site.m.get('voidtv:vol'), '0.5', 'the player\'s own keys are left alone');
  assert.deepEqual(plain(site.stored().history['old-show']), { se: 2, e: 4, at: 0, pos: 0, tab: 'tab-A' });
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
  const out = meApply(stored, ops, { tab: 'T', now: 10 });
  assert.equal(out.list.s, 900);
  assert.equal(out.reports['a/1/2'].name, 'newer');
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
