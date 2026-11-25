// Conquian, as a rule file (cards/games/conquian.js): each rule on a table set by hand, and then whole games played by
// chance with every view and every event held against the privacy rule.
// Run: node --test cards/test/conquian.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/cards.js');
const T = require('../src/table.js');
const Q = require('../games/conquian.js');
const { rig, yes, no, playOut } = require('./helper.js');

// A table in the middle of a turn. zones: what the table holds; pub: step and the rest; cuts of each laid zone.
function tab(zones, pub, turn) {
  const z = Object.assign({ 'hand:0': [], 'hand:1': [], offer: [], 'laid:0': [], 'laid:1': [] }, zones);
  const cuts = { 'laid:0': [], 'laid:1': [] };
  return rig(Q, 2, z, { pub: Object.assign({ step: 'choose', from: 'pack', passes: 0, cuts }, pub), turn: turn === undefined ? 0 : turn });
}
// The laid zone and its cuts must agree: every cut is a whole set or run, and the cuts add up to the zone.
function agree(s) {
  for (const p of [0, 1]) {
    const z = s.zones['laid:' + p], cuts = s.pub.cuts['laid:' + p];
    assert.equal(cuts.reduce((a, b) => a + b, 0), z.length, 'the cuts cover the laid zone');
    let i = 0;
    for (const k of cuts) {
      const g = z.slice(i, i + k);
      assert.ok(k >= 3, 'a group has 3 cards or more');
      const set = g.every((c) => C.rankOf(c) === C.rankOf(g[0])), run = g.every((c) => C.suitOf(c) === C.suitOf(g[0]));
      assert.ok(set || run, 'a group is a set or a run: ' + g);
      i += k;
    }
  }
}
const use = (cards, on) => ({ type: 'use', cards, on });

// ---------- The pack and the deal ----------
test('Conquian: the pack is 40 cards without 8s, 9s and 10s; 10 each, 20 in the pack, and the right player turns first', () => {
  assert.deepEqual(Q.players, { min: 2, max: 2 });
  for (let seed = 1; seed <= 10; seed++) {
    const s = T.create(Q, { players: 2, rand: C.seeded(seed) }).state;
    assert.equal(s.pack.length, 40);
    assert.equal(new Set(s.pack).size, 40);
    assert.ok(s.pack.every((c) => !'89T'.includes(C.rankOf(c))), 'no 8, 9 or 10');
    assert.equal(s.zones['hand:0'].length, 10);
    assert.equal(s.zones['hand:1'].length, 10);
    assert.equal(s.zones.draw.length, 20);
    assert.equal(s.zones.offer.length + s.zones.waste.length + s.zones['laid:0'].length + s.zones['laid:1'].length, 0);
    assert.deepEqual(s.turn, [0]);
    assert.equal(s.pub.step, 'turn');
    assert.deepEqual(s.pub.cuts, { 'laid:0': [], 'laid:1': [] });
  }
  assert.deepEqual(T.create(Q, { players: 2, opts: { first: 1 }, rand: C.seeded(2) }).state.turn, [1]);
  assert.throws(() => T.create(Q, { players: 3 }), /2 to 2 players/);
});

// ---------- Turning a card ----------
test('Conquian: turning a card puts it face up on offer and the turner has the first say', () => {
  const s = tab({ 'hand:0': ['7S'], draw: ['2S', 'KD'] }, { step: 'turn', from: null }, 0);
  const r = yes(Q, s, 0, { type: 'turn' });
  assert.deepEqual(r.state.zones.offer, ['KD'], 'the top card of the pack');
  assert.equal(r.state.pub.step, 'choose');
  assert.equal(r.state.pub.from, 'pack');
  assert.equal(r.state.pub.passes, 0);
  assert.deepEqual(r.state.turn, [0]);
  assert.equal(r.events[0].cards[0], 'KD', 'everyone sees the card turned');
  assert.equal(T.view(Q, r.state, null).zones.offer.cards[0], 'KD');
  no(Q, s, 1, { type: 'turn' }, /not your turn/);
});

test('Conquian: nothing can be used or passed before a card is turned', () => {
  const s = tab({ 'hand:0': ['7S', '7H'] }, { step: 'turn', from: null }, 0);
  no(Q, s, 0, use([], 'new'), /Turn a card first/);
  no(Q, s, 0, use(['7S', '7H'], 'new'), /Turn a card first/);
  no(Q, s, 0, { type: 'pass' }, /Turn a card first/);
  no(Q, s, 0, { type: 'discard', cards: ['7S'] }, /Turn a card first/);
  const c = tab({ 'hand:0': ['7S'], offer: ['7H'] }, {}, 0);
  no(Q, c, 0, { type: 'turn' }, /Use the card on offer or pass first/);
});

// ---------- Passing ----------
test('Conquian: a card from the pack passed once goes to the other player; passed twice it goes to waste and the second passer turns', () => {
  const s = tab({ 'hand:0': ['2S'], 'hand:1': ['3S'], offer: ['KD'], waste: ['AC'] }, { from: 'pack' }, 0);
  const a = yes(Q, s, 0, { type: 'pass' });
  assert.deepEqual(a.state.turn, [1]);
  assert.equal(a.state.pub.step, 'choose');
  assert.equal(a.state.pub.passes, 1);
  assert.deepEqual(a.state.zones.offer, ['KD'], 'the card stays on offer');
  no(Q, a.state, 0, { type: 'pass' }, /not your turn/);
  const b = yes(Q, a.state, 1, { type: 'pass' });
  assert.deepEqual(b.state.zones.offer, []);
  assert.deepEqual(b.state.zones.waste, ['AC', 'KD'], 'the card goes on the waste pile');
  assert.equal(b.state.pub.step, 'turn');
  assert.deepEqual(b.state.turn, [1], 'the second passer turns the next card');
  assert.equal(b.state.over, null);
  // The waste shows only its top card.
  assert.equal(T.view(Q, b.state, null).zones.waste.top, 'KD');
  assert.equal(T.view(Q, b.state, null).zones.waste.cards, undefined);
});

test('Conquian: a discarded card passed once goes to waste and the passer turns the next', () => {
  const s = tab({ 'hand:0': ['2S'], 'hand:1': ['3S'], offer: ['KD'] }, { from: 'discard' }, 1);
  const r = yes(Q, s, 1, { type: 'pass' });
  assert.deepEqual(r.state.zones.waste, ['KD']);
  assert.deepEqual(r.state.zones.offer, []);
  assert.equal(r.state.pub.step, 'turn');
  assert.deepEqual(r.state.turn, [1]);
});

// ---------- Using a card ----------
test('Conquian: a new set takes the card on offer and 2 cards from the hand', () => {
  const s = tab({ 'hand:0': ['7S', '7H', '2D', '4C'], offer: ['7D'] });
  const r = yes(Q, s, 0, use(['7S', '7H'], 'new'));
  assert.deepEqual(r.state.zones['laid:0'], ['7D', '7S', '7H']);
  assert.deepEqual(r.state.pub.cuts['laid:0'], [3]);
  assert.deepEqual(r.state.zones['hand:0'], ['2D', '4C']);
  assert.deepEqual(r.state.zones.offer, []);
  assert.equal(r.state.pub.step, 'discard');
  assert.deepEqual(r.state.turn, [0]);
  agree(r.state);
  // Four of a rank is a set too.
  const f = yes(Q, tab({ 'hand:0': ['7S', '7H', '7C', '2D'], offer: ['7D'] }), 0, use(['7S', '7H', '7C'], 'new'));
  assert.deepEqual(f.state.pub.cuts['laid:0'], [4]);
  agree(f.state);
});

test('Conquian: a new run takes the card on offer and 2 cards from the hand, kept low to high', () => {
  const s = tab({ 'hand:0': ['6H', '5H', '2D'], offer: ['7H'] });
  const r = yes(Q, s, 0, use(['6H', '5H'], 'new'));
  assert.deepEqual(r.state.zones['laid:0'], ['5H', '6H', '7H']);
  assert.deepEqual(r.state.pub.cuts['laid:0'], [3]);
  agree(r.state);
  const down = yes(Q, tab({ 'hand:0': ['2H', '3H'], offer: ['AH'] }), 0, use(['3H', '2H'], 'new'));
  assert.deepEqual(down.state.zones['laid:0'], ['AH', '2H', '3H'], 'the ace is low');
});

test('Conquian: a run goes across the 7 and the jack, and the king then the ace is not a run', () => {
  const s = tab({ 'hand:0': ['6H', 'JH', 'QH', 'AH', '2H', 'KH', 'QD'], offer: ['7H'] });
  const r = yes(Q, s, 0, use(['JH', '6H'], 'new'));
  assert.deepEqual(r.state.zones['laid:0'], ['6H', '7H', 'JH']);
  const long = yes(Q, s, 0, use(['JH', '6H', 'QH'], 'new'));
  assert.deepEqual(long.state.zones['laid:0'], ['6H', '7H', 'JH', 'QH']);
  const k = tab({ 'hand:0': ['QH', 'AH', '2H', 'KH'], offer: ['JH'] });
  assert.deepEqual(yes(Q, k, 0, use(['KH', 'QH'], 'new')).state.zones['laid:0'], ['JH', 'QH', 'KH'], 'jack queen king');
  const wrap = tab({ 'hand:0': ['QH', 'AH', '2H'], offer: ['KH'] });
  no(Q, wrap, 0, use(['QH', 'AH'], 'new'), /not a set or a run/);
  const wrap2 = tab({ 'hand:0': ['2H', 'KH'], offer: ['AH'] });
  no(Q, wrap2, 0, use(['KH', '2H'], 'new'), /not a set or a run/);
  no(Q, tab({ 'hand:0': ['KH', 'QH'], offer: ['AH'] }), 0, use(['KH', 'QH'], 'new'), /not a set or a run/);
  // No gap: 6 7 Q is not a run.
  no(Q, tab({ 'hand:0': ['6H', 'QH'], offer: ['7H'] }), 0, use(['6H', 'QH'], 'new'), /not a set or a run/);
});

test('Conquian: a run of two suits, a set of mixed ranks and a group of only 2 are refused', () => {
  no(Q, tab({ 'hand:0': ['6D', '5H'], offer: ['7H'] }), 0, use(['6D', '5H'], 'new'), /not a set or a run/);
  no(Q, tab({ 'hand:0': ['7S', '6C'], offer: ['7H'] }), 0, use(['7S', '6C'], 'new'), /not a set or a run/);
  no(Q, tab({ 'hand:0': ['2D', '4C'], offer: ['7D'] }), 0, use(['2D', '4C'], 'new'), /not a set or a run/);
});

test('Conquian: a new group needs the card on offer and at least 2 cards from the hand', () => {
  const s = tab({ 'hand:0': ['7S', '7H'], offer: ['7D'] });
  no(Q, s, 0, use(['7S'], 'new'), /at least 2 cards/);
  no(Q, s, 0, use([], 'new'), /at least 2 cards/);
  no(Q, s, 0, use(['7S', '2D'], 'new'), /do not hold/);
});

test('Conquian: the card on offer joins one of your own groups with no cards from the hand, or with some', () => {
  const set = tab({ 'hand:0': ['2D'], offer: ['7C'], 'laid:0': ['7D', '7S', '7H'] }, { cuts: { 'laid:0': [3], 'laid:1': [] } });
  const a = yes(Q, set, 0, use([], 0));
  assert.deepEqual(a.state.zones['laid:0'], ['7D', '7S', '7H', '7C']);
  assert.deepEqual(a.state.pub.cuts['laid:0'], [4]);
  assert.deepEqual(a.state.zones['hand:0'], ['2D'], 'no card of the hand was used');
  assert.equal(a.state.pub.step, 'discard');
  agree(a.state);
  // A set holds 4 at most and one rank only.
  no(Q, tab({ 'hand:0': ['2D'], offer: ['KC'], 'laid:0': ['7D', '7S', '7H', '7C'] }, { cuts: { 'laid:0': [4], 'laid:1': [] } }), 0, use([], 0), /do not fit/);
  no(Q, set, 0, use(['2D'], 0), /do not fit/);
  // A run grows at either end, with cards from the hand.
  const run = tab({ 'hand:0': ['3H', 'QD', 'JH', '2H'], offer: ['4H'], 'laid:0': ['5H', '6H', '7H'] }, { cuts: { 'laid:0': [3], 'laid:1': [] } });
  const b = yes(Q, run, 0, use(['3H'], 0));
  assert.deepEqual(b.state.zones['laid:0'], ['3H', '4H', '5H', '6H', '7H']);
  assert.deepEqual(b.state.pub.cuts['laid:0'], [5]);
  assert.deepEqual(b.state.zones['hand:0'], ['QD', 'JH', '2H']);
  agree(b.state);
  const j = yes(Q, tab({ 'hand:0': ['QH'], offer: ['JH'], 'laid:0': ['5H', '6H', '7H'] }, { cuts: { 'laid:0': [3], 'laid:1': [] } }), 0, use(['QH'], 0));
  assert.deepEqual(j.state.zones['laid:0'], ['5H', '6H', '7H', 'JH', 'QH']);
  no(Q, run, 0, use(['QD'], 0), /do not fit/);
  no(Q, run, 0, use(['2H'], 0), /do not fit/);
});

test('Conquian: adding to a group in the middle of the laid zone keeps every group together', () => {
  const s = tab({ 'hand:0': ['2D'], offer: ['7C'], 'laid:0': ['7D', '7S', '7H', '3C', '4C', '5C'] }, { cuts: { 'laid:0': [3, 3], 'laid:1': [] } });
  const a = yes(Q, s, 0, use([], 0));
  assert.deepEqual(a.state.zones['laid:0'], ['7D', '7S', '7H', '7C', '3C', '4C', '5C']);
  assert.deepEqual(a.state.pub.cuts['laid:0'], [4, 3]);
  agree(a.state);
  const t = tab({ 'hand:0': ['6C'], offer: ['2C'], 'laid:0': ['7D', '7S', '7H', '3C', '4C', '5C'] }, { cuts: { 'laid:0': [3, 3], 'laid:1': [] } });
  assert.equal(yes(Q, t, 0, use([], 1)).state.zones['laid:0'].length, 7);
  const b = tab({ 'hand:0': ['6C', '2D'], offer: ['7C'], 'laid:0': ['7D', '7S', '7H', '3C', '4C', '5C'] }, { cuts: { 'laid:0': [3, 3], 'laid:1': [] } });
  const r = yes(Q, b, 0, use(['6C'], 1));
  assert.deepEqual(r.state.zones['laid:0'], ['7D', '7S', '7H', '3C', '4C', '5C', '6C', '7C']);
  assert.deepEqual(r.state.pub.cuts['laid:0'], [3, 5]);
  agree(r.state);
  // A new group goes after the others.
  const n = tab({ 'hand:0': ['JS', 'QS'], offer: ['KS'], 'laid:0': ['7D', '7S', '7H'] }, { cuts: { 'laid:0': [3], 'laid:1': [] } });
  const m = yes(Q, n, 0, use(['JS', 'QS'], 'new'));
  assert.deepEqual(m.state.zones['laid:0'], ['7D', '7S', '7H', 'JS', 'QS', 'KS']);
  assert.deepEqual(m.state.pub.cuts['laid:0'], [3, 3]);
  agree(m.state);
});

test('Conquian: you cannot add to the other player\'s group, and a wrong group number is refused', () => {
  const s = tab({ 'hand:0': ['2D'], offer: ['7C'], 'laid:1': ['7D', '7S', '7H'] }, { cuts: { 'laid:0': [], 'laid:1': [3] } });
  no(Q, s, 0, use([], 0), /no such set or run/);
  no(Q, s, 0, use([], 1), /no such set or run/);
  const own = tab({ 'hand:0': ['2D'], offer: ['7C'], 'laid:0': ['7D', '7S', '7H'] }, { cuts: { 'laid:0': [3], 'laid:1': [] } });
  no(Q, own, 0, use([], 1), /no such set or run/);
  no(Q, own, 0, use([], -1), /no such set or run/);
  no(Q, own, 0, use([], 1.5), /Say where/);
  no(Q, own, 0, use([], '0'), /Say where/);
  no(Q, own, 0, { type: 'use', cards: [] }, /Say where/);
  assert.ok(yes(Q, own, 0, use([], 0)));
});

// ---------- Discarding ----------
test('Conquian: after a use the same player must discard, and the discard goes on offer to the other player', () => {
  const s = tab({ 'hand:0': ['7S', '7H', '2D', '4C'], 'hand:1': ['KS'], offer: ['7D'] });
  const a = yes(Q, s, 0, use(['7S', '7H'], 'new')).state;
  no(Q, a, 0, { type: 'turn' }, /Discard a card first/);
  no(Q, a, 0, { type: 'pass' }, /Discard a card first/);
  no(Q, a, 0, use([], 'new'), /Discard a card first/);
  no(Q, a, 1, { type: 'discard', cards: ['KS'] }, /not your turn/);
  no(Q, a, 0, { type: 'discard', cards: ['2D', '4C'] }, /Pick 1 card/);
  no(Q, a, 0, { type: 'discard', cards: ['KS'] }, /do not hold/);
  const r = yes(Q, a, 0, { type: 'discard', cards: ['4C'] });
  assert.deepEqual(r.state.zones.offer, ['4C']);
  assert.deepEqual(r.state.zones['hand:0'], ['2D']);
  assert.equal(r.state.pub.step, 'choose');
  assert.equal(r.state.pub.from, 'discard');
  assert.equal(r.state.pub.passes, 0);
  assert.deepEqual(r.state.turn, [1]);
  assert.equal(r.events[0].cards[0], '4C', 'everyone sees the discard');
});

// ---------- Winning ----------
test('Conquian: the player whose hand is empty after a use wins', () => {
  const s = tab({ 'hand:0': ['7S', '7H'], 'hand:1': ['KS'], offer: ['7D'] });
  const r = yes(Q, s, 0, use(['7S', '7H'], 'new'));
  assert.deepEqual(r.state.over, { winners: [0] });
  assert.deepEqual(r.state.turn, []);
  assert.equal(Q.status(r.state), 'Game over.');
  const bare = tab({ 'hand:0': [], 'hand:1': ['KS'], offer: ['4H'], 'laid:0': ['5H', '6H', '7H'] }, { from: 'discard', cuts: { 'laid:0': [3], 'laid:1': [] } });
  assert.deepEqual(yes(Q, bare, 0, use([], 0)).state.over, { winners: [0] });
  // A use that leaves cards in the hand does not win.
  const more = tab({ 'hand:0': ['7S', '7H', '2D'], 'hand:1': ['KS'], offer: ['7D'] });
  assert.equal(yes(Q, more, 0, use(['7S', '7H'], 'new')).state.over, null);
});

test('Conquian: a hand emptied by a discard plays on, and wins by a later bare use', () => {
  const s = tab({ 'hand:0': ['2D'], 'hand:1': ['KS', 'KD'], 'laid:0': ['5H', '6H', '7H'] }, { step: 'discard', from: null, cuts: { 'laid:0': [3], 'laid:1': [] } });
  const d = yes(Q, s, 0, { type: 'discard', cards: ['2D'] });
  assert.equal(d.state.over, null, 'no win by a discard');
  assert.deepEqual(d.state.zones['hand:0'], []);
  assert.deepEqual(d.state.turn, [1]);
  // The other player passes; the card goes to waste and they turn the next one.
  const p = yes(Q, d.state, 1, { type: 'pass' });
  assert.deepEqual(p.state.zones.waste, ['2D']);
  assert.deepEqual(p.state.turn, [1]);
  // Later a card on offer fits the empty-handed player's run: a bare use wins.
  const later = tab({ 'hand:0': [], 'hand:1': ['KS'], offer: ['4H'], 'laid:0': ['5H', '6H', '7H'] }, { cuts: { 'laid:0': [3], 'laid:1': [] } });
  no(Q, later, 0, use([], 'new'), /at least 2 cards/);
  assert.deepEqual(yes(Q, later, 0, use([], 0)).state.over, { winners: [0] });
});

// ---------- The pack runs out ----------
test('Conquian: when the pack is empty and a card must be turned, the deal ends with no winner', () => {
  const s = rig(Q, 2, { 'hand:0': ['7S'], 'hand:1': ['7H'] }, { only: true, turn: 0, pub: { step: 'turn', from: null } });
  assert.equal(s.zones.draw.length, 0);
  const r = yes(Q, s, 0, { type: 'turn' });
  assert.deepEqual(r.state.over, { winners: [], note: 'The pack ran out. Nobody wins this one.' });
  assert.deepEqual(r.state.turn, []);
  no(Q, r.state, 0, { type: 'turn' }, /over/);
});

// ---------- What a phone is told ----------
test('Conquian: hints and status at each step', () => {
  const t = tab({ 'hand:0': ['7S', '2D'], 'hand:1': ['3C'] }, { step: 'turn', from: null }, 0);
  assert.deepEqual(T.hints(Q, t, 0), { play: null, buttons: [{ type: 'turn', label: 'Turn a card' }] });
  assert.equal(T.hints(Q, t, 1), null, 'only the player to act is told');
  assert.equal(Q.status(t), 'Turn a card.');

  const laid = ['5H', '6H', '7H', 'JH', 'JS', 'JD', 'JC', 'AS', 'AH', 'AD', '7S', '7D', '7C'];
  const c = tab({ 'hand:0': ['2D', '3C'], offer: ['KH'], 'laid:0': laid }, { cuts: { 'laid:0': [4, 3, 3, 3], 'laid:1': [] } });
  const h = T.hints(Q, c, 0);
  assert.deepEqual(h.buttons, [{ type: 'pass', label: 'Pass' }]);
  assert.equal(h.play.type, 'use');
  assert.equal(h.play.label, 'Use the card');
  assert.deepEqual(h.play.cards, ['2D', '3C']);
  // The fewest cards from the hand that could use the card on offer (voidverse function test F34, 24 Nov 2026): the king of hearts
  // fits none of these sets or runs alone (the hearts run stops at the jack), nor with one card of 2D, 3C, so two (a new set or run).
  assert.equal(h.play.min, 2);
  const queen = tab({ 'hand:0': ['2D', '3C'], offer: ['QH'], 'laid:0': laid }, { cuts: { 'laid:0': [4, 3, 3, 3], 'laid:1': [] } });
  assert.equal(T.hints(Q, queen, 0).play.min, 0, 'the queen of hearts goes on the hearts run by itself');
  const king = tab({ 'hand:0': ['QH', '3C'], offer: ['KH'], 'laid:0': laid }, { cuts: { 'laid:0': [4, 3, 3, 3], 'laid:1': [] } });
  assert.equal(T.hints(Q, king, 0).play.min, 1, 'the king fits the run with the queen from the hand');
  assert.equal(h.play.max, 10);
  assert.equal(h.play.choose.cards, null);
  assert.equal(h.play.choose.field, 'on');
  assert.equal(h.play.choose.kind, 'option');
  assert.equal(h.play.choose.title, 'Use it where?');
  assert.deepEqual(h.play.choose.from, [{ v: 'new', label: 'A new set or run' }, { v: 0, label: 'Hearts 5 to jack' },
    { v: 1, label: 'jacks' }, { v: 2, label: 'aces' }, { v: 3, label: '7s' }]);
  assert.equal(Q.status(c), 'Use the king of hearts, or pass.');
  assert.deepEqual(T.hints(Q, tab({ 'hand:0': ['2D'], offer: ['KH'] }), 0).play.choose.from, [{ v: 'new', label: 'A new set or run' }]);

  const d = tab({ 'hand:0': ['2D', '3C', 'KS'] }, { step: 'discard', from: null }, 0);
  assert.deepEqual(T.hints(Q, d, 0), { play: { type: 'discard', label: 'Discard', cards: ['2D', '3C', 'KS'], min: 1, max: 1, choose: null }, buttons: [] });
  assert.equal(Q.status(d), 'Discard a card.');
  assert.equal(Q.status(Object.assign({}, d, { over: {} })), 'Game over.');
  assert.deepEqual(Q.labels, { laid: 'Sets and runs' });
  // A card id is never in s.pub.
  const text = JSON.stringify(c.pub);
  for (const id of c.pack) assert.ok(!text.includes('"' + id + '"'));
});

// ---------- Whole games by chance ----------
// Written apart from the engine: what each viewer may not see, what lies face up for all, and a player of its own that
// looks for a use of the card on offer and passes when there is none.
const spec = {
  secret(s, viewer) {
    const waste = s.zones.waste.slice(0, -1);
    const hands = viewer === null ? s.zones['hand:0'].concat(s.zones['hand:1']) : s.zones['hand:' + (1 - viewer)];
    return s.zones.draw.concat(waste, hands);
  },
  open(s) {
    return s.zones.offer.concat(s.zones.waste.slice(-1), s.zones['laid:0'], s.zones['laid:1']);
  },
  faceUp: ['offer', 'laid:0', 'laid:1'],
  pick(game, s, p, hints, rand) {
    const pickOne = (list) => list[Math.floor(rand() * list.length)];
    if (s.pub.step === 'turn') return { type: 'turn' };
    const mine = s.zones['hand:' + p];
    if (s.pub.step === 'discard') return { type: 'discard', cards: [pickOne(mine)] };
    const offer = s.zones.offer[0], rankAt = 'A234567JQK';
    // Is this a set or a run? Judged here by ranks as positions in the run order.
    const ok = (cs) => {
      if (cs.length < 3) return false;
      const pos = cs.map((c) => rankAt.indexOf(c[0])).sort((a, b) => a - b);
      if (cs.every((c) => c[0] === cs[0][0])) return cs.length <= 4;
      return cs.every((c) => c[1] === cs[0][1]) && pos.every((x, i) => i === 0 || x === pos[i - 1] + 1);
    };
    const subsets = (list, k) => {
      if (k === 0) return [[]];
      const out = [];
      list.forEach((x, i) => { for (const rest of subsets(list.slice(i + 1), k - 1)) out.push([x].concat(rest)); });
      return out;
    };
    const options = [];
    const cuts = s.pub.cuts['laid:' + p];
    let at = 0;
    cuts.forEach((k, gi) => {
      const g = s.zones['laid:' + p].slice(at, at + k);
      at += k;
      for (let n = 0; n <= 3; n++) for (const cs of subsets(mine, n)) if (ok(g.concat([offer], cs))) options.push({ type: 'use', cards: cs, on: gi });
    });
    for (let n = 2; n <= 3; n++) for (const cs of subsets(mine, n)) if (ok([offer].concat(cs))) options.push({ type: 'use', cards: cs, on: 'new' });
    if (!options.length) return { type: 'pass' };
    // Lay as much as possible, so that some games are won.
    const most = Math.max(...options.map((o) => o.cards.length));
    return pickOne(options.filter((o) => o.cards.length === most));
  },
};

test('Conquian: whole games by chance end, with nothing private shown to a screen that may not see it', () => {
  let won = 0, ran = 0;
  for (let seed = 1; seed <= 16; seed++) {
    const end = playOut(Q, 2, seed, {}, spec);
    assert.ok(end.over, 'the game ended');
    agree(end);
    if (end.over.winners.length === 1) {
      won++;
      assert.equal(end.zones['hand:' + end.over.winners[0]].length, 0, 'the winner laid every card');
    } else {
      ran++;
      assert.deepEqual(end.over, { winners: [], note: 'The pack ran out. Nobody wins this one.' });
      assert.equal(end.zones.draw.length, 0);
    }
  }
  assert.ok(won >= 1, 'at least one game was won: ' + won + ' won, ' + ran + ' ran out');
});
