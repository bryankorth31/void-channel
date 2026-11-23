// Rummy, as a rule file for the VoidTV card table (cards/src/table.js). Licence: GPL-2.0-or-later (play/LICENSE).
// The plain, traditional game, written from its common rules, for 2 to 6 players with one pack:
// - Two players are dealt 10 cards each, three or four players 7 each, five or six players 6 each. One card is turned
//   up to start the pile. The rest is the pack, face down.
// - A set is 3 or 4 cards of one rank. A run is 3 or more cards of one suit in order, ace low (A 2 3 up to J Q K). King
//   then ace is not a run.
// - A turn has two steps. First you draw: the top card of the pack, or the top card of the pile (everyone sees that one).
//   Then, as often as you like, you lay down a set or a run from your hand, or lay off cards onto any set or run on the
//   table, yours or anyone else's. Then you throw one card on the pile, and the turn passes.
// - You may not throw back the card you just took from the pile in the same turn (unless it is the last card you hold,
//   which otherwise could never be thrown).
// - When the pack runs out, the pile under its top card is turned over as the new pack, not shuffled. The third time the
//   pack would have to be turned over, the deal ends instead: the fewest points in hand wins, and a tie is shared.
// - The first player whose hand is empty (after laying down, laying off or throwing) wins the deal.
//   Points left in a hand: an ace 1, 2 to 10 their number, a jack, queen or king 10.
// One deal is one game.
(function (root) {
  'use strict';
  const C = root.VoidCards || require('../src/cards.js');
  const rules = () => root.VoidRules || require('../src/rules.js');   // the rules card's word helpers, read when a tip is made
  const hand = (s, p) => s.zones['hand:' + p];
  const ORDER = C.ACE_LOW;
  const lowAt = (c) => ORDER.indexOf(C.rankOf(c));
  const points = (cards) => cards.reduce((sum, c) => { const r = C.rankOf(c); return sum + (r === 'A' ? 1 : 'TJQK'.includes(r) ? 10 : +r); }, 0);
  const canDraw = (s) => s.zones.draw.length > 0 || s.zones.discard.length > 1;

  // What a set of cards is: { kind: 'set' | 'run', cards } with a run put in order low to high, or null.
  function shape(cards) {
    if (cards.length < 3 || cards.some((c) => !C.suitOf(c))) return null;
    if (cards.every((c) => C.rankOf(c) === C.rankOf(cards[0]))) return cards.length <= 4 ? { kind: 'set', cards: cards.slice() } : null;
    if (!cards.every((c) => C.suitOf(c) === C.suitOf(cards[0]))) return null;
    const sorted = cards.slice().sort((a, b) => lowAt(a) - lowAt(b));
    for (let i = 1; i < sorted.length; i++) if (lowAt(sorted[i]) !== lowAt(sorted[i - 1]) + 1) return null;
    return { kind: 'run', cards: sorted };
  }
  // A set or run of three that could be laid from these cards (holding the card must, when given), or null. For a practice
  // hand's tips.
  function meldIn(cards, must) {
    const list = cards || [];
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) for (let k = j + 1; k < list.length; k++) {
      const g = shape([list[i], list[j], list[k]]);
      if (g && (!must || g.cards.includes(must))) return g.cards;
    }
    return null;
  }
  // The groups lying on the table, each a list of cards, cut from the one zone by s.pub.cuts.melds.
  function groups(s) {
    const z = s.zones.melds, out = [];
    let i = 0;
    for (const n of s.pub.cuts.melds) { out.push(z.slice(i, i + n)); i += n; }
    return out;
  }
  const kindOf = (g) => (C.rankOf(g[0]) === C.rankOf(g[1]) ? 'set' : 'run');
  // A group in words: "7s", "jacks", "Hearts 5 to 7".
  function words(g) {
    if (kindOf(g) === 'set') return C.RANK_NAMES[C.rankOf(g[0])] + 's';
    const suit = C.SUIT_NAMES[C.suitOf(g[0])];
    return suit[0].toUpperCase() + suit.slice(1) + ' ' + C.RANK_NAMES[C.rankOf(g[0])] + ' to ' + C.RANK_NAMES[C.rankOf(g[g.length - 1])];
  }
  const finish = (t, winners) => { t.end({ winners, left: Array.from({ length: t.s.n }, (_, p) => points(hand(t.s, p))) }); };
  function finishOnPoints(t) {
    const left = Array.from({ length: t.s.n }, (_, p) => points(hand(t.s, p))), low = Math.min(...left);
    t.end({ winners: left.map((x, p) => (x === low ? p : -1)).filter((p) => p >= 0), left });
  }
  // Write the table's groups back into the zone, joined, and their sizes into the cuts.
  function writeBack(t, list) {
    const z = t.zone('melds');
    z.length = 0;
    for (const g of list) z.push(...g);
    t.s.pub.cuts.melds = list.map((g) => g.length);
  }

  const game = {
    id: 'rummy', name: 'Rummy', players: { min: 2, max: 6 },
    options: { first: 0 },
    zones: { draw: { see: 'none' }, discard: { see: 'top' }, melds: { see: 'all' }, hand: { each: true, see: 'owner' } },
    pack: () => C.standard(),
    setup(t) {
      const s = t.s;
      t.shuffle('draw');
      t.deal('draw', 'hand', s.n === 2 ? 10 : s.n <= 4 ? 7 : 6);
      t.move(t.top('draw')[0], 'draw', 'discard');
      s.pub = { drew: false, flips: 0, cuts: { melds: [] } };
      for (let p = 0; p < s.n; p++) s.own[p] = { took: null };
      s.phase = 'play';
      t.turn((s.opts.first || 0) % s.n);
    },
    moves: {
      draw: {
        can(s) {
          if (s.pub.drew) return 'You have already drawn. Lay down or discard.';
          if (!canDraw(s)) return 'There are no cards left to draw. Take the top card.';
          return null;
        },
        run(t, p) {
          const s = t.s;
          if (!s.zones.draw.length) {
            // The third time the pack would have to be turned over, the deal ends on points instead.
            if (s.pub.flips >= 2) return finishOnPoints(t);
            // The pile under its top card becomes the pack, not shuffled: the oldest discard ends on top.
            t.move(s.zones.discard.slice(0, -1).reverse(), 'discard', 'draw');
            s.pub.flips++;
          }
          t.move(t.top('draw')[0], 'draw', 'hand:' + p, { by: p });
          s.own[p].took = null;
          s.pub.drew = true;
        },
      },
      take: {
        can: (s) => (s.pub.drew ? 'You have already drawn. Lay down or discard.' : s.zones.discard.length ? null : 'The pile is empty. Draw from the pack.'),
        run(t, p) {
          const s = t.s, c = t.top('discard')[0];
          t.move(c, 'discard', 'hand:' + p, { by: p });
          s.own[p].took = c;
          s.pub.drew = true;
        },
      },
      meld: {
        uses: 'hand', count: [3, 13],
        can(s, p, m) {
          if (!s.pub.drew) return 'Draw a card first.';
          return shape(m.cards) ? null : 'Those cards are not a set or a run.';
        },
        run(t, p, m) {
          const s = t.s, sh = shape(m.cards), old = groups(s);
          t.move(m.cards, 'hand:' + p, 'melds', { by: p });
          writeBack(t, old.concat([sh.cards]));
          if (!hand(s, p).length) finish(t, [p]);
        },
      },
      layoff: {
        uses: 'hand', count: [1, 13],
        can(s, p, m) {
          if (!s.pub.drew) return 'Draw a card first.';
          const list = groups(s);
          if (!Number.isInteger(m.on) || m.on < 0 || m.on >= list.length) return 'There is no such set or run on the table.';
          const g = list[m.on], sh = shape(g.concat(m.cards));
          if (kindOf(g) === 'set' && g.length + m.cards.length > 4) return 'A set has no more than 4 cards.';
          if (!sh || sh.kind !== kindOf(g)) return 'Those cards do not fit that set or run.';
          return null;
        },
        run(t, p, m) {
          const s = t.s, list = groups(s);
          const sh = shape(list[m.on].concat(m.cards));
          t.move(m.cards, 'hand:' + p, 'melds', { by: p });
          list[m.on] = sh.cards;
          writeBack(t, list);
          if (!hand(s, p).length) finish(t, [p]);
        },
      },
      discard: {
        uses: 'hand', count: [1, 1],
        can(s, p, m) {
          if (!s.pub.drew) return 'Draw a card first.';
          if (m.cards[0] === s.own[p].took && hand(s, p).length > 1) return 'You cannot throw back the card you just took.';
          return null;
        },
        run(t, p, m) {
          const s = t.s;
          t.move(m.cards[0], 'hand:' + p, 'discard', { by: p });
          s.pub.drew = false;
          s.own[p].took = null;
          if (!hand(s, p).length) return finish(t, [p]);
          t.next();
        },
      },
    },
    hints(s, p) {
      if (!s.pub.drew) {
        const buttons = [];
        if (canDraw(s)) buttons.push({ type: 'draw', label: 'Draw from the pack' });
        buttons.push({ type: 'take', label: 'Take the top card' });
        return { play: null, buttons };
      }
      const mine = hand(s, p).slice(), took = s.own[p].took;
      const plays = [{ type: 'meld', label: 'Lay down', cards: mine.slice(), min: 3, max: 13, choose: null }];
      const list = groups(s);
      if (list.length) {
        plays.push({ type: 'layoff', label: 'Lay off', cards: mine.slice(), min: 1, max: 13,
          choose: { cards: null, field: 'on', from: list.map((g, i) => ({ v: i, label: words(g) })), kind: 'option', title: 'On which set or run?' } });
      }
      return { play: { type: 'discard', label: 'Discard', cards: mine.length > 1 ? mine.filter((c) => c !== took) : mine.slice(), min: 1, max: 1, choose: null }, plays, buttons: [] };
    },
    status: (s) => (s.over ? 'Game over.' : s.pub.drew ? 'Lay down sets and runs, then discard.' : 'Draw a card, or take the top of the pile.'),
    labels: { melds: 'Sets and runs' },
    points,
    // The rules card (cards/src/rules.js; Bryan picked "Rules B" from pictures, 23 Nov 2026): four pictures, each with a line.
    howto: [
      { show: ['back', '=or', '6D'], say: 'Draw from the pack, or take the top of the pile.' },
      { show: ['9H', '9S', '9C'], say: 'A set: three or four of a kind.' },
      { show: ['4D', '5D', '6D'], say: 'A run: three or more in a row, one suit.' },
      { show: ['KC', '>', '=0 left'], say: 'Lay down, then discard one. Empty your hand to win.' },
    ],
    // The practice hand's tips ("practice C"): table() for the big screen, from the public table and the events everyone
    // saw; phone() for one phone, from that player's own cards and what they may do. Neither ever sees the game's state.
    teach: {
      table(v, events, who) {
        if (!v || v.over || !v.turn.length) return '';
        const ev = (events || []).filter(Boolean), p = v.turn[0], top = v.zones.discard && v.zones.discard.top;
        const laid = ev.find((e) => e.ev === 'move' && e.to === 'melds' && e.by !== undefined);
        const first = laid ? who(laid.by) + ' put ' + laid.n + (laid.n === 1 ? ' card' : ' cards') + ' down on the table. ' : '';
        if (!v.pub.drew) return first + who(p) + ' starts by drawing from the pack' + (top ? ', or taking the ' + C.name(top) + ' if it fits a set or run.' : '.');
        return first + who(p) + ' lays down any sets and runs, then discards one card.';
      },
      phone(mine, v, me) {
        const h = mine && mine.hints;
        if (!h || !v) return '';
        const R = rules(), held = ((mine.zones['hand:' + me] || {}).cards) || [], top = v.zones.discard && v.zones.discard.top;
        if (!v.pub.drew) {
          if (top && meldIn(held.concat(top), top)) return 'The ' + C.name(top) + ' fits your cards: tap Take the top card.';
          return (top ? 'The ' + C.name(top) + ' does not help you yet. ' : '') + 'Tap Draw from the pack.';
        }
        const m = meldIn(held);
        if (m) return 'Lay down your ' + R.list(m.map(C.name)) + ': pick them, tap Lay down. Then discard one card.';
        return 'No set or run to lay down yet. Discard a card you do not need: a high one costs the most points.';
      },
    },
  };

  if (typeof module === 'object' && module.exports) module.exports = game;
  else (root.VoidGames = root.VoidGames || {})[game.id] = game;
})(typeof self !== 'undefined' ? self : this);
