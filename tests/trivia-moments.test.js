// Trivia moment library and its marking page server (plan C0). Run: node --test tests/trivia-moments.test.js
// Proves: the check refuses a moment that is too short or long, outside its file, unnamed, on a file the catalog no
// longer plays, a line without its words, or a long dash; the marking server lists titles, saves a good moment with who
// picked and approved it, refuses a bad one without writing, and deletes; the page is never copied to the live site.
// Uses a small made-up catalog and a temporary folder; the real moments and catalog are not touched. No network.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.join(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'trivia-moments-'));
const DB = path.join(TMP, 'voidtv.db');
const STORE = path.join(TMP, 'moments');
process.env.TRIVIA_DB = DB;
process.env.TRIVIA_MOMENTS_DIR = STORE;
const M = require('../scripts/trivia/moments');

{ // the made-up catalog
  const db = new DatabaseSync(DB);
  db.exec(`create table shows (slug text primary key, name text, tmdb_id int, premiered text);
    create table episodes (show_slug text, season int, number int, name text, state text, item text, url text, seconds int, format text, playable int);
    create table movies (tmdb_id int primary key, title text, year int, state text, item text, url text, seconds int, format text, playable int);
    insert into shows values ('friends', 'Friends', 1668, '1994-09-22'), ('gone', 'Gone Show', 9, '1980-01-01');
    insert into episodes values ('friends', 1, 1, 'The One Where It Started', 'LIVE', 'fr1', 'https://archive.org/download/fr1/e1.mp4', 1320, 'h.264', 1),
      ('friends', 1, 2, 'Short', 'LIVE', 'fr2', 'https://archive.org/download/fr2/e2.mp4', 120, 'h.264', 1),
      ('gone', 1, 1, 'Missing', 'MISSING', null, null, null, null, null);
    insert into movies values (11, 'A Film', 1960, 'LIVE', 'af', 'https://archive.org/download/af/af.mp4', 5400, 'MPEG4', 1);`);
  db.close();
}

const good = () => ({ id: 'x', kind: 'scene', show: 'friends', season: 1, number: 1, item: 'fr1', url: 'https://archive.org/download/fr1/e1.mp4', start: 300, end: 310, by: 'Bryan', at: '2026-11-20T20:00:00Z', approved: { by: 'Bryan', at: '2026-11-20T20:00:00Z' } });
const FILE = { url: 'https://archive.org/download/fr1/e1.mp4', seconds: 1320 };

test('a good moment passes; each kind of fault is named', () => {
  assert.deepEqual(M.problems(good(), FILE), []);
  assert.match(M.problems({ ...good(), end: 302 }, FILE).join(), /5 to 20 seconds/);
  assert.match(M.problems({ ...good(), end: 330 }, FILE).join(), /5 to 20 seconds/);
  assert.match(M.problems({ ...good(), start: 1315, end: 1325 }, FILE).join(), /outside the file/);
  assert.match(M.problems({ ...good(), by: '' }, FILE).join(), /nobody picked it/);
  assert.match(M.problems({ ...good(), kind: 'random' }, FILE).join(), /kind must be/);
  assert.match(M.problems({ ...good(), kind: 'line' }, FILE).join(), /needs the words/);
  assert.match(M.problems({ ...good(), note: 'a — dash' }, FILE).join(), /long dash/);
  assert.match(M.problems(good(), null).join(), /no longer plays/);
  assert.match(M.problems(good(), { ...FILE, url: 'https://archive.org/download/other.mp4' }).join(), /different file/);
  assert.deepEqual(M.problems({ ...good(), kind: 'still', end: 300 }, FILE), []);
  assert.match(M.problems({ ...good(), kind: 'still' }, FILE).join(), /one frame/);
});

test('the catalog side: only clip files count, and a moment finds its own', () => {
  const db = M.openDb();
  assert.deepEqual(M.episodesOf(db, 'friends').map((e) => e.number), [1]); // the 2-minute one is too short for clips
  assert.equal(M.fileFor(db, { show: 'friends', season: 1, number: 1 }).item, 'fr1');
  assert.equal(M.fileFor(db, { show: 'gone', season: 1, number: 1 }), null);
  assert.equal(M.fileFor(db, { film: 11 }).item, 'af');
  db.close();
  assert.equal(M.momentId({ show: 'friends', season: 1, number: 1, kind: 'scene', start: 300.04 }), 'm-friends-s1e1-scene-3000');
  assert.equal(M.momentId({ film: 11, kind: 'still', start: 61.25 }), 'm-film-11-still-613');
});

test('the marking server: list, save with who picked it, refuse a bad one, delete', async (t) => {
  // a free port (the script treats 0 as "no port given")
  const net = require('net');
  const port = await new Promise((r) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
  const srv = spawn(process.execPath, ['--no-warnings', path.join(ROOT, 'scripts', 'trivia', 'mark.js'), String(port)], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  // Wait for the server to exit: it holds the temporary catalog open, and Windows will not delete the folder until it lets go.
  t.after(async () => { if (srv.exitCode === null) { const gone = new Promise((r) => srv.once('exit', r)); srv.kill(); await gone; } });
  await new Promise((r) => srv.stdout.once('data', r));
  const base = 'http://127.0.0.1:' + port;
  const json = async (url, opts) => { const r = await fetch(base + url, opts); return { status: r.status, body: await r.json() }; };

  const titles = (await json('/api/titles')).body;
  assert.deepEqual(titles.map((x) => x.key).sort(), ['film-11', 'friends']);
  assert.equal((await json('/api/files?key=friends')).body.length, 1);

  const post = (b) => json('/api/moments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  const saved = await post({ key: 'friends', season: 1, number: 1, kind: 'line', start: 300, end: 310, line: 'How you doin?', by: 'Bryan' });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.item, 'fr1');
  assert.equal(saved.body.url, 'https://archive.org/download/fr1/e1.mp4');
  assert.equal(saved.body.approved.by, 'Bryan');
  assert.equal(JSON.parse(fs.readFileSync(path.join(STORE, 'friends.json'), 'utf8')).moments.length, 1);

  const bad = await post({ key: 'friends', season: 1, number: 1, kind: 'scene', start: 1315, end: 1325, by: 'Bryan' });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /outside the file/);
  const ghost = await post({ key: 'gone', season: 1, number: 1, kind: 'scene', start: 10, end: 20, by: 'Bryan' });
  assert.equal(ghost.status, 400);
  assert.equal(fs.existsSync(path.join(STORE, 'gone.json')), false);

  const film = await post({ key: 'film-11', kind: 'still', start: 61.25, end: 99, by: 'Caitlin' });
  assert.equal(film.status, 200);
  assert.equal(film.body.end, film.body.start); // a still is one frame whatever the page sent

  assert.equal((await json('/api/titles')).body.find((x) => x.key === 'friends').moments, 1);
  const del = await json('/api/moments?key=friends&id=' + encodeURIComponent(saved.body.id), { method: 'DELETE' });
  assert.equal(del.status, 200);
  assert.equal((await json('/api/moments?key=friends')).body.length, 0);

  // The running server holds no handle on the catalog: VoidTV's nightly step must be able to replace the file.
  fs.renameSync(DB, DB + '.moved');
  fs.renameSync(DB + '.moved', DB);

  const page = await fetch(base + '/trivia/mark/');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Mark moments/);
  assert.equal((await fetch(base + '/trivia/mark/../../catalog/voidtv.db')).status, 404);
});

test('the check over the store passes what the server saved', () => {
  const db = M.openDb();
  const { n, bad } = M.checkAll(db);
  db.close();
  assert.equal(n, 1);
  assert.deepEqual(bad, []);
});

test('the marking page is never copied to the live site', () => {
  const site = fs.readFileSync(path.join(ROOT, 'scripts', 'site.js'), 'utf8');
  const block = site.slice(site.indexOf('Trivia Night (trivia/'), site.indexOf('brandSrc', site.indexOf('Trivia Night (trivia/')));
  assert.doesNotMatch(block, /mark|moments/);
});

// The temporary folder goes, but a full parallel run can find Windows (the virus scanner, the indexer) still holding a
// new temp file for a moment: the same EPERM hit other suites' temp folders on 20 Nov 2026 too. Retry for a few seconds,
// then leave the folder to Windows' own temp clean-up rather than fail a run over a test's leftover.
test.after(() => {
  try { fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); }
  catch (e) { if (e.code !== 'EPERM' && e.code !== 'EBUSY') throw e; }
});
