// THE ART (builder stage 3): posters, backdrops, synopsis, genres and rating for every show,
// from TMDB. Writes catalog/art.json keyed by show slug; raw responses cached in catalog/cache.
// Year from TVmaze disambiguates namesakes (The Office 2005 vs 2001). TMDB asks for a credit
// line on the site: "This product uses the TMDB API but is not endorsed or certified by TMDB."
// Usage: node scripts/art.js            (shows without art yet)
//        node scripts/art.js --fresh    (re-fetch everything)
//        node scripts/art.js Seinfeld   (one show, re-fetched)
//        node scripts/art.js --votes    (no network: every show's vote count, from the TMDB answer already saved in the cache)
//        node scripts/art.js --recheck [--hold file.json]   (every show whose art is another show's, matched again;
//                                        the slugs in the hold file, a JSON list, are left as they are)
// A TMDB record is taken only when it is this show (scripts/lib/sameshow.js): the same name as VoidTV's (or the cached
// TVmaze record's, when that agrees), or a name that starts with it, first aired within a year; else the same-name record
// nearest in year. A new show with no such record gets no art, and the site draws its own poster. Art already there is
// never removed by the builder (a re-check only replaces it with a better match). Before 21 Nov 2026 the top search hit
// was taken when no year matched, so "Payne" (CBS, 1999) wore Tyler Perry's House of Payne (night audit N12; Bryan: "Yes,
// fix all"); docs/ART-RECHECK.md has the run and what was put back.
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

const { sameShow, pickSame, identity, exactName } = require('./lib/sameshow');
function tvmazeOf(show) {
  try { const j = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, 'tvmaze-' + slug(show) + '.json'), 'utf8')); return { name: j.name || show, premiered: j.premiered || null }; } catch (e) { return { name: show, premiered: null }; }
}
// The names and first year a show is judged by: VoidTV's own name, and the cached TVmaze record only when its name agrees.
function idOf(show) { const t = tvmazeOf(show); return identity(show, t.name, t.premiered); }
function tvmazeYear(show) { return parseInt(String(idOf(show).first || '').slice(0, 4), 10) || null; }
// Is this TMDB record (a detail, or an art.json entry's title and year) this show?
function isThisShow(show, name, first) { const id = idOf(show); return id.names.some((n) => sameShow(n, id.first, name, first)); }

const OVERRIDES = fs.existsSync(path.join(PROFILE.catalogDir, 'overrides.json')) ? JSON.parse(fs.readFileSync(path.join(PROFILE.catalogDir, 'overrides.json'), 'utf8')) : {};
async function lookup(entry) {
  const show = entry.name;
  const year = tvmazeYear(show);
  const cf = path.join(CACHE_DIR, 'tmdb-' + slug(show) + '.json');
  const ov = OVERRIDES[slug(show)] || {};
  let detail;
  if (fs.existsSync(cf)) {
    detail = JSON.parse(fs.readFileSync(cf, 'utf8'));
    if (ov.tmdbId && detail && detail.id !== ov.tmdbId) detail = null; // an id set in HQ beats a stale cache
    else if (!ov.tmdbId && detail && !isThisShow(show, detail.name, detail.first_air_date)) detail = null; // a cached wrong match is looked up again
  }
  if (detail) { /* cached */ }
  else if (ov.tmdbId) { // a fixed id from overrides.json wins (name collisions)
    detail = await tmdb('/tv/' + ov.tmdbId);
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(cf, JSON.stringify(detail));
  }
  else {
    const q = show.replace(/\s*\(.*?\)\s*/g, ' ').trim();
    // The result that is this show (scripts/lib/sameshow.js pickSame): searched with the year first, then without it;
    // never the top hit when none is.
    const id = idOf(show);
    let pick = year ? pickSame((await tmdb('/search/tv', { query: q, first_air_date_year: String(year) })).results, id.names, id.first) : null;
    if (!pick) pick = pickSame((await tmdb('/search/tv', { query: q })).results, id.names, id.first);
    if (!pick) return null;
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
    votes: detail.vote_count || 0, // how many people rated it: the nearest thing to "how well known" (the home rows lead by it, decision H18)
    networks: (detail.networks || []).map((n) => n.name),
    country: (detail.origin_country || [])[0] || null,
    seasons: detail.number_of_seasons || null,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const fresh = args.includes('--fresh');
  const filter = (args.find((a, i) => !a.startsWith('--') && !['--slug', '--hold'].includes(args[i - 1])) || '').toLowerCase(); // a show name, not an option's value
  const art = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
  const SLUG_ONLY = (() => { const i = process.argv.indexOf('--slug'); return i >= 0 ? process.argv[i + 1] : null; })();
  const recheck = args.includes('--recheck');
  const hold = (() => { const i = args.indexOf('--hold'); try { return new Set(i >= 0 ? JSON.parse(fs.readFileSync(args[i + 1], 'utf8')) : []); } catch (e) { console.error('--hold: ' + e.message); process.exit(1); } })();
  // --votes: the vote count for art fetched before 26 Nov 2026, which kept the rating but not how many people gave it. It is read
  // from the saved TMDB answer (catalog/cache/tmdb-<slug>.json) and only when that answer is the record the art came from (same
  // id), so a show never gets another show's count. Nothing is fetched and nothing else in the art changes.
  if (args.includes('--votes')) {
    let set = 0, same = 0, none = 0, other = 0;
    for (const s of Object.keys(art)) {
      let d = null;
      try { d = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, 'tmdb-' + s + '.json'), 'utf8')); } catch (e) { none++; continue; }
      if (!d || d.id !== art[s].tmdbId) { other++; continue; }
      const v = d.vote_count || 0;
      if (art[s].votes === v) { same++; continue; }
      art[s].votes = v; set++;
    }
    fs.writeFileSync(OUT, JSON.stringify(art, null, 1));
    console.log(set + ' vote counts set, ' + same + ' already right, ' + none + ' with no saved answer, ' + other + ' whose saved answer is another record (left alone); ' + Object.keys(art).length + ' shows in catalog/art.json');
    return;
  }
  let done = 0, miss = 0;
  for (const entry of LIST.shows) {
    const s = slug(entry.name);
    if (SLUG_ONLY ? s !== SLUG_ONLY : (filter && !entry.name.toLowerCase().includes(filter))) continue;
    const ovId = (OVERRIDES[s] || {}).tmdbId;
    const wrong = recheck && art[s] && !ovId && !hold.has(s) && !isThisShow(entry.name, art[s].title, art[s].year);
    if (recheck && !wrong) continue;
    if (!filter && !SLUG_ONLY && !fresh && !wrong && art[s] && !(ovId && art[s].tmdbId !== ovId)) continue;
    if (filter || SLUG_ONLY || fresh || wrong) { try { fs.unlinkSync(path.join(CACHE_DIR, 'tmdb-' + s + '.json')); } catch (e) {} }
    try {
      const a = await lookup(entry);
      // No TMDB record passes: the old art stays. A builder never removes art on its own: on 21 Nov 2026 a run that did
      // cleared right art (Columbo and M*A*S*H, whose years and cached TVmaze records differ between sources; "Luke Cage"
      // is TMDB's "Marvel's Luke Cage"), and names alone cannot tell those from wrong art ("Fear" wearing Cape Fear). Art
      // to remove is a person's call: these lines list it.
      if (!a && art[s] && (filter || SLUG_ONLY || fresh || wrong)) {
        miss++; console.log(`${entry.name}  ->  no better TMDB record; kept ${art[s].title} (${art[s].year})${exactName(idOf(entry.name).names, art[s].title) ? '' : ': CHECK BY EYE, another name'}`); continue;
      }
      if (a) { art[s] = a; done++; if (done % 25 === 0) fs.writeFileSync(OUT, JSON.stringify(art, null, 1)); /* flush so the nightly time cap keeps what was fetched */ console.log(`${entry.name}  ->  ${a.title} (${a.year}) ${a.poster ? 'poster' : 'no poster'}, ${a.genres.join('/') || 'no genres'}`); }
      else { miss++; console.log(`${entry.name}  ->  no TMDB match`); }
    } catch (e) { miss++; console.log(`${entry.name}  ->  ${e.message}`); }
  }
  fs.writeFileSync(OUT, JSON.stringify(art, null, 1));
  console.log(`\n${done} fetched, ${miss} missing; ${Object.keys(art).length} shows with art in catalog/art.json`);
}
main().catch((e) => { console.error(e); process.exit(1); });
