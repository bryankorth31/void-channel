// TRIVIA NIGHTS: questions timed to a moment of an episode (plan C19, the clip chat's part of the Live TV strip;
// Bryan, 20 Nov 2026: "Yes, add the strip"). While a show plays on Live TV, the strip can ask about the line that was
// just said: "Finish the line". Each question comes from a Line moment a person approved on the marking page (the words
// checked against what is heard, plan C0), so nothing a machine heard reaches a screen unchecked (the C6 rule).
//
// Also the watch party's games: 'spot' (Spot it, from find moments) and 'whodunit' (from whodunit moments), and the
// Mystery channel's clue events ('clue', from clue moments; a whodunit lists its episode's clue times); see below.
// A question: { id, category: 'tv', round: 'finish-line', band, q, choices, answer, season, number, at, source, about }
//   at = the second in the episode file the line has been said by (the moment's end); the strip asks from then on.
//   The wrong endings are the ends of other lines said in the same episode (its timed transcript), or, with no
//   transcript, of other approved lines of the same show; never one that matches the right ending.
// Writes trivia/timed/<show>.json and trivia/timed/index.json (not in trivia/bank, which bank.js clears on every build).
// Reads trivia/moments/, trivia/transcripts/, catalog/trivia-pool.json (a show not in the pool is not asked about) and
// catalog/voidtv.db (through the moments check). Nothing here needs AI to run.
// Usage: node scripts/trivia/timed.js     build and check; exit 1 when any question fails its check
'use strict';
const fs = require('fs');
const path = require('path');
const M = require('./moments');
const T = require('./transcripts');

const ROOT = path.join(__dirname, '..', '..');
const OUT = process.env.TRIVIA_TIMED_DIR || path.join(ROOT, 'trivia', 'timed');
const POOL = process.env.TRIVIA_POOL || path.join(ROOT, 'catalog', 'trivia-pool.json');
const DASH = /[–—]/;

// ---------- pure parts (tested) ----------

function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const words = (s) => String(s || '').replace(/[–—]/g, '-').trim().split(/\s+/).filter(Boolean);
const same = (a, b) => a.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim() === b.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
function mmss(t) { const s = Math.max(0, Math.round(t)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

// A line into what is shown and what is to be finished: about half the words each side, at least three to finish.
// Null when the line is too short to make a fair question (fewer than six words).
function split(line) {
  const w = words(line);
  if (w.length < 6) return null;
  const cut = Math.max(3, Math.min(w.length - 3, Math.floor(w.length / 2)));
  return { shown: w.slice(0, cut).join(' '), rest: w.slice(cut).join(' '), n: w.length - cut };
}

// Up to three wrong endings with about as many words, from other lines: the last words of each, never the right ending
// or one that holds it, never two the same. The seed picks them, so a rebuild gives the same question.
function foils(rest, n, others, seed) {
  const pool = [];
  for (const o of others) {
    const w = words(o);
    if (w.length < n + 1) continue;
    const e = w.slice(w.length - n).join(' ');
    if (same(e, rest) || e.toLowerCase().includes(rest.toLowerCase()) || rest.toLowerCase().includes(e.toLowerCase())) continue;
    if (!pool.some((p) => same(p, e))) pool.push(e);
  }
  const out = [];
  let k = seed;
  while (out.length < 3 && pool.length) { k = (Math.imul(k, 1103515245) + 12345) >>> 0; out.push(pool.splice(k % pool.length, 1)[0]); }
  return out.length === 3 ? out : null;
}

// One Finish the Line question from an approved Line moment, or null with the reason.
function question(m, show, otherLines) {
  if (m.kind !== 'line' || !m.approved || !m.line) return { skip: 'not an approved line' };
  const s = split(m.line);
  if (!s) return { skip: 'the line is too short (six words or more)' };
  const seed = hash(m.id);
  const wrong = foils(s.rest, s.n, otherLines, seed);
  if (!wrong) return { skip: 'not enough other lines for three wrong endings' };
  const answer = seed % 4;
  const choices = wrong.slice();
  choices.splice(answer, 0, s.rest);
  return {
    id: 'timed-' + m.id, category: 'tv', round: 'finish-line', band: show.band,
    q: 'Finish the line: "' + s.shown + ' ..."', choices, answer,
    season: m.season, number: m.number, at: m.end,
    source: { site: 'Internet Archive', url: 'https://archive.org/details/' + m.item,
      fact: show.name + ', season ' + m.season + ', episode ' + m.number + ', at ' + mmss(m.start) + ': "' + m.line + '" (the words checked by ' + m.by + ')',
      read: String(m.approved.at || m.at).slice(0, 10) },
    about: { show: m.show, season: m.season, number: m.number, moment: m.id },
  };
}

// The watch party's two games (B, 20 Nov 2026: "trivia /treasure hunt or the detective who done it games").
// Spot it: shown LEAD seconds before the thing appears; a tap from open to close is right, quicker scores more.
const LEAD = 5;
function spotQuestion(m, show) {
  if (m.kind !== 'find' || !m.approved || !m.find) return { skip: 'not an approved spot-it moment' };
  return {
    id: 'timed-' + m.id, category: 'tv', round: 'spot', band: show.band, q: 'Spot it: ' + m.find, find: m.find,
    season: m.season, number: m.number, at: Math.max(0, m.start - LEAD), open: m.start, close: m.end,
    source: { site: 'Internet Archive', url: 'https://archive.org/details/' + m.item,
      fact: show.name + ', season ' + m.season + ', episode ' + m.number + ', from ' + mmss(m.start) + ' to ' + mmss(m.end) + ': ' + m.find + ' (marked by ' + m.by + ')',
      read: String(m.approved.at || m.at).slice(0, 10) },
    about: { show: m.show, season: m.season, number: m.number, moment: m.id },
  };
}

// Whodunit: asked when guessing opens; a guess can change until lock; the reveal scores it. The answer was written by a
// person who watched the episode, and the source says who and where the episode reveals it.
function whodunitQuestion(m, show, clueTimes) {
  if (m.kind !== 'whodunit' || !m.approved) return { skip: 'not an approved whodunit' };
  // The clues shown while guessing is open, in order: the results say how many a player had seen when they locked in.
  const clues = (clueTimes || []).filter((t) => t >= m.start && t <= m.lock).sort((a, b) => a - b);
  return {
    id: 'timed-' + m.id, category: 'tv', round: 'whodunit', band: show.band, q: m.q, choices: m.choices.slice(), answer: m.answer,
    season: m.season, number: m.number, at: m.start, lock: m.lock, reveal: m.end, clues,
    source: { site: 'Internet Archive', url: 'https://archive.org/details/' + m.item,
      fact: show.name + ', season ' + m.season + ', episode ' + m.number + ': revealed at ' + mmss(m.end) + ' (answer written by ' + m.by + ' after watching)',
      read: String(m.approved.at || m.at).slice(0, 10) },
    about: { show: m.show, season: m.season, number: m.number, moment: m.id },
  };
}

// A clue: not a question but an event the strip and the phones show while it is on screen (the Mystery channel, plan
// M1); players may change their whodunit guess after it.
function clueEvent(m, show) {
  if (m.kind !== 'clue' || !m.approved || !m.clue) return { skip: 'not an approved clue' };
  return {
    id: 'timed-' + m.id, category: 'tv', round: 'clue', band: show.band, q: 'Clue: ' + m.clue, clue: m.clue,
    season: m.season, number: m.number, at: m.start, until: m.end,
    source: { site: 'Internet Archive', url: 'https://archive.org/details/' + m.item,
      fact: show.name + ', season ' + m.season + ', episode ' + m.number + ', at ' + mmss(m.start) + ': ' + m.clue + ' (marked by ' + m.by + ')',
      read: String(m.approved.at || m.at).slice(0, 10) },
    about: { show: m.show, season: m.season, number: m.number, moment: m.id },
  };
}

// Everything wrong with a built question, given the moment it came from (or null).
function problems(q, m) {
  const out = [];
  if (!m) return ['its moment is gone'];
  if (q.round === 'spot') {
    if (q.open !== m.start || q.close !== m.end || q.at !== Math.max(0, m.start - LEAD) || q.find !== m.find) out.push('is not at its moment');
    if (DASH.test(q.q)) out.push('carries a long dash');
    return out;
  }
  if (q.round === 'clue') {
    if (q.at !== m.start || q.until !== m.end || q.clue !== m.clue) out.push('is not at its moment');
    if (DASH.test(q.q)) out.push('carries a long dash');
    return out;
  }
  if (q.round === 'whodunit') {
    if (!Array.isArray(q.clues) || q.clues.some((t) => t < q.at || t > q.lock)) out.push('lists a clue outside its guessing time');
    if (q.at !== m.start || q.lock !== m.lock || q.reveal !== m.end) out.push('is not at its moment');
    if (q.answer !== m.answer || JSON.stringify(q.choices) !== JSON.stringify(m.choices)) out.push('does not match the answer written');
    if ([q.q, ...q.choices].some((x) => DASH.test(x))) out.push('carries a long dash');
    return out;
  }
  if (!Array.isArray(q.choices) || q.choices.length !== 4 || new Set(q.choices.map((c) => c.toLowerCase())).size !== 4) out.push('needs four different choices');
  const s = split(m.line);
  if (!s || q.choices[q.answer] !== s.rest) out.push('the right choice is not the rest of the line');
  if (q.at !== m.end || q.season !== m.season || q.number !== m.number) out.push('is not at its moment');
  if ([q.q, ...(q.choices || [])].some((x) => DASH.test(x))) out.push('carries a long dash');
  return out;
}

// ---------- build ----------

function readJson(f, fallback) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fallback; } }

function build() {
  const pool = new Map((readJson(POOL, { shows: [] }).shows || []).map((s) => [s.slug, s]));
  const db = M.openDb();
  const byShow = {};
  const skipped = [];
  for (const key of M.allKeys()) {
    if (key.startsWith('film-')) continue;
    const all = M.load(key).filter((m) => ['line', 'find', 'whodunit', 'clue'].includes(m.kind) && m.approved);
    const moments = all.filter((m) => m.kind === 'line');
    if (!all.length) continue;
    const show = pool.get(key);
    if (!show) { skipped.push(`${key}: not in the trivia pool (no official US rating, or not playing)`); continue; }
    for (const m of all) {
      const bad = M.problems(m, M.fileFor(db, m));
      if (bad.length) { skipped.push(`${m.id}: ${bad.join('; ')}`); continue; }
      if (m.kind !== 'line') {
        const clueTimes = all.filter((c) => c.kind === 'clue' && c.season === m.season && c.number === m.number && !M.problems(c, M.fileFor(db, c)).length).map((c) => c.start);
        const q = m.kind === 'find' ? spotQuestion(m, show) : m.kind === 'clue' ? clueEvent(m, show) : whodunitQuestion(m, show, clueTimes);
        if (q.skip) { skipped.push(`${m.id}: ${q.skip}`); continue; }
        (byShow[key] = byShow[key] || []).push(q);
        continue;
      }
      const tr = readJson(path.join(T.DIR, key, `s${m.season}e${m.number}.json`), null);
      const others = tr && tr.lines.length >= 20
        ? tr.lines.filter((l) => l.end < m.start - 1 || l.start > m.end + 1).map((l) => l.text)
        : moments.filter((x) => x.id !== m.id).map((x) => x.line);
      const q = question(m, show, others);
      if (q.skip) { skipped.push(`${m.id}: ${q.skip}`); continue; }
      (byShow[key] = byShow[key] || []).push(q);
    }
  }
  db.close();
  return { byShow, skipped };
}

// When the questions are the same as the files already there, nothing is written (the build time alone is not a change), so a
// night with nothing new leaves no changed file for the hourly publish (Bryan, 24 Nov 2026: "By itself each morning").
function write(byShow) {
  fs.mkdirSync(OUT, { recursive: true });
  const files = {}, shows = {};
  for (const [slug, qs] of Object.entries(byShow)) {
    qs.sort((a, b) => a.season - b.season || a.number - b.number || a.at - b.at);
    files[slug + '.json'] = JSON.stringify({ questions: qs }) + '\n';
    shows[slug] = qs.length;
  }
  const old = fs.readdirSync(OUT).filter((f) => f.endsWith('.json') && f !== 'index.json');
  const oldIndex = readJson(path.join(OUT, 'index.json'), null);
  const same = oldIndex && JSON.stringify(oldIndex.shows) === JSON.stringify(shows) && old.length === Object.keys(files).length &&
    old.every((f) => files[f] !== undefined && fs.readFileSync(path.join(OUT, f), 'utf8') === files[f]);
  if (same) return shows;
  for (const f of old) fs.rmSync(path.join(OUT, f));
  for (const [f, text] of Object.entries(files)) fs.writeFileSync(path.join(OUT, f), text);
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ builtAt: new Date().toISOString(), shows }) + '\n');
  return shows;
}

function main() {
  const { byShow, skipped } = build();
  // Every question is checked against its moment before anything is written: when one fails, nothing is written and the timed
  // files there stay as they were (24 Nov 2026: a failed check must not leave changed files behind for the publish).
  let n = 0, bad = 0;
  for (const [slug, qs] of Object.entries(byShow)) {
    const moments = new Map(M.load(slug).map((m) => [m.id, m]));
    for (const q of qs) {
      n++;
      const p = problems(q, moments.get(q.about.moment));
      if (p.length) { bad++; console.log(`FAIL ${q.id}: ${p.join('; ')}`); }
    }
  }
  for (const s of skipped) console.log('skipped ' + s);
  console.log(`${n} timed questions for ${Object.keys(byShow).length} shows, ${bad} failed, ${skipped.length} moments skipped` + (bad ? '; nothing was written' : ''));
  if (bad) { process.exitCode = 1; return; }
  write(byShow);
}

if (require.main === module) main();
module.exports = { split, foils, question, spotQuestion, whodunitQuestion, clueEvent, problems, build, write, OUT, LEAD };
