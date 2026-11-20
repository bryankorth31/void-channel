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
  assert.ok(css.includes('.cpad.up{--d:max(110px,min(300px,58cqh,48cqw,calc(100cqh - 2 * var(--e) - 44px - 48px - 24px)))}'));
  assert.ok(css.includes('.cpad.side .cpills>*{position:absolute;pointer-events:auto}'));
  assert.ok(css.includes('@container (max-height:330px){') && css.includes('.pp .pk{min-height:50px}'), 'never under 50 px');
});

test('Bryan, 20 Nov 2026 ("the areas for touching are too small ... fix this right away"): keys take touches past their drawings, a tap in a gap goes to the nearest key, the d-pad forgives', () => {
  const fs = require('fs'), path = require('path');
  const css = fs.readFileSync(path.join(__dirname, '..', 'play.css'), 'utf8');
  assert.ok(css.includes(':where(.over .pk,.zone .pk){position:relative}'), 'never over a key placed on its own (L and R sideways)');
  assert.ok(!/^\.over \.pk,\.zone \.pk\{position:relative\}/m.test(css));
  assert.ok(css.includes(".over .pk::after,.zone .pk::after{content:'';position:absolute;inset:-4px;border-radius:inherit}   /* the rest of a gap goes to the nearest key, halfway */"));
  assert.ok(css.includes(".over .pdpad::after,.zone .pdpad::after{content:'';position:absolute;inset:-14%;border-radius:50%;pointer-events:auto}"));
  const tp = fs.readFileSync(path.join(__dirname, '..', 'src', 'touchpad.js'), 'utf8');
  assert.ok(tp.includes('const REACH = 36;') && tp.includes("let best = null, bd = t.closest('#screen') ? 16 : REACH;"));
  assert.ok(tp.includes('0.16, 0.1, 22) : null;'), 'a small dead centre and wider diagonals on the d-pad');
  const H = require('../src/hub.js');
  assert.notEqual(H.steadyDir(0.2, 0, null, 0.16, 0.1, 22), null, 'just off the centre already presses');
  assert.equal(H.SECTORS[H.steadyDir(1, 0.75, null, 0.16, 0.1, 22)], 'RD', 'a thumb between right and down gets the diagonal');
});

test('Bryan, 20 Nov 2026: the d-pad from Lexrom, bigger without overlapping; a Cheats key beside Start; fullscreen by default on a phone', () => {
  const fs = require('fs'), path = require('path');
  const css = fs.readFileSync(path.join(__dirname, '..', 'play.css'), 'utf8');
  for (const f of ['dpad-well.svg', 'dpad-cross.svg']) {
    const svg = fs.readFileSync(path.join(__dirname, '..', 'skin', f), 'utf8');
    assert.ok(svg.startsWith('<svg') && svg.includes('Lexrom') && !/<script|href="http/i.test(svg), f + ': a plain drawing, nothing loaded from elsewhere');
    assert.ok(css.includes('url(skin/' + f + ')'));
  }
  assert.ok(css.includes('.cpad.side{--e:10px;--d:max(150px,min(300px,40cqw,calc(var(--side,171px) - var(--e) - 4px),calc(100cqh - 2 * var(--e) - 164px)))}'),
    'sideways: the margin beside the picture and the height under L, Select and Rewind');
  assert.ok(css.includes('body:not(.has-cheats) .cpad .ccheats{display:none}') && css.includes('.cpad.side .ccheats{right:calc(var(--e) + 72px);top:calc(var(--e) + 72px)}') && css.includes('@container (max-height:340px){.cpad.up .ccheats{display:none !important}}') && css.includes('.cpad .pill::after{display:none}'));
  const tp = fs.readFileSync(path.join(__dirname, '..', 'src', 'touchpad.js'), 'utf8');
  assert.ok(tp.includes("pill('@cheats', 'pill ccheats');") && tp.includes("k.classList.contains('pill') || k.classList.contains('ccheats')) continue;"), 'only a tap right on Select, Start, Rewind or Cheats presses it');
  const T = require('../src/touchpad.js');
  assert.equal(T.label('@cheats'), 'Cheats');
  const play = fs.readFileSync(path.join(__dirname, '..', 'src', 'play.js'), 'utf8');
  assert.ok(play.includes("else if (name === 'cheats') { if (cheatList && runner && started) { setPaused(true); showCheats(true); } }"));
  assert.ok(play.includes("document.body.classList.add('has-cheats');"));
  assert.ok(play.includes('Math.min(48, Math.floor(room - need - 8))'), 'the picture moves at most 48 px, never onto the face buttons');
  assert.ok(play.includes("if (!started || leftFull || !isPhone() || !document.fullscreenEnabled || document.fullscreenElement) return;"));
  const html = fs.readFileSync(path.join(__dirname, '..', 'game.html'), 'utf8');
  assert.ok(html.includes('id="cover-full"') && html.includes('<link rel="manifest" href="manifest.webmanifest">'));
  const m = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.webmanifest'), 'utf8'));
  assert.equal(m.display, 'fullscreen'); assert.equal(m.scope, '/play/');
});

test('Bryan, 20 Nov 2026 ("all buttons should be bigger and easier to play with ... L above the up arrow, R above X"): the upright handheld; labels keep their size', () => {
  const fs = require('fs'), path = require('path');
  const css = fs.readFileSync(path.join(__dirname, '..', 'play.css'), 'utf8');
  assert.ok(css.includes('.cpad.up{--lift:clamp(14px,5cqh,44px);--b:max(56px,min(96px,17cqh,20cqw));--top:74px;'), 'face buttons up to 96 px, the group off the bottom edge');
  assert.ok(css.includes('.cpad.up .csl{left:max(var(--e),calc(var(--e) + var(--d) / 2 - min(120px,30cqw) / 2))}'), 'L centred over the d-pad');
  assert.ok(css.includes('.cpad.up .csr{right:max(var(--e),calc(var(--e) + var(--cw,120px) / 2 - min(120px,30cqw) / 2))}'), 'R centred over the face buttons');
  assert.ok(css.includes('@container (min-height:460px){.cpad.up{--top:150px}}'), 'L and R stay under the words strip');
  assert.ok(css.includes('body.shell.arcade .pk .lbl{white-space:normal;'), 'a long arcade name wraps on its tape');
  const tp = fs.readFileSync(path.join(__dirname, '..', 'src', 'touchpad.js'), 'utf8');
  assert.ok(tp.includes("layer.style.setProperty('--cw',") && tp.includes("layer.style.setProperty('--ch',"));
  assert.ok(!tp.includes('const over = () => k.scrollWidth > k.clientWidth + 1'), 'the touch pad around a key never counts as its words overflowing');
  const html = fs.readFileSync(path.join(__dirname, '..', 'game.html'), 'utf8');
  assert.ok(html.includes('id="cover-phone"') && html.includes('id="m-phones"') && html.includes('Phone<span class="w2"> controller</span>'), 'the phone controller is easy to find');
});

test('Bryan, 20 Nov 2026 ("add a volume control on the emulator"): one volume for every engine, kept in this browser', () => {
  const fs = require('fs'), path = require('path');
  const runner = fs.readFileSync(path.join(__dirname, '..', 'src', 'runner.js'), 'utf8');
  assert.ok(runner.includes('node.connect(gain); gain.connect(audio.destination);') && runner.includes('volume: (v) => { level = v; if (gain) gain.gain.value = v; },'));
  assert.ok(!runner.includes('node.connect(audio.destination)'), 'console sound always passes the volume');
  const arcade = fs.readFileSync(path.join(__dirname, '..', 'src', 'arcade-runner.js'), 'utf8');
  assert.ok(arcade.includes('if (dest instanceof D && !this.playOwn) {') && arcade.includes('catchSound();'), "MAME's sound passes through our gain on its way to the speakers");
  const play = fs.readFileSync(path.join(__dirname, '..', 'src', 'play.js'), 'utf8');
  assert.ok(play.includes("const VOL_KEY = 'voidtv-play-volume';") && play.includes('volume: gainOf(vol), on: {'));
  const html = fs.readFileSync(path.join(__dirname, '..', 'game.html'), 'utf8');
  assert.ok(html.includes('id="vol"') && html.includes('id="m-vol"') && html.includes('id="b-mute"'), 'in the bar and in the pause menu');
});
