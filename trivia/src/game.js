// VoidTV Trivia Nights: picking a game's questions (plan T6). Pure, no page: the host screen and the tests both use it.
// Licence: GPL-2.0-or-later, like the rest of VoidTV's player code.
(function (root) {
  'use strict';

  const ROUND_NAMES = {
    'first-aired': 'First aired', network: 'Network', cast: 'Who played it', episode: 'Name the show',
    'film-year': 'TV movies', 'game-year': 'Game year', 'game-maker': 'Who made it',
    clip: 'Name the show from a clip', still: 'Name the show from a picture', listen: 'Name the show by ear', 'film-clip': 'Name the TV movie',
  };
  const CATEGORY_NAMES = { tv: 'TV shows', movies: 'TV movies', games: 'Games' };

  // A seeded random, so a test can replay a game; the page passes Math.random.
  function seeded(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function shuffle(list, rand) { const a = list.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  // What a question is about (a show, a film, a game), so one game never asks about the same thing twice.
  function subject(q) { const a = q.about || {}; return a.show ? 'show:' + a.show : a.film ? 'film:' + a.film : a.card ? 'card:' + a.card : 'q:' + q.id; }

  // The questions a deck allows: family decks take family questions only; after dark takes every question.
  function allowed(questions, opts) {
    const cats = new Set(opts.categories || []);
    // Clips, pictures and sound only when asked for. On a public night only when the host switches them on as their own call
    // (Bryan, 20 Nov 2026: "i want it as a toggle to choose"): showing someone's show to a crowd is a public performance, and an
    // Archive item's "public domain" mark is only its uploader's word (many such marks sit on recent shows).
    return questions.filter((q) => cats.has(q.category) && (opts.band === 'after-dark' || q.band === 'family')
      && (!q.media || (opts.clips !== false && (!opts.publicNight || opts.publicClips === true))));
  }

  // A game: `count` questions, the kinds of question taking turns so ten cast questions never come in a row, no subject
  // twice, and questions seen in earlier games (`seen`, a Set of ids) only when nothing fresh is left.
  function pickGame(questions, opts, rand) {
    rand = rand || Math.random;
    const pool = allowed(questions, opts);
    const seen = opts.seen || new Set();
    const fresh = pool.filter((q) => !seen.has(q.id));
    const source = fresh.length >= opts.count ? fresh : pool;
    const byRound = new Map();
    for (const q of shuffle(source, rand)) { if (!byRound.has(q.round)) byRound.set(q.round, []); byRound.get(q.round).push(q); }
    const rounds = shuffle([...byRound.keys()], rand);
    const out = [], used = new Set();
    // Clips and pictures make at most a quarter of a game: they take longer, and a game is mostly talking.
    const mediaCap = Math.ceil(opts.count / 4);
    let media = 0;
    let progress = true;
    while (out.length < opts.count && progress) {
      progress = false;
      for (const r of rounds) {
        if (out.length >= opts.count) break;
        const list = byRound.get(r);
        while (list.length) {
          const q = list[0];
          if (q.media && media >= mediaCap) break;
          list.shift();
          if (used.has(subject(q))) continue;
          used.add(subject(q)); out.push(q); if (q.media) media++; progress = true; break;
        }
      }
    }
    return out;
  }

  // The keys a host presses. Enter, Space, a clicker's Page Down or the right arrow go on; P pauses; Escape, Backspace
  // and a TV remote's Back (webOS 461, Tizen 10009) go back.
  function keyAction(e) {
    const k = e.key, c = e.keyCode;
    if (k === 'Enter' || k === ' ' || k === 'Spacebar' || k === 'PageDown' || k === 'ArrowRight' || k === 'MediaPlayPause') return 'next';
    if (k === 'p' || k === 'P' || k === 'Pause') return 'pause';
    if (k === 'Escape' || k === 'Backspace' || k === 'GoBack' || k === 'BrowserBack' || c === 461 || c === 10009) return 'back';
    return null;
  }

  // Scoring with phones: a right answer is worth 500, plus up to 500 more for answering early (rounded to tens); with no
  // clock every right answer is worth 1000. A wrong answer or none scores 0.
  function points(right, msLeft, msTotal) {
    if (!right) return 0;
    if (!msTotal) return 1000;
    const share = Math.max(0, Math.min(1, msLeft / msTotal));
    return 500 + Math.round(share * 50) * 10;
  }

  // Standings: highest score first; a tie goes to whoever joined first. Each gets a place (ties share a place).
  function standings(players) {
    const list = players.slice().sort((a, b) => (b.score - a.score) || (a.seat - b.seat));
    let place = 0, last = null;
    return list.map((p, i) => { if (p.score !== last) { place = i + 1; last = p.score; } return Object.assign({}, p, { place }); });
  }

  // What a phone's answer message may be: the question it is for and a pick from 0 to 3. Anything else is dropped.
  function answerOf(msg, current) {
    if (!msg || msg.type !== 't-a' || msg.n !== current || !Number.isInteger(msg.pick) || msg.pick < 0 || msg.pick > 3) return null;
    return msg.pick;
  }

  // "1st", "2nd", "3rd", "11th", "22nd".
  function ordinal(n) { const t = n % 100, o = n % 10; return n + (t >= 11 && t <= 13 ? 'th' : o === 1 ? 'st' : o === 2 ? 'nd' : o === 3 ? 'rd' : 'th'); }

  const api = { ROUND_NAMES, CATEGORY_NAMES, seeded, shuffle, subject, allowed, pickGame, keyAction, points, standings, answerOf, ordinal };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TriviaGame = api;
})(this);
