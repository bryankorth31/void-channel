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
  assert.ok(ph.includes("phones.href = '/cards/?phones'"), 'No TV? Play with phones only');
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
