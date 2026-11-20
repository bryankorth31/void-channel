// Trivia Nights pool (plan T3; Bryan, 20 Nov 2026: "Yes, all four"). Run: node --test tests/trivia-pool.test.js
// Ratings decide the band (family, after dark, out); no US rating is out; adult is out; nothing is fetched here.
const test = require('node:test');
const assert = require('node:assert/strict');
const { band, usRating, buildPool } = require('../scripts/trivia/pool');

test('TV ratings: TV-PG and under are family, TV-14 and TV-MA after dark, none is out', () => {
  for (const r of ['TV-Y', 'TV-Y7', 'TV-G', 'TV-PG']) assert.equal(band('tv', r).band, 'family', r);
  for (const r of ['TV-14', 'TV-MA']) assert.equal(band('tv', r).band, 'after-dark', r);
  assert.equal(band('tv', '').band, 'out');
  assert.equal(band('tv', 'NR').band, 'out');
  assert.equal(band('tv', 'PG').band, 'out', 'a film rating on a show is not one we know');
});

test('Film ratings: PG and under are family, PG-13 R NC-17 after dark, NR or none is out', () => {
  for (const r of ['G', 'PG']) assert.equal(band('film', r).band, 'family', r);
  for (const r of ['PG-13', 'R', 'NC-17']) assert.equal(band('film', r).band, 'after-dark', r);
  for (const r of ['', 'NR', 'TV-PG']) assert.equal(band('film', r).band, 'out', r);
});

test('US rating is read from TMDB answers, US only', () => {
  assert.equal(usRating('tv', { content_ratings: { results: [{ iso_3166_1: 'GB', rating: 'U' }, { iso_3166_1: 'US', rating: 'TV-G' }] } }), 'TV-G');
  assert.equal(usRating('tv', { content_ratings: { results: [{ iso_3166_1: 'GB', rating: 'U' }] } }), '');
  const film = { release_dates: { results: [{ iso_3166_1: 'US', release_dates: [{ type: 4, certification: 'R' }, { type: 6, certification: 'PG' }, { type: 1, certification: '' }] }] } };
  assert.equal(usRating('film', film), 'PG', 'the TV release wins over a digital one');
  assert.equal(usRating('film', { release_dates: { results: [] } }), '');
  assert.equal(usRating('film', null), '');
});

test('Pool: unfetched, missing and adult titles are out; others carry votes, rating and source', () => {
  const shows = [{ slug: 'a', name: 'A', tmdbId: 1, live: 3 }, { slug: 'b', name: 'B', tmdbId: 2, live: 1 }, { slug: 'c', name: 'C', tmdbId: 3, live: 1 }];
  const films = [{ tmdbId: 9, title: 'F', year: '1999', kind: 'tv-movie' }, { tmdbId: 8, title: 'G', year: '2001', kind: 'special' }];
  const tv = { 1: { name: 'A', first: '', votes: 300, us: 'TV-G', source: 'https://www.themoviedb.org/tv/1' }, 2: { missing: true } };
  const fm = { 9: { votes: 12, us: 'R', source: 'https://www.themoviedb.org/movie/9' }, 8: { votes: 50, us: 'PG', adult: true } };
  const p = buildPool(shows, films, tv, fm);
  assert.deepEqual(p.shows.map((x) => x.band), ['family', 'out', 'out']);
  assert.equal(p.shows[0].source, 'https://www.themoviedb.org/tv/1');
  assert.equal(p.shows[0].votes, 300);
  assert.match(p.shows[2].why, /not fetched/);
  assert.deepEqual(p.films.map((x) => x.band), ['after-dark', 'out']);
  assert.match(p.films[1].why, /adult/);
});
