// The table engine (cards/src/table.js), checked with a small game made only for these tests: who sees what, what a
// move may do, what the events tell, and that a faulty rule file cannot hurt a game in progress.
// Run: node --test "cards/test/*.test.js"
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../src/table.js');

// Eight cards, not shuffled, two each: seat 0 holds h and f, seat 1 holds g and e, and a b c d stay in the pack.
const toy = {
  id: 'toy', name: 'Toy', players: { min: 2, max: 3 },
  zones: { draw: { see: 'none' }, pile: { see: 'top' }, open: { see: 'all' }, hand: { each: true, see: 'owner' } },
  pack: () => ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
  setup(t) { t.deal('draw', 'hand', 2); t.s.pub.note = 'hello'; t.s.own[1].secret = 'mine alone'; t.turn(0); },
  moves: {
    show: { uses: 'hand', run(t, p, m) { t.move(m.cards, 'hand:' + p, 'open', { by: p }); t.next(); } },
    bury: { uses: 'hand', count: [1, 2], run(t, p, m) { t.move(m.cards, 'hand:' + p, 'pile'); t.next(); } },
    draw: { can: (s) => (s.zones.draw.length ? null : 'Nothing to draw.'), run(t, p) { t.move(t.top('draw'), 'draw', 'hand:' + p); } },
    sweep: { run(t) { t.move(t.zone('pile').slice(), 'pile', 'draw'); } },
    back: { run(t) { t.s.dir = -1; t.next(); } },
    shout: { anytime: true, run(t, p) { t.say({ ev: 'shout', by: p }); } },
    stop: { run(t, p) { t.end({ winners: [p] }); } },
    lose: { run(t) { t.zone('draw').pop(); } },
    crash: { run() { throw new Error('boom'); } },
  },
  hints: (s, p) => ({ play: { type: 'show', cards: s.zones['hand:' + p].slice(), min: 1, max: 1 }, buttons: [] }),
};
const fresh = (n) => T.create(toy, { players: n || 2 }).state;
const go = (s, p, m) => { const r = T.move(toy, s, p, m); assert.ok(r.ok, r.error + ' ' + (r.bug || '')); return r; };

test('a table opens for the right number of players, with every card in one place', () => {
  assert.throws(() => T.create(toy, { players: 1 }), /takes 2 to 3 players/);
  assert.throws(() => T.create(toy, { players: 4 }), /takes 2 to 3 players/);
  const s = fresh();
  assert.deepEqual(s.zones, { draw: ['a', 'b', 'c', 'd'], pile: [], open: [], 'hand:0': ['h', 'f'], 'hand:1': ['g', 'e'] });
  assert.deepEqual(s.turn, [0]);
  assert.equal(s.seq, 0);
  assert.equal(fresh(3).zones['hand:2'].length, 2);
});

test('the big screen is given counts for hands and the pack, never their cards', () => {
  let s = fresh();
  s = go(s, 0, { type: 'show', cards: ['h'] }).state;
  s = go(s, 1, { type: 'bury', cards: ['g', 'e'] }).state;
  const v = T.view(toy, s, null);
  assert.deepEqual(v.zones, { draw: { n: 4 }, pile: { n: 2, top: 'e' }, open: { n: 1, cards: ['h'] }, 'hand:0': { n: 1 }, 'hand:1': { n: 0 } });
  assert.equal(v.pub.note, 'hello');
  assert.ok(!('own' in v), 'nobody\'s own notes are in the public view');
  assert.ok(!('pack' in v));
  const text = JSON.stringify(v);
  for (const c of ['a', 'b', 'c', 'd', 'f', 'g']) assert.ok(!text.includes('"' + c + '"'), 'card ' + c + ' is hidden');
  assert.deepEqual(T.hidden(toy, s, null).sort(), ['a', 'b', 'c', 'd', 'f', 'g']);
});

test('a player is given their own hand and notes, and nobody else\'s', () => {
  const s = fresh();
  const v0 = T.view(toy, s, 0), v1 = T.view(toy, s, 1);
  assert.deepEqual(v0.zones['hand:0'], { n: 2, cards: ['h', 'f'] });
  assert.deepEqual(v0.zones['hand:1'], { n: 2 });
  assert.deepEqual(v0.own, {});
  assert.deepEqual(v1.zones['hand:1'], { n: 2, cards: ['g', 'e'] });
  assert.deepEqual(v1.own, { secret: 'mine alone' });
  assert.ok(!JSON.stringify(v0).includes('mine alone'));
  assert.deepEqual(T.hidden(toy, s, 0).sort(), ['a', 'b', 'c', 'd', 'e', 'g']);
  // The private part alone: what goes to one phone beside the public table.
  const m0 = T.mine(toy, s, 0);
  assert.deepEqual(m0.zones, { 'hand:0': { n: 2, cards: ['h', 'f'] } });
  assert.deepEqual(m0.hints.play.cards, ['h', 'f']);
  assert.equal(T.mine(toy, s, 1).hints, null, 'no hints for a player whose turn it is not');
});

test('the engine refuses a move out of turn, an unknown move, and a card the player does not hold', () => {
  const s = fresh();
  const no = (p, m, re) => { const r = T.move(toy, s, p, m); assert.equal(r.ok, false); assert.match(r.error, re); assert.equal(r.state, s, 'the state comes back as it was'); assert.ok(!r.bug); };
  no(1, { type: 'show', cards: ['g'] }, /not your turn/);
  no(0, { type: 'fly' }, /not part of this game/);
  no(0, { type: 'constructor' }, /not part of this game/);
  no(0, null, /not part of this game/);
  no(5, { type: 'show', cards: ['h'] }, /not a player/);
  no(0, { type: 'show', cards: ['g'] }, /do not hold/);
  no(0, { type: 'show', cards: ['a'] }, /do not hold/);
  no(0, { type: 'bury', cards: ['h', 'h'] }, /do not hold/);
  no(0, { type: 'show', cards: 'h' }, /Pick 1 card/);
  no(0, { type: 'show', cards: [] }, /Pick 1 card/);
  no(0, { type: 'show', cards: ['h', 'f'] }, /Pick 1 card/);
  no(0, { type: 'bury', cards: [] }, /Pick 1 to 2 cards/);
  no(0, { type: 'show', cards: [{}] }, /do not hold/);
  assert.equal(T.move(toy, s, 1, { type: 'shout' }).ok, true, 'a move marked anytime needs no turn');
});

test('a move answers with a new state and leaves the old one alone', () => {
  const s = fresh(), before = JSON.stringify(s);
  const r = go(s, 0, { type: 'show', cards: ['f'] });
  assert.equal(JSON.stringify(s), before);
  assert.notEqual(r.state, s);
  assert.equal(r.state.seq, 1);
  assert.deepEqual(r.state.zones['hand:0'], ['h']);
  assert.deepEqual(r.state.turn, [1]);
});

test('an event shows a card\'s face only when everyone could see it before or can see it after', () => {
  let s = fresh();
  let r = go(s, 0, { type: 'draw' });
  assert.deepEqual(r.events, [{ ev: 'move', from: 'draw', to: 'hand:0', n: 1 }], 'a drawn card is nobody else\'s business');
  r = go(r.state, 0, { type: 'show', cards: ['h'] });
  assert.deepEqual(r.events, [{ ev: 'move', from: 'hand:0', to: 'open', n: 1, cards: ['h'], by: 0 }], 'a card laid face up is seen');
  r = go(r.state, 1, { type: 'bury', cards: ['g'] });
  assert.deepEqual(r.events[0].cards, ['g'], 'the top of a pile is seen');
  r = go(r.state, 0, { type: 'bury', cards: ['f', 'd'] });
  assert.ok(!('cards' in r.events[0]), 'two cards go on a pile and only the top one shows, so the event names neither');
  r = go(r.state, 1, { type: 'sweep' });
  assert.deepEqual(r.events, [{ ev: 'move', from: 'pile', to: 'draw', n: 3 }], 'a pile swept into the pack shows no faces');
});

test('the turn goes round the table, either way', () => {
  let s = fresh(3);
  s = go(s, 0, { type: 'show', cards: ['h'] }).state; assert.deepEqual(s.turn, [1]);
  s = go(s, 1, { type: 'show', cards: ['g'] }).state; assert.deepEqual(s.turn, [2]);
  s = go(s, 2, { type: 'show', cards: ['f'] }).state; assert.deepEqual(s.turn, [0]);
  s = go(s, 0, { type: 'back' }).state; assert.deepEqual(s.turn, [2], 'backwards from seat 0 is the last seat');
  assert.equal(T.view(toy, s, null).dir, -1);
});

test('when the game is over nobody may move', () => {
  const r = go(fresh(), 0, { type: 'stop' });
  assert.deepEqual(r.state.over, { winners: [0] });
  assert.deepEqual(r.state.turn, []);
  assert.equal(r.events[r.events.length - 1].ev, 'over');
  const again = T.move(toy, r.state, 0, { type: 'shout' });
  assert.equal(again.ok, false);
  assert.match(again.error, /game is over/);
  assert.equal(T.hints(toy, r.state, 0), null);
});

test('a faulty rule file cannot lose a card or break a game: the move is thrown away', () => {
  const s = fresh(), before = JSON.stringify(s);
  for (const type of ['lose', 'crash']) {
    const r = T.move(toy, s, 0, { type });
    assert.equal(r.ok, false);
    assert.equal(r.state, s);
    assert.ok(r.bug, 'the fault is reported: ' + r.bug);
    assert.match(r.error, /could not be made/);
  }
  assert.equal(JSON.stringify(s), before);
});

test('a zone may decide who sees it with a rule of its own', () => {
  const peek = Object.assign({}, toy, { id: 'peek', zones: Object.assign({}, toy.zones, { hand: { each: true, see: (viewer, owner, s) => (s.over ? 'all' : viewer === owner ? 'all' : 'none') } }) });
  const s = T.create(peek, { players: 2 }).state;
  assert.deepEqual(T.view(peek, s, null).zones['hand:1'], { n: 2 });
  const done = T.move(peek, s, 0, { type: 'stop' }).state;
  assert.deepEqual(T.view(peek, done, null).zones['hand:1'], { n: 2, cards: ['g', 'e'] }, 'hands turned up when the game ends');
});
