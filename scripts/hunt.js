// THE HUNT (builder stage 1): search loose, judge strict.
// For each show: pull every Archive item that mentions it ANYWHERE (scrape API, all text
// fields), open each promising item's file list (metadata API), and score every video file
// against the show's real runtime from TVmaze. Writes one candidates file per show under
// catalog/candidates/<slug>.json plus a summary table in docs/HUNT.md.
//
// Polite by design: one Archive call at a time, a pause between calls, a per-run call budget,
// and a long quiet period whenever the Archive refuses. Reads only, never downloads video.
//
// Usage: node scripts/hunt.js "Space Ghost"          one show (name substring)
//        node scripts/hunt.js --missing              every show the census marked NOT THERE
//        node scripts/hunt.js --type "Adult Swim"    one row
//        node scripts/hunt.js --budget 150           cap Archive calls this run (default 300)
//        node scripts/hunt.js --open 12              metadata reads per show (default 40)
//        node scripts/hunt.js --pause 3000           ms between Archive calls (default 4000)
//        node scripts/hunt.js --refresh              re-run match + preview after every show
//        node scripts/hunt.js --fresh                re-hunt shows that already have candidates
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const LIST = JSON.parse(fs.readFileSync(path.join(__dirname, 'show-list.json'), 'utf8'));
const CENSUS = fs.existsSync(path.join(__dirname, 'show-probe-results.json'))
  ? JSON.parse(fs.readFileSync(path.join(__dirname, 'show-probe-results.json'), 'utf8')).results : [];
const OUT_DIR = path.join(ROOT, 'catalog', 'candidates');
const OUT_MD = path.join(ROOT, 'docs', 'HUNT.md');
const CACHE_DIR = path.join(ROOT, 'catalog', 'cache');
const OVERRIDES = fs.existsSync(path.join(ROOT, 'catalog', 'overrides.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT, 'catalog', 'overrides.json'), 'utf8')) : {};

let PAUSE_MS = 4000;            // between Archive calls
const BACKOFF_MS = [60000, 180000, 600000];
const SCRAPE_COUNT = 500;       // items per scrape page
let MAX_ITEMS_TO_OPEN = 40;     // metadata reads per show, best-scored first
const VIDEO_FORMATS = new Set(['MPEG4', 'h.264', 'h.264 IA', 'Matroska', 'Ogg Video', 'WebM', 'Windows Media', 'AVI', 'QuickTime', 'MPEG2', 'MPEG1', 'RealMedia', 'Flash Video', 'DivX', 'XviD', '512Kb MPEG4', 'HiRes MPEG4', 'MPEG4 (h.264)']);
const PLAYABLE_FORMATS = new Set(['MPEG4', 'h.264', 'h.264 IA', 'WebM', 'Ogg Video', '512Kb MPEG4', 'HiRes MPEG4', 'MPEG4 (h.264)']);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let calls = 0;
let budget = 300;

function norm(s) {
  return String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}
function slug(s) { return norm(s).replace(/ /g, '-'); }
function searchWords(show) {
  return show.toLowerCase().replace(/&/g, ' and ').replace(/’/g, "'")
    .split(/[^a-z0-9']+/).map((w) => w.replace(/^'+|'+$/g, '')).filter(Boolean)
    // "rocko's" -> rocko*; "it's" -> dropped (a 2-letter wildcard matches everything and breaks AND)
    .map((w) => (w.includes("'") ? (w.split("'")[0].length >= 4 ? w.split("'")[0] + '*' : '') : w))
    .filter((w) => w && !['the', 'and', 'a', 'of', 'with'].includes(w));
}

// ---- polite fetch with cache -------------------------------------------------------------
async function getJson(url, cacheKey) {
  const cf = cacheKey && path.join(CACHE_DIR, cacheKey + '.json');
  if (cf && fs.existsSync(cf)) return JSON.parse(fs.readFileSync(cf, 'utf8'));
  if (calls >= budget) throw new Error('budget exhausted');
  for (let attempt = 0; ; attempt++) {
    calls++;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(60000), headers: { 'user-agent': 'voidtv-hunt/1 (offline catalog builder; one call at a time)' } });
      const text = await res.text();
      if (res.ok && text.trim().startsWith('{')) {
        const j = JSON.parse(text);
        if (cf) { fs.mkdirSync(CACHE_DIR, { recursive: true }); fs.writeFileSync(cf, text); }
        await sleep(PAUSE_MS);
        return j;
      }
      throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      if (attempt >= BACKOFF_MS.length) throw e;
      console.log(`    Archive refused (${e.message}); quiet for ${BACKOFF_MS[attempt] / 1000}s`);
      await sleep(BACKOFF_MS[attempt]);
    }
  }
}

// ---- TVmaze: the show's real shape --------------------------------------------------------
async function tvmaze(show) {
  const key = 'tvmaze-' + slug(show);
  const cf = path.join(CACHE_DIR, key + '.json');
  if (fs.existsSync(cf)) return JSON.parse(fs.readFileSync(cf, 'utf8'));
  try {
    // Punctuation confuses TVmaze's search ("NTSF:SD:SUV::" finds nothing; "NTSF SD SUV" does).
    const r = await fetch('https://api.tvmaze.com/singlesearch/shows?q=' + encodeURIComponent(show.replace(/[^\w\s'&!.-]/g, ' ').replace(/\s+/g, ' ').trim()), { signal: AbortSignal.timeout(20000) });
    if (!r.ok) return null;
    const s = await r.json();
    const er = await fetch(`https://api.tvmaze.com/shows/${s.id}/episodes`, { signal: AbortSignal.timeout(20000) });
    const eps = er.ok ? await er.json() : [];
    const out = {
      id: s.id, name: s.name, runtime: s.runtime || s.averageRuntime || null, premiered: s.premiered || null,
      network: ((s.network || s.webChannel || {}).name) || null,
      episodes: eps.map((e) => ({ season: e.season, number: e.number, name: e.name, airdate: e.airdate, runtime: e.runtime })),
      cast: await tvmazeCast(s.id),
    };
    fs.mkdirSync(CACHE_DIR, { recursive: true }); fs.writeFileSync(cf, JSON.stringify(out));
    return out;
  } catch (e) { return null; }
}
// Lead actors and characters: the discriminators that rescue a common-word title ("Oz", "Rome").
async function tvmazeCast(id) {
  try {
    const r = await fetch(`https://api.tvmaze.com/shows/${id}/cast`, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) return [];
    const cast = await r.json();
    const names = [];
    for (const c of cast.slice(0, 4)) { if (c.person && c.person.name) names.push(c.person.name); if (c.character && c.character.name) names.push(c.character.name); }
    return [...new Set(names)].filter((n) => n.split(' ').length >= 2 && !/^(self|himself|herself|various|narrator|host)$/i.test(n));
  } catch (e) { return []; }
}
// Older cache entries predate the cast field; fill it in once.
async function ensureCast(tv, show) {
  if (!tv || tv.cast) return tv;
  tv.cast = await tvmazeCast(tv.id);
  fs.writeFileSync(path.join(CACHE_DIR, 'tvmaze-' + slug(show) + '.json'), JSON.stringify(tv));
  return tv;
}

// ---- Archive: wide search -----------------------------------------------------------------
async function scrapeQuery(q, key) {
  const items = [];
  let cursor = null;
  for (let page = 0; page < 4; page++) {
    const url = 'https://archive.org/services/search/v1/scrape?' + new URLSearchParams({
      q, fields: 'identifier,title,description,subject,year,downloads,collection,creator', count: String(SCRAPE_COUNT),
      ...(cursor ? { cursor } : {}),
    });
    const j = await getJson(url, `${key}-${page}`);
    items.push(...(j.items || []));
    cursor = j.cursor;
    if (!cursor || items.length >= 2000) break;
  }
  return items;
}
// Wide net: the show's words anywhere. Narrow net (for common-word titles that flood the wide
// net): the words in the TITLE, plus the words anywhere alongside a lead actor, character or
// the network. Both nets are cast when narrow is on; results merge by identifier.
async function scrape(show, tv, narrow) {
  const words = searchWords(show);
  const wide = `(${words.join(' AND ')}) AND mediatype:movies`;
  const wideItems = await scrapeQuery(wide, `scrape-${slug(show)}`);
  if (!narrow) return wideItems;
  const core = norm(show).replace(/^the /, '');
  const disc = [...(tv && tv.cast ? tv.cast : []), ...(tv && tv.network ? [tv.network] : [])].slice(0, 9).map((d) => `"${d.replace(/"/g, '')}"`);
  const items = [];
  const seen = new Set();
  const add = (list) => { for (const it of list) if (!seen.has(it.identifier)) { seen.add(it.identifier); items.push(it); } };
  add(await scrapeQuery(`title:(${words.join(' AND ')}) AND mediatype:movies`, `scrape-title-${slug(show)}`));
  if (disc.length) add(await scrapeQuery(`(${words.join(' AND ')}) AND (${disc.join(' OR ')}) AND mediatype:movies`, `scrape-cast-${slug(show)}`));
  // Flooded wide results carry little signal; keep only the ones whose title or id has the name.
  add(wideItems.filter((it) => norm(it.title).includes(core) || norm(it.identifier).includes(core.replace(/ /g, ''))));
  return items;
}

// Score an item from search fields alone (0..1): does it look like it holds this show?
function itemScore(it, show, tv, narrow) {
  const core = norm(show).replace(/^the /, '');
  const title = norm(it.title), desc = norm(Array.isArray(it.description) ? it.description.join(' ') : it.description), id = norm(it.identifier);
  const subj = norm(Array.isArray(it.subject) ? it.subject.join(' ') : it.subject);
  const all = `${title} ${desc} ${subj}`;
  let s = 0;
  if (title.includes(core)) s += 0.5; else if (id.includes(core.replace(/ /g, ''))) s += 0.4; else if (desc.includes(core) || subj.includes(core)) s += 0.3;
  const epMark = /\bs\d{1,2}\s?e\d{1,3}\b|\bseason\b|\bcomplete\b|\bepisodes?\b|\bseries\b|\barchive\b|\bcollection\b|\bmarathon\b|\bbumps?\b/.test(title + ' ' + desc);
  if (epMark) s += 0.2;
  // Lead actor / character / network present: strong evidence it is THIS show and not a namesake.
  const disc = [...((tv && tv.cast) || []), ...((tv && tv.network) ? [tv.network] : [])].map(norm).filter((d) => d.length >= 4);
  const discHit = disc.some((d) => all.includes(d));
  if (discHit) s += 0.3;
  // Narrow mode (common-word title): without a cast / character / network hit, do not open it.
  // Episode-marker words ("collection", "archive", "series") are too common to count here.
  if (narrow && !discHit) s = Math.min(s, 0.25);
  if (/\bytp\b|youtube poop|\bamv\b|remix|reaction|review|gameplay|soundtrack|\bost\b|theme song|trailer|\bpromo\b/.test(title)) s -= 0.4;
  if (tv && tv.premiered && it.year && +it.year < +tv.premiered.slice(0, 4) - 1) s -= 0.3;
  const colls = (Array.isArray(it.collection) ? it.collection : [it.collection]).filter((c) => c && !String(c).startsWith('fav-'));
  if (colls.some((c) => /television|vhsvault|animation|cartoon/i.test(c))) s += 0.05;
  return Math.max(0, Math.min(1, s));
}

// ---- Archive: open an item, judge its files ---------------------------------------------
function runtimeBand(seconds, tv) {
  const m = seconds / 60;
  const rt = tv && tv.runtime ? tv.runtime : null;
  if (m < 4) return 'clip';
  if (rt) {
    if (m >= rt * 0.7 && m <= rt * 1.35) return 'episode';
    if (m >= rt * 1.7 && m <= rt * 2.5) return 'double';
    if (m > rt * 4) return 'block';
    return 'odd';
  }
  if (m <= 16) return 'short';
  if (m <= 32) return 'half-hour';
  if (m <= 65) return 'hour';
  return 'block';
}

const EP_RE = [
  /\bs(\d{1,2})\s?e(\d{1,3})\b/i, /\b(\d{1,2})x(\d{1,3})\b/i, /\bseason\s?(\d{1,2})\D{0,12}ep(?:isode)?\s?(\d{1,3})\b/i,
  /\b(\d)(\d{2})\b(?=\D*(?:-|\.| ))/, // 101, 213 style
];
function parseEp(name) {
  for (const re of EP_RE) { const m = re.exec(name); if (m) return { season: +m[1], episode: +m[2] }; }
  const e = /\b(?:ep|episode)\s?(\d{1,3})\b/i.exec(name); if (e) return { season: null, episode: +e[1] };
  return null;
}

async function openItem(id, show, tv) {
  const j = await getJson('https://archive.org/metadata/' + encodeURIComponent(id), 'meta-' + id.replace(/[^a-z0-9._-]/gi, '_'));
  const m = j.metadata || {};
  const core = norm(show).replace(/^the /, '');
  const files = (j.files || []).filter((f) => VIDEO_FORMATS.has(f.format) && f.length);
  // Group originals with their IA derivatives (same stem) so each episode counts once.
  const byStem = new Map();
  for (const f of files) {
    const stem = f.name.replace(/\.ia\.mp4$/i, '').replace(/\.[^.]+$/, '');
    const g = byStem.get(stem) || { stem, files: [] };
    g.files.push(f); byStem.set(stem, g);
  }
  const vids = [];
  for (const g of byStem.values()) {
    const best = g.files.find((f) => PLAYABLE_FORMATS.has(f.format) && f.source === 'original') || g.files.find((f) => PLAYABLE_FORMATS.has(f.format)) || g.files[0];
    const secs = parseFloat(best.length) || 0;
    const nameHit = norm(g.stem).includes(core);
    vids.push({
      name: g.stem, file: best.name, format: best.format, playable: PLAYABLE_FORMATS.has(best.format),
      seconds: Math.round(secs), band: runtimeBand(secs, tv), sizeMB: Math.round((+best.size || 0) / 1e6),
      nameHit, ep: parseEp(g.stem), url: `https://archive.org/download/${id}/${encodeURIComponent(best.name)}`,
    });
  }
  const episodes = vids.filter((v) => v.band === 'episode' || v.band === 'double' || (!tv && (v.band === 'short' || v.band === 'half-hour' || v.band === 'hour')));
  const hits = episodes.filter((v) => v.nameHit).length;
  return {
    id, title: m.title, uploader: m.uploader, date: m.date, collection: m.collection,
    description: String(m.description || '').slice(0, 300),
    totalVideo: vids.length, episodeShaped: episodes.length, nameHits: hits,
    files: vids,
  };
}

// ---- per show -----------------------------------------------------------------------------
async function huntShow(entry) {
  const show = entry.name;
  console.log(`\n== ${show} (${entry.type} / ${entry.network})`);
  const tv = await ensureCast(await tvmaze(show), show);
  console.log(tv ? `   TVmaze: ${tv.name}, ${tv.runtime} min, ${tv.episodes.length} episodes, from ${tv.premiered}` : '   TVmaze: no match');
  // Prior candidates (if any) are kept and merged; their mention count decides the narrow net.
  const outFile = path.join(OUT_DIR, slug(show) + '.json');
  const prior = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : null;
  const narrow = searchWords(show).length <= 1 || (prior && prior.archiveMentions >= 1500);
  const items = await scrape((OVERRIDES[slug(show)] || {}).searchName || show, tv, narrow); // overrides.json may give the plain name to search with
  const scored = items.map((it) => ({ ...it, score: itemScore(it, show, tv, narrow) })).filter((it) => it.score >= 0.3)
    .sort((a, b) => b.score - a.score || (+b.downloads || 0) - (+a.downloads || 0));
  console.log(`   Archive mentions: ${items.length}${narrow ? ' (narrow net)' : ''}; worth opening: ${scored.length}; opening up to ${MAX_ITEMS_TO_OPEN}`);
  const opened = prior ? prior.items.map((o) => ({ ...o })) : [];
  const already = new Set(opened.map((o) => o.id));
  for (const it of scored.filter((it) => !already.has(it.identifier)).slice(0, MAX_ITEMS_TO_OPEN)) {
    try {
      const o = await openItem(it.identifier, show, tv);
      o.searchScore = it.score; o.year = it.year; o.downloads = it.downloads;
      opened.push(o);
      if (o.episodeShaped) console.log(`   + ${it.identifier}: ${o.episodeShaped} episode-shaped of ${o.totalVideo} video (${o.nameHits} named) | ${String(o.title).slice(0, 60)}`);
    } catch (e) {
      if (/budget/.test(e.message)) { console.log('   budget exhausted; stopping this show'); break; }
      console.log(`   ! ${it.identifier}: ${e.message}`);
    }
  }
  const episodeFiles = opened.reduce((n, o) => n + o.episodeShaped, 0);
  const named = opened.reduce((n, o) => n + o.nameHits, 0);
  const result = {
    show, type: entry.type, network: entry.network, huntedAt: new Date().toISOString(),
    tvmaze: tv ? { id: tv.id, runtime: tv.runtime, premiered: tv.premiered, episodes: tv.episodes.length } : null,
    archiveMentions: items.length, itemsOpened: opened.length, episodeShapedFiles: episodeFiles, namedEpisodeFiles: named,
    verdict: episodeFiles >= 8 ? 'FOUND' : episodeFiles >= 1 ? 'TRACES' : 'NOT FOUND',
    items: opened.sort((a, b) => b.episodeShaped - a.episodeShaped),
  };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, slug(show) + '.json'), JSON.stringify(result, null, 2));
  console.log(`   => ${result.verdict}: ${episodeFiles} episode-shaped files across ${opened.length} items (${calls} calls used)`);
  return result;
}

function writeSummary() {
  const rows = fs.existsSync(OUT_DIR) ? fs.readdirSync(OUT_DIR).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(OUT_DIR, f), 'utf8'))) : [];
  const order = { FOUND: 0, TRACES: 1, 'NOT FOUND': 2 };
  rows.sort((a, b) => order[a.verdict] - order[b.verdict] || a.type.localeCompare(b.type) || a.show.localeCompare(b.show));
  const tally = rows.reduce((t, r) => ((t[r.verdict] = (t[r.verdict] || 0) + 1), t), {});
  const lines = ['# The Hunt', '', `Wide-net results, ${rows.length} shows: ` + Object.entries(tally).map(([k, v]) => `${v} ${k}`).join(', ') + '.', '',
    'Mentions = Archive items naming the show in any field. Episode-shaped = video files whose runtime fits the show\'s TVmaze runtime. Named = those whose filename also carries the show name. FOUND = 8+ episode-shaped files.', '',
    '| Verdict | Show | Row | Mentions | Opened | Episode-shaped | Named | Best item |', '|---|---|---|---|---|---|---|---|'];
  for (const r of rows) {
    const best = r.items[0];
    lines.push(`| ${r.verdict} | ${r.show} | ${r.type} | ${r.archiveMentions} | ${r.itemsOpened} | ${r.episodeShapedFiles} | ${r.namedEpisodeFiles} | ${best ? `${best.id} (${best.episodeShaped})` : ''} |`);
  }
  fs.writeFileSync(OUT_MD, lines.join('\n') + '\n');
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
  if (opt('--budget')) budget = +opt('--budget') || budget;
  if (opt('--open')) MAX_ITEMS_TO_OPEN = +opt('--open') || MAX_ITEMS_TO_OPEN;
  if (opt('--pause')) PAUSE_MS = +opt('--pause') || PAUSE_MS;
  const type = opt('--type');
  const tag = opt('--tag'); // only shows carrying this collection tag
  const first = opt('--first'); // with --priority: shows carrying this tag go before every row
  const missing = args.includes('--missing');
  const refresh = args.includes('--refresh');
  const fresh = args.includes('--fresh');
  const pass2 = args.includes('--pass2'); // re-hunt shows under 50% coverage with the narrow net + deeper opening
  const unplayable = args.includes('--unplayable'); // re-hunt shows whose picks will not play in a browser (mkv / AC3 / x265)
  const valued = new Set(['--budget', '--open', '--pause', '--type', '--tag', '--first']);
  const filter = (args.find((a, i) => !a.startsWith('--') && !valued.has(args[i - 1])) || '').toLowerCase();
  const notThere = new Set(CENSUS.filter((r) => r.verdict === 'NOT THERE').map((r) => r.show));
  const hunted = (s) => fs.existsSync(path.join(OUT_DIR, slug(s.name) + '.json'));
  const grid = (s) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'catalog', 'shows', slug(s.name) + '.json'), 'utf8')); } catch (e) { return null; } };
  const coverage = (s) => { const g = grid(s); return g && g.coverage ? g.coverage.pct : 0; };
  const unplayableCount = (s) => { const g = grid(s); return g && g.seasons ? g.seasons.reduce((n, se) => n + se.episodes.filter((e) => e.file && !e.file.playable).length, 0) : 0; };
  // --priority: hunt the rows most likely to be rich on the Archive first; streaming-era and
  // non-English rows (thinnest) last, so the valuable shelves fill tonight.
  const PRIORITY = ['Classic TV', 'Documentary & Geographic', 'MTV', 'Adult Swim', 'Animated', '90s Sitcoms', 'Sketch and Comedy', 'British and Beyond',
    'Internet Comedy', 'Late Night', 'Sci-Fi, Fantasy and Horror', 'Drama', '2000s and Later Sitcoms', 'Reality & Talk', 'Streaming Era', 'Anime', 'World TV'];
  const priority = args.includes('--priority') || args.includes('--balance');
  // --balance: hunt the rows with the FEWEST playing shows first, so the shelves even out (B 2026-10-14)
  let ORDER = PRIORITY;
  const playing = {}, playingTag = {}; // rows and collections, by shows that play right now
  let lightness = null;
  if (args.includes('--balance')) {
    for (const s of LIST.shows) { const g = grid(s); if (g && g.seasons && g.seasons.some((se) => se.episodes.some((e) => e.file && e.file.playable && !e.file.langRisk))) { playing[s.type] = (playing[s.type] || 0) + 1; for (const t of s.tags || []) playingTag[t] = (playingTag[t] || 0) + 1; } }
    ORDER = [...new Set(LIST.shows.map((s) => s.type))].sort((a, b) => (playing[a] || 0) - (playing[b] || 0) || PRIORITY.indexOf(a) - PRIORITY.indexOf(b));
    // a show is as light as the lightest shelf it sits on: a Christian drama hunts with the Christian collection (4), not with Drama (24)
    lightness = (s) => Math.min(playing[s.type] || 0, ...(s.tags || []).map((t) => playingTag[t] || 0));
    console.log('balance order (rows): ' + ORDER.map((t) => t + ' (' + (playing[t] || 0) + ')').join(', '));
    const tags = [...new Set(LIST.shows.flatMap((s) => s.tags || []))].sort((a, b) => (playingTag[a] || 0) - (playingTag[b] || 0));
    console.log('collections: ' + tags.map((t) => t + ' (' + (playingTag[t] || 0) + ')').join(', '));
  }
  const firsts = first ? first.split(',').map((t) => t.trim()) : []; // comma list: earlier tags hunt earlier
  // Shows added by a scout (entry.added) queue behind the whole curated list, row order kept.
  const rank = (s) => { const fi = firsts.findIndex((t) => (s.tags || []).includes(t)); if (fi >= 0) return fi - firsts.length; const i = ORDER.indexOf(s.type); const base = lightness ? lightness(s) * 100 + (i < 0 ? ORDER.length : i) : (i < 0 ? ORDER.length : i); return base + (s.added ? 100000 : 0); };
  const jobs = LIST.shows.filter((s) => (filter ? s.name.toLowerCase().includes(filter) : true) && (type ? s.type === type : true) && (tag ? (s.tags || []).includes(tag) : true)
    && (missing ? notThere.has(s.name) : true)
    && (unplayable ? unplayableCount(s) >= 3 : pass2 ? coverage(s) < 50 : (fresh || filter ? true : !hunted(s))))
    .sort((a, b) => (unplayable ? unplayableCount(b) - unplayableCount(a) : priority ? rank(a) - rank(b) : 0));
  console.log(`${jobs.length} shows to hunt, budget ${budget} Archive calls, open ${MAX_ITEMS_TO_OPEN} items/show, ${PAUSE_MS}ms pause`);
  for (const j of jobs) {
    if (calls >= budget) { console.log('\nBudget spent; stopping. Re-run to continue (cached calls are free).'); break; }
    try { await huntShow(j); } catch (e) { console.log(`   !! ${j.name}: ${e.message}`); }
    if (refresh) {
      try { for (const s of ['match.js', 'db.js', 'preview.js']) execFileSync(process.execPath, [path.join(__dirname, s)], { stdio: 'ignore' }); }
      catch (e) { console.log('   (refresh failed: ' + e.message.slice(0, 80) + ')'); }
    }
  }
  writeSummary();
  console.log(`\nDone. ${calls} Archive calls. Summary in docs/HUNT.md, details in catalog/candidates/.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
