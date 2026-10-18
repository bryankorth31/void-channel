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
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PROFILE = require('./lib/profile');
const LIST = JSON.parse(fs.readFileSync(path.join(PROFILE.catalogDir, 'tvmovies-list.json'), 'utf8')).items;
const OUT_DIR = path.join(PROFILE.catalogDir, 'movies');
const OUT_MD = path.join(PROFILE.docsDir, 'MOVIES.md');
const CACHE_DIR = path.join(PROFILE.catalogDir, 'cache');

let PAUSE_MS = 3000;
const BACKOFF_MS = [60000, 180000, 600000];
let ITEMS_TO_OPEN = 6;
const LIVE = 0.85, REVIEW = 0.5;
const KIDS_GENRES = new Set([10751, 16]); // Family, Animation: off the adult shelf by B's rule
const KIDS_RE = /disney|nickelodeon|barbie|\blego\b|scooby|pok[eé]mon|my little pony|high school musical|camp rock|descendants|wizards of waverly|hannah montana|z-?o-?m-?b-?i-?e-?s|teen beach|jonas|muppet|sesame|care bears|strawberry shortcake|bratz|monster high|power rangers|veggietales|thomas (and|&) friends|paw patrol|peppa|dora|bluey|cocomelon|kidz? bop|starstruck|lemonade mouth|cheetah girls|princess protection|phineas|kim possible|good luck charlie|suite life|cloud 9|invisible sister|how to build a better boy|adventures in babysitting|freaky friday|halloweentown|twitches|cadet kelly|zenon|smart house|johnny tsunami|brink!|motocrossed|luck of the irish|the thirteenth year|under wraps|don't look under the bed|phantom of the megaplex|get a clue|pixel perfect|stuck in the suburbs|go figure|read it and weep|jump in|minutemen|dadnapped|den brother|avalon high|geek charming|frenemies|radio rebel|girl vs\. monster|bad hair day|zapped|descendants|how to build|spongebob|rugrats|hey arnold|jimmy neutron|fairly odd|drake (and|&) josh|zoey 101|icarly|victorious|big time rush|bunk'd|liv and maddie|jessie|austin (and|&) ally|dog with a blog|lab rats|mighty med|kickin' it/i;
const JUNK_RE = /\btrailer\b|\bteaser\b|\bpromo\b|\breview\b|reaction|\brecap\b|\bclip\b|\bscene\b|behind the scenes|making of|interview|commentary|\bost\b|soundtrack|theme song|\bamv\b|\bytp\b|parody|fan ?made|\bfull movie in (hindi|tamil|telugu)\b|dubbed in|\bhindi dubbed\b|audiobook|\bcommercial\b|\bad\b/i;
// Browser playability from release tags (see match.js): no AC3/DTS audio, usually no HEVC video.
const AUDIO_RISK = /\b(dd ?5[. ]?1|dd ?2[. ]?0|ddp?\d|dd\+|e-?ac-?3|ac-?3|dts(-hd)?(-ma)?|truehd|atmos|flac)\b/i;
const VIDEO_RISK = /\b(x ?265|hevc|h[. ]?265|10 ?bit|av1|xvid|divx)\b/i;
// Dual-audio and foreign-dub rips: the browser plays whichever track comes first, often not English.
const LANG_RISK = /\b(dual[ .-]?audio|multi[ .-]?audio|multi|hindi|tamil|telugu|urdu|vegamovies|filmyzilla|filmywap|moviesflix|dubbed|dublado|latino|castellano|vf|vff|vfq|truefrench|french|vostfr|ita[ .-]eng|rus[ .-]eng|deutsch|german|espa[nñ]ol|italiano|portugu[eê]s)\b/i;
// Release names use . _ - as separators; underscores are word characters, so normalize before testing.
const tagText = (s) => String(s || '').replace(/[._\-\[\]()]+/g, ' ');
const langRisk = (s) => LANG_RISK.test(tagText(s));
const codecRisk = (name, format, playable) => { const t = tagText(name); return !playable ? 'container (' + format + ')' : AUDIO_RISK.test(t) ? 'audio (' + t.match(AUDIO_RISK)[0] + ')' : VIDEO_RISK.test(t) ? 'video (' + t.match(VIDEO_RISK)[0] + ')' : null; };
const VIDEO_FORMATS = new Set(['MPEG4', 'h.264', 'h.264 IA', 'Matroska', 'Ogg Video', 'WebM', 'Windows Media', 'AVI', 'QuickTime', 'MPEG2', 'MPEG1', 'RealMedia', 'Flash Video', 'DivX', 'XviD', '512Kb MPEG4', 'HiRes MPEG4', 'MPEG4 (h.264)']);
const PLAYABLE = new Set(['MPEG4', 'h.264', 'h.264 IA', 'WebM', 'Ogg Video', '512Kb MPEG4', 'HiRes MPEG4', 'MPEG4 (h.264)']);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let calls = 0, budget = 2000;
const norm = (s) => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const slug = (s) => norm(s).replace(/ /g, '-').replace(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/, '$1-show');
const STOP = new Set(['the', 'a', 'an', 'and', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'is', 'it']);
const QUALITY_RE = /\b(\d{3,4}p|x26[45]|h ?26[45]|hevc|aac|ac3|dvdrip|webrip|web dl|hdtv|bluray|bdrip|xvid|divx|mp4|mkv|avi|proper|repack|uncut|full movie|movie|film|tv movie|complete|remaster(ed)?|hd|sd|vhs|dvd|rip|eng|english|subs?)\b/g;

function bigrams(s) { const o = new Set(); for (let i = 0; i < s.length - 1; i++) o.add(s.slice(i, i + 2)); return o; }
function dice(a, b) { if (!a || !b) return 0; const A = bigrams(a), B = bigrams(b); let h = 0; for (const g of A) if (B.has(g)) h++; return (2 * h) / (A.size + B.size); }
function cleanTitle(s) { return norm(s).replace(/\b(19|20)\d{2}\b/g, ' ').replace(QUALITY_RE, ' ').replace(/\s+/g, ' ').trim(); }
function titleSim(a, b) {
  const x = cleanTitle(a), y = cleanTitle(b);
  if (!x || !y) return 0;
  const d = dice(x.replace(/ /g, ''), y.replace(/ /g, ''));
  const yt = y.split(' ').filter((w) => !STOP.has(w)), xs = new Set(x.split(' '));
  const overlap = yt.length ? yt.filter((w) => xs.has(w)).length / yt.length : 0;
  return Math.max(d, overlap * 0.95);
}

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

function words(title) {
  return norm(title).split(' ').filter((w) => w && !STOP.has(w));
}

async function search(m) {
  const w = words(m.title);
  if (!w.length) return [];
  // Title field first (precise), then anywhere (wide); merge by identifier.
  const q1 = `title:(${w.join(' AND ')}) AND mediatype:movies`;
  const q2 = `(${w.join(' AND ')}) AND mediatype:movies`;
  const items = [], seen = new Set();
  for (const [q, key] of [[q1, 'mscrape-title-' + m.tmdbId], [q2, 'mscrape-' + m.tmdbId]]) {
    const url = 'https://archive.org/services/search/v1/scrape?' + new URLSearchParams({ q, fields: 'identifier,title,description,year,downloads,collection', count: '300' });
    const j = await getJson(url, key);
    for (const it of j.items || []) if (!seen.has(it.identifier)) { seen.add(it.identifier); items.push(it); }
    if (items.length >= 300) break; // the title query alone was plenty
  }
  return items;
}

function itemScore(it, m) {
  const sim = titleSim(it.title, m.title);
  const text = norm(`${it.title} ${Array.isArray(it.description) ? it.description.join(' ') : it.description || ''}`);
  let s = sim;
  if (m.year && new RegExp(`\\b${m.year}\\b`).test(text)) s += 0.15;
  if (m.year && it.year && Math.abs(+it.year - +m.year) <= 1) s += 0.1;
  if (JUNK_RE.test(it.title || '')) s -= 0.5;
  if (/\bcollection\b|\bmarathon\b|\bblock\b|\btape\b/i.test(it.title || '') && sim < 0.9) s -= 0.1;
  return s;
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

async function openItem(id, m) {
  const j = await getJson('https://archive.org/metadata/' + encodeURIComponent(id), 'meta-' + id.replace(/[^a-z0-9._-]/gi, '_'));
  const meta = j.metadata || {};
  // The Archive returns a list for the title when an item has several; the catalog and the SQLite mirror want one string.
  const itemTitle = Array.isArray(meta.title) ? meta.title.join(' / ') : (meta.title == null ? '' : String(meta.title));
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
  return { id, title: itemTitle, uploader: meta.uploader, date: meta.date, files: out };
}

function judge(f, it, m) {
  let conf = 0;
  const sim = Math.max(it.score >= 0 ? titleSim(it.title, m.title) : 0, f.fileSim);
  if (sim >= 0.9) conf += 0.5; else if (sim >= 0.75) conf += 0.35; else if (sim >= 0.6) conf += 0.2; else return 0;
  if (f.band === 'match') conf += 0.35; else if (f.band === 'near') conf += 0.15; else if (f.band === 'feature') conf += 0.2; else if (f.band === 'short') conf += 0.05; else return 0;
  const text = norm(`${it.title} ${f.stem}`);
  if (m.year && new RegExp(`\\b${m.year}\\b`).test(text)) conf += 0.1;
  if (JUNK_RE.test(f.stem) || JUNK_RE.test(it.title || '')) conf -= 0.5;
  if (langRisk(f.stem) || langRisk(it.title)) conf -= 0.35; // lands in REVIEW, never LIVE
  if (!f.playable) conf -= 0.1;
  return Math.max(0, Math.min(1, conf));
}

async function huntMovie(m) {
  const items = (await search(m)).map((it) => ({ ...it, score: itemScore(it, m) })).filter((it) => it.score >= 0.6)
    .sort((a, b) => b.score - a.score || (+b.downloads || 0) - (+a.downloads || 0));
  const picks = [];
  let opened = 0;
  for (const it of items.slice(0, ITEMS_TO_OPEN)) {
    try {
      const o = await openItem(it.identifier, m); opened++;
      for (const f of o.files) { const conf = judge(f, it, m); if (conf >= REVIEW) picks.push({ conf: +conf.toFixed(2), ...f, itemTitle: o.title, uploader: o.uploader }); }
    } catch (e) { if (/budget/.test(e.message)) throw e; }
  }
  // A file that plays in a browser beats a cleaner one that will not; unplayable picks are never LIVE.
  picks.sort((a, b) => (b.playable - a.playable) || b.conf - a.conf || b.sizeMB - a.sizeMB);
  const best = picks[0] || null;
  const state = !best ? 'MISSING' : (best.conf >= LIVE && best.playable) ? 'LIVE' : 'REVIEW';
  const out = { tmdbId: m.tmdbId, kind: m.kind, title: m.title, year: m.year, runtime: m.runtime, rating: m.rating, votes: m.votes, poster: m.poster, backdrop: m.backdrop, overview: m.overview, genres: m.genres,
    huntedAt: new Date().toISOString(), archiveMentions: items.length, itemsOpened: opened, state, file: best, alternates: picks.slice(1, 4) };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, `${slug(m.title)}-${m.year || 'x'}.json`), JSON.stringify(out, null, 2));
  return out;
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
  const genreFirst = opt('--genre-first') ? +opt('--genre-first') : null; // TMDB genre id hunted before the rest (36 = History)
  const filter = (args.find((a, i) => !a.startsWith('--') && !valued.has(args[i - 1])) || '').toLowerCase();
  const hunted = (m) => fs.existsSync(path.join(OUT_DIR, `${slug(m.title)}-${m.year || 'x'}.json`));
  // Kids' TV movies are IN (B 2026-10-13: "kids movies are fine"); --no-kids excludes them if ever wanted.
  const noKids = args.includes('--no-kids');
  const isKids = (m) => noKids && (m.kids || (m.genres || []).some((g) => KIDS_GENRES.has(g)) || KIDS_RE.test(m.title));
  let jobs = LIST.filter((m) => m.year && +m.year >= 1990 && !isKids(m))
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
main().catch((e) => { console.error(e); process.exit(1); });
