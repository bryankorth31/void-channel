// Tests for VOIDtv Kids' strict matching: scripts/lib/strict.js on its own, then scripts/match.js run on a small
// fixture catalog in a temp folder, once strict and once not (the contrast shows the gate is what changes things).
// Run:  node --test scripts/test/strict.test.js        No network; nothing outside the temp folder is written.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const S = require('../lib/strict');

const ROOT = path.join(__dirname, '..', '..');
const RULES_RAW = JSON.parse(fs.readFileSync(path.join(ROOT, 'profiles', 'kids', 'rules.json'), 'utf8'));
const RULES = S.compile(RULES_RAW);

// ---- strict.js ------------------------------------------------------------------------------------------------
const tv = (runtime, names = []) => ({ runtime, episodes: names.map((name, i) => ({ season: 1, number: i + 1, name, runtime })) });
const show = (name, runtime, opts = {}) => S.forShow(RULES, { name, flags: opts.flags || [] }, tv(runtime, opts.episodes || []));
const item = (o = {}) => ({ id: 'item-1', title: 'Test Toon Season 1', uploader: 'fan@example.org', collection: 'opensource_movies', description: 'Recorded off TV.', ...o });
const file = (name, minutes, o = {}) => ({ name, seconds: Math.round(minutes * 60), playable: true, ...o });
const check = (ctx, it, f, denied) => S.checkFile(ctx, it, f, denied || new Set());

test('rules.json compiles: every word list is a valid set of regexes', () => {
  for (const k of ['denyWords', 'denyNames', 'denyWhole', 'allowPhrases', 'denyCollections']) assert.ok(RULES_RAW[k].length, k + ' is empty');
  assert.ok(RULES.words.length > 40 && RULES.names.length > 10);
  assert.deepStrictEqual(RULES_RAW.denyUploaders, []);
});

test('deny words are caught in the title, subject, description and file name', () => {
  const ctx = show('Test Toon', 25);
  const clean = file('Test Toon S01E01 Pilot Party', 24);
  assert.strictEqual(check(ctx, item(), clean).ok, true);
  const t = check(ctx, item({ title: 'Test Toon YouTube Poop' }), clean);
  assert.deepStrictEqual([t.ok, t.reasons], [false, ['words: youtube poop (title)']]);
  assert.deepStrictEqual(check(ctx, item({ subject: ['cartoons', 'G Major'] }), clean).reasons, ['words: g major (subject)']);
  assert.deepStrictEqual(check(ctx, item({ description: '<p>Test Toon but it gets <b>sped up</b></p>' }), clean).reasons, ['words: sped up (description)']);
  assert.deepStrictEqual(check(ctx, item(), file('Test_Toon_S01E01_Pilot_Party.EXE', 24)).reasons, ['words: exe (file)']);
  assert.deepStrictEqual(check(ctx, item({ title: 'Caillou Gets Grounded' }), clean).reasons, ['words: gets grounded (title)']);
  assert.deepStrictEqual(check(ctx, item(), file('Season 1/Test Toon Fan-Made Episode', 24)).reasons, ['words: fan made (file)']);
  // whole words only: "memento" is not "meme", "Amvest" is not "AMV"
  assert.strictEqual(check(ctx, item({ title: 'Test Toon Memento Amvest' }), clean).ok, true);
});

test('"compilation", "collection" and the coordinator\'s song/clip words are rejected', () => {
  const ctx = show('Sesame Street', 55);
  const ep = file('Sesame Street Episode 4001', 56);
  assert.deepStrictEqual(check(ctx, item({ title: 'Sesame Street Compilation' }), ep).reasons, ['words: compilation (title)']);
  assert.deepStrictEqual(check(ctx, item({ title: 'Sesame Street Kids Videos Collection' }), ep).reasons, ['words: kids videos (title)']);
  assert.deepStrictEqual(check(ctx, item({ title: 'Classic Cartoon Collection' }), ep).reasons, ['words: collection (title)']);
  assert.deepStrictEqual(check(ctx, item({ title: "123 Sesame Street Kids' Favorite Songs 2" }), ep).reasons, ['words: favorite songs (title)']);
  for (const t of ['Sesame Street Sing-Along', 'Sesame Street: Songs from the Street', 'Best of Elmo', 'Sesame Street Greatest Hits', 'Sesame Street Clips',
    'Sesame Street Bloopers', 'Behind the Scenes at Sesame Street', 'Sesame Street Promo', 'PBS Commercials 1994', 'PBS Kids Bumpers', 'Sesame Street Trailer', 'Sesame Street VHS Opening', 'Sesame Street Previews'])
    assert.strictEqual(check(ctx, item({ title: t }), ep).ok, false, t);
  // ...but the show's own collection is not junk
  assert.strictEqual(check(ctx, item({ title: 'Sesame Street Collection' }), ep).ok, true);
  assert.strictEqual(check(show('The Joy of Painting', 30), item({ title: 'The Joy of Painting (Almost HD Collection)' }), file('The Joy of Painting - S01E01 - A Walk in the Woods', 27)).ok, true);
});

test('extras words count in the file\'s own name or a folder of extras, not in the item title', () => {
  const ctx = show('Invader Zim', 22);
  const it = item({ title: 'Invader Zim Complete Series with Bonus Features + Extras' });
  assert.strictEqual(check(ctx, it, file('Invader Zim Complete + Extras/Season 1/Invader Zim S01E01 The Nightmare Begins', 22)).ok, true);
  assert.deepStrictEqual(check(ctx, it, file('Extras/Interview with the voice cast', 22)).reasons, ['words: interview (file)']);
  assert.deepStrictEqual(check(ctx, it, file('Extras/Invader Zim Pilot', 22)).reasons, ['words: extras (folder)']);
  assert.deepStrictEqual(check(ctx, it, file('Disc 4/Bonus Features/Invader Zim Pilot', 22)).reasons, ['words: bonus features (folder)']);
  assert.deepStrictEqual(check(ctx, it, file('Invader Zim Deleted Scenes', 22)).reasons, ['words: deleted scenes (file)']);
});

test('names-only words do not fire on prose; allowed phrases are taken out first', () => {
  const ctx = show('Mighty Max', 22);
  const ep = file('Mighty Max S1 E01', 22);
  assert.strictEqual(check(ctx, item({ description: 'Based on the British Mighty Max toys. This collection has all 40 episodes.' }), ep).ok, true);
  assert.deepStrictEqual(check(ctx, item({ title: 'Mighty Max Toys' }), ep).reasons, ['words: toys (title)']);
  // subject tags are keywords, read like prose (the real tags that cost Mighty Max and Phineas and Ferb their episodes)
  assert.strictEqual(check(ctx, item({ subject: ['Mighty Max', 'Bluebird Toys', 'Lost Media', 'parody', 'movies'] }), ep).ok, true);
  assert.deepStrictEqual(check(ctx, item({ subject: ['Mighty Max', 'YTP'] }), ep).reasons, ['words: ytp (subject)']);
  assert.strictEqual(check(ctx, item({ description: 'Nick broadcast, commercials removed' }), ep).ok, true);
  assert.deepStrictEqual(check(ctx, item({ description: 'Nick broadcast with commercials' }), ep).reasons, ['words: commercials (description)']);
});

test('a deny word inside one of the show\'s own episode titles is not junk', () => {
  const ctx = show('Cow and Chicken', 30, { episodes: ["Cow's Toys", 'The Opening Gambit'] });
  assert.strictEqual(check(ctx, item({ title: 'Cow and Chicken Season 4' }), file("S04E03 Cow's Toys - I Scream, Man", 23)).ok, true);
  assert.strictEqual(check(ctx, item(), file("Cow and Chicken Cow's Toys YTP", 23)).ok, false);
});

test('intro, opening and theme song are rejected only when that is the whole item', () => {
  const ctx = show('Eek! The Cat', 30);
  assert.deepStrictEqual(check(ctx, item({ title: 'Eek! The Cat Intro (Season 2, 1993-1994)' }), file('Eek! The Cat S02E01', 22)).reasons, ['words: whole intro (title)']);
  assert.deepStrictEqual(check(ctx, item(), file('Eek The Cat - Theme Song (HQ)', 22)).reasons, ['words: whole theme song (file)']);
  assert.strictEqual(check(ctx, item(), file('Eek! The Cat S04E04 - The Opening Gambit Syndrome', 22)).ok, true);
  assert.deepStrictEqual(check(ctx, item({ title: 'Opening to Eek! The Cat 1994 VHS' }), file('x', 22)).reasons, ['words: opening to (title)']);
});

test('runtime: a 3-minute meme is rejected for a 25-minute show', () => {
  const r = check(show('Arthur', 25), item({ title: 'Arthur' }), file('Arthur S01E01 Arthur\'s Eyes', 3));
  assert.strictEqual(r.ok, false);
  assert.match(r.reasons[0], /^runtime: 3\.0 min outside 15\.0-42\.5$/);
});

test('runtime: a 7-minute short is accepted for a shorts show, and not for a half-hour show', () => {
  const short = file('Tom and Jerry - Puss Gets the Boot (1940)', 7);
  assert.strictEqual(check(show('Tom and Jerry', 7, { flags: ['shorts'] }), item(), short).ok, true);
  assert.strictEqual(check(show('Tom and Jerry', 30, { flags: ['shorts'] }), item(), short).ok, true); // the TV package's runtime
  assert.strictEqual(check(show('Tom and Jerry', 30, { flags: ['shorts'] }), item(), file('Tom and Jerry clip', 3)).ok, false); // floor: 4 minutes
  assert.strictEqual(check(show('Tom and Jerry', 30), item(), short).ok, false);
});

test('runtime: a 60-minute Sesame Street episode is accepted (runtime 55)', () => {
  const r = check(show('Sesame Street', 55), item({ title: 'Sesame Street Episode 4001' }), file('Sesame Street Episode 4001', 60));
  assert.deepStrictEqual([r.ok, r.band], [true, 'episode']);
});

test('two stories in one file: the titles of two neighbouring stories make a pair, numbers do not matter (WordGirl)', () => {
  const ctx = show('Word Kid', 12, { episodes: ['Tobey or Consequences', 'High-Fat Robbery', "Tobey's Masterpiece", 'Chuck the Nice Pencil-Selling Guy', 'Pizza', 'Pasta'] });
  const p = S.pairOf(ctx, "Season 1 Episode 8 - Tobey's Masterpiece + Chuck the Nice Pencil-Selling Guy");
  assert.deepStrictEqual([p.a.number, p.b.number], [3, 4]);
  assert.strictEqual(S.pairOf(ctx, 'WordKid_S01E11_Chuck the Nice Pencil-Selling Guy _ Tobey or Consequences'), null); // not neighbours in the guide
  assert.strictEqual(S.pairOf(ctx, 'Word Kid S01E02 High-Fat Robbery'), null); // one story
  assert.strictEqual(S.pairOf(ctx, 'Word Kid Pizza Pasta'), null); // one-word titles are too common to trust
  assert.strictEqual(S.pairOf(ctx, 'Word Kid High-Fat Robbery and Tobey or Consequences'), null); // the wrong order
  const pairFile = file("Word Kid - Tobey's Masterpiece + Chuck the Nice Pencil-Selling Guy", 27);
  assert.deepStrictEqual([check(ctx, item({ title: 'Word Kid Complete' }), pairFile).ok, check(ctx, item({ title: 'Word Kid Complete' }), pairFile).band], [true, 'double']); // 27 min for 12-min stories
  assert.strictEqual(check(ctx, item({ title: 'Word Kid Complete' }), file('Word Kid - Tobey Masterpiece', 27)).ok, false); // a single story at 27 minutes is still too long
});

test('runtime: up to 2.2x only when the name carries two episode numbers', () => {
  const ctx = show('Test Toon', 22);
  assert.deepStrictEqual(check(ctx, item(), file('Test Toon S01E01-E02', 46)).band, 'double');
  assert.strictEqual(check(ctx, item(), file('Test Toon S01E01-E02', 46)).ok, true);
  assert.strictEqual(check(ctx, item(), file('Test Toon S01E01', 46)).ok, false);
  assert.strictEqual(check(ctx, item(), file('Test Toon S01E01-E02', 50)).ok, false); // over 2.2x
  for (const n of ['Show S01E01E02', 'Show.S01E01-02.720p', 'Show 1x01-1x02', 'Show - Episodes 1 & 2', 'Show 101-102']) assert.strictEqual(S.twoEpisodes(n), true, n);
  for (const n of ['Show S01E01 - 2 Stupid Dogs', 'Show S01E01 1080p', 'Show Episodes 1-26', 'Show 1993-1994', 'Show S01E01a']) assert.strictEqual(S.twoEpisodes(n), false, n);
  // TVmaze's show runtime and its median episode runtime both count (2 Stupid Dogs: show 7, i.e. segments; episodes 30)
  const dogs = S.forShow(RULES, { name: '2 Stupid Dogs' }, { runtime: 7, episodes: [{ runtime: 30 }, { runtime: 30 }, { runtime: 15 }] });
  assert.deepStrictEqual(dogs.runtimes, [7, 30]);
  assert.strictEqual(check(dogs, item(), file('2 Stupid Dogs S01E01b', 7)).ok, true);
  assert.strictEqual(check(dogs, item(), file('2 Stupid Dogs S01E01', 22)).ok, true);
  assert.match(check(dogs, item(), file('2 Stupid Dogs S01E09', 3)).reasons[0], /outside 4.2-11.9 and 18.0-51.0/);
  assert.strictEqual(check(S.forShow(RULES, { name: 'X' }, { runtime: null, episodes: [] }), item(), file('X S01E01', 22)).reasons[0], 'runtime: show runtime unknown');
});

test('denied uploaders and collections', () => {
  const rules = S.compile({ ...RULES_RAW, denyUploaders: ['Junk@Example.org'] });
  const ctx = S.forShow(rules, { name: 'Test Toon' }, tv(22));
  // uploaders are keyed by hunt.js's uploaderHash (sha1 of the trimmed, lower-cased address, 12 hex), never the address
  const H = S.uploaderKey({ uploader: 'junk@example.org' });
  assert.match(H, /^[0-9a-f]{12}$/);
  assert.deepStrictEqual(S.checkFile(ctx, item({ uploader: 'junk@example.org' }), file('Test Toon S01E01', 22)).reasons, ['uploader: ' + H]); // an old candidates file with the raw address
  assert.deepStrictEqual(S.checkFile(ctx, item({ uploader: undefined, uploaderHash: H }), file('Test Toon S01E01', 22)).reasons, ['uploader: ' + H]); // a new one: the hash only
  const byHash = S.forShow(S.compile({ ...RULES_RAW, denyUploaders: [H] }), { name: 'Test Toon' }, tv(22)); // rules.json may list the hash itself
  assert.deepStrictEqual(S.checkFile(byHash, item({ uploader: undefined, uploaderHash: H }), file('Test Toon S01E01', 22)).reasons, ['uploader: ' + H]);
  assert.deepStrictEqual(check(show('Test Toon', 22), item({ collection: ['mirrortube', 'social-media-video'] }), file('Test Toon S01E01', 22)).reasons, ['collection: mirrortube, social-media-video']);
});

test('another series of the same name: a year after the show\'s name outside its run', () => {
  const tmnt = S.forShow(RULES, { name: 'Teenage Mutant Ninja Turtles' }, { runtime: 25, premiered: '1987-12-14', episodes: [{ name: 'Turtle Tracks', airdate: '1987-12-14' }, { name: 'Divide and Conquer', airdate: '1996-11-02' }] });
  const ep = file('Teenage Mutant Ninja Turtles (2003) The Complete Series/Season 01/Teenage Mutant Ninja Turtles S01E01', 22);
  assert.deepStrictEqual(S.checkFile(tmnt, item({ title: 'Teenage Mutant Ninja Turtles (2003): The Complete Series' }), ep).reasons, ['series: 2003 (the show ran 1987-1996)']);
  assert.deepStrictEqual(S.checkFile(tmnt, item({ title: 'TMNT' }), ep).reasons, ['series: 2003 (the show ran 1987-1996)']); // the file says so too
  assert.strictEqual(S.checkFile(tmnt, item({ title: 'Teenage Mutant Ninja Turtles 1987 Season 9 & 10' }), file('09x05 - The Showdown', 24)).ok, true);
  const duck = S.forShow(RULES, { name: 'DuckTales' }, { runtime: 30, premiered: '2017-08-11', episodes: [{ name: 'Woo-oo!', airdate: '2017-08-11' }, { name: 'The Last Adventure!', airdate: '2021-03-15' }] });
  assert.strictEqual(S.checkFile(duck, item({ title: 'DuckTales (2017) Complete TV Series' }), file('DuckTales (2017) - S01E01 - Woo-oo!', 44)).ok, true);
  assert.strictEqual(S.checkFile(duck, item({ title: 'DuckTales (1987) Season 1' }), file('DuckTales - S01E01', 22)).ok, false);
  // a known spin-off filed under the show's name (rules.json spinoffs)
  assert.deepStrictEqual(S.checkFile(tmnt, item({ title: 'Teenage Mutant Ninja Turtles - The Next Mutation - Complete' }), file('Ninja Turtles - Next Mutation S01E01', 21)).reasons, ['series: spin-off next mutation']);
});

test('adult and gore terms: whole words, with Roman numerals, Bikini Bottom and Al Gore left alone', () => {
  const ctx = show('Scooby-Doo, Where Are You!', 22);
  const ep = file('Scooby-Doo Where Are You S01E01', 22);
  for (const w of ['NSFW', 'Porn', 'pornographic', 'Hentai', 'Rule 34', 'R34', 'Fanservice', 'fan service', 'Lewd', 'Ecchi', 'Swimsuit', 'Bikini', 'Uncensored', '(18+)', 'Adults Only', 'XXX', 'Nude', 'Nudity', 'Gore', 'Jumpscare', 'jump scares', 'Scary Edit'])
    assert.strictEqual(check(ctx, item({ title: 'Scooby-Doo ' + w }), ep).ok, false, w);
  // the real kids uploads these were written for
  assert.deepStrictEqual(check(ctx, item({ title: '[Scooby-Doo!] The Best of Female Fanservice (Swimsuit, Bikini, Leotard, Nightgown, and more!)' }), ep).reasons[0], 'words: fanservice (title)');
  assert.deepStrictEqual(check(show('Sesame Street', 55), item({ title: 'SESAME STREET EPISODE 2212', subject: ['SESAME STREET', 'NOGGIN', 'PORN'] }), file('2212', 56)).reasons, ['words: porn (subject)']);
  assert.deepStrictEqual(check(ctx, item(), file('GUTZ - TW AND GORE - ROBOT BODY', 22)).reasons, ['words: gore (file)']);
  // not these
  for (const s of ['Super Bowl XXX Halftime', 'WrestleMania XXX', 'Episode XXX', 'Part XXX', 'SpongeBob in Bikini Bottom', 'Al Gore visits', 'Chris Gore reviews', 'For All Time (2000-10-18 +++++ Time Travel)', 'Ages 18 and up', 'Nudist'])
    assert.strictEqual(check(ctx, item({ title: s }), ep).ok, true, s);
  assert.strictEqual(check(ctx, item({ description: 'Porno for Pyros on MTV. The SI swimsuit issue. Film expert Chris Gore.' }), ep).ok, true); // prose
});

test('profanity and slurs: whole words anywhere, no excuse from an episode title, ambiguous words left alone', () => {
  const ctx = show('Popeye the Sailor', 7, { flags: ['shorts'], episodes: ['Scrap the Japs', 'Who\'re You Calling Two-Dimensional?'] });
  const ep = file('Popeye - A Dream Walking (1934)', 7);
  for (const w of ['Fuck', 'motherfucking', 'Shitty', 'bullshit', 'Bitch', 'Asshole', 'Bastard', 'Slut', 'Whore', 'Penis', 'Vagina', 'Sexy', 'Porn', 'Retarded'])
    assert.strictEqual(check(ctx, item({ title: 'Popeye ' + w }), ep).ok, false, w);
  assert.deepStrictEqual(check(ctx, item({ subject: ['SESAME STREET', 'NOGGIN', 'TINY DANCER', 'FUCK'] }), ep).reasons, ['words: fuck (subject)']);
  assert.deepStrictEqual(check(ctx, item({ description: 'what a shitshow' }), ep).reasons, ['words: shitshow (description)']);
  assert.deepStrictEqual(check(ctx, item(), file('Popeye - Scrap the Japs (1942)', 7)).reasons, ['words: japs (file)']); // a real 1942 title, still out
  for (const s of ["Who're You Calling Two-Dimensional?", 'Dick Tracy', 'Moby Dick', 'Cock-a-Doodle-Doo', 'Hell Bent for Election', 'Damn Yankees', 'Kick Ass', 'Sex and the Animals',
    'The Dick Van Dyke Show', 'Spic and Span', 'A chink in the armor', 'Coon hound pups', 'Scunthorpe', 'Classic Bass', 'Shiitake'])
    assert.strictEqual(check(ctx, item({ title: s }), ep).ok, true, s);
});

test('uploaders to look at: an uploader with a profane or adult item is listed, not denied', () => {
  const entry = { name: 'Sesame Street', flags: [] }, tvl = tv(55, ['Episode 2212']);
  const items = [item({ id: 'ss-2212', title: 'SESAME STREET EPISODE 2212', uploader: 'troll@example.org', subject: ['SESAME STREET', 'PORN'], files: [file('2212', 56)] }),
    item({ id: 'ss-2213', title: 'Sesame Street Episode 2213', uploader: 'troll@example.org', subject: ['SESAME STREET'], files: [file('2213', 56)] })];
  const J = S.judge(RULES, entry, tvl, items, []);
  assert.strictEqual(J.pass(items[0], items[0].files[0]), false);
  assert.strictEqual(J.pass(items[1], items[1].files[0]), true); // one bad item is not a reputation; a person decides
  const r = J.finish(0, []);
  assert.deepStrictEqual(r.uploadersDenied, []);
  const T = S.uploaderKey({ uploader: 'troll@example.org' });
  assert.deepStrictEqual(r.uploadersToLookAt, [{ uploader: T, items: 1, example: 'porn: SESAME STREET EPISODE 2212' }]);
  assert.deepStrictEqual(J.uploaders.toLookAt.map((x) => x.uploader), [T]); // the hash, for cache/ only: no address is kept anywhere
  assert.match(S.markdown({ shows: { 'Sesame Street': r } }), new RegExp('## Uploaders to look at[\\s\\S]*\\*\\*Sesame Street\\*\\*: ' + T + ', 1 item \\(porn: SESAME STREET EPISODE 2212\\)'));
  assert.strictEqual(S.mask('someone@example.com'), 'som…@example.com');
});

test('shorts: 4 to 15 minutes whatever the TVmaze runtime', () => {
  const pkg = show('Tom and Jerry', 30, { flags: ['shorts'] }); // a half-hour TV package
  assert.strictEqual(check(pkg, item(), file('Tom and Jerry - The Cat Concerto', 7)).ok, true);
  assert.strictEqual(check(pkg, item(), file('Tom and Jerry - Two shorts', 14.5)).ok, true);
  assert.match(check(pkg, item(), file('Tom and Jerry Show S01E01', 22)).reasons[0], /^runtime: 22\.0 min outside 4\.0-15\.0$/);
  assert.strictEqual(check(pkg, item(), file('Tom and Jerry S01E01-E02', 16)).ok, false); // two episode numbers do not lift the cap
});

test('subjectUnknown: never a rejection on its own; counted in the report and listed in STRICT.md', () => {
  const entry = { name: 'Test Toon', flags: [] }, tvl = tv(22, ['Pilot Party']);
  const items = [item({ id: 'seen', subject: ['cartoons'], files: [file('Test Toon S01E01 Pilot Party', 22)] }), item({ id: 'unseen', subjectUnknown: true, files: [file('Test Toon S01E01 Pilot Party', 22)] })];
  const J = S.judge(RULES, entry, tvl, items, []);
  assert.strictEqual(J.pass(items[1], items[1].files[0]), true);
  const seasons = [{ season: 1, episodes: [{ number: 1, state: 'LIVE', file: { item: 'unseen' } }] }];
  const r = J.finish(1, seasons);
  assert.deepStrictEqual(r.subjectUnknown, { items: 1, keptEpisodes: 1, ids: ['unseen'] });
  const md = S.markdown({ shows: { 'Test Toon': r } });
  assert.match(md, /\*\*Test Toon\*\*: 1 items, 1 kept episodes from them: unseen/);
  assert.strictEqual(S.totals({ 'Test Toon': r }).subjectUnknownItems, 1);
});

test('production numbers: read from a name only next to episode / ep / show / no. / #, or as the only number', () => {
  const P = S.productionNumber;
  for (const [s, n] of [['Sesame Street - Episode 4133', 4133], ["Mister Rogers' Neighborhood Episode 1574", 1574], ['Episode No. 1721', 1721], ['#1586', 1586],
    ['Sesame Street (2594)', 2594], ['4133 Sesame Street', 4133], ['Sesame-Street-_2257_', 2257], ['Sesame Street- Ep. 1840 (first 30 Minutes)', 1840],
    ["Mister Rogers' Neighborhood Season 1979 Episode 1461 Goes to School Part 1", 1461], ['Sesame Street Episode 1987', 1987], ['Show 1051', 1051]]) assert.strictEqual(P(s), n, s);
  // years are not production numbers unless a word says so; nor is one of two numbers
  for (const s of ['Sesame Street (1987)', 'Sesame Street 1987-04-13', 'Sesame-Street-_2275_-pt.-1_', '4096 and 4100 - Movie 1', 'Sesame Street 720p', 'Sesame Street', 'Sesame Street 56'])
    assert.strictEqual(P(s), null, s);
  // a disc, volume, part, track, tape or season number is never a production number
  for (const s of ['Disc 110', 'Disk-111', 'DVD 115', 'Vol. 116', 'Volume 1234', 'Part 101', 'pt.-202', 'CD 303', 'Track 404', 'Tape 505', 'Reel 606', 'Season 1979', 'Disc No. 3'])
    assert.strictEqual(P(s), null, s);
  assert.strictEqual(P('Disc 2 Episode 1465'), 1465);
  const ctx = S.forShow(RULES, { name: "Mister Rogers' Neighborhood" }, { runtime: 30, episodes: [{ season: 1, number: 110, name: 'Show 110', airdate: '1968-07-19' }, { season: 1, number: 111, name: 'Show 111', airdate: '1968-07-22' }] });
  const disc = { title: "Mister Roger's Neighborhood Collection", files: [{ name: "Mister Roger's Neighborhood Collection/Disc 1/Disc 110" }, { name: 'Disc 111/MRN' }] };
  assert.strictEqual(S.productionMatch(ctx, disc, disc.files[0]), null); // the real Archive layout that placed four files on Show 110-116
  assert.strictEqual(S.productionMatch(ctx, disc, disc.files[1]), null); // nor from a folder name
});

test('production numbers: TVmaze names, and numbered runs from rules.json (Mister Rogers 1461 on from 1979)', () => {
  const eps = [{ season: 2, number: 51, name: 'Show 1051', airdate: '1969-04-21' }, { season: 8, number: 51, name: 'Repeat of 676 (976)', airdate: '1976-01-01' },
    { season: 20, number: 108, name: 'Episode 2594', airdate: '1989-04-13' }, { season: 10, number: 2, name: 'Mister Rogers Goes to School (2)', airdate: '1979-08-21' },
    { season: 10, number: 1, name: 'Mister Rogers Goes to School (1)', airdate: '1979-08-20' }, { season: 1, number: 1, name: 'Change (1)', airdate: '1968-02-19' }];
  const idx = S.productionIndex(RULES, { name: "Mister Rogers' Neighborhood" }, { episodes: eps });
  assert.deepStrictEqual([1051, 976, 2594, 1461, 1462].map((n) => idx.get(n) && idx.get(n).season + 'x' + idx.get(n).number), ['2x51', '8x51', '20x108', '10x1', '10x2']);
  assert.ok(!idx.has(1) && !idx.has(1463));
  const ctx = S.forShow(RULES, { name: "Mister Rogers' Neighborhood" }, { runtime: 30, episodes: eps });
  const one = { title: "Mister Rogers' Neighborhood Episode 1462", files: [{ name: 'MRN Goes to School Part 2' }] };
  assert.strictEqual(S.productionMatch(ctx, one, one.files[0]).ep.name, 'Mister Rogers Goes to School (2)'); // a one-file item: its title speaks for the file
  assert.strictEqual(S.productionMatch(ctx, { title: 'Episode 1462', files: [{}, {}] }, { name: 'Disc 1 Title 3' }), null); // a many-file item's title does not
});

test('match: a production number TVmaze knows is a LIVE match, and beats the same digits read as S/E', () => {
  const live = (g) => g.seasons[0].episodes.filter((e) => e.state === 'LIVE').map((e) => e.name + ' <- ' + e.file.name);
  assert.deepStrictEqual(live(RUN.strict.grids['number-street']), ['Episode 2594 <- Number Street (2594)', 'Show 104 <- Number Street Show 104']);
  assert.deepStrictEqual(live(RUN.loose.grids['number-street']), ['Big Bird Day <- Number Street Show 104']); // without strict: "(2594)" finds nothing, "104" lands on 1x04
});

test('uploader reputation: 3 word-flagged items for the show deny all that uploader\'s items for it', () => {
  const ctx = show('Test Toon', 22);
  const by = (u, title, fname = 'Test Toon S01E01') => item({ id: title, title, uploader: u, files: [file(fname, 22)] });
  const items = [by('junk@x', 'Test Toon YTP'), by('junk@x', 'Test Toon Compilation'), by('junk@x', 'Test Toon', 'Test Toon sped up'),
    by('junk@x', 'Test Toon Season 2'), by('meh@x', 'Test Toon Meme'), by('meh@x', 'Test Toon AMV'), by('meh@x', 'Test Toon Season 3')];
  const denied = S.reputation(ctx, items);
  const J = S.uploaderKey({ uploader: 'junk@x' });
  assert.deepStrictEqual([...denied], [J]); // meh@x has 2 flagged items: under the line (uploaders are keyed by their hash)
  assert.deepStrictEqual(S.checkFile(ctx, items[3], items[3].files[0], denied).reasons, ['reputation: ' + J]);
  assert.strictEqual(S.checkFile(ctx, items[6], items[6].files[0], denied).ok, true);
});

// ---- match.js on a fixture catalog ----------------------------------------------------------------------------
const norm = (s) => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const slug = (s) => norm(s).replace(/ /g, '-');
function hunted(id, title, uploader, files, o = {}) { // a candidates item as scripts/hunt.js writes it
  return { id, title, uploader, collection: 'opensource_movies', description: '', ...o, files: files.map(([name, min, ep]) => { // ep: the S/E hunt.js would parse, when it differs from the name's SxxEyy
    const se = /\bs(\d{1,2})\s?e(\d{1,3})\b/i.exec(name);
    return { name, file: name + '.mp4', format: 'h.264', playable: true, seconds: Math.round(min * 60), band: min < 4 ? 'clip' : 'episode', sizeMB: 100, nameHit: false, ep: ep !== undefined ? ep : se ? { season: +se[1], episode: +se[2] } : null, url: 'https://archive.org/download/' + id + '/' + encodeURIComponent(name) + '.mp4' };
  }) };
}
const SHOWS = [
  { name: 'Test Toon', runtime: 22, episodes: ['Pilot Party', 'Big Day Out', 'Moon Picnic', 'Rainy Racers'], items: [
    hunted('toon-s1', 'Test Toon Season 1', 'good@x', [['Test Toon S01E01 Pilot Party', 22], ['Test Toon - Big Day Out', 22], ['Test Toon S01E03 Moon Picnic', 3]]),
    hunted('toon-ytp', 'Test Toon YTP', 'junk@x', [['Test Toon S01E04 YTP', 22]]),
    hunted('toon-comp', 'Test Toon compilation', 'junk@x', [['Test Toon best bits', 22]]),
    hunted('toon-fast', 'Test Toon', 'junk@x', [['Test Toon sped up', 22]]),
    hunted('toon-rips', 'Test Toon Season 1 Rips', 'junk@x', [['Test Toon S01E04 Rainy Racers', 22]]),
  ] },
  { name: 'Self Show', runtime: null, items: [hunted('self-show', 'Self Show', 'a@x', [1, 2, 3, 4, 5, 6].map((n) => ['Self Show Episode ' + n, 25]))] },
  { name: 'Weak Maze Show', runtime: 22, episodes: ['Alpha Story', 'Beta Story'], items: [hunted('weak-maze', 'Weak Maze Show', 'a@x', Array.from({ length: 25 }, (_, n) => ['Weak Maze Show Part ' + (n + 1), 22]))] },
  { name: 'Per File Pup', runtime: 22, flags: ['perFile'], episodes: ['First Bark', 'Second Bark'], accept: ['pup|Per File Pup S01E02 Second Bark'],
    items: [hunted('pup', 'Per File Pup', 'a@x', [['Per File Pup S01E01 First Bark', 22], ['Per File Pup S01E02 Second Bark', 22]])] },
  // byNumber (Sesame Street): the guide names one episode by number; the uploads carry numbers the guide does not have
  { name: 'Count Lane', runtime: 55, flags: ['byNumber'], episodes: ['Episode 1001', 'Big Bird Visits'], items: [
    hunted('cl-1001', 'Count Lane - Episode 1001', 'a@x', [['Count Lane - Episode 1001', 56]]),
    hunted('cl-2212', 'Count Lane Episode 2212 (Oscar Goes to the Hospital)', 'a@x', [['Count Lane 2212', 57]]),
    hunted('cl-3007', 'Count Lane (3007)', 'b@x', [['cl3007.mp4', 54]]),
    hunted('cl-3007b', 'Count Lane (3007)', 'c@x', [['Count Lane 3007 hd', 55]]),
    hunted('cl-songs', 'Count Lane Favorite Songs 4', 'b@x', [['Count Lane Favorite Songs 4', 55]]), // a compilation: no
    hunted('cl-short', 'Count Lane (4133)', 'b@x', [['Count Lane 4133', 12]]), // a clip, not the episode: no
    hunted('cl-plain', 'Count Lane Classics', 'b@x', [['Count Lane classic', 55]])] }, // no number: no
  { name: 'Waiting Whale', runtime: 22, flags: ['perFile'], episodes: ['First Splash', 'Second Splash'],
    items: [hunted('whale', 'Waiting Whale', 'a@x', [['Waiting Whale S01E01 First Splash', 22], ['Waiting Whale S01E02 Second Splash', 22]])] },
  { name: 'The Flintstones', runtime: 25, episodes: ['The Flintstone Flyer', 'Hot Lips Hannigan', 'The Swimming Pool', 'No Help Wanted', 'The Split Personality', 'The Monster from the Tar Pits'], items: [
    hunted('the-flintstones-s1', 'The Flintstones Season 1', 'a@x', [['The Flintstones S01E01 The Flintstone Flyer', 25]]),
    // the real spin-off upload (Archive item flintstonescomedyshowcomplete): numbered segment titles, the show named only in its id and description
    hunted('flintstonescomedyshowcomplete', 'The Flintstone Comedy Show Complete Series (1972)', 'df@x', [
      ['01. Birdbrained - Squawkie Talkies - Bedrock 500', 21], ['02. The Flying Fools - Bedlam in Bedrock - The Stone Ranger Rides Again', 21],
      ['03. Cat Burglars - The Circus Show - Pizza-Puss', 22], ['04. Fred Skirts the Issue - Hair Scare - The Not So Desperate Hours', 22],
      ['05. Don\'t Fence Me In - The Spot Remover - Cake Walk', 21], ['06. The Loving Cup - Bedrock Surfers - Handicapped', 21]],
      { collection: 'saturdaymorningcartoons', description: 'Here are all episodes of the Flintstones Comedy Show (1972).' }),
  ] },
  // An upload counted in another order (B, 16 Nov 2026: Wild Kratts S04E08 is the guide's 4x6): the file's own title outranks its numbers
  { name: 'Order Kratts', runtime: 22, episodes: ['Sea Otter Swim', 'Spirit Bear', 'Bumble Bees', 'Chimpanzee and Me', 'Fern Day'], items: [
    hunted('ok-1', 'Order Kratts Season 1', 'a@x', [['Order Kratts S01E01 Spirit Bear', 22], ['Order Kratts S01E03 Totally Different Words', 22],
      ['Order Kratts S01E05 Lost Kite - Chimpanzee and Me', 22]]),
  ] },
  // TVmaze names episodes by production number (Sesame Street "Episode 2594", Mister Rogers "Show 1051"); hunt.js reads "104" as 1x04
  { name: 'Number Street', runtime: 55, episodes: ['Episode 2593', 'Episode 2594', 'Show 104', 'Big Bird Day'], items: [
    hunted('ns-2594', 'Number Street (2594)', 'a@x', [['Number Street (2594)', 58]]),
    hunted('ns-104', 'Number Street Show 104', 'a@x', [['Number Street Show 104', 56, { season: 1, episode: 4 }]]),
  ] },
];
function catalog(root, profile, strict) {
  const P = path.join(root, 'profiles', profile), C = path.join(P, 'catalog');
  for (const d of ['candidates', 'cache', 'shows']) fs.mkdirSync(path.join(C, d), { recursive: true });
  fs.writeFileSync(path.join(P, 'profile.json'), JSON.stringify({ siteName: 'Fixture', listFile: `profiles/${profile}/list.json`, catalogDir: `profiles/${profile}/catalog`, siteDir: `profiles/${profile}/site`, strict }));
  fs.copyFileSync(path.join(ROOT, 'profiles', 'kids', 'rules.json'), path.join(P, 'rules.json'));
  fs.writeFileSync(path.join(P, 'list.json'), JSON.stringify({ shows: SHOWS.map((s) => ({ name: s.name, type: 'Little Kids', network: 'PBS', tier: 'pbs', flags: s.flags || [], approved: false })) }));
  const ov = {};
  for (const s of SHOWS) {
    fs.writeFileSync(path.join(C, 'candidates', slug(s.name) + '.json'), JSON.stringify({ show: s.name, items: s.items }));
    if (s.episodes) fs.writeFileSync(path.join(C, 'cache', 'tvmaze-' + slug(s.name) + '.json'), JSON.stringify({ id: 1, name: s.name, runtime: s.runtime, premiered: '1990-01-01', episodes: s.episodes.map((name, i) => ({ season: 1, number: i + 1, name, airdate: '1990-01-' + String(i + 1).padStart(2, '0'), runtime: s.runtime })) }));
    if (s.accept) ov[slug(s.name)] = { acceptFiles: s.accept };
  }
  fs.writeFileSync(path.join(C, 'overrides.json'), JSON.stringify(ov));
}
let TMP, RUN = {};
function run(profile) {
  const r = spawnSync(process.execPath, [path.join(TMP, 'scripts', 'match.js')], { env: { ...process.env, VOID_PROFILE: profile }, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  const dir = path.join(TMP, 'profiles', profile, 'catalog', 'shows'), grids = {};
  for (const f of fs.readdirSync(dir)) grids[f.slice(0, -5)] = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const rf = path.join(TMP, 'profiles', profile, 'catalog', 'strict-report.json');
  return { grids, report: fs.existsSync(rf) ? JSON.parse(fs.readFileSync(rf, 'utf8')) : null, md: path.join(TMP, 'profiles', profile, 'docs', 'STRICT.md'), out: r.stdout };
}
const states = (g) => g.seasons.flatMap((s) => s.episodes.map((e) => e.state));
const liveNames = (g) => g.seasons.flatMap((s) => s.episodes.filter((e) => e.state === 'LIVE').map((e) => e.file.name));

test.before(() => {
  TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'void-strict-'));
  fs.mkdirSync(path.join(TMP, 'scripts', 'lib'), { recursive: true });
  // match.js and every library it may load (the matcher has grown helpers: writeIfChanged, tvmazeguard, hardexclude...)
  fs.copyFileSync(path.join(ROOT, 'scripts', 'match.js'), path.join(TMP, 'scripts', 'match.js'));
  fs.cpSync(path.join(ROOT, 'scripts', 'lib'), path.join(TMP, 'scripts', 'lib'), { recursive: true });
  catalog(TMP, 'strict', true); catalog(TMP, 'loose', false);
  RUN.strict = run('strict'); RUN.loose = run('loose');
});
test.after(() => { if (TMP) fs.rmSync(TMP, { recursive: true, force: true }); });

test('match: a byNumber show lists the episodes its uploads number, in "Episodes by number"; the guide keeps the ones it knows', () => {
  const g = RUN.strict.grids['count-lane'];
  const s1 = g.seasons.find((s) => s.season === 1), s0 = g.seasons.find((s) => s.season === 0);
  assert.deepStrictEqual(s1.episodes.filter((e) => e.state === 'LIVE').map((e) => e.name), ['Episode 1001']); // the guide's own
  assert.deepStrictEqual(s0.episodes.map((e) => [e.number, e.name]), [[2212, 'Oscar Goes to the Hospital'], [3007, 'Episode 3007']]);
  assert.ok(s0.episodes.every((e) => e.state === 'LIVE' && /by number/.test(e.file.why)));
  assert.strictEqual(s0.episodes[1].alternates.length, 1, 'a second copy of 3007 is its alternate');
  assert.strictEqual(g.seasons[g.seasons.length - 1], s0, 'listed after the real seasons');
  assert.ok(!RUN.loose.grids['count-lane'] || !(RUN.loose.grids['count-lane'].seasons || []).some((s) => s.season === 0), 'voidtv.net never lists by number');
});

test('match: strict, a file whose own title is another episode goes there; a title matching nothing keeps its number; a second story places nothing', () => {
  const g = RUN.strict.grids['order-kratts'];
  const at = (n) => g.seasons[0].episodes.find((e) => e.number === n);
  assert.strictEqual(at(2).state, 'LIVE');
  assert.strictEqual(at(2).file.name, 'Order Kratts S01E01 Spirit Bear');
  assert.match(at(2).file.why, /its numbers say 1x1/);
  assert.ok(!at(1).file, 'not on 1x1 Sea Otter Swim, where its numbers point');
  assert.strictEqual(at(3).file.name, 'Order Kratts S01E03 Totally Different Words'); // proves nothing: the number stands
  assert.ok(!at(4).file && !at(5).file, 'a file whose second story is 1x4 plays the first story from its start, so it stands for neither');
  assert.match(RUN.strict.out, /files whose own title overruled their numbers/);
  const loose = RUN.loose.grids['order-kratts'];
  assert.strictEqual(loose.seasons[0].episodes.find((e) => e.number === 1).file.name, 'Order Kratts S01E01 Spirit Bear', 'voidtv.net (not strict) is unchanged');
});

test('match: REVIEW is never emitted in strict mode (the same files give REVIEW without it)', () => {
  assert.ok(Object.values(RUN.loose.grids).some((g) => states(g).includes('REVIEW')));
  for (const g of Object.values(RUN.strict.grids)) assert.ok(!states(g).includes('REVIEW'), g.show);
  assert.deepStrictEqual(RUN.strict.report.shows['Test Toon'].rejected.noLiveMatch, 1); // "Test Toon - Big Day Out": a title match at 0.80
  assert.deepStrictEqual(liveNames(RUN.strict.grids['test-toon']), ['Test Toon S01E01 Pilot Party']);
});

test('match: the self-list fallback is never used in strict mode', () => {
  assert.strictEqual(RUN.loose.grids['self-show'].selfListed, true); // no TVmaze list
  assert.ok(RUN.loose.grids['weak-maze-show'].tvmazeWeak); // weak TVmaze list: how The Parkers got 828 compilations
  assert.ok(!RUN.strict.grids['self-show']);
  const weak = RUN.strict.grids['weak-maze-show'];
  assert.ok(!weak.selfListed && !weak.tvmazeWeak && weak.coverage.live === 0 && weak.coverage.review === 0);
  assert.match(RUN.strict.report.shows['Self Show'].notes[0], /no TVmaze episode list/);
  for (const g of Object.values(RUN.strict.grids)) assert.ok(!g.selfListed && !g.tvmazeWeak, g.show);
});

test('match: strict checks run before scoring (words, runtime, reputation)', () => {
  const r = RUN.strict.report.shows['Test Toon'];
  const J = S.uploaderKey({ uploader: 'junk@x' });
  assert.deepStrictEqual(r.uploadersDenied, [J]); // the uploader's hash, in the report and under cache/; no address anywhere
  const full = JSON.parse(fs.readFileSync(path.join(TMP, 'profiles', 'strict', 'catalog', 'cache', 'uploaders-to-look-at.json'), 'utf8'));
  assert.deepStrictEqual(full.shows['Test Toon'].denied, [J]);
  assert.ok(!/@/.test(fs.readFileSync(path.join(TMP, 'profiles', 'strict', 'catalog', 'cache', 'uploaders-to-look-at.json'), 'utf8')), 'the cache file carries an address');
  for (const f of [path.join(TMP, 'profiles', 'strict', 'catalog', 'strict-report.json'), RUN.strict.md]) assert.ok(!/[a-z0-9._-]+@[a-z0-9-]+(\.[a-z]+)*/i.test(fs.readFileSync(f, 'utf8').replace(/…@/g, '')), f + ' carries an address');
  assert.deepStrictEqual({ words: r.rejected.words, runtime: r.rejected.runtime, reputation: r.rejected.reputation }, { words: 3, runtime: 1, reputation: 1 });
  assert.ok(liveNames(RUN.loose.grids['test-toon']).includes('Test Toon S01E04 Rainy Racers')); // LIVE without strict
  assert.ok(r.examples.reputation[0].startsWith('Test Toon S01E04 Rainy Racers'));
});

test('match: perFile shows keep only files approved in HQ, else wait with zero episodes', () => {
  assert.deepStrictEqual(liveNames(RUN.strict.grids['per-file-pup']), ['Per File Pup S01E02 Second Bark']);
  assert.strictEqual(RUN.loose.grids['per-file-pup'].coverage.live, 2);
  const whale = RUN.strict.report.shows['Waiting Whale'];
  assert.deepStrictEqual([whale.kept, whale.perFilePending, whale.notes], [0, 2, ['waiting for per-file approval']]);
  assert.strictEqual(RUN.strict.grids['waiting-whale'].coverage.live, 0);
});

test('match: a spin-off upload (The Flintstone Comedy Show) does not reach The Flintstones', () => {
  assert.deepStrictEqual(liveNames(RUN.strict.grids['the-flintstones']), ['The Flintstones S01E01 The Flintstone Flyer']);
  // Without strict, voidtv.net's own matcher (whole-word naming, audit P3B-01, Nov 2026) keeps the spin-off out too; it may offer
  // the show's own file, but never the spin-off's.
  const loose = RUN.loose.grids['the-flintstones'];
  assert.ok(!loose || !JSON.stringify(loose).includes('Flintstone Comedy Show'));
});

test('match: strict-report.json and STRICT.md carry the totals', () => {
  const t = RUN.strict.report.totals;
  assert.deepStrictEqual([t.shows, t.showsWithEpisodes, t.kept], [9, 6, 10]); // Count Lane (byNumber) adds 1001, 2212 and 3007; Order Kratts 2
  const md = fs.readFileSync(RUN.strict.md, 'utf8');
  assert.match(md, /\*\*6 of 9 shows have episodes; 10 episodes kept\.\*\*/);
  assert.match(md, /\| Waiting Whale \| 0 \|.*waiting for per-file approval \|/);
  assert.strictEqual(RUN.loose.report, null); // nothing strict is written without strict
});
