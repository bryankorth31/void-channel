// Spades, as a rule file for the VoidTV card table (cards/src/table.js). Licence: GPL-2.0-or-later (play/LICENSE).
// A traditional partnership trick game, written from its common rules.
// - Exactly 4 players. Partners sit across: places 0 and 2 against places 1 and 3. One pack, all dealt, 13 each.
// - Each deal starts with bidding. Going round the table from the first bidder (a seat further on each deal), every
//   player bids how many books (tricks) they will take, 0 to 13. A bid of 0 is "nil". Bids are public. A side's bid is
//   its two players' bids added together.
// - The first bidder leads the first trick. Spades are always trump. Follow the suit led if you can; if you cannot,
//   play any card. A spade cannot lead until a spade has been played, unless the leader holds nothing but spades.
// - The highest spade in the trick takes it; with no spade in it, the highest card of the suit led. Ace is high. The
//   winner leads the next trick.
// - Scoring, when all 13 tricks are played, for each side. Books are the two partners' books added together.
//   Nil: a player who bid nil and took no book earns the side 100; one who took any book costs the side 100, and those
//   books still count in the side's books.
//   The side's bid is its non-nil bids added. Books at or over the bid score 10 for each book bid and 1 for each book
//   over, and each book over is a bag. Ten bags cost the side 100 points and come off its count. Books under the bid
//   lose 10 for each book bid.
//   A side whose partners both bid nil scores only its nil results, and each of its books is 1 point and 1 bag.
// - The game ends at the end of a deal when a side has the target (500) or more, or when a side has sunk to the floor
//   (200 below nothing): the higher score wins. If the two sides are level, another deal is played.
(function (root) {
  'use strict';
  const C = root.VoidCards || require('../src/cards.js');
  const hand = (s, p) => s.zones['hand:' + p];
  const high = (c) => C.ACE_HIGH.indexOf(C.rankOf(c));
  const isSpade = (c) => C.suitOf(c) === 'S';
  const sideOf = (p) => p % 2;
  const firstBidder = (s) => (s.opts.first + s.pub.round) % s.n;

  // Why this card may not be played now, or null when it may.
  function why(s, p, c) {
    const mine = hand(s, p), trick = s.zones.trick;
    if (!trick.length) {
      if (isSpade(c) && !s.pub.broken && mine.some((x) => !isSpade(x))) return 'Spades cannot lead until a spade has been played.';
      return null;
    }
    const led = C.suitOf(trick[0]);
    if (C.suitOf(c) === led) return null;
    if (mine.some((x) => C.suitOf(x) === led)) return 'Follow suit: play one of your ' + C.SUIT_NAMES[led] + '.';
    return null;
  }

  // One short line for each seat.
  function notes(s) {
    s.pub.notes = s.pub.bids.map((b, p) => {
      if (b === null) return '';
      const word = b === 0 ? 'Nil' : 'Bid ' + b;
      return s.phase === 'play' ? word + ', took ' + s.pub.took[p] : word;
    });
  }

  function startPlay(t) {
    const s = t.s, leader = firstBidder(s);
    s.phase = 'play'; s.pub.led = leader;
    notes(s);
    t.turn(leader);
  }
  function deal(t) {
    const s = t.s;
    for (const id of Object.keys(s.zones)) if (id !== 'draw' && s.zones[id].length) t.move(s.zones[id].slice(), id, 'draw');
    t.shuffle('draw');
    t.deal('draw', 'hand', s.pack.length / s.n);
    s.pub.bids = Array(s.n).fill(null); s.pub.took = Array(s.n).fill(0);
    s.pub.broken = false; s.pub.tricks = 0; s.pub.led = null;
    s.phase = 'bid';
    notes(s);
    t.say({ ev: 'round', n: s.pub.round });
    t.turn(firstBidder(s));
  }

  // The score a side adds this deal, and the bags it takes. Side 0 is players 0 and 2, side 1 is players 1 and 3.
  function sideResult(s, side) {
    const mates = [side, side + 2], bids = mates.map((p) => s.pub.bids[p]), took = mates.map((p) => s.pub.took[p]);
    const books = took[0] + took[1];
    let add = 0, bags = 0;
    mates.forEach((p, i) => { if (bids[i] === 0) add += took[i] === 0 ? 100 : -100; });
    const bid = bids[0] + bids[1];
    if (bid === 0) { add += books; bags = books; }
    else if (books >= bid) { add += 10 * bid + (books - bid); bags = books - bid; }
    else add -= 10 * bid;
    return { add, bags };
  }
  function endRound(t) {
    const s = t.s, adds = [];
    for (const side of [0, 1]) {
      const r = sideResult(s, side);
      let score = s.pub.scores[side] + r.add, bags = s.pub.bags[side] + r.bags;
      while (bags >= 10) { score -= 100; bags -= 10; }
      adds.push(r.add);
      s.pub.bags[side] = bags;
      s.pub.scores[side] = score; s.pub.scores[side + 2] = score;
    }
    t.say({ ev: 'round-end', add: adds });
    const a = s.pub.scores[0], b = s.pub.scores[1];
    // The game is over when a side reaches the target, or when a side has sunk to the floor (200 below nothing): the
    // higher score wins either way. The floor is there so a game between two luckless sides still ends.
    if ((Math.max(a, b) >= s.opts.target || Math.min(a, b) <= s.opts.floor) && a !== b) {
      return t.end({ winners: a > b ? [0, 2] : [1, 3], scores: [a, b] });
    }
    s.pub.round++;
    deal(t);
  }

  const game = {
    id: 'spades', name: 'Spades', players: { min: 4, max: 4 },
    options: { target: 500, floor: -200, first: 0 },
    // won: tricks taken, face down.
    zones: { draw: { see: 'none' }, hand: { each: true, see: 'owner' }, trick: { see: 'all' }, won: { each: true, see: 'none' } },
    pack: () => C.standard(),
    setup(t) {
      const s = t.s;
      s.pub = { round: 0, scores: Array(s.n).fill(0), teams: [0, 1, 0, 1], bags: [0, 0], bids: [], took: [], notes: [], broken: false, tricks: 0, led: null };
      deal(t);
    },
    moves: {
      bid: {
        can(s, p, m) {
          if (s.phase !== 'bid') return 'The bidding is done.';
          if (s.pub.bids[p] !== null) return 'You have bid already.';
          if (!Number.isInteger(m.n) || m.n < 0 || m.n > 13) return 'Bid a whole number of books from 0 to 13.';
          return null;
        },
        run(t, p, m) {
          const s = t.s;
          s.pub.bids[p] = m.n;
          notes(s);
          t.say({ ev: 'bid', by: p, n: m.n });
          if (s.pub.bids.every((b) => b !== null)) return startPlay(t);
          t.next();
        },
      },
      play: {
        uses: 'hand', count: [1, 1],
        can: (s, p, m) => (s.phase === 'play' ? why(s, p, m.cards[0]) : 'Everyone must bid first.'),
        run(t, p, m) {
          const s = t.s, c = m.cards[0], trick = s.zones.trick;
          // Any spade played breaks spades: one thrown on another suit, or one led by a player who held nothing else.
          if (isSpade(c)) s.pub.broken = true;
          t.move(c, 'hand:' + p, 'trick', { by: p });
          if (trick.length < s.n) return t.next();
          // The trick is full. Its cards lie in the order played, from the leader round the table.
          const led = C.suitOf(trick[0]), spades = trick.some(isSpade), wins = spades ? 'S' : led;
          let best = -1;
          trick.forEach((x, i) => { if (C.suitOf(x) === wins && (best < 0 || high(x) > high(trick[best]))) best = i; });
          const winner = (s.pub.led + best) % s.n;
          s.pub.took[winner]++;
          t.say({ ev: 'trick', won: winner, led: s.pub.led });
          t.move(trick.slice(), 'trick', 'won:' + winner);
          s.pub.tricks++; s.pub.led = winner;
          notes(s);
          if (hand(s, winner).length) return t.turn(winner);
          endRound(t);
        },
      },
    },
    hints(s, p) {
      if (s.phase === 'bid') {
        const from = [{ v: 0, label: 'Nil' }];
        for (let i = 1; i <= 13; i++) from.push({ v: i, label: String(i) });
        return { play: null, buttons: [{ type: 'bid', label: 'Bid', choose: { field: 'n', from, kind: 'option', title: 'How many books?' } }] };
      }
      return { play: { type: 'play', label: 'Play', cards: hand(s, p).filter((c) => !why(s, p, c)), min: 1, max: 1, choose: null }, buttons: [] };
    },
    status(s) {
      if (s.over) return 'Game over.';
      if (s.phase === 'bid') return 'Bidding: how many books will you take?';
      if (!s.zones.trick.length) return s.pub.broken ? 'Spades are broken: any card may lead.' : 'Any card but a spade may lead.';
      return C.SUIT_NAMES[C.suitOf(s.zones.trick[0])].replace(/^./, (x) => x.toUpperCase()) + ' led.';
    },
    sideOf, sideResult,
  };

  if (typeof module === 'object' && module.exports) module.exports = game;
  else (root.VoidGames = root.VoidGames || {})[game.id] = game;
})(typeof self !== 'undefined' ? self : this);
