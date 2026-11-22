// Where each part of a controller sits, from one file (Bryan, 21 Nov 2026: "i want a mock up of the controllers created
// for me with all parts moveaple ie dpad , button areas etc so that i can finetune this layout onece and for all").
// The file is play/layouts.json; the editor is play/tools/layout.html; the pads place their parts with src/padlayout.js.
// Run: node --test "play/test/*.test.js"
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const L = require('../src/padlayout.js');
const E = require('../tools/layout-editor.js');
const P = path.join(__dirname, '..');
const freePort = () => new Promise((ok) => { const srv = require('net').createServer(); srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => ok(p)); }); });
const near = (a, b, by) => Math.abs(a - b) <= (by === undefined ? 0.6 : by);

test('a part is kept as the edges it holds to, its gap from them and its size, in units of the short side: one tuning fits every phone', () => {
  // A d-pad set on an iPhone 14 held sideways (844 by 390): 16 px from the left, 20 px from the bottom, 280 px across.
  const e = L.toEntry({ x: 16, y: 90, w: 280, h: 280 }, 844, 390);
  assert.deepEqual([e.ax, e.ay], ['l', 'b'], 'it keeps to the left and bottom edges, the ones it is nearest');
  const same = L.toBox(e, 844, 390);
  assert.ok(near(same.x, 16) && near(same.y, 90) && near(same.w, 280), 'and comes back where it was set');
  // On a bigger and a smaller phone it keeps its corner and its share of the short side.
  for (const [W, H] of [[932, 430], [667, 375], [568, 320]]) {
    const b = L.toBox(e, W, H), u = H / 390;
    assert.ok(near(b.x, 16 * u) && near(H - b.y - b.h, 20 * u) && near(b.w, 280 * u), W + ' x ' + H);
  }
  // The buttons keep to the right edge, a pill in the middle keeps to the middle, the top line to the top.
  const face = L.toEntry({ x: 844 - 16 - 280, y: 90, w: 280, h: 280 }, 844, 390);
  assert.equal(face.ax, 'r'); assert.ok(near(L.toBox(face, 932, 430).x + 280 * 430 / 390, 932 - 16 * 430 / 390, 1));
  const pill = L.toEntry({ x: 372, y: 170, w: 100, h: 46 }, 844, 390);
  assert.deepEqual([pill.ax, pill.ay, pill.x], ['c', 'm', 0]);
  assert.ok(near(L.toBox(pill, 667, 375).x + L.toBox(pill, 667, 375).w / 2, 667 / 2), 'still in the middle of a narrower phone');
  // A pill never comes out thinner than a thumb can find: on a small phone it keeps 44 px of height, around its middle.
  const small = L.boxes({ parts: { start: pill, dpad: e } }, 568, 320);
  assert.equal(small.start.h, L.THUMB); assert.ok(near(small.start.y + small.start.h / 2, 320 / 2 + (170 + 23 - 195) * 320 / 390, 1));
  assert.ok(near(small.dpad.w, 280 * 320 / 390), 'the d-pad is its own share of the screen');
  // Upright the short side is the width.
  const up = L.toEntry({ x: 10, y: 844 - 22 - 180, w: 180, h: 180 }, 390, 844);
  assert.deepEqual([up.ax, up.ay], ['l', 'b']); assert.ok(near(L.toBox(up, 320, 568).w, 180 * 320 / 390));
});

test('nothing runs into anything: what is wrong is named, a squarer screen draws every part a little smaller', () => {
  const at = (x, y, w, h) => L.toEntry({ x, y, w, h: h || w }, 844, 390);
  const parts = { dpad: at(16, 90, 280), face: at(548, 90, 280), start: at(372, 172, 100, 46), l: at(16, 10, 200, 50), r: at(628, 10, 200, 50) };
  assert.deepEqual(L.problems(L.boxes({ parts }, 844, 390), 844, 390), [], 'fine where it was set');
  // The d-pad dragged over Start, and R dragged off the screen.
  const bad = Object.assign({}, parts, { dpad: at(150, 90, 280), r: at(700, 10, 200, 50) });
  const found = L.problems(L.boxes({ parts: bad }, 844, 390), 844, 390).map(E.words);
  assert.deepEqual(found.sort(), ['D-pad and Start touch', 'R is off the screen']);
  // A game with no L or R is not blamed for where they would be.
  assert.deepEqual(L.problems(L.boxes({ parts: bad }, 844, 390), 844, 390, ['dpad', 'face']), []);
  // Round parts are judged round: a pill tucked into the corner of the button area's box, clear of its circle, is fine.
  assert.equal(L.touch({ x: 0, y: 0, w: 200, h: 200 }, { x: 170, y: 0, w: 60, h: 24 }, 'face', 'select'), false);
  assert.equal(L.touch({ x: 0, y: 0, w: 200, h: 200 }, { x: 120, y: 80, w: 60, h: 24 }, 'face', 'select'), true);
  assert.equal(L.touch({ x: 0, y: 0, w: 100, h: 100 }, { x: 99.5, y: 0, w: 100, h: 100 }, 'l', 'r'), false, 'edges that only meet do not touch');
  // The squarest screen this layout fits is found, and a squarer one gets it smaller, still with nothing touching.
  const fit = L.fitOf(parts, 2.4, false);
  assert.ok(fit > 1.3 && fit < 844 / 390, 'between a square and the phone it was set on: ' + fit);
  const set = { parts, fit };
  assert.equal(L.shrink(set, 844, 390), 1); assert.equal(L.shrink(set, 932, 430), 1);
  const k = L.shrink(set, 1024, 768);
  assert.ok(k < 1 && near(k, (1024 / 768) / fit, 0.001), 'a tablet: smaller by its shape over the fit');
  assert.deepEqual(L.problems(L.boxes(set, 1024, 768), 1024, 768), [], 'and then it fits the tablet too');
  assert.notDeepEqual(L.problems(L.boxes({ parts, fit: 1 }, 1024, 768), 1024, 768), [], 'which it would not at full size');
  // The list the editor shows for each phone.
  const list = E.fits(set, false);
  assert.deepEqual(list.map((f) => f.name), E.PHONES.map((p) => p[0]));
  assert.ok(list.every((f) => !f.bad.length), 'every phone fits once the fit is known');
  assert.ok(list.find((f) => f.name === 'Tablet').k < 1 && list.find((f) => f.name === 'iPhone 14 and 15').k === 1);
});

test('only what a layouts file may hold gets through: it is served to every visitor\'s pad', () => {
  const good = { ax: 'l', ay: 'b', x: 0.04, y: 0.05, w: 0.7, h: 0.7 };
  const out = L.clean({ v: 9, junk: 1, phone: { side: { parts: { dpad: good, 'bad id!': good, face: { ax: 'x', ay: 'b', x: 0, y: 0, w: 1, h: 1 }, start: { ax: 'c', ay: 'm', x: 0, y: 0, w: 99, h: 0.1 },
    l: Object.assign({ onclick: 'alert(1)' }, good) }, fit: 77, extra: true }, sideways: { parts: { dpad: good } } }, tv: { side: { parts: { dpad: good } } }, screen: { up: { parts: {} } } });
  assert.deepEqual(out, { v: 1, phone: { side: { parts: { dpad: good, l: good }, fit: 1 } } });
  for (const junk of [null, 5, 'x', [], { phone: 3 }, { phone: { side: null } }]) assert.deepEqual(L.clean(junk), { v: 1 });
  // The file in the repo is one the pads take whole.
  const file = JSON.parse(fs.readFileSync(path.join(P, 'layouts.json'), 'utf8'));
  assert.deepEqual(L.clean(file), file, 'play/layouts.json holds nothing the pads would drop');
  for (const pad of L.PADS) for (const way of L.WAYS) for (const id of Object.keys(((file[pad] || {})[way] || {}).parts || {})) assert.ok(id in E.NAMES, pad + ' ' + way + ' ' + id + ' is a part the editor knows');
  // The pads there are: the phone pad, and PLAY's own on-screen pad once for each shape of button area.
  assert.deepEqual(L.PADS, ['phone', 'screen-diamond', 'screen-abc', 'screen-pair', 'screen-one']);
  const T = require('../src/touchpad.js');
  for (const shape of new Set(Object.values(T.SYSTEM_SHAPE))) assert.ok(L.PADS.includes('screen-' + shape), 'a layout can be kept for the ' + shape + ' pad');
  assert.deepEqual(Object.keys(L.clean({ 'screen-pair': { up: { parts: { dpad: good, screen: good, rewind: good, cheats: good } } } })['screen-pair'].up.parts), ['dpad', 'screen', 'rewind', 'cheats']);
});

test('a round part may pass an edge by a little, edges that cross by a hair are not in the way, and a layout that is wrong everywhere promises no fit', () => {
  // PLAY's own d-pad sits with its box 10 px past the left edge by design (its drawn ring starts at the edge).
  const pad = { dpad: { x: -10, y: 215, w: 165, h: 165 }, screen: { x: 163, y: 12, w: 488, h: 367 }, start: { x: 770, y: 82, w: 64, h: 44 } };
  assert.deepEqual(L.problems(pad, 844, 390), [], 'the built-in sideways pad is not called wrong');
  assert.deepEqual(L.problems(Object.assign({}, pad, { dpad: { x: -30, y: 215, w: 165, h: 165 } }), 844, 390).map(E.words), ['D-pad is off the screen']);
  assert.deepEqual(L.problems(Object.assign({}, pad, { start: { x: 790, y: 82, w: 64, h: 44 } }), 844, 390).map(E.words), ['Start is off the screen'], 'a pill may not');
  assert.deepEqual(L.problems(Object.assign({}, pad, { dpad: { x: 0, y: 190, w: 190, h: 190 } }), 844, 390).map(E.words), ['D-pad and Picture touch']);
  assert.deepEqual(E.hold({ x: -40, y: 300, w: 165, h: 165 }, 844, 390, true), { x: -165 * L.OVER, y: 390 - 165 + 165 * L.OVER, w: 165, h: 165 }, 'dragged, a round part stops that little way past the edge');
  // Two parts on top of each other on every screen: making it all smaller would not mend it.
  const e = (x, y, w, h) => L.toEntry({ x, y, w, h }, 844, 390);
  const wrong = { dpad: e(0, 190, 190, 190), screen: e(163, 12, 488, 367) };
  const here = 844 / 390;
  assert.ok(Math.abs(L.fitOf(wrong, here, false) - here) < 0.001, 'wrong where it was set: that phone and wider get it as set, fault and all');
  const list = E.fits({ parts: wrong, fit: L.fitOf(wrong, here, false) }, false);
  assert.ok(list.find((f) => f.name === 'iPhone 14 and 15').bad.includes('D-pad and Picture touch') && list.find((f) => f.name === 'iPhone 14 and 15').k === 1, 'the list names the fault on the phone it was set on');
  // Only the parts on the pad now are judged, when the editor asks so.
  assert.ok(E.fits({ parts: wrong, fit: 1 }, false, ['dpad']).every((f) => !f.bad.length));
  // A layout seen smaller on a squarer phone, taken up for editing there: full size on that phone, the same to the eye.
  const set = { parts: { dpad: e(16, 90, 280, 280), face: e(548, 90, 280, 280) }, fit: 2.1 };
  const k = L.shrink(set, 667, 375), seen = L.boxes(set, 667, 375), re = E.rebase(set, k);
  assert.ok(k < 1);
  re.fit = 667 / 375;
  const now = L.boxes(re, 667, 375);
  for (const id of ['dpad', 'face']) for (const f of ['x', 'y', 'w', 'h']) assert.ok(Math.abs(seen[id][f] - now[id][f]) < 0.01, id + ' ' + f);
});

test('the editor\'s own rules: a part matched to its partner, lined up with the others, kept on the screen', () => {
  const dpad = { ax: 'l', ay: 'b', x: 0.04, y: 0.05, w: 0.7, h: 0.7 };
  assert.deepEqual(E.mirror(dpad), { ax: 'r', ay: 'b', x: 0.04, y: 0.05, w: 0.7, h: 0.7 }, 'the buttons where the d-pad is, on the other side');
  assert.deepEqual(E.mirror({ ax: 'c', ay: 'm', x: -0.2, y: 0.1, w: 0.3, h: 0.1 }).x, 0.2, 'a part left of the middle goes as far right of it');
  // Mirrored, the two sit level and the same size on any phone.
  const a = L.toBox(dpad, 844, 390), b = L.toBox(E.mirror(dpad), 844, 390);
  assert.ok(near(a.x, 844 - b.x - b.w) && near(a.y, b.y) && near(a.w, b.w));
  assert.deepEqual([E.PARTNER.dpad, E.PARTNER.face, E.PARTNER.l, E.PARTNER.select], ['face', 'dpad', 'r', 'start']);
  // Lining up: a box dragged to within 5 px of another's edge or middle lands on it; further off it is left alone.
  const other = { x: 100, y: 200, w: 100, h: 40 };
  const s = E.snap({ x: 303, y: 198, w: 80, h: 40 }, [other], 844, 390, 5);
  assert.deepEqual(s.box, { x: 303, y: 200, w: 80, h: 40 }, 'tops level');
  assert.deepEqual(s.lines, [{ h: 200 }]);
  assert.deepEqual(E.snap({ x: 384, y: 100, w: 80, h: 40 }, [other], 844, 390, 5).box.x, 382, 'its middle on the middle of the screen');
  assert.deepEqual(E.snap({ x: 300, y: 120, w: 80, h: 40 }, [other], 844, 390, 5).lines, []);
  // The frame is drawn to fit the window, whole: in Bryan's 1278 by 513 window (a 986 by 469 stage beside the panel)
  // every phone, sideways and upright, with its rim, is inside the stage (the Void polish lead found upright running
  // off the bottom); and it is never drawn bigger than life.
  for (const [name, long, short] of E.PHONES) for (const [W, H] of [[long, short], [short, long]]) {
    const s = E.scaleFor(986, 469, W, H);
    assert.ok(s <= 1 && (W + 20) * s <= 986 - 28 + 0.01 && (H + 20) * s <= 469 - 28 + 0.01, name + ' ' + W + ' x ' + H + ' at ' + s.toFixed(2));
  }
  assert.equal(E.scaleFor(986, 469, 844, 390), 1, 'a phone sideways is shown at its true size there');
  assert.ok(E.scaleFor(986, 469, 390, 844) < 0.52, 'upright it is drawn at about half size');
  assert.equal(E.scaleFor(3000, 2000, 844, 390), 1);
  // Kept on the screen, and never smaller than a thumb can find; a round part stays round.
  assert.deepEqual(E.hold({ x: -30, y: 380, w: 100, h: 46 }, 844, 390, false), { x: 0, y: 344, w: 100, h: 46 });
  assert.deepEqual(E.hold({ x: 10, y: 10, w: 5, h: 5 }, 844, 390, false), { x: 10, y: 10, w: 24, h: 24 });
  assert.deepEqual(E.hold({ x: 0, y: 0, w: 900, h: 300 }, 844, 390, true), { x: 0, y: 0, w: 300, h: 300 });
});

test('Save: the local server writes one layout into the file the pads read, and only this PC\'s own page may', async () => {
  const port = await freePort(), file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'voidtv-layout-')), 'layouts.json');
  const srv = spawn(process.execPath, [path.join(P, 'serve.js'), String(port)], { stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { PLAY_LAYOUTS: file }) });
  try {
    await new Promise((ok) => srv.stdout.once('data', ok));
    const post = (body, headers) => fetch('http://127.0.0.1:' + port + '/api/layout', { method: 'POST', headers: Object.assign({ 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' }, headers), body: JSON.stringify(body) });
    const set = { parts: { dpad: { ax: 'l', ay: 'b', x: 0.04, y: 0.05, w: 0.7, h: 0.7 }, face: { ax: 'r', ay: 'b', x: 0.04, y: 0.05, w: 0.7, h: 0.7 } }, fit: 1.6 };
    let r = await post({ pad: 'phone', way: 'side', set });
    assert.equal(r.status, 200);
    assert.deepEqual((await r.json()).file, { v: 1, phone: { side: set } });
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { v: 1, phone: { side: set } }, 'written as the pads will read it');
    // A second layout joins the first; taking one out leaves the other.
    r = await post({ pad: 'phone', way: 'up', set: { parts: { dpad: set.parts.dpad }, fit: 1 } });
    assert.deepEqual(Object.keys((await r.json()).file.phone).sort(), ['side', 'up']);
    r = await post({ pad: 'phone', way: 'side', set: null });
    assert.deepEqual(Object.keys((await r.json()).file.phone), ['up'], 'null: that pad is back on its built-in layout');
    // Refused: another page in the browser, a made-up pad, a layout with nothing in it, a plain GET.
    assert.equal((await post({ pad: 'phone', way: 'side', set }, { 'sec-fetch-site': 'cross-site' })).status, 403);
    assert.equal((await post({ pad: 'tv', way: 'side', set })).status, 400);
    assert.equal((await post({ pad: 'phone', way: 'side', set: { parts: { 'x!': {} } } })).status, 400);
    assert.equal((await fetch('http://127.0.0.1:' + port + '/api/layout')).status, 403);
    assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(file, 'utf8')).phone), ['up'], 'and nothing they sent was written');
  } finally { srv.kill(); }
});

test('the pads read the file, the site carries it, and the editor has what Bryan asked of it', () => {
  const pad = fs.readFileSync(path.join(P, 'pad.html'), 'utf8'), js = fs.readFileSync(path.join(P, 'src', 'phonepad.js'), 'utf8');
  assert.ok(pad.includes('<script src="src/padlayout.js"></script>\n<script src="src/phonepad.js"></script>'));
  assert.ok(pad.includes('.placed{position:absolute!important;grid-area:auto!important;'), 'a placed part is measured from the whole pad, not from its old cell');
  assert.ok(pad.includes('<div id="safe"></div>'), 'the notch and rounded corners are left clear');
  assert.ok(js.includes("Layout.load('layouts.json' + (BUILD ? '?v=' + BUILD : ''))"), 'fetched fresh after every push');
  assert.ok(js.includes("const set = draft !== undefined ? draft : layouts && layouts.phone && layouts.phone[innerWidth >= innerHeight ? 'side' : 'up'];"));
  assert.ok(js.includes('lay(); measure(); letGo();'), 'the parts are placed before the touch areas are measured');
  assert.ok(js.includes("if (EDIT) {\n    api.editor = {"), 'the editor draws the real pad, with no room joined');
  const site = fs.readFileSync(path.join(P, '..', 'scripts', 'site.js'), 'utf8');
  assert.ok(site.includes("if (fs.existsSync(path.join(P, 'layouts.json'))) fs.copyFileSync(path.join(P, 'layouts.json'), path.join(dst, 'layouts.json'));"));
  assert.ok(!/['"]tools['"]/.test(site.slice(site.indexOf("const P = path.join(ROOT, 'play')"), site.indexOf("const P = path.join(ROOT, 'play')") + 4000)), 'the editor itself stays on this PC');
  // The page: a back arrow, both ways of holding the phone, Save, and a tip on every control.
  const html = fs.readFileSync(path.join(P, 'tools', 'layout.html'), 'utf8'), ed = fs.readFileSync(path.join(P, 'tools', 'layout-editor.js'), 'utf8');
  assert.match(html, /<a class="btn back" href="\.\.\/" title="Back to PLAY">/);
  for (const id of ['way-side', 'way-up', 'save', 'undo', 'zoom', 'pad', 'phone-size', 'game', 'mirror', 'center', 'snap', 'builtin', 'n-x', 'n-y', 'n-w', 'n-h']) assert.ok(html.includes('id="' + id + '"'), id);
  const controls = html.match(/<(button|select|input|a class="btn)[^>]*>/g);
  assert.ok(controls.length >= 16);
  for (const c of controls) assert.match(c, / title="[^"]{12,}"/, 'a hover tip on ' + c.slice(0, 60));
  assert.ok(ed.includes("el.title = p.name + ': drag to move it. Drag the round corner to make it bigger or smaller.';") && ed.includes("grip.title = 'Drag to resize ' + p.name;"), 'and on every part and its corner');
  assert.ok(ed.includes("fetch('/api/layout', { method: 'POST'"), 'Save writes the file the real pads read');
  assert.ok(html.includes('grid-template-rows:minmax(0,1fr)}'), 'the stage is never taller than the window');
  assert.ok(ed.includes("$('fit').style.width = $('fit').style.height = '0px';\n    const stage = $('stage').getBoundingClientRect();"), 'the room is measured with the phone taken out of it');
  assert.ok(ed.includes("if (!st.note) say([bad.length ? words(bad[0]) + '.' : '', dirty ? 'Not saved yet.' : ''].filter(Boolean).join(' '), bad.length ? 'bad' : '');"), 'the line at the top is said afresh after every change, Undo too');
  assert.ok(ed.includes("return JSON.stringify(now) !== JSON.stringify(saved);"), 'a layout taken back to what was saved is not unsaved');
  assert.ok(ed.includes("src: () => '../pad.html?edit=1'"), 'the frame holds the real pad page, not a drawing of it');
  const games = [...ed.matchAll(/\['[^'\]]+', '([a-z0-9-]+)', (true|false)\]/g)];
  assert.ok(games.length >= 7);
  const Cards = require('../src/cards.js');
  for (const [, id, console] of games) {
    assert.ok(fs.existsSync(path.join(P, 'cards', id + '.json')), 'the card ' + id + ' is on the shelf');
    assert.equal(Cards.isPad(JSON.parse(fs.readFileSync(path.join(P, 'cards', id + '.json'), 'utf8'))), console === 'true', id + ' is ' + (console === 'true' ? 'a console game' : 'not a console game'));
  }
});

test('PLAY\'s own on-screen pad: its parts and the picture go where the file says, an empty file changes nothing, and the editor\'s frame starts no game', () => {
  const js = fs.readFileSync(path.join(P, 'src', 'play.js'), 'utf8'), css = fs.readFileSync(path.join(P, 'play.css'), 'utf8'), html = fs.readFileSync(path.join(P, 'game.html'), 'utf8');
  assert.ok(html.includes('<script src="src/touchpad.js"></script>\n<script src="src/padlayout.js"></script>'));
  // Last in place(), after the style's own placing, so his boxes win and a part with no entry keeps the style's.
  const place = js.slice(js.indexOf('  function place() {'), js.indexOf('  // ---- Where the on-screen pad\'s parts and the picture sit'));
  assert.ok(place.trimEnd().endsWith("layParts(ins, shell && floating, set);\n    $('b-touch').setAttribute('aria-pressed', String(touch));\n    if (touch) PlayTouch.fit($('stage'));\n  }"));
  assert.ok(js.includes("const s = on ? laySet() : null, area = layArea(ins), bx = PadLayout.boxes(s, area.w, area.h);"));
  assert.ok(js.includes("return (f && f[innerWidth > innerHeight ? 'side' : 'up']) || null;"), 'no layout for this pad and this way: null, and nothing is placed');
  assert.ok(js.includes("const layKind = () => 'screen-' + (PlayTouch.SYSTEM_SHAPE[card.system] || 'pair');"), 'one layout for each shape of button area');
  assert.ok(js.includes("if (bx.screen) {") && js.includes("let w = r.w, h = w / aspect; if (h > r.h) { h = r.h; w = h * aspect; }"), 'the picture is fitted into his box at the game\'s own shape');
  assert.ok(js.includes("document.body.style.setProperty('--barL', Math.round(x) + 'px')"), 'and the bar stays over the picture');
  assert.ok(css.includes('.cpad .placed{position:absolute!important;right:auto!important;bottom:auto!important;'));
  // The frame: only inside a frame, and the game is never started there.
  assert.ok(js.includes("const FRAME = q.get('frame') === 'phone' && window.top !== window;"), 'a link cannot ask a visitor\'s own page for it');
  assert.ok(js.includes("const isPhone = () => FRAME || (matchMedia('(pointer: coarse)').matches"));
  assert.ok(js.includes("if (FRAME || !isPhone() || !document.fullscreenEnabled || document.fullscreenElement) return;") && js.includes("if (FRAME || !started || leftFull"), 'no fullscreen is asked for');
  const frame = js.slice(js.indexOf("    if (FRAME) {\n      hub = PlayHub.createHub("), js.indexOf('    // The footer names this game\'s own engine'));
  assert.ok(frame.includes("$('cover').hidden = true;") && frame.trimEnd().endsWith('return;\n    }'), 'drawn at once and done');
  assert.ok(!/begin\(|createRunner|runner\./.test(frame), 'no engine, no download');
  const ed = fs.readFileSync(path.join(P, 'tools', 'layout-editor.js'), 'utf8');
  assert.ok(ed.includes("src: (id) => '../game.html?game=' + id + '&frame=phone&mute=1'"), 'the editor shows the real game page');
  assert.ok(ed.includes("const SHAPES = { 'screen-diamond': 'four buttons', 'screen-abc': 'three buttons', 'screen-pair': 'two buttons', 'screen-one': 'one button' };"));
});
