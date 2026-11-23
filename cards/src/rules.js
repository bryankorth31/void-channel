// VoidTV cards: the rules card, and the words the practice hand's tips are made of. Licence: GPL-2.0-or-later (play/LICENSE).
// Bryan, 23 Nov 2026: "all games in cards but others aswell need atleast a basic rtules and how to play. maybe even a
// walkkthrough hand if tyhey choose". From pictures he picked "Rules B, practice C": each rule shown with real cards and a
// few words, on the big screen under the game being picked and on every phone behind a Rules button.
// A game's rules live in its own rule file, as game.howto: four lines, each { show, say }. show is what the picture holds,
// read left to right: a card ('4H'), 'back' (a card face down), '>' (an arrow), 'suit:H' (a suit, as when one is named) or
// '=words' (a few words in gold, as '=0 left'). say is the line under it.
// The pure part (check, read, and the word helpers the rule files' tips use) is tested in cards/test/rules.test.js. The
// page part draws a rules card and runs only in a browser; both pages load this file.
(function (root) {
  'use strict';
  const C = root.VoidCards || require('./cards.js');
  const LINES = 4, SAY = 64, SHOW = 6, WORDS = 14;

  // One thing in a picture, or null when it is not one we draw.
  function read(t) {
    if (typeof t !== 'string' || !t) return null;
    if (t === '>') return { kind: 'arrow' };
    if (t === 'back') return { kind: 'back' };
    if (/^suit:[SHDC]$/.test(t)) return { kind: 'suit', suit: t.slice(5) };
    if (t.charAt(0) === '=') { const w = t.slice(1).trim(); return w && w.length <= WORDS ? { kind: 'words', text: w } : null; }
    if (/^[A2-9TJQK][SHDC]$/.test(t)) return { kind: 'card', id: t };
    return null;
  }
  // What is wrong with a game's rules card, in words ([] when nothing is). Every card shown must be in the game's own pack,
  // so a picture never shows a card the game is played without (Conquian has no 8, 9 or 10).
  function check(game) {
    const out = [], h = game && game.howto;
    if (!Array.isArray(h) || h.length !== LINES) return ['a rules card has ' + LINES + ' lines'];
    let pack = null;
    try { pack = new Set(game.pack({ n: game.players.min, opts: Object.assign({}, game.options), pub: {}, own: [] })); } catch (e) { pack = null; }
    h.forEach((line, i) => {
      const at = 'line ' + (i + 1) + ': ';
      if (!line || typeof line !== 'object') { out.push(at + 'not a line'); return; }
      if (typeof line.say !== 'string' || !line.say.trim() || line.say.length > SAY) out.push(at + 'the words are 1 to ' + SAY + ' letters');
      if (!Array.isArray(line.show) || !line.show.length || line.show.length > SHOW) { out.push(at + 'the picture holds 1 to ' + SHOW + ' things'); return; }
      for (const t of line.show) {
        const x = read(t);
        if (!x) out.push(at + 'cannot draw ' + JSON.stringify(t));
        else if (x.kind === 'card' && pack && !pack.has(x.id)) out.push(at + x.id + ' is not in this game\'s pack');
      }
    });
    return out;
  }

  // ----- Words for the tips (the rule files' teach functions use these) -----
  // "a and b", "a, b and c".
  function list(words) {
    const w = (words || []).filter(Boolean);
    return w.length < 2 ? w.join('') : w.slice(0, -1).join(', ') + ' and ' + w[w.length - 1];
  }
  // "a 4", "an 8", "an ace".
  const an = (word) => (/^(8|11|18|ace|eight)/.test(String(word)) ? 'an ' : 'a ') + word;
  // A rank in words, as many: "7s", "kings", "aces", "10s".
  const ranks = (r) => (C.RANK_NAMES[r] || String(r)) + 's';
  const cap = (w) => String(w).replace(/^./, (x) => x.toUpperCase());
  const suit = (s) => C.SUIT_NAMES[s] || '';

  const api = { read, check, list, an, ranks, cap, suit, LINES, SAY };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VoidRules = api;

  // ---------- The page part: a rules card ----------
  if (typeof document === 'undefined') return;
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }
  // The four pictures with their words, for the game given, or null when it has no rules card.
  api.draw = function draw(game) {
    if (!game || check(game).length) return null;
    const F = root.VoidFace, box = el('div', 'howto');
    for (const line of game.howto) {
      const tile = el('div', 'howto-line'), show = el('div', 'howto-show');
      for (const t of line.show) {
        const x = read(t);
        if (x.kind === 'card' || x.kind === 'back') { const c = el('span', 'howto-card'); c.append(x.kind === 'card' ? F.card(x.id) : F.back()); show.append(c); }
        else if (x.kind === 'arrow') show.append(el('span', 'howto-arrow', '→'));
        else if (x.kind === 'suit') show.append(el('span', 'howto-suit' + (x.suit === 'H' || x.suit === 'D' ? ' red' : ''), F.GLYPH[x.suit]));
        else show.append(el('span', 'howto-words', x.text));
      }
      tile.append(show, el('div', 'howto-say', line.say));
      box.append(tile);
    }
    return box;
  };
})(typeof self !== 'undefined' ? self : this);
