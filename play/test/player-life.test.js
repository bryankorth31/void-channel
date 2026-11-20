// PLAY player life cycle (auditor batch 1, P1 to P3 and P7): stop really stops, a failed or slow save never hangs and
// never covers the game, Back and Start together open the menu on every pad, a save only loads in the engine build that
// made it, and a zip entry that inflates past its stated size is stopped. A stand-in worker; nothing runs a real core.
// Run: node --test "play/test/*.test.js"
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const SRC = path.join(__dirname, '..', 'src');
const Hub = require('../src/hub.js');
const Unzip = require('../src/unzip.js');

// runner.js in a bare page: a fake Worker that records what happens to it, and a canvas that counts pictures.
function page() {
  const workers = [];
  class FakeWorker {
    constructor(url) { this.url = String(url); this.sent = []; this.terminated = false; workers.push(this); }
    postMessage(m) { this.sent.push(m); }
    terminate() { this.terminated = true; }
    reply(m) { if (this.onmessage) this.onmessage({ data: m }); }
  }
  let drawn = 0;
  const ctx = { putImageData() { drawn++; } };
  const sandbox = { self: {}, Worker: FakeWorker, URL, setTimeout, clearTimeout, Promise, Uint8ClampedArray, Int16Array,
    ImageData: class { constructor(d, w, h) { this.data = d; this.width = w; this.height = h; } },
    PlayCards: { engineOf: () => 'engine/x.js', gameUrl: () => 'https://archive.org/cors/x/y.bin', gameFile: () => 'y.bin', isPad: () => true } };
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(SRC, 'runner.js'), 'utf8'), sandbox);
  const canvas = { width: 0, height: 0, getContext: () => ctx };
  return { R: sandbox.PlayRunner, workers, drawn: () => drawn, canvas };
}
const card = { archive: { start: '' }, players: 1 };
const frame = { type: 'frame', w: 2, h: 1, pixels: new Uint32Array(2).buffer };

test('stop ends the worker at once, and nothing it sends late reaches the page', () => {
  const p = page();
  const r = p.R.createRunner({ canvas: p.canvas, mute: true, on: {} });
  r.start(card, 'http://x/play/', 'abc123');
  const w = p.workers[0];
  w.reply(frame);
  assert.equal(p.drawn(), 1);
  const late = w.onmessage;
  r.stop();
  assert.equal(w.terminated, true);
  assert.equal(w.onmessage, null);
  late && late({ data: frame });
  assert.equal(p.drawn(), 1);
});

test('the engine address carries its build (?v=), so a new engine never meets an old one in the cache', () => {
  const p = page();
  p.R.createRunner({ canvas: p.canvas, mute: true, on: {} }).start(card, 'http://x/play/', 'abc123');
  assert.match(decodeURIComponent(p.workers[0].url), /engine=\.\.\/engine\/x\.js\?v=abc123/);
});

test('a save that fails answers null and leaves the game running; a save still waiting at stop answers null', async () => {
  const p = page();
  let error = null;
  const r = p.R.createRunner({ canvas: p.canvas, mute: true, on: { error: (t) => { error = t; } } });
  r.start(card, 'http://x/play/', 'v');
  const w = p.workers[0];
  const first = r.save();
  w.reply({ type: 'saved', state: null });
  assert.equal(await first, null);
  assert.equal(error, null, 'a failed save must not stop the game');
  const waiting = r.save();
  r.stop();
  assert.equal(await waiting, null);
});

test('saves and loads go one at a time: the second waits for the first answer', async () => {
  const p = page();
  const r = p.R.createRunner({ canvas: p.canvas, mute: true, on: {} });
  r.start(card, 'http://x/play/', 'v');
  const w = p.workers[0];
  const a = r.save(), b = r.save();
  assert.equal(w.sent.filter((m) => m.type === 'save').length, 1);
  w.reply({ type: 'saved', state: new ArrayBuffer(4) });
  assert.equal((await a).byteLength, 4);
  assert.equal(w.sent.filter((m) => m.type === 'save').length, 2);
  w.reply({ type: 'saved', state: new ArrayBuffer(8) });
  assert.equal((await b).byteLength, 8);
});

test('Back and Start held together open the menu and send neither to the game', () => {
  const sent = [], actions = [];
  const hub = Hub.createHub({ send: (c, d) => sent.push(c + (d ? ' down' : ' up')), onAction: (a) => actions.push(a) });
  hub.setCard({}, { Back: 'P1:Select', Start: 'P1:Start' });
  const pad = (pressed) => ({ index: 0, mapping: 'standard', axes: [0, 0],
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })) });
  hub.pollPads([pad([Hub.BUTTONS.Back, Hub.BUTTONS.Start])]);
  assert.deepEqual(actions, ['menu']);
  assert.deepEqual(sent, []);
});

test('a save only loads in the engine build that made it', () => {
  const sb = { self: {}, indexedDB: {} }; sb.self = sb;
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(SRC, 'saves.js'), 'utf8'), sb);
  const fits = sb.PlaySaves.fits;
  assert.equal(fits({ core: 'snes9x', commit: 'a' }, { core: 'snes9x', commit: 'a' }), true);
  assert.equal(fits({ core: 'snes9x', commit: 'a' }, { core: 'snes9x', commit: 'b' }), false);
  assert.equal(fits({ state: 1 }, { core: 'snes9x', commit: 'a' }), false, 'a save from before builds were recorded');
});

test('a zip entry that inflates past the size the zip states is stopped', async () => {
  const zlib = require('zlib');
  const data = zlib.deflateRawSync(Buffer.alloc(5000, 65));
  const zip = new Uint8Array(30 + 4 + data.length);
  const b = Buffer.from(zip.buffer);
  b.writeUInt32LE(0x04034b50, 0); b.writeUInt16LE(4, 26); b.write('A.EX', 30); data.copy(b, 34);
  await assert.rejects(Unzip.read(zip, { name: 'A.EX', method: 8, size: data.length, usize: 100, local: 0 }), /bigger than it says/);
});

test('the player page: Save and Load live in the pause menu, the bar keeps Games, Pause, Touch and Full', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'game.html'), 'utf8');
  const bar = html.slice(html.indexOf('<nav class="tools"'), html.indexOf('</nav>'));
  for (const id of ['b-games', 'b-pause', 'b-touch', 'b-full']) assert.ok(bar.includes('id="' + id + '"'), id);
  for (const id of ['b-save', 'b-load']) { assert.ok(!bar.includes('id="' + id + '"'), id); assert.ok(html.includes('id="' + id + '"'), id); }
  const js = fs.readFileSync(path.join(SRC, 'play.js'), 'utf8');
  assert.match(js, /shelf\.games\[c\.id\]\.gone/, 'an old link to a game off the shelf says so');
  assert.match(js, /runner\.prepareSound\(\);/, 'the sound is made in the Play tap');
});
