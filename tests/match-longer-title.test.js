// A show must not take the files of a longer-titled work that merely holds its name (voidverse audit A26; Bryan, 23 Nov 2026:
// "Yes, the matcher"). Run: node --test tests/match-longer-title.test.js
// The live catalog on 23 Nov 2026: 28 of the 30 files playing under Friends were "Garfield and Friends" and "Barney & Friends"
// (19 of them LIVE), and 3 of the 4 under Lost were "The Lost History of Flat Earth". Three causes, each closed here:
// 1. The title rule read only what FOLLOWS the name ("Friends" then "Season" closes it), never what stands BEFORE it.
// 2. The strict pass trusted an episode number or a date in a file whose upload's title holds the name only inside a longer title.
// 3. The family rule ran both ways: a listed title that only CONTAINS this show's name counted as its family.
// The fixtures are the real cases, cut down. Each gridFor test fails on the matcher before this change. Nothing here touches the
// catalog or the disk.
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../scripts/match.js');

let uid = 0;
const file = (name, o = {}) => ({ name, file: name + '.mp4', format: 'h.264', playable: true, seconds: 1320, band: 'episode', sizeMB: 300, nameHit: false, ep: null, url: 'https://example.invalid/g' + (uid++), ...o });
const se = (season, episode) => ({ season, episode });
const tvOf = (name, eps, o = {}) => ({ id: 1, name, runtime: 22, premiered: '1994-09-22', network: 'NBC', episodes: eps.map(([s, n, t], i) => ({ season: s, number: n, name: t, airdate: '1994-09-' + String(22 + i).padStart(2, '0') })), ...o });
const placed = (grid) => (grid && grid.seasons ? grid.seasons.flatMap((s) => s.episodes.filter((e) => e.file).map((e) => e.state + ' ' + e.file.item)) : []);
const FRIENDS = { name: 'Friends', type: 'Sitcoms', network: 'NBC' };
const friendsTv = () => tvOf('Friends', [[1, 1, 'The One Where Monica Gets a Roommate'], [1, 2, 'The One with the Sonogram at the End'], [1, 3, 'The One with the Thumb'], [1, 4, 'The One with George Stephanopoulos'], [1, 5, 'The One with the East German Laundry Detergent'], [1, 6, 'The One with the Butt']]);
const names = (text, show, aliases = []) => M.titleNaming(text, [M.norm(show).replace(/^the /, ''), ...aliases.map(M.norm)]);

test('what stands before the name can tie it to a longer title: a joining word with an ordinary word before it', () => {
  for (const [t, s] of [
    ['Garfield and Friends Season 6 (1993)', 'Friends'], ['Barney & Friends: (S1E19) 1-2-3-4-5 Senses! [1992]', 'Friends'], ['Garfield.and.Friends.S06E01', 'Friends'],
    ['Garfield_and_Friends_Season_6', 'Friends'], ['Thomas and Friends Complete Series', 'Friends'], ['Lost in Space Season 1', 'Space'],
    ['Tales of the Unexpected S01', 'The Unexpected'], ['Malcolm in the Middle S01', 'The Middle'], ['Sabrina the Teenage Witch vs The Nanny S01', 'The Nanny'],
  ]) assert.equal(names(t, s), 'longer', t + ' is not ' + s);
});

test('other words before the name still do not matter, and a separator or a lead word ends the tie', () => {
  for (const [t, s, al] of [
    ['Friends Season 1', 'Friends'], ['NBC Friends Season 1', 'Friends'], ['The Complete Friends Collection', 'Friends'], ['[DVD] Friends S01', 'Friends'],
    ['MTV TRL Total Request Live Archive (1998-2001)', 'Total Request Live', ['Total Request Live Archive']], ['Best of the Zork Show', 'Zork Show'],
    ['All of Friends', 'Friends'], ['Episodes of Friends S01', 'Friends'], ['Cartoons and more - Friends (1994)', 'Friends'], ['Sitcoms and dramas: Friends Season 1', 'Friends'],
    ['Zork Show Jam, then Zork Show - Season 2', 'Zork Show'], ['And Friends S01E01', 'Friends'], ['The Friends Season 2', 'Friends'],
    ['Jake and Amir： Audit', 'Jake and Amir'], ['Law and Order Season 3', 'Law & Order'],
  ]) assert.equal(names(t, s, al), 'names', t + ' names ' + s);
  assert.equal(M.opensName(''), true, 'the name starts the text');
  assert.equal(M.opensName('garfield and '), false);
  assert.equal(M.opensName('garfield and the '), false, 'an article between does not break the tie');
  assert.equal(M.opensName('cartoons and more - '), true, 'a dash with spaces is a separator');
  assert.equal(M.opensName('and '), true, 'a joining word alone ties it to nothing');
});

test('Friends: "Garfield and Friends" and "Barney & Friends" uploads give Friends no episode, not by number and not by a sequence guess', () => {
  const garfield = { id: 'garfield-and-friends-season-6', title: 'Garfield and Friends Season 6 (1993)', files: [
    file('101 - Magic, Mosters and Manicotti - The Midnight Ride of Paul Revere\'s Duck - Unreal Estate', { ep: se(1, 1) }),
    file('102 - Lost and Foundling - Winter Wonderland - Fims and Felines', { ep: se(1, 2) }),
    file('103 - The Garfield Musical - Mind Over Melvin - Madman Meets His Match', { ep: se(1, 3) }),
    ...Array.from({ length: 6 }, (_, i) => file('Disc 2 title ' + (i + 1))), // unnamed files: the old sequence guess offered these as episodes too
  ] };
  const barney = { id: 'barney-s1e19', title: 'Barney & Friends: (S1E19) 1-2-3-4-5 Senses! [1992] - 1993 Time Life VHS Release', files: [file('Barney & Friends (S1E19) 1-2-3-4-5 Senses! [1992]', { ep: se(1, 4), nameHit: true, seconds: 1700 })] };
  const g = M.gridFor(FRIENDS, { items: [garfield, barney] }, friendsTv(), { ov: {} });
  assert.deepEqual(placed(g), [], 'no Friends episode plays a Garfield or a Barney file, at LIVE or at REVIEW');
  // the real thing still matches, beside them
  const real = { id: 'friends-season-1', title: 'Friends Season 1', files: [1, 2, 3].map((n) => file(`Friends S01E0${n}`, { ep: se(1, n), nameHit: true })) };
  const g2 = M.gridFor(FRIENDS, { items: [garfield, barney, real] }, friendsTv(), { ov: {} });
  assert.deepEqual(placed(g2), ['LIVE friends-season-1', 'LIVE friends-season-1', 'LIVE friends-season-1']);
});

test('Lost: "The Lost History of Flat Earth" gives Lost no episode, though its files carry season and episode numbers', () => {
  const tv = tvOf('Lost', [[1, 4, 'Walkabout'], [1, 5, 'White Rabbit'], [1, 6, 'House of the Rising Sun']], { runtime: 43, premiered: '2004-09-22', network: 'ABC' });
  const flat = { id: 'the-lost-history-of-flat-earth-season-1', title: 'The Lost History Of Flat Earth Season 1', files: [4, 5, 6].map((n) => file(`00${n} The Lost History of Flat Earth - Season 1, Episode ${n}.ia`, { ep: se(1, n), nameHit: true, seconds: 2600 })) };
  const g = M.gridFor({ name: 'Lost', type: 'Drama', network: 'ABC' }, { items: [flat] }, tv, { ov: {} });
  assert.deepEqual(placed(g), [], 'a cut in the score left these at REVIEW, which still ships: it is a gate');
  const real = { id: 'lost-s01', title: 'Lost - Season 1', files: [4, 5, 6].map((n) => file(`Lost S01E0${n}`, { ep: se(1, n), nameHit: true, seconds: 2600 })) };
  assert.deepEqual(placed(M.gridFor({ name: 'Lost', type: 'Drama', network: 'ABC' }, { items: [flat, real] }, tv, { ov: {} })), ['LIVE lost-s01', 'LIVE lost-s01', 'LIVE lost-s01']);
});

test('a mixed upload with a longer title still gives the show the files that name it themselves; a file Bryan accepted in HQ stays', () => {
  const mixed = { id: 'seinfeld-and-friends-tapes', title: 'Seinfeld and Friends collection', files: [
    file('Friends S01E01 The One Where Monica Gets a Roommate', { ep: se(1, 1), nameHit: true }),
    file('Seinfeld S01E02 The Stakeout', { ep: se(1, 2) }),
  ] };
  assert.deepEqual(placed(M.gridFor(FRIENDS, { items: [mixed] }, friendsTv(), { ov: {} })), ['LIVE seinfeld-and-friends-tapes'], 'only the file named Friends; the Seinfeld file is not Friends S01E02');
  const g = M.gridFor(FRIENDS, { items: [mixed] }, friendsTv(), { ov: { acceptFiles: ['seinfeld-and-friends-tapes|Seinfeld S01E02 The Stakeout'] } });
  assert.equal(placed(g).length, 2, 'his accept in HQ is his call');
});

test('the family rule runs one way: a listed title that is part of this show\'s name is family, one that only contains it is another show', () => {
  const shows = M.makeOtherShows([{ name: 'Happy Tree Friends' }, { name: 'Star Trek' }, { name: 'Star Trek: Enterprise' }, { name: 'Friends' }]);
  assert.equal(M.namesOtherShow('Happy Tree Friends S01E01', 'Friends', [], shows), true, 'Happy Tree Friends is not Friends');
  assert.equal(M.namesOtherShow('Star Trek Enterprise S01E01', 'Star Trek', [], shows), true, 'Enterprise is not the first Star Trek');
  assert.equal(M.namesOtherShow('Star Trek S01E01', 'Star Trek: Enterprise', [], shows), false, '"star trek" is a part of this show\'s own name');
  assert.equal(M.namesOtherShow('Star Trek Enterprise S01E01', 'Star Trek: Enterprise', [], shows), false);
  assert.equal(M.namesOtherShow('Happy Tree Friends S01E01', 'Friends', ['happy tree friends'], shows), false, 'an alias makes the longer title this show\'s own');
});

test('an exact airdate is judged as before: an as-aired tape whose title runs on past the name still gives its episode', () => {
  const tv = tvOf('ER', [[8, 4, 'Never Say Never'], [8, 5, 'Start All Over Again']], { runtime: 44, premiered: '1994-09-19' });
  tv.episodes[0].airdate = '2001-10-18'; tv.episodes[1].airdate = '2001-10-25';
  const tape = { id: 'er-nbc-woc-2001-10-18', title: ' ER NBC WOC 2001 10 18', files: [file('ER NBC WOC 2001 10 18', { seconds: 2700, nameHit: true })] };
  assert.equal(M.titleNaming(tape.title, ['er'], ['nbc']), 'longer', 'the title rule still calls it a longer title (a tape is not an upload of the series)');
  assert.deepEqual(placed(M.gridFor({ name: 'ER', type: 'Drama', network: 'NBC' }, { items: [tape] }, tv, { ov: {} })), ['LIVE er-nbc-woc-2001-10-18'], 'placed by its date, as it was before');
  // the same tape with an episode number and no matching date is another work's file
  const numbered = { id: 'er-nbc-woc', title: ' ER NBC WOC special', files: [file('tape 3', { seconds: 2700, ep: se(8, 5) })] };
  assert.deepEqual(placed(M.gridFor({ name: 'ER', type: 'Drama', network: 'NBC' }, { items: [numbered] }, tv, { ov: {} })), []);
});
