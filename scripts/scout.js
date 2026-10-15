// SCOUT: find media we are NOT looking for yet. The hunt starts from a show name; the scout starts
// from the Archive and works back to shows:
//   1. TV-shaped uploads at large: items whose titles look like series rips (SxxEyy, Season N,
//      Complete Series, episode lists) across the subjects uploaders actually use, 1990+.
//   2. Uploader neighbours: the people who uploaded shows we accepted usually uploaded more of the
//      same kind; sweep their other items.
//   3. For each lead, infer the show title from the item title, group, open the best item to count
//      episode-shaped files, confirm with TVmaze (real show? year, type, genres, network), and
//      report what is not on scripts/show-list.json — plus the genres/types we keep seeing and
//      have no row or collection for (candidate categories).
// Writes catalog/scout.json and docs/SCOUT.md. Archive-facing: one job, polite; refuses to start
// while two hunts are already running (the ceiling) unless --force.
// Usage: node scripts/scout.js [--budget 600] [--pause 4000] [--open 60] [--force]
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const LIST = JSON.parse(fs.readFileSync(path.join(__dirname, 'show-list.json'), 'utf8'));
const CACHE_DIR = path.join(ROOT, 'catalog', 'cache');
const CAND_DIR = path.join(ROOT, 'catalog', 'candidates');
const SHOWS_DIR = path.join(ROOT, 'catalog', 'shows');
const OUT = path.join(ROOT, 'catalog', 'scout.json');
const OUT_MD = path.join(ROOT, 'docs', 'SCOUT.md');

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
let budget = +opt('--budget', 600);
const PAUSE_MS = +opt('--pause', 4000);
const OPEN = +opt('--open', 60);
const BACKOFF_MS = [60000, 180000, 600000];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let calls = 0;
const norm = (s) => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const slug = (s) => norm(s).replace(/ /g, '-').replace(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/, '$1-show');

function huntsRunning() {
  try {
    const out = execSync('powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name=\'node.exe\'\\" | Select-Object -ExpandProperty CommandLine"', { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    return (out.match(/hunt(-movies)?\.js|scout\.js/g) || []).length - 1; // minus this process
  } catch (_) { return 0; }
}

async function getJson(url, cacheKey) {
  const cf = cacheKey && path.join(CACHE_DIR, cacheKey + '.json');
  if (cf && fs.existsSync(cf)) return JSON.parse(fs.readFileSync(cf, 'utf8'));
  if (calls >= budget) throw new Error('budget exhausted');
  for (let attempt = 0; ; attempt++) {
    calls++;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(60000), headers: { 'user-agent': 'voidtv-scout/1 (offline catalog builder; one call at a time)' } });
      const text = await res.text();
      if (res.ok && text.trim().startsWith('{')) { const j = JSON.parse(text); if (cf) { fs.mkdirSync(CACHE_DIR, { recursive: true }); fs.writeFileSync(cf, text); } await sleep(PAUSE_MS); return j; }
      throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      if (attempt >= BACKOFF_MS.length) throw e;
      console.log(`    Archive refused (${e.message}); quiet for ${BACKOFF_MS[attempt] / 1000}s`);
      await sleep(BACKOFF_MS[attempt]);
    }
  }
}
async function scrapeQuery(q, key, pages = 2) {
  const items = []; let cursor = null;
  for (let page = 0; page < pages; page++) {
    const j = await getJson('https://archive.org/services/search/v1/scrape?' + new URLSearchParams({ q, fields: 'identifier,title,description,subject,year,downloads,collection,creator,uploader', count: '500', ...(cursor ? { cursor } : {}) }), `${key}-${page}`);
    items.push(...(j.items || [])); cursor = j.cursor; if (!cursor) break;
  }
  return items;
}

// Everything the hunt has already seen, so the scout only reports what is new.
function knownItems() {
  const seen = new Set();
  if (fs.existsSync(CAND_DIR)) for (const f of fs.readdirSync(CAND_DIR)) { try { for (const it of JSON.parse(fs.readFileSync(path.join(CAND_DIR, f), 'utf8')).items || []) seen.add(it.id); } catch (_) {} }
  return seen;
}
// Uploaders behind the files we accepted (from the metadata cache of the picked items).
function trustedUploaders() {
  const tally = {};
  if (!fs.existsSync(SHOWS_DIR)) return [];
  for (const f of fs.readdirSync(SHOWS_DIR)) {
    let g; try { g = JSON.parse(fs.readFileSync(path.join(SHOWS_DIR, f), 'utf8')); } catch (_) { continue; }
    const items = new Set(); for (const se of g.seasons || []) for (const e of se.episodes) if (e.file && e.file.playable && !e.file.langRisk && e.state === 'LIVE') items.add(e.file.item);
    for (const id of items) {
      const mf = path.join(CACHE_DIR, 'meta-' + id.replace(/[^a-z0-9._-]/gi, '_') + '.json');
      if (!fs.existsSync(mf)) continue;
      try { const m = JSON.parse(fs.readFileSync(mf, 'utf8')); const u = m.metadata && (m.metadata.uploader || (Array.isArray(m.metadata.creator) ? m.metadata.creator[0] : m.metadata.creator)); if (u && /@/.test(u)) tally[u] = (tally[u] || 0) + 1; } catch (_) {}
    }
  }
  return Object.entries(tally).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 25);
}

// "Seinfeld S03E04 The Dog (1991) 720p" -> "seinfeld"; "The Complete Series of Cheers" -> "cheers"
const TITLE_CUT = /\b(s\d{1,2}\s*e\d{1,3}|season\s*\d+|series\s*\d+|complete\s+series|complete\s+collection|the\s+complete|full\s+series|all\s+seasons?|episodes?\b|disc\s*\d+|vol(ume)?\.?\s*\d+|part\s*\d+|\d{3,4}p|hdtv|dvdrip|webrip|web-dl|bluray|x264|x265|h264|xvid|aac|ac3|\(\d{4}[-–]?\d{0,4}\)|\b(19|20)\d{2}\b)/i;
function inferTitle(title) {
  let t = String(title || '').replace(/\[.*?\]/g, ' ').replace(/[._]/g, ' ');
  const m = TITLE_CUT.exec(t); if (m && m.index > 2) t = t.slice(0, m.index);
  t = t.replace(/\s*[-–:|]\s*$/, '').replace(/^\s*(the\s+complete\s+series\s+of\s+)/i, '');
  t = t.split(/\s[-–|]\s/)[0];
  const n = norm(t).replace(/^the /, '');
  return n.length >= 3 && n.split(' ').length <= 6 ? n : null;
}
const LOOKS_LIKE_TV = /\b(s\d{1,2}e\d{1,3}|\d{1,2}x\d{2}|season|series|episode|complete|sitcom|tv show|television)\b/i;

async function tvmaze(name) {
  const key = 'tvmaze-' + slug(name); const cf = path.join(CACHE_DIR, key + '.json');
  if (fs.existsSync(cf)) { const t = JSON.parse(fs.readFileSync(cf, 'utf8')); return t && t.id ? { id: t.id, name: t.name, premiered: t.premiered, network: t.network, type: t.type, genres: t.genres, language: t.language } : t; }
  try {
    const r = await fetch('https://api.tvmaze.com/singlesearch/shows?q=' + encodeURIComponent(name), { signal: AbortSignal.timeout(20000) });
    await sleep(250);
    if (!r.ok) return null;
    const s = await r.json();
    return { id: s.id, name: s.name, premiered: s.premiered, network: ((s.network || s.webChannel || {}).name) || null, type: s.type, genres: s.genres || [], language: s.language, country: ((s.network || s.webChannel || {}).country || {}).code || null };
  } catch (_) { return null; }
}

function rowFor(tv) {
  const y = +(tv.premiered || '').slice(0, 4);
  const g = new Set(tv.genres || []);
  if (y && y < 1990) return 'Classic TV';
  if (tv.language && tv.language !== 'English') return tv.type === 'Animation' && tv.language === 'Japanese' ? 'Anime' : 'World TV';
  if (tv.type === 'Animation') return 'Animated';
  if (tv.type === 'Documentary') return 'Documentary & Geographic';
  if (['Reality', 'Talk Show', 'Game Show', 'Panel Show', 'Variety', 'Award Show'].includes(tv.type)) return 'Reality & Talk';
  if (tv.country && tv.country !== 'US') return 'British and Beyond';
  if (g.has('Science-Fiction') || g.has('Fantasy') || g.has('Horror') || g.has('Supernatural')) return 'Sci-Fi, Fantasy and Horror';
  if (g.has('Comedy') && !g.has('Drama')) return y >= 2000 ? '2000s and Later Sitcoms' : '90s Sitcoms';
  return 'Drama';
}

async function main() {
  const running = huntsRunning();
  if (running >= 2 && !args.includes('--force')) { console.log(`${running} Archive jobs already running (the ceiling is two). Try again when one finishes, or --force.`); process.exit(2); }
  const have = new Set(LIST.shows.map((s) => norm(s.name).replace(/^the /, '')));
  const seen = knownItems();
  const leads = new Map(); // inferred title -> { items: [] }
  const addLead = (it, via) => {
    if (seen.has(it.identifier)) return;
    const t = inferTitle(it.title); if (!t || have.has(t)) return;
    if (!LOOKS_LIKE_TV.test(it.title || '') && !LOOKS_LIKE_TV.test((it.subject || []).join ? it.subject.join(' ') : String(it.subject || ''))) return;
    const yr = +(it.year || 0); if (yr && yr < 1980) return;
    const L = leads.get(t) || { title: t, items: [], via: new Set() }; L.items.push(it); L.via.add(via); leads.set(t, L);
  };

  console.log(`Scout: budget ${budget} calls, ${PAUSE_MS}ms pause. ${seen.size} items already known.`);
  // 1. TV-shaped uploads at large
  const sweeps = [
    ['title:(s01e01 OR "season 1" OR "complete series") AND mediatype:movies AND year:[1990 TO 2026]', 'sweep-titles-a'],
    ['title:(episodes OR episode OR sitcom OR "tv series") AND mediatype:movies AND year:[1990 TO 2026]', 'sweep-titles-b'],
    ['subject:(sitcom OR "tv series" OR "television series" OR "tv show" OR "cartoon series" OR "animated series") AND mediatype:movies', 'sweep-subjects'],
    ['subject:(television OR tv) AND title:(season OR series OR complete) AND mediatype:movies', 'sweep-subject-season'],
  ];
  for (const [q, key] of sweeps) { try { for (const it of await scrapeQuery(q, `scout-${key}`, 3)) addLead(it, key); } catch (e) { console.log(`  ${key}: ${e.message}`); } console.log(`  ${key}: ${leads.size} leads so far`); }
  // 2. Uploader neighbours
  const uploaders = trustedUploaders();
  console.log(`  ${uploaders.length} trusted uploaders`);
  for (const [u] of uploaders) { try { for (const it of await scrapeQuery(`uploader:(${u}) AND mediatype:movies`, `scout-up-${slug(u)}`, 2)) addLead(it, 'uploader ' + u); } catch (e) { console.log(`  ${u}: ${e.message}`); break; } }
  console.log(`  ${leads.size} leads after uploaders`);

  // 3. Rank leads, open the best item of the top ones, confirm with TVmaze
  const ranked = [...leads.values()].map((L) => ({ ...L, via: [...L.via], downloads: L.items.reduce((n, it) => n + (+it.downloads || 0), 0) }))
    .sort((a, b) => b.items.length - a.items.length || b.downloads - a.downloads);
  const proposals = [];
  for (const L of ranked.slice(0, OPEN)) {
    const best = L.items.sort((a, b) => (+b.downloads || 0) - (+a.downloads || 0))[0];
    let files = 0, epShaped = 0;
    try {
      const m = await getJson('https://archive.org/metadata/' + encodeURIComponent(best.identifier), 'meta-' + best.identifier.replace(/[^a-z0-9._-]/gi, '_'));
      for (const f of m.files || []) { if (!/\.(mp4|mkv|avi|m4v|webm|ogv|mpg|mpeg|mov|wmv|flv)$/i.test(f.name)) continue; files++; const sec = +f.length || 0; if (sec >= 18 * 60 && sec <= 70 * 60) epShaped++; }
    } catch (e) { if (/budget/.test(e.message)) break; }
    const tv = await tvmaze(L.title);
    const name = tv && tv.name ? tv.name : null;
    if (name && have.has(norm(name).replace(/^the /, ''))) continue;
    proposals.push({ title: L.title, tvmaze: tv && tv.id ? { id: tv.id, name: tv.name, year: (tv.premiered || '').slice(0, 4), network: tv.network, type: tv.type, genres: tv.genres, language: tv.language, country: tv.country } : null, row: tv && tv.id ? rowFor(tv) : null, items: L.items.length, sample: best.identifier, sampleTitle: best.title, filesInSample: files, episodeShapedInSample: epShaped, downloads: L.downloads, via: L.via });
    process.stdout.write(`  ${L.title}: ${L.items.length} items, ${epShaped} ep-shaped, ${tv && tv.id ? 'TVmaze ' + tv.name + ' (' + (tv.premiered || '').slice(0, 4) + ')' : 'no TVmaze'}\n`);
  }

  // 4. Candidate categories: TVmaze types/genres and Archive subjects we keep seeing and do not serve
  const typeTally = {}, genreTally = {}, subjTally = {};
  for (const p of proposals) { if (!p.tvmaze) continue; typeTally[p.tvmaze.type] = (typeTally[p.tvmaze.type] || 0) + 1; for (const g of p.tvmaze.genres || []) genreTally[g] = (genreTally[g] || 0) + 1; }
  for (const L of ranked) for (const it of L.items) for (const s of (Array.isArray(it.subject) ? it.subject : String(it.subject || '').split(';'))) { const k = norm(s); if (k && k.length > 2 && k.length < 30) subjTally[k] = (subjTally[k] || 0) + 1; }
  const subjects = Object.entries(subjTally).sort((a, b) => b[1] - a[1]).slice(0, 40);

  fs.writeFileSync(OUT, JSON.stringify({ scoutedAt: new Date().toISOString(), calls, leads: ranked.length, proposals, types: typeTally, genres: genreTally, subjects }, null, 1));
  const confirmed = proposals.filter((p) => p.tvmaze && p.tvmaze.id).sort((a, b) => b.episodeShapedInSample - a.episodeShapedInSample || b.items - a.items);
  const unconfirmed = proposals.filter((p) => !p.tvmaze || !p.tvmaze.id).sort((a, b) => b.episodeShapedInSample - a.episodeShapedInSample);
  const md = [`# Scout — media we are not looking for yet`, '', `${new Date().toISOString().slice(0, 16)} · ${calls} Archive calls · ${ranked.length} leads from ${sweeps.length} sweeps + ${uploaders.length} trusted uploaders · ${proposals.length} opened`, '',
    `A lead is a group of Archive uploads whose titles read like a series we do not list. "Ep-shaped" counts files of 18–70 minutes in the best upload. Confirmed = TVmaze knows the show. Add a name to scripts/show-list.json (row suggested) and the hunt takes it from there.`, '',
    `## Confirmed shows not on the list (${confirmed.length})`, '', '| Show | Year | Type · Genres | Network | Suggested row | Uploads | Ep-shaped | Sample upload |', '|---|---|---|---|---|---|---|---|',
    ...confirmed.map((p) => `| ${p.tvmaze.name} | ${p.tvmaze.year} | ${p.tvmaze.type} · ${(p.tvmaze.genres || []).join(', ')} | ${p.tvmaze.network || ''} | ${p.row} | ${p.items} | ${p.episodeShapedInSample}/${p.filesInSample} | ${p.sample} |`), '',
    `## Leads TVmaze does not know (${unconfirmed.length}) — public access, web series, compilations, or a title the parser got wrong`, '', '| Inferred title | Uploads | Ep-shaped | Sample upload | Sample title |', '|---|---|---|---|---|',
    ...unconfirmed.map((p) => `| ${p.title} | ${p.items} | ${p.episodeShapedInSample}/${p.filesInSample} | ${p.sample} | ${String(p.sampleTitle || '').slice(0, 60)} |`), '',
    `## Candidate categories`, '', `TVmaze types among confirmed leads: ${Object.entries(typeTally).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(' · ')}`, '', `Genres: ${Object.entries(genreTally).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(' · ')}`, '', `Archive subjects the leads carry (what uploaders call this stuff): ${subjects.map(([k, n]) => `${k} ${n}`).join(' · ')}`, ''];
  fs.writeFileSync(OUT_MD, md.join('\n'));
  console.log(`\n${confirmed.length} confirmed, ${unconfirmed.length} unconfirmed -> docs/SCOUT.md (${calls} calls)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
