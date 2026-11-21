// SOUND CHECK: find episodes that play with no sound in a browser and switch them to the Archive's own copy.
// Reads only the start of each file (ffprobe, nothing is downloaded or saved). See scripts/lib/sound.js.
//
//   node scripts/sound-check.js --slug dragon-tales --match     one show, then re-match it
//   node scripts/sound-check.js --all --match                   every show (hours; it remembers what it heard and can be stopped and run again)
//   node scripts/sound-check.js --all --limit 500               at most 500 files this run
//   add --alternates to check the backup copies too; set VOID_PROFILE=kids for the kids catalog.
//
// Writes catalog/sound-files.json (the swaps, in git) and catalog/cache/sound-checked.json (every file heard, not in git).
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const PROFILE = require('./lib/profile');
const { readCached, writeCached } = require('./lib/cachefile');
const S = require('./lib/sound');

const CAT = PROFILE.catalogDir;
const CACHE = path.join(CAT, 'cache');
const SHOWS = path.join(CAT, 'shows');
const SWAPS = path.join(CAT, 'sound-files.json');
const HEARD = path.join(CACHE, 'sound-checked.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
// Windows can hold a file for a moment (git add from the scheduled publish, a virus scan, HQ reading it): the rename then
// fails with EPERM or EBUSY. On 17 Nov that stopped the whole run before any show was re-matched. Try again for a while,
// and if it still fails, say so and carry on: what was heard is saved on the next try.
const busy = (e) => e && (e.code === 'EPERM' || e.code === 'EBUSY' || e.code === 'EACCES');
const pause = (ms) => { const end = Date.now() + ms; while (Date.now() < end) { /* a short wait between tries */ } };
function save(f, o) {
  const t = f + '.tmp';
  fs.writeFileSync(t, JSON.stringify(o, null, 1) + '\n');
  for (let i = 0; ; i++) {
    try { fs.renameSync(t, f); return true; } catch (e) {
      if (!busy(e)) throw e;
      if (i >= 20) { console.log(`Could not save ${path.basename(f)} (${e.code}, the file is held); trying again later.`); return false; }
      pause(500);
    }
  }
}

async function meta(id) {
  const cf = path.join(CACHE, 'meta-' + id.replace(/[^a-z0-9._-]/gi, '_') + '.json');
  const have = readCached(cf);
  if (have) return have;
  try {
    const res = await fetch('https://archive.org/metadata/' + encodeURIComponent(id), { signal: AbortSignal.timeout(60000), headers: { 'user-agent': 'voidtv-sound-check/1 (one call at a time)' } });
    const text = await res.text();
    if (!res.ok || !text.trim().startsWith('{')) return null;
    fs.mkdirSync(CACHE, { recursive: true }); writeCached(cf, text);
    await sleep(1000);
    return JSON.parse(text);
  } catch (e) { return null; }
}

async function main() {
  const argv = process.argv.slice(2);
  const at = argv.indexOf('--slug');
  const only = at >= 0 ? argv[at + 1] : null;
  const all = argv.includes('--all');
  const limit = argv.includes('--limit') ? +argv[argv.indexOf('--limit') + 1] || 0 : 0;
  if (!only && !all) { console.log('Say which: --slug <show> or --all'); process.exit(2); }
  const bin = S.ffprobePath();
  if (!bin) { console.log('ffprobe is not on this PC (install FFmpeg, or set FFPROBE to its path).'); process.exit(1); }
  const swaps = readJson(SWAPS, {});
  const heard = readJson(HEARD, {});
  const slugs = only ? [only] : fs.readdirSync(SHOWS).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
  const touched = new Set();
  let asked = 0, silent = 0, failed = 0;
  for (const slug of slugs) {
    const g = readJson(path.join(SHOWS, slug + '.json'), null);
    if (!g || !g.seasons) { if (only) console.log('No grid for ' + slug); continue; }
    const files = [];
    for (const se of g.seasons) for (const e of se.episodes || []) {
      if (e.state !== 'LIVE' && e.state !== 'REVIEW') continue;
      if (e.file) files.push(e.file);
      if (argv.includes('--alternates')) files.push(...(e.alternates || []));
    }
    let showSilent = 0;
    for (const f of files) {
      if (limit && asked >= limit) break;
      if (!f.item || !f.file || S.isTwin(f.file)) continue;
      const k = S.keyOf(f.item, f.file);
      if (swaps[k]) touched.add(slug); // switched before but the grid still plays the silent original (a run stopped before its re-match): re-match it now
      if (heard[k]) continue;
      const m = await meta(f.item);
      const twin = S.twinOf(m, f.file);
      if (!twin) { heard[k] = { audio: '?', twin: false, at: new Date().toISOString().slice(0, 10) }; continue; } // nothing to swap to; not worth a probe
      asked++;
      const audio = await S.probe(f.url, bin);
      if (!audio) { failed++; continue; } // could not be read now; asked again next run
      heard[k] = { audio, at: new Date().toISOString().slice(0, 10) };
      if (S.silentIn(audio)) { swaps[k] = { audio, twin: twin.name, twinMB: twin.mb, at: heard[k].at }; silent++; showSilent++; touched.add(slug); }
      if (asked % 25 === 0) { save(HEARD, heard); save(SWAPS, swaps); }
      await sleep(400);
    }
    if (showSilent) console.log(`${slug}: ${showSilent} silent ${showSilent === 1 ? 'copy' : 'copies'} switched to the Archive's own copy`);
    if (limit && asked >= limit) break;
  }
  fs.mkdirSync(CACHE, { recursive: true }); save(HEARD, heard); save(SWAPS, swaps);
  console.log(`\nHeard ${asked} files: ${silent} silent in a browser, ${failed} could not be read (asked again next run). ${Object.keys(swaps).length} swaps in ${path.relative(PROFILE.ROOT, SWAPS)}.`);
  if (argv.includes('--match') && touched.size) {
    for (const slug of touched) {
      console.log('Re-matching ' + slug);
      spawnSync(process.execPath, [path.join(__dirname, 'match.js'), '--slug', slug], { stdio: 'inherit', env: process.env, windowsHide: true });
    }
  } else if (touched.size) console.log('Run node scripts/match.js --slug <show> for: ' + [...touched].join(', '));
}
if (require.main === module) main();
