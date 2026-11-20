// VoidTV PLAY: the arcade runner, checked by running start() with a fake page (audit of the 244-game batch, 20 Nov 2026).
// Licence: GPL-2.0-or-later (play/LICENSE).
const test = require('node:test');
const assert = require('node:assert/strict');

// The runner keeps MAME's Module on its root (self in a page); here the root is node's global.
globalThis.self = globalThis;
const fetched = [];
globalThis.fetch = async (url) => {
  fetched.push(String(url));
  if (/\.wasm\.gz/.test(url)) return { ok: false, status: 404 };   // the engine: not needed to build the arguments
  return new Response(new Uint8Array(16));
};
globalThis.location = { href: 'http://127.0.0.1/play/game.html' };
globalThis.PlayCards = { engineOf: (card) => 'engine/mame/' + card.archive.engine + '.js' };
const added = [];
globalThis.document = { title: 'PLAY', querySelector: () => null, createElement: () => ({}), body: { appendChild: (s) => added.push(s) } };
const { createRunner } = require('../src/arcade-runner.js');

const canvas = { getContext: () => null };
const zaxxon = { archive: { item: 'arcade_zaxxon', file: 'zaxxon.zip', size: 16, engine: 'classics', driver: 'zaxxon', parents: [] }, aspect: 3 / 4 };

test('MAME looks for sound samples beside the games, so Zaxxon finds the .wav files inside zaxxon.zip', async () => {
  const r = createRunner({ canvas, on: {} });
  await r.start(zaxxon);
  const args = globalThis.Module.arguments;
  assert.equal(args[0], 'zaxxon');
  const i = args.indexOf('-samplepath');
  assert.ok(i > 0, 'a sample path is given');
  assert.equal(args[i + 1], '/roms', 'the same folder the zips are written to');
  assert.ok(args.includes('-rompath') && args[args.indexOf('-rompath') + 1] === '/roms');
  assert.ok(added.length === 1 && /classics\.js$/.test(added[0].src), 'the engine script is added once');
  // The zip goes where both paths point.
  const written = [];
  globalThis.FS = { mkdir: () => {}, writeFile: (p) => written.push(p) };
  globalThis.Module.preRun[0]();
  assert.deepEqual(written, ['/roms/zaxxon.zip']);
});

test('wakeSound resumes the sound context MAME made for itself, and only when it is suspended', () => {
  const r = createRunner({ canvas, on: {} });
  r.wakeSound();                                     // before MAME has made any sound: nothing to do, no error
  let resumed = 0;
  const ctx = { state: 'suspended', resume: () => { resumed++; ctx.state = 'running'; } };
  globalThis.jsmame_web_audio = { get_context: () => ctx };
  r.wakeSound();
  assert.equal(resumed, 1);
  r.wakeSound();
  assert.equal(resumed, 1, 'a running context is left alone');
  globalThis.jsmame_web_audio = { get_context: () => null };
  r.wakeSound();                                     // muted (-sound none): MAME never makes one
  delete globalThis.jsmame_web_audio;
});

test('a key press wakes an arcade game\'s sound before the page hands the key to MAME', () => {
  const js = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'src', 'play.js'), 'utf8');
  const body = js.slice(js.indexOf('function keyEvent(e, down) {'), js.indexOf('function arcadeEsc(e) {'));
  const wake = body.indexOf('runner.wakeSound()'), arcade = body.indexOf('if (isArcade()) return;');
  assert.ok(wake > 0 && arcade > 0 && wake < arcade);
});
