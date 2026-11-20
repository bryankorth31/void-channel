// Trivia Nights question bank (plan T4). Run: node --test tests/trivia-bank.test.js
// Builds questions from a small made-up catalog held in memory and proves: every question carries its source; no wrong
// answer can also be right; family questions use only family titles; shows that moved networks are not asked about;
// screens keep slurs out everywhere and grown words out of family decks; the checker catches a broken question.
// No network; nothing is written.
const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const B = require('../scripts/trivia/bank');
const { checkAll } = require('../scripts/trivia/check');
const { sameShow } = require('../scripts/trivia/pool');

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`create table shows (slug text primary key, name text, type text, network text, tvmaze_id int, premiered text, tvmaze_network text, tmdb_id int, genres text, matched_at text, tags text);
    create table people (tmdb_id int primary key, name text, photo text);
    create table show_people (show_slug text, person_id int, role text, kind text, episodes int);
    create table episodes (show_slug text, season int, number int, name text, airdate text, state text, why text);
    create table movies (tmdb_id int primary key, kind text, title text, year text, hunted_at text);`);
  const show = db.prepare('insert into shows (slug, name, type, network, tvmaze_id, premiered, tvmaze_network, tmdb_id, genres, matched_at) values (?,?,?,?,?,?,?,?,?,?)');
  show.run('alpha', 'Alpha Street', 'Sitcoms', 'NBC', 1, '1980-09-01', 'NBC', 11, 'Comedy', '2026-10-01T00:00:00Z');
  show.run('bravo', 'Bravo Bay', 'Sitcoms', 'ABC', 2, '1984-01-01', 'CBS', 12, 'Comedy', '2026-10-01T00:00:00Z'); // moved networks
  show.run('charlie', 'Charlie Park', 'Sitcoms', 'CBS', 3, '1982-01-01', 'CBS', 13, 'Comedy', '2026-10-01T00:00:00Z');
  show.run('delta', 'Delta Nights', 'Drama', 'FOX', 4, '1986-01-01', 'FOX', 14, 'Drama', '2026-10-01T00:00:00Z');
  show.run('echo', 'Echo Late', 'Talk', 'HBO', 5, '1985-01-01', 'HBO', 15, 'Talk', '2026-10-01T00:00:00Z'); // after dark
  show.run('foxtrot', 'Foxtrot Hall', 'Drama', 'ABC', 6, '1983-01-01', 'ABC', 16, 'Drama', '2026-10-01T00:00:00Z');
  const person = db.prepare('insert into people values (?,?,null)');
  const credit = db.prepare("insert into show_people values (?,?,?,'cast',?)");
  [[1, 'Ann Ames'], [2, 'Bob Burr'], [3, 'Cy Cole'], [4, 'Di Dunn'], [5, 'Ed Eck'], [6, 'Flo Fay']].forEach(([i, n]) => person.run(i, n));
  credit.run('alpha', 1, 'Mary Moon', 90); credit.run('alpha', 2, 'Joe Moon', 90); credit.run('alpha', 3, 'Self', 50);
  credit.run('alpha', 4, 'Rita', 30); credit.run('alpha', 5, 'Rita', 8); // two people played Rita: never asked
  credit.run('alpha', 6, 'Uncle Sid', 20);
  const ep = db.prepare("insert into episodes values (?,?,?,?,?,'LIVE',null)");
  ep.run('alpha', 1, 1, 'The Great Pancake Caper', '1980-09-01');
  ep.run('alpha', 1, 2, 'Moving Day Blues', '1980-09-08');
  ep.run('charlie', 1, 1, 'Moving Day Blues', '1982-01-01'); // shared name: never asked
  ep.run('alpha', 1, 3, 'Episode 3', '1980-09-15');
  ep.run('alpha', 1, 4, 'A Damn Long Night Out', '1980-09-22'); // not family
  db.prepare("insert into episodes values ('alpha', 2, 1, 'some upload file name hdtv rip', null, 'REVIEW', 'self-listed: no TVmaze entry; order from the files')").run();
  db.prepare('insert into movies values (?,?,?,?,?)').run(77, 'tv-movie', 'Snow Day Story', '1999', null);
  const pool = { fameLine: 100, builtAt: '2026-11-20T00:00:00Z',
    shows: [['alpha', 'family'], ['bravo', 'family'], ['charlie', 'family'], ['delta', 'family'], ['echo', 'after-dark'], ['foxtrot', 'family']]
      .map(([slug, band]) => ({ slug, name: db.prepare('select name from shows where slug = ?').get(slug).name, band, votes: 500, source: 'https://www.themoviedb.org/tv/1' })),
    films: [{ tmdbId: 77, band: 'family', votes: 200, source: 'https://www.themoviedb.org/movie/77' }] };
  return { db, pool };
}

const cards = [
  { id: 'g1', title: 'Rocket Run', year: 1982, publisher: 'Atari, Inc.', archive: { item: 'rocket_run' } },
  { id: 'g2', title: 'Maze Mole', year: 1983, publisher: 'Sega', archive: { item: 'maze_mole' } },
  { id: 'g3', title: 'Pit Jump', year: 1982, publisher: 'Activision (this copy: CCE)', archive: { item: 'pit_jump_1983_cce' } },
  { id: 'g4', title: 'Tank Duel', year: 1981, publisher: 'Williams', archive: { item: 'tank_duel' } },
  { id: 'g5', title: 'Sky Fox', year: 1984, publisher: 'Atari', archive: { item: 'sky_fox' } },
  { id: 'g6', title: 'Bug Hunt', year: 1980, publisher: 'Stern Electronics', archive: { item: 'bug_hunt' } },
];

function build() {
  const { db, pool } = fixture();
  const data = B.gather(db, pool);
  data.cards = cards;
  return { db, pool, data, qs: B.makeQuestions(data) };
}

test('every question has four different choices, an answer and a source with an address', () => {
  const { qs } = build();
  assert.ok(qs.length > 5, 'some questions are made');
  for (const q of qs) {
    assert.equal(q.choices.length, 4, q.id);
    assert.equal(new Set(q.choices).size, 4, q.id);
    assert.ok(q.answer >= 0 && q.answer < 4, q.id);
    assert.match(q.source.url, /^https:\/\//, q.id);
    assert.ok(q.source.site && q.source.fact, q.id);
  }
});

test('the checker passes the whole fixture bank', () => {
  const { db, pool, qs } = build();
  assert.deepEqual(checkAll(qs, db, pool, cards), []);
});

test('first-aired: the right year is the premiere, no wrong year is it', () => {
  const { qs } = build();
  const q = qs.find((x) => x.id === 'tv-year-alpha');
  assert.equal(q.choices[q.answer], '1980');
  assert.equal(q.choices.filter((c) => c === '1980').length, 1);
});

test('network: asked only when TVmaze and the catalog agree (a show that moved is left out)', () => {
  const { qs } = build();
  assert.ok(qs.find((x) => x.id === 'tv-network-alpha'));
  assert.equal(qs.find((x) => x.id === 'tv-network-bravo'), undefined);
});

test('cast: a part two people played, or "Self", is never asked; wrong answers are other cast', () => {
  const { qs } = build();
  const cast = qs.filter((x) => x.round === 'cast');
  assert.ok(cast.some((x) => x.q === 'Who played Mary Moon on Alpha Street?'));
  assert.ok(!cast.some((x) => /Rita|Self/.test(x.q)));
  const q = cast.find((x) => x.q.includes('Mary Moon'));
  assert.equal(q.choices[q.answer], 'Ann Ames');
});

test('episode: only a name one show carries, never "Episode 3", never a family question with a grown word', () => {
  const { qs } = build();
  const eps = qs.filter((x) => x.round === 'episode');
  assert.ok(eps.some((x) => x.q.includes('The Great Pancake Caper')));
  assert.ok(!eps.some((x) => /Moving Day Blues|Episode 3/.test(x.q)));
  assert.ok(!qs.some((x) => x.band === 'family' && /Damn/.test(x.q)));
});

test('a self-listed episode name (an upload file name) is never asked', () => {
  const { qs } = build();
  assert.ok(!qs.some((x) => /upload file name/.test(x.q)));
});

test('shows the list marks as not in English are left out', () => {
  const { db, pool } = fixture();
  const qs = B.makeQuestions(B.gather(db, pool, new Set(['Delta Nights'])));
  assert.ok(!qs.some((x) => x.about && x.about.show === 'delta'));
  assert.ok(!qs.some((x) => x.choices.includes('Delta Nights')));
});

test('shows behind the 18+ door (Late Night, or marked adult) never reach trivia', () => {
  const { db, pool } = fixture();
  db.prepare("update shows set tags = 'Late Night' where slug = 'echo'").run();
  const qs = B.makeQuestions(B.gather(db, pool, new Set(), { foxtrot: { adult: true } }));
  assert.ok(!qs.some((x) => x.about && (x.about.show === 'echo' || x.about.show === 'foxtrot')));
  assert.ok(!qs.some((x) => x.choices.includes('Echo Late') || x.choices.includes('Foxtrot Hall')));
});

test('family questions never lean on an after-dark show, even as a wrong answer', () => {
  const { qs } = build();
  for (const q of qs.filter((x) => x.band === 'family')) assert.ok(!q.choices.includes('Echo Late'), q.id);
});

test('games: a copy whose item carries another year is not asked its year; a maker with a note is not asked', () => {
  const { qs } = build();
  assert.equal(qs.find((x) => x.id === 'game-year-g3'), undefined);
  assert.equal(qs.find((x) => x.id === 'game-maker-g3'), undefined);
  const m = qs.find((x) => x.id === 'game-maker-g1');
  assert.equal(m.choices[m.answer], 'Atari');
  assert.ok(!qs.filter((x) => x.round === 'game-maker').some((x) => x.choices.filter((c) => B.sameish(c, 'Atari')).length > 1), 'Atari never twice');
});

test('the checker catches a wrong year, a duplicate choice and a slur', () => {
  const { db, pool, qs } = build();
  const q = JSON.parse(JSON.stringify(qs.find((x) => x.id === 'tv-year-alpha')));
  const right = q.answer;
  q.answer = (right + 1) % 4;
  assert.ok(checkAll([q], db, pool, cards).some((b) => /premiere year/.test(b.why)));
  const d = JSON.parse(JSON.stringify(qs.find((x) => x.id === 'tv-year-alpha')));
  d.choices[(d.answer + 1) % 4] = d.choices[d.answer];
  assert.ok(checkAll([d], db, pool, cards).some((b) => /same/.test(b.why)));
  assert.equal(B.screenOk('after-dark', ['The Niggar Family']), false);
  assert.equal(B.screenOk('family', ['Hell Town']), false);
  assert.equal(B.screenOk('after-dark', ['Hell Town']), true);
});

test('helpers: names, years, guest lists, makers', () => {
  assert.ok(B.sameish('Brøderbund Software, Inc.', 'Broderbund'));
  assert.ok(B.sameish('ABC', 'ABC Family'));
  assert.equal(B.looksLikeGuests('Dave Higgins, Doug Llewelyn'), true);
  assert.equal(B.looksLikeGuests("Mr. Penroy's Vacation"), false);
  assert.equal(B.makerName('Williams / Vid Kidz'), null);
  assert.equal(B.makerName('Sierra On-Line, Inc.'), 'Sierra On-Line');
  const ys = B.nearYears(2024, B.rng('x'));
  assert.equal(ys.length, 3);
  assert.ok(ys.every((y) => y !== 2024 && y <= new Date().getFullYear()));
  assert.equal(B.clean('A — B'), 'A - B');
});

test('pool: TMDB and TVmaze must name the same show', () => {
  assert.equal(sameShow('Clubhouse', '2004-09-14', 'Mickey Mouse Clubhouse', '2006-05-05'), false);
  assert.equal(sameShow('Night Court', '1984-01-04', 'Night Court', '2023-01-17'), false);
  assert.equal(sameShow('Sanford and Son', '1972-01-14', 'Sanford and Son', '1972-01-14'), true);
  assert.equal(sameShow('The Cosby Show', '1984-09-20', 'Cosby Show', '1984-09-20'), true);
});
