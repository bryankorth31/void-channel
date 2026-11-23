// A card's face (cards/src/face.js): what each card shows, as plain data. The drawing itself is checked in a browser.
// Run: node --test "cards/test/*.test.js"
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../src/face.js');

test('a card shows its rank and suit, red for hearts and diamonds, and 10 for the ten', () => {
  assert.deepEqual(F.parts('QH'), { kind: 'suit', rank: 'Q', suit: 'H', glyph: '♥︎', red: true, label: 'queen of hearts' });
  assert.equal(F.parts('TS').rank, '10');
  assert.equal(F.parts('TS').red, false);
  assert.equal(F.parts('AD#2').label, 'ace of diamonds', 'a second pack\'s card looks the same');
  for (const s of 'SHDC') assert.ok(F.GLYPH[s].endsWith('︎'), 'the suit mark is text, never a phone\'s coloured emoji');
});

test('a joker and a party card have faces of their own', () => {
  assert.equal(F.parts('X1').kind, 'joker');
  assert.deepEqual(F.parts('prompt-12'), { kind: 'other', rank: '', suit: '', glyph: '', red: false, label: 'prompt-12' });
});
