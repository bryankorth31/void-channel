// Moments (assets/brand/moments/moments.js; Bryan, 22 Nov 2026: reorganize around what is in the news, GTA first).
// Run: node --test tests/moments.test.js
// 1. The engine: on today or not, kids, nearest peak first, the match rule (any of, all of, not), order, min, max.
// 2. The GTA moment in catalog/moments.json: passes its own checks and picks the four first Grand Theft Autos in order
//    from PLAY's shelf rows, and not the later ones.
// 3. The house rules hold in every moment: no long dashes, never on Kids unless marked, an ad line of 120 letters or less.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const M = require('../assets/brand/moments/moments.js');

const REPO = path.join(__dirname, '..');
const DATA = JSON.parse(fs.readFileSync(path.join(REPO, 'catalog', 'moments.json'), 'utf8'));
const at = (d) => new Date(d + 'T12:00:00');
const base = (o) => ({ id: 'x', name: 'X', on: true, approved: '2026-11-01', start: '2026-11-01', end: '2026-11-30', areas: { play: { title: 'X row', match: { titles: ['x'] } } }, ...o });

test('a moment shows from its start to its end, only when on and approved', () => {
  const m = base();
  assert.equal(M.active([m], { now: at('2026-10-31') }).length, 0);
  assert.equal(M.active([m], { now: at('2026-11-01') }).length, 1);
  assert.equal(M.active([m], { now: at('2026-11-30') }).length, 1);
  assert.equal(M.active([m], { now: at('2026-12-01') }).length, 0);
  assert.equal(M.active([base({ on: false })], { now: at('2026-11-10') }).length, 0);
  assert.equal(M.active([base({ approved: '' })], { now: at('2026-11-10') }).length, 0, 'a suggestion Bryan has not approved never shows');
  assert.equal(M.active([base({ start: 'soon' })], { now: at('2026-11-10') }).length, 0);
});

test('Kids sees only moments marked kids', () => {
  assert.equal(M.active([base()], { now: at('2026-11-10'), kids: true }).length, 0);
  assert.equal(M.active([base({ kids: true })], { now: at('2026-11-10'), kids: true }).length, 1);
});

test('the nearest peak comes first', () => {
  const a = base({ id: 'a', peak: '2026-11-25' }), b = base({ id: 'b', peak: '2026-11-11' });
  assert.deepEqual(M.active([a, b], { now: at('2026-11-10') }).map((m) => m.id), ['b', 'a']);
  assert.deepEqual(M.active([a, b], { now: at('2026-11-24') }).map((m) => m.id), ['a', 'b']);
});

const items = [
  { id: 'g1', item: 'arch-1', title: 'Grand Theft Auto (DMA Design)', year: 1997, system: 'dos', genres: ['Adventure'], plays: 30000 },
  { id: 'g2', title: 'Grand Theft Auto: Advance', year: 2004, system: 'gba', plays: 8000 },
  { id: 'g3', title: 'Grand Theft Auto 2', year: 2000, system: 'gbcolor' },
  { id: 'g4', title: 'Grand Theft Auto IV', year: 2008, system: 'dos' },
  { id: 'a1', title: 'Autobahn Raser', year: 1998, system: 'dos' },
  { id: 'q1', title: 'Some Game', year: 1999, wikidata: 'Q42', system: 'snes' },
];

test('the rule: any of items, titles (whole words), wikidata; then all of years and systems; not takes out', () => {
  const ids = (r) => M.pick(r, items).map((g) => g.id);
  assert.deepEqual(ids({ match: { titles: ['grand theft auto'] } }), ['g1', 'g3', 'g2', 'g4'], 'oldest first by default');
  assert.deepEqual(ids({ match: { titles: ['auto'] } }), ['g1', 'g3', 'g2', 'g4'], 'whole words: Autobahn is not auto');
  assert.deepEqual(ids({ match: { titles: ['grand theft auto'], years: [1997, 2004] } }), ['g1', 'g3', 'g2']);
  assert.deepEqual(ids({ match: { items: ['ARCH-1'] } }), ['g1'], 'an Archive item id matches, in any case');
  assert.deepEqual(ids({ match: { wikidata: ['q42'] } }), ['q1']);
  assert.deepEqual(ids({ match: { titles: ['grand theft auto'], systems: ['dos'] } }), ['g1', 'g4']);
  assert.deepEqual(ids({ match: { titles: ['grand theft auto'], not: ['g4'] } }), ['g1', 'g3', 'g2']);
  assert.deepEqual(ids({ match: { titles: ['grand theft auto'] }, sort: 'plays' }).slice(0, 2), ['g1', 'g2']);
  assert.deepEqual(ids({ match: { titles: ['grand theft auto'] }, order: ['g2', 'arch-1'] }), ['g2', 'g1', 'g3', 'g4'], 'order first, as written');
  assert.deepEqual(ids({ match: {} }), [], 'a rule with nothing to match picks nothing');
});

test('rows: min items, at most two moments, the ad only in its own area', () => {
  const now = at('2026-11-10');
  const gta = base({ id: 'gta', areas: { play: { title: 'First GTAs', match: { titles: ['grand theft auto'], years: [1997, 2004] } } }, ad: { line: 'Ad', go: 'Go', area: 'play' } });
  const r = M.rows([gta], 'play', items, { now });
  assert.equal(r.length, 1);
  assert.equal(r[0].title, 'First GTAs');
  assert.deepEqual(r[0].ad, { line: 'Ad', go: 'Go' });
  assert.equal(M.rows([gta], 'shows', items, { now }).length, 0, 'no rule for the area, no row');
  const lonely = base({ id: 'l', areas: { play: { title: 'One', match: { wikidata: ['Q42'] } } } });
  assert.equal(M.rows([lonely], 'play', items, { now }).length, 0, 'one box is not a row');
  assert.equal(M.rows([base({ id: 'l', areas: { play: { title: 'One', min: 1, match: { wikidata: ['Q42'] } } } })], 'play', items, { now }).length, 1);
  const many = ['a', 'b', 'c'].map((id) => base({ id, areas: gta.areas }));
  assert.equal(M.rows(many, 'play', items, { now }).length, 2);
  const otherAd = base({ id: 'o', areas: gta.areas, ad: { line: 'Ad', area: 'shows' } });
  assert.equal(M.rows([otherAd], 'play', items, { now })[0].ad, null);
});

test('problems: what HQ refuses to save, in plain words', () => {
  assert.deepEqual(M.problems(base()), []);
  assert.ok(M.problems(base({ id: 'Bad Id' })).length);
  assert.ok(M.problems(base({ start: '2026-12-01' })).some((p) => /ends before/.test(p)));
  assert.ok(M.problems(base({ peak: '2027-01-01' })).some((p) => /peak/.test(p)));
  assert.ok(M.problems(base({ name: 'A \u2014 B' })).some((p) => /long dash/.test(p)));
  assert.ok(M.problems(base({ areas: { tv: { title: 'x', match: { titles: ['x'] } } } })).some((p) => /not an area/.test(p)));
  assert.ok(M.problems(base({ areas: { play: { title: 'x', match: { years: [1990, 2000] } } } })).some((p) => /picks nothing/.test(p)));
});

test('catalog/moments.json: every moment passes, keeps the house rules', () => {
  assert.ok(Array.isArray(DATA.moments) && DATA.moments.length);
  const ids = new Set();
  for (const m of DATA.moments) {
    assert.deepEqual(M.problems(m), [], m.id);
    assert.ok(!ids.has(m.id), 'one id once: ' + m.id); ids.add(m.id);
    assert.ok(m.kids === true || m.kids === false, m.id + ' says whether it is for Kids');
  }
  assert.ok(!/[\u2014\u2013]/.test(JSON.stringify(DATA)), 'no long dashes');
});

test('the GTA moment picks the four first Grand Theft Autos on PLAY, in order, and not later ones', () => {
  const gta = DATA.moments.find((m) => m.id === 'gta');
  assert.equal(gta.kids, false, 'never on Kids');
  assert.equal(gta.ad.line, 'Before the world only played 1 game...', "Bryan's own line");
  // PLAY's shelf rows as the PLAY assistant carded them (audit/play-mode/consoles/gta-rows.json): shelf ids differ from items.
  const shelf = [
    { id: 'grand-theft-auto-dma-design-1997', item: 'grand-theft-auto-1997-dma-design', title: 'Grand Theft Auto (DMA Design)', year: 1997, system: 'dos', plays: 30823 },
    { id: 'gta-advance-gba', item: 'grand_theft-auto-advance', title: 'Grand Theft Auto Advance', year: 2004, system: 'gba', plays: 8326 },
    { id: 'gta2-gbc', item: 'gta2rom', title: 'Grand Theft Auto 2', year: 2000, system: 'gbcolor' },
    { id: 'gta-gbc', item: 'grand-theft-auto-game-boy-gbc-enhanced', title: 'Grand Theft Auto', year: 1999, system: 'gbcolor' },
    { id: 'super-mario-world', title: 'Super Mario World', year: 1990, system: 'snes', plays: 900000 },
  ];
  const r = M.rows(DATA.moments, 'play', shelf, { now: at('2026-11-23') });
  assert.equal(r.length, 1);
  assert.equal(r[0].title, 'The first Grand Theft Autos');
  assert.deepEqual(r[0].items.map((g) => g.item), gta.areas.play.order);
  assert.equal(M.rows(DATA.moments, 'play', shelf, { now: at('2026-11-23'), kids: true }).length, 0);
  assert.equal(M.rows(DATA.moments, 'play', [...shelf, { id: 'gta5', title: 'Grand Theft Auto V', year: 2013 }], { now: at('2026-11-23') })[0].items.length, 4);
});

// 4. HQ > Moments (scripts/lib/momentshq.js) on a copy: save, refuse in words, switch, remove; and what the build publishes.
const os = require('os');
const hq = require('../scripts/lib/momentshq.js');
const pub = require('../scripts/lib/moments-pub.js');
function tmpProfile() { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'moments-')); fs.writeFileSync(path.join(d, 'moments.json'), JSON.stringify({ about: 'x', moments: [] })); return { catalogDir: d }; }
const form = (o) => ({ id: 'remake', name: 'A film remake', start: '2026-11-01', end: '2026-12-31', why: 'In cinemas', on: false, approved: '', kids: false,
  ad: { line: 'See the first one', go: 'Watch', area: 'movies' }, areas: { movies: { title: 'The original', match: { titles: 'Some Film\n', years: ['1950', ''] }, min: '1', order: '' } }, ...o });

test('HQ: a moment is saved from the form fields, refused in words when wrong, switched and removed', () => {
  const profile = tmpProfile(), now = at('2026-11-10');
  let d = hq.save(form(), { profile, now });
  assert.equal(d.moments.length, 1);
  const m = d.moments[0];
  assert.deepEqual(m.areas.movies.match, { titles: ['Some Film'], years: [1950, null] });
  assert.equal(m.areas.movies.min, 1);
  assert.equal(m.status, 'waiting for your yes');
  assert.throws(() => hq.save(form({ end: '2026-10-01' }), { profile }), /ends before it starts/);
  assert.throws(() => hq.save(form({ name: 'A \u2014 B' }), { profile }), /long dash/);
  assert.throws(() => hq.save(form({ id: 'other', was: 'nope' }), { profile }) && hq.save(form({ id: 'remake', was: 'other' }), { profile }), /already has the id/);
  d = hq.setOn('remake', true, { profile, now });
  const r = d.moments.find((x) => x.id === 'remake');
  assert.equal(r.on, true);
  assert.equal(r.approved, '2026-11-10', 'switching on is the yes, dated');
  assert.equal(r.status, 'showing');
  d = hq.save(form({ was: 'remake', on: true, approved: true, ad: { line: '' } }), { profile, now });
  const r2 = d.moments.find((x) => x.id === 'remake');
  assert.equal(r2.approved, '2026-11-10', 'the first yes keeps its day');
  assert.equal(r2.ad, undefined, 'a cleared ad line is cleared');
  d = hq.setOn('remake', false, { profile, now });
  assert.equal(d.moments.find((x) => x.id === 'remake').status, 'switched off');
  d = hq.remove('other', { profile });
  assert.ok(!d.moments.some((x) => x.id === 'other'));
  assert.throws(() => hq.remove('nothing', { profile }), /No moment/);
  assert.equal(d.moments[0].picks.movies, null, 'an area that does not read moments yet says so');
});

test('the build publishes only moments that are on, approved, sound and not over, without their notes', () => {
  const profile = tmpProfile();
  const good = base({ id: 'good', source: 'private note', end: '2026-12-31' });
  const off = base({ id: 'off', on: false, end: '2026-12-31' });
  const over = base({ id: 'over', end: '2026-11-05' });
  const bad = base({ id: 'bad', end: '2026-12-31', areas: { play: { title: 'x', match: {} } } });
  const f = path.join(profile.catalogDir, 'moments.json');
  fs.writeFileSync(f, JSON.stringify({ moments: [good, off, over, bad] }));
  const p = pub.publicMoments(f, at('2026-11-10'));
  assert.deepEqual(p.moments.map((m) => m.id), ['good']);
  assert.equal(p.moments[0].source, undefined);
  assert.match(pub.version(p), /^[0-9a-f]{10}$/);
  assert.notEqual(pub.version(p), pub.version({ moments: [] }), 'a changed list changes the version');
  assert.equal(pub.stamp('<script src="/assets/brand/moments/moments.js"></script>', 'abc'), '<script src="/assets/brand/moments/moments.js?v=abc"></script>');
  assert.deepEqual(pub.publicMoments(path.join(profile.catalogDir, 'none.json')), { moments: [] });
});

// 5. On Demand (Bryan, 22 Nov 2026: layout B, "gold card + row"; "engine only, no moment"; the Christmas line "Before streaming").
test('rowsMany: one row from the shows rule and the movies rule, one copy each, the ad from either part, a moment alone for its page', () => {
  const now = at('2026-12-10');
  const series = [{ id: 'christmas-in-rockefeller-center', title: 'Christmas In Rockefeller Center', year: 1997 }, { id: 'friends', title: 'Friends', year: 1994 }];
  const films = [{ id: 'movie-1', title: 'A Christmas Carol', year: 2004 }, { id: 'movie-2', title: 'Christmas in Connecticut', year: 1992 }, { id: 'movie-3', title: 'Heat', year: 1995 }];
  const rule = { title: 'Christmas on voidtv.net', match: { titles: ['christmas'] } };
  const m = base({ id: 'xmas', start: '2026-12-01', end: '2026-12-31', ad: { line: 'Before streaming, there was Christmas TV.', area: 'movies' }, areas: { shows: rule, movies: { ...rule, title: 'Films' } } });
  const parts = [{ area: 'shows', items: series }, { area: 'movies', items: films }];
  const r = M.rowsMany([m], parts, { now });
  assert.equal(r.length, 1);
  assert.equal(r[0].title, 'Christmas on voidtv.net', 'the first part names the row');
  assert.deepEqual(r[0].items.map((g) => g.id), ['christmas-in-rockefeller-center', 'movie-2', 'movie-1'], 'shows first, then films, each by its rule');
  assert.deepEqual(r[0].ad, { line: 'Before streaming, there was Christmas TV.', go: '' }, 'the ad named for movies still rides the merged row');
  assert.equal(M.rowsMany([m], parts, { now: at('2026-11-30') }).length, 0, 'not before its start');
  assert.equal(M.rowsMany([m], [{ area: 'shows', items: series }], { now }).length, 0, 'one show is under the min of 2');
  assert.equal(M.rowsMany([m], [{ area: 'shows', items: series }], { now, only: 'xmas' }).length, 1, 'its own page shows even one');
  assert.equal(M.rowsMany([m, base({ id: 'other', start: '2026-12-01', end: '2026-12-31', areas: { shows: rule } })], parts, { now, only: 'other' })[0].id, 'other');
});

test('the Christmas moment is saved switched off, waiting for Bryan, and picks Christmas titles once he switches it on', () => {
  const x = DATA.moments.find((m) => m.id === 'christmas');
  assert.ok(x, 'saved');
  assert.equal(x.on, false, 'Bryan: engine only, no moment switched on');
  assert.equal(x.approved, '', 'not approved yet: HQ shows "waiting for your yes"');
  assert.equal(x.ad.line, 'Before streaming, there was Christmas TV.');
  assert.equal(x.kids, false);
  assert.equal(M.rowsMany(DATA.moments, [{ area: 'movies', items: [] }], { now: at('2026-12-10') }).filter((r) => r.id === 'christmas').length, 0, 'off: nothing shows');
  const on = { ...x, on: true, approved: '2026-11-22' };
  const films = ['A Christmas Carol', 'The Year Without a Santa Claus', 'Christmas in Connecticut', 'A Nutcracker Christmas', 'Heat'].map((t, i) => ({ id: 'movie-' + i, title: t, year: 1990 + i }));
  const shows = [{ id: 'noels-house-party', title: "Noel's House Party", year: 1991 }, { id: 'christmas-in-rockefeller-center', title: 'Christmas In Rockefeller Center', year: 1997 }];
  const r = M.rowsMany([on], [{ area: 'shows', items: shows }, { area: 'movies', items: films }], { now: at('2026-12-10') });
  assert.equal(r.length, 1);
  assert.deepEqual(r[0].items.map((g) => g.title), ['Christmas In Rockefeller Center', 'A Christmas Carol', 'The Year Without a Santa Claus', 'Christmas in Connecticut', 'A Nutcracker Christmas'], "Noel's House Party is left out by name, Heat by its title");
  assert.equal(M.rowsMany([on], [{ area: 'movies', items: films }], { now: at('2027-01-01') }).length, 0, 'over after 31 December');
});

test('the voidtv.net home page: the engine loads on voidtv.net only, the card and row sit right under Live TV, Clear leaves a moment list', () => {
  const APP = fs.readFileSync(path.join(REPO, 'scripts', 'lib', 'app.js'), 'utf8');
  assert.ok(APP.includes("const momentsScript = PROFILE.name === 'voidtv' && mode !== 'embed' && data.momentsV ?"), 'never on Kids or the one-file preview');
  assert.ok(APP.includes('const indexScript = momentsScript + areasScript'), 'before the page script that reads it');
  assert.ok(APP.includes("<div id=\"onnow\">'+onNowHtml()+'</div>'+momentHome();"), 'right under Live TV and On now (Live TV stays first)');
  assert.ok(APP.includes("goHome(){for(const k of ['moment',"), 'the logo and Clear leave a moment list');
  assert.ok(APP.includes('let r=(state.moment?momentList():SHOWS).filter(s=>!gated(s)'), 'a moment list keeps the 18+ door and narrows by the other filters');
  assert.ok(/momentParts\(\)\{const ok=SHOWS\.filter\(s=>!gated\(s\)&&!hidden\(s\)\)/.test(APP), 'never the 18+ shelf or a show the viewer turned down');
  const SITE = fs.readFileSync(path.join(REPO, 'scripts', 'site.js'), 'utf8');
  assert.ok(SITE.indexOf('data.momentsV = MOMENTS_V') > SITE.indexOf('const data = assemble()') && SITE.indexOf('data.momentsV = MOMENTS_V') < SITE.indexOf('const shell = '), 'the version is set before any page is written');
});

test('HQ reads On Demand from the list visitors get, handed in here', async () => {
  const index = 'const SHOWS=' + JSON.stringify([
    { show: 'Christmas In Rockefeller Center', slug: 'christmas-in-rockefeller-center', type: 'Specials', year: '1997' },
    { show: 'A Christmas Carol', slug: 'movie-1', type: 'TV Movies', year: '2004' },
    { show: 'Christmas After Dark', slug: 'movie-2', type: 'TV Movies', year: '2001', adult: 1 },
  ]) + ';';
  assert.equal(await hq.warm({ index }), 'given');
  const x = { ...DATA.moments.find((m) => m.id === 'christmas') };
  const p = hq.picks(x);
  assert.equal(p.shows.count, 1);
  assert.equal(p.movies.count, 1, 'the 18+ film is never counted');
});
