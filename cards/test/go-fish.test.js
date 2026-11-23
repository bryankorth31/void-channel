// Go Fish as a rule file (cards/games/go-fish.js): each rule on a table set by hand, then whole games by chance with
// every view and every event held against the privacy rule.
// Run: node --test cards/test/go-fish.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/cards.js');
const T = require('../src/table.js');
const G = require('../games/go-fish.js');
const { rig, yes, no, playOut } = require('./helper.js');

// A table's public notes with no books laid yet (a rigged table must not keep what the seeded deal laid).
const pub = (n, books, last) => ({ books: books || Array.from({ length: n }, () => 0), last: last || null });
const ask = (cards, of) => ({ type: 'ask', cards, ask: of });

test('Go Fish deals 7 each to two or three players and 5 each to four to six, and the rest is the pack', () => {
  for (let seed = 1; seed <= 30; seed++) {
    for (const n of [2, 3, 4, 6]) {
      const each = n <= 3 ? 7 : 5, s = T.create(G, { players: n, rand: C.seeded(seed) }).state;
      for (let p = 0; p < n; p++) assert.equal(s.zones['hand:' + p].length + 4 * s.pub.books[p], each, 'a book dealt whole is laid, so the rest stays in hand');
      assert.equal(s.zones.draw.length, 52 - n * each);
      assert.deepEqual(s.turn, [0]);
    }
  }
  assert.throws(() => T.create(G, { players: 1 }), /2 to 6 players/);
  assert.throws(() => T.create(G, { players: 7 }), /2 to 6 players/);
  assert.equal(G.status(T.create(G, { players: 3, rand: C.seeded(5) }).state), 'Ask a player for a card you hold.');
  assert.deepEqual(G.labels, { laid: 'Books' });
});

test('Go Fish: a book dealt whole is laid face up at once and counted', () => {
  let found = null;
  for (let seed = 1; seed <= 3000 && !found; seed++) {
    const s = T.create(G, { players: 2, rand: C.seeded(seed) }).state;
    if (s.pub.books[0] + s.pub.books[1] > 0) found = s;
  }
  assert.ok(found, 'some deal holds a whole book');
  for (let p = 0; p < 2; p++) {
    const laid = found.zones['laid:' + p];
    assert.equal(laid.length, 4 * found.pub.books[p]);
    for (let i = 0; i < laid.length; i += 4) assert.equal(new Set(laid.slice(i, i + 4).map(C.rankOf)).size, 1);
    assert.deepEqual(T.view(G, found, null).zones['laid:' + p].cards, laid, 'the big screen sees the books');
    assert.deepEqual(T.view(G, found, null).zones['hand:' + p], { n: found.zones['hand:' + p].length }, 'and no hand');
  }
});

test('Go Fish: you must hold the rank, and you cannot ask yourself, an empty hand or someone who is not there', () => {
  const s = rig(G, 3, { 'hand:0': ['7H', '9C'], 'hand:1': ['7S', '2D'], 'hand:2': [] }, { pub: pub(3), turn: 0 });
  no(G, s, 0, ask(['7S'], 2), /do not hold/);
  no(G, s, 0, { type: 'ask', cards: [], ask: 1 }, /Pick 1 card/);
  no(G, s, 0, ask(['7H'], 0), /cannot ask yourself/);
  no(G, s, 0, ask(['7H'], 2), /Player 3 has no cards/);
  no(G, s, 0, ask(['7H'], 3), /Pick a player/);
  no(G, s, 0, ask(['7H'], -1), /Pick a player/);
  no(G, s, 0, { type: 'ask', cards: ['7H'] }, /Pick a player/);
  no(G, s, 0, { type: 'ask', cards: ['7H'], ask: '1' }, /Pick a player/);
  no(G, s, 1, ask(['7S'], 0), /not your turn/);
});

test('Go Fish: a hit gives every card of the rank hand to hand, shows no face, and the asker goes again', () => {
  const s = rig(G, 3, { 'hand:0': ['7H', '9C'], 'hand:1': ['7S', '7D', '2D'], 'hand:2': ['KC'] }, { pub: pub(3), turn: 0 });
  const r = yes(G, s, 0, ask(['7H'], 1));
  assert.deepEqual(r.state.zones['hand:0'], ['7H', '9C', '7S', '7D']);
  assert.deepEqual(r.state.zones['hand:1'], ['2D']);
  assert.deepEqual(r.state.turn, [0], 'the asker goes again');
  assert.deepEqual(r.events, [{ ev: 'asked', by: 0, of: 1, rank: '7', got: 2 }, { ev: 'move', from: 'hand:1', to: 'hand:0', n: 2, by: 0 }]);
  assert.ok(r.events.every((e) => !e.cards), 'no face is shown');
  assert.deepEqual(r.state.pub.last, { by: 0, of: 1, rank: '7', got: 2 });
  assert.equal(G.status(r.state), 'Asked for 7s: got 2.');
  assert.deepEqual(T.view(G, r.state, null).zones['hand:0'], { n: 4 });
});

test('Go Fish: a miss draws one card and the turn passes', () => {
  const s = rig(G, 3, { 'hand:0': ['7H', '9C'], 'hand:1': ['2D', '3D'], 'hand:2': ['KC'], draw: ['4S'] }, { pub: pub(3), turn: 0 });
  const r = yes(G, s, 0, ask(['7H'], 1));
  assert.deepEqual(r.state.zones['hand:0'], ['7H', '9C', '4S']);
  assert.equal(r.state.zones.draw.length, s.zones.draw.length - 1);
  assert.deepEqual(r.state.turn, [1]);
  assert.deepEqual(r.events, [{ ev: 'asked', by: 0, of: 1, rank: '7', got: 0 }, { ev: 'move', from: 'draw', to: 'hand:0', n: 1, by: 0 }, { ev: 'fished', by: 0, lucky: false }]);
  assert.ok(r.events.every((e) => !e.cards), 'the drawn card is not shown');
  assert.equal(G.status(r.state), 'Asked for 7s: go fish.');
  // The turn passes round the table and back to the first player.
  const t = rig(G, 3, { 'hand:0': ['7H'], 'hand:1': ['2D'], 'hand:2': ['KC', 'QC'], draw: ['4S'] }, { pub: pub(3), turn: 2 });
  assert.deepEqual(yes(G, t, 2, ask(['KC'], 1)).state.turn, [0]);
});

test('Go Fish: a lucky draw, a card of the rank asked for, goes again', () => {
  const s = rig(G, 2, { 'hand:0': ['7H', '9C'], 'hand:1': ['2D', '3D'], draw: ['7C'] }, { pub: pub(2), turn: 0 });
  const r = yes(G, s, 0, ask(['7H'], 1));
  assert.deepEqual(r.state.turn, [0]);
  assert.deepEqual(r.state.zones['hand:0'], ['7H', '9C', '7C']);
  assert.deepEqual(r.events[r.events.length - 1], { ev: 'fished', by: 0, lucky: true });
});

test('Go Fish: a fourth card, given or drawn, completes a book that is laid face up and counted', () => {
  const s = rig(G, 2, { 'hand:0': ['7H', '7S', '9C'], 'hand:1': ['7D', '7C', '2D'] }, { pub: pub(2), turn: 0 });
  const r = yes(G, s, 0, ask(['7H'], 1));
  assert.deepEqual(r.state.zones['hand:0'], ['9C']);
  assert.deepEqual(r.state.zones['laid:0'].slice().sort(), ['7C', '7D', '7H', '7S']);
  assert.deepEqual(r.state.pub.books, [1, 0]);
  assert.deepEqual(T.view(G, r.state, null).zones['laid:0'].cards.slice().sort(), ['7C', '7D', '7H', '7S'], 'laid books are face up for all');
  const laying = r.events.find((e) => e.to === 'laid:0');
  assert.deepEqual(laying.cards.slice().sort(), ['7C', '7D', '7H', '7S'], 'the event shows the book, as it is face up');
  assert.deepEqual(r.state.turn, [0]);
  // The same by a lucky draw: the fourth 7 is on top of the pack.
  const d = rig(G, 2, { 'hand:0': ['7H', '7S', '7D', '9C'], 'hand:1': ['2D', '3D'], draw: ['7C'] }, { pub: pub(2), turn: 0 });
  const e = yes(G, d, 0, ask(['9C'], 1));
  assert.deepEqual(e.state.zones['hand:0'], ['9C'], 'asked for 9s, drew the fourth 7: the book is laid at once');
  assert.deepEqual(e.state.pub.books, [1, 0]);
  assert.deepEqual(e.state.turn, [1], 'an unlucky draw passes the turn');
  const f = yes(G, d, 0, ask(['7H'], 1));
  assert.deepEqual(f.state.zones['laid:0'].slice().sort(), ['7C', '7D', '7H', '7S']);
  assert.deepEqual(f.state.zones['hand:0'], ['9C']);
  assert.deepEqual(f.state.pub.books, [1, 0]);
  assert.deepEqual(f.state.turn, [0], 'a lucky draw goes again');
});

test('Go Fish: a player with no cards draws one when their turn comes; with the pack empty their turn is skipped', () => {
  const s = rig(G, 3, { 'hand:0': ['7H', '9C'], 'hand:1': [], 'hand:2': ['KC', '2D'], draw: ['5S', '6S'] }, { pub: pub(3), turn: 0, only: true });
  const r = yes(G, s, 0, ask(['7H'], 2));
  assert.deepEqual(r.state.zones['hand:0'], ['7H', '9C', '6S']);
  assert.deepEqual(r.state.zones['hand:1'], ['5S'], 'the empty hand drew the next card');
  assert.deepEqual(r.state.turn, [1]);
  assert.equal(r.state.zones.draw.length, 0);
  assert.ok(r.events.every((e) => !e.cards));
  // A hit that empties the asker's hand: they draw and play on.
  const h = rig(G, 2, { 'hand:0': ['7H'], 'hand:1': ['7S', '7D', '7C'], draw: ['5S'] }, { pub: pub(2), turn: 0 });
  const a = yes(G, h, 0, ask(['7H'], 1));
  assert.deepEqual(a.state.pub.books, [1, 0]);
  assert.deepEqual(a.state.zones['hand:0'], ['5S']);
  assert.deepEqual(a.state.turn, [0]);
  // The pack is empty: the empty hand is skipped.
  const t = rig(G, 3, { 'hand:0': ['7H', '9C'], 'hand:1': [], 'hand:2': ['KC', '2D'] }, { pub: pub(3), turn: 0, only: true });
  const b = yes(G, t, 0, ask(['7H'], 2));
  assert.deepEqual(b.state.turn, [2], 'player 2 is skipped for having nothing, and nothing to draw');
  assert.deepEqual(b.events, [{ ev: 'asked', by: 0, of: 2, rank: '7', got: 0 }], 'with nothing to draw there is no fishing');
});

test('Go Fish: when nobody else holds a card you go fish with a button, and the turn then passes', () => {
  const s = rig(G, 3, { 'hand:0': ['7H'], 'hand:1': [], 'hand:2': [], draw: ['5S', '6S'] }, { pub: pub(3), turn: 0 });
  assert.deepEqual(T.hints(G, s, 0), { play: null, buttons: [{ type: 'draw', label: 'Go fish' }] });
  no(G, s, 0, ask(['7H'], 1), /has no cards/);
  const r = yes(G, s, 0, { type: 'draw' });
  assert.deepEqual(r.state.zones['hand:0'], ['7H', '6S']);
  assert.deepEqual(r.state.zones['hand:1'], ['5S'], 'the next player was empty and drew');
  assert.deepEqual(r.state.turn, [1]);
  assert.ok(r.events.every((e) => !e.cards));
  // With others holding cards, drawing instead of asking is refused; with the pack empty there is nothing to draw.
  const t = rig(G, 2, { 'hand:0': ['7H'], 'hand:1': ['2D'], draw: ['5S'] }, { pub: pub(2), turn: 0 });
  no(G, t, 0, { type: 'draw' }, /Ask a player/);
  const u = rig(G, 2, { 'hand:0': ['7H'], 'hand:1': [] }, { pub: pub(2), turn: 0, only: true });
  no(G, u, 0, { type: 'draw' }, /no cards left/);
});

test('Go Fish tells a phone what it may do: ask for a card held, of any player who holds cards', () => {
  const s = rig(G, 3, { 'hand:0': ['7H', '9C'], 'hand:1': ['2D'], 'hand:2': [] }, { pub: pub(3), turn: 0 });
  assert.deepEqual(T.hints(G, s, 0), { play: { type: 'ask', label: 'Ask', cards: ['7H', '9C'], min: 1, max: 1,
    choose: { cards: null, field: 'ask', from: [{ v: 1, label: 'Player 2' }], kind: 'player', title: 'Ask who?' } }, buttons: [] });
  assert.equal(T.hints(G, s, 1), null);
  const four = rig(G, 4, { 'hand:0': ['7H'], 'hand:1': ['2D'], 'hand:2': ['3D'], 'hand:3': ['4D'] }, { pub: pub(4), turn: 2 });
  assert.deepEqual(T.hints(G, four, 2).play.choose.from, [{ v: 0, label: 'Player 1' }, { v: 1, label: 'Player 2' }, { v: 3, label: 'Player 4' }]);
});

test('Go Fish: the status line names the rank, plural', () => {
  const said = (r) => G.status(rig(G, 2, { 'hand:0': ['7H'], 'hand:1': ['2D'] }, { pub: pub(2, null, { by: 0, of: 1, rank: r, got: 0 }), turn: 0 }));
  assert.deepEqual(['A', 'J', 'Q', 'K', 'T', '7'].map(said), ['Asked for aces: go fish.', 'Asked for jacks: go fish.',
    'Asked for queens: go fish.', 'Asked for kings: go fish.', 'Asked for 10s: go fish.', 'Asked for 7s: go fish.']);
});

// The 52 cards as a table of whole books, to set up an ending: ranks is the list of ranks to lay in front of a player.
const book = (r) => C.standard().filter((c) => C.rankOf(c) === r);
const books = (ranks) => ranks.flatMap(book);

test('Go Fish ends when all 13 books are laid, and the most books wins', () => {
  const set = { 'laid:0': books(['A', '2', '3', '4', '5', '6', '7']), 'laid:1': books(['8', '9', 'T', 'J', 'Q']), 'hand:0': ['KH'], 'hand:1': ['KS', 'KD', 'KC'] };
  const s = rig(G, 2, set, { pub: pub(2, [7, 5]), turn: 0, only: true });
  const r = yes(G, s, 0, ask(['KH'], 1));
  assert.deepEqual(r.state.over, { winners: [0], scores: [8, 5] });
  assert.deepEqual(r.state.turn, []);
  assert.equal(r.events[r.events.length - 1].ev, 'over');
  assert.equal(G.status(r.state), 'Game over.');
  no(G, r.state, 0, ask(['7H'], 1), /game is over/);
  // Twelve books laid is not the end.
  const mid = rig(G, 2, { 'laid:0': books(['A', '2', '3', '4', '5', '6']), 'laid:1': books(['8', '9', 'T', 'J', 'Q']), 'hand:0': ['KH', '7H'], 'hand:1': ['KS', 'KD', 'KC', '7S', '7D', '7C'] }, { pub: pub(2, [6, 5]), turn: 0, only: true });
  const m = yes(G, mid, 0, ask(['KH'], 1));
  assert.equal(m.state.over, null);
  assert.deepEqual(m.state.pub.books, [7, 5]);
});

test('Go Fish: a tie for the most books is shared', () => {
  const set = { 'laid:0': books(['A', '2', '3', '4', '5']), 'laid:1': books(['6', '7', '8', '9', 'T']), 'laid:2': books(['J', 'Q']), 'hand:0': ['KS', 'KD', 'KC'], 'hand:1': [], 'hand:2': ['KH'] };
  const s = rig(G, 3, set, { pub: pub(3, [5, 5, 2]), turn: 2, only: true });
  const r = yes(G, s, 2, ask(['KH'], 0));
  assert.deepEqual(r.state.over, { winners: [0, 1], scores: [5, 5, 3] });
});

// ---------- Whole games by chance, held against the privacy rule (the kit: test/helper.js) ----------
// Written here apart from the engine: the pack and every hand but your own are secret; every card laid in a book is open.
const SPEC = {
  secret: (s, v) => { const out = [...s.zones.draw]; for (let q = 0; q < s.n; q++) if (q !== v) out.push(...s.zones['hand:' + q]); return out; },
  open: (s) => { const out = []; for (let q = 0; q < s.n; q++) out.push(...s.zones['laid:' + q]); return out; },
  faceUp: [0, 1, 2, 3, 4, 5].map((q) => 'laid:' + q),
};

test('Go Fish: 30 whole games by chance, 2 to 6 players: no screen is ever given a hidden card, and the books add up', () => {
  for (let n = 2; n <= 6; n++) {
    for (let seed = 1; seed <= 6; seed++) {
      const end = playOut(G, n, seed * 100 + n, {}, SPEC);
      assert.equal(end.pub.books.reduce((a, b) => a + b, 0), 13);
      for (let p = 0; p < n; p++) {
        assert.equal(end.zones['laid:' + p].length, 4 * end.pub.books[p]);
        assert.equal(end.zones['hand:' + p].length, 0);
      }
      assert.equal(end.zones.draw.length, 0);
      assert.deepEqual(end.over.scores, end.pub.books, 'each count is that player\'s score on the end panel');
      assert.ok(end.over.winners.length >= 1);
      for (const w of end.over.winners) assert.equal(end.over.scores[w], Math.max(...end.over.scores));
    }
  }
});

// ---------- Go Fish (pairs): the same game, a set is any two of a kind (Bryan, 23 Nov 2026: "pairs as its own game") ----------
const P = G.pairs;
const ppub = (n, books) => ({ books: books || Array.from({ length: n }, () => 0), last: null, cuts: Object.fromEntries(Array.from({ length: n }, (_, q) => ['laid:' + q, []])) });

test('Go Fish (pairs) is its own game beside Go Fish, with the same moves and a set of two', () => {
  assert.equal(P.id, 'go-fish-pairs');
  assert.equal(P.name, 'Go Fish (pairs)');
  assert.deepEqual(P.options, { first: 0, size: 2 });
  assert.equal(P.labels.laid, 'Pairs');
  assert.equal(P.moves, G.moves, 'the same rules, not a copy');
  assert.equal(G.id, 'go-fish', 'Go Fish itself is unchanged');
  assert.equal(G.options.size, undefined, 'Go Fish keeps books of four');
});

test('Go Fish (pairs): a pair dealt is laid at once; three of a kind lays one pair and keeps one; each pair is its own group', () => {
  const made = T.create(P, { players: 2, rand: C.seeded(7) }).state;
  for (let p = 0; p < 2; p++) {
    const ranks = made.zones['hand:' + p].map(C.rankOf);
    assert.equal(new Set(ranks).size, ranks.length, 'no pair is left in a hand after the deal');
    assert.equal(made.zones['laid:' + p].length, 2 * made.pub.books[p]);
    assert.deepEqual(made.pub.cuts['laid:' + p], Array(made.pub.books[p]).fill(2), 'one group of two for each pair');
  }
  // A hit that makes three of a kind: one pair goes down, the third card stays.
  const s = rig(P, 2, { 'hand:0': ['7H', '7S', '2C'], 'hand:1': ['7D', 'KS'] }, { pub: ppub(2), turn: 0 });
  const r = yes(P, s, 0, ask(['7H'], 1));
  assert.equal(r.state.zones['laid:0'].length, 2);
  assert.equal(r.state.zones['hand:0'].filter((c) => C.rankOf(c) === '7').length, 1, 'the third 7 stays in hand');
  assert.deepEqual(r.state.pub.cuts['laid:0'], [2]);
  assert.equal(r.state.pub.books[0], 1);
  assert.deepEqual(r.state.turn, [0], 'a hit asks again');
});

test('Go Fish (pairs) ends when all 26 pairs are laid, and the most pairs wins; Go Fish books are groups of four', () => {
  const all = C.standard(), byRank = (r) => all.filter((c) => C.rankOf(c) === r);
  const laid0 = [], laid1 = [];
  for (const r of ['A', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q']) { laid0.push(...byRank(r).slice(0, 2)); laid1.push(...byRank(r).slice(2)); }
  laid0.push('KH', 'KS');
  const s = rig(P, 2, { 'laid:0': laid0, 'laid:1': laid1, 'hand:0': ['KD'], 'hand:1': ['KC'] }, { pub: Object.assign(ppub(2, [13, 12])), turn: 0, only: true });
  const r = yes(P, s, 0, ask(['KD'], 1));
  assert.deepEqual(r.state.over, { winners: [0], scores: [14, 12] });
  const b = rig(G, 2, { 'hand:0': ['7H', '7S', '7D'], 'hand:1': ['7C', 'KS'] }, { pub: ppub(2), turn: 0 });
  assert.deepEqual(yes(G, b, 0, ask(['7H'], 1)).state.pub.cuts['laid:0'], [4], 'a book of four is one group');
});

test('Go Fish (pairs): 30 whole games by chance, 2 to 6 players: no screen is ever given a hidden card, and the pairs add up', () => {
  for (let n = 2; n <= 6; n++) {
    for (let seed = 1; seed <= 6; seed++) {
      const end = playOut(P, n, seed * 100 + n, {}, SPEC);
      assert.equal(end.pub.books.reduce((a, b) => a + b, 0), 26);
      for (let p = 0; p < n; p++) {
        assert.equal(end.zones['laid:' + p].length, 2 * end.pub.books[p]);
        assert.deepEqual(end.pub.cuts['laid:' + p], Array(end.pub.books[p]).fill(2));
        assert.equal(end.zones['hand:' + p].length, 0);
      }
      assert.equal(end.zones.draw.length, 0);
      for (const w of end.over.winners) assert.equal(end.over.scores[w], Math.max(...end.over.scores));
    }
  }
});
