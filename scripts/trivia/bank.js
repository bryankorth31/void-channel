// TRIVIA NIGHTS, step 2: the question bank (plan T4). Every question is made by a template from one recorded fact, and
// the fact's source goes with the question. Wrong answers are real values from the same records, chosen so that none
// can also be right. No model writes or words anything; nothing here needs AI to run.
//
// Reads: catalog/trivia-pool.json (who may be asked about: plays today, rated, at or over the fame line),
//        catalog/voidtv.db (TVmaze premiere dates, networks and episode names; TMDB cast credits and film years),
//        play/cards/*.json (PLAY's games).
// Writes: trivia/bank/<category>-<n>.json (500 questions a file at most) and trivia/bank/index.json.
// Then runs the checker (scripts/trivia/check.js) over everything it wrote and fails if any question fails.
// Usage: node scripts/trivia/bank.js
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'trivia', 'bank');
const PER_FILE = 500;
const THIS_YEAR = new Date().getFullYear();

// ---------- small pure helpers (tested) ----------

// A stable number from a string, and a seeded random from it, so a rebuild makes the same questions in the same order.
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = hash(String(seed)); return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function shuffle(list, rand) { const a = list.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// For comparing names: lower case, accents off, punctuation and company words off.
function norm(s) {
  return String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/ß/g, 'ss').replace(/ł/g, 'l').replace(/đ/g, 'd')
    .replace(/&/g, ' and ').replace(/\b(the|inc|co|corp|corporation|ltd|software|games|entertainment|network|channel|tv)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}
// Two names that could be the same thing (one holds the other once normalised): never both in one question.
function sameish(a, b) { const x = norm(a), y = norm(b); return !!x && !!y && (x === y || x.includes(y) || y.includes(x)); }

// Text shown to people never carries an em or en dash (VoidTV's rule); a source's own dash becomes a plain hyphen.
function clean(s) { return String(s).replace(/[\u2013\u2014]/g, '-').replace(/\s+/g, ' ').trim(); }

// Three wrong years near a right one, never the right one, never in the future.
function nearYears(year, rand) {
  const offs = shuffle([-7, -6, -5, -4, -3, -2, 2, 3, 4, 5, 6, 7], rand);
  const out = [];
  for (const o of offs) { const y = year + o; if (y <= THIS_YEAR && y >= 1900 && !out.includes(y)) out.push(y); if (out.length === 3) break; }
  return out;
}

// A character a question may name: a real part, not "Self", a host, a narrator or a list of parts.
const NOT_A_PART = /^(self|himself|herself|themselves|host|co-host|narrator|various|additional voices?|guest|guest star|unknown|uncredited|announcer|presenter|contestant|judge|panelist|performer|musical guest|correspondent|reporter|interviewer)\b/i;
function usablePart(role) {
  const r = String(role || '').trim();
  if (!r || r.length < 3 || r.length > 40) return false;
  if (/[\/;,]|\bself\b|\bvarious\b/i.test(r)) return false;
  return !NOT_A_PART.test(r.replace(/\s*\(voice\)\s*$/i, ''));
}

// An episode name a question may use: long enough to be its own, not "Episode 4" or "Pilot", not giving the show away.
function usableEpisodeName(name, showName) {
  const n = String(name || '').trim();
  if (n.length < 10 || n.length > 60) return false;
  if (/^(episode|pilot|part|chapter|show|program|season|week|day|night|untitled|tba|tbd)\b/i.test(n)) return false;
  if (/^\d|#\d|\bpart\s+\w+$|\(\d\)$/i.test(n)) return false;
  const words = norm(showName).split(' ').filter((w) => w.length >= 4);
  const own = norm(n).split(' ');
  return !words.some((w) => own.some((o) => o.startsWith(w) || (o.length >= 4 && w.startsWith(o))));
}

// Words no trivia screen shows: one list, in trivia/src/words.js, shared with the host screen and phone nicknames.
// A question whose text or choices hold one is not made.
const { screenOk } = require('../../trivia/src/words');

// An episode name made only of people's names ("Dave Higgins, Doug Llewelyn"): a guest list, not a title anyone knows.
function looksLikeGuests(name) { return /^[A-Z][\w.'-]+ [A-Z][\w.'-]+(\s*(,|&|and)\s*[A-Z][\w.'-]+ [A-Z][\w.'-]+)+$/.test(String(name).trim()); }

// The four choices in a seeded order, with where the right one landed.
function choicesOf(id, right, wrong) {
  const all = shuffle([right, ...wrong], rng(id + '|order'));
  return { choices: all.map((c) => clean(c)), answer: all.indexOf(right) };
}

// ---------- reading what we have ----------

function readJson(f, fb) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return fb; } }
function day(iso) { return iso ? String(iso).slice(0, 10) : null; }
function fileDay(f) { try { return fs.statSync(f).mtime.toISOString().slice(0, 10); } catch (e) { return null; } }

function openDb() {
  const { DatabaseSync } = require('node:sqlite');
  return new DatabaseSync(path.join(ROOT, 'catalog', 'voidtv.db'), { readOnly: true });
}

// Everything the templates need, in plain objects, so the templates themselves stay pure and testable.
// foreign: names of shows VoidTV's list marks as not in English. Their decks would ask a US crowd about actors and
// episode names it has never heard, so they stay out for now (a World TV deck could take them later).
function gather(db, pool, foreign, overrides, metaOf) {
  const line = pool.fameLine;
  if (!line) throw new Error('catalog/trivia-pool.json has no fame line; run node scripts/trivia/pool.js');
  const away = foreign || new Set();
  // What the site keeps behind its 18+ door (Late Night, and anything B marked adult in catalog/overrides.json) never
  // reaches trivia, After dark included: a trivia screen is open to anyone in the room.
  const OV = (overrides !== undefined ? overrides : readJson(path.join(ROOT, 'catalog', 'overrides.json'), {})) || {};
  const lateNight = new Set();
  for (const r of db.prepare('select slug, type, tags from shows').iterate()) {
    if (r.type === 'Late Night' || String(r.tags || '').split(',').map((t) => t.trim()).includes('Late Night') || (OV[r.slug] && OV[r.slug].adult)) lateNight.add(r.slug);
  }
  const showBand = new Map(pool.shows.filter((s) => s.band !== 'out' && s.votes >= line && !away.has(s.name) && !lateNight.has(s.slug)).map((s) => [s.slug, s]));
  const filmBand = new Map(pool.films.filter((f) => f.band !== 'out' && f.votes >= line && !(OV['movie-' + f.tmdbId] && OV['movie-' + f.tmdbId].adult)).map((f) => [String(f.tmdbId), f]));
  const shows = [];
  const getShow = db.prepare('select slug, name, network, tvmaze_network as tvmazeNetwork, tvmaze_id as tvmazeId, tmdb_id as tmdbId, premiered, genres, type, matched_at as matchedAt from shows where slug = ?');
  const getCast = db.prepare("select sp.person_id as id, p.name, sp.role, sp.episodes from show_people sp join people p on p.tmdb_id = sp.person_id where sp.show_slug = ? and sp.kind = 'cast' order by sp.episodes desc, p.name");
  // Episode names from TVmaze only: a self-listed show's "names" are its upload file names.
  const getEps = db.prepare("select season, number, name, airdate from episodes where show_slug = ? and name is not null and (why is null or why not like 'self-listed%') order by season, number");
  // Clips: only episodes VoidTV plays today (LIVE: matched with confidence), as MP4 files a browser plays with sound (match.js has
  // already swapped a silent original for the Archive's own .ia.mp4 copy), at least five minutes long.
  const getClips = db.prepare("select season, number, name, item, file, url, seconds from episodes where show_slug = ? and state = 'LIVE' and playable = 1 and seconds >= 300 and format in ('MPEG4', 'h.264', 'h.264 IA') and lower(url) like '%.mp4' order by season, number");
  for (const [slug, p] of showBand) {
    const s = getShow.get(slug);
    if (!s) continue;
    s.band = p.band; s.votes = p.votes; s.tmdbSource = p.source;
    s.cast = getCast.all(slug);
    s.castRead = fileDay(path.join(ROOT, 'catalog', 'people', slug + '.json'));
    s.episodes = getEps.all(slug);
    s.clips = getClips.all(slug);
    shows.push(s);
  }
  // How many shows carry each episode name, over the whole catalog (not just the pool), so "only one show" is true.
  const nameShows = new Map();
  for (const r of db.prepare('select lower(trim(name)) as n, count(distinct show_slug) as c from episodes where name is not null group by lower(trim(name))').iterate()) nameShows.set(r.n, r.c);
  const films = [];
  const getFilm = db.prepare('select tmdb_id as tmdbId, kind, title, year, hunted_at as huntedAt, state, playable, item, url, seconds, format from movies where tmdb_id = ?');
  for (const [id, p] of filmBand) {
    const f = getFilm.get(+id);
    if (!f) continue;
    f.band = p.band; f.votes = p.votes; f.tmdbSource = p.source; f.read = day(pool.builtAt);
    films.push(f);
  }
  const cardsDir = path.join(ROOT, 'play', 'cards');
  // Only games on PLAY's shelf (play/shelf/index.json), read from their full cards.
  const onShelf = new Set(((readJson(path.join(ROOT, 'play', 'shelf', 'index.json'), {}) || {}).games || []).map((g) => g.id));
  const cards = fs.existsSync(cardsDir) ? fs.readdirSync(cardsDir).filter((f) => f.endsWith('.json')).map((f) => readJson(path.join(cardsDir, f), null)).filter((c) => c && onShelf.has(c.id)) : [];
  return { shows, films, cards, nameShows, metaOf: metaOf || archiveMeta };
}

// An Archive item's record as the catalog cached it (catalog/cache/meta-<item>.json): its licence mark and when it was read.
function archiveMeta(item) {
  const f = path.join(ROOT, 'catalog', 'cache', 'meta-' + item + '.json');
  const m = readJson(f, null);
  const md = (m && m.metadata) || {};
  return { licenseurl: Array.isArray(md.licenseurl) ? md.licenseurl[0] : md.licenseurl || null, read: fileDay(f) };
}

// ---------- the templates ----------

function tvmazeUrl(s) { return 'https://www.tvmaze.com/shows/' + s.tvmazeId; }
function yearOf(d) { const y = parseInt(String(d || '').slice(0, 4), 10); return y >= 1900 && y <= THIS_YEAR ? y : null; }

// Who may stand beside a show as a wrong answer: a different show of a band this question allows, nearest in years.
function showFoils(s, shows, n, rand) {
  const y = yearOf(s.premiered) || 2000;
  const ok = shows.filter((o) => o.slug !== s.slug && (s.band === 'after-dark' || o.band === 'family') && !sameish(o.name, s.name));
  const near = ok.filter((o) => Math.abs((yearOf(o.premiered) || 0) - y) <= 10);
  return shuffle(near.length >= n * 4 ? near : ok, rand);
}

function firstAired(s) {
  const y = yearOf(s.premiered);
  if (!y || !s.tvmazeId) return [];
  const id = 'tv-year-' + s.slug;
  const { choices, answer } = choicesOf(id, String(y), nearYears(y, rng(id)).map(String));
  return [{ id, category: 'tv', round: 'first-aired', band: s.band, q: clean('What year did ' + s.name + ' first air?'), choices, answer,
    source: { site: 'TVmaze', url: tvmazeUrl(s), fact: 'premiered ' + s.premiered, read: day(s.matchedAt) }, about: { show: s.slug, title: s.name, date: s.premiered } }];
}

// Network: only when TVmaze's network and the catalog's agree (TVmaze keeps a show's last network, so a show that moved,
// like Family Matters from ABC to CBS, would otherwise be asked wrong). Syndication is not a network.
function agreedNetwork(s) {
  const a = String(s.tvmazeNetwork || '').trim(), b = String(s.network || '').trim();
  if (!a || !b || norm(a) !== norm(b) || /syndicat/i.test(a) || a.length < 2 || a === 'US') return null;
  return a;
}
function premieredOn(s, shows) {
  const net = agreedNetwork(s);
  const y = yearOf(s.premiered);
  if (!net || !y) return [];
  const id = 'tv-network-' + s.slug;
  const rand = rng(id);
  const byNet = new Map();
  for (const o of shows) { const n = agreedNetwork(o), oy = yearOf(o.premiered); if (n && oy && !sameish(n, net) && !byNet.has(norm(n))) { if (Math.abs(oy - y) <= 8) byNet.set(norm(n), n); } }
  let pickFrom = [...byNet.values()];
  if (pickFrom.length < 3) { for (const o of shows) { const n = agreedNetwork(o); if (n && !sameish(n, net) && !pickFrom.some((p) => sameish(p, n))) pickFrom.push(n); } }
  const wrong = [];
  for (const n of shuffle(pickFrom, rand)) { if (!wrong.some((w) => sameish(w, n))) wrong.push(n); if (wrong.length === 3) break; }
  if (wrong.length < 3) return [];
  const { choices, answer } = choicesOf(id, net, wrong);
  return [{ id, category: 'tv', round: 'network', band: s.band, q: clean('On which network did ' + s.name + ' first air?'), choices, answer,
    source: { site: 'TVmaze', url: tvmazeUrl(s), fact: 'first aired on ' + net + (s.premiered ? ', ' + s.premiered : ''), read: day(s.matchedAt), agrees: 'VoidTV show list' }, about: { show: s.slug } }];
}

// Who played: a part only one person is credited with on this show, in at least 5 episodes. Wrong answers are other cast
// of the same show whose own credited parts do not overlap it.
function whoPlayed(s, maxPerShow) {
  const out = [];
  const parts = new Map();
  for (const c of s.cast) { const k = norm(String(c.role || '').replace(/\s*\(voice\)\s*$/i, '')); if (k) parts.set(k, (parts.get(k) || 0) + 1); }
  for (const c of s.cast) {
    if (out.length >= maxPerShow) break;
    if ((c.episodes || 0) < 5 || !usablePart(c.role)) continue;
    const voice = /\(voice\)\s*$/i.test(c.role);
    const part = c.role.replace(/\s*\(voice\)\s*$/i, '').trim();
    if (parts.get(norm(part)) !== 1 || sameish(part, s.name)) continue; // "Who played Punky Brewster on Punky Brewster?" asks nothing
    const id = 'tv-cast-' + s.slug + '-' + c.id;
    const foils = [];
    for (const o of shuffle(s.cast.filter((x) => x.id !== c.id && (x.episodes || 0) >= 3), rng(id))) {
      if (sameish(o.name, c.name) || foils.some((f) => sameish(f.name, o.name))) continue;
      if (s.cast.some((x) => x.id === o.id && x.role && sameish(String(x.role).replace(/\s*\(voice\)\s*$/i, ''), part))) continue;
      foils.push(o);
      if (foils.length === 3) break;
    }
    if (foils.length < 3) continue;
    const { choices, answer } = choicesOf(id, c.name, foils.map((f) => f.name));
    out.push({ id, category: 'tv', round: 'cast', band: s.band, q: clean((voice ? 'Who voiced ' : 'Who played ') + part + ' on ' + s.name + '?'), choices, answer,
      source: { site: 'TMDB', url: 'https://www.themoviedb.org/tv/' + s.tmdbId + '/cast', fact: c.name + ' as ' + c.role + ', ' + c.episodes + ' episodes', read: s.castRead },
      about: { show: s.slug, person: c.id, part } });
  }
  return out;
}

// Which show had this episode: a name carried by this one show only, in the whole catalog.
// Talk, reality, news and sketch shows name episodes after their guests: no episode round for them.
function guestShow(s) { return /\b(talk|reality|news)\b/i.test(s.genres || '') || /sketch|talk|game show|news/i.test(s.type || ''); }
function whichShow(s, shows, nameShows, maxPerShow) {
  const out = [];
  if (guestShow(s) || !s.tvmazeId) return out;
  const seen = new Set();
  const eps = shuffle(s.episodes, rng('eps-' + s.slug));
  for (const e of eps) {
    if (out.length >= maxPerShow) break;
    const key = String(e.name).trim().toLowerCase();
    if (seen.has(key) || nameShows.get(key) !== 1 || !usableEpisodeName(e.name, s.name) || looksLikeGuests(e.name)) continue;
    seen.add(key);
    const id = 'tv-episode-' + s.slug + '-' + e.season + '-' + e.number;
    const foils = showFoils(s, shows, 3, rng(id)).slice(0, 3);
    if (foils.length < 3) continue;
    const { choices, answer } = choicesOf(id, s.name, foils.map((f) => f.name));
    out.push({ id, category: 'tv', round: 'episode', band: foils.concat([s]).some((x) => x.band === 'after-dark') ? 'after-dark' : 'family',
      q: clean('Which show had an episode called "' + e.name + '"?'), choices, answer,
      source: { site: 'TVmaze', url: tvmazeUrl(s) + '/episodes', fact: 'season ' + e.season + ', episode ' + e.number + (e.airdate ? ', aired ' + e.airdate : ''), read: day(s.matchedAt) },
      about: { show: s.slug, season: e.season, number: e.number, foils: foils.map((f) => f.slug) } });
  }
  return out;
}

// ---------- clips, pictures and sound (plan T7) ----------
// The question names what VoidTV matched an Archive file to (an episode VoidTV plays today, matched with confidence). The clip
// plays straight from archive.org; nothing is copied. A few seconds from the middle of the file (a quarter to three quarters in,
// past the titles and before the credits). An item whose own Archive record carries a public domain mark (CC0 or the Public
// Domain Mark) is flagged pd, for the Public night switch: that mark is the uploader's own statement on the Archive.
const CLIP_SECS = 10;
const PD_MARK = /creativecommons\.org\/publicdomain\/(zero|mark)\//i;
const CLIP_KINDS = [
  ['clip', 'Which show is this clip from?', 'video'],
  ['still', 'Which show is this picture from?', 'still'],
  ['listen', 'Listen. Which show is this?', 'audio'],
];
function mmss(t) { const s = Math.max(0, Math.round(t)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
function clipStart(id, seconds) { return Math.round(seconds * (0.25 + 0.5 * rng(id + '|t')())); }

function clipQs(s, shows, metaOf) {
  const out = [];
  const eps = shuffle(s.clips || [], rng('clips-' + s.slug));
  const usedItems = new Set();
  let k = 0;
  for (const e of eps) {
    if (k >= CLIP_KINDS.length) break;
    if (usedItems.has(e.item) && eps.some((x) => !usedItems.has(x.item))) continue;
    usedItems.add(e.item);
    const [round, ask, kind] = CLIP_KINDS[k++];
    const id = 'clip-' + round + '-' + s.slug + '-' + e.season + '-' + e.number;
    const foils = showFoils(s, shows, 3, rng(id)).slice(0, 3);
    if (foils.length < 3) continue;
    const start = clipStart(id, e.seconds);
    const meta = metaOf(e.item) || {};
    const pd = PD_MARK.test(meta.licenseurl || '');
    const { choices, answer } = choicesOf(id, s.name, foils.map((f) => f.name));
    out.push({ id, category: 'tv', round, band: foils.concat([s]).some((x) => x.band === 'after-dark') ? 'after-dark' : 'family', q: ask, choices, answer,
      media: { kind, url: e.url, start, end: start + CLIP_SECS, item: e.item }, pd,
      source: { site: 'Internet Archive', url: 'https://archive.org/details/' + e.item,
        fact: s.name + ', season ' + e.season + ', episode ' + e.number + (e.name ? ' "' + e.name + '"' : '') + ', at ' + mmss(start) + (pd ? '; the item is marked public domain on the Archive' : ''), read: meta.read },
      about: { show: s.slug, season: e.season, number: e.number, foils: foils.map((f) => f.slug) } });
  }
  return out;
}

// A TV movie from ten seconds of it. Wrong answers are other TV movies of a band this question allows, near in years.
function filmClip(f, films, metaOf) {
  if (f.state !== 'LIVE' || !f.playable || !f.url || !/\.mp4$/i.test(f.url) || !(f.seconds >= 600) || !/^(MPEG4|h\.264|h\.264 IA)$/.test(f.format || '')) return [];
  const id = 'clip-film-' + f.tmdbId;
  const y = parseInt(f.year, 10) || 2000;
  const ok = films.filter((o) => o.tmdbId !== f.tmdbId && (f.band === 'after-dark' || o.band === 'family') && !sameish(o.title, f.title));
  const near = ok.filter((o) => Math.abs((parseInt(o.year, 10) || 0) - y) <= 6);
  const foils = [];
  for (const o of shuffle(near.length >= 3 ? near : ok, rng(id))) { if (!foils.some((x) => sameish(x.title, o.title))) foils.push(o); if (foils.length === 3) break; }
  if (foils.length < 3) return [];
  const start = clipStart(id, f.seconds);
  const meta = metaOf(f.item) || {};
  const pd = PD_MARK.test(meta.licenseurl || '');
  const { choices, answer } = choicesOf(id, f.title, foils.map((o) => o.title));
  return [{ id, category: 'movies', round: 'film-clip', band: foils.concat([f]).some((x) => x.band === 'after-dark') ? 'after-dark' : 'family', q: 'Which TV movie is this clip from?', choices, answer,
    media: { kind: 'video', url: f.url, start, end: start + CLIP_SECS, item: f.item }, pd,
    source: { site: 'Internet Archive', url: 'https://archive.org/details/' + f.item, fact: f.title + ' (' + f.year + '), at ' + mmss(start) + (pd ? '; the item is marked public domain on the Archive' : ''), read: meta.read },
    about: { film: f.tmdbId, foils: foils.map((o) => o.tmdbId) } }];
}

function filmYear(f) {
  const y = parseInt(f.year, 10);
  if (!(y >= 1900 && y <= THIS_YEAR) || /\b(19|20)\d\d\b/.test(f.title)) return [];
  const id = 'film-year-' + f.tmdbId;
  const what = f.kind === 'special' ? 'the special ' : 'the TV movie ';
  const { choices, answer } = choicesOf(id, String(y), nearYears(y, rng(id)).map(String));
  return [{ id, category: 'movies', round: 'film-year', band: f.band, q: clean('What year did ' + what + f.title + ' first air?'), choices, answer,
    source: { site: 'TMDB', url: f.tmdbSource, fact: 'released ' + y, read: f.read }, about: { film: f.tmdbId, title: f.title, date: String(y) } }];
}

// A maker's name as a question may show it: the card's own, with a trailing ", Inc." and the like taken off. A maker
// with a note in brackets (a copy's own publisher, a homebrew note) is not asked about.
function makerName(p) { const m = String(p || '').trim(); if (!m || /[()\/]/.test(m)) return null; return m.replace(/,?\s+(inc|co|corp|ltd)\.?$/i, '').trim(); }

function gameQs(cards) {
  const out = [];
  const shelf = cards.filter((c) => c.id && c.title && c.archive && c.archive.item);
  for (const c of shelf) {
    const src = 'https://archive.org/details/' + c.archive.item;
    const band = 'family';
    // Year: only when the Archive item's own name does not carry a different year (Pitfall's copy is a 1983 one).
    const y = parseInt(c.year, 10);
    const itemYears = (String(c.archive.item).match(/(19|20)\d\d/g) || []).map(Number);
    if (y >= 1970 && y <= THIS_YEAR && itemYears.every((iy) => iy === y)) {
      const id = 'game-year-' + c.id;
      const { choices, answer } = choicesOf(id, String(y), nearYears(y, rng(id)).map(String));
      out.push({ id, category: 'games', round: 'game-year', band, kids: !!c.kids, q: clean('What year did ' + c.title + ' come out?'), choices, answer,
        source: { site: 'Internet Archive', url: src, fact: 'year ' + y + ' on VoidTV PLAY\'s card for this item' }, about: { card: c.id, title: c.title, date: String(y) } });
    }
    const maker = makerName(c.publisher);
    if (maker) {
      const id = 'game-maker-' + c.id;
      const wrong = [];
      for (const o of shuffle(shelf, rng(id))) { const m = makerName(o.publisher); if (m && !sameish(m, maker) && !wrong.some((w) => sameish(w, m))) wrong.push(m); if (wrong.length === 3) break; }
      if (wrong.length === 3) {
        const { choices, answer } = choicesOf(id, maker, wrong);
        out.push({ id, category: 'games', round: 'game-maker', band, kids: !!c.kids, q: clean('Who made ' + c.title + '?'), choices, answer,
          source: { site: 'Internet Archive', url: src, fact: 'publisher ' + c.publisher + ' on VoidTV PLAY\'s card for this item' }, about: { card: c.id } });
      }
    }
  }
  return out;
}

function makeQuestions(data) {
  const qs = [];
  for (const s of data.shows) {
    qs.push(...firstAired(s), ...premieredOn(s, data.shows), ...whoPlayed(s, 4), ...whichShow(s, data.shows, data.nameShows, 3), ...clipQs(s, data.shows, data.metaOf || archiveMeta));
  }
  for (const f of data.films) qs.push(...filmYear(f), ...filmClip(f, data.films, data.metaOf || archiveMeta));
  qs.push(...gameQs(data.cards));
  return qs.filter((q) => screenOk(q.band, [q.q, ...q.choices]));
}

// ---------- writing ----------

// One entry per proved date: { id, title, date ('YYYY-MM-DD' for shows, 'YYYY' for films and games), category, band, source }.
function datesOf(qs) {
  const out = [];
  for (const q of qs) {
    if (!['first-aired', 'film-year', 'game-year'].includes(q.round) || !q.about || !q.about.date || !q.about.title) continue;
    out.push({ id: q.id.replace(/^(tv-year|film-year|game-year)-/, 'd-'), title: q.about.title, date: q.about.date, category: q.category, band: q.band, source: q.source });
  }
  return out;
}

function write(qs, meta) {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const files = [];
  for (const cat of [...new Set(qs.map((q) => q.category))].sort()) {
    const list = qs.filter((q) => q.category === cat).sort((a, b) => hash(a.id) - hash(b.id));
    for (let i = 0; i < list.length; i += PER_FILE) {
      const part = list.slice(i, i + PER_FILE);
      const name = cat + '-' + (i / PER_FILE + 1) + '.json';
      fs.writeFileSync(path.join(OUT, name), JSON.stringify(part));
      files.push({ file: name, category: cat, count: part.length, family: part.filter((q) => q.band === 'family').length, kids: part.filter((q) => q.kids).length,
        media: part.filter((q) => q.media).length, mediaFamily: part.filter((q) => q.media && q.band === 'family').length });
    }
  }
  const rounds = {};
  for (const q of qs) rounds[q.round] = (rounds[q.round] || 0) + 1;
  // The dates file (plan G3 and G4: Closest Without Going Over, Higher or Lower): every date a first-aired, TV movie or game
  // year question already proved, with its title, band and source. The host builds those rounds from it at play time.
  const dates = datesOf(qs);
  fs.writeFileSync(path.join(OUT, 'dates.json'), JSON.stringify(dates));
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ ...meta, total: qs.length, rounds, files, dates: { file: 'dates.json', count: dates.length },
    credit: 'Facts from TVmaze (CC BY-SA), TMDB, Wikidata (CC0) and the Internet Archive. This product uses the TMDB API but is not endorsed or certified by TMDB.' }, null, 1));
  return files;
}

function main() {
  const pool = readJson(path.join(ROOT, 'catalog', 'trivia-pool.json'), null);
  if (!pool) { console.error('No catalog/trivia-pool.json: run node scripts/trivia/pool.js first'); process.exit(1); }
  const db = openDb();
  const list = readJson(path.join(ROOT, 'scripts', 'show-list.json'), { shows: [] });
  const foreign = new Set((list.shows || list).filter((s) => s.language && s.language !== 'en').map((s) => s.name));
  const data = gather(db, pool, foreign);
  const qs = makeQuestions(data);
  const files = write(qs, { builtAt: new Date().toISOString(), fameLine: pool.fameLine });
  console.log('Questions: ' + qs.length + ' in ' + files.length + ' files (' + data.shows.length + ' shows, ' + data.films.length + ' films, ' + data.cards.length + ' games)');
  const { checkAll } = require('./check');
  const bad = checkAll(qs, db, pool, data.cards, data.metaOf);
  db.close();
  if (bad.length) { console.error(bad.length + ' questions fail the checker:'); for (const b of bad.slice(0, 30)) console.error('  ' + b.id + ': ' + b.why); process.exit(1); }
  console.log('Checker: every question passes.');
}

module.exports = { datesOf, clipQs, filmClip, archiveMeta, PD_MARK, CLIP_SECS, mmss, screenOk, looksLikeGuests, guestShow, hash, rng, shuffle, norm, sameish, clean, nearYears, usablePart, usableEpisodeName, choicesOf, agreedNetwork, makerName,
  firstAired, premieredOn, whoPlayed, whichShow, filmYear, gameQs, makeQuestions, gather };
// Exported before main runs, so the checker (which needs these helpers) can load while main is running.
if (require.main === module) main();
