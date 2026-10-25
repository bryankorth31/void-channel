// Working the hidden things by hand in HQ (B, 25 Oct 2026: "I want all of the hidden things able to be worked"). Run: node --test tests/hidden-work.test.js
// Two kinds of things voidtv.net keeps off the site: episodes the matcher placed by position ("sequence guess"; epNoGuess in scripts/lib/app.js) and
// REVIEW TV movies (movieShips). B sorts them in HQ's Hidden tab, and every choice is an entry in catalog/overrides.json:
//   placeFiles  { "<item>|<name>": "2x5" }   the file takes that episode, LIVE, ahead of any other file (scripts/match.js)
//   fileTitles  { "<item>|<name>": "Title" } the episode that plays that file shows the name B typed (scripts/match.js)
//   "movie-<id>": { "approved": true } ships a REVIEW movie; { "rejected": true } is "Not this film" (stays hidden, leaves the to-do list)
// Part 1 runs the matcher's decision on made-up uploads. Part 2 builds the real site (assemble) from a grid part 1 made. Part 3 starts HQ's server
// on a made-up catalog in a throwaway folder and makes the calls the Hidden tab makes. No network; nothing in the real catalog or site/ is touched.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const net = require('net');
const http = require('http');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const REPO = path.join(__dirname, '..');
const M = require('../scripts/match.js');
const { epNoGuess, movieShips } = require('../scripts/lib/app');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'hidden-work-test-'));
test.after(() => { fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); });

// ---- made-up data: the matcher's own test show ------------------------------------------------------------------------------
let uid = 0;
const mkFile = (name, o = {}) => ({ name, file: name, format: 'h.264', playable: true, seconds: 1800, band: 'episode', sizeMB: 100, nameHit: /zork/i.test(name), ep: null, url: 'https://example.invalid/f' + (uid++), ...o });
const WORDS = ['Quokka Parade', 'Velvet Anchor', 'Marble Harvest', 'Copper Lantern', 'Silent Orchard', 'Hollow Lighthouse', 'Hollow Lighthouse', 'Brass Meadow', 'Frozen Carnival', 'Paper Thunder'];
const mkTv = () => ({ id: 1, name: 'Zork Show', runtime: 30, premiered: '2000-01-01', network: 'Nowhere', episodes: WORDS.map((w, i) => ({ season: 1 + (i >> 2), number: (i % 4) + 1, name: w, airdate: '2000-02-' + String(i + 1).padStart(2, '0') })) });
const ENTRY = { name: 'Zork Show', type: 'Drama', network: 'Nowhere' };
// A disc rip titled as the show whose six files carry no names: the matcher offers the first four as season 1, episodes 1 to 4 ("sequence guess").
const ITEM = 'zork-show-season-1';
const CLIPS = () => 'ABCDEF'.split('').map((c) => mkFile(`Zork Show Funny Clip ${c}.mp4`));
const key = (c) => `${ITEM}|Zork Show Funny Clip ${c}.mp4`;
const grid = (ov = {}, files = CLIPS()) => M.gridFor(ENTRY, { items: [{ id: ITEM, title: 'Zork Show Season 1', files }] }, mkTv(), { ov, readDead: () => ({}) });
const episodes = (g) => g.seasons.flatMap((s) => s.episodes.map((e) => ({ ...e, season: s.season })));
const at = (g, se, n) => episodes(g).find((e) => e.season === se && e.number === n);
const clipOf = (f) => (f ? /Clip (\w)\.mp4$/.exec(f.name)[1] : null);
const everywhere = (g, c) => episodes(g).filter((e) => [e.file, ...(e.alternates || [])].some((f) => f && clipOf(f) === c)).map((e) => `${e.season}x${e.number}`); // every slot that holds the clip, as its file or an alternate

// ---- part 1: the matcher --------------------------------------------------------------------------------------------------------
test('the made-up rip is guessed into season 1 in file order, and the site gate hides those guesses', () => {
  const g = grid();
  assert.deepEqual([1, 2, 3, 4].map((n) => clipOf(at(g, 1, n).file)), ['A', 'B', 'C', 'D']);
  for (const n of [1, 2, 3, 4]) {
    assert.match(at(g, 1, n).file.why, /^sequence guess/);
    assert.equal(epNoGuess(at(g, 1, n)), null, 'a guess does not ship');
  }
});

test('a placed file lands on the chosen episode, LIVE at full confidence, leaves its old slot, and ships', () => {
  const g = grid({ placeFiles: { [key('A')]: '2x3' } });
  const ep = at(g, 2, 3);
  assert.equal(clipOf(ep.file), 'A');
  assert.equal(ep.state, 'LIVE');
  assert.equal(ep.file.conf, 1);
  assert.equal(ep.file.why, 'placed in HQ as 2x3');
  assert.equal(epNoGuess(ep), ep, 'a placed file is no longer a guess, so the site gate lets it through');
  assert.deepEqual(everywhere(g, 'A'), ['2x3'], 'the file is nowhere else in the grid, not even as an alternate');
  assert.notEqual(clipOf(at(g, 1, 1).file), 'A');
});

test('a file the guess never used can be placed too, and two placements in one show both hold', () => {
  const g = grid({ placeFiles: { [key('E')]: '3x2', [key('F')]: '3x1' } });
  assert.equal(clipOf(at(g, 3, 2).file), 'E');
  assert.equal(clipOf(at(g, 3, 1).file), 'F');
  assert.equal(at(g, 3, 2).state, 'LIVE');
});

test('a placed file beats a file B only accepted for the same episode', () => {
  const g = grid({ acceptFiles: [key('B')], placeFiles: { [key('A')]: '1x2' } });
  assert.equal(clipOf(at(g, 1, 2).file), 'A');
  assert.equal(at(g, 1, 2).file.why, 'placed in HQ as 1x2', 'the placement is not relabelled as an acceptance');
  assert.ok(at(g, 1, 2).alternates.some((a) => clipOf(a) === 'B'), 'the accepted file stays as an alternate');
});

test('a rejected file stays out even when it is placed; a slot that is not on the guide places nothing', () => {
  const rej = grid({ rejectFiles: [key('A')], placeFiles: { [key('A')]: '2x3' } });
  assert.deepEqual(everywhere(rej, 'A'), []);
  const off = grid({ placeFiles: { [key('A')]: '9x9' } });
  assert.deepEqual(everywhere(off, 'A'), ['1x1'], 'the file stays where the judges put it');
  const junk = grid({ placeFiles: { [key('A')]: 'two by three' } });
  assert.deepEqual(everywhere(junk, 'A'), ['1x1']);
});

test('accept where it is still works: an accepted guess is LIVE and ships', () => {
  const g = grid({ acceptFiles: [key('C')] });
  const ep = at(g, 1, 3);
  assert.equal(ep.state, 'LIVE');
  assert.match(ep.file.why, /^accepted in HQ \| sequence guess/);
  assert.equal(epNoGuess(ep), ep);
});

test('a typed name replaces the episode name; the guide name is kept beside it', () => {
  const g = grid({ acceptFiles: [key('C')], fileTitles: { [key('C')]: '  The Lost Reel ' } });
  assert.equal(at(g, 1, 3).name, 'The Lost Reel');
  assert.equal(at(g, 1, 3).guideName, 'Marble Harvest');
  assert.equal(at(g, 1, 4).name, 'Copper Lantern', 'other episodes keep the guide name');
  assert.equal(at(g, 1, 4).guideName, undefined);
});

test('a name follows the file to the episode it was placed on', () => {
  const g = grid({ placeFiles: { [key('A')]: '2x3' }, fileTitles: { [key('A')]: 'Pilot (unaired)' } });
  assert.equal(at(g, 2, 3).name, 'Pilot (unaired)');
  assert.equal(at(g, 2, 3).guideName, 'Hollow Lighthouse');
});

test('a show with no episode guide: a placed file takes the slot B typed, LIVE; a typed name shows', () => {
  const ITEM2 = 'zork-show-tapes';
  const files = [1, 2, 3, 4, 5].map((n) => mkFile(`Zork Show Tape 0${n}.mp4`));
  const k = (n) => `${ITEM2}|Zork Show Tape 0${n}.mp4`;
  const g = M.gridFor(ENTRY, { items: [{ id: ITEM2, title: 'Zork Show', files }] }, null, { ov: { placeFiles: { [k(3)]: '2x1' }, fileTitles: { [k(4)]: 'The Beach Tape' } }, readDead: () => ({}) });
  assert.equal(g.selfListed, true);
  const s2 = g.seasons.find((s) => s.season === 2);
  assert.equal(s2.episodes[0].number, 1);
  assert.match(s2.episodes[0].file.name, /Tape 03/);
  assert.equal(s2.episodes[0].state, 'LIVE');
  assert.match(s2.episodes[0].file.why, /^placed in HQ as 2x1/);
  assert.equal(g.coverage.live, 1);
  const named = episodes(g).find((e) => /Tape 04/.test(e.file.name));
  assert.equal(named.name, 'The Beach Tape');
  assert.equal(episodes(g).filter((e) => /Tape 03/.test(e.file.name)).length, 1, 'the placed file is listed once');
});

// ---- part 2: the real site build on a grid the matcher made ----------------------------------------------------------------------
const write = (root, rel, text) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
function siteTree(grids) {
  const root = fs.mkdtempSync(path.join(TMP, 'site-'));
  for (const f of ['scripts/lib/app.js', 'scripts/lib/app-fetch.js', 'scripts/lib/app-me.js', 'scripts/lib/tvgrid.js', 'scripts/lib/tvweek.js', 'scripts/lib/profile.js', 'scripts/lib/hardexclude.js', 'player/tools/rank-sources.js']) write(root, f, fs.readFileSync(path.join(REPO, f), 'utf8'));
  write(root, 'scripts/show-list.json', JSON.stringify({ types: ['Drama'], shows: [] }));
  write(root, 'profiles/hiddenwork/profile.json', JSON.stringify({ siteName: 'Hidden Work', domain: 'https://hidden.test' }));
  for (const g of grids) write(root, `catalog/shows/${g.slug}.json`, JSON.stringify(g, null, 2));
  write(root, 'catalog/overrides.json', '{}');
  return root;
}
function siteEpisodes(root) {
  const code = "const d=require(" + JSON.stringify(path.join(root, 'scripts/lib/app.js')) + ").assemble();"
    + "console.log(JSON.stringify(Object.fromEntries(d.shows.map(s=>[s.slug,s.seasons.flatMap(se=>se.episodes.map(e=>({k:se.season+'x'+e.n,name:e.name,url:e.url})))]))))";
  const r = spawnSync(process.execPath, ['-e', code], { cwd: root, encoding: 'utf8', env: { ...process.env, VOID_PROFILE: 'hiddenwork' } });
  assert.equal(r.status, 0, (r.stdout || '') + (r.stderr || ''));
  return JSON.parse(r.stdout.trim().split('\n').pop());
}

test('site build: the placed file plays on its episode, the typed name shows, and the guesses B did not touch stay off', () => {
  const files = CLIPS();
  const url = (c) => files.find((f) => clipOf(f) === c).url;
  const g = grid({ placeFiles: { [key('A')]: '2x3' }, acceptFiles: [key('C')], fileTitles: { [key('C')]: 'The Lost Reel' } }, files);
  const eps = siteEpisodes(siteTree([g]))['zork-show'];
  assert.deepEqual(eps.map((e) => e.k).sort(), ['1x3', '2x3']);
  assert.equal(eps.find((e) => e.k === '2x3').url, url('A'));
  assert.equal(eps.find((e) => e.k === '2x3').name, 'Hollow Lighthouse');
  assert.equal(eps.find((e) => e.k === '1x3').name, 'The Lost Reel');
  assert.equal(eps.find((e) => e.k === '1x3').url, url('C'));
});

test('site build: with no decisions, every guess stays off and the show leaves the site', () => {
  assert.equal(siteEpisodes(siteTree([grid()]))['zork-show'], undefined);
});

// ---- part 3: HQ's server, as the Hidden tab calls it -------------------------------------------------------------------------------
const MOVIE = (tmdbId, state, title) => ({ tmdbId, kind: 'tv-movie', title, year: '1990', runtime: 90, state, file: { conf: 0.6, item: 'item-' + tmdbId, itemTitle: title + ' (1990)', stem: title, file: title + '.mp4', format: 'MPEG4', playable: true, seconds: 5400, url: `https://archive.org/download/item-${tmdbId}/${encodeURIComponent(title)}.mp4` }, alternates: [] });
function hqTree() {
  const root = fs.mkdtempSync(path.join(TMP, 'hq-'));
  fs.cpSync(path.join(REPO, 'scripts', 'lib'), path.join(root, 'scripts', 'lib'), { recursive: true });
  write(root, 'scripts/hq.js', fs.readFileSync(path.join(REPO, 'scripts/hq.js'), 'utf8'));
  write(root, 'scripts/hq/index.html', fs.readFileSync(path.join(REPO, 'scripts/hq/index.html'), 'utf8'));
  write(root, 'scripts/show-list.json', JSON.stringify({ types: ['Drama'], shows: [{ name: 'Zork Show', type: 'Drama' }] }));
  write(root, 'profiles/hiddenwork/profile.json', JSON.stringify({ siteName: 'Hidden Work', domain: 'https://hidden.test' }));
  write(root, 'catalog/overrides.json', '{}');
  write(root, 'catalog/shows/zork-show.json', JSON.stringify(grid()));
  write(root, 'catalog/movies/quiet-river-1990.json', JSON.stringify(MOVIE(101, 'REVIEW', 'Quiet River')));
  write(root, 'catalog/movies/loud-river-1990.json', JSON.stringify(MOVIE(102, 'LIVE', 'Loud River')));
  return root;
}
const canBind = (port) => new Promise((ok) => { const s = net.createServer(); s.once('error', () => ok(false)); s.listen(port, '127.0.0.1', () => s.close(() => ok(true))); });
function call(port, method, urlPath, token, body) {
  return new Promise((ok, no) => {
    const data = body === undefined ? '' : JSON.stringify(body);
    const headers = method === 'GET' ? {} : { 'content-type': 'application/json', 'x-hq-token': token, 'content-length': Buffer.byteLength(data) };
    const req = http.request({ host: '127.0.0.1', port, path: urlPath, method, headers, timeout: 20000 }, (res) => { let t = ''; res.on('data', (c) => { t += c; }); res.on('end', () => { let j = null; try { j = JSON.parse(t); } catch (e) { /* html */ } ok({ status: res.statusCode, text: t, json: j }); }); });
    req.on('error', no); req.on('timeout', () => req.destroy(new Error('timed out'))); req.end(data);
  });
}

test('HQ: the Hidden lists, movie approve, un-approve and Not this film, and placing and naming a file', async (t) => {
  const root = hqTree();
  let port = 0;
  for (let p = 18700 + Math.floor(Math.random() * 200); p < 18990; p++) if (await canBind(p)) { port = p; break; }
  assert.ok(port, 'no free port');
  const hq = spawn(process.execPath, [path.join(root, 'scripts/hq.js'), '--port', String(port)], { cwd: root, env: { ...process.env, VOID_PROFILE: 'hiddenwork', HQ_STATE_DIR: path.join(root, 'state') }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  t.after(async () => { if (hq.exitCode === null) { const gone = new Promise((r) => hq.once('exit', r)); hq.kill(); await gone; } });
  let out = '';
  hq.stdout.on('data', (c) => { out += c; }); hq.stderr.on('data', (c) => { out += c; });
  for (let i = 0; i < 150 && !/HQ at/.test(out) && hq.exitCode === null; i++) await new Promise((r) => setTimeout(r, 100));
  assert.match(out, /HQ at/, 'HQ did not start: ' + out.slice(0, 300));
  const token = /<meta name="hq-token" content="([0-9a-f]{64})">/.exec((await call(port, 'GET', '/')).text)[1];
  const OV = () => JSON.parse(fs.readFileSync(path.join(root, 'catalog/overrides.json'), 'utf8'));
  const quiet = MOVIE(101, 'REVIEW', 'Quiet River');

  // the lists
  const eps = (await call(port, 'GET', '/api/hidden/episodes')).json.rows;
  assert.deepEqual(eps, [{ slug: 'zork-show', show: 'Zork Show', guesses: 4, playing: 0, off: true, selfListed: false }]);
  const movies = (await call(port, 'GET', '/api/hidden/movies')).json.rows;
  assert.deepEqual(movies.map((m) => [m.slug, m.approved, m.rejected]), [['movie-101', false, false]], 'only the REVIEW movie is listed, not the LIVE one');
  assert.equal(movies[0].file.url, quiet.file.url, 'the preview plays the movie\'s own file');

  // approve, as the Approve button sends it: the site gate then ships the movie
  let r = await call(port, 'POST', '/api/override/movie-101', token, { set: { approved: true, rejected: null }, rematch: false });
  assert.equal(r.status, 200);
  assert.equal(r.json.job, null, 'a movie decision starts no matcher job');
  assert.deepEqual(OV()['movie-101'], { approved: true });
  assert.equal(movieShips(quiet, OV()), true);
  assert.equal((await call(port, 'GET', '/api/hidden/movies')).json.rows[0].approved, true);
  // un-approve: the entry goes, and the movie is hidden again
  await call(port, 'POST', '/api/override/movie-101', token, { set: { approved: null }, rematch: false });
  assert.equal(OV()['movie-101'], undefined);
  assert.equal(movieShips(quiet, OV()), false);
  // Not this film: hidden, and marked so it leaves the to-do list
  await call(port, 'POST', '/api/override/movie-101', token, { set: { rejected: true, approved: null }, rematch: false });
  assert.deepEqual(OV()['movie-101'], { rejected: true });
  assert.equal(movieShips(quiet, OV()), false);
  assert.equal((await call(port, 'GET', '/api/hidden/movies')).json.rows[0].rejected, true);

  // place and name a file, as the Place and Name buttons send them (rematch off here: no matcher job in a test)
  r = await call(port, 'POST', '/api/override/zork-show', token, { map: { placeFiles: { [key('A')]: '2x3' } }, pull: { rejectFiles: [key('A')] }, rematch: false });
  assert.equal(r.status, 200);
  r = await call(port, 'POST', '/api/override/zork-show', token, { map: { fileTitles: { [key('A')]: 'Pilot (unaired)' } }, rematch: false });
  assert.deepEqual(OV()['zork-show'], { placeFiles: { [key('A')]: '2x3' }, fileTitles: { [key('A')]: 'Pilot (unaired)' } });
  // what HQ wrote is what the matcher reads
  const g = grid(OV()['zork-show']);
  assert.equal(clipOf(at(g, 2, 3).file), 'A');
  assert.equal(at(g, 2, 3).name, 'Pilot (unaired)');
  // a placement that is not season x episode, a title over two lines, or an unknown list is refused, and nothing is written
  const before = fs.readFileSync(path.join(root, 'catalog/overrides.json'), 'utf8');
  for (const bad of [{ placeFiles: { [key('B')]: '2-5' } }, { fileTitles: { [key('B')]: 'one\ntwo' } }, { rejectFiles: { [key('B')]: 'x' } }]) {
    r = await call(port, 'POST', '/api/override/zork-show', token, { map: bad, rematch: false });
    assert.equal(r.status, 500, JSON.stringify(bad));
  }
  assert.equal(fs.readFileSync(path.join(root, 'catalog/overrides.json'), 'utf8'), before);
  // undo: null removes one entry, and an emptied list goes away
  await call(port, 'POST', '/api/override/zork-show', token, { map: { placeFiles: { [key('A')]: null }, fileTitles: { [key('A')]: '' } }, rematch: false });
  assert.equal(OV()['zork-show'], undefined);
});

test('the runbook rows say how to do each action in HQ and by hand, and no em dash got in', () => {
  const runbook = fs.readFileSync(path.join(REPO, 'docs/RUNBOOK.md'), 'utf8');
  const row = (id) => (runbook.split('\n').find((l) => l.startsWith('| ' + id + ' |')) || '');
  for (const word of ['Hidden', 'placeFiles', 'fileTitles', 'acceptFiles', 'rejectFiles', 'tests/hidden-work.test.js']) assert.ok(row('episodes:guess-hidden').includes(word), 'episodes:guess-hidden row lacks ' + word);
  for (const word of ['Hidden', 'Approve', 'Un-approve', 'Not this film', '"rejected": true', 'tests/hidden-work.test.js']) assert.ok(row('movies:review-hidden').includes(word), 'movies:review-hidden row lacks ' + word);
  const dash = new RegExp(String.fromCharCode(0x2014));
  for (const f of ['docs/RUNBOOK.md', 'docs/HQ.md', 'scripts/lib/hidden.js', 'scripts/match.js', 'scripts/hq.js', 'tests/hidden-work.test.js']) assert.doesNotMatch(fs.readFileSync(path.join(REPO, f), 'utf8'), dash, f + ' has an em dash');
  const page = fs.readFileSync(path.join(REPO, 'scripts/hq/index.html'), 'utf8'); // the page had one before (an empty file cell); the Hidden tab's code must add none
  assert.doesNotMatch(page.slice(page.indexOf('// ---- placing and naming a file'), page.indexOf('function preview(url,name)')), dash);
});
