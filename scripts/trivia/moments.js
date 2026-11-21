// TRIVIA NIGHTS: the moment library (plan C0). A moment is one stretch of one Archive file that a person picked
// because it says the show: the main cast on screen, a famous line, the theme, one frame. Clip questions are built
// over moments (plan C2), never over ten random seconds (B, 20 Nov 2026, after watching random clips: "I'm not sure
// that the examples you're using are that noticeable").
//
// A moment, as kept in trivia/moments/<show slug>.json or trivia/moments/film-<TMDB id>.json:
//   { id, kind: scene | line | theme | still | find | whodunit, show (slug) or film (TMDB id), season, number, item, url,
//     start, end (seconds; a still has end = start), line (the words heard, for a line), note,
//     by (who picked it), at (when), approved: { by, at } }
// Two kinds for the watch party's games (B, 20 Nov 2026: "trivia /treasure hunt or the detective who done it games"):
//   find: something to spot on screen; find = what ("the red phone"); start to end = while it can be seen (5 to 20 s).
//   whodunit: an episode's mystery, written once by a person; q (the question), choices (four suspects), answer (0 to 3),
//     start = when guessing opens, lock = when guesses close, end = when the episode reveals it.
//   clue: a clue in a mystery episode (B, 20 Nov 2026, the Mystery channel: "compete along the way with clues");
//     clue = what it is ("the muddy boots"); start to end = while it shows (5 to 20 s). It pops up then, and players
//     can change their whodunit guess after it.
// A moment a person picks on the marking page is approved by that person as they save it. Moments found by a machine
// later (subtitle lines, transcripts) are saved without approved and do not reach a game until a person approves them.
//
// The check reads every moment back against catalog/voidtv.db: the episode or film still plays from the Archive as an
// MP4 that clip rounds may use, at the same file, and the moment sits inside it with a sane length.
// Usage: node scripts/trivia/moments.js     check every moment file; exit 1 when any moment fails
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
// TRIVIA_MOMENTS_DIR and TRIVIA_DB move the store and the catalog (the tests use them).
const DIR = process.env.TRIVIA_MOMENTS_DIR || path.join(ROOT, 'trivia', 'moments');
const KINDS = { scene: 'Scene', line: 'Line', theme: 'Theme song', still: 'Still', find: 'Spot it', whodunit: 'Whodunit', clue: 'Clue' };
const MIN_SECS = 5;
const MAX_SECS = 20;
// What clip rounds may cut from: live, plays, MP4, five minutes or more (episodes) or ten (films), as the bank's templates.
const CLIP_OK = "state = 'LIVE' and playable = 1 and format in ('MPEG4', 'h.264', 'h.264 IA') and lower(url) like '%.mp4'";

// ---------- the catalog side ----------

function openDb() {
  const { DatabaseSync } = require('node:sqlite');
  return new DatabaseSync(process.env.TRIVIA_DB || path.join(ROOT, 'catalog', 'voidtv.db'), { readOnly: true });
}

// Episodes of one show that clip rounds may use.
function episodesOf(db, slug) {
  return db.prepare(`select season, number, name, item, url, seconds from episodes where show_slug = ? and ${CLIP_OK} and seconds >= 300 order by season, number`).all(slug)
    .map((r) => ({ ...r }));
}

// A film that clip rounds may use, or null.
function filmOf(db, tmdb) {
  const r = db.prepare(`select tmdb_id as tmdb, title, year, item, url, seconds from movies where tmdb_id = ? and ${CLIP_OK} and seconds >= 600`).get(tmdb);
  return r ? { ...r } : null;
}

// ---------- the check (pure; tested) ----------

const DASH = /[–—]/;

// Everything wrong with one moment, given what the catalog says of its file ({ url, seconds } or null).
function problems(m, file) {
  const out = [];
  if (!m || typeof m !== 'object') return ['not a moment'];
  if (!KINDS[m.kind]) out.push('kind must be one of ' + Object.keys(KINDS).join(', '));
  if (!m.show && !m.film) out.push('names no show or film');
  if (!m.by || String(m.by).trim().length < 2 || String(m.by).length > 40) out.push('says nobody picked it');
  if (!m.at || isNaN(Date.parse(m.at))) out.push('has no time it was picked');
  if (!Number.isFinite(m.start) || !Number.isFinite(m.end)) out.push('has no start and end');
  else if (m.kind === 'still') { if (m.end !== m.start) out.push('a still is one frame: end must equal start'); }
  else if (m.kind === 'whodunit') {
    if (!(Number.isFinite(m.lock) && m.start < m.lock && m.lock <= m.end)) out.push('a whodunit needs guessing to open, then close, then the reveal, in that order');
    else if (m.lock - m.start < 60) out.push('a whodunit needs at least a minute to guess in');
  }
  else if (m.end - m.start < MIN_SECS || m.end - m.start > MAX_SECS) out.push(`must run ${MIN_SECS} to ${MAX_SECS} seconds`);
  if (m.kind === 'line' && !(m.line && String(m.line).trim())) out.push('a line moment needs the words heard');
  if (m.kind === 'clue' && !(m.clue && String(m.clue).trim().length >= 3 && String(m.clue).length <= 120)) out.push('a clue needs what the clue is (3 to 120 characters)');
  if (m.kind === 'find' && !(m.find && String(m.find).trim().length >= 3 && String(m.find).length <= 80)) out.push('a spot-it moment needs what to find (3 to 80 characters)');
  if (m.kind === 'whodunit') {
    const c = Array.isArray(m.choices) ? m.choices.map((x) => String(x || '').trim()) : [];
    if (!m.q || !String(m.q).trim() || String(m.q).length > 120) out.push('a whodunit needs its question (up to 120 characters)');
    if (c.length !== 4 || c.some((x) => !x || x.length > 60) || new Set(c.map((x) => x.toLowerCase())).size !== 4) out.push('a whodunit needs four different suspects');
    if (!Number.isInteger(m.answer) || m.answer < 0 || m.answer > 3) out.push('a whodunit needs the right answer picked');
    for (const x of [m.q, ...c]) if (x && DASH.test(x)) { out.push('a whodunit carries a long dash'); break; }
  }
  for (const k of ['line', 'note', 'find', 'clue']) {
    if (m[k] && String(m[k]).length > 200) out.push(k + ' is longer than 200 characters');
    if (m[k] && DASH.test(m[k])) out.push(k + ' carries a long dash');
  }
  if (!file) out.push('its episode or film no longer plays as a clip file on VoidTV');
  else {
    if (file.url !== m.url) out.push('the catalog now plays a different file for it');
    if (Number.isFinite(m.start) && (m.start < 0 || m.end > file.seconds)) out.push('sits outside the file');
  }
  return out;
}

// The file a moment points at, from the catalog.
function fileFor(db, m) {
  if (m.film) return filmOf(db, m.film);
  return episodesOf(db, m.show).find((e) => e.season === m.season && e.number === m.number) || null;
}

// A moment's id: what it is from and where, so the same stretch saved twice is one moment.
function momentId(m) {
  const from = m.film ? 'film-' + m.film : m.show + '-s' + m.season + 'e' + m.number;
  return 'm-' + from + '-' + m.kind + '-' + Math.round(m.start * 10);
}

// ---------- the store ----------

function fileName(key) { return path.join(DIR, (/^film-\d+$/.test(key) ? key : key.replace(/[^a-z0-9-]/g, '')) + '.json'); }
function keyOf(m) { return m.film ? 'film-' + m.film : m.show; }

function load(key) {
  try { return JSON.parse(fs.readFileSync(fileName(key), 'utf8')).moments || []; } catch { return []; }
}

function save(key, moments) {
  if (!moments.length) { fs.rmSync(fileName(key), { force: true }); return; }   // the last one deleted: no empty file left
  fs.mkdirSync(DIR, { recursive: true });
  const sorted = moments.slice().sort((a, b) => (a.season || 0) - (b.season || 0) || (a.number || 0) - (b.number || 0) || a.start - b.start);
  fs.writeFileSync(fileName(key), JSON.stringify({ moments: sorted }, null, 1) + '\n');
}

function allKeys() {
  try { return fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)); } catch { return []; }
}

// ---------- check everything ----------

function checkAll(db) {
  const bad = [];
  let n = 0;
  for (const key of allKeys()) {
    for (const m of load(key)) {
      n++;
      const p = problems(m, fileFor(db, m));
      if (p.length) bad.push(`${m.id || key}: ${p.join('; ')}`);
    }
  }
  return { n, bad };
}

function main() {
  const db = openDb();
  const { n, bad } = checkAll(db);
  db.close();
  for (const b of bad) console.log('FAIL ' + b);
  console.log(`${n} moments checked, ${bad.length} failed`);
  if (bad.length) process.exitCode = 1;
}

if (require.main === module) main();
module.exports = { KINDS, MIN_SECS, MAX_SECS, CLIP_OK, DIR, openDb, episodesOf, filmOf, problems, fileFor, momentId, keyOf, load, save, allKeys, checkAll };
