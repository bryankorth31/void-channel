// TV MOVIES AND SPECIALS, the list side: pull every English-language made-for-TV movie from
// 1990 on out of TMDB (its "TV Movie" genre, id 10770), plus stand-up and TV specials by
// keyword, into catalog/tvmovies-list.json. This is the reference list the hunt compares the
// Archive against: title + year + runtime is the identity, like a show's episode list.
// Usage: node scripts/tvmovies.js              (all years 1990..now; resumes per year)
//        node scripts/tvmovies.js --year 1994  (one year)
//        node scripts/tvmovies.js --runtimes   (fill in runtimes for entries that lack one)
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PROFILE = require('./lib/profile');
const CACHE_DIR = path.join(PROFILE.catalogDir, 'cache', 'tmdb-discover');
const OUT = path.join(PROFILE.catalogDir, 'tvmovies-list.json');
const env = fs.existsSync(path.join(ROOT, 'backend', '.env')) ? fs.readFileSync(path.join(ROOT, 'backend', '.env'), 'utf8') : '';
const TOKEN = (process.env.TMDB_READ_TOKEN || (env.match(/^TMDB_READ_TOKEN=(.+)$/m) || [])[1] || '').trim();
if (!TOKEN) { console.error('No TMDB_READ_TOKEN in backend/.env'); process.exit(1); }
const TV_MOVIE = 10770;
const THIS_YEAR = new Date().getFullYear();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function tmdb(p, params = {}) {
  const url = 'https://api.themoviedb.org/3' + p + '?' + new URLSearchParams(params);
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + TOKEN, accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
    if (r.status === 429) { await sleep(2000 * (attempt + 1)); continue; }
    if (!r.ok) throw new Error('HTTP ' + r.status);
    await sleep(220);
    return r.json();
  }
  throw new Error('rate limited');
}

// One year of TV movies, all pages (TMDB caps a query at 500 pages; a year never gets near it).
async function discoverYear(year) {
  const cf = path.join(CACHE_DIR, `tvmovie-${year}.json`);
  if (fs.existsSync(cf)) return JSON.parse(fs.readFileSync(cf, 'utf8'));
  const all = [];
  for (let page = 1; page <= 500; page++) {
    const j = await tmdb('/discover/movie', {
      with_genres: String(TV_MOVIE), with_original_language: 'en', primary_release_year: String(year),
      sort_by: 'popularity.desc', include_adult: 'true', page: String(page),
    });
    all.push(...(j.results || []));
    if (page >= (j.total_pages || 1)) break;
  }
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cf, JSON.stringify(all));
  return all;
}

// Specials: TMDB keywords for stand-up and television specials, 1990 on.
async function discoverSpecials() {
  const cf = path.join(CACHE_DIR, 'specials.json');
  if (fs.existsSync(cf)) return JSON.parse(fs.readFileSync(cf, 'utf8'));
  const kw = [];
  for (const q of ['stand-up comedy', 'television special', 'tv special', 'comedy special', 'holiday special']) {
    const j = await tmdb('/search/keyword', { query: q });
    for (const k of (j.results || []).slice(0, 2)) kw.push(k.id);
  }
  const all = [];
  for (let page = 1; page <= 500; page++) {
    const j = await tmdb('/discover/movie', {
      with_keywords: [...new Set(kw)].join('|'), with_original_language: 'en', 'primary_release_date.gte': '1990-01-01',
      sort_by: 'popularity.desc', include_adult: 'true', page: String(page),
    });
    all.push(...(j.results || []));
    if (page >= (j.total_pages || 1)) break;
  }
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cf, JSON.stringify(all));
  return all;
}

function slim(m, kind) {
  return {
    tmdbId: m.id, kind, title: m.title, original: m.original_title !== m.title ? m.original_title : undefined,
    year: (m.release_date || '').slice(0, 4) || null, overview: m.overview || '', popularity: Math.round(m.popularity || 0),
    rating: m.vote_average ? Math.round(m.vote_average * 10) / 10 : null, votes: m.vote_count || 0,
    poster: m.poster_path ? 'https://image.tmdb.org/t/p/w342' + m.poster_path : null,
    backdrop: m.backdrop_path ? 'https://image.tmdb.org/t/p/w1280' + m.backdrop_path : null,
    genres: m.genre_ids || [], adult: !!m.adult, runtime: null,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const yi = args.indexOf('--year'); const onlyYear = yi >= 0 ? +args[yi + 1] : null;
  const list = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { items: [] };
  const byId = new Map(list.items.map((m) => [m.tmdbId, m]));
  if (args.includes('--runtimes')) {
    // Runtime needs a detail call per title; do the popular ones first, resume any time.
    const todo = list.items.filter((m) => m.runtime == null).sort((a, b) => b.popularity - a.popularity);
    const cap = +(args[args.indexOf('--runtimes') + 1]) || 2000;
    let n = 0;
    for (const m of todo.slice(0, cap)) {
      try {
        const d = await tmdb('/movie/' + m.tmdbId);
        m.runtime = d.runtime || 0; m.imdb = d.imdb_id || null;
        m.companies = (d.production_companies || []).map((c) => c.name).slice(0, 4);
        // Kids' networks make kids' movies; B's rule keeps them off the shelf.
        m.kids = m.companies.some((c) => /disney|nickelodeon|nick jr|cartoon network|pbs kids|boomerang|mattel|hasbro|dreamworks animation|sesame/i.test(c)) || undefined;
        n++;
      } catch (e) { m.runtime = 0; }
      if (n % 100 === 0) { fs.writeFileSync(OUT, JSON.stringify(list, null, 1)); console.log(`  ${n} runtimes filled`); }
    }
    fs.writeFileSync(OUT, JSON.stringify(list, null, 1));
    console.log(`${n} runtimes filled; ${list.items.filter((m) => m.runtime == null).length} still blank`);
    return;
  }
  const years = onlyYear ? [onlyYear] : Array.from({ length: THIS_YEAR - 1990 + 1 }, (_, i) => 1990 + i);
  for (const y of years) {
    const rows = await discoverYear(y);
    let added = 0;
    for (const m of rows) if (!byId.has(m.id)) { const s = slim(m, 'tv-movie'); byId.set(m.id, s); list.items.push(s); added++; }
    console.log(`${y}: ${rows.length} TV movies (${added} new)`);
  }
  if (!onlyYear) {
    const sp = await discoverSpecials();
    let added = 0;
    for (const m of sp) if (!byId.has(m.id)) { const s = slim(m, 'special'); byId.set(m.id, s); list.items.push(s); added++; }
    console.log(`specials: ${sp.length} (${added} new)`);
  }
  list.pulledAt = new Date().toISOString();
  list.count = list.items.length;
  fs.writeFileSync(OUT, JSON.stringify(list, null, 1));
  console.log(`\n${list.items.length} titles in catalog/tvmovies-list.json`);
}
main().catch((e) => { console.error(e); process.exit(1); });
