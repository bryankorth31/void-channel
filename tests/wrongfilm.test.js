// "Unconfirmed match" and "Not the right film" (fix batch C6). Run: node --test tests/wrongfilm.test.js
// A TV movie the builder matched by name only (state REVIEW) now says so on its page, with a box a viewer can tick. Ticking sends one
// report (type report, q wrongfilm, x = Archive item + a space + file name) and is remembered once per film in the saved blob (voidtv:me,
// key wf). HQ lists the ticks, read only, on the Reports page. This file checks, with the REAL text of the page script, the real intake
// and the real HQ page code: who gets the label and box, the event, once per film, a page without storage, the HQ query and its table,
// and (the last test) that each guard is what makes the checks pass: three deliberate bugs, each one caught.
// The page code is cut out of the built page script and run in a bare vm with a fake page and a fake localStorage that can fail. No browser,
// no network (the HQ test stubs fetch and uses a made-up token), nothing is played.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

const REPO = path.join(__dirname, '..');
const APP = require('../scripts/lib/app');
const SHELL = APP.page({ data: { shows: [], people: {}, links: {}, types: [] }, mode: 'split', routes: 'path', base: '/', meta: { url: 'https://voidtv.net/' } });
const SCRIPT = SHELL.slice(SHELL.lastIndexOf('<script>') + 8, SHELL.lastIndexOf('</script>'));
const NOTE = 'We matched this film by its name on the Internet Archive and could not confirm it is the right one.';

// ---- cutting the real code out of the built page script ---------------------------------------------------------------------
const at = (script, text) => { const i = script.indexOf(text); assert.ok(i >= 0, 'the page script has: ' + text.slice(0, 50)); return i; };
const lineStarting = (script, start) => { const i = at(script, '\n' + start) + 1; return script.slice(i, script.indexOf('\n', i)); };
// One client function: from its first line to the line before the next top-level statement or comment.
function fn(script, name) {
  const lines = script.split('\n');
  const i = lines.findIndex((l) => l.startsWith('function ' + name + '('));
  assert.ok(i >= 0, name + ' is in the page script');
  let j = i + 1;
  while (j < lines.length && !/^(function |async function |let |const |var |\/\/|document\.|window\.|go\()/.test(lines[j])) j++;
  return lines.slice(i, j).join('\n');
}
function program(script) {
  const me0 = at(script, "const ME_KEY='voidtv:me';"), me1 = at(script, '\nmeSync();') + '\nmeSync();'.length;
  const wf0 = at(script, 'const WF_NOTE='), wf1 = at(script, 'function exportMe(');
  return [
    'let VP=null;', lineStarting(script, 'const $=('), lineStarting(script, 'const esc=('), script.slice(me0, me1),
    lineStarting(script, 'const SID=('), lineStarting(script, 'const EV=['), lineStarting(script, 'function dropX('), fn(script, 'track'), fn(script, 'flushEv'),
    script.slice(wf0, wf1), fn(script, 'nowRow'),
    ';globalThis.__t={ME,nowRow,wrongFilm,wfInfo,wfHint,wfKey,flushEv,meSync};',
  ].join('\n');
}

// ---- a fake browser storage that can fail, shared by any number of pages (tabs) ----------------------------------------------
function makeSite(initial) {
  const site = { m: new Map(Object.entries(initial || {})), tabs: [], mode: 'ok', deliver: true };
  // mode: ok | blocked (touching localStorage at all throws, as in some private windows) | unreadable (reads throw) | readonly (writes throw)
  site.storageFor = (owner) => {
    if (site.mode === 'blocked') throw new Error('SecurityError: storage is blocked');
    return {
      get length() { if (site.mode === 'unreadable') throw new Error('blocked'); return site.m.size; },
      key: (i) => { if (site.mode === 'unreadable') throw new Error('blocked'); return [...site.m.keys()][i] ?? null; },
      getItem: (k) => { if (site.mode === 'unreadable') throw new Error('blocked'); return site.m.has(k) ? site.m.get(k) : null; },
      setItem: (k, v) => {
        if (site.mode === 'readonly' || site.mode === 'unreadable') throw new Error('QuotaExceededError');
        site.m.set(k, String(v));
        if (site.deliver) for (const t of site.tabs) if (t !== owner) for (const f of t.listeners.storage) f({ key: k });
      },
      removeItem: (k) => { site.m.delete(k); },
    };
  };
  site.stored = () => JSON.parse(site.m.get('voidtv:me') || 'null');
  return site;
}

// ---- one page: the real code on a fake document ----------------------------------------------------------------------------
function openPage(script, site) {
  const els = {}, beacons = [];
  const owner = { listeners: { storage: [], visibilitychange: [] } };
  const on = (t, f) => { (owner.listeners[t] = owner.listeners[t] || []).push(f); };
  const ctx = {
    window: { addEventListener: on },
    document: { hidden: false, referrer: '', body: { dataset: { view: 'show' } }, addEventListener: on, querySelectorAll: () => [], getElementById: (id) => els[id] || null },
    location: { host: 'voidtv.net' }, navigator: { sendBeacon: (url, blob) => { beacons.push({ url, blob }); return true; } }, Blob, URL,
    fetch: () => Promise.reject(new Error('this test allows no network')), setTimeout: () => 1, clearTimeout() {},
    state: { view: 'show', show: null, se: 0, e: 0 }, render() {}, acts: () => '', BASE: '/',
  };
  Object.defineProperty(ctx, 'localStorage', { get: () => site.storageFor(owner) });
  vm.createContext(ctx);
  vm.runInContext(program(script), ctx);
  site.tabs.push(owner);
  const t = ctx.__t;
  const page = {
    ctx, t, ME: t.ME,
    // open a show on the page: what showView sets before it draws the now-playing row
    open(s, se = 0, e = 0) { ctx.state.show = s; ctx.state.se = se; ctx.state.e = e; els['wf-thanks'] = { textContent: '' }; els['wf-hint'] = { hidden: true }; return page; },
    row(s, ep) { const sh = s || ctx.state.show; return t.nowRow(sh.seasons[ctx.state.se], ep || sh.seasons[ctx.state.se].episodes[ctx.state.e], sh); },
    tick(box) { const b = box || { checked: false }; t.wrongFilm(b); return b; },
    thanks: () => els['wf-thanks'] && els['wf-thanks'].textContent,
    async sent() { t.flushEv(); const bodies = await Promise.all(beacons.splice(0).map((b) => b.blob.text())); return bodies.flatMap((b) => JSON.parse(b)); },
  };
  return page;
}

// ---- catalog-shaped pages --------------------------------------------------------------------------------------------------
const FILE_URL = 'https://archive.org/download/111-gramercy-park/111%20Gramercy%20Park.mp4';
const movie = (over = {}, slug = 'movie-1080498') => ({ show: '111 Gramercy Park', slug, seasons: [{ season: 1, episodes: [{ n: 1, name: '111 Gramercy Park (2003)', state: 'REVIEW', url: FILE_URL, min: 22, item: '111-gramercy-park', ...over }] }], eps: 1 });
const series = (state) => ({ show: 'Some Show', slug: 'some-show', seasons: [{ season: 1, episodes: [{ n: 1, name: 'Pilot', state, url: 'https://archive.org/download/some-item/e1.mp4', min: 22, item: 'some-item' }] }], eps: 1 });
// the row exactly as it was drawn before this change
const legacy = (ep) => '<div class="now"><div><b>S01E01</b> · ' + ep.name + (ep.state === 'REVIEW' ? ' <span class="rv">review</span>' : '') + '</div><button class="btn" onclick="next()">Next episode <i class="ico next"></i></button></div>';
const epOf = (s) => s.seasons[0].episodes[0];

// ---- the real intake, as tests/site-middleware.test.js runs it ------------------------------------------------------------
const toRequest = (events) => {
  const body = JSON.stringify(events);
  const h = { 'content-length': String(Buffer.byteLength(body)), 'user-agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36', 'sec-fetch-site': 'same-origin' };
  return { headers: { get: (n) => h[n.toLowerCase()] ?? null }, json: async () => JSON.parse(body), cf: { country: 'US', region: 'Ohio', city: 'Columbus', colo: 'ORD', timezone: 'America/New_York' } };
};
async function intake(events) {
  const { onRequestPost } = await import(pathToFileURL(path.join(REPO, 'functions', 'api', 'e.js')).href);
  const points = [];
  const res = await onRequestPost({ request: toRequest(events), env: { VOIDTV_EVENTS: { writeDataPoint: (p) => points.push(p) } } });
  assert.equal(res.status, 204);
  return points;
}

// ============================ 1. who gets the label and the box ==========================================================
test('a REVIEW TV movie shows "Unconfirmed match" with the one-line reason, and the "Not the right film" box; the bare "review" chip is gone', () => {
  const page = openPage(SCRIPT, makeSite()).open(movie());
  const html = page.row();
  assert.match(html, />Unconfirmed match</);
  assert.ok(html.includes('title="' + NOTE + '"'), 'the reason is on hover (title)');
  assert.ok(html.includes('<p class="wfhint" id="wf-hint" hidden>' + NOTE + '</p>'), 'and readable on tap (a line that the label opens)');
  assert.match(html, /<span class="rv wfchip" role="button" tabindex="0" aria-expanded="false" aria-controls="wf-hint"/, 'the label keeps the .rv family and is reachable by keyboard');
  assert.match(html, /<input type="checkbox" id="wf-box" onchange="wrongFilm\(this\)"> Not the right film<\/label>/);
  assert.doesNotMatch(html, /<span class="rv">review<\/span>/, 'the bare review chip is replaced');
  assert.doesNotMatch(html, /Thanks, we will check it/, 'nothing is thanked before a tick');
  assert.match(html, /<button class="btn" onclick="next\(\)">Next episode/, 'the Next episode button is still there');
  assert.ok(!html.includes(String.fromCharCode(0x2014)) && !html.includes(String.fromCharCode(0x2013)), 'no long dashes in the copy');
});

test('a LIVE TV movie, a series episode in REVIEW and a LIVE series episode are drawn exactly as before this change', () => {
  const page = openPage(SCRIPT, makeSite());
  for (const s of [movie({ state: 'LIVE' }), series('REVIEW'), series('LIVE'), movie({ state: 'MISSING' }), movie({}, 'movie-not-a-number')]) {
    page.open(s);
    assert.equal(page.row(), legacy(epOf(s)), s.slug + ' ' + epOf(s).state);
  }
  assert.match(openPage(SCRIPT, makeSite()).open(series('REVIEW')).row(), /<span class="rv">review<\/span>/, 'a series episode in review keeps its review chip');
});

test('the label and box fit a 375 px phone: they sit on their own full-width line under the title, and the styles are scoped to the new classes', () => {
  assert.match(SHELL, /\.now \.wf\{flex:1 0 100%;display:flex;flex-wrap:wrap;/);
  assert.match(SHELL, /\.now \.wfchip\{display:inline-block;[^}]*white-space:nowrap\}/);
  assert.match(SHELL, /@media\(hover:none\)\{\.now \.wfbox\{min-height:44px\}/, 'a touch-sized tap target on phones');
  // nothing here restyles the chips series use
  assert.doesNotMatch(SHELL, /(^|[},])\.now \.rv\{/m);
  assert.doesNotMatch(SHELL, /(^|[},])\.rv\{/m);
});

test('the label is a keyboard control: Enter and Space open the reason, other keys do nothing; the label reports open or closed', () => {
  const page = openPage(SCRIPT, makeSite()).open(movie());
  const chip = { v: 'false', setAttribute(k, v) { if (k === 'aria-expanded') this.v = v; } };
  page.t.wfHint(chip);
  assert.equal(chip.v, 'true');
  assert.equal(page.ctx.document.getElementById('wf-hint').hidden, false, 'the line is shown');
  page.t.wfHint(chip);
  assert.equal(chip.v, 'false');
  assert.equal(page.ctx.document.getElementById('wf-hint').hidden, true);
  for (const [key, opens] of [['Enter', true], [' ', true], ['a', false], ['Tab', false]]) {
    let prevented = false;
    page.t.wfKey({ key, preventDefault() { prevented = true; } }, chip);
    assert.equal(prevented, opens, key);
    assert.equal(chip.v, opens ? 'true' : 'false', key);
    if (opens) page.t.wfHint(chip);
  }
});

// ============================ 2. the event ================================================================================
test('ticking the box sends exactly one report with the film, the Archive item and the file name, and the intake keeps every field', async () => {
  const page = openPage(SCRIPT, makeSite()).open(movie());
  const box = page.tick();
  assert.equal(box.checked, true);
  assert.equal(page.thanks(), 'Thanks, we will check it.');
  const events = await page.sent();
  assert.equal(events.length, 1, 'one event, not two');
  const e = events[0];
  assert.deepEqual(Object.keys(e).sort(), ['ep', 'page', 'q', 'sid', 'slug', 't', 'x'], 'no field beyond these: no title, no address, no free text from the viewer');
  assert.equal(e.t, 'report');
  assert.equal(e.q, 'wrongfilm');
  assert.equal(e.slug, 'movie-1080498', 'the film record id (the TMDB id) is in the slug');
  assert.equal(e.ep, '1x1');
  assert.equal(e.x, '111-gramercy-park 111 Gramercy Park.mp4', 'Archive item, a space, the file name decoded from the last part of the address');
  assert.equal(e.page, 'show');
  const [p] = await intake(events);
  assert.equal(p.blobs[0], 'report');
  assert.equal(p.blobs[1], 'movie-1080498');
  assert.equal(p.blobs[2], '1x1');
  assert.equal(p.blobs[11], 'wrongfilm', 'blob12 carries the kind, which is what the HQ query filters on');
  assert.equal(p.blobs[13], e.x, 'blob14 carries item and file name whole');
  assert.deepEqual(p.doubles, [0, 0, 0]);
});

test('caps: the item is never cut, a long file name is cut to fit 200, and the query part of an address is not kept', async () => {
  const longName = 'A Very Long File Name '.repeat(20) + '.mp4';
  const cases = [
    movie({ item: 'item-' + 'i'.repeat(60), url: 'https://archive.org/download/x/' + encodeURIComponent(longName) + '?download=1#frag' }),
    movie({ item: 'j'.repeat(260), url: FILE_URL }),
    movie({ item: 'tv-movie', url: 'https://archive.org/download/tv-movie/100%25%20Real%20%26%20More.mp4' }),
  ];
  const page = openPage(SCRIPT, makeSite());
  for (const s of cases) {
    const w = page.t.wfInfo(s, epOf(s));
    assert.ok(w.x.length <= 200, 'at most 200: ' + w.x.length);
    assert.ok(w.x.startsWith(epOf(s).item.slice(0, 199) + ' '), 'the item comes first and whole (up to 199)');
  }
  assert.equal(page.t.wfInfo(cases[0], epOf(cases[0])).x.length, 200, 'the long name fills the room that is left');
  assert.ok(!/download=1|#frag/.test(page.t.wfInfo(cases[0], epOf(cases[0])).x));
  assert.equal(page.t.wfInfo(cases[2], epOf(cases[2])).x, 'tv-movie 100% Real & More.mp4', 'percent codes are decoded');
  // and the intake stores exactly what the page built
  const evs = [];
  for (const s of cases) { const p = openPage(SCRIPT, makeSite()).open(s); p.tick(); evs.push(...(await p.sent())); }
  const points = await intake(evs);
  assert.equal(points.length, 3, 'the intake dropped none of them');
  points.forEach((pt, i) => assert.equal(pt.blobs[13], evs[i].x, 'stored whole (x is cut at 200 by the intake, and was already within it)'));
});

test('when the data lacks the Archive item or the address, the event still goes with what exists (the space keeps the two apart)', async () => {
  const noItem = openPage(SCRIPT, makeSite()).open(movie({ item: undefined }));
  noItem.tick();
  const noUrl = openPage(SCRIPT, makeSite()).open(movie({ url: undefined }));
  noUrl.tick();
  const neither = openPage(SCRIPT, makeSite()).open(movie({ item: undefined, url: undefined }));
  neither.tick();
  const xs = [(await noItem.sent())[0].x, (await noUrl.sent())[0].x, (await neither.sent())[0].x];
  assert.deepEqual(xs, [' 111 Gramercy Park.mp4', '111-gramercy-park ', ' ']);
  const points = await intake([{ t: 'report', sid: 'abc', slug: 'movie-1', ep: '1x1', page: 'show', q: 'wrongfilm', x: ' ' }]);
  assert.equal(points.length, 1, 'even an event with nothing in x is accepted');
});

test('every real REVIEW movie in the catalog builds an event the intake accepts whole (the data really has an item and an address for all of them)', async (t) => {
  const dir = path.join(REPO, 'catalog', 'movies');
  if (!fs.existsSync(dir)) return t.skip('catalog/movies is not in this checkout');
  const page = openPage(SCRIPT, makeSite());
  const evs = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    const txt = fs.readFileSync(path.join(dir, f), 'utf8');
    if (!txt.includes('"REVIEW"')) continue;
    const m = JSON.parse(txt);
    if (m.state !== 'REVIEW' || !m.file) continue;
    assert.ok(m.file.item && m.file.url, f + ' has an item and an address');
    const w = page.t.wfInfo({ slug: 'movie-' + m.tmdbId }, { state: 'REVIEW', item: m.file.item, url: m.file.url });
    assert.equal(w.id, String(m.tmdbId));
    evs.push({ t: 'report', sid: 'abc', slug: 'movie-' + m.tmdbId, ep: '1x1', page: 'show', q: 'wrongfilm', x: w.x });
  }
  t.diagnostic('REVIEW movies checked: ' + evs.length);
  for (let i = 0; i < evs.length; i += 25) {
    const batch = evs.slice(i, i + 25);
    const points = await intake(batch);
    assert.equal(points.length, batch.length, 'batch at ' + i + ': none dropped');
    points.forEach((pt, k) => { assert.equal(pt.blobs[13], batch[k].x); assert.ok(pt.blobs[13].length <= 200); assert.equal(pt.blobs[1], batch[k].slug); });
  }
});

// ============================ 3. once per film, and a page without storage ================================================
test('once per film per browser: the box stays ticked, a second tick sends nothing, a reload shows it ticked, another film can still be reported', async () => {
  const site = makeSite();
  const page = openPage(SCRIPT, site).open(movie());
  const box = page.tick();
  assert.equal((await page.sent()).length, 1);
  box.checked = false; page.t.wrongFilm(box);                    // the viewer un-ticks, the change handler runs
  assert.equal(box.checked, true, 'the box goes back to ticked: a report is not withdrawn');
  page.tick();
  assert.equal((await page.sent()).length, 0, 'a second tick sends nothing');
  assert.match(page.row(), /<input type="checkbox" id="wf-box" checked onchange/, 'redrawn (next episode, back to the page) it is still ticked');
  assert.match(page.row(), /<span class="wfthanks" id="wf-thanks" role="status">Thanks, we will check it\.<\/span>/);
  const stored = site.stored();
  assert.deepEqual(Object.keys(stored.wf), ['1080498']);
  assert.equal(typeof stored.wf['1080498'], 'number');
  assert.deepEqual([...site.m.keys()].sort(), ['voidtv:me', 'voidtv:sid'], 'the only keys in storage are the two the site already had: the migration that deletes unknown voidtv: keys has nothing new to delete');
  assert.deepEqual(Object.keys(stored).sort(), ['history', 'likes', 'list', 'reports', 'v', 'wf']);
  // a reload (new page on the same storage)
  const again = openPage(SCRIPT, site).open(movie());
  assert.match(again.row(), /id="wf-box" checked/);
  again.tick();
  assert.equal((await again.sent()).length, 0, 'still once after a reload');
  assert.equal(again.thanks(), 'Thanks, we will check it.');
  // a different film is its own report
  const other = openPage(SCRIPT, site).open(movie({}, 'movie-4242'));
  assert.doesNotMatch(other.row(), /checked/);
  other.tick();
  const evs = await other.sent();
  assert.equal(evs.length, 1);
  assert.equal(evs[0].slug, 'movie-4242');
  assert.deepEqual(Object.keys(site.stored().wf).sort(), ['1080498', '4242']);
});

test('a tab that was open before the first tick (no storage event reached it) still sends nothing the second time', async () => {
  const site = makeSite();
  site.deliver = false;
  const a = openPage(SCRIPT, site).open(movie());
  const b = openPage(SCRIPT, site).open(movie());
  a.tick();
  assert.equal((await a.sent()).length, 1);
  b.tick();
  assert.equal((await b.sent()).length, 0, 'tab B reads what tab A saved before it decides');
  assert.equal(b.thanks(), 'Thanks, we will check it.');
});

test('the tick does not hide the film, does not touch Mine or "Wrong file?", and does not touch playback', async () => {
  const site = makeSite();
  const page = openPage(SCRIPT, site).open(movie());
  const before = JSON.stringify({ likes: page.ME.likes, list: page.ME.list, history: page.ME.history, reports: page.ME.reports });
  const state = JSON.stringify(page.ctx.state);
  page.tick();
  assert.equal(JSON.stringify({ likes: page.ME.likes, list: page.ME.list, history: page.ME.history, reports: page.ME.reports }), before);
  assert.equal(JSON.stringify(page.ctx.state), state, 'the page state is as it was: same show, season and episode');
  const code = SCRIPT.slice(SCRIPT.indexOf('function wrongFilm('), SCRIPT.indexOf('function exportMe('));
  assert.doesNotMatch(code, /VP\b|play\(|\.pause|\.src|likes|hidden|history|reports/, 'the function only marks, sends and thanks');
});

for (const [name, mode] of [['localStorage cannot be touched at all', 'blocked'], ['every read and write throws', 'unreadable'], ['writes throw (quota)', 'readonly']]) {
  test('a page without usable storage works fully (' + name + '): no error, one report, one tick per page view', async () => {
    const site = makeSite();
    site.mode = mode;
    let page;
    assert.doesNotThrow(() => { page = openPage(SCRIPT, site).open(movie()); }, 'the page starts');
    assert.match(page.row(), /Unconfirmed match/);
    assert.doesNotThrow(() => page.tick());
    assert.equal(page.thanks(), 'Thanks, we will check it.');
    assert.equal((await page.sent()).length, 1, 'the report goes out');
    assert.doesNotThrow(() => page.tick());
    assert.equal((await page.sent()).length, 0, 'and a second tick in the same page view sends nothing');
    assert.match(page.row(), /id="wf-box" checked/, 'redrawn it is still ticked');
    assert.equal(site.m.size, 0, 'nothing was stored');
    // storage comes back: the tick is saved with the next save and survives a reload
    site.mode = 'ok';
    page.t.meSync();
    assert.deepEqual(Object.keys(site.stored().wf), ['1080498'], 'saved once storage works again');
    const again = openPage(SCRIPT, site).open(movie());
    again.tick();
    assert.equal((await again.sent()).length, 0);
  });
}

// ============================ 4. HQ =======================================================================================
// hq.js keeps its state in HQ_STATE_DIR, read once when it loads: a temporary folder, made before the first load and removed at the end.
let HQ_STATE = null;
function loadHq() {
  if (!HQ_STATE) { HQ_STATE = fs.mkdtempSync(path.join(os.tmpdir(), 'wrongfilm-hq-')); process.env.HQ_STATE_DIR = HQ_STATE; }
  return require(path.join(REPO, 'scripts', 'hq.js'));
}
after(() => { if (HQ_STATE) fs.rmSync(HQ_STATE, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); });
const freePort = () => new Promise((ok, no) => { const s = net.createServer(); s.on('error', no); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
const get = (port, p) => new Promise((ok, no) => {
  const req = http.request({ host: '127.0.0.1', port, path: p, method: 'GET', timeout: 15000, agent: false }, (res) => { let text = ''; res.on('data', (c) => { text += c; }); res.on('end', () => { let json = null; try { json = JSON.parse(text); } catch (e) { /* not json */ } ok({ status: res.statusCode, json, text }); }); });
  req.on('error', no); req.on('timeout', () => req.destroy(new Error('timed out'))); req.end();
});

test('HQ: the wrongfilm query is served by /api/analytics/<name> like the others, asks for the right columns, and an unknown name still fails', async () => {
  const saved = { fetch: global.fetch, account: process.env.CF_ACCOUNT_ID, token: process.env.CF_ANALYTICS_TOKEN };
  process.env.CF_ACCOUNT_ID = 'test-account-id'; process.env.CF_ANALYTICS_TOKEN = 'test-token-not-real';
  const list = JSON.parse(fs.readFileSync(path.join(REPO, 'catalog', 'tvmovies-list.json'), 'utf8')).items;
  const known = list[0], knownTitle = known.title + (known.year ? ' (' + known.year + ')' : '');
  const fake = [{ slug: 'movie-' + known.tmdbId, file: '111-gramercy-park 111 Gramercy Park.mp4', day: '2026-10-18 00:00:00', n: 3 }, { slug: 'movie-999999999', file: 'item-q Q.mp4', day: '2026-10-17 00:00:00', n: 1 }];
  const realRead = fs.readFileSync; let listReads = 0;
  fs.readFileSync = function (p, ...a) { if (/tvmovies-list\.json$/.test(String(p))) listReads++; return realRead.call(this, p, ...a); };
  const calls = [];
  global.fetch = async (url, opts) => { calls.push({ url: String(url), body: String(opts && opts.body), auth: opts && opts.headers && opts.headers.Authorization }); return { ok: true, status: 200, text: async () => JSON.stringify({ data: fake }) }; };
  const hq = loadHq();
  const cfa = require(path.join(REPO, 'scripts', 'lib', 'cfa.js'));
  const srv = await hq.start({ port: await freePort() });
  try {
    const ok = await get(srv.port, '/api/analytics/wrongfilm?days=30');
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.json.rows, [{ ...fake[0], title: knownTitle }, { ...fake[1], title: '' }], 'each row carries the film title from the local catalog by record id; an id the catalog does not have gets an empty title');
    assert.equal(calls.length, 1, 'exactly one call, to the stub');
    for (let i = 0; i < 3; i++) await get(srv.port, '/api/analytics/wrongfilm?days=30');
    assert.equal(listReads, 1, 'the title list is read once for four requests, not once per request');
    calls.length = 1;
    assert.equal(calls[0].url, 'https://api.cloudflare.com/client/v4/accounts/test-account-id/analytics_engine/sql');
    assert.equal(calls[0].auth, 'Bearer test-token-not-real');
    assert.equal(calls[0].body, cfa.REPORTS.wrongfilm(30));
    const bad = await get(srv.port, '/api/analytics/nosuchquery?days=30');
    assert.equal(bad.status, 500);
    assert.match(bad.json.error, /unknown report/);
    assert.equal(calls.length, 1, 'an unknown name asks nobody');
    const reports = await get(srv.port, '/api/analytics/reports?days=30');
    assert.equal(reports.status, 200, 'the older queries are still served');
    assert.equal(calls.length, 2);
    assert.ok(!('title' in reports.json.rows[0]), 'and get no title column');
  } finally {
    fs.readFileSync = realRead;
    await new Promise((done) => { srv.server.close(done); if (srv.server.closeAllConnections) srv.server.closeAllConnections(); });
    global.fetch = saved.fetch;
    for (const [k, v] of [['CF_ACCOUNT_ID', saved.account], ['CF_ANALYTICS_TOKEN', saved.token]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
});

test('HQ: the SQL is read only, one statement, last 30 days by default, clamped, and uses only the words the other queries already use', () => {
  const cfa = require(path.join(REPO, 'scripts', 'lib', 'cfa.js'));
  loadHq();
  assert.equal(typeof cfa.REPORTS.wrongfilm, 'function');
  const sql = cfa.REPORTS.wrongfilm(30);
  assert.match(sql, /^SELECT blob2 AS slug, blob14 AS file, toStartOfInterval\(timestamp, INTERVAL '1' DAY\) AS day, SUM\(_sample_interval\) AS n FROM voidtv_events WHERE /);
  assert.match(sql, /timestamp > NOW\(\) - INTERVAL '30' DAY/);
  assert.match(sql, /blob1 = 'report' AND blob12 = 'wrongfilm'/);
  assert.match(sql, / GROUP BY slug, file, day ORDER BY day DESC LIMIT 3000$/);
  assert.ok(!/;|--|\/\*|\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE)\b/i.test(sql), 'a plain read');
  assert.match(cfa.REPORTS.wrongfilm(0), /INTERVAL '30' DAY/, 'no days given: 30');
  assert.match(cfa.REPORTS.wrongfilm(500), /INTERVAL '90' DAY/, 'at most 90');
  assert.match(cfa.REPORTS.wrongfilm(-5), /INTERVAL '1' DAY AND|INTERVAL '1' DAY /);
  assert.match(cfa.REPORTS.wrongfilm('1; DROP'), /INTERVAL '30' DAY/, 'a days value that is not a number cannot carry text into the query');
  const words = (q) => new Set([...q.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\(/g)].map((m) => m[1]));
  const others = new Set(Object.entries(cfa.REPORTS).filter(([k]) => k !== 'wrongfilm').flatMap(([, f]) => [...words(f(7))]));
  for (const w of words(sql)) assert.ok(others.has(w), w + '() is used by another query in lib/cfa.js, so it is known to work in the Cloudflare SQL');
  // the columns are the ones the intake really writes (blobs are numbered from 1 in SQL, from 0 in the array)
  const h = { t: 'report', sid: 'abc', slug: 'movie-1', ep: '1x1', page: 'show', q: 'wrongfilm', x: 'it file' };
  return intake([h]).then(([p]) => { assert.equal(p.blobs[0], 'report'); assert.equal(p.blobs[1], 'movie-1'); assert.equal(p.blobs[11], 'wrongfilm'); assert.equal(p.blobs[13], 'it file'); });
});

// The HQ page code, cut out of scripts/hq/index.html: the whole Reports page function and the table.
const HQ_HTML = fs.readFileSync(path.join(REPO, 'scripts', 'hq', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
function hqReportsPage(answers) {
  const s0 = HQ_HTML.indexOf('async function reports(m)'), s1 = HQ_HTML.indexOf('\n', HQ_HTML.indexOf('function needToken(')) ;
  assert.ok(s0 > 0 && s1 > s0, 'the Reports page is where this test expects it');
  const lines = HQ_HTML.split('\n');
  const head = [lines.find((l) => l.startsWith('const $=(s,r)=>')), lines.find((l) => l.startsWith('const fmt='))].join('\n');
  const asked = [];
  const ctx = {
    document: { querySelector: () => ({ content: '' }) },
    api: async (p) => { asked.push(p); if (!(p in answers)) throw new Error('unexpected call ' + p); if (answers[p] instanceof Error) throw answers[p]; return answers[p]; },
  };
  vm.createContext(ctx);
  vm.runInContext(head + '\n' + HQ_HTML.slice(s0, s1) + '\n;globalThis.__reports=reports;', ctx);
  return { asked, async draw() { const m = { innerHTML: '' }; await ctx.__reports(m); return m.innerHTML; } };
}
const answersFor = (wfRows, extra = {}) => ({ '/api/analytics/reports?days=30': { rows: [] }, '/api/analytics/errors?days=30': { rows: [] }, '/api/analytics/wrongfilm?days=30': { rows: wfRows }, ...extra });

test('HQ page: the Wrong film reports table adds up the days, sorts by count, links the Archive item and the film, and has nothing that changes anything', async () => {
  const rows = [
    { slug: 'movie-111', file: 'item-a Name A.mp4', day: '2026-10-18 00:00:00', n: 1, title: 'Film A (2001)' },
    { slug: 'movie-222', file: 'item-b Name B.mp4', day: '2026-10-17 00:00:00', n: 2, title: 'Film B (1999)' },
    { slug: 'movie-222', file: 'item-b Name B.mp4', day: '2026-10-19 00:00:00', n: 3, title: 'Film B (1999)' },
    { slug: 'movie-222', file: 'item-b Name B.mp4', day: '2026-10-12 00:00:00', n: 1, title: 'Film B (1999)' },
    { slug: 'movie-333', file: 'item-c Other.mp4', day: '2026-10-19 00:00:00', n: 1 },
    { slug: 'movie-444', file: 'item-x <img src=x onerror=alert(1)> "bad".mp4', day: '2026-10-01', n: 1, title: '<b>Bold</b> & "quoted"' },
    { slug: 'movie-555', file: ' only a file name.mp4', day: '2026-10-02', n: 1 },
    { slug: 'movie-666', file: 'item-d ', day: '2026-10-03', n: 1 },
  ];
  const page = hqReportsPage(answersFor(rows));
  const html = await page.draw();
  assert.deepEqual(page.asked, ['/api/analytics/reports?days=30', '/api/analytics/errors?days=30', '/api/analytics/wrongfilm?days=30']);
  assert.match(html, /<h2>Wrong film reports <small>last 30 days, from viewers ticking "Not the right film"/);
  const tbl = html.slice(html.indexOf('Wrong film reports'), html.indexOf('Playback errors'));
  const trs = tbl.split('<tr>').slice(2);
  const cells = trs.map((tr) => [...tr.matchAll(/<td[^>]*>(.*?)<\/td>/g)].map((m) => m[1].replace(/<[^>]+>/g, '')));
  assert.deepEqual(cells[0], ['Film B (1999)', '222', 'item-b', 'Name B.mp4', '6', '2026-10-19', 'open on voidtv.net'], 'the most reported film first: 2 + 3 + 1 added up, the latest day');
  assert.deepEqual(cells[1].slice(0, 6), ['not in the catalog', '333', 'item-c', 'Other.mp4', '1', '2026-10-19'], 'ties: the newest report first; a film the catalog does not know shows the record id alone');
  assert.deepEqual(cells[2].slice(0, 6), ['Film A (2001)', '111', 'item-a', 'Name A.mp4', '1', '2026-10-18']);
  assert.match(tbl, /<th>title<\/th><th>record id<\/th><th>Archive item<\/th><th>file<\/th><th class="num">reports<\/th><th>last report<\/th>/, 'the columns: title, record id, Archive item, file, count, last report');
  assert.ok(!tbl.includes('<b>Bold</b>') && tbl.includes('&lt;b&gt;Bold&lt;/b&gt; &amp; &quot;quoted&quot;'), 'a title is text, not markup');
  assert.equal(cells.length, 6, 'one row per film and file');
  assert.match(tbl, /<a href="https:\/\/archive\.org\/details\/item-b" target="_blank" rel="noopener">item-b<\/a>/);
  assert.match(tbl, /<a href="https:\/\/voidtv\.net\/show\/movie-222" target="_blank" rel="noopener">open on voidtv\.net<\/a>/);
  assert.ok(!tbl.includes('<img'), 'what a viewer cannot type into a report is escaped anyway');
  assert.match(tbl, /&lt;img src=x onerror=alert\(1\)&gt; &quot;bad&quot;\.mp4/);
  assert.ok(cells.some((c) => c[1] === '555' && c[2] === 'not sent'), 'no Archive item sent: said so');
  assert.ok(cells.some((c) => c[1] === '666' && c[3] === 'not sent'), 'no file name sent: said so');
  assert.doesNotMatch(tbl, /<button|onclick|<input|<form/, 'read only: nothing to press');
  assert.ok(!tbl.includes(String.fromCharCode(0x2014)) && !tbl.includes(String.fromCharCode(0x2013)));
});

test('HQ page: no reports says None, a full 3000 rows says the counts may be low, and an unconnected HQ still shows the setup steps', async () => {
  assert.match(await hqReportsPage(answersFor([])).draw(), /Wrong film reports[\s\S]*<p class="dim">None\.<\/p>[\s\S]*Playback errors/);
  const many = Array.from({ length: 3000 }, (_, i) => ({ slug: 'movie-' + (i % 50), file: 'it f.mp4', day: '2026-10-01', n: 1 }));
  assert.match(await hqReportsPage(answersFor(many)).draw(), /Cut at 3000 rows: the counts above may be low/);
  const off = hqReportsPage({ '/api/analytics/reports?days=30': { unconfigured: true, rows: [] } });
  assert.match(await off.draw(), /Analytics are not connected yet/);
  assert.deepEqual(off.asked, ['/api/analytics/reports?days=30'], 'and nothing else is asked');
});

test('HQ page: a wrongfilm query that fails (it has never run against the live SQL API) says so in one line and the rest of the Reports page still draws', async () => {
  const rows = [{ slug: 'movie-9', file: 'item-z Z.mp4', day: '2026-10-18', n: 1 }];
  const oldReports = { '/api/analytics/reports?days=30': { rows }, '/api/analytics/errors?days=30': { rows: [{ slug: 'some-show', ep: '1x1', file: 'f.mp4', code: 3, n: 2 }] } };
  const failures = [
    new Error('SQL API 400: unable to parse the query ' + 'x'.repeat(400)),    // the Cloudflare SQL API refuses it
    new SyntaxError('Unexpected token < in JSON at position 0'),               // the answer was not JSON
  ];
  for (const err of failures) {
    const html = await hqReportsPage({ ...oldReports, '/api/analytics/wrongfilm?days=30': err }).draw();
    assert.match(html, /<h2>Wrong-file reports/, 'the older list is still there');
    assert.match(html, /<h2>Playback errors/, 'and the errors list');
    assert.match(html, /Could not load wrong film reports\./);
    assert.ok(html.includes(err.message.slice(0, 15)), 'the reason is shown, cut short');
    assert.ok(!html.includes('x'.repeat(200)), 'a long reason is cut to 160 characters');
    assert.doesNotMatch(html, /<table><tr><th>record id/);
  }
  // an answer of the wrong shape (rows is not a list) is the same failure, not a blank page
  const odd = await hqReportsPage({ ...oldReports, '/api/analytics/wrongfilm?days=30': { rows: 5 } }).draw();
  assert.match(odd, /Could not load wrong film reports\./);
  assert.match(odd, /<h2>Playback errors/);
  // and a reason with markup in it is escaped
  const markup = await hqReportsPage({ ...oldReports, '/api/analytics/wrongfilm?days=30': new Error('<img src=x onerror=alert(1)>') }).draw();
  assert.ok(!markup.includes('<img src=x'));
  assert.match(markup, /&lt;img src=x/);
});

test('HQ: the older Wrong-file list leaves the Not the right film reports out, so the two do not mix', () => {
  const cfa = require(path.join(REPO, 'scripts', 'lib', 'cfa.js'));
  const old = cfa.REPORTS.reports(30);
  assert.match(old, /AND blob1 = 'report' AND blob12 != 'wrongfilm' ORDER BY timestamp DESC LIMIT 300$/, 'the filter is one more condition on the existing query');
  assert.match(old, /^SELECT timestamp, blob2 AS slug, blob3 AS ep, blob14 AS file, blob5 AS country, blob8 AS device FROM voidtv_events WHERE /, 'the rest of the query is as it was');
  loadHq();
  assert.match(cfa.REPORTS.wrongfilm(30), /blob12 = 'wrongfilm'/, 'and the new list is exactly what the old one leaves out');
});

// ============================ 5. the checks catch the bugs they are for ====================================================
async function observe(script) {
  const site = makeSite();
  const page = openPage(script, site);
  const has = (html) => /Unconfirmed match|Not the right film/.test(html);
  const out = {
    reviewMovie: has(page.open(movie()).row()),
    liveMovie: has(page.open(movie({ state: 'LIVE' })).row()),
    seriesReview: has(page.open(series('REVIEW')).row()),
    seriesLive: has(page.open(series('LIVE')).row()),
  };
  page.open(movie());
  page.tick(); page.tick();
  out.sentWhenTickedTwice = (await page.sent()).length;
  return out;
}
const GOOD = { reviewMovie: true, liveMovie: false, seriesReview: false, seriesLive: false, sentWhenTickedTwice: 1 };

test('deliberate bugs: break the REVIEW-only rule, the movie-only rule or the once-per-film guard and the checks above fail', async () => {
  assert.deepEqual(await observe(SCRIPT), GOOD, 'the real code is right');
  const mutate = (from, to) => { assert.ok(SCRIPT.includes(from), 'the text to break is in the page script: ' + from); return SCRIPT.replace(from, to); };
  // 1. the REVIEW-only rule dropped: a LIVE movie would be labelled (here: given the box) as if nobody had confirmed it
  const noReview = await observe(mutate("const m=s&&ep&&ep.state==='REVIEW'?/^movie-", 'const m=s&&ep&&true?/^movie-'));
  assert.equal(noReview.liveMovie, true, 'bug 1 shows: a LIVE movie gets the box');
  assert.notDeepEqual(noReview, GOOD);
  // 2. the movie-only rule dropped: every series episode in review would be called an unconfirmed film
  const noMovie = await observe(mutate("/^movie-([0-9]{1,9})$/.exec(s.slug||'')", "/^([a-z0-9-]+)$/.exec(s.slug||'')"));
  assert.equal(noMovie.seriesReview, true, 'bug 2 shows: a series episode gets the label and box');
  assert.notDeepEqual(noMovie, GOOD);
  // 3. the once-per-film guard dropped: a second tick would send a second report
  const noOnce = await observe(mutate('if(!wfDone(w.id)){', 'if(true){'));
  assert.equal(noOnce.sentWhenTickedTwice, 2, 'bug 3 shows: two ticks, two reports');
  assert.notDeepEqual(noOnce, GOOD);
});
