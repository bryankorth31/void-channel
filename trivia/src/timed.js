// VoidTV Trivia: questions timed to the moment of an episode, for the Live TV strip (plan C19; Bryan, 20 Nov 2026:
// "Yes, add the strip"). Licence: GPL-2.0-or-later.
//
// momentQuestion({ slug, season, number, at }) -> Promise of a question, or null.
//   at: seconds into the episode file playing now. Returns a "Finish the line" question about a line said in the last
//   WINDOW seconds, each one once per page; null when the show has none, nothing was just said, or the files are missing.
//   The question has the bank's shape (q, choices, answer, source, band, round 'finish-line'), built by
//   scripts/trivia/timed.js from lines a person approved on the marking page.
// pickTimed(questions, opts) is the same choice without the fetch (pure; tested in tests/trivia-timed.test.js).
(function (root) {
  'use strict';
  const WINDOW = 30;
  const BASE = '/trivia/timed/';
  const asked = new Set();
  let index = null;
  const files = {};

  // The line said most recently, within the window, at this episode, not asked before.
  function pickTimed(questions, opts) {
    const o = opts || {};
    const done = o.asked || new Set();
    let best = null;
    for (const q of questions || []) {
      if (q.season !== o.season || q.number !== o.number || done.has(q.id)) continue;
      if (q.at > o.at || o.at - q.at > WINDOW) continue;
      if (!best || q.at > best.at) best = q;
    }
    return best;
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
    const q = pickTimed(data && data.questions, { season: o.season, number: o.number, at: o.at, asked });
    if (q) asked.add(q.id);
    return q || null;
  }

  const api = { momentQuestion, pickTimed, WINDOW };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TriviaTimed = api;
})(typeof window !== 'undefined' ? window : globalThis);
