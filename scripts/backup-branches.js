// BACKUP BRANCHES: an off-drive copy of every git branch that has commits on no remote (Bryan, 21 Nov 2026: "Yes, back it up",
// then "Do this task here"). The nightly backup-cache.js copies catalog/cache only, so git itself lived on this one drive, and
// branches such as hindi (never pushed as is: it carries the kids history with an Archive uploader's address), westside, kids and
// master's unpushed commits had no other copy.
//
// What it does: finds the local branches with at least one commit that no remote-tracking branch has, and writes ONE git bundle that
// holds all of them with their whole history, so that file alone brings them back. The bundle is written as <name>.part, checked
// (git bundle verify, and every branch at its own commit), and only then renamed. When no branch moved since the last bundle and
// that file is still there, nothing new is written. It keeps the newest 3 bundles and deletes older ones (each bundle is complete
// on its own). It never pushes, fetches or changes the repository.
//
// Where: --to <folder>, else a folder named voidtv-git beside the VOID_BACKUP_DIR folder in backend/.env (E:\Backups\voidtv-cache
// gives E:\Backups\voidtv-git). It refuses a folder inside this repository (the repo is published), and says so in plain words when
// the backup drive is not plugged in.
// Stamp: branches-stamp.json in that folder and in catalog/cache; the doctor's "branch-backup" light reads it.
//
// Bring the branches back by hand: git clone <bundle file> <new folder>, then git -C <new folder> branch -a lists them all.
//
// Usage: node scripts/backup-branches.js [--to <folder>] [--dry] [--keep <n>] [--repo <folder>] [--cache <folder>]
//   --dry            list the branches it would copy; write nothing
//   --keep <n>       how many bundles to keep (default 3)
//   --repo <folder>  another repository (the tests use it); default is this checkout
//   --cache <folder> where the doctor's copy of the stamp goes (the tests use it); default is this profile's catalog/cache
// Exit code: 0 done (or nothing new to copy), 1 the bundle could not be written or did not check out, 2 refused.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { envBackupDir, inside } = require('./backup-cache');

const ROOT = path.join(__dirname, '..');
const STAMP = 'branches-stamp.json';
const KEEP = 3;
const BUNDLE_RE = /^branches-\d{4}-\d{2}-\d{2}-\d{6}\.bundle$/;

const git = (repo, args) => execFileSync('git', ['-c', 'core.quotepath=off', '-C', repo, ...args], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, maxBuffer: 64 * 1024 * 1024 }).toString();

// The local branches with commits that no remote-tracking branch has: [{ name, sha, ahead, ageHours }]. ahead is how many such
// commits; ageHours is the age of the branch's newest commit. A remote that was not fetched lately can make a pushed branch look
// local; that only costs a copy it did not need.
function localOnly(repo, nowMs = Date.now()) {
  const out = [];
  for (const line of git(repo, ['for-each-ref', '--format=%(refname:short) %(objectname) %(committerdate:unix)', 'refs/heads']).split('\n')) {
    const [name, sha, t] = line.trim().split(' ');
    if (!name || !sha) continue;
    const ahead = +git(repo, ['rev-list', '--count', sha, '--not', '--remotes']).trim();
    if (ahead > 0) out.push({ name, sha, ahead, ageHours: Math.max(0, (nowMs - (+t) * 1000) / 36e5) });
  }
  return out;
}

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const tipsOf = (branches) => Object.fromEntries(branches.map((b) => [b.name, b.sha]));
const sameTips = (a, b) => { const ka = Object.keys(a || {}), kb = Object.keys(b || {}); return ka.length === kb.length && ka.every((k) => a[k] === b[k]); };
const stampName = (d) => d.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15).replace(/^(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');

function backup({ repo, to, cacheDir, keep = KEEP, dry, now = new Date(), log }) {
  const say = log || (() => {});
  const dst = path.resolve(to);
  const branches = localOnly(repo, now.getTime());
  const tips = tipsOf(branches);
  const out = { at: now.toISOString(), repo: path.resolve(repo), to: dst, branches: tips, ahead: Object.fromEntries(branches.map((b) => [b.name, b.ahead])), file: null, bytes: 0, verified: false, unchanged: false, dry: !!dry, removed: [] };
  if (dry) return out;
  fs.mkdirSync(dst, { recursive: true });
  const prev = readJson(path.join(dst, STAMP));
  const writeStamp = (s) => { const text = JSON.stringify(s, null, 1) + '\n'; fs.writeFileSync(path.join(dst, STAMP), text); if (cacheDir) { fs.mkdirSync(cacheDir, { recursive: true }); fs.writeFileSync(path.join(cacheDir, STAMP), text); } };
  if (!branches.length) { out.verified = true; writeStamp(out); return out; }
  if (prev && prev.file && prev.verified && sameTips(prev.branches, tips) && fs.existsSync(path.join(dst, prev.file))) {
    // Nothing moved: the last bundle still holds every branch as it is. Its time stays the time of that bundle; checked says when it was looked at.
    const s = { ...prev, checked: out.at, unchanged: true };
    writeStamp(s);
    return s;
  }
  const file = 'branches-' + stampName(now) + '.bundle';
  const tmp = path.join(dst, file + '.part');
  try {
    git(repo, ['bundle', 'create', tmp, ...branches.map((b) => 'refs/heads/' + b.name)]);
    git(repo, ['bundle', 'verify', tmp]);
    const heads = Object.fromEntries(git(repo, ['bundle', 'list-heads', tmp]).split('\n').filter(Boolean).map((l) => { const [sha, ref] = l.trim().split(' '); return [ref.replace(/^refs\/heads\//, ''), sha]; }));
    const wrong = branches.filter((b) => heads[b.name] !== b.sha).map((b) => b.name);
    if (wrong.length) throw new Error('the bundle does not hold ' + wrong.join(', ') + ' at its own commit');
    fs.renameSync(tmp, path.join(dst, file));
  } catch (e) {
    try { fs.rmSync(tmp, { force: true }); } catch (_) { /* nothing to remove */ }
    out.error = String((e.stderr && e.stderr.toString().trim()) || e.message).split('\n').slice(-2).join(' ').slice(0, 300);
    return out; // no stamp: the light keeps saying what the last good copy holds
  }
  out.file = file; out.bytes = fs.statSync(path.join(dst, file)).size; out.verified = true;
  // The newest `keep` bundles stay; the names sort by time. Only this script's own bundle names are ever removed.
  const all = fs.readdirSync(dst).filter((n) => BUNDLE_RE.test(n)).sort();
  for (const old of all.slice(0, Math.max(0, all.length - Math.max(1, keep)))) { try { fs.rmSync(path.join(dst, old)); out.removed.push(old); } catch (e) { say('  could not remove the old bundle ' + old + ': ' + e.message); } }
  writeStamp(out);
  return out;
}

function main(argv) {
  let to = '', repo = ROOT, cacheDir = '', keep = KEEP, dry = false;
  const bad = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = argv[i + 1];
    if (a === '--dry') dry = true;
    else if (a === '--to' && next && !next.startsWith('--')) to = argv[++i];
    else if (a === '--repo' && next && !next.startsWith('--')) repo = path.resolve(argv[++i]);
    else if (a === '--cache' && next && !next.startsWith('--')) cacheDir = path.resolve(argv[++i]);
    else if (a === '--keep' && /^[1-9]\d*$/.test(next || '')) keep = +argv[++i];
    else bad.push(a);
  }
  if (bad.length) { console.error('Refused: unknown or incomplete option ' + bad.map((b) => JSON.stringify(b)).join(', ') + '. Usage: node scripts/backup-branches.js [--to <folder>] [--dry] [--keep <n>]'); return 2; }
  if (!cacheDir) cacheDir = repo === ROOT ? path.join(require('./lib/profile').catalogDir, 'cache') : '';
  if (!dry) {
    if (!to) { const c = envBackupDir(); if (c) to = path.join(path.dirname(path.resolve(c)), 'voidtv-git'); }
    if (!to) { console.error('Refused: no destination. Give --to <folder>, or put VOID_BACKUP_DIR=<folder> in backend/.env (the branches go in a folder named voidtv-git beside it). A folder on another drive is best.'); return 2; }
    if (inside(to, repo) || inside(to, ROOT)) { console.error('Refused: ' + to + ' is inside the repository, which is published. Choose a folder outside it.'); return 2; }
    const drive = path.parse(path.resolve(to)).root;
    if (drive && !fs.existsSync(drive)) { console.error('Refused: the backup drive ' + drive + ' is not there, so no branch was copied. Plug it in and run: node scripts/backup-branches.js'); return 2; }
  }
  let r;
  try { r = backup({ repo, to: to || '.', cacheDir, keep, dry, log: (m) => console.log(m) }); }
  catch (e) { console.error('Refused: could not read the branches of ' + repo + ' (' + String(e.message).split('\n')[0] + ').'); return 2; }
  const names = Object.keys(r.branches);
  const list = names.map((n) => `${n} (${r.ahead[n] != null ? r.ahead[n] : '?'} on no remote)`).join(', ');
  if (dry) { console.log(names.length ? `Would copy ${names.length} branches: ${list}.` : 'No branch has commits that are only on this PC.'); return 0; }
  if (r.error) { console.error(`FAILED: no new bundle (${r.error}). The last good copy is unchanged.`); return 1; }
  if (!names.length) { console.log('No branch has commits that are only on this PC; nothing to copy. Stamp written.'); return 0; }
  if (r.unchanged) { console.log(`No branch moved since ${r.at}: ${r.file} in ${r.to} still holds all ${names.length} (${list}).`); return 0; }
  console.log(`Done: ${names.length} branches in ${path.join(r.to, r.file)} (${(r.bytes / 1e6).toFixed(1)} MB, checked): ${list}.`);
  if (r.removed.length) console.log(`Older bundles removed (the newest ${keep} stay): ${r.removed.join(', ')}.`);
  console.log(`Bring them back: git clone "${path.join(r.to, r.file)}" <new folder>`);
  return 0;
}

module.exports = { backup, localOnly, STAMP, KEEP };
if (require.main === module) process.exit(main(process.argv.slice(2)));
