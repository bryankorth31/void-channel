// Hearts, as a rule file for the VoidTV card table (cards/src/table.js). Licence: GPL-2.0-or-later (play/LICENSE).
// A traditional trick game, written from its common rules. It is here beside Crazy Eights to prove the table is not
// built for one game: it has everyone acting at once in secret (the pass), tricks, and a score kept over many deals.
// - 3 to 5 players, every card dealt. Three play without the 2 of diamonds, five without the 2 of diamonds and clubs.
// - Before play everyone picks 3 cards to pass, all at once and unseen: to the left on the first deal, then to the
//   right, then (four players) across, then a deal with no pass, and round again.
// - The lowest club in the pack leads the first trick. Follow the suit led if you can; if you cannot, play anything,
//   except that no heart and no queen of spades goes on the first trick while you hold something else.
// - A heart cannot lead until a heart has been played, unless hearts are all you hold.
// - The highest card of the suit led takes the trick and leads the next. Ace is high.
// - Each heart taken is 1 point, the queen of spades 13. Take all 26 and everyone else scores 26 instead.
// - The game ends when someone reaches the target (100); the lowest score wins.
(function (root) {
  'use strict';
  const C = root.VoidCards || require('../src/cards.js');
  const hand = (s, p) => s.zones['hand:' + p];
  const high = (c) => C.ACE_HIGH.indexOf(C.rankOf(c));
  const pointsOf = (c) => (C.suitOf(c) === 'H' ? 1 : c === 'QS' ? 13 : 0);
  // Which way the 3 cards go this deal: 1 to the left, -1 to the right, 2 across, 0 no pass.
  const passTo = (s) => { const cycle = s.n === 4 ? [1, -1, 2, 0] : [1, -1, 0]; return cycle[s.pub.round % cycle.length]; };
  const passWord = (d) => (d === 1 ? 'to the left' : d === -1 ? 'to the right' : 'across');
  // The card that leads the first trick: the lowest club in this table's pack (the 2, or the 3 with five players).
  const opener = (s) => s.pack.filter((c) => C.suitOf(c) === 'C').sort((a, b) => high(a) - high(b))[0];

  // Why this card may not be played now, or null when it may.
  function why(s, p, c) {
    const mine = hand(s, p), trick = s.zones.trick, first = s.pub.tricks === 0;
    if (!trick.length) {
      if (first) return c === opener(s) ? null : 'The ' + C.name(opener(s)) + ' leads the first trick.';
      if (C.suitOf(c) === 'H' && !s.pub.broken && mine.some((x) => C.suitOf(x) !== 'H')) return 'Hearts cannot lead until a heart has been played.';
      return null;
    }
    const led = C.suitOf(trick[0]);
    if (C.suitOf(c) === led) return null;
    if (mine.some((x) => C.suitOf(x) === led)) return 'Follow suit: play one of your ' + C.SUIT_NAMES[led] + '.';
    if (first && pointsOf(c) && mine.some((x) => !pointsOf(x))) return 'No hearts and no queen of spades on the first trick.';
    return null;
  }

  function startPlay(t) {
    const s = t.s, first = opener(s);
    let leader = 0;
    for (let p = 0; p < s.n; p++) if (hand(s, p).includes(first)) leader = p;
    s.phase = 'play'; s.pub.led = leader;
    t.turn(leader);
  }
  function deal(t) {
    const s = t.s;
    for (const id of Object.keys(s.zones)) if (id !== 'draw' && s.zones[id].length) t.move(s.zones[id].slice(), id, 'draw');
    t.shuffle('draw');
    t.deal('draw', 'hand', s.pack.length / s.n);
    s.pub.taken = Array(s.n).fill(0); s.pub.broken = false; s.pub.tricks = 0; s.pub.led = null;
    t.say({ ev: 'round', n: s.pub.round });
    if (passTo(s) === 0) return startPlay(t);
    s.phase = 'pass';
    t.turn(Array.from({ length: s.n }, (_, p) => p));
  }
  function endRound(t) {
    const s = t.s, taken = s.pub.taken, moon = taken.indexOf(26);
    const add = moon >= 0 ? taken.map((_, p) => (p === moon ? 0 : 26)) : taken.slice();
    s.pub.scores = s.pub.scores.map((x, p) => x + add[p]);
    t.say({ ev: 'round-end', add, moon: moon >= 0 ? moon : null });
    if (Math.max(...s.pub.scores) >= s.opts.target) {
      const low = Math.min(...s.pub.scores);
      return t.end({ winners: s.pub.scores.map((x, p) => (x === low ? p : -1)).filter((p) => p >= 0), scores: s.pub.scores.slice() });
    }
    s.pub.round++;
    deal(t);
  }

  const game = {
    id: 'hearts', name: 'Hearts', players: { min: 3, max: 5 },
    options: { target: 100 },
    // pass: the 3 cards a player has chosen, waiting unseen until everyone has chosen. won: tricks taken, face down.
    zones: { draw: { see: 'none' }, hand: { each: true, see: 'owner' }, pass: { each: true, see: 'owner' }, trick: { see: 'all' }, won: { each: true, see: 'none' } },
    pack: (s) => C.standard({ without: s.n === 3 ? ['2D'] : s.n === 5 ? ['2D', '2C'] : [] }),
    setup(t) {
      t.s.pub = { round: 0, scores: Array(t.s.n).fill(0), taken: [], broken: false, tricks: 0, led: null };
      deal(t);
    },
    moves: {
      // Everyone passes at once: the turn names every player who has not chosen yet.
      pass: {
        uses: 'hand', count: [3, 3],
        can: (s) => (s.phase === 'pass' ? null : 'The passing is done.'),
        run(t, p, m) {
          const s = t.s;
          t.move(m.cards, 'hand:' + p, 'pass:' + p);
          t.turn(s.turn.filter((x) => x !== p));
          t.say({ ev: 'passed', by: p });
          if (s.turn.length) return;
          const d = passTo(s);
          for (let q = 0; q < s.n; q++) t.move(s.zones['pass:' + q].slice(), 'pass:' + q, 'hand:' + ((q + d + s.n) % s.n));
          startPlay(t);
        },
      },
      play: {
        uses: 'hand', count: [1, 1],
        can: (s, p, m) => (s.phase === 'play' ? why(s, p, m.cards[0]) : 'Pick 3 cards to pass first.'),
        run(t, p, m) {
          const s = t.s, c = m.cards[0];
          t.move(c, 'hand:' + p, 'trick', { by: p });
          if (C.suitOf(c) === 'H') s.pub.broken = true;
          const trick = s.zones.trick;
          if (trick.length < s.n) return t.next();
          // The trick is full. Its cards lie in the order played, from the leader round the table.
          const led = C.suitOf(trick[0]);
          let best = 0;
          trick.forEach((x, i) => { if (C.suitOf(x) === led && high(x) > high(trick[best])) best = i; });
          const winner = (s.pub.led + best) % s.n;
          s.pub.taken[winner] += trick.reduce((sum, x) => sum + pointsOf(x), 0);
          t.say({ ev: 'trick', won: winner, led: s.pub.led });
          t.move(trick.slice(), 'trick', 'won:' + winner);
          s.pub.tricks++; s.pub.led = winner;
          if (hand(s, winner).length) return t.turn(winner);
          endRound(t);
        },
      },
    },
    hints(s, p) {
      const mine = hand(s, p);
      if (s.phase === 'pass') return { play: { type: 'pass', label: 'Pass 3 cards ' + passWord(passTo(s)), cards: mine.slice(), min: 3, max: 3, choose: null }, buttons: [] };
      return { play: { type: 'play', label: 'Play', cards: mine.filter((c) => !why(s, p, c)), min: 1, max: 1, choose: null }, buttons: [] };
    },
    status(s) {
      if (s.over) return 'Game over.';
      if (s.phase === 'pass') return 'Everyone passes 3 cards ' + passWord(passTo(s)) + '.';
      if (!s.zones.trick.length) return s.pub.tricks === 0 ? 'The ' + C.name(opener(s)) + ' leads.' : s.pub.broken ? 'Any card may lead.' : 'Any card but a heart may lead.';
      return C.SUIT_NAMES[C.suitOf(s.zones.trick[0])].replace(/^./, (x) => x.toUpperCase()) + ' led.';
    },
    pointsOf, passTo, opener,
  };

  if (typeof module === 'object' && module.exports) module.exports = game;
  else (root.VoidGames = root.VoidGames || {})[game.id] = game;
})(typeof self !== 'undefined' ? self : this);
