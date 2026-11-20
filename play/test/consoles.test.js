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
    // An arcade engine may be kept gzipped (.wasm.gz) to stay under Cloudflare's 25 MiB file cap.
    assert.ok(fs.existsSync(engine.replace(/\.js$/, '.wasm')) || fs.existsSync(engine.replace(/\.js$/, '.wasm.gz')), engine);
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
  assert.ok(page.includes("if (core.noDonation || c.kids || c.adult) for (const e of document.querySelectorAll('.donate')) e.remove();"));
});

test('arcade (B, 20 Nov 2026: "Current MAME", "No line"): MAME runs from its own runner on the page, keyboard keys are not sent twice, Esc never reaches MAME, and the tab keeps its title', () => {
  const Cards2 = require('../src/cards.js');
  const joust = JSON.parse(fs.readFileSync(path.join(PLAY, 'cards', 'joust-arcade.json'), 'utf8'));
  assert.equal(Cards2.engineOf(joust), 'engine/mame/classics.js', 'Joust plays on the classics engine (87 families) since the 244-game batch');
  const W = path.join(PLAY, 'engine', 'mame', 'classics');
  const wasm = fs.existsSync(W + '.wasm.gz') ? W + '.wasm.gz' : W + '.wasm';
  assert.ok(fs.existsSync(W + '.js') && fs.existsSync(wasm));
  assert.ok(fs.statSync(wasm).size < 25 * 1024 * 1024, 'under Cloudflare\'s 25 MiB file cap');
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
  assert.ok(ar.includes("fetch(engine.replace(/\\.js$/, '.wasm.gz') + '?v=' + ENGINE_V)") && ar.includes('WebAssembly.instantiate(buf, imports).then((r) => { buf = null; done(r.instance, r.module); }'), 'a gzipped engine is unpacked by the page');
  assert.ok(ar.includes('if (document.title !== mine) document.title = mine;'));
  assert.equal(joust.firstBoot.resetAt, 12, 'a Williams first boot goes on with one soft reset');
  assert.ok(ar.includes("manager.machine:soft_reset()") && ar.includes("args.push('-autoboot_script', '/lua/firstboot.lua')"));
  assert.ok(ar.includes("'-nothrottle', '-nosleep'"), 'the browser frames alone pace MAME');
  assert.ok(ar.includes('root.MainLoop.preMainLoop.push(gate());'), 'audit AR6: paced by time, so every refresh rate gives real speed');
  // The gate itself: on a 144 Hz screen it lets 60 turns a second through.
  const gateSrc = ar.slice(ar.indexOf('const STEP = 1000 / 60;'), ar.indexOf('    function pace() {'));
  const mk = new Function('performance', gateSrc + 'return gate;');
  let clock = 0; const g = mk({ now: () => clock })();
  let runs = 0; for (let i = 0; i < 144 * 10; i++) { clock += 1000 / 144; if (g()) runs++; }
  assert.ok(Math.abs(runs - 600) <= 2, 'about 600 turns in 10 s at 144 Hz, got ' + runs);
  clock = 0; const g2 = mk({ now: () => clock })(); runs = 0; for (let i = 0; i < 75 * 10; i++) { clock += 1000 / 75; if (g2()) runs++; }
  assert.ok(Math.abs(runs - 600) <= 2, 'about 600 turns in 10 s at 75 Hz, got ' + runs);
  assert.ok(ar.includes('root._emscripten_set_main_loop_timing(0, STEP); if (root.MainLoop && root.MainLoop.scheduler) root.MainLoop.scheduler();'), 'a page with no frames falls back to a timer');
  assert.ok(ar.includes("'-nojoystick'"), 'audit AR4: the pad reaches MAME through the hub only');
  assert.ok(ar.includes("s.src = engine + '?v=' + ENGINE_V;"), 'the engine script and its wasm are fetched as one build (Joust live, 20 Nov 2026)');
  // The 244-game batch (20 Nov 2026): a parent zip under MAME's name, timed presses past an operator screen, the engine's bytes
  // let go once it runs, and a big game's download counted out.
  assert.ok(ar.includes("name: p.as || p.file.split('/').pop()"));
  assert.ok(ar.includes('f:set_value(1); held = f; upto = t + 0.33') && ar.includes('held:clear_value()'));
  assert.ok(ar.includes("/^[A-Za-z0-9 ]{1,40}$/.test(p.input || '')"), 'only plain input names reach the Lua');
  assert.ok(ar.includes("on.status('Fetching the game: ' + mb + ' of ' + Math.round(size / 1e6) + ' MB')"));
  assert.ok(!ar.includes('root.Module.wasmBinary = buf;'), 'no second reference to the engine bytes');
});

test('arcade cards (Bryan picked the 245 most-played; the assistant read each input from MAME): every arcade card names a real engine, gives player 2 their own keys, and seats the controls the usual way', () => {
  const A = require('../tools/arcade-cards.js');
  const Hub = require('../src/hub.js');
  const arcade = cards.filter((c) => c.core === 'mame');
  assert.ok(arcade.length >= 243, 'all but Space Bugger: ' + arcade.length);
  for (const c of arcade) {
    assert.deepEqual(Cards.check(c), [], c.id);
    assert.ok(fs.existsSync(path.join(PLAY, Cards.engineOf(c))), c.id + ' ' + c.archive.engine);
    assert.ok(c.gamepad.Back && c.gamepad.Start, c.id + ' has a coin and a start on the pad');
    assert.ok(c.actions.length >= 3, c.id);
  }
  // The mapping, on hand-made fields: a gas pedal on RT and A, a dial on the arrows by MAME's own keys, twin sticks on the face buttons.
  const f = (name, type, player, keys, extra) => Object.assign({ name, type, player, analog: !!extra, keys: keys.map((k) => ({ dom: [k] })) }, extra || {});
  const k = (x) => [{ dom: [x] }];
  const drive = A.seatMap([f('P1 Pedal 1', 'P1_PEDAL', 1, [], { inc: k('ControlLeft') }), f('Paddle', 'P1_PADDLE', 1, [], { inc: k('ArrowRight'), dec: k('ArrowLeft') }), f('Gear Shift', 'P1_BUTTON3', 1, ['Space'])], 1);
  assert.deepEqual(drive.map, { RT: 'ControlLeft', A: 'ControlLeft', Left: 'ArrowLeft', Right: 'ArrowRight', B: 'Space' });
  const twin = A.seatMap([f('Up', 'P1_JOYSTICKLEFT_UP', 1, ['KeyE']), f('Fire Up', 'P1_JOYSTICKRIGHT_UP', 1, ['KeyI']), f('Fire Down', 'P1_JOYSTICKRIGHT_DOWN', 1, ['KeyK'])], 1);
  assert.deepEqual(twin.map, { Up: 'KeyE', Y: 'KeyI', A: 'KeyK' });
  // Player 2 on a second gamepad presses player 2's keys.
  const tron = cards.find((c) => c.id === 'tron-arcade');
  const sent = [];
  const hub = Hub.createHub({ send: (code, down) => sent.push(code + (down ? ' down' : ' up')) });
  hub.setCard(tron, Cards.gamepadMap(tron));
  const press = (index, button) => ({ index, id: 'pad ' + index, mapping: 'standard', axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: i === button, value: i === button ? 1 : 0 })) });
  hub.pollPads([press(0, Hub.BUTTONS.A), press(1, Hub.BUTTONS.A)]);
  assert.deepEqual(sent, [tron.gamepad.A + ' down', tron.gamepadSeats[2].A + ' down']);
  assert.notEqual(tron.gamepad.A, tron.gamepadSeats[2].A);
});


test('a console game kept inside a .zip: the core gets the one file with the machine\'s own ending (the assistant: FireRed\'s zip was refused)', () => {
  for (const [name, core] of Object.entries(Cards.CORES)) {
    if (core.kind === 'mame' || name === 'dosbox-pure') continue;
    for (const s of core.systems) assert.ok((Cards.ROM_EXTS[s] || []).length, s + ' has its file endings');
  }
  assert.deepEqual(Cards.romExts({ system: 'gba', archive: { file: 'x.zip' } }), ['gba']);
  assert.deepEqual(Cards.romExts({ system: 'dos', archive: { file: 'x.zip', start: 'A.EXE' } }), [], 'a DOS game unpacks whole');
  assert.ok(fs.readFileSync(path.join(PLAY, 'src', 'runner.js'), 'utf8').includes('rom: PlayCards.romExts ? PlayCards.romExts(card) : []'));
  const w = fs.readFileSync(path.join(PLAY, 'src', 'core-worker.js'), 'utf8');
  assert.ok(w.includes('path = await romFromZip(game, msg.rom, path);') && w.includes('async function romFromZip('));
});

test('two-player console games seat a second controller (Bryan: "Can two players play this with controllers"; the PLAY audit)', () => {
  const { TWO_PLAYER } = require('../tools/console-cards.js');
  const HOME = ['nes', 'snes', 'genesis', 'sms', 'a2600'];
  for (const id of TWO_PLAYER) {
    const c = JSON.parse(fs.readFileSync(path.join(PLAY, 'cards', id + '.json'), 'utf8'));
    assert.equal(c.players, 2, id);
    assert.ok(HOME.includes(c.system), id + ' is on a machine with two controller ports');
  }
  for (const id of ['streets-of-rage-2-genesis', 'mario-bros-nes', 'mortal-kombat-ii-genesis', 'zombies-ate-my-neighbors-genesis']) assert.ok(TWO_PLAYER.has(id), id);
  // A handheld's second player needed a link cable: one seat.
  for (const f of fs.readdirSync(path.join(PLAY, 'cards'))) {
    const c = JSON.parse(fs.readFileSync(path.join(PLAY, 'cards', f), 'utf8'));
    if (['gameboy', 'gbcolor', 'gamegear', 'gba', 'lynx'].includes(c.system)) assert.ok((c.players || 1) === 1, c.id);
  }
});
