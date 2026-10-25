// Tests for scripts/backup-cache.js (audit CP-012) and the doctor lights that read its stamp and the catalog count.
// Run: node --test tests/backup-cache.test.js
// Everything happens in temporary folders: a made-up cache folder, a made-up destination, and (for the doctor) a made-up copy of the
// repository tools. The real catalog/cache and the real backend/.env are never read or written, and nothing reaches the network.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.join(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-test-'));
test.after(() => { fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); });
// The script runs from a copy inside a throwaway "repository", so its idea of the repo root and of backend/.env is ours to set:
// the real backend/.env is never read.
const BK = path.join(TMP, 'bk');
fs.mkdirSync(path.join(BK, 'scripts'), { recursive: true });
fs.copyFileSync(path.join(REPO, 'scripts', 'backup-cache.js'), path.join(BK, 'scripts', 'backup-cache.js'));
const SCRIPT = path.join(BK, 'scripts', 'backup-cache.js');

let n = 0;
const write = (dir, name, text) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, name), text); };
// A made-up cache folder: 3 TVmaze files, 2 TMDB, 2 metadata, 2 scrape (never copied), and a log.
function cache() {
  const dir = path.join(TMP, 'cache' + (++n));
  for (let i = 0; i < 3; i++) write(dir, `tvmaze-show-${i}.json`, JSON.stringify({ id: i, name: 'Show ' + i }));
  for (let i = 0; i < 2; i++) write(dir, `tmdb-tv-${i}.json`, JSON.stringify({ id: i }));
  write(dir, 'tmdb-keywords.json', '{}');
  for (let i = 0; i < 2; i++) write(dir, `meta-item-${i}.json`, JSON.stringify({ files: [i] }));
  write(dir, 'scrape-show-0.json', 'x'.repeat(5000));
  write(dir, 'mscrape-1234.json', 'x'.repeat(5000));
  write(dir, 'publish.log', 'log\n');
  write(dir, 'health.json', '{}');
  return dir;
}
const run = (args, env = {}) => { const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', env: { ...process.env, ...env } }); return { status: r.status, out: (r.stdout || '') + (r.stderr || '') }; };
const names = (d) => fs.readdirSync(d).sort();

test('copies the TVmaze, TMDB and metadata files, leaves the scrape files and logs, writes the stamp in both places', () => {
  const from = cache(), to = path.join(TMP, 'dest' + n);
  const r = run(['--from', from, '--to', to]);
  assert.equal(r.status, 0, r.out);
  assert.deepEqual(names(to), ['backup-stamp.json', 'meta-item-0.json', 'meta-item-1.json', 'tmdb-keywords.json', 'tmdb-tv-0.json', 'tmdb-tv-1.json', 'tvmaze-show-0.json', 'tvmaze-show-1.json', 'tvmaze-show-2.json']);
  assert.equal(fs.readFileSync(path.join(to, 'tvmaze-show-1.json'), 'utf8'), fs.readFileSync(path.join(from, 'tvmaze-show-1.json'), 'utf8'));
  const stamp = JSON.parse(fs.readFileSync(path.join(to, 'backup-stamp.json'), 'utf8'));
  assert.equal(stamp.files, 8); assert.equal(stamp.copied, 8); assert.equal(stamp.unchanged, 0); assert.equal(stamp.failed, 0);
  assert.ok(stamp.bytes > 0); assert.ok(Math.abs(Date.now() - new Date(stamp.at).getTime()) < 60000);
  assert.deepEqual(Object.keys(stamp.sets), ['tvmaze', 'tmdb', 'meta']);
  assert.equal(stamp.sets.tvmaze.files, 3);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(from, 'backup-stamp.json'), 'utf8')), stamp, 'the same stamp sits in the cache folder, where the doctor looks');
  assert.match(r.out, /scrape-\*, mscrape-\*/);
  assert.equal(fs.readdirSync(to).filter((f) => f.endsWith('.part')).length, 0);
});

test('a second run copies only what changed, never deletes, and keeps file times', () => {
  const from = cache(), to = path.join(TMP, 'dest' + n);
  assert.equal(run(['--from', from, '--to', to]).status, 0);
  const t0 = fs.statSync(path.join(to, 'tvmaze-show-0.json')).mtimeMs;
  assert.ok(Math.abs(t0 - fs.statSync(path.join(from, 'tvmaze-show-0.json')).mtimeMs) < 2000, 'times are kept so the next run can tell a file is unchanged');
  write(from, 'tvmaze-show-0.json', JSON.stringify({ id: 0, name: 'Show 0 changed and longer' }));
  write(from, 'tvmaze-show-9.json', '{}');
  fs.unlinkSync(path.join(from, 'meta-item-1.json')); // removed from the cache; the backup keeps its copy
  const r = run(['--from', from, '--to', to]);
  assert.equal(r.status, 0, r.out);
  const stamp = JSON.parse(fs.readFileSync(path.join(to, 'backup-stamp.json'), 'utf8'));
  assert.equal(stamp.copied, 2); assert.equal(stamp.unchanged, 6); assert.equal(stamp.files, 8); // files = what the cache holds in the copied sets now; the backup also keeps the one that was removed
  assert.equal(JSON.parse(fs.readFileSync(path.join(to, 'tvmaze-show-0.json'), 'utf8')).name, 'Show 0 changed and longer');
  assert.ok(fs.existsSync(path.join(to, 'meta-item-1.json')), 'nothing is ever deleted at the destination');
});

test('--only limits the sets, --dry counts and copies nothing and writes no stamp', () => {
  const from = cache(), to = path.join(TMP, 'dest' + n);
  const dry = run(['--from', from, '--dry']);
  assert.equal(dry.status, 0, dry.out);
  assert.match(dry.out, /tvmaze\s+3 files/); assert.match(dry.out, /Would copy 8 files/);
  assert.ok(!fs.existsSync(path.join(from, 'backup-stamp.json')));
  assert.equal(run(['--from', from, '--to', to, '--only', 'tvmaze']).status, 0);
  assert.deepEqual(names(to), ['backup-stamp.json', 'tvmaze-show-0.json', 'tvmaze-show-1.json', 'tvmaze-show-2.json']);
});

test('without --to the destination comes from VOID_BACKUP_DIR in backend/.env, and nothing else in that file is read or printed', () => {
  const from = cache(), to = path.join(TMP, 'envdest' + n);
  fs.mkdirSync(path.join(BK, 'backend'), { recursive: true });
  fs.writeFileSync(path.join(BK, 'backend', '.env'), `TMDB_READ_TOKEN=eyJsecretsecretsecret.secretsecretsecret\nVOID_BACKUP_DIR="${to}"\nCF_ANALYTICS_TOKEN=verysecretvalue\n`);
  try {
    const r = run(['--from', from]);
    assert.equal(r.status, 0, r.out);
    assert.ok(fs.existsSync(path.join(to, 'tvmaze-show-0.json')));
    assert.ok(!/secret/i.test(r.out), 'no other key from the file appears in the output');
    assert.ok(!r.out.includes('eyJ'));
    const given = path.join(TMP, 'envgiven' + n);
    assert.equal(run(['--from', from, '--to', given]).status, 0);
    assert.ok(fs.existsSync(path.join(given, 'tvmaze-show-0.json')), '--to wins over the file');
  } finally { fs.rmSync(path.join(BK, 'backend'), { recursive: true, force: true }); }
});

test('refuses: no destination, a destination inside the repository or the cache, unknown options, a missing cache folder', () => {
  const from = cache();
  const noDest = run(['--from', from]);   // no --to and no backend/.env in the throwaway repository
  assert.equal(noDest.status, 2); assert.match(noDest.out, /no destination/);
  const inRepo = run(['--from', from, '--to', path.join(BK, 'catalog', 'backup-test-should-not-exist')]);
  assert.equal(inRepo.status, 2); assert.match(inRepo.out, /inside this repository/);
  assert.ok(!fs.existsSync(path.join(BK, 'catalog')));
  const inCache = run(['--from', from, '--to', path.join(from, 'sub')]);
  assert.equal(inCache.status, 2); assert.match(inCache.out, /must not contain each other/);
  const ancestor = run(['--from', from, '--to', TMP]);
  assert.equal(ancestor.status, 2);
  const unk = run(['--from', from, '--to', path.join(TMP, 'x'), '--dryrun']);
  assert.equal(unk.status, 2); assert.match(unk.out, /unknown or incomplete option/);
  assert.equal(run(['--from', from, '--to', path.join(TMP, 'x'), '--only', 'scrape']).status, 2);
  assert.equal(run(['--from', path.join(TMP, 'missing'), '--to', path.join(TMP, 'x')]).status, 2);
  assert.equal(run(['--to']).status, 2);
});

test('a file that cannot be copied is counted, the rest are copied, and the exit code says so', () => {
  const from = cache(), to = path.join(TMP, 'dest' + n);
  fs.mkdirSync(to, { recursive: true });
  fs.mkdirSync(path.join(to, 'tvmaze-show-1.json.part')); // a folder where the temporary file goes: that one copy fails
  const r = run(['--from', from, '--to', to]);
  assert.equal(r.status, 1, r.out);
  const stamp = JSON.parse(fs.readFileSync(path.join(to, 'backup-stamp.json'), 'utf8'));
  assert.equal(stamp.failed, 1); assert.deepEqual(stamp.failedNames, ['tvmaze-show-1.json']); assert.equal(stamp.copied, 7);
  assert.ok(fs.existsSync(path.join(to, 'tvmaze-show-2.json')));
});

// ---- the doctor, in a throwaway copy of the tools ---------------------------------------------------------------------
test('the doctor: backup and shrink lights read the stamp and the counts', () => {
  const root = path.join(TMP, 'doctor-tree');
  for (const f of ['scripts/doctor.js', 'scripts/lib/profile.js', 'scripts/lib/tasks.js', 'scripts/lib/app.js', 'scripts/lib/app-fetch.js', 'scripts/lib/app-me.js', 'scripts/lib/tvgrid.js', 'scripts/lib/tvweek.js', 'scripts/lib/siteguards.js', 'player/tools/rank-sources.js']) { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.copyFileSync(path.join(REPO, f), path.join(root, f)); }
  write(path.join(root, 'scripts'), 'show-list.json', JSON.stringify({ types: ['Drama'], shows: [] }));
  const grid = (i) => ({ show: `T${i}`, slug: `t-${i}`, type: 'Drama', tvmaze: { id: i }, seasons: [{ season: 1, episodes: [1, 2].map((k) => ({ number: k, name: 'e', airdate: '2000-01-01', state: 'LIVE', alternates: [], file: { name: 'e', file: 'e.mp4', item: 'i' + i, url: 'https://archive.org/download/i/e.mp4', format: 'h.264', playable: true, seconds: 1800, sizeMB: 9, conf: 0.9 } })) }] });
  for (let i = 0; i < 10; i++) write(path.join(root, 'catalog', 'shows'), `t-${i}.json`, JSON.stringify(grid(i)));
  const doctor = () => {
    const e = { ...process.env }; delete e.VOID_PROFILE;
    spawnSync(process.execPath, [path.join(root, 'scripts', 'doctor.js'), '--quick'], { cwd: TMP, encoding: 'utf8', env: e });
    const h = JSON.parse(fs.readFileSync(path.join(root, 'catalog', 'cache', 'health.json'), 'utf8'));
    return Object.fromEntries(h.checks.map((x) => [x.id, x]));
  };
  const stamp = (daysAgo, more) => write(path.join(root, 'catalog', 'cache'), 'backup-stamp.json', JSON.stringify({ at: new Date(Date.now() - daysAgo * 864e5).toISOString(), files: 8, bytes: 1234, failed: 0, ...more }));
  let d = doctor();
  assert.equal(d.backup.level, 'red'); assert.equal(d.shrink.level, 'yellow');   // no stamp, no published count yet
  assert.ok(!d['site-guards'], 'the guards module is there');
  stamp(1);
  write(path.join(root, 'catalog', 'cache'), 'publish-state.json', JSON.stringify({ shows: 10, episodes: 20, at: 'x', commit: 'abc' }));
  d = doctor();
  assert.equal(d.backup.level, 'green'); assert.equal(d.shrink.level, 'green');
  assert.match(d.shrink.msg, /10 shows now, 10 at the last publish/);
  stamp(9); write(path.join(root, 'catalog', 'cache'), 'publish-state.json', JSON.stringify({ shows: 40, episodes: 80, at: 'x', commit: 'abc' }));
  d = doctor();
  assert.equal(d.backup.level, 'yellow'); assert.equal(d.shrink.level, 'red');
  assert.match(d.shrink.msg, /shows 40 -> 10/);
});

test('the doctor keeps working in a tree that lacks the guards module (it says so in a light)', () => {
  const root = path.join(TMP, 'doctor-bare');
  for (const f of ['scripts/doctor.js', 'scripts/lib/profile.js', 'scripts/lib/tasks.js', 'scripts/lib/app.js', 'scripts/lib/app-fetch.js', 'scripts/lib/app-me.js', 'scripts/lib/tvgrid.js', 'scripts/lib/tvweek.js', 'player/tools/rank-sources.js']) { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.copyFileSync(path.join(REPO, f), path.join(root, f)); }
  const e = { ...process.env }; delete e.VOID_PROFILE;
  spawnSync(process.execPath, [path.join(root, 'scripts', 'doctor.js'), '--quick'], { cwd: TMP, encoding: 'utf8', env: e });
  const h = JSON.parse(fs.readFileSync(path.join(root, 'catalog', 'cache', 'health.json'), 'utf8'));
  const by = Object.fromEntries(h.checks.map((x) => [x.id, x]));
  assert.equal(by['site-guards'].level, 'yellow');
  assert.ok(by.publish && by.catalog && by.addresses, 'the other lights are still there');
});
