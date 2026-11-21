// VoidTV Trivia Nights: trivia during Live TV (Bryan, 20 Nov 2026: "using trivia and phone in a controller during live tv"; "you
// can do it across the country or the world, watch a show together and do trivia together, on multiple channels ... starting
// with the most popular content first"). Licence: GPL-2.0-or-later.
//
// Live TV plays the same schedule for everyone, so a question chosen from the channel and the airing (the seed) is the same
// question for every viewer of that channel, anywhere, at the same break: watching together, answering together. The Live TV
// page (scripts/lib/app.js, the phone remote chat's wiring) asks at a break's start and shows the question on the TV and on the
// phones joined to its room, and in the strip under the picture while a show plays (during: true); it never asks on kids
// channels (tvKids).
//
// liveQuestion({ slug, season, number, seed, during }) -> Promise of a question from trivia/bank/shows/<slug>.json, or null:
//   - only that show's questions (built by scripts/trivia/bank.js, each with its source), never a clip;
//   - never about an episode later than the one just shown (no spoilers);
//   - the same seed gives the same question (use the channel id and the airing's start).
//   - during: true (the strip under the picture while the show plays): only cast, first aired and network questions, no episode.
// pickLive(questions, opts) is the same choice without the fetch (pure; tested in tests/trivia-live.test.js).
(function (root) {
  'use strict';
  const G = (typeof module !== 'undefined' && module.exports) ? require('./game') : root.TriviaGame;

  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  // Is this question about an episode the viewer has not seen yet? Only episode questions name an episode.
  function later(q, season, number) {
    const a = q.about || {};
    if (q.round !== 'episode' || !Number.isInteger(a.season) || !Number.isInteger(season)) return false;
    return a.season > season || (a.season === season && Number.isInteger(number) && a.number > number);
  }

  // During the show (the strip under the picture; Bryan, 20 Nov 2026: "Yes, add the strip"): only questions about the show
  // as a whole (who played whom, first aired, network), never one about an episode, so nothing on screen is given away or
  // spoiled. At a break (during false) episode questions up to the one just shown may come too.
  const DURING_ROUNDS = ['cast', 'first-aired', 'network'];

  function pickLive(questions, opts) {
    const o = opts || {};
    const ok = (questions || []).filter((q) => q && !q.media && Array.isArray(q.choices) && q.choices.length >= 2 && !later(q, o.season, o.number)
      && (!o.during || DURING_ROUNDS.includes(q.round)));
    if (!ok.length) return null;
    const list = ok.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const r = G.seeded(hash(String(o.seed == null ? '' : o.seed)))();
    return list[Math.floor(r * list.length)];
  }

  const cache = new Map();
  // base: where trivia/bank lives on this site ('/trivia/bank/' on voidtv.net); fetchJson: injected for tests.
  function liveQuestion(opts, base, fetchJson) {
    const o = opts || {};
    if (!o.slug || !/^[a-z0-9-]+$/.test(o.slug)) return Promise.resolve(null);
    const url = (base || '/trivia/bank/') + 'shows/' + o.slug + '.json';
    const get = fetchJson || ((u) => fetch(u).then((r) => (r.ok ? r.json() : [])));
    if (!cache.has(url)) cache.set(url, get(url).catch(() => []));
    return cache.get(url).then((qs) => pickLive(qs, o)).catch(() => null);
  }

  const api = { pickLive, liveQuestion, later, hash, DURING_ROUNDS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TriviaLive = api;
})(this);
