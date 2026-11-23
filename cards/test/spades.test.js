// Spades (cards/games/spades.js): each rule held by a table set by hand, then whole games played by chance with every
// view and event held against the privacy rule.
// Run: node --test cards/test/spades.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/cards.js');
const T = require('../src/table.js');
const S = require('../games/spades.js');
const { rig, yes, no, playOut, pickMove } = require('./helper.js');

const bidAll = (s, bids) => {
  let st = s;
  const first = (st.opts.first + st.pub.round) % 4;
  for (let i = 0; i < 4; i++) { const p = (first + i) % 4; st = yes(S, st, p, { type: 'bid', n: bids[p] }).state; }
  return st;
};

test('Spades deals 13 each to exactly four players, with bidding first and partners across', () => {
  assert.throws(() => T.create(S, { players: 3 }), /4 to 4 players/);
  assert.throws(() => T.create(S, { players: 5 }), /4 to 4 players/);
  const s = T.create(S, { players: 4, rand: C.seeded(5) }).state;
  for (let p = 0; p < 4; p++) assert.equal(s.zones['hand:' + p].length, 13);
  assert.equal(s.zones.draw.length, 0);
  assert.equal(s.phase, 'bid');
  assert.deepEqual(s.turn, [0], 'the first bidder is the player at (first + round) % 4');
  assert.deepEqual(s.pub.teams, [0, 1, 0, 1]);
  assert.deepEqual(s.pub.bids, [null, null, null, null]);
  assert.deepEqual(s.pub.notes, ['', '', '', '']);
  assert.equal(S.status(s), 'Bidding: how many books will you take?');
  const u = T.create(S, { players: 4, rand: C.seeded(5), opts: { first: 2 } }).state;
  assert.deepEqual(u.turn, [2], 'the first option names the first bidder');
});

test('Spades: on the next deal the first bid moves on a seat', () => {
  // Final trick: player 3 plays the last card; the game does not end, so a new deal begins.
  const s = last(3, [3, 3, 3, 4], [3, 3, 3, 4]);
  const r = yes(S, s, 3, { type: 'play', cards: ['AS'] });
  assert.equal(r.state.over, null);
  assert.equal(r.state.pub.round, 1);
  assert.equal(r.state.phase, 'bid');
  assert.deepEqual(r.state.turn, [1]);
  for (let p = 0; p < 4; p++) assert.equal(r.state.zones['hand:' + p].length, 13);
  assert.deepEqual(r.state.pub.bids, [null, null, null, null]);
  assert.deepEqual(r.state.pub.took, [0, 0, 0, 0]);
  const again = last(3, [3, 3, 3, 4], [3, 3, 3, 4], { pub: { round: 3 } });
  assert.deepEqual(yes(S, again, 3, { type: 'play', cards: ['AS'] }).state.turn, [0], 'round 4 is back at seat 0');
});

test('Spades bidding: out of turn, below 0, above 13, not whole, twice, and no play before all have bid', () => {
  const s = T.create(S, { players: 4, rand: C.seeded(2) }).state;
  no(S, s, 1, { type: 'bid', n: 3 }, /not your turn/);
  no(S, s, 0, { type: 'bid', n: -1 }, /0 to 13/);
  no(S, s, 0, { type: 'bid', n: 14 }, /0 to 13/);
  no(S, s, 0, { type: 'bid', n: 2.5 }, /0 to 13/);
  no(S, s, 0, { type: 'bid', n: '3' }, /0 to 13/);
  no(S, s, 0, { type: 'bid' }, /0 to 13/);
  no(S, s, 0, { type: 'play', cards: [s.zones['hand:0'][0]] }, /bid first/);
  const a = yes(S, s, 0, { type: 'bid', n: 4 }).state;
  assert.deepEqual(a.turn, [1]);
  assert.deepEqual(a.pub.bids, [4, null, null, null]);
  no(S, a, 0, { type: 'bid', n: 5 }, /not your turn/);
  // Even with the turn handed back to a player who has bid, a second bid is refused.
  const back = Object.assign({}, a, { turn: [0] });
  no(S, back, 0, { type: 'bid', n: 5 }, /bid already/);
  no(S, a, 1, { type: 'play', cards: [a.zones['hand:1'][0]] }, /bid first/);
  const b = yes(S, a, 1, { type: 'bid', n: 0 }).state, c = yes(S, b, 2, { type: 'bid', n: 13 }).state;
  assert.equal(c.phase, 'bid');
  const d = yes(S, c, 3, { type: 'bid', n: 1 }).state;
  assert.equal(d.phase, 'play');
  assert.deepEqual(d.turn, [0], 'the first bidder leads');
  assert.equal(d.pub.led, 0);
  no(S, d, 0, { type: 'bid', n: 1 }, /bidding is done/);
});

test('Spades: bids are public, and the bid hint is a button with the choice Nil and 1 to 13', () => {
  const s = T.create(S, { players: 4, rand: C.seeded(2) }).state;
  const h = T.hints(S, s, 0);
  assert.equal(h.play, null);
  assert.equal(h.buttons.length, 1);
  const b = h.buttons[0];
  assert.equal(b.type, 'bid');
  assert.equal(b.label, 'Bid');
  assert.deepEqual(b.choose.from[0], { v: 0, label: 'Nil' });
  assert.deepEqual(b.choose.from[13], { v: 13, label: '13' });
  assert.equal(b.choose.from.length, 14);
  assert.equal(b.choose.field, 'n');
  assert.equal(b.choose.kind, 'option');
  assert.equal(b.choose.title, 'How many books?');
  assert.equal(T.hints(S, s, 1), null);
  const a = yes(S, s, 0, { type: 'bid', n: 6 }).state;
  assert.deepEqual(T.view(S, a, null).pub.bids, [6, null, null, null]);
});

test('Spades play: follow the suit led when you can, any card when you cannot', () => {
  const s = rig(S, 4, { 'hand:0': ['5H', '9C'], 'hand:1': ['KH', 'QS', '2C'], 'hand:2': ['3D', '4C'], 'hand:3': ['2H'], trick: [] },
    { phase: 'play', turn: 0, pub: { led: 0, bids: [1, 1, 1, 1], took: [0, 0, 0, 0] } });
  const a = yes(S, s, 0, { type: 'play', cards: ['5H'] }).state;
  assert.equal(S.status(a), 'Hearts led.');
  no(S, a, 1, { type: 'play', cards: ['2C'] }, /Follow suit: play one of your hearts/);
  no(S, a, 1, { type: 'play', cards: ['QS'] }, /Follow suit/);
  assert.deepEqual(T.hints(S, a, 1).play.cards, ['KH']);
  const b = yes(S, a, 1, { type: 'play', cards: ['KH'] }).state;
  assert.deepEqual(T.hints(S, b, 2).play.cards, ['3D', '4C'], 'no heart in hand: anything goes');
  yes(S, b, 2, { type: 'play', cards: ['4C'] });
});

test('Spades play: a spade cannot lead until broken, unless it is all the leader holds', () => {
  const s = rig(S, 4, { 'hand:0': ['AS', '5H'], 'hand:1': ['2D'], 'hand:2': ['3D'], 'hand:3': ['4D'] },
    { phase: 'play', turn: 0, pub: { led: 0, broken: false, bids: [1, 1, 1, 1], took: [0, 0, 0, 0] } });
  assert.equal(S.status(s), 'Any card but a spade may lead.');
  no(S, s, 0, { type: 'play', cards: ['AS'] }, /Spades cannot lead until a spade has been played\./);
  assert.deepEqual(T.hints(S, s, 0).play.cards, ['5H']);
  // Broken: a spade played on another suit.
  const t = rig(S, 4, { 'hand:0': ['5H', '9C'], 'hand:1': ['2S', '2D'], 'hand:2': ['3D'], 'hand:3': ['4D'] },
    { phase: 'play', turn: 0, pub: { led: 0, broken: false, bids: [1, 1, 1, 1], took: [0, 0, 0, 0] } });
  const a = yes(S, t, 0, { type: 'play', cards: ['5H'] }).state;
  assert.equal(a.pub.broken, false);
  const b = yes(S, a, 1, { type: 'play', cards: ['2S'] }).state;
  assert.equal(b.pub.broken, true);
  // Once broken, a spade may lead.
  const u = rig(S, 4, { 'hand:0': ['AS', '5H'], 'hand:1': ['2D'], 'hand:2': ['3D'], 'hand:3': ['4D'] },
    { phase: 'play', turn: 0, pub: { led: 0, broken: true, bids: [1, 1, 1, 1], took: [0, 0, 0, 0] } });
  assert.equal(S.status(u), 'Spades are broken: any card may lead.');
  yes(S, u, 0, { type: 'play', cards: ['AS'] });
  // Nothing but spades: they may lead before broken.
  const v = rig(S, 4, { 'hand:0': ['AS', '5S'], 'hand:1': ['2D'], 'hand:2': ['3D'], 'hand:3': ['4D'] },
    { phase: 'play', turn: 0, pub: { led: 0, broken: false, bids: [1, 1, 1, 1], took: [0, 0, 0, 0] } });
  assert.deepEqual(T.hints(S, v, 0).play.cards, ['AS', '5S']);
  yes(S, v, 0, { type: 'play', cards: ['5S'] });
});

test('Spades play: the highest spade takes the trick, else the highest of the suit led, and the winner leads', () => {
  // A spade beats a higher card of the suit led, and the highest spade wins.
  const s = rig(S, 4, { 'hand:0': ['AH', '9C'], 'hand:1': ['2S', '2C'], 'hand:2': ['3S', '3C'], 'hand:3': ['KH', '4C'] },
    { phase: 'play', turn: 0, pub: { led: 0, bids: [1, 1, 1, 1], took: [0, 0, 0, 0] } });
  let st = yes(S, s, 0, { type: 'play', cards: ['AH'] }).state;
  st = yes(S, st, 1, { type: 'play', cards: ['2S'] }).state;
  st = yes(S, st, 2, { type: 'play', cards: ['3S'] }).state;
  const r = yes(S, st, 3, { type: 'play', cards: ['KH'] });
  assert.equal(r.state.pub.took[2], 1, 'the 3 of spades is the highest spade');
  assert.deepEqual(r.state.zones['won:2'], ['AH', '2S', '3S', 'KH']);
  assert.deepEqual(r.state.turn, [2], 'the winner leads');
  assert.equal(r.state.pub.led, 2);
  assert.equal(r.state.pub.tricks, 1);
  // No spade: the highest card of the suit led wins, and a high off-suit card does not.
  const t = rig(S, 4, { 'hand:0': ['5H', '9C'], 'hand:1': ['AD', '2C'], 'hand:2': ['KH', '3C'], 'hand:3': ['9H', '4C'] },
    { phase: 'play', turn: 0, pub: { led: 0, bids: [1, 1, 1, 1], took: [0, 0, 0, 0] } });
  let u = yes(S, t, 0, { type: 'play', cards: ['5H'] }).state;
  u = yes(S, u, 1, { type: 'play', cards: ['AD'] }).state;
  u = yes(S, u, 2, { type: 'play', cards: ['KH'] }).state;
  const w = yes(S, u, 3, { type: 'play', cards: ['9H'] });
  assert.equal(w.state.pub.took[2], 1);
  assert.deepEqual(w.state.turn, [2]);
  assert.equal(S.status(w.state), 'Any card but a spade may lead.');
  // Winner by ace high; the trick can be led around from a player who is not seat 0.
  const x = rig(S, 4, { 'hand:1': ['TC', '2D'], 'hand:2': ['AC', '3D'], 'hand:3': ['2C', '4D'], 'hand:0': ['KC', '5D'] },
    { phase: 'play', turn: 1, pub: { led: 1, bids: [1, 1, 1, 1], took: [0, 0, 0, 0] } });
  let y = yes(S, x, 1, { type: 'play', cards: ['TC'] }).state;
  y = yes(S, y, 2, { type: 'play', cards: ['AC'] }).state;
  y = yes(S, y, 3, { type: 'play', cards: ['2C'] }).state;
  assert.equal(yes(S, y, 0, { type: 'play', cards: ['KC'] }).state.pub.took[2], 1, 'ace is high');
});

// A table one card from the end of a deal. Player 3 plays the last card; w is the player who takes the last trick.
// bids and the final books (tookFinal, adding to 13) are given; the table is set so the last trick adds the last book.
function last(w, bids, tookFinal, more) {
  const took = tookFinal.slice();
  took[w]--;
  const trick = w === 3 ? ['2H', '3H', '4H'] : ['2H', '3H', '4H'].map((c, i) => (i === w ? 'AS' : c));
  const mine = w === 3 ? ['AS'] : ['2C'];
  const o = more || {};
  return rig(S, 4, { 'hand:3': mine, trick }, { phase: 'play', turn: 3, opts: o.opts, pub: Object.assign({ led: 0, bids, took, tricks: 12, bags: [0, 0], scores: [0, 0, 0, 0], broken: true }, o.pub) });
}
const finish = (w, bids, tookFinal, more) => {
  const s = last(w, bids, tookFinal, more);
  const card = w === 3 ? 'AS' : '2C';
  return yes(S, s, 3, { type: 'play', cards: [card] }).state;
};

test('Spades scoring: a bid made scores 10 a book and 1 a bag for each book over', () => {
  // Side 0 (players 0 and 2) bids 3 + 2 = 5 and takes 7. Side 1 bids 2 + 3 = 5 and takes 6.
  const r = finish(3, [3, 2, 2, 3], [4, 3, 3, 3]);
  assert.deepEqual(r.pub.bags, [2, 1]);
  assert.deepEqual(r.pub.scores, [52, 51, 52, 51]);
  assert.equal(r.pub.round, 1, 'the next deal begins');
});

test('Spades scoring: a bid missed loses 10 for each book bid', () => {
  const r = finish(1, [4, 3, 4, 2], [3, 4, 3, 3]);
  // Side 0 bid 8 and took 6: minus 80. Side 1 bid 5 and took 7: 52.
  assert.deepEqual(r.pub.scores, [-80, 52, -80, 52]);
  assert.deepEqual(r.pub.bags, [0, 2]);
});

test('Spades scoring: a nil made earns the side 100, and the partner bid is scored as usual', () => {
  const r = finish(3, [0, 3, 4, 2], [0, 5, 5, 3]);
  // Side 0: nil made +100, partner bid 4 and the side took 5: 40 + 1. Side 1: bid 5, took 8.
  assert.deepEqual(r.pub.scores, [141, 53, 141, 53]);
  assert.deepEqual(r.pub.bags, [1, 3]);
});

test('Spades scoring: a nil failed costs the side 100, and the books still count for the side', () => {
  const r = finish(3, [0, 3, 4, 2], [2, 4, 3, 4]);
  // Side 0: nil failed -100. Its books are 2 + 3 = 5 against the partner's bid of 4: 40 + 1 and one bag.
  assert.deepEqual(r.pub.scores, [-59, 53, -59, 53]);
  assert.deepEqual(r.pub.bags, [1, 3]);
  // The books of the failed nil can also save a bid that would have been missed.
  const m = finish(3, [0, 3, 6, 1], [2, 4, 4, 3]);
  assert.equal(m.pub.scores[0], -100 + 60, 'books 6 meet the bid of 6');
  assert.equal(m.pub.bags[0], 0);
});

test('Spades scoring: both partners nil score only their nil results, and their books are single points and bags', () => {
  const made = finish(3, [0, 3, 0, 2], [0, 6, 0, 7]);
  assert.equal(made.pub.scores[0], 200);
  assert.equal(made.pub.bags[0], 0);
  const mixed = finish(3, [0, 3, 0, 2], [0, 5, 3, 5]);
  // One nil made (+100), one failed (-100), and 3 books: 3 points and 3 bags.
  assert.equal(mixed.pub.scores[0], 3);
  assert.equal(mixed.pub.bags[0], 3);
  const both = finish(3, [0, 3, 0, 2], [1, 5, 2, 5]);
  assert.equal(both.pub.scores[0], -197);
  assert.equal(both.pub.bags[0], 3);
});

test('Spades scoring: ten bags cost 100 points and come off the count', () => {
  const s = finish(3, [3, 2, 2, 3], [4, 3, 3, 3], { pub: { bags: [8, 0] } });
  // 52 points and 2 bags make 10: minus 100, and the bags go back to 0.
  assert.deepEqual(s.pub.scores, [-48, 51, -48, 51]);
  assert.deepEqual(s.pub.bags, [0, 1]);
  const t = finish(3, [3, 2, 2, 3], [4, 3, 3, 3], { pub: { bags: [9, 9] } });
  assert.deepEqual(t.pub.bags, [1, 0], 'side 0 had 9 and took 2: 11 less 10; side 1 had 9 and took 1: exactly 10');
  assert.deepEqual(t.pub.scores, [-48, -49, -48, -49]);
  const u = finish(3, [3, 2, 2, 3], [4, 3, 3, 3], { pub: { bags: [5, 0] } });
  assert.deepEqual(u.pub.bags, [7, 1]);
  assert.deepEqual(u.pub.scores, [52, 51, 52, 51], 'no penalty below ten');
});

test('Spades scoring: partners show the same score, and an earlier score carries on', () => {
  const r = finish(3, [3, 2, 2, 3], [4, 3, 3, 3], { pub: { scores: [100, 40, 100, 40] } });
  assert.deepEqual(r.pub.scores, [152, 91, 152, 91]);
  assert.equal(r.pub.scores[0], r.pub.scores[2]);
  assert.equal(r.pub.scores[1], r.pub.scores[3]);
});

test('Spades: notes read as described', () => {
  const s = T.create(S, { players: 4, rand: C.seeded(4) }).state;
  assert.deepEqual(s.pub.notes, ['', '', '', '']);
  let a = yes(S, s, 0, { type: 'bid', n: 3 }).state;
  assert.deepEqual(a.pub.notes, ['Bid 3', '', '', '']);
  a = yes(S, a, 1, { type: 'bid', n: 0 }).state;
  assert.deepEqual(a.pub.notes, ['Bid 3', 'Nil', '', '']);
  a = yes(S, a, 2, { type: 'bid', n: 2 }).state;
  a = yes(S, a, 3, { type: 'bid', n: 4 }).state;
  assert.deepEqual(a.pub.notes, ['Bid 3, took 0', 'Nil, took 0', 'Bid 2, took 0', 'Bid 4, took 0']);
  // A trick taken shows at once.
  const t = rig(S, 4, { 'hand:0': ['5H', '9C'], 'hand:1': ['2H', '2C'], 'hand:2': ['3H', '3C'], 'hand:3': ['AH', '4C'] },
    { phase: 'play', turn: 0, pub: { led: 0, bids: [3, 0, 2, 4], took: [0, 0, 0, 0], notes: ['Bid 3, took 0', 'Nil, took 0', 'Bid 2, took 0', 'Bid 4, took 0'] } });
  let u = t;
  for (const [p, c] of [[0, '5H'], [1, '2H'], [2, '3H'], [3, 'AH']]) u = yes(S, u, p, { type: 'play', cards: [c] }).state;
  assert.deepEqual(u.pub.notes, ['Bid 3, took 0', 'Nil, took 0', 'Bid 2, took 0', 'Bid 4, took 1']);
});

test('Spades: status and the play hint', () => {
  const s = rig(S, 4, { 'hand:0': ['5H', '9C'], 'hand:1': ['2H'], 'hand:2': ['3H'], 'hand:3': ['AH'] },
    { phase: 'play', turn: 0, pub: { led: 0, bids: [1, 1, 1, 1], took: [0, 0, 0, 0] } });
  assert.deepEqual(T.hints(S, s, 0).play, { type: 'play', label: 'Play', cards: ['5H', '9C'], min: 1, max: 1, choose: null });
  assert.deepEqual(T.hints(S, s, 0).buttons, []);
  assert.equal(T.hints(S, s, 1), null);
  const a = yes(S, s, 0, { type: 'play', cards: ['5H'] }).state;
  assert.equal(S.status(a), 'Hearts led.');
  const b = rig(S, 4, { 'hand:0': ['5H'], trick: ['2D'] }, { phase: 'play', turn: 0, pub: { led: 3, bids: [1, 1, 1, 1], took: [0, 0, 0, 0] } });
  assert.equal(S.status(b), 'Diamonds led.');
  assert.equal(S.status({ over: {}, zones: { trick: [] }, pub: {} }), 'Game over.');
});

test('Spades ends when a side reaches the target: the higher score wins, and both partners win', () => {
  const s = finish(3, [3, 2, 2, 3], [4, 3, 3, 3], { pub: { scores: [450, 300, 450, 300] } });
  assert.deepEqual(s.over, { winners: [0, 2], scores: [502, 351] });
  assert.deepEqual(s.turn, []);
  // Side 1 may win too.
  const t = finish(3, [3, 2, 2, 3], [4, 3, 3, 3], { pub: { scores: [100, 450, 100, 450] } });
  assert.deepEqual(t.over, { winners: [1, 3], scores: [152, 501] });
  // Both pass the target: the higher wins.
  const u = finish(3, [3, 2, 2, 3], [4, 3, 3, 3], { pub: { scores: [480, 490, 480, 490] } });
  assert.deepEqual(u.over, { winners: [1, 3], scores: [532, 541] });
  // Below the target the game goes on.
  const v = finish(3, [3, 2, 2, 3], [4, 3, 3, 3], { pub: { scores: [100, 100, 100, 100] } });
  assert.equal(v.over, null);
  assert.equal(v.phase, 'bid');
  // A different target is used.
  const w = finish(3, [3, 2, 2, 3], [4, 3, 3, 3], { opts: { target: 50 } });
  assert.deepEqual(w.over, { winners: [0, 2], scores: [52, 51] });
});

test('Spades: level scores at or over the target play another deal', () => {
  const s = finish(3, [3, 2, 2, 3], [4, 3, 3, 3], { opts: { target: 100 }, pub: { scores: [48, 49, 48, 49] } });
  assert.deepEqual(s.pub.scores, [100, 100, 100, 100]);
  assert.equal(s.over, null);
  assert.equal(s.pub.round, 1);
  assert.equal(s.phase, 'bid');
  assert.equal(s.zones['hand:0'].length, 13);
});

// ---------- whole games by chance ----------
const SPEC = {
  secret: (s, v) => { const out = [...s.zones.draw]; for (let q = 0; q < s.n; q++) { out.push(...s.zones['won:' + q]); if (q !== v) out.push(...s.zones['hand:' + q]); } return out; },
  open: (s) => s.zones.trick.slice(),
  faceUp: 'trick',
  // Bids are 2 to 4 (nil is tested by hand above; chance play fails a nil so often that games would seldom end);
  // everything else is picked as the kit does.
  pick(game, s, p, h, rand) {
    if (h.buttons && h.buttons.length && h.buttons[0].type === 'bid') return { type: 'bid', n: 2 + Math.floor(rand() * 3) };
    return pickMove(h, rand);
  },
};

test('Spades: whole games by chance end, keep every hand private and never name a card in a public event', () => {
  let games = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const end = playOut(S, 4, seed * 31, { target: 100 }, SPEC);
    assert.ok(end.over, 'the game ended');
    assert.equal(end.over.winners.length, 2);
    assert.ok(end.over.winners[0] % 2 === end.over.winners[1] % 2, 'winners are partners');
    const [a, b] = end.over.scores;
    assert.ok(Math.max(a, b) >= 100 && a !== b);
    assert.equal(end.over.winners[0] % 2, a > b ? 0 : 1);
    assert.deepEqual(end.pub.scores, [a, b, a, b]);
    games++;
  }
  assert.equal(games, 10);
});

test('Spades: a spade led by a player who holds nothing else breaks spades, and a side sunk to the floor ends the game', () => {
  const pub = { round: 0, scores: [0, 0, 0, 0], teams: [0, 1, 0, 1], bags: [0, 0], bids: [1, 1, 1, 1], took: [0, 0, 0, 0], notes: ['', '', '', ''], broken: false, tricks: 0, led: 0 };
  let s = rig(S, 4, { 'hand:0': ['2S', '3S'], 'hand:1': ['4H', '5H'], 'hand:2': ['6D', '7D'], 'hand:3': ['8C', '9C'] }, { pub, turn: 0, phase: 'play', only: true });
  s = yes(S, s, 0, { type: 'play', cards: ['2S'] }).state;
  assert.equal(s.pub.broken, true);
  // Side 0 bid 10 between them and takes nothing: 100 off, down to 250 below nothing, past the floor. Side 1 wins.
  const low = Object.assign({}, pub, { scores: [-150, 40, -150, 40], bids: [5, 1, 5, 1], broken: true, tricks: 12 });
  let e = rig(S, 4, { 'hand:0': ['2H'], 'hand:1': ['AH'], 'hand:2': ['3H'], 'hand:3': ['4H'] }, { pub: low, turn: 0, phase: 'play', only: true });
  for (const [p, c] of [[0, '2H'], [1, 'AH'], [2, '3H'], [3, '4H']]) e = yes(S, e, p, { type: 'play', cards: [c] }).state;
  assert.deepEqual(e.over, { winners: [1, 3], scores: [-250, 20] });
});
