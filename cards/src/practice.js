// VoidTV cards: the practice hand. Licence: GPL-2.0-or-later (play/LICENSE).
// Bryan, 23 Nov 2026: "maybe even a walkkthrough hand if tyhey choose". From pictures he picked "practice C": a Practice
// hand button beside Deal; whoever has joined plays with tips (on the big screen for the room, on each phone for its own
// player), and the table plays the empty seats.
// The table's seats are played here, in the big screen's page, through the dealer's own front door: each one joins as a
// phone would (a seat of its own, 'table-1' and on, and a player key) and is told exactly what a phone in its place would
// be told: its own hand and what it may do, and the public table. It never reads the game's state, so it plays fair, and
// the dealer needs no change. A move it tries that the rules refuse is answered at once, on this page, and costs nothing.
// The pure part (seatsFor, candidates, create with a schedule given) is tested in Node: cards/test/practice.test.js.
(function (root) {
  'use strict';
  const C = root.VoidCards || require('./cards.js');
  const SIZE = 3;          // a practice table has three seats, or the game's own least or most
  const WAIT = 1100;       // how long a seat of the table waits before it moves, so a person can follow it
  const TRIES = 2000;      // the most moves a seat tries for one turn
  const PREFIX = 'table-';

  // How many seats a practice table of this game has.
  const seatsFor = (game) => Math.min(game.players.max, Math.max(game.players.min, SIZE));
  const isSeat = (to) => typeof to === 'string' && to.startsWith(PREFIX);

  const ORDER = 'A23456789TJQK';
  const low = (a, b) => ORDER.indexOf(C.rankOf(a)) - ORDER.indexOf(C.rankOf(b));
  // Every way to pick k of the cards, in order, up to cap of them.
  function combos(list, k, cap) {
    const out = [];
    if (k === 0) return [[]];
    const pick = (from, acc) => {
      if (out.length >= cap) return;
      if (acc.length === k) { out.push(acc.slice()); return; }
      for (let i = from; i < list.length && out.length < cap; i++) { acc.push(list[i]); pick(i + 1, acc); acc.pop(); }
    };
    pick(0, []);
    return out;
  }
  // The answers worth trying to a question a move asks, best first. A suit: the one held most. A bid: the game's own guess
  // for the hand, then the ones nearest it, nil last. Anything else: in the order offered.
  function answers(game, ch, held) {
    const from = (ch.from || []).map((x) => (x !== null && typeof x === 'object' ? x.v : x));
    if (ch.kind === 'suit') {
      const n = (s) => held.filter((c) => C.rankOf(c) !== '8' && C.suitOf(c) === s).length;
      return from.slice().sort((a, b) => n(b) - n(a));
    }
    if (ch.field === 'n' && game && game.bot && typeof game.bot.bid === 'function') {
      const g = game.bot.bid(held);
      return from.slice().sort((a, b) => (a === 0) - (b === 0) || Math.abs(a - g) - Math.abs(b - g));
    }
    return from;
  }
  // The moves worth trying for one turn, best first, from what a phone in that seat is told (mine: its own cards and
  // hints) and the public table. First the moves made with cards (a game's extra ones, as Lay down, before its main one),
  // low cards first and a card that asks a question (an eight) last, a discard high first; then the buttons.
  function candidates(game, mine, v, me, rand) {
    const h = mine && mine.hints;
    if (!h) return [];
    const held = (mine.zones && mine.zones['hand:' + me] && mine.zones['hand:' + me].cards) || [], out = [];
    const moves = (Array.isArray(h.plays) ? h.plays.filter(Boolean) : []).concat(h.play ? [h.play] : []);
    for (const m of moves) {
      const shed = /discard|pass/.test(m.type), asks = m.choose && Array.isArray(m.choose.cards) ? m.choose.cards : [];
      // Asking another player (Go Fish) goes in no fixed order: the same ask of the same player, turn after turn, could go on
      // for ever once the pack is empty.
      const someone = !!(m.choose && m.choose.kind === 'player');
      let cards = (Array.isArray(m.cards) ? m.cards : held).slice().sort((a, b) => (shed ? low(b, a) : low(a, b)));
      cards.sort((a, b) => asks.includes(a) - asks.includes(b));
      if (someone) cards = C.shuffle(cards, rand);
      const lo = m.min === undefined ? 1 : m.min, hi = m.max === undefined ? 1 : m.max;
      const sizes = (lo >= 3 ? [lo + 1, lo] : [2, 1, 0]).filter((k) => k >= lo && k <= hi && k <= cards.length);
      for (const k of sizes) {
        for (const pick of combos(cards, k, TRIES)) {
          const ask = m.choose && (!Array.isArray(m.choose.cards) || pick.some((c) => m.choose.cards.includes(c)));
          for (const a of ask ? (someone ? C.shuffle(answers(game, m.choose, held), rand) : answers(game, m.choose, held)) : [undefined]) {
            const move = { type: m.type, cards: pick };
            if (ask) move[m.choose.field] = a;
            out.push(move);
            if (out.length >= TRIES) return out;
          }
        }
      }
    }
    for (const b of Array.isArray(h.buttons) ? h.buttons : []) {
      if (b.choose) for (const a of answers(game, b.choose, held)) out.push({ type: b.type, [b.choose.field]: a });
      else out.push({ type: b.type });
    }
    return out.slice(0, TRIES);
  }

  // The practice table: the seats it plays, and the way the page's messages reach them.
  // o: { dealer, games, schedule(fn, ms), cancel(timer), wait, stuck(seat), rand (for a test: the order of asks) }
  function create(o) {
    const bots = new Map();
    const schedule = o.schedule || ((fn, ms) => setTimeout(fn, ms));
    const cancel = o.cancel || ((t) => clearTimeout(t));
    const wait = o.wait === undefined ? WAIT : o.wait;
    let on = false;

    const due = (b) => on && b.you && Number.isInteger(b.you.me) && b.mine && b.mine.hints && b.table && b.table.v &&
      !b.table.v.over && Array.isArray(b.table.v.turn) && b.table.v.turn.includes(b.you.me);
    function poke(b) {
      if (b.timer || b.trying || !due(b)) return;
      b.timer = schedule(() => { b.timer = 0; act(b); }, wait);
    }
    function act(b) {
      if (!due(b)) return;
      const list = candidates(o.games[b.table.v.game], b.mine, b.table.v, b.you.me, o.rand);
      let done = false;
      b.trying = true;
      for (const move of list) {
        b.refused = false;
        o.dealer.relay({ from: b.seat, msg: { type: 'c-move', move } });
        if (!b.refused) { done = true; break; }
      }
      b.trying = false;
      if (done) poke(b);
      else if (o.stuck) o.stuck(b.seat);
    }
    // What the dealer says to one of the table's seats, as it would say it to a phone.
    function take(b, msg) {
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'c-you') b.you = msg;
      else if (msg.type === 'c-table') b.table = msg;
      else if (msg.type === 'c-hand') b.mine = msg.m;
      else if (msg.type === 'c-no') b.refused = true;
      poke(b);
    }

    return {
      get on() { return on; },
      seats: () => [...bots.keys()],
      // Fill the empty seats for a practice hand of this game with this many people at the table: the table's seats join
      // the dealer as phones would, after the people. Answers how many seats the table plays.
      begin(game, people) {
        this.end();
        on = true;
        const count = Math.max(0, seatsFor(game) - Math.max(0, people | 0));
        for (let i = 1; i <= count; i++) {
          const b = { seat: PREFIX + i, key: 'voidtv-practice-' + PREFIX + i, you: null, table: null, mine: null, timer: 0, trying: false, refused: false };
          bots.set(b.seat, b);
          o.dealer.relay({ type: 'join', from: b.seat });
          o.dealer.relay({ from: b.seat, msg: { type: 'c-hi', key: b.key, name: 'Table ' + i } });
        }
        return count;
      },
      // The practice is over: the table's seats leave, as a phone that closed would.
      end() {
        on = false;
        const was = [...bots.values()];
        bots.clear();
        for (const b of was) { if (b.timer) cancel(b.timer); o.dealer.relay({ type: 'leave', from: b.seat }); }
      },
      // A message from the dealer: one for a seat of the table is taken here (true); one for everyone is seen here too and
      // still goes to the phones (false); anything else is not ours (false).
      deliver(to, msg) {
        if (to === 'all') { for (const b of bots.values()) take(b, msg); return false; }
        const b = bots.get(to);
        if (b) { take(b, msg); return true; }
        return isSeat(to);
      },
    };
  }

  const api = { create, candidates, seatsFor, combos, isSeat, SIZE, WAIT };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VoidPractice = api;
})(typeof self !== 'undefined' ? self : this);
