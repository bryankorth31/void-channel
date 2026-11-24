// The way home, and the row arrows (build audit 19 Nov 2026, V8 and V9; decision H8: "The logo top left goes home").
// V9: with a filter on (say "90s Sitcoms"), pressing the voidtv.net logo left the filter on, so it did not bring back the
// full home page; only the cross on the chip did. V8: the left and right arrows on every home row had no hover tip and no
// name for a screen reader.
// Reads the real text of scripts/lib/app.js and runs the real goHome() in a bare context. No browser, no network.
// Run: node --test tests/app-home.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const APP = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'lib', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const lineAt = (needle) => { const at = APP.indexOf(needle); assert.ok(at > 0, 'app.js still holds: ' + needle); return APP.slice(at, APP.indexOf('\n', at)); };

// Audit A3 (20 Nov 2026): the logo was a div, so the Tab key did not reach it and it could not open in a new tab.
test('A3: the logo is a real link home; a plain click calls goHome() with no page load, a click with a key held is left to the browser', () => {
  const logo = /<a class="logo" href="\$\{base\}" aria-label="\$\{BRAND\} home" onclick="([^"]*)">/.exec(APP);
  assert.ok(logo, 'the logo is an <a> with an address and a name');
  assert.ok(!/<div class="logo"/.test(APP), 'no logo div is left');
  assert.match(lineAt('.logo{'), /color:inherit;text-decoration:none\}/, 'it still looks like the logo, not like a link');
  const press = (event) => { let went = 0; const out = vm.runInNewContext('(function(event){' + logo[1] + '})', { goHome: () => { went++; } })(event); return [out, went]; };
  assert.deepEqual(press({ button: 0 }), [false, 1], 'a plain click goes home in the page and stops the link');
  for (const held of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) assert.deepEqual(press(held), [true, 0], JSON.stringify(held) + ' opens the link the browser\'s way');
});

// Night audit N4 (20 Nov 2026): two sentences on the Privacy page were no longer true.
test('N4: the Privacy page no longer speaks of a test-password cookie or of a children\'s site still being built', () => {
  const at = APP.indexOf('function privacyPage(){');
  const page = APP.slice(at, APP.indexOf('\nfunction ', at + 10));
  assert.ok(at > 0 && page.length > 500, 'privacyPage found');
  assert.doesNotMatch(page, /only while the site is in testing|test password/);
  assert.doesNotMatch(page, /is being built/);
  assert.ok(page.includes("+'<li>No cookies. ${BRAND} sets none.</li>'"), 'it says there are no cookies');
  assert.ok(page.includes('Children have their own site, ${BRAND} kids, at kids.voidtv.net, with its own rules.</p>'), 'it says where the children\'s site is');
});

// Night audit N8: the cookie claim above is only true while the page code sets none.
test('the page itself sets no cookie, and no long or short dash is left in the page source', () => {
  assert.doesNotMatch(APP, /document\.cookie\s*=/, 'the page code sets no cookie');
  assert.doesNotMatch(APP, new RegExp('[' + String.fromCharCode(0x2014, 0x2013) + ']'));
  assert.ok(APP.includes("b.born?(b.died?b.born.slice(0,4)+' to '+b.died.slice(0,4):'born '+b.born.slice(0,4)):''"), 'a person\'s years read "1931 to 2015", or "born 1931"');
});

test('H8 and V9: goHome() clears every filter and the search box before going home', () => {
  const GOHOME = lineAt('function goHome(){');
  const calls = [];
  const box = { value: 'rosanne' };
  const ctx = { state: { type: '90s Sitcoms', tag: 'Christian', genre: 'Comedy', network: 'NBC', decade: '1990s', q: 'rosanne', sort: 'eps', view: 'me', chan: 'void' }, $: (id) => (id === 'q' ? box : null), go: (slug) => calls.push(slug) };
  vm.createContext(ctx);
  vm.runInContext(GOHOME + '\ngoHome();', ctx);
  for (const k of ['type', 'tag', 'genre', 'network', 'decade', 'q']) assert.equal(ctx.state[k], '', k + ' is cleared');
  assert.equal(box.value, '', 'the search box is emptied');
  assert.deepEqual(calls, [''], 'then it goes home, once');
  assert.equal(ctx.state.sort, 'eps', 'the sort order is a preference, not a filter: it stays');
  assert.equal(ctx.state.chan, 'void', 'the Live TV channel stays');
});

test('goHome() clears the same filters the chips show: a filter added to the chips must be added to goHome()', () => {
  const chips = lineAt('<div class="chips">\'+[[');
  const shown = [...chips.slice(0, chips.indexOf('].filter(')).matchAll(/\['(\w+)',state\.\w+\]/g)].map((m) => m[1]);
  assert.deepEqual(shown, ['type', 'tag', 'genre', 'network', 'decade'], 'the filters that get a chip');
  const cleared = /for\(const k of \[([^\]]*)\]\)state\[k\]=''/.exec(lineAt('function goHome(){'));
  assert.ok(cleared, 'goHome() clears a list of keys');
  const keys = cleared[1].split(',').map((s) => s.replace(/'/g, '').trim());
  for (const k of [...shown, 'q']) assert.ok(keys.includes(k), 'goHome() clears ' + k);
});

test('goHome() works on a page with no search box', () => {
  const ctx = { state: { type: 'Movies', tag: '', genre: '', network: '', decade: '', q: '' }, $: () => null, go: () => {} };
  vm.createContext(ctx);
  vm.runInContext(lineAt('function goHome(){') + '\ngoHome();', ctx);
  assert.equal(ctx.state.type, '');
});

test('the Browse back buttons still call go(\'\'): coming back from a show keeps the filtered list he was reading', () => {
  const backs = APP.match(/<button class="back" onclick="[^"]*">/g) || [];
  assert.ok(backs.length >= 4, 'Mine, Live TV, the promos page and the text pages have one: ' + backs.length);
  for (const b of backs) assert.ok(!b.includes('goHome'), b);
});

// H9 (23 Nov 2026, "C, Play together row"): the rooms where the TV is the table and the phones are in your hands.
test('H9: a "Play together" row under On now, with Card games, Trivia Night and PLAY, on voidtv.net itself only', () => {
  const onnow = APP.indexOf("<div id=\"onnow\">'+onNowHtml()+'</div>'+momentHome();"), row = APP.indexOf('\n  h+=togetherHome();\n'), yours = APP.indexOf('// 2. yours');
  assert.ok(onnow > 0 && row > onnow && row < yours, 'right after On now and any moment that is on (the moment keeps its place under Live TV), before your own rows');
  const fn = lineAt('function togetherHome(){');
  // The tiles' names come from the one list of rooms (voidverse join J3; Bryan, 24 Nov 2026: "B, PLAY"), never a word of the row's own.
  const NAMES = require('../scripts/lib/areas-v').names();
  const escPage = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const run = (remoteOn, rooms) => vm.runInNewContext(fn + '\ntogetherHome();', { REMOTE_ON: remoteOn, BASE: '/', ROOMS: rooms || NAMES, esc: escPage });
  assert.equal(run(false), '', 'nothing where the phone remote is off: another site, Kids, an embed');
  const html = run(true);
  assert.match(html, /<h2>Play together<small>/);
  const tiles = [...html.matchAll(/<a class="ontile" href="([^"]+)"[^>]*><img loading="lazy" src="([^"]+)" alt=""><b>([^<]+)<\/b><small>([^<]+)<\/small><\/a>/g)].map((m) => m.slice(1));
  assert.deepEqual(tiles.map((t) => [t[0], t[2]]), [['/cards/', 'Card games'], ['/trivia/', 'Trivia Night'], ['/play/', 'PLAY']]);
  assert.doesNotMatch(fn, /'(Games|PLAY|Card games|Trivia Night)'/, 'no room name is written into the row itself');
  assert.match(run(true, { cards: 'A & B', trivia: 'Quiz', play: 'Arcade' }), /<b>A &amp; B<\/b>.*<b>Quiz<\/b>.*<b>Arcade<\/b>/, 'a new name in the list is the name on the tile');
  for (const t of tiles) assert.ok(fs.existsSync(path.join(__dirname, '..', t[1])), t[1] + ' is in the repo');
  assert.doesNotMatch(html, /[–—]/, 'no em or en dashes');
  assert.match(APP, /\na\.ontile\{text-decoration:none\}\n/, 'a link tile looks like the On now tiles');
});

test('V8: the two arrows on every home row have a hover tip and a name', () => {
  const arrows = APP.match(/<button class="arrow [lr]"[^>]*>/g) || [];
  assert.equal(arrows.length, 2, 'one left and one right arrow in the row template');
  const [left, right] = [arrows.find((a) => a.includes('arrow l')), arrows.find((a) => a.includes('arrow r'))];
  assert.ok(left.includes('title="Scroll left"') && left.includes('aria-label="Scroll left"'), left);
  assert.ok(right.includes('title="Scroll right"') && right.includes('aria-label="Scroll right"'), right);
  assert.ok(left.includes(',-1)') && right.includes(',1)'), 'each still slides its own way');
});

// H10 (voidverse audit A1 and MAIN-04; Bryan, 23 Nov 2026, picked from three pictures: "B, TV beside what's on").
// The home TV was sized by the window's width alone: at his 1278x513 window it stood 688 px tall, the channel buttons
// were 289 px below the fold and the first row 860 px below it (L13 says the buttons are always reachable without
// scrolling, H2 that rows sit right under the TV). On a wide, short window the TV is now sized by the window's height,
// with On now as a list beside it and the channel bar under both.
test('H10: one box holds Live TV, On now and any moment, and closes before Play together', () => {
  const open = APP.indexOf("\n  h+='<div class=\"home-top\">';\n"), tv = APP.indexOf("<div id=\"onnow\">'+onNowHtml()+'</div>'+momentHome();\n  h+='</div>';\n"), row = APP.indexOf('\n  h+=togetherHome();\n');
  assert.ok(open > 0 && tv > open && row > tv, 'opened before Live TV, closed right after the moment, Play together after it');
  assert.equal(APP.slice(open, tv).split('\n').length, 3, 'nothing else between the opening and the Live TV line');
  assert.equal(APP.split('class=\\"home-top\\"').length + APP.split('class="home-top"').length - 2, 1, 'one such box');
});

test('H10: the side-by-side rules apply only on a wide, short window, and place the picture, the bar, On now and the guide line', () => {
  const at = APP.indexOf('@media(min-width:1000px) and (min-aspect-ratio:8/5){\n.home-top{'), end = APP.indexOf('\n}\n', at);
  assert.ok(at > 0 && end > at, 'the rules sit in one block for windows at least 1000 px wide and 8:5 or wider');
  const css = APP.slice(at, end);
  assert.ok(!/\.home-top[ >.{]/.test(APP.slice(0, at).split('\n').filter((l) => !l.startsWith('/*') && !l.startsWith('   ')).join('\n')), 'no .home-top rule outside that block: everywhere else it is a plain block');
  assert.match(css, /\.home-top\{--w:min\(calc\(\(100vh - 148px\) \* 16 \/ 9\),calc\(100vw - 456px\)\);display:grid;grid-template-columns:var\(--w\) minmax\(0,1fr\);/, 'the TV is sized by the window height, and leaves the list at least 380 px');
  assert.match(css, /grid-template-areas:"tv on" "tv hl" "bar bar"/, 'the TV, On now beside it, the guide line under On now, the channel bar under both');
  assert.ok(css.includes('.home-top>#htv.htv-on,.home-top .htv-on .tv,.home-top .htv-on .screen{display:contents}'), 'the TV section steps aside so its parts sit on the grid; no markup of the player changes');
  assert.ok(css.includes('.home-top .hv,.home-top .screen>.swirl{grid-area:tv;'), 'the playing picture and the still swirl both take the TV place');
  assert.ok(css.includes('.home-top .osd{grid-area:bar;') && css.includes('.home-top .hl{grid-area:hl;') && css.includes('.home-top>#onnow{grid-area:on;'));
  assert.ok(css.includes('.home-top>*{grid-column:1 / -1}'), 'anything else in the box (a moment\'s card and row) keeps the full width below');
  assert.match(css, /\.home-top>#onnow\{[^}]*height:calc\(var\(--w\) \* 9 \/ 16 - 26px\)\}/, 'the list is as tall as the picture, less the guide line');
  assert.match(css, /\.home-top \.onnow\{[^}]*overflow-x:hidden;overflow-y:auto;/, 'and scrolls inside itself, so the page never grows sideways');
});

test('H10: the channel bar stays on one line there; long names shorten with dots and the buttons never wrap away', () => {
  const css = lineAt('.home-top .osd{grid-area:bar;');
  assert.ok(css.includes('flex-wrap:nowrap}'));
  assert.ok(css.includes('.home-top .osd>b,.home-top .osd .acts{flex:none;white-space:nowrap}'), 'the channel name and the buttons keep their size');
  assert.ok(css.includes('.home-top .osd>span:not(.acts){flex:0 1 auto;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'), 'the show and the "next" text give way');
  assert.ok(APP.includes('.osd{display:flex;flex-wrap:wrap;'), 'on a phone the bar still wraps, as before');
});

test('H10: by the numbers, the channel buttons are inside the window wherever the rules apply, and plain windows are left alone', () => {
  const HEADER = 60, BAR = 64;                                   // measured on the page: the pinned header and the channel bar
  const applies = (w, h) => w >= 1000 && w / h >= 8 / 5;
  const tvWidth = (w, h) => Math.min((h - 148) * 16 / 9, w - 456);
  for (const [w, h] of [[1278, 513], [1920, 1080], [1316, 821], [1366, 768], [1280, 800], [1440, 900], [2560, 1440], [1000, 600]]) {
    assert.ok(applies(w, h), w + 'x' + h + ' is wide and short');
    const tw = tvWidth(w, h), buttonsEnd = HEADER + 10 + tw * 9 / 16 + 8 + BAR;
    assert.ok(tw >= 300, w + 'x' + h + ': the picture is ' + Math.round(tw) + ' px wide');
    assert.ok(buttonsEnd <= h, w + 'x' + h + ': the channel bar ends at ' + Math.round(buttonsEnd) + ' of ' + h);
    assert.ok(w - 40 - 16 - 16 - tw >= 380, w + 'x' + h + ': On now keeps 380 px beside it, a scroll bar allowed for');
  }
  // before the fix, the same sums at his window: the full-width picture alone was taller than the window
  assert.ok(HEADER + (1278 - 15 - 40) * 9 / 16 > 513);
  for (const [w, h] of [[390, 844], [821, 1316], [844, 390], [1024, 768], [1200, 800], [1080, 1920]]) {
    assert.ok(!applies(w, h), w + 'x' + h + ' keeps the TV full width with On now under it');
  }
  // the two desktop windows it leaves alone already hold the full-width TV and its bar
  for (const [w, h] of [[1024, 768], [1200, 800]]) assert.ok(HEADER + (w - 40) * 9 / 16 + BAR <= h, w + 'x' + h + ' fits as it is');
});
