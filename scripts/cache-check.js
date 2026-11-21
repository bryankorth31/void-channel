// CACHE CHECK: finds saved Archive search pages that hold an error instead of a result, and asks again for the shows behind them.
// Build audit 19 Nov 2026, V4 and V5: the Archive's search service sometimes answers with a body that carries `request_error`
// and no real results. Until 20 Nov 2026 the hunts saved such an answer as if it were a result and reused it for ever (one show
// crashed the nightly hunt every night; others were "hunted" from nothing). The hunts no longer save or reuse one
// (scripts/lib/cachefile.js: answerError, readGood, saveAnswer). This tool is for the pages saved before that, and for checking
// by hand that none is left.
//
// Usage: node scripts/cache-check.js             list the saved search pages that hold an error (reads only, a few minutes)
//        node scripts/cache-check.js --rehunt    then hunt each show among them again, one at a time, as HQ's "Re-hunt now" does
//                                                (node scripts/hunt.js --slug <show> --fresh --refresh); a page that gets a real
//                                                answer is replaced, so the next run lists fewer
//        --dir <folder>                          read another cache folder (the tests use it)
// Films and scout searches are listed with the command that asks again; --rehunt does the shows only.
// Exit code: 0 none left, 1 some are left (or a re-hunt failed), 2 bad option.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');
const { PACKED, answerError } = require('./lib/cachefile');

// What a saved page is for, from its file name: scrape-<show>-<page>, scrape-title-<show>-<page>, scrape-cast-<show>-<page>,
// mscrape-<film id>, mscrape-title-<film id>, scout-<search>.
function describe(file) {
  const key = file.replace(/\.json(\.gz)?$/, '');
  let m = /^mscrape-(?:title-)?(\d+)$/.exec(key);
  if (m) return { file, key, kind: 'film', id: m[1] };
  if (/^scout-/.test(key)) return { file, key, kind: 'scout', id: key.slice(6) };
  m = /^scrape-(?:title-|cast-)?(.+)-(\d+)$/.exec(key);
  if (m) return { file, key, kind: 'show', id: m[1] };
  return { file, key, kind: 'other', id: key };
}

// Every saved search page in `dir` that holds an Archive error. Returns { seen, bad: [{ file, key, kind, id, why }], unreadable: [file] }.
function scan(dir, onTick) {
  const bad = [], unreadable = [];
  let seen = 0;
  for (const f of fs.readdirSync(dir)) {
    if (!PACKED.test(f) || !/\.json(\.gz)?$/.test(f)) continue;
    seen++;
    if (onTick && seen % 2000 === 0) onTick(seen);
    let text;
    try { const buf = fs.readFileSync(path.join(dir, f)); text = (f.endsWith('.gz') ? zlib.gunzipSync(buf) : buf).toString('utf8'); } catch (e) { unreadable.push(f); continue; }
    if (!text.includes('"request_error"')) continue; // the cheap test first: most pages are megabytes of results
    let j;
    try { j = JSON.parse(text); } catch (e) { unreadable.push(f); continue; }
    const why = answerError(j);
    if (why) bad.push({ ...describe(f), why });
  }
  return { seen, bad, unreadable };
}

function report(r, log) {
  const by = (k) => r.bad.filter((b) => b.kind === k);
  log(`${r.seen} saved search pages read: ${r.bad.length} hold an Archive error, not a result` + (r.unreadable.length ? `; ${r.unreadable.length} could not be read` : ''));
  const shows = [...new Set(by('show').map((b) => b.id))].sort();
  if (shows.length) { log(`\nShows (${shows.length}), asked again by --rehunt or one at a time with: node scripts/hunt.js --slug <show> --fresh --refresh`); for (const s of shows) log('  ' + s + '  (' + by('show').filter((b) => b.id === s).map((b) => b.key + ', ' + b.why).join('; ') + ')'); }
  const films = [...new Set(by('film').map((b) => b.id))].sort();
  if (films.length) { log(`\nFilms (${films.length}), by TMDB id. Ask again with: node scripts/hunt-movies.js "<the film's title>" (the id is in catalog/tvmovies-list.json)`); for (const f of films) log('  ' + f); }
  const rest = r.bad.filter((b) => b.kind === 'scout' || b.kind === 'other');
  if (rest.length) { log(`\nScout and other searches (${rest.length}): the next scout run (HQ > Jobs > Scout the Archive for leads) asks again by itself`); for (const b of rest) log('  ' + b.key); }
  if (r.unreadable.length) { log('\nCould not be read (a damaged file; delete it and the next hunt of that show fetches it again):'); for (const f of r.unreadable.slice(0, 20)) log('  ' + f); }
  return shows;
}

function main() {
  const args = process.argv.slice(2);
  const known = new Set(['--rehunt', '--dir']);
  const bad = args.filter((a, i) => a.startsWith('--') ? !known.has(a) : args[i - 1] !== '--dir');
  if (bad.length) { console.error('unknown option: ' + bad.join(' ') + '\nusage: node scripts/cache-check.js [--rehunt] [--dir <folder>]'); return 2; }
  const di = args.indexOf('--dir');
  const dir = di >= 0 ? path.resolve(args[di + 1] || '') : path.join(require('./lib/profile').catalogDir, 'cache');
  if (!fs.existsSync(dir)) { console.error('no such folder: ' + dir); return 2; }
  const log = (m) => console.log(m);
  let r = scan(dir, (n) => process.stdout.write(`  ...${n} pages read\n`));
  const shows = report(r, log);
  if (!args.includes('--rehunt') || !shows.length) return r.bad.length ? 1 : 0;
  let failed = 0;
  for (const s of shows) {
    log(`\n== hunting ${s} again`);
    try { execFileSync(process.execPath, [path.join(__dirname, 'hunt.js'), '--slug', s, '--fresh', '--refresh'], { stdio: 'inherit', windowsHide: true }); }
    catch (e) { failed++; log(`   !! the hunt of ${s} did not finish: ${String(e.message).slice(0, 120)}`); }
  }
  log('\n== reading the saved pages again');
  r = scan(dir);
  report(r, log);
  return r.bad.length || failed ? 1 : 0;
}

if (require.main === module) process.exit(main());
module.exports = { scan, describe, report };
