// Go Fish, as a rule file for the VoidTV card table (cards/src/table.js). Licence: GPL-2.0-or-later (play/LICENSE).
// A traditional game, written from its common rules, for 2 to 6 players with one pack:
// - Two or three players are dealt 7 cards each, four to six players 5 each. The rest is the pack, face down.
// - A book is all four cards of one rank. Whenever a player's hand holds a whole book (after the deal, after being
//   given cards, after drawing), the book is laid face up in front of that player at once.
// - On your turn you ask one other player for a rank, and you must hold at least one card of that rank yourself. You
//   cannot ask yourself, and you cannot ask a player who holds no cards.
// - If the player you asked holds any cards of that rank, they hand you all of them, and you ask again.
// - If they hold none, you "go fish": you draw the top card of the pack, if it has any. If the card you drew is of the
//   rank you asked for, you ask again. Otherwise the turn passes to the next player.
// - A player who has no cards when their turn comes draws one card from the pack and plays on. If the pack is empty
//   too, their turn is skipped. A player who holds cards while nobody else does draws a card instead of asking (when
//   the pack has any), and then the turn passes; when the pack is empty, their turn is skipped.
// - The game ends when all 13 books are laid. The player with the most books wins, and a tie is shared.
(function (root) {
  'use strict';
  const C = root.VoidCards || require('../src/cards.js');
  const hand = (s, p) => s.zones['hand:' + p];
  const BOOKS = 13;
  const total = (s) => s.pub.books.reduce((a, b) => a + b, 0);
  // The other players who hold at least one card, so there is someone to ask.
  const askable = (s, p) => { const out = []; for (let q = 0; q < s.n; q++) if (q !== p && hand(s, q).length) out.push(q); return out; };

  // Lay every whole book a player holds, face up, and count it. A rank is only ever a letter, never a card.
  function layBooks(t, p) {
    const s = t.s;
    for (const r of C.RANKS) {
      const four = hand(s, p).filter((c) => C.rankOf(c) === r);
      if (four.length !== 4) continue;
      t.move(four, 'hand:' + p, 'laid:' + p, { by: p });
      s.pub.books[p]++;
    }
  }

  function finish(t) {
    const books = t.s.pub.books.slice(), top = Math.max(...books);
    t.end({ winners: books.map((b, p) => (b === top ? p : -1)).filter((p) => p >= 0), books });
  }

  // Hand the turn to player `first`, doing for them what the rules do without being asked: a player with no cards draws
  // one, and a player who cannot act at all is skipped. Ends the game when all the books are laid.
  function settle(t, first) {
    const s = t.s;
    if (total(s) >= BOOKS) return finish(t);
    let p = first;
    for (let i = 0; i < s.n; i++) {
      t.turn(p);
      if (!hand(s, p).length && s.zones.draw.length) { t.move(t.top('draw'), 'draw', 'hand:' + p, { by: p }); layBooks(t, p); }
      if (hand(s, p).length && (askable(s, p).length || s.zones.draw.length)) return;
      t.next();
      p = s.turn[0];
    }
    finish(t);   // nobody can act (not possible in a real game: the cards would all be laid)
  }

  const game = {
    id: 'go-fish', name: 'Go Fish', players: { min: 2, max: 6 },
    options: { first: 0 },   // who asks first; the dealer moves it on a seat each game
    zones: { draw: { see: 'none' }, hand: { each: true, see: 'owner' }, laid: { each: true, see: 'all' } },
    pack: () => C.standard(),
    setup(t) {
      const s = t.s;
      t.shuffle('draw');
      t.deal('draw', 'hand', s.n <= 3 ? 7 : 5);
      s.pub = { books: Array.from({ length: s.n }, () => 0), last: null };
      s.phase = 'play';
      for (let p = 0; p < s.n; p++) layBooks(t, p);
      settle(t, (s.opts.first || 0) % s.n);
    },
    moves: {
      ask: {
        uses: 'hand', count: [1, 1],
        can(s, p, m) {
          if (!Number.isInteger(m.ask) || m.ask < 0 || m.ask >= s.n) return 'Pick a player to ask.';
          if (m.ask === p) return 'You cannot ask yourself.';
          if (!hand(s, m.ask).length) return 'Player ' + (m.ask + 1) + ' has no cards.';
          return null;
        },
        run(t, p, m) {
          const s = t.s, of = m.ask, rank = C.rankOf(m.cards[0]);
          const given = hand(s, of).filter((c) => C.rankOf(c) === rank);
          s.pub.last = { by: p, of, rank, got: given.length };
          t.say({ ev: 'asked', by: p, of, rank, got: given.length });
          if (given.length) {
            t.move(given, 'hand:' + of, 'hand:' + p, { by: p });
            layBooks(t, p);
            return settle(t, p);
          }
          // Go fish. With the pack empty there is nothing to draw and the turn passes.
          let again = false;
          if (s.zones.draw.length) {
            const card = t.top('draw')[0];
            again = C.rankOf(card) === rank;
            t.move(card, 'draw', 'hand:' + p, { by: p });
            t.say({ ev: 'fished', by: p, lucky: again });
            layBooks(t, p);
          }
          if (again) return settle(t, p);
          settle(t, (p + 1) % s.n);
        },
      },
      draw: {
        can(s, p) {
          if (askable(s, p).length) return 'Ask a player for a card.';
          if (!s.zones.draw.length) return 'There are no cards left to draw.';
          return null;
        },
        run(t, p) {
          t.move(t.top('draw'), 'draw', 'hand:' + p, { by: p });
          layBooks(t, p);
          settle(t, (p + 1) % t.s.n);
        },
      },
    },
    // What the player whose turn it is may do: ask for any rank held, from any player who holds cards; or go fish when
    // nobody else holds a card to ask for.
    hints(s, p) {
      const others = askable(s, p);
      if (!others.length) return { play: null, buttons: [{ type: 'draw', label: 'Go fish' }] };
      return { play: { type: 'ask', label: 'Ask', cards: hand(s, p).slice(), min: 1, max: 1,
        choose: { cards: null, field: 'ask', from: others.map((q) => ({ v: q, label: 'Player ' + (q + 1) })), kind: 'player', title: 'Ask who?' } }, buttons: [] };
    },
    status(s) {
      if (s.over) return 'Game over.';
      const l = s.pub.last;
      if (!l) return 'Ask a player for a card you hold.';
      return 'Asked for ' + C.RANK_NAMES[l.rank] + 's: ' + (l.got ? 'got ' + l.got + '.' : 'go fish.');
    },
    labels: { laid: 'Books' },
  };

  if (typeof module === 'object' && module.exports) module.exports = game;
  else (root.VoidGames = root.VoidGames || {})[game.id] = game;
})(typeof self !== 'undefined' ? self : this);
