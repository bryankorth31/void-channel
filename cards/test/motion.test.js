// The motion on the big-screen table (cards/src/motion.js): what flies where after a change, worked out from its events.
// Run: node --test cards/test/motion.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../src/cards.js');
const T = require('../src/table.js');
const M = require('../src/motion.js');
const { pickMove } = require('./helper.js');

const move = (from, to, extra) => Object.assign({ ev: 'move', from, to, n: 1 }, extra || {});

test('place: a zone of a player names the seat; a known card goes with it', () => {
  assert.deepEqual(M.place('hand:2'), { zone: 'hand:2', seat: 2 });
  assert.deepEqual(M.place('won:11', 'AS'), { zone: 'won:11', seat: 11, card: 'AS' });
  assert.deepEqual(M.place('draw'), { zone: 'draw' });
  assert.deepEqual(M.place('melds', '7H'), { zone: 'melds', card: '7H' });
});

test('the deal: one face-down card to each seat in turn, from the pack, and the whole deal is quick', () => {
  const f = M.plan([{ ev: 'shuffle', zone: 'draw' }, { ev: 'deal', from: 'draw', to: 'hand', n: 7 }], 3);
  assert.equal(f.length, 21);
  assert.ok(f.every((x) => x.face === null && x.from.zone === 'draw' && !x.flip));
  assert.deepEqual(f.slice(0, 4).map((x) => x.to.seat), [0, 1, 2, 0]);
  for (let i = 1; i < f.length; i++) assert.ok(f[i].at > f[i - 1].at, 'one after another');
  const big = M.plan([{ ev: 'deal', from: 'draw', to: 'hand', n: 13 }], 4);
  assert.equal(big.length, 52);
  assert.ok(big[big.length - 1].at <= 1700, 'a whole pack is dealt in under two seconds');
});

test('a card played from a hand flies from its player face up; a card turned off the pack flips', () => {
  const [a] = M.plan([move('hand:1', 'trick', { cards: ['AS'], by: 1 })], 4);
  assert.deepEqual(a, { face: 'AS', from: { zone: 'hand:1', seat: 1, card: 'AS' }, to: { zone: 'trick', card: 'AS' }, at: 0, flip: false });
  const [b] = M.plan([move('draw', 'offer', { cards: ['5H'], by: 0 })], 2);
  assert.equal(b.flip, true);
  assert.equal(b.from.zone, 'draw');
});

test('a hidden move flies face down, up to three cards of it', () => {
  const two = M.plan([move('hand:2', 'hand:0', { n: 2, by: 0 })], 3);
  assert.equal(two.length, 2);
  assert.ok(two.every((x) => x.face === null && x.from.seat === 2 && x.to.seat === 0));
  assert.equal(M.plan([move('hand:2', 'hand:0', { n: 5 })], 3).length, 3);
  assert.equal(M.plan([move('draw', 'hand:1', { n: 1, by: 1 })], 3)[0].from.zone, 'draw');
});

test('cards that go from a hand to a place of the same player nobody sees do not move', () => {
  assert.deepEqual(M.plan([move('hand:1', 'pass:1', { n: 3 })], 4), []);
  // Laid face up, they do: the cards fly from the plate to where they lie.
  assert.equal(M.plan([move('hand:1', 'laid:1', { n: 2, cards: ['7H', '7S'], by: 1 })], 3).length, 2);
});

test('a trick just taken does not fly with the move: the table holds it, then sweeps it to the taker', () => {
  const events = [move('hand:3', 'trick', { cards: ['KH'], by: 3 }), move('trick', 'won:2', { n: 4, cards: ['2H', '9H', 'QH', 'KH'] }), { ev: 'trick', won: 2, led: 0 }];
  const f = M.plan(events, 4);
  assert.equal(f.length, 1);
  assert.equal(f[0].face, 'KH');
  // Without the trick event (a game that moves the trick for another reason) the cards fly.
  assert.equal(M.plan(events.slice(0, 2), 4).length, 5);
});

test('the moves of a change follow one another, and a long change is played faster', () => {
  const f = M.plan([move('hand:0', 'hand:1', { n: 1 }), move('draw', 'hand:0', { n: 1 }), move('hand:0', 'laid:0', { n: 2, cards: ['4C', '4D'] })], 2);
  assert.deepEqual(f.map((x) => x.at), [0, 260, 520, 590]);
  const long = [];
  for (let i = 0; i < 40; i++) long.push(move('hand:0', 'laid:0', { n: 2, cards: ['A' + i, 'B' + i] }));
  const g = M.plan(long, 2);
  assert.ok(g[g.length - 1].at <= 4200);
  assert.ok(g[1].at > g[0].at);
});

test('anything that is not a move or a deal is left alone, and odd events do not break it', () => {
  assert.deepEqual(M.plan([{ ev: 'shuffle', zone: 'draw' }, { ev: 'asked', by: 0, of: 1, rank: 'Q', got: 0 }, { ev: 'over' }, null, 7, { ev: 'move' }], 3), []);
  assert.deepEqual(M.plan(null, 3), []);
  assert.deepEqual(M.plan([{ ev: 'deal', from: 'draw', to: 'hand', n: 5 }], 0), []);
});

// The privacy rule (cards/README.md): the table shows only what everyone may see. A flight shows a face only when the move
// it came from carried that card, and an event carries a card only when everyone could see it.
test('whole games by chance: a card in the air face up is always one its move showed to everyone', () => {
  for (const f of fs.readdirSync(path.join(__dirname, '..', 'games')).filter((x) => x.endsWith('.js'))) {
    const mod = require('../games/' + f);
    for (const game of [mod].concat(mod.pairs ? [mod.pairs] : [])) {
      const n = game.players.min === game.players.max ? game.players.min : Math.min(4, game.players.max);
      for (let seed = 1; seed <= 3; seed++) {
        const rand = C.seeded(seed * 7919);
        const made = T.create(game, { players: n, rand });
        let state = made.state, events = made.events, steps = 0;
        for (;;) {
          const shown = new Set();
          for (const e of events) if (e && e.ev === 'move' && Array.isArray(e.cards)) e.cards.forEach((c) => shown.add(c));
          for (const fl of M.plan(events, n)) if (fl.face !== null) assert.ok(shown.has(fl.face), game.id + ': ' + fl.face + ' flew face up');
          if (state.over || ++steps > 3000) break;
          // A move picked by chance may not fit (a set that is not one): another is picked, as a player would.
          const p = state.turn[Math.floor(rand() * state.turn.length)], h = T.hints(game, state, p);
          let r = null;
          for (let k = 0; k < 40 && !(r && r.ok); k++) r = T.move(game, state, p, pickMove(h, rand), rand);
          if (!r.ok) break;
          state = r.state; events = r.events;
        }
        assert.ok(steps > 3, game.id + ' was played');
      }
    }
  }
});
