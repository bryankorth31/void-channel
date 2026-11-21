// The art match (scripts/lib/sameshow.js, used by scripts/art.js): a TMDB record is taken only when it is the same show as
// VoidTV's TVmaze record (night audit N12, 21 Nov 2026: "Payne" (CBS, 1999) wore Tyler Perry's House of Payne).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { sameShow, pickSame } = require('../scripts/lib/sameshow');

test('art: the top search hit is never taken when it is another show', () => {
  const results = [{ id: 3690, name: "Tyler Perry's House of Payne", first_air_date: '2007-06-06' }];
  assert.equal(pickSame(results, 'Payne', '1999-03-15'), null, 'no record is Payne (1999): no art, the site draws its own poster');
});

test('art: the namesake of the right year wins over the top hit', () => {
  const results = [
    { id: 64978, name: 'Whose Line Is It Anyway?', first_air_date: '2013-07-16' },
    { id: 1486, name: 'Whose Line Is It Anyway?', first_air_date: '1998-08-05' },
  ];
  assert.equal(pickSame(results, 'Whose Line Is It Anyway?', '1998-08-05').id, 1486);
});

test('art: the same name beats a longer name that holds it, and a year off by one still counts', () => {
  const results = [
    { id: 1, name: 'Cosmos: A Spacetime Odyssey', first_air_date: '1980-01-01' },
    { id: 2, name: 'Cosmos', first_air_date: '1981-09-28' },
  ];
  assert.equal(pickSame(results, 'Cosmos', '1980-09-28').id, 2);
});

test('art: names are compared tidied (case, a leading The, accents, punctuation)', () => {
  assert.ok(sameShow('The Office', '2005-03-24', 'Office', '2005'));
  assert.ok(sameShow('Pokémon', '1997-04-01', 'Pokemon', '1997'));
  assert.ok(!sameShow('Clubhouse', '2004-09-28', 'Mickey Mouse Clubhouse', '2006-05-05'));
  assert.ok(sameShow('Payne', null, 'Payne', '1999'), 'with no TVmaze year the name decides');
});

// The night audit's catch (21 Nov 2026): a strict first run cleared right art. These keep it.
const { identity, exactName } = require('../scripts/lib/sameshow');

test('art: a pilot or TV movie years before the series does not lose the match (Columbo 1968 on TVmaze, 1971 on TMDB)', () => {
  const results = [{ id: 873, name: 'Columbo', first_air_date: '1971-09-15' }, { id: 5, name: 'Columbo Goes to College', first_air_date: '1990-12-09' }];
  assert.equal(pickSame(results, ['Columbo'], '1968-02-20').id, 873);
});

test('art: among same-name shows with no year within one, the nearest year wins', () => {
  const results = [{ id: 1, name: 'Childrens Hospital', first_air_date: '2008-12-08' }, { id: 2, name: "Children's Hospital", first_air_date: '1997-01-01' }];
  assert.equal(pickSame(results, ['Childrens Hospital'], '2010-07-11').id, 1);
});

test('art: a cached TVmaze record that is another show is not believed (M*A*S*H cached as "A Teacher", 2020)', () => {
  const id = identity('M*A*S*H', 'A Teacher', '2020-11-10');
  assert.deepEqual(id, { names: ['M*A*S*H'], first: null });
  assert.equal(pickSame([{ id: 918, name: 'M*A*S*H', first_air_date: '1972-09-17' }], id.names, id.first).id, 918);
  const agree = identity('Dateline NBC', 'Dateline NBC', '2012-07-22');
  assert.equal(agree.first, '2012-07-22', 'a record whose name agrees keeps its year');
});

test('art: doubt keeps art that carries exactly the show name; another show name does not', () => {
  assert.ok(exactName(['Columbo'], 'Columbo'));
  assert.ok(!exactName(['Smosh'], 'Smosh vs. Zombies'));
  assert.ok(!exactName(['The Edge'], 'Dragons: Race to the Edge'));
});

test('art: an exact name beats a longer name that holds it, even years apart', () => {
  const results = [{ id: 1, name: 'Good Game: Spawn Point', first_air_date: '2010-01-01' }, { id: 2, name: 'Spawn', first_air_date: '1997-05-16' }];
  assert.equal(pickSame(results, ['Spawn'], '2010-05-01').id, 2);
  assert.equal(pickSame([{ id: 3, name: 'Spider-Man', first_air_date: '1994-11-19' }], ['Spider-Man'], '1994-11-19').id, 3);
});
