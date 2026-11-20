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
const BUILD = new URLSearchParams(self.location.search).get('b');
importScripts(...['keys.js', 'unzip.js', 'inflate.js', 'lazyzip.js'].map((f) => (BUILD && /^[0-9a-f]{12}$/.test(BUILD) ? f + '?v=' + BUILD : f)));

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
// Audit K5: a game played once is kept in the viewer's own browser (Cache Storage), so the next play starts at once.
// The viewer's copy only: nothing is kept on voidtv.net. The eight most recent games up to 64 MB each; an older one is
// let go, and the browser may clear any of them when it needs room. A kept copy whose size differs from the card's is
// not used (the Archive file changed).
const KEEP_GAMES = 8, KEEP_MAX = 64 * 1024 * 1024, KEPT = 'voidtv-play-games';
async function keptGame(url, known) {
  try {
    if (!self.caches) return null;
    const r = await (await caches.open(KEPT)).match(url);
    if (!r) return null;
    const b = new Uint8Array(await r.arrayBuffer());
    return !known || b.length === known ? b : null;
  } catch (e) { return null; }
}
async function keepGame(url, bytes) {
  try {
    if (!self.caches || bytes.length > KEEP_MAX) return;
    const c = await caches.open(KEPT);
    await c.delete(url);                         // to the back of the line: the newest is kept longest
    await c.put(url, new Response(bytes, { headers: { 'content-type': 'application/octet-stream' } }));
    const keys = await c.keys();
    for (const k of keys.slice(0, Math.max(0, keys.length - KEEP_GAMES))) await c.delete(k);
  } catch (e) { /* no room or no storage: the game still plays */ }
}
async function gameBytes(url, known) {
  const kept = await keptGame(url, known);
  if (kept) return kept;
  const b = await fetchBytes(url, known);
  keepGame(url, b);
  return b;
}

async function fetchBytes(url, known) {
  let r;
  try { r = await fetch(url, { credentials: 'omit' }); } catch (e) {
    throw new Error('The Internet Archive is not answering right now. Check the connection and press Play to try again.');
  }
  if (r.status === 404 || r.status === 410 || r.status === 403) throw new Error("This game's file is no longer on the Internet Archive, so it cannot play here.");
  if (!r.ok) throw new Error('The Internet Archive is busy right now (it answered ' + r.status + '). Try again in a little while.');
  // A packed answer's length is not the file's, so the card's recorded size is the total when the Archive packs it.
  const size = (!r.headers.get('content-encoding') && +r.headers.get('content-length')) || known || 0;
  if (size > MAX_DOWNLOAD) throw new Error('This game is ' + Math.round(size / 1048576) + ' MB, more than PLAY can hold in a browser yet.');
  // Audit K3: read it as it arrives and say how far along it is ("Fetching the game: 6 of 16 MB"), so a big game
  // never sits on one still sentence. Small games (under 2 MB) arrive before a line would help.
  if (!r.body || !r.body.getReader) return new Uint8Array(await r.arrayBuffer());
  const reader = r.body.getReader(), parts = [];
  let got = 0, told = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value); got += value.length;
    if (got > MAX_DOWNLOAD) { reader.cancel(); throw new Error('This game is more than ' + MAX_DOWNLOAD / 1048576 + ' MB, more than PLAY can hold in a browser yet.'); }
    const now = Date.now();
    if (size >= 2 * 1048576 && now - told > 250) { told = now; say(fetchLine(got, size)); }
  }
  const out = new Uint8Array(got);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}
const fetchLine = (got, size) => 'Fetching the game: ' + Math.min(Math.round(got / 1048576), Math.round(size / 1048576)) + ' of ' + Math.round(size / 1048576) + ' MB';

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

// A console game kept inside a .zip: the core gets the one file with the machine's own ending (the largest, if there
// are several: a zip with a readme or a second region). A zip without one goes to the core as it is.
async function romFromZip(bytes, exts, fallback) {
  const ok = new Set(exts.map((x) => '.' + String(x).toLowerCase()));
  const roms = PlayUnzip.entries(bytes).filter((e) => !e.dir && PlayUnzip.safe(e.name)
    && ok.has((e.name.match(/\.[^./]+$/) || [''])[0].toLowerCase()));
  if (!roms.length) { M.FS.writeFile(fallback, bytes); return fallback; }
  const e = roms.reduce((a, b) => ((b.usize || 0) > (a.usize || 0) ? b : a));
  const name = PlayUnzip.safe(e.name).split('/').pop();
  const path = '/game/' + name;
  M.FS.writeFile(path, await PlayUnzip.read(bytes, e));
  return path;
}

// Plan T21: a big many-file game, read in 8 MB pieces through the voidtv.net pass-through and unpacked file by file as
// the game opens them. Pieces come by synchronous requests (allowed in a worker): the engine's reads wait for them.
function piecesFrom(url) {
  return (n) => {
    const x = new XMLHttpRequest();
    x.open('GET', url + '&piece=' + n, false);
    x.responseType = 'arraybuffer';
    try { x.send(); } catch (e) { throw new Error('The Internet Archive is not answering right now. Check the connection and press Play to try again.'); }
    if (x.status === 404) throw new Error("This game's file is no longer on the Internet Archive, so it cannot play here.");
    if (x.status === 409) throw new Error('This game changed at the Internet Archive since it was added, so it is off until someone looks.');
    if (x.status !== 200) throw new Error('The Internet Archive is busy right now (it answered ' + x.status + '). Try again in a little while.');
    return new Uint8Array(x.response);
  };
}
function mountStreamed(msg) {
  const deps = { entries: PlayUnzip.entries, safe: PlayUnzip.safe, inflateRaw: PlayInflate.inflateRaw };
  const zip = PlayLazyZip.open(msg.stream.size, piecesFrom(msg.stream.url), deps);
  let shown = 0;
  PlayLazyZip.mount(M.FS, zip, '/game/disk', deps, (rel, n) => {
    // Say what is arriving while the game waits on a big file; small ones pass without a word.
    if (n > 2 * 1048576 && Date.now() - shown > 500) { shown = Date.now(); say('Loading ' + rel.split('/').pop() + ' (' + Math.round(n / 1048576) + ' MB)'); }
  });
  const want = msg.start.replace(/\\/g, '/').toLowerCase();
  const hit = zip.entries.find((e) => (PlayUnzip.safe(e.name) || '').toLowerCase() === want);
  if (!hit) throw new Error('The game zip has no ' + msg.start);
  return '/game/disk/' + PlayUnzip.safe(hit.name);
}

// Write a kept battery save back into the game. The size an engine reports can differ between loading and playing (the
// audit: Genesis Plus GX says 64 KB before the first frame and only the written part once running; mGBA says 128 KB while
// it still guesses the save type), so a save that fits goes in from the start of the game's save memory, never past
// its end. Yes or no.
function putSram(buf) {
  const n = M && M._host_sram_size ? M._host_sram_size() : 0, p = n ? M._host_sram() : 0;
  const b = buf ? new Uint8Array(buf) : null;
  if (!p || !b || !b.length || b.length > n) return false;
  M.HEAPU8.set(b, p);
  return true;
}

async function start(msg) {
  say('Loading the engine');
  importScripts(ENGINE);
  // Every engine is built to the same shape: PlayCore (DOSBox Pure, built first, is named DosboxPure).
  const factory = self.PlayCore || self.DosboxPure;
  M = await factory({
    // The wasm file carries the same ?v= as the engine script, so the two always come from one build.
    locateFile: (f) => { const u = new URL(f, ENGINE); u.search = new URL(ENGINE).search; return u.href; },
    // Audit T21a: DOSBox Pure will not save while DOS itself runs (a start batch file's menu); it says so in its log.
    print: (t) => { if (/Unable to save state while game is not running/.test(t)) saveRefusedAtDos = true; console.log('[core]', t); },
    printErr: (t) => console.warn('[core]', t),
  });
  for (const d of ['/game', '/save', '/sys']) M.FS.mkdir(d);
  let path = '/game/' + msg.gameFile;
  if (msg.stream && msg.start) {
    say("Reading the game's list of files");
    path = mountStreamed(msg);
  } else {
    say('Fetching the game from the Internet Archive');
    const game = await gameBytes(msg.gameUrl, msg.gameSize);
    if (msg.start && /\.zip$/i.test(msg.gameFile)) path = await unpack(game, msg.start);
    else if (/\.zip$/i.test(msg.gameFile) && msg.rom && msg.rom.length) path = await romFromZip(game, msg.rom, path);
    else M.FS.writeFile(path, game);
  }
  M._host_init();
  for (const [k, v] of Object.entries(msg.vars || {})) callStr('host_set_var', k, String(v));
  say('Starting the game');
  if (!callStr('host_load', path)) throw new Error('The core could not open ' + path);
  for (let port = 0; port < (msg.pads || 0); port++) M._host_plug_pad(port);
  // The game's own battery save, kept by the page apart from save states: back in before the first frame.
  if (msg.sram) putSram(msg.sram);
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

let saveRefusedAtDos = false;
function save() {
  saveRefusedAtDos = false;
  const size = M._host_state_size();
  const p = M._malloc(size);
  const ok = M._host_state_save(p, size);
  const state = ok ? M.HEAPU8.slice(p, p + size) : null;
  M._free(p);
  // The page says so in a toast, with the reason when the engine gave one; the game keeps running.
  if (!state) return postMessage({ type: 'saved', state: null, why: saveRefusedAtDos ? 'dos' : '' });
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
    else if (m.type === 'mouse') { if (M._host_mouse) M._host_mouse(m.dx | 0, m.dy | 0, m.buttons | 0); }
    // Cheats (Bryan, 20 Nov 2026): all cleared, then each one switched on set again, in the core's own code format.
    else if (m.type === 'cheats') {
      if (!M._host_cheat_reset || !M._host_cheat_set) { postMessage({ type: 'cheats', ok: false }); return; }
      M._host_cheat_reset();
      (m.codes || []).forEach((code, i) => { const s = String(code).slice(0, 200); const n = M.lengthBytesUTF8(s) + 1; const p = M._malloc(n); M.stringToUTF8(s, p, n); M._host_cheat_set(i, 1, p); M._free(p); });
      postMessage({ type: 'cheats', ok: true, on: (m.codes || []).length });
    }
    else if (m.type === 'pause') paused = true;
    else if (m.type === 'resume') paused = false;
    else if (m.type === 'save') save();
    else if (m.type === 'sram-get') { const n = M._host_sram_size ? M._host_sram_size() : 0, p = n ? M._host_sram() : 0; const b = p ? M.HEAPU8.slice(p, p + n).buffer : null; postMessage({ type: 'sram', bytes: b }, b ? [b] : []); }
    else if (m.type === 'load') load(m.state);
    // A battery save brought back from a file: written in, then the game starts over and reads it as on power-on.
    else if (m.type === 'sram-set') { const ok = putSram(m.bytes); if (ok) { M._host_reset(); ring = []; } postMessage({ type: 'sram-set', ok }); }
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
