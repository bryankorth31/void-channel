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
