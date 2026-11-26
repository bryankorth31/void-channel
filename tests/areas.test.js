// Every voidtv.net area in one list (assets/brand/areas/areas.js; Bryan, 20 Nov 2026, M1 + A1). Run: node --test tests/areas.test.js
// 1. The list: Void Cast is never in it; every area has its menu line and its card words; the copy keeps the house rules.
// 2. Where it loads: voidtv.net, PLAY, Trivia and University; never kids; University shows the menu with no card (Open Yale's terms).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const REPO = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8').replace(/\r\n/g, '\n');
const SRC = read('assets/brand/areas/areas.js');

function load(hostname, pathname) {
  const window = {};
  const ctx = { window, location: { hostname, pathname }, document: { currentScript: null, readyState: 'loading', addEventListener() {} },
    localStorage: { getItem() { return null; }, setItem() {} }, Math };
  vm.runInNewContext(SRC, ctx);
  return window.VoidAreas;
}

test('the list: no Void Cast, every live area complete, the house copy rules', () => {
  const A = load('voidtv.net', '/').areas;
  assert.ok(A.length >= 7);
  assert.doesNotMatch(SRC, /void-?cast|voidcast/i, 'Void Cast is Bryan\'s private viewer and is never listed');
  const ids = new Set();
  for (const a of A) {
    assert.ok(!ids.has(a.id), 'one line per area: ' + a.id); ids.add(a.id);
    for (const k of ['name', 'line', 'kicker', 'head', 'text', 'go', 'pic']) assert.ok(a[k], a.id + ' has ' + k);
    // voidtv.net's own areas by path, its sister sites at <name>.voidtv.net, and a house area outside it (lexROM) by its own https address
    assert.ok(a.site === 'main' ? /^\//.test(a.path) : (a.url === 'https://' + a.site + '.voidtv.net/' || (a.also && /^https:\/\/[a-z0-9.-]+\/$/.test(a.url))), a.id + ' has an address');
    const words = [a.name, a.line, a.kicker, a.head, a.text, a.go].join(' ');
    assert.doesNotMatch(words, /—|–/, a.id + ': no em or en dashes');
    assert.doesNotMatch(words, /classic shows/i, a.id + ': never "classic shows"');
    assert.doesNotMatch(words, /VOIDtv|VoidTV|Void TV|Voidtv/, a.id + ': the name is voidtv.net');
  }
  for (const id of ['ondemand', 'live', 'play', 'trivia', 'cards', 'university', 'kids', 'hindi', 'westside', 'espanol']) assert.ok(A.find((a) => a.id === id && a.live), id + ' is listed and live');
  // Every picture a voidtv.net area names is a file in the site (Card games, 23 Nov 2026: its picture is new).
  for (const a of A) if (/^\//.test(a.pic)) assert.ok(fs.existsSync(path.join(REPO, a.pic)), a.id + ': its picture ' + a.pic + ' is in the repo');
});

test('the card games page knows it is the Card games area', () => {
  const V = (p) => { const w = {}; vm.runInNewContext(SRC, { window: w, location: { hostname: 'voidtv.net', pathname: p }, document: { currentScript: null, readyState: 'loading', addEventListener() {} }, localStorage: { getItem() { return null; }, setItem() {} }, Math }); return w.VoidAreas; };
  const A = V('/cards/');
  assert.equal(A.areas.find((a) => a.id === 'cards').path, '/cards/');
  assert.match(SRC, /if \(\/\^\\\/cards\(\\\/\|\$\)\/\.test\(p\)\) return 'cards';/);
});

test('where it loads: voidtv.net, PLAY, Trivia, University; never kids', () => {
  const APP = read('scripts/lib/app.js');
  assert.match(APP, /<span data-void-areas-menu><\/span>/);
  assert.match(APP, /PROFILE\.name === 'kids' \|\| mode === 'embed' \? '' : `<script src="[^`]*assets\/brand\/areas\/areas\.js/);
  assert.match(APP, /data-void-areas-ad/);
  for (const f of ['play/index.html', 'trivia/index.html']) {
    const h = read(f);
    assert.match(h, /<span data-void-areas-menu><\/span>/, f + ' has the menu');
    assert.match(h, /<script src="\/assets\/brand\/areas\/areas\.js" defer/, f + ' loads the list');   // the build stamps the version (PLAY: site.js; Trivia: A34)
  }
  const U = read('profiles/university/build.js');
  assert.match(U, /areas\.js\?v=' \+ require\('\.\.\/\.\.\/scripts\/lib\/areas-v'\)\(\) \+ '" defer data-site="university" data-here="university" data-ads="off"/, 'University: the menu, no card');
  assert.match(APP, /areas\.js\?v=\$\{require\('\.\/areas-v'\)\(\)\}" defer/, 'voidtv.net: the version comes from the list itself');
});

test('the version is a hash of the list, so a changed list is never held in a cache', () => {
  const v = require('../scripts/lib/areas-v')();
  assert.match(v, /^[0-9a-f]{10}$/);
  assert.equal(v, require('crypto').createHash('sha1').update(SRC).digest('hex').slice(0, 10));
});

// Voidverse join J3, one name per room (Bryan, 24 Nov 2026: "Yes, those four", then "B, PLAY"). The main page takes the other rooms'
// names from this list through areas-v.js names(); the header said "Games" where the list, the menu and the room said "PLAY".
test('J3: the rooms\' names the main page uses are the list\'s own, and the names for a build without the list do not differ from it', () => {
  const V = require('../scripts/lib/areas-v');
  const A = load('voidtv.net', '/').areas;
  const names = V.names();
  for (const a of Array.from(A)) assert.equal(names[a.id], a.name, a.id + ' is named as the list names it');
  assert.equal(names.play, 'PLAY');
  for (const [id, name] of Object.entries(V.NAMES_WITHOUT_LIST)) assert.equal(name, Array.from(A).find((a) => a.id === id).name, id + ': the spare name equals the list');
  assert.match(read('scripts/lib/app.js'), /const ROOMS=\$\{JSON\.stringify\(\{ play: ROOM_NAMES\.play, trivia: ROOM_NAMES\.trivia, cards: ROOM_NAMES\.cards \}\)/, 'the page gets them at build time');
});


// The menu opens as "the voidverse" with the room you are in lit (Bryan, 25 Nov 2026, "Yes, your picks": N1, W2, B2; decision H12).
// html(here) is what the opened menu holds, as text; spots(n, tall) is where each room sits, in hundredths of the box.
test('H12: the menu opens as "the voidverse", voidtv.net stays the wordmark, and the room you are in is lit', () => {
  const V = load('voidtv.net', '/play/');
  assert.match(SRC, /<b class="va-ttl">the voidverse<\/b>/, 'the whole is named on top');
  const h = V.html('play');
  assert.match(h, /<span class="va-hub"><span class="va-wm">voidtv<i>\.net<\/i><\/span><\/span>/, 'voidtv.net is the wordmark, in the middle');
  assert.equal((h.match(/aria-current="page"/g) || []).length, 1, 'one place is lit');
  assert.match(h, /aria-current="page" data-va="play" title="[^"]*"><em class="va-here">You are here<\/em><i class="va-dot has"><svg class="va-mark"[^]*?<\/svg><\/i><b>PLAY<\/b>/);
  assert.equal((h.match(/<line [^>]*class="on"/g) || []).length, 2, 'its line to the middle is lit, in the wide drawing and the tall one');
  // every room that is not a site for a group of people sits round the middle, under its own name from the list
  const A = Array.from(V.areas).filter((a) => a.live);
  for (const a of A.filter((x) => !x.chip)) assert.ok(h.includes('data-va="' + a.id + '"') && h.includes('<b>' + a.name.replace(/&/g, '&#38;') + '</b>'), a.id + ' is on it by its list name');
  // the sites for a group of people are the row under the rooms, in the list's own order (Spanish, West Side, Hindi last)
  assert.deepEqual(A.filter((a) => a.chip).map((a) => a.id), ['kids', 'espanol', 'westside', 'hindi']);
  assert.deepEqual(Array.from(h.matchAll(/<a class="va-chip" href="[^"]*"[^>]* data-va="([a-z]+)"/g), (m) => m[1]), ['kids', 'espanol', 'westside', 'hindi', 'join']);
  assert.match(V.html('hindi'), /<a class="va-chip" href="https:\/\/hindi\.voidtv\.net\/" aria-current="page" data-va="hindi"[^>]*><svg class="va-mark"[^]*?<\/svg>hindi <em>you are here<\/em><\/a>/, 'on a language site its own button is lit');
  assert.match(h, /Your phone joins any room:<\/span><a class="va-chip" href="\/join" data-va="join">Type a code<\/a>/, 'the phone has one door, the join page');
  assert.match(load('university.voidtv.net', '/').html('university'), /href="https:\/\/voidtv\.net\/join"/, 'from another address the join page is voidtv.net\'s');
  assert.match(h, /All free\. No account\. No ads sold\./);
});

// The room marks (Bryan, 25 Nov 2026: "S2 neon line"). The drawings live as files in assets/brand/marks/ and, the same lines, inside
// the menu file, so the menu asks no site for a picture.
test('H12: every room carries its mark from the neon line set, the same drawing as the file in the brand folder, in pink and blue only', () => {
  const V = load('voidtv.net', '/');
  const M = V.marks, h = V.html('ondemand');
  const ids = Array.from(V.areas).filter((a) => a.live).map((a) => a.id);
  for (const id of ids.concat('phone')) {
    assert.ok(M[id], id + ' has a mark');
    const file = read('assets/brand/marks/' + id + '.svg');
    assert.ok(file.includes('filter="url(#n)">' + M[id] + '</g></svg>'), id + ': the menu draws what the file draws');
    assert.deepEqual(Array.from(new Set(file.match(/#[0-9a-fA-F]{3,8}\b/g))).sort(), ['#5fe3ff', '#ff4fc8'], id + ': the brand\'s pink and blue, nothing else');
    assert.doesNotMatch(file, /<script|<image|href=|<foreignObject|style=/i, id + ': a plain drawing');
  }
  assert.deepEqual(Object.keys(M).sort(), ids.concat('phone').sort(), 'no mark without a room');
  assert.deepEqual(fs.readdirSync(path.join(REPO, 'assets/brand/marks')).sort(), ids.concat('phone').map((id) => id + '.svg').sort(), 'no file without a room');
  assert.equal((h.match(/<svg class="va-mark"/g) || []).length, ids.length + 1, 'one mark for each room and each button, and one for the phone');
  assert.doesNotMatch(h, /<img/, 'the opened menu loads no picture from any site');
  assert.equal((h.match(/<filter id="va-glow"/g) || []).length, 1, 'one glow, shared');
});

test('H12: plain words only, and every room has a place of its own at both shapes', () => {
  // B2: the words for the parts of the whole stay in the docs and HQ; a visitor reads rooms and "your phone".
  assert.doesNotMatch(SRC, /\b(heart|nerves?|spine|limbs?|skin)\b|the body|as a body/i, 'no body words anywhere in the file a visitor\'s browser loads');
  const V = load('voidtv.net', '/');
  // Seven rooms fit round the middle on a phone. An eighth makes the names touch there: this fails then, so the phone drawing is looked at again.
  assert.ok(Array.from(V.areas).filter((a) => a.live && !a.chip).length <= 7, 'at most seven rooms round the middle until the phone drawing is checked for more');
  for (const n of [5, 6, 7]) for (const tall of [false, true]) {
    const p = Array.from(V.spots(n, tall));
    assert.equal(p.length, n);
    for (const s of p) assert.ok(s.x >= 8 && s.x <= 92 && s.y >= 8 && s.y <= 92, 'inside the box: ' + JSON.stringify(s));
    // no two rooms on top of each other: at a 1278 by 513 window the box is about 1230 by 360, on a phone about 358 by 520
    const W = tall ? 358 : 1230, H = tall ? 520 : 360;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const dx = Math.abs(p[i].x - p[j].x) * W / 100, dy = Math.abs(p[i].y - p[j].y) * H / 100;
      assert.ok(dx >= 100 || dy >= 62, n + ' rooms, ' + (tall ? 'tall' : 'wide') + ': rooms ' + i + ' and ' + j + ' do not overlap (' + Math.round(dx) + ', ' + Math.round(dy) + ')');
    }
  }
  assert.equal(V.spots(7, false)[0].x, 10, 'wide: the first room is at the left');
  assert.equal(V.spots(7, true)[0].y, 12, 'tall: the first room is at the top');
});

// The closing line every room carries (Bryan, 25 Nov 2026, "Yes, your picks": voidverse join J10; decision H13). One block, in the
// menu file; a page gives it a place with <div data-void-closing></div> under its own footer.
test('H13: the closing line names the room as one room of the voidverse, free, a project of CASH, and says "from the Internet Archive" only where that is true', () => {
  const V = load('voidtv.net', '/');
  const text = (id) => V.closing(id).replace(/<[^>]+>/g, '');
  assert.equal(text('ondemand'), 'On Demand is one room of the voidverse: free, from the Internet Archive, a project of CASH (cashvalues.org).');
  assert.equal(text('cards'), 'Card games is one room of the voidverse: free, a project of CASH (cashvalues.org).');
  const A = Array.from(V.areas).filter((a) => a.live);
  // what plays from the Archive, and what does not: questions, cards and lexROM's books are not from it
  assert.deepEqual(A.filter((a) => a.ia).map((a) => a.id), ['ondemand', 'live', 'play', 'university', 'kids', 'espanol', 'westside', 'hindi']);
  for (const a of A) {
    const t = text(a.id);
    assert.ok(t.startsWith(a.name + ' is one room of the voidverse: free, '), a.id + ': the room by its list name');
    assert.equal(/from the Internet Archive/.test(t), !!a.ia, a.id + ': the Archive is named only where it is the source');
    assert.ok(t.endsWith('a project of CASH (cashvalues.org).'), a.id + ': CASH by its short name, with cashvalues.org');
    assert.doesNotMatch(t, /—|–|Church of American|donat|give|gift|tax|\$/i, a.id + ': no dashes, no full name, and it asks for nothing');
  }
  assert.match(V.closing('play'), /<a href="https:\/\/cashvalues\.org" target="_blank" rel="noopener">CASH<\/a>/);
  assert.equal(V.closing('not-a-room'), '', 'an address that is no room gets no line');
  assert.match(SRC, /function run\(\) \{ queued = false; menus\(\); ads\(\); closings\(\);/, 'it is written whenever the page changes, so it follows from On Demand to Live TV');
  // the main site gives it a place under the footer's own words; Kids, which never loads this file, has none
  assert.match(read('scripts/lib/app.js'), /\$\{CREDIT\}\$\{PROFILE\.name === 'kids' \? '' : '<div data-void-closing><\/div>'\}<\/footer>/);
});

// Bryan, 23 Nov 2026: "Hindi void should not be in the list higher then any other void verse page aside from west side or spanish".
// Then, 24 Nov 2026 (typed in the sister sites chat): "Hindi needs to be really relegated to the sidelines of things even underneath Spanish
// it should go Spanish and then the West side and then Indy or Indian ... but Spanish first and below on the list these three things".
test('the language sites come last, in his order: Spanish, then West Side, then Hindi at the very end', () => {
  const A = load('voidtv.net', '/').areas;
  const ids = Array.from(A, (a) => a.id); // Array.from: the list comes out of a vm, and its own arrays are another realm's
  assert.deepEqual(ids.slice(-3), ['espanol', 'westside', 'hindi'], 'the last three, in this order');
  for (const id of ids.slice(0, -3)) assert.ok(!['espanol', 'westside', 'hindi'].includes(id), id + ' is above them and is not a language site');
  const first = ids.indexOf('espanol');
  assert.ok(ids.indexOf('read') < first && ids.indexOf('kids') < first && ids.indexOf('university') < first, 'lexROM, Kids and University are above all three');
});

// Bryan, 25 Nov 2026: "Yes, your picks" (join J11, a real "not found" page that says so and offers the rooms), then "Yes, start it".
test('H14: an address that is not there says so and offers every room, from one block in the menu file; no room is lit and it asks for nothing', () => {
  const V = load('voidtv.net', '/this-page-is-not-here');
  const html = V.notFound();
  const text = html.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, '');
  assert.ok(text.startsWith('That page is not here.The address may be old or mistyped. Every room of the voidverse is still open:'), text.slice(0, 120));
  const A = Array.from(V.areas).filter((a) => a.live);
  const links = html.match(/<a class="va-chip"[^>]*>/g) || [];
  assert.equal(links.length, A.length, 'one button for every room that is open');
  for (const a of A) {
    assert.ok(html.includes('data-va="' + a.id + '"'), a.id + ' is offered');
    assert.ok(text.includes(a.chip || a.name), a.id + ': by the name the menu uses');
  }
  assert.equal((html.match(/class="va-mark"/g) || []).length, A.length, 'every room with its mark');
  assert.doesNotMatch(html, /aria-current|you are here/i, 'no room is lit: the visitor is in none of them');
  assert.doesNotMatch(text, /—|–|404|error|oops|sorry|donat|give|gift|\$/i, 'plain words, no dashes, and it asks for nothing');
  assert.doesNotMatch(html, /cast\.voidtv|fbdmlab|onemechanism/i);
  assert.match(SRC, /function run\(\) \{ queued = false; menus\(\); ads\(\); closings\(\); notFounds\(\);/, 'a place a page adds later is filled too');
  // the main site: an address it does not know shows the block, never the home page; the known pages are untouched; Kids is left out
  const app = read('scripts/lib/app.js');
  assert.match(app, /\$\{PROFILE\.name === 'kids' \? '' : "if\(location\.pathname!==BASE&&location\.pathname!==BASE\+'index\.html'\)return '\/notfound';"\}\}return location\.hash/);
  assert.match(app, /if\(slug==='\/notfound'\)\{state\.show=null;state\.view='notfound';document\.title='Not found · '\+SITE;render\(\)/, 'the address stays as typed: no history change');
  assert.match(app, /else if\(state\.view==='notfound'\)keepTracks\(notFoundPage\)/);
  assert.match(app, /function notFoundPage\(\)\{killPlayer\(\);\$\('main'\)\.innerHTML='<div data-void-notfound>/);
  assert.match(app, /noIndex\(slug==='\/notfound'\)/, 'search engines are asked not to list a wrong address, and only that');
});

// Bryan, 25 Nov 2026: "Yes, your picks" (join J7, one donation setting every room reads), "Same link" (University uses the link
// every other room uses), then "Yes, build it" for the setting in this file with each room's typed address kept as a spare.
const DONATE_SPARES = ['scripts/lib/app.js', 'cards/src/screen.js', 'play/index.html', 'play/src/play.js', 'remote/src/phone.js', 'trivia/src/host.js', 'trivia/src/phone.js'];
const donateLinks = (f) => read(f).match(/https:\/\/square\.link\/u\/\w+/g) || [];
test('H15: one donation setting in the menu file; marked links follow it, the main site marks every one of its links, and every spare a room keeps is the same address', () => {
  const D = load('voidtv.net', '/').donate;
  assert.match(D.url, /^https:\/\/square\.link\/u\/\w+$/);
  assert.match(D.monthly, /^https:\/\/square\.link\/u\/\w+$/);
  assert.notEqual(D.url, D.monthly);
  assert.equal((SRC.match(/square\.link\/u\//g) || []).length, 2, 'the setting is written once in the menu file');
  assert.match(SRC, /querySelectorAll\('a\[data-void-donate\]'\)/);
  assert.match(SRC, /a\.getAttribute\('data-void-donate'\) === 'monthly' \? DONATE\.monthly : DONATE\.url/);
  assert.match(SRC, /notFounds\(\); donates\(\); \}/, 'links a page draws later follow it too');
  for (const f of DONATE_SPARES) {
    const found = donateLinks(f);
    assert.ok(found.length > 0, f + ' keeps a spare');
    for (const u of found) assert.ok(u === D.url || u === D.monthly, f + ': ' + u + ' is not the setting');
  }
  const app = read('scripts/lib/app.js');
  assert.match(app, /const DONATE_URL = 'https:\/\/square\.link\/u\/\w+';\r?\nconst DONATE_MONTHLY_URL = 'https:\/\/square\.link\/u\/\w+';/);
  assert.equal((app.match(/data-void-donate href="/g) || []).length, 6, 'the six links to the donation page are marked');
  assert.equal((app.match(/data-void-donate="monthly" href="/g) || []).length, 2, 'and the two monthly ones');
  assert.doesNotMatch(app, /<a (?![^>]*data-void-donate)[^>]*href="(?:\$\{DONATE(?:_MONTHLY)?_URL\}|'\+DONATE(?:_MONTHLY)?\+')"/, 'no donation link is left unmarked');
});
// Bryan, 25 Nov 2026: "Same link": University's spare is the setting's address, and both of its donation links are marked.
test('H15: University asks through the same donation link as every other room', () => {
  const D = load('voidtv.net', '/').donate;
  const uni = read('profiles/university/build.js');
  const found = donateLinks('profiles/university/build.js');
  assert.ok(found.length > 0, 'University keeps a spare');
  for (const u of found) assert.equal(u, D.url);
  assert.equal((uni.match(/<a data-void-donate href="(?:\$\{DONATE\}|' \+ DONATE \+ ')"/g) || []).length, 2, 'the footer link and the join page link are marked');
  assert.doesNotMatch(uni, /<a (?![^>]*data-void-donate)[^>]*href="(?:\$\{DONATE\}|' \+ DONATE \+ ')"/, 'no donation link is left unmarked');
});
