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

test('V8: the two arrows on every home row have a hover tip and a name', () => {
  const arrows = APP.match(/<button class="arrow [lr]"[^>]*>/g) || [];
  assert.equal(arrows.length, 2, 'one left and one right arrow in the row template');
  const [left, right] = [arrows.find((a) => a.includes('arrow l')), arrows.find((a) => a.includes('arrow r'))];
  assert.ok(left.includes('title="Scroll left"') && left.includes('aria-label="Scroll left"'), left);
  assert.ok(right.includes('title="Scroll right"') && right.includes('aria-label="Scroll right"'), right);
  assert.ok(left.includes(',-1)') && right.includes(',1)'), 'each still slides its own way');
});
