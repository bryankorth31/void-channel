// CANDIDATES: pull TMDB's popular, top-rated and trending TV lists (what voidtv.org shows raw),
// keep English-language scripted shows from 1990 on, drop kids / reality / news / talk / soap,
// and report what is NOT on scripts/show-list.json yet. Writes catalog/candidates-tv.json and
// docs/CANDIDATES.md for B to pick from. TMDB only; no Archive calls.
// Usage: node scripts/candidates.js [--pages 40]
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PROFILE = require('./lib/profile');
const LIST = JSON.parse(fs.readFileSync(PROFILE.listFile, 'utf8'));
const OUT = path.join(PROFILE.catalogDir, 'candidates-tv.json');
const OUT_MD = path.join(PROFILE.docsDir, 'CANDIDATES.md');
const env = fs.existsSync(path.join(ROOT, 'backend', '.env')) ? fs.readFileSync(path.join(ROOT, 'backend', '.env'), 'utf8') : '';
const TOKEN = (process.env.TMDB_READ_TOKEN || (env.match(/^TMDB_READ_TOKEN=(.+)$/m) || [])[1] || '').trim();
if (!TOKEN) { console.error('No TMDB_READ_TOKEN'); process.exit(1); }

const DROP_GENRES = new Set([10762, 10764, 10763, 10767, 10766]); // Kids, Reality, News, Talk, Soap
const GENRE_NAMES = { 10759: 'Action & Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime', 99: 'Documentary', 18: 'Drama', 10751: 'Family', 10762: 'Kids', 9648: 'Mystery', 10763: 'News', 10764: 'Reality', 10765: 'Sci-Fi & Fantasy', 10766: 'Soap', 10767: 'Talk', 10768: 'War & Politics', 37: 'Western' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

async function tmdb(p, params = {}) {
  const url = 'https://api.themoviedb.org/3' + p + '?' + new URLSearchParams(params);
  for (let a = 0; a < 5; a++) {
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + TOKEN, accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
    if (r.status === 429) { await sleep(2000 * (a + 1)); continue; }
    if (!r.ok) throw new Error('HTTP ' + r.status);
    await sleep(220);
    return r.json();
  }
  throw new Error('rate limited');
}

async function main() {
  const args = process.argv.slice(2);
  const pi = args.indexOf('--pages'); const pages = pi >= 0 ? +args[pi + 1] : 40;
  const all_ = args.includes('--all'); // keep every language and genre except kids (B: "i dont want things dropped")
  const have = new Set(LIST.shows.map((s) => norm(s.name)));
  const seen = new Map();
  const sources = [['top_rated', '/tv/top_rated', pages], ['popular', '/tv/popular', pages], ['trending', '/trending/tv/week', Math.min(pages, 20)]];
  for (const [name, p, n] of sources) {
    for (let page = 1; page <= n; page++) {
      const j = await tmdb(p, { page: String(page), language: 'en-US' });
      for (const s of j.results || []) {
        if (!all_ && s.original_language !== 'en') continue;
        const year = parseInt((s.first_air_date || '').slice(0, 4), 10);
        if (!year || year < 1990 || year > new Date().getFullYear()) continue;
        const gids = s.genre_ids || [];
        if (gids.includes(10762)) continue; // Kids: always out
        if (gids.includes(10751) && !gids.includes(16)) continue; // family live-action: out
        if (!all_ && gids.some((g) => DROP_GENRES.has(g))) continue;
        const e = seen.get(s.id) || { tmdbId: s.id, name: s.name, year, language: s.original_language, genres: gids.map((g) => GENRE_NAMES[g] || g), rating: s.vote_average, votes: s.vote_count, country: (s.origin_country || [])[0], overview: (s.overview || '').slice(0, 160), poster: s.poster_path ? 'https://image.tmdb.org/t/p/w342' + s.poster_path : null, lists: [] };
        if (!e.lists.includes(name)) e.lists.push(name);
        seen.set(s.id, e);
      }
      if (page >= (j.total_pages || 1)) break;
    }
    console.log(`${name}: ${seen.size} kept so far`);
  }
  const all = [...seen.values()];
  const missing = all.filter((s) => !have.has(norm(s.name))).sort((a, b) => b.votes - a.votes);
  fs.writeFileSync(OUT, JSON.stringify({ pulledAt: new Date().toISOString(), kept: all.length, missing }, null, 1));
  const lines = ['# Candidate shows from TMDB lists', '', `${all.length} English scripted shows (1990 on, no kids/reality/news/talk/soap) across TMDB popular, top-rated and trending; ${missing.length} are not on show-list.json yet. Sorted by votes.`, '',
    '| Show | Year | Country | Genres | Rating | Votes | Lists |', '|---|---|---|---|---|---|---|'];
  for (const s of missing) lines.push(`| ${s.name} | ${s.year} | ${s.country || ''} | ${s.genres.join(', ')} | ${s.rating} | ${s.votes} | ${s.lists.join(' ')} |`);
  fs.writeFileSync(OUT_MD, lines.join('\n') + '\n');
  console.log(`\n${all.length} kept, ${missing.length} not on our list -> docs/CANDIDATES.md`);
}
main().catch((e) => { console.error(e); process.exit(1); });
