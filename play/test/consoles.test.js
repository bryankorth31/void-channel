// PLAY console batch (B, 19 Nov 2026: "Yes, first batch"): every card names a core we built from an exact source, console
// buttons get the usual seats and labels, and a second gamepad plays as player 2. Run: node --test "play/test/*.test.js"
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const PLAY = path.join(__dirname, '..');
const Cards = require('../src/cards.js');
const Hub = require('../src/hub.js');
const RECIPES = require('../core/cores.js');
const cards = fs.readdirSync(path.join(PLAY, 'cards')).filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(fs.readFileSync(path.join(PLAY, 'cards', f), 'utf8')));

test('every card is a valid card and its id matches its file name', () => {
  for (const c of cards) {
    assert.deepEqual(Cards.check(c), [], c.id);
    assert.ok(fs.existsSync(path.join(PLAY, 'cards', c.id + '.json')), c.id);
  }
});

test('every core a card names has both engine files on disk', () => {
  for (const c of cards) {
    const engine = path.join(PLAY, Cards.engineOf(c));
    assert.ok(fs.existsSync(engine), engine);
    assert.ok(fs.existsSync(engine.replace(/\.js$/, '.wasm')), engine);
  }
});

test('every core but DOSBox Pure has a recipe with an exact commit, a source link and a licence', () => {
  for (const name of Object.keys(Cards.CORES).filter((n) => n !== 'dosbox-pure' && Cards.CORES[n].kind !== 'mame')) {
    const r = RECIPES[name];
    assert.ok(r, name);
    assert.match(r.commit, /^[0-9a-f]{40}$/, name);
    assert.match(r.repo, /^https:\/\/github\.com\/libretro\//, name);
    assert.ok(r.licence, name);
    assert.deepEqual(r.systems, Cards.CORES[name].systems, name);
  }
});

test('the batch covers the eight picked games across six machines', () => {
  const ids = cards.map((c) => c.id);
  for (const id of ['prince-of-persia-1990', 'golden-axe-genesis', 'golden-axe-sms', 'pac-man-game-gear', 'super-mario-world',
    'punch-out-nes', 'tetris-game-boy', 'pitfall-2600']) assert.ok(ids.includes(id), id);
});

test('a console card only presses buttons the pad knows (P1:A, P1:Start ...)', () => {
  const BUTTONS = ['B', 'Y', 'Select', 'Start', 'Up', 'Down', 'Left', 'Right', 'A', 'X', 'L', 'R'];
  for (const c of cards.filter(Cards.isPad)) {
    const used = [...c.controls.keys, ...Object.values(Cards.gamepadMap(c)), ...Object.values(Cards.keyMap(c))];
    for (const code of used) {
      if (code[0] === '@') continue;
      const m = /^P([1-4]):([A-Za-z]+)$/.exec(code);
      assert.ok(m && BUTTONS.includes(m[2]), c.id + ' ' + code);
    }
  }
});

test('Master System and Game Gear files are renamed so the core knows the machine', () => {
  for (const c of cards.filter((x) => x.system === 'sms' || x.system === 'gamegear')) {
    assert.match(Cards.gameFile(c), c.system === 'sms' ? /\.sms$/ : /\.gg$/, c.id);
  }
});

test('a DOS card keeps PC keys; a console card turns PC keys into pad buttons', () => {
  const dos = cards.find((c) => c.id === 'prince-of-persia-1990');
  assert.equal(Cards.keyMap(dos), null);
  const snes = cards.find((c) => c.id === 'super-mario-world');
  assert.equal(Cards.keyMap(snes).KeyZ, 'P1:B');
  assert.equal(Cards.keyMap(snes).Escape, '@menu');
  assert.equal(Cards.gamepadMap(snes).Home, '@menu');
});

test('the second gamepad plays as player 2 on a console card', () => {
  const sent = [];
  const hub = Hub.createHub({ send: (code, down) => sent.push(code + (down ? ' down' : ' up')) });
  const card = cards.find((c) => c.id === 'golden-axe-genesis');
  hub.setCard(card, Cards.gamepadMap(card));
  const press = (index, button) => {
    const buttons = Array.from({ length: 17 }, (_, i) => ({ pressed: i === button, value: i === button ? 1 : 0 }));
    return { index, mapping: 'standard', buttons, axes: [0, 0, 0, 0] };
  };
  hub.pollPads([press(0, Hub.BUTTONS.A), press(1, Hub.BUTTONS.A)]);
  assert.deepEqual(sent, ['P1:B down', 'P2:B down']);
});

test('the footer data for every core: its name, licence, exact source, and the licence text of a non-GPL core', () => {
  for (const [name, core] of Object.entries(Cards.CORES)) {
    assert.ok(core.name && core.licence, name);
    const commit = name === 'dosbox-pure' || core.kind === 'mame'
      ? fs.readFileSync(path.join(PLAY, 'core', name === 'dosbox-pure' ? 'dosbox-pure.txt' : 'mame.txt'), 'utf8').match(/commit: *([0-9a-f]{40})/)[1]
      : RECIPES[name].commit;
    assert.ok(core.source.endsWith('/tree/' + commit), name);
    if (core.licence !== 'GPL-2.0') {
      assert.ok(core.terms, name + ' needs its licence text');
      assert.ok(fs.statSync(path.join(PLAY, core.terms)).size > 500, core.terms);
    }
  }
});

test('no donation line on games run by a non-commercial core (B, 19 Nov 2026: "Leave it off those")', () => {
  assert.equal(Cards.CORES['genesis-plus-gx'].noDonation, true);
  assert.equal(Cards.CORES.snes9x.noDonation, true);
  for (const name of ['dosbox-pure', 'fceumm', 'gambatte', 'stella2014']) assert.ok(!Cards.CORES[name].noDonation, name);
  // The rule follows the licence: a core whose licence forbids commercial use drops the line; open licences that allow
  // any use (GPL, MPL-2.0 for mGBA, zlib for Handy) keep it.
  // Arcade is Bryan's own exception (20 Nov 2026, "No line"): GPL, and still no donation line.
  for (const [name, core] of Object.entries(Cards.CORES)) assert.equal(!!core.noDonation, /non-commercial/.test(core.licence) || name === 'mame', name);
  const page = fs.readFileSync(path.join(PLAY, 'src', 'play.js'), 'utf8');
  assert.match(page, /if \(core\.noDonation\) for \(const e of document\.querySelectorAll\('\.donate'\)\) e\.remove\(\);/);
});

test('arcade (B, 20 Nov 2026: "Current MAME", "No line"): MAME runs from its own runner on the page, keyboard keys are not sent twice, Esc never reaches MAME, and the tab keeps its title', () => {
  const Cards2 = require('../src/cards.js');
  const joust = JSON.parse(fs.readFileSync(path.join(PLAY, 'cards', 'joust-arcade.json'), 'utf8'));
  assert.equal(Cards2.engineOf(joust), 'engine/mame/joust.js');
  assert.ok(fs.existsSync(path.join(PLAY, 'engine', 'mame', 'joust.js')) && fs.existsSync(path.join(PLAY, 'engine', 'mame', 'joust.wasm')));
  assert.ok(fs.statSync(path.join(PLAY, 'engine', 'mame', 'joust.wasm')).size < 25 * 1024 * 1024, 'under Cloudflare\'s 25 MiB file cap');
  assert.deepEqual(Cards2.check(joust), []);
  assert.ok(Cards2.check(Object.assign({}, joust, { archive: Object.assign({}, joust.archive, { driver: '../x' }) })).includes('archive.driver'));
  const R = require('../src/arcade-runner.js');
  const surface = Object.keys(R.createRunner({ canvas: {} })).sort();
  for (const k of ['start', 'stop', 'pause', 'resume', 'save', 'load', 'key', 'pad', 'mouse', 'reset', 'rewind', 'saveWhy', 'wakeSound', 'prepareSound']) assert.ok(surface.includes(k), k);
  const js = fs.readFileSync(path.join(PLAY, 'src', 'play.js'), 'utf8');
  for (const bit of ['    if (isArcade()) return;', "if (!isArcade() || !started || e.code !== 'Escape' || !e.isTrusted) return;",
    "addEventListener('keydown', arcadeEsc, true);", "runner = (isArcade() ? PlayArcade : PlayRunner).createRunner("]) assert.ok(js.includes(bit), bit);
  const ar = fs.readFileSync(path.join(PLAY, 'src', 'arcade-runner.js'), 'utf8');
  assert.ok(ar.includes("ctx[fn] = function () { frames++;"), 'the first picture is MAME\'s first draw');
  assert.ok(ar.includes('if (document.title !== mine) document.title = mine;'));
});
