// The show review rules (scripts/lib/review.js; B, 26 Oct 2026): four scores and a Keep, Look or Go call from facts.
// Run: node --test tests/review.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const R = require('../scripts/lib/review');

const NOW = '2026-10-26';
const goodFiles = { siteEps: 100, coverage: 1, playable: 1, mbMin: 9, slotFill: 0.9 };
// A show with every source, scaled by k (0 weak, 1 strong).
const mk = (slug, k, over) => Object.assign({
  slug,
  tmdb: { va: 5 + 4 * k, vc: Math.round(300 + 5000 * k), pop: 1 + 200 * k, seasons: 1 + Math.round(9 * k), first: '1990-01-01', last: String(1990 + Math.round(10 * k)) + '-06-01', status: 'Ended' },
  tvmaze: { rating: 5 + 4 * k, weight: Math.round(10 + 89 * k) },
  wiki: { won: Math.round(10 * k), noms: Math.round(20 * k), links: Math.round(2 + 60 * k) },
  views: { views: Math.round(1000 + 2e6 * k), months: 12 },
  files: goodFiles,
}, over || {});
const field = () => [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1].map((k, i) => mk('s' + i, k));
const by = (rows) => Object.fromEntries(rows.map((r) => [r.slug, r]));

test('ranks: 0 to 100, ties share a rank, missing stays missing', () => {
  assert.deepEqual(R.ranks([3, 1, null, 2, 2]), [100, 0, null, 50, 50]);
  assert.deepEqual(R.ranks([7]), [50]);
});

test('a strong show is Keep, a weak one is Go, the middle stays (two calls only)', () => {
  const r = by(R.score(field(), {}, {}, NOW));
  assert.equal(r.s10.call, 'keep');
  assert.equal(r.s0.call, 'go');
  assert.equal(r.s5.call, 'keep');
  assert.ok(R.score(field(), {}, {}, NOW).every((x) => x.call === 'keep' || x.call === 'go'));
  assert.ok(r.s10.scores.entertainment > r.s0.scores.entertainment && r.s10.scores.love > r.s0.scores.love && r.s10.scores.impact > r.s0.scores.impact);
});

test("B's own call always wins, and says so", () => {
  const r = by(R.score(field(), {}, { s0: { call: 'keep' }, s10: { call: 'go' } }, NOW));
  assert.equal(r.s0.call, 'keep'); assert.equal(r.s0.auto, 'go'); assert.ok(r.s0.byB);
  assert.equal(r.s10.call, 'go'); assert.ok(r.s10.byB);
});

test('a show that plays poorly here is Go however loved, and the reason says why', () => {
  const shows = field(); shows[10] = mk('s10', 1, { files: { siteEps: 3, coverage: 0.05, playable: 0.5, mbMin: 1.5, slotFill: 0.5 } });
  const r = by(R.score(shows, {}, {}, NOW));
  assert.equal(r.s10.call, 'go');
  assert.match(r.s10.reason, /3 episodes here/);
});

test('a loved show with under 4 episodes here drops off Live TV (Seinfeld had 1): it would repeat', () => {
  const shows = field(); shows[10] = mk('s10', 1, { files: Object.assign({}, goodFiles, { siteEps: 1, coverage: 0.01 }) });
  const r = by(R.score(shows, {}, {}, NOW));
  assert.equal(r.s10.call, 'go');
  assert.match(r.s10.reason, /^Only 1 episode here/);
  assert.equal(by(R.score(shows, { minEpisodes: 1 }, {}, NOW)).s10.call, 'keep', 'the line is a setting');
});

test('barely known: fewer than two outside sources drops off Live TV', () => {
  const shows = field().concat([{ slug: 'odd', files: goodFiles, tmdb: { missing: true } }]);
  const r = by(R.score(shows, {}, {}, NOW));
  assert.equal(r.odd.call, 'go');
  assert.match(r.odd.reason, /Barely known/);
  assert.equal(r.odd.scores.blend, null, 'no overall score from Quality alone');
});

test('few votes pull a high average toward the middle (a 9.5 from 3 votes is not the best show)', () => {
  const shows = field().concat([mk('hype', 0.5, { tmdb: { va: 9.5, vc: 3, pop: 5, seasons: 2, first: '2001-01-01', last: '2002-01-01' }, tvmaze: null })]);
  const r = by(R.score(shows, {}, {}, NOW));
  assert.ok(r.hype.scores.entertainment < r.s10.scores.entertainment);
});

test('our own viewers raise Love; a show nobody here watched yet is not marked down for it', () => {
  const base = field(), a = by(R.score(base, {}, {}, NOW));
  const withOurs = base.map((s) => (s.slug === 's5' ? Object.assign({}, s, { ours: { minutes: 900, watchers: 40 } }) : s));
  const b = by(R.score(withOurs, {}, {}, NOW));
  assert.ok(b.s5.scores.love > a.s5.scores.love);
  assert.equal(b.s4.scores.love, a.s4.scores.love);
});

test('settings move the line: a higher Go line drops more', () => {
  const n = (s) => R.score(field(), s, {}, NOW).filter((r) => r.call === 'go').length;
  assert.ok(n({ goBelow: 70 }) > n({}));
});

test('file facts: coverage of the guide, files that play, picture and slot fill', () => {
  const grid = { seasons: [{ number: 1, episodes: [
    { file: { playable: true, sizeMB: 220, seconds: 1320 } }, { file: { playable: false, sizeMB: 100, seconds: 1320 } }, {}, {}] }] };
  const site = { eps: 1, seasons: [{ episodes: [{ min: 22 }] }] };
  const f = R.fileFacts(site, grid);
  assert.equal(f.coverage, 0.25); assert.equal(f.playable, 0.5); assert.equal(f.guideEps, 4);
  assert.ok(Math.abs(f.slotFill - 22 / 30) < 1e-9);
});
