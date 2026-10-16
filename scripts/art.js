// THE ART (builder stage 3): posters, backdrops, synopsis, genres and rating for every show,
// from TMDB. Writes catalog/art.json keyed by show slug; raw responses cached in catalog/cache.
// Year from TVmaze disambiguates namesakes (The Office 2005 vs 2001). TMDB asks for a credit
// line on the site: "This product uses the TMDB API but is not endorsed or certified by TMDB."
// Usage: node scripts/art.js            (shows without art yet)
//        node scripts/art.js --fresh    (re-fetch everything)
//        node scripts/art.js Seinfeld   (one show, re-fetched)
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PROFILE = require('./lib/profile');
const LIST = JSON.parse(fs.readFileSync(PROFILE.listFile, 'utf8'));
const CACHE_DIR = path.join(PROFILE.catalogDir, 'cache');
const OUT = path.join(PROFILE.catalogDir, 'art.json');
const IMG = 'https://image.tmdb.org/t/p/';

const env = fs.existsSync(path.join(ROOT, 'backend', '.env')) ? fs.readFileSync(path.join(ROOT, 'backend', '.env'), 'utf8') : '';
const TOKEN = (process.env.TMDB_READ_TOKEN || (env.match(/^TMDB_READ_TOKEN=(.+)$/m) || [])[1] || '').trim();
if (!TOKEN) { console.error('No TMDB_READ_TOKEN in backend/.env'); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slug = (s) => s.toLowerCase().replace(/&/g, ' and ').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/ /g, '-').replace(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/, '$1-show');

async function tmdb(p, params = {}) {
  const url = 'https://api.themoviedb.org/3' + p + '?' + new URLSearchParams(params);
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + TOKEN, accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
    if (r.status === 429) { await sleep(2000 * (attempt + 1)); continue; }
    if (!r.ok) throw new Error('HTTP ' + r.status);
    await sleep(250); // ~4 requests a second; well under TMDB's limit
    return r.json();
  }
  throw new Error('rate limited');
}

function tvmazeYear(show) {
  const f = path.join(CACHE_DIR, 'tvmaze-' + slug(show) + '.json');
  try { return parseInt(JSON.parse(fs.readFileSync(f, 'utf8')).premiered.slice(0, 4), 10) || null; } catch (e) { return null; }
}

const OVERRIDES = fs.existsSync(path.join(PROFILE.catalogDir, 'overrides.json')) ? JSON.parse(fs.readFileSync(path.join(PROFILE.catalogDir, 'overrides.json'), 'utf8')) : {};
async function lookup(entry) {
  const show = entry.name;
  const year = tvmazeYear(show);
  const cf = path.join(CACHE_DIR, 'tmdb-' + slug(show) + '.json');
  const ov = OVERRIDES[slug(show)] || {};
  let detail;
  if (fs.existsSync(cf)) { detail = JSON.parse(fs.readFileSync(cf, 'utf8')); if (ov.tmdbId && detail && detail.id !== ov.tmdbId) detail = null; } // an id set in HQ beats a stale cache
  if (detail) { /* cached */ }
  else if (ov.tmdbId) { // a fixed id from overrides.json wins (name collisions)
    detail = await tmdb('/tv/' + ov.tmdbId);
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(cf, JSON.stringify(detail));
  }
  else {
    const q = show.replace(/\s*\(.*?\)\s*/g, ' ').trim();
    let res = (await tmdb('/search/tv', { query: q, ...(year ? { first_air_date_year: String(year) } : {}) })).results || [];
    if (!res.length && year) res = (await tmdb('/search/tv', { query: q })).results || [];
    if (!res.length) return null;
    // Prefer the result whose first-air year matches TVmaze (within a year), else the top hit.
    const pick = res.find((r) => year && r.first_air_date && Math.abs(parseInt(r.first_air_date.slice(0, 4), 10) - year) <= 1) || res[0];
    detail = await tmdb('/tv/' + pick.id);
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(cf, JSON.stringify(detail));
  }
  return {
    tmdbId: detail.id,
    title: detail.name,
    year: (detail.first_air_date || '').slice(0, 4) || null,
    poster: detail.poster_path ? IMG + 'w342' + detail.poster_path : null,
    backdrop: detail.backdrop_path ? IMG + 'w1280' + detail.backdrop_path : null,
    overview: detail.overview || '',
    genres: (detail.genres || []).map((g) => g.name),
    rating: detail.vote_average ? Math.round(detail.vote_average * 10) / 10 : null,
    networks: (detail.networks || []).map((n) => n.name),
    country: (detail.origin_country || [])[0] || null,
    seasons: detail.number_of_seasons || null,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const fresh = args.includes('--fresh');
  const filter = (args.find((a) => !a.startsWith('--')) || '').toLowerCase();
  const art = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
  const SLUG_ONLY = (() => { const i = process.argv.indexOf('--slug'); return i >= 0 ? process.argv[i + 1] : null; })();
  let done = 0, miss = 0;
  for (const entry of LIST.shows) {
    const s = slug(entry.name);
    if (SLUG_ONLY ? s !== SLUG_ONLY : (filter && !entry.name.toLowerCase().includes(filter))) continue;
    const ovId = (OVERRIDES[s] || {}).tmdbId;
    if (!filter && !SLUG_ONLY && !fresh && art[s] && !(ovId && art[s].tmdbId !== ovId)) continue;
    if (filter || SLUG_ONLY || fresh) { try { fs.unlinkSync(path.join(CACHE_DIR, 'tmdb-' + s + '.json')); } catch (e) {} }
    try {
      const a = await lookup(entry);
      if (a) { art[s] = a; done++; if (done % 25 === 0) fs.writeFileSync(OUT, JSON.stringify(art, null, 1)); /* flush so the nightly time cap keeps what was fetched */ console.log(`${entry.name}  ->  ${a.title} (${a.year}) ${a.poster ? 'poster' : 'no poster'}, ${a.genres.join('/') || 'no genres'}`); }
      else { miss++; console.log(`${entry.name}  ->  no TMDB match`); }
    } catch (e) { miss++; console.log(`${entry.name}  ->  ${e.message}`); }
  }
  fs.writeFileSync(OUT, JSON.stringify(art, null, 1));
  console.log(`\n${done} fetched, ${miss} missing; ${Object.keys(art).length} shows with art in catalog/art.json`);
}
main().catch((e) => { console.error(e); process.exit(1); });
