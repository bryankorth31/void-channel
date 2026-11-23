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
// Go Fish (pairs), the family way, is the same game with a set of two: any two of a kind are laid at once (three of a
// kind lays one pair and keeps the third), and it ends when all 26 pairs are laid. It is its own game in the list.
(function (root) {
  'use strict';
  const C = root.VoidCards || require('../src/cards.js');
  const hand = (s, p) => s.zones['hand:' + p];
  // How many cards make a set: 4 (a book) in Go Fish, 2 (a pair) in Go Fish (pairs), the family way (Bryan, 23 Nov 2026:
  // "pairs as its own game"). The game ends when every card of the pack is laid in sets.
  const size = (s) => (s.opts.size === 2 ? 2 : 4);
  const sets = (s) => s.pack.length / size(s);
  const total = (s) => s.pub.books.reduce((a, b) => a + b, 0);
  // The other players who hold at least one card, so there is someone to ask.
  const askable = (s, p) => { const out = []; for (let q = 0; q < s.n; q++) if (q !== p && hand(s, q).length) out.push(q); return out; };

  // Lay every whole set a player holds (a book of four, or each pair), face up, and count it. Each set is its own group
  // on the table (s.pub.cuts), so the table shows how many. (A line for each seat as well did not fit: with six players
  // the public table passed one relay message.) A rank is only ever a letter, never a card.
  function layBooks(t, p) {
    const s = t.s, k = size(s);
    for (const r of C.RANKS) {
      const of = hand(s, p).filter((c) => C.rankOf(c) === r);
      while (of.length >= k) {
        t.move(of.splice(0, k), 'hand:' + p, 'laid:' + p, { by: p });
        s.pub.books[p]++;
        s.pub.cuts['laid:' + p].push(k);
      }
    }
  }

  function finish(t) {
    const books = t.s.pub.books.slice(), top = Math.max(...books);
    // The count of each player's books or pairs goes out as their score, so the table's end panel lists them.
    t.end({ winners: books.map((b, p) => (b === top ? p : -1)).filter((p) => p >= 0), scores: books });
  }

  // Hand the turn to player `first`, doing for them what the rules do without being asked: a player with no cards draws
  // one, and a player who cannot act at all is skipped. Ends the game when all the books are laid.
  function settle(t, first) {
    const s = t.s;
    if (total(s) >= sets(s)) return finish(t);
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
      s.pub = { books: Array.from({ length: s.n }, () => 0), last: null, cuts: {} };
      for (let p = 0; p < s.n; p++) s.pub.cuts['laid:' + p] = [];
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
  // Go Fish (pairs): the same game, a set is any two of a kind (Bryan, 23 Nov 2026: "pairs as its own game"). It sits
  // beside Go Fish in the table's list of games.
  const pairs = Object.assign({}, game, { id: 'go-fish-pairs', name: 'Go Fish (pairs)', options: { first: 0, size: 2 }, labels: { laid: 'Pairs' } });

  if (typeof module === 'object' && module.exports) { module.exports = game; game.pairs = pairs; }
  else { root.VoidGames = root.VoidGames || {}; root.VoidGames[game.id] = game; root.VoidGames[pairs.id] = pairs; }
})(typeof self !== 'undefined' ? self : this);
