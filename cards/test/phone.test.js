// voidtv.net/cards on a phone (src/phone.js; Bryan, 24 Nov 2026: "B games first"). Run: node --test cards/test/phone.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const P = require('../src/phone.js');
const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

const win = (w, h, coarse, search) => ({ innerWidth: w, innerHeight: h, location: { search: search || '' }, matchMedia: (q) => ({ matches: q === '(pointer: coarse)' && !!coarse }) });

test('isPhone: a touch screen whose short side is under 600 pixels, upright or sideways; never a computer, a tablet or a TV', () => {
  assert.equal(P.isPhone(win(390, 844, true)), true, 'an iPhone held upright');
  assert.equal(P.isPhone(win(844, 390, true)), true, 'the same phone sideways');
  assert.equal(P.isPhone(win(360, 740, true)), true, 'a small Android phone');
  assert.equal(P.isPhone(win(820, 1180, true)), false, 'a tablet can be the table');
  assert.equal(P.isPhone(win(1920, 1080, false)), false, 'a TV or a computer');
  assert.equal(P.isPhone(win(390, 844, false)), false, 'a narrow window on a computer keeps the table (no touch)');
  assert.equal(P.isPhone(win(390, 844, true, '?table')), false, '"Show the table on this screen" opens the table on a phone');
  assert.equal(P.isPhone(win(390, 844, true, '?x=1&table=1')), false);
  assert.equal(P.isPhone(win(390, 844, true, '?tables')), true, 'only the word table counts');
  assert.equal(P.isPhone(null), false);
  assert.equal(P.isPhone({ innerWidth: 390, innerHeight: 844, location: {}, matchMedia: () => { throw new Error('old browser'); } }), false);
});

test('normCode: the four letters and numbers the rooms use (as play/join.html), any case, spaces dropped', () => {
  assert.equal(P.normCode('gkhw'), 'GKHW');
  assert.equal(P.normCode(' kx 7p '), 'KX7P');
  assert.equal(P.normCode('GKH'), null, 'too short');
  assert.equal(P.normCode('GKHWX'), null, 'too long');
  assert.equal(P.normCode('GK1W'), null, 'no 1, 0, O, I, B, L, S or Z in a code');
  assert.equal(P.normCode(''), null);
  const join = fs.readFileSync(path.join(__dirname, '..', '..', 'play', 'join.html'), 'utf8');
  assert.ok(join.includes("const ALPHABET = '" + P.ALPHABET + "'"), 'the same letters as the join page');
});

test('the tiles: every game, in the order of the picture Bryan picked, with its players and a few cards of its own', () => {
  global.self = global.self || global;
  const C = require('../src/cards.js');
  const games = {};
  for (const f of fs.readdirSync(path.join(__dirname, '..', 'games')).filter((x) => x.endsWith('.js'))) {
    const g = require(path.join(__dirname, '..', 'games', f));
    for (const x of [g, g && g.pairs]) if (x && x.id && x.name) games[x.id] = x; // go-fish.js carries Go Fish (pairs) as .pairs
  }
  const t = P.tiles(games);
  assert.deepEqual(t.slice(0, 7).map((x) => x.name), ['Crazy Eights', 'Hearts', 'Spades', 'Rummy', 'Go Fish', 'Go Fish (pairs)', 'Conquian']);
  assert.equal(t.length, Object.keys(games).length, 'every game has a tile');
  assert.equal(t[0].players, '2 to 7 players'); assert.equal(t[2].players, '4 players'); assert.equal(t[6].players, '2 players');
  for (const x of t) for (const id of x.cards) assert.ok(C.suitOf(id), x.id + ': ' + id + ' is a card');
  const later = P.tiles(Object.assign({ 'new-game': { id: 'new-game', name: 'New Game', players: { min: 2, max: 4 } } }, games));
  assert.equal(later[later.length - 1].name, 'New Game', 'a game added later comes after the pictured ones');
  assert.equal(P.playersLine({ players: { min: 1, max: 1 } }), '1 player');
  assert.equal(P.playersLine({}), '');
});

test('the table page hands over to the phone page before it makes a dealer or opens a room', () => {
  const js = read('src', 'screen.js');
  const take = js.indexOf('VoidCardsPhone.take()'), dealer = js.indexOf('VoidDealer.create('), open = js.lastIndexOf('openRoom();');
  assert.ok(take > 0 && take < dealer && take < open, 'phone first, then the table');
  const ph = read('src', 'phone.js');
  assert.ok(ph.includes("location.href = '/join?r=' + code"), 'Join hands the code to /join, which sends the phone to the right room');
  assert.ok(ph.includes("setAttribute('data-void-areas-menu', '')"), 'the areas menu button sits in the header');
  assert.ok(!/WebSocket|\/api\/room/.test(ph), 'the phone page opens no room');
  assert.ok(!/square\.link|donat/i.test(ph), 'no donation line on the phone page');
  const css = read('phone.css');
  assert.ok(/html\.phone-page/.test(css) && !/^body\{|^html,body\{/m.test(css), 'its styles apply only on a phone page');
});

// Phones only (Bryan, 24 Nov 2026: "Card games needs pure phone mode"; he picked "B, hand first").
test('phones only: ?phones opens the table on a phone (not the games page), and the games page offers it', () => {
  assert.equal(P.isPhone(win(390, 844, true, '?phones')), false, 'the host phone gets the table page in phones mode');
  const ph = read('src', 'phone.js');
  // Phone to phone is the default (Bryan, 24 Nov 2026: "The same phone to phone uh dynamic needs to be the default in card games as
  // well"): every game's sheet starts a phones-only table with that game picked; a TV is a line at the bottom.
  assert.ok(ph.includes("const startUrl = (id) => '/cards/?phones&game=' + encodeURIComponent(id);") && ph.includes('start.href = startUrl(game.id);'));
  assert.ok(!ph.includes('No TV? Play with phones only'), 'no separate box: starting on the phone is the default');
  assert.ok(/Have a TV or a computer hooked to it\?/.test(ph) && ph.includes("here.href = '/cards/?table'"), 'the TV stays the other way');
  const js = read('src', 'screen.js');
  assert.match(js, /if \(PHONES\) \{ const want = new URLSearchParams\(location\.search\)\.get\('game'\); if \(want\) dealer\.pick\(want\); \}/, 'the table opens on the game the tile started');
});

test('the hand page: a code the rooms could never make says so at once, and no screen talks of a big screen', () => {
  const h = read('src', 'hand.js'), html = read('hand.html');
  assert.ok(h.includes('if (!/^[2-9ACDEFGHJKMNPQRTUVWXY]{4}$/.test(code))'), 'the code letters of play/join.html (voidverse function test F6)');
  const join = fs.readFileSync(path.join(__dirname, '..', '..', 'play', 'join.html'), 'utf8');
  assert.ok(join.includes("const ALPHABET = '23456789ACDEFGHJKMNPQRTUVWXY'"), 'the same letters');
  const shown = (src) => [...src.matchAll(/'([^'\n]*)'|"([^"\n]*)"/g)].map((m) => m[1] || m[2] || '').filter((x) => / /.test(x)).join('\n');
  assert.ok(!/big screen/i.test(shown(h)), 'no line the player reads names a big screen: there may be none');
  assert.ok(!/big screen/i.test(html.replace(/<!--[\s\S]*?-->/g, '')), 'nor in the page');
});

test('phones only: the host page draws the start screen, sits the host down through the same hand page every phone uses, and tells the phones', () => {
  const js = read('src', 'screen.js');
  assert.ok(js.indexOf('if (!root.VoidDealer) return;') > 0 && js.indexOf('if (!root.VoidDealer) return;') < js.indexOf('VoidCardsPhone.take()'), 'the hand page can load screen.js for its pure part only');
  assert.match(js, /const PHONES = \/\[\?&\]phones\(\?:\[=&\]\|\$\)\/\.test\(location\.search\);/);
  assert.match(js, /function render\(\) \{\n    if \(PHONES\) \{ drawPhones\(dealer\.snapshot\(\)\); return; \}/, 'a phones-only table never draws the TV table');
  assert.ok(js.includes("hostFrame.src = '/cards/hand?r=' + room.code + '&name=' + encodeURIComponent(hostName);"), 'the host plays from the hand page, joined through the relay like any phone');
  assert.ok(js.includes("toPhones('all', { type: 'c-mode', phones: true })"), 'every phone is told it is phones only');
  assert.match(js, /if \(!\(events \|\| \[\]\)\.length\) tellMode\(\);/, 'told again whenever someone joins or comes back');
  assert.ok(/navigator\.wakeLock/.test(js), 'the host phone keeps its screen on while a game is on');
});

test('phones only: the hand page shows the Table button only on a phones-only table, and draws it from the public table alone', () => {
  const h = read('src', 'hand.js'), html = read('hand.html');
  assert.ok(h.includes("if (m.type === 'c-mode') { phonesOnly = !!m.phones; render(); return; }"));
  assert.ok(h.includes("$('b-table').hidden = !phonesOnly;"));
  assert.match(html, /id="b-table" type="button" hidden>Table</);
  assert.ok(h.includes("new URLSearchParams(location.search).get('name')"), 'the host comes with the name typed on the start screen');
  const draw = h.slice(h.indexOf('function drawTable()'), h.indexOf('function openTable()'));
  assert.ok(draw.length > 200);
  assert.ok(!/\bmine\b|takeHand|c-hand/.test(draw), 'the whole table is drawn from the public table (table.v), never from a hand');
  assert.ok(/table && table\.v/.test(draw) && /S\.centreItems\(v\)/.test(draw) && /S\.laidGroups\(v, i\)/.test(draw));
});

test('phones only: the card hand page alone may be framed, by voidtv.net only (Bryan, 24 Nov 2026: "Allow it, one page")', () => {
  const G = require('../../scripts/lib/siteguards.js');
  const h = G.headersFile();
  const rules = h.split(/\n(?=\/)/);
  const all = rules.find((r) => r.startsWith('/*\n'));
  assert.match(all, /X-Frame-Options: DENY/, 'every page keeps DENY');
  for (const p of ['/cards/hand', '/cards/hand.html']) {
    const r = rules.find((x) => x.startsWith(p + '\n'));
    assert.ok(r, p + ' has its own rule');
    assert.match(r, /! X-Frame-Options\n  X-Frame-Options: SAMEORIGIN/, p + ': the site-wide value is detached first, then same origin only');
    assert.match(r, /frame-ancestors 'self'/);
  }
  assert.equal((h.match(/SAMEORIGIN/g) || []).length, 2, 'no other path is opened');
  const mw = fs.readFileSync(path.join(__dirname, '..', '..', 'functions', '_middleware.js'), 'utf8');
  assert.ok(mw.includes("const CARDS_HAND = ['/cards/hand', '/cards/hand.html'];"), 'the Function does the same when the password gate is on');
});

// A way back to voidtv.net from every card screen on a phone (Bryan's rule: a visible way back on every page; 24 Nov 2026: "on mobile
// umm Caitlin was unable to back out of the card game and go back to void TV").
test('the way back: every screen of the hand page links to voidtv.net at the top page, and a game on asks first', () => {
  const html = read('hand.html'), h = read('src', 'hand.js');
  assert.match(html, /<a class="home" id="home" href="\/" target="_top"[^>]*><span class="v">voidtv<\/span><span class="n">\.net<\/span><\/a>/, 'the game screen\'s wordmark is the link');
  assert.match(html, /<a class="home-out" id="home-out" href="\/" target="_top"/, 'the other screens get one at the top');
  assert.ok(html.indexOf('id="home-out"') < html.indexOf('<section id="note"'), 'before every screen, so none is without it');
  assert.ok(h.includes("$('home-out').hidden = id === 'game';"), 'shown on every screen but the game, which has its own');
  assert.ok(h.includes("$('home').addEventListener('click', goHome)") && h.includes("$('home-out').addEventListener('click', goHome)"));
  const go = h.slice(h.indexOf('function goHome('), h.indexOf('function goHome(') + 500);
  assert.match(go, /roster\.phase === 'play'/, 'it asks only while a game is on (or for the host)');
  assert.match(go, /confirm\(/);
  assert.match(go, /the table closes for everyone/);
});

test('the way back: the host\'s phones-only table has the games page header, with the areas menu, drawn once outside the redraws', () => {
  const js = read('src', 'screen.js');
  const top = js.slice(js.indexOf('function drawHostTop()'), js.indexOf('function drawPhones('));
  assert.ok(top.includes("menu.setAttribute('data-void-areas-menu', '')") && top.includes("mark.href = '/'"));
  assert.ok(top.includes('document.body.insertBefore(hostTop, app)'), 'outside #app, so the menu survives every redraw');
  assert.ok(/if \(hostTop\) return;/.test(top), 'drawn once');
  assert.ok(/confirm\('Leave and go to voidtv\.net\? The table closes for everyone\.'\)/.test(top));
  assert.ok(js.slice(js.indexOf('function drawPhones('), js.indexOf('function drawPhones(') + 200).includes('drawHostTop();'));
});

// The way back on a TV, laptop or tablet (the voidverse audit, 24 Nov 2026: the lobby was a dead end on every screen but a phone).
test('the way back on a TV: the lobby carries the areas menu and the voidtv.net link, drawn once outside the redraws, hidden in play', () => {
  const js = read('src', 'screen.js');
  const top = js.slice(js.indexOf('function drawTvTop('), js.indexOf("let lastPhase = '';"));
  assert.ok(top.includes("menu.setAttribute('data-void-areas-menu', '')") && top.includes("mark.href = '/'"));
  assert.ok(top.includes('document.body.insertBefore(tvTop, app)') && /if \(!tvTop\)/.test(top), 'drawn once, outside #app');
  assert.ok(top.includes('tvTop.hidden = !show;'));
  assert.match(js, /drawTvTop\(s\.phase === 'lobby' \|\| !s\.view\);/, 'shown in the lobby only');
  assert.match(top, /confirm\('Leave and go to voidtv\.net\? The table closes for everyone\.'\)/, 'with phones at the table it asks first');
  assert.match(js, /e\.target\.closest\('button, a'\)/, 'Enter on the focused link follows it instead of dealing');
  const site = fs.readFileSync(path.join(__dirname, '..', '..', 'scripts', 'site.js'), 'utf8');
  assert.ok(site.includes(`.replace('src="/assets/brand/areas/areas.js"', 'src="/assets/brand/areas/areas.js?v=' + require('./lib/areas-v')() + '"')`), 'the card pages carry the area list\'s version, as PLAY and Trivia do');
});

// The voidverse function test's slice 3 (24 Nov 2026), on Bryan's "Yes, fix them".
test('the message after a refused move never covers or takes a press of the bar', () => {
  const css = read('hand.css'), h = read('src', 'hand.js');
  assert.match(css, /#toast\{[^}]*pointer-events:none/, 'every tap goes through it (F32)');
  assert.ok(h.includes("if (bar && bar.offsetHeight) t.style.bottom = (bar.offsetHeight + 10) + 'px';"), 'and it sits above the bar, however many rows it has');
});
