// Crazy Eights, as a rule file for the VoidTV card table (cards/src/table.js). Licence: GPL-2.0-or-later (play/LICENSE).
// A traditional game, written from its common rules, for 2 to 7 players with one pack:
// - Two players are dealt 7 cards each, more than two 5 each. One card is turned up to start the pile (never an eight).
// - On your turn play one card that matches the pile's top card in suit or in rank. An eight goes on anything, and
//   whoever plays it names the suit the next player must follow.
// - If you will not or cannot play, draw. You may draw as long as there are cards (when the pack runs out, the pile
//   under its top card is shuffled into a new pack). With nothing left to draw and nothing to play, you pass.
// - The first player out of cards wins. If the turn goes all the way round on passes, the fewest points in hand wins.
//   Points left in a hand: an eight 50, a king, queen, jack or ten 10, an ace 1, any other card its number.
// Setting: draws. 0 (as dealt here) is draw as long as you like; 1 is the house rule "draw one, then play or pass".
(function (root) {
  'use strict';
  const C = root.VoidCards || require('../src/cards.js');
  const hand = (s, p) => s.zones['hand:' + p];
  const topOf = (s) => s.zones.discard[s.zones.discard.length - 1];
  const fits = (s, c) => C.rankOf(c) === '8' || C.suitOf(c) === s.pub.suit || C.rankOf(c) === C.rankOf(topOf(s));
  const drawnOut = (s) => !!s.opts.draws && s.pub.drew >= s.opts.draws;
  const canDraw = (s) => (s.zones.draw.length > 0 || s.zones.discard.length > 1) && !drawnOut(s);
  const points = (cards) => cards.reduce((sum, c) => { const r = C.rankOf(c); return sum + (r === '8' ? 50 : 'TJQK'.includes(r) ? 10 : r === 'A' ? 1 : +r); }, 0);
  // What the next card must be, in words: "Play hearts, a 7 or any 8."
  function need(s) {
    const r = C.rankOf(topOf(s)), suit = C.SUIT_NAMES[s.pub.suit];
    if (r === '8') return 'Play ' + suit + ' or any 8.';
    return 'Play ' + suit + ', ' + (r === 'A' ? 'an ' : 'a ') + C.RANK_NAMES[r] + ' or any 8.';
  }
  function finish(t, winners) {
    const s = t.s, left = [];
    for (let p = 0; p < s.n; p++) left.push(points(hand(s, p)));
    t.end({ winners, left });
  }

  const game = {
    id: 'crazy-eights', name: 'Crazy Eights', players: { min: 2, max: 7 },
    options: { draws: 0, first: 0 },
    zones: { draw: { see: 'none' }, discard: { see: 'top' }, hand: { each: true, see: 'owner' } },
    pack: () => C.standard(),
    setup(t) {
      const s = t.s;
      t.shuffle('draw');
      t.deal('draw', 'hand', s.n === 2 ? 7 : 5);
      // The first card turned up starts the pile. An eight stays in the pack and the next card is turned instead.
      const up = t.zone('draw').slice().reverse().find((c) => C.rankOf(c) !== '8');
      t.move(up, 'draw', 'discard');
      s.pub = { suit: C.suitOf(up), drew: 0, passes: 0 };
      s.phase = 'play';
      t.turn((s.opts.first || 0) % s.n);
    },
    moves: {
      play: {
        uses: 'hand', count: [1, 1],
        can(s, p, m) {
          const c = m.cards[0];
          if (!fits(s, c)) return 'That card does not match. ' + need(s);
          if (C.rankOf(c) === '8' && hand(s, p).length > 1 && !C.SUITS.includes(m.suit)) return 'Name a suit for your eight.';
          return null;
        },
        run(t, p, m) {
          const s = t.s, c = m.cards[0], eight = C.rankOf(c) === '8';
          t.move(c, 'hand:' + p, 'discard', { by: p });
          s.pub.suit = eight && C.SUITS.includes(m.suit) ? m.suit : C.suitOf(c);
          s.pub.drew = 0; s.pub.passes = 0;
          if (eight) t.say({ ev: 'called', by: p, suit: s.pub.suit });
          if (!hand(s, p).length) return finish(t, [p]);
          t.next();
        },
      },
      draw: {
        can: (s) => (canDraw(s) ? null : drawnOut(s) ? 'You have drawn. Play a card or pass.' : 'There are no cards left to draw.'),
        run(t, p) {
          const s = t.s;
          // The pack ran out: the pile under its top card is shuffled into a new pack.
          if (!s.zones.draw.length) { t.move(s.zones.discard.slice(0, -1), 'discard', 'draw'); t.shuffle('draw'); }
          t.move(t.top('draw'), 'draw', 'hand:' + p, { by: p });
          s.pub.drew++;
        },
      },
      pass: {
        can(s, p) {
          if (canDraw(s)) return 'Draw a card first.';
          if (hand(s, p).some((c) => fits(s, c))) return 'You have a card you can play.';
          return null;
        },
        run(t, p) {
          // Passes in a row count only while nothing at all is left to draw: under the house rule "draw one, then
          // pass" a round of passes is ordinary play, and the turn simply comes round again.
          const s = t.s, dry = !s.zones.draw.length && s.zones.discard.length <= 1;
          s.pub.drew = 0; s.pub.passes = dry ? s.pub.passes + 1 : 0;
          t.say({ ev: 'pass', by: p });
          if (s.pub.passes < s.n) return t.next();
          // Nobody can play and nothing can be drawn: the fewest points in hand wins (a tie is shared).
          const left = [];
          for (let q = 0; q < s.n; q++) left.push(points(hand(s, q)));
          const low = Math.min(...left);
          finish(t, left.map((x, q) => (x === low ? q : -1)).filter((q) => q >= 0));
        },
      },
    },
    // What the player whose turn it is may do: the cards that fit, an eight's choice of suit, and Draw or Pass.
    hints(s, p) {
      const mine = hand(s, p), cards = mine.filter((c) => fits(s, c));
      const eights = mine.length > 1 ? cards.filter((c) => C.rankOf(c) === '8') : [];
      const buttons = [];
      if (canDraw(s)) buttons.push({ type: 'draw', label: 'Draw a card' });
      else if (!cards.length) buttons.push({ type: 'pass', label: 'Pass' });
      return { play: { type: 'play', label: 'Play', cards, min: 1, max: 1,
        choose: eights.length ? { cards: eights, field: 'suit', from: C.SUITS.slice(), title: 'Name a suit' } : null }, buttons };
    },
    // One line for the big screen.
    status: (s) => (s.over ? 'Game over.' : need(s)),
    points,
  };

  if (typeof module === 'object' && module.exports) module.exports = game;
  else (root.VoidGames = root.VoidGames || {})[game.id] = game;
})(typeof self !== 'undefined' ? self : this);
