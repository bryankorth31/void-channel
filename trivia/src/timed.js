// VoidTV Trivia: questions timed to the moment of an episode, for the Live TV strip and the watch party (plan C19;
// Bryan, 20 Nov 2026: "Yes, add the strip"; "trivia /treasure hunt or the detective who done it games"). Licence:
// GPL-2.0-or-later.
//
// momentQuestion({ slug, season, number, at, rounds }) -> Promise of a question, or null. at: seconds into the episode
// file playing now. rounds: which kinds the caller can show; left out, only 'finish-line' (the Live TV strip's contract:
// a spot or whodunit needs its own buttons and timing, and a strip that took it as a plain question would give a
// whodunit's answer away). The watch party asks for ['finish-line', 'spot', 'whodunit']. Each question is offered once
// per page, and only in its own window:
//   finish-line  "Finish the line" on a line said in the last WINDOW seconds (from q.at, the line's end);
//   spot         "Spot it: the red phone", offered from q.at (a few seconds before it shows) until q.open;
//                a tap from q.open to q.close is right (spotPoints);
//   whodunit     offered from q.at (guessing opens) until q.lock; guesses can change until q.lock; the episode
//                reveals the answer at q.reveal, and guessPoints scores each player's last guess then;
//                whodunitResults ranks everyone at the reveal: who had it right, when they locked it in, and how
//                many of the episode's clues (q.clues) they had seen by then (the Mystery channel, plan M2);
//   clue         a clue event (not a question), shown from q.at until q.until; whodunit guesses may change after it.
// Every question has the bank's shape (q, choices, answer, source, band, round), built by scripts/trivia/timed.js from
// moments a person approved on the marking page. pickTimed is the same choice without the fetch (pure; tested).
(function (root) {
  'use strict';
  const WINDOW = 30;
  const BASE = '/trivia/timed/';
  const asked = new Set();
  let index = null;
  const files = {};

  // Is question q offered at second `at`?
  function open(q, at) {
    if (at < q.at) return false;
    if (q.round === 'spot') return at < q.open;
    if (q.round === 'whodunit') return at < q.lock;
    if (q.round === 'clue') return at < q.until;
    return at - q.at <= WINDOW;
  }

  // The question offered now at this episode, not asked before; the latest one when two are open.
  function pickTimed(questions, opts) {
    const o = opts || {};
    const done = o.asked || new Set();
    const rounds = Array.isArray(o.rounds) && o.rounds.length ? o.rounds : ['finish-line'];
    let best = null;
    for (const q of questions || []) {
      if (!rounds.includes(q.round || 'finish-line')) continue;
      if (q.season !== o.season || q.number !== o.number || done.has(q.id) || !open(q, o.at)) continue;
      if (!best || q.at > best.at) best = q;
    }
    return best;
  }

  // The scoring every trivia round uses (trivia/src/game.js points): 500 for right, plus up to 500 for being early,
  // rounded to tens.
  const early = (share) => 500 + Math.round(Math.max(0, Math.min(1, share)) * 50) * 10;

  // Spot it: a tap at second `tap`. Right only while the thing is on screen; the sooner after it shows, the more.
  function spotPoints(tap, q) {
    if (!(tap >= q.open && tap <= q.close)) return 0;
    return early((q.close - tap) / (q.close - q.open));
  }

  // Whodunit: a player's last guess, locked in at second `lockedAt` (before q.lock). Right scores more the earlier it
  // was locked in after guessing opened; a wrong guess or none scores 0.
  function guessPoints(lockedAt, pick, q) {
    if (pick !== q.answer || !(lockedAt >= q.at && lockedAt <= q.lock)) return 0;
    return early((q.lock - lockedAt) / (q.lock - q.at));
  }

  const mmss = (t) => { const s = Math.max(0, Math.floor(t)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const ORD = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];

  // The whodunit's results at the reveal. guesses: each player's last guess, { id, name, pick (0 to 3, or null),
  // lockedAt (the episode second it was made) }. Right answers first, earliest lock-in first; then the rest by name.
  // Each row says when it was locked in against the clues: "before any clue", "before the second clue",
  // "after all 3 clues".
  function whodunitResults(q, guesses) {
    const clues = (q.clues || []).slice().sort((a, b) => a - b);
    const rows = (guesses || []).map((g) => {
      const right = g.pick === q.answer && g.lockedAt >= q.at && g.lockedAt <= q.lock;
      const seen = Number.isFinite(g.lockedAt) ? clues.filter((t) => t <= g.lockedAt).length : 0;
      const when = !Number.isFinite(g.lockedAt) || g.pick == null ? 'no guess'
        : !clues.length ? 'with no clues in this episode'
        : seen === 0 ? 'before any clue'
        : seen < clues.length ? 'before the ' + (ORD[seen] || (seen + 1) + 'th') + ' clue'
        : clues.length === 1 ? 'after the clue' : 'after all ' + clues.length + ' clues';
      return { id: g.id, name: g.name, pick: g.pick == null ? null : g.pick, right, points: guessPoints(g.lockedAt, g.pick, q),
        lockedAt: Number.isFinite(g.lockedAt) ? g.lockedAt : null, at: Number.isFinite(g.lockedAt) ? mmss(g.lockedAt) : '', seen, when };
    });
    rows.sort((a, b) => (b.right - a.right) || (a.right ? a.lockedAt - b.lockedAt : String(a.name).localeCompare(String(b.name))));
    const solved = rows.filter((r) => r.right);
    return { answer: q.choices ? q.choices[q.answer] : null, rows, right: solved.length, of: rows.length, first: solved[0] || null };
  }

  async function getJson(url) {
    try { const r = await fetch(url); return r.ok ? await r.json() : null; } catch (e) { return null; }
  }

  async function momentQuestion(o) {
    if (!o || !o.slug || !Number.isInteger(o.season) || !Number.isInteger(o.number) || !(o.at >= 0)) return null;
    if (index === null) index = (await getJson(BASE + 'index.json')) || { shows: {} };
    if (!index.shows || !index.shows[o.slug]) return null;
    if (!(o.slug in files)) files[o.slug] = getJson(BASE + encodeURIComponent(o.slug) + '.json');
    const data = await files[o.slug];
    const q = pickTimed(data && data.questions, { season: o.season, number: o.number, at: o.at, asked, rounds: o.rounds });
    if (q) asked.add(q.id);
    return q || null;
  }

  const api = { momentQuestion, pickTimed, spotPoints, guessPoints, whodunitResults, WINDOW };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TriviaTimed = api;
})(typeof window !== 'undefined' ? window : globalThis);
