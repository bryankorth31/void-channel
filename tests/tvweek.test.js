// One Live TV lineup a week (B, 25 Oct 2026: new shows join Live TV once a week; a publish never moves a show mid-week).
// Run: node --test tests/tvweek.test.js
// Part 1: the week turns at 6:00 am on Monday. Part 2: episode picks follow the show's name, so a show added elsewhere moves nothing.
// Part 3: in a frozen week a show that left the site keeps its slots as breaks and nothing else moves. Part 4: two weeks in one plan,
// each viewer turning on their own Monday. Part 5: which week is frozen (scripts/lib/tvweek.js lineup) and the stored file.
// Part 6: the schedule check. Part 7: the same rules broken on purpose in a copy of the schedule code, to show these tests notice.
// Made-up shows only, in a fixed zone (UTC minus 6 hours, no daylight saving). No network, no files outside a temporary folder.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const T = require('../scripts/lib/tvgrid');
const TW = require('../scripts/lib/tvweek');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tvweek-test-'));
test.after(() => { fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); });
const H = 3600e3;
const OFF6 = () => -6 * H;
const at = (y, mo, d, h, mi) => Date.UTC(y, mo - 1, d, h + 6, mi || 0); // a local wall-clock moment (UTC minus 6) as an instant
const fresh = (src) => { const G = (src ? new Function('return ' + src)() : T.tvgridFactory()); G.setOff(OFF6); return G; };

// ---- a small plan, shaped like the one scripts/lib/app.js buildTv makes ----------------------------------------------------------------
let n = 0;
function mk(over) {
  n++;
  const o = Object.assign({ slug: 'show-' + n, type: 'Drama', tags: [], genres: ['Comedy'], rating: 7, runtime: 30, eps: 20, min: 22, seasons: 2 }, over);
  const per = Math.ceil(o.eps / o.seasons), seasons = [];
  for (let se = 1, left = o.eps; left > 0; se++) { const k = Math.min(per, left); seasons.push({ season: se, episodes: Array.from({ length: k }, (_, i) => ({ n: i + 1, min: o.min })) }); left -= k; }
  return Object.assign({}, o, { seasons });
}
// tv for a list of shows on one channel: rt, lib (episode runs), sl (the slugs), channels.
function plan(shows, fz) {
  const infos = shows.map((s) => T.showInfo(s));
  const rt = infos.map((x) => x.rt);
  const recs = shows.map((s, i) => Object.assign({ i, sl: s.slug }, infos[i]));
  const ch = T.planChannel({ id: 'test', name: 'Test', kind: 'all' }, recs, rt);
  return { v: 2, rt, lib: infos.map((x) => x.runs), sl: shows.map((s) => s.slug), sp: [], channels: [ch], fz: fz ? 1 : 0 };
}
const SHOWS = Array.from({ length: 24 }, (_, i) => mk({ rating: 5 + (i % 9) / 3, eps: 12 + (i % 7) * 9, min: 22 + (i % 2) * 22 }));
const slugsOf = (list) => list.map((s) => s.slug);
// Every airing of a week as "minute: slug SxE" (by name, so two plans laid on different show lists compare).
function week(G, tv, slugs, from) {
  const A = G.adopt(tv, slugs), out = [];
  for (const ch of A.channels) for (const a of G.airingsBetween(ch, A, from, from + 7 * 24 * H)) out.push(Math.round(a.st / 60000) + ': ' + (slugs[a.s] || 'GONE') + ' ' + a.se + 'x' + a.n);
  return out;
}
const MON19 = at(2026, 10, 19, 6, 0); // Monday 19 Oct 2026, 6:00 am

// ---- part 1: the week turns at 6:00 am on Monday ------------------------------------------------------------------------------------
test('the week turns at 6:00 am on Monday, local time: Sunday night and the small hours of Monday still belong to the old week', () => {
  const G = fresh(), wk = (ms) => G.weekOfDay(G.dayOf(ms));
  const w = wk(at(2026, 10, 19, 6, 0));
  assert.equal(wk(at(2026, 10, 19, 5, 59)), w - 1, 'Monday 5:59 am is the end of the week before');
  assert.equal(wk(at(2026, 10, 21, 20, 0)), w, 'Wednesday');
  assert.equal(wk(at(2026, 10, 25, 23, 0)), w, 'Sunday 11 pm');
  assert.equal(wk(at(2026, 10, 26, 5, 59)), w, 'the next Monday at 5:59 am');
  assert.equal(wk(at(2026, 10, 26, 6, 0)), w + 1, 'the next Monday at 6:00 am');
  assert.equal(TW.mondayOf(w), '2026-10-19');
  assert.equal(new Date(TW.mondayOf(w + 1) + 'T12:00:00Z').getUTCDay(), 1, 'mondayOf gives a Monday');
});

// ---- part 2: names, not places ---------------------------------------------------------------------------------------------------
test('a show added elsewhere in the list moves no airing of a frozen week: places shift, names do not', () => {
  const G = fresh(), tv = plan(SHOWS, true), slugs = slugsOf(SHOWS);
  const before = week(G, tv, slugs, MON19);
  const extra = mk({ slug: 'a-new-show' });
  const after = week(fresh(), tv, [extra.slug].concat(slugs).concat(['another-new-show']), MON19);
  assert.ok(before.length > 150, String(before.length));
  assert.deepEqual(after, before);
});

test('the same plan picks the same episodes whether it is laid on its own list or on a reordered one', () => {
  const tv = plan(SHOWS, true), slugs = slugsOf(SHOWS);
  assert.deepEqual(week(fresh(), tv, slugs.slice().reverse(), MON19), week(fresh(), tv, slugs, MON19));
});

// ---- part 3: a show that leaves mid-week keeps its slots as breaks ----------------------------------------------------------------
test('in a frozen week, a show that left the site keeps its slots (as breaks, filled from the start of the slot) and no other show moves', () => {
  const tv = plan(SHOWS, true), slugs = slugsOf(SHOWS), gone = SHOWS[3].slug;
  const before = week(fresh(), tv, slugs, MON19);
  assert.ok(before.some((x) => x.includes(' ' + gone + ' ')), 'the show airs this week');
  const left = slugs.filter((x) => x !== gone);
  const after = week(fresh(), tv, left, MON19);
  assert.equal(after.length, before.length, 'the same number of airings at the same minutes');
  for (let i = 0; i < before.length; i++) {
    if (before[i].includes(' ' + gone + ' ')) assert.match(after[i], /: GONE /, 'its slot is held');
    else assert.equal(after[i], before[i]);
  }
  const G = fresh(), A = G.adopt(tv, left), ch = A.channels[0];
  const held = G.airingsBetween(ch, A, MON19, MON19 + 24 * H).filter((a) => a.s >= left.length);
  assert.ok(held.length > 0);
  for (const a of held) { const br = G.breakOf(ch, A, a); assert.ok(br && br.at === a.st, 'the break starts with the slot'); }
});

test('outside a frozen week (a fresh plan) a show that is gone drops out of the pools, as before', () => {
  const tv = plan(SHOWS, false), gone = SHOWS[3].slug, left = slugsOf(SHOWS).filter((x) => x !== gone);
  const after = week(fresh(), tv, left, MON19);
  assert.ok(!after.some((x) => x.includes('GONE')));
});

test('a frozen channel whose shows have all left the site drops out', () => {
  const two = [mk({ slug: 'only-a' }), mk({ slug: 'only-b' })];
  const A = fresh().adopt(plan(two, true), ['something-else']);
  assert.equal(A.channels.length, 0);
});

// ---- part 4: two weeks in one plan ----------------------------------------------------------------------------------------------
test('two weeks in one plan: this week until 6:00 am Monday, next week from then, for each viewer on their own clock', () => {
  const G = fresh(), w = G.weekOfDay(G.dayOf(MON19));
  const a = [mk({ slug: 'this-week-show', eps: 60 })], b = [mk({ slug: 'next-week-show', eps: 60 })];
  const tv = Object.assign(plan(a, true), { w, nx: Object.assign(plan(b, false), { w: w + 1 }) });
  const slugs = ['this-week-show', 'next-week-show'];
  const A = G.adopt(tv, slugs), ch = A.channels[0];
  const who = (ms) => slugs[G.airingAt(ch, A, ms).s];
  assert.equal(who(at(2026, 10, 25, 21, 0)), 'this-week-show', 'Sunday 9 pm');
  assert.equal(who(at(2026, 10, 26, 5, 30)), 'this-week-show', 'Monday 5:30 am');
  assert.equal(who(at(2026, 10, 26, 6, 0)), 'next-week-show', 'Monday 6:00 am');
  assert.equal(who(at(2026, 10, 28, 20, 0)), 'next-week-show', 'Wednesday');
  // the guide across the turn: no hole, no overlap
  const air = G.airingsBetween(ch, A, at(2026, 10, 26, 3, 0), at(2026, 10, 26, 9, 0));
  for (let i = 1; i < air.length; i++) assert.equal(air[i].st, air[i - 1].en);
});

test('a plan with no next week (an older tv.json) plays this week on, as before', () => {
  const G = fresh(), A = G.adopt(plan(SHOWS, false), slugsOf(SHOWS));
  assert.ok(G.airingAt(A.channels[0], A, at(2026, 11, 4, 20, 0)));
});

// ---- part 5: which week is frozen, and the file ------------------------------------------------------------------------------------
const P1 = plan(SHOWS.slice(0, 12), false), P2 = plan(SHOWS.slice(12), false), P3 = plan(SHOWS.slice(6, 18), false);
const WED = Date.parse('2026-10-21T18:00:00Z'), MON_EARLY = Date.parse('2026-10-26T02:00:00Z'); // Wednesday; Monday 2 am UTC (Monday afternoon east of Asia)
test('lineup: with nothing stored, both weeks follow the catalog; the store keeps this week and next', () => {
  const L = TW.lineup(P1, null, WED), w = TW.weeksAt(WED).lo;
  assert.equal(L.week, w); assert.equal(L.monday, '2026-10-19'); assert.equal(L.nextMonday, '2026-10-26');
  assert.equal(L.curFrozen, false); assert.equal(L.tv.fz, 0); assert.equal(L.tv.nx.fz, 0);
  assert.equal(L.tv.w, w); assert.equal(L.tv.nx.w, w + 1);
  assert.deepEqual(Object.keys(L.store.weeks).map(Number), [w, w + 1]);
  assert.deepEqual(L.store.weeks[w].sl, P1.sl);
  assert.equal(L.store.weeks[w].nx, undefined, 'the stored plan carries no week fields');
});

test('lineup: a stored week is frozen whatever the catalog says; next week follows the catalog until its Monday has begun somewhere', () => {
  const w = TW.weeksAt(WED).lo;
  const L = TW.lineup(P3, { weeks: { [w]: P1, [w + 1]: P2 } }, WED);
  assert.equal(L.curFrozen, true); assert.deepEqual(L.tv.sl, P1.sl); assert.equal(L.tv.fz, 1);
  assert.equal(L.nextFrozen, false); assert.deepEqual(L.tv.nx.sl, P3.sl, 'next week is still the fresh plan on a Wednesday');
  assert.deepEqual(L.store.weeks[w + 1].sl, P3.sl);
  const M = TW.lineup(P3, { weeks: { [w]: P1, [w + 1]: P2 } }, MON_EARLY);
  assert.equal(TW.weeksAt(MON_EARLY).hi, w + 1, 'Monday has begun in the earliest zone');
  assert.equal(M.week, w, 'the latest zone is still in the old week');
  assert.equal(M.nextFrozen, true); assert.deepEqual(M.tv.nx.sl, P2.sl, 'once its Monday has begun, next week is the stored copy');
  assert.equal(M.tv.nx.fz, 1);
});

test('lineup: when a whole week went by with no publish, the build falls back to the fresh plan and says so', () => {
  const L = TW.lineup(P3, { weeks: { 2000: P1, 2001: P2 } }, WED);
  assert.equal(L.curFrozen, false); assert.deepEqual(L.tv.sl, P3.sl);
});

test('the file: one line per week, no raw "@" or "." (they read as an address to the publish check), and it reads back the same', () => {
  const p = Object.assign({}, P1, { ln: ['@@A.AA', '#$%'], channels: [Object.assign({}, P1.channels[0], { name: 'Mr. Show @ Night' })] });
  const store = { weeks: { 2965: P2, 2964: p } };
  const text = TW.serialize(store);
  assert.doesNotMatch(text, /[@.]/);
  assert.deepEqual(JSON.parse(text), store);
  const lines = text.trim().split('\n');
  assert.equal(lines.length, 4);
  assert.match(lines[1], /^"2964":/, 'weeks in order');
  const file = path.join(TMP, 'tv-lineup.json');
  assert.equal(TW.write(file, store), true, 'first write');
  assert.equal(TW.write(file, store), false, 'nothing changed, nothing written');
  assert.deepEqual(TW.read(file), store);
  assert.equal(TW.read(path.join(TMP, 'none.json')), null);
});

// ---- part 6: the schedule check --------------------------------------------------------------------------------------------------
test('checkTv: a frozen week that names a show the site no longer has is not a fault (its slots hold), and the message counts it', () => {
  const tv = plan(SHOWS, true), left = slugsOf(SHOWS).slice(1);
  const r = T.checkTv(tv, left, MON19);
  assert.notEqual(r.level, 'red', r.detail);
  assert.match(r.detail, /1 show left the site since the lineup was frozen, their slots hold as breaks until Monday/);
  const bad = T.checkTv(plan(SHOWS, false), left, MON19);
  assert.equal(bad.level, 'red', 'a fresh plan that names a missing show still is');
});

test('checkTv: next week is checked too', () => {
  const G = fresh(), w = G.weekOfDay(G.dayOf(MON19));
  const tv = Object.assign(plan(SHOWS, true), { w, nx: Object.assign(plan(SHOWS.slice(0, 20), false), { w: w + 1 }) });
  assert.notEqual(T.checkTv(tv, slugsOf(SHOWS), at(2026, 10, 26, 6, 0)).level, 'red');
  const broken = Object.assign({}, tv, { nx: Object.assign({}, tv.nx, { sl: tv.nx.sl.map((x, i) => (i === 0 ? 'not-in-the-build' : x)) }) });
  assert.equal(T.checkTv(broken, slugsOf(SHOWS), MON19).level, 'red', 'a fresh next week naming a missing show');
});

// ---- part 7: the deliberate-bug check ----------------------------------------------------------------------------------------------
// Each rule is broken in a copy of the schedule code; the check beside it must then fail, which shows the tests above would notice.
const SRC = T.source.slice(1, -3); // the factory function's own text
const BUGS = [
  ['the week turns on Sunday again', 'const weekOfDay = (bd) => Math.floor((bd + 3) / 7);', 'const weekOfDay = (bd) => Math.floor((bd + 4) / 7);',
    (G) => G.weekOfDay(G.dayOf(at(2026, 10, 25, 23, 0))) === G.weekOfDay(G.dayOf(at(2026, 10, 19, 6, 0)))],
  ['episodes follow the place, not the name', 'const keyOf = (lib, s) => (lib.key ?', 'const keyOf = (lib, s) => (false ?',
    (G) => { const tv = plan(SHOWS, true), slugs = slugsOf(SHOWS); return JSON.stringify(week(G, tv, ['x-new'].concat(slugs), MON19)) === JSON.stringify(week(fresh(), tv, slugs, MON19)); }],
  ['a gone show drops out of a frozen week', 'at[x] != null ? at[x] : t.fz ? extra++ : -1', 'at[x] != null ? at[x] : -1',
    (G) => { const tv = plan(SHOWS, true), slugs = slugsOf(SHOWS); return week(G, tv, slugs.slice(1), MON19).length === week(fresh(), tv, slugs, MON19).length; }],
  ['next week is never used', 'return lib.nx && lib.nw != null && w >= lib.nw && ch.nx ?', 'return false ?',
    (G) => { const w = G.weekOfDay(G.dayOf(MON19)); const a = [mk({ slug: 'p-this', eps: 60 })], b = [mk({ slug: 'p-next', eps: 60 })];
      const tv = Object.assign(plan(a, true), { w, nx: Object.assign(plan(b, false), { w: w + 1 }) }), A = G.adopt(tv, ['p-this', 'p-next']);
      return G.airingAt(A.channels[0], A, at(2026, 10, 27, 20, 0)).s === 1; }],
];
for (const [name, from, to, holds] of BUGS) {
  test('deliberate bug: ' + name + ' is caught', () => {
    assert.ok(SRC.includes(from), 'the text this test breaks is no longer in scripts/lib/tvgrid.js: ' + from);
    assert.equal(holds(fresh('(' + SRC + ')()')), true, 'the rule holds in the real code');
    assert.equal(holds(fresh('(' + SRC.replace(from, () => to) + ')()')), false, 'the broken copy is not noticed: ' + name);
  });
}
