// THE MOVIE HUNT: TV movies and specials. Reads the TMDB reference list
// (catalog/tvmovies-list.json), skips kids' material, and for each title searches the Archive
// loosely, opens the best items, and judges every video file by runtime against TMDB's
// runtime and by title similarity. One file wins per title; confidence sets LIVE / REVIEW.
// Writes catalog/movies/<slug>.json and docs/MOVIES.md. Polite like hunt.js: one Archive call
// at a time, a pause between calls, a call budget, long quiet periods when refused, cached.
// Usage: node scripts/hunt-movies.js --budget 2000            (most-voted titles first)
//        node scripts/hunt-movies.js --min-votes 50 --limit 500
//        node scripts/hunt-movies.js "Sharknado"               (one title by name)
//        node scripts/hunt-movies.js --kind special
//        node scripts/hunt-movies.js --rescore                 (judge every stored pick again with today's rules; no network, no Archive call,
//                                                               writes nothing, prints each state change and the counts)
//        node scripts/hunt-movies.js --rescore --write         (the same, and write the records whose state or pick changed, then docs/MOVIES.md)
// The rules that decide a pick live in scripts/lib/moviejudge.js (the title must stand as a phrase in the name) and scripts/lib/hardexclude.js
// (C-SPAN, hearings, councils, news: dropped, never LIVE or REVIEW). Each pick the judge drops is named in the log.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PROFILE = require('./lib/profile');
const { LIVE, REVIEW, tagText, titleSim, itemScore, judgeFile, words } = require('./lib/moviejudge');
const { hardExclude } = require('./lib/hardexclude');
// Free text copied from the Archive (descriptions, titles) or from TMDB (overviews) can carry an e-mail address. It is masked here, before
// anything is written, so a hunt can never put an address into committed data (and publish never has to refuse for that reason).
const noEmail = (s) => (typeof s === 'string' ? s.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]') : s);
let LIST_CACHE = null; // the TMDB list is 10 MB: read it when a hunt needs it, not when a test or the doctor loads this file
const list = () => LIST_CACHE || (LIST_CACHE = JSON.parse(fs.readFileSync(path.join(PROFILE.catalogDir, 'tvmovies-list.json'), 'utf8')).items);
const OUT_DIR = path.join(PROFILE.catalogDir, 'movies');
const OUT_MD = path.join(PROFILE.docsDir, 'MOVIES.md');
const CACHE_DIR = path.join(PROFILE.catalogDir, 'cache');

let PAUSE_MS = 3000;
const BACKOFF_MS = [60000, 180000, 600000];
let ITEMS_TO_OPEN = 6;
const KIDS_GENRES = new Set([10751, 16]); // Family, Animation: off the adult shelf by B's rule
const KIDS_RE = /disney|nickelodeon|barbie|\blego\b|scooby|pok[eé]mon|my little pony|high school musical|camp rock|descendants|wizards of waverly|hannah montana|z-?o-?m-?b-?i-?e-?s|teen beach|jonas|muppet|sesame|care bears|strawberry shortcake|bratz|monster high|power rangers|veggietales|thomas (and|&) friends|paw patrol|peppa|dora|bluey|cocomelon|kidz? bop|starstruck|lemonade mouth|cheetah girls|princess protection|phineas|kim possible|good luck charlie|suite life|cloud 9|invisible sister|how to build a better boy|adventures in babysitting|freaky friday|halloweentown|twitches|cadet kelly|zenon|smart house|johnny tsunami|brink!|motocrossed|luck of the irish|the thirteenth year|under wraps|don't look under the bed|phantom of the megaplex|get a clue|pixel perfect|stuck in the suburbs|go figure|read it and weep|jump in|minutemen|dadnapped|den brother|avalon high|geek charming|frenemies|radio rebel|girl vs\. monster|bad hair day|zapped|descendants|how to build|spongebob|rugrats|hey arnold|jimmy neutron|fairly odd|drake (and|&) josh|zoey 101|icarly|victorious|big time rush|bunk'd|liv and maddie|jessie|austin (and|&) ally|dog with a blog|lab rats|mighty med|kickin' it/i;
// Browser playability from release tags (see match.js): no AC3/DTS audio, usually no HEVC video.
const AUDIO_RISK = /\b(dd ?5[. ]?1|dd ?2[. ]?0|ddp?\d|dd\+|e-?ac-?3|ac-?3|dts(-hd)?(-ma)?|truehd|atmos|flac)\b/i;
const VIDEO_RISK = /\b(x ?265|hevc|h[. ]?265|10 ?bit|av1|xvid|divx)\b/i;
const codecRisk = (name, format, playable) => { const t = tagText(name); return !playable ? 'container (' + format + ')' : AUDIO_RISK.test(t) ? 'audio (' + t.match(AUDIO_RISK)[0] + ')' : VIDEO_RISK.test(t) ? 'video (' + t.match(VIDEO_RISK)[0] + ')' : null; };
const VIDEO_FORMATS = new Set(['MPEG4', 'h.264', 'h.264 IA', 'Matroska', 'Ogg Video', 'WebM', 'Windows Media', 'AVI', 'QuickTime', 'MPEG2', 'MPEG1', 'RealMedia', 'Flash Video', 'DivX', 'XviD', '512Kb MPEG4', 'HiRes MPEG4', 'MPEG4 (h.264)']);
const PLAYABLE = new Set(['MPEG4', 'h.264', 'h.264 IA', 'WebM', 'Ogg Video', '512Kb MPEG4', 'HiRes MPEG4', 'MPEG4 (h.264)']);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let calls = 0, budget = 2000;
const norm = (s) => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const slug = (s) => norm(s).replace(/ /g, '-').replace(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/, '$1-show');

async function getJson(url, cacheKey) {
  const cf = path.join(CACHE_DIR, cacheKey + '.json');
  if (fs.existsSync(cf)) return JSON.parse(fs.readFileSync(cf, 'utf8'));
  if (calls >= budget) throw new Error('budget exhausted');
  for (let attempt = 0; ; attempt++) {
    calls++;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(60000), headers: { 'user-agent': 'voidtv-hunt/1 (offline catalog builder; one call at a time)' } });
      const text = await res.text();
      if (res.ok && text.trim().startsWith('{')) { fs.mkdirSync(CACHE_DIR, { recursive: true }); fs.writeFileSync(cf, text); await sleep(PAUSE_MS); return JSON.parse(text); }
      throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      if (attempt >= BACKOFF_MS.length) throw e;
      console.log(`    Archive refused (${e.message}); quiet for ${BACKOFF_MS[attempt] / 1000}s`);
      await sleep(BACKOFF_MS[attempt]);
    }
  }
}

async function search(m, get = getJson) {
  const w = words(m.title);
  if (!w.length) return [];
  // Title field first (precise), then anywhere (wide); merge by identifier.
  const q1 = `title:(${w.join(' AND ')}) AND mediatype:movies`;
  const q2 = `(${w.join(' AND ')}) AND mediatype:movies`;
  const items = [], seen = new Set();
  for (const [q, key] of [[q1, 'mscrape-title-' + m.tmdbId], [q2, 'mscrape-' + m.tmdbId]]) {
    const url = 'https://archive.org/services/search/v1/scrape?' + new URLSearchParams({ q, fields: 'identifier,title,description,year,downloads,collection', count: '300' });
    const j = await get(url, key);
    for (const it of j.items || []) if (!seen.has(it.identifier)) { seen.add(it.identifier); items.push(it); }
    if (items.length >= 300) break; // the title query alone was plenty
  }
  return items;
}

function runtimeBand(seconds, rt) {
  const min = seconds / 60;
  if (min < 15) return 'clip';
  if (rt && rt >= 40) {
    if (min >= rt * 0.85 && min <= rt * 1.15) return 'match';
    if (min >= rt * 0.7 && min <= rt * 1.4) return 'near';
    return 'off';
  }
  if (min >= 60 && min <= 200) return 'feature';
  if (min >= 20 && min < 60) return 'short';
  return 'off';
}

async function openItem(id, m, get = getJson) {
  const j = await get('https://archive.org/metadata/' + encodeURIComponent(id), 'meta-' + id.replace(/[^a-z0-9._-]/gi, '_'));
  const meta = j.metadata || {};
  // The Archive returns a list for the title when an item has several; the catalog and the SQLite mirror want one string.
  const itemTitle = noEmail(Array.isArray(meta.title) ? meta.title.join(' / ') : (meta.title == null ? '' : String(meta.title)));
  const files = (j.files || []).filter((f) => VIDEO_FORMATS.has(f.format) && f.length);
  const byStem = new Map();
  for (const f of files) { const stem = f.name.replace(/\.ia\.mp4$/i, '').replace(/\.[^.]+$/, ''); (byStem.get(stem) || byStem.set(stem, []).get(stem)).push(f); }
  const out = [];
  for (const [stem, group] of byStem) {
    const best = group.find((f) => PLAYABLE.has(f.format) && f.source === 'original') || group.find((f) => PLAYABLE.has(f.format)) || group[0];
    const secs = parseFloat(best.length) || 0;
    const risk = codecRisk(best.name, best.format, PLAYABLE.has(best.format));
    out.push({ item: id, itemTitle: itemTitle, stem, file: best.name, format: best.format, playable: !risk, codecRisk: risk || undefined, seconds: Math.round(secs), sizeMB: Math.round((+best.size || 0) / 1e6),
      band: runtimeBand(secs, m.runtime), fileSim: titleSim(stem.split('/').pop(), m.title), url: `https://archive.org/download/${id}/${encodeURIComponent(best.name)}` });
  }
  return { id, title: itemTitle, date: meta.date, files: out };
}

// The collections an upload sits in, kept on a pick (first six) so a later --rescore can apply the hard excludes to them without the network.
const collectionsOf = (c) => (c == null ? undefined : [].concat(c).map(String).slice(0, 6));
// What a hard exclude took away, in one line for the log. `what` names the upload or file; `ex` is what hardExclude returned.
const dropLine = (m, what, ex) => `    dropped ${what}  (${ex.kind}: "${ex.term}" in the ${ex.field}) for ${m.title}`;

// io (tests only): { getJson(url, cacheKey), save(record), log(line) } stand in for the Archive, the disk and the console.
async function huntMovie(m, io = {}) {
  const get = io.getJson || getJson, log = io.log || console.log;
  const scored = (await search(m, get)).map((it) => ({ ...it, score: itemScore(it, m) })).filter((it) => it.score >= 0.6);
  const excluded = [];
  // Politics, government and news are out (R-005). An upload that is one is not opened, so it also costs no Archive call.
  const items = scored.filter((it) => { const ex = hardExclude({ title: it.title, item: it.identifier, collection: it.collection }, m.title); if (ex) { excluded.push({ item: it.identifier, term: ex.term, field: ex.field }); log(dropLine(m, 'upload ' + it.identifier, ex)); } return !ex; })
    .sort((a, b) => b.score - a.score || (+b.downloads || 0) - (+a.downloads || 0));
  const picks = [];
  let opened = 0;
  for (const it of items.slice(0, ITEMS_TO_OPEN)) {
    try {
      const o = await openItem(it.identifier, m, get); opened++;
      for (const f of o.files) {
        const d = judgeFile(f, { ...it, title: o.title || it.title }, m); // the title the pick keeps, so --rescore judges exactly what the hunt judged
        if (d.dropped) { excluded.push({ item: it.identifier, file: f.stem, term: d.dropped.term, field: d.dropped.field }); log(dropLine(m, 'file ' + f.stem, d.dropped)); continue; }
        if (d.conf >= REVIEW) picks.push({ conf: +d.conf.toFixed(2), ...f, itemTitle: o.title, collection: collectionsOf(it.collection) });
      }
    } catch (e) { if (/budget/.test(e.message)) throw e; }
  }
  // A file that plays in a browser beats a cleaner one that will not; unplayable picks are never LIVE.
  picks.sort((a, b) => (b.playable - a.playable) || b.conf - a.conf || b.sizeMB - a.sizeMB);
  const best = picks[0] || null;
  const state = !best ? 'MISSING' : (best.conf >= LIVE && best.playable) ? 'LIVE' : 'REVIEW';
  const out = { tmdbId: m.tmdbId, kind: m.kind, title: noEmail(m.title), year: m.year, runtime: m.runtime, rating: m.rating, votes: m.votes, poster: m.poster, backdrop: m.backdrop, overview: noEmail(m.overview), genres: m.genres,
    huntedAt: new Date().toISOString(), archiveMentions: items.length, itemsOpened: opened, state, file: best, alternates: picks.slice(1, 4) };
  if (excluded.length) out.excluded = excluded.slice(0, 5); // what the hard exclude took away, for HQ and the doctor to show
  if (io.save) io.save(out);
  else { fs.mkdirSync(OUT_DIR, { recursive: true }); fs.writeFileSync(path.join(OUT_DIR, `${slug(m.title)}-${m.year || 'x'}.json`), JSON.stringify(out, null, 2)); }
  return out;
}

// ---- --rescore: judge every stored pick again with today's rules. No network, no Archive call. ----
// A record keeps its place in the list whatever happens (R-026): a record with no pick left becomes MISSING with file null.
// The collections an upload sits in are not stored on picks hunted before this rule; they are looked up in the scrape pages the hunt cached
// (catalog/cache/mscrape-*.json), which is a read of local files. Where those pages are not on this PC the check still runs on the name and the identifier.
function collectionLookup(cacheDir) {
  const seen = new Map();
  return (rec, pick) => {
    if (!cacheDir) return undefined;
    if (!seen.has(rec.tmdbId)) {
      const byItem = new Map();
      for (const k of ['mscrape-title-' + rec.tmdbId, 'mscrape-' + rec.tmdbId]) {
        try { for (const it of JSON.parse(fs.readFileSync(path.join(cacheDir, k + '.json'), 'utf8')).items || []) if (!byItem.has(it.identifier)) byItem.set(it.identifier, it.collection); } catch (e) { /* page not on this PC */ }
      }
      seen.set(rec.tmdbId, byItem);
      if (seen.size > 50) seen.delete(seen.keys().next().value);
    }
    return seen.get(rec.tmdbId).get(pick.item);
  };
}
// One record, judged again. Returns { rec: the record as it would be written, was, now, why: the reason for its state, dropped: [hard excludes], lost: [picks below REVIEW],
// stateChanged, changed: the state, the best pick or the alternates differ from what is stored }.
function rescoreRecord(rec, collectionFor) {
  const stored = [rec.file, ...(rec.alternates || [])].filter(Boolean);
  const kept = [], lost = [], dropped = [];
  for (const p of stored) {
    const it = { title: p.itemTitle, identifier: p.item, collection: p.collection || (collectionFor ? collectionFor(rec, p) : undefined) };
    const d = judgeFile(p, it, rec);
    if (d.dropped) { dropped.push({ item: p.item, stem: p.stem, term: d.dropped.term, field: d.dropped.field, kind: d.dropped.kind }); continue; }
    if (d.conf >= REVIEW) kept.push({ ...p, conf: +d.conf.toFixed(2), why: d.why });
    else lost.push({ item: p.item, stem: p.stem, why: d.why.join('; ') || 'below REVIEW' });
  }
  kept.sort((a, b) => (b.playable - a.playable) || b.conf - a.conf || b.sizeMB - a.sizeMB);
  const best = kept[0] || null;
  const state = !best ? 'MISSING' : (best.conf >= LIVE && best.playable) ? 'LIVE' : 'REVIEW';
  const clean = (p) => { if (!p) return null; const { why, ...rest } = p; return rest; };
  const next = { ...rec, state, file: clean(best), alternates: kept.slice(1, 4).map(clean) };
  const stateChanged = state !== rec.state;
  // Why the record is in this state: what held the best pick back, or why nothing is left.
  const why = best ? (best.why.join('; ') || (state === 'LIVE' ? 'title is a phrase in the name, runtime and year agree' : 'doubtful match')) : dropped.length ? 'hard exclude: ' + [...new Set(dropped.map((x) => x.term))].join(', ') : (lost[0] ? lost[0].why : 'no pick left');
  if (stateChanged) next.rescored = { was: rec.state, why };
  const urls = (rec2) => [rec2.file && rec2.file.url, ...(rec2.alternates || []).map((a) => a.url)].join('|');
  return { rec: next, was: rec.state, now: state, why, dropped, lost, stateChanged, changed: stateChanged || urls(next) !== urls(rec) };
}
// All records. opts: { dir, cacheDir, write, log }. Returns { counts: { before, after }, moves: { 'LIVE>REVIEW': n, ... }, results }.
function rescoreAll(opts = {}) {
  const dir = opts.dir || OUT_DIR, log = opts.log || (() => {});
  const lookup = collectionLookup(opts.cacheDir === undefined ? CACHE_DIR : opts.cacheDir);
  const before = {}, after = {}, moves = {}, results = [];
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort() : []) {
    let rec; try { rec = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { log(`   !! ${f}: not readable (${e.message})`); continue; }
    const r = rescoreRecord(rec, lookup);
    before[r.was] = (before[r.was] || 0) + 1; after[r.now] = (after[r.now] || 0) + 1;
    if (r.stateChanged) {
      const k = r.was + '>' + r.now; moves[k] = (moves[k] || 0) + 1;
      log(`${r.was.padEnd(7)} -> ${r.now.padEnd(7)} ${rec.title} (${rec.year || '?'})  ${rec.file ? '<- ' + rec.file.stem.slice(0, 50) : ''}  because ${r.why}`);
    }
    for (const d of r.dropped) log(`dropped    ${rec.title} (${rec.year || '?'}): ${d.stem.slice(0, 50)}  (${d.kind}: "${d.term}" in the ${d.field})`);
    results.push({ file: f, ...r });
    if (opts.write && r.changed) fs.writeFileSync(path.join(dir, f), JSON.stringify(r.rec, null, 2));
  }
  return { counts: { before, after }, moves, results };
}

function writeSummary() {
  const rows = fs.existsSync(OUT_DIR) ? fs.readdirSync(OUT_DIR).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(OUT_DIR, f), 'utf8'))) : [];
  const t = rows.reduce((a, r) => ((a[r.state] = (a[r.state] || 0) + 1), a), {});
  const order = { LIVE: 0, REVIEW: 1, MISSING: 2 };
  rows.sort((a, b) => order[a.state] - order[b.state] || (b.votes || 0) - (a.votes || 0));
  const lines = ['# TV Movies and Specials', '', `${rows.length} titles hunted: ` + Object.entries(t).map(([k, v]) => `${v} ${k}`).join(', ') + '.', '',
    '| State | Title | Year | Kind | Runtime | File length | Conf | Item |', '|---|---|---|---|---|---|---|---|'];
  for (const r of rows) lines.push(`| ${r.state} | ${r.title} | ${r.year || ''} | ${r.kind} | ${r.runtime || ''} | ${r.file ? Math.round(r.file.seconds / 60) : ''} | ${r.file ? r.file.conf : ''} | ${r.file ? r.file.item : ''} |`);
  fs.writeFileSync(OUT_MD, lines.join('\n') + '\n');
  return t;
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
  if (opt('--budget')) budget = +opt('--budget');
  if (opt('--open')) ITEMS_TO_OPEN = +opt('--open');
  if (opt('--pause')) PAUSE_MS = +opt('--pause');
  const minVotes = opt('--min-votes') != null ? +opt('--min-votes') : 20;
  const limit = opt('--limit') ? +opt('--limit') : Infinity;
  const kind = opt('--kind');
  const valued = new Set(['--budget', '--open', '--pause', '--min-votes', '--limit', '--kind', '--genre-first']);
  if (args.includes('--rescore')) { // judge the stored picks again: no network, nothing written unless --write is given too
    const write = args.includes('--write');
    const r = rescoreAll({ write, log: console.log });
    const fmt = (c) => ['LIVE', 'REVIEW', 'MISSING'].map((k) => `${c[k] || 0} ${k}`).join(', ');
    const changed = r.results.filter((x) => x.changed).length;
    console.log(`\nRescored ${r.results.length} movie records with today's rules (no network, no Archive call).`);
    console.log(`  before: ${fmt(r.counts.before)}\n  after:  ${fmt(r.counts.after)}`);
    console.log(`  state changes: ${Object.entries(r.moves).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}`);
    console.log(`  hard excludes dropped: ${r.results.reduce((n, x) => n + x.dropped.length, 0)} picks in ${r.results.filter((x) => x.dropped.length).length} records`);
    if (write) { writeSummary(); console.log(`  wrote ${changed} changed records and docs/MOVIES.md.`); }
    else console.log(`  ${changed} records would change. Nothing was written; add --write to write them.`);
    return;
  }
  const genreFirst = opt('--genre-first') ? +opt('--genre-first') : null; // TMDB genre id hunted before the rest (36 = History)
  const filter = (args.find((a, i) => !a.startsWith('--') && !valued.has(args[i - 1])) || '').toLowerCase();
  const hunted = (m) => fs.existsSync(path.join(OUT_DIR, `${slug(m.title)}-${m.year || 'x'}.json`));
  // Kids' TV movies are IN (B 2026-10-13: "kids movies are fine"); --no-kids excludes them if ever wanted.
  const noKids = args.includes('--no-kids');
  const isKids = (m) => noKids && (m.kids || (m.genres || []).some((g) => KIDS_GENRES.has(g)) || KIDS_RE.test(m.title));
  let jobs = list().filter((m) =>m.year && +m.year >= 1990 && !isKids(m))
    .filter((m) => (filter ? m.title.toLowerCase().includes(filter) : (m.votes || 0) >= minVotes && !hunted(m)))
    .filter((m) => (kind ? m.kind === kind : true))
    .sort((a, b) => (genreFirst ? ((b.genres || []).includes(genreFirst) - (a.genres || []).includes(genreFirst)) : 0) || (b.votes || 0) - (a.votes || 0)).slice(0, limit);
  console.log(`${jobs.length} titles to hunt (min votes ${minVotes}), budget ${budget} Archive calls, open ${ITEMS_TO_OPEN} items each`);
  let n = 0;
  for (const m of jobs) {
    if (calls >= budget) { console.log('\nBudget spent; stopping. Re-run to continue (cached calls are free).'); break; }
    try {
      const r = await huntMovie(m); n++;
      console.log(`[${n}/${jobs.length}] ${r.state.padEnd(7)} ${m.title} (${m.year}, ${m.runtime || '?'} min)${r.file ? `  <- ${Math.round(r.file.seconds / 60)}m ${r.file.conf} ${r.file.item}` : ''}  [${calls} calls]`);
    } catch (e) { if (/budget/.test(e.message)) { console.log('\nBudget spent mid-title; stopping.'); break; } console.log(`   !! ${m.title}: ${e.message}`); }
  }
  const t = writeSummary();
  console.log(`\nDone. ${calls} Archive calls. ${JSON.stringify(t)}. Summary in docs/MOVIES.md, details in catalog/movies/.`);
}
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { rescoreRecord, rescoreAll, collectionLookup, huntMovie, runtimeBand, slug, writeSummary };
