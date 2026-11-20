// VoidTV PLAY: the host's running half, inside a Web Worker. Licence: GPL-2.0-or-later (play/LICENSE).
// Couch Craft's libretro_host.py, translated: load a core, give it the game, step it one frame at a time at the core's
// own speed, and hand every picture and every run of sound to the page. The worker may block while the core waits on
// its PC thread; the page never does.
//
// Messages in:  start {gameUrl, gameFile, start, vars}, key {down, code}, pad {port, bits}, pause, resume,
//               save, load {state}, reset, stop
// Messages out: status {text}, ready {fps, rate, aspect}, frame {w, h, pixels}, sound {samples}, saved {state},
//               loaded {ok}, error {text}
/* global importScripts, PlayKeys, PlayUnzip */
'use strict';
// The core starts its helper threads from this same script address, so a helper thread lands here too. It only
// needs the engine: load it and step aside (the engine runs the thread itself). The page names the engine in
// the address: core-worker.js?engine=../engine/dosbox-pure.js
const ENGINE = new URL(new URLSearchParams(self.location.search).get('engine') || '', self.location.href).href;
if (self.name === 'em-pthread') importScripts(ENGINE);
else host();

function host() {
importScripts('keys.js', 'unzip.js');

let M = null, running = false, paused = false, timer = 0, lastFrame = -1, fps = 60, next = 0;
// Rewind (audit batch 4, block E; console cores only): the last 20 seconds, in snapshots spaced by a memory budget per
// core (about 48 MB): a small state (Atari, NES, Game Boy, Master System, Game Gear) is kept every 3 frames and steps back
// one a frame, so it plays like film backwards; a big one is kept further apart (at most every half second). While held,
// rewind steps back about five times faster than the snapshots were taken.
const REWIND_SECONDS = 20, REWIND_BUDGET = 48 * 1024 * 1024, REWIND_MIN_GAP = 3;
let rewindOn = false, rewinding = false, ring = [], frameNo = 0, rewindGap = 30, rewindKeep = 40, rewindStep = 6;
function planRewind() {
  const size = M._host_state_size() || 1;
  const most = Math.max(1, Math.round(fps / 2));
  rewindGap = Math.min(most, Math.max(REWIND_MIN_GAP, Math.ceil(size * fps * REWIND_SECONDS / REWIND_BUDGET)));
  rewindKeep = Math.ceil(fps * REWIND_SECONDS / rewindGap);
  rewindStep = Math.max(1, Math.round(rewindGap / 5));
}
function snapshot() {
  const size = M._host_state_size(); if (!size) return;
  const p = M._malloc(size);
  if (M._host_state_save(p, size)) { ring.push(M.HEAPU8.slice(p, p + size)); if (ring.length > rewindKeep) ring.shift(); }
  M._free(p);
}
function stepBack() {
  const state = ring.length > 1 ? ring.pop() : ring[0];
  if (!state) return;
  const p = M._malloc(state.length); M.HEAPU8.set(state, p); M._host_state_load(p, state.length); M._free(p);
  M._host_run(); M._host_audio_clear();
}
const held = new Set();
const say = (text) => postMessage({ type: 'status', text });

// The game file, in one plain sentence when it cannot come: gone from the Archive, the Archive busy, or too big.
const MAX_DOWNLOAD = 256 * 1024 * 1024;
async function fetchBytes(url) {
  let r;
  try { r = await fetch(url, { credentials: 'omit' }); } catch (e) {
    throw new Error('The Internet Archive is not answering right now. Check the connection and press Play to try again.');
  }
  if (r.status === 404 || r.status === 410 || r.status === 403) throw new Error("This game's file is no longer on the Internet Archive, so it cannot play here.");
  if (!r.ok) throw new Error('The Internet Archive is busy right now (it answered ' + r.status + '). Try again in a little while.');
  const size = +r.headers.get('content-length') || 0;
  if (size > MAX_DOWNLOAD) throw new Error('This game is ' + Math.round(size / 1048576) + ' MB, more than PLAY can hold in a browser yet.');
  return new Uint8Array(await r.arrayBuffer());
}

function callStr(fn, ...strs) {
  const ptrs = strs.map((s) => { const n = M.lengthBytesUTF8(s) + 1; const p = M._malloc(n); M.stringToUTF8(s, p, n); return p; });
  const r = M['_' + fn](...ptrs);
  ptrs.forEach((p) => M._free(p));
  return r;
}

// Unpack the game's zip onto the core's memory disk and return the path of the program to start. The core then
// treats that program's folder as drive C: and runs it by itself, the way the game expects.
async function unpack(bytes, start) {
  let program = null;
  const want = start.replace(/\\/g, '/').toLowerCase();
  for (const e of PlayUnzip.entries(bytes)) {
    const rel = PlayUnzip.safe(e.name);
    if (!rel || e.dir) continue;
    const full = '/game/disk/' + rel;
    M.FS.mkdirTree(full.slice(0, full.lastIndexOf('/')));
    M.FS.writeFile(full, await PlayUnzip.read(bytes, e));
    if (rel.toLowerCase() === want) program = full;
  }
  if (!program) throw new Error('The game zip has no ' + start);
  return program;
}

async function start(msg) {
  say('Loading the engine');
  importScripts(ENGINE);
  // Every engine is built to the same shape: PlayCore (DOSBox Pure, built first, is named DosboxPure).
  const factory = self.PlayCore || self.DosboxPure;
  M = await factory({
    // The wasm file carries the same ?v= as the engine script, so the two always come from one build.
    locateFile: (f) => { const u = new URL(f, ENGINE); u.search = new URL(ENGINE).search; return u.href; },
    print: (t) => console.log('[core]', t),
    printErr: (t) => console.warn('[core]', t),
  });
  say('Fetching the game from the Internet Archive');
  const game = await fetchBytes(msg.gameUrl);
  for (const d of ['/game', '/save', '/sys']) M.FS.mkdir(d);
  let path = '/game/' + msg.gameFile;
  if (msg.start && /\.zip$/i.test(msg.gameFile)) path = await unpack(game, msg.start);
  else M.FS.writeFile(path, game);
  M._host_init();
  for (const [k, v] of Object.entries(msg.vars || {})) callStr('host_set_var', k, String(v));
  say('Starting the game');
  if (!callStr('host_load', path)) throw new Error('The core could not open ' + path);
  for (let port = 0; port < (msg.pads || 0); port++) M._host_plug_pad(port);
  rewindOn = !!msg.rewind;
  fps = M._host_fps() || 60;
  if (rewindOn) planRewind();
  postMessage({ type: 'ready', fps, rate: M._host_sample_rate() || 44100, aspect: M._host_aspect() });
  running = true; next = performance.now();
  tick();
}

// One frame of the PC, then the picture and the sound out to the page. The clock keeps the core's own speed and
// catches up after a slow frame without racing (at most 4 frames behind, then it lets the time go).
function tick() {
  if (!running) return;
  const now = performance.now();
  if (!paused) {
    let steps = 0;
    while (next <= now && steps < 4) {
      frameNo++;
      if (rewinding) { if (frameNo % rewindStep === 0) stepBack(); }
      else { M._host_run(); if (rewindOn && frameNo % rewindGap === 0) snapshot(); }
      next += 1000 / fps; steps++;
    }
    if (next < now - 4000 / fps) next = now;
    sendFrame(); sendSound();
  } else next = now;
  timer = setTimeout(tick, Math.max(0, next - performance.now()));
}

function sendFrame() {
  const count = M._host_frame_count();
  if (count === lastFrame) return;
  lastFrame = count;
  const w = M._host_frame_w(), h = M._host_frame_h();
  if (!w || !h) return;
  const at = M._host_frame() >> 2;
  const pixels = new Uint32Array(w * h);
  pixels.set(M.HEAPU32.subarray(at, at + w * h));
  postMessage({ type: 'frame', w, h, aspect: M._host_aspect(), pixels: pixels.buffer }, [pixels.buffer]);
}

function sendSound() {
  const n = M._host_audio_len();
  if (!n) return;
  const at = M._host_audio() >> 1;
  const samples = new Int16Array(n);
  samples.set(M.HEAP16.subarray(at, at + n));
  M._host_audio_clear();
  postMessage({ type: 'sound', samples: samples.buffer }, [samples.buffer]);
}

function key(down, code) {
  const id = PlayKeys.RETROK[code];
  if (id === undefined || !M) return;
  if (down) held.add(code); else held.delete(code);
  M._host_key(down ? 1 : 0, id, down ? PlayKeys.charOf(code, held.has('ShiftLeft') || held.has('ShiftRight')) : 0, PlayKeys.modsOf(held));
}

function save() {
  const size = M._host_state_size();
  const p = M._malloc(size);
  const ok = M._host_state_save(p, size);
  const state = ok ? M.HEAPU8.slice(p, p + size) : null;
  M._free(p);
  if (!state) return postMessage({ type: 'saved', state: null }); // the page says so in a toast; the game keeps running
  postMessage({ type: 'saved', state: state.buffer }, [state.buffer]);
}

function load(buf) {
  ring = []; // the old snapshots belong to the spot you just left
  const bytes = new Uint8Array(buf);
  const p = M._malloc(bytes.length);
  M.HEAPU8.set(bytes, p);
  const ok = M._host_state_load(p, bytes.length);
  M._free(p);
  postMessage({ type: 'loaded', ok: !!ok });
}

onmessage = (e) => {
  const m = e.data;
  try {
    if (m.type === 'start') start(m).catch((err) => postMessage({ type: 'error', text: String(err.message || err) }));
    else if (!M) return;
    else if (m.type === 'key') key(m.down, m.code);
    else if (m.type === 'pad') M._host_pad(m.port, m.bits);
    else if (m.type === 'pause') paused = true;
    else if (m.type === 'resume') paused = false;
    else if (m.type === 'save') save();
    else if (m.type === 'load') load(m.state);
    else if (m.type === 'reset') { M._host_reset(); ring = []; }
    else if (m.type === 'rewind') rewinding = rewindOn && !!m.on;
    else if (m.type === 'stop') { running = false; clearTimeout(timer); close(); }
  } catch (err) {
    // A save or load that throws is answered "no" (the game keeps running); anything else stops the game with its reason.
    if (m && m.type === 'save') postMessage({ type: 'saved', state: null });
    else if (m && m.type === 'load') postMessage({ type: 'loaded', ok: false });
    else postMessage({ type: 'error', text: String(err.message || err) });
  }
};
}
