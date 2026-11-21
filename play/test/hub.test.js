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

test('steady directions (Bryan, Golden Axe: "really kind of touchy"): wide straight sectors, narrow diagonals, a held direction kept past its border, a dead centre', () => {
  const { steadyDir, SECTORS } = require('../src/hub.js');
  const at = (deg, r = 1, prev = null) => { const s = steadyDir(r * Math.cos(deg * Math.PI / 180), r * Math.sin(deg * Math.PI / 180), prev, 0.3, 0.22); return s == null ? '' : SECTORS[s]; };
  assert.equal(at(0), 'R'); assert.equal(at(25), 'R', 'a thumb a little low of right is still right');
  assert.equal(at(35), 'RD'); assert.equal(at(45), 'RD'); assert.equal(at(-90), 'U');
  assert.equal(at(38, 1, 0), 'R', 'right held: kept until 10 degrees past its border (30)');
  assert.equal(at(41, 1, 0), 'RD');
  assert.equal(at(0, 0.25), '', 'the dead centre');
  assert.equal(at(0, 0.25, 0), 'R', 'letting go needs the thumb nearer the centre than pressing');
  assert.equal(at(0, 0.2, 0), '');
});

test('a Genesis keeps its A B C by place on a gamepad (left, bottom, right), not by letter', () => {
  const Cards = require('../src/cards.js');
  const m = Cards.gamepadMap({ system: 'genesis', controls: { kind: 'pad' } });
  assert.equal(m.A, 'P1:B'); assert.equal(m.B, 'P1:A'); assert.equal(m.X, 'P1:Y');
  const n = Cards.gamepadMap({ system: 'nes', controls: { kind: 'pad' } });
  assert.equal(n.A, 'P1:A'); assert.equal(n.B, 'P1:B');
});

test('Bryan, 20 Nov 2026 (a Bluetooth controller on his phone: "the A and B buttons were reversed"): on a Nintendo game the button marked A presses the game’s A, on an Xbox-marked pad and on a Nintendo-made one', () => {
  const Hub = require('../src/hub.js'), Cards = require('../src/cards.js');
  const card = { system: 'snes', controls: { kind: 'pad' } };
  const press = (id, i) => ({ index: 0, id, mapping: 'standard', buttons: Array.from({ length: 17 }, (_, n) => ({ pressed: n === i, value: n === i ? 1 : 0 })), axes: [0, 0, 0, 0] });
  for (const [id, bottom, right] of [['Xbox Wireless Controller', 'P1:A', 'P1:B'], ['Pro Controller (Vendor: 057e Product: 2009)', 'P1:B', 'P1:A']]) {
    const sent = [];
    const hub = Hub.createHub({ send: (c, d) => { if (d) sent.push(c); } });
    hub.setCard(card, Cards.gamepadMap(card));
    hub.pollPads([press(id, Hub.BUTTONS.A)]); hub.pollPads([press(id, -1)]); hub.pollPads([press(id, Hub.BUTTONS.B)]);
    assert.deepEqual(sent, [bottom, right], id);
  }
});
