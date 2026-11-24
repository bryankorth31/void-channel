// The controller layout mover on a phone itself (Bryan, 24 Nov 2026: "the controller is still the janky one. Please
// recreate the layout mover I can operate on this iPhone so I can choose the correct spacing etc").
// The pad page opened as pad.html?move=1 lays the mover (src/padmove.js) over the real pad. Save keeps the layout on
// that phone (src/padlayout.js: it wins over the site's file there) and hands him a text; play/tools/layout-take.js
// writes that text into play/layouts.json for every player.
// Run: node --test "play/test/*.test.js"
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const L = require('../src/padlayout.js');
const M = require('../src/padmove.js');
const E = require('../tools/layout-editor.js');
const T = require('../tools/layout-take.js');
const P = path.join(__dirname, '..');
const part = (ax, ay, x, y, w, h) => ({ ax, ay, x, y, w, h });
const SIDE = { parts: { dpad: part('l', 'b', 0.04, 0.02, 0.7, 0.7), face: part('r', 'b', 0.04, 0.02, 0.7, 0.7), start: part('c', 't', 0, 0.3, 0.3, 0.12) }, fit: 2 };
const UP = { parts: { dpad: part('l', 'b', 0, 0.05, 0.46, 0.46), face: part('r', 'b', 0, 0.05, 0.46, 0.46) }, fit: 2 };

test('a layout kept on a phone wins there over the site\'s file, pad by pad and way by way, and both are cleaned', () => {
  const site = { phone: { side: SIDE, up: UP } };
  const mine = { phone: { side: { parts: { dpad: part('l', 'b', 0.1, 0.1, 0.5, 0.5) }, fit: 2 } } };
  const m = L.merge(site, mine);
  assert.deepEqual(m.phone.side.parts.dpad, part('l', 'b', 0.1, 0.1, 0.5, 0.5), 'sideways is the phone\'s own');
  assert.equal(m.phone.side.parts.face, undefined, 'the whole of it: a way of holding the phone is one layout');
  assert.deepEqual(m.phone.up, L.clean(site).phone.up, 'upright, which the phone has none of, is the site\'s');
  assert.deepEqual(L.merge(site, null), L.clean(site), 'a phone that keeps nothing has the site\'s file');
  assert.deepEqual(L.merge(site, { phone: { side: { parts: { dpad: part('l', 'b', 99, 0, 1, 1) } } } }), L.clean(site), 'what clean() refuses never wins');
  assert.deepEqual(L.merge(null, mine).phone.side.parts.dpad.w, 0.5, 'with no file at all the phone\'s own still places its parts');
});

test('the phone keeps its own layout in its browser, and a browser that keeps nothing says so', () => {
  const had = global.localStorage, box = {};
  try {
    global.localStorage = { getItem: (k) => (k in box ? box[k] : null), setItem: (k, v) => { box[k] = String(v); }, removeItem: (k) => { delete box[k]; } };
    assert.deepEqual(L.mine(), { v: 1 }, 'nothing kept yet');
    assert.equal(L.keep({ phone: { side: SIDE } }), true);
    assert.deepEqual(Object.keys(box), [L.OWN]);
    assert.deepEqual(L.mine().phone.side.parts.start, SIDE.parts.start);
    assert.equal(L.keep({ v: 1 }), true);
    assert.deepEqual(Object.keys(box), [], 'a layout with no pad in it is forgotten, not stored empty');
    box[L.OWN] = '{not json';
    assert.deepEqual(L.mine(), { v: 1 }, 'a spoiled entry is read as nothing');
    global.localStorage = { getItem: () => { throw new Error('private'); }, setItem: () => { throw new Error('private'); }, removeItem: () => { throw new Error('private'); } };
    assert.equal(L.keep({ phone: { side: SIDE } }), false, 'private browsing: Save is told it was not kept');
    assert.deepEqual(L.mine(), { v: 1 });
  } finally { if (had === undefined) delete global.localStorage; else global.localStorage = had; }
});

test('Save on the phone: his layout is kept, one that is the site\'s own again is let go, the other way of holding it is left alone', () => {
  const site = { phone: { side: SIDE, up: UP } };
  const moved = { parts: Object.assign({}, SIDE.parts, { start: part('c', 't', 0.05, 0.4, 0.3, 0.12) }), fit: 2 };
  let own = M.kept(null, site, 'phone', 'side', moved);
  assert.deepEqual(own.phone.side.parts.start, part('c', 't', 0.05, 0.4, 0.3, 0.12));
  assert.equal(own.phone.up, undefined, 'only what he changed is kept');
  own = M.kept(own, site, 'phone', 'up', { parts: Object.assign({}, UP.parts, { dpad: part('l', 'b', 0.02, 0.05, 0.46, 0.46) }), fit: 2 });
  assert.deepEqual(Object.keys(own.phone).sort(), ['side', 'up']);
  own = M.kept(own, site, 'phone', 'side', SIDE);
  assert.deepEqual(Object.keys(own.phone), ['up'], 'Reset and Save: sideways is every player\'s layout again, so the phone lets its own go');
  own = M.kept(own, site, 'phone', 'up', null);
  assert.deepEqual(own, { v: 1 }, 'and with nothing left the phone keeps nothing');
});

test('the text he sends is read back exactly, out of a whole message, and nothing unclean gets through', () => {
  const own = M.kept(null, {}, 'phone', 'side', SIDE);
  const text = M.textOf(own);
  assert.ok(text.startsWith('VOIDTV PAD LAYOUT {"phone":{"side":{"parts":{'), text.slice(0, 60));
  assert.ok(!text.includes('\n'), 'one line: it survives a paste');
  assert.deepEqual(M.read(text), own);
  assert.deepEqual(M.read('Here is my layout:\n' + text + '\nthanks {see you}'), own, 'words around it, and braces after it, do no harm');
  assert.equal(M.read('hello'), null);
  assert.equal(M.read('VOIDTV PAD LAYOUT {"phone":{"side":'), null, 'a text cut short is no layout');
  assert.equal(M.read('VOIDTV PAD LAYOUT {"phone":{"side":{"parts":{"dpad":{"ax":"l","ay":"b","x":99,"y":0,"w":1,"h":1}}}}}'), null, 'a part far off the screen is refused, as in the file');
  assert.equal(M.read('VOIDTV PAD LAYOUT {"elsewhere":{"side":{"parts":{}}}}'), null, 'a pad the pads do not know is no layout');
  const sneaky = M.read('VOIDTV PAD LAYOUT {"phone":{"side":{"parts":{"dpad":{"ax":"l","ay":"b","x":0,"y":0,"w":0.5,"h":0.5,"onclick":"x"}},"fit":2,"extra":1}}}');
  assert.deepEqual(sneaky.phone.side, { parts: { dpad: part('l', 'b', 0, 0, 0.5, 0.5) }, fit: 2 }, 'only places and sizes are kept');
});

test('the mover\'s own steps: Bigger and Smaller keep a part\'s middle and shape, and its place is said in words', () => {
  const b = M.grow({ x: 100, y: 50, w: 120, h: 40 }, 2);
  assert.ok(Math.abs(b.w - 122) < 1e-9 && Math.abs(b.h - 40 * 122 / 120) < 1e-9, JSON.stringify(b));
  assert.ok(Math.abs(b.x + b.w / 2 - 160) < 1e-9 && Math.abs(b.y + b.h / 2 - 70) < 1e-9, 'around its own middle');
  assert.equal(M.grow({ x: 0, y: 0, w: 25, h: 25 }, -2).w, 24, 'never smaller than a thumb can find');
  assert.equal(M.where('D-pad', { x: 14, y: 92, w: 292, h: 292 }, 844, 390), 'D-pad: 14 from left, 6 from bottom, 292 by 292');
  assert.equal(M.where('R', { x: 611, y: 8, w: 219, h: 50 }, 844, 390), 'R: 14 from right, 8 from top, 219 by 50');
  assert.equal(M.where('Start', { x: 362, y: 172, w: 120, h: 46 }, 844, 390), 'Start: in the middle, half way down, 120 by 46');
  assert.equal(M.where('Menu', { x: 372, y: 338, w: 120, h: 46 }, 844, 390), 'Menu: 10 right of middle, 6 from bottom, 120 by 46');
});

test('one set of moving rules for both movers: the editor on the PC takes them from the phone mover\'s file', () => {
  for (const f of ['mirror', 'snap', 'hold', 'rebase']) assert.equal(E[f], M[f], f + ' is the same function in both');
  for (const [a, b] of Object.entries(M.PARTNER)) assert.equal(E.PARTNER[a], b, 'the same partners: ' + a);
  const ed = fs.readFileSync(path.join(P, 'tools', 'layout-editor.js'), 'utf8'), html = fs.readFileSync(path.join(P, 'tools', 'layout.html'), 'utf8');
  assert.ok(ed.includes('const { mirror, snap, hold, rebase } = M;') && !ed.includes('function snap('), 'no second copy of the rules');
  assert.ok(html.includes('<script src="../src/padlayout.js"></script>\n<script src="../src/padmove.js"></script>\n<script src="layout-editor.js"></script>'), 'the editor\'s page loads the shared file first');
});

test('the mover is the real pad page on the phone: pad.html?move=1, served by the site, with no room joined', () => {
  const js = fs.readFileSync(path.join(P, 'src', 'phonepad.js'), 'utf8'), mv = fs.readFileSync(path.join(P, 'src', 'padmove.js'), 'utf8');
  assert.ok(js.includes('const MOVE = /[?&]move=1\\b/.test(location.search);\n  const EDIT = MOVE || /[?&]edit=1\\b/.test(location.search);'), 'move=1 draws the pad as the editor has it: no room, nothing sent');
  assert.ok(js.includes('    if (MOVE) mover();\n    return;\n  }\n  connect();'), 'the mover starts and the page never joins a room');
  assert.ok(js.includes("get('src/keys.js').then(() => get('src/cards.js')).then(() => get('src/phones.js')).then(() => get('src/padmove.js'))"), 'its scripts are fetched only when it is asked for');
  assert.ok(js.includes("root.PlayPadMove.start({ door: api.editor, url: 'layouts.json' + v, cards: 'cards/',"), 'and it is handed the page\'s own door');
  const site = fs.readFileSync(path.join(P, '..', 'scripts', 'site.js'), 'utf8');
  assert.ok(/const FILE_DIRS = \[[^\]]*'play\/src'[^\]]*'play\/cards'/.test(site), 'the site copies play/src and play/cards, so the mover and the buttons it shows reach a phone');
  for (const f of ['keys.js', 'cards.js', 'phones.js', 'padmove.js', 'padlayout.js']) assert.ok(fs.existsSync(path.join(P, 'src', f)), f);
  const Cards = require('../src/cards.js');
  assert.ok(M.GAMES.length >= 7);
  for (const [name, id] of M.GAMES) { assert.ok(name.length > 8); assert.ok(fs.existsSync(path.join(P, 'cards', id + '.json')), 'the card ' + id + ' is on the shelf'); assert.ok(Cards.gamepadMap(JSON.parse(fs.readFileSync(path.join(P, 'cards', id + '.json'), 'utf8')))); }
  // On the page: nothing runs until start(); a finger on the mover never presses the pad under it; nothing he moves is lost.
  assert.ok(mv.includes("if (typeof module === 'object' && module.exports) { module.exports = api; return; }\n  root.PlayPadMove = api;") && mv.includes('  api.start = start;'), 'loading the file starts nothing');
  assert.ok(mv.includes("for (const ev of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) over.addEventListener(ev, (e) => e.stopPropagation());"), 'the pad never reads the mover\'s touches as presses');
  assert.ok(mv.includes('refit(); sync(); draft();') && mv.includes("localStorage.setItem(DRAFT, JSON.stringify(d))") && mv.includes("st.note = ['Your changes from before are back. Not saved yet.'];"), 'every change is written down at once and comes back');
  assert.ok(mv.includes("if (!L.keep(own)) { st.note = ['Not saved:"), 'a phone that keeps nothing is told so');
  assert.ok(mv.includes("if (!at) { fold(true); at = spot(); }"), 'the bar folds when no gap between the parts is tall enough for it');
  for (const id of ['mv-undo', 'mv-match', 'mv-reset', 'mv-save', 'mv-l', 'mv-u', 'mv-d', 'mv-r', 'mv-less', 'mv-more', 'mv-game', 'mv-fold', 'mv-done', 'mv-copy', 'mv-share', 'mv-close']) assert.ok(mv.includes('id="' + id + '"'), id);
  const tips = mv.match(/<(button|select|div id="mv-grip")[^>]*>/g).filter((c) => !/mv-(copy|share|close)/.test(c));
  assert.ok(tips.length >= 14);
  for (const c of tips) assert.match(c, / title="[^"]{12,}"/, 'a tip on ' + c.slice(0, 50));
});

test('his sent text goes into the file every player gets: only what it holds changes, and a look writes nothing', () => {
  const file = { v: 1, phone: { side: SIDE, up: UP }, 'screen-pair': { side: UP } };
  const moved = { parts: Object.assign({}, SIDE.parts, { start: part('c', 't', 0.05, 0.4, 0.3, 0.12) }), fit: 2 };
  const text = M.textOf(M.kept(null, file, 'phone', 'side', moved));
  const r = T.take(file, 'My layout: ' + text);
  assert.deepEqual(r.changes, ['phone, sideways: 1 of 3 parts changed (start)']);
  assert.deepEqual(r.file.phone.side.parts.start, part('c', 't', 0.05, 0.4, 0.3, 0.12));
  assert.deepEqual(r.file.phone.up, L.clean(file).phone.up, 'upright is as it was');
  assert.deepEqual(r.file['screen-pair'], L.clean(file)['screen-pair'], 'so is every other pad');
  assert.deepEqual(T.take(r.file, text).changes, [], 'taken twice, nothing changes');
  assert.deepEqual(T.take({}, text).changes, ['phone, sideways: a new layout of 3 parts']);
  assert.ok(T.take(file, 'no layout here').error);
  // The command itself, on a file of its own.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'padtake-')), f = path.join(dir, 'layouts.json');
  try {
    fs.writeFileSync(f, JSON.stringify(file));
    const run = (args, input) => spawnSync(process.execPath, [path.join(P, 'tools', 'layout-take.js')].concat(args), { input, encoding: 'utf8', env: Object.assign({}, process.env, { PLAY_LAYOUTS: f }) });
    const look = run(['--look', text]);
    assert.equal(look.status, 0); assert.ok(look.stdout.includes('Looked only: nothing written.'));
    assert.deepEqual(JSON.parse(fs.readFileSync(f, 'utf8')), file, 'a look leaves the file alone');
    const done = run([], 'hello\n' + text + '\n');
    assert.equal(done.status, 0, done.stderr); assert.ok(done.stdout.includes('phone, sideways: 1 of 3 parts changed (start)'));
    assert.deepEqual(JSON.parse(fs.readFileSync(f, 'utf8')).phone.side.parts.start, part('c', 't', 0.05, 0.4, 0.3, 0.12));
    assert.equal(run([], 'nothing to see').status, 1, 'a text with no layout in it is refused');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
