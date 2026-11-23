// The test kit every card game is held against (cards/README.md, "Testing a game"). A game's own test file says which
// cards are secret from whom, in its own words and apart from the engine, and this plays whole games by chance and
// holds every view and every event against that list.
'use strict';
const assert = require('node:assert/strict');
const C = require('../src/cards.js');
const T = require('../src/table.js');

// A table set by hand. set: the zones to fill. Cards not named go under `rest` (the pack unless told otherwise).
// more: { pub, turn, phase, opts, rest, only }. only: the pack is just the cards named (a small table for one rule).
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
// A move that must be allowed (answers the result), and one that must be refused with words matching `re`.
const yes = (game, s, p, m) => { const r = T.move(game, s, p, m, C.seeded(3)); assert.ok(r.ok, r.error + ' ' + (r.bug || '')); return r; };
const no = (game, s, p, m, re) => { const r = T.move(game, s, p, m); assert.equal(r.ok, false, 'should be refused: ' + JSON.stringify(m)); assert.ok(!r.bug, r.bug); assert.match(r.error, re); assert.equal(r.state, s); };

const quoted = (text, card) => text.includes('"' + card + '"');
const valueOf = (x) => (x && typeof x === 'object' ? x.v : x);

// A move the hints allow, picked by chance: the cards to play (and the extra choice when one is asked for), or a button.
function pickMove(h, rand) {
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const options = [];
  // A button may ask one more thing (a bid): the answer is picked by chance too.
  for (const b of h.buttons || []) { const m = { type: b.type }; if (b.choose) m[b.choose.field] = valueOf(pick(b.choose.from)); options.push(m); }
  // The move made with cards, and any more the turn offers (plays).
  for (const p of [h.play].concat(h.plays || [])) {
    if (!p || p.cards.length < p.min) continue;
    const cards = C.shuffle(p.cards, rand).slice(0, p.min), m = { type: p.type, cards };
    if (p.choose && (!p.choose.cards || p.choose.cards.includes(cards[0]))) m[p.choose.field] = valueOf(pick(p.choose.from));
    options.push(m, m);   // playing is twice as likely as a button, so a game does not only draw
  }
  assert.ok(options.length, 'there is always something a player may do');
  return pick(options);
}

// spec, written by the game's own test file:
//   secret(s, viewer)  every card the viewer may NOT see in state s (viewer null: the big screen and everyone)
//   open(s)            every card lying face up for all in state s
//   faceUp             the zone (or zones) a player lays a card in for all to see
//   pick(game, s, p, hints, rand)   optional: this game's own way to pick a move by chance
function holdPrivate(game, before, r, spec) {
  const s = r.state, pub = JSON.stringify(T.view(game, s, null)) + ' ' + (game.status ? game.status(s) : '');
  assert.ok(pub.length < 950, 'the public table fits one relay message: ' + pub.length);
  for (let v = -1; v < s.n; v++) {
    const viewer = v < 0 ? null : v;
    const mine = viewer === null ? '' : JSON.stringify(T.mine(game, s, viewer));
    assert.ok(mine.length < 950, 'a hand fits one relay message: ' + mine.length);
    const text = viewer === null ? pub : pub + mine + JSON.stringify(T.view(game, s, viewer));
    const secret = spec.secret(s, viewer);
    for (const c of secret) assert.ok(!quoted(text, c), 'card ' + c + ' reached ' + (viewer === null ? 'the big screen' : 'player ' + viewer) + ' at move ' + s.seq);
    assert.deepEqual(T.hidden(game, s, viewer).slice().sort(), secret.slice().sort(), 'the engine and the game agree on what is hidden');
  }
  // Events go to everyone. A face in one must have been on the table for all to see before the move or after it, or
  // have been laid face up by its own holder in this very move (the last card of a trick is played and taken at once).
  const open = new Set([...spec.open(before), ...spec.open(s)]), faceUp = [].concat(spec.faceUp || []);
  for (const e of r.events) {
    if (e.ev === 'move') {
      if (faceUp.includes(e.to) && e.by !== undefined && e.from.endsWith(':' + e.by)) for (const c of e.cards || []) open.add(c);
      for (const c of e.cards || []) assert.ok(open.has(c), 'event showed ' + c + ' at move ' + s.seq);
      continue;
    }
    const text = JSON.stringify(e);
    for (const c of s.pack) assert.ok(!quoted(text, c), 'a ' + e.ev + ' event named card ' + c);
  }
}

// One whole game: whoever may act makes a move the hints allow, picked by chance. Now and then someone also tries
// what they may not (a card that does not fit, someone else's card, a move out of turn) and must be refused.
// Answers the state at the end. The game must end within 20,000 moves.
function playOut(game, n, seed, opts, spec) {
  const rand = C.seeded(seed), pick = (list) => list[Math.floor(rand() * list.length)];
  let state = T.create(game, { players: n, rand, opts }).state;
  holdPrivate(game, state, { state, events: [] }, spec);
  let moves = 0;
  while (!state.over) {
    assert.ok(++moves < 20000, 'the game ends');
    assert.ok(state.turn.length, 'while a game is on, someone may act');
    const p = pick(state.turn), h = T.hints(game, state, p);
    assert.ok(h, 'a player whose turn it is has hints');
    if (h.play && rand() < 0.15) {
      const others = state.zones['hand:' + ((p + 1) % n)] || [], out = Array.from({ length: n }, (_, q) => q).filter((q) => !state.turn.includes(q));
      const bad = [];
      if (others.length >= h.play.min) bad.push([p, { type: h.play.type, cards: others.slice(0, h.play.min) }]);
      const unfit = (state.zones['hand:' + p] || []).filter((c) => !h.play.cards.includes(c));
      if (unfit.length && h.play.min === 1) bad.push([p, { type: h.play.type, cards: [unfit[0]] }]);
      if (out.length) bad.push([out[0], { type: h.play.type, cards: (state.zones['hand:' + out[0]] || []).slice(0, h.play.min) }]);
      for (const [q, m] of bad) { const r = T.move(game, state, q, m, rand); assert.equal(r.ok, false, JSON.stringify(m)); assert.ok(!r.bug, r.bug); assert.equal(r.state, state); }
    }
    const m = spec.pick ? spec.pick(game, state, p, h, rand) : pickMove(h, rand);
    const r = T.move(game, state, p, m, rand);
    assert.ok(r.ok, r.error + ' ' + (r.bug || '') + ' ' + JSON.stringify(m));
    holdPrivate(game, state, r, spec);
    state = r.state;
  }
  return state;
}

module.exports = { rig, yes, no, quoted, pickMove, holdPrivate, playOut };
