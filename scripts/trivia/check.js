// TRIVIA NIGHTS: the checker (plan T4). Reads every question back against the records it came from, apart from the
// templates that made it, and says what is wrong. A question fails when:
//   - it does not have exactly four different choices, or its answer is not one of them, or it has no source address;
//   - the right answer is not what the record says;
//   - a wrong answer could also be right (a year that is the real one, a network or maker that is the same name, an actor
//     credited with the same part, a show that also had an episode of that name);
//   - a family question leans on anything outside the family pool, or anything outside the pool at all;
//   - any shown text carries an em or en dash, a slur, or (in a family question) a word kept out of family decks.
// Usage: node scripts/trivia/check.js   (checks trivia/bank as written)
'use strict';
const fs = require('fs');
const path = require('path');
const { norm, sameish, agreedNetwork, makerName, screenOk, archiveMeta, PD_MARK, CLIP_SECS } = require('./bank');

const ROOT = path.join(__dirname, '..', '..');

function checkAll(qs, db, pool, cards, metaOf) {
  const bad = [];
  const fail = (q, why) => bad.push({ id: q.id, why });
  const line = pool.fameLine;
  const inPool = new Map(pool.shows.filter((s) => s.band !== 'out' && s.votes >= line).map((s) => [s.slug, s.band]));
  const filmPool = new Map(pool.films.filter((f) => f.band !== 'out' && f.votes >= line).map((f) => [String(f.tmdbId), f.band]));
  const showRow = db.prepare('select slug, name, network, tvmaze_network as tvmazeNetwork, premiered from shows where slug = ?');
  const credits = db.prepare("select sp.person_id as id, p.name, sp.role from show_people sp join people p on p.tmdb_id = sp.person_id where sp.show_slug = ? and sp.kind = 'cast'");
  // Which shows carry each episode name, read once over the whole catalog (a lookup per question would scan it each time).
  const holdersOf = new Map();
  if (qs.some((q) => q.round === 'episode')) {
    for (const r of db.prepare('select lower(trim(name)) as n, show_slug as slug from episodes where name is not null').iterate()) {
      let h = holdersOf.get(r.n); if (!h) holdersOf.set(r.n, (h = new Set())); h.add(r.slug);
    }
  }
  const epAt = db.prepare('select name from episodes where show_slug = ? and season = ? and number = ?');
  const film = db.prepare('select year, title from movies where tmdb_id = ?');
  const cardById = new Map((cards || []).map((c) => [c.id, c]));
  const ids = new Set();
  const allowed = (band, slug) => { const b = inPool.get(slug); return b && (band === 'after-dark' || b === 'family'); };
  const clipAt = db.prepare('select state, url, seconds from episodes where show_slug = ? and season = ? and number = ?');
  const filmClipAt = db.prepare('select state, url, seconds, title from movies where tmdb_id = ?');
  const meta = metaOf || archiveMeta;
  // A clip plays from archive.org only, for CLIP_SECS, inside the file; its public domain flag is what the item's record says.
  function checkMedia(q, seconds) {
    const m = q.media || {};
    if (!/^https:\/\/archive\.org\/download\//.test(m.url || '')) fail(q, 'the clip does not play from archive.org');
    if (!(m.start >= 0) || m.end - m.start !== CLIP_SECS || m.end > seconds) fail(q, 'the clip is not inside the file');
    if (!['video', 'still', 'audio'].includes(m.kind)) fail(q, 'unknown clip kind');
    if (!!q.pd !== PD_MARK.test((meta(m.item) || {}).licenseurl || '')) fail(q, 'the public domain flag does not match the Archive record');
  }

  for (const q of qs) {
    if (ids.has(q.id)) fail(q, 'the same id twice');
    ids.add(q.id);
    if (!Array.isArray(q.choices) || q.choices.length !== 4) { fail(q, 'not four choices'); continue; }
    if (new Set(q.choices.map((c) => norm(c) || c)).size !== 4) fail(q, 'two choices are the same');
    if (!(q.answer >= 0 && q.answer < 4)) { fail(q, 'answer is not a choice'); continue; }
    if (!q.source || !/^https:\/\//.test(q.source.url || '') || !q.source.site || !q.source.fact) fail(q, 'no source');
    if (/[\u2013\u2014]/.test(q.q + q.choices.join(''))) fail(q, 'a dash in the text');
    if (!['family', 'after-dark'].includes(q.band)) fail(q, 'no band');
    if (!screenOk(q.band, [q.q, ...q.choices])) fail(q, 'a word this band never shows');
    const right = q.choices[q.answer];
    const wrong = q.choices.filter((c, i) => i !== q.answer);
    const a = q.about || {};

    if (q.round === 'first-aired' || q.round === 'network' || q.round === 'cast' || q.round === 'episode') {
      if (!allowed(q.band, a.show)) fail(q, 'the show is not in this band of the pool');
      const s = showRow.get(a.show);
      if (!s) { fail(q, 'show not in the catalog'); continue; }
      if (q.round === 'first-aired') {
        if (String(s.premiered).slice(0, 4) !== right) fail(q, 'year is not the premiere year');
        if (wrong.includes(String(s.premiered).slice(0, 4))) fail(q, 'a wrong year is the real one');
      }
      if (q.round === 'network') {
        const net = agreedNetwork(s);
        if (!net || net !== right) fail(q, 'network is not the one both records agree on');
        if (wrong.some((w) => sameish(w, s.network) || sameish(w, s.tvmazeNetwork))) fail(q, 'a wrong network is the show\'s own');
      }
      if (q.round === 'cast') {
        const cs = credits.all(a.show);
        const part = String(a.part || '');
        const playedIt = cs.filter((c) => c.role && sameish(String(c.role).replace(/\s*\(voice\)\s*$/i, ''), part));
        if (!playedIt.some((c) => c.name === right)) fail(q, 'the answer is not credited with the part');
        if (playedIt.some((c) => wrong.some((w) => sameish(w, c.name)))) fail(q, 'a wrong answer is credited with the part');
        if (!q.q.includes(part)) fail(q, 'the question does not name the part');
      }
      if (q.round === 'episode') {
        const e = epAt.get(a.show, a.season, a.number);
        if (!e || s.name !== right) { fail(q, 'the answer is not the episode\'s show'); continue; }
        if (!q.q.includes('"' + e.name + '"')) fail(q, 'the question does not carry the episode name');
        const holders = holdersOf.get(String(e.name).trim().toLowerCase()) || new Set();
        if (holders.size !== 1) fail(q, 'more than one show has an episode of that name');
        for (const f of a.foils || []) {
          if (!allowed(q.band, f)) fail(q, 'a wrong-answer show is outside this band of the pool');
          const fr = showRow.get(f);
          if (!fr || !wrong.includes(fr.name)) fail(q, 'wrong answers do not match their shows');
          if (holders.has(f)) fail(q, 'a wrong-answer show had that episode too');
        }
      }
    } else if (q.round === 'clip' || q.round === 'still' || q.round === 'listen') {
      // The clip is a file VoidTV plays today for that very episode, the right answer is its show, and the wrong answers are
      // other shows this band allows.
      if (!allowed(q.band, a.show)) fail(q, 'the show is not in this band of the pool');
      const s = showRow.get(a.show);
      const e = clipAt.get(a.show, a.season, a.number);
      if (!s || !e || e.state !== 'LIVE' || e.url !== (q.media || {}).url) { fail(q, 'the clip is not a file VoidTV plays for that episode'); continue; }
      if (s.name !== right) fail(q, 'the answer is not the clip\'s show');
      checkMedia(q, e.seconds);
      for (const f of a.foils || []) {
        if (!allowed(q.band, f)) fail(q, 'a wrong-answer show is outside this band of the pool');
        const fr = showRow.get(f);
        if (!fr || !wrong.includes(fr.name)) fail(q, 'wrong answers do not match their shows');
        if (f === a.show) fail(q, 'a wrong answer is the clip\'s own show');
      }
    } else if (q.round === 'film-clip') {
      if (!filmPool.has(String(a.film)) || (q.band === 'family' && filmPool.get(String(a.film)) !== 'family')) fail(q, 'the film is not in this band of the pool');
      const f = filmClipAt.get(a.film);
      if (!f || f.state !== 'LIVE' || f.url !== (q.media || {}).url) { fail(q, 'the clip is not the file VoidTV plays for that film'); continue; }
      if (f.title !== right) fail(q, 'the answer is not the clip\'s film');
      checkMedia(q, f.seconds);
      for (const id of a.foils || []) {
        const o = film.get(id);
        if (!o || !wrong.includes(o.title)) fail(q, 'wrong answers do not match their films');
        if (!filmPool.has(String(id)) || (q.band === 'family' && filmPool.get(String(id)) !== 'family')) fail(q, 'a wrong-answer film is outside this band of the pool');
        if (o && sameish(o.title, f.title)) fail(q, 'a wrong answer is the same title');
      }
    } else if (q.round === 'film-year') {
      if (!filmPool.has(String(a.film)) || (q.band === 'family' && filmPool.get(String(a.film)) !== 'family')) fail(q, 'the film is not in this band of the pool');
      const f = film.get(a.film);
      if (!f || String(parseInt(f.year, 10)) !== right) fail(q, 'year is not the film\'s');
      if (f && wrong.includes(String(parseInt(f.year, 10)))) fail(q, 'a wrong year is the real one');
    } else if (q.round === 'game-year' || q.round === 'game-maker') {
      const c = cardById.get(a.card);
      if (!c) { fail(q, 'no such card'); continue; }
      if (q.round === 'game-year' && (String(c.year) !== right || wrong.includes(String(c.year)))) fail(q, 'year does not match the card');
      if (q.round === 'game-maker') {
        if (makerName(c.publisher) !== right) fail(q, 'maker does not match the card');
        if (wrong.some((w) => sameish(w, c.publisher))) fail(q, 'a wrong maker is the same name');
      }
    } else fail(q, 'unknown round ' + q.round);
  }
  return bad;
}

function main() {
  const dir = path.join(ROOT, 'trivia', 'bank');
  const idx = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
  const qs = idx.files.flatMap((f) => JSON.parse(fs.readFileSync(path.join(dir, f.file), 'utf8')));
  const pool = JSON.parse(fs.readFileSync(path.join(ROOT, 'catalog', 'trivia-pool.json'), 'utf8'));
  const cardsDir = path.join(ROOT, 'play', 'cards');
  const cards = fs.readdirSync(cardsDir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(cardsDir, f), 'utf8')));
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(path.join(ROOT, 'catalog', 'voidtv.db'), { readOnly: true });
  const bad = checkAll(qs, db, pool, cards);
  db.close();
  if (qs.length !== idx.total) bad.push({ id: 'index', why: 'index says ' + idx.total + ' questions, files hold ' + qs.length });
  if (bad.length) { for (const b of bad.slice(0, 50)) console.error(b.id + ': ' + b.why); console.error(bad.length + ' fail'); process.exit(1); }
  console.log(qs.length + ' questions, every one passes.');
}

if (require.main === module) main();
module.exports = { checkAll };
