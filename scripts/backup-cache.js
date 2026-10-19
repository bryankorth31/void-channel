// BACKUP CACHE: copies the part of catalog/cache that cannot be rebuilt cheaply to a folder you name (audit CP-012).
// catalog/cache is git-ignored, so nothing else keeps it. It holds the only copy of every TVmaze episode list, and match.js reads a
// missing TVmaze file as "TVmaze has no such show", so losing the folder can empty grids at the next publish. Only what is
// copied below is worth keeping; the big scrape files are the Archive's own pages and are fetched again when needed.
//
//   copied    tvmaze-*.json   TVmaze episode lists (2,438 files, 31.5 MB on 18 Oct 2026): the one that matters most
//             tmdb-*.json     TMDB lookups: shows, seasons, credits, people, keywords, ratings (34,831 files, 564 MB)
//             meta-*.json     Archive item metadata the hunts reuse (49,392 files, 1,779 MB)
//             together 86,661 files, 2.4 GB for the first copy
//   skipped   scrape-*, mscrape-*   Archive search pages (30,250 files, about 20 GB), and every log, health.json and sweep file
//
// Nothing is ever deleted at the destination: it only gains files, and a file is copied again only when it is new or its size or
// time differs, so the second run takes seconds. It refuses a destination inside this repository (the repo is published) or inside the
// cache itself. When it finishes it writes backup-stamp.json at the destination and at catalog/cache/backup-stamp.json; the doctor's
// "backup" light reads that (green under 7 days old, yellow older, red when there is none).
//
// Usage: node scripts/backup-cache.js [--to <folder>] [--only tvmaze,tmdb,meta] [--dry] [--from <folder>]
//   --to <folder>   where to copy. Without it the VOID_BACKUP_DIR key in backend/.env is used (only that key is read).
//   --only a,b      copy only these sets; `--only tvmaze` is the 32 MB essentials
//   --dry           count and size what would be copied; copy nothing and write no stamp
//   --from <folder> read another cache folder (the tests use it); default is this profile's catalog/cache
// Exit code: 0 done, 1 some files could not be copied (the rest were), 2 refused (bad option, no destination, unsafe destination).
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SETS = {
  tvmaze: /^tvmaze-.+\.json$/,
  tmdb: /^tmdb-.+\.json$/,
  meta: /^meta-.+\.json$/,
};
const SKIPPED = ['scrape-*', 'mscrape-*'];
const STAMP = 'backup-stamp.json';
const SAME_TIME_MS = 2000; // exFAT and FAT drives keep file times to 2 seconds

const norm = (p) => { const r = path.resolve(p); return process.platform === 'win32' ? r.toLowerCase() : r; };
const inside = (child, parent) => { const rel = path.relative(norm(parent), norm(child)); return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel)); };

// The VOID_BACKUP_DIR key from backend/.env, and nothing else from that file. Never printed.
function envBackupDir() {
  let text = ''; try { text = fs.readFileSync(path.join(ROOT, 'backend', '.env'), 'utf8'); } catch (e) { return ''; }
  const m = /^VOID_BACKUP_DIR=(.*)$/m.exec(text);
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
}

// Which of the folder's files each set copies. Returns { sets: { name: [file names] }, skipped: n }.
function plan(from, only) {
  const sets = Object.fromEntries(only.map((n) => [n, []]));
  let skipped = 0;
  for (const name of fs.readdirSync(from)) {
    const hit = only.find((n) => SETS[n].test(name));
    if (hit) sets[hit].push(name); else skipped++;
  }
  return { sets, skipped };
}

function backup({ from, to, only, dry, log }) {
  const say = log || (() => {});
  const src = path.resolve(from), dst = to ? path.resolve(to) : '';
  const { sets, skipped } = plan(src, only);
  const out = { at: new Date().toISOString(), from: src, to: dst, sets: {}, files: 0, bytes: 0, copied: 0, copiedBytes: 0, unchanged: 0, failed: 0, failedNames: [], dry: !!dry, skippedPatterns: SKIPPED, otherFilesLeftOut: skipped };
  if (!dry) fs.mkdirSync(dst, { recursive: true });
  let done = 0;
  for (const [setName, names] of Object.entries(sets)) {
    const s = out.sets[setName] = { files: 0, bytes: 0 };
    for (const name of names) {
      const a = path.join(src, name); let st;
      try { st = fs.statSync(a); if (!st.isFile()) continue; } catch (e) { continue; }
      s.files++; s.bytes += st.size; out.files++; out.bytes += st.size;
      if (dry) { out.copied++; out.copiedBytes += st.size; continue; }
      const b = path.join(dst, name);
      let same = false; try { const o = fs.statSync(b); same = o.size === st.size && o.mtimeMs >= st.mtimeMs - SAME_TIME_MS; } catch (e) { /* not there yet */ }
      if (same) { out.unchanged++; continue; }
      try {
        const tmp = b + '.part';
        fs.copyFileSync(a, tmp); fs.utimesSync(tmp, st.atime, st.mtime); fs.renameSync(tmp, b);
        out.copied++; out.copiedBytes += st.size;
      } catch (e) { out.failed++; if (out.failedNames.length < 5) out.failedNames.push(name); }
      if (++done % 5000 === 0) say(`  ${done} files copied so far`);
    }
  }
  if (!dry) {
    const text = JSON.stringify(out, null, 1) + '\n';
    fs.writeFileSync(path.join(dst, STAMP), text);
    fs.writeFileSync(path.join(src, STAMP), text);
  }
  return out;
}

function main(argv) {
  let to = '', from = '', only = Object.keys(SETS), dry = false;
  const bad = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = argv[i + 1];
    if (a === '--dry') dry = true;
    else if (a === '--to' && next && !next.startsWith('--')) to = argv[++i];
    else if (a === '--from' && next && !next.startsWith('--')) from = argv[++i];
    else if (a === '--only' && next && !next.startsWith('--')) { only = argv[++i].split(',').map((x) => x.trim()).filter(Boolean); const unk = only.filter((n) => !SETS[n]); if (unk.length) bad.push(`--only ${unk.join(',')} (known sets: ${Object.keys(SETS).join(', ')})`); }
    else bad.push(a);
  }
  if (bad.length) { console.error('Refused: unknown or incomplete option ' + bad.map((b) => JSON.stringify(b)).join(', ') + '. Usage: node scripts/backup-cache.js [--to <folder>] [--only tvmaze,tmdb,meta] [--dry] [--from <folder>]'); return 2; }
  if (!from) from = path.join(require('./lib/profile').catalogDir, 'cache');
  if (!dry) {
    if (!to) to = envBackupDir();
    if (!to) { console.error('Refused: no destination. Give --to <folder>, or put VOID_BACKUP_DIR=<folder> in backend/.env. A folder on another drive is best.'); return 2; }
    if (inside(to, ROOT)) { console.error('Refused: ' + to + ' is inside this repository, which is published. Choose a folder outside ' + ROOT + '.'); return 2; }
    if (inside(to, from) || inside(from, to)) { console.error('Refused: the destination and the cache folder must not contain each other.'); return 2; }
  }
  if (!fs.existsSync(from) || !fs.statSync(from).isDirectory()) { console.error('Refused: no cache folder at ' + from + '.'); return 2; }
  const mb = (n) => (n / 1e6).toFixed(1) + ' MB';
  console.log(`${dry ? 'Counting (nothing is copied)' : 'Backing up'} ${only.join(', ')} from ${from}${dry ? '' : ' to ' + to}`);
  const r = backup({ from, to, only, dry, log: (m) => console.log(m) });
  for (const [n, s] of Object.entries(r.sets)) console.log(`  ${n.padEnd(7)} ${String(s.files).padStart(7)} files  ${mb(s.bytes).padStart(10)}`);
  console.log(`  left out on purpose: ${SKIPPED.join(', ')} and ${r.otherFilesLeftOut} other files (logs, health.json, sweeps)`);
  if (dry) { console.log(`Would copy ${r.files} files, ${mb(r.bytes)} (the first run copies everything; later runs copy only what changed).`); return 0; }
  console.log(`Done: ${r.files} files, ${mb(r.bytes)} in the backup; copied ${r.copied} (${mb(r.copiedBytes)}), unchanged ${r.unchanged}, failed ${r.failed}${r.failed ? ' (e.g. ' + r.failedNames.join(', ') + ')' : ''}.`);
  console.log(`Stamp written to ${path.join(to, STAMP)} and ${path.join(from, STAMP)}.`);
  return r.failed ? 1 : 0;
}

module.exports = { backup, plan, SETS, SKIPPED, STAMP };
if (require.main === module) process.exit(main(process.argv.slice(2)));
