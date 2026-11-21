// Tests for scripts/backup-branches.js: one checked bundle of the git branches that have commits on no remote (Bryan, 21 Nov 2026).
// Run: node --test tests/backup-branches.test.js
// Everything runs in a temporary folder: a stand-in remote, a repository cloned from it, and a stand-in backup drive folder. The real
// repository is only read by the one --dry run, which writes nothing.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const B = require('../scripts/backup-branches');

const ROOT = path.join(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-branches-'));
// Windows can hold a new temp file for a moment (Defender): retry, then leave the folder rather than fail the run.
test.after(() => { try { fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch (e) { if (e.code !== 'EPERM' && e.code !== 'EBUSY') throw e; } });

const git = (repo, ...args) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'init.defaultBranch=master', '-C', repo, ...args], { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
const commit = (repo, file, text) => { fs.writeFileSync(path.join(repo, file), text); git(repo, 'add', file); git(repo, 'commit', '-q', '-m', 'add ' + file); return git(repo, 'rev-parse', 'HEAD'); };

// A remote with master, a clone, and in the clone: hindi (two commits on no remote), pushed (on the remote too), master one ahead.
function setup(name) {
  const base = path.join(TMP, name), remote = path.join(base, 'remote.git'), repo = path.join(base, 'repo');
  fs.mkdirSync(base, { recursive: true });
  execFileSync('git', ['init', '-q', '--bare', '-b', 'master', remote]);
  execFileSync('git', ['clone', '-q', remote, repo], { stdio: 'ignore' });
  commit(repo, 'a.txt', 'one'); git(repo, 'push', '-q', 'origin', 'master');
  git(repo, 'checkout', '-q', '-b', 'pushed'); commit(repo, 'p.txt', 'p'); git(repo, 'push', '-q', 'origin', 'pushed');
  git(repo, 'checkout', '-q', '-b', 'hindi', 'master'); commit(repo, 'h1.txt', 'h1'); commit(repo, 'h2.txt', 'h2');
  git(repo, 'checkout', '-q', 'master'); commit(repo, 'm.txt', 'unpushed');
  return { base, repo, to: path.join(base, 'drive', 'voidtv-git'), cache: path.join(base, 'cache') };
}
const at = (iso) => new Date(iso);

test('only the branches with commits on no remote are copied, with how many such commits', () => {
  const s = setup('which');
  const got = Object.fromEntries(B.localOnly(s.repo).map((b) => [b.name, b.ahead]));
  assert.deepEqual(got, { hindi: 2, master: 1 }, 'pushed is on the remote, so it is left out');
});

test('one bundle holds every such branch, is checked, brings them back with git clone, and writes the stamp in both places', () => {
  const s = setup('first');
  const r = B.backup({ repo: s.repo, to: s.to, cacheDir: s.cache, now: at('2026-11-21T08:30:00Z') });
  assert.equal(r.error, undefined);
  assert.equal(r.verified, true);
  assert.equal(r.file, 'branches-2026-11-21-083000.bundle');
  assert.ok(r.bytes > 0);
  assert.deepEqual(fs.readdirSync(s.to).sort(), [B.STAMP, r.file].sort(), 'no .part file is left behind');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(s.cache, B.STAMP), 'utf8')).branches, r.branches, 'the doctor reads the same stamp');
  const back = path.join(s.base, 'restored');
  execFileSync('git', ['clone', '-q', path.join(s.to, r.file), back], { stdio: 'ignore' });
  assert.equal(git(back, 'rev-parse', 'origin/hindi'), git(s.repo, 'rev-parse', 'hindi'), 'hindi comes back at its own commit');
  assert.equal(git(back, 'rev-parse', 'origin/master'), git(s.repo, 'rev-parse', 'master'), 'and master with its unpushed commit');
});

test('nothing new is written when no branch moved; a new commit makes a new bundle; only the newest ones stay', () => {
  const s = setup('again');
  const one = B.backup({ repo: s.repo, to: s.to, cacheDir: s.cache, keep: 2, now: at('2026-11-21T08:30:00Z') });
  const same = B.backup({ repo: s.repo, to: s.to, cacheDir: s.cache, keep: 2, now: at('2026-11-22T08:30:00Z') });
  assert.equal(same.unchanged, true);
  assert.equal(same.file, one.file, 'the stamp still names the first bundle');
  assert.equal(same.at, one.at, 'and its time');
  fs.writeFileSync(path.join(s.to, 'notes.txt'), 'Bryan\'s own file');
  git(s.repo, 'checkout', '-q', 'hindi'); commit(s.repo, 'h3.txt', 'h3');
  const two = B.backup({ repo: s.repo, to: s.to, cacheDir: s.cache, keep: 2, now: at('2026-11-23T08:30:00Z') });
  commit(s.repo, 'h4.txt', 'h4');
  const three = B.backup({ repo: s.repo, to: s.to, cacheDir: s.cache, keep: 2, now: at('2026-11-24T08:30:00Z') });
  assert.notEqual(two.file, one.file);
  assert.deepEqual(three.removed, [one.file], 'the oldest bundle goes');
  assert.deepEqual(fs.readdirSync(s.to).filter((n) => n.endsWith('.bundle')).sort(), [two.file, three.file]);
  assert.ok(fs.existsSync(path.join(s.to, 'notes.txt')), 'a file the script did not write is never removed');
});

test('a bundle that cannot be written leaves no part file and keeps the last good stamp', () => {
  const s = setup('fail');
  const good = B.backup({ repo: s.repo, to: s.to, cacheDir: s.cache, now: at('2026-11-21T08:30:00Z') });
  git(s.repo, 'checkout', '-q', 'hindi'); commit(s.repo, 'h3.txt', 'h3');
  fs.mkdirSync(path.join(s.to, 'branches-2026-11-22-083000.bundle.part', 'x'), { recursive: true }); // a folder where the file must go
  const bad = B.backup({ repo: s.repo, to: s.to, cacheDir: s.cache, now: at('2026-11-22T08:30:00Z') });
  assert.ok(bad.error, 'it says why');
  assert.equal(JSON.parse(fs.readFileSync(path.join(s.to, B.STAMP), 'utf8')).file, good.file);
  assert.equal(JSON.parse(fs.readFileSync(path.join(s.cache, B.STAMP), 'utf8')).file, good.file);
});

test('the command refuses a folder inside the repository and an unknown option, and --dry writes nothing', () => {
  const s = setup('cli');
  const run = (...args) => spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'backup-branches.js'), ...args], { encoding: 'utf8' });
  const inside = run('--repo', s.repo, '--to', path.join(s.repo, 'backup'));
  assert.equal(inside.status, 2);
  assert.match(inside.stderr, /inside the repository/);
  assert.ok(!fs.existsSync(path.join(s.repo, 'backup')));
  assert.equal(run('--repo', s.repo, '--to', s.to, '--now').status, 2);
  const dry = run('--repo', s.repo, '--dry');
  assert.equal(dry.status, 0);
  assert.match(dry.stdout, /Would copy 2 branches: .*hindi \(2 on no remote\)/);
  assert.ok(!fs.existsSync(s.to), 'nothing written');
  const ok = run('--repo', s.repo, '--to', s.to, '--cache', s.cache);
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /Done: 2 branches in .*checked/);
  assert.match(run('--repo', s.repo, '--to', s.to, '--cache', s.cache).stdout, /No branch moved since/);
});

test('a backup drive that is not plugged in is refused in plain words', (t) => {
  const letter = 'QRSTUVWXYZ'.split('').find((l) => !fs.existsSync(l + ':\\'));
  if (process.platform !== 'win32' || !letter) return t.skip('needs a drive letter that is not there');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'backup-branches.js'), '--to', letter + ':\\Backups\\voidtv-git'], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /backup drive .* is not there.*Plug it in/);
});
