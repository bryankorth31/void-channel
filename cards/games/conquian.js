// Conquian, as a rule file for the VoidTV card table (cards/src/table.js). Licence: GPL-2.0-or-later (play/LICENSE).
// An old two-player game from Mexico, the ancestor of the rummy games. A traditional game, written from its common rules:
// - Exactly 2 players. The pack is 40 cards: the standard pack without the 8s, 9s and 10s.
// - The order of ranks in a run is A 2 3 4 5 6 7 J Q K. The 7 and the jack are neighbours. The ace is low only: a king
//   then an ace is not a run.
// - Each player is dealt 10 cards. The other 20 are the pack, face down.
// - A set is 3 or 4 cards of one rank. A run is 3 or more cards of one suit in that order.
// - A card is never taken into the hand. The card on offer can only be used at once, in a set or a run on the table.
// - On your turn you turn the top card of the pack face up. You have the first say on it: use it, or pass.
//   * To use it you lay it with cards from your hand as a new set or run (2 cards from your hand at least), or you add it,
//     with any cards from your hand, to a set or run of your own that is already on the table.
//   * If you pass, the other player has the say on the same card, in the same way. If they pass too, the card goes to the
//     waste pile, where nobody can take it, and you turn the next card.
// - After you use a card you must discard one card from your hand. It goes face up on offer, and the other player has the
//   say on it: use it, or pass. If they pass, it goes to the waste pile and they turn the next card.
// - The first player to lay every card of their hand wins. A player whose hand was emptied by a discard plays on, and
//   wins by using a later card on offer with no cards from the hand.
// - If the pack is empty when a card must be turned, the deal ends and nobody wins.
// Setting: first. 0 (as dealt here) is who acts first; 1 is the other player.
// Not in this version: making a player take a card that fits their own sets and runs, and moving cards between one's own
// sets and runs.
(function (root) {
  'use strict';
  const C = root.VoidCards || require('../src/cards.js');
  const rules = () => root.VoidRules || require('../src/rules.js');   // the rules card's word helpers, read when a tip is made
  const hand = (s, p) => s.zones['hand:' + p];
  const ORDER = 'A234567JQK';                      // the order of ranks in a run
  const at = (c) => ORDER.indexOf(C.rankOf(c));
  const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);
  const OUT = ['8', '9', 'T'].reduce((a, r) => a.concat(C.SUITS.map((u) => r + u)), []);

  // A group as the table shows it: 'set', 'run', or null when the cards make neither.
  function kindOf(cards) {
    const n = cards.length;
    if (n < 3 || cards.some((c) => at(c) < 0 || !C.suitOf(c))) return null;
    if (cards.every((c) => C.rankOf(c) === C.rankOf(cards[0]))) return n <= 4 ? 'set' : null;
    if (!cards.every((c) => C.suitOf(c) === C.suitOf(cards[0]))) return null;
    const idx = cards.map(at).sort((a, b) => a - b);
    for (let i = 1; i < n; i++) if (idx[i] !== idx[i - 1] + 1) return null;
    return 'run';
  }
  const sorted = (cards) => (kindOf(cards) === 'run' ? cards.slice().sort((a, b) => at(a) - at(b)) : cards.slice());
  // A group in words: '7s', 'jacks', 'aces'; 'Hearts 5 to jack'.
  function words(cards) {
    const g = sorted(cards);
    if (kindOf(g) === 'set') return C.RANK_NAMES[C.rankOf(g[0])] + 's';
    return cap(C.SUIT_NAMES[C.suitOf(g[0])]) + ' ' + C.RANK_NAMES[C.rankOf(g[0])] + ' to ' + C.RANK_NAMES[C.rankOf(g[g.length - 1])];
  }
  // A player's laid zone cut into its groups, by the sizes in s.pub.cuts.
  function groupsOf(s, p) {
    const z = s.zones['laid:' + p], out = [];
    let i = 0;
    for (const k of s.pub.cuts['laid:' + p]) { out.push(z.slice(i, i + k)); i += k; }
    return out;
  }
  const wait = (s, want) => (s.pub.step === 'turn' ? 'Turn a card first.' : s.pub.step === 'choose' ? 'Use the card on offer or pass first.' : 'Discard a card first.');

  const game = {
    id: 'conquian', name: 'Conquian', players: { min: 2, max: 2 },
    options: { first: 0 },
    zones: { draw: { see: 'none' }, offer: { see: 'all' }, waste: { see: 'top' }, hand: { each: true, see: 'owner' }, laid: { each: true, see: 'all' } },
    pack: () => C.standard({ without: OUT }),
    setup(t) {
      const s = t.s;
      t.shuffle('draw');
      t.deal('draw', 'hand', 10);
      s.pub = { step: 'turn', from: null, passes: 0, cuts: { 'laid:0': [], 'laid:1': [] } };
      s.phase = 'play';
      t.turn((s.opts.first || 0) % 2);
    },
    moves: {
      turn: {
        can: (s) => (s.pub.step === 'turn' ? null : wait(s)),
        run(t, p) {
          const s = t.s;
          if (!s.zones.draw.length) return t.end({ winners: [], note: 'The pack ran out. Nobody wins this one.' });
          t.move(t.top('draw')[0], 'draw', 'offer', { by: p });
          s.pub.step = 'choose'; s.pub.from = 'pack'; s.pub.passes = 0;
        },
      },
      pass: {
        can: (s) => (s.pub.step === 'choose' ? null : wait(s)),
        run(t, p) {
          const s = t.s;
          t.say({ ev: 'pass', by: p });
          if (s.pub.from === 'pack' && s.pub.passes === 0) { s.pub.passes = 1; t.next(); return; }
          t.move(s.zones.offer[0], 'offer', 'waste', { by: p });
          s.pub.step = 'turn'; s.pub.from = null; s.pub.passes = 0;
        },
      },
      use: {
        uses: 'hand', count: [0, 10],
        can(s, p, m) {
          if (s.pub.step !== 'choose') return wait(s);
          const groups = groupsOf(s, p), offer = s.zones.offer[0];
          if (m.on === 'new') {
            if (m.cards.length < 2) return 'A new set or run needs the card on offer and at least 2 cards from your hand.';
            if (!kindOf([offer].concat(m.cards))) return 'That is not a set or a run. A set is 3 or 4 cards of one rank; a run is 3 or more cards of one suit in order.';
            return null;
          }
          if (!Number.isInteger(m.on)) return 'Say where to use it: a new set or run, or one of your own.';
          if (m.on < 0 || m.on >= groups.length) return 'You have no such set or run.';
          if (!kindOf(groups[m.on].concat([offer], m.cards))) return 'Those cards do not fit that set or run.';
          return null;
        },
        run(t, p, m) {
          const s = t.s, z = s.zones['laid:' + p], offer = s.zones.offer[0], groups = groupsOf(s, p), add = [offer].concat(m.cards);
          t.move(offer, 'offer', 'laid:' + p, { by: p });
          if (m.cards.length) t.move(m.cards, 'hand:' + p, 'laid:' + p, { by: p });
          if (m.on === 'new') groups.push(sorted(add)); else groups[m.on] = sorted(groups[m.on].concat(add));
          z.length = 0;
          for (const g of groups) z.push(...g);
          s.pub.cuts['laid:' + p] = groups.map((g) => g.length);
          if (!hand(s, p).length) return t.end({ winners: [p] });
          s.pub.step = 'discard';
        },
      },
      discard: {
        uses: 'hand', count: [1, 1],
        can: (s) => (s.pub.step === 'discard' ? null : wait(s)),
        run(t, p, m) {
          const s = t.s;
          t.move(m.cards, 'hand:' + p, 'offer', { by: p });
          s.pub.step = 'choose'; s.pub.from = 'discard'; s.pub.passes = 0;
          t.next();
        },
      },
    },
    hints(s, p) {
      const step = s.pub.step, mine = hand(s, p).slice();
      if (step === 'turn') return { play: null, buttons: [{ type: 'turn', label: 'Turn a card' }] };
      if (step === 'discard') return { play: { type: 'discard', label: 'Discard', cards: mine, min: 1, max: 1, choose: null }, buttons: [] };
      const from = [{ v: 'new', label: 'A new set or run' }];
      groupsOf(s, p).forEach((g, i) => from.push({ v: i, label: words(g) }));
      // The fewest cards from the hand that could use the card on offer: none when it fits one of this player's own sets or runs
      // by itself, one when it fits with one more card, else two (a new set or run). Before, it said none always, so Use the card
      // lit with nothing picked and its first answer was a refusal (voidverse function test F34, 24 Nov 2026).
      const offer = s.zones.offer[0], groups = groupsOf(s, p);
      const alone = groups.some((g) => kindOf(g.concat([offer])));
      const withOne = alone || groups.some((g) => mine.some((c) => kindOf(g.concat([offer, c]))));
      return { play: { type: 'use', label: 'Use the card', cards: mine, min: alone ? 0 : withOne ? 1 : 2, max: 10,
        choose: { cards: null, field: 'on', from, kind: 'option', title: 'Use it where?' } }, buttons: [{ type: 'pass', label: 'Pass' }] };
    },
    status(s) {
      if (s.over) return 'Game over.';
      if (s.pub.step === 'turn') return 'Turn a card.';
      if (s.pub.step === 'discard') return 'Discard a card.';
      return 'Use the ' + C.name(s.zones.offer[0]) + ', or pass.';
    },
    labels: { laid: 'Sets and runs' },
    // The rules card (cards/src/rules.js; Bryan picked "Rules B" from pictures, 23 Nov 2026): four pictures, each with a line.
    howto: [
      { show: ['back', '>', '5C'], say: 'Turn a card. Use it at once, or pass.' },
      { show: ['5C', '5H', '5S'], say: 'Use it in a set: three or four of a kind.' },
      { show: ['6D', '7D', 'JD'], say: 'Or in a run of one suit: the 7 and the jack are neighbours.' },
      { show: ['QS', '>', '=0 left'], say: 'After using a card, discard one. Lay all your cards to win.' },
    ],
    // The practice hand's tips ("practice C"): table() for the big screen, from the public table and the events everyone
    // saw; phone() for one phone, from that player's own cards and what they may do. Neither ever sees the game's state.
    teach: {
      table(v, events, who) {
        if (!v || v.over || !v.turn.length) return '';
        const ev = (events || []).filter(Boolean), p = v.turn[0], offer = v.zones.offer && v.zones.offer.cards && v.zones.offer.cards[0];
        const passed = ev.find((e) => e.ev === 'pass'), first = passed ? who(passed.by) + ' passed. ' : '';
        if (v.pub.step === 'turn') return first + who(p) + ' turns the top card of the pack.';
        if (v.pub.step === 'discard') return who(p) + ' used the card. Now ' + who(p) + ' discards one, and ' + who((p + 1) % v.n) + ' may use it.';
        if (offer) return first + who(p) + ' may use the ' + C.name(offer) + ' in a set or run at once, or pass it.';
        return '';
      },
      phone(mine, v, me) {
        const h = mine && mine.hints;
        if (!h || !v) return '';
        const R = rules(), held = ((mine.zones['hand:' + me] || {}).cards) || [], offer = v.zones.offer && v.zones.offer.cards && v.zones.offer.cards[0];
        if (v.pub.step === 'turn') return 'Tap Turn a card to show the top card of the pack.';
        if (v.pub.step === 'discard') return 'Discard one card. Keep the ones close to a set or run.';
        if (!offer) return '';
        for (let i = 0; i < held.length; i++) for (let j = i + 1; j < held.length; j++) {
          if (kindOf([offer, held[i], held[j]])) return 'The ' + C.name(offer) + ' makes a set or run with your ' + R.list([held[i], held[j]].map(C.name)) + '. Pick them, tap Use the card.';
        }
        const laid = v.zones['laid:' + me] && v.zones['laid:' + me].cards && v.zones['laid:' + me].cards.length;
        return 'The ' + C.name(offer) + ' fits nothing in your hand. ' + (laid ? 'If it fits a set or run of yours on the table, use it there. If not, tap Pass.' : 'Tap Pass.');
      },
    },
  };

  if (typeof module === 'object' && module.exports) module.exports = game;
  else (root.VoidGames = root.VoidGames || {})[game.id] = game;
})(typeof self !== 'undefined' ? self : this);
