// Tests for scripts/publish.js. Run with: node --test tests/
// Each test builds a throwaway bare repository as "origin" and a clone with a tiny catalog, runs publish.js against
// it with --root, and reads back the repositories and the log. Nothing here touches the real repo, the network or the site.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const PUBLISH = path.join(__dirname, '..', 'scripts', 'publish.js');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-test-'));
test.after(() => { fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); });

const git = (cwd, ...args) => execFileSync('git', ['-c', 'core.safecrlf=false', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const write = (root, rel, text) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };

// One show grid in the shape scripts/lib/app.js assemble() reads: a season of playable episodes.
function grid(i, eps) {
  return {
    show: `Test Show ${i}`, slug: `test-show-${i}`, type: 'Drama', network: 'TestNet', matchedAt: '2026-01-01T00:00:00.000Z',
    tvmaze: { id: i, runtime: 30, premiered: '2000-01-01' },
    seasons: [{ season: 1, episodes: Array.from({ length: eps }, (_, k) => ({
      number: k + 1, name: `Episode ${k + 1}`, airdate: '2000-01-01', state: 'LIVE', alternates: [],
      file: { name: `e${k + 1}`, file: `e${k + 1}.mp4`, item: `item-${i}`, url: `https://archive.org/download/item-${i}/e${k + 1}.mp4`, format: 'h.264', playable: true, seconds: 1800, sizeMB: 90, conf: 0.9 },
    })) }],
  };
}
const putShow = (root, i, eps = 5, edit) => { const g = grid(i, eps); if (edit) edit(g); write(root, `catalog/shows/test-show-${i}.json`, JSON.stringify(g, null, 2) + '\n'); };

let counter = 0;
// A fresh origin and clone: 10 shows with 5 episodes each, already published (as "Catalog: 10 shows, 50 episodes").
function fresh() {
  const dir = path.join(TMP, 'case' + (++counter)), origin = path.join(dir, 'origin.git'), work = path.join(dir, 'work');
  fs.mkdirSync(dir, { recursive: true });
  git(dir, 'init', '-q', '--bare', '-b', 'master', origin);
  git(dir, 'init', '-q', '-b', 'master', work);
  for (const [k, v] of [['user.name', 'Test'], ['user.email', 'test@example.invalid'], ['commit.gpgsign', 'false'], ['core.autocrlf', 'false']]) git(work, 'config', k, v);
  git(work, 'remote', 'add', 'origin', origin);
  write(work, '.gitignore', 'catalog/cache/\n');
  write(work, 'scripts/show-list.json', JSON.stringify({ types: ['Drama'], shows: [] }, null, 2) + '\n');
  write(work, 'docs/README.md', '# docs\n');
  for (let i = 0; i < 10; i++) putShow(work, i);
  git(work, 'add', '-A');
  git(work, 'commit', '-q', '-m', 'Catalog: 10 shows, 50 episodes (12 files)');
  git(work, 'push', '-q', 'origin', 'master');
  return { dir, origin, work };
}

function publish(work, args = [], env = {}) {
  const e = { ...process.env, PUBLISH_BACKOFF_MS: '30,30,30', PUBLISH_PUSH_TIMEOUT_MS: '30000', ...env };
  delete e.VOID_PROFILE;
  const r = spawnSync(process.execPath, [PUBLISH, '--root', work, ...args], { encoding: 'utf8', env: e });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
const logLines = (work) => { try { return fs.readFileSync(path.join(work, 'catalog', 'cache', 'publish.log'), 'utf8').trim().split('\n'); } catch (_) { return []; } };
// The last line that is one of the outcomes the doctor looks for.
const outcome = (work) => logLines(work).filter((l) => /^\S+ (nothing new|pushed |refused:|FAILED:|held:)/.test(l)).pop() || '';
const head = (cwd) => git(cwd, 'rev-parse', 'HEAD');
const ahead = (work) => git(work, 'rev-list', '--count', 'origin/master..HEAD');
const staged = (work) => git(work, 'diff', '--cached', '--name-only');
const originSubject = (c) => git(c.origin, 'log', '-1', '--format=%s', 'master');

test('nothing new: logs it, makes no commit, exits 0', () => {
  const c = fresh(), before = head(c.work);
  const r = publish(c.work);
  assert.strictEqual(r.status, 0);
  assert.match(outcome(c.work), /^\S+ nothing new$/);
  assert.strictEqual(head(c.work), before);
});

test('normal push: commits only its own paths, the bare origin receives the commit, publish-state.json is written', () => {
  const c = fresh();
  putShow(c.work, 10);                                        // a new show
  write(c.work, 'other.txt', 'someone else is working on this\n');
  git(c.work, 'add', 'other.txt');                            // staged by hand, not publish's business
  const r = publish(c.work);
  assert.strictEqual(r.status, 0, r.out);
  assert.match(outcome(c.work), /pushed [0-9a-f]+: Catalog: 11 shows, 55 episodes \(1 files\)$/);
  assert.strictEqual(originSubject(c), 'Catalog: 11 shows, 55 episodes (1 files)');
  assert.strictEqual(git(c.origin, 'show', '--name-only', '--format=', 'master'), 'catalog/shows/test-show-10.json');
  assert.strictEqual(staged(c.work), 'other.txt');            // still staged, still not committed
  assert.strictEqual(ahead(c.work), '0');
  const state = JSON.parse(fs.readFileSync(path.join(c.work, 'catalog', 'cache', 'publish-state.json'), 'utf8'));
  assert.strictEqual(state.shows, 11);
  assert.strictEqual(state.episodes, 55);
  assert.ok(state.at && state.commit);
});

test('shrink: more than 10% fewer playable shows or episodes is refused, nothing is committed, --allow-shrink lets it through', () => {
  const c = fresh(), before = head(c.work);
  for (let i = 2; i < 10; i++) fs.rmSync(path.join(c.work, 'catalog', 'shows', `test-show-${i}.json`));
  const r = publish(c.work);
  assert.strictEqual(r.status, 1, r.out);
  assert.match(outcome(c.work), /refused: shrink: shows 10 -> 2, episodes 50 -> 10/);
  assert.strictEqual(head(c.work), before);                   // nothing committed
  assert.strictEqual(staged(c.work), '');                     // index put back
  assert.strictEqual(ahead(c.work), '0');
  const seeded = JSON.parse(fs.readFileSync(path.join(c.work, 'catalog', 'cache', 'publish-state.json'), 'utf8'));
  assert.deepStrictEqual([seeded.shows, seeded.episodes], [10, 50]); // seeded from the last Catalog commit subject
  const r2 = publish(c.work, ['--allow-shrink']);
  assert.strictEqual(r2.status, 0, r2.out);
  assert.match(outcome(c.work), /pushed [0-9a-f]+: Catalog: 2 shows, 10 episodes/);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(c.work, 'catalog', 'cache', 'publish-state.json'), 'utf8')).shows, 2);
  assert.strictEqual(git(c.origin, 'ls-tree', '-r', '--name-only', 'master', 'catalog/shows').split('\n').length, 2); // the 8 deleted grids are gone from origin too
});

test('shrink: exactly 10% is not more than 10%, 20% is', () => {
  const c = fresh();
  fs.rmSync(path.join(c.work, 'catalog', 'shows', 'test-show-9.json'));       // 9 of 10 shows, 45 of 50 episodes
  assert.strictEqual(publish(c.work).status, 0);
  assert.match(outcome(c.work), /pushed [0-9a-f]+: Catalog: 9 shows, 45 episodes/);
  fs.rmSync(path.join(c.work, 'catalog', 'shows', 'test-show-8.json'));       // 8 of 9: 11% down on the new baseline
  const r = publish(c.work);
  assert.strictEqual(r.status, 1);
  assert.match(outcome(c.work), /refused: shrink: shows 9 -> 8/);
});

test('other commits waiting: publish commits its own work, does not push, says held; --allow-other-commits pushes both', () => {
  const c = fresh();
  write(c.work, 'scripts/unrelated.js', '// a change from another chat\n');
  git(c.work, 'add', 'scripts/unrelated.js');
  git(c.work, 'commit', '-q', '-m', 'Fix the unrelated thing');
  assert.strictEqual(publish(c.work).status, 0);                       // only that commit waits and nothing new: nothing to do
  assert.match(outcome(c.work), /nothing new$/);
  putShow(c.work, 10);
  const r = publish(c.work);
  assert.strictEqual(r.status, 0, r.out);
  assert.match(outcome(c.work), /held: 1 other commit waiting: Fix the unrelated thing/);
  assert.strictEqual(originSubject(c), 'Catalog: 10 shows, 50 episodes (12 files)'); // origin did not move
  assert.strictEqual(ahead(c.work), '2');                                            // the other commit and publish's own
  assert.match(git(c.work, 'log', '-1', '--format=%s'), /^Catalog: 11 shows, 55 episodes/);
  publish(c.work);                                                                   // still held next time, not "nothing new"
  assert.match(outcome(c.work), /held: 1 other commit waiting/);
  assert.strictEqual(ahead(c.work), '2');
  const r2 = publish(c.work, ['--allow-other-commits']);
  assert.strictEqual(r2.status, 0, r2.out);
  assert.match(outcome(c.work), /pushed [0-9a-f]+: Catalog: 11 shows/);
  assert.strictEqual(ahead(c.work), '0');
  assert.strictEqual(git(c.origin, 'log', '--format=%s', '-3', 'master').split('\n')[1], 'Fix the unrelated thing');
});

test('failed push: three retries, one FAILED line, the commit is kept, and the next run pushes it first even with nothing new', () => {
  const c = fresh();
  git(c.work, 'remote', 'set-url', 'origin', path.join(c.dir, 'gone.git')); // push cannot work
  putShow(c.work, 10);
  const r = publish(c.work);
  assert.strictEqual(r.status, 1, r.out);
  const lines = logLines(c.work);
  assert.strictEqual(lines.filter((l) => /push attempt \d of 4 did not go through/.test(l)).length, 3); // tries 1 to 3 announce a retry
  assert.strictEqual(lines.filter((l) => /FAILED:/.test(l)).length, 1);
  assert.match(outcome(c.work), /FAILED: push to origin\/master did not go through \(.+\)$/);
  assert.ok(!/\n/.test(outcome(c.work)));
  assert.strictEqual(ahead(c.work), '1');                                    // the commit is still here
  assert.strictEqual(originSubject(c), 'Catalog: 10 shows, 50 episodes (12 files)');
  git(c.work, 'remote', 'set-url', 'origin', c.origin);                      // the network is back
  const r2 = publish(c.work);                                                // nothing new is staged
  assert.strictEqual(r2.status, 0, r2.out);
  assert.match(outcome(c.work), /pushed [0-9a-f]+: Catalog: 11 shows, 55 episodes/);
  assert.strictEqual(originSubject(c), 'Catalog: 11 shows, 55 episodes (1 files)');
  assert.strictEqual(ahead(c.work), '0');
});

test('a push that fails twice and then goes through is logged as pushed', () => {
  const c = fresh();
  fs.writeFileSync(path.join(c.origin, 'fails'), '2\n');
  const hook = path.join(c.origin, 'hooks', 'pre-receive');
  fs.writeFileSync(hook, '#!/bin/sh\nn=$(cat fails 2>/dev/null || echo 0)\nif [ "$n" -gt 0 ]; then echo $((n-1)) > fails; echo "try again later" >&2; exit 1; fi\nexit 0\n', { mode: 0o755 });
  putShow(c.work, 10);
  const r = publish(c.work);
  assert.strictEqual(r.status, 0, r.out);
  assert.strictEqual(logLines(c.work).filter((l) => /push attempt \d of 4 did not go through/.test(l)).length, 2);
  assert.match(outcome(c.work), /pushed [0-9a-f]+: Catalog: 11 shows/);
  assert.strictEqual(originSubject(c), 'Catalog: 11 shows, 55 episodes (1 files)');
});

test('not on master: one FAILED line, nothing staged, nothing committed', () => {
  const c = fresh();
  git(c.work, 'checkout', '-q', '-b', 'other');
  putShow(c.work, 10);
  const before = head(c.work), r = publish(c.work);
  assert.strictEqual(r.status, 1);
  assert.match(outcome(c.work), /FAILED: the checked-out branch is other, publish only runs on master/);
  assert.strictEqual(head(c.work), before);
  assert.strictEqual(staged(c.work), '');
});

test('a catalog file that is not JSON is refused and named', () => {
  const c = fresh(), before = head(c.work);
  write(c.work, 'catalog/shows/test-show-3.json', '{ "show": "broken", ');
  const r = publish(c.work);
  assert.strictEqual(r.status, 1);
  assert.match(outcome(c.work), /refused: catalog\/shows\/test-show-3\.json is not valid JSON/);
  assert.strictEqual(head(c.work), before);
  assert.strictEqual(staged(c.work), '');
});

test('an added address or token is refused and the file named; an Archive file name that only looks like an address is not', () => {
  const c = fresh(), before = head(c.work);
  putShow(c.work, 3, 5, (g) => { g.seasons[0].episodes[0].name = 'Contact writer@example.org for more'; });
  assert.strictEqual(publish(c.work).status, 1);
  assert.match(outcome(c.work), /refused: catalog\/shows\/test-show-3\.json would add an address-shaped string/);
  assert.strictEqual(staged(c.work), '');
  putShow(c.work, 3, 5, (g) => { g.seasons[0].episodes[0].name = 'mail someone@mail.example.co.uk'; }); // a country-code address is an address too
  assert.strictEqual(publish(c.work).status, 1);
  assert.match(outcome(c.work), /refused: catalog\/shows\/test-show-3\.json would add an address-shaped string/);
  putShow(c.work, 3);                                                           // back to the clean file
  write(c.work, 'docs/NOTES.md', 'key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0\n');
  assert.strictEqual(publish(c.work).status, 1);
  assert.match(outcome(c.work), /refused: docs\/NOTES\.md would add token-shaped text/);
  fs.rmSync(path.join(c.work, 'docs', 'NOTES.md'));
  write(c.work, 'docs/ENV.md', 'TMDB_READ_TOKEN=abcdef1234567890abcdef\n');
  assert.strictEqual(publish(c.work).status, 1);
  assert.match(outcome(c.work), /refused: docs\/ENV\.md would add token-shaped text/);
  fs.rmSync(path.join(c.work, 'docs', 'ENV.md'));
  assert.strictEqual(head(c.work), before);
  putShow(c.work, 3, 5, (g) => { g.seasons[0].episodes[0].file.file = 'Clip@720p.mp4'; g.seasons[0].episodes[0].file.name = 'Clip@Sessions.at.West54th.PBS.tv-vhs.XviD'; });
  const r = publish(c.work);
  assert.strictEqual(r.status, 0, r.out);
  assert.match(outcome(c.work), /pushed [0-9a-f]+: Catalog: 10 shows, 50 episodes \(1 files\)/);
});

test('--dry: says what it would do and changes nothing', () => {
  const c = fresh(), before = head(c.work);
  putShow(c.work, 10);
  const r = publish(c.work, ['--dry']);
  assert.strictEqual(r.status, 0, r.out);
  assert.match(r.out, /dry: would commit 1 files: Catalog: 11 shows, 55 episodes/);
  assert.match(r.out, /dry: would push 1 commit/);
  assert.strictEqual(head(c.work), before);
  assert.strictEqual(staged(c.work), '');
  assert.strictEqual(originSubject(c), 'Catalog: 10 shows, 50 episodes (12 files)');
  assert.ok(!logLines(c.work).some((l) => /^\S+ (nothing new|pushed |refused:|FAILED:|held:)/.test(l)), 'a dry run must not look like a real outcome to the doctor');
});

test('docs/_drafts is never published', () => {
  const c = fresh(), before = head(c.work);
  write(c.work, 'docs/_drafts/idea.md', 'not for GitHub yet\n');
  assert.strictEqual(publish(c.work).status, 0);
  assert.match(outcome(c.work), /nothing new$/);
  assert.strictEqual(head(c.work), before);
  putShow(c.work, 10);
  assert.strictEqual(publish(c.work).status, 0);
  assert.strictEqual(git(c.origin, 'show', '--name-only', '--format=', 'master'), 'catalog/shows/test-show-10.json');
});

test('works the way this PC is set up: core.autocrlf=true and CRLF files in the working tree', () => {
  const c = fresh();
  git(c.work, 'config', 'core.autocrlf', 'true');
  for (let i = 10; i < 13; i++) write(c.work, `catalog/shows/test-show-${i}.json`, JSON.stringify(grid(i, 5), null, 2).replace(/\n/g, '\r\n') + '\r\n');
  const r = publish(c.work);
  assert.strictEqual(r.status, 0, r.out);
  assert.match(outcome(c.work), /pushed [0-9a-f]+: Catalog: 13 shows, 65 episodes \(3 files\)$/);
  assert.ok(!/warning/i.test(r.out), 'line-ending warnings must not reach the log: ' + r.out.slice(0, 300));
});

test('no flags: the scheduled run, started from inside its own tree, finds the same paths without --root', () => {
  const c = fresh();
  const root = path.join(__dirname, '..');
  for (const f of ['scripts/publish.js', 'scripts/lib/profile.js', 'scripts/lib/app.js', 'player/tools/rank-sources.js']) write(c.work, f, fs.readFileSync(path.join(root, f), 'utf8'));
  git(c.work, 'add', 'scripts', 'player');
  git(c.work, 'commit', '-q', '-m', 'Catalog: 10 shows, 50 episodes (the tooling for this test)'); // a Catalog commit so nothing is "other"
  git(c.work, 'push', '-q', 'origin', 'master');
  putShow(c.work, 10);
  const e = { ...process.env, PUBLISH_BACKOFF_MS: '30', PUBLISH_PUSH_TIMEOUT_MS: '30000' };
  delete e.VOID_PROFILE;
  const r = spawnSync(process.execPath, [path.join(c.work, 'scripts', 'publish.js')], { cwd: TMP, encoding: 'utf8', env: e });
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.match(outcome(c.work), /pushed [0-9a-f]+: Catalog: 11 shows, 55 episodes \(1 files\)$/);
  assert.strictEqual(originSubject(c), 'Catalog: 11 shows, 55 episodes (1 files)');
});

test('publish.log is cut back to its last megabyte', () => {
  const c = fresh();
  const old = Array.from({ length: 40000 }, (_, i) => `2026-10-01T00:00:00.000Z old line ${i} ${'x'.repeat(40)}`).join('\n') + '\n';
  assert.ok(old.length > 2 * 1024 * 1024);
  write(c.work, 'catalog/cache/publish.log', old);
  assert.strictEqual(publish(c.work).status, 0);
  const size = fs.statSync(path.join(c.work, 'catalog', 'cache', 'publish.log')).size;
  assert.ok(size <= 1024 * 1024 + 200, 'size ' + size);
  assert.ok(size > 900 * 1024);
  const lines = logLines(c.work);
  assert.match(lines[0], /^2026-10-01T00:00:00\.000Z old line \d+ x+$/); // starts on a whole line
  assert.match(lines[lines.length - 1], /nothing new$/);
});

test('the doctor: publish light follows the last outcome line, unpushed turns yellow then red, addresses are counted', () => {
  const c = fresh();
  const root = path.join(__dirname, '..');
  for (const f of ['scripts/doctor.js', 'scripts/lib/profile.js', 'scripts/lib/tasks.js', 'scripts/lib/app.js', 'player/tools/rank-sources.js']) write(c.work, f, fs.readFileSync(path.join(root, f), 'utf8'));
  git(c.work, 'add', 'scripts', 'player');
  git(c.work, 'commit', '-q', '-m', 'Add the tooling for this test');
  git(c.work, 'push', '-q', 'origin', 'master');
  const doctor = () => {
    const e = { ...process.env }; delete e.VOID_PROFILE;
    spawnSync(process.execPath, [path.join(c.work, 'scripts', 'doctor.js'), '--quick'], { cwd: TMP, encoding: 'utf8', env: e });
    const h = JSON.parse(fs.readFileSync(path.join(c.work, 'catalog', 'cache', 'health.json'), 'utf8'));
    return Object.fromEntries(h.checks.map((x) => [x.id, x]));
  };
  const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
  // level with origin, nothing logged, no addresses
  let d = doctor();
  assert.strictEqual(d.unpushed.level, 'green');
  assert.strictEqual(d.addresses.level, 'green');
  assert.strictEqual(d.publish.level, 'yellow');
  // a failure followed by thousands of warning lines is still red (it used to read as "no publish has run yet")
  write(c.work, 'catalog/cache/publish.log', `${ago(30)} FAILED: push to origin/master did not go through (x)\n` + 'warning: LF will be replaced by CRLF\n'.repeat(5000));
  assert.strictEqual(doctor().publish.level, 'red');
  write(c.work, 'catalog/cache/publish.log', `${ago(30)} held: 1 other commit waiting: Fix (not pushed)\n`);
  assert.strictEqual(doctor().publish.level, 'yellow');
  write(c.work, 'catalog/cache/publish.log', `${ago(30)} refused: shrink: shows 10 -> 2\n`);
  assert.strictEqual(doctor().publish.level, 'red');
  write(c.work, 'catalog/cache/publish.log', `${ago(30)} nothing new\n`);
  assert.strictEqual(doctor().publish.level, 'green');
  // a commit that publish did not make is waiting: yellow, named by subject
  write(c.work, 'notes.txt', 'x\n');
  git(c.work, 'add', 'notes.txt');
  git(c.work, 'commit', '-q', '-m', 'Work from another chat');
  d = doctor();
  assert.strictEqual(d.unpushed.level, 'yellow');
  assert.match(d.unpushed.msg, /Work from another chat/);
  // a Catalog commit that has waited over 30 minutes: red
  write(c.work, 'catalog/shows/test-show-0.json', JSON.stringify(grid(0, 6), null, 2) + '\n');
  git(c.work, 'add', 'catalog');
  execFileSync('git', ['commit', '-q', '-m', 'Catalog: 10 shows, 51 episodes (1 files)'], { cwd: c.work, env: { ...process.env, GIT_COMMITTER_DATE: ago(120), GIT_AUTHOR_DATE: ago(120) } });
  d = doctor();
  assert.strictEqual(d.unpushed.level, 'red');
  assert.match(d.unpushed.msg, /1 Catalog commit waiting/);
  // addresses: an address in the text is counted and the file named; Archive file names that only look like one are not
  putShow(c.work, 3, 5, (g) => { g.seasons[0].episodes[0].file.file = 'Clip@720p.mp4'; g.seasons[0].episodes[0].file.name = 'Clip@Sessions.at.West54th.PBS.tv-vhs.XviD'; });
  assert.strictEqual(doctor().addresses.level, 'green');
  putShow(c.work, 4, 5, (g) => { g.seasons[0].episodes[0].name = 'Contact writer@example.org'; });
  d = doctor();
  assert.strictEqual(d.addresses.level, 'red');
  assert.match(d.addresses.msg, /^1 address-shaped string in 1 catalog file, e\.g\. catalog\/shows\/test-show-4\.json/);
});

test('the hunters mask address text in the free-text fields they copy, and none writes the uploader address', () => {
  const dir = path.join(__dirname, '..', 'scripts');
  const wrapped = { 'hunt.js': ['description: noEmail(', 'title: noEmail('], 'hunt-movies.js': ['const itemTitle = noEmail(', 'title: noEmail(m.title)', 'overview: noEmail(m.overview)'], 'scout.js': ['title: noEmail(L.title)', 'sampleTitle: noEmail(best.title)'], 'tvmovies.js': ['title: noEmail(m.title)', 'original: noEmail(', 'overview: noEmail(m.overview', 'noEmail(c.name)'] };
  for (const [file, needles] of Object.entries(wrapped)) {
    const src = fs.readFileSync(path.join(dir, file), 'utf8');
    const line = src.split(/\r?\n/).find((l) => l.startsWith('const noEmail = '));
    assert.ok(line, file + ' defines noEmail');
    const noEmail = new Function(line + '; return noEmail;')();                 // the helper exactly as the script has it
    assert.strictEqual(noEmail('Write to a.b+c@mail.example.org or x@y.co.uk today'), 'Write to [email] or [email] today');
    assert.strictEqual(noEmail('no address here'), 'no address here');
    assert.strictEqual(noEmail(undefined), undefined);
    for (const n of needles) assert.ok(src.includes(n), `${file} should contain ${n}`);
    assert.ok(!/uploader: (m|o|meta)\.uploader/.test(src), file + ' must not write the uploader address');
  }
});
