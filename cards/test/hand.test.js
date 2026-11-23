// The phone's hand page (cards/src/hand.js): its pure parts. The page itself is checked by eye on a phone.
// Run: node --test cards/test/hand.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../src/hand.js');

const inside = (lay, count, w, h) => {
  for (let i = 0; i < count; i++) {
    const p = H.slot(lay, i);
    assert.ok(p.x >= -0.01 && p.y >= -0.01, 'card ' + i + ' starts inside');
    assert.ok(p.x + lay.cardW <= w + 0.01 && p.y + lay.cardH <= h + 0.01, 'card ' + i + ' ends inside (' + count + ' in ' + w + 'x' + h + ')');
  }
};

test('layout: 4 columns for 7 cards, more as the hand grows, and every card stays inside', () => {
  const a = H.layout(7, 375, 480, 6);
  assert.equal(a.cols, 4); assert.equal(a.rows, 2);
  assert.ok(H.layout(30, 375, 480, 6).cols > 4);
  assert.equal(H.layout(51, 375, 480, 6).cols, 8);
  for (const [w, h] of [[375, 480], [320, 380], [800, 250], [390, 600], [700, 300]]) {
    for (const n of [0, 1, 5, 7, 13, 20, 30, 40, 51, 108]) {
      const lay = H.layout(n, w, h, 6);
      inside(lay, n, w, h);
      assert.ok(lay.cols >= 4 && lay.cols <= 8);
      assert.ok(lay.cardH <= lay.cardW * 1.4 + 0.001, 'a card is never taller than 1.4 times its width');
    }
  }
});

test('layout: the grid is centred and the sideways phone gets its own columns', () => {
  const one = H.layout(1, 400, 300, 6);
  assert.ok(Math.abs(one.left * 2 + one.cardW - 400) < 0.01, 'one card sits in the middle');
  const wide = H.layout(7, 800, 250, 6);
  assert.ok(wide.cols >= 7 && wide.rows === 1);
});

test('indexAt: the card under a point, kept inside the hand', () => {
  const lay = H.layout(7, 375, 480, 6);
  const s0 = H.slot(lay, 0), s5 = H.slot(lay, 5);
  assert.equal(H.indexAt(s0.x + 3, s0.y + 3, lay, 7), 0);
  assert.equal(H.indexAt(s5.x + 3, s5.y + 3, lay, 7), 5);
  assert.equal(H.indexAt(-50, -50, lay, 7), 0);
  assert.equal(H.indexAt(9999, 9999, lay, 7), 6, 'past the last card gives the last place');
  assert.equal(H.indexAt(10, 10, lay, 0), 0);
});

test('keyRecord: the same room keeps its key and order; a new room or rubbish starts again', () => {
  const made = () => 'k'.repeat(32);
  const text = JSON.stringify({ room: 'ABCD', key: 'a'.repeat(32), order: ['QS', 'TH'] });
  assert.deepEqual(H.keyRecord(text, 'ABCD', made), { room: 'ABCD', key: 'a'.repeat(32), order: ['QS', 'TH'] });
  assert.deepEqual(H.keyRecord(text, 'WXYZ', made), { room: 'WXYZ', key: made(), order: [] });
  assert.deepEqual(H.keyRecord('not json', 'ABCD', made), { room: 'ABCD', key: made(), order: [] });
  assert.deepEqual(H.keyRecord(null, 'ABCD', made), { room: 'ABCD', key: made(), order: [] });
  assert.deepEqual(H.keyRecord('{"room":"ABCD","key":"x"}', 'ABCD', made).order, [], 'a short key is not ours');
  const odd = JSON.stringify({ room: 'ABCD', key: 'b'.repeat(32), order: 'QS' });
  assert.deepEqual(H.keyRecord(odd, 'ABCD', made).order, []);
});

test('nextSelection: tap picks, unpicks, moves with room for one, and stops at max', () => {
  assert.deepEqual(H.nextSelection([], 'QS', 1), ['QS']);
  assert.deepEqual(H.nextSelection(['QS'], 'TH', 1), ['TH'], 'with room for one the pick moves');
  assert.deepEqual(H.nextSelection(['QS'], 'QS', 1), []);
  assert.deepEqual(H.nextSelection(['QS'], 'TH', 3), ['QS', 'TH']);
  assert.deepEqual(H.nextSelection(['QS', 'TH', '2C'], '9D', 3), ['QS', 'TH', '2C'], 'no more than max');
  assert.deepEqual(H.nextSelection(['QS', 'TH'], 'QS', 3), ['TH']);
});

test('canSend: your turn, a play, and a pick within min and max', () => {
  const play = { type: 'play', min: 1, max: 3 };
  assert.equal(H.canSend(['QS'], play, true), true);
  assert.equal(H.canSend([], play, true), false);
  assert.equal(H.canSend(['a', 'b', 'c', 'd'], play, true), false);
  assert.equal(H.canSend(['QS'], play, false), false);
  assert.equal(H.canSend(['QS'], null, true), false);
  assert.equal(H.canSend([], { type: 'pass', min: 0, max: 0 }, true), true);
});

const roster = { players: [{ name: 'Ann', here: true }, { name: 'Bo', here: true }, { name: 'Cy', here: false }] };

test('turnLine: your turn, one name, or several', () => {
  assert.equal(H.turnLine({ turn: [1] }, roster, 1), 'Your turn');
  assert.equal(H.turnLine({ turn: [0] }, roster, 1), "Ann's turn");
  assert.equal(H.turnLine({ turn: [0, 2] }, roster, 1), 'Ann and others');
  assert.equal(H.turnLine({ turn: [0, 1] }, roster, 1), 'Your turn');
  assert.equal(H.turnLine({ turn: [] }, roster, 1), '');
  assert.equal(H.turnLine(null, roster, 1), '');
});

test('winnerLine: you won, or the names', () => {
  assert.equal(H.winnerLine({ over: { winners: [1] } }, roster, 1), 'You won!');
  assert.equal(H.winnerLine({ over: { winners: [2] } }, roster, 1), 'Cy won.');
  assert.equal(H.winnerLine({ over: { winners: [0, 2] } }, roster, 1), 'Ann and Cy won.');
  assert.equal(H.winnerLine({ over: { winners: [0, 1] } }, roster, 1), 'You won!');
  assert.equal(H.winnerLine({ over: null }, roster, 1), '');
});

test('a move goes to the table as a c-move: a button with no cards, a play with its cards and its extra choice', () => {
  assert.deepEqual(H.moveMessage('draw'), { type: 'c-move', move: { type: 'draw' } });
  assert.deepEqual(H.moveMessage('play', ['QD']), { type: 'c-move', move: { type: 'play', cards: ['QD'] } });
  assert.deepEqual(H.moveMessage('play', ['8S'], { field: 'suit', value: 'H' }), { type: 'c-move', move: { type: 'play', cards: ['8S'], suit: 'H' } });
  const picked = ['QD'], m = H.moveMessage('play', picked);
  picked.push('2C');
  assert.deepEqual(m.move.cards, ['QD'], 'the message keeps the cards as they were picked');
  // No button on the page may send a move any other way: only "who I am" and "my name" are sent bare.
  const js = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'hand.js'), 'utf8');
  assert.equal((js.match(/send\(\{ type: (?!'c-hi'|'c-name')/g) || []).length, 0);
});

// ---- the bar for a game that asks a question, offers several card moves, or may be played with no cards (Spades, Rummy, Conquian)
const rummyHints = () => ({
  play: { type: 'discard', label: 'Discard', cards: ['5H', '7C', 'KD'], min: 1, max: 1, choose: null },
  plays: [
    { type: 'meld', label: 'Lay down', cards: ['5H', '5C', '5D', '7C', 'KD'], min: 3, max: 13, choose: null },
    { type: 'layoff', label: 'Lay off', cards: ['5H', '5C', '5D', '7C', 'KD'], min: 1, max: 13,
      choose: { cards: null, field: 'on', from: [{ v: 0, label: 'Fives' }], kind: 'option', title: 'On which set or run?' } },
  ],
  buttons: [],
});
const bidHints = () => ({ play: null, buttons: [{ type: 'bid', label: 'Bid', choose: { field: 'n', from: [{ v: 0, label: 'Nil' }, { v: 1, label: '1' }], kind: 'option', title: 'How many books?' } }] });
const conquianHints = () => ({
  play: { type: 'use', label: 'Use the card', cards: ['AH', '2H'], min: 0, max: 10, choose: { cards: null, field: 'on', from: [{ v: 'new', label: 'A new set or run' }], kind: 'option', title: 'Use it where?' } },
  buttons: [{ type: 'pass', label: 'Pass' }],
});

test('cardMoves: the moves with cards, the main one (hints.play) last', () => {
  assert.deepEqual(H.cardMoves(rummyHints()).map((m) => m.type), ['meld', 'layoff', 'discard']);
  assert.deepEqual(H.cardMoves({ play: { type: 'play' } }).map((m) => m.type), ['play']);
  assert.deepEqual(H.cardMoves({ plays: [{ type: 'a' }, null, { type: 'b' }], play: null }).map((m) => m.type), ['a', 'b']);
  assert.deepEqual(H.cardMoves(bidHints()), []);
  assert.deepEqual(H.cardMoves(null), []);
});

test('pickLimit: a tap may pick up to the most any move of the turn takes', () => {
  assert.equal(H.pickLimit(rummyHints()), 13, 'Lay down takes up to 13, so the player can pick a whole set');
  assert.equal(H.pickLimit({ play: { type: 'play', min: 1, max: 1 } }), 1);
  assert.equal(H.pickLimit(conquianHints()), 10);
  assert.equal(H.pickLimit(bidHints()), 1);
  assert.equal(H.pickLimit(null), 1);
  assert.equal(H.pickLimit({ play: { type: 'play' } }), 1, 'a move that names no max takes one');
});

test('pickable: every card some move lists; null when nothing is held back', () => {
  assert.deepEqual(H.pickable(rummyHints()), ['5H', '5C', '5D', '7C', 'KD']);
  assert.deepEqual(H.pickable({ play: { type: 'play', cards: ['QS'], min: 1, max: 1 } }), ['QS']);
  assert.equal(H.pickable(bidHints()), null);
  assert.equal(H.pickable(null), null);
  assert.equal(H.pickable({ play: { type: 'play', min: 1, max: 1 } }), null, 'a move with no list of cards holds none back');
});

test('barItems: Rummy after drawing offers Lay down, Lay off and Discard, each lit by its own min and max', () => {
  const none = H.barItems(rummyHints(), [], true);
  assert.deepEqual(none.map((i) => [i.key, i.label, i.kind, i.enabled, i.main]), [
    ['move:meld', 'Lay down', 'move', false, false], ['move:layoff', 'Lay off', 'move', false, false], ['move:discard', 'Discard', 'move', false, true]]);
  const one = H.barItems(rummyHints(), ['5H'], true);
  assert.deepEqual(one.map((i) => i.enabled), [false, true, true], 'one card: Lay off and Discard, not Lay down (needs 3)');
  const three = H.barItems(rummyHints(), ['5H', '5C', '5D'], true);
  assert.deepEqual(three.map((i) => i.enabled), [true, true, false], 'three cards: Lay down and Lay off, not Discard (exactly 1)');
  assert.equal(H.barItems(rummyHints(), ['5H', '5C', '5D'], false).length, 0, 'nothing on the bar when it is not your turn');
  assert.equal(H.barItems(null, [], true).length, 0);
});

test('barItems: buttons with no cards come first and are always lit; a bid button carries its question', () => {
  const items = H.barItems(bidHints(), [], true);
  assert.equal(items.length, 1);
  assert.deepEqual([items[0].key, items[0].kind, items[0].enabled, items[0].main], ['button:bid', 'button', true, false]);
  assert.equal(items[0].choose.title, 'How many books?');
  const c = H.barItems(conquianHints(), [], true);
  assert.deepEqual(c.map((i) => i.key), ['button:pass', 'move:use']);
  assert.equal(c[1].main, true);
});

test('a move with a min of 0 is lit with nothing picked (Conquian: Use the card)', () => {
  const use = H.barItems(conquianHints(), [], true).find((i) => i.type === 'use');
  assert.equal(use.enabled, true);
  assert.equal(H.canSend([], conquianHints().play, true), true);
  assert.equal(H.canSend([], conquianHints().play, false), false, 'but never out of turn');
  assert.equal(H.barItems(conquianHints(), new Array(11).fill('x'), true).find((i) => i.type === 'use').enabled, false, 'and not above its max');
  assert.deepEqual(H.itemMessage(use, [], { field: 'on', value: 'new' }), { type: 'c-move', move: { type: 'use', cards: [], on: 'new' } }, 'it goes out with an empty list of cards, as the table asks');
});

test('choiceFor: a button always asks; a move with cards asks when its choice names no cards or one of them is picked', () => {
  const [bid] = H.barItems(bidHints(), [], true);
  assert.equal(H.choiceFor(bid, []).title, 'How many books?');
  const eights = { kind: 'move', choose: { cards: ['8S', '8H'], field: 'suit', from: ['S', 'H'], kind: 'suit', title: 'Which suit?' } };
  assert.equal(H.choiceFor(eights, ['8S']).title, 'Which suit?');
  assert.equal(H.choiceFor(eights, ['QD']), null, 'an ordinary card needs no question');
  const lay = H.barItems(rummyHints(), ['5H'], true).find((i) => i.type === 'layoff');
  assert.equal(H.choiceFor(lay, ['5H']).title, 'On which set or run?', 'a choice that names no cards is always asked');
  assert.equal(H.choiceFor(H.barItems(rummyHints(), ['5H'], true).find((i) => i.type === 'discard'), ['5H']), null);
  assert.equal(H.choiceFor(null, []), null);
});

test('itemMessage: a button sends no cards, a move sends what was picked, and the answer to a question rides along', () => {
  const [bid] = H.barItems(bidHints(), ['5H'], true);
  assert.deepEqual(H.itemMessage(bid, ['5H'], { field: 'n', value: 0 }), { type: 'c-move', move: { type: 'bid', n: 0 } }, 'Nil is a 0, and no card goes with a button');
  assert.deepEqual(H.itemMessage(bid, [], { field: 'n', value: 3 }), { type: 'c-move', move: { type: 'bid', n: 3 } });
  const lay = H.barItems(rummyHints(), ['5H', '5C'], true).find((i) => i.type === 'layoff');
  assert.deepEqual(H.itemMessage(lay, ['5H', '5C'], { field: 'on', value: 0 }), { type: 'c-move', move: { type: 'layoff', cards: ['5H', '5C'], on: 0 } });
  const pass = H.barItems(conquianHints(), [], true).find((i) => i.type === 'pass');
  assert.deepEqual(H.itemMessage(pass, ['AH'], null), { type: 'c-move', move: { type: 'pass' } });
});

test('choiceColumns: a long list goes in more columns', () => {
  assert.equal(H.choiceColumns(2), 2);
  assert.equal(H.choiceColumns(4), 3);
  assert.equal(H.choiceColumns(14), 4, 'a bid of nil to 13');
});

test('pileView: the trick, else the top of the pile, else the card on offer', () => {
  assert.deepEqual(H.pileView({ zones: { trick: { n: 2, cards: ['QS', '2C'] }, discard: { n: 3, top: 'TH' } } }), { cards: ['QS', '2C'], trick: true });
  assert.deepEqual(H.pileView({ zones: { trick: { n: 0, cards: [] }, discard: { n: 3, top: 'TH' } } }), { cards: ['TH'], trick: false });
  assert.deepEqual(H.pileView({ zones: { offer: { n: 1, cards: ['7H'] }, waste: { n: 4, top: '2C' } } }), { cards: ['7H'], trick: false });
  assert.deepEqual(H.pileView({ zones: { offer: { n: 0, cards: [] } } }), { cards: [], trick: false });
  assert.deepEqual(H.pileView(null), { cards: [], trick: false });
  assert.equal(H.pileView({ zones: { trick: { n: 9, cards: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] } } }).cards.length, 6);
});

test('otherLine: a name, its cards, and the game line for the seat', () => {
  const v = { zones: { 'hand:0': { n: 13 }, 'hand:2': { n: 11 } }, pub: { notes: ['Bid 3, took 1', '', 'Nil'] } };
  assert.equal(H.otherLine(v, roster, 0), 'Ann 13 · Bid 3, took 1');
  assert.equal(H.otherLine(v, roster, 1), 'Bo', 'no hand zone and no line: the name alone');
  assert.equal(H.otherLine(v, roster, 2), 'Cy 11 · Nil');
  assert.equal(H.otherLine({ zones: { 'hand:0': { n: 5 } }, pub: {} }, roster, 0), 'Ann 5', 'a game with no lines');
});

test('the page builds every bar button from barItems and sends every move through itemMessage', () => {
  const js = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'hand.js'), 'utf8');
  assert.ok(/send\(itemMessage\(it, selected, extra\)\)/.test(js));
  assert.ok(!/send\(moveMessage/.test(js), 'no button sends a move by hand');
  assert.ok(!new RegExp('[' + String.fromCharCode(8211, 8212) + ']').test(js), 'no dash characters in the page file');
});
