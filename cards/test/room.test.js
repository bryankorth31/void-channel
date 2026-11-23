// The cards room on VoidTV's phone relay (play/rooms/room.js, the PLAY lead's; kind "cards" added with that chat's yes,
// 22 Nov 2026). The relay is what makes a private hand possible, so its promises are held here from the card side:
// what the table sends to one seat reaches that seat alone, and a phone is heard by the table only.
// Run: node --test "cards/test/*.test.js"
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const R = require('../../play/rooms/room.js');

function harness() {
  let clock = 1000000;
  const sent = new Map(), closed = new Map();
  const room = R.createRoom({ code: 'KX7P', kind: 'cards', key: 'k'.repeat(32), now: () => clock,
    send: (s, t) => { if (!sent.has(s)) sent.set(s, []); sent.get(s).push(JSON.parse(t)); },
    close: (s, code) => closed.set(s, code) });
  return { room, sent: (s) => sent.get(s) || [], closed, advance: (ms) => { clock += ms; } };
}

test('the relay has a cards room, and the join page sends a phone to the hand page', () => {
  assert.ok(R.KINDS.includes('cards'));
  assert.deepEqual(R.LIMITS.cards, { phones: 16, perSecond: 10, screenHoldMs: 45 * 1000 });
  const join = fs.readFileSync(path.join(__dirname, '..', '..', 'play', 'join.html'), 'utf8');
  assert.ok(join.includes("cards: '/cards/hand?r='"));
});

test('a hand sent to one seat reaches that seat alone; what is sent to all reaches every phone', () => {
  const h = harness();
  h.room.addHost('table', 'https://voidtv.net');
  assert.equal(h.room.addPhone('ann', 'a'.repeat(16)), 1);
  assert.equal(h.room.addPhone('ben', 'b'.repeat(16)), 2);
  assert.equal(h.room.addPhone('cal', 'c'.repeat(16)), 3);
  h.room.message('table', JSON.stringify({ to: 2, msg: { type: 'c-hand', cards: ['QS', '7H'] } }));
  h.room.message('table', JSON.stringify({ to: 'all', msg: { type: 'c-table', top: '7D' } }));
  const got = (who) => h.sent(who).filter((m) => m.type && m.type.startsWith('c-'));
  assert.deepEqual(got('ben'), [{ type: 'c-hand', cards: ['QS', '7H'] }, { type: 'c-table', top: '7D' }]);
  assert.deepEqual(got('ann'), [{ type: 'c-table', top: '7D' }], 'seat 1 never hears seat 2\'s hand');
  assert.deepEqual(got('cal'), [{ type: 'c-table', top: '7D' }]);
});

test('a phone is heard by the table only, never by another phone', () => {
  const h = harness();
  h.room.addHost('table', '');
  h.room.addPhone('ann'); h.room.addPhone('ben');
  h.room.message('ann', JSON.stringify({ type: 'c-move', move: { type: 'play', cards: ['QS'] } }));
  assert.deepEqual(h.sent('table').filter((m) => m.msg), [{ from: 1, msg: { type: 'c-move', move: { type: 'play', cards: ['QS'] } } }]);
  assert.ok(!JSON.stringify(h.sent('ben')).includes('QS'));
});

test('sixteen phones fit at one table and the seventeenth is told it is full', () => {
  const h = harness();
  h.room.addHost('table', '');
  for (let i = 1; i <= 16; i++) assert.equal(h.room.addPhone('p' + i), i);
  assert.equal(h.room.addPhone('p17'), null);
  assert.equal(h.closed.get('p17'), R.CLOSE.full);
});

test('the table\'s page may reload: the room waits 45 seconds and the phones keep their seats', () => {
  const h = harness();
  h.room.addHost('table', '');
  h.room.addPhone('ann', 'a'.repeat(16));
  assert.equal(h.room.drop('table'), 'away');
  assert.deepEqual(h.sent('ann').slice(-1), [{ type: 'host-away' }]);
  h.advance(30 * 1000);
  assert.equal(h.room.reclaim('table2', 'k'.repeat(32)), true);
  assert.deepEqual(h.sent('table2').filter((m) => m.type === 'join'), [{ type: 'join', from: 1, back: true }]);
  assert.deepEqual(h.sent('ann').slice(-1), [{ type: 'host-back' }]);
  // A page that does not come back in time lets its phones go.
  h.room.drop('table2');
  h.advance(46 * 1000);
  assert.equal(h.room.tick(), 'ended');
  assert.equal(h.closed.get('ann'), R.CLOSE.hostGone);
});

test('a seat left for more than a minute goes to the next phone, which is why a hand belongs to a player key and not to a seat', () => {
  const h = harness();
  h.room.addHost('table', '');
  h.room.addPhone('ann', 'a'.repeat(16));
  h.room.drop('ann');
  h.advance(30 * 1000);
  assert.equal(h.room.addPhone('ann2', 'a'.repeat(16)), 1, 'back within the minute: the same seat, and the table hears back: true');
  assert.deepEqual(h.sent('table').slice(-1), [{ type: 'join', from: 1, back: true }]);
  h.room.drop('ann2');
  h.advance(61 * 1000);
  assert.equal(h.room.addPhone('stranger', 's'.repeat(16)), 1, 'a different phone is given seat 1');
  assert.deepEqual(h.sent('table').slice(-1), [{ type: 'join', from: 1 }], 'with no back: the table must not hand it seat 1\'s cards');
});
