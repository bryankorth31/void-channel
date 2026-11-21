// VoidTV PLAY: tests for the two formats added 20 Nov 2026 (Bryan: Flash "Yes, build Ruffle"; Windows 3.1 "Yes, try
// it"). Licence: GPL-2.0-or-later (play/LICENSE).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const PLAY = path.join(__dirname, '..');
const Cards = require('../src/cards.js');
const cards = fs.readdirSync(path.join(PLAY, 'cards')).filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(fs.readFileSync(path.join(PLAY, 'cards', f), 'utf8')));

test('Flash: Ruffle is served from its own folder, built from the commit its record names, with its licence beside it', () => {
  const core = Cards.CORES.ruffle;
  assert.equal(core.kind, 'ruffle');
  assert.deepEqual(core.systems, ['flash']);
  const rec = fs.readFileSync(path.join(PLAY, 'core', 'ruffle.txt'), 'utf8');
  const commit = rec.match(/^commit: ([0-9a-f]{40})$/m)[1];
  assert.ok(core.source.endsWith('/tree/' + commit), 'the footer names the commit in core/ruffle.txt');
  assert.match(rec, /^licence: MIT or Apache-2\.0/m);
  const js = fs.readFileSync(path.join(PLAY, core.engine), 'utf8');
  assert.ok(js.startsWith('/* Ruffle 0.8.0 (Flash Player emulator), MIT or Apache-2.0, source: https://github.com/ruffle-rs/ruffle/tree/' + commit), 'the one-line notice first');
  // The WebAssembly the script asks for is the one beside it, and under Cloudflare's 25 MiB file cap.
  const wasm = js.match(/"\.\/(ruffle_web_bg\.[A-Z0-9]+\.wasm)"/)[1];
  const file = path.join(PLAY, 'engine', 'ruffle', wasm);
  assert.ok(fs.existsSync(file), wasm);
  assert.ok(fs.statSync(file).size < 25 * 1024 * 1024);
  assert.deepEqual(fs.readdirSync(path.join(PLAY, 'engine', 'ruffle')).sort(), ['LICENSE.md', 'ruffle.js', wasm].sort(), 'nothing else is served');
  assert.ok(fs.statSync(path.join(PLAY, core.terms)).size > 500, 'its licence text travels with it');
  assert.ok(!core.noDonation, 'MIT or Apache-2.0 allow any use, so the donation line stays');
});

test('Flash: the runner has the page\'s runner surface, never opens a link, and keeps a muted test silent', () => {
  const F = require('../src/flash-runner.js');
  const surface = Object.keys(F.createRunner({ canvas: {} })).sort();
  for (const k of ['start', 'stop', 'pause', 'resume', 'save', 'load', 'key', 'pad', 'mouse', 'reset', 'rewind', 'saveWhy', 'wakeSound', 'prepareSound', 'volume', 'frames'])
    assert.ok(surface.includes(k), k);
  assert.equal(F.CONFIG.openUrlMode, 'deny', 'a game\'s links never open a page');
  assert.equal(F.CONFIG.allowNetworking, 'internal');
  assert.equal(F.CONFIG.polyfills, false, 'Ruffle never rewrites the page');
  const src = fs.readFileSync(path.join(PLAY, 'src', 'flash-runner.js'), 'utf8');
  assert.ok(src.includes('level = mute ? 0 :'), 'the page\'s ?mute=1 holds whatever the volume says');
  assert.ok(src.includes('api.volume = level;   // before the movie starts'));
  const page = fs.readFileSync(path.join(PLAY, 'game.html'), 'utf8');
  assert.ok(page.indexOf('src/flash-runner.js') > page.indexOf('src/cards.js') && page.indexOf('src/flash-runner.js') < page.indexOf('src/play.js'));
});

test('Flash: Ruffle\'s crash panel never shows (it links to ruffle.rs and GitHub); the page says it in its own words', () => {
  const src = fs.readFileSync(path.join(PLAY, 'src', 'flash-runner.js'), 'utf8');
  const body = src.slice(src.indexOf('function watchScreens()'), src.indexOf('// Ruffle\'s element sits exactly where the canvas is'));
  assert.ok(body.includes("if (sr.querySelector('#panic')) {"), 'the panel is caught the moment it appears');
  assert.ok(body.includes("for (const p of sr.querySelectorAll('#panic')) p.remove();"));
  assert.ok(body.includes('on.error && on.error(CRASH);'), 'the page stops the game and shows its own message');
  assert.ok(body.includes("a.removeAttribute('href')"), 'any other link Ruffle draws loses its address');
  assert.ok(body.includes('guard.observe(sr, { childList: true, subtree: true });'));
  assert.ok(src.includes('        watchScreens();\n        lay();'), 'watching starts before the movie loads');
  assert.ok(!/ruffle\.rs|github/i.test(src.match(/const CRASH = '([^']*)'/)[1]), 'our message names no other site');
});

test('Flash cards: a .swf from the Archive, pointer actions on every input, on Kids', () => {
  const flash = cards.filter((c) => c.system === 'flash');
  assert.ok(flash.length >= 2);
  for (const c of flash) {
    assert.deepEqual(Cards.check(c), [], c.id);
    assert.equal(c.core, 'ruffle', c.id);
    assert.match(c.archive.file, /\.swf$/i, c.id);
    assert.match(Cards.gameUrl(c), /^https:\/\/archive\.org\/cors\//, c.id);
    assert.equal(c.controls.mouse, true, c.id);
  }
  const lines = Object.fromEntries(Cards.actionLines(flash[0]).map((l) => [l.do, l.how]));
  assert.equal(lines.Pick, 'RB on a gamepad, a click of the mouse, a tap on screen');
  assert.equal(lines.Point, 'the right stick on a gamepad, the mouse, a finger on screen');
  assert.equal(lines.Pause, 'Start on a gamepad, the Pause button on screen');
});

test('Windows 3.1: the Archive\'s own Windows, fetched from the Archive at Play and never served by voidtv.net', () => {
  assert.deepEqual(Cards.CORES['dosbox-pure'].systems, ['dos', 'win3']);
  for (const [name, w] of Object.entries(Cards.WINDOWS)) {
    assert.equal(w.item, 'emularity_win31', name);
    assert.ok(w.size > 1e6, name);
  }
  const rr = cards.find((c) => c.id === 'reader-rabbit-1-windows-1997');
  assert.deepEqual(Cards.windowsOf(rr), { url: 'https://archive.org/cors/emularity_win31/win31.zip', size: 2790594, shell: true });
  assert.equal(Cards.windowsOf(cards.find((c) => c.system === 'dos')), null, 'a DOS game starts on plain DOS');
  // A Windows card names its Windows and the program to start; anything else is refused.
  assert.ok(Cards.check(Object.assign({}, rr, { archive: Object.assign({}, rr.archive, { windows: 'win95' }) })).includes('archive.windows'));
  assert.ok(Cards.check(Object.assign({}, rr, { archive: Object.assign({}, rr.archive, { start: '' }) })).includes('archive.windows'));
  // No Windows file is in play/: Windows is the Archive's, not ours to serve.
  const all = [];
  const walk = (d) => { for (const n of fs.readdirSync(d, { withFileTypes: true })) { if (n.isDirectory()) walk(path.join(d, n.name)); else all.push(n.name.toLowerCase()); } };
  walk(PLAY);
  for (const f of ['win.com', 'krnl386.exe', 'win31.zip', 'win31_nonshell.zip', 'user.exe', 'gdi.exe']) assert.ok(!all.includes(f), f);
});

test('a slow download is not a failed one: each word of progress before the first picture starts the minute again (Kids session, Reader Rabbit, 20 Nov 2026)', () => {
  const js = fs.readFileSync(path.join(PLAY, 'src', 'play.js'), 'utf8');
  assert.ok(js.includes('function armDeadline() { clearTimeout(deadline); deadline = setTimeout(() => { arriving = false; fail(NOT_ARRIVED); }, DEADLINE_MS); }'));
  assert.ok(js.includes('    arriving = true; armDeadline();\n'), 'Play starts the minute');
  assert.ok(js.includes('status: (t) => { status(t); if (arriving) armDeadline(); }'), 'progress starts it again');
  assert.ok(js.includes("arriving = false; clearTimeout(deadline); $('cover').hidden = true;"), 'the first picture ends it');
  // The worker says progress only when bytes come, so a download that truly stops still fails after a minute.
  const w = fs.readFileSync(path.join(PLAY, 'src', 'core-worker.js'), 'utf8');
  assert.ok(w.includes("if (size >= 2 * 1048576 && now - told > 250) { told = now; say(fetchLine(got, size, what)); }"));
  assert.ok(w.includes("gameBytes(msg.windows.url, msg.windows.size, 'Windows 3.1')"), 'the Windows download says what it is');
});

test('Windows 3.1: the worker puts Windows on the game\'s own C: drive and starts it with a start file of ours', () => {
  const runner = fs.readFileSync(path.join(PLAY, 'src', 'runner.js'), 'utf8');
  assert.ok(runner.includes('windows: PlayCards.windowsOf ? PlayCards.windowsOf(card) : null'));
  const w = fs.readFileSync(path.join(PLAY, 'src', 'core-worker.js'), 'utf8');
  assert.ok(w.includes('if (msg.windows && msg.start) path = await addWindows(msg, path);'));
  const body = w.slice(w.indexOf('async function addWindows('), w.indexOf('// A console game kept inside a .zip'));
  assert.ok(body.includes("'WINDOWS/' + name.slice(8)"), 'the settings go into C:\\WINDOWS');
  assert.ok(body.includes(".split('D:' + BS).join('C:' + BS)"), 'their D: becomes C:');
  assert.ok(body.includes("text.replace(/^shell=.*$/im, 'shell=' + dosPath)"), 'the game is Windows\' only program');
  assert.ok(body.includes("M.FS.writeFile(root + 'PLAYWIN.BAT'"));
  assert.ok(body.includes("lines.join('\\r\\n')"), 'DOS line endings');
});

test('Windows 3.1: WinG\'s display answer for our DOSBox Pure is seeded, so a game starts without its 90-second display test (Bryan held Reader Rabbit off Kids for it, 20 Nov 2026)', () => {
  const w = fs.readFileSync(path.join(PLAY, 'src', 'core-worker.js'), 'utf8');
  const seen = w.match(/const WING_SEEN = '([^']+)';/)[1];
  // The same shape as the answer the Archive's own package carries for its emulator: driver, mode, version, an answer of 66.
  const [key, answer] = seen.split('=');
  assert.match(key, /^SVGA256\.DRV640x480x8\(0,12\)v4\.0\.0\.58-[0-9A-F]{4}-1\.0\.0\.37$/);
  assert.match(answer, /^[A-Z0-9]{66}$/);
  assert.ok(w.includes("if (/^WINDOWS\\/WIN\\.INI$/i.test(name) && !text.includes(WING_SEEN)) text = text.replace("), 'written under [WinG] in WIN.INI');
});
