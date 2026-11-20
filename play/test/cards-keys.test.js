// VoidTV PLAY: tests for game cards and the key table. Licence: GPL-2.0-or-later (play/LICENSE).
// Run from the repo: node --test "play/test/*.test.js"
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '..');
const Cards = require(path.join(ROOT, 'src', 'cards.js'));
const Keys = require(path.join(ROOT, 'src', 'keys.js'));
const Hub = require(path.join(ROOT, 'src', 'hub.js'));

const cardFiles = fs.readdirSync(path.join(ROOT, 'cards')).filter((f) => f.endsWith('.json'));
const loadCard = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'cards', f), 'utf8'));
const oregon = loadCard('oregon-trail-1990.json');
const copy = (o) => JSON.parse(JSON.stringify(o));

// ---- cards ----

test('every card in cards/ passes the card check and is named after its id', () => {
  assert.ok(cardFiles.length > 0);
  for (const f of cardFiles) {
    const card = loadCard(f);
    assert.deepEqual(Cards.check(card), [], f);
    assert.equal(card.id + '.json', f);
  }
});

// A DOS card names PC keys; a console card ("kind": "pad") names the console's own buttons, P1:A, P2:Start and so on,
// with the libretro joypad's button names.
const PAD_BUTTON = /^P[12]:(B|Y|Select|Start|Up|Down|Left|Right|A|X|L|R|L2|R2|L3|R3)$/;
const known = (card, code) => (Cards.isPad(card) ? PAD_BUTTON.test(code) : Keys.known(code));

test('every key a card names is a key its core knows, and every gamepad button exists', () => {
  for (const f of cardFiles) {
    const card = loadCard(f), c = card.controls || {};
    for (const code of [...(c.numbers || []), ...(c.keys || [])]) assert.ok(known(card, code), f + ': ' + code);
    for (const [button, code] of Object.entries(Cards.gamepadMap(card))) {
      assert.ok(button in Hub.BUTTONS, f + ': no gamepad button ' + button);
      if (code[0] !== '@') assert.ok(known(card, code), f + ': ' + button + ' -> ' + code);
    }
    for (const [pc, code] of Object.entries(Cards.keyMap(card) || {})) {
      assert.ok(Keys.known(pc), f + ': no PC key ' + pc);
      if (code[0] !== '@') assert.ok(PAD_BUTTON.test(code), f + ': ' + pc + ' -> ' + code);
    }
  }
});

test('every card names a core that plays its system, and each core\'s source commit is recorded', () => {
  const recipes = require(path.join(ROOT, 'core', 'cores.js'));
  const readme = fs.readFileSync(path.join(ROOT, 'core', 'README.md'), 'utf8');
  for (const name of Object.keys(Cards.CORES)) {
    if (name === 'dosbox-pure') continue;   // its commit is in core/dosbox-pure.txt (page.test.js)
    if (Cards.CORES[name].kind === 'mame') continue;   // MAME's own build: its record is core/mame.txt (arcade.test.js)
    assert.ok(recipes[name], name + ' has a recipe in core/cores.js');
    assert.match(recipes[name].commit, /^[0-9a-f]{40}$/, name + ' names an exact commit');
    assert.ok(readme.includes(recipes[name].commit), name + ': core/README.md names the same commit');
    assert.deepEqual(recipes[name].systems.slice().sort(), Cards.CORES[name].systems.slice().sort(), name + ' systems agree');
  }
});

test('the game always comes from the Archive through /cors/, never from voidtv.net', () => {
  for (const f of cardFiles) {
    assert.match(Cards.gameUrl(loadCard(f)), /^https:\/\/archive\.org\/cors\/[A-Za-z0-9._-]+\//, f);
  }
  assert.equal(Cards.gameUrl(oregon), 'https://archive.org/cors/msdos_Oregon_Trail_The_1990/Oregon_Trail_The_1990.zip');
  assert.equal(Cards.itemPage(oregon), 'https://archive.org/details/msdos_Oregon_Trail_The_1990');
  assert.equal(Cards.gameFile(oregon), 'Oregon_Trail_The_1990.zip');
});

test('every core a card can name has its engine file in engine/', () => {
  for (const [name, core] of Object.entries(Cards.CORES)) {
    if (core.engine.includes('{engine}')) continue;   // one engine per arcade machine: checked per card in consoles.test.js
    assert.ok(fs.existsSync(path.join(ROOT, core.engine)), name + ': ' + core.engine);
    assert.ok(fs.existsSync(path.join(ROOT, core.engine.replace(/\.js$/, '.wasm'))), name + ': its .wasm');
  }
});

test('a bad card is refused with the reason', () => {
  assert.deepEqual(Cards.check(null), ['not a card']);
  const bad = (change) => Cards.check(Object.assign(copy(oregon), change));
  assert.ok(bad({ id: 'Bad Id' }).includes('id'));
  assert.ok(bad({ title: '' }).includes('title'));
  assert.ok(bad({ archive: { item: '../x', file: 'a.zip' } }).includes('archive.item'));
  assert.ok(bad({ archive: { item: 'ok', file: '../../etc/passwd' } }).includes('archive.file'));
  assert.ok(bad({ archive: { item: 'ok', file: 'a/../b.zip' } }).includes('archive.file'));
  assert.ok(bad({ core: 'no-such-core' }).includes('core'));
  assert.ok(bad({ system: 'genesis' }).includes('system'));
  assert.ok(bad({ controls: {} }).includes('controls'));
});

test('a file name with spaces or odd letters is made safe in the address', () => {
  const card = Object.assign(copy(oregon), { archive: { item: 'x', file: 'dir/My Game #1.zip' } });
  assert.equal(Cards.gameUrl(card), 'https://archive.org/cors/x/dir/My%20Game%20%231.zip');
});

test('The Oregon Trail card has the keys the game uses (assistant notes, 19 Nov 2026)', () => {
  const c = oregon.controls;
  // Every menu in the game picks by number; the trail menu goes past 6.
  for (let n = 1; n <= 9; n++) assert.ok(c.numbers.includes('Digit' + n), 'number ' + n);
  // Space goes on after each message; yes or no questions take Y and N; Enter ends a typed name.
  for (const k of ['Space', 'Enter', 'KeyY', 'KeyN']) assert.ok(c.keys.includes(k), k);
  assert.equal(c.keyboard, true, 'a keyboard for typing names');
  assert.equal(oregon.archive.start, 'oregont/OREGON.EXE');
});

// ---- keys ----

test('keys map to the libretro numbers', () => {
  assert.equal(Keys.RETROK.Enter, 13);
  assert.equal(Keys.RETROK.Space, 32);
  assert.equal(Keys.RETROK.Escape, 27);
  assert.equal(Keys.RETROK.KeyA, 97);
  assert.equal(Keys.RETROK.KeyZ, 122);
  assert.equal(Keys.RETROK.Digit0, 48);
  assert.equal(Keys.RETROK.Digit9, 57);
  assert.equal(Keys.RETROK.ArrowUp, 273);
  assert.equal(Keys.RETROK.ArrowLeft, 276);
  assert.equal(Keys.RETROK.F1, 282);
  assert.equal(Keys.RETROK.F12, 293);
  assert.ok(!Keys.known('NotAKey'));
});

test('no two keys share one libretro number', () => {
  const seen = new Map();
  for (const [code, n] of Object.entries(Keys.RETROK)) {
    assert.ok(!seen.has(n), code + ' and ' + seen.get(n) + ' are both ' + n);
    seen.set(n, code);
  }
});

test('a key types its character, with Shift for capitals', () => {
  assert.equal(Keys.charOf('KeyB'), 'b'.charCodeAt(0));
  assert.equal(Keys.charOf('KeyB', true), 'B'.charCodeAt(0));
  assert.equal(Keys.charOf('Digit7'), '7'.charCodeAt(0));
  assert.equal(Keys.charOf('Space'), 32);
  assert.equal(Keys.charOf('Enter'), 13);
  assert.equal(Keys.charOf('Backspace'), 8);
  assert.equal(Keys.charOf('Period'), '.'.charCodeAt(0));
  assert.equal(Keys.charOf('ArrowUp'), 0);
});

test('modifier bits: Shift 1, Control 2, Alt 4', () => {
  assert.equal(Keys.modsOf(new Set()), 0);
  assert.equal(Keys.modsOf(new Set(['ShiftLeft'])), 1);
  assert.equal(Keys.modsOf(new Set(['ShiftRight', 'ControlLeft'])), 3);
  assert.equal(Keys.modsOf(new Set(['AltRight', 'ControlRight', 'ShiftLeft'])), 7);
});
