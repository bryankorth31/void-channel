// VoidTV PLAY: tests for the input hub. Licence: GPL-2.0-or-later (play/LICENSE).
// Couch Craft's rule: the game never sees a raw controller, only the hub's clean keys.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '..');
const Hub = require(path.join(ROOT, 'src', 'hub.js'));
const oregon = JSON.parse(fs.readFileSync(path.join(ROOT, 'cards', 'oregon-trail-1990.json'), 'utf8'));

function hubWith(card) {
  const sent = [], actions = [];
  const hub = Hub.createHub({ send: (code, down) => sent.push([code, down]), onAction: (a) => actions.push(a) });
  hub.setCard(card);
  return { hub, sent, actions };
}

// A pretend standard gamepad holding the named buttons.
function pad(index, held, axes) {
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
  for (const name of held || []) buttons[Hub.BUTTONS[name]] = { pressed: true, value: 1 };
  return { index, mapping: 'standard', buttons, axes: axes || [0, 0, 0, 0] };
}

test('a gamepad button becomes the card key for player 1', () => {
  const { hub, sent } = hubWith(oregon);
  hub.pollPads([pad(0, ['A'])]);
  assert.deepEqual(sent, [[oregon.gamepad.A, true]]);
  hub.pollPads([pad(0, ['A'])]);            // still held: nothing new
  assert.equal(sent.length, 1);
  hub.pollPads([pad(0, [])]);
  assert.deepEqual(sent, [[oregon.gamepad.A, true], [oregon.gamepad.A, false]]);
});

test('a touch press becomes the same key', () => {
  const { hub, sent } = hubWith(oregon);
  hub.touch('Enter', true, 1);
  hub.touch('Enter', false, 1);
  assert.deepEqual(sent, [['Enter', true], ['Enter', false]]);
});

test('a light press on an analog trigger counts only past half way', () => {
  const { hub, sent } = hubWith({ gamepad: { RT: 'KeyY' } });
  const p = pad(0, []);
  p.buttons[Hub.BUTTONS.RT] = { pressed: false, value: 0.3 };
  hub.pollPads([p]);
  assert.deepEqual(sent, []);
  p.buttons[Hub.BUTTONS.RT] = { pressed: false, value: 0.8 };
  hub.pollPads([p]);
  assert.deepEqual(sent, [['KeyY', true]]);
});

test('three sources on one key: up only when the last one lets go', () => {
  const { hub, sent } = hubWith({ gamepad: { X: 'Space' } });
  hub.touch('Space', true, 1);
  hub.pollPads([pad(0, ['X'])]);
  hub.keyboard('Space', true);
  assert.deepEqual(sent, [['Space', true]]);
  hub.touch('Space', false, 1);
  hub.pollPads([pad(0, [])]);
  assert.deepEqual(sent, [['Space', true]]);
  hub.keyboard('Space', false);
  assert.deepEqual(sent, [['Space', true], ['Space', false]]);
});

test('two fingers on one key each count', () => {
  const { hub, sent } = hubWith(oregon);
  hub.touch('ArrowUp', true, 1);
  hub.touch('ArrowUp', true, 2);
  hub.touch('ArrowUp', false, 1);
  assert.deepEqual(sent, [['ArrowUp', true]]);
  hub.touch('ArrowUp', false, 2);
  assert.deepEqual(sent, [['ArrowUp', true], ['ArrowUp', false]]);
});

test('two gamepads on one key each count', () => {
  const { hub, sent } = hubWith({ gamepad: { A: 'Enter' } });
  hub.pollPads([pad(0, ['A']), pad(1, ['A'])]);
  hub.pollPads([pad(0, []), pad(1, ['A'])]);
  assert.deepEqual(sent, [['Enter', true]]);
  hub.pollPads([pad(0, []), pad(1, [])]);
  assert.deepEqual(sent, [['Enter', true], ['Enter', false]]);
});

test('the left stick works as the arrows, past half way', () => {
  const { hub, sent } = hubWith(oregon);
  hub.pollPads([pad(0, [], [0.3, 0, 0, 0])]);
  assert.deepEqual(sent, []);
  hub.pollPads([pad(0, [], [0.9, -0.9, 0, 0])]);
  assert.deepEqual(sent.map(String).sort(), ['ArrowRight,true', 'ArrowUp,true']);
  hub.pollPads([pad(0, [], [0, 0, 0, 0])]);
  assert.deepEqual(sent.filter(([, d]) => !d).map(([c]) => c).sort(), ['ArrowRight', 'ArrowUp']);
});

test('a card can turn the stick off', () => {
  const { hub, sent } = hubWith({ gamepad: { Stick: 'none', Left: 'ArrowLeft' } });
  hub.pollPads([pad(0, [], [-1, 0, 0, 0])]);
  assert.deepEqual(sent, []);
});

test('Start is the menu on every pad, even when the card does not say so', () => {
  const { hub, actions } = hubWith({ gamepad: { A: 'Enter' } });
  hub.pollPads([pad(0, ['Start'])]);
  assert.deepEqual(actions, ['menu']);
});

test('an action fires once per press, and sends no key to the game', () => {
  const { hub, sent, actions } = hubWith(oregon);
  hub.pollPads([pad(0, ['Start'])]);
  hub.pollPads([pad(0, ['Start'])]);
  hub.pollPads([pad(0, [])]);
  hub.pollPads([pad(0, ['Start'])]);
  assert.deepEqual(actions, ['menu', 'menu']);
  assert.deepEqual(sent, []);
});

test('the Oregon card: Y opens the keyboard', () => {
  const { hub, actions } = hubWith(oregon);
  hub.pollPads([pad(0, ['Y'])]);
  assert.deepEqual(actions, ['keyboard']);
});

test('an unplugged pad lets go of its keys', () => {
  const { hub, sent } = hubWith({ gamepad: { B: 'Escape' } });
  hub.pollPads([pad(0, ['B'])]);
  hub.pollPads([]);
  assert.deepEqual(sent, [['Escape', true], ['Escape', false]]);
});

test('pads without the standard mapping are ignored', () => {
  const { hub, sent } = hubWith(oregon);
  hub.pollPads([Object.assign(pad(0, ['A']), { mapping: '' })]);
  hub.pollPads([null, undefined]);
  assert.deepEqual(sent, []);
});

test('releaseAll leaves no key stuck down, and a held pad button presses again after', () => {
  const { hub, sent } = hubWith({ gamepad: { A: 'Enter' } });
  hub.keyboard('KeyA', true);
  hub.touch('Enter', true, 3);
  hub.pollPads([pad(0, ['A'])]);
  hub.releaseAll();
  assert.deepEqual(hub.held(), []);
  assert.deepEqual(sent.filter(([, d]) => !d).map(([c]) => c).sort(), ['Enter', 'KeyA']);
  hub.pollPads([pad(0, ['A'])]);
  assert.deepEqual(sent[sent.length - 1], ['Enter', true]);
});

test('a new card replaces the old gamepad map', () => {
  const { hub, sent } = hubWith({ gamepad: { A: 'Enter' } });
  hub.setCard({ gamepad: { A: 'Space' } });
  hub.pollPads([pad(0, ['A'])]);
  assert.deepEqual(sent, [['Space', true]]);
});
