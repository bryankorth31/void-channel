// The dealer (cards/src/dealer.js): the part that carries a table over the phone relay. Everything it sends is caught
// here and held against the one rule that matters: a phone is sent its own hand and never anyone else's.
// Run: node --test "cards/test/*.test.js"
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/cards.js');
const D = require('../src/dealer.js');
const CE = require('../games/crazy-eights.js');
const H = require('../games/hearts.js');
const W = require('../../trivia/src/words.js');   // Trivia's own name filter, as it is: the table's page uses it too
const { quoted, pickMove } = require('./helper.js');

const KEY = (c) => c.repeat(20);
const PACK = C.standard();
const handOf = (msg) => Object.values(msg.m.zones).flatMap((z) => z.cards || []);
// A dealer with every message it sends caught. sit: the relay gives a phone a seat and the phone says who it is.
function table(opts) {
  const out = [], warns = [];
  const d = D.create(Object.assign({ games: { 'crazy-eights': CE, hearts: H }, rand: C.seeded(5),
    send: (to, msg) => out.push({ to, msg: JSON.parse(JSON.stringify(msg)) }), warn: (w) => warns.push(w),
    cleanName: (raw) => W.cleanName(raw, 'family') }, opts));
  const own = (seat, type) => out.filter((x) => x.to === seat && (!type || x.msg.type === type)).map((x) => x.msg);
  const got = (seat, type) => out.filter((x) => (x.to === seat || x.to === 'all') && (!type || x.msg.type === type)).map((x) => x.msg);
  const sit = (seat, key, name) => { d.join(seat); d.hear(seat, name === undefined ? { type: 'c-hi', key } : { type: 'c-hi', key, name }); };
  return { d, out, warns, own, got, last: (seat, type) => got(seat, type).pop(), sit };
}
// Ann on seat 1 and Ben on seat 2, dealt a game of Crazy Eights.
function annAndBen() { const t = table(); t.sit(1, KEY('a'), 'Ann'); t.sit(2, KEY('b'), 'Ben'); assert.equal(t.d.start(), null); return t; }

test('phones say who they are, the lobby lists them in the order they joined, and a game needs enough players', () => {
  const t = table();
  t.sit(1, KEY('a'), 'Ann');
  assert.deepEqual(t.last(1, 'c-you'), { type: 'c-you', me: null, name: 'Ann', named: true, phase: 'lobby' });
  assert.match(t.d.start(), /Crazy Eights needs at least 2 players/);
  t.sit(2, KEY('b'));
  assert.deepEqual(t.last(2, 'c-roster'), { type: 'c-roster', phase: 'lobby', game: 'crazy-eights', title: 'Crazy Eights', players: [{ name: 'Ann', here: true }, { name: 'Player 2', here: true }], waiting: 0 });
  assert.equal(t.d.start(), null);
  assert.equal(t.last(1, 'c-you').me, 0);
  assert.equal(t.last(2, 'c-you').me, 1);
  assert.equal(t.last(1, 'c-roster').phase, 'play');
  assert.match(t.d.start(), /already on/);
});

test('each phone is dealt its own hand; what goes to everyone, and to the big screen, shows only the pile\'s top card', () => {
  const t = annAndBen();
  const a = handOf(t.last(1, 'c-hand')), b = handOf(t.last(2, 'c-hand'));
  assert.equal(a.length, 7); assert.equal(b.length, 7);
  assert.ok(a.every((c) => !b.includes(c)));
  const top = t.last(1, 'c-table').v.zones.discard.top;
  for (const x of t.out.filter((y) => y.to === 'all')) for (const c of PACK) if (c !== top) assert.ok(!quoted(JSON.stringify(x.msg), c), c + ' went to everyone');
  for (const x of t.out.filter((y) => y.to === 1)) for (const c of b) assert.ok(!quoted(JSON.stringify(x.msg), c), 'Ben\'s ' + c + ' went to Ann');
  for (const x of t.out.filter((y) => y.to === 2)) for (const c of a) assert.ok(!quoted(JSON.stringify(x.msg), c), 'Ann\'s ' + c + ' went to Ben');
  const snap = t.d.snapshot(), text = JSON.stringify(snap);
  for (const c of PACK) if (c !== top) assert.ok(!quoted(text, c), c + ' is in what the big screen may draw');
  assert.deepEqual(snap.players, [{ name: 'Ann', here: true, seat: 1 }, { name: 'Ben', here: true, seat: 2 }]);
  assert.deepEqual(snap.view.zones['hand:0'], { n: 7 });
  assert.equal(snap.status, CE.status({ over: null, pub: snap.view.pub, zones: { discard: [top] } }));
});

test('a phone that has not said who it is gets nothing of anyone\'s own and is not heard', () => {
  const t = annAndBen();
  t.d.join(3);
  const mark = t.out.length;
  t.d.hear(3, { type: 'c-move', move: { type: 'draw' } });
  t.d.hear(3, { type: 'c-name', name: 'Nobody' });
  t.d.hear(3, { type: 'c-hi', key: 'short' });
  t.d.hear(3, { type: 'c-hi' });
  t.d.hear(3, null);
  t.d.hear(3, 'c-hi');
  assert.equal(t.out.length, mark, 'not one message went out');
  assert.deepEqual(t.own(3), []);
});

test('a seat given to another phone carries no hand with it, and the player gets their hand back on any seat', () => {
  const t = annAndBen();
  const annHand = handOf(t.last(1, 'c-hand'));
  t.d.leave(1);
  assert.deepEqual(t.last(2, 'c-roster').players, [{ name: 'Ann', here: false }, { name: 'Ben', here: true }]);
  // The relay gives seat 1 to the next phone that joins: a stranger.
  const mark = t.out.length;
  t.sit(1, KEY('s'), 'Stranger');
  const toSeat1 = t.out.slice(mark).filter((x) => x.to === 1).map((x) => x.msg);
  assert.deepEqual(toSeat1.map((m) => m.type), ['c-you', 'c-table'], 'who it is and the public table, and no hand');
  assert.equal(toSeat1[0].me, null);
  for (const c of annHand) assert.ok(!quoted(JSON.stringify(toSeat1), c));
  t.d.hear(1, { type: 'c-move', move: { type: 'draw' } });
  assert.deepEqual(t.own(1, 'c-no').pop(), { type: 'c-no', error: 'You are in the next game.' });
  assert.equal(t.last(2, 'c-roster').waiting, 1);
  // Ann scans the code again and lands on seat 3: her key brings her hand back.
  t.sit(3, KEY('a'));
  assert.equal(t.own(3, 'c-you').pop().me, 0);
  assert.deepEqual(handOf(t.own(3, 'c-hand').pop()), annHand);
  assert.equal(t.own(3, 'c-you').pop().name, 'Ann', 'and her name is remembered');
  assert.equal(t.own(1, 'c-hand').length, 1, 'seat 1 was sent a hand once, when it was Ann\'s, and never again');
});

test('the same player on a second tab: the new one takes over and the old one is told and no longer heard', () => {
  const t = annAndBen();
  t.sit(5, KEY('a'));
  assert.deepEqual(t.own(1).pop(), { type: 'c-moved' });
  assert.equal(t.own(5, 'c-hand').length, 1);
  const mark = t.out.length;
  t.d.hear(1, { type: 'c-move', move: { type: 'draw' } });
  assert.equal(t.out.length, mark, 'the old tab is not heard');
  t.d.hear(5, { type: 'c-move', move: { type: 'draw' } });
  assert.ok(t.out.slice(mark).some((x) => x.to === 5 && x.msg.type === 'c-hand'), 'the new tab draws and is sent its hand');
  assert.ok(!t.out.slice(mark).some((x) => x.to === 1), 'nothing more goes to the old seat');
});

test('a name typed on a phone is cleaned for the big screen; one that cannot be shown is refused', () => {
  const t = table();
  t.sit(1, KEY('a'), '  Grandma   Jo!!  ');
  assert.equal(t.last(1, 'c-you').name, 'Grandma Jo!!');
  t.sit(2, KEY('b'), 'sh1t');
  assert.deepEqual(t.own(2, 'c-you').pop(), { type: 'c-you', me: null, name: 'Player 2', named: false, phase: 'lobby', refused: true });
  t.d.hear(2, { type: 'c-name', name: 'Benjamin the Great and Terrible' });
  assert.equal(t.own(2, 'c-you').pop().name, 'Benjamin the Gre');
  assert.deepEqual(t.last(1, 'c-roster').players.map((p) => p.name), ['Grandma Jo!!', 'Benjamin the Gre']);
});

test('a move that is refused is answered to that phone alone, with the reason', () => {
  const t = annAndBen();
  const mark = t.out.length;
  t.d.hear(2, { type: 'c-move', move: { type: 'draw' } });
  assert.deepEqual(t.out.slice(mark), [{ to: 2, msg: { type: 'c-no', error: 'It is not your turn.' } }]);
  t.d.hear(1, { type: 'c-move', move: { type: 'play', cards: [handOf(t.last(2, 'c-hand'))[0]] } });
  assert.deepEqual(t.out.slice(mark + 1), [{ to: 1, msg: { type: 'c-no', error: 'You do not hold that card.' } }]);
});

test('more phones than the game takes: the first in play and the rest are in the next game', () => {
  const t = table();
  for (let i = 1; i <= 9; i++) t.sit(i, KEY(String.fromCharCode(96 + i)));
  assert.equal(t.last(1, 'c-roster').players.length, 9);
  assert.equal(t.d.start(), null);
  const r = t.last(1, 'c-roster');
  assert.equal(r.players.length, 7);
  assert.equal(r.waiting, 2);
  assert.equal(t.own(7, 'c-you').pop().me, 6);
  assert.equal(t.own(8, 'c-you').pop().me, null);
  assert.equal(t.own(8, 'c-hand').length, 0);
  assert.equal(t.own(7, 'c-hand').length, 1);
});

test('the lobby picks the game; a game on is not swapped; the relay\'s own words reach the dealer', () => {
  const t = table();
  assert.equal(t.d.relay({ type: 'room', code: 'KX7P' }), false, 'not the dealer\'s');
  assert.equal(t.d.relay({ type: 'join', from: 1 }), true);
  assert.equal(t.d.relay({ from: 1, msg: { type: 'c-hi', key: KEY('a'), name: 'Ann' } }), true);
  assert.equal(t.d.relay({ type: 'join', from: 2 }), true);
  assert.equal(t.d.relay({ from: 2, msg: { type: 'c-hi', key: KEY('b') } }), true);
  assert.equal(t.d.pick('hearts'), true);
  assert.equal(t.last(1, 'c-roster').title, 'Hearts');
  assert.deepEqual(t.d.snapshot().games, [{ id: 'crazy-eights', name: 'Crazy Eights' }, { id: 'hearts', name: 'Hearts' }]);
  assert.match(t.d.start(), /Hearts needs at least 3 players/);
  assert.equal(t.d.pick('poker'), false);
  assert.equal(t.d.pick('crazy-eights'), true);
  assert.equal(t.d.start(), null);
  assert.equal(t.d.pick('hearts'), false);
  assert.equal(t.d.relay({ type: 'leave', from: 2 }), true);
  assert.deepEqual(t.d.snapshot().players.map((p) => p.here), [true, false]);
});

// A whole game through the dealer: each phone plays from the hints it was sent. After every move, every message is held
// against what its receiver may know: the cards lying face up, and (for one seat) that seat's own cards as told to it.
function playThrough(gameId, n, seed, opts) {
  const t = table({ game: gameId, rand: C.seeded(seed), opts }), rand = C.seeded(seed + 1);
  for (let i = 1; i <= n; i++) t.sit(i, KEY(String.fromCharCode(96 + i)));
  const hands = new Map(), hints = new Map();
  let mark = t.out.length, v = null;
  const settle = () => {
    const batch = t.out.slice(mark); mark = t.out.length;
    for (const x of batch) {
      if (x.msg.type === 'c-hand') { hands.set(x.to, handOf(x.msg)); hints.set(x.to, x.msg.m.hints); }
      if (x.msg.type === 'c-table') v = x.msg.v;
    }
    const faceUp = new Set(Object.values(v.zones).flatMap((z) => (z.cards || []).concat(z.top ? [z.top] : [])));
    for (const x of batch) {
      const text = JSON.stringify(x.msg);
      assert.ok(JSON.stringify(x).length <= 1024, 'a ' + x.msg.type + ' of ' + JSON.stringify(x).length + ' bytes is too big for the relay');
      const may = new Set(faceUp);
      if (x.to !== 'all') for (const c of hands.get(x.to) || []) may.add(c);
      for (const c of PACK) if (!may.has(c) && quoted(text, c)) assert.fail('card ' + c + ' went to ' + x.to + ' in a ' + x.msg.type + ' at move ' + v.seq);
    }
  };
  assert.equal(t.d.start(), null);
  settle();
  let moves = 0;
  while (!v.over) {
    assert.ok(++moves < 20000, 'the game ends');
    const seat = v.turn[Math.floor(rand() * v.turn.length)] + 1;
    assert.ok(hints.get(seat), 'the phone whose turn it is has been told what it may do');
    t.d.hear(seat, { type: 'c-move', move: pickMove(hints.get(seat), rand) });
    settle();
  }
  assert.deepEqual(t.warns, [], 'no message was too big, no rule file faulted');
  assert.equal(t.out.filter((x) => x.msg.type === 'c-no').length, 0, 'no move from the hints was refused');
  return { t, v, settle: () => { settle(); return v; } };
}

test('Crazy Eights through the dealer, 24 whole games: no message ever carries a card its receiver may not see', () => {
  for (let n = 2; n <= 7; n++) for (let seed = 1; seed <= 4; seed++) {
    const { v } = playThrough('crazy-eights', n, seed * 10 + n, { draws: seed % 2 });
    assert.ok(v.over.winners.length >= 1);
  }
});

test('Hearts through the dealer, 6 whole games, with its secret pass: no message ever carries a card its receiver may not see', () => {
  for (const n of [3, 4, 5]) for (let seed = 1; seed <= 2; seed++) {
    const { v } = playThrough('hearts', n, seed * 10 + n, { target: 30 });
    assert.ok(Math.max(...v.over.scores) >= 30);
  }
});

test('after a game: deal again and the first turn moves on a seat; stop goes back to the lobby', () => {
  const g = playThrough('crazy-eights', 3, 77, { draws: 1 });
  assert.equal(g.t.d.snapshot().phase, 'over');
  assert.equal(g.t.last(1, 'c-roster').phase, 'over');
  assert.equal(g.t.d.start(), null);
  const v = g.settle();
  assert.equal(v.over, null);
  assert.equal(v.seq, 0);
  assert.deepEqual(v.turn, [1], 'the second game starts with the second player');
  assert.equal(g.t.own(1, 'c-hand').pop().m.zones['hand:0'].cards.length, 5);
  g.t.d.stop();
  assert.equal(g.t.d.snapshot().phase, 'lobby');
  assert.equal(g.t.d.snapshot().view, null);
  assert.deepEqual(g.t.own(2, 'c-you').pop(), { type: 'c-you', me: null, name: 'Player 2', named: false, phase: 'lobby' });
});
