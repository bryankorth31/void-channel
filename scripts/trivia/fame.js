// TRIVIA NIGHTS: the fame list (plan T7, clip rounds). Which TV shows, films and games people know best today, and
// which of those VoidTV can play. Clip rounds draw from the top of this list only (Bryan, 20 Nov 2026: "select
// culturally relevant classic cult classic well known content ... make a list of things in all the different
// categories that are the most known").
//
// How known a title is, from two counts anyone can check:
//   - views: how many times its English Wikipedia page was read in the last 12 full months (Wikimedia page views,
//     people only, no bots). This is what people look up now, so a show everyone knew in 1995 and nobody looks up
//     today ranks low.
//   - links: how many Wikipedias have a page on it (Wikidata sitelinks), so how far round the world it is known.
// The list is ranked by views. Links only decide who is looked at (a floor per category, below).
// Matching to VoidTV is exact for shows and films (Wikidata holds the TMDB id, and so does the catalog); games match
// PLAY's cards by name and year.
//
// Reads: Wikidata (query.wikidata.org), Wikimedia page views, catalog/voidtv.db, play/cards/*.json.
// Caches page views in catalog/cache/trivia/fame-views.json (a month) and Wikidata answers in fame-wd-<cat>.json.
// Writes: catalog/trivia-fame.json and docs/TRIVIA-FAME.md. Nothing here needs AI to run.
// Usage: node scripts/trivia/fame.js            fetch what is missing or stale, then write the list
//        node scripts/trivia/fame.js --offline  write the list from the cache only
'use strict';
const fs = require('fs');
const path = require('path');
const { norm } = require('./bank');

const ROOT = path.join(__dirname, '..', '..');
const CACHE = path.join(ROOT, 'catalog', 'cache', 'trivia');
const OUT = path.join(ROOT, 'catalog', 'trivia-fame.json');
const REPORT = path.join(ROOT, 'docs', 'TRIVIA-FAME.md');
const UA = 'voidtv.net trivia fame (https://voidtv.net)';
const STALE = 30 * 864e5;
const KEEP = 500;        // titles kept per category in the list
const SHOW = 100;        // titles per category written out in the report
const PARALLEL = 4;      // page view calls at once; more than this draws 429 "slow down" answers
const CULT_FILM = 'Q219557';

// Who is looked at in each category: what Wikidata says the item is, and the fewest Wikipedias it must be on.
const CATS = {
  tv: {
    label: 'TV shows', minLinks: 10, idProp: 'P4983',
    types: { Q5398426: 'series', Q581714: 'animated', Q117467246: 'animated', Q63952888: 'anime', Q1259759: 'miniseries' },
  },
  film: {
    label: 'Films', minLinks: 20, idProp: 'P4947',
    types: { Q11424: 'film', Q24869: 'film', Q202866: 'animated', Q506240: 'tv-movie' },
  },
  game: {
    label: 'Games', minLinks: 12, idProp: null,
    types: { Q7889: 'game' },
  },
};

// ---------- small pure helpers (tested) ----------

// The last 12 full months before a date, as Wikimedia wants them (YYYYMMDD).
function window12(now) {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));          // last day of last month
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 11, 1));
  const f = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
  return { start: f(start), end: f(end) };
}

// The Wikidata question for one category: every item of its kinds on at least minLinks Wikipedias that has an
// English Wikipedia page, with its TMDB id where the category has one and the cult film mark. No grouping and no
// dates here: a film carries a release date per country, and asking for them all made the film question time out.
// Rows repeat per kind and id; fromRows folds them. Years come after, for the kept titles only (yearsQuery).
function sparql(cat) {
  const c = CATS[cat];
  const types = Object.keys(c.types).map((q) => 'wd:' + q).join(' ');
  const id = c.idProp ? `?item wdt:${c.idProp} ?tmdb .` : '';
  return `SELECT ?item ?title ?links ?tmdb ?type ?cult WHERE {
  VALUES ?type { ${types} }
  ?item wdt:P31 ?type ; wikibase:sitelinks ?links .
  FILTER(?links >= ${c.minLinks})
  ${id}
  ?page schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?title .
  OPTIONAL { ?item wdt:P136 ?cult . FILTER(?cult = wd:${CULT_FILM}) }
}`;
}

// The first release year of some items (P577, the earliest of its dates).
function yearsQuery(ids) {
  return `SELECT ?item (MIN(?date) AS ?first) WHERE { VALUES ?item { ${ids.map((q) => 'wd:' + q).join(' ')} }
  ?item wdt:P577 ?date . } GROUP BY ?item`;
}

const qid = (uri) => uri.replace(/^.*\//, '');

// Wikidata answer rows to one title record per item (an item can be two kinds at once, or carry two TMDB ids).
function fromRows(cat, bindings) {
  const byItem = new Map();
  for (const b of bindings) {
    const id = qid(b.item.value);
    const kind = b.type ? CATS[cat].types[qid(b.type.value)] : null;
    const t = byItem.get(id) || {
      title: b.title.value, wikidata: id, tmdb: null, year: null, links: Number(b.links.value),
      animated: false, tvMovie: false, cult: false,
    };
    if (b.tmdb && /^\d+$/.test(b.tmdb.value)) {
      const n = Number(b.tmdb.value);
      if (t.tmdb === null) t.tmdb = n;
      t.tmdbAll = [...new Set([...(t.tmdbAll || []), n])];
    }
    if (kind === 'animated' || kind === 'anime') t.animated = true;
    if (kind === 'tv-movie') t.tvMovie = true;
    if (b.cult) t.cult = true;
    byItem.set(id, t);
  }
  return [...byItem.values()];
}

// Rank by page views, most first; a tie goes to the one on more Wikipedias, then by name so a rebuild is the same.
function rank(list) {
  return list.slice().sort((a, b) => (b.views - a.views) || (b.links - a.links) || a.title.localeCompare(b.title))
    .map((t, i) => ({ rank: i + 1, ...t }));
}

// A game's place on VoidTV: a PLAY card with the same name (normalised) from within a year of it.
function findCard(game, cards) {
  const n = norm(game.title.replace(/\s*\((?:[^)]*video game[^)]*|\d{4})\)\s*$/i, ''));
  return cards.find((c) => norm(c.title) === n && (!game.year || !c.year || Math.abs(c.year - game.year) <= 1)) || null;
}

// What a reader sees for one title's state on VoidTV.
function stateText(cat, v) {
  if (!v) return 'not in the catalog';
  if (cat === 'game') return 'plays on PLAY';
  if (cat === 'tv') {
    if (v.clipReady) return `${v.clipReady} episodes ready for clips` + (v.live > v.clipReady ? ` (${v.live} play)` : '');
    if (v.live) return `${v.live} episodes play, none ready for clips`;
    return 'in the catalog, not found on the Archive';
  }
  if (v.clipReady) return 'plays, ready for clips';
  if (v.state === 'LIVE') return 'plays, not ready for clips';
  if (v.state === 'REVIEW') return 'found, waiting on a check';
  return 'in the catalog, not found on the Archive';
}

// ---------- fetching (cached) ----------

function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function writeJson(file, data) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(data)); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ask(query, what) {
  for (let attempt = 1; ; attempt++) {
    let r = null;
    try {
      r = await fetch('https://query.wikidata.org/sparql', {
        method: 'POST',
        headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'query=' + encodeURIComponent(query),
      });
    } catch { /* a dropped connection counts as one failed try */ }
    // Some Wikidata titles hold a raw tab or other control character, which JSON forbids inside a string; read them
    // as spaces (outside strings a space is the same as the newline or tab it replaces).
    if (r && r.ok) return JSON.parse((await r.text()).replace(/[\u0000-\u001f]/g, ' ')).results.bindings;
    if (attempt >= 3) throw new Error(`Wikidata ${r ? 'answered ' + r.status : 'could not be reached'} for ${what}`);
    await sleep(10000 * attempt);
  }
}

async function wikidata(cat, offline) {
  const file = path.join(CACHE, `fame-wd2-${cat}.json`);
  const cached = readJson(file, null);
  if (cached && (offline || Date.now() - cached.at < STALE)) return cached.rows;
  if (offline) throw new Error(`no cached Wikidata answer for ${cat}; run once without --offline`);
  const rows = fromRows(cat, await ask(sparql(cat), cat));
  writeJson(file, { at: Date.now(), rows });
  return rows;
}

// First release years for the kept titles, 200 items a question, cached with the rest.
async function years(ids, offline) {
  const file = path.join(CACHE, 'fame-years.json');
  const cache = readJson(file, {});
  const todo = offline ? [] : ids.filter((q) => cache[q] === undefined);
  for (let i = 0; i < todo.length; i += 200) {
    const part = todo.slice(i, i + 200);
    for (const q of part) cache[q] = null;
    for (const b of await ask(yearsQuery(part), 'years')) {
      const y = Number(b.first.value.slice(0, 4));
      if (Number.isFinite(y) && y > 1800) cache[qid(b.item.value)] = y;
    }
  }
  writeJson(file, cache);
  return cache;
}

async function pageViews(titles, win, offline) {
  const file = path.join(CACHE, 'fame-views.json');
  const cache = readJson(file, {});
  const key = (t) => `${t}|${win.start}|${win.end}`;
  const todo = offline ? [] : titles.filter((t) => cache[key(t)] === undefined);
  let done = 0, failed = 0;
  async function one(t) {
    const url = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/'
      + encodeURIComponent(t.replace(/ /g, '_')) + `/monthly/${win.start}/${win.end}`;
    for (let attempt = 1; attempt <= 6; attempt++) {
      let r;
      try { r = await fetch(url, { headers: { 'User-Agent': UA } }); }
      catch { await sleep(3000 * attempt); continue; }                // a dropped connection: try that title again
      if (r.status === 404) { cache[key(t)] = 0; return; }           // no views recorded in the window
      if (r.ok) { cache[key(t)] = (await r.json()).items.reduce((s, i) => s + i.views, 0); return; }
      await sleep(3000 * attempt);                                    // 429: Wikimedia asks us to slow down
    }
    failed++;
  }
  for (let i = 0; i < todo.length; i += PARALLEL) {
    await Promise.all(todo.slice(i, i + PARALLEL).map(one));
    done = Math.min(i + PARALLEL, todo.length);
    if (done % 600 < PARALLEL) { writeJson(file, cache); process.stdout.write(`  page views ${done}/${todo.length}\n`); }
  }
  writeJson(file, cache);
  if (failed) console.log(`  ${failed} page view calls failed; run again to fill them`);
  const out = new Map();
  for (const t of titles) if (cache[key(t)] !== undefined) out.set(t, cache[key(t)]);
  return out;
}

// ---------- VoidTV side ----------

function voidtv() {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(path.join(ROOT, 'catalog', 'voidtv.db'), { readOnly: true });
  // The same "ready for clips" test the bank uses (bank.js getClips): live, plays, MP4, five minutes or more.
  const clipOk = "state = 'LIVE' and playable = 1 and seconds >= 300 and format in ('MPEG4', 'h.264', 'h.264 IA') and lower(url) like '%.mp4'";
  // Episode counts in one pass over the episodes table (a count per show inside the shows query took minutes).
  const counts = new Map();
  for (const r of db.prepare(`select show_slug as slug, sum(state = 'LIVE' and playable = 1) as live,
      sum(${clipOk}) as clipReady from episodes group by show_slug`).iterate()) counts.set(r.slug, r);
  const shows = new Map();
  for (const r of db.prepare('select slug, name, tmdb_id as tmdb from shows where tmdb_id is not null').iterate()) {
    const c = counts.get(r.slug) || { live: 0, clipReady: 0 };
    const prev = shows.get(r.tmdb);
    if (!prev || c.live > prev.live) shows.set(r.tmdb, { slug: r.slug, name: r.name, live: c.live || 0, clipReady: c.clipReady || 0 });
  }
  const films = new Map();
  for (const r of db.prepare(`select tmdb_id as tmdb, title, state, playable, (${clipOk}) as clipReady from movies`).iterate()) {
    films.set(r.tmdb, { title: r.title, state: r.state, clipReady: r.clipReady ? 1 : 0 });
  }
  db.close();
  const dir = path.join(ROOT, 'play', 'cards');
  const cards = fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
    .map((f) => readJson(path.join(dir, f), null)).filter(Boolean).map((c) => ({ id: c.id, title: c.title, year: c.year }));
  return { shows, films, cards };
}

// ---------- the report ----------

function report(list, win, builtAt) {
  const lines = [];
  lines.push('# Trivia fame list', '');
  lines.push(`Built ${builtAt.slice(0, 10)} by \`node scripts/trivia/fame.js\`. Plan T7 (clip rounds).`, '');
  lines.push('Ranked by how many times each title\'s English Wikipedia page was read by people (not bots) from '
    + `${win.start.slice(0, 4)}-${win.start.slice(4, 6)} to ${win.end.slice(0, 4)}-${win.end.slice(4, 6)}`
    + ' (Wikimedia page views). "Wikipedias" is how many language Wikipedias have a page on it (Wikidata), so how far'
    + ' round the world it is known. Only titles with an English Wikipedia page are counted.', '');
  lines.push('"Ready for clips" means VoidTV plays it from the Archive as an MP4 of five minutes or more, the files clip'
    + ' rounds can cut from.', '');
  lines.push('## How many of the best known VoidTV can play', '');
  lines.push('| | Top 50 | Top 100 | Top 300 | Top 500 |', '|---|---|---|---|---|');
  for (const cat of Object.keys(CATS)) {
    const cells = [50, 100, 300, 500].map((n) => {
      const top = list[cat].slice(0, n);
      const plays = top.filter((t) => t.voidtv && (cat === 'game' || t.voidtv.live || t.voidtv.state === 'LIVE')).length;
      const ready = top.filter((t) => t.voidtv && (cat === 'game' || t.voidtv.clipReady)).length;
      return cat === 'game' ? `${plays} play` : `${plays} play, ${ready} ready for clips`;
    });
    lines.push(`| ${CATS[cat].label} | ${cells.join(' | ')} |`);
  }
  lines.push('');
  for (const cat of Object.keys(CATS)) {
    lines.push(`## ${CATS[cat].label}: the top ${SHOW}`, '');
    lines.push('| # | Title | Year | Views (12 months) | Wikipedias | On VoidTV |', '|---|---|---|---|---|---|');
    for (const t of list[cat].slice(0, SHOW)) {
      const marks = [t.cult ? 'cult' : '', t.animated ? 'animated' : '', t.tvMovie ? 'TV movie' : ''].filter(Boolean).join(', ');
      const name = t.title.replace(/\|/g, '/') + (marks ? ` (${marks})` : '');
      lines.push(`| ${t.rank} | ${name} | ${t.year || ''} | ${t.views.toLocaleString('en-US')} | ${t.links} | ${stateText(cat, t.voidtv)} |`);
    }
    lines.push('');
  }
  const cult = list.film.filter((t) => t.cult);
  lines.push(`## Cult films in the top ${KEEP} films`, '');
  lines.push('Marked "cult film" on Wikidata. ' + cult.map((t) => `${t.title} (${t.year || '?'}, #${t.rank}: ${stateText('film', t.voidtv)})`).join('; ') + '.', '');
  lines.push('Sources: Wikidata (CC0), Wikimedia page views (CC0). The full list, 500 a category, is catalog/trivia-fame.json.', '');
  return lines.join('\n');
}

// ---------- main ----------

async function main() {
  const offline = process.argv.includes('--offline');
  const builtAt = new Date().toISOString();
  const win = window12(new Date());
  const vt = voidtv();
  const list = {};
  let unviewed = 0;   // titles whose page views could not be fetched this run; a rerun fills them
  for (const cat of Object.keys(CATS)) {
    process.stdout.write(`${CATS[cat].label}: asking Wikidata\n`);
    const items = await wikidata(cat, offline);
    process.stdout.write(`  ${items.length} titles; page views\n`);
    const views = await pageViews(items.map((t) => t.title), win, offline);
    const counted = items.filter((t) => views.has(t.title)).map((t) => ({ ...t, views: views.get(t.title) }));
    unviewed += items.length - counted.length;
    const kept = rank(counted).slice(0, KEEP);
    const yr = await years(kept.map((t) => t.wikidata), offline);
    list[cat] = kept.map(({ tmdbAll, ...t }) => {
      let v = null;
      const ids = tmdbAll || [];
      const from = cat === 'tv' ? vt.shows : cat === 'film' ? vt.films : null;
      if (from) { const hit = ids.find((n) => from.has(n)); if (hit !== undefined) { v = from.get(hit); t.tmdb = hit; } }
      const year = yr[t.wikidata] || null;
      if (cat === 'game') { const c = findCard({ ...t, year }, vt.cards); if (c) v = { card: c.id }; }
      return { ...t, year, voidtv: v };
    });
  }
  const out = {
    builtAt, window: win,
    rules: 'ranked by English Wikipedia page views (people, last 12 full months); looked at: Wikidata items of each kind '
      + 'on at least ' + Object.keys(CATS).map((c) => `${CATS[c].minLinks} Wikipedias (${c})`).join(', '),
    sources: { wikidata: 'https://query.wikidata.org/', pageviews: 'https://wikimedia.org/api/rest_v1/metrics/pageviews/' },
    ...list,
  };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
  fs.writeFileSync(REPORT, report(list, win, builtAt));
  console.log(`wrote ${path.relative(ROOT, OUT)} and ${path.relative(ROOT, REPORT)}`);
  if (unviewed) { console.log(`${unviewed} titles have no page views yet (Wikimedia said slow down); run again to fill them`); process.exitCode = 3; }
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
module.exports = { CATS, window12, sparql, yearsQuery, fromRows, rank, findCard, stateText };
