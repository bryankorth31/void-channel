// The card blocks (cards/src/cards.js): the pack, the shuffle, and a hand kept in its player's own order.
// Run: node --test "cards/test/*.test.js"
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/cards.js');

test('the standard pack is 52 different cards; jokers, more packs and left-out cards are options', () => {
  const pack = C.standard();
  assert.equal(pack.length, 52);
  assert.equal(new Set(pack).size, 52);
  assert.ok(pack.includes('QS') && pack.includes('TH') && pack.includes('AC'));
  assert.equal(C.standard({ jokers: 2 }).length, 54);
  const two = C.standard({ packs: 2, jokers: 1 });
  assert.equal(two.length, 106);
  assert.equal(new Set(two).size, 106, 'the second pack has names of its own');
  assert.ok(two.includes('QS') && two.includes('QS#2') && two.includes('X1#2'));
  const three = C.standard({ without: ['2D'] });
  assert.equal(three.length, 51);
  assert.ok(!three.includes('2D'));
});

test('a card says its rank, suit, colour and name', () => {
  assert.equal(C.rankOf('QS'), 'Q'); assert.equal(C.suitOf('QS'), 'S');
  assert.equal(C.suitOf('TH#2'), 'H');
  assert.equal(C.isRed('TH'), true); assert.equal(C.isRed('QS'), false);
  assert.equal(C.name('QS'), 'queen of spades');
  assert.equal(C.name('TH'), '10 of hearts');
  assert.equal(C.name('X1'), 'joker');
  assert.equal(C.suitOf('X1'), '');
  assert.equal(C.name('prompt-12'), 'prompt-12', 'a party card is named by its own id');
});

test('a shuffle keeps every card, and the same seed deals the same game', () => {
  const pack = C.standard();
  const a = C.shuffle(pack, C.seeded(7)), b = C.shuffle(pack, C.seeded(7)), c = C.shuffle(pack, C.seeded(8));
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.notDeepEqual(a, pack);
  assert.deepEqual(a.slice().sort(), pack.slice().sort());
  assert.deepEqual(pack, C.standard(), 'the pack given is left as it was');
  assert.equal(C.shuffle(pack).length, 52, 'with no seed it uses the strong random');
});

test('the hand keeps its player\'s own order: gone cards drop out, new cards go on the end', () => {
  const mine = ['KH', '3S', '9S', '2D'];
  assert.deepEqual(C.arrange(mine, ['2D', '3S', '9S', 'KH']), mine, 'the same cards dealt again keep my order');
  assert.deepEqual(C.arrange(mine, ['2D', '9S', 'KH']), ['KH', '9S', '2D'], 'a played card drops out');
  assert.deepEqual(C.arrange(mine, ['2D', '3S', '9S', 'KH', '7C', 'AS']), ['KH', '3S', '9S', '2D', '7C', 'AS'], 'drawn cards go on the end');
  assert.deepEqual(C.arrange(null, ['2D', '3S']), ['2D', '3S']);
  assert.deepEqual(C.arrange(['3S', '3S', 'ZZ'], ['3S']), ['3S'], 'a saved order with rubbish in it does no harm');
});

test('one card can be dragged to any spot', () => {
  const h = ['3S', 'KH', '9S', '2D'];
  assert.deepEqual(C.place(h, '9S', 1), ['3S', '9S', 'KH', '2D'], 'the spade moved next to the spade');
  assert.deepEqual(C.place(h, '3S', 3), ['KH', '9S', '2D', '3S']);
  assert.deepEqual(C.place(h, '2D', 0), ['2D', '3S', 'KH', '9S']);
  assert.deepEqual(C.place(h, 'KH', 99), ['3S', '9S', '2D', 'KH'], 'past the end is the end');
  assert.deepEqual(C.place(h, 'KH', -5), ['KH', '3S', '9S', '2D']);
  assert.deepEqual(C.place(h, 'QQ', 1), h, 'a card not in the hand moves nothing');
  assert.deepEqual(C.place(h, 'KH', NaN), h);
  assert.deepEqual(h, ['3S', 'KH', '9S', '2D'], 'the hand given is left as it was');
});

test('Group suits: spades by spades, then hearts, in the order the player already holds the suits', () => {
  const h = ['3S', 'KH', '9S', '2H', '7C', 'AS'];
  assert.deepEqual(C.bySuit(h), ['3S', '9S', 'AS', '2H', 'KH', '7C'], 'spades first because a spade is first; ace high');
  assert.deepEqual(C.bySuit(['KH', '3S', '9S', '2H']), ['2H', 'KH', '3S', '9S'], 'hearts first when a heart is first');
  assert.deepEqual(C.bySuit(h, { ranks: C.ACE_LOW }), ['AS', '3S', '9S', '2H', 'KH', '7C'], 'a game may count the ace low');
  assert.deepEqual(C.bySuit(h, { suits: ['C', 'H', 'S', 'D'] }), ['7C', '2H', 'KH', '3S', '9S', 'AS'], 'or name the order of suits');
  assert.deepEqual(C.bySuit(['X1', '3S', 'KH']), ['3S', 'KH', 'X1'], 'a joker goes to the end');
});

test('By number: low to high, the same number side by side', () => {
  assert.deepEqual(C.byRank(['KH', '3S', '9S', '3H', 'AS', '9D']), ['3H', '3S', '9S', '9D', 'KH', 'AS']);
  assert.deepEqual(C.byRank(['KH', 'AS', '2D'], { ranks: C.ACE_LOW }), ['AS', '2D', 'KH']);
});
