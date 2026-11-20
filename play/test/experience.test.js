// PLAY experience blocks A to C (audit batch 4): every card says what its buttons DO, every help line is drawn from
// that, the start screen shows the game's picture and first actions, and Continue picks up where you left off.
// Run: node --test "play/test/*.test.js"
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const PLAY = path.join(__dirname, '..');
const Cards = require('../src/cards.js');
const cards = fs.readdirSync(path.join(PLAY, 'cards')).filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(fs.readFileSync(path.join(PLAY, 'cards', f), 'utf8')));
const byId = (id) => cards.find((c) => c.id === id);

test('every card lists three to six actions, and check warns when one does not', () => {
  for (const c of cards) {
    assert.deepEqual(Cards.warnings(c), [], c.id);
    assert.ok(c.actions.length >= 3 && c.actions.length <= 6, c.id);
  }
  assert.equal(Cards.warnings({ controls: {} }).length, 1);
});

test('every action is something a player can actually do on at least one input', () => {
  for (const c of cards) for (const l of Cards.actionLines(c)) assert.ok(l.how, c.id + ': ' + l.do);
});

test('a console action speaks the game\'s words on every input', () => {
  const lines = Object.fromEntries(Cards.actionLines(byId('golden-axe-genesis')).map((l) => [l.do, l.how]));
  assert.equal(lines.Attack, 'the bottom button (A) on a gamepad, Z on the keyboard, B on screen');
  assert.equal(lines.Move, 'the d-pad on a gamepad, the arrow keys on the keyboard, the d-pad on screen');
});

test('a DOS range reads as a range, and the gamepad says which part it reaches', () => {
  const pick = Cards.actionLines(byId('oregon-trail-1990')).find((l) => l.do === 'Pick from a list').how;
  assert.equal(pick, 'LB, RB, LT or RT (1 to 4) on a gamepad, 1 to 9 on the keyboard, 1 to 9 on screen');
});

test('one input at a time, for the start screen', () => {
  const pad = Cards.actionLines(byId('super-mario-world'), 'pad').map((l) => l.do + ': ' + l.how);
  assert.deepEqual(pad.slice(0, 2), ['Move: d-pad Left or Right', 'Jump: the bottom button (A)']);
});

test('the start screen shows the item picture through /cors/, and Continue comes from a same-build automatic save', () => {
  const js = fs.readFileSync(path.join(PLAY, 'src', 'play.js'), 'utf8');
  assert.match(js, /art\.src = 'https:\/\/archive\.org\/cors\/' \+ c\.archive\.item \+ '\/__ia_thumb\.jpg'/);
  assert.match(js, /const AUTO = \(c\) => c\.id \+ ':auto'/);
  assert.match(js, /if \(!PlaySaves\.fits\(rec, build\) \|\| started\) return;/);
  for (const when of ["addEventListener('pagehide'", "$('b-games').onclick", 'runner.pause(); autosave();']) assert.ok(js.includes(when), when);
  const html = fs.readFileSync(path.join(PLAY, 'game.html'), 'utf8');
  assert.match(html, /<img id="cover-art" class="cover-art" alt="" crossorigin="anonymous" hidden>/);
  assert.match(html, /id="b-continue"/);
  assert.match(html, /<ul id="controls" class="keys-help"><\/ul>/);
});

test('block D: every console card gets its machine\'s pad shape, and every face button of the shape exists on the card', () => {
  const Touch = require('../src/touchpad.js');
  const want = { snes: 'diamond', genesis: 'abc', nes: 'pair', gameboy: 'pair', sms: 'pair', gamegear: 'pair', a2600: 'one' };
  for (const c of cards.filter(Cards.isPad)) {
    assert.equal(Touch.SYSTEM_SHAPE[c.system], want[c.system], c.id);
    for (const [code] of Touch.shapeOf(c).face) assert.ok(c.controls.keys.includes(code), c.id + ' lacks ' + code);
  }
  assert.equal(Touch.minCols(byId('super-mario-world')), 3);
  assert.equal(Touch.minCols(byId('tetris-game-boy')), 2);
  assert.equal(Touch.minCols(byId('oregon-trail-1990')), 2);
});

test('C1: play saves itself every 30 seconds too, since a closing page cannot finish a save', () => {
  const js = fs.readFileSync(path.join(PLAY, 'src', 'play.js'), 'utf8');
  assert.match(js, /const AUTO_EVERY_MS = 30000;/);
  assert.ok(js.includes("autoTimer = setInterval(() => { if (started && !paused && !document.hidden) autosave(); }, AUTO_EVERY_MS);"));
  assert.ok(js.includes("clearInterval(autoTimer)"));
});

test('A1 to A3: directions are named, buttons by their place, and no action prints without a way to do it', () => {
  const lines = (id, dev) => Object.fromEntries(Cards.actionLines(byId(id), dev).map((l) => [l.do, l.how]));
  assert.equal(lines('tetris-game-boy')['Drop faster'], 'd-pad Down on a gamepad, Down arrow on the keyboard, d-pad Down on screen');
  assert.equal(lines('super-mario-world', 'pad').Jump, 'the bottom button (A)');
  assert.ok(!('Answer yes or no' in lines('oregon-trail-1990', 'pad')));
  for (const c of cards) for (const dev of ['pad', 'keyboard', 'touch']) for (const l of Cards.actionLines(c, dev)) assert.ok(l.how, c.id + ' ' + dev + ' ' + l.do);
});
