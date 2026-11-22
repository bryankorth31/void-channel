// A list on the home page has its own address (audit of 20 Nov 2026, A4, the old SP-015).
// Run: node --test tests/app-list.test.js
// Three layers: the two pure functions (scripts/lib/app-list.js), the same text run alone the way the page carries
// it, and the page's own few lines (listUrl, listSync, listFromUrl, typed) lifted out of scripts/lib/app.js and run
// against a stand-in for the browser's address and history.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { listQuery, listRead, listSource } = require('../scripts/lib/app-list');

const BLANK = { moment: '', type: '', tag: '', genre: '', network: '', decade: '', q: '', sort: 'eps' };
const SORTS = ['eps', 'rating', 'year', 'old', 'added', 'az'];

test('no filter gives no query string, and the default sort is not written', () => {
  assert.equal(listQuery(BLANK), '');
  assert.equal(listQuery({}), '');
  assert.equal(listQuery({ q: '   ' }), '');
  assert.equal(listQuery({ ...BLANK, sort: 'az' }), '', 'a sort with no filter is not written: the home address stays plain');
});

test('filters are written in one fixed order, spaces as plus signs', () => {
  assert.equal(listQuery({ ...BLANK, type: 'Classic TV' }), '?type=Classic+TV');
  assert.equal(listQuery({ ...BLANK, decade: '1990s', type: 'Sitcoms', sort: 'az' }), '?type=Sitcoms&decade=1990s&sort=az');
  assert.equal(listQuery({ ...BLANK, q: ' rosanne ' }), '?q=rosanne');
});

test('marks that would break an address are encoded, the apostrophe too', () => {
  const q = listQuery({ ...BLANK, q: "grey's & <b>" });
  assert.equal(q, '?q=grey%27s+%26+%3Cb%3E');
  assert.equal(listRead(q, SORTS).q, "grey's & <b>");
});

test('reading gives every key, and ignores keys the page does not know', () => {
  assert.deepEqual(listRead('', SORTS), BLANK);
  assert.deepEqual(listRead('?dbg=1&s=2&e=3&nocount=1', SORTS), BLANK);
  assert.deepEqual(listRead('?type=Sitcoms&decade=1990s', SORTS), { ...BLANK, type: 'Sitcoms', decade: '1990s' });
});

test('a sort nobody offers falls back to the default, and a long value is cut', () => {
  assert.equal(listRead('?sort=drop+table', SORTS).sort, 'eps');
  assert.equal(listRead('?sort=az', SORTS).sort, 'az');
  assert.equal(listRead('?sort=az').sort, 'eps', 'no list of sorts, no sort');
  assert.equal(listRead('?q=' + 'x'.repeat(500), SORTS).q.length, 80);
});

test('what is written reads back the same (a moment list too: ?moment=christmas)', () => {
  assert.equal(listQuery({ ...BLANK, moment: 'christmas' }), '?moment=christmas');
  for (const st of [BLANK, { ...BLANK, type: 'Late Night' }, { ...BLANK, tag: '90s Sitcoms', genre: 'Comedy', network: 'A&E', decade: '1990s', q: 'law & order', sort: 'old' }, { ...BLANK, moment: 'christmas' }, { ...BLANK, moment: 'christmas', type: 'TV Movies', sort: 'az' }]) {
    assert.deepEqual(listRead(listQuery(st), SORTS), st);
  }
});

test('the inlined text runs alone, and has no line comment after code', () => {
  const ctx = vm.createContext({ URLSearchParams });
  vm.runInContext(listSource, ctx);
  assert.equal(vm.runInContext("listQuery({type:'Classic TV',q:''})", ctx), '?type=Classic+TV');
  assert.equal(vm.runInContext("JSON.stringify(listRead('?tag=Westerns&sort=az',['az']))", ctx), JSON.stringify({ ...BLANK, tag: 'Westerns', sort: 'az' }));
  // The same check scripts/site.js makes on the page script.
  const stripped = (l) => l.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g, '');
  const bad = listSource.split('\n').filter((l) => { const s = stripped(l); return !/^\s*\/\//.test(s) && /[^:]\/\//.test(s); });
  assert.deepEqual(bad, [], 'no line comment after code');
});

// The page itself: the source that scripts/site.js turns into every page.
const APP = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'lib', 'app.js'), 'utf8');
const lineOf = (name) => {
  const at = APP.indexOf('\nfunction ' + name + '(');
  assert.ok(at > 0, 'the page has ' + name + '()');
  return APP.slice(at + 1, APP.indexOf('\n', at + 1));
};

// A stand-in browser: an address, a history that records what it was told, a search box.
function browser(search, routes) {
  const calls = [];
  const box = { value: '' };
  const set = (kind) => (_s, _t, url) => {
    calls.push(kind + ' ' + url);
    const u = new URL(url, 'https://voidtv.net/');
    ctx.location.pathname = u.pathname; ctx.location.search = u.search;
  };
  const ctx = vm.createContext({
    URLSearchParams, ROUTES: routes || 'path', SITE: 'VoidTV', SORTS: SORTS.map((v) => [v, v]), ME: { adult: 0 },
    state: { ...BLANK, show: null, view: '' }, location: { pathname: '/', search: search || '' },
    history: { pushState: set('push'), replaceState: set('replace') }, document: { title: '' },
    $: (id) => (id === 'q' ? box : null), rendered: 0, went: [],
  });
  vm.runInContext(listSource + '\n' + ['listUrl', 'listTitle', 'listSync', 'listFromUrl', 'typed'].map(lineOf).join('\n')
    + '\nfunction render(){rendered++}\nfunction go(s){went.push(s)}', ctx);
  return { ctx, calls, box, run: (code) => vm.runInContext(code, ctx) };
}

test('page: picking a list adds one history entry with its address, and the tab is named for it', () => {
  const b = browser('');
  b.run("state.type='Sitcoms';listSync()");
  assert.deepEqual(b.calls, ['push /?type=Sitcoms']);
  assert.equal(b.ctx.document.title, 'Sitcoms · VoidTV');
  b.run('listSync()');
  assert.equal(b.calls.length, 1, 'the same list again adds nothing');
  b.run("state.type='';listSync()");
  assert.deepEqual(b.calls[1], 'push /', 'clearing goes back to the plain home address');
  assert.equal(b.ctx.document.title, 'VoidTV');
});

test('page: a change of sort replaces the entry instead of adding one', () => {
  const b = browser('?type=Sitcoms');
  b.run("state.type='Sitcoms';state.sort='az';listSync(true)");
  assert.deepEqual(b.calls, ['replace /?type=Sitcoms&sort=az']);
});

test('page: typing adds one entry for the search, then only replaces it', () => {
  const b = browser('');
  b.run("state.q='r';typed()");
  b.run("state.q='ro';typed()");
  b.run("state.q='ros';typed()");
  assert.deepEqual(b.calls, ['push /?q=r', 'replace /?q=ro', 'replace /?q=ros']);
  assert.equal(b.ctx.rendered, 3);
  assert.equal(b.ctx.document.title, 'Search · VoidTV');
});

test('page: typing while a show or a text page is open goes to the list, and leaves that page in history', () => {
  const b = browser('');
  b.run("state.show={slug:'x'};state.q='r';typed()");
  assert.deepEqual(Array.from(b.ctx.went), [''], 'go(\'\') is asked for the list (it adds the entry itself)');
  assert.equal(b.calls.length, 0);
});

test('page: nothing is written to the address while a show or another page is open', () => {
  const b = browser('');
  b.run("state.view='tv';state.type='Sitcoms';listSync()");
  assert.equal(b.calls.length, 0);
});

test('page: an address is read back into the filters and the search box', () => {
  const b = browser('?type=Sitcoms&decade=1990s&q=rose&sort=nope');
  b.run('listFromUrl()');
  const st = b.ctx.state;
  assert.deepEqual([st.type, st.decade, st.q, st.sort, st.tag], ['Sitcoms', '1990s', 'rose', 'eps', '']);
  assert.equal(b.box.value, 'rose');
  const home = browser('');
  home.run("state.type='Sitcoms';state.q='x';listFromUrl()");
  assert.deepEqual([home.ctx.state.type, home.ctx.state.q], ['', ''], 'the plain home address clears them (Back from a list)');
  const kept = browser('');
  kept.run("state.sort='az';listFromUrl()");
  assert.equal(kept.ctx.state.sort, 'az', 'the plain home address leaves the chosen order alone');
  kept.run("state.type='Sitcoms';listSync()");
  assert.deepEqual(kept.calls, ['push /?type=Sitcoms&sort=az'], 'and the next list carries it');
});

test('page: a Late Night address does not open the 18+ list while the door is closed', () => {
  const shut = browser('?type=Late+Night');
  shut.run('listFromUrl()');
  assert.equal(shut.ctx.state.type, '');
  const open = browser('?type=Late+Night');
  open.run('ME.adult=1;listFromUrl()');
  assert.equal(open.ctx.state.type, 'Late Night');
});

test('page: where addresses are hash-style the query still rides in front of the hash', () => {
  const b = browser('', 'hash');
  b.run("location.pathname='/preview/index.html';state.tag='Westerns';listSync()");
  assert.deepEqual(b.calls, ['push /preview/index.html?tag=Westerns#']);
});

test('A4: every way to change the list goes through the address', () => {
  assert.ok(APP.includes('${LIST_SRC}'), 'the page carries listQuery and listRead');
  assert.match(lineOf('pick'), /listSync\(k==='sort'\);render\(\)/, 'the filter menus and the chips');
  assert.match(lineOf('seeAll'), /listSync\(\);render\(\)/, 'See all');
  assert.match(lineOf('fromAddress'), /if\(!s\)listFromUrl\(\);go\(s,true\)/);
  assert.ok(APP.includes("window.addEventListener('popstate',fromAddress);"), 'Back and Forward read the address');
  assert.ok(APP.includes('\nfromAddress();'), 'so does the first load');
  assert.ok(APP.includes('oninput="state.q=this.value;typed()"'), 'the search box');
  assert.ok(APP.includes("if(!slug){state.show=null;history[replace?'replaceState':'pushState'](null,'',listUrl());document.title=listTitle();"), 'going to the list writes its address');
  assert.ok(!/onclick="state\.(type|tag|genre|network|decade|q)\b/.test(APP), 'no control sets a filter behind the address');
  // One swap without a history entry stays, on purpose: "No" at the 18+ door puts the home address in place of the
  // show that was refused, so Back does not land on the door again.
  assert.equal(APP.split("go('',true)").length - 1, 1, 'only the 18+ door swaps a page for the list without a history entry');
});

test('A4: "See all" is a real button, and the end card answers Enter', () => {
  assert.ok(APP.includes('<button type="button" class="all" onclick="seeAll('), 'See all is a button');
  assert.ok(!APP.includes('<span class="all"'), 'and no longer a plain span');
  assert.match(APP, /<div class="card endcard" role="button" tabindex="0" onclick="seeAll\([^"]+\)" onkeydown="if\(event\.key===/);
});
