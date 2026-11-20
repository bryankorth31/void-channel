// PLAY couch mode (plan T18): each pad keeps its seat all game. A dropped pad's seat is held for it, the same pad
// coming back gets it again, a different pad picked up in its place takes it, and an extra pad plays as player 1.
// Run: node --test "play/test/*.test.js"
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const PLAY = path.join(__dirname, '..');
const Hub = require('../src/hub.js');
const Cards = require('../src/cards.js');
const card = (id) => JSON.parse(fs.readFileSync(path.join(PLAY, 'cards', id + '.json'), 'utf8'));

function pad(index, held, id) {
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
  for (const name of held || []) buttons[Hub.BUTTONS[name]] = { pressed: true, value: 1 };
  return { index, id: id || 'Xbox pad', mapping: 'standard', buttons, axes: [0, 0] };
}

function couch(id) {
  const sent = [], seats = [];
  const c = card(id);
  const hub = Hub.createHub({ send: (k, d) => { if (d) sent.push(k); }, onSeat: (s, w) => seats.push(w + ' ' + s) });
  hub.setCard(c, Cards.gamepadMap(c));
  const A = Cards.gamepadMap(c).A, as = (n) => A.replace('P1:', 'P' + n + ':');
  return { hub, sent, seats, as };
}

test('two pads on a two-player game: the first is player 1, the second player 2', () => {
  const { hub, sent, seats, as } = couch('golden-axe-genesis');
  hub.pollPads([pad(0, ['A']), pad(1, ['A'])]);
  assert.deepEqual(sent, [as(1), as(2)]);
  assert.deepEqual(seats, ['joined 1', 'joined 2']);
});

test('player 1 drops: player 2 stays player 2, and player 1 gets their seat back', () => {
  const { hub, sent, seats, as } = couch('golden-axe-genesis');
  hub.pollPads([pad(0), pad(1)]);
  hub.pollPads([null, pad(1, ['A'])]);           // pad 0's battery dies
  assert.deepEqual(sent, [as(2)], 'the old order rule would have made it player 1');
  hub.pollPads([null, pad(1)]);
  hub.pollPads([pad(2, ['A']), pad(1)]);          // it comes back at a new index
  assert.deepEqual(sent, [as(2), as(1)]);
  assert.deepEqual(seats, ['joined 1', 'joined 2', 'away 1', 'back 1']);
});

test('a different pad picked up in place of a dead one takes the held seat', () => {
  const { hub, sent, as } = couch('super-mario-world');
  hub.pollPads([pad(0), pad(1)]);
  hub.pollPads([pad(0)]);
  hub.pollPads([pad(0), null, pad(2, ['A'], 'Some other pad')]);
  assert.deepEqual(sent, [as(2)]);
});

test('a one-player game: a second pad plays as player 1 too, never on a port nobody plugged in', () => {
  const { hub, sent, seats, as } = couch('punch-out-nes');
  hub.pollPads([pad(0), pad(1, ['A'])]);
  assert.ok(sent.every((k) => k.startsWith('P1:')), sent.join());
  assert.deepEqual(seats, ['joined 1']);
});

test('the page pauses when a playing pad drops and says who; a two-player card says each pad keeps its player', () => {
  const js = fs.readFileSync(path.join(PLAY, 'src', 'play.js'), 'utf8');
  for (const bit of ['onSeat: seatNote', "if (what === 'away') {\n      if (started && !paused) setPaused(true);",
    "a second gamepad plays as player 2, and each pad keeps its player all game"]) assert.ok(js.includes(bit), bit);
});
