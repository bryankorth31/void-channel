// VoidTV PLAY: tests for the player page's promises: the CASH donation line, the takedown link, the GPL source
// links, and Bryan's house rules for every file in play/. Licence: GPL-2.0-or-later (play/LICENSE).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(...p), 'utf8');
const html = read(ROOT, 'game.html');
const EM_DASH = String.fromCharCode(0x2014);
const play = read(ROOT, 'src', 'play.js');

// Every text file we wrote ourselves (engine/ is the compiled core, made by build.sh).
function ourFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'engine' && e.name !== 'node_modules') out.push(...ourFiles(p)); }
    else if (/\.(js|json|html|css|md|c|sh|txt)$/.test(e.name)) out.push(p);
  }
  return out;
}

test('the donation link is the same setting the site uses (DECISIONS C5)', () => {
  const site = read(ROOT, '..', 'scripts', 'lib', 'app.js').match(/const DONATE_URL = '([^']+)'/);
  const here = play.match(/const DONATE_URL = '([^']+)'/);
  assert.ok(site && here, 'both files name DONATE_URL');
  assert.equal(here[1], site[1]);
});

test('the donation line says donation, CASH and cashvalues.org, and never gift (DECISIONS C2 to C4)', () => {
  const line = play.match(/const DONATE_LINE = '([^']+)'/);
  assert.ok(line, 'play.js names DONATE_LINE');
  assert.match(line[1], /donat/i);
  assert.match(line[1], /\bCASH\b/);
  assert.match(line[1], /cashvalues\.org/);
  assert.doesNotMatch(line[1], /\bgift\b|spare change/i);
  assert.doesNotMatch(line[1], /Church of American Strength/, 'short text says CASH (C3)');
  assert.doesNotMatch(line[1], /tax/i, 'no tax-deduction promise (C1)');
});

test('the page shows the donation where the game is served (the cross at the bottom of the picture, a card with the line), and in the pause menu', () => {
  assert.match(html, /id="give" class="give donate" aria-label="Donate to CASH"/);
  assert.match(html, /id="give-card" class="give-card donate"[^>]*hidden>\s*<p class="donate-line">/);
  assert.match(html, /id="donate-line"/);
  assert.match(html, /class="donate-link/);
  assert.ok(!/<footer/.test(html), 'no footer under the game: the page is one screen');
  assert.match(html, /id="credits" class="credits"/);
  const css = read(ROOT, 'play.css');
  assert.ok(css.includes('html,body{height:100%;overflow:hidden;overscroll-behavior:none}'));
  const js = read(ROOT, 'src', 'play.js');
  for (const bit of ["if (core.noDonation || c.kids) for (const e of document.querySelectorAll('.donate')) e.remove();", "if (p && $('credits').parentElement !== $('menu')) $('menu').appendChild($('credits'));"]) assert.ok(js.includes(bit), bit);
});

test('the page links the takedown page and says the game comes from the Internet Archive', () => {
  assert.match(html, /href="\/takedown"/);
  assert.match(html, /Internet Archive/);
});

test('the page links the core source and our own player source (GPL)', () => {
  assert.match(html, /href="https:\/\/github\.com\/libretro\/dosbox-pure[^"]*"/);
  assert.match(html, /href="https:\/\/github\.com\/bryankorth31\/void-channel\/tree\/[^"]*\/play"/);
  assert.match(html, /GPL/);
});

test('the licence and source record sit beside the code', () => {
  for (const f of ['LICENSE', 'SOURCES.md', path.join('core', 'README.md'), path.join('core', 'dosbox-pure.txt'), path.join('core', 'build.sh')]) {
    assert.ok(fs.existsSync(path.join(ROOT, f)), f);
  }
  assert.match(read(ROOT, 'LICENSE'), /GNU GENERAL PUBLIC LICENSE\s+Version 2, June 1991/);
  assert.match(read(ROOT, 'core', 'dosbox-pure.txt'), /^commit: [0-9a-f]{40}$/m);
});

test('every source file says its licence on its first line', () => {
  for (const f of fs.readdirSync(path.join(ROOT, 'src')).filter((n) => n.endsWith('.js'))) {
    const first = read(ROOT, 'src', f).split('\n')[0];
    assert.match(first, /Licence: GPL-2\.0-or-later/, f);
  }
});

test('no em dash in any file in play/ (Bryan\'s rule)', () => {
  for (const f of ourFiles(ROOT)) {
    const lines = read(f).split('\n');
    lines.forEach((l, i) => assert.ok(!l.includes(EM_DASH), path.relative(ROOT, f) + ':' + (i + 1)));
  }
});

test('the page plays nothing aloud in tests: the runner has a mute switch', () => {
  assert.match(read(ROOT, 'src', 'runner.js'), /opts\.mute/);
});

test('whole-site audit A24 and A25: the shelf has a visible way back and to TV, Mine, Trivia and the donation; a short window shows the first row of games', () => {
  const shelf = read(ROOT, 'index.html');
  for (const bit of ['&larr; Back', 'href="/me"', 'href="/trivia/"', 'Donate to CASH']) assert.ok(shelf.includes(bit), bit);
  const site = read(ROOT, '..', 'scripts', 'lib', 'app.js').match(/const DONATE_URL = '([^']+)'/)[1];
  assert.ok(shelf.includes('href="' + site + '"'), 'the shelf gives the same donation link as the site');
  assert.ok(read(ROOT, 'game.html').includes('&larr;<span class="w"> Games</span>'));
  const css = read(ROOT, 'shelf.css');
  assert.ok(css.includes('@media (max-height:640px){') && css.includes('.intro p:not(.pad-hint){display:none}'), 'a short window folds the intro away');
});

test('every PLAY page loads its own style and scripts with the build version, and so does the game worker (an iPhone kept the old play.css)', () => {
  const site = read(ROOT, '..', 'scripts', 'lib', '..', 'site.js');
  assert.ok(site.includes("'$1?v=' + v + '\"'") && site.includes('<meta name="play-build" content="'), 'site.js versions the scripts and names the build');
  const v = '0123456789ab';
  for (const f of ['index.html', 'game.html', 'pad.html', 'join.html']) {
    const h = read(ROOT, f).replace(/(src="src\/[a-z0-9-]+\.js)"/g, '$1?v=' + v + '"').replace(/(href="(?:play|shelf)\.css)"/g, '$1?v=' + v + '"');
    assert.ok(!/src="src\/[a-z0-9-]+\.js"/.test(h) && !/href="(play|shelf)\.css"/.test(h), f + ' has nothing left unversioned');
  }
  assert.ok(read(ROOT, 'src', 'runner.js').includes("if (build && /^[0-9a-f]{12}$/.test(build)) workerUrl.searchParams.set('b', build);"));
  assert.ok(read(ROOT, 'src', 'core-worker.js').includes("f + '?v=' + BUILD"));
  for (const css of ['play.css', 'shelf.css']) assert.ok(read(ROOT, css).includes('html,*{touch-action:manipulation}'), css);
  assert.match(read(ROOT, 'play.css'), /\.stage\{[^}]*touch-action:none/, 'the game area keeps every touch');
});

test('iPhone: fast taps on the touch keys and the phone pad cancel the touch (Safari zooms otherwise), except the two click buttons', () => {
  const js = read(ROOT, 'src', 'play.js');
  assert.ok(js.includes("const noZoom = (e) => { if (!e.target.closest('.pkbd, .pkclose, button:not(.pk), a, input, label, .menu, .give-card, .phones')) e.preventDefault(); };"));
  assert.ok(read(ROOT, 'play.css').includes('.stage{position:fixed;inset:0;'), 'the game area is fixed to the screen: no page under it to pan');
  assert.ok(read(ROOT, 'game.html').includes('<img src="/assets/brand/cash-cross.png" alt="" width="28">'), 'the CASH winged cross, at 28 px');
  assert.ok(js.includes("for (const ev of ['touchstart', 'touchend']) $('stage').addEventListener(ev, noZoom, { passive: false });"));
  assert.ok(read(ROOT, 'src', 'phonepad.js').includes("for (const ev of ['touchstart', 'touchmove', 'touchend']) document.addEventListener(ev, (e) => { if (!e.target.closest('a')) e.preventDefault(); }, { passive: false });"));
  assert.ok(read(ROOT, 'play.css').includes('-webkit-touch-callout:none'));
});

test('controller mode (Bryan, 20 Nov 2026): with a gamepad in hand the picture fills the whole screen, keeping its shape, with no keys', () => {
  const L = require('../src/layout.js');
  const side = L.layout(844, 390, 4 / 3, false, 2, true);
  assert.equal(side.mode, 'bare'); assert.equal(side.screen.h, 390); assert.equal(side.screen.w, 520); assert.equal(side.screen.y, 0);
  assert.ok(!side.left && !side.right && !side.pad, 'no key zones');
  const up = L.layout(390, 844, 4 / 3, false, 2, true);
  assert.equal(up.screen.w, 390);
  const js = read(ROOT, 'src', 'play.js');
  assert.ok(js.includes("p.index < PlayPhones.BASE && p.mapping === 'standard' && p.buttons.some((b) => b.pressed))) controllerMode(true);"), 'a real pad, not a Phones phone');
  assert.ok(js.includes("addEventListener('orientationchange', () => { if (hub) hub.releaseAll(); PlayTouch.releaseAll(); });"), 'turning the phone lets go of every key');
});

test('the donation cross is never by a game key: it lives in the top bar (Bryan, 20 Nov 2026: "so it needs to be in a different area")', () => {
  const html = read(ROOT, 'game.html');
  assert.match(html, /<nav class="tools"[\s\S]*id="give" class="give donate"[\s\S]*<\/nav>/, 'in the bar');
  assert.ok(!/<main id="stage"[\s\S]*id="give"[\s\S]*<\/main>/.test(html), 'not in the game area');
  assert.ok(!read(ROOT, 'src', 'play.js').includes('placeGive'), 'no placing among the keys');
  assert.ok(html.includes('<p class="donate"><span id="donate-line"></span>'), 'the pause menu keeps the donation line');
});

test('battery saves (the audit, 20 Nov 2026): a game\'s own save RAM is kept per game apart from save states, read before the game can start and written back before its first frame', () => {
  assert.match(read(ROOT, 'core', 'host.c'), /EMSCRIPTEN_KEEPALIVE void \*host_sram\(void\) \{ return retro_get_memory_data\(RETRO_MEMORY_SAVE_RAM\); \}/);
  for (const core of ['snes9x', 'fceumm', 'gambatte', 'genesis-plus-gx', 'mgba']) assert.ok(read(ROOT, 'engine', core + '.js').includes('host_sram_size'), core);
  const w = read(ROOT, 'src', 'core-worker.js');
  assert.ok(w.indexOf("if (msg.sram) putSram(msg.sram);") > w.indexOf("M._host_plug_pad(port);") && w.indexOf("if (msg.sram) putSram(msg.sram);") < w.indexOf("postMessage({ type: 'ready'"), 'written back after loading, before the first frame');
  // The audit: Genesis Plus GX and mGBA report another size at load than at save time, so a save that fits goes in.
  assert.ok(w.includes('if (!p || !b || !b.length || b.length > n) return false;') && !w.includes('byteLength === n'));
  const js = read(ROOT, 'src', 'play.js');
  assert.ok(js.includes("PlaySaves.get(id + ':sram').then((rec) => (rec && rec.state) || null).catch(() => null),"), 'read before anything can start');
  assert.ok(js.includes("await PlaySaves.put(card.id + ':sram', b, {});"), 'kept on every autosave when it changed');
  assert.ok(js.includes("Your in-game save is kept"));
});

test('the handheld shell on a phone (Bryan: "Phones, both ways"): the bar steps away during play and the picture takes its room; sideways it is nearly the full height', () => {
  const L = require('../src/layout.js');
  const side = L.layout(844, 390, 4 / 3, true, 2, false, true);   // a console pad in the shell asks for two columns (play.js)
  assert.ok(side.screen.h >= 0.95 * 390, 'sideways the picture is at least 95% of the height: ' + side.screen.h);
  const up = L.layout(390, 844, 4 / 3, true, 2, false, true);
  assert.equal(up.screen.w, 390, 'upright the picture is the full width');
  assert.ok(up.screen.y < L.HEADER, 'and starts above where the bar was');
  const js = read(ROOT, 'src', 'play.js');
  assert.ok(js.includes('const shell = touch && !padMode && (started || FRAME) && Math.min(innerWidth, innerHeight) <= 540;'));
  const css = read(ROOT, 'play.css');
  assert.ok(css.includes('body.shell:not(.paused):not(.showbar) .bar{transform:translateY(-100%)'), 'the bar is back while paused');
});

test('whole-site audit 2 and 3 (Bryan: "Yes, pass 2 and 3 to the lead"): the browser is asked once to keep the saves, and a save goes to a file and back', () => {
  const js = read(ROOT, 'src', 'play.js'), html = read(ROOT, 'game.html');
  // 2: asked once, after Play or a save, with no question of ours and nothing said on a no.
  assert.ok(js.includes("navigator.storage.persisted().then((yes) => (yes ? true : navigator.storage.persist())).catch(() => {});"));
  assert.ok(js.includes("localStorage.getItem('voidtv-play-keep')") && js.includes('  function begin() {\n    keepStorage();'));
  // 3: in the pause menu row (touch and gamepad reach it), each with a tip; the file is made and read here only.
  for (const id of ['b-file-save', 'b-file-load']) assert.match(html, new RegExp('<button type="button" id="' + id + '" class="tool" title="[^"]+">'));
  assert.ok(/<div class="menu-row">[\s\S]*id="b-file-load"[\s\S]*<\/div>/.test(html));
  assert.ok(js.includes("a.download = 'voidtv-' + card.id + '.json';"), 'the file is named for the game only');
  assert.ok(!/fetch\([^)]*FILE_KIND|sendBeacon/.test(js), 'nothing is sent anywhere');
  // Checked for this game, the spot only in its own build, the battery save in any build.
  assert.ok(js.includes("if (f.game !== card.id) return toast("));
  assert.ok(js.includes('if (spot && PlaySaves.fits(spot, build)) {') && js.includes('const ok = await runner.sramSet(sram);'));
  assert.ok(read(ROOT, 'src', 'core-worker.js').includes("else if (m.type === 'sram-set') {"));
});

test('the handheld shell: Select and Start are level (Bryan, 20 Nov 2026: "Straighten them"; slanted, Start ran into the screen\'s frame)', () => {
  const css = read(ROOT, 'play.css');
  assert.ok(css.includes('body.shell .cpad .pill{min-width:64px;') && !/body\.shell[^{]*\.pill[^{]*\{[^}]*rotate/.test(css));
});

test('the handheld body from Bryan\'s University Archives sheets ("more depth and more Void TV esque ness"): worn navy, a deep bezel, the neon plate, B red and A yellow', () => {
  const css = read(ROOT, 'play.css');
  assert.ok(!css.includes("lexROM's original Game Boy look, \"Phones, both ways\""), 'the earlier grey-purple body is replaced');
  assert.ok(css.includes("content:'VOIDTV PLAY'") && css.includes('@container (min-height:400px){'), 'the plate shows only where the pad has the room');
  assert.ok(css.includes('body.shell .cface .pk[data-code="P1:A"],body.shell .cface.s-abc .pk[data-code="P1:B"]{--k1:#f7d046;'));
  assert.ok(css.includes('body.shell .cpad .cface::before{') && /pointer-events:none;border-radius:999px/.test(css), 'the base is drawing only, never a key');
  assert.ok(read(ROOT, 'src', 'touchpad.js').includes("face.classList.add('s-' + (SYSTEM_SHAPE[card.system] || 'pair'));"));
});

test('the handheld wears Bryan\'s own parts (20 Nov 2026: "Yes, build it"): his casing, d-pad, buttons, pills and tape labels, small, and no decoration takes a tap', () => {
  const css = read(ROOT, 'play.css');
  for (const f of ['plastic', 'grime', 'grille', 'tape', 'dpad', 'btn-red', 'btn-yellow', 'btn-pink', 'btn-cyan', 'pill', 'label']) {
    assert.ok(fs.existsSync(path.join(ROOT, 'skin', f + '.webp')), f);
    assert.ok(css.includes('url(skin/' + f + '.webp)'), f + ' is used');
  }
  const total = fs.readdirSync(path.join(ROOT, 'skin')).reduce((s, f) => s + fs.statSync(path.join(ROOT, 'skin', f)).size, 0);
  assert.ok(total < 300 * 1024, 'the parts stay small: ' + Math.round(total / 1024) + ' KB');
  // The grille, the tape and the grime are drawn into the body's background, so no decoration can take a tap.
  assert.match(css, /body\.shell \.stage\{background:\n  url\(skin\/grille\.webp\)/);
  // The words stay inside their keys, on a strip of tape.
  assert.ok(css.includes('body.shell .cpad .pk .small,body.shell .cpad .pill .big,body.shell .cpad .cshoulder .big{background:url(skin/label.webp)'));
});

test('fullscreen during play (Bryan, 20 Nov 2026: "a simple fullscreen to the gameplay"): the game alone, edge to edge, the bar away until wanted', () => {
  const js = read(ROOT, 'src', 'play.js'), css = read(ROOT, 'play.css');
  assert.ok(js.includes("document.addEventListener('fullscreenchange', () => {") && js.includes('fullMode = !!document.fullscreenElement;'));
  assert.ok(js.includes('padMode || (full && !touch), shell || (full && touch), layIns);'), 'no touch keys: the picture fills the screen; with them the keys keep their room');
  assert.ok(js.includes("if (e.clientY < 48) { document.body.classList.add('showbar');"), 'the mouse at the top brings the bar');
  assert.ok(css.includes('body.full:not(.paused):not(.showbar) .bar{transform:translateY(-100%)}') && css.includes('body.full.idle:not(.paused) .stage,body.full.idle:not(.paused) .stage *{cursor:none}'));
});

test('rule B2, the wordmark in its own colours on every PLAY page: "voidtv" neon pink, ".net" neon blue, in Unbounded (Voidverse join J5; Bryan, 24 Nov 2026: "Yes, those four")', () => {
  const PINK = '#ff4fc8', BLUE = '#5fe3ff', FACE = "@font-face{font-family:'Unbounded';font-style:normal;font-weight:200 900;font-display:swap;src:url(/assets/brand/fonts/unbounded-latin.woff2) format('woff2')}";
  assert.ok(fs.existsSync(path.join(ROOT, '..', 'assets', 'brand', 'fonts', 'unbounded-latin.woff2')), 'the lettering is in the repo');
  // The shelf and the game page: the bar's mark, coloured by the shelf's own two names.
  const css = read(ROOT, 'shelf.css');
  assert.ok(css.includes(FACE) && css.includes('--pink:' + PINK) && css.includes('--blue:' + BLUE));
  assert.ok(css.includes(".mark{font-family:'Unbounded',sans-serif;font-weight:700;") && css.includes('.mark .v{color:var(--pink)} .mark .n{color:var(--blue)}'));
  for (const f of ['index.html', 'game.html']) assert.ok(read(ROOT, f).includes('<span class="v">voidtv</span><span class="n">.net</span>'), f);
  // The join page: it was "voidtv" white and ".net" pink in the system's lettering (the Voidverse ledger's PLAY-17).
  const join = read(ROOT, 'join.html');
  assert.ok(join.includes(FACE), 'join.html loads the lettering');
  assert.ok(join.includes(".mark{font-family:'Unbounded',sans-serif;font-weight:700;font-size:22px;letter-spacing:-.02em;color:" + PINK + ";text-decoration:none}.mark span{color:" + BLUE + '}'));
  assert.ok(join.includes('<a class="mark" href="/">voidtv<span>.net</span></a>'));
  // The pad's top line: the same fault, the same mark. Its --acc is the brand blue.
  const pad = read(ROOT, 'pad.html');
  assert.ok(pad.includes(FACE), 'pad.html loads the lettering');
  assert.ok(pad.includes('--acc:' + BLUE) && pad.includes('--pink:' + PINK));
  assert.ok(pad.includes("#top b{display:block;font-family:'Unbounded',sans-serif;font-weight:700;color:var(--pink);font-size:14px;letter-spacing:-.02em}#top b span{color:var(--acc)}"));
  assert.ok(pad.includes('<b>voidtv<span>.net</span></b>'));
  // Nowhere on a PLAY page is the name drawn the old way: white with a pink ".net".
  for (const f of ['index.html', 'game.html', 'join.html', 'pad.html']) {
    const html = read(ROOT, f);
    assert.ok(!html.includes('.mark span{color:' + PINK + '}') && !html.includes('#top b span{color:var(--pink)}'), f);
  }
});

test('pressing Touch says how to get the bar back when that press is what hid it (the Voidverse function test F17, 24 Nov 2026; Bryan: "Yes, add it")', () => {
  const js = read(ROOT, 'src', 'play.js'), css = read(ROOT, 'play.css');
  // In a short window the buttons bring the handheld look, and in that look the bar slides away.
  assert.ok(js.includes('const shell = touch && !padMode && (started || FRAME) && Math.min(innerWidth, innerHeight) <= 540;'));
  assert.ok(css.includes('body.shell:not(.paused):not(.showbar) .bar{transform:translateY(-100%);transition:transform .2s}'));
  // The line is said after the page has taken its new look, and only when the buttons are on, the game is not paused
  // (a paused game shows the bar) and the look is the handheld one: a tall window keeps its bar and is told nothing.
  assert.ok(js.includes("place.sig = ''; place();\n    if (touch && !paused && document.body.classList.contains('shell')) toast('Buttons on. Tap the picture for the bar');"));
  // What the line promises is true: a tap on the picture shows the bar for three seconds.
  assert.ok(js.includes("document.body.classList.add('showbar'); clearTimeout(barTimer); barTimer = setTimeout(() => document.body.classList.remove('showbar'), 3000);"));
  // The same words as the line a found controller gets, so the two read as one voice.
  assert.ok(js.includes("toast('Controller found: the game fills the screen. Tap it for the bar');"));
});
