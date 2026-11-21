// VoidTV PLAY: tests for CD-ROM games (Bryan, 20 Nov 2026: "Yes, build slice 1"): the disc reader (lazydisc.js), the
// ScummVM core's record and the CD-ROM cards. Licence: GPL-2.0-or-later (play/LICENSE).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const PLAY = path.join(__dirname, '..');
const D = require('../src/lazydisc.js');
const Cards = require('../src/cards.js');

// A small disc made here: GAME.HE0 (5 bytes) at the root, and SUB/DATA.BIN (3000 bytes, over two sectors) in a folder.
function makeIso() {
  const S = 2048, img = new Uint8Array(23 * S);
  const le32 = (o, v) => { img[o] = v & 255; img[o + 1] = (v >> 8) & 255; img[o + 2] = (v >> 16) & 255; img[o + 3] = (v >>> 24) & 255; };
  const rec = (o, lba, size, flags, name) => {
    const id = typeof name === 'number' ? [name] : [...name].map((c) => c.charCodeAt(0));
    const len = 33 + id.length + (id.length % 2 ? 0 : 1);
    img[o] = len; le32(o + 2, lba); le32(o + 10, size); img[o + 25] = flags; img[o + 32] = id.length;
    id.forEach((c, i) => { img[o + 33 + i] = c; });
    return o + len;
  };
  const vd = (s, type) => { img[s * S] = type; 'CD001'.split('').forEach((c, i) => { img[s * S + 1 + i] = c.charCodeAt(0); }); img[s * S + 6] = 1; };
  vd(16, 1); img[16 * S + 128] = 0; img[16 * S + 129] = 8;            // 2048 a block
  rec(16 * S + 156, 18, S, 2, 0);                                      // the root
  vd(17, 255);
  let o = 18 * S; o = rec(o, 18, S, 2, 0); o = rec(o, 18, S, 2, 1); o = rec(o, 20, 5, 0, 'GAME.HE0;1'); rec(o, 19, S, 2, 'SUB');
  o = 19 * S; o = rec(o, 19, S, 2, 0); o = rec(o, 18, S, 2, 1); rec(o, 21, 3000, 0, 'DATA.BIN;1');
  img.set([104, 101, 108, 108, 111], 20 * S);                          // "hello"
  for (let i = 0; i < 3000; i++) img[21 * S + i] = i % 251;
  return img;
}
// The same disc as a raw image: 2352-byte sectors, each with its 12-byte sync, a 4-byte head (Mode 1) and 288 more.
function toRaw(iso) {
  const n = iso.length / 2048, out = new Uint8Array(n * 2352);
  for (let s = 0; s < n; s++) {
    out.set([0, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 0], s * 2352);
    out[s * 2352 + 15] = 1;
    out.set(iso.subarray(s * 2048, s * 2048 + 2048), s * 2352 + 16);
  }
  return out;
}
const opener = (img) => { let asked = 0; const d = D.open(img.length, (n) => { asked++; return img.subarray(n * D.PIECE, Math.min(img.length, (n + 1) * D.PIECE)); }); return { d, asked: () => asked }; };

test('the disc reader lists a disc\'s files and reads each one\'s bytes, from an ISO and from a raw BIN alike', () => {
  for (const [kind, img] of [['iso', makeIso()], ['bin', toRaw(makeIso())]]) {
    const { d } = opener(img);
    assert.equal(d.raw, kind === 'bin', kind);
    assert.deepEqual(d.entries.map((e) => [e.name, e.size]), [['GAME.HE0', 5], ['SUB/DATA.BIN', 3000]], kind);
    assert.equal(Buffer.from(d.read(d.entries[0], 0, 99)).toString(), 'hello', kind + ': clipped to the file');
    const data = d.read(d.entries[1], 2000, 100);                     // across the sector edge
    assert.equal(data.length, 100);
    for (let i = 0; i < 100; i++) assert.equal(data[i], (2000 + i) % 251, kind + ' byte ' + i);
  }
});

test('the disc reader refuses what is not a disc, and a piece of the wrong size', () => {
  assert.throws(() => D.open(40000, () => new Uint8Array(40000)), /not one PLAY can read/);
  const img = makeIso();
  assert.throws(() => D.open(img.length, () => img.subarray(0, 100)), /wrong size/);
});

test('a disc file on the engine\'s memory disk reads only what is asked, and cannot be written', () => {
  const { d } = opener(makeIso());
  const nodes = {}, made = [];
  const FS = { mkdirTree: (p) => made.push(p), ErrnoError: function (n) { this.errno = n; },
    createFile: (parent, name) => (nodes[parent + '/' + name] = { stream_ops: { read: null, llseek: 'kept' } }) };
  const heard = [];
  const files = D.mount(FS, d, '/game/disk', (name, n) => heard.push([name, n]));
  assert.deepEqual(files, ['/game/disk/GAME.HE0', '/game/disk/SUB/DATA.BIN']);
  const node = nodes['/game/disk/SUB/DATA.BIN'];
  assert.equal(node.usedBytes, 3000);
  assert.equal(node.stream_ops.llseek, 'kept', 'every other way of using the file stays as Emscripten made it');
  const buf = new Uint8Array(10);
  assert.equal(node.stream_ops.read({ node }, buf, 2, 8, 2995), 5, 'a read past the end is clipped');
  assert.deepEqual([...buf.subarray(2, 7)], [2995 % 251, 2996 % 251, 2997 % 251, 2998 % 251, 2999 % 251]);
  assert.equal(node.stream_ops.read({ node }, buf, 0, 8, 3000), 0);
  assert.throws(() => node.stream_ops.write(), (e) => e.errno === 63);
  assert.deepEqual(heard, [['SUB/DATA.BIN', 5]]);
});

test('ScummVM: built from the release its record names, its licence beside it, the donation line kept', () => {
  const core = Cards.CORES.scummvm;
  const rec = fs.readFileSync(path.join(PLAY, 'core', 'scummvm.txt'), 'utf8');
  const commit = rec.match(/^commit: ([0-9a-f]{40})$/m)[1];
  assert.ok(core.source.endsWith('/tree/' + commit));
  assert.match(rec, /^licence: GPL-3\.0-or-later/m);
  assert.match(rec, /^engines: scumm \(with he, the Humongous games\) and mohawk/m);
  assert.deepEqual(core.systems, ['cdrom']);
  assert.ok(!core.noDonation);
  const sh = fs.readFileSync(path.join(PLAY, 'core', 'build-scummvm.sh'), 'utf8');
  assert.ok(sh.includes("printf 'scumm\\nhe\\nmohawk\\n' > \"$LR/lite_engines.list\""), 'only the kids engines');
  assert.ok(sh.includes('trap \'mv -f "$LR/lite_engines.list.theirs" "$LR/lite_engines.list"\' EXIT'), 'ScummVM\'s own list goes back');
});

test('ScummVM starts with its own defaults and settings file, given before it starts (its first frame failed without them)', () => {
  const core = Cards.CORES.scummvm;
  assert.equal(core.vars.scummvm_video_hw_acceleration, 'disabled', 'pictures, not a hardware-frame marker');
  assert.equal(core.vars.scummvm_pointer_device, 'mouse', 'PLAY\'s mouse path moves the pointer');
  assert.ok(Object.keys(core.vars).length <= 24, 'room left in the host\'s 32 settings for a card\'s own');
  assert.match(core.files['/sys/scummvm.ini'], /^\[scummvm\]\nenable_unsupported_game_warning=false\n/, 'no "not yet fully supported" box in front of a child');
  const runner = fs.readFileSync(path.join(PLAY, 'src', 'runner.js'), 'utf8');
  assert.ok(runner.includes('vars: Object.assign({}, ((PlayCards.CORES || {})[card.core] || {}).vars, card.vars), files: ((PlayCards.CORES || {})[card.core] || {}).files || {},'));
  const w = fs.readFileSync(path.join(PLAY, 'src', 'core-worker.js'), 'utf8');
  assert.ok(w.indexOf("callStr('host_set_var', k, String(v));\n  M._host_init();") > 0, 'settings before the core starts');
  assert.ok(w.includes("if (/^\\/sys\\/[A-Za-z0-9._-]+$/.test(p)) M.FS.writeFile(p, String(text));"), 'starting files in /sys only');
  const host = fs.readFileSync(path.join(PLAY, 'core', 'host.c'), 'utf8').replace(/\r\n/g, '\n');
  assert.ok(host.includes('#ifdef HOST_VARS_AT_START\n#define VAR_CHANGED() (game_loaded)\n#else\n#define VAR_CHANGED() 1\n#endif'), 'every other core as before');
  assert.ok(fs.readFileSync(path.join(PLAY, 'core', 'build-scummvm.sh'), 'utf8').includes('-DHOST_VARS_AT_START'));
});

test('Kids: none of ScummVM\'s own menus within reach, and a game\'s own Quit ends cleanly (the Kids session, 21 Nov 2026)', () => {
  const ini = Cards.CORES.scummvm.files['/sys/scummvm.ini'];
  // Each key a child could press to reach ScummVM's main menu (with its launcher and settings), its quit, its debugger
  // or its on-screen keyboard is bound to nothing. Checked: without these, Ctrl+F5 opened the menu; with them, nothing.
  for (const k of ['keymap_global_MENU=\n', 'keymap_global_QUIT=\n', 'keymap_global_DEBUGGER=\n', 'keymap_global_VIRT=\n', 'keymap_engine-default_MENU=\n'])
    assert.ok(ini.includes(k), k);
  assert.ok(ini.includes('\n[keymapper]\n'), 'the bindings live in ScummVM\'s keymapper section');
  assert.ok(ini.includes('gui_return_to_launcher_at_exit=false\n'), 'a game that quits never lands in ScummVM\'s launcher');
  const host = fs.readFileSync(path.join(PLAY, 'core', 'host.c'), 'utf8');
  assert.ok(host.includes('case RETRO_ENVIRONMENT_SHUTDOWN: core_ended = 1; return true;'));
  assert.ok(host.includes('EMSCRIPTEN_KEEPALIVE int host_ended(void) { return core_ended; }'));
  const w = fs.readFileSync(path.join(PLAY, 'src', 'core-worker.js'), 'utf8');
  assert.ok(w.includes("if (M._host_ended && M._host_ended()) { running = false; postMessage({ type: 'ended' }); return; }"), 'engines built before it simply never say so');
  assert.ok(fs.readFileSync(path.join(PLAY, 'src', 'runner.js'), 'utf8').includes("else if (m.type === 'ended') on.ended && on.ended();"));
  assert.ok(fs.readFileSync(path.join(PLAY, 'src', 'play.js'), 'utf8').includes("ended: () => { arriving = false; fail('The game has ended. Press Play again to start it over, or pick another game.'); },"),
    'the start screen with Play again comes back, never a frozen picture');
});

test('ScummVM\'s engine files sit in engine/ under Cloudflare\'s cap, with its licence beside them', () => {
  for (const f of ['scummvm.js', 'scummvm.wasm', 'scummvm.LICENSE.txt']) {
    const p = path.join(PLAY, 'engine', f);
    assert.ok(fs.existsSync(p), f);
    assert.ok(fs.statSync(p).size < 25 * 1024 * 1024, f);
  }
  assert.ok(fs.readFileSync(path.join(PLAY, 'engine', 'scummvm.js'), 'utf8').startsWith('/* ScummVM 2026.4.0 (SCUMM with Humongous, and Mohawk for Living Books)'));
  assert.match(fs.readFileSync(path.join(PLAY, 'engine', 'scummvm.LICENSE.txt'), 'utf8'), /GNU GENERAL PUBLIC LICENSE\s+Version 3/);
});

test('CD-ROM cards: a disc image read in pieces, the game\'s start file named, on the pass-through list', () => {
  const cd = fs.readdirSync(path.join(PLAY, 'cards')).filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(PLAY, 'cards', f), 'utf8'))).filter((c) => c.system === 'cdrom');
  assert.ok(cd.length >= 2);
  const stream = fs.readFileSync(path.join(PLAY, 'shelf', 'stream.js'), 'utf8');
  for (const c of cd) {
    assert.deepEqual(Cards.check(c), [], c.id);
    assert.equal(c.core, 'scummvm');
    assert.ok(stream.includes('"' + c.id + '"'), c.id + ' is on the pass-through list');
  }
  const bad = Object.assign({}, cd[0], { archive: Object.assign({}, cd[0].archive, { stream: false }) });
  assert.ok(Cards.check(bad).includes('archive.disc'), 'a disc never comes whole');
  const w = fs.readFileSync(path.join(PLAY, 'src', 'core-worker.js'), 'utf8');
  assert.ok(w.includes('if (msg.stream && msg.start && isDisc(msg.gameFile)) {'));
  assert.ok(w.includes("'lazyzip.js', 'lazydisc.js']"));
});
