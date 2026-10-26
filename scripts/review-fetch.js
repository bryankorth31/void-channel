// THE SHOW REVIEW, step 1: gather what the rest of the world says about each Live TV series (B, 26 Oct 2026: "rate every
// one for me with impact and public love/sentiment ... either keep or go"; plan: chief-of-staff/plans/PLAN-voidtv-show-review.md).
// Facts only, from four free sources, cached in catalog/cache/review/ (one file per source) so a rerun asks again only for
// what is missing or older than 30 days:
//   tmdb.json      TMDB /tv/<id>: vote average, vote count, popularity, seasons, first and last air date, Wikidata id
//   tvmaze.json    TVmaze /shows/<id>: rating, weight (TVmaze's own measure of how followed a show is)
//   wikidata.json  Wikidata, by TVmaze id or TMDB id, many shows a query: awards won (P166), nominations (P1411), how many
//                  Wikipedias have an article (sitelinks), the English article's title
//   views.json     Wikipedia: views of the English article over the last 12 full months
// Rates stay well under each source's limits; Wikimedia asks for a User-Agent that says who is asking.
// Usage: node scripts/review-fetch.js            (what is missing or stale)
//        node scripts/review-fetch.js --fresh    (everything again)
//        node scripts/review-fetch.js --only tmdb,tvmaze   (some sources)
//        node scripts/review-fetch.js --limit 5   (the first five shows, to try it)
// TMDB asks for a credit where its data is shown: "This product uses the TMDB API but is not endorsed or certified by TMDB."
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PROFILE = require('./lib/profile');
const DIR = path.join(PROFILE.catalogDir, 'cache', 'review');
const UA = 'voidtv.net show review (https://voidtv.net; cashvalues.org)';
const STALE = 30 * 864e5;
const FRESH = process.argv.includes('--fresh');
const argOf = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] || '' : null; };
const ONLY = argOf('--only') ? argOf('--only').split(',') : null;
const LIMIT = +argOf('--limit') || 0; // a few shows only, to try it

const env = fs.existsSync(path.join(ROOT, 'backend', '.env')) ? fs.readFileSync(path.join(ROOT, 'backend', '.env'), 'utf8') : '';
const TOKEN = (process.env.TMDB_READ_TOKEN || (env.match(/^TMDB_READ_TOKEN=(.+)$/m) || [])[1] || '').trim();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = (f, fb) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return fb; } };
const save = (name, obj) => { fs.mkdirSync(DIR, { recursive: true }); const f = path.join(DIR, name + '.json'), tmp = f + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(obj, null, 0)); fs.renameSync(tmp, f); };
const due = (rec) => FRESH || !rec || !rec.at || Date.now() - Date.parse(rec.at) > STALE;

async function getJson(url, headers, gap) {
  for (let attempt = 0; attempt < 5; attempt++) {
    let r;
    try { r = await fetch(url, { headers: Object.assign({ 'user-agent': UA, accept: 'application/json' }, headers || {}), signal: AbortSignal.timeout(30000) }); } catch (e) { await sleep(2000 * (attempt + 1)); continue; }
    if (r.status === 429 || r.status >= 500) { await sleep(3000 * (attempt + 1)); continue; }
    await sleep(gap);
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url.slice(0, 80));
    return r.json();
  }
  throw new Error('gave up ' + url.slice(0, 80));
}

// The Live TV series, as the site builds them (the same lists the channels use).
function liveSeries() {
  const app = require('./lib/app');
  const A = app.assemble();
  const L = readJson(PROFILE.listFile, { shows: [] });
  const lang = Object.fromEntries(L.shows.map((s) => [s.name, s.language]));
  const foreign = new Set(A.shows.filter((s) => lang[s.show] && lang[s.show] !== 'en').map((s) => s.slug));
  const off = new Set(Object.keys(readJson(path.join(PROFILE.catalogDir, 'live-tv-off.json'), { shows: {} }).shows || {}));
  const { lists } = app.channelLists(A.shows, A.types, off, foreign);
  const art = readJson(path.join(PROFILE.catalogDir, 'art.json'), {});
  const seen = new Map();
  for (const c of lists) for (const s of c.list) if (!s.slug.startsWith('movie-') && !seen.has(s.slug)) {
    const g = readJson(path.join(PROFILE.catalogDir, 'shows', s.slug + '.json'), {});
    seen.set(s.slug, { slug: s.slug, show: s.show, tmdb: (art[s.slug] || {}).tmdbId || null, tvmaze: (g.tvmaze || {}).id || null });
  }
  return [...seen.values()];
}

async function tmdbAll(shows) {
  if (!TOKEN) { console.log('tmdb: no TMDB_READ_TOKEN, skipped'); return; }
  const db = readJson(path.join(DIR, 'tmdb.json'), {});
  let n = 0;
  for (const s of shows) {
    if (!s.tmdb || !due(db[s.slug])) continue;
    const j = await getJson('https://api.themoviedb.org/3/tv/' + s.tmdb + '?append_to_response=external_ids', { Authorization: 'Bearer ' + TOKEN }, 250);
    db[s.slug] = j ? { id: s.tmdb, va: j.vote_average, vc: j.vote_count, pop: j.popularity, seasons: j.number_of_seasons, eps: j.number_of_episodes, first: j.first_air_date || null, last: j.last_air_date || null, status: j.status || null, wd: (j.external_ids || {}).wikidata_id || null, at: new Date().toISOString() } : { id: s.tmdb, missing: true, at: new Date().toISOString() };
    if (++n % 100 === 0) { save('tmdb', db); console.log('tmdb', n); }
  }
  save('tmdb', db); console.log('tmdb done,', n, 'fetched');
}

async function tvmazeAll(shows) {
  const db = readJson(path.join(DIR, 'tvmaze.json'), {});
  let n = 0;
  for (const s of shows) {
    if (!s.tvmaze || !due(db[s.slug])) continue;
    const j = await getJson('https://api.tvmaze.com/shows/' + s.tvmaze, null, 550); // TVmaze allows 20 calls in 10 seconds
    db[s.slug] = j ? { id: s.tvmaze, rating: (j.rating || {}).average || null, weight: j.weight == null ? null : j.weight, premiered: j.premiered || null, ended: j.ended || null, at: new Date().toISOString() } : { id: s.tvmaze, missing: true, at: new Date().toISOString() };
    if (++n % 100 === 0) { save('tvmaze', db); console.log('tvmaze', n); }
  }
  save('tvmaze', db); console.log('tvmaze done,', n, 'fetched');
}

// One SPARQL query for many shows: by TVmaze id (P8600) and by TMDB TV id (P4983), plus the Wikidata ids TMDB gave.
async function wikidataAll(shows) {
  const db = readJson(path.join(DIR, 'wikidata.json'), {});
  const tm = readJson(path.join(DIR, 'tmdb.json'), {});
  const todo = shows.filter((s) => due(db[s.slug]));
  const q = (values) => 'SELECT ?item ?key (COUNT(DISTINCT ?aw) AS ?won) (COUNT(DISTINCT ?nom) AS ?noms) (SAMPLE(?sl) AS ?links) (SAMPLE(?t) AS ?title) WHERE { ' + values +
    ' OPTIONAL { ?item wdt:P166 ?aw } OPTIONAL { ?item wdt:P1411 ?nom } OPTIONAL { ?item wikibase:sitelinks ?sl } OPTIONAL { ?art schema:about ?item; schema:isPartOf <https://en.wikipedia.org/>; schema:name ?t } } GROUP BY ?item ?key';
  const run = async (sparql) => {
    const j = await getJson('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(sparql), { accept: 'application/sparql-results+json' }, 1500);
    return ((j && j.results && j.results.bindings) || []).map((b) => ({ item: b.item.value.split('/').pop(), key: b.key.value, won: +b.won.value, noms: +b.noms.value, links: b.links ? +b.links.value : 0, title: b.title ? b.title.value : null }));
  };
  const take = (s, r) => { if (!db[s.slug] || db[s.slug].missing || (r.links || 0) > (db[s.slug].links || 0)) db[s.slug] = { wd: r.item, won: r.won, noms: r.noms, links: r.links, title: r.title, at: new Date().toISOString() }; };
  for (let i = 0; i < todo.length; i += 150) {
    const part = todo.slice(i, i + 150);
    for (const s of part) delete db[s.slug];
    const byWd = part.filter((s) => tm[s.slug] && tm[s.slug].wd);
    if (byWd.length) for (const r of await run(q('VALUES (?item ?key) { ' + byWd.map((s) => '(wd:' + tm[s.slug].wd + ' "' + s.slug + '")').join(' ') + ' }'))) { const s = part.find((x) => x.slug === r.key); if (s) take(s, r); }
    const byTvm = part.filter((s) => s.tvmaze);
    if (byTvm.length) for (const r of await run(q('VALUES (?id ?key) { ' + byTvm.map((s) => '("' + s.tvmaze + '" "' + s.slug + '")').join(' ') + ' } ?item wdt:P8600 ?id .'))) { const s = part.find((x) => x.slug === r.key); if (s) take(s, r); }
    const byTmdb = part.filter((s) => s.tmdb);
    if (byTmdb.length) for (const r of await run(q('VALUES (?id ?key) { ' + byTmdb.map((s) => '("' + s.tmdb + '" "' + s.slug + '")').join(' ') + ' } ?item wdt:P4983 ?id .'))) { const s = part.find((x) => x.slug === r.key); if (s) take(s, r); }
    for (const s of part) if (!db[s.slug]) db[s.slug] = { missing: true, at: new Date().toISOString() };
    save('wikidata', db); console.log('wikidata', Math.min(i + 150, todo.length), 'of', todo.length);
  }
  save('wikidata', db); console.log('wikidata done');
}

// Views of the English Wikipedia article, the last 12 full months.
async function viewsAll(shows) {
  const db = readJson(path.join(DIR, 'views.json'), {});
  const wd = readJson(path.join(DIR, 'wikidata.json'), {});
  const now = new Date(), end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)), start = new Date(Date.UTC(end.getUTCFullYear() - 1, end.getUTCMonth() + 1, 1));
  const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
  let n = 0;
  for (const s of shows) {
    const title = wd[s.slug] && wd[s.slug].title;
    if (!title || !due(db[s.slug])) continue;
    const j = await getJson('https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/' + encodeURIComponent(title.replace(/ /g, '_')) + '/monthly/' + ymd(start) + '/' + ymd(end), null, 120);
    db[s.slug] = { title, views: j ? (j.items || []).reduce((t, x) => t + x.views, 0) : 0, months: j ? (j.items || []).length : 0, at: new Date().toISOString() };
    if (++n % 100 === 0) { save('views', db); console.log('views', n); }
  }
  save('views', db); console.log('views done,', n, 'fetched');
}

async function main() {
  const shows = LIMIT ? liveSeries().slice(0, LIMIT) : liveSeries();
  console.log(shows.length, 'Live TV series;', shows.filter((s) => s.tmdb).length, 'with a TMDB id,', shows.filter((s) => s.tvmaze).length, 'with a TVmaze id');
  const want = (k) => !ONLY || ONLY.includes(k);
  // TVmaze runs beside the rest (its own rate); Wikidata needs TMDB's Wikidata ids first, and the views need Wikidata's titles.
  await Promise.all([want('tvmaze') ? tvmazeAll(shows) : null, (async () => {
    if (want('tmdb')) await tmdbAll(shows);
    if (want('wikidata')) await wikidataAll(shows);
    if (want('views')) await viewsAll(shows);
  })()]);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
