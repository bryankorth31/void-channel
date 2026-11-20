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
  assert.equal(pick, 'LB, RB or RT (1 to 3); hold LT with the d-pad, LB or RB (4 to 9) on a gamepad, 1 to 9 on the keyboard, 1 to 9 on screen');
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
  const want = { snes: 'diamond', genesis: 'abc', nes: 'pair', gameboy: 'pair', sms: 'pair', gamegear: 'pair', gba: 'pair', lynx: 'pair', a2600: 'one' };
  for (const c of cards.filter(Cards.isPad)) {
    assert.equal(Touch.SYSTEM_SHAPE[c.system], want[c.system], c.id);
    for (const [code] of Touch.shapeOf(c).face) assert.ok(c.controls.keys.includes(code), c.id + ' lacks ' + code);
  }
  assert.equal(Touch.minCols(byId('super-mario-world')), 2, 'the console pad floats over the stage, the picture keeps its size');
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

test('block E: rewind on console games only, seated on LT, R and a touch key, held not pressed', () => {
  assert.equal(Cards.PAD_GAMEPAD.LT, '@rewind');
  assert.equal(Cards.PAD_KEYBOARD.KeyR, '@rewind');
  const worker = fs.readFileSync(path.join(PLAY, 'src', 'core-worker.js'), 'utf8');
  assert.ok(worker.includes("const REWIND_SECONDS = 20, REWIND_BUDGET = 48 * 1024 * 1024, REWIND_MIN_GAP = 3;"));
  assert.ok(worker.includes("if (rewindOn) planRewind();"));
  assert.match(worker, /rewindOn = !!msg\.rewind;/);
  assert.match(worker, /else if \(m\.type === 'rewind'\) rewinding = rewindOn && !!m\.on;/);
  const runner = fs.readFileSync(path.join(PLAY, 'src', 'runner.js'), 'utf8');
  assert.match(runner, /rewind: PlayCards\.isPad\(card\) \}\);/);
  const Hub = require('../src/hub.js');
  const seen = [];
  const hub = Hub.createHub({ send: () => {}, onAction: (a) => seen.push('press ' + a), onRelease: (a) => seen.push('release ' + a) });
  hub.setCard({}, Cards.gamepadMap(byId('super-mario-world')));
  const pad = (b) => ({ index: 0, mapping: 'standard', axes: [0, 0], buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: i === b, value: i === b ? 1 : 0 })) });
  hub.pollPads([pad(Hub.BUTTONS.LT)]); hub.pollPads([pad(-1)]);
  assert.deepEqual(seen, ['press rewind', 'release rewind']);
});

test('B, 20 Nov 2026 "Yes, build as drawn": the console pad floats in one layer, thumbs low at the edges', () => {
  const css = fs.readFileSync(path.join(PLAY, 'play.css'), 'utf8');
  for (const rule of ['.cpad .cdpad{left:var(--e);bottom:var(--e)', '.cpad .cface{right:var(--e);bottom:var(--e)', '.cpad .csl{left:var(--e);top:var(--e)', '.cpad .csr{right:var(--e);top:var(--e)', '.cpad.side .pk,.cpad.side .pdpad{background:rgba(']) assert.ok(css.includes(rule), rule);
  const js = fs.readFileSync(path.join(PLAY, 'src', 'play.js'), 'utf8');
  assert.ok(js.includes("const floating = touch && card && PlayCards.isPad(card);"));
  assert.ok(js.includes("set($('z-over'), floating && L.mode !== 'plain' ? (L.pad ||"), 'upright the layer is the room under the picture');
});

test('T23: holding LT gives the gamepad a second set, so all nine Oregon Trail numbers are reachable', () => {
  const Hub = require('../src/hub.js');
  const c = byId('oregon-trail-1990');
  const sent = [];
  const hub = Hub.createHub({ send: (k, d) => sent.push(k + (d ? ' down' : ' up')) });
  hub.setCard(c, Cards.gamepadMap(c));
  const pad = (b) => ({ index: 0, mapping: 'standard', axes: [0, 0], buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: b.includes(i), value: b.includes(i) ? 1 : 0 })) });
  const B = Hub.BUTTONS;
  for (const step of [[B.LB], [], [B.LT], [B.LT, B.Right], [B.LT], [B.LT, B.RB], []]) hub.pollPads([pad(step)]);
  assert.deepEqual(sent, ['Digit1 down', 'Digit1 up', 'Digit5 down', 'Digit5 up', 'Digit9 down', 'Digit9 up']);
  const reach = new Set([...Object.values(c.gamepad), ...Object.values(c.gamepadShift.map)].filter((v) => /^Digit[1-9]$/.test(v)));
  assert.equal(reach.size, 9);
});

test('T22: on a phone, Play goes fullscreen and sideways where it can, the screen stays awake while playing, and an upright phone is told it plays bigger sideways', () => {
  const js = fs.readFileSync(path.join(PLAY, 'src', 'play.js'), 'utf8');
  for (const bit of ['function phoneScreen()', "screen.orientation.lock('landscape')", "navigator.wakeLock.request('screen')", 'stayAwake(true);', 'stayAwake(false);', "$('cover-turn').hidden", 'stopGame();\n    phoneScreen();']) assert.ok(js.includes(bit), bit);
  // The audit: as a note during play it covered the d-pad, so the start screen says it instead.
  assert.ok(fs.readFileSync(path.join(PLAY, 'game.html'), 'utf8').includes('Turn your phone sideways for a bigger picture'));
});

test('T24: a TV never draws the touch pad; Back opens the menu first and leaves on the second; the play/pause key pauses', () => {
  const js = fs.readFileSync(path.join(PLAY, 'src', 'play.js'), 'utf8');
  for (const bit of ["const isTV = /SMART-TV|SmartTV|Tizen|Web0S|webOS|BRAVIA|Android TV|GoogleTV|CrKey|AFT[A-Z]|Roku|HbbTV/i.test(navigator.userAgent);", "!isTV && matchMedia('(pointer: coarse)')", "history.pushState({ play: 1 }, '')", "if (started && !paused) { setPaused(true); armBack(); }", "const BACK_CODES = new Set([461, 10009]);", "e.key === 'MediaPlayPause'", 'stayAwake(true); armBack();', "const go = () => location.assign($('b-games').href);", "if (Date.now() - (autosave.at || 0) < 5000) return go();", 'else toShelf();']) assert.ok(js.includes(bit), bit);
  assert.ok(!js.includes('history.back()'), 'audit B2: Back never steps out of voidtv.net');
});

test('audit K3: a big game says how far its download has come, and the 256 MB cap holds with no announced size', () => {
  const w = fs.readFileSync(path.join(PLAY, 'src', 'core-worker.js'), 'utf8');
  for (const bit of ["const reader = r.body.getReader(), parts = [];", "if (got > MAX_DOWNLOAD) { reader.cancel();",
    "if (size >= 2 * 1048576 && now - told > 250) { told = now; say(fetchLine(got, size)); }",
    "const game = await gameBytes(msg.gameUrl, msg.gameSize);", "const b = await fetchBytes(url, known);"]) assert.ok(w.includes(bit), bit);
  assert.match(fs.readFileSync(path.join(PLAY, 'src', 'runner.js'), 'utf8'), /gameSize: card\.archive\.size \|\| 0,/);
});

test('audit S6 and S5: the back of a shelf box starts the game itself (not on a phone), offers Continue when there is a save, and teaches the first three actions', () => {
  const js = fs.readFileSync(path.join(PLAY, 'src', 'play.js'), 'utf8');
  assert.ok(js.includes("if ((go === 'new' || go === 'continue') && !isPhone()) {"));
  assert.ok(js.includes('if (runner && pads.some((p) => p && p.buttons && p.buttons.some((b) => b.pressed))) runner.wakeSound();'));
  const shelf = fs.readFileSync(path.join(PLAY, 'src', 'shelf.js'), 'utf8');
  for (const bit of ["play.href = from.href + (direct ? '&go=new' : '');", "root.PlaySaves.get(g.id + ':auto')", "cont.hidden = false; play.textContent = 'New game';"]) assert.ok(shelf.includes(bit), bit);
  const games = JSON.parse(fs.readFileSync(path.join(PLAY, 'shelf', 'index.json'), 'utf8')).games;
  for (const g of games) for (const d of ['pad', 'keyboard', 'touch']) assert.ok(g.how[d].length >= 1 && g.how[d].length <= 3, g.id + ' ' + d);
  assert.ok(fs.readFileSync(path.join(PLAY, 'index.html'), 'utf8').includes('<script src="src/saves.js"></script>\n<script src="src/shelf.js"></script>'));
});

test('audit K5 and S7: a played game is kept in the viewer\'s own browser for a quick second start, and the box back shows the top of its picture', () => {
  const w = fs.readFileSync(path.join(PLAY, 'src', 'core-worker.js'), 'utf8');
  for (const bit of ["const KEEP_GAMES = 8, KEEP_MAX = 64 * 1024 * 1024, KEPT = 'voidtv-play-games';", 'return !known || b.length === known ? b : null;',
    'const game = await gameBytes(msg.gameUrl, msg.gameSize);']) assert.ok(w.includes(bit), bit);
  // Bryan, 20 Nov 2026 ("the card dimension aspect ratio doesn't fit the artwork"): the back's strip shows the whole picture now.
  assert.ok(fs.readFileSync(path.join(PLAY, 'shelf.css'), 'utf8').includes('.held .back .strip img{width:100%;height:100%;object-fit:contain;'));
});
