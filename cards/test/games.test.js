// The games as rule files (cards/games/): each game's own rules, and then many whole games played by chance with every
// view and every event held against the privacy rule: no screen is ever given a card it may not see.
// Run: node --test "cards/test/*.test.js"
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/cards.js');
const T = require('../src/table.js');
const CE = require('../games/crazy-eights.js');
const H = require('../games/hearts.js');

// A table set by hand. set: the zones to fill. Cards not named go under `rest` (the pack unless told otherwise);
// only: the pack is just the cards named (a small table for one rule).
function rig(game, n, set, more) {
  const o = more || {};
  const s = T.create(game, { players: n, rand: C.seeded(1), opts: o.opts }).state;
  const named = Object.values(set).flat();
  for (const id of Object.keys(s.zones)) s.zones[id] = [];
  for (const id of Object.keys(set)) s.zones[id] = set[id].slice();
  if (o.only) s.pack = named.slice();
  else { const rest = o.rest || 'draw'; s.zones[rest] = s.pack.filter((c) => !named.includes(c)).concat(s.zones[rest]); }
  Object.assign(s.pub, o.pub);
  if (o.turn !== undefined) s.turn = [].concat(o.turn);
  if (o.phase) s.phase = o.phase;
  return s;
}
const yes = (game, s, p, m) => { const r = T.move(game, s, p, m, C.seeded(3)); assert.ok(r.ok, r.error + ' ' + (r.bug || '')); return r; };
const no = (game, s, p, m, re) => { const r = T.move(game, s, p, m); assert.equal(r.ok, false, 'should be refused: ' + JSON.stringify(m)); assert.ok(!r.bug, r.bug); assert.match(r.error, re); assert.equal(r.state, s); };

// ---------- Crazy Eights ----------
test('Crazy Eights deals 7 each to two players and 5 each to more, and turns up a card that is not an eight', () => {
  for (let seed = 1; seed <= 40; seed++) {
    for (const n of [2, 3, 7]) {
      const s = T.create(CE, { players: n, rand: C.seeded(seed) }).state;
      for (let p = 0; p < n; p++) assert.equal(s.zones['hand:' + p].length, n === 2 ? 7 : 5);
      assert.equal(s.zones.discard.length, 1);
      assert.notEqual(C.rankOf(s.zones.discard[0]), '8');
      assert.equal(s.pub.suit, C.suitOf(s.zones.discard[0]));
      assert.equal(s.zones.draw.length, 52 - 1 - n * (n === 2 ? 7 : 5));
      assert.deepEqual(s.turn, [0]);
    }
  }
  assert.throws(() => T.create(CE, { players: 8 }), /2 to 7 players/);
});

test('Crazy Eights: a card must match the pile in suit or number; an eight goes on anything and names the suit', () => {
  const s = rig(CE, 2, { 'hand:0': ['7H', '9C', '8S', 'KD'], 'hand:1': ['2C', '3C', '5H'], discard: ['7D'] }, { pub: { suit: 'D' }, turn: 0 });
  no(CE, s, 0, { type: 'play', cards: ['9C'] }, /does not match\. Play diamonds, a 7 or any 8\./);
  no(CE, s, 0, { type: 'play', cards: ['8S'] }, /Name a suit/);
  no(CE, s, 0, { type: 'play', cards: ['8S'], suit: 'stars' }, /Name a suit/);
  no(CE, s, 0, { type: 'play', cards: ['2C'] }, /do not hold/);
  assert.equal(yes(CE, s, 0, { type: 'play', cards: ['7H'] }).state.pub.suit, 'H', 'the same number changes the suit');
  assert.equal(yes(CE, s, 0, { type: 'play', cards: ['KD'] }).state.pub.suit, 'D', 'the same suit');
  const r = yes(CE, s, 0, { type: 'play', cards: ['8S'], suit: 'C' });
  assert.equal(r.state.pub.suit, 'C');
  assert.deepEqual(r.state.turn, [1]);
  assert.deepEqual(r.state.zones.discard, ['7D', '8S']);
  assert.deepEqual(r.events, [{ ev: 'move', from: 'hand:0', to: 'discard', n: 1, cards: ['8S'], by: 0 }, { ev: 'called', by: 0, suit: 'C' }]);
  assert.equal(CE.status(r.state), 'Play clubs or any 8.');
  no(CE, r.state, 1, { type: 'play', cards: ['5H'] }, /does not match/);
  assert.equal(yes(CE, r.state, 1, { type: 'play', cards: ['3C'] }).state.pub.suit, 'C', 'the suit that was named is followed');
});

test('Crazy Eights: you may draw while there are cards, the drawn card is yours alone, and you cannot pass instead', () => {
  const s = rig(CE, 2, { 'hand:0': ['9C'], 'hand:1': ['2C'], discard: ['7D'] }, { pub: { suit: 'D' }, turn: 0 });
  no(CE, s, 0, { type: 'pass' }, /Draw a card first/);
  const r = yes(CE, s, 0, { type: 'draw' });
  assert.equal(r.state.zones['hand:0'].length, 2);
  assert.deepEqual(r.state.turn, [0], 'the turn stays with whoever drew');
  assert.deepEqual(r.events, [{ ev: 'move', from: 'draw', to: 'hand:0', n: 1, by: 0 }], 'the event has no face');
  assert.equal(r.state.pub.drew, 1);
});

test('Crazy Eights: when the pack runs out, the pile under its top card becomes the new pack', () => {
  const s = rig(CE, 2, { 'hand:0': ['9C'], 'hand:1': ['2C'], discard: ['7D'] }, { pub: { suit: 'D' }, turn: 0, rest: 'discard' });
  assert.equal(s.zones.draw.length, 0);
  assert.equal(s.zones.discard.length, 50);
  const r = yes(CE, s, 0, { type: 'draw' });
  assert.deepEqual(r.state.zones.discard, ['7D'], 'the top card stays');
  assert.equal(r.state.zones.draw.length, 48);
  assert.equal(r.state.zones['hand:0'].length, 2);
  assert.ok(r.events.every((e) => !e.cards), 'no face is shown as the pile is turned over');
});

test('Crazy Eights: with nothing to draw and nothing to play you pass; a full round of passes ends the game on points', () => {
  const s = rig(CE, 2, { 'hand:0': ['9C', 'KC'], 'hand:1': ['2C'], discard: ['7D'] }, { pub: { suit: 'D' }, turn: 0, only: true });
  no(CE, s, 0, { type: 'draw' }, /no cards left to draw/);
  assert.deepEqual(T.hints(CE, s, 0).buttons, [{ type: 'pass', label: 'Pass' }]);
  const a = yes(CE, s, 0, { type: 'pass' });
  assert.deepEqual(a.state.turn, [1]);
  assert.equal(a.state.over, null);
  const b = yes(CE, a.state, 1, { type: 'pass' });
  assert.deepEqual(b.state.over, { winners: [1], left: [19, 2] }, 'the fewest points in hand wins');
  // Holding a card that fits, with nothing to draw, you must play it.
  const t = rig(CE, 2, { 'hand:0': ['9D', 'KC'], 'hand:1': ['2C'], discard: ['7D'] }, { pub: { suit: 'D' }, turn: 0, only: true });
  no(CE, t, 0, { type: 'pass' }, /You have a card you can play/);
});

test('Crazy Eights: the first player out of cards wins, and a last eight needs no suit', () => {
  const s = rig(CE, 3, { 'hand:0': ['8S'], 'hand:1': ['2C', '8H'], 'hand:2': ['KD', 'AS', '5C'], discard: ['7D'] }, { pub: { suit: 'D' }, turn: 0 });
  const r = yes(CE, s, 0, { type: 'play', cards: ['8S'] });
  assert.deepEqual(r.state.over, { winners: [0], left: [0, 52, 16] });
  assert.deepEqual(r.state.turn, []);
  assert.equal(r.events[r.events.length - 1].ev, 'over');
  assert.equal(CE.points(['8H', 'KD', 'TC', 'AS', '5C']), 76);
});

test('Crazy Eights, house rule "draw one": after one draw you play or pass, and the game goes on', () => {
  const s = rig(CE, 2, { 'hand:0': ['9C'], 'hand:1': ['2C'], discard: ['7D'], draw: ['3S'] }, { pub: { suit: 'D' }, turn: 0, opts: { draws: 1 } });
  no(CE, s, 0, { type: 'pass' }, /Draw a card first/);
  const a = yes(CE, s, 0, { type: 'draw' });
  assert.deepEqual(a.state.zones['hand:0'], ['9C', '3S']);
  no(CE, a.state, 0, { type: 'draw' }, /You have drawn/);
  const b = yes(CE, a.state, 0, { type: 'pass' });
  assert.deepEqual(b.state.turn, [1]);
  assert.equal(b.state.pub.passes, 0, 'a pass with cards still in the pack does not count toward a blocked game');
  assert.equal(b.state.pub.drew, 0, 'the next player may draw one too');
});

test('Crazy Eights tells a phone what it may do: the cards that fit, the suit choice for an eight, and Draw', () => {
  const s = rig(CE, 2, { 'hand:0': ['7H', '9C', '8S', 'KD'], 'hand:1': ['2C'], discard: ['7D'] }, { pub: { suit: 'D' }, turn: 0 });
  const h = T.hints(CE, s, 0);
  assert.deepEqual(h.play, { type: 'play', label: 'Play', cards: ['7H', '8S', 'KD'], min: 1, max: 1, choose: { cards: ['8S'], field: 'suit', from: ['S', 'H', 'D', 'C'], title: 'Name a suit' } });
  assert.deepEqual(h.buttons, [{ type: 'draw', label: 'Draw a card' }]);
  assert.equal(T.hints(CE, s, 1), null);
});

// ---------- Hearts ----------
test('Hearts deals every card: 13 each to four, 17 to three without the 2 of diamonds, 10 to five without two 2s', () => {
  for (const [n, each, gone] of [[4, 13, []], [3, 17, ['2D']], [5, 10, ['2D', '2C']]]) {
    const s = T.create(H, { players: n, rand: C.seeded(n) }).state;
    for (let p = 0; p < n; p++) assert.equal(s.zones['hand:' + p].length, each);
    assert.equal(s.zones.draw.length, 0);
    for (const c of gone) assert.ok(!s.pack.includes(c));
    assert.equal(s.phase, 'pass');
    assert.deepEqual(s.turn, Array.from({ length: n }, (_, p) => p), 'everyone passes at once');
  }
  assert.throws(() => T.create(H, { players: 2 }), /3 to 5 players/);
  assert.equal(H.opener({ pack: C.standard({ without: ['2D', '2C'] }) }), '3C');
});

test('Hearts: the pass goes left, right, across, then not at all; three or five players skip across', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map((round) => H.passTo({ n: 4, pub: { round } })), [1, -1, 2, 0, 1]);
  assert.deepEqual([0, 1, 2, 3].map((round) => H.passTo({ n: 3, pub: { round } })), [1, -1, 0, 1]);
});

test('Hearts: everyone passes 3 cards at once and unseen; nothing moves until the last player has chosen', () => {
  let s = T.create(H, { players: 4, rand: C.seeded(11) }).state;
  const start = [0, 1, 2, 3].map((p) => s.zones['hand:' + p].slice());
  const picks = start.map((h) => h.slice(0, 3));
  no(H, s, 0, { type: 'play', cards: [start[0][0]] }, /Pick 3 cards to pass first/);
  no(H, s, 0, { type: 'pass', cards: start[0].slice(0, 2) }, /Pick 3 cards/);
  const seen = [];
  for (const p of [2, 0, 3]) {
    const r = yes(H, s, p, { type: 'pass', cards: picks[p] });
    seen.push(...r.events); s = r.state;
    assert.equal(s.phase, 'pass');
  }
  assert.deepEqual(s.turn, [1], 'only the player who has not chosen is waited for');
  assert.deepEqual(s.zones['hand:1'], start[1], 'nobody receives a card early');
  assert.deepEqual(T.view(H, s, 0).zones['pass:0'], { n: 3, cards: picks[0] }, 'a player still sees what they chose');
  assert.deepEqual(T.view(H, s, 1).zones['pass:0'], { n: 3 });
  no(H, s, 0, { type: 'pass', cards: s.zones['hand:0'].slice(0, 3) }, /not your turn/);
  const r = yes(H, s, 1, { type: 'pass', cards: picks[1] });
  seen.push(...r.events); s = r.state;
  assert.equal(s.phase, 'play');
  for (let p = 0; p < 4; p++) {
    assert.equal(s.zones['hand:' + p].length, 13);
    for (const c of picks[p]) assert.ok(s.zones['hand:' + ((p + 1) % 4)].includes(c), 'the cards went to the left');
    assert.equal(s.zones['pass:' + p].length, 0);
  }
  assert.ok(seen.every((e) => !e.cards), 'no event of the pass shows a face');
  const leader = [0, 1, 2, 3].find((p) => s.zones['hand:' + p].includes('2C'));
  assert.deepEqual(s.turn, [leader], 'whoever holds the 2 of clubs leads');
  assert.equal(s.pub.led, leader);
});

test('Hearts: the 2 of clubs leads, suit is followed, the first trick is clean, hearts wait until broken', () => {
  const pub = { round: 0, scores: [0, 0, 0, 0], taken: [0, 0, 0, 0], broken: false, tricks: 0, led: 0 };
  let s = rig(H, 4, { 'hand:0': ['2C', '5H', '9D'], 'hand:1': ['KC', '3H', 'QS'], 'hand:2': ['4C', '7S', 'AD'], 'hand:3': ['AH', '6H', 'QD'] }, { pub, turn: 0, phase: 'play', only: true });
  no(H, s, 0, { type: 'play', cards: ['9D'] }, /2 of clubs leads the first trick/);
  assert.deepEqual(T.hints(H, s, 0).play.cards, ['2C']);
  s = yes(H, s, 0, { type: 'play', cards: ['2C'] }).state;
  no(H, s, 1, { type: 'play', cards: ['3H'] }, /Follow suit: play one of your clubs/);
  s = yes(H, s, 1, { type: 'play', cards: ['KC'] }).state;
  s = yes(H, s, 2, { type: 'play', cards: ['4C'] }).state;
  no(H, s, 3, { type: 'play', cards: ['AH'] }, /No hearts and no queen of spades on the first trick/);
  let r = yes(H, s, 3, { type: 'play', cards: ['QD'] });
  s = r.state;
  assert.deepEqual(s.turn, [1], 'the king of clubs took the trick and leads');
  assert.deepEqual(s.zones.trick, []);
  assert.deepEqual(s.zones['won:1'], ['2C', 'KC', '4C', 'QD']);
  assert.deepEqual(r.events.slice(-2), [{ ev: 'trick', won: 1, led: 0 }, { ev: 'move', from: 'trick', to: 'won:1', n: 4, cards: ['2C', 'KC', '4C', 'QD'] }]);
  assert.deepEqual(T.view(H, s, null).zones['won:1'], { n: 4 }, 'taken tricks lie face down');
  no(H, s, 1, { type: 'play', cards: ['3H'] }, /Hearts cannot lead/);
  s = yes(H, s, 1, { type: 'play', cards: ['QS'] }).state;
  s = yes(H, s, 2, { type: 'play', cards: ['7S'] }).state;
  s = yes(H, s, 3, { type: 'play', cards: ['AH'] }).state;
  assert.equal(s.pub.broken, true);
  s = yes(H, s, 0, { type: 'play', cards: ['5H'] }).state;
  assert.deepEqual(s.pub.taken, [0, 15, 0, 0], 'the queen of spades is 13 and each heart 1');
  s = yes(H, s, 1, { type: 'play', cards: ['3H'] }).state;
  s = yes(H, s, 2, { type: 'play', cards: ['AD'] }).state;
  s = yes(H, s, 3, { type: 'play', cards: ['6H'] }).state;
  r = yes(H, s, 0, { type: 'play', cards: ['9D'] });
  s = r.state;
  assert.deepEqual(s.pub.scores, [0, 15, 0, 2], 'the deal is scored');
  assert.equal(s.pub.round, 1);
  assert.equal(s.phase, 'pass', 'and the next deal is out, passing to the right');
  assert.equal(T.hints(H, s, 0).play.label, 'Pass 3 cards to the right');
  for (let p = 0; p < 4; p++) assert.equal(s.zones['hand:' + p].length, 3);
});

test('Hearts: taking all 26 points gives them to everyone else, and the lowest score wins at the target', () => {
  const last = { 'hand:0': ['AH'], 'hand:1': ['2S'], 'hand:2': ['3S'], 'hand:3': ['4S'] };
  const moon = rig(H, 4, last, { pub: { round: 0, scores: [0, 0, 0, 0], taken: [25, 0, 0, 0], broken: true, tricks: 12, led: 0 }, turn: 0, phase: 'play', only: true });
  let s = moon;
  for (const [p, c] of [[0, 'AH'], [1, '2S'], [2, '3S'], [3, '4S']]) s = yes(H, s, p, { type: 'play', cards: [c] }).state;
  assert.deepEqual(s.pub.scores, [0, 26, 26, 26]);
  assert.equal(s.over, null);
  const end = rig(H, 4, last, { pub: { round: 0, scores: [90, 20, 5, 30], taken: [9, 3, 0, 13], broken: true, tricks: 12, led: 0 }, turn: 0, phase: 'play', only: true });
  s = end;
  for (const [p, c] of [[0, 'AH'], [1, '2S'], [2, '3S'], [3, '4S']]) s = yes(H, s, p, { type: 'play', cards: [c] }).state;
  assert.deepEqual(s.over, { winners: [2], scores: [100, 23, 5, 43] });
  assert.deepEqual(s.turn, []);
});

// ---------- Whole games by chance, held against the privacy rule ----------
// Written apart from the engine's own list (T.hidden), so a fault in the engine's idea of "hidden" is caught too.
const SECRET = {
  'crazy-eights': (s, v) => { const out = [...s.zones.draw, ...s.zones.discard.slice(0, -1)]; for (let q = 0; q < s.n; q++) if (q !== v) out.push(...s.zones['hand:' + q]); return out; },
  hearts: (s, v) => { const out = [...s.zones.draw]; for (let q = 0; q < s.n; q++) { out.push(...s.zones['won:' + q]); if (q !== v) out.push(...s.zones['hand:' + q], ...s.zones['pass:' + q]); } return out; },
};
const OPEN = { 'crazy-eights': (s) => s.zones.discard.slice(-1), hearts: (s) => s.zones.trick.slice() };
const FACE_UP = { 'crazy-eights': 'discard', hearts: 'trick' };   // where a player lays a card for all to see
const quoted = (text, card) => text.includes('"' + card + '"');

function holdPrivate(game, before, r) {
  const s = r.state, pub = JSON.stringify(T.view(game, s, null)) + ' ' + game.status(s);
  assert.ok(pub.length < 950, 'the public table fits one relay message: ' + pub.length);
  for (let v = -1; v < s.n; v++) {
    const viewer = v < 0 ? null : v;
    const mine = viewer === null ? '' : JSON.stringify(T.mine(game, s, viewer));
    assert.ok(mine.length < 950, 'a hand fits one relay message: ' + mine.length);
    const text = viewer === null ? pub : pub + mine + JSON.stringify(T.view(game, s, viewer));
    const secret = SECRET[game.id](s, viewer);
    for (const c of secret) assert.ok(!quoted(text, c), 'card ' + c + ' reached ' + (viewer === null ? 'the big screen' : 'player ' + viewer) + ' at move ' + s.seq);
    assert.deepEqual(T.hidden(game, s, viewer).slice().sort(), secret.slice().sort());
  }
  // Events go to everyone. A face in one must have been on the table for all to see before the move or after it, or
  // have been laid face up by its own holder in this very move (the last card of a trick is played and taken at once).
  const open = new Set([...OPEN[game.id](before), ...OPEN[game.id](s)]);
  for (const e of r.events) {
    if (e.ev === 'move') {
      if (e.to === FACE_UP[game.id] && e.from === 'hand:' + e.by) for (const c of e.cards || []) open.add(c);
      for (const c of e.cards || []) assert.ok(open.has(c), 'event showed ' + c + ' at move ' + s.seq);
      continue;
    }
    const text = JSON.stringify(e);
    for (const c of s.pack) assert.ok(!quoted(text, c), 'a ' + e.ev + ' event named card ' + c);
  }
}

// One whole game: whoever may act makes a move the hints allow, picked by chance. Now and then someone also tries
// what they may not (a card that does not fit, someone else's card, a move out of turn) and must be refused.
function playOut(game, n, seed, opts) {
  const rand = C.seeded(seed), pick = (list) => list[Math.floor(rand() * list.length)];
  let state = T.create(game, { players: n, rand, opts }).state;
  holdPrivate(game, state, { state, events: [] });
  let moves = 0;
  while (!state.over) {
    assert.ok(++moves < 20000, 'the game ends');
    const p = pick(state.turn), h = T.hints(game, state, p);
    assert.ok(h, 'a player whose turn it is has hints');
    if (rand() < 0.15) {
      const others = state.zones['hand:' + ((p + 1) % n)], out = Array.from({ length: n }, (_, q) => q).filter((q) => !state.turn.includes(q));
      const bad = [];
      if (others.length) bad.push([p, { type: h.play.type, cards: h.play.min === 3 ? others.slice(0, 3) : [others[0]] }]);
      const unfit = state.zones['hand:' + p].filter((c) => !h.play.cards.includes(c));
      if (unfit.length && h.play.min === 1) bad.push([p, { type: h.play.type, cards: [unfit[0]] }]);
      if (out.length) bad.push([out[0], { type: h.play.type, cards: state.zones['hand:' + out[0]].slice(0, h.play.min) }]);
      for (const [q, m] of bad) { const r = T.move(game, state, q, m, rand); assert.equal(r.ok, false, JSON.stringify(m)); assert.ok(!r.bug, r.bug); assert.equal(r.state, state); }
    }
    const options = h.buttons.map((b) => ({ type: b.type }));
    if (h.play.cards.length >= h.play.min) {
      const cards = C.shuffle(h.play.cards, rand).slice(0, h.play.min), m = { type: h.play.type, cards };
      if (h.play.choose && h.play.choose.cards.includes(cards[0])) m[h.play.choose.field] = pick(h.play.choose.from);
      options.push(m, m);   // playing is twice as likely as a button, so a game does not only draw
    }
    assert.ok(options.length, 'there is always something a player may do');
    const r = T.move(game, state, p, pick(options), rand);
    assert.ok(r.ok, r.error + ' ' + (r.bug || ''));
    holdPrivate(game, state, r);
    state = r.state;
  }
  return state;
}

test('Crazy Eights: 60 whole games by chance, 2 to 7 players, both draw rules: no screen is ever given a hidden card', () => {
  for (let n = 2; n <= 7; n++) {
    for (let seed = 1; seed <= 10; seed++) {
      const end = playOut(CE, n, seed * 100 + n, { draws: seed % 2 });
      assert.ok(end.over.winners.length >= 1);
      assert.equal(end.over.left.length, n);
      for (const w of end.over.winners) assert.equal(end.over.left[w], Math.min(...end.over.left));
    }
  }
});

test('Hearts: 18 whole games by chance, 3 to 5 players: no screen is ever given a hidden card, and the scores add up', () => {
  for (const n of [3, 4, 5]) {
    for (let seed = 1; seed <= 6; seed++) {
      const end = playOut(H, n, seed * 100 + n, { target: 40 });
      const total = end.over.scores.reduce((a, b) => a + b, 0), deals = end.pub.round + 1;
      assert.ok(Math.max(...end.over.scores) >= 40);
      assert.ok(total === deals * 26 || (total > deals * 26 && (total - deals * 26) % (26 * (n - 2)) === 0), 'each deal gives 26 points, or 26 to each other player on a moon: ' + total + ' over ' + deals);
      for (const w of end.over.winners) assert.equal(end.over.scores[w], Math.min(...end.over.scores));
    }
  }
});
