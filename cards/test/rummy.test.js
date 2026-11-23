// Rummy: each rule held by a table set by hand, then whole games by chance held against the privacy rule.
// Run: node --test cards/test/rummy.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/cards.js');
const T = require('../src/table.js');
const RM = require('../games/rummy.js');
const { rig, yes, no, quoted, playOut } = require('./helper.js');

// A two-player table in the second step of a turn (the card is drawn). melds: groups laid, as lists.
function laid(hands, groupsOn, more) {
  const flat = [].concat(...(groupsOn || []));
  const set = Object.assign({ melds: flat }, hands);
  const o = more || {};
  const s = rig(RM, Object.keys(hands).length, set, { only: true, turn: 0, pub: { drew: true, flips: 0, cuts: { melds: (groupsOn || []).map((g) => g.length) } } });
  if (o.took) s.own[0].took = o.took;
  return s;
}
const sizesAgree = (s) => assert.equal(s.pub.cuts.melds.reduce((a, b) => a + b, 0), s.zones.melds.length);

test('Rummy deals 10 each to two, 7 to three or four, 6 to five or six, and turns one card up', () => {
  for (const [n, each] of [[2, 10], [3, 7], [4, 7], [5, 6], [6, 6]]) {
    for (let seed = 1; seed <= 5; seed++) {
      const s = T.create(RM, { players: n, rand: C.seeded(seed) }).state;
      for (let p = 0; p < n; p++) assert.equal(s.zones['hand:' + p].length, each);
      assert.equal(s.zones.discard.length, 1);
      assert.equal(s.zones.draw.length, 52 - 1 - n * each);
      assert.equal(s.zones.melds.length, 0);
      assert.deepEqual(s.turn, [0]);
      assert.deepEqual(s.pub, { drew: false, flips: 0, cuts: { melds: [] } });
    }
  }
  assert.deepEqual(T.create(RM, { players: 4, rand: C.seeded(2), opts: { first: 2 } }).state.turn, [2]);
  assert.throws(() => T.create(RM, { players: 1 }), /2 to 6 players/);
  assert.throws(() => T.create(RM, { players: 7 }), /2 to 6 players/);
});

test('Rummy: drawing from the pack keeps its face out of every event', () => {
  const s = rig(RM, 2, { 'hand:0': ['2C', '3C'], 'hand:1': ['5D'], draw: ['2S', '9H'], discard: ['KD'] }, { only: true, turn: 0 });
  const r = yes(RM, s, 0, { type: 'draw' });
  assert.deepEqual(r.state.zones['hand:0'], ['2C', '3C', '9H']);
  assert.equal(r.state.pub.drew, true);
  assert.equal(r.state.own[0].took, null);
  assert.deepEqual(r.state.turn, [0], 'the turn stays with whoever drew');
  assert.deepEqual(r.events, [{ ev: 'move', from: 'draw', to: 'hand:0', n: 1, by: 0 }]);
  assert.ok(!quoted(JSON.stringify(T.view(RM, r.state, null)), '9H'));
  assert.ok(!quoted(JSON.stringify(T.view(RM, r.state, 1)), '9H'));
});

test('Rummy: taking the top of the pile shows its face to all, and only its taker remembers it', () => {
  const s = rig(RM, 2, { 'hand:0': ['2C', '3C'], 'hand:1': ['5D'], draw: ['2S'], discard: ['4C', 'KD'] }, { only: true, turn: 0 });
  const r = yes(RM, s, 0, { type: 'take' });
  assert.deepEqual(r.state.zones['hand:0'], ['2C', '3C', 'KD']);
  assert.deepEqual(r.state.zones.discard, ['4C']);
  assert.equal(r.state.own[0].took, 'KD');
  assert.deepEqual(r.events, [{ ev: 'move', from: 'discard', to: 'hand:0', n: 1, cards: ['KD'], by: 0 }]);
  assert.ok(!quoted(JSON.stringify(T.view(RM, r.state, null)), 'KD'), 'not in the public table');
  assert.ok(!quoted(JSON.stringify(T.view(RM, r.state, 1)), 'KD'), 'not in another player\'s view');
  assert.equal(T.mine(RM, r.state, 0).own.took, 'KD');
  assert.equal(r.state.pub.drew, true);
  assert.ok(!JSON.stringify(r.state.pub).includes('KD'));
});

test('Rummy: one draw a turn, and nothing may be laid or thrown before it', () => {
  const s = rig(RM, 2, { 'hand:0': ['2C', '3C', '4C'], 'hand:1': ['5D'], draw: ['2S', '9H'], discard: ['KD'], melds: ['7H', '7S', '7D'] }, { only: true, turn: 0, pub: { cuts: { melds: [3] } } });
  no(RM, s, 0, { type: 'meld', cards: ['2C', '3C', '4C'] }, /Draw a card first/);
  no(RM, s, 0, { type: 'layoff', cards: ['2C'], on: 0 }, /Draw a card first/);
  no(RM, s, 0, { type: 'discard', cards: ['2C'] }, /Draw a card first/);
  no(RM, s, 1, { type: 'draw' }, /not your turn/);
  const d = yes(RM, s, 0, { type: 'draw' }).state;
  no(RM, d, 0, { type: 'draw' }, /already drawn/);
  no(RM, d, 0, { type: 'take' }, /already drawn/);
  const k = yes(RM, s, 0, { type: 'take' }).state;
  no(RM, k, 0, { type: 'draw' }, /already drawn/);
  no(RM, k, 0, { type: 'take' }, /already drawn/);
});

test('Rummy: a set is 3 or 4 cards of one rank', () => {
  const three = yes(RM, laid({ 'hand:0': ['7H', '7S', '7D', '2C'], 'hand:1': ['5D'] }), 0, { type: 'meld', cards: ['7H', '7S', '7D'] }).state;
  assert.deepEqual(three.zones.melds, ['7H', '7S', '7D']);
  assert.deepEqual(three.pub.cuts.melds, [3]);
  assert.deepEqual(three.zones['hand:0'], ['2C']);
  assert.deepEqual(three.turn, [0], 'laying down does not end the turn');
  const four = yes(RM, laid({ 'hand:0': ['7H', '7S', '7D', '7C', '2C'], 'hand:1': ['5D'] }), 0, { type: 'meld', cards: ['7C', '7D', '7H', '7S'] }).state;
  assert.equal(four.zones.melds.length, 4);
  assert.deepEqual(four.pub.cuts.melds, [4]);
  const s = laid({ 'hand:0': ['7H', '7S', '8D', '9C', '2C'], 'hand:1': ['5D'] });
  no(RM, s, 0, { type: 'meld', cards: ['7H', '7S', '8D'] }, /not a set or a run/);
  no(RM, s, 0, { type: 'meld', cards: ['7H', '7S'] }, /Pick 3 to 13 cards/);
  no(RM, s, 0, { type: 'meld', cards: ['7H'] }, /Pick 3 to 13 cards/);
});

test('Rummy: a run is 3 or more of one suit in order, ace low, and it is kept low to high', () => {
  const a = laid({ 'hand:0': ['5H', '3H', '4H', '9C'], 'hand:1': ['5D'] });
  const r = yes(RM, a, 0, { type: 'meld', cards: ['5H', '3H', '4H'] }).state;
  assert.deepEqual(r.zones.melds, ['3H', '4H', '5H'], 'put in order');
  const long = yes(RM, laid({ 'hand:0': ['9S', '6S', 'TS', '8S', '7S', 'JS', '2C'], 'hand:1': ['5D'] }), 0, { type: 'meld', cards: ['9S', '6S', 'TS', '8S', '7S', 'JS'] }).state;
  assert.deepEqual(long.zones.melds, ['6S', '7S', '8S', '9S', 'TS', 'JS']);
  const low = yes(RM, laid({ 'hand:0': ['3D', 'AD', '2D', '9C'], 'hand:1': ['5D'] }), 0, { type: 'meld', cards: ['3D', 'AD', '2D'] }).state;
  assert.deepEqual(low.zones.melds, ['AD', '2D', '3D'], 'ace low');
  const s = laid({ 'hand:0': ['QH', 'KH', 'AH', '3S', '4D', '5C', '3H', '4H', '6H', 'JH'], 'hand:1': ['5D'] });
  no(RM, s, 0, { type: 'meld', cards: ['QH', 'KH', 'AH'] }, /not a set or a run/);
  no(RM, s, 0, { type: 'meld', cards: ['3S', '4D', '5C'] }, /not a set or a run/);
  no(RM, s, 0, { type: 'meld', cards: ['3S', '4H', '5C'] }, /not a set or a run/);
  no(RM, s, 0, { type: 'meld', cards: ['3H', '4H', '6H'] }, /not a set or a run/);
  assert.equal(yes(RM, s, 0, { type: 'meld', cards: ['JH', 'QH', 'KH'] }).state.zones.melds.length, 3);
});

test('Rummy: the zone and its cuts agree after each meld, and groups stay together', () => {
  let s = laid({ 'hand:0': ['5H', '3H', '4H', '9C', '9S', '9D', '9H', '6D', '8D', '7D'], 'hand:1': ['5D'] });
  s = yes(RM, s, 0, { type: 'meld', cards: ['9C', '9S', '9D'] }).state; sizesAgree(s);
  s = yes(RM, s, 0, { type: 'meld', cards: ['5H', '3H', '4H'] }).state; sizesAgree(s);
  s = yes(RM, s, 0, { type: 'meld', cards: ['6D', '8D', '7D'] }).state; sizesAgree(s);
  assert.deepEqual(s.pub.cuts.melds, [3, 3, 3]);
  assert.deepEqual(s.zones.melds, ['9C', '9S', '9D', '3H', '4H', '5H', '6D', '7D', '8D']);
  s = yes(RM, s, 0, { type: 'layoff', cards: ['9H'], on: 0 }).state; sizesAgree(s);
  assert.deepEqual(s.pub.cuts.melds, [4, 3, 3]);
});

test('Rummy: laying off onto your own group and another player\'s', () => {
  const g = [['7H', '7S', '7D'], ['3H', '4H', '5H']];
  const s = laid({ 'hand:0': ['7C', '6H', '2H', 'KS', '9D'], 'hand:1': ['5D'] }, g);
  const a = yes(RM, s, 0, { type: 'layoff', cards: ['7C'], on: 0 });
  assert.deepEqual(a.state.zones.melds, ['7H', '7S', '7D', '7C', '3H', '4H', '5H']);
  assert.deepEqual(a.state.pub.cuts.melds, [4, 3]);
  assert.deepEqual(a.events, [{ ev: 'move', from: 'hand:0', to: 'melds', n: 1, cards: ['7C'], by: 0 }]);
  sizesAgree(a.state);
  // Another player's group: player 1 lays a card on a group player 0 made.
  const other = rig(RM, 2, { 'hand:0': ['2C'], 'hand:1': ['6H', '9D'], melds: g[0].concat(g[1]), draw: ['AS'] }, { only: true, turn: 1, pub: { drew: true, flips: 0, cuts: { melds: [3, 3] } } });
  const b = yes(RM, other, 1, { type: 'layoff', cards: ['6H'], on: 1 });
  assert.deepEqual(b.state.zones.melds.slice(3), ['3H', '4H', '5H', '6H']);
  assert.deepEqual(b.state.pub.cuts.melds, [3, 4]);
});

test('Rummy: a card goes on either end of a run, several at once, and a fourth card onto a set', () => {
  const g = [['3H', '4H', '5H'], ['7H', '7S', '7D']];
  const s = laid({ 'hand:0': ['2H', '6H', 'AH', '7C', '9C'], 'hand:1': ['5D'] }, g);
  assert.deepEqual(yes(RM, s, 0, { type: 'layoff', cards: ['2H'], on: 0 }).state.zones.melds.slice(0, 4), ['2H', '3H', '4H', '5H']);
  assert.deepEqual(yes(RM, s, 0, { type: 'layoff', cards: ['6H'], on: 0 }).state.zones.melds.slice(0, 4), ['3H', '4H', '5H', '6H']);
  const both = yes(RM, s, 0, { type: 'layoff', cards: ['6H', '2H'], on: 0 }).state;
  assert.deepEqual(both.zones.melds.slice(0, 5), ['2H', '3H', '4H', '5H', '6H']);
  assert.deepEqual(both.pub.cuts.melds, [5, 3]);
  const four = yes(RM, s, 0, { type: 'layoff', cards: ['7C'], on: 1 }).state;
  assert.deepEqual(four.pub.cuts.melds, [3, 4]);
  // Ace stays low: it joins A-2-3 only at the low end, and cannot follow a king.
  assert.deepEqual(yes(RM, laid({ 'hand:0': ['AH', '9C'], 'hand:1': ['5D'] }, [['2H', '3H', '4H']]), 0, { type: 'layoff', cards: ['AH'], on: 0 }).state.zones.melds, ['AH', '2H', '3H', '4H']);
  no(RM, laid({ 'hand:0': ['AH', '9C'], 'hand:1': ['5D'] }, [['JH', 'QH', 'KH']]), 0, { type: 'layoff', cards: ['AH'], on: 0 }, /do not fit/);
});

test('Rummy: a card that does not fit, or a wrong group number, is refused', () => {
  const g = [['3H', '4H', '5H'], ['7H', '7S', '7D']];
  const s = laid({ 'hand:0': ['9D', '6S', '7C', '8H', 'KS'], 'hand:1': ['5D'] }, g);
  no(RM, s, 0, { type: 'layoff', cards: ['9D'], on: 0 }, /do not fit/);
  no(RM, s, 0, { type: 'layoff', cards: ['6S'], on: 0 }, /do not fit/);
  no(RM, s, 0, { type: 'layoff', cards: ['8H'], on: 1 }, /do not fit/);
  no(RM, s, 0, { type: 'layoff', cards: ['7C', '9D'], on: 1 }, /do not fit|no more than 4/);
  no(RM, s, 0, { type: 'layoff', cards: ['7C'], on: 0 }, /do not fit/);
  no(RM, s, 0, { type: 'layoff', cards: ['7C'], on: 2 }, /no such set or run/);
  no(RM, s, 0, { type: 'layoff', cards: ['7C'], on: -1 }, /no such set or run/);
  no(RM, s, 0, { type: 'layoff', cards: ['7C'], on: '1' }, /no such set or run/);
  no(RM, s, 0, { type: 'layoff', cards: ['7C'] }, /no such set or run/);
  no(RM, laid({ 'hand:0': ['7C', '9D'], 'hand:1': ['5D'] }), 0, { type: 'layoff', cards: ['7C'], on: 0 }, /no such set or run/);
  no(RM, s, 0, { type: 'layoff', cards: ['2C'], on: 1 }, /do not hold/);
});

test('Rummy: a discard ends the turn, the card just taken cannot be thrown back, and the next player draws', () => {
  const s = rig(RM, 2, { 'hand:0': ['2C', '3D'], 'hand:1': ['5D', '6D'], draw: ['AS', '9H'], discard: ['4C', 'KD'] }, { only: true, turn: 0 });
  const k = yes(RM, s, 0, { type: 'take' }).state;
  no(RM, k, 0, { type: 'discard', cards: ['KD'] }, /cannot throw back the card you just took/);
  const r = yes(RM, k, 0, { type: 'discard', cards: ['2C'] });
  assert.deepEqual(r.state.turn, [1]);
  assert.equal(r.state.pub.drew, false);
  assert.equal(r.state.own[0].took, null);
  assert.deepEqual(r.state.zones.discard, ['4C', '2C']);
  assert.deepEqual(r.events, [{ ev: 'move', from: 'hand:0', to: 'discard', n: 1, cards: ['2C'], by: 0 }]);
  no(RM, r.state, 0, { type: 'draw' }, /not your turn/);
  const n = yes(RM, r.state, 1, { type: 'take' }).state;
  assert.equal(n.own[1].took, '2C');
  assert.equal(yes(RM, r.state, 1, { type: 'draw' }).state.pub.drew, true);
  // A card drawn from the pack may be thrown straight back.
  const d = yes(RM, s, 0, { type: 'draw' }).state;
  assert.deepEqual(yes(RM, d, 0, { type: 'discard', cards: ['9H'] }).state.zones.discard, ['4C', 'KD', '9H']);
  // The card taken may be laid in a meld, and then it is no longer a card to throw back.
  const m = rig(RM, 2, { 'hand:0': ['5C', '5S', '9D'], 'hand:1': ['5D'], discard: ['5H'] }, { only: true, turn: 0 });
  let t = yes(RM, m, 0, { type: 'take' }).state;
  t = yes(RM, t, 0, { type: 'meld', cards: ['5C', '5S', '5H'] }).state;
  assert.deepEqual(yes(RM, t, 0, { type: 'discard', cards: ['9D'] }).state.over.winners, [0]);
});

test('Rummy: the card just taken may be thrown when it is the only card left in the hand', () => {
  const s = laid({ 'hand:0': ['KD'], 'hand:1': ['5D'] }, [['2H', '3H', '4H']], { took: 'KD' });
  assert.deepEqual(T.hints(RM, s, 0).play.cards, ['KD']);
  assert.deepEqual(yes(RM, s, 0, { type: 'discard', cards: ['KD'] }).state.over.winners, [0]);
});

test('Rummy: going out by a meld, by a layoff and by a discard, with the points left counted', () => {
  const left = { 'hand:1': ['AS', 'KD', '5C', 'TH'], 'hand:2': ['2C', 'JD'] };
  const a = yes(RM, laid(Object.assign({ 'hand:0': ['3H', '4H', '5H'] }, left)), 0, { type: 'meld', cards: ['3H', '4H', '5H'] }).state;
  assert.deepEqual(a.over, { winners: [0], left: [0, 26, 12] });
  assert.deepEqual(a.turn, []);
  const b = yes(RM, laid(Object.assign({ 'hand:0': ['7C'] }, left), [['7H', '7S', '7D']]), 0, { type: 'layoff', cards: ['7C'], on: 0 }).state;
  assert.deepEqual(b.over, { winners: [0], left: [0, 26, 12] });
  const c = yes(RM, laid(Object.assign({ 'hand:0': ['9C'] }, left)), 0, { type: 'discard', cards: ['9C'] });
  assert.deepEqual(c.state.over, { winners: [0], left: [0, 26, 12] });
  assert.equal(c.events[c.events.length - 1].ev, 'over');
  // The hand is not empty yet after a meld that leaves a card: the turn goes on.
  const d = yes(RM, laid({ 'hand:0': ['3H', '4H', '5H', '9C'], 'hand:1': ['5D'] }), 0, { type: 'meld', cards: ['3H', '4H', '5H'] }).state;
  assert.equal(d.over, null);
  assert.equal(RM.points(['AS', '2C', 'TH', 'JD', 'QC', 'KS']), 1 + 2 + 10 + 10 + 10 + 10);
});

test('Rummy: when the pack runs out the pile is turned over, not shuffled, the oldest discard first', () => {
  const s = rig(RM, 2, { 'hand:0': ['2C'], 'hand:1': ['5D'], draw: [], discard: ['3C', '4C', '5C', '6C'] }, { only: true, turn: 0 });
  const r = yes(RM, s, 0, { type: 'draw' });
  assert.deepEqual(r.state.zones['hand:0'], ['2C', '3C'], 'the oldest discard is drawn');
  assert.deepEqual(r.state.zones.draw, ['5C', '4C']);
  assert.deepEqual(r.state.zones.discard, ['6C'], 'the top card stays');
  assert.equal(r.state.pub.flips, 1);
  assert.ok(r.events.every((e) => !e.cards), 'no face is shown');
  // The second time turns it over again; the third time ends the deal.
  const two = rig(RM, 2, { 'hand:0': ['2C'], 'hand:1': ['5D'], draw: [], discard: ['3C', '4C', '6C'] }, { only: true, turn: 0, pub: { flips: 1 } });
  const w = yes(RM, two, 0, { type: 'draw' });
  assert.equal(w.state.pub.flips, 2);
  assert.equal(w.state.over, null);
  const three = rig(RM, 3, { 'hand:0': ['2S'], 'hand:1': ['AH', 'AD'], 'hand:2': ['KS'], draw: [], discard: ['3C', '4C', '6C'] }, { only: true, turn: 0, pub: { flips: 2 } });
  const e = yes(RM, three, 0, { type: 'draw' }).state;
  assert.deepEqual(e.over, { winners: [0, 1], left: [2, 2, 10] }, 'the fewest points win and a tie is shared');
  assert.deepEqual(e.turn, []);
  const one = rig(RM, 2, { 'hand:0': ['KS'], 'hand:1': ['AH', '9D', '5C'], draw: [], discard: ['3C', '4C'] }, { only: true, turn: 0, pub: { flips: 2 } });
  assert.deepEqual(yes(RM, one, 0, { type: 'draw' }).state.over.winners, [0]);
});

test('Rummy: with nothing to turn over, drawing is refused and the top card may be taken', () => {
  const s = rig(RM, 2, { 'hand:0': ['2C'], 'hand:1': ['5D'], draw: [], discard: ['KD'] }, { only: true, turn: 0 });
  no(RM, s, 0, { type: 'draw' }, /There are no cards left to draw\. Take the top card\./);
  assert.deepEqual(T.hints(RM, s, 0).buttons, [{ type: 'take', label: 'Take the top card' }]);
  assert.equal(yes(RM, s, 0, { type: 'take' }).state.own[0].took, 'KD');
});

test('Rummy tells a phone what it may do, before and after drawing', () => {
  const s = rig(RM, 2, { 'hand:0': ['2C', '3C', 'KD'], 'hand:1': ['5D'], draw: ['2S'], discard: ['4C'] }, { only: true, turn: 0 });
  assert.deepEqual(T.hints(RM, s, 0), { play: null, buttons: [{ type: 'draw', label: 'Draw from the pack' }, { type: 'take', label: 'Take the top card' }] });
  assert.equal(T.hints(RM, s, 1), null);
  // After drawing, nothing laid: no Lay off.
  const d = yes(RM, s, 0, { type: 'draw' }).state;
  const hand = d.zones['hand:0'];
  assert.deepEqual(T.hints(RM, d, 0), {
    play: { type: 'discard', label: 'Discard', cards: hand, min: 1, max: 1, choose: null },
    plays: [{ type: 'meld', label: 'Lay down', cards: hand, min: 3, max: 13, choose: null }],
    buttons: [],
  });
  // After taking, the card taken is left out of the discards but not of the other plays.
  const k = yes(RM, s, 0, { type: 'take' }).state;
  const h = T.hints(RM, k, 0);
  assert.deepEqual(h.play.cards, ['2C', '3C', 'KD']);
  assert.deepEqual(h.plays[0].cards, ['2C', '3C', 'KD', '4C']);
  // With groups on the table: Lay off asks which one, in words.
  const g = [['7H', '7S', '7D'], ['JC', 'QC', 'KC'], ['AH', 'AS', 'AD'], ['TH', 'TS', 'TD'], ['3H', '4H', '5H', '6H']];
  const l = laid({ 'hand:0': ['2C', '9S', '8D'], 'hand:1': ['5D'] }, g);
  const lh = T.hints(RM, l, 0);
  assert.equal(lh.plays.length, 2);
  assert.deepEqual(lh.plays[1], { type: 'layoff', label: 'Lay off', cards: ['2C', '9S', '8D'], min: 1, max: 13,
    choose: { cards: null, field: 'on', kind: 'option', title: 'On which set or run?',
      from: [{ v: 0, label: '7s' }, { v: 1, label: 'Clubs jack to king' }, { v: 2, label: 'aces' }, { v: 3, label: '10s' }, { v: 4, label: 'Hearts 3 to 6' }] } });
  assert.equal(RM.status(s), 'Draw a card, or take the top of the pile.');
  assert.equal(RM.status(d), 'Lay down sets and runs, then discard.');
  assert.equal(RM.status(yes(RM, laid({ 'hand:0': ['9C'], 'hand:1': ['5D'] }), 0, { type: 'discard', cards: ['9C'] }).state), 'Game over.');
  assert.deepEqual(T.hints(RM, laid({ 'hand:0': ['9C', '2C'], 'hand:1': ['5D'] }), 1), null);
});

// ---------- Whole games by chance, held against the privacy rule ----------
// Written apart from the engine. What is secret from whom, and what lies open for all.
const SPEC = {
  secret: (s, v) => { const out = [...s.zones.draw, ...s.zones.discard.slice(0, -1)]; for (let q = 0; q < s.n; q++) if (q !== v) out.push(...s.zones['hand:' + q]); return out; },
  open: (s) => [...s.zones.discard.slice(-1), ...s.zones.melds],
  faceUp: ['melds', 'discard'],
  // My own way to choose: draw from the pack most of the time; then lay down a set or run if the hand holds one, else lay
  // off a card that fits, else throw a card that is allowed.
  pick(game, s, p, h, rand) {
    if (h.buttons.length) {
      const draw = h.buttons.find((b) => b.type === 'draw'), take = h.buttons.find((b) => b.type === 'take');
      return draw && (!take || rand() < 0.85) ? { type: 'draw' } : { type: 'take' };
    }
    const mine = s.zones['hand:' + p];
    const byRank = {}, bySuit = {};
    for (const c of mine) { (byRank[C.rankOf(c)] = byRank[C.rankOf(c)] || []).push(c); (bySuit[C.suitOf(c)] = bySuit[C.suitOf(c)] || []).push(c); }
    for (const r of Object.keys(byRank)) if (byRank[r].length >= 3) return { type: 'meld', cards: byRank[r] };
    for (const suit of Object.keys(bySuit)) {
      const ranks = bySuit[suit].slice().sort((a, b) => C.ACE_LOW.indexOf(C.rankOf(a)) - C.ACE_LOW.indexOf(C.rankOf(b)));
      let run = [];
      for (const c of ranks) {
        if (run.length && C.ACE_LOW.indexOf(C.rankOf(c)) !== C.ACE_LOW.indexOf(C.rankOf(run[run.length - 1])) + 1) { if (run.length >= 3) break; run = []; }
        run.push(c);
      }
      if (run.length >= 3) return { type: 'meld', cards: run };
    }
    let at = 0;
    for (let k = 0; k < s.pub.cuts.melds.length; k++) {
      const g = s.zones.melds.slice(at, at + s.pub.cuts.melds[k]); at += s.pub.cuts.melds[k];
      const idx = (c) => C.ACE_LOW.indexOf(C.rankOf(c));
      const isSet = C.rankOf(g[0]) === C.rankOf(g[1]);
      for (const c of mine) {
        const fits = isSet ? C.rankOf(c) === C.rankOf(g[0]) && g.length < 4
          : C.suitOf(c) === C.suitOf(g[0]) && (idx(c) === idx(g[0]) - 1 || idx(c) === idx(g[g.length - 1]) + 1);
        if (fits) return { type: 'layoff', cards: [c], on: k };
      }
    }
    const allowed = h.play.cards;
    return { type: 'discard', cards: [allowed[Math.floor(rand() * allowed.length)]] };
  },
};

test('Rummy: 40 whole games by chance, 2 to 6 players: no screen is ever given a hidden card, and every game ends', () => {
  for (const n of [2, 3, 4, 5, 6]) {
    for (let seed = 1; seed <= 8; seed++) {
      const end = playOut(RM, n, seed * 100 + n, {}, SPEC);
      assert.ok(end.over.winners.length >= 1);
      assert.equal(end.over.left.length, n);
      assert.equal(end.pub.cuts.melds.reduce((a, b) => a + b, 0), end.zones.melds.length);
      const out = end.over.winners.length === 1 && end.over.left[end.over.winners[0]] === 0 && end.zones['hand:' + end.over.winners[0]].length === 0;
      if (!out) for (const w of end.over.winners) assert.equal(end.over.left[w], Math.min(...end.over.left));
    }
  }
});
