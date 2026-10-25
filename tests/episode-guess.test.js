// The gate on sequence guesses (B, 25 Oct 2026: "a wrong episode is worse than a missing one"). Run: node --test tests/episode-guess.test.js
// scripts/match.js places the Nth unnamed file of a disc rip as episode N ("sequence guess: ..."). Such an episode does not ship, on show pages
// or Live TV; when a title or number match waits among its alternates, that file plays instead; a guess B accepted in HQ ships.
// Part 1 tests epNoGuess in scripts/lib/app.js. Part 2 runs the real assemble() on a made-up catalog in a throwaway folder. Part 3 breaks the
// gate one way at a time in a copy of app.js and shows the fixture then fails. Part 4 is the doctor's count.
// No network, nothing in the real catalog or site/ is read or written.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.join(__dirname, '..');
const { epNoGuess } = require('../scripts/lib/app');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'episode-guess-test-'));
test.after(() => { fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); });

// ---- records ---------------------------------------------------------------------------------------------------------------
const file = (name, why, more = {}) => ({ name, file: name + '.mp4', item: 'item-1', url: `https://archive.org/download/item-1/${name}.mp4`, format: 'h.264', playable: true, seconds: 1800, sizeMB: 90, conf: 0.55, why, ...more });
const GUESS = (n) => `sequence guess: file ${n} of 9 in "Gate Show Season 1 DVD"`;
const ep = (number, state, f, alternates = []) => ({ number, name: `Episode ${number}`, airdate: '2000-01-01', state, file: f, alternates });

// ---- part 1: the function ----------------------------------------------------------------------------------------------------
test('an episode that is not a guess passes through untouched, LIVE or REVIEW', () => {
  const live = ep(1, 'LIVE', file('a', 'S/E in filename + title match', { conf: 0.95 }));
  const review = ep(2, 'REVIEW', file('b', 'title ~ "Episode 2" (0.62)'));
  const bare = ep(3, 'REVIEW', file('c', undefined));
  assert.equal(epNoGuess(live), live);
  assert.equal(epNoGuess(review), review);
  assert.equal(epNoGuess(bare), bare, 'a file with no reason at all is not a guess');
  assert.equal(epNoGuess(ep(4, 'MISSING', null)).state, 'MISSING');
});

test('a guess with nothing else to play does not ship', () => {
  assert.equal(epNoGuess(ep(1, 'REVIEW', file('g1', GUESS(1)))), null);
});

test('a guess with a title or number match among its alternates plays that file instead, as REVIEW', () => {
  const real = file('real', 'title ~ "Episode 1" (0.71)', { conf: 0.5 });
  const out = epNoGuess(ep(1, 'REVIEW', file('g1', GUESS(1)), [file('g9', GUESS(9)), real]));
  assert.equal(out.file, real);
  assert.equal(out.state, 'REVIEW');
  assert.deepEqual(out.alternates, [], 'the other guess leaves the alternates too');
});

test('an alternate that is itself a guess, does not play in a browser, or is a foreign dub does not stand in', () => {
  const g = file('g1', GUESS(1));
  assert.equal(epNoGuess(ep(1, 'REVIEW', g, [file('g2', GUESS(2))])), null);
  assert.equal(epNoGuess(ep(1, 'REVIEW', g, [file('x', 'S/E in filename', { playable: false })])), null);
  assert.equal(epNoGuess(ep(1, 'REVIEW', g, [file('y', 'S/E in filename', { langRisk: true })])), null);
});

test('a guess B accepted in HQ is no longer a guess and ships', () => {
  const acc = ep(1, 'LIVE', file('g1', 'accepted in HQ | ' + GUESS(1), { conf: 1 }));
  assert.equal(epNoGuess(acc), acc);
});

// ---- part 2: the real assemble() on a made-up catalog --------------------------------------------------------------------------
const write = (root, rel, text) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
const grid = (slug, show, episodes) => ({ show, slug, type: 'Drama', network: 'TestNet', matchedAt: '2026-01-01T00:00:00.000Z', tvmaze: { id: 1, runtime: 30, premiered: '2000-01-01' }, seasons: [{ season: 1, episodes }] });
const REAL_ALT = file('real-2', 'title ~ "Episode 2" (0.70)', { conf: 0.5 });
const FIXTURE = [
  // mixed: a LIVE match, a REVIEW title match, a bare guess, a guess with a real alternate, an unplayable guess (the vault)
  grid('mixed-show', 'Mixed Show', [
    ep(1, 'LIVE', file('m1', 'S/E in filename', { conf: 0.95 })),
    ep(2, 'REVIEW', file('g2', GUESS(2)), [REAL_ALT]),
    ep(3, 'REVIEW', file('m3', 'title ~ "Episode 3" (0.66)', { conf: 0.6 })),
    ep(4, 'REVIEW', file('g4', GUESS(4))),
    ep(5, 'REVIEW', file('g5', GUESS(5), { playable: false, codecRisk: 'video (mpeg2)' })),
  ]),
  grid('guess-show', 'Guess Show', [1, 2, 3].map((n) => ep(n, 'REVIEW', file('g' + n, GUESS(n))))), // every episode a guess: the show leaves the site
  grid('accepted-show', 'Accepted Show', [ep(1, 'LIVE', file('a1', 'accepted in HQ | ' + GUESS(1), { conf: 1 })), ep(2, 'REVIEW', file('a2', GUESS(2)))]),
];
// What the site must show of it: slug -> [episode numbers, the url episode 2 plays (or null)]
const EXPECT = { 'mixed-show': { eps: [1, 2, 3], vault: [], ep2: REAL_ALT.url }, 'accepted-show': { eps: [1], vault: [], ep2: null } };

function tree(appText) {
  const root = fs.mkdtempSync(path.join(TMP, 'case-'));
  for (const f of ['scripts/lib/app.js', 'scripts/lib/app-fetch.js', 'scripts/lib/app-me.js', 'scripts/lib/tvgrid.js', 'scripts/lib/tvweek.js', 'scripts/lib/profile.js', 'scripts/lib/hardexclude.js', 'player/tools/rank-sources.js']) {
    write(root, f, f === 'scripts/lib/app.js' && appText != null ? appText : fs.readFileSync(path.join(REPO, f), 'utf8'));
  }
  write(root, 'scripts/show-list.json', JSON.stringify({ types: ['Drama'], shows: [] }));
  write(root, 'profiles/gate/profile.json', JSON.stringify({ siteName: 'Gate', domain: 'https://gate.test' }));
  for (const g of FIXTURE) write(root, `catalog/shows/${g.slug}.json`, JSON.stringify(g, null, 2));
  write(root, 'catalog/overrides.json', '{}');
  return root;
}
function assembled(root) {
  const code = "const d=require(" + JSON.stringify(path.join(root, 'scripts/lib/app.js')) + ").assemble();"
    + "console.log(JSON.stringify(Object.fromEntries(d.shows.map(s=>[s.slug,{eps:s.seasons.flatMap(se=>se.episodes.map(e=>e.n)),vault:(s.vault||[]).map(v=>v.n),"
    + "ep2:((s.seasons[0]||{episodes:[]}).episodes.find(e=>e.n===2)||{}).url||null}]))))";
  const r = spawnSync(process.execPath, ['-e', code], { cwd: root, encoding: 'utf8', env: { ...process.env, VOID_PROFILE: 'gate' } });
  assert.equal(r.status, 0, (r.stdout || '') + (r.stderr || ''));
  return JSON.parse(r.stdout.trim().split('\n').pop());
}

test('assemble(): guesses are off the show pages and the vault, a real alternate stands in, an all-guess show leaves, an accepted guess ships', () => {
  assert.deepEqual(assembled(tree()), EXPECT);
});

// ---- part 3: the deliberate-bug check ---------------------------------------------------------------------------------------
// Each mistake is made in a copy of app.js. The fixture must then come out different; if one of these passed, the test above would not notice the bug.
const APP = fs.readFileSync(path.join(REPO, 'scripts/lib/app.js'), 'utf8');
const BUGS = [
  ['the show pages skip the gate', 'episodes: se.episodes.map(epNoGuess).filter((e) => e && ', 'episodes: se.episodes.filter((e) => e && '],
  ['the vault skips the gate', 'se.episodes.map(epNoGuess).filter((e) => e && e.file && !e.file.playable', 'se.episodes.filter((e) => e && e.file && !e.file.playable'],
  ['the gate lets everything through', 'if (!e || !isGuess(e.file)) return e;', 'return e;'],
  ['the real alternate is ignored', "return alt ? { ...e, state: 'REVIEW', file: alt, alternates: alts.filter((a) => a !== alt) } : null;", 'return null;'],
  ['an accepted guess counts as a guess', 'const SEQ_GUESS = /^sequence guess/;', 'const SEQ_GUESS = /sequence guess/;'],
];
for (const [name, from, to] of BUGS) {
  test('deliberate bug: ' + name + ' makes the fixture fail', () => {
    assert.ok(APP.includes(from), 'the text this test breaks is no longer in scripts/lib/app.js: ' + from);
    const bad = APP.replace(from, () => to);
    assert.notEqual(bad, APP);
    assert.notDeepEqual(assembled(tree(bad)), EXPECT, 'the fixture did not notice: ' + name);
  });
}

// ---- part 4: the doctor's count ---------------------------------------------------------------------------------------------------
const { guessesGate } = require('../scripts/lib/matchcheck');
function showsDir(grids) { const d = fs.mkdtempSync(path.join(TMP, 'shows-')); for (const g of grids) fs.writeFileSync(path.join(d, g.slug + '.json'), JSON.stringify(g, null, 2)); return d; }

test('doctor count: hidden, switched, emptied, accepted and vault guesses', () => {
  const g = guessesGate({ showsDir: showsDir(FIXTURE), overrides: {} });
  assert.equal(g.level, 'green');
  assert.deepEqual({ hidden: g.hidden, switched: g.switched, shows: g.shows, emptied: g.emptied, accepted: g.accepted, vault: g.vault }, { hidden: 5, switched: 1, shows: 3, emptied: 1, accepted: 1, vault: 1 });
  assert.match(g.detail, /^5 guessed episodes kept off the site in 3 shows; 1 play a title or number match instead; 1 show left with no episode \(Guess Show\); 1 guess accepted in HQ ship; 1 unplayable guess off the vault list$/);
});

test('doctor count: a show B hid is left out', () => {
  const g = guessesGate({ showsDir: showsDir(FIXTURE), overrides: { 'guess-show': { hidden: true } } });
  assert.equal(g.emptied, 0);
  assert.equal(g.hidden, 2);
});

test('the doctor shows the light under the name the runbook gives it', () => {
  const doctor = fs.readFileSync(path.join(REPO, 'scripts/doctor.js'), 'utf8');
  assert.match(doctor, /add\('episodes:guess-hidden', g\.level, g\.detail\)/);
  const runbook = fs.readFileSync(path.join(REPO, 'docs/RUNBOOK.md'), 'utf8');
  assert.match(runbook, /^\| episodes:guess-hidden \|/m);
  assert.match(runbook, /tests\/episode-guess\.test\.js/);
  for (const text of [runbook, fs.readFileSync(__filename, 'utf8')]) assert.doesNotMatch(text, new RegExp(String.fromCharCode(0x2014)));
});
