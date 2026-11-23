// HQ's header is one row and an area's tabs are a list down the left (voidverse audit HQ-01; Bryan, 23 Nov 2026, picked
// from two pictures: "B, side list"). His window is wide and short, 1278x513, and the header took 141 of its 513 px in
// three rows: the area names, then 13 tabs, then the publish buttons. Now the tabs stand beside the page, the two
// seldom-used publish buttons sit under More, and the header measures 51 px there.
// The page's own text is read from scripts/hq/index.html and its small functions are run in a bare context. No HQ is
// started here. Run: node --test tests/hq-header.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const PAGE = fs.readFileSync(path.join(ROOT, 'scripts', 'hq', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const header = PAGE.slice(PAGE.indexOf('<header>'), PAGE.indexOf('</header>') + 9);
const lineWith = (needle) => { const l = PAGE.split('\n').find((x) => x.includes(needle)); assert.ok(l, 'the page still holds: ' + needle); return l; };

test('the tab list is out of the header and stands beside the page', () => {
  assert.ok(header.length > 100, 'the header is in the page');
  assert.ok(header.includes('<nav id="areas" class="areas"></nav>'), 'the area names stay in the header');
  assert.ok(!header.includes('id="nav"'), 'the tabs are not in the header any more');
  assert.match(PAGE, /<\/header>\n<div class="shell"><nav id="nav"[^>]*><\/nav><main id="main"><\/main><\/div>/, 'the tabs and the page share one row under the header');
  assert.equal(PAGE.split('id="nav"').length - 1, 1, 'one tab list');
  assert.ok(PAGE.includes("$('#nav').innerHTML=AREAS.find(a=>a.k===ar).tabs.map("), 'nav() still draws the area\'s tabs into it');
});

test('the list is a column that stays under the header, and a narrow window gets the tabs in a row again', () => {
  const nav = lineWith('#nav{position:sticky;');
  assert.match(nav, /#nav\{position:sticky;top:var\(--hh,51px\);[^}]*width:148px;height:calc\(100vh - var\(--hh,51px\)\);overflow-y:auto;flex-direction:column;flex-wrap:nowrap;/);
  assert.ok(PAGE.includes('.shell{display:flex;align-items:flex-start}.shell main{flex:1 1 auto;min-width:0}'));
  assert.ok(PAGE.includes('@media(max-width:900px){.shell{display:block}#nav{position:static;width:auto;height:auto;flex-direction:row;flex-wrap:wrap;'));
  // 13 tabs of 32 px and the list's padding fit under a 51 px header in a 513 px window
  assert.ok(51 + 8 + 13 * 33 + 8 <= 513, 'every Void TV tab shows without scrolling at 1278x513');
});

test('the header stays one row: the buttons do not wrap, the last-commit line gives way first', () => {
  assert.ok(PAGE.includes('header{padding:6px 18px}header .right{flex:1 1 320px;flex-wrap:nowrap}'));
  assert.ok(PAGE.includes('#gitline{max-width:340px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'), 'the line can shorten with dots');
});

test('the two override publish buttons are under More, with their own words and presses unchanged', () => {
  const more = header.slice(header.indexOf('<details class="more">'), header.indexOf('</details>'));
  assert.ok(more.startsWith('<details class="more"><summary class="btn" title="'), 'More is a real control with a hover tip');
  assert.match(more, /<summary class="btn" title="[^"]*Publish anyway \(shrink\), Push with other commits">More<\/summary>/);
  assert.ok(more.includes(`onclick="publish('--allow-shrink')"`) && more.includes('>Publish anyway (shrink)</button>'));
  assert.ok(more.includes(`onclick="publish('--allow-other-commits')"`) && more.includes('>Push with other commits</button>'));
  for (const always of ['>Player lab</a>', '<button class="gold" onclick="publish()">Publish now</button>', 'onclick="pushLive()"']) {
    assert.ok(header.includes(always) && !more.includes(always), always + ' stays in the row, outside More');
  }
});

test('HQ\'s own words say where the two buttons are', () => {
  const P = fs.readFileSync(path.join(ROOT, 'scripts', 'lib', 'publishline.js'), 'utf8');
  assert.ok(P.includes('Push with other commits (under More) sends them together with the catalog.'));
  assert.ok(P.includes('or Push with other commits (under More) to send them together with the catalog.'));
  assert.ok(P.includes('press Publish anyway (shrink), under More.'));
});

test('More closes after a press on one of its buttons, a click elsewhere or Escape; a click on More itself is left to the browser', () => {
  const click = lineWith("document.addEventListener('click',(ev)=>{const d=$('details.more')");
  const keys = lineWith("document.addEventListener('keydown',(ev)=>{const d=$('details.more')");
  const fns = {};
  const summary = { focused: 0, focus() { this.focused++; } };
  const d = { open: true, inside: new Set(), contains(t) { return this.inside.has(t); } };
  const box = { document: { addEventListener: (k, f) => { fns[k] = f; } }, $: (s, r) => (r ? summary : d) };
  vm.createContext(box); vm.runInContext(click + '\n' + keys, box);
  const el = (inBox) => { const t = { closest: (s) => (inBox && s === '.morebox button' ? t : null) }; return t; };
  const sum = el(false), btn = el(true), out = el(false);
  d.inside.add(sum); d.inside.add(btn);
  fns.click({ target: sum }); assert.equal(d.open, true, 'a click on More does not fight the browser\'s own open and close');
  fns.click({ target: btn }); assert.equal(d.open, false, 'a press on Publish anyway or Push with other commits closes it');
  d.open = true; fns.click({ target: out }); assert.equal(d.open, false, 'a click anywhere else closes it');
  d.open = true; fns.keydown({ key: 'a' }); assert.equal(d.open, true);
  fns.keydown({ key: 'Escape' }); assert.equal(d.open, false, 'Escape closes it');
  assert.equal(summary.focused, 1, 'and the focus goes back to More');
});

test('the page keeps the header\'s real height in --hh, and the full-height frames measure from it', () => {
  const fn = lineWith('function hdrSize(){');
  const set = {};
  const box = { document: { documentElement: { style: { setProperty: (k, v) => { set[k] = v; } } } }, $: () => ({ offsetHeight: 91 }) };
  vm.createContext(box); vm.runInContext(fn + '\nhdrSize();', box);
  assert.equal(set['--hh'], '91px', 'a header that wrapped on a narrow window is measured, not guessed');
  assert.ok(PAGE.includes("hdrSize();if(window.ResizeObserver)new ResizeObserver(hdrSize).observe($('header'));"), 'measured at load and whenever the header changes size');
  assert.equal(PAGE.split('calc(100vh - var(--hh,51px) - 34px)').length - 1, 2, 'the Void Cast and PLAY frames');
  assert.ok(!PAGE.includes('calc(100vh - 110px)'), 'no frame still assumes a 110 px header');
});
