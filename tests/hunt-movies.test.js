// Tests for the TV-movie hunt's judge (scripts/lib/moviejudge.js), the hard excludes (scripts/lib/hardexclude.js), the --rescore mode of
// scripts/hunt-movies.js, the doctor's two movie lights (scripts/lib/matchcheck.js) and the TVmaze near-name guard (scripts/lib/tvmazeguard.js).
//   Run:  node --test tests/hunt-movies.test.js
// Nothing here touches the real catalog, the network or the Archive: the picks are made up or copied from the audit's examples, and files go to a temp folder.
// The last suite of the movie part puts the old behaviour back, one piece at a time, and shows that the fixtures catch it.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const H = require('../scripts/hunt-movies.js');
const J = require('../scripts/lib/moviejudge');
const HX = require('../scripts/lib/hardexclude');
const G = require('../scripts/lib/tvmazeguard');
const { moviesCheck, moviesLights } = require('../scripts/lib/matchcheck');

// ---------------------------------------------------------------- made-up and copied data
const mkMovie = (title, year, runtime, o = {}) => ({ tmdbId: o.tmdbId || 1, kind: 'tv-movie', title, year: String(year), runtime, votes: 10, state: 'MISSING', file: null, alternates: [], ...o });
// One file of an upload, in the shape a stored pick has. minutes is the file's length; the runtime band is worked out the way the hunt works it out.
function mkFile(m, stem, minutes, o = {}) {
  const seconds = Math.round(minutes * 60);
  return { item: o.item || 'item-' + stem.replace(/[^a-z0-9]+/gi, '-').slice(0, 30), itemTitle: o.itemTitle == null ? stem : o.itemTitle, stem, file: stem + '.mp4', format: 'h.264', playable: o.playable !== false, seconds, sizeMB: o.sizeMB || 500,
    band: H.runtimeBand(seconds, m.runtime), fileSim: J.titleSim(stem, m.title), url: 'https://example.invalid/' + encodeURIComponent(o.item || stem), conf: 0.9, ...(o.collection ? { collection: o.collection } : {}) };
}
const stateOf = (mod, m, f) => { const d = mod.judgeFile(f, { title: f.itemTitle, identifier: f.item, collection: f.collection }, m); return d.dropped ? 'DROP' : (d.conf >= mod.LIVE && f.playable) ? 'LIVE' : d.conf >= mod.REVIEW ? 'REVIEW' : 'MISSING'; };

// Each fixture: a movie, a file, and what the judge must say. 'LIVE' is exactly LIVE; 'not LIVE' is anything below it (REVIEW, MISSING or a drop).
// The wrong ones come from the audit's CP-022 evidence (stems and upload titles copied from catalog/movies); the right ones are the shapes a real film's upload takes.
const R2 = mkMovie('Richard II', 1997, 127), CT = mkMovie('Christmas Town', 2019, 90), FB = mkMovie('Flying Blind', 1990, 96), SN = mkMovie('Super Nova', 1997, 93), OM = mkMovie('Open Marriage', 2017, 87), UB = mkMovie('Ultimate Betrayal', 1994, 96);
const FIXTURES = [
  // another work playing under a short title (audit CP-022)
  ['Richard II playing Superman II, The Richard Donner Cut', R2, mkFile(R2, 'Superman II - The Richard Donner Cut (2006)', 115.6, { itemTitle: 'Superman II The Richard Donner Cut ( 2006)' }), 'not LIVE'],
  ['Christmas Town playing a Christmas parade', CT, mkFile(CT, '45th_Annual_Town_of_Smyrna_Christmas_Parade_-_2019', 79.9, { itemTitle: '45th Annual Town of Smyrna Christmas Parade - 2019' }), 'not LIVE'],
  ['Flying Blind playing a Zatoichi film', FB, mkFile(FB, 'Blind-Swordsman Revenge (Zatoichi vs. The Flying Guillotine)  ENGLISH Subtitled', 88.9, { itemTitle: 'Blind Swordsman Revenge ( Zatoichi Vs. The Flying Guillotine) ENGLISH Subtitled' }), 'not LIVE'],
  ['Super Nova playing a Knight Rider episode', SN, mkFile(SN, 'A_Super_Máquina_Knight_Rider_4ª_Temporada_-_Episódio_01_A_Nova_Aparência_de_K.I.T.T', 94.4, { itemTitle: 'A Super Máquina Knight Rider 4ª Temporada Episódio 01 A Nova Aparência De K. I. T. T' }), 'not LIVE'],
  ['Open Marriage playing Wide Open Marriage', OM, mkFile(OM, 'Wide Open Marriage, Hausfrauen Report 4  -1973', 80.2, { itemTitle: 'Wide Open Marriage, Hausfrauen Report 4 1973' }), 'not LIVE'],
  ['Ultimate Betrayal playing a Dead by Daylight stream', UB, mkFile(UB, '2022-02-25_The_Ultimate_Betrayal__Dead_by_Daylight_w_Blizzb3ar__Live_Gameplay_[47022]', 99.5, { itemTitle: 'The Ultimate Betrayal | Dead by Daylight w/ Blizzb3ar | Live Gameplay' }), 'not LIVE'],
  // the same titles when the name is the film
  ['Open Marriage when the name is the film, with its year', OM, mkFile(OM, 'Open Marriage (2017) 720p', 87), 'LIVE'],
  ['Richard II when the upload is Richard II', R2, mkFile(R2, 'Richard II (1997)', 126), 'LIVE'],
  ['Christmas Town when the upload is Christmas Town', CT, mkFile(CT, 'Christmas.Town.2019.720p.WEBRip.x264', 88), 'LIVE'],
  // the title inside a longer title, or a sequel
  ['Halloween is not Halloween 4', mkMovie('Halloween', 1978, 91), mkFile(mkMovie('Halloween', 1978, 91), 'Halloween 4 The Return of Michael Myers (1988)', 88), 'not LIVE'],
  ['If These Walls Could Talk is not number 2', mkMovie('If These Walls Could Talk', 1996, 97), mkFile(mkMovie('If These Walls Could Talk', 1996, 97), 'If These Walls Could Talk 2 (2000)', 97), 'not LIVE'],
  ['Treasure Island is not Muppets Treasure Island', mkMovie('Treasure Island', 1990, 131), mkFile(mkMovie('Treasure Island', 1990, 131), 'Muppets Treasure Island ABC WOC 2001-05-27', 120), 'not LIVE'],
  ['Banshee is not Cry of the Banshee (an article does not rescue a longer title)', mkMovie('Banshee', 2006, 95), mkFile(mkMovie('Banshee', 2006, 95), 'Cry of the Banshee 1970', 91), 'not LIVE'],
  ['The Women is not 8 Women', mkMovie('The Women', 2002, 126), mkFile(mkMovie('The Women', 2002, 126), '8 Women (2002)', 111, { itemTitle: '8 Women (2002)' }), 'not LIVE'],
  ['Z-O-M-B-I-E-S is not number 2', mkMovie('Z-O-M-B-I-E-S', 2018, 94), mkFile(mkMovie('Z-O-M-B-I-E-S', 2018, 94), 'z-o-m-b-i-e-s-2_360', 84, { itemTitle: 'Z-O-M-B-I-E-S 2 2020' }), 'not LIVE'],
  // things that may stand around a title
  ['a network in front: Lifetime-Liz & Dick [2012]', mkMovie('Liz & Dick', 2012, 88), mkFile(mkMovie('Liz & Dick', 2012, 88), 'Lifetime-Liz & Dick [2012]', 85), 'LIVE'],
  ['a possessive naming a person: Stephen King\'s Quicksilver Highway', mkMovie('Quicksilver Highway', 1997, 90), mkFile(mkMovie('Quicksilver Highway', 1997, 90), 'STEPHEN KING\'S QUICKSILVER HIGHWAY- PREMIERE FULL MOVIE', 90), 'LIVE'], // no year in the name; two words, so the runtime has to be within 5%, and it is exact
  ['a one-word possessive is not an owner: Dogwalker\'s Christmas Tail', mkMovie('A Christmas Tail', 2014, 87), mkFile(mkMovie('A Christmas Tail', 2014, 87), 'A Dogwalker\'s Christmas Tale (2015)', 86, { itemTitle: 'Dogwalker\'s Christmas Tail' }), 'not LIVE'],
  ['"aka" ends the name: Survive The Night aka Night Hunt', mkMovie('Survive The Night', 1993, 91), mkFile(mkMovie('Survive The Night', 1993, 91), 'CG.Survive the Night aka Night Hunt (Bill Corcoran,1993).Ripped', 89, { itemTitle: 'Survive The Night Aka Night Hunt ( Bill Corcoran, 1993)' }), 'LIVE'],
  ['a movie word and a network after the title', mkMovie('Victim of Love', 1991, 92), mkFile(mkMovie('Victim of Love', 1991, 92), 'Victim of Love CBS 1991 TV Movie - Pierce Brosnan', 92), 'LIVE'],
  // a year that is not the movie's, a date in front, an episode of a series
  ['Grey Gardens (1975) is not the 2009 film', mkMovie('Grey Gardens', 2009, 104), mkFile(mkMovie('Grey Gardens', 2009, 104), 'Grey Gardens (1975)', 103.5), 'not LIVE'],
  ['a year in the movie\'s own title is not a conflict: Knight Rider 2000', mkMovie('Knight Rider 2000', 1991, 95), mkFile(mkMovie('Knight Rider 2000', 1991, 95), 'Knight Rider 2000 (1991)', 95), 'LIVE'],
  ['an upload dated in front is no evidence of a title', mkMovie('A Reason for the Season', 2024, 84), mkFile(mkMovie('A Reason for the Season', 2024, 84), '2023-12-10 The Reason For the Season', 83, { itemTitle: '2023-12-10 The Reason For the Season' }), 'not LIVE'],
  ['a stem that begins with a date is no evidence of a title, even with the year in it', mkMovie('Open Marriage', 2017, 87), mkFile(mkMovie('Open Marriage', 2017, 87), '20221224 Open Marriage (2017)', 87), 'not LIVE'],
  ['an episode of a series, the marker in front: S10E12 Sin Bin', mkMovie('Sin Bin', 1994, 65), mkFile(mkMovie('Sin Bin', 1994, 65), 'S10E12 Sin Bin', 63.2), 'not LIVE'],
  ['an episode of a series, the marker behind: Sin Bin S10E12', mkMovie('Sin Bin', 1994, 65), mkFile(mkMovie('Sin Bin', 1994, 65), 'Sin Bin S10E12', 63.2), 'not LIVE'],
  ['season 0 is how uploads number specials: not an episode', mkMovie('Kojak: It\'s Always Something', 1990, 96), mkFile(mkMovie('Kojak: It\'s Always Something', 1990, 96), 'Kojak - S00E07 - It\'s Always Something (1990)', 96), 'LIVE'],
  ['"Season" in the movie\'s own title is not an episode: Open Season 2', mkMovie('Open Season 2', 2008, 76), mkFile(mkMovie('Open Season 2', 2008, 76), 'Open Season 2 (2009)', 76), 'LIVE'],
  ['nor is "Season 4" in the name of a film called Open Season: Scared Silly', mkMovie('Open Season: Scared Silly', 2015, 83), mkFile(mkMovie('Open Season: Scared Silly', 2015, 83), 'getvid (19)', 83, { itemTitle: 'Open Season 4: Scared Silly (2016)' }), 'LIVE'],
  ['but a season of a series is not a film: Super Force (TV Series 1990-1992) Season 1', mkMovie('Super Force', 1990, 100), mkFile(mkMovie('Super Force', 1990, 100), 'S1 Ep. 01 - 04 A Hero\'s Welcome, Too Late The Hero', 92, { itemTitle: 'Super Force (TV Series 1990-1992) Season 1' }), 'not LIVE'],
  // short titles
  ['a two-word title with no year and a runtime 11% off is held at REVIEW', mkMovie('Stone Cold', 2005, 87), mkFile(mkMovie('Stone Cold', 2005, 87), 'Stone Cold', 96.5, { itemTitle: 'Stone Cold' }), 'not LIVE'],
  ['a one-word title backed by a runtime within 5%: Sharknado', mkMovie('Sharknado', 2013, 87), mkFile(mkMovie('Sharknado', 2013, 87), 'Sharknado', 83, { itemTitle: 'Sharknado' }), 'LIVE'],
  ['a title of three words or more needs neither a year nor the 5%: inside the 15% band it is LIVE', mkMovie('The Brady Bunch in the White House', 2002, 88), mkFile(mkMovie('The Brady Bunch in the White House', 2002, 88), 'The Brady Bunch in the White House', 99, { itemTitle: 'The Brady Bunch in the White House' }), 'LIVE'],
  ['and outside the 15% band (the runtime is 19% long) it is REVIEW', mkMovie('The Brady Bunch in the White House', 2002, 88), mkFile(mkMovie('The Brady Bunch in the White House', 2002, 88), 'The Brady Bunch in the White House', 105, { itemTitle: 'The Brady Bunch in the White House' }), 'not LIVE'],
  // the title in parts, and the same words in another order
  ['"Perry Mason: The Case of the Killer Kiss" written with its series name', mkMovie('Perry Mason: The Case of the Killer Kiss', 1993, 96), mkFile(mkMovie('Perry Mason: The Case of the Killer Kiss', 1993, 96), 'A Perry Mason Mystery - The Case of The Killer Kiss (1993)', 95), 'LIVE'],
  ['"Bo Burnham: Inside" written INSIDE Bo Burnham (same words, runtime within 5%)', mkMovie('Bo Burnham: Inside', 2021, 88), mkFile(mkMovie('Bo Burnham: Inside', 2021, 88), 'INSIDE Bo Burnham', 88, { itemTitle: 'INSIDE Bo Burnham' }), 'LIVE'],
  ['two words in the other order are another title: A Sister\'s Nightmare, Nightmare Sisters', mkMovie('A Sister\'s Nightmare', 2013, 86), mkFile(mkMovie('A Sister\'s Nightmare', 2013, 86), 'Nightmare Sisters 1988', 82, { itemTitle: 'Nightmare Sisters 1988' }), 'not LIVE'],
  // games, streams and playlists are not films
  ['a playlist of a web series', mkMovie('Frenemies', 2012, 86), mkFile(mkMovie('Frenemies', 2012, 86), '6 - Trisha & Ethan Reconcile.Kind of - Frenemies #6', 84, { itemTitle: 'Frenemies - Full Playlist' }), 'not LIVE'],
  ['a game longplay', mkMovie('Rainbow Drive', 1990, 100), mkFile(mkMovie('Rainbow Drive', 1990, 100), 'Mega_Drive_Longplay_239_Rainbow_Islands_Extra', 96, { itemTitle: 'Mega Drive Longplay [239] Rainbow Islands Extra' }), 'not LIVE'],
  // news and government (CP-023)
  ['a C-SPAN recording under a film title', mkMovie('Crossfire', 2016, 90), mkFile(mkMovie('Crossfire', 2016, 90), 'CSPAN2_20201204_183200_Senate_Homeland_Security_Committee_Hearing', 88, { item: 'CSPAN2_20201204_183200_Senate_Homeland_Security_Committee_Hearing', itemTitle: 'Senate Homeland Security Committee Hearing : CSPAN2 : December 4, 2020' }), 'DROP'],
  ['a city council meeting under a film title', mkMovie('Reg', 2016, 90), mkFile(mkMovie('Reg', 2016, 90), 'Jan_2016_Reg_City_Council_Mtg_Audio_Only', 90, { itemTitle: 'Jan 2016 Reg City Council Mtg Audio Only' }), 'DROP'],
  ['an upload filed under the Archive\'s news collection', mkMovie('Freedom Song', 2000, 112), mkFile(mkMovie('Freedom Song', 2000, 112), 'Freedom Song', 112, { itemTitle: 'Freedom Song', collection: ['TV-BET', 'tvarchive', 'tvnews'] }), 'DROP'],
];

function fixtureFailures(mod) {
  const bad = [];
  for (const [name, m, f, want] of FIXTURES) {
    const got = stateOf(mod, m, f);
    if (want === 'LIVE' ? got !== 'LIVE' : want === 'DROP' ? got !== 'DROP' : got === 'LIVE') bad.push(`${name}: wanted ${want}, got ${got}`);
  }
  return bad;
}

// ---------------------------------------------------------------- the judge
describe('the judge (CP-022)', () => {
  test('every fixture comes out as it should: the wrong works are not LIVE, the right ones are', () => {
    assert.deepEqual(fixtureFailures(J), []);
  });
  test('the five named examples and the Dead by Daylight stream are held below LIVE, and still on the list as REVIEW at best (word overlap is for REVIEW only)', () => {
    for (const [name, m, f, want] of FIXTURES.slice(0, 6)) {
      const d = J.judgeFile(f, { title: f.itemTitle, identifier: f.item }, m);
      assert.ok(d.conf < J.LIVE, name + ' conf ' + d.conf);
      assert.ok(d.conf >= 0 && d.conf <= 1);
      assert.notEqual(want, 'LIVE');
    }
    // word overlap alone: every word of the title is in the name, in no phrase. Old titleSim gave 0.95 here; the judge may not let it reach LIVE
    const m = R2, f = FIXTURES[0][2];
    assert.ok(J.titleSim(f.itemTitle, m.title) >= 0.9, 'the loose similarity still sees the words: that is how the candidate is found');
    assert.equal(J.titlePhrase(m.title, [f.stem, f.itemTitle]).kind, 'none');
    assert.ok(J.judgeFile(f, { title: f.itemTitle }, m).conf >= J.REVIEW, 'and REVIEW keeps it for a person to look at');
  });
  test('the phrase test: whole words, nothing glued in front, nothing run on behind', () => {
    const kind = (title, text) => J.titlePhrase(title, [text]).kind;
    assert.equal(kind('Open Marriage', 'Open Marriage (1985)'), 'names');
    assert.equal(kind('Open Marriage', 'open_marriage.1985.720p'), 'names', '. _ - are separators');
    assert.equal(kind('Open Marriage', 'Wide Open Marriage'), 'longer');
    assert.equal(kind('Open Marriage', 'Open Marriages'), 'none', 'whole words only');
    assert.equal(kind('Open Marriage', 'Open Marriage Report 3'), 'longer', 'the title runs on into another word');
    assert.equal(kind('Open Marriage', 'Open Marriage: The Documentary'), 'names', 'a colon ends the name');
    assert.equal(kind('Open Marriage', 'Open Marriage - Special Edition'), 'names', 'a dash with spaces ends the name');
    assert.equal(kind('The Haunting of Hill House', 'Haunting Of Hill House (2018)'), 'names', 'a leading "The" is optional');
    assert.equal(kind('Open Marriage', 'Open Marriage 4'), 'longer', 'a small number straight after the title is a sequel');
    assert.equal(kind('Open Marriage', 'Open Marriage II'), 'longer', 'so is a roman numeral');
    assert.equal(kind('Open Marriage', 'Open Marriage 1985'), 'names', 'a year is not');
    assert.equal(kind('Open Marriage', 'Open Marriage, The Movie'), 'names');
    assert.equal(kind('Open Marriage', 'Open Marriage Movie Night'), 'longer', 'the rest of the name has to end too');
    assert.equal(kind('Open Marriage', '2011-09-21 Open Marriage'), 'none', 'a name that begins with a date is no evidence');
    assert.equal(J.titlePhrase('Open Marriage', ['Wide Open Marriage (1973)', 'Open Marriage (1973)']).kind, 'names', 'either name may carry the title');
  });
  test('the rules to the right of the title are the series matcher\'s (closesName), not a second copy', () => {
    const M = require('../scripts/match.js');
    for (const rest of [' (2005)', ' - Special', ': The Movie', ' 720p', ' complete', ' foo', ' sunset boulevard']) {
      const mine = J.titlePhrase('Zork Show', ['Zork Show' + rest]).kind === 'names';
      const theirs = M.closesName(rest, J.MOVIE_AFTER);
      assert.equal(mine, theirs, JSON.stringify(rest));
    }
  });
  test('the judge never drops a movie\'s record: a pick is judged, nothing else is touched', () => {
    const m = mkMovie('Open Marriage', 2017, 87), f = mkFile(m, 'Wide Open Marriage, Hausfrauen Report 4  -1973', 80);
    const before = JSON.stringify([m, f]);
    J.judgeFile(f, { title: f.itemTitle }, m);
    assert.equal(JSON.stringify([m, f]), before);
  });
  test('the loose similarity still finds candidates (it is not what makes a pick LIVE)', () => {
    assert.ok(J.titleSim('Superman II The Richard Donner Cut', 'Richard II') >= 0.9);
    assert.equal(J.titleSim('', 'x'), 0);
    assert.ok(J.itemScore({ title: 'Open Marriage (2017)', year: '2017' }, OM) > 0.6);
    assert.ok(J.itemScore({ title: 'Open Marriage trailer' }, OM) < 0.6, 'a trailer is not worth an Archive call');
  });
});

// ---------------------------------------------------------------- hard excludes
describe('hard excludes (CP-023)', () => {
  test('C-SPAN, hearings, councils, school boards, work sessions, press conferences, elections and news are all caught, whichever way they are written', () => {
    for (const stem of ['CSPAN2_20201204_Senate_Hearing', 'C-SPAN Washington Journal', 'c span 3 live', 'Senate Armed Services Committee', 'Portland Metro Council VIDEO', 'North Salem Planning Board Work Session', 'FY25 Adopted Budget Work Session', 'School Board Meeting 2019',
      'Selectmen Meeting', 'White House Press Conference', 'NEW ELECTION 2021', 'CBS Eyewitness News with', 'NBC News Special', 'Tech News Today 1557', 'Royal Oak City Commission Goal setting', 'Subcommittee on Oversight', 'a public hearing on the budget']) {
      assert.ok(HX.hardExclude({ stem }, 'Some Film'), stem);
    }
  });
  test('ordinary film names are clean', () => {
    for (const stem of ['Sharknado', 'The Ultimate Betrayal', 'Hard of Hearing (1999)', 'Hearing the Brain', 'Newsies', 'Cometeers of one', 'Open Marriage (2017) 720p', 'Reelection', 'Spanish Harlem']) {
      assert.equal(HX.hardExclude({ stem, title: stem }, 'Some Film'), null, stem);
    }
  });
  test('a film whose own title holds the word is not punished for its own title, but the rest of the name still counts', () => {
    assert.equal(HX.hardExclude({ stem: 'Election.1999.720p', title: 'Election (1999)' }, 'Election'), null);
    assert.equal(HX.hardExclude({ stem: 'The_Committee_1968', title: 'The Committee (1968)' }, 'The Committee'), null);
    assert.equal(HX.hardExclude({ stem: 'Committee 1968', title: 'Committee' }, 'The Committee'), null, 'with or without the "The"');
    assert.ok(HX.hardExclude({ stem: 'House Judiciary Committee Hearing', title: 'House Judiciary Committee Hearing' }, 'Committee'), 'the film is called Committee, the name is a hearing');
    assert.ok(HX.hardExclude({ stem: 'CSPAN2_20160129_013400_Election_Night', item: 'CSPAN2_20160129_013400_Election_Night' }, 'Election'), 'the C-SPAN code is not part of any film title');
    assert.equal(HX.hardExclude({ stem: 'News to Me (2015)' }, 'News to Me'), null);
  });
  test('the Archive\'s TV News Archive names (CHANNEL_YYYYMMDD_HHMMSS_Title) and its news collections are news by definition', () => {
    assert.equal(HX.hardExclude({ item: 'CNNW_20211108_060000_This_Is_Life_With_Lisa_Ling' }, 'x').kind, 'news');
    assert.equal(HX.hardExclude({ stem: 'CSPAN3_20200105_134500_World_War_II_U.S._Navy_Wome' }, 'x').kind, 'government');
    assert.equal(HX.hardExclude({ item: 'VID_20230216_131500' }, 'x'), null, 'a phone clip has no title after the time');
    assert.equal(HX.hardExclude({ item: 'InShot_20251020_135601437' }, 'x'), null);
    assert.ok(HX.hardExclude({ collection: ['TV-KPIX', 'tvarchive', 'tvnews'] }, 'x'));
    assert.ok(HX.hardExclude({ collection: 'newsandpublicaffairs' }, 'x'));
    assert.equal(HX.hardExclude({ collection: ['opensource_movies', 'fav-someone'] }, 'x'), null);
  });
  test('the judge drops such a pick: no confidence, a named reason, never LIVE or REVIEW', () => {
    const [, m, f] = FIXTURES.find((x) => /C-SPAN recording/.test(x[0]));
    const d = J.judgeFile(f, { title: f.itemTitle, identifier: f.item }, m);
    assert.equal(d.conf, 0);
    assert.deepEqual([d.dropped.term, d.dropped.field, d.dropped.kind], ['CSPAN2', 'item', 'government']);
    assert.match(d.why[0], /hard exclude: CSPAN2 in the item/);
  });
  test('the pattern is one shared pattern, and the hunt\'s and the doctor\'s calls go through it', () => {
    assert.ok(HX.HARD_EXCLUDE instanceof RegExp);
    assert.match(fs.readFileSync(path.join(__dirname, '..', 'scripts', 'lib', 'moviejudge.js'), 'utf8'), /require\('\.\/hardexclude'\)/);
    assert.match(fs.readFileSync(path.join(__dirname, '..', 'scripts', 'hunt-movies.js'), 'utf8'), /require\('\.\/lib\/hardexclude'\)/);
    assert.match(fs.readFileSync(path.join(__dirname, '..', 'scripts', 'lib', 'matchcheck.js'), 'utf8'), /require\('\.\/hardexclude'\)/);
  });
});

// ---------------------------------------------------------------- --rescore
const withDir = (fn) => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'movies-test-')); try { return fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); } };
const put = (dir, name, rec) => fs.writeFileSync(path.join(dir, name + '.json'), JSON.stringify(rec, null, 2));
const live = (m, f, alts = []) => ({ ...m, state: 'LIVE', file: f, alternates: alts, huntedAt: '2026-10-15T00:00:00.000Z' });
const noNetwork = (fn) => { const keep = globalThis.fetch; let calls = 0; globalThis.fetch = () => { calls++; throw new Error('the rescore must not use the network'); }; try { const r = fn(); assert.equal(calls, 0); return r; } finally { globalThis.fetch = keep; } };

describe('--rescore', () => {
  test('a record whose only pick is a wrong work goes LIVE to REVIEW, keeps its place, and says why', () => {
    const [, m, f] = FIXTURES[0];
    const r = H.rescoreRecord(live(m, f), null);
    assert.deepEqual([r.was, r.now, r.stateChanged], ['LIVE', 'REVIEW', true]);
    assert.equal(r.rec.title, 'Richard II');
    assert.ok(r.rec.file && r.rec.file.url === f.url, 'the pick stays: word overlap is kept for REVIEW');
    assert.match(r.rec.rescored.why, /not a phrase|inside a longer title/);
    assert.equal(r.rec.rescored.was, 'LIVE');
  });
  test('a hard-excluded pick leaves: with nothing else the record becomes MISSING with file null, never vanishes', () => {
    const [, m, f] = FIXTURES.find((x) => /C-SPAN recording/.test(x[0]));
    const r = H.rescoreRecord(live(m, f), null);
    assert.deepEqual([r.now, r.rec.file, r.rec.alternates, r.dropped.length], ['MISSING', null, [], 1]);
    assert.equal(r.rec.tmdbId, m.tmdbId);
    assert.match(r.rec.rescored.why, /hard exclude: CSPAN2/);
  });
  test('a good alternate takes over when the first pick is dropped or wrong (Sin Bin: the series episode loses to "Screen Two - Sin Bin")', () => {
    const m = mkMovie('Sin Bin', 1994, 65);
    const wrong = mkFile(m, 'S10E12 Sin Bin', 63.2), right = mkFile(m, 'Screen Two - Sin Bin', 63.2, { itemTitle: '(Screen Two) Sin Bin', item: 'screen-two-sin-bin' });
    const r = H.rescoreRecord(live(m, wrong, [right]), null);
    assert.equal(r.rec.file.stem, 'Screen Two - Sin Bin');
    assert.equal(r.now, 'LIVE');
    assert.deepEqual(r.rec.alternates.map((a) => a.stem), ['S10E12 Sin Bin'], 'the wrong one stays as an alternate, below the good one');
    assert.equal(r.changed, true);
    assert.equal(r.stateChanged, false);
  });
  test('a right pick stays as it is: same state, same file, nothing to write', () => {
    const m = mkMovie('Open Marriage', 2017, 87), f = mkFile(m, 'Open Marriage (2017) 720p', 87);
    const r = H.rescoreRecord(live(m, f), null);
    assert.deepEqual([r.now, r.changed, r.rec.file.url], ['LIVE', false, f.url]);
    assert.equal(r.rec.rescored, undefined);
  });
  test('MISSING stays MISSING, and an unplayable best pick is never LIVE', () => {
    const m = mkMovie('Open Marriage', 2017, 87);
    assert.deepEqual([H.rescoreRecord({ ...m, state: 'MISSING', file: null, alternates: [] }, null).now, H.rescoreRecord({ ...m, state: 'MISSING', file: null, alternates: [] }, null).changed], ['MISSING', false]);
    const f = mkFile(m, 'Open Marriage (2017) 720p', 87, { playable: false });
    assert.equal(H.rescoreRecord({ ...m, state: 'REVIEW', file: f, alternates: [] }, null).now, 'REVIEW');
  });
  test('the collections an upload sits in come from the cached scrape pages when the pick does not carry them', () => {
    withDir((cache) => {
      const m = mkMovie('Freedom Song', 2000, 112, { tmdbId: 777 });
      const f = mkFile(m, 'Freedom Song', 112, { itemTitle: 'Freedom Song', item: 'some-item' });
      assert.equal(H.rescoreRecord(live(m, f), null).now, 'LIVE', 'nothing in the name or the identifier says news');
      fs.writeFileSync(path.join(cache, 'mscrape-title-777.json'), JSON.stringify({ items: [{ identifier: 'some-item', title: 'Freedom Song', collection: ['TV-BET', 'tvarchive', 'tvnews'] }] }));
      const lookup = H.collectionLookup(cache);
      assert.deepEqual(lookup(m, f), ['TV-BET', 'tvarchive', 'tvnews']);
      assert.equal(H.rescoreRecord(live(m, f), lookup).now, 'MISSING');
      assert.equal(H.collectionLookup(path.join(cache, 'nothing-here'))(m, f), undefined, 'a cache that is not on this PC is not an error');
    });
  });
  test('rescoreAll: dry by default (no file changes), counts and moves, a log line for each change; with write it changes only the records that changed and nothing vanishes', () => {
    withDir((dir) => {
      const [, a, fa] = FIXTURES[0], [, b, fb] = FIXTURES.find((x) => /C-SPAN recording/.test(x[0])), c = mkMovie('Open Marriage', 2017, 87), fc = mkFile(c, 'Open Marriage (2017) 720p', 87);
      put(dir, 'richard-ii-1997', live(mkMovie('Richard II', 1997, 127, { tmdbId: 1 }), fa)); put(dir, 'crossfire-2016', live({ ...b, tmdbId: 2 }, fb)); put(dir, 'open-marriage-2017', live({ ...c, tmdbId: 3 }, fc));
      put(dir, 'lost-2001', { ...mkMovie('Lost', 2001, 90, { tmdbId: 4 }), state: 'MISSING', file: null, alternates: [] });
      const snapshot = () => fs.readdirSync(dir).sort().map((n) => n + ':' + fs.readFileSync(path.join(dir, n), 'utf8')).join('\n');
      const before = snapshot();
      const lines = [];
      const dry = noNetwork(() => H.rescoreAll({ dir, cacheDir: null, write: false, log: (l) => lines.push(l) }));
      assert.equal(snapshot(), before, 'a dry run writes nothing');
      assert.deepEqual(dry.counts.before, { LIVE: 3, MISSING: 1 });
      assert.deepEqual(dry.counts.after, { LIVE: 1, REVIEW: 1, MISSING: 2 });
      assert.deepEqual(dry.moves, { 'LIVE>REVIEW': 1, 'LIVE>MISSING': 1 });
      assert.ok(lines.some((l) => /LIVE\s+-> REVIEW\s+Richard II \(1997\).*because/.test(l)), lines.join('\n'));
      assert.ok(lines.some((l) => /^dropped\s+Crossfire \(2016\).*government: "CSPAN2" in the item/.test(l)), lines.join('\n'));
      const wet = noNetwork(() => H.rescoreAll({ dir, cacheDir: null, write: true, log: () => {} }));
      assert.equal(fs.readdirSync(dir).length, 4, 'every record is still there');
      assert.equal(wet.results.filter((x) => x.changed).length, 2);
      const read = (n) => JSON.parse(fs.readFileSync(path.join(dir, n + '.json'), 'utf8'));
      assert.equal(read('richard-ii-1997').state, 'REVIEW');
      assert.deepEqual([read('crossfire-2016').state, read('crossfire-2016').file], ['MISSING', null]);
      assert.equal(read('open-marriage-2017').rescored, undefined, 'the record that did not change was not touched');
      const again = H.rescoreAll({ dir, cacheDir: null, write: false });
      assert.equal(again.results.filter((x) => x.changed).length, 0, 'a second run finds nothing more to change');
    });
  });
  test('the script prints the dry run and says nothing was written (command line, no network)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'hunt-movies.js'), 'utf8');
    assert.match(src, /--rescore --write/);
    assert.match(src, /Nothing was written; add --write to write them/);
  });
});

// ---------------------------------------------------------------- the hunt itself, with the Archive and the disk stood in for
describe('the hunt uses the same judge', () => {
  const fakeArchive = (items, metas) => {
    const keys = [];
    const getJson = async (url, key) => {
      keys.push(key);
      if (/^mscrape/.test(key)) return { items };
      const id = Object.keys(metas).find((k) => 'meta-' + k.replace(/[^a-z0-9._-]/gi, '_') === key);
      if (id) return metas[id];
      throw new Error('unexpected request ' + key);
    };
    return { getJson, keys };
  };
  const vid = (name, minutes) => ({ name, format: 'h.264', length: String(minutes * 60), size: '900000000', source: 'original' });
  test('a C-SPAN upload is never opened, a wrong work stays below LIVE, a hearing file in a good upload is dropped, and the right file wins', async () => {
    const m = mkMovie('Richard II', 1997, 127, { tmdbId: 42, kind: 'tv-movie' });
    const items = [
      { identifier: 'CSPAN2_20201204_183200_Richard_II_Hearing', title: 'Richard II hearing', collection: ['TV-CSPAN2', 'tvarchive', 'tvnews'], downloads: 5 },
      { identifier: 'superman-ii', title: 'Superman II The Richard Donner Cut ( 2006)', downloads: 900 },
      { identifier: 'richard-ii-1997', title: 'Richard II (1997)', collection: ['opensource_movies'], downloads: 50 },
    ];
    const metas = {
      'superman-ii': { metadata: { title: 'Superman II The Richard Donner Cut ( 2006)' }, files: [vid('Superman II - The Richard Donner Cut (2006).mp4', 115.6)] },
      'richard-ii-1997': { metadata: { title: 'Richard II (1997)' }, files: [vid('Richard II (1997).mp4', 126), vid('Richard II House Committee Hearing.mp4', 126)] },
      'CSPAN2_20201204_183200_Richard_II_Hearing': { metadata: { title: 'Richard II hearing' }, files: [vid('CSPAN2_20201204_183200_Richard_II_Hearing.mp4', 126)] },
    };
    const { getJson, keys } = fakeArchive(items, metas);
    const saved = [], lines = [];
    const rec = await H.huntMovie({ ...m, rating: 7, votes: 3 }, { getJson, save: (r) => saved.push(r), log: (l) => lines.push(l) });
    assert.equal(keys.includes('meta-CSPAN2_20201204_183200_Richard_II_Hearing'), false, 'the C-SPAN upload cost no Archive call');
    assert.deepEqual(keys.filter((k) => /^meta-/.test(k)).sort(), ['meta-richard-ii-1997', 'meta-superman-ii']);
    assert.equal(rec.state, 'LIVE');
    assert.equal(rec.file.stem, 'Richard II (1997)');
    assert.deepEqual(rec.alternates.map((a) => a.stem), ['Superman II - The Richard Donner Cut (2006)'], 'the wrong work is kept as an alternate, below the right one');
    assert.ok(rec.alternates[0].conf < J.LIVE);
    assert.deepEqual(rec.file.collection, ['opensource_movies'], 'the pick keeps its collections so a later rescore can use them');
    assert.deepEqual(rec.excluded.map((x) => [x.item, x.term, x.file || null]), [['CSPAN2_20201204_183200_Richard_II_Hearing', 'TV-CSPAN2', null], ['richard-ii-1997', 'committee', 'Richard II House Committee Hearing']]);
    assert.equal(lines.filter((l) => /dropped upload CSPAN2_20201204/.test(l)).length, 1);
    assert.ok(lines.some((l) => /dropped file Richard II House Committee Hearing\s+\(government: "committee" in the stem\) for Richard II/.test(l)), lines.join('\n'));
    assert.equal(saved.length, 1);
  });
  test('when only wrong works turn up, the movie is REVIEW at best, never LIVE, and still has its record', async () => {
    const m = mkMovie('Richard II', 1997, 127, { tmdbId: 43, kind: 'tv-movie' });
    const { getJson } = fakeArchive([{ identifier: 'superman-ii', title: 'Superman II The Richard Donner Cut ( 2006)' }], { 'superman-ii': { metadata: { title: 'Superman II The Richard Donner Cut ( 2006)' }, files: [vid('Superman II - The Richard Donner Cut (2006).mp4', 115.6)] } });
    const rec = await H.huntMovie(m, { getJson, save: () => {}, log: () => {} });
    assert.equal(rec.state, 'REVIEW');
    assert.equal(rec.tmdbId, 43);
  });
});

// ---------------------------------------------------------------- the doctor's two lights
describe('the doctor lights movies:phrase and movies:hard-exclude', () => {
  test('counts LIVE picks without the title as a phrase and shipped picks that are news or government; green when clean', () => {
    withDir((dir) => {
      const [, a, fa] = FIXTURES[0], [, b, fb] = FIXTURES.find((x) => /C-SPAN recording/.test(x[0])), c = mkMovie('Open Marriage', 2017, 87), fc = mkFile(c, 'Open Marriage (2017) 720p', 87);
      put(dir, 'ok', live({ ...c, tmdbId: 3 }, fc));
      let l = moviesLights({ moviesDir: dir });
      assert.deepEqual([l.phrase.level, l.hardExclude.level], ['green', 'green']);
      put(dir, 'richard', live({ ...mkMovie('Richard II', 1997, 127, { tmdbId: 1 }) }, fa));
      put(dir, 'crossfire', { ...b, tmdbId: 2, state: 'REVIEW', file: fb, alternates: [] });
      put(dir, 'missing', { ...mkMovie('Lost', 2001, 90, { tmdbId: 4 }), state: 'MISSING', file: null, alternates: [] });
      l = moviesLights({ moviesDir: dir });
      assert.equal(l.phrase.level, 'yellow');
      assert.match(l.phrase.detail, /1 of 2 LIVE movies do not carry their title as a phrase.*Richard II/);
      assert.equal(l.hardExclude.level, 'red');
      assert.match(l.hardExclude.detail, /1 shipped movie picks are C-SPAN, hearing, council or news material \(0 LIVE, 1 REVIEW\).*CSPAN2/);
      assert.match(l.phrase.fix, /hunt-movies\.js --rescore/);
      const c2 = moviesCheck({ moviesDir: dir });
      assert.equal(c2.scanned, 4);
      assert.equal(moviesLights({ moviesDir: path.join(dir, 'nothing-here') }).phrase.level, 'green');
    });
  });
  test('an unplayable pick is not shipped, so it does not count as shipped news', () => {
    withDir((dir) => {
      const [, b, fb] = FIXTURES.find((x) => /C-SPAN recording/.test(x[0]));
      put(dir, 'crossfire', { ...b, state: 'REVIEW', file: { ...fb, playable: false }, alternates: [] });
      assert.equal(moviesLights({ moviesDir: dir }).hardExclude.level, 'green');
    });
  });
  test('the doctor wires both lights in, by their names', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'doctor.js'), 'utf8');
    assert.match(src, /add\('movies:phrase'/);
    assert.match(src, /add\('movies:hard-exclude'/);
    const runbook = fs.readFileSync(path.join(__dirname, '..', 'docs', 'RUNBOOK.md'), 'utf8');
    assert.match(runbook, /\| movies:phrase \|/);
    assert.match(runbook, /\| movies:hard-exclude \|/);
  });
});

// ---------------------------------------------------------------- the deliberate-bug check
// Put the old behaviour back, one piece at a time, in a copy of the judge. Each fixture suite run against the copy must fail; if it does not, the fixtures do not guard that rule.
function loadMutated(replacements) {
  const file = require.resolve('../scripts/lib/moviejudge');
  let src = fs.readFileSync(file, 'utf8');
  for (const [from, to] of replacements) { assert.ok(src.includes(from), 'the mutation target is gone from moviejudge.js, update this test: ' + from); src = src.replace(from, to); }
  src = src.replace("require('../match.js')", 'require(' + JSON.stringify(path.resolve(path.dirname(file), '..', 'match.js')) + ')').replace("require('./hardexclude')", 'require(' + JSON.stringify(path.resolve(path.dirname(file), 'hardexclude.js')) + ')');
  const tmp = path.join(os.tmpdir(), 'moviejudge-mutant-' + process.pid + '-' + Math.random().toString(36).slice(2) + '.js');
  fs.writeFileSync(tmp, src);
  try { return require(tmp); } finally { fs.rmSync(tmp, { force: true }); }
}
describe('deliberate bugs: each old behaviour put back makes the fixtures fail', () => {
  const bugs = {
    'the old titleSim decides LIVE (every word anywhere in the name gives 0.95)': [["const phraseOk = ph.kind === 'names' || ph.kind === 'words';", 'const phraseOk = true;'], ['const sim = phraseOk ? Math.max(loose, 0.9) : Math.min(loose, 0.89);', 'const sim = loose;']],
    'the left side is not checked (Wide Open Marriage is Open Marriage)': [['function leftOk(t, s, idx, pos) {', 'function leftOk(t, s, idx, pos) { return true;']],
    'a sequel is the title (Halloween 4, Z-O-M-B-I-E-S 2)': [["if (/^(?:[2-9]|1\\d)$/.test(tok) || /^(?:ii|iii|iv|vi|vii|viii|ix|xi|xii)$/.test(tok)) return false;", '']],
    'short titles need no year and no runtime check': [['else if (n <= 2 && !(yearIn || rt5))', 'else if (false)']],
    'a year that is not the movie\'s is allowed': [['else if (yearConflict(ph.in, m.year, m.title))', 'else if (false)']],
    'a date at the start of a name is evidence': [['if (!raw || STARTS_WITH_DATE.test(String(raw))) continue;', 'if (!raw) continue;']],
    'an episode of a series is a movie': [['else if (!/\\bseason\\b/i.test(m.title) &&', 'else if (false &&']],
    'the hard exclude is not asked': [['const ex = hardExclude(', 'const ex = null && hardExclude(']],
    'games and playlists are films': [['|\\bplaylist\\b|walkthrough|playthrough|gameplay|let\'?s play|longplay|speedrun|podcast|live ?stream|\\bvlog\\b/i', '/i']],
  };
  for (const [name, replacements] of Object.entries(bugs)) {
    test(name, () => {
      const mutant = loadMutated(replacements);
      assert.ok(fixtureFailures(mutant).length > 0, 'the fixtures did not notice');
    });
  }
  test('and the real judge passes the same fixtures', () => {
    assert.deepEqual(fixtureFailures(J), []);
  });
});

// ---------------------------------------------------------------- TVmaze near names (CP-034)
// The five shows named in the audit, with what the cached TVmaze files in the real tree's catalog/cache hold for them (name and premiered; the cache keeps no language or type),
// then 40 shows whose names are fine. The list rows are copied from scripts/show-list.json.
describe('TVmaze near-name guard (CP-034)', () => {
  const E = (name, type, language) => ({ name, type, ...(language ? { language } : {}) });
  test('The Trap is not The Trap Door: TVmaze says English and Animation, the list says German and World TV', () => {
    const tv = { id: 5656, name: 'The Trap Door', premiered: '1986-10-06', network: 'ITV1' };
    const withFacts = G.nearNameGuard(E('The Trap', 'World TV', 'de'), { ...tv, language: 'English', type: 'Animation', genres: ['Comedy', 'Fantasy'] }); // language and type: what TVmaze's search answer carries, written here by hand (the cache does not keep them)
    assert.deepEqual([withFacts.ok, withFacts.near, withFacts.kind], [false, true, 'language']);
    assert.match(withFacts.reason, /language differs: the list says de, TVmaze says English/);
    const typeOnly = G.nearNameGuard(E('The Trap', 'World TV'), { ...tv, language: 'English', type: 'Animation' });
    assert.deepEqual([typeOnly.ok, typeOnly.kind], [false, 'type'], 'with no language on the list entry, the Animation type still says no');
    assert.equal(G.nearNameGuard(E('The Trap', 'World TV', 'de'), tv).ok, true, 'from the cached file alone (name and date) the guard cannot tell: this is why the real fix for the 31 grids already bound is a tvmazeId override');
  });
  test('Highlander: The Series is not Highlander: The Animated Series, and I Love the 70s is not I Love the \'90s (the cached names alone are enough)', () => {
    const a = G.nearNameGuard(E('Highlander: The Series', 'Sci-Fi, Fantasy and Horror'), { id: 1653, name: 'Highlander: The Animated Series', premiered: '1994-10-16' });
    assert.deepEqual([a.ok, a.near, a.kind], [false, true, 'name']);
    const b = G.nearNameGuard(E('I Love the 70s', 'Documentary & Geographic'), { id: 18732, name: 'I Love the \'90s', premiered: '2004-07-12' });
    assert.deepEqual([b.ok, b.kind], [false, 'name']);
    assert.match(G.rejectLine('I Love the 70s', 'I Love the \'90s', b), /TVmaze offered "I Love the '90s" for "I Love the 70s": near name refused \(.*\); treating as no match/);
  });
  test('Cosmos: the cached name is exactly "Cosmos", so the plain entry passes by name (it needs a tvmazeId override for the 2014 series), and "Cosmos: A Personal Voyage" is the 1980 series TVmaze names Cosmos', () => {
    const tv = { id: 1128, name: 'Cosmos', premiered: '1980-09-28', network: 'National Geographic' };
    assert.deepEqual([G.nearNameGuard(E('Cosmos', 'Streaming Era'), tv).ok, G.nearNameGuard(E('Cosmos', 'Streaming Era'), tv).kind], [true, 'same']);
    const pv = G.nearNameGuard(E('Cosmos: A Personal Voyage', 'Documentary & Geographic'), tv);
    assert.deepEqual([pv.ok, pv.near, pv.kind], [true, true, 'phrase'], 'right: it is the 1980 series');
    assert.equal(G.nearNameGuard(E('Cosmos: A Personal Voyage (1980)', 'Documentary & Geographic'), tv).ok, true, 'and with a year on the list name it is settled by the year');
    assert.equal(G.nearNameGuard(E('Cosmos: A Personal Voyage (2014)', 'Documentary & Geographic'), tv).ok, false, 'a year that is more than one off refuses');
  });
  test('the rules, one by one', () => {
    const tv = (o) => ({ name: 'Zork Show', premiered: '2001-05-01', ...o });
    assert.equal(G.nearNameGuard(E('The Zork Show (US)', 'Drama'), tv()).kind, 'same', 'a trailing (...) and a leading The are set aside');
    assert.equal(G.nearNameGuard(E('Carnivale', 'Drama'), tv({ name: 'Carnivàle' })).kind, 'same', 'accents');
    assert.equal(G.nearNameGuard(E('SPY x FAMILY', 'Anime', 'ja'), tv({ name: 'Spy×Family' })).kind, 'same', 'the multiplication sign');
    assert.equal(G.nearNameGuard(E('Ace of the Diamond', 'Anime', 'ja'), tv({ name: 'Ace of Diamond' })).kind, 'same', 'articles');
    assert.equal(G.nearNameGuard(E('Completely Other', 'Drama'), tv()).kind, 'different');
    assert.equal(G.nearNameGuard(E('Zork', 'Drama'), tv()).kind, 'phrase', 'a whole-word phrase of the longer name, nothing against it');
    assert.equal(G.nearNameGuard(E('Zork Jam', 'Drama'), tv({ name: 'Zork Show Jam' })).ok, false, 'words in common are not a phrase');
    assert.equal(G.nearNameGuard(E('Zork (2001)', 'Drama'), tv({ name: 'Zork Show Jam' })).kind, 'year', 'the year agrees within one: accepted, even without a phrase');
    assert.equal(G.nearNameGuard(E('Zork (1990)', 'Drama'), tv()).kind, 'year');
    assert.equal(G.nearNameGuard(E('Zork (1990)', 'Drama'), tv()).ok, false, 'a known year more than one apart refuses');
    assert.equal(G.nearNameGuard(E('Zork', 'Drama', 'es'), tv({ language: 'Spanish' })).ok, true, 'same language');
    assert.equal(G.nearNameGuard(E('Zork', 'Drama', 'es'), tv({ language: 'English' })).kind, 'language');
    assert.equal(G.nearNameGuard(E('Zork', 'Drama', 'cn'), tv({ language: 'Chinese' })).ok, true, 'cn is Chinese in the list');
    assert.equal(G.nearNameGuard(E('Zork', 'Drama'), tv({ language: 'Japanese' })).ok, true, 'a list entry with no language is not accused');
    assert.equal(G.nearNameGuard(E('Zork', 'Drama'), tv({ type: 'Animation' })).kind, 'type', 'Animation on a live-action row');
    assert.equal(G.nearNameGuard(E('Zork', 'Anime', 'ja'), tv({ type: 'Animation', language: 'Japanese' })).ok, true);
    assert.equal(G.nearNameGuard(E('Zork', 'Adult Swim'), tv({ type: 'Animation' })).ok, true);
    assert.equal(G.nearNameGuard(E('Zork', 'Animated'), tv({ type: 'Scripted' })).kind, 'type', 'an Animated row and a live-action show');
    assert.equal(G.nearNameGuard(E('Zork', 'Adult Swim'), tv({ type: 'Scripted' })).ok, true, 'Adult Swim has live action');
    assert.equal(G.nearNameGuard(E('Zork', 'Drama'), tv({ genres: ['Anime'] })).kind, 'type');
    assert.equal(G.nearNameGuard(null, null).ok, false);
  });
  test('a near name the old check would have refused is still refused: the guard is never looser than the old rule', () => {
    for (const [list, tvName] of [['Loveline', 'Liveline: Call Back'], ['Terra X', 'Terra e Paixão'], ['M*A*S*H', 'A Teacher']]) {
      assert.equal(G.oldCheckAccepts(list, tvName), false);
      assert.equal(G.nearNameGuard(E(list, 'Late Night'), { name: tvName, premiered: '2000-01-01' }).ok, false, list);
    }
  });
  // 30 shows whose TVmaze name is the list name (even steps through the cached files) and 10 whose TVmaze name is a longer title of the right show.
  const GOOD = [["Seinfeld","90s Sitcoms","","Seinfeld","1989-07-05"],["Detroiters","2000s and Later Sitcoms","","Detroiters","2017-02-07"],["The Wild Thornberrys","Animated","","The Wild Thornberrys","1998-09-01"],["Clone High","MTV","","Clone High","2002-11-02"],["NCIS","Drama","","NCIS","2003-09-23"],["Peaky Blinders","Streaming Era","","Peaky Blinders","2013-09-12"],["Love, Victor","Streaming Era","","Love, Victor","2020-06-17"],["Black Doves","Streaming Era","","Black Doves","2024-12-05"],["Adventure Time: Side Quests","Streaming Era","","Adventure Time: Side Quests","2026-06-29"],["The Royle Family","British and Beyond","","The Royle Family","1998-09-14"],["Smosh","Internet Comedy","","Smosh","2005-11-19"],["Plunderer","Anime","ja","Plunderer","2020-01-08"],["Witch Hat Atelier","Anime","ja","Witch Hat Atelier","2026-04-06"],["Crash Landing on You","World TV","ko","Crash Landing on You","2019-12-14"],["Kaamelott","World TV","fr","Kaamelott","2005-01-03"],["Vecinos","Reality & Talk","es","Vecinos","2015-06-01"],["The Life of Mammals","Documentary & Geographic","","The Life of Mammals","2002-11-20"],["Nature's Great Events","Documentary & Geographic","","Nature's Great Events","2009-02-11"],["The Andy Griffith Show","Classic TV","","The Andy Griffith Show","1960-10-03"],["Amen","Classic TV","","Amen","1986-09-27"],["The Colgate Comedy Hour","Classic TV","","The Colgate Comedy Hour","1950-09-10"],["Lark Rise to Candleford","British and Beyond","","Lark Rise to Candleford","2008-01-13"],["Mr. Neighbor's House","Adult Swim","","Mr. Neighbor's House","2016-12-02"],["This American Life","Documentary & Geographic","","This American Life","2007-03-22"],["To The Contrary","Documentary & Geographic","","To the Contrary","2017-01-07"],["Dangerous Encounters","Documentary & Geographic","","Dangerous Encounters","2005-05-27"],["Ghost Hunters Academy","Documentary & Geographic","","Ghost Hunters Academy","2009-11-11"],["Truth Be Told","Documentary & Geographic","","Truth Be Told","2015-10-16"],["We Shall Remain","Documentary & Geographic","","We Shall Remain","2009-04-13"],["Dive Detectives","Documentary & Geographic","","Dive Detectives","2010-03-31"],["Sailor Moon","Animated","","Bishoujo Senshi Sailor Moon","1992-03-07"],["Gundam Wing","Animated","","Mobile Suit Gundam Wing","1995-04-07"],["Luke Cage","Streaming Era","","Marvel's Luke Cage","2016-09-30"],["Shin Chan","Anime","ja","Crayon Shin-chan","1992-04-13"],["Andromeda","Sci-Fi, Fantasy and Horror","","Gene Roddenberry's Andromeda","2000-10-02"],["Red Shoe Diaries","Late Night","","Zalman King's Red Shoe Diaries","1992-06-20"],["Cathouse","Late Night","","Cathouse: The Series","2005-06-16"],["Duckman","Animated","","Duckman: Private Dick/Family Man","1994-03-05"],["Arcane","Streaming Era","","Arcane: League of Legends","2021-11-06"],["Amos 'n' Andy","Classic TV","","The Amos 'n Andy Show","1951-06-28"]];
  test('40 shows whose names are fine: none is refused (the rows and the cached TVmaze names and dates are copied from the real tree)', () => {
    assert.equal(GOOD.length, 40);
    const refused = GOOD.filter(([name, type, language, tvName, premiered]) => !G.nearNameGuard(E(name, type, language), { name: tvName, premiered }).ok);
    assert.deepEqual(refused, []);
  });
  test('a refused near name is kept for HQ in catalog/cache/tvmaze-rejected.json, once per list name, and a log that cannot be written does not stop a hunt', () => {
    withDir((dir) => {
      G.saveRejected(dir, { listName: 'The Trap', tvmazeId: 5656, tvmazeName: 'The Trap Door', kind: 'language', reason: 'language differs' });
      G.saveRejected(dir, { listName: 'The Trap', tvmazeId: 5656, tvmazeName: 'The Trap Door', kind: 'language', reason: 'language differs' });
      G.saveRejected(dir, { listName: 'Cosmos', tvmazeId: 1128, tvmazeName: 'Cosmos', kind: 'name', reason: 'x' });
      const list = JSON.parse(fs.readFileSync(path.join(dir, 'tvmaze-rejected.json'), 'utf8'));
      assert.deepEqual(list.map((x) => x.listName).sort(), ['Cosmos', 'The Trap']);
      assert.ok(list[0].at);
      assert.doesNotThrow(() => G.saveRejected(path.join(dir, 'tvmaze-rejected.json', 'not-a-folder'), { listName: 'x' }));
    });
  });
  test('hunt.js and retvmaze.js both ask this one function', () => {
    for (const f of ['hunt.js', 'retvmaze.js']) {
      const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', f), 'utf8');
      assert.match(src, /require\('\.\/lib\/tvmazeguard'\)/, f);
      assert.match(src, /nearNameGuard\(/, f);
      assert.match(src, /saveRejected\(/, f);
    }
  });
});
