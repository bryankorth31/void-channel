// MATCH DRY RUN: proves what the matcher changes by running the old and the new match.js over the whole list, read-only.
//
//   node tests/match-dryrun.js --catalog <catalog folder> --before <old match.js> [--out <report file>]
//        [--after <other new match.js>] [--only <slug>] [--no-top] [--no-repeat] [--no-before]
//
//   --catalog    the catalog to read (candidates/, cache/, shows/, overrides.json). Nothing in it is ever written.
//   --before     a copy of the old matcher:  git show master:scripts/match.js > <temp file>
//   --out        also save the report to this file
//   --after      run this file as the new matcher instead of scripts/match.js (for trying a rule on and off)
//   --only       run one show (by slug) instead of the whole list
//   --no-top     skip the "100 biggest shows" table
//   --no-repeat  skip the second pass of the new matcher (the one that proves a repeat run writes nothing)
//   --no-before  skip the old matcher entirely (quick runs while trying a rule)
//
// Safety: before either version loads, every path that can change a file (write, append, mkdir, unlink, rename, copy, open for
// writing, streams, the promise versions) is replaced by a stand-in that does not touch the disk, child processes cannot start, and
// fetch, http, https and net cannot connect. The stand-in for a write keeps the text in memory and reads see it, so a second pass
// behaves as if the first had really written its grids; the memory is emptied before each version's first pass. The harness's own
// report file is the one thing it writes, through a reference to the real write saved before the stand-ins went in.
// Both versions run through matchShow(), so a grid the new matcher decides not to write is still counted.
const realFs = require('fs');
const path = require('path');
const Module = require('module');
const os = require('os');

const writeReport = realFs.writeFileSync.bind(realFs);

// ---------------------------------------------------------------- arguments
const argv = process.argv.slice(2);
const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const flag = (name) => argv.includes(name);
const WATCH = (arg('--watch') || 'naruto shippuden,monster jam,body language guy,unsolved mysteries iceberg').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const catalogArg = arg('--catalog'), beforeArg = arg('--before'), outArg = arg('--out'), afterArg = arg('--after'), onlySlug = arg('--only');
if (!catalogArg || (!beforeArg && !flag('--no-before'))) { console.error('usage: node tests/match-dryrun.js --catalog <catalog folder> --before <old match.js> [--out <file>] [--after <file>] [--only <slug>] [--no-top] [--no-repeat] [--no-before]'); process.exit(2); }
const CATALOG = path.resolve(catalogArg);
for (const d of ['candidates', 'cache', 'shows']) if (!realFs.existsSync(path.join(CATALOG, d))) { console.error('not a catalog folder (no ' + d + '/): ' + CATALOG); process.exit(2); }
const SCRIPTS = path.join(__dirname, '..', 'scripts');

// ---------------------------------------------------------------- the guards
const attempts = { writes: 0, network: 0, spawns: 0, byName: {} };
const note = (name) => { attempts.writes++; attempts.byName[name] = (attempts.byName[name] || 0) + 1; };
const overlay = new Map(), deleted = new Set(); // what the stand-in writes would have put on disk
const keyOf = (p) => path.resolve(String(p));
const realReadFileSync = realFs.readFileSync, realExistsSync = realFs.existsSync, realOpenSync = realFs.openSync, realOpen = realFs.open;
for (const n of ['appendFileSync', 'mkdirSync', 'rmSync', 'rmdirSync', 'renameSync', 'copyFileSync', 'truncateSync', 'utimesSync', 'chmodSync', 'symlinkSync', 'cpSync', 'mkdtempSync']) {
  realFs[n] = function () { note(n); return n === 'mkdtempSync' ? path.join(os.tmpdir(), 'blocked') : undefined; };
}
realFs.writeFileSync = function (file, data) { note('writeFileSync'); if (typeof file === 'string') { overlay.set(keyOf(file), String(data)); deleted.delete(keyOf(file)); } };
realFs.unlinkSync = function (file) { note('unlinkSync'); if (typeof file === 'string') { deleted.add(keyOf(file)); overlay.delete(keyOf(file)); } };
realFs.readFileSync = function (file, enc) {
  if (typeof file === 'string') {
    const k = keyOf(file);
    if (deleted.has(k)) { const e = new Error("ENOENT: no such file or directory, open '" + file + "'"); e.code = 'ENOENT'; throw e; }
    if (overlay.has(k)) return (typeof enc === 'string' || (enc && enc.encoding)) ? overlay.get(k) : Buffer.from(overlay.get(k));
  }
  return realReadFileSync.apply(realFs, arguments);
};
realFs.existsSync = function (file) { if (typeof file === 'string') { const k = keyOf(file); if (deleted.has(k)) return false; if (overlay.has(k)) return true; } return realExistsSync.apply(realFs, arguments); };
for (const n of ['writeFile', 'appendFile', 'mkdir', 'unlink', 'rm', 'rmdir', 'rename', 'copyFile', 'truncate', 'utimes', 'chmod', 'symlink', 'cp', 'createWriteStream']) {
  realFs[n] = function () { note(n); const cb = [...arguments].find((a) => typeof a === 'function'); if (cb) process.nextTick(cb, null); };
}
const writes = (flags) => typeof flags === 'string' && /[wa+]/.test(flags);
realFs.openSync = function (p, flags) { if (writes(flags)) { note('openSync(write)'); throw new Error('dry run: write blocked'); } return realOpenSync.apply(realFs, arguments); };
realFs.open = function (p, flags) { if (writes(flags)) { note('open(write)'); throw new Error('dry run: write blocked'); } return realOpen.apply(realFs, arguments); };
for (const n of ['writeFile', 'appendFile', 'mkdir', 'unlink', 'rm', 'rmdir', 'rename', 'copyFile', 'truncate', 'utimes', 'chmod', 'symlink', 'cp']) realFs.promises[n] = async () => { note('promises.' + n); };
const blockNet = (what) => function () { attempts.network++; throw new Error('dry run: network blocked (' + what + ')'); };
globalThis.fetch = blockNet('fetch');
for (const m of ['http', 'https']) { const mod = require(m); mod.request = blockNet(m + '.request'); mod.get = blockNet(m + '.get'); }
{ const net = require('net'); net.connect = blockNet('net.connect'); net.createConnection = blockNet('net.createConnection'); const tls = require('tls'); tls.connect = blockNet('tls.connect'); }
{ const cp = require('child_process'); for (const n of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) cp[n] = function () { attempts.spawns++; throw new Error('dry run: process start blocked (' + n + ')'); }; }

// ---------------------------------------------------------------- point the matcher at the chosen catalog
const PROFILE = require(path.join(SCRIPTS, 'lib', 'profile.js'));
PROFILE.catalogDir = CATALOG;
const besideList = path.join(path.dirname(CATALOG), 'scripts', 'show-list.json'); // the list that belongs to that catalog, when it sits beside it
if (realFs.existsSync(besideList)) PROFILE.listFile = besideList;
const LIST = JSON.parse(realFs.readFileSync(PROFILE.listFile, 'utf8'));
const SHOWS_DIR = path.join(CATALOG, 'shows');

// Compile a matcher from source under a virtual name inside scripts/ (so ./lib/... resolves); nothing is written.
function compile(src, name) {
  const file = path.join(SCRIPTS, name);
  const m = new Module(file, module);
  m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file));
  m._compile(src, file);
  return m.exports;
}
const AFTER = afterArg ? compile(realFs.readFileSync(path.resolve(afterArg), 'utf8'), '__after_match__.js') : require(path.join(SCRIPTS, 'match.js')); // match.js does not run its own main() when required
const slugOf = AFTER.slug;
// The old matcher runs main() as soon as it loads, so its last line is swapped for an export; everything else is untouched.
const BEFORE = flag('--no-before') ? null : (() => {
  const src = realFs.readFileSync(path.resolve(beforeArg), 'utf8');
  if (!/\nmain\(\);\s*$/.test(src)) throw new Error('--before file does not end with main(); is it the old scripts/match.js?');
  return compile(src.replace(/\nmain\(\);\s*$/, '\nmodule.exports = { matchShow, namesOtherShow, otherShowCores };\n'), '__before_match__.js');
})();

// ---------------------------------------------------------------- helpers
const canon = (x) => {
  if (Array.isArray(x)) return x.map(canon);
  if (x && typeof x === 'object') { const o = {}; for (const k of Object.keys(x).sort()) if (x[k] !== undefined) o[k] = canon(x[k]); return o; }
  return x;
};
const same = (a, b) => { const A = { ...a }, B = { ...b }; for (const k of ['matchedAt', 'addedAt']) { delete A[k]; delete B[k]; } return JSON.stringify(canon(A)) === JSON.stringify(canon(B)); };
const SE_TITLE = /S\/E in filename \+ title match/;
const ADDRESS = /[\p{L}\p{N}._%+\-]+@[\p{L}\p{N}\-]+(?:\.[\p{L}\p{N}\-]+)+/gu; // anything address-shaped in a grid, which the publish guard would refuse
const fmt = (n) => Number(n).toLocaleString('en-US');
const pad = (s, n) => String(s).padEnd(n), lpad = (s, n) => String(s).padStart(n);
const secs = (ms) => (ms / 1000).toFixed(1) + ' s';
const progress = (label, i, n) => { if (i % 2000 === 0) process.stderr.write('  ' + label + ' ' + i + '/' + n + '\n'); };
const whyType = (why) => /^self-listed/.test(why) ? 'self-listed (order from files)' : /^sequence guess/.test(why) ? 'sequence guess' : /^absolute episode/.test(why) ? 'absolute episode number' : /^airdate/.test(why) ? 'airdate in name' : SE_TITLE.test(why) ? 'S/E + title match' : /^S\/E in filename/.test(why) ? 'S/E in name only' : /^title ~/.test(why) ? 'title similarity only' : 'other';

// ---------------------------------------------------------------- one pass over the list
function runPass(label, mod, shipped, { keepOverlay = false } = {}) {
  if (!keepOverlay) { overlay.clear(); deleted.clear(); }
  const t0 = Date.now(), snap = { ...attempts.byName };
  const shows = new Map(), eps = new Map(), picks = [], errors = [], types = new Map(), watch = new Map(WATCH.map((w) => [w, 0])), drops = []; // drops: grids the matcher says it removed or emptied (the old matcher says nothing)
  let identical = 0, compared = 0, ran = 0, addresses = 0;
  const entries = LIST.shows.filter((e) => !onlySlug || slugOf(e.name) === onlySlug);
  entries.forEach((entry, i) => {
    progress(label, i, entries.length);
    let r;
    try { r = mod.matchShow(entry, drops); } catch (e) { errors.push(entry.name + ': ' + e.message); return; }
    if (!r) return;
    ran++;
    if (!r.noTvmaze) addresses += (JSON.stringify(r).match(ADDRESS) || []).length;
    const slug = slugOf(entry.name);
    const sh = shipped.get(slug);
    if (sh && !r.noTvmaze) { compared++; if (same(r, sh)) identical++; }
    const s = { slug, show: entry.name, noTvmaze: !!r.noTvmaze, selfListed: !!r.selfListed, weak: !!r.tvmazeWeak, placed: 0, live: 0, review: 0, seA: 0, seB: 0 };
    if (!r.noTvmaze) {
      const cores = [AFTER.norm(entry.name).replace(/^the /, ''), ...(AFTER.BUILTIN_ALIASES ? (AFTER.BUILTIN_ALIASES[slug] || []).map(AFTER.norm) : [])];
      for (const se of r.seasons) for (const e of se.episodes) {
        if (!e.file) continue;
        s.placed++;
        if (e.state === 'LIVE') s.live++; else s.review++;
        const t = whyType(e.file.why || ''), rec = types.get(t) || { n: 0, unnamed: 0 };
        rec.n++; if (!(AFTER.namesTitle ? AFTER.namesTitle(e.file.itemTitle || '', cores) : cores.some((c) => AFTER.norm(e.file.itemTitle || '').includes(c)))) rec.unnamed++;
        { const nt = AFTER.norm(e.file.itemTitle || ''); for (const w of WATCH) if (nt.includes(w)) watch.set(w, watch.get(w) + 1); }
        types.set(t, rec);
        if (r.selfListed) continue;
        eps.set(slug + '|' + se.season + 'x' + e.number, { conf: e.file.conf, name: e.file.name, state: e.state });
        picks.push({ slug, show: entry.name, name: e.file.name, conf: e.file.conf, state: e.state, why: e.file.why });
        if (e.state === 'REVIEW' && SE_TITLE.test(e.file.why || '')) { s.seA++; if (e.file.playable && !e.file.langRisk && e.file.conf < 0.85) s.seB++; }
      }
    }
    shows.set(slug, s);
  });
  const w = {}; for (const k of Object.keys(attempts.byName)) w[k] = attempts.byName[k] - (snap[k] || 0);
  return { label, shows, eps, picks, errors, ran, identical, compared, addresses, types, watch, drops, ms: Date.now() - t0, writes: w };
}

function totals(p) {
  const t = { grids: 0, placed: 0, strictPlaced: 0, fbEps: 0, fbGrids: 0, weakGrids: 0, weakEps: 0, noTvGrids: 0, noTvEps: 0, markers: 0, live: 0, review: 0, seA: 0, seB: 0 };
  for (const s of p.shows.values()) {
    if (s.noTvmaze) { t.markers++; continue; }
    t.grids++; t.placed += s.placed; t.live += s.live; t.review += s.review;
    if (s.selfListed) { t.fbGrids++; t.fbEps += s.placed; if (s.weak) { t.weakGrids++; t.weakEps += s.placed; } else { t.noTvGrids++; t.noTvEps += s.placed; } }
    else { t.strictPlaced += s.placed; t.seA += s.seA; t.seB += s.seB; }
  }
  return t;
}

// ---------------------------------------------------------------- read the shipped grids once (read-only)
function readShipped() {
  const m = new Map(); let newest = 0, count = 0;
  for (const f of realFs.readdirSync(SHOWS_DIR)) {
    if (!f.endsWith('.json')) continue;
    const p = path.join(SHOWS_DIR, f);
    newest = Math.max(newest, realFs.statSync(p).mtimeMs); count++;
    try { m.set(f.slice(0, -5), JSON.parse(realFs.readFileSync(p, 'utf8'))); } catch (e) { /* unreadable: left out */ }
  }
  return { grids: m, newest, count };
}
const shippedBefore = readShipped();
const placedIn = (g) => (g && g.seasons ? g.seasons.reduce((n, se) => n + se.episodes.filter((e) => e.file).length, 0) : 0);

// ---------------------------------------------------------------- run
const EMPTY = { label: 'skipped', shows: new Map(), eps: new Map(), picks: [], errors: [], ran: 0, identical: 0, compared: 0, addresses: 0, watch: new Map(WATCH.map((w) => [w, 0])), types: new Map(), ms: 0, writes: {} };
let B = EMPTY;
if (BEFORE) { console.error('before pass...'); B = runPass('before', BEFORE, shippedBefore.grids); }
console.error('after pass...');
const A = runPass('after', AFTER, shippedBefore.grids);
let A2 = null;
if (!flag('--no-repeat')) { console.error('after pass again (a repeat run)...'); A2 = runPass('after again', AFTER, shippedBefore.grids, { keepOverlay: true }); }
const tB = totals(B), tA = totals(A);
const gridWrites = (p) => (p.writes && p.writes.writeFileSync) || 0;

// ---------------------------------------------------------------- wrong-show protection: picks the old detector flagged and the new one does not
const lost = new Map(), lostExamples = new Map(); let lostPicks = 0, gainedFlags = 0;
const lostClass = { 'inside a longer word': 0, 'one-word or short title': 0, 'same show or family (alias)': 0, 'title holds a Season/quality word': 0 };
if (BEFORE) {
  console.error('protection check...');
  const overridesAll = (() => { try { return JSON.parse(realFs.readFileSync(path.join(CATALOG, 'overrides.json'), 'utf8')); } catch (e) { return {}; } })();
  const aliasesFor = (show) => [...((overridesAll[slugOf(show)] || {}).aliases || []), ...((AFTER.BUILTIN_ALIASES || {})[slugOf(show)] || [])].map(AFTER.norm).filter(Boolean);
  for (const p of A.picks) {
    const oldCores = BEFORE.otherShowCores(p.name, p.show);
    const newFlag = AFTER.namesOtherShow(p.name, p.show, aliasesFor(p.show));
    if (oldCores.length && !newFlag) {
      lostPicks++;
      const t = ' ' + AFTER.norm(p.name) + ' ';
      for (const c of oldCores) {
        const cls = !t.includes(' ' + c + ' ') ? 'inside a longer word' : (c.split(' ').length < 2 || c.replace(/[^a-z]/g, '').length < 6) ? 'one-word or short title' : AFTER.OTHER_SHOWS.some((o) => o.core === c) ? 'same show or family (alias)' : 'title holds a Season/quality word';
        lostClass[cls]++;
        const rec = lost.get(c) || { n: 0, cls }; rec.n++; lost.set(c, rec);
        if (!lostExamples.has(c)) lostExamples.set(c, p.show + ' <- ' + p.name.slice(0, 70));
      }
    } else if (!oldCores.length && newFlag) gainedFlags++;
  }
}

// ---------------------------------------------------------------- per-episode movement in strict grids
let gained = 0, lostEps = 0, confUp = 0, confDown = 0, fileChanged = 0, liveUp = 0, liveDown = 0;
for (const [k, b] of B.eps) {
  const a = A.eps.get(k);
  if (!a) { lostEps++; continue; }
  if (a.conf > b.conf) confUp++; else if (a.conf < b.conf) confDown++;
  if (a.name !== b.name) fileChanged++;
  if (a.state === 'LIVE' && b.state !== 'LIVE') liveUp++; else if (a.state !== 'LIVE' && b.state === 'LIVE') liveDown++;
}
if (BEFORE) for (const k of A.eps.keys()) if (!B.eps.has(k)) gained++;

// ---------------------------------------------------------------- the report
const out = [];
const say = (s = '') => { out.push(s); console.log(s); };
const row = (label, b, a, extra = '') => say(pad(label, 62) + lpad(typeof b === 'number' ? fmt(b) : b, 11) + lpad(typeof a === 'number' ? fmt(a) : a, 11) + (typeof b === 'number' && typeof a === 'number' ? lpad((a - b >= 0 ? '+' : '') + fmt(a - b), 11) : lpad('', 11)) + (extra ? '   ' + extra : ''));
const pct = (b, a) => (b ? (((a - b) / b) * 100).toFixed(1) + '%' : '');
const kind = (s) => !s || s.noTvmaze ? 'no grid' : s.selfListed ? (s.weak ? 'self-listed over TVmaze' : 'self-listed, no TVmaze') : 'strict';

say('MATCH DRY RUN  ' + new Date().toISOString());
say('catalog: ' + CATALOG + '   list: ' + PROFILE.listFile + ' (' + LIST.shows.length + ' shows)');
say('before: ' + (beforeArg ? path.resolve(beforeArg) : '(skipped)') + '   after: ' + (afterArg ? path.resolve(afterArg) : 'scripts/match.js in this worktree'));
say('guards: ' + attempts.writes + ' write attempts caught and kept in memory, ' + attempts.network + ' network attempts, ' + attempts.spawns + ' process starts; ' + JSON.stringify(attempts.byName));
{
  let newest = 0, count = 0;
  for (const f of realFs.readdirSync(SHOWS_DIR)) { if (!f.endsWith('.json')) continue; newest = Math.max(newest, realFs.statSync(path.join(SHOWS_DIR, f)).mtimeMs); count++; }
  say('real catalog/shows: ' + shippedBefore.count + ' files, newest ' + new Date(shippedBefore.newest).toISOString() + '; after all passes ' + count + ' files, newest ' + new Date(newest).toISOString() + (newest === shippedBefore.newest && count === shippedBefore.count ? '  (unchanged)' : '  (CHANGED, investigate)'));
}
say();
say('TIMING AND WRITES');
say('  before pass ' + secs(B.ms) + ', after pass ' + secs(A.ms) + (A2 ? ', after pass again ' + secs(A2.ms) : '') + '   (shows with candidates: ' + B.ran + ' and ' + A.ran + ')');
say('  failures: before ' + B.errors.length + ', after ' + A.errors.length + (A.errors.length ? '  e.g. ' + A.errors.slice(0, 3).join(' | ') : ''));
if (BEFORE) say('  harness check: the old matcher reproduced ' + B.identical + ' of ' + B.compared + ' shipped grids exactly (ignoring matchedAt and addedAt)');
say('  address-shaped strings in the grids it built: before ' + B.addresses + ', after ' + A.addresses + (A.addresses === 0 ? '  (none reaches a grid)' : '  (EXPECTED 0, investigate)'));
say('  grid files written in one run: before ' + gridWrites(B) + ' (every grid, every run, including self-lists it then threw away)');
say('                                 after  ' + gridWrites(A) + ' (grids whose content differs from the shipped file; first run after the change)');
if (A2) say('                                 after, run again on the result: ' + gridWrites(A2) + (gridWrites(A2) === 0 ? '  (a repeat run writes nothing)' : '  (EXPECTED 0, investigate)'));
say('  ' + A.compared + ' grids compared with the shipped files: ' + A.identical + ' identical, ' + (A.compared - A.identical) + ' differ in content');
say();
say(pad('HEADLINE', 62) + lpad('before', 11) + lpad('after', 11) + lpad('change', 11));
row('Shows listed with a grid', tB.grids, tA.grids);
row('Shows with no grid (no TVmaze list and nothing to self-list)', tB.markers, tA.markers);
row('Placed episodes, all grids', tB.placed, tA.placed);
row('  from strict (TVmaze) grids', tB.strictPlaced, tA.strictPlaced);
row('  from self-listed (fallback) grids', tB.fbEps, tA.fbEps, pct(tB.fbEps, tA.fbEps));
row('    self-listed grids over a real TVmaze list (tvmazeWeak)', tB.weakGrids, tA.weakGrids);
row('    their episodes', tB.weakEps, tA.weakEps, pct(tB.weakEps, tA.weakEps));
row('    self-listed grids with no TVmaze list', tB.noTvGrids, tA.noTvGrids);
row('    their episodes', tB.noTvEps, tA.noTvEps, pct(tB.noTvEps, tA.noTvEps));
row('LIVE episodes', tB.live, tA.live);
row('REVIEW episodes', tB.review, tA.review);
row('REVIEW picks with S/E in the name plus a title match', tB.seA, tA.seA, '(the 4,687 class)');
row('  of those playable, not language-flagged, below 0.85', tB.seB, tA.seB, '(the 4,516 class)');
say();
say('HOW PICKS WERE PLACED (all grids): picks, and how many come from an upload whose title does not name the show');
say('  ' + pad('', 30) + lpad('before', 9) + lpad('no name', 9) + lpad('after', 9) + lpad('no name', 9));
for (const t of [...new Set([...B.types.keys(), ...A.types.keys()])].sort()) {
  const b = B.types.get(t) || { n: 0, unnamed: 0 }, a = A.types.get(t) || { n: 0, unnamed: 0 };
  say('  ' + pad(t, 30) + lpad(fmt(b.n), 9) + lpad(fmt(b.unnamed), 9) + lpad(fmt(a.n), 9) + lpad(fmt(a.unnamed), 9));
}
say();
say('WATCHED UPLOADS (placed files whose item title contains the phrase; known wrong-show offenders, should be 0 after)');
for (const w of WATCH) say('  ' + pad(w, 34) + lpad(fmt(B.watch.get(w)), 8) + lpad(fmt(A.watch.get(w)), 8));
say();
{
  const dr = A.drops || [];
  say('GRIDS THE FIRST RUN AFTER THE CHANGE REMOVES OR EMPTIES (one log line each; the COVERAGE.md section and catalog/cache/match-dropped.json hold the same list): ' + dr.length + ' shows, ' + fmt(dr.reduce((n, d) => n + d.episodes, 0)) + ' episodes they had');
  for (const d of [...dr].sort((x, y) => y.episodes - x.episodes || x.show.localeCompare(y.show))) say('  ' + pad(d.show, 44) + pad(d.slug, 44) + lpad(d.episodes, 6) + '  ' + d.what);
  say();
}
if (BEFORE) {
  say('STRICT-GRID MOVEMENT (episodes keyed by show, season, number)');
  say('  placed after but not before: ' + fmt(gained) + '   placed before but not after: ' + fmt(lostEps) + '   confidence up: ' + fmt(confUp) + '   down: ' + fmt(confDown) + '   different file picked: ' + fmt(fileChanged));
  say('  reached LIVE: ' + fmt(liveUp) + '   dropped out of LIVE: ' + fmt(liveDown));
  say();
  say('WHAT BECAME OF EACH KIND OF GRID (shows; placed episodes before -> after)');
  const trans = new Map();
  for (const b of B.shows.values()) { const a = A.shows.get(b.slug), key = kind(b) + '  ->  ' + kind(a), r = trans.get(key) || { n: 0, b: 0, a: 0 }; r.n++; r.b += b.noTvmaze ? 0 : b.placed; r.a += a && !a.noTvmaze ? a.placed : 0; trans.set(key, r); }
  for (const [k, r] of [...trans.entries()].sort((x, y) => y[1].b - x[1].b)) say('  ' + pad(k, 56) + lpad(fmt(r.n), 7) + ' shows' + lpad(fmt(r.b), 9) + ' ->' + lpad(fmt(r.a), 8));
  say();
  say('WRONG-SHOW PROTECTION (picks in the new strict grids)');
  say('  the old detector flagged ' + fmt(lostPicks) + ' picks that the new one does not; newly flagged by the new one: ' + fmt(gainedFlags));
  say('  by what the old detector matched: ' + Object.entries(lostClass).map(([k, v]) => k + ' ' + fmt(v)).join('; '));
  say('  most common old matches that no longer count (picks), with one example each:');
  for (const [c, rec] of [...lost.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 40)) say('    ' + pad(c, 24) + lpad(rec.n, 6) + '  ' + pad(rec.cls, 30) + lostExamples.get(c));
  say();
}

say('NAMED SHOWS');
say(pad('show', 28) + lpad('placed before', 15) + lpad('placed after', 14) + '   how after');
for (const [label, slug] of [['The Parkers', 'the-parkers'], ['Fullmetal Alchemist', 'fullmetal-alchemist'], ['Forensic Files', 'forensic-files'], ['Family Matters', 'family-matters'], ['Murphy Brown', 'murphy-brown'], ['Married with Children', 'married-with-children'], ['Petticoat Junction', 'petticoat-junction'], ['Supernatural', 'supernatural'], ['Buffy the Vampire Slayer', 'buffy-the-vampire-slayer'], ['Curb Your Enthusiasm', 'curb-your-enthusiasm'], ['Homestar Runner', 'homestar-runner'], ['Jake and Amir', 'jake-and-amir'], ['The Drew Carey Show', 'the-drew-carey-show']]) {
  const b = B.shows.get(slug), a = A.shows.get(slug);
  say(pad(label, 28) + lpad(b && !b.noTvmaze ? fmt(b.placed) : '-', 15) + lpad(a && !a.noTvmaze ? fmt(a.placed) : '-', 14) + '   ' + kind(a) + (b ? ' (was ' + kind(b) + ')' : ''));
}
say();

if (!flag('--no-top')) {
  const ranked = [...shippedBefore.grids.entries()].map(([slug, g]) => ({ slug, shipped: placedIn(g) })).sort((x, y) => y.shipped - x.shipped || x.slug.localeCompare(y.slug)).slice(0, 100);
  say('TOP 100 SHOWS BY EPISODES IN catalog/shows (a proxy for most played): placed episodes before and after, LIVE before and after');
  say(pad('#', 4) + pad('show', 42) + lpad('shipped', 9) + lpad('before', 8) + lpad('after', 8) + lpad('change', 8) + lpad('LIVE b', 8) + lpad('LIVE a', 8) + '  flag');
  let worse = 0, liveWorse = 0, i = 0;
  const flagged = [];
  for (const r of ranked) {
    i++;
    const b = B.shows.get(r.slug), a = A.shows.get(r.slug);
    const bp = b && !b.noTvmaze ? b.placed : 0, ap = a && !a.noTvmaze ? a.placed : 0;
    const bl = b && !b.noTvmaze ? b.live : 0, al = a && !a.noTvmaze ? a.live : 0;
    const flags = [];
    if (ap < bp) { flags.push('WORSE (' + (ap - bp) + ')'); worse++; }
    if (al < bl) { flags.push('LIVE down'); liveWorse++; }
    if (ap > bp && !(b && b.selfListed) && (a && a.selfListed)) flags.push('now self-listed');
    if (ap < bp) flags.push(kind(b) + ' -> ' + kind(a));
    const name = (a && a.show) || (b && b.show) || r.slug;
    say(pad(i, 4) + pad(name.slice(0, 40), 42) + lpad(r.shipped, 9) + lpad(bp, 8) + lpad(ap, 8) + lpad((ap - bp >= 0 ? '+' : '') + (ap - bp), 8) + lpad(bl, 8) + lpad(al, 8) + '  ' + flags.join(', '));
    if (ap < bp) flagged.push(name + ' ' + bp + ' -> ' + ap);
  }
  say();
  say('Top 100: ' + worse + ' got worse in placed episodes, ' + liveWorse + ' lost LIVE episodes.');
  say('Worse: ' + (flagged.join('; ') || 'none'));
  say();
}

say('THE BIGGEST DROPS IN PLACED EPISODES (all shows, before minus after, top 40)');
const drops = [...B.shows.values()].filter((b) => !b.noTvmaze).map((b) => { const a = A.shows.get(b.slug); return { show: b.show, b: b.placed, a: a && !a.noTvmaze ? a.placed : 0, bk: kind(b), ak: kind(a) }; }).filter((d) => d.a < d.b).sort((x, y) => (y.b - y.a) - (x.b - x.a));
for (const d of drops.slice(0, 40)) say('  ' + pad(d.show.slice(0, 40), 42) + lpad(d.b, 7) + ' -> ' + lpad(d.a, 7) + '   ' + d.bk + ' -> ' + d.ak);
say('  (' + drops.length + ' shows lose episodes in all; ' + fmt(drops.reduce((n, d) => n + d.b - d.a, 0)) + ' episodes)');
say();
say('THE BIGGEST GAINS IN PLACED EPISODES (top 20)');
const gains = [...A.shows.values()].filter((a) => !a.noTvmaze).map((a) => { const b = B.shows.get(a.slug); return { show: a.show, b: b && !b.noTvmaze ? b.placed : 0, a: a.placed, bk: kind(b), ak: kind(a) }; }).filter((d) => d.a > d.b).sort((x, y) => (y.a - y.b) - (x.a - x.b));
for (const d of gains.slice(0, 20)) say('  ' + pad(d.show.slice(0, 40), 42) + lpad(d.b, 7) + ' -> ' + lpad(d.a, 7) + '   ' + d.bk + ' -> ' + d.ak);
say('  (' + gains.length + ' shows gain episodes in all; ' + fmt(gains.reduce((n, d) => n + d.a - d.b, 0)) + ' episodes)');

if (outArg) { writeReport(path.resolve(outArg), out.join('\n') + '\n'); console.error('report saved: ' + path.resolve(outArg)); }
