// PUBLISH: commit whatever the builder has written to catalog/ and docs/ and push it, so the live
// site (Cloudflare Pages builds from master) catches up with the PC. Safe to run any time; does
// nothing when there is nothing new. Scheduled every two hours while hunts run (see docs/DEPLOY.md).
//
// What it will do and what it will refuse (audit of 18 Oct 2026: CP-013 CP-014 CP-015 CP-024 CF-006 CF-007 F-011):
//   * It stages and commits only its own paths (the profile's catalog folder, docs folder and list file),
//     by path. Anything else that is staged, or already committed on this PC, is never swept in.
//   * It only runs on master. On any other branch it logs one FAILED line and stops.
//   * It will not push while commits that publish did not make (subject not starting with "Catalog:")
//     are waiting to be pushed. It still makes its own commit, so the work is kept, and logs "held".
//     --allow-other-commits pushes them anyway.
//   * A push that fails is retried three times (10 s, 30 s, 90 s apart), each try with a time limit. If it
//     still fails, the commit stays local and the next run pushes it first, even when nothing new is staged.
//   * Before committing it refuses when the playable shows or episodes fell more than 10% against the last
//     published counts (kept in catalog/cache/publish-state.json), when a catalog .json file does not
//     parse, or when the staged diff adds an address-shaped or token-shaped string. --allow-shrink lets a
//     real shrink through.
//   * catalog/cache/publish.log is cut back to its last 1 MB whenever it grows past that.
// Every run ends with one dated line the doctor reads: "nothing new", "pushed <hash>: <message>",
// "refused: <reason>", "FAILED: <one line>" or "held: <n> other commits waiting: <subjects>".
// Usage: node scripts/publish.js [--allow-shrink] [--allow-other-commits] [--dry] [--root <folder>]
//   --dry         do everything except git commit and git push, and say what would happen
//   --root <dir>  work on that repository instead of this one (the tests use it); the catalog, docs and
//                 list paths move there with it
// Environment (for tests): PUBLISH_BACKOFF_MS="10000,30000,90000" waits between push tries,
// PUBLISH_PUSH_TIMEOUT_MS="240000" time limit for one push.
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const PROFILE = require('./lib/profile');
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const ALLOW_SHRINK = has('--allow-shrink'), ALLOW_OTHER = has('--allow-other-commits'), DRY = has('--dry');
const rootAt = argv.indexOf('--root');
if (rootAt >= 0 && (!argv[rootAt + 1] || argv[rootAt + 1].startsWith('--'))) { console.error('--root needs a folder'); process.exit(1); }
const ROOT = rootAt >= 0 ? path.resolve(argv[rootAt + 1]) : path.join(__dirname, '..');
// The profile module works out its paths from the script's own tree. With --root they are moved to the other tree
// before anything (assemble() included) reads them. Without --root nothing here changes.
if (rootAt >= 0) for (const k of ['catalogDir', 'docsDir', 'listFile']) PROFILE[k] = path.join(ROOT, path.relative(PROFILE.ROOT, PROFILE[k]));

const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
const CATALOG = rel(PROFILE.catalogDir);
const PATHS = [CATALOG, rel(PROFILE.docsDir), rel(PROFILE.listFile)].filter((p) => fs.existsSync(path.join(ROOT, p)));
// Hand-written drafts can live in docs/_drafts; they are never published (F-011).
const SPEC = [...PATHS, ':(exclude)' + rel(PROFILE.docsDir) + '/_drafts'];
const LOG = path.join(PROFILE.catalogDir, 'cache', 'publish.log');
const STATE = path.join(PROFILE.catalogDir, 'cache', 'publish-state.json');
const LOG_MAX = 1024 * 1024;
const BACKOFF = (process.env.PUBLISH_BACKOFF_MS || '10000,30000,90000').split(',').map((n) => Math.max(0, +n || 0));
const PUSH_TIMEOUT = +process.env.PUBLISH_PUSH_TIMEOUT_MS || 240000;
const OWN = /^Catalog: /;
const COUNTS = /^Catalog: (\d+) shows, (\d+) episodes/;
// Address-shaped and token-shaped text. An Archive file name can look like an address ("show@720p.mp4", or a stem such as
// "clip@Sessions.at.West54th.PBS.tv-vhs.XviD") and is the Archive's own public path, so what follows the @ must end in something that
// can be a top-level domain: two letters, or one of the common generic ones, and not a media extension. Keep in step with scripts/doctor.js.
const ADDR = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const MEDIA_END = new Set(['ts', 'mp4', 'm4v', 'mkv', 'avi', 'webm', 'ogv', 'ogg', 'mpg', 'mpeg', 'mov', 'wmv', 'flv', '3gp', 'divx', 'm2ts', 'vob', 'mp3', 'm4a', 'flac', 'wav']);
const GENERIC_TLD = new Set(['com', 'net', 'org', 'edu', 'gov', 'mil', 'int', 'info', 'biz', 'name', 'pro', 'mobi', 'asia', 'tel', 'travel', 'jobs', 'museum', 'aero', 'coop', 'xyz', 'online', 'site', 'app', 'dev', 'club', 'shop', 'store', 'blog', 'tech', 'live', 'news', 'email', 'cloud', 'world', 'today', 'top', 'vip', 'link', 'space', 'fun']);
const isTld = (s) => { const t = s.toLowerCase(); return !MEDIA_END.has(t) && (/^[a-z]{2}$/.test(t) || GENERIC_TLD.has(t)); };
const TOKEN = /(^|[^A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|TOKEN[ ]*=[ ]*["']?[A-Za-z0-9_.\/+=-]{8,}/;
// The same patterns for git's own diff search (extended regular expressions), used to find which files to look at.
const SEARCH = '(^|[^A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}|TOKEN[ ]*=[ ]*["\']?[A-Za-z0-9_./+=-]{8,}|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}';

const log = (m) => {
  const line = `${new Date().toISOString()} ${DRY ? 'dry: ' : ''}${m}`; console.log(line);
  try { fs.mkdirSync(path.dirname(LOG), { recursive: true }); fs.appendFileSync(LOG, line + '\n'); } catch (_) {}
};
const sleep = (ms) => { if (ms > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); };

// git, run without a shell so a commit message needs no quoting. Line-ending warnings are switched off (they could
// fill the log with thousands of lines), and the output limit is large for the same reason.
function git(args, timeout) {
  return execFileSync('git', ['-c', 'core.safecrlf=false', '-c', 'core.quotepath=off', ...args], {
    cwd: ROOT, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 512 * 1024 * 1024, timeout: timeout || 600000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  }).toString();
}
// The last three lines of a git error that are not line-ending warnings, on one line.
function why(e) {
  const text = (e && e.stderr && e.stderr.toString()) || (e && e.message) || String(e);
  const lines = text.split(/\r?\n/).map((s) => s.trim()).filter((l) => l && !/^(warning:|The file will have its original line endings)/i.test(l));
  return (lines.slice(-3).join(' | ') || 'unknown error').slice(0, 600);
}
const unstage = () => { try { git(['reset', '-q', '--', ...PATHS]); } catch (_) {} }; // only our own paths

function trimLog() {
  try {
    const size = fs.statSync(LOG).size; if (size <= LOG_MAX) return;
    const fd = fs.openSync(LOG, 'r'), buf = Buffer.alloc(LOG_MAX);
    fs.readSync(fd, buf, 0, LOG_MAX, size - LOG_MAX); fs.closeSync(fd);
    const s = buf.toString('utf8'), cut = s.indexOf('\n');
    fs.writeFileSync(LOG, cut >= 0 ? s.slice(cut + 1) : s); // drop the half line the cut left at the top
  } catch (_) {}
}

// Commits that are on this PC and not yet on origin/master, newest first.
function getAhead() {
  const out = git(['log', '--format=%h%x09%s', 'origin/master..HEAD']).trim();
  return out ? out.split('\n').map((l) => { const i = l.indexOf('\t'); return { hash: l.slice(0, i), subject: l.slice(i + 1).trim() }; }) : [];
}

function readState() {
  try { const s = JSON.parse(fs.readFileSync(STATE, 'utf8')); if (Number.isFinite(s.shows) && Number.isFinite(s.episodes)) return s; } catch (_) {}
  return null;
}
function writeState(shows, episodes, commit) {
  try { fs.mkdirSync(path.dirname(STATE), { recursive: true }); fs.writeFileSync(STATE, JSON.stringify({ shows, episodes, at: new Date().toISOString(), commit }, null, 1)); } catch (_) {}
}
// The counts the site last had. From publish-state.json; when that does not exist yet, from the newest
// "Catalog: N shows, M episodes" commit that is on origin/master (else on this branch), and written down.
function lastPublished() {
  const s = readState(); if (s) return s;
  for (const ref of ['origin/master', 'HEAD']) {
    let rows; try { rows = git(['log', ref, '--max-count=300', '--format=%h%x09%aI%x09%s']).trim().split('\n'); } catch (_) { continue; }
    for (const r of rows) {
      const [hash, at, ...subject] = r.split('\t'); const m = COUNTS.exec(subject.join('\t'));
      if (m) { if (!DRY) { try { fs.mkdirSync(path.dirname(STATE), { recursive: true }); fs.writeFileSync(STATE, JSON.stringify({ shows: +m[1], episodes: +m[2], at, commit: hash, seeded: true }, null, 1)); } catch (_) {} } return { shows: +m[1], episodes: +m[2], commit: hash }; }
    }
  }
  return null;
}

// True when the text holds an address-shaped string that is not a file name (the last dotted part after the @ decides).
function hasAddress(text) {
  for (const m of text.matchAll(ADDR)) {
    const run = /^[A-Za-z0-9.-]*/.exec(text.slice(m.index + m[0].indexOf('@') + 1))[0].replace(/\.+$/, '');
    if (isTld(run.split('.').pop())) return true;
  }
  return false;
}
// Staged files that would reach the public repository carrying an address or a token.
function leaks(files) {
  let candidates;
  try { candidates = git(['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR', '-G' + SEARCH, '--', ...SPEC]).split('\0').filter(Boolean); } catch (_) { candidates = files; }
  for (const f of candidates) {
    for (const line of git(['diff', '--cached', '-U0', '--no-color', '--', ':(literal)' + f]).split('\n')) {
      if (line[0] !== '+' || line.startsWith('+++')) continue;
      if (TOKEN.test(line)) return { file: f, what: 'token-shaped text' };
      if (hasAddress(line)) return { file: f, what: 'an address-shaped string' };
    }
  }
  return null;
}

// Push, with the other-commits check and the retries. Logs its own outcome line. Returns 'pushed', 'held', 'none' or 'failed'.
// "extra" counts a commit a dry run would have made.
function pushStep(counts, extra) {
  let ahead;
  try { ahead = getAhead(); } catch (e) { log('FAILED: cannot compare with origin/master: ' + why(e)); return 'failed'; }
  const others = ahead.filter((c) => !OWN.test(c.subject));
  if (others.length && !ALLOW_OTHER) {
    const names = others.slice(0, 5).map((c) => c.subject.slice(0, 70)).join(' | ') + (others.length > 5 ? ` | and ${others.length - 5} more` : '');
    log(`held: ${others.length} other commit${others.length === 1 ? '' : 's'} waiting: ${names} (not pushed; run with --allow-other-commits to push them with the catalog)`);
    return 'held';
  }
  if (!ahead.length && !extra) return 'none';
  if (DRY) { log(`would push ${ahead.length + (extra || 0)} commit${ahead.length + (extra || 0) === 1 ? '' : 's'} to origin/master`); return 'pushed'; }
  const tries = BACKOFF.length + 1; let last = '', ok = false;
  for (let i = 0; i < tries && !ok; i++) {
    try { git(['push', '-q', 'origin', 'master'], PUSH_TIMEOUT); ok = true; }
    catch (e) {
      last = why(e);
      if (/! \[rejected\]|non-fast-forward|fetch first/i.test(last)) { last = 'origin/master has moved on, pull or rebase by hand: ' + last; break; } // trying again cannot help
      if (i < tries - 1) { log(`push attempt ${i + 1} of ${tries} did not go through, trying again in ${Math.round(BACKOFF[i] / 1000)} s: ${last.slice(0, 200)}`); sleep(BACKOFF[i]); }
    }
  }
  if (!ok) { log(`FAILED: push to origin/master did not go through (${last})`); return 'failed'; }
  const head = git(['log', '-1', '--format=%h%x09%s']).trim().split('\t');
  log(`pushed ${head[0]}: ${head[1]}`);
  // The newest Catalog commit that just went out sets the counts the next shrink check compares against.
  const newest = ahead.find((c) => COUNTS.test(c.subject)), m = newest && COUNTS.exec(newest.subject);
  if (m) writeState(+m[1], +m[2], newest.hash); else if (counts) writeState(counts.shows, counts.eps, head[0]);
  return 'pushed';
}

function main() {
  trimLog();
  let branch;
  try { branch = git(['branch', '--show-current']).trim(); } catch (e) { log('FAILED: ' + why(e)); return 1; }
  if (branch !== 'master') { log(`FAILED: the checked-out branch is ${branch || 'no branch (detached HEAD)'}, publish only runs on master; nothing was staged or pushed`); return 1; }
  if (!PATHS.length) { log('nothing new'); return 0; }
  let ahead;
  try { ahead = getAhead(); } catch (e) { log('FAILED: cannot compare with origin/master: ' + why(e)); return 1; }
  const waiting = ahead.some((c) => OWN.test(c.subject)); // own commits from an earlier run whose push did not go through

  try { git(['add', '--', ...SPEC]); } catch (e) { unstage(); log('FAILED: ' + why(e)); return 1; }
  const changed = git(['diff', '--cached', '--name-only', '-z', '--', ...SPEC]).split('\0').filter(Boolean);
  if (!changed.length) {
    if (!waiting) { log('nothing new'); return 0; }
    return pushStep() === 'failed' ? 1 : 0; // nothing new to commit, but a commit is waiting to go out
  }
  // Each refusal puts the index back and still lets an older, already checked commit go out first.
  const refuse = (reason) => { unstage(); if (waiting && pushStep() === 'failed') return 1; log('refused: ' + reason); return 1; };

  for (const f of changed) { // a catalog file that does not parse would break the site build
    if (!f.startsWith(CATALOG + '/') || !/\.json$/i.test(f) || !fs.existsSync(path.join(ROOT, f))) continue;
    try { JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { return refuse(`${f} is not valid JSON (${String(e.message).slice(0, 100)})`); }
  }
  const { assemble } = require('./lib/app');
  const data = assemble();
  const shows = data.shows.length, eps = data.shows.reduce((n, s) => n + s.eps, 0);
  const before = lastPublished();
  if (before && !ALLOW_SHRINK) {
    const fell = (a, b) => a > 0 && (a - b) / a > 0.1;
    if (fell(before.shows, shows) || fell(before.episodes, eps)) return refuse(`shrink: shows ${before.shows} -> ${shows}, episodes ${before.episodes} -> ${eps}, more than 10% down (run with --allow-shrink if this is meant)`);
  }
  const leak = leaks(changed);
  if (leak) return refuse(`${leak.file} would add ${leak.what}; take it out before this is published`);

  const msg = `Catalog: ${shows} shows, ${eps} episodes (${changed.length} files)`;
  if (DRY) { log(`would commit ${changed.length} files: ${msg}`); unstage(); return pushStep(null, 1) === 'failed' ? 1 : 0; }
  try { git(['commit', '-q', '-m', msg, '--', ...SPEC]); } catch (e) { unstage(); log('FAILED: ' + why(e)); return 1; }
  return pushStep({ shows, eps }) === 'failed' ? 1 : 0;
}

try { process.exit(main()); } catch (e) {
  unstage();
  log('FAILED: ' + why(e));
  process.exit(1);
}
