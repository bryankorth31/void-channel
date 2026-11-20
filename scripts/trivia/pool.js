// TRIVIA NIGHTS, step 1: the pool. Which shows and films a trivia deck may ask about (plan T3; Bryan, 20 Nov 2026:
// "Yes, all four").
//   - Only what plays on VoidTV today (a show with playing episodes, a film that plays).
//   - Family decks: an official US rating of TV-PG or PG and under. After dark decks: any official US rating.
//     No official US rating on TMDB: out of every deck.
//   - Famous enough: TMDB's vote count, at a line Bryan sets after he has seen the list (docs/TRIVIA-POOL.md).
// Reads catalog/voidtv.db. Asks TMDB once per title (details plus content ratings or release dates in one call),
// caches the answers in catalog/cache/trivia/ (a month), and writes catalog/trivia-pool.json and docs/TRIVIA-POOL.md.
// Nothing here needs AI to run. TMDB asks for this credit where its data is shown: "This product uses the TMDB API
// but is not endorsed or certified by TMDB."
// Usage: node scripts/trivia/pool.js            fetch what is missing or older than a month, then write the pool
//        node scripts/trivia/pool.js --offline  write the pool from the cache only
//        node scripts/trivia/pool.js --limit 20 try a few titles first
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const CACHE = path.join(ROOT, 'catalog', 'cache', 'trivia');
const POOL = path.join(ROOT, 'catalog', 'trivia-pool.json');
const REPORT = path.join(ROOT, 'docs', 'TRIVIA-POOL.md');
const API = 'https://api.themoviedb.org/3';
const UA = 'voidtv.net trivia pool (https://voidtv.net)';
const GAP_MS = 260; // about four calls a second, well under TMDB's limit
const STALE = 30 * 864e5;
const LINES = [10, 25, 50, 100, 200, 500];
// The fame line: a title is in a deck at this many TMDB votes or more (Bryan, 20 Nov 2026: "100 votes").
const FAME_LINE = 100;

// Official US ratings. Family: these and nothing else. After dark: any of these plus the grown ones.
const FAMILY_TV = new Set(['TV-Y', 'TV-Y7', 'TV-Y7-FV', 'TV-G', 'TV-PG']);
const GROWN_TV = new Set(['TV-14', 'TV-MA']);
const FAMILY_FILM = new Set(['G', 'PG']);
const GROWN_FILM = new Set(['PG-13', 'R', 'NC-17']);

// A title's band from its official US rating (pure; tested).
function band(kind, us) {
  if (!us) return { band: 'out', why: 'no official US rating on TMDB' };
  if (us === 'NR') return { band: 'out', why: 'rated NR (not rated) in the US' };
  if (kind === 'tv') {
    if (FAMILY_TV.has(us)) return { band: 'family', why: 'US ' + us };
    if (GROWN_TV.has(us)) return { band: 'after-dark', why: 'US ' + us };
  } else {
    if (FAMILY_FILM.has(us)) return { band: 'family', why: 'US ' + us };
    if (GROWN_FILM.has(us)) return { band: 'after-dark', why: 'US ' + us };
  }
  return { band: 'out', why: 'US rating "' + us + '" is not one we know' };
}

// The US rating out of a TMDB answer (pure; tested). TV: content_ratings. Film: the release dates' certification,
// the theatrical or TV release first, any other US release after.
function usRating(kind, j) {
  if (!j) return '';
  if (kind === 'tv') {
    const r = ((j.content_ratings || {}).results || []).find((x) => x.iso_3166_1 === 'US');
    return r && r.rating ? r.rating.trim() : '';
  }
  const us = ((j.release_dates || {}).results || []).find((x) => x.iso_3166_1 === 'US');
  const dates = (us && us.release_dates) || [];
  const order = [3, 6, 2, 1, 4, 5]; // theatrical, TV, limited, premiere, digital, physical
  for (const t of order) { const d = dates.find((x) => x.type === t && (x.certification || '').trim()); if (d) return d.certification.trim(); }
  return '';
}

function token() {
  const envFile = path.join(ROOT, 'backend', '.env');
  const env = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '';
  return (process.env.TMDB_READ_TOKEN || (env.match(/^TMDB_READ_TOKEN=(.+)$/m) || [])[1] || '').trim();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = (f, fb) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return fb; } };
function save(f, obj) { fs.mkdirSync(path.dirname(f), { recursive: true }); const tmp = f + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(obj, null, 1)); fs.renameSync(tmp, f); }

async function getJson(url, tok) {
  for (let attempt = 0; attempt < 5; attempt++) {
    let r;
    try { r = await fetch(url, { headers: { Authorization: 'Bearer ' + tok, accept: 'application/json', 'user-agent': UA }, signal: AbortSignal.timeout(30000) }); }
    catch (e) { await sleep(2000 * (attempt + 1)); continue; }
    if (r.status === 429 || r.status >= 500) { await sleep(3000 * (attempt + 1)); continue; }
    await sleep(GAP_MS);
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('TMDB answered ' + r.status + ' for ' + url.replace(API, ''));
    return r.json();
  }
  throw new Error('TMDB gave no answer after 5 tries: ' + url.replace(API, ''));
}

// What VoidTV plays today, from the catalog database.
function titles() {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(path.join(ROOT, 'catalog', 'voidtv.db'), { readOnly: true });
  const shows = db.prepare('select slug, name, tmdb_id as tmdbId, premiered, live from shows where live > 0 and tmdb_id is not null order by slug').all();
  const films = db.prepare("select tmdb_id as tmdbId, title, year, kind from movies where state = 'LIVE' and tmdb_id is not null order by tmdb_id").all();
  db.close();
  return { shows, films };
}

// One cached record per title: only the facts the pool needs, with where they came from and when.
function record(kind, id, j) {
  const at = new Date().toISOString();
  if (!j) return { missing: true, at };
  return {
    name: j.name || j.title || '', first: j.first_air_date || j.release_date || '',
    votes: j.vote_count || 0, average: j.vote_average || 0, popularity: j.popularity || 0, adult: !!j.adult,
    us: usRating(kind, j), source: 'https://www.themoviedb.org/' + (kind === 'tv' ? 'tv/' : 'movie/') + id, at,
  };
}

async function fetchAll(list, kind, cacheFile, tok, limit) {
  const cache = readJson(cacheFile, {});
  const due = list.filter((t) => { const c = cache[t.tmdbId]; return !c || !c.at || !('first' in c || c.missing) || Date.now() - Date.parse(c.at) > STALE; });
  const todo = limit ? due.slice(0, limit) : due;
  console.log(kind + ': ' + list.length + ' titles, ' + due.length + ' to fetch' + (limit ? ', fetching ' + todo.length : ''));
  let n = 0;
  for (const t of todo) {
    const extra = kind === 'tv' ? 'content_ratings' : 'release_dates';
    const j = await getJson(API + '/' + (kind === 'tv' ? 'tv' : 'movie') + '/' + t.tmdbId + '?append_to_response=' + extra, tok);
    cache[t.tmdbId] = record(kind, t.tmdbId, j);
    if (++n % 50 === 0) { save(cacheFile, cache); console.log('  ' + n + ' of ' + todo.length); }
  }
  save(cacheFile, cache);
  return cache;
}

// Is TMDB's record the same show as TVmaze's? The catalog joins them by id, and a wrong join would hand a show another
// show's rating, votes and cast (the catalog's "Clubhouse", a 2004 drama, carried Mickey Mouse Clubhouse's TMDB id).
// Same when the names match once tidied (or one holds the other) and the first years are at most one apart (pure; tested).
function tidy(s) { return String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
function sameShow(tvmazeName, tvmazeFirst, tmdbName, tmdbFirst) {
  const a = tidy(tvmazeName), b = tidy(tmdbName);
  if (!a || !b || !(a === b || a.includes(b) || b.includes(a))) return false;
  const ya = parseInt(String(tvmazeFirst || '').slice(0, 4), 10), yb = parseInt(String(tmdbFirst || '').slice(0, 4), 10);
  return !(ya && yb) || Math.abs(ya - yb) <= 1;
}

// The pool from the titles and the cache (pure; tested).
function buildPool(shows, films, tvCache, filmCache) {
  const one = (kind, t, c) => {
    const base = kind === 'tv' ? { slug: t.slug, name: t.name, tmdbId: t.tmdbId, premiered: t.premiered, playing: t.live } : { tmdbId: t.tmdbId, title: t.title, year: t.year, kind: t.kind };
    if (!c) return { ...base, band: 'out', why: 'not fetched from TMDB yet' };
    if (c.missing) return { ...base, band: 'out', why: 'TMDB has no record at this id' };
    if (kind === 'tv' && !sameShow(t.name, t.premiered, c.name, c.first)) return { ...base, votes: c.votes, us: c.us, source: c.source, band: 'out', why: 'TMDB record is another show (' + c.name + ', ' + String(c.first).slice(0, 4) + ')' };
    if (c.adult) return { ...base, votes: c.votes, us: c.us, source: c.source, band: 'out', why: 'TMDB marks it adult' };
    const b = band(kind, c.us);
    return { ...base, votes: c.votes, us: c.us, source: c.source, band: b.band, why: b.why };
  };
  return {
    shows: shows.map((t) => one('tv', t, tvCache[t.tmdbId])),
    films: films.map((t) => one('film', t, filmCache[t.tmdbId])),
  };
}

function report(pool) {
  const out = [];
  const name = (x) => x.name || (x.title + (x.year ? ' (' + x.year + ')' : ''));
  out.push('# Trivia pool: who is famous enough');
  out.push('');
  out.push('Written by scripts/trivia/pool.js on ' + new Date().toISOString().slice(0, 10) + '. Only titles that play on VoidTV today.');
  out.push('Family = official US rating TV-PG or PG and under. After dark = any official US rating. No US rating = out.');
  out.push('Fame = TMDB vote count. Pick a line and the decks use every title at or above it.');
  out.push('This product uses the TMDB API but is not endorsed or certified by TMDB.');
  for (const [label, list] of [['Shows', pool.shows], ['TV movies and specials', pool.films]]) {
    const fam = list.filter((x) => x.band === 'family');
    const all = list.filter((x) => x.band !== 'out');
    out.push('');
    out.push('## ' + label + ' (' + list.length + ' play today; ' + fam.length + ' family, ' + (all.length - fam.length) + ' after dark only, ' + (list.length - all.length) + ' out)');
    out.push('');
    out.push('| Vote line | Family | After dark (all rated) | Family titles just above the line |');
    out.push('|---|---|---|---|');
    for (const line of LINES) {
      const near = fam.filter((x) => x.votes >= line).sort((a, b) => a.votes - b.votes).slice(0, 4).map((x) => name(x) + ' ' + x.votes);
      out.push('| ' + line + '+ | ' + fam.filter((x) => x.votes >= line).length + ' | ' + all.filter((x) => x.votes >= line).length + ' | ' + near.join('; ') + ' |');
    }
    const whyOut = {};
    for (const x of list.filter((y) => y.band === 'out')) { const k = x.why.replace(/\s*\(.*\)$/, ''); whyOut[k] = (whyOut[k] || 0) + 1; }
    out.push('');
    out.push('Out, and why: ' + (Object.entries(whyOut).map(([w, n]) => n + ' ' + w).join('; ') || 'none') + '.');
    const famous = list.filter((x) => x.band === 'out' && /no official US rating/.test(x.why) && x.votes >= 100).sort((a, b) => b.votes - a.votes).slice(0, 12);
    if (famous.length) out.push('Well-known titles left out only for want of a US rating: ' + famous.map((x) => name(x) + ' (' + x.votes + ')').join(', ') + '.');
  }
  const wrongJoin = pool.shows.filter((x) => /another show/.test(x.why)).sort((a, b) => (b.votes || 0) - (a.votes || 0));
  if (wrongJoin.length) {
    out.push('');
    out.push('## Shows joined to the wrong TMDB record (' + wrongJoin.length + ')');
    out.push('');
    out.push('The catalog links each show to TVmaze and to TMDB by id. For these, the TMDB record is another show (another name, or');
    out.push('first aired more than a year apart), so its rating, votes and cast are not this show\'s. Trivia leaves them out. The');
    out.push('same link feeds the site\'s cast and pictures for these shows, so the catalog owner should look at them.');
    out.push('');
    out.push('| Catalog show (TVmaze) | First aired | TMDB record it points to | TMDB votes |');
    out.push('|---|---|---|---|');
    for (const x of wrongJoin) out.push('| ' + x.name + ' (' + x.slug + ') | ' + (x.premiered || '') + ' | [' + x.why.replace(/^.*\((.*)\)$/, '$1') + '](' + x.source + ') | ' + x.votes + ' |');
  }
  return out.join('\n') + '\n';
}

async function main() {
  const args = process.argv.slice(2);
  const offline = args.includes('--offline');
  const li = args.indexOf('--limit');
  const limit = li >= 0 ? +args[li + 1] || 0 : 0;
  const { shows, films } = titles();
  const tvFile = path.join(CACHE, 'tmdb-tv.json');
  const filmFile = path.join(CACHE, 'tmdb-movie.json');
  let tvCache = readJson(tvFile, {}), filmCache = readJson(filmFile, {});
  if (!offline) {
    const tok = token();
    if (!tok) { console.error('No TMDB_READ_TOKEN (backend/.env)'); process.exit(1); }
    tvCache = await fetchAll(shows, 'tv', tvFile, tok, limit);
    filmCache = await fetchAll(films, 'film', filmFile, tok, limit);
  }
  const pool = buildPool(shows, films, tvCache, filmCache);
  save(POOL, { builtAt: new Date().toISOString(), rules: 'plays today; family = US TV-PG/PG and under; after dark = any official US rating; no US rating = out; fame line set by Bryan', fameLine: FAME_LINE, ...pool });
  fs.writeFileSync(REPORT, report(pool));
  console.log('Wrote ' + path.relative(ROOT, POOL) + ' and ' + path.relative(ROOT, REPORT));
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
module.exports = { band, usRating, buildPool, report, sameShow, FAME_LINE };
