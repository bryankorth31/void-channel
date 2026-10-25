// The things voidtv.net keeps hidden, listed for HQ's Hidden tab (B, 25 Oct 2026: "I want all of the hidden things able to be worked").
// Two kinds, each with its gate in scripts/lib/app.js, which this file only reads about and never changes:
//   guessed episodes  a file scripts/match.js placed by position ("sequence guess: file N of M in ..."); epNoGuess keeps it off the site
//   REVIEW TV movies  a film the matcher is not sure of; movieShips keeps it off until B approves it ("movie-<id>": { "approved": true })
// Reads only, no network. B works them in HQ (scripts/hq/index.html, Hidden tab); every action is an entry in catalog/overrides.json.
//   const { guessedShows, reviewMovies, isGuess } = require('./lib/hidden');
const fs = require('fs');
const path = require('path');

const SEQ_GUESS = /^sequence guess/; // the same test as epNoGuess in scripts/lib/app.js
const isGuess = (f) => !!f && SEQ_GUESS.test(f.why || '');
const plays = (f) => !!f && f.playable && !f.langRisk;
const readJson = (p, fb) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fb; } };

// One row per show that holds at least one guessed file the site would otherwise play.
//   guesses   episodes whose file is a guess (kept off the site)        playing   episodes that play and are not guesses
//   off       true when the show has nothing else to play, so it is off the site until B places or accepts a file
// Hidden shows (overrides "hidden": true) are left out. Sorted by most guesses first. opts: showsDir, or grids (the grids already read, as HQ keeps them).
function guessedShows(opts = {}) {
  const dir = opts.showsDir;
  const OV = opts.overrides || {};
  const rows = [];
  const all = opts.grids || (dir && fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => readJson(path.join(dir, f), null)) : []);
  for (const g of all) {
    if (!g || !Array.isArray(g.seasons) || (OV[g.slug] && OV[g.slug].hidden)) continue;
    let guesses = 0, playing = 0;
    for (const se of g.seasons) for (const e of se.episodes || []) {
      if (!plays(e.file)) continue;
      if (isGuess(e.file)) guesses++; else playing++;
    }
    if (guesses) rows.push({ slug: g.slug, show: g.show, guesses, playing, off: playing === 0, selfListed: !!g.selfListed });
  }
  return rows.sort((a, b) => b.guesses - a.guesses || a.show.localeCompare(b.show));
}

// The REVIEW TV movies with a playable file, the ones movieShips keeps hidden until B approves one. Each row says what B decided:
// approved ("movie-<id>": { "approved": true }, it ships) or rejected ({ "rejected": true }, Not this film: it stays hidden and leaves the to-do list).
// Reading 11,000 movie files takes a moment, so the records are kept in memory and read again when the folder changes or after five minutes
// (a rescore rewrites files in place, which a folder's time does not show);
// the decisions come from the overrides passed in, fresh on every call.
let movieCache = { dir: null, stamp: null, at: 0, rows: [] };
function movieRecords(dir) {
  let names = [];
  try { names = fs.readdirSync(dir).filter((f) => f.endsWith('.json')); } catch (e) { return []; }
  let stamp = names.length + ':';
  try { stamp += fs.statSync(dir).mtimeMs; } catch (e) { /* none */ }
  if (movieCache.dir === dir && movieCache.stamp === stamp && Date.now() - movieCache.at < 300000) return movieCache.rows;
  const rows = [];
  for (const f of names) {
    const r = readJson(path.join(dir, f), null);
    if (!r || r.state !== 'REVIEW' || !r.file || !r.file.playable || !r.tmdbId) continue;
    rows.push({
      tmdbId: r.tmdbId, slug: 'movie-' + r.tmdbId, title: r.title, year: r.year || '', runtime: r.runtime || null, poster: r.poster || null, kind: r.kind || 'tv-movie',
      file: { item: r.file.item, itemTitle: r.file.itemTitle || '', name: r.file.file || r.file.stem || '', url: r.file.url, seconds: r.file.seconds || 0, conf: r.file.conf },
      alternates: (r.alternates || []).length,
    });
  }
  rows.sort((a, b) => String(a.title).localeCompare(String(b.title)) || String(a.year).localeCompare(String(b.year)));
  movieCache = { dir, stamp, at: Date.now(), rows };
  return rows;
}
function reviewMovies(opts = {}) {
  const OV = opts.overrides || {};
  return movieRecords(opts.moviesDir).map((m) => { const o = OV[m.slug] || {}; return { ...m, approved: o.approved === true, rejected: o.rejected === true }; });
}

module.exports = { guessedShows, reviewMovies, isGuess };
