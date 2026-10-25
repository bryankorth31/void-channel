// The gate on the TV-movie rows of the site (fix batch C, agent C4; Bryan: "hide them for the 10"). Run: node --test tests/movies-gate.test.js
// The site shows a TV movie or special only when its state is LIVE, or a person approved it in catalog/overrides.json
// ("movie-<tmdbId>": { "approved": true }). REVIEW movies are hidden, a MISSING or unplayable movie never ships, and the hard excludes
// (C-SPAN, hearings, news; R-005) beat an approval. TV show episodes are not touched: a REVIEW episode still ships.
// Part 1 tests the two small functions in scripts/lib/app.js. Part 2 runs the real assemble() on a made-up catalog in a throwaway
// folder. Part 3 puts the old condition back, one mistake at a time, and shows the fixture then fails. Part 4 is the doctor's count.
// No network, nothing in the real catalog or site/ is read or written.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.join(__dirname, '..');
const { movieShips, movieApproved } = require('../scripts/lib/app');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'movies-gate-test-'));
test.after(() => { fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); });

// ---- records ---------------------------------------------------------------------------------------------------------------
const FILE = { name: 'Open_Marriage_2017.mp4', stem: 'Open_Marriage_2017', itemTitle: 'Open Marriage (2017)', item: 'open-marriage-2017', url: 'https://archive.org/download/open-marriage-2017/Open_Marriage_2017.mp4', format: 'h.264', playable: true, seconds: 5400, conf: 0.9 };
const CSPAN = { ...FILE, stem: 'CSPAN2_20201204_Senate_Homeland_Security_Committee_Hearing', itemTitle: 'Senate Homeland Security Committee Hearing', item: 'CSPAN2_20201204_040000_Senate_Homeland_Security_Committee_Hearing', collection: ['cspan2'] };
const movie = (tmdbId, state, file, title = 'Open Marriage') => ({ tmdbId, kind: 'tv-movie', title, year: '2017', runtime: 90, rating: 5, votes: 3, poster: null, backdrop: null, overview: 'x', genres: [], huntedAt: '2026-10-15T00:00:00.000Z', state, file: state === 'MISSING' && file === undefined ? null : (file === undefined ? FILE : file), alternates: [] });
const approve = (...ids) => Object.fromEntries(ids.map((i) => ['movie-' + i, { approved: true }]));

// ---- part 1: the two functions ---------------------------------------------------------------------------------------------
test('a LIVE movie ships, with or without an overrides file', () => {
  assert.equal(movieShips(movie(1, 'LIVE'), {}), true);
  assert.equal(movieShips(movie(1, 'LIVE'), undefined), true);
  assert.equal(movieShips(movie(1, 'LIVE'), approve(2)), true);
});

test('a REVIEW movie is hidden until a person approves it', () => {
  assert.equal(movieShips(movie(2, 'REVIEW'), {}), false);
  assert.equal(movieShips(movie(2, 'REVIEW'), undefined), false);
  assert.equal(movieShips(movie(2, 'REVIEW'), approve(3)), false, 'an approval for another movie does not count');
});

test('a REVIEW movie with its approval ships; un-approving hides it again', () => {
  assert.equal(movieShips(movie(2, 'REVIEW'), approve(2)), true);
  assert.equal(movieShips(movie(2, 'REVIEW'), { 'movie-2': { approved: false } }), false);
  assert.equal(movieShips(movie(2, 'REVIEW'), {}), false);
});

test('only approved: true counts, not another key or a look-alike value', () => {
  for (const ov of [{ 'movie-2': {} }, { 'movie-2': { hidden: true } }, { 'movie-2': { approved: 'yes' } }, { 'movie-2': { approved: 1 } }, { 'movie-2': null }, { 'movie-2': true }, { '2': { approved: true } }, { 'movie-02': { approved: true } }]) {
    assert.equal(movieShips(movie(2, 'REVIEW'), ov), false, JSON.stringify(ov));
  }
  assert.equal(movieApproved(movie(2, 'REVIEW'), approve(2)), true);
  assert.equal(movieApproved(movie(2, 'REVIEW'), undefined), false);
});

test('a MISSING movie never ships, approved or not', () => {
  assert.equal(movieShips(movie(3, 'MISSING'), approve(3)), false);
  assert.equal(movieShips(movie(3, 'MISSING', FILE), approve(3)), false, 'even if a stale file is still on the record');
  assert.equal(movieShips(movie(3, 'MISSING'), {}), false);
});

test('a movie with no playable file is hidden, LIVE or approved', () => {
  assert.equal(movieShips(movie(4, 'LIVE', { ...FILE, playable: false }), {}), false);
  assert.equal(movieShips(movie(4, 'REVIEW', { ...FILE, playable: false }), approve(4)), false);
  assert.equal(movieShips(movie(4, 'LIVE', null), {}), false);
  assert.equal(movieShips(null, {}), false);
});

test('the hard excludes beat both LIVE and an approval (R-005)', () => {
  assert.equal(movieShips(movie(5, 'LIVE', CSPAN, 'Crossfire'), {}), false);
  assert.equal(movieShips(movie(5, 'REVIEW', CSPAN, 'Crossfire'), approve(5)), false);
  assert.equal(movieShips(movie(5, 'LIVE', { ...FILE, collection: ['tvnews'] }, 'Crossfire'), {}), false, 'by collection');
  assert.equal(movieShips(movie(5, 'LIVE', { ...FILE, item: 'KGO_20010911_120000_ABC_News', stem: 'KGO_20010911_120000_ABC_News' }, 'Crossfire'), {}), false, 'by the TV News Archive name');
});

test('a film whose own title holds a hard-exclude word still ships', () => {
  const f = { ...FILE, stem: 'Election_1999', itemTitle: 'Election (1999)', item: 'election-1999' };
  assert.equal(movieShips(movie(6, 'LIVE', f, 'Election'), {}), true);
});

// ---- part 2: the real assemble() on a made-up catalog --------------------------------------------------------------------------
const write = (root, rel, text) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
const seriesGrid = () => ({
  show: 'Gate Show', slug: 'gate-show', type: 'Drama', network: 'TestNet', matchedAt: '2026-01-01T00:00:00.000Z', tvmaze: { id: 1, runtime: 30, premiered: '2000-01-01' },
  seasons: [{ season: 1, episodes: [['LIVE', 0.95], ['REVIEW', 0.7], ['REVIEW', 0.6]].map(([state, conf], k) => ({
    number: k + 1, name: `Episode ${k + 1}`, airdate: '2000-01-01', state, alternates: [],
    file: { name: `e${k + 1}`, file: `e${k + 1}.mp4`, item: 'item-1', url: `https://archive.org/download/item-1/e${k + 1}.mp4`, format: 'h.264', playable: true, seconds: 1800, sizeMB: 90, conf },
  })) }],
});
// What the made-up catalog holds, and what the site must show of it.
const FIXTURE_MOVIES = [
  movie(100, 'LIVE'),                                  // ships
  movie(101, 'REVIEW'),                                // hidden: not approved
  movie(102, 'REVIEW'),                                // ships: approved
  movie(103, 'MISSING'),                               // hidden: approved but nothing to play
  movie(104, 'LIVE', { ...FILE, playable: false }),    // hidden: no playable file
  movie(105, 'LIVE', CSPAN, 'Crossfire'),              // hidden: hard exclude
  movie(106, 'REVIEW', CSPAN, 'Crossfire'),            // hidden: hard exclude beats the approval
  movie(107, 'REVIEW'),                                // hidden: approved set to false
];
const FIXTURE_OV = { ...approve(102, 103, 106), 'movie-107': { approved: false } };
const SHOULD_SHIP = ['movie-100', 'movie-102'];

function tree(appText) {
  const root = fs.mkdtempSync(path.join(TMP, 'case-'));
  for (const f of ['scripts/lib/app.js', 'scripts/lib/app-fetch.js', 'scripts/lib/app-me.js', 'scripts/lib/tvgrid.js', 'scripts/lib/profile.js', 'scripts/lib/hardexclude.js', 'player/tools/rank-sources.js']) {
    write(root, f, f === 'scripts/lib/app.js' && appText != null ? appText : fs.readFileSync(path.join(REPO, f), 'utf8'));
  }
  write(root, 'scripts/show-list.json', JSON.stringify({ types: ['Drama'], shows: [] }));
  write(root, 'profiles/gate/profile.json', JSON.stringify({ siteName: 'Gate', domain: 'https://gate.test' }));
  write(root, 'catalog/shows/gate-show.json', JSON.stringify(seriesGrid()));
  for (const m of FIXTURE_MOVIES) write(root, `catalog/movies/${m.tmdbId}.json`, JSON.stringify(m, null, 2));
  write(root, 'catalog/overrides.json', JSON.stringify(FIXTURE_OV, null, 2));
  return root;
}
function assembled(root) {
  const code = "const d=require(" + JSON.stringify(path.join(root, 'scripts/lib/app.js')) + ").assemble();"
    + "console.log(JSON.stringify(d.shows.map(s=>({slug:s.slug,eps:s.eps,states:s.seasons.flatMap(se=>se.episodes.map(e=>e.state))}))))";
  const env = { ...process.env, VOID_PROFILE: 'gate' };
  const r = spawnSync(process.execPath, ['-e', code], { cwd: root, encoding: 'utf8', env });
  assert.equal(r.status, 0, (r.stdout || '') + (r.stderr || ''));
  return JSON.parse(r.stdout.trim().split('\n').pop());
}
// The fixture's expectations in one place, so the deliberate-bug part can reuse them. Returns a list of problems; empty means the gate is right.
function problems(shows) {
  const out = [];
  const slugs = shows.filter((s) => s.slug.startsWith('movie-')).map((s) => s.slug).sort();
  if (JSON.stringify(slugs) !== JSON.stringify(SHOULD_SHIP)) out.push('movies shipped: ' + slugs.join(', ') + ' (expected ' + SHOULD_SHIP.join(', ') + ')');
  const series = shows.find((s) => s.slug === 'gate-show');
  if (!series || series.eps !== 3 || series.states.join() !== 'LIVE,REVIEW,REVIEW') out.push('the series no longer ships its REVIEW episodes: ' + JSON.stringify(series));
  return out;
}

test('assemble(): LIVE and approved REVIEW movies ship; everything else is hidden; a series keeps its REVIEW episodes', () => {
  const shows = assembled(tree());
  assert.deepEqual(problems(shows), []);
  const ships = (slug) => shows.some((s) => s.slug === slug);
  assert.equal(ships('movie-100'), true, 'LIVE');
  assert.equal(ships('movie-101'), false, 'REVIEW, not approved');
  assert.equal(ships('movie-102'), true, 'REVIEW, approved');
  assert.equal(ships('movie-103'), false, 'MISSING, approved');
  assert.equal(ships('movie-104'), false, 'unplayable');
  assert.equal(ships('movie-105'), false, 'LIVE but C-SPAN');
  assert.equal(ships('movie-106'), false, 'approved but C-SPAN');
  assert.equal(ships('movie-107'), false, 'approved: false');
  assert.deepEqual(shows.find((s) => s.slug === 'movie-102').states, ['REVIEW'], 'an approved movie ships exactly as before, state included');
});

test('assemble(): no overrides file at all hides every REVIEW movie and still ships the LIVE ones', () => {
  const root = tree();
  fs.rmSync(path.join(root, 'catalog/overrides.json'));
  const slugs = assembled(root).filter((s) => s.slug.startsWith('movie-')).map((s) => s.slug);
  assert.deepEqual(slugs, ['movie-100']);
});

// ---- part 3: the deliberate-bug check ---------------------------------------------------------------------------------------
// Each mistake is made in a copy of app.js. The fixture must then report a problem; if one of these passed, the tests above would not notice the bug.
const APP = fs.readFileSync(path.join(REPO, 'scripts/lib/app.js'), 'utf8');
const GATE_LINE = 'if (!movieShips(m, OV)) continue;';
const BUGS = [
  ['the old condition is back (REVIEW ships, hard excludes ignored)', GATE_LINE, "if (!m || !m.file || !m.file.playable || m.state === 'MISSING') continue;"],
  ['the hard-exclude gate is off', 'if (hardExcludeFn({', 'if (false && hardExcludeFn({'],
  ['the approval is ignored', "return m.state === 'LIVE' || movieApproved(m, OV);", "return m.state === 'LIVE';"],
  ['anything not MISSING ships once it is playable', "return m.state === 'LIVE' || movieApproved(m, OV);", 'return true;'],
  ['approved: false counts as an approval', "return !!o && o.approved === true;", 'return !!o && o.approved !== undefined;'],
];
for (const [name, from, to] of BUGS) {
  test('deliberate bug: ' + name + ' makes the fixture fail', () => {
    assert.ok(APP.includes(from), 'the text this test breaks is no longer in scripts/lib/app.js: ' + from);
    const bad = APP.replace(from, () => to);
    assert.notEqual(bad, APP);
    assert.ok(problems(assembled(tree(bad))).length > 0, 'the fixture did not notice: ' + name);
  });
}

// ---- part 4: the doctor's count ---------------------------------------------------------------------------------------------------
const { moviesGate } = require('../scripts/lib/matchcheck');
function moviesDir(records) { const d = fs.mkdtempSync(path.join(TMP, 'movies-')); for (const m of records) fs.writeFileSync(path.join(d, m.tmdbId + '.json'), JSON.stringify(m, null, 2)); return d; }

test('doctor count: hidden, approved, live and hard-excluded movies, and approvals that show nothing', () => {
  const g = moviesGate({ moviesDir: moviesDir(FIXTURE_MOVIES), overrides: FIXTURE_OV });
  assert.equal(g.level, 'green');
  assert.deepEqual({ live: g.live, reviewHidden: g.reviewHidden, approved: g.approved, hardSkipped: g.hardSkipped, idle: g.idle }, { live: 1, reviewHidden: 2, approved: 1, hardSkipped: 2, idle: 2 });
  assert.match(g.detail, /1 LIVE movies ship; 2 REVIEW movies are hidden until a person approves one; 1 approved REVIEW movies ship; the hard-exclude gate skips 2/);
  assert.match(g.detail, /2 approvals in catalog\/overrides\.json show nothing/);
});

test('doctor count: the numbers are the gate\'s own (the same movieShips the build runs)', () => {
  const g = moviesGate({ moviesDir: moviesDir(FIXTURE_MOVIES), overrides: FIXTURE_OV });
  const shipped = FIXTURE_MOVIES.filter((m) => movieShips(m, FIXTURE_OV));
  assert.equal(g.live + g.approved, shipped.length);
});

test('doctor count: stays green however many are hidden, and says 0 skipped when the rescore is done', () => {
  const many = Array.from({ length: 50 }, (_, i) => movie(1000 + i, 'REVIEW'));
  const g = moviesGate({ moviesDir: moviesDir(many), overrides: {} });
  assert.equal(g.level, 'green');
  assert.equal(g.reviewHidden, 50);
  assert.match(g.detail, /the hard-exclude gate skips 0 \(C-SPAN, hearing, council or news material, as it should be\)/);
  assert.doesNotMatch(g.detail, /show nothing/);
});

test('doctor count: no overrides file is fine; one that does not parse turns the light yellow because the build ignores every approval', () => {
  const dir = moviesDir(FIXTURE_MOVIES);
  const none = moviesGate({ moviesDir: dir, overridesFile: path.join(TMP, 'no-such-overrides.json') });
  assert.equal(none.level, 'green');
  assert.equal(none.approved, 0);
  const bad = path.join(TMP, 'broken-overrides.json');
  fs.writeFileSync(bad, '{ "movie-102": { "approved": true } "movie-103": {} }');
  const broken = moviesGate({ moviesDir: dir, overridesFile: bad });
  assert.equal(broken.level, 'yellow');
  assert.match(broken.detail, /does not parse/);
  assert.ok(broken.fix);
  const ok = path.join(TMP, 'ok-overrides.json');
  fs.writeFileSync(ok, JSON.stringify(FIXTURE_OV));
  assert.equal(moviesGate({ moviesDir: dir, overridesFile: ok }).approved, 1);
});

test('the doctor shows the light under the name the runbook gives it', () => {
  const doctor = fs.readFileSync(path.join(REPO, 'scripts/doctor.js'), 'utf8');
  assert.match(doctor, /add\('movies:review-hidden', g\.level, g\.detail, g\.fix\)/);
  const runbook = fs.readFileSync(path.join(REPO, 'docs/RUNBOOK.md'), 'utf8');
  assert.match(runbook, /^\| movies:review-hidden \|/m);
  assert.doesNotMatch(runbook, new RegExp(String.fromCharCode(0x2014)));
});
