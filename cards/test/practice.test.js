// The practice hand's table seats (cards/src/practice.js): they join the dealer as phones would, see only what a phone in
// their place is told, and play every game to its end. Run: node --test cards/test/practice.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../src/cards.js');
const D = require('../src/dealer.js');
const P = require('../src/practice.js');

const DIR = path.join(__dirname, '..', 'games');
const games = [];
for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.js'))) { const g = require(path.join(DIR, f)); games.push(g); if (g.pairs) games.push(g.pairs); }
const byId = {};
for (const g of games) byId[g.id] = g;

// A table with no phones at all: the practice seats play every seat.
function table(seed) {
  const queue = [], net = [];
  let practice = null;
  const dealing = { games: byId, opts: {}, rand: C.seeded(seed), send: (to, msg) => { if (practice && practice.deliver(to, msg)) return; net.push([to, msg]); } };
  const dealer = D.create(dealing);
  practice = P.create({ dealer, games: byId, rand: C.seeded(seed + 1), schedule: (fn, ms) => { queue.push([fn, ms]); return queue.length; }, cancel() {}, stuck: (s) => { throw new Error('stuck: ' + s); } });
  const run = (max) => { let n = 0; while (queue.length && n++ < (max || 50000)) queue.shift()[0](); return n; };
  return { dealer, dealing, practice, queue, net, run };
}

test('seatsFor: three seats, or the game\'s own least or most', () => {
  assert.equal(P.seatsFor({ players: { min: 2, max: 7 } }), 3);
  assert.equal(P.seatsFor({ players: { min: 4, max: 4 } }), 4);
  assert.equal(P.seatsFor({ players: { min: 2, max: 2 } }), 2);
  assert.equal(P.seatsFor(byId.spades), 4);
  assert.equal(P.seatsFor(byId.conquian), 2);
});

test('begin fills the empty seats after the people, named Table 1 and on; end lets them go', () => {
  const t = table(1);
  t.dealer.relay({ type: 'join', from: 5 });
  t.dealer.relay({ from: 5, msg: { type: 'c-hi', key: 'person-key-0123456789', name: 'Ann' } });
  t.dealer.pick('crazy-eights');
  assert.equal(t.practice.begin(byId['crazy-eights'], 1), 2);
  assert.ok(t.practice.on);
  assert.deepEqual(t.practice.seats(), ['table-1', 'table-2']);
  assert.deepEqual(t.dealer.snapshot().players.map((p) => p.name), ['Ann', 'Table 1', 'Table 2']);
  assert.equal(t.dealer.start(), null);
  assert.deepEqual(t.dealer.snapshot().players.map((p) => p.name), ['Ann', 'Table 1', 'Table 2'], 'the person has the first place');
  t.practice.end();
  assert.ok(!t.practice.on);
  t.dealer.stop();
  assert.deepEqual(t.dealer.snapshot().players.map((p) => p.name), ['Ann'], 'only the person is left in the lobby');
  // A full table needs no seats of the table's own.
  assert.equal(t.practice.begin(byId.conquian, 2), 0);
});

test('nothing for a table seat ever goes to the relay: the phones are told only what is for them or for everyone', () => {
  const t = table(2);
  t.dealer.pick('hearts');
  t.practice.begin(byId.hearts, 0);
  t.dealing.opts = byId.hearts.practice.opts;
  assert.equal(t.dealer.start(), null);
  t.run();
  assert.ok(t.net.length > 0);
  for (const [to] of t.net) assert.equal(to, 'all');
  for (const [, msg] of t.net) assert.ok(['c-roster', 'c-table'].includes(msg.type), msg.type);
});

test('a seat played by the table waits before it moves, so a person can follow it', () => {
  const t = table(3);
  t.dealer.pick('crazy-eights');
  t.practice.begin(byId['crazy-eights'], 0);
  t.dealer.start();
  assert.ok(t.queue.length > 0);
  assert.equal(t.queue[0][1], P.WAIT);
});

test('the table plays every game to the end, a practice hand of Hearts or Spades being one deal', () => {
  for (const g of games) {
    for (const seed of [1, 2, 3, 4]) {
      const t = table(seed);
      t.dealer.pick(g.id);
      t.practice.begin(g, 0);
      t.dealing.opts = (g.practice && g.practice.opts) || {};
      assert.equal(t.dealer.start(), null, g.id);
      t.dealing.opts = {};
      t.run();
      const s = t.dealer.snapshot();
      assert.equal(s.phase, 'over', g.id + ' seed ' + seed);
      if (g.id === 'hearts') assert.equal(s.view.pub.round, 0, 'Hearts: the first deal ends the practice hand');
    }
  }
});

test('candidates: Crazy Eights plays a card before drawing and keeps its eights for last', () => {
  const mine = { zones: { 'hand:0': { cards: ['8C', '5H', 'KH'] } }, hints: { play: { type: 'play', cards: ['8C', '5H', 'KH'], min: 1, max: 1,
    choose: { cards: ['8C'], field: 'suit', from: ['S', 'H', 'D', 'C'], kind: 'suit' } }, buttons: [{ type: 'draw', label: 'Draw a card' }] } };
  const list = P.candidates(byId['crazy-eights'], mine, {}, 0);
  assert.deepEqual(list[0], { type: 'play', cards: ['5H'] });
  assert.deepEqual(list[1], { type: 'play', cards: ['KH'] });
  assert.deepEqual(list[2], { type: 'play', cards: ['8C'], suit: 'H' }, 'an eight names the suit held most');
  assert.deepEqual(list[list.length - 1], { type: 'draw' });
});

test('candidates: Spades bids the hand\'s own guess first and nil last', () => {
  const held = ['AS', 'KS', 'AH', '2D', '3D', '4C', '5C', '6C', '7C', '8H', '9H', 'TH', 'JD'];
  const mine = { zones: { 'hand:0': { cards: held } }, hints: { play: null, buttons: [{ type: 'bid', label: 'Bid',
    choose: { field: 'n', from: [{ v: 0, label: 'Nil' }].concat([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((v) => ({ v, label: String(v) }))), kind: 'option' } }] } };
  const list = P.candidates(byId.spades, mine, {}, 0);
  assert.deepEqual(list[0], { type: 'bid', n: byId.spades.bot.bid(held) });
  assert.deepEqual(list[list.length - 1], { type: 'bid', n: 0 });
});

test('combos', () => {
  assert.deepEqual(P.combos(['a', 'b', 'c'], 2, 10), [['a', 'b'], ['a', 'c'], ['b', 'c']]);
  assert.deepEqual(P.combos(['a', 'b'], 0, 10), [[]]);
  assert.equal(P.combos(['a', 'b', 'c', 'd', 'e'], 2, 3).length, 3);
});
