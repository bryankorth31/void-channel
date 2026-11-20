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

test('the spacing audit (Bryan: "buttons aren\'t overlapping. Words inside of buttons don\'t fall outside"): an arcade card that names Space keeps it with its buttons, three beside the arrows, and words shrink to fit', () => {
  const hero = JSON.parse(fs.readFileSync(path.join(ROOT, 'cards', 'chinese-hero-arcade.json'), 'utf8'));
  const p = Touch.plan(hero.controls);
  assert.deepEqual(p.go, [], 'Space is "Button 3" here, so it gets no row of its own');
  assert.ok(p.rest.includes('Space'));
  const src = fs.readFileSync(path.join(ROOT, 'src', 'touchpad.js'), 'utf8');
  assert.ok(src.includes('const perRow = p.dpad ? 3 : 5;') && !src.includes("' many'"));
  assert.ok(src.includes('function fit(scope) {') && /const api = \{ build, releaseAll, fit,/.test(src));
  const css = fs.readFileSync(path.join(ROOT, 'play.css'), 'utf8');
  assert.ok(css.includes('overflow-wrap:normal;word-break:normal;hyphens:none;'), 'a word is never split inside');
  assert.ok(css.includes('.pblock .pdpad{height:100%;aspect-ratio:1;align-self:center;max-width:40cqw;max-height:40cqw;'), 'the arrows leave the buttons room');
  // Console pads sideways: each side stacks in its own margin, nothing on the face buttons.
  assert.ok(css.includes('.cpad.side .crewind{left:var(--e);top:calc(var(--e) + 112px)}'));
  const js = fs.readFileSync(path.join(ROOT, 'src', 'play.js'), 'utf8');
  assert.ok(js.includes('if (touch) PlayTouch.fit($(\'stage\'));') && js.includes('const overTop = (shell ? 0 : PlayLayout.HEADER) + ins.t;'));
});

test('the spacing audit, second round: compact face shapes, one row of small keys upright, the d-pad gives way, short key areas tighten', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'touchpad.js'), 'utf8');
  assert.ok(src.includes("if (shape.cols === 3) face.classList.add('tri');") && src.includes("const pills = el('div', 'cpills');"));
  const css = fs.readFileSync(path.join(ROOT, 'play.css'), 'utf8');
  assert.ok(css.includes('.cpad .cface.tri{width:calc(2 * var(--b) + 8px);'), 'the diamond is two buttons wide, keys still full size');
  assert.ok(css.includes('.cpad.up{--d:max(110px,min(300px,58cqh,42cqw,calc(100cqh - 2 * var(--e) - 44px - 48px - 24px)))}'));
  assert.ok(css.includes('.cpad.side .cpills>*{position:absolute;pointer-events:auto}'));
  assert.ok(css.includes('@container (max-height:330px){') && css.includes('.pp .pk{min-height:50px}'), 'never under 50 px');
});

test('Bryan, 20 Nov 2026 ("the areas for touching are too small ... fix this right away"): keys take touches past their drawings, a tap in a gap goes to the nearest key, the d-pad forgives', () => {
  const fs = require('fs'), path = require('path');
  const css = fs.readFileSync(path.join(__dirname, '..', 'play.css'), 'utf8');
  assert.ok(css.includes(".over .pk::after,.zone .pk::after{content:'';position:absolute;inset:-4px;border-radius:inherit}   /* the rest of a gap goes to the nearest key, halfway */"));
  assert.ok(css.includes(".over .pdpad::after,.zone .pdpad::after{content:'';position:absolute;inset:-14%;border-radius:50%;pointer-events:auto}"));
  const tp = fs.readFileSync(path.join(__dirname, '..', 'src', 'touchpad.js'), 'utf8');
  assert.ok(tp.includes('const REACH = 36;') && tp.includes("let best = null, bd = t.closest('#screen') ? 16 : REACH;"));
  assert.ok(tp.includes('0.16, 0.1, 22) : null;'), 'a small dead centre and wider diagonals on the d-pad');
  const H = require('../src/hub.js');
  assert.notEqual(H.steadyDir(0.2, 0, null, 0.16, 0.1, 22), null, 'just off the centre already presses');
  assert.equal(H.SECTORS[H.steadyDir(1, 0.75, null, 0.16, 0.1, 22)], 'RD', 'a thumb between right and down gets the diagonal');
});
