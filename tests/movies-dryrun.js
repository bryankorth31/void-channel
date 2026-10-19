// MOVIES DRY RUN: shows what the new TV-movie rules do to the real catalog, and writes nothing to it.
//
//   node tests/movies-dryrun.js --catalog <catalog folder> [--out <report file>]
//
//   --catalog   the catalog to read (movies/ and, for the collections of old picks, cache/). Nothing in it is ever written. Use the real one:
//               node tests/movies-dryrun.js --catalog C:\Users\bryan\void-channel\catalog --out movies-dryrun.txt
//   --out       also save the report to this file (the only file this script writes)
//
// It judges every stored pick (the file and its alternates) of every record again with scripts/hunt-movies.js --rescore's own code, with no network and
// no Archive call, and prints: the counts before and after, the five questions the fix was asked (a to f below), and the lists behind them.
//   a  LIVE movies that lack the title as a phrase in the file name or the upload title (the audit counted 441), by the audit's plain test and by the hunt's own
//   b  government and news picks that would ship (HARD_EXCLUDE), LIVE and REVIEW
//   c  the 24 sampled picks with their labels (right, wrong, unclear: read by eye from the names), and how many wrong ones are still LIVE with the same file
//   d  the 100 most-voted movies: which changed, and whether the change was a wrong work
//   e  LIVE, REVIEW and MISSING before and after; no record gone; a record with no pick left is MISSING with file null
//   f  a seeded random sample of 40 other movies, before and after
// Safety: every path that can write a file is replaced by a stand-in that throws before the modules are used, the report file is written through a reference saved
// before that, and fetch, http and https cannot connect. The numbers say how often each was tried (they should be 0).
const realFs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const catalogArg = arg('--catalog'), outArg = arg('--out');
if (!catalogArg) { console.error('usage: node tests/movies-dryrun.js --catalog <catalog folder> [--out <report file>]'); process.exit(2); }
const CATALOG = path.resolve(catalogArg), MOVIES = path.join(CATALOG, 'movies'), CACHE = path.join(CATALOG, 'cache');
if (!realFs.existsSync(MOVIES)) { console.error('not a catalog folder (no movies/): ' + CATALOG); process.exit(2); }

// The modules are loaded first: scripts/lib/profile.js makes the docs folder when it loads, and that is not a write to the catalog.
const writeReport = realFs.writeFileSync.bind(realFs);
const H = require('../scripts/hunt-movies.js');
const J = require('../scripts/lib/moviejudge');
const HX = require('../scripts/lib/hardexclude');
const M = require('../scripts/match.js');

const attempts = { writes: 0, network: 0 };
for (const n of ['writeFileSync', 'appendFileSync', 'mkdirSync', 'rmSync', 'rmdirSync', 'renameSync', 'copyFileSync', 'unlinkSync', 'truncateSync', 'cpSync', 'utimesSync', 'chmodSync', 'symlinkSync']) realFs[n] = function () { attempts.writes++; throw new Error('dry run: write blocked (' + n + ')'); };
const writes = (flags) => typeof flags === 'string' && /[wa+]/.test(flags);
const realOpenSync = realFs.openSync;
realFs.openSync = function (p, flags) { if (writes(flags)) { attempts.writes++; throw new Error('dry run: write blocked (openSync)'); } return realOpenSync.apply(realFs, arguments); };
for (const n of ['writeFile', 'appendFile', 'mkdir', 'unlink', 'rm', 'rename', 'copyFile', 'open', 'createWriteStream']) realFs[n] = function () { attempts.writes++; throw new Error('dry run: write blocked (' + n + ')'); };
const blockNet = (what) => function () { attempts.network++; throw new Error('dry run: network blocked (' + what + ')'); };
globalThis.fetch = blockNet('fetch');
for (const m of ['http', 'https']) { const mod = require(m); mod.request = blockNet(m + '.request'); mod.get = blockNet(m + '.get'); }

// ---------------------------------------------------------------- what the labels say
// The 24 sampled picks: the six titles named in the audit (CP-022) and eighteen taken at even steps from the 716 LIVE picks whose title has two words or fewer and whose
// file name does not start with the title. The audit's own 24 were not listed, so these are mine. Labels are read by eye from the stored names (stem, upload title,
// length) and say what the OLD pick was: wrong (another work), right, unclear (cannot be told from the names).
const SAMPLE = { 228780: 'wrong', 626318: 'wrong', 645745: 'wrong', 931690: 'wrong', 435268: 'wrong', 345617: 'wrong', 1163: 'right', 31712: 'right', 45759: 'right', 62989: 'unclear', 83242: 'wrong', 113234: 'wrong', 145979: 'right', 201068: 'wrong', 239227: 'right', 276692: 'wrong',
  322835: 'wrong', 369657: 'wrong', 425767: 'unclear', 488023: 'wrong', 564637: 'wrong', 729269: 'wrong', 920081: 'unclear', 1120659: 'right' };
// The most-voted 100 whose LIVE state changed on 19 Oct 2026, labelled the same way: A Christmas Prince (the file is "Christmas with a Prince: Becoming Royal"), Starstruck (a 1995 VHS rip),
// Gia (a Vietnamese video), Z-O-M-B-I-E-S (the file is number 2), Conspiracy (a "9-11 Conspiracy Video"), Frenemies (a "Full Playlist" of a web series), 7 Days in Hell (a zombie game stream),
// Flowers in the Attic (the 1987 film, not the 2014 one). A change that is not in this list prints "?" and has to be read by hand.
const TOP_LABELS = { 483104: 'wrong', 35558: 'wrong', 14533: 'wrong', 483980: 'wrong', 12900: 'wrong', 84105: 'wrong', 287689: 'wrong', 236399: 'wrong' };

// ---------------------------------------------------------------- run
const t0 = Date.now();
const run = H.rescoreAll({ dir: MOVIES, cacheDir: CACHE, write: false });
const rows = run.results; // { file, rec (after), was, now, why, dropped, lost, stateChanged, changed }
const before = (r) => JSON.parse(realFs.readFileSync(path.join(MOVIES, r.file), 'utf8'));
const recs = rows.map((r) => ({ r, old: before(r) }));

const out = [];
const say = (s = '') => { out.push(s); console.log(s); };
const fmt = (n) => Number(n).toLocaleString('en-US');
const pad = (s, n) => String(s).padEnd(n), lpad = (s, n) => String(s).padStart(n);
const norm = M.norm;
const trunc = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').slice(0, n);
const pickOf = (rec) => rec.file;
const plainPhrase = (title, p) => p && (' ' + norm(p.stem) + ' ').includes(' ' + norm(title) + ' ') || p && (' ' + norm(p.itemTitle) + ' ').includes(' ' + norm(title) + ' ');
const strictPhrase = (title, p) => { const k = J.titlePhrase(title, [p.stem, p.itemTitle]).kind; return k === 'names' || k === 'words'; };
const flatOf = (p) => ({ title: p.itemTitle, stem: p.stem, item: p.item, collection: p.collection });
const GOV = /\b(?:c ?span\d?|committee|hearings?|council|school board|selectmen|work sessions?|press conferences?|(?:city|county) commission|planning board)\b/;
const govOnly = (title, p) => GOV.test(' ' + norm([p.itemTitle, p.stem, p.item].join(' ')) + ' ') || /^CSPAN/.test(String(p.item));
const states = ['LIVE', 'REVIEW', 'MISSING'];
const cnt = (c) => states.map((k) => `${fmt(c[k] || 0)} ${k}`).join(', ');

say('MOVIES DRY RUN  ' + new Date().toISOString());
say('catalog: ' + CATALOG + '   (' + fmt(rows.length) + ' movie records)');
say('guards: writes tried ' + attempts.writes + ', network tried ' + attempts.network + ' (both should be 0); Archive calls 0; only the report file is written');
say();

// ---- e. counts
say('E. COUNTS');
say('  before: ' + cnt(run.counts.before));
say('  after:  ' + cnt(run.counts.after));
say('  state changes: ' + (Object.entries(run.moves).map(([k, v]) => `${k} ${fmt(v)}`).join(', ') || 'none') + '; records that would be rewritten (state or pick changed): ' + fmt(rows.filter((x) => x.changed).length));
const gone = recs.filter(({ r }) => !r.rec || !r.rec.tmdbId).length, nullFile = recs.filter(({ r }) => r.now === 'MISSING' && r.rec.file !== null).length, filedMissing = recs.filter(({ r }) => r.now !== 'MISSING' && !r.rec.file).length;
say('  records gone: ' + gone + '; MISSING with a file: ' + nullFile + '; LIVE or REVIEW with no file: ' + filedMissing + '  (all three should be 0: nothing leaves the list, R-026)');
say();

// ---- a. LIVE movies without the title as a phrase
const liveBefore = recs.filter(({ old }) => old.state === 'LIVE' && old.file), liveAfter = recs.filter(({ r }) => r.now === 'LIVE');
say('A. LIVE MOVIES WITHOUT THE TITLE AS A PHRASE IN THE FILE NAME OR THE UPLOAD TITLE');
say('                                                                  before      after');
say('  audit test (the plain title is a whole-word phrase of either name)' + lpad(fmt(liveBefore.filter(({ old }) => !plainPhrase(old.title, old.file)).length), 9) + lpad(fmt(liveAfter.filter(({ r }) => !plainPhrase(r.rec.title, r.rec.file)).length), 11) + '   (the audit counted 441 of 2,484)');
say('  the hunt\'s own test (leading The/A optional, either name, nothing glued on)' + lpad(fmt(liveBefore.filter(({ old }) => !strictPhrase(old.title, old.file)).length), 2) + lpad(fmt(liveAfter.filter(({ r }) => !strictPhrase(r.rec.title, r.rec.file)).length), 11) + '   (should be 0)');
{
  const left = liveAfter.filter(({ r }) => !plainPhrase(r.rec.title, r.rec.file));
  const by = {}; for (const { r } of left) { const k = J.titlePhrase(r.rec.title, [r.rec.file.stem, r.rec.file.itemTitle]).kind; by[k] = (by[k] || 0) + 1; }
  say('  of the ' + fmt(left.length) + ' LIVE after that the audit\'s plain test would still flag: ' + Object.entries(by).map(([k, v]) => `${v} by ${k === 'names' ? 'the hunt\'s test (an optional The/A, a colon title with its parts, a possessive...)' : k}`).join(', ') + '. First ten:');
  for (const { r } of left.slice(0, 10)) say('    ' + trunc(r.rec.title + ' (' + r.rec.year + ') <= ' + r.rec.file.stem + ' | ' + r.rec.file.itemTitle, 130));
  const wordsKind = liveAfter.filter(({ r }) => J.titlePhrase(r.rec.title, [r.rec.file.stem, r.rec.file.itemTitle]).kind === 'words').length;
  say('  LIVE picks that stand on "the same words in another order": ' + wordsKind);
}
say();

// ---- b. government and news
const shipsOld = recs.filter(({ old }) => old.state !== 'MISSING' && old.file && old.file.playable), shipsNew = recs.filter(({ r }) => r.now !== 'MISSING' && r.rec.file && r.rec.file.playable);
const hx = (rec) => HX.hardExclude(flatOf(rec.file), rec.title);
const countBy = (list, which, test) => { const c = { LIVE: 0, REVIEW: 0 }; for (const x of list) { const rec = which(x); if (test(rec)) c[rec.state]++; } return c; };
const oldRec = (x) => x.old, newRec = (x) => x.r.rec, gov = (rec) => govOnly(rec.title, rec.file);
const ho = countBy(shipsOld, oldRec, hx), hn = countBy(shipsNew, newRec, hx), go = countBy(shipsOld, oldRec, gov), gn = countBy(shipsNew, newRec, gov);
say('B. GOVERNMENT AND NEWS PICKS THAT WOULD SHIP (a playable file, state not MISSING)');
say('  the hard-exclude pattern (C-SPAN, hearing, committee, council, school board, work session, press conference, election, news, TV News Archive names and collections):');
say('     before: ' + ho.LIVE + ' LIVE + ' + ho.REVIEW + ' REVIEW     after: ' + hn.LIVE + ' LIVE + ' + hn.REVIEW + ' REVIEW');
say('  government words only (C-SPAN, committee, hearing, council, school board, selectmen, work session, press conference, city or county commission, planning board; the audit counted 22 LIVE + 31 REVIEW):');
say('     before: ' + go.LIVE + ' LIVE + ' + go.REVIEW + ' REVIEW     after: ' + gn.LIVE + ' LIVE + ' + gn.REVIEW + ' REVIEW');
{
  const dropped = rows.reduce((n, x) => n + x.dropped.length, 0), recsWith = rows.filter((x) => x.dropped.length).length;
  const kinds = {}; for (const x of rows) for (const d of x.dropped) kinds[d.kind] = (kinds[d.kind] || 0) + 1;
  say('  picks dropped by the hard exclude (file and alternates): ' + dropped + ' in ' + recsWith + ' records; by kind ' + JSON.stringify(kinds));
  // A recording named CHANNEL_DATE_TIME_Title, or filed under the news archive, is news by the Archive's own label whatever the channel airs. These come from channels that
  // are not news channels (a film shown on BET during the September 2001 coverage, for example). Listed so Bryan can overrule the rule for any of them.
  const NEWS_CHANNEL = /^(?:TV-)?(?:CSPAN\d?|CNN\w*|MSNBC\w*|FOXNEWS\w*|BLOOMBERG|ALJAZ\w*|PRESSTV|BBCNEWS\w*|DW|KPIX)$/;
  const tv = rows.filter((x) => x.dropped.length && x.dropped.every((d) => (d.field === 'item' || d.field === 'stem' || d.field === 'collection') && /^[A-Z]/.test(d.term) && !NEWS_CHANNEL.test(d.term)));
  say('  dropped only because the Archive files the recording under its news archive, from channels that are not news channels (' + tv.length + ' records):');
  for (const x of tv.slice(0, 40)) say('    ' + trunc(x.rec.title + ' (' + x.rec.year + ') <= ' + x.dropped.map((d) => d.stem).join(' | '), 125));
  const left = shipsNew.filter(({ r }) => hx(r.rec));
  if (left.length) { say('  STILL SHIPPING after the rescore (should be none):'); for (const { r } of left.slice(0, 10)) say('    ' + r.rec.title + ' <= ' + r.rec.file.stem); }
}
say();

// ---- c. the 24
say('C. THE 24 SAMPLED PICKS (the six named in the audit, then eighteen at even steps)');
say(pad('  id', 11) + pad('label', 9) + pad('after', 9) + 'title (year) <= old file name | upload title | minutes   => new file');
let wrongStill = 0, wrongTotal = 0, rightKept = 0, rightTotal = 0, betterFile = 0;
const byId = new Map(recs.map((x) => [x.old.tmdbId, x]));
for (const [id, label] of Object.entries(SAMPLE)) {
  const x = byId.get(+id);
  if (!x) { say('  ' + id + ' not in this catalog'); continue; }
  const o = x.old, n = x.r.rec;
  const sameFile = n.file && o.file && n.file.url === o.file.url;
  if (label === 'wrong') { wrongTotal++; if (x.r.now === 'LIVE' && sameFile) wrongStill++; if (x.r.now === 'LIVE' && !sameFile) betterFile++; }
  if (label === 'right') { rightTotal++; if (x.r.now === 'LIVE') rightKept++; }
  say('  ' + pad(id, 9) + pad(label, 9) + pad(x.r.now, 9) + trunc(`${o.title} (${o.year}, ${o.runtime}m) <= ${o.file.stem} | ${o.file.itemTitle} | ${Math.round(o.file.seconds / 60)}m`, 150) + (sameFile ? '' : n.file ? '   => ' + trunc(n.file.stem + ' | ' + n.file.itemTitle, 60) : '   => no file'));
}
say('  wrong works still LIVE with the same file: ' + wrongStill + ' of ' + wrongTotal + '   (a wrong pick replaced by a better file from the alternates that is LIVE: ' + betterFile + ')');
say('  right works that stay LIVE: ' + rightKept + ' of ' + rightTotal + '   unclear: ' + Object.values(SAMPLE).filter((l) => l === 'unclear').length + ' (not counted)');
say();

// ---- d. the 100 most voted
const top = [...recs].sort((a, b) => (b.old.votes || 0) - (a.old.votes || 0) || a.old.tmdbId - b.old.tmdbId).slice(0, 100);
say('D. THE 100 MOST-VOTED MOVIES');
const moves = {}; for (const x of top) { const k = x.old.state + '>' + x.r.now; moves[k] = (moves[k] || 0) + 1; }
say('  ' + JSON.stringify(moves));
let rightLost = 0, unlabelled = 0;
for (const x of top) {
  if (x.old.state !== 'LIVE' || x.r.now === 'LIVE') continue;
  const label = TOP_LABELS[x.old.tmdbId] || '?';
  if (label === 'right') rightLost++; if (label === '?') unlabelled++;
  const o = x.old, why = x.r.dropped.length ? 'hard exclude' : x.r.why;
  say('  LIVE -> ' + pad(x.r.now, 8) + pad(o.tmdbId, 9) + pad(label, 9) + trunc(`${o.title} (${o.year}, v${o.votes}) <= ${o.file.stem} | ${o.file.itemTitle}`, 110) + '  because ' + trunc(why, 70));
}
say('  right works that lost LIVE: ' + rightLost + '   unlabelled: ' + unlabelled);
{
  const stay = top.filter((x) => x.old.state === 'LIVE' && x.r.now === 'LIVE'), swapped = stay.filter((x) => x.r.rec.file.url !== x.old.file.url);
  say('  still LIVE: ' + stay.length + (swapped.length ? ' (' + swapped.length + ' with a different file, the old one being worse)' : ''));
  const promoted = top.filter((x) => x.old.state !== 'LIVE' && x.r.now === 'LIVE');
  if (promoted.length) say('  promoted to LIVE: ' + promoted.map((x) => x.old.title).join('; '));
}
say();

// ---- f. random sample
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const used = new Set([...Object.keys(SAMPLE).map(Number), ...top.map((x) => x.old.tmdbId)]);
const pool = recs.filter((x) => x.old.file && !used.has(x.old.tmdbId)).sort((a, b) => a.old.tmdbId - b.old.tmdbId);
const rnd = mulberry32(20261019), chosen = new Set();
while (chosen.size < Math.min(40, pool.length)) chosen.add(Math.floor(rnd() * pool.length));
say('F. A SEEDED RANDOM SAMPLE OF 40 OTHER MOVIES WITH A FILE (seed 20261019; not among the 24 or the top 100)');
let same = 0;
for (const i of [...chosen].sort((a, b) => a - b)) {
  const x = pool[i], o = x.old, n = x.r.rec;
  const unchanged = x.r.now === o.state && n.file && o.file && n.file.url === o.file.url;
  if (unchanged) same++;
  say('  ' + pad(unchanged ? 'same' : x.r.stateChanged ? o.state + '>' + x.r.now : 'new file', 14) + trunc(`${o.title} (${o.year}) <= ${o.file.stem} | ${o.file.itemTitle}`, 120) + (unchanged ? '' : '  because ' + trunc(x.r.dropped.length ? 'hard exclude ' + x.r.dropped[0].term : x.r.why, 60)));
}
say('  unchanged: ' + same + ' of ' + chosen.size);
say();

// ---- what ships while it is REVIEW
{
  const rev = shipsNew.filter(({ r }) => r.now === 'REVIEW');
  const noPhrase = rev.filter(({ r }) => !strictPhrase(r.rec.title, r.rec.file));
  say('G. WHAT STILL SHIPS (the site build puts every playable pick that is not MISSING on the page, REVIEW included)');
  say('  playable picks that ship after the rescore: ' + fmt(shipsNew.length) + ' (before ' + fmt(shipsOld.length) + '): ' + fmt(shipsNew.filter(({ r }) => r.now === 'LIVE').length) + ' LIVE, ' + fmt(rev.length) + ' REVIEW');
  say('  of the REVIEW ones, ' + fmt(noPhrase.length) + ' have no title phrase in the name (word overlap only). Most of them are another work, as the samples above show. Whether they ship is scripts/lib/app.js\'s decision, not this script\'s.');
}
say();
say('Done in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s. Writes tried ' + attempts.writes + ', network tried ' + attempts.network + '.');
if (outArg) writeReport(path.resolve(outArg), out.join('\n') + '\n');
if (attempts.writes || attempts.network) process.exit(1);
