// VoidTV cards: a card's face, drawn by us (no picture files, no other pack's art). Licence: GPL-2.0-or-later (play/LICENSE).
// Both card pages draw every card through this, so a card looks the same on a phone and on the big screen. The look
// itself is in cards/cards.css: a card is 5em wide and 7em tall, so a page sizes a card by setting its font-size.
(function (root) {
  'use strict';
  const C = root.VoidCards || require('./cards.js');
  // The suit marks as text, never as a phone's own coloured emoji.
  const GLYPH = { S: '♠︎', H: '♥︎', D: '♦︎', C: '♣︎' };

  // What a card shows, as plain data (tested). A card that is not of the standard pack (a party card) shows its id
  // until its game gives it words of its own.
  function parts(id) {
    if (C.isJoker(id)) return { kind: 'joker', rank: 'J', suit: '', glyph: '★', red: false, label: 'joker' };
    const s = C.suitOf(id);
    if (!s) return { kind: 'other', rank: '', suit: '', glyph: '', red: false, label: String(id) };
    return { kind: 'suit', rank: C.rankOf(id) === 'T' ? '10' : C.rankOf(id), suit: s, glyph: GLYPH[s], red: C.isRed(id), label: C.name(id) };
  }
  // The card as an element: its rank and suit in the corner, the suit large below.
  function card(id, doc) {
    const d = doc || document, p = parts(id), el = d.createElement('div');
    el.className = 'vc' + (p.red ? ' vc-red' : '') + (p.kind === 'suit' ? '' : ' vc-' + p.kind);
    el.dataset.card = id;
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', p.label);
    const corner = d.createElement('span'), r = d.createElement('b'), g = d.createElement('i'), big = d.createElement('span');
    corner.className = 'vc-corner'; big.className = 'vc-big';
    r.textContent = p.rank; g.textContent = p.kind === 'other' ? '' : p.glyph;
    big.textContent = p.kind === 'other' ? p.label : p.glyph;
    corner.append(r, g);
    el.append(corner, big);
    return el;
  }
  // A card face down.
  function back(doc) {
    const el = (doc || document).createElement('div');
    el.className = 'vc vc-back';
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', 'a card, face down');
    return el;
  }

  const api = { GLYPH, parts, card, back };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VoidFace = api;
})(typeof self !== 'undefined' ? self : this);
