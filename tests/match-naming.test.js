// Whole-word naming in the matcher (audit 25 Oct 2026, batch C1; B, 26 Oct: "Go batch C1"). Run: node --test tests/match-naming.test.js
// The live catalog showed three ways another show's files shipped under ours (audit findings P3B-01, P3B-02, P3B-03):
// 1. The strict pass asked whether a text names the show with a plain substring test, so "ER" was named by "lottery winners" and Tales from
//    the Crypt by "Tales from the Cryptkeeper" (34 wrong LIVE episodes between the two).
// 2. The self-list took an upload as named when the show's name stood inside brackets: "Stefan Molyneux archive (Greatest hits)" became 161
//    episodes of "Greatest Hits".
// 3. Grids written before the TVmaze name guard kept a guide the guard now refuses: I Love the '70s on I Love the '90s, Animal X on I Survived
//    an Animal Attack, Secret Lives on Secret Sex Lives. The matcher now applies the guard to the cached guide too, unless B pinned the id.
// The fixtures are the real cases, cut down. Each test fails on the matcher before this change. Nothing here touches the catalog or the disk.
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../scripts/match.js');

let uid = 0;
const file = (name, o = {}) => ({ name, file: name + '.mp4', format: 'h.264', playable: true, seconds: 2700, band: 'episode', sizeMB: 300, nameHit: false, ep: null, url: 'https://example.invalid/f' + (uid++), ...o });
const se = (season, episode) => ({ season, episode });
const tvOf = (name, eps, o = {}) => ({ id: 1, name, runtime: 45, premiered: '1994-09-19', network: 'NBC', episodes: eps.map(([s, n, t], i) => ({ season: s, number: n, name: t, airdate: '1994-09-' + String(19 + i).padStart(2, '0') })), ...o });
const fileItems = (grid) => (grid && grid.seasons ? grid.seasons.flatMap((s) => s.episodes.filter((e) => e.file).map((e) => e.file.item)) : []);

test('ER: an upload called "Windfall ... lottery winners" does not name ER, so its files are not ER episodes', () => {
  const tv = tvOf('ER', [[1, 1, '24 Hours'], [1, 2, 'Day One'], [1, 3, 'Going Home']]);
  const windfall = { id: 'windfall-2006', title: 'Windfall (2006) all 13 eps -lottery winners -ft Luke Perry', files: [1, 2, 3].map((n) => file(`Windfall (2006) episode 0${n} (1x0${n} ) Pilot  (426x240)`, { ep: se(1, n), nameHit: true })) };
  const g = M.gridFor({ name: 'ER', type: 'Drama', network: 'NBC' }, { items: [windfall] }, tv, { ov: {} });
  assert.deepEqual(fileItems(g), [], 'no ER episode plays a Windfall file');
  // the real thing still matches: an upload titled as the show
  const er = { id: 'er-season-1', title: 'ER Season 1', files: [1, 2, 3].map((n) => file(`ER S01E0${n}`, { ep: se(1, n), nameHit: true })) };
  const g2 = M.gridFor({ name: 'ER', type: 'Drama', network: 'NBC' }, { items: [windfall, er] }, tv, { ov: {} });
  assert.deepEqual([...new Set(fileItems(g2))], ['er-season-1']);
  assert.ok(g2.seasons[0].episodes.every((e) => e.state === 'LIVE'), 'ER S01E01 to E03 are LIVE');
});

test('Tales from the Crypt: "Tales from the Cryptkeeper" is a longer title, another show', () => {
  const tv = tvOf('Tales from the Crypt', [[1, 1, 'The Man Who Was Death'], [1, 2, 'And All Through the House'], [1, 3, 'Dig That Cat... He\'s Real Gone']]);
  const keeper = { id: 's-01-e-06-the-works...-in-wax', title: 'Tales from the Cryptkeeper', files: [1, 2, 3].map((n) => file(`S01E0${n} - While the Cat's Away`, { ep: se(1, n), seconds: 1300 })) };
  const g = M.gridFor({ name: 'Tales from the Crypt', type: 'Sci-Fi, Fantasy and Horror', network: 'HBO' }, { items: [keeper] }, tv, { ov: {} });
  assert.deepEqual(fileItems(g), [], 'no Tales from the Crypt episode plays a Cryptkeeper file');
  const crypt = { id: 'tales-from-the-crypt-season-1', title: 'Tales From the Crypt Season 1', files: [1, 2, 3].map((n) => file(`Tales.From.The.Crypt.S01E0${n}`, { ep: se(1, n), seconds: 1500 })) };
  const g2 = M.gridFor({ name: 'Tales from the Crypt', type: 'Sci-Fi, Fantasy and Horror', network: 'HBO' }, { items: [keeper, crypt] }, tv, { ov: {} });
  assert.deepEqual([...new Set(fileItems(g2))], ['tales-from-the-crypt-season-1']);
});

test('an identifier names the show only as whole words: "911" in an id is not 9-1-1, "er" inside a word is not ER', () => {
  const tv = tvOf('9-1-1', [[1, 1, 'Pilot'], [1, 2, 'Next of Kin']]);
  const item = { id: '911-analysis-collection', title: 'September 11 analysis', files: [file('Part 1 S01E01', { ep: se(1, 1) }), file('Part 2 S01E02', { ep: se(1, 2) })] };
  assert.deepEqual(fileItems(M.gridFor({ name: '9-1-1', type: 'Drama', network: 'FOX' }, { items: [item] }, tv, { ov: {} })), []);
});

test('Greatest Hits: a show name inside brackets in an upload title does not make the upload that show', () => {
  const vids = (prefix) => Array.from({ length: 8 }, (_, i) => file(`${prefix} talk ${i + 1}`, { seconds: 2940 }));
  const archive = { id: 'stefan-molyneux-greatest-hits', title: 'Stefan Molyneux archive (Greatest hits)', files: vids('Rebutted') };
  assert.equal(M.selfGrid({ name: 'Greatest Hits', type: 'Drama', network: 'ABC' }, { items: [archive] }, []), null, 'no grid from a bracket');
  // an upload titled as the show still self-lists, with a year in brackets after the name
  const real = { id: 'greatest-hits-1981', title: 'Greatest Hits (1981) complete series', files: vids('Greatest Hits episode') };
  const g = M.selfGrid({ name: 'Greatest Hits', type: 'Drama', network: 'ABC' }, { items: [archive, real] }, []);
  assert.ok(g, 'the real upload lists');
  assert.deepEqual([...new Set(fileItems(g))], ['greatest-hits-1981']);
});

test('a cached TVmaze guide the name guard refuses is not used; a guide B pinned in HQ is', () => {
  const entry = { name: "I Love the '70s", type: 'Documentary & Geographic', network: 'VH1' };
  const wrong = tvOf("I Love the '90s", [[1, 1, '1990'], [1, 2, '1991'], [1, 3, '1992']], { premiered: '2004-07-12' });
  const item = { id: 'i-love-the-70s-vh1', title: "I Love the '70s", files: [1, 2, 3].map((n) => file(`I Love the 70s 197${n}`, { seconds: 2700 })) };
  const g = M.gridFor(entry, { items: [item] }, wrong, { ov: {} });
  assert.ok(!g.tvmaze || g.tvmaze.name !== "I Love the '90s", "the I Love the '90s guide is not used for I Love the '70s");
  assert.ok(g.selfListed || g.noTvmaze, 'the show falls back to its own files (or to nothing)');
  // B pinned the id in HQ: his choice stands even when the names differ
  const pinned = M.gridFor(entry, { items: [item] }, wrong, { ov: { tvmazeId: 1 } });
  assert.equal(pinned.tvmaze && pinned.tvmaze.name, "I Love the '90s");
});
