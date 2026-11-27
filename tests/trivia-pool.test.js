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

// Theme lists (scripts/trivia/lists/; black-tv first, Bryan 26 Nov 2026: "All three", "Yes, go on").
test('Theme list: a listed show skips the vote line, and its band fills only a missing US rating', () => {
  const { showInDecks } = require('../scripts/trivia/pool');
  const shows = [{ slug: 'a', name: 'A', tmdbId: 1, live: 3 }, { slug: 'b', name: 'B', tmdbId: 2, live: 1 }, { slug: 'c', name: 'C', tmdbId: 3, live: 1 }, { slug: 'd', name: 'D', tmdbId: 4, live: 1 }, { slug: 'e', name: 'E', tmdbId: 5, live: 1 }];
  const tv = {
    1: { name: 'A', first: '', votes: 20, us: 'TV-PG', source: 'https://www.themoviedb.org/tv/1' },   // listed, rated, few votes
    2: { name: 'B', first: '', votes: 5, us: '', source: 'https://www.themoviedb.org/tv/2' },         // listed, no US rating
    3: { name: 'Another Show', first: '', votes: 900, us: '', source: 'https://www.themoviedb.org/tv/3' }, // listed, wrong record
    4: { name: 'D', first: '', votes: 20, us: 'TV-14', source: 'https://www.themoviedb.org/tv/4' },   // listed, the rating wins over the list
    5: { name: 'E', first: '', votes: 20, us: 'TV-PG', source: 'https://www.themoviedb.org/tv/5' },   // not listed
  };
  const lists = [{ id: 'black-tv', shows: [{ slug: 'a' }, { slug: 'b', band: 'family' }, { slug: 'c', band: 'family' }, { slug: 'd', band: 'family' }] }];
  const p = buildPool(shows, [], tv, {}, lists);
  const by = Object.fromEntries(p.shows.map((x) => [x.slug, x]));
  assert.deepEqual(by.a.lists, ['black-tv']);
  assert.equal(by.a.band, 'family');
  assert.equal(by.b.band, 'family', 'the list fills a missing US rating');
  assert.match(by.b.why, /no official US rating.*family from the black-tv list/);
  assert.equal(by.c.band, 'out', 'a wrong TMDB record stays out, list or not');
  assert.equal(by.d.band, 'after-dark', 'an official rating wins over the list');
  assert.equal(by.e.lists, undefined);
  assert.deepEqual(p.shows.map((x) => showInDecks(x, 100)), [true, true, false, true, false], 'listed shows skip the vote line; others still need it');
  assert.deepEqual(buildPool(shows, [], tv, {}).shows.map((x) => showInDecks(x, 100)), [false, false, false, false, false], 'with no lists nothing changes');
});

test('Theme list files: each names an id and shows once, with only family or after-dark as a band', () => {
  const { readLists, LISTS } = require('../scripts/trivia/pool');
  const lists = readLists(LISTS);
  assert.ok(lists.some((l) => l.id === 'black-tv'), 'the black-tv list is there');
  for (const l of lists) {
    const slugs = l.shows.map((s) => s.slug);
    assert.equal(new Set(slugs).size, slugs.length, l.id + ': no show twice');
    for (const s of l.shows) {
      assert.match(s.slug, /^[a-z0-9-]+$/, l.id + ': ' + s.slug);
      if ('band' in s) assert.ok(s.band === 'family' || s.band === 'after-dark', l.id + ': ' + s.slug + ' band');
    }
    for (const s of l.leftOff || []) assert.ok(!slugs.includes(s.slug), l.id + ': ' + s.slug + ' was left off by Bryan, so it is not on the list');
  }
});
