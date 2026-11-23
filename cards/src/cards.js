// VoidTV cards: the card blocks. Licence: GPL-2.0-or-later (play/LICENSE), like the rest of VoidTV's game code.
// Bryan, 22 Nov 2026: "i want to creaqte card and party games that ppl canm 'play' using therephones as we have with qr.
// i see card games of all kinds possible. my hand is on my phone able to be looked through and reorganized how i want
// them ie spadesd moved to by spades and then hearts or how ever i want ot organize the cards". The same day: "build the
// card system and we can then create any gsame using cards fromit".
//
// A card is only its id, a short text. The standard pack: rank then suit ("QS" the queen of spades, "TH" the ten of
// hearts); a second pack's cards end in "#2"; jokers are "X1" and "X2". A game with cards of its own (a party game's
// prompts) names them as it likes and keeps what is printed on each in its own list: only the pack helpers here look
// inside an id. Pure: no page and no clock. The table engine (table.js), the phone's hand and the tests all use it.
(function (root) {
  'use strict';
  const SUITS = ['S', 'H', 'D', 'C'];
  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K'];
  const ACE_HIGH = '23456789TJQKA', ACE_LOW = 'A23456789TJQK';
  const SUIT_NAMES = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' };
  const RANK_NAMES = { A: 'ace', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', T: '10', J: 'jack', Q: 'queen', K: 'king' };

  const isJoker = (id) => typeof id === 'string' && id[0] === 'X';
  const rankOf = (id) => (typeof id === 'string' && id.length >= 2 ? id[0] : '');
  const suitOf = (id) => (typeof id === 'string' && !isJoker(id) && SUITS.includes(id[1]) ? id[1] : '');
  const isRed = (id) => suitOf(id) === 'H' || suitOf(id) === 'D';
  // "queen of spades", "10 of hearts", "joker"; a card that is not of the standard pack is named by its id.
  function name(id) {
    if (isJoker(id)) return 'joker';
    const r = RANK_NAMES[rankOf(id)], s = SUIT_NAMES[suitOf(id)];
    return r && s ? r + ' of ' + s : String(id);
  }

  // The standard pack, in a fixed order. packs: how many packs together; jokers: how many in each pack; without: cards
  // left out of every pack (three-handed Hearts plays without the 2 of diamonds).
  function standard(opts) {
    const o = opts || {}, out = [], without = new Set(o.without || []);
    for (let k = 1; k <= (o.packs || 1); k++) {
      const tag = k === 1 ? '' : '#' + k;
      for (const s of SUITS) for (const r of RANKS) if (!without.has(r + s)) out.push(r + s + tag);
      for (let j = 1; j <= (o.jokers || 0); j++) out.push('X' + j + tag);
    }
    return out;
  }

  // A seeded random, so a test can deal the same game twice. A real game deals with secure().
  function seeded(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  // The browser's (or Node's) own strong random: nobody can guess the deal from the clock.
  const secure = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
  function shuffle(list, rand) {
    const a = list.slice(), r = rand || secure;
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  // ---------- The hand as its player keeps it ----------
  // The order of a hand belongs to the phone that holds it: the table never needs it, so moving a card sends nothing.
  // arrange: the player's own order, kept across a new deal of the same cards, a draw or a play. Cards still held stay
  // where the player put them; a card that is new to the hand goes on the end, in the order it came.
  function arrange(order, hand) {
    const have = new Set(hand), seen = new Set(), out = [];
    for (const c of order || []) if (have.has(c) && !seen.has(c)) { seen.add(c); out.push(c); }
    for (const c of hand) if (!seen.has(c)) { seen.add(c); out.push(c); }
    return out;
  }
  // place: one card dragged to any spot. index is where it sits in the hand afterwards (past either end: that end).
  function place(order, card, index) {
    const out = order.slice(), at = out.indexOf(card);
    if (at < 0 || !Number.isFinite(index)) return out;
    out.splice(at, 1);
    out.splice(Math.max(0, Math.min(out.length, Math.round(index))), 0, card);
    return out;
  }
  // The suits in the order they first show in the hand now: the player's own order of suits.
  function suitsAsHeld(hand) { const out = []; for (const c of hand) { const s = suitOf(c); if (s && !out.includes(s)) out.push(s); } return out; }
  const spot = (list, x) => { const i = list.indexOf(x); return i < 0 ? 99 : i; };
  // bySuit: spades by spades, then hearts, each suit low to high. The suits keep the order the player already has them
  // in (or opts.suits); opts.ranks is the game's own order of ranks, low to high (ace high unless the game says).
  // A card with no suit (a joker, a party card) goes to the end, as it was.
  function bySuit(hand, opts) {
    const o = opts || {}, suits = o.suits || suitsAsHeld(hand), ranks = o.ranks || ACE_HIGH;
    return hand.slice().sort((a, b) => spot(suits, suitOf(a)) - spot(suits, suitOf(b)) || spot(ranks, rankOf(a)) - spot(ranks, rankOf(b)));
  }
  // byRank: low to high, the same rank side by side in the player's own order of suits.
  function byRank(hand, opts) {
    const o = opts || {}, suits = o.suits || suitsAsHeld(hand), ranks = o.ranks || ACE_HIGH;
    const at = (c) => (suitOf(c) ? spot(ranks, rankOf(c)) : 99);
    return hand.slice().sort((a, b) => at(a) - at(b) || spot(suits, suitOf(a)) - spot(suits, suitOf(b)));
  }

  const api = { SUITS, RANKS, ACE_HIGH, ACE_LOW, SUIT_NAMES, RANK_NAMES, rankOf, suitOf, isJoker, isRed, name, standard,
    seeded, secure, shuffle, arrange, place, suitsAsHeld, bySuit, byRank };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VoidCards = api;
})(typeof self !== 'undefined' ? self : this);
