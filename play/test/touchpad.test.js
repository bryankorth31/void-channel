// VoidTV PLAY: which touch keys go where, from the card alone. Licence: GPL-2.0-or-later (play/LICENSE).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '..');
const Touch = require(path.join(ROOT, 'src', 'touchpad.js'));
const oregon = JSON.parse(fs.readFileSync(path.join(ROOT, 'cards', 'oregon-trail-1990.json'), 'utf8'));

test('The Oregon Trail sideways: numbers and Enter under the right thumb, Space first on the left', () => {
  const p = Touch.plan(oregon.controls);
  assert.deepEqual(p.sideways.right, [...oregon.controls.numbers, 'Enter']);
  assert.equal(p.sideways.left[0], 'Space');
  assert.ok(!p.sideways.left.includes('Enter'));
  assert.ok(p.dpad && p.keyboard);
});

test('The Oregon Trail upright: Space and Enter get their own wide row, the rest sit beside the arrows', () => {
  const p = Touch.plan(oregon.controls);
  assert.deepEqual(p.go, ['Space', 'Enter']);
  assert.ok(!p.rest.includes('Space') && !p.rest.includes('Enter'));
  assert.ok(p.rest.includes('KeyY') && p.rest.includes('KeyN') && p.rest.includes('Escape'));
});

test('every key on the card is drawn once, sideways and upright', () => {
  const c = oregon.controls, p = Touch.plan(c);
  const all = [...c.numbers, ...c.keys].sort();
  assert.deepEqual([...p.sideways.left, ...p.sideways.right].sort(), all);
  assert.deepEqual([...p.numbers, ...p.go, ...p.rest].sort(), all);
});

test('a card with no numbers is a game pad: arrows left, every key right', () => {
  const p = Touch.plan({ keys: ['KeyZ', 'KeyX', 'Enter'], dpad: true });
  assert.deepEqual(p.sideways.right, ['KeyZ', 'KeyX', 'Enter']);
  assert.deepEqual(p.sideways.left, []);
  assert.deepEqual(p.go, ['Enter']);
});

test('an empty card draws nothing and does not throw', () => {
  const p = Touch.plan({});
  assert.deepEqual([p.numbers, p.go, p.rest, p.sideways.left, p.sideways.right], [[], [], [], [], []]);
});

test('the audit (Bryan: "3 of the directional buttons locked down"): when the browser takes a touch, every touch key and the d-pad let go', () => {
  const fs = require('fs'), path = require('path');
  const tp = fs.readFileSync(path.join(__dirname, '..', 'src', 'touchpad.js'), 'utf8');
  assert.ok(tp.includes('function releaseAll() {') && tp.includes('const api = { build, releaseAll,'));
  assert.ok(tp.includes("letGo.push(() => { for (const id of [...held.keys()]) lift({ pointerId: id }); });"), 'the d-pad, lights included');
  assert.ok(tp.includes('b.dataset.down = String(e.pointerId);'), 'a key remembers its finger, so it lets go as that finger');
  const js = fs.readFileSync(path.join(__dirname, '..', 'src', 'play.js'), 'utf8');
  assert.ok(js.includes("for (const ev of ['touchend', 'touchcancel']) document.addEventListener(ev, (e) => { if (!e.touches.length) PlayTouch.releaseAll(); }, true);"));
  assert.ok(js.includes("visualViewport.addEventListener('resize', () => PlayTouch.releaseAll());"));
  assert.ok(js.includes('hub.releaseAll(); PlayTouch.releaseAll(); letGoMouse();'), 'Pause lets go of the touch layer too');
});
