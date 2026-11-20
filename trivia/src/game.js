// VoidTV Trivia Nights: picking a game's questions (plan T6). Pure, no page: the host screen and the tests both use it.
// Licence: GPL-2.0-or-later, like the rest of VoidTV's player code.
(function (root) {
  'use strict';

  const ROUND_NAMES = {
    'first-aired': 'First aired', network: 'Network', cast: 'Who played it', episode: 'Name the show',
    'film-year': 'TV movies', 'game-year': 'Game year', 'game-maker': 'Who made it',
    'higher-lower': 'Higher or Lower', 'year-guess': 'Closest without going over',
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

  // ---------- Game formats of our own (plan G3, G4; Bryan, 20 Nov 2026: "Yes, start those two") ----------
  // Both run on trivia/bank/dates.json: every date a first-aired, TV movie or game question already proved, with its source.
  const yearOfDate = (d) => parseInt(String(d).slice(0, 4), 10);

  // Which of two dates came first: -1 a earlier, 1 a later, 0 when the records cannot tell (the same year, and not both a full
  // date). A pair that cannot tell is never asked.
  function order(a, b) {
    const ya = yearOfDate(a.date), yb = yearOfDate(b.date);
    if (ya !== yb) return ya < yb ? -1 : 1;
    if (String(a.date).length === 10 && String(b.date).length === 10 && a.date !== b.date) return a.date < b.date ? -1 : 1;
    return 0;
  }
  const verb = (d) => (d.category === 'tv' ? 'first air' : 'come out');
  function datesFor(dates, opts) {
    const cats = new Set(opts.categories || []);
    return (dates || []).filter((d) => cats.has(d.category) && (opts.band === 'after-dark' || d.band === 'family'));
  }

  // Higher or Lower: a run of `len` steps. The screen shows the last title with its date; was the next one earlier or later?
  // Each step is a two-answer question; the next step starts from the title just revealed.
  function hlRun(dates, opts, len, rand, taken) {
    rand = rand || Math.random;
    const used = taken || new Set();
    const pool = shuffle(datesFor(dates, opts), rand).filter((d) => !used.has(d.title));
    if (pool.length < len + 1) return [];
    // Shows make the best runs (dates to the day, titles people know); start with one when shows are in the game.
    const firstAt = Math.max(0, pool.findIndex((d) => d.category === 'tv'));
    const chain = pool.splice(firstAt, 1);
    used.add(chain[0].title);
    // One kind of title per run (shows with shows, games with games), so each step compares like with like.
    for (let i = pool.length - 1; i >= 0; i--) if (pool[i].category !== chain[0].category) pool.splice(i, 1);
    const out = [];
    while (out.length < len) {
      const prev = chain[chain.length - 1];
      const i = pool.findIndex((d) => !used.has(d.title) && order(d, prev) !== 0 && Math.abs(yearOfDate(d.date) - yearOfDate(prev.date)) <= 25);
      if (i < 0) break;
      const next = pool.splice(i, 1)[0];
      used.add(next.title);
      chain.push(next);
      const before = order(next, prev) < 0;
      out.push({ id: 'hl-' + prev.id + '-' + next.id, category: next.category, round: 'higher-lower', band: prev.band === 'family' && next.band === 'family' ? 'family' : 'after-dark',
        q: 'Did ' + next.title + ' ' + verb(next) + ' before or after ' + prev.title + '?', choices: ['Before', 'After'], answer: before ? 0 : 1,
        hl: { prev: { title: prev.title, date: prev.date }, next: { title: next.title, date: next.date }, step: out.length + 1, of: len },
        source: next.source, source2: prev.source, about: { title: next.title } });
    }
    return out.length === len ? out : [];
  }

  // Closest Without Going Over: guess the year; the closest guess that is not past it wins. One question per proved date.
  function yearQs(dates, opts, n, rand, taken) {
    rand = rand || Math.random;
    const used = taken || new Set();
    const out = [];
    for (const d of shuffle(datesFor(dates, opts), rand)) {
      if (out.length >= n) break;
      if (used.has(d.title)) continue;
      used.add(d.title);
      const y = yearOfDate(d.date);
      out.push({ id: 'yg-' + d.id, category: d.category, round: 'year-guess', band: d.band, kind: 'year',
        q: 'What year did ' + d.title + ' ' + verb(d) + '?', year: y, min: Math.max(1900, Math.min(1940, y - 30)), max: new Date().getFullYear(),
        choices: [], source: d.source, about: { title: d.title } });
    }
    return out;
  }

  // A phone's year guess: a whole year inside the question's range, for the current question only; anything else is dropped.
  function guessOf(msg, current, q) {
    if (!msg || msg.type !== 't-a' || msg.n !== current || !Number.isInteger(msg.year)) return null;
    return msg.year >= q.min && msg.year <= q.max ? msg.year : null;
  }

  // Scoring Closest Without Going Over: the exact year scores 1000; otherwise the closest guess not past the year scores 600
  // (everyone who shares it); a guess past the year, or no guess, scores 0.
  function yearPoints(guesses, year) {
    const out = new Map();
    let best = -Infinity;
    for (const g of guesses.values()) if (g !== null && g <= year && g > best) best = g;
    for (const [seat, g] of guesses) out.set(seat, g === null || g > year ? 0 : g === year ? 1000 : g === best ? 600 : 0);
    return out;
  }

  // The night's order: the regular questions, the year guesses spread through them, and the Higher or Lower run together in the
  // middle so its steps follow one another.
  function compose(regular, run, years) {
    const out = regular.slice();
    const spots = years.length ? years.map((_, i) => Math.round(((i + 1) * out.length) / (years.length + 1))) : [];
    years.forEach((q, i) => out.splice(spots[i] + i, 0, q));
    if (run.length) out.splice(Math.floor(out.length / 2), 0, ...run);
    return out;
  }

  // "1st", "2nd", "3rd", "11th", "22nd".
  function ordinal(n) { const t = n % 100, o = n % 10; return n + (t >= 11 && t <= 13 ? 'th' : o === 1 ? 'st' : o === 2 ? 'nd' : o === 3 ? 'rd' : 'th'); }

  const api = { ROUND_NAMES, CATEGORY_NAMES, seeded, shuffle, subject, allowed, pickGame, keyAction, points, standings, answerOf, ordinal,
    order, datesFor, hlRun, yearQs, guessOf, yearPoints, compose };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TriviaGame = api;
})(this);
