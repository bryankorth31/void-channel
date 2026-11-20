// Trivia fame list (plan T7, clip rounds). Run: node --test tests/trivia-fame.test.js
// Proves the pure parts of scripts/trivia/fame.js: the 12-month page view window, the Wikidata question, turning an
// answer row into a title, ranking by views, matching a game to a PLAY card, and the words shown for each state.
// No network; nothing is written.
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../scripts/trivia/fame');

test('the window is the last 12 full months', () => {
  assert.deepEqual(F.window12(new Date(Date.UTC(2026, 10, 20))), { start: '20251101', end: '20261031' });
  assert.deepEqual(F.window12(new Date(Date.UTC(2026, 0, 3))), { start: '20250101', end: '20251231' });
});

test('the Wikidata question asks for the kinds, the floor and the TMDB id where the category has one', () => {
  const tv = F.sparql('tv');
  assert.match(tv, /wd:Q5398426/);
  assert.match(tv, /\?links >= 10/);
  assert.match(tv, /wdt:P4983 \?tmdb/);
  const game = F.sparql('game');
  assert.match(game, /wd:Q7889/);
  assert.doesNotMatch(game, /\?tmdb \./);
  assert.match(F.sparql('film'), /wd:Q219557/); // the cult film mark
});

test('answer rows fold into one title record per item', () => {
  const E = 'http://www.wikidata.org/entity/';
  const row = { item: { value: E + 'Q79784' }, title: { value: 'Friends' }, links: { value: '110' }, tmdb: { value: '1668' }, type: { value: E + 'Q5398426' } };
  assert.deepEqual(F.fromRows('tv', [row]), [{
    title: 'Friends', wikidata: 'Q79784', tmdb: 1668, tmdbAll: [1668], year: null, links: 110, animated: false, tvMovie: false, cult: false,
  }]);
  // the same item twice, once as an animated series and with a second TMDB id: one record, both kept
  const two = F.fromRows('tv', [row, { ...row, type: { value: E + 'Q581714' }, tmdb: { value: '99' } }]);
  assert.equal(two.length, 1);
  assert.equal(two[0].animated, true);
  assert.deepEqual(two[0].tmdbAll, [1668, 99]);
  const cult = F.fromRows('film', [{ ...row, type: { value: E + 'Q11424' }, cult: { value: E + 'Q219557' } }]);
  assert.equal(cult[0].cult, true);
});

test('the years question asks only for the kept items', () => {
  const q = F.yearsQuery(['Q1', 'Q22']);
  assert.match(q, /VALUES \?item \{ wd:Q1 wd:Q22 \}/);
  assert.match(q, /MIN\(\?date\)/);
});

test('ranking goes by views, then Wikipedias, then name', () => {
  const r = F.rank([
    { title: 'B', views: 10, links: 5 }, { title: 'A', views: 10, links: 5 }, { title: 'C', views: 10, links: 9 }, { title: 'D', views: 99, links: 1 },
  ]);
  assert.deepEqual(r.map((t) => `${t.rank}${t.title}`), ['1D', '2C', '3A', '4B']);
});

test('a game matches a PLAY card by name and a year either side', () => {
  const cards = [{ id: 'aladdin-genesis', title: 'Aladdin', year: 1993 }, { id: 'tetris-gb', title: 'Tetris', year: 1989 }];
  assert.equal(F.findCard({ title: 'Aladdin (1993 video game)', year: 1993 }, cards).id, 'aladdin-genesis');
  assert.equal(F.findCard({ title: 'Tetris', year: 1984 }, cards), null);
  assert.equal(F.findCard({ title: 'Tetris', year: 1988 }, cards).id, 'tetris-gb');
  assert.equal(F.findCard({ title: 'Doom', year: 1993 }, cards), null);
});

test('each state reads plainly and never with a dash', () => {
  const said = [
    F.stateText('tv', null),
    F.stateText('tv', { live: 40, clipReady: 30 }),
    F.stateText('tv', { live: 4, clipReady: 0 }),
    F.stateText('tv', { live: 0, clipReady: 0 }),
    F.stateText('film', { state: 'LIVE', clipReady: 1 }),
    F.stateText('film', { state: 'LIVE', clipReady: 0 }),
    F.stateText('film', { state: 'REVIEW', clipReady: 0 }),
    F.stateText('film', { state: 'MISSING', clipReady: 0 }),
    F.stateText('game', { card: 'x' }),
  ];
  assert.equal(said[1], '30 episodes ready for clips (40 play)');
  assert.equal(said[3], 'in the catalog, not found on the Archive');
  for (const s of said) assert.doesNotMatch(s, /[–—]/);
});
