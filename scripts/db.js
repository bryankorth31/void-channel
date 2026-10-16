// THE DATABASE: catalog/shows/*.json -> catalog/voidtv.db (SQLite, one file, metadata only).
// Rebuilt from scratch on every run, so the JSON grids stay the source of truth and the db is
// always a faithful, queryable copy. Open it with any SQLite viewer. No video is ever stored.
// Usage: node scripts/db.js
const fs = require('fs');
const nz = (v) => (v === undefined ? null : v); // SQLite binds null, never undefined (self-listed episodes have no airdate)
const run = (stmt, ...a) => stmt.run(...a.map(nz));
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.join(__dirname, '..');
const PROFILE = require('./lib/profile');
const SHOWS_DIR = path.join(PROFILE.catalogDir, 'shows');
const OUT = path.join(PROFILE.catalogDir, 'voidtv.db');
const LIST = JSON.parse(fs.readFileSync(PROFILE.listFile, 'utf8'));

for (const ext of ['', '-wal', '-shm']) { try { fs.unlinkSync(OUT + ext); } catch (e) {} }
const db = new DatabaseSync(OUT);
db.exec(`
PRAGMA journal_mode = DELETE;
CREATE TABLE shows (
  slug TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, network TEXT,
  tvmaze_id INTEGER, runtime INTEGER, premiered TEXT, tvmaze_network TEXT,
  episodes_total INTEGER, live INTEGER, review INTEGER, missing INTEGER, covered_pct INTEGER,
  hunted INTEGER NOT NULL DEFAULT 0, matched_at TEXT,
  tmdb_id INTEGER, poster TEXT, backdrop TEXT, overview TEXT, genres TEXT, rating REAL, tags TEXT
);
CREATE TABLE people (
  tmdb_id INTEGER PRIMARY KEY, name TEXT NOT NULL, photo TEXT
);
CREATE TABLE show_people (
  show_slug TEXT NOT NULL REFERENCES shows(slug), person_id INTEGER NOT NULL REFERENCES people(tmdb_id),
  role TEXT, kind TEXT NOT NULL, episodes INTEGER,
  PRIMARY KEY (show_slug, person_id, kind)
);
CREATE INDEX idx_show_people_person ON show_people(person_id);
CREATE VIEW connections AS
  SELECT a.show_slug AS show_a, b.show_slug AS show_b, p.name AS via, a.role AS role_a, b.role AS role_b
  FROM show_people a JOIN show_people b ON a.person_id = b.person_id AND a.show_slug < b.show_slug
  JOIN people p ON p.tmdb_id = a.person_id;
CREATE TABLE episodes (
  show_slug TEXT NOT NULL REFERENCES shows(slug), season INTEGER NOT NULL, number INTEGER NOT NULL,
  name TEXT, airdate TEXT, state TEXT NOT NULL,
  confidence REAL, why TEXT, item TEXT, item_title TEXT, file TEXT, url TEXT,
  seconds INTEGER, format TEXT, playable INTEGER, size_mb INTEGER, alternates INTEGER,
  PRIMARY KEY (show_slug, season, number)
);
CREATE TABLE movies (
  tmdb_id INTEGER PRIMARY KEY, kind TEXT, title TEXT NOT NULL, year INTEGER, runtime INTEGER, rating REAL, votes INTEGER,
  poster TEXT, backdrop TEXT, overview TEXT, state TEXT NOT NULL, confidence REAL, item TEXT, item_title TEXT, file TEXT, url TEXT,
  seconds INTEGER, format TEXT, playable INTEGER, size_mb INTEGER, archive_mentions INTEGER, hunted_at TEXT
);
CREATE INDEX idx_movies_state ON movies(state);
CREATE INDEX idx_episodes_state ON episodes(state);
CREATE INDEX idx_episodes_item ON episodes(item);
CREATE VIEW coverage AS
  SELECT type, COUNT(*) AS shows, SUM(live) AS live, SUM(review) AS review, SUM(missing) AS missing,
         SUM(CASE WHEN covered_pct >= 80 THEN 1 ELSE 0 END) AS mostly_complete
  FROM shows WHERE hunted = 1 GROUP BY type ORDER BY live DESC;
CREATE VIEW review_queue AS
  SELECT e.show_slug, s.name AS show, e.season, e.number, e.name AS episode, e.confidence, e.why, e.url
  FROM episodes e JOIN shows s ON s.slug = e.show_slug WHERE e.state = 'REVIEW' ORDER BY s.name, e.season, e.number;
`);

const slugOf = (s) => s.toLowerCase().replace(/&/g, ' and ').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/ /g, '-').replace(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/, '$1-show');
const ART_FILE = path.join(PROFILE.catalogDir, 'art.json');
const ART = fs.existsSync(ART_FILE) ? JSON.parse(fs.readFileSync(ART_FILE, 'utf8')) : {};
const tagsOf = (entry) => (entry.tags && entry.tags.length ? entry.tags.join(', ') : null);
const artCols = (slug, entry) => { const a = ART[slug] || {}; return [a.tmdbId || null, a.poster || null, a.backdrop || null, a.overview || null, a.genres ? a.genres.join(', ') : null, a.rating || null, tagsOf(entry || {})]; };
const insShow = db.prepare(`INSERT INTO shows VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
const insPerson = db.prepare(`INSERT OR IGNORE INTO people VALUES (?,?,?)`);
const insSP = db.prepare(`INSERT OR REPLACE INTO show_people VALUES (?,?,?,?,?)`);
const PEOPLE_DIR = path.join(PROFILE.catalogDir, 'people');
const insEp = db.prepare(`INSERT OR REPLACE INTO episodes VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

let shows = 0, eps = 0;
db.exec('BEGIN');
for (const entry of LIST.shows) {
  const slug = slugOf(entry.name);
  const f = path.join(SHOWS_DIR, slug + '.json');
  const g = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
  if (!g || !g.seasons) {
    run(insShow, slug, entry.name, entry.type, entry.network, null, null, null, null, null, null, null, null, null, 0, null, ...artCols(slug, entry));
    continue;
  }
  run(insShow, slug, entry.name, entry.type, entry.network, g.tvmaze.id, g.tvmaze.runtime, g.tvmaze.premiered, g.tvmaze.network,
    g.coverage.total, g.coverage.live, g.coverage.review, g.coverage.missing, g.coverage.pct, 1, g.matchedAt, ...artCols(slug, entry));
  shows++;
  const pf = path.join(PEOPLE_DIR, slug + '.json');
  if (fs.existsSync(pf)) {
    const pp = JSON.parse(fs.readFileSync(pf, 'utf8'));
    for (const c of pp.cast) { run(insPerson, c.id, c.name, c.photo); run(insSP, slug, c.id, c.character || null, 'cast', c.episodes || null); }
    for (const c of pp.crew) { run(insPerson, c.id, c.name, c.photo); run(insSP, slug, c.id, c.jobs.join(', '), 'crew', c.episodes || null); }
  }
  for (const se of g.seasons) for (const e of se.episodes) {
    const p = e.file;
    run(insEp, slug, se.season, e.number, e.name, e.airdate, e.state,
      p ? p.conf : null, p ? p.why : null, p ? p.item : null, p ? p.itemTitle : null, p ? p.file : null, p ? p.url : null,
      p ? p.seconds : null, p ? p.format : null, p ? (p.playable ? 1 : 0) : null, p ? p.sizeMB : null, e.alternates ? e.alternates.length : 0);
    eps++;
  }
}
// TV movies and specials from catalog/movies/*.json (written by hunt-movies.js).
const MOV_DIR = path.join(PROFILE.catalogDir, 'movies');
const insMov = db.prepare(`INSERT OR REPLACE INTO movies VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
let movies = 0;
if (fs.existsSync(MOV_DIR)) {
  for (const f of fs.readdirSync(MOV_DIR)) {
    if (!f.endsWith('.json')) continue;
    const m = JSON.parse(fs.readFileSync(path.join(MOV_DIR, f), 'utf8'));
    const p = m.file;
    run(insMov, m.tmdbId, m.kind, m.title, m.year ? +m.year : null, m.runtime, m.rating, m.votes, m.poster, m.backdrop, m.overview, m.state,
      p ? p.conf : null, p ? p.item : null, p ? p.itemTitle : null, p ? p.file : null, p ? p.url : null, p ? p.seconds : null, p ? p.format : null,
      p ? (p.playable ? 1 : 0) : null, p ? p.sizeMB : null, m.archiveMentions, m.huntedAt);
    movies++;
  }
}
db.exec('COMMIT');
const liveMovies = db.prepare(`SELECT COUNT(*) c FROM movies WHERE state='LIVE'`).get().c;
const live = db.prepare(`SELECT COUNT(*) c FROM episodes WHERE state='LIVE'`).get().c;
const review = db.prepare(`SELECT COUNT(*) c FROM episodes WHERE state='REVIEW'`).get().c;
db.close();
console.log(`${path.relative(ROOT, OUT)}: ${shows} matched shows (${LIST.shows.length} listed), ${eps} episode rows, ${live} live, ${review} review; ${movies} movies hunted, ${liveMovies} live; ${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB`);
