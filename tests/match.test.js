// Tests for the matcher (scripts/match.js), its write helper (scripts/lib/writeIfChanged.js) and the doctor self-test
// (scripts/lib/matchcheck.js).   Run:  node --test tests/match.test.js
// Nothing here touches the catalog, the network or the real grids: the data is made up, and files go to a temp folder.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const M = require('../scripts/match.js');
const { writeIfChanged, writeTextIfChanged } = require('../scripts/lib/writeIfChanged');
const { matcherCheck } = require('../scripts/lib/matchcheck');

// ---------------------------------------------------------------- made-up data
let uid = 0;
const mkFile = (name, o = {}) => ({ name, file: name, format: 'h.264', playable: true, seconds: 1800, band: 'episode', sizeMB: 100, nameHit: /zork/i.test(name), ep: null, url: 'https://example.invalid/f' + (uid++), ...o });
const se = (season, episode) => ({ season, episode });
const WORDS = ['Quokka Parade', 'Velvet Anchor', 'Marble Harvest', 'Copper Lantern', 'Silent Orchard', 'Tangled Compass', 'Hollow Lighthouse', 'Brass Meadow', 'Frozen Carnival', 'Paper Thunder'];
const mkTv = () => ({ id: 1, name: 'Zork Show', runtime: 30, premiered: '2000-01-01', network: 'Nowhere', episodes: WORDS.map((w, i) => ({ season: 1 + (i >> 2), number: (i % 4) + 1, name: w, airdate: '2000-02-' + String(i + 1).padStart(2, '0') })) });
const ENTRY = { name: 'Zork Show', type: 'Test', network: 'Nowhere' };
const range = (n) => Array.from({ length: n }, (_, i) => i + 1);
const pad2 = (n) => String(n).padStart(2, '0');
// Run one made-up upload through the whole decision for "Zork Show"; returns the grid and the tag of every file.
function run(files, { title = 'Zork Show Season 9', id = 'zork-show-season-9', tv = mkTv() } = {}) {
  const tags = new Map();
  const grid = M.gridFor(ENTRY, { items: [{ id, title, files }] }, tv, { tags, ov: {} });
  return { grid, tags, tagList: files.map((f) => tags.get(f)) };
}
const noWrites = (fn) => { // run fn with every disk write replaced by a thrower; the matcher's decision code must not write
  const keep = { w: fs.writeFileSync, m: fs.mkdirSync, u: fs.unlinkSync };
  const boom = () => { throw new Error('unexpected write'); };
  fs.writeFileSync = boom; fs.mkdirSync = boom; fs.unlinkSync = boom;
  try { return fn(); } finally { fs.writeFileSync = keep.w; fs.mkdirSync = keep.m; fs.unlinkSync = keep.u; }
};

// ---------------------------------------------------------------- CP-002: the four boundary tests
describe('boundary tests on normalised text (CP-002)', () => {
  test('a walkthrough with underscores in its name is junk; the raw name never matched a boundary', () => {
    const raw = 'Fullmetal_Alchemist_3_Kami_o_Tsugu_Shoujo_HD_Walkthrough_part_1_of_7';
    assert.equal(/\bwalkthrough\b/i.test(raw), false, 'the raw name has no boundary, which is why the test has to run on norm()ed text');
    assert.equal(M.isJunkFile(raw, ['fullmetal alchemist']), true);
    assert.equal(M.isJunkItem('Fullmetal Alchemist 3 Kami o Tsugu Shoujo Walkthrough PS2', ['fullmetal alchemist']), true);
    assert.equal(M.isJunkItem('Walkthrough PS2', []), true);
  });
  test('junk words are matched as whole words only', () => {
    for (const t of ['Show Name Compilation', 'Show Name Best Of 2005', 'Show Name Cast Reunion Podcast', 'Show_Name_Mix_Tape', 'Show Name Ad']) assert.equal(M.isJunkItem(t, []), true, t);
    for (const t of ['The Bad Road Show', 'Remixed Radiator Springs Madness', 'Reunion Special', 'Gadgets and Admirals']) assert.equal(M.isJunkItem(t, []), false, t);
  });
  test('the show\'s own name is not junk', () => {
    assert.equal(M.isJunkItem('Best of the Worst Season 2', ['best of the worst']), false);
    assert.equal(M.isJunkItem('Best of the Worst Season 2 Recap', ['best of the worst']), true);
  });
  test('file-level junk: commentary, bonus disc, behind the scenes', () => {
    for (const n of ['Show_S01E01_Commentary.mp4', 'Show.S01.Bonus.Disc.mkv', 'Show_Behind_the_Scenes_2.mp4']) assert.equal(M.isJunkFile(n, ['show']), true, n);
    assert.equal(M.isJunkFile('Show_S01E01_The_Pilot.mp4', ['show']), false);
  });
  test('a format variant of one file counts once; two episodes stay two', () => {
    assert.equal(M.variantKey('Show_Name_512Kb.mp4'), M.variantKey('Show_Name.mp4'));
    assert.equal(M.variantKey('Show_Name_h264_720p.mp4'), 'show name');
    assert.equal(M.variantKey('Show Name 720p.mp4'), M.variantKey('Show Name 1080p.mp4'));
    assert.notEqual(M.variantKey('Show_Name_01.mp4'), M.variantKey('Show_Name_02.mp4'));
  });
  test('extras are caught on normalised text too', () => {
    assert.equal(M.isExtras('Show_Behind_the_Scenes_01', ['show']), true);
    assert.equal(M.isExtras('Show_S01E01', ['show']), false);
  });
  test('no script holds a stray control character (the backspace bytes were invisible in a plain print)', () => {
    const dirs = [path.join(__dirname, '..', 'scripts'), path.join(__dirname, '..', 'scripts', 'lib')];
    for (const d of dirs) for (const f of fs.readdirSync(d).filter((x) => x.endsWith('.js'))) {
      const b = fs.readFileSync(path.join(d, f));
      let line = 1;
      for (let i = 0; i < b.length; i++) {
        if (b[i] === 10) line++;
        else if (b[i] < 32 && b[i] !== 9 && b[i] !== 13) assert.fail(`${f} line ${line} holds control byte ${b[i]}`);
      }
    }
  });
});

// ---------------------------------------------------------------- CP-004: the wrong-show detector
describe('wrong-show detector (CP-004)', () => {
  const shows = M.makeOtherShows([{ name: 'The Season' }, { name: 'Family' }, { name: 'Collection' }, { name: 'Extras' }, { name: 'Breaking Bad' }, { name: 'Star Trek' }, { name: 'Medical Detectives' }, { name: 'M*A*S*H' }, { name: 'Hard Knocks: In Season' }]);
  test('one-word titles and short titles are not show names; two words and six letters are', () => {
    assert.deepEqual(shows.map((o) => o.core).sort(), ['breaking bad', 'medical detectives', 'star trek']);
  });
  test('"The Season" no longer makes "Season" another show', () => {
    assert.equal(M.namesOtherShow('Forensic Files S03E04 Season 3 720p', 'Forensic Files', [], shows), false);
    assert.equal(M.namesOtherShow('Murphy Brown Season 5 Collection Extras Family', 'Murphy Brown', [], shows), false);
  });
  test('a true other show is still caught, by whole words', () => {
    assert.equal(M.namesOtherShow('Breaking Bad S01E01 720p', 'Better Call Saul', [], shows), true);
    assert.equal(M.namesOtherShow('Breaking_Bad_-_S02E03.mp4', 'Better Call Saul', [], shows), true);
    assert.equal(M.namesOtherShow('Breaking Badger Tales', 'Better Call Saul', [], shows), false, 'a longer word is not the same word');
    assert.equal(M.namesOtherShow('Star Trekking Across Europe', 'Some Travel Show', [], shows), false);
  });
  test('Season N, SxxEyy and quality tags are taken out before matching', () => {
    assert.equal(M.forOtherShow('Show.Name.Season.12.S01E02.720p.x264.mp4').trim(), 'show name');
    assert.equal(M.forOtherShow('Show Name 2x05 HDTV Complete').trim(), 'show name');
  });
  test('a show and its own family are never "another show"', () => {
    assert.equal(M.namesOtherShow('Star Trek Enterprise S01E01', 'Star Trek: Enterprise', [], shows), false);
    assert.equal(M.namesOtherShow('Star Trek S01E01', 'Star Trek: Enterprise', [], shows), false);
  });
  test('Medical Detectives is Forensic Files', () => {
    assert.equal(M.namesOtherShow('Medical Detectives S01E02 Death by Design', 'Forensic Files', [], shows), true, 'without the alias it reads as a different show');
    assert.equal(M.namesOtherShow('Medical Detectives S01E02 Death by Design', 'Forensic Files', ['medical detectives'], shows), false);
    assert.ok(M.BUILTIN_ALIASES['forensic-files'].includes('Medical Detectives'));
  });
  test('the real list gives a usable detector (multi-word titles only, "season" is not one)', () => {
    assert.ok(M.OTHER_SHOWS.length > 1000);
    assert.ok(!M.OTHER_SHOWS.some((o) => o.core.split(' ').length < 2 || o.core.replace(/[^a-z]/g, '').length < 6));
    assert.equal(M.namesOtherShow('Forensic Files S03E04 Season 3 720p', 'Forensic Files'), false);
  });
});

// ---------------------------------------------------------------- CP-001: reason tags and the fallback gate
describe('rejection reasons (CP-001)', () => {
  test('the tag is the strongest reason, other-show first', () => {
    assert.equal(M.rejectionTag({ other: true, react: true, foreign: true, notNamed: true }), 'other-show');
    assert.equal(M.rejectionTag({ react: true, foreign: true, notNamed: true }), 'reaction');
    assert.equal(M.rejectionTag({ foreign: true, notNamed: true }), 'foreign');
    assert.equal(M.rejectionTag({ notNamed: true }), 'not-named');
    assert.equal(M.rejectionTag({}), 'no-match');
  });
  test('the strict loop tags every kind of file', () => {
    assert.ok(M.OTHER_SHOWS.some((o) => o.core === 'breaking bad'), 'this test needs Breaking Bad on the real list');
    const files = [
      mkFile('Zork Show S01E02.mp4', { ep: se(1, 2) }),            // placed
      mkFile('Zork Show S09E09.mp4', { ep: se(9, 9) }),            // no episode 9x9 on the TVmaze list
      mkFile('Zork Show Reaction S09E01.mp4', { ep: se(9, 1) }),   // a reaction
      mkFile('Breaking Bad Zork Show S09E02.mp4', { ep: se(9, 2) }), // another show on our list
      mkFile('Zork Show Film Vostfr.mp4'),                         // a dub
      mkFile('Zork Show 1985-03-04.mp4'),                          // dated before the show existed
      mkFile('Zork Show Odd Length.mp4', { band: 'odd', seconds: 900 }), // outside the bands
    ];
    const { tagList } = run(files);
    assert.deepEqual(tagList, ['placed', 'no-match', 'reaction', 'other-show', 'foreign', 'before-premiere', 'wrong-length']);
  });
  test('a file that neither it nor its upload title names the show is not-named', () => {
    const f = mkFile('Some Clip.mp4');
    assert.deepEqual(run([f], { title: 'Random Upload', id: 'random' }).tagList, ['not-named']);
  });
});

describe('the self-list fallback gate (CP-001)', () => {
  const evidence = (n) => range(n).map((i) => mkFile(`Zork Show S09E${pad2(i)}.mp4`, { ep: se(9, i) }));
  test('accepts no-match files with S/E evidence from an upload whose title names the show', () => {
    const { grid, tagList } = run(evidence(25));
    assert.ok(tagList.every((t) => t === 'no-match'));
    assert.equal(grid.selfListed, true);
    assert.equal(grid.tvmazeWeak.placed, 0);
    assert.equal(grid.seasons[0].episodes.length, 25);
  });
  test('refuses files rejected as another show', () => {
    const files = range(25).map((i) => mkFile(`Breaking Bad Zork Show S09E${pad2(i)}.mp4`, { ep: se(9, i) }));
    const { grid, tagList } = run(files);
    assert.ok(tagList.every((t) => t === 'other-show'));
    assert.equal(grid.selfListed, undefined);
    assert.equal(grid.coverage.review + grid.coverage.live, 0);
  });
  test('refuses reactions and walkthroughs', () => {
    const files = range(25).map((i) => mkFile(`Zork Show Reaction S09E${pad2(i)}.mp4`, { ep: se(9, i) }));
    const { grid, tagList } = run(files);
    assert.ok(tagList.every((t) => t === 'reaction'));
    assert.equal(grid.selfListed, undefined);
  });
  test('refuses foreign dubs', () => {
    const files = range(25).map((i) => mkFile(`Zork Show Vostfr S09E${pad2(i)}.mp4`, { ep: se(9, i) }));
    const { grid } = run(files);
    assert.equal(grid.selfListed, undefined);
  });
  test('refuses files with no positive episode evidence: clips in items of fewer than five', () => {
    const items = range(6).map((n) => ({ id: 'zork-' + n, title: 'Zork Show Season ' + n, files: range(4).map((i) => mkFile(`Zork Show Funny Clip ${String.fromCharCode(64 + i)}${n}.mp4`)) }));
    assert.equal(M.gridFor(ENTRY, { items }, mkTv(), { ov: {} }).selfListed, undefined);
  });
  test('five or more numbered files in one item are evidence; four are not', () => {
    const pool = (n) => {
      const files = range(n).map((i) => mkFile(`Zork Show Part ${i}.mp4`));
      return { cand: { items: [{ id: 'zork', title: 'Zork Show', files }] }, tags: new Map(files.map((f) => [f, 'no-match'])) };
    };
    const ctx = { tv: { runtime: 30 }, namesTitle: () => true, cores: ['zork show'] };
    const four = pool(4), five = pool(5);
    assert.equal(M.fallbackCand(four.cand, four.tags, ctx).items.length, 0, 'four numbered files are not a run');
    assert.equal(M.fallbackCand(five.cand, five.tags, ctx).items[0].files.length, 5, 'five are');
    assert.equal(run(range(25).map((i) => mkFile(`Zork Show Part ${i}.mp4`))).grid.selfListed, true, 'a whole upload of numbered files is accepted');
  });
  test('an item whose title names the show and holds five or more video files in the band is evidence on its own', () => {
    const clips = (n, mk = (i) => `Zork Show Funny Clip ${String.fromCharCode(64 + i)}.mp4`, o = {}) => range(n).map((i) => mkFile(mk(i), o));
    assert.equal(run(clips(25), { title: 'Zork Show Season 9' }).grid.selfListed, true, 'titled episodes with no numbers, from the show\'s own item');
    assert.equal(run(clips(25), { title: 'Zork Show Jam' }).grid.selfListed, undefined, 'not when the title is a longer title');
    assert.equal(run(clips(25), { title: 'Mystery Upload', id: 'zork-show-s9' }).grid.selfListed, undefined, 'not when the title does not name the show, whatever the identifier says');
    assert.equal(run(clips(25, undefined, { seconds: 600 }), { title: 'Zork Show Season 9' }).grid.selfListed, undefined, 'not outside the runtime band');
    const mixed = [...clips(4), ...range(21).map((i) => mkFile(`Zork Show Commentary ${i}.mp4`))];
    assert.equal(run(mixed, { title: 'Zork Show Season 9' }).grid.selfListed, undefined, 'junk-named files do not count towards the five');
    const four = M.gridFor(ENTRY, { items: [{ id: 'a', title: 'Zork Show Season 1', files: clips(4) }, ...range(5).map((n) => ({ id: 'b' + n, title: 'Zork Show Season ' + (n + 2), files: clips(4).map((f) => ({ ...f, name: f.name + n, file: f.name + n })) }))] }, mkTv(), { ov: {} });
    assert.equal(four.selfListed, undefined, 'items of four are not enough');
  });
  test('refuses files outside the TVmaze runtime band', () => {
    const files = range(25).map((i) => mkFile(`Zork Show S09E${pad2(i)}.mp4`, { ep: se(9, i), seconds: 600 }));
    assert.equal(run(files).grid.selfListed, undefined);
  });
  test('files skipped for length are judged again: kept when TVmaze has no runtime, refused outside a known runtime band', () => {
    const clips = (name) => range(25).map((i) => mkFile(name(i), { ep: se(9, i), band: 'clip', seconds: 200 }));
    const plain = (i) => 'Zork Show S09E' + pad2(i) + '.mp4';
    assert.equal(run(clips(plain), { tv: { ...mkTv(), runtime: null } }).grid.selfListed, true, 'a 3-minute web episode is not a wrong length when the runtime is unknown');
    assert.equal(run(clips(plain)).grid.selfListed, undefined, 'a 3-minute file is outside the band of a 30-minute show');
    assert.equal(run(clips((i) => 'Zork Show Reaction S09E' + pad2(i) + '.mp4'), { tv: { ...mkTv(), runtime: null } }).grid.selfListed, undefined, 'skipped for length does not excuse a reaction');
    assert.equal(run(clips((i) => 'Breaking Bad Zork Show S09E' + pad2(i) + '.mp4'), { tv: { ...mkTv(), runtime: null } }).grid.selfListed, undefined, 'or another show');
    const tagged = run(clips(plain), { tv: { ...mkTv(), runtime: null } }).tagList;
    assert.ok(tagged.every((t) => t === 'wrong-length'), 'the tag stays wrong-length; the fallback judges it');
  });
  test('refuses uploads whose title does not name the show, even if the identifier does', () => {
    const { grid } = run(evidence(25), { title: 'Mystery Upload', id: 'zork-show-s09' });
    assert.equal(grid.selfListed, undefined);
  });
  test('files the strict pass placed stay eligible without further evidence', () => {
    const files = [...range(4).map((i) => mkFile(`Zork Show S01E0${i}.mp4`, { ep: se(1, i) })), ...evidence(21)];
    const { tagList, grid } = run(files);
    assert.deepEqual(tagList.slice(0, 4), ['placed', 'placed', 'placed', 'placed']);
    assert.equal(grid.selfListed, true);
    assert.equal(grid.seasons.reduce((n, s) => n + s.episodes.length, 0), 25);
  });
  test('decisions write nothing to disk', () => {
    noWrites(() => { run(evidence(25)); run(range(25).map((i) => mkFile(`Zork Show Reaction S09E${pad2(i)}.mp4`, { ep: se(9, i) }))); });
  });
});

// ---------------------------------------------------------------- CP-003: the identifier rule
describe('Archive identifier rule (CP-003)', () => {
  const parkers = { name: 'The Parkers', type: 'Sitcom', network: 'UPN' };
  const vids = (names) => names.map((n) => mkFile(n, { seconds: 1700, nameHit: false }));
  const item = (id, title, names) => ({ id, title, files: vids(names) });
  test('an identifier that starts with the name, with neither the title nor the file names naming the show, is not the show', () => {
    const it = item('parkers-puzzle-cooking-kids-27-and-exercise', 'All Kids Videos Collection #4', range(40).map((i) => 'Tiny Tots Worship ' + i + '.mp4'));
    assert.equal(noWrites(() => M.selfGrid(parkers, { items: [it] }, [])), null);
  });
  test('an identifier match counts when half or more of the file names also name the show', () => {
    const it = item('parkers-season-1', 'Season 1 DVD rips', range(10).map((i) => 'The Parkers - Episode ' + pad2(i) + '.mp4'));
    const g = noWrites(() => M.selfGrid(parkers, { items: [it] }, []));
    assert.ok(g && g.selfListed);
    assert.equal(g.seasons[0].episodes.length, 10);
  });
  test('an identifier match with under half the file names naming the show is refused', () => {
    const names = [...range(3).map((i) => 'The Parkers - Episode ' + pad2(i) + '.mp4'), ...range(7).map((i) => 'Something Else Entirely ' + i + '.mp4')];
    assert.equal(noWrites(() => M.selfGrid(parkers, { items: [item('parkers-season-1', 'Season 1 DVD rips', names)] }, [])), null);
  });
  test('a title that starts with the show name still goes through the junk test', () => {
    const it = item('whatever', 'The Parkers Walkthrough PS2', range(10).map((i) => 'The Parkers part ' + i + '.mp4'));
    assert.equal(noWrites(() => M.selfGrid(parkers, { items: [it] }, [])), null);
  });
  test('a title that names the show is enough, whatever the identifier says', () => {
    const it = item('xyz123', 'The Parkers Complete Series', range(8).map((i) => 'The Parkers ' + pad2(i) + '.mp4'));
    const g = M.selfGrid(parkers, { items: [it] }, []);
    assert.ok(g && g.seasons[0].episodes.length === 8);
  });
  test('format variants of the same file do not make a small upload look like a season', () => {
    const names = [];
    for (const i of range(3)) for (const tag of ['', '_512kb', '_h264', '_720p']) names.push('The_Parkers_' + i + tag + '.mp4');
    const it = item('parkers-odds-and-ends', 'Odds and Ends', names);
    assert.equal(noWrites(() => M.selfGrid(parkers, { items: [it] }, [])), null, 'twelve files, three episodes: under the five a season needs');
  });
  test('episodeNumberOf, stripShow and inRuntimeBand', () => {
    assert.equal(M.episodeNumberOf('Parker’s Puzzle (7)', ['parkers']), 7);
    assert.equal(M.episodeNumberOf('The_Parkers_S01E02_720p.mp4', ['parkers']), null);
    assert.equal(M.stripShow('The_Parkers_Walkthrough', ['parkers']), 'the walkthrough');
    assert.equal(M.inRuntimeBand(1800, 30), true);
    assert.equal(M.inRuntimeBand(3600, 30), false, 'a double episode is a compilation');
    assert.equal(M.inRuntimeBand(600, 30), false);
    assert.equal(M.inRuntimeBand(5400, 30), false);
    assert.equal(M.inRuntimeBand(1800, null), false);
  });
  test('the fallback band is half to one and a quarter of the TVmaze runtime, because the runtime is the broadcast slot', () => {
    assert.equal(M.inRuntimeBand(30 * 60, 60), true, 'half the slot');
    assert.equal(M.inRuntimeBand(41 * 60, 60), true, 'a 60-minute show is about 41 minutes without the ads (Iron Chef)');
    assert.equal(M.inRuntimeBand(29 * 60, 60), false);
    assert.equal(M.inRuntimeBand(2.4 * 60, 4), true, 'a short web series listed rounded up (Jake and Amir: 4 listed, 2.4 real)');
    assert.equal(M.inRuntimeBand(5 * 60, 4), true, 'one and a quarter');
    assert.equal(M.inRuntimeBand(5.2 * 60, 4), false);
    assert.equal(M.inRuntimeBand(60 * 60, 30), false, 'long is a compilation');
    const ad = (seconds) => range(25).map((i) => mkFile(`Zork Show S09E${pad2(i)}.mp4`, { ep: se(9, i), seconds }));
    const tv60 = { ...mkTv(), runtime: 60 }, noRuntime = { ...mkTv(), runtime: null };
    assert.equal(run(ad(41 * 60), { tv: tv60 }).grid.selfListed, true, 'ad-stripped episodes pass');
    assert.equal(run(ad(100 * 60), { tv: tv60 }).grid.selfListed, undefined, 'a compilation does not');
    assert.equal(run(ad(41 * 60), { tv: noRuntime }).grid.selfListed, true, 'no runtime, no band');
  });
});

// ---------------------------------------------------------------- the title test: whole words, and the name must close
describe('the upload title names the show', () => {
  const names = (text, show, aliases = []) => M.namesTitle(text, [M.norm(show).replace(/^the /, ''), ...aliases.map(M.norm)]);
  test('the name alone, or followed by a separator, an episode token or a format word, names the show', () => {
    for (const [t, s] of [
      ['The Parkers', 'The Parkers'], ['The Parkers : WSBK : September 10, 2001 9:00pm-9:30pm EDT', 'The Parkers'], ['Zork Show', 'Zork Show'],
      ['Zork_Show_S01E02', 'Zork Show'], ['Zork.Show.1x02.720p', 'Zork Show'], ['Zork Show - Pilot', 'Zork Show'], ['Zork Show | Season 2', 'Zork Show'],
      ['Zork Show/Season 1/01 Pilot', 'Zork Show'], ['Zork Show [1080p]', 'Zork Show'], ['Zork Show "Pilot"', 'Zork Show'], ['Zork Show: The Pilot', 'Zork Show'],
      ['Jake and Amir： Audit', 'Jake and Amir'], ['Zork Show 1987', 'Zork Show'], ['Zork Show Season One', 'Zork Show'], ['Zork Show Complete Series', 'Zork Show'],
      ['Zork Show Collection', 'Zork Show'], ['Zork Show Full Episodes', 'Zork Show'], ['Zork Show DVD ISO', 'Zork Show'], ['Zork Show Videos', 'Zork Show'],
      ['Zork Show (2007-2024)', 'Zork Show'], ['All Zork Show DVDs [DVDISO]', 'Zork Show'], ['Zork Show The Complete Series', 'Zork Show'], ['Zork Show All Episodes', 'Zork Show'],
      ['zork show', 'The Zork Show'], ['The Zork Show Season 1', 'The Zork Show'], ['Zork Show S 2', 'Zork Show'], ['Zork Show 1x 4', 'Zork Show'],
    ]) assert.equal(names(t, s), true, t);
  });
  test('a name followed straight by another ordinary word is a longer title, and does not name the show', () => {
    for (const [t, s] of [
      ["Parker's Puzzle Episodes", 'The Parkers'], ['Parkers Place! 01x02 JAME DUDE!', 'The Parkers'], ['Naruto Shippuden Disney XD Version', 'Naruto'],
      ['Monster Jam: Before It Sucked (2000-2013)', 'Monster'], ['Rumble - The Body Language Guy (2022)', 'Body Language'], ['Iron Chef America Season 1', 'Iron Chef'],
      ['Nature Cat - Full Series', 'Nature'], ['Seinfeld The Contest', 'Seinfeld'], ['Zork Show Jam', 'Zork Show'], ['Zork Showdown', 'Zork Show'], ['Zork-Show-Jam', 'Zork Show'],
      ['Homestar Runner Strong Bad Email', 'Homestar Runner'], ['Zork Show Publicly Available Episodes', 'Zork Show'], ['Zork Show S x', 'Zork Show'],
    ]) assert.equal(names(t, s), false, t);
    const cores = ['zork show'];
    assert.deepEqual([M.titleNaming('Zork Show - Pilot', cores), M.titleNaming('Zork Show Jam', cores), M.titleNaming('Nothing like it', cores)], ['names', 'longer', 'none']);
  });
  test('a star, bullet, tilde, comma, period, semicolon or exclamation mark after the name ends it (French "V.F." uploads, "Show, The Complete Series")', () => {
    for (const [t, s] of [
      ['Mission Impossible \u2605 V.F. \u2605 Saison 1', 'Mission: Impossible'], ['Star Trek Voyager \u2022 VF', 'Star Trek: Voyager'], ['Twilight Zone ~ V.F.', 'Twilight Zone'],
      ['Star Trek Deep Space Nine; Saison 2', 'Star Trek: Deep Space Nine'], ['Zork Show \u2606 VF', 'Zork Show'], ['Zork Show\u2605VF', 'Zork Show'],
      ['Zork Show, The Complete Series', 'Zork Show'], ['Zork Show. Season 2', 'Zork Show'], ['Zork Show! Season 2', 'Zork Show'],
      ['Zork Show\uff5eVF', 'Zork Show'], ['Zork Show\uff0c Complete', 'Zork Show'],
      // a name that itself ends in punctuation still stands
      ['Everything Is Terrible!', 'Everything Is Terrible!'], ['Law & Order', 'Law & Order'], ['9-1-1', '9-1-1'],
    ]) assert.equal(names(t, s), true, t);
    for (const [t, s] of [
      // glued continuations stay longer titles: a dot, dash or underscore between words is no separator, and a comma after the next word is not one after the name
      ['Zork.Show.Jam', 'Zork Show'], ['Zork-Show-Jam', 'Zork Show'], ['Zork_Show_Jam', 'Zork Show'], ['Naruto.Shippuden.Complete', 'Naruto'],
      ['Zork Show Jam, Season 2', 'Zork Show'], ['Monster Jam, Before It Sucked', 'Monster'], ['9-1-1 Lone Star', '9-1-1'],
    ]) assert.equal(names(t, s), false, t);
    // end to end: the fallback accepts the upload titled with the show and a star, and still refuses the longer title
    const files = range(25).map((i) => mkFile(`Zork Show S09E${pad2(i)}.mp4`, { ep: se(9, i) }));
    assert.equal(run(files, { title: 'Zork Show \u2605 Fan Edits' }).grid.selfListed, true);
    assert.equal(run(files, { title: 'Zork Show Jam \u2605 Fan Edits' }).grid.selfListed, undefined);
  });
  test('whole words only: the name inside a longer word, or glued to digits, is not the name', () => {
    assert.equal(names('Unzork Show', 'Zork Show'), false);
    assert.equal(names('Zork Shows', 'Zork Show'), false);
    assert.equal(names('zorkshow2016', 'Zork Show'), false);
    assert.equal(names('Best of the Zork Show', 'Zork Show'), true, 'words before the name do not matter');
  });
  test('the longer form counts when it is one of the show\'s aliases, and any one good occurrence is enough', () => {
    assert.equal(names('Naruto Shippuden - 001', 'Naruto'), false);
    assert.equal(names('Naruto Shippuden - 001', 'Naruto', ['Naruto Shippuden']), true);
    assert.equal(names('Zork Show Jam, then Zork Show - Season 2', 'Zork Show'), true);
  });
  test('the show\'s own network, from its TVmaze record, may follow the name; no other network may', () => {
    const cores = ['dimension 20'];
    assert.equal(M.namesTitle('Dimension 20 Dropout TV Seasons 01-22', cores), false, 'without the network it is a longer title');
    assert.equal(M.namesTitle('Dimension 20 Dropout TV Seasons 01-22', cores, ['dropout']), true);
    assert.equal(M.namesTitle('Dimension 20 Netflix Specials', cores, ['dropout']), false, 'another network does not count');
    assert.equal(M.namesTitle('Dimension 20 Special Dropout', cores, ['dropout']), false, 'it must follow the name directly');
    assert.equal(M.namesTitle('Mysteries of the Bible A&E Media Series', ['mysteries of the bible'], ['a and e']), true, 'a network written with an ampersand');
    assert.equal(M.namesTitle('Body Language Paramount with Showtime Specials', ['body language'], ['paramount with showtime']), true, 'a network of several words');
    assert.equal(M.namesTitle('Body Language Paramount Guy', ['body language'], ['paramount with showtime']), false);
    // end to end: the TVmaze record of the made-up show says its network is "Nowhere"
    const files = range(25).map((i) => mkFile(`Zork Show S09E${pad2(i)}.mp4`, { ep: se(9, i) }));
    assert.equal(run(files, { title: 'Zork Show Nowhere Seasons 01-02' }).grid.selfListed, true, 'an upload titled with the show and its own network');
    assert.equal(run(files, { title: 'Zork Show Elsewhere Seasons 01-02' }).grid.selfListed, undefined, 'not with another network');
  });
  test('Duckman: TVmaze\'s own name for the show is an alias', () => {
    assert.ok(M.BUILTIN_ALIASES.duckman.includes('Duckman: Private Dick/Family Man'));
    const title = 'The Duckman Private Dick Family Man Collection.';
    assert.equal(M.namesTitle(title, ['duckman']), false, 'without the alias the title runs on into a longer one');
    assert.equal(M.namesTitle(title, ['duckman', ...M.BUILTIN_ALIASES.duckman.map(M.norm)]), true);
  });
  test('the fallback, the identifier rule and the sequence guess all use it', () => {
    // the fallback gate: an upload titled "Zork Show Jam" is not an upload of Zork Show, whatever its files are called
    const evidence = range(25).map((i) => mkFile(`Zork Show S09E${pad2(i)}.mp4`, { ep: se(9, i) }));
    assert.equal(run(evidence, { title: 'Zork Show Season 9' }).grid.selfListed, true);
    assert.equal(run(evidence, { title: 'Zork Show Jam' }).grid.selfListed, undefined);
    // the identifier rule: half the file names must name the show the same way ("Parkers Place" is another show)
    const parkers = { name: 'The Parkers', type: 'Sitcom', network: 'UPN' };
    const item = (names) => ({ id: 'parkers-season-1', title: 'Season 1 DVD rips', files: names.map((n) => mkFile(n, { seconds: 1700, nameHit: false })) });
    assert.ok(M.selfGrid(parkers, { items: [item(range(10).map((i) => 'The Parkers - Episode ' + pad2(i) + '.mp4'))] }, []));
    assert.equal(M.selfGrid(parkers, { items: [item(range(10).map((i) => 'Parkers Place - Episode ' + pad2(i) + '.mp4'))] }, []), null);
    // the sequence guess: unmatched files in an upload titled as the show are offered in order; in a longer title's upload they are not
    const clips = () => range(6).map((i) => mkFile(`Zork Show Funny Clip ${String.fromCharCode(64 + i)}.mp4`));
    const guessed = (title) => run(clips(), { title }).grid.seasons.flatMap((s) => s.episodes).filter((e) => e.file && /^sequence guess/.test(e.file.why)).length;
    assert.equal(guessed('Zork Show Season 1'), 4);
    assert.equal(guessed("Zork Show Jam Season 1"), 0);
    // the strict pass: an episode name that merely looks alike is no proof when the upload's title is a longer title
    const alike = (title, name = 'Zork Show Jam - Velvet Anchor.mp4') => run([mkFile(name)], { title }).grid.seasons.flatMap((s) => s.episodes).find((e) => e.name === 'Velvet Anchor').file;
    assert.ok(alike('Zork Show Season 1'), 'placed from an upload titled as the show');
    assert.equal(alike('Zork Show Jam'), null, 'not placed from an upload titled as a longer title');
    // ...unless the file's own name also names the show: the longer title then does not decide (NOVA, Airline, Just Shoot Me)
    assert.ok(alike('Zork Show Jam', 'Zork Show - Velvet Anchor.mp4'), 'the file names the show, whatever the upload is called');
    assert.equal(alike('Zork Show Jam', 'Velvet Anchor.mp4'), null, 'a file that does not name the show stays out of the longer title\'s upload');
    assert.equal(alike('Zork Show Jam', 'Zork Show Jam Special - Velvet Anchor.mp4'), null, 'a file that itself runs on into a longer title stays out');
  });
});

// ---------------------------------------------------------------- CP-006: writeIfChanged
describe('writeIfChanged (CP-006)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wic-'));
  const f = (n) => path.join(dir, n);
  const grid = (stamp, extra = {}) => ({ show: 'Zork Show', slug: 'zork-show', matchedAt: stamp, seasons: [{ season: 1, episodes: [{ number: 1, state: 'LIVE' }] }], ...extra });
  test('writes a new file', () => {
    assert.equal(writeIfChanged(f('a.json'), grid('2026-01-01T00:00:00.000Z')), true);
    assert.equal(JSON.parse(fs.readFileSync(f('a.json'), 'utf8')).matchedAt, '2026-01-01T00:00:00.000Z');
  });
  test('does not write when only matchedAt differs, and the old timestamp stays', () => {
    const before = fs.readFileSync(f('a.json'), 'utf8');
    assert.equal(writeIfChanged(f('a.json'), grid('2026-12-31T23:59:59.000Z')), false);
    assert.equal(fs.readFileSync(f('a.json'), 'utf8'), before);
    assert.equal(JSON.parse(before).matchedAt, '2026-01-01T00:00:00.000Z');
  });
  test('writes when the content differs, with the new timestamp', () => {
    assert.equal(writeIfChanged(f('a.json'), grid('2026-06-06T00:00:00.000Z', { addedAt: '2026-06-06' })), true);
    const now = JSON.parse(fs.readFileSync(f('a.json'), 'utf8'));
    assert.equal(now.matchedAt, '2026-06-06T00:00:00.000Z');
    assert.equal(now.addedAt, '2026-06-06');
  });
  test('values that JSON drops (undefined) do not count as a change', () => {
    assert.equal(writeIfChanged(f('a.json'), grid('2030-01-01T00:00:00.000Z', { addedAt: '2026-06-06', codecRisk: undefined })), false);
  });
  test('writes when the old file is unreadable', () => {
    fs.writeFileSync(f('bad.json'), '{ not json');
    assert.equal(writeIfChanged(f('bad.json'), grid('2026-01-01T00:00:00.000Z')), true);
    assert.equal(JSON.parse(fs.readFileSync(f('bad.json'), 'utf8')).slug, 'zork-show');
  });
  test('builtAt and sweptAt are stamps too; compact output when indent is 0', () => {
    assert.equal(writeIfChanged(f('g.json'), { builtAt: 'x', people: { 1: 'a' } }, ['builtAt'], 0), true);
    assert.equal(fs.readFileSync(f('g.json'), 'utf8'), '{"builtAt":"x","people":{"1":"a"}}');
    assert.equal(writeIfChanged(f('g.json'), { builtAt: 'y', people: { 1: 'a' } }, ['builtAt'], 0), false);
    assert.equal(writeIfChanged(f('s.json'), { sweptAt: 'x', n: 1 }), true);
    assert.equal(writeIfChanged(f('s.json'), { sweptAt: 'z', n: 1 }), false);
    assert.equal(writeIfChanged(f('s.json'), { sweptAt: 'z', n: 2 }), true);
  });
  test('a text report is left alone when only its stamp line differs (line endings aside)', () => {
    const stamp = /Swept \d{4}-\d{2}-\d{2}T\d{2}:\d{2}/g;
    assert.equal(writeTextIfChanged(f('r.md'), '# R\nSwept 2026-10-17T03:30. rows\n', stamp), true);
    fs.writeFileSync(f('r.md'), '# R\r\nSwept 2026-10-17T03:30. rows\r\n'); // as git on Windows would check it out
    assert.equal(writeTextIfChanged(f('r.md'), '# R\nSwept 2026-10-18T03:31. rows\n', stamp), false);
    assert.equal(writeTextIfChanged(f('r.md'), '# R\nSwept 2026-10-18T03:31. more rows\n', stamp), true);
  });
  test('cleanup', () => { fs.rmSync(dir, { recursive: true, force: true }); assert.equal(fs.existsSync(dir), false); });
});

// ---------------------------------------------------------------- the address mask
describe('address mask', () => {
  test('no address-shaped text reaches a grid: episode names, titles, file names, summaries and urls are masked', () => {
    assert.equal(M.noEmail('mail me at a.b+c@d-e.co.uk now'), 'mail me at [email] now');
    assert.equal(M.noEmail('@handle, 5 @ 6, foo@bar and 50% off'), '@handle, 5 @ 6, foo@bar and 50% off', 'a lone @ or an address with no dot is not an address');
    assert.deepEqual(M.noEmail(['Zoë@café.fr', 7, null, { a: 'x@y.zz', url: 'https://archive.org/download/i/a@b.com.mp4' }]), ['[email]', 7, null, { a: '[email]', url: 'https://archive.org/download/i/a%40b.com.mp4' }]);
    // a strict grid: the TVmaze show and episode names, the Archive item title, a file name and its url all carry an address
    const tv = mkTv();
    tv.name = 'Zork Show (info@zork.tv)';
    tv.episodes[1].name = 'Velvet Anchor bob@example.com';
    const f = mkFile('Zork Show S01E02 [uploader@site.net].mp4', { ep: se(1, 2), url: 'https://archive.org/download/zork/Zork%20Show%20S01E02%20[uploader@site.net].mp4' });
    const strict = run([f], { title: 'Zork Show Season 1 (write to fan@example.org)', tv }).grid;
    const text = JSON.stringify(strict);
    assert.ok(!text.includes('@'), 'no @ is left anywhere in the grid');
    assert.ok(text.includes('[email]'));
    assert.equal(strict.seasons[0].episodes[1].file.name, 'Zork Show S01E02 [[email]].mp4');
    assert.equal(strict.seasons[0].episodes[1].name, 'Velvet Anchor [email]');
    // a self-listed grid
    const files = range(25).map((i) => mkFile(`Zork Show S09E${pad2(i)} (rip by ripper@example.net).mp4`, { ep: se(9, i) }));
    const self = run(files, { title: 'Zork Show Season 9 (contact: me@example.org)' }).grid;
    assert.equal(self.selfListed, true);
    assert.ok(!JSON.stringify(self).includes('@'));
    // HQ and linkcheck key a file by the name the grid shows, which is the masked one: a file rejected under that name stays rejected
    const item = { id: 'zork-show-season-1', title: 'Zork Show Season 1', files: [mkFile('Zork Show S01E02 [uploader@site.net].mp4', { ep: se(1, 2) })] };
    const kept = M.gridFor(ENTRY, { items: [item] }, mkTv(), { ov: {} });
    assert.ok(kept.seasons[0].episodes[1].file, 'placed when nothing rejects it');
    const rejected = M.gridFor(ENTRY, { items: [item] }, mkTv(), { ov: { rejectFiles: ['zork-show-season-1|Zork Show S01E02 [[email]].mp4'] } });
    assert.equal(rejected.seasons[0].episodes[1].file, null);
  });
});

// ---------------------------------------------------------------- the doctor self-test
describe('matcher self-test for the doctor', () => {
  test('passes on the current matcher and lists self-listed grids over a TVmaze list', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-'));
    try {
      const pick = (title) => ({ state: 'REVIEW', file: { itemTitle: title } });
      fs.writeFileSync(path.join(dir, 'weak.json'), JSON.stringify({ show: 'The Parkers', slug: 'the-parkers', selfListed: true, tvmazeWeak: { id: 1, placed: 1 }, seasons: [{ season: 1, episodes: [pick('The Parkers : WSBK'), pick('All Kids Videos Collection #4'), pick('All Kids Videos Collection #3'), pick('The Parkers Walkthrough PS2')] }] }));
      fs.writeFileSync(path.join(dir, 'plain.json'), JSON.stringify({ show: 'Plain', slug: 'plain', seasons: [{ season: 1, episodes: [pick('x')] }] }));
      const r = matcherCheck({ showsDir: dir });
      assert.equal(r.ok, true, r.detail);
      assert.equal(r.warn, true);
      assert.equal(r.fallback.count, 1);
      assert.equal(r.fallback.scanned, 2);
      assert.deepEqual(r.fallback.grids.map((g) => [g.slug, g.picks, g.unnamed, g.share, g.junk]), [['the-parkers', 4, 3, 0.75, 1]]);
      assert.match(r.detail, /self-tests pass; 1 fallback grid/);
      const clean = matcherCheck({ showsDir: path.join(dir, 'nothing-here') });
      assert.equal(clean.ok, true);
      assert.equal(clean.warn, false);
      assert.equal(clean.fallback.count, 0);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});
