// Tests for functions/_middleware.js (www redirect, security headers, the gate) and functions/api/e.js (analytics intake checks)
// (audit fix batch B, B3: F-004 CF-025 CF-012 CF-013 CF-003). Run: node --test tests/site-middleware.test.js
// The two Function files are loaded as the modules they are and called with hand-made request objects; no server, no network.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const G = require('../scripts/lib/siteguards');
const load = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);

const nextOk = (body = 'page', status = 200) => { let calls = 0; const next = async () => { calls++; return new Response(body, { status, headers: { 'content-type': 'text/html' } }); }; next.calls = () => calls; return next; };
const hasAllSecurity = (res) => { for (const [k, v] of G.SECURITY_HEADERS) assert.equal(res.headers.get(k), v, k); };

test('www.voidtv.net is sent to voidtv.net with a 301, path and query kept, before the gate and with the headers', async () => {
  const { onRequest } = await load('functions/_middleware.js');
  for (const env of [{}, { SITE_PASSWORD: 'secret' }]) {
    const next = nextOk();
    const res = await onRequest({ request: new Request('https://www.voidtv.net/show/seinfeld?x=1&y=2'), env, next });
    assert.equal(res.status, 301);
    assert.equal(res.headers.get('location'), 'https://voidtv.net/show/seinfeld?x=1&y=2');
    assert.equal(next.calls(), 0, 'the page is never asked for');
    hasAllSecurity(res);
  }
  const root = await onRequest({ request: new Request('https://www.voidtv.net/'), env: {}, next: nextOk() });
  assert.equal(root.headers.get('location'), 'https://voidtv.net/');
  const api = await onRequest({ request: new Request('https://www.voidtv.net/api/e', { method: 'POST', body: '[]' }), env: {}, next: nextOk() });
  assert.equal(api.status, 301);
  const odd = await onRequest({ request: new Request('https://www.voidtv.net//evil.example/x'), env: {}, next: nextOk() });
  assert.ok(odd.headers.get('location').startsWith('https://voidtv.net/'), 'a double slash cannot move the host');
});

test('only the exact www host is redirected', async () => {
  const { onRequest } = await load('functions/_middleware.js');
  for (const u of ['https://voidtv.net/', 'https://voidtvsite.pages.dev/', 'https://www.voidtv.net.evil.example/', 'https://notwww.voidtv.net/']) {
    const next = nextOk();
    const res = await onRequest({ request: new Request(u), env: {}, next });
    assert.equal(res.status, 200, u);
    assert.equal(next.calls(), 1, u);
  }
});

test('gate off (no SITE_PASSWORD at runtime): everything passes through and carries the security headers', async () => {
  const { onRequest } = await load('functions/_middleware.js');
  const next = nextOk('hello');
  const res = await onRequest({ request: new Request('https://voidtv.net/api/e'), env: {}, next });
  assert.equal(res.status, 200); assert.equal(await res.text(), 'hello'); assert.equal(next.calls(), 1);
  hasAllSecurity(res);
  assert.equal(res.headers.get('cache-control'), null, 'only the password page is no-store');
});

test('gate on: no cookie gets the password page (401, no-store, headers); a wrong password stays out; the right one sets the cookie', async () => {
  const { onRequest } = await load('functions/_middleware.js');
  const env = { SITE_PASSWORD: 'Open Sesame' };
  const next = nextOk();
  const page = await onRequest({ request: new Request('https://voidtv.net/'), env, next });
  assert.equal(page.status, 401); assert.equal(next.calls(), 0);
  assert.equal(page.headers.get('cache-control'), 'no-store');
  hasAllSecurity(page);
  const html = await page.text();
  assert.ok(html.includes('type="password"') && html.includes('/assets/brand/promos/promos.json'), 'the gate page and its promos loop still ship');
  const form = (p) => new Request('https://voidtv.net/show/x?y=1', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'p=' + encodeURIComponent(p) });
  const wrong = await onRequest({ request: form('nope'), env, next });
  assert.equal(wrong.status, 401); assert.equal(wrong.headers.get('cache-control'), 'no-store'); hasAllSecurity(wrong);
  assert.ok((await wrong.text()).includes('not it.'));
  const right = await onRequest({ request: form('open  sesame'), env, next }); // capitals and spaces do not matter
  assert.equal(right.status, 303);
  assert.equal(right.headers.get('location'), '/show/x?y=1');
  const cookie = right.headers.get('set-cookie');
  assert.match(cookie, /^voidtv_gate=[0-9a-f]{32}; Path=\/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax; Domain=voidtv\.net$/);
  hasAllSecurity(right);
  const again = await onRequest({ request: new Request('https://voidtv.net/', { headers: { cookie: cookie.split(';')[0] } }), env, next });
  assert.equal(again.status, 200); assert.equal(next.calls(), 1, 'the cookie lets the page through');
  hasAllSecurity(again);
});

test('gate on: the exempt paths still pass (brand assets, version.txt, qr.json, /q/), and still carry the headers', async () => {
  const { onRequest } = await load('functions/_middleware.js');
  for (const p of ['/assets/brand/bg/sign-pink.jpg', '/version.txt', '/qr.json', '/q/abc']) {
    const next = nextOk();
    const res = await onRequest({ request: new Request('https://voidtv.net' + p), env: { SITE_PASSWORD: 'x' }, next });
    assert.equal(res.status, 200, p); assert.equal(next.calls(), 1, p);
    hasAllSecurity(res);
  }
});

test('a response with immutable headers (a redirect from next) is copied and still gets the headers', async () => {
  const { onRequest } = await load('functions/_middleware.js');
  const next = async () => Response.redirect('https://voidtv.net/somewhere', 302);
  const res = await onRequest({ request: new Request('https://voidtv.net/q/abc'), env: {}, next });
  assert.equal(res.status, 302); assert.equal(res.headers.get('location'), 'https://voidtv.net/somewhere');
  hasAllSecurity(res);
});

test('the middleware keeps the same security headers as the build writes into _headers', async () => {
  const src = fs.readFileSync(path.join(ROOT, 'functions', '_middleware.js'), 'utf8');
  for (const [k, v] of G.SECURITY_HEADERS) assert.ok(src.includes(JSON.stringify(k).replace(/"/g, "'")) && (src.includes(`'${v}'`) || src.includes(`"${v}"`)), `${k} in _middleware.js must equal siteguards.js`);
  assert.ok(src.includes(G.CSP), 'the policy text must be identical');
});

test('the gate page still ships its promos loop (another chat owns that code; this only checks it was not lost)', () => {
  const now = fs.readFileSync(path.join(ROOT, 'functions', '_middleware.js'), 'utf8');
  const a = now.indexOf('<script>/* HQ'), b = now.indexOf('</script></body></html>');
  assert.ok(a > 0 && b > a);
  const loop = now.slice(a, b);
  assert.ok(loop.includes("fetch('/assets/brand/promos/promos.json',{cache:'no-cache'})") && loop.includes("v.addEventListener('playing'"));
  assert.ok(loop.includes('data saver') && loop.includes('prefers-reduced-motion'));
});

// ---- the analytics intake ---------------------------------------------------------------------------------------------
const req = (events, headers = {}) => {
  const body = typeof events === 'string' ? events : JSON.stringify(events);
  const h = { 'content-length': String(Buffer.byteLength(body)), 'user-agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0', 'sec-fetch-site': 'same-origin', ...headers };
  for (const k of Object.keys(h)) if (h[k] === null) delete h[k];
  return { headers: { get: (n) => h[n.toLowerCase()] ?? null }, json: async () => JSON.parse(body), cf: { country: 'US', region: 'Ohio', city: 'Columbus', colo: 'ORD', timezone: 'America/New_York' } };
};
const dataset = (impl) => { const points = []; return { points, writeDataPoint: (p) => { if (impl) impl(p); points.push(p); } }; };
const good = { t: 'view', sid: 'abc123def456ghi7', slug: 'seinfeld', ep: '3x12', page: 'show', x: 'drama' };

test('analytics intake: a request must say it comes from this site', async () => {
  const { onRequestPost } = await load('functions/api/e.js');
  for (const [name, h, want] of [['no header (curl)', { 'sec-fetch-site': null }, 403], ['cross-site', { 'sec-fetch-site': 'cross-site' }, 403], ['none', { 'sec-fetch-site': 'none' }, 403], ['same-origin', {}, 204], ['same-site', { 'sec-fetch-site': 'same-site' }, 204]]) {
    const ds = dataset();
    const res = await onRequestPost({ request: req([good], h), env: { VOIDTV_EVENTS: ds } });
    assert.equal(res.status, want, name);
    assert.equal(ds.points.length, want === 204 ? 1 : 0, name);
  }
});

test('analytics intake: size limits, bad JSON and a missing dataset binding', async () => {
  const { onRequestPost } = await load('functions/api/e.js');
  const env = { VOIDTV_EVENTS: dataset() };
  assert.equal((await onRequestPost({ request: req([good], { 'content-length': null }), env })).status, 413);
  assert.equal((await onRequestPost({ request: req([good], { 'content-length': '16385' }), env })).status, 413);
  assert.equal((await onRequestPost({ request: req('not json'), env })).status, 400);
  assert.equal((await onRequestPost({ request: req([good]), env: {} })).status, 204, 'no binding: accepted and dropped');
  assert.equal(env.VOIDTV_EVENTS.points.length, 0);
});

test('analytics intake: events with the wrong shape are dropped, the rest of the batch is kept', async () => {
  const { onRequestPost } = await load('functions/api/e.js');
  const ds = dataset();
  const batch = [
    good,
    { ...good, slug: 'Seinfeld' },                // capital
    { ...good, slug: 'a b' },                     // space
    { ...good, slug: "x'; drop" },                // punctuation
    { ...good, slug: 'p123', ep: '' },            // a person, no episode: fine
    { ...good, ep: '3x' },                        // bad episode
    { ...good, ep: '12345x1' },                   // too many season digits
    { ...good, ep: '<script>' },
    { ...good, page: 'admin' },                   // not a view
    { ...good, page: '' },                        // no view yet: fine
    { ...good, sid: 'has space' },
    { ...good, t: 'evil' },                       // type not allowed
    { ...good, slug: 'a'.repeat(95) },            // two real slugs are longer than 80: cut, still stored
    { ...good, slug: 'a'.repeat(79) + '!' + 'b' },
    null, 'text', 7,
  ];
  const res = await onRequestPost({ request: req(batch), env: { VOIDTV_EVENTS: ds } });
  assert.equal(res.status, 204);
  const slugs = ds.points.map((p) => p.blobs[1]);
  assert.deepEqual(slugs, ['seinfeld', 'p123', 'seinfeld', 'a'.repeat(80)]);
  assert.equal(ds.points.length, 4);
  assert.equal(ds.points[0].blobs[2], '3x12'); assert.equal(ds.points[0].blobs[3], 'show'); assert.equal(ds.points[0].blobs[0], 'view');
  assert.equal(ds.points[1].blobs[2], '');
  assert.equal(ds.points[3].blobs[1].length, 80);
});

test('analytics intake: 25 events at most, numbers are made finite, long text is cut, and a refusing dataset cannot break the answer', async () => {
  const { onRequestPost } = await load('functions/api/e.js');
  const many = Array.from({ length: 30 }, () => ({ ...good, pos: 'Infinity', dur: 12.5, n: 'x', x: 'y'.repeat(210), q: 'q'.repeat(90), ref: 'r'.repeat(90) })); // under the 16 KB body limit, over the 25 event cap
  const ds = dataset();
  await onRequestPost({ request: req(many), env: { VOIDTV_EVENTS: ds } });
  assert.equal(ds.points.length, 25);
  assert.deepEqual(ds.points[0].doubles, [0, 12.5, 0]);
  assert.equal(ds.points[0].blobs[13].length, 200); assert.equal(ds.points[0].blobs[11].length, 80); assert.equal(ds.points[0].blobs[10].length, 80);
  assert.equal(ds.points[0].blobs[4], 'US'); assert.equal(ds.points[0].blobs[7], 'desktop'); assert.equal(ds.points[0].blobs[8], 'chrome'); assert.equal(ds.points[0].blobs[9], 'windows');
  const broken = dataset(() => { throw new Error('dataset refused'); });
  const res = await onRequestPost({ request: req([good, good]), env: { VOIDTV_EVENTS: broken } });
  assert.equal(res.status, 204, 'the page never sees an analytics failure');
});

test('analytics intake: every view name the page can set is accepted', async () => {
  const { onRequestPost } = await load('functions/api/e.js');
  const app = fs.readFileSync(path.join(ROOT, 'scripts', 'lib', 'app.js'), 'utf8');
  const m = /dataset\.view=state\.show\?'(\w+)':state\.view==='(\w+)'\?'(\w+)':state\.view==='(\w+)'\?'(\w+)':state\.view==='(\w+)'\?'(\w+)':any\?'(\w+)':'(\w+)'/.exec(app);
  assert.ok(m, 'the view line in app.js is still the shape this test reads');
  const views = [...new Set(m.slice(1))];
  assert.deepEqual(views.sort(), ['grid', 'home', 'me', 'person', 'show', 'tv']);
  for (const page of [...views, 'about', '']) {
    const ds = dataset();
    await onRequestPost({ request: req([{ ...good, page }]), env: { VOIDTV_EVENTS: ds } });
    assert.equal(ds.points.length, 1, 'view ' + JSON.stringify(page));
  }
});

test('analytics intake: the shapes match what app.js really sends', () => {
  const app = fs.readFileSync(path.join(ROOT, 'scripts', 'lib', 'app.js'), 'utf8');
  assert.ok(app.includes("const epk=se.season+'x'+ep.n") || app.includes("epk=se.season+'x'+ep.n"), 'episodes are season x number');
  assert.ok(app.includes("slug:state.show?state.show.slug:(state.view==='person'?'p'+state.personId:'')"), 'a person is p<id>');
});

test('PLAY engines and cards: a missing one answers 404 and is never cached; real files and other paths pass untouched (20 Nov 2026)', async () => {
  const { onRequest } = await load('functions/_middleware.js');
  const src = fs.readFileSync(path.join(ROOT, 'functions', '_middleware.js'), 'utf8');
  assert.ok(src.includes('const PLAY_STRICT = ' + JSON.stringify(G.PLAY_STRICT).replace(/"/g, "'").replace(/,/g, ', ') + ';'), 'PLAY_STRICT matches siteguards.js');
  for (const p of G.PLAY_STRICT) assert.ok(G.routesFor(false).include.includes(p), p + ' runs the Function once the gate is off');
  const ask = (u, next, env = {}) => onRequest({ request: new Request('https://voidtv.net' + u), env, next });
  for (const u of ['/play/engine/mame/nothing.wasm.gz?v=2', '/play/cards/nothing.json']) {
    const res = await ask(u, nextOk('<!doctype html>home'));
    assert.equal(res.status, 404, u);
    assert.equal(res.headers.get('cache-control'), 'no-store', u);
    assert.equal(res.headers.get('strict-transport-security'), 'max-age=31536000', 'the security headers are still on');
    assert.equal(res.headers.get('cross-origin-embedder-policy'), 'require-corp', 'still isolated');
  }
  const gz = new Uint8Array([0x1f, 0x8b, 8, 0]);
  const real = await ask('/play/engine/mame/williams.wasm.gz?v=2', async () => new Response(gz, { headers: { 'content-type': 'application/gzip' } }));
  assert.equal(real.status, 200);
  assert.deepEqual(new Uint8Array(await real.arrayBuffer()), gz);
  const card = await ask('/play/cards/joust-arcade.json', async () => new Response('{"id":"x"}', { headers: { 'content-type': 'application/json' } }));
  assert.equal(card.status, 200);
  // _headers does not reach an answer through a Function, so the middleware gives the same cache times _headers would.
  const hf = G.headersFile();
  const cacheIn = (rule) => { const lines = hf.split('\n'); const i = lines.indexOf(rule); for (let j = i + 1; j < lines.length && lines[j].startsWith(' '); j++) { const m = /Cache-Control: (.*)$/.exec(lines[j]); if (m) return m[1].trim(); } return null; };
  assert.equal(real.headers.get('cache-control'), cacheIn('/play/engine/*'));
  assert.equal(card.headers.get('cache-control'), cacheIn('/play/cards/*'));
  for (const u of ['/about', '/play/', '/play/game']) assert.equal((await ask(u, nextOk())).status, 200, u + ' keeps the home-page routing');
  const gated = await ask('/play/engine/mame/williams.js', nextOk(), { SITE_PASSWORD: 'secret' });
  assert.equal(gated.status, 401, 'the password page is not turned into a 404');
});

// Card games with phones only (Bryan, 24 Nov 2026: "Allow it, one page"): the host plays from the card hand page in a frame on the
// table page, so that page alone may be framed, by voidtv.net only. With the password gate on, pages come through the Function, so it
// must say what _headers says.
test('the card hand page alone may be framed, and only by voidtv.net: the Function and _headers agree', async () => {
  const { onRequest } = await load('functions/_middleware.js');
  const env = { SITE_PASSWORD: 'secret' };
  const ask = (u) => onRequest({ request: new Request('https://voidtv.net' + u, { headers: { cookie: 'voidtv_gate=x' } }), env, next: nextOk() });
  for (const u of ['/cards/hand', '/cards/hand.html']) {
    const r = await ask(u);
    assert.equal(r.headers.get('X-Frame-Options'), 'SAMEORIGIN', u);
    assert.equal(r.headers.get('Content-Security-Policy-Report-Only'), G.CARDS_HAND_CSP, u + ': the same policy as _headers, with frame-ancestors self');
  }
  for (const u of ['/', '/cards/', '/cards/hand/x', '/join']) assert.equal((await ask(u)).headers.get('X-Frame-Options'), 'DENY', u + ' keeps DENY');
  assert.deepEqual(G.CARDS_HAND, ['/cards/hand', '/cards/hand.html']);
  assert.ok(G.CARDS_HAND_CSP.includes("frame-ancestors 'self'") && !G.CARDS_HAND_CSP.includes("frame-ancestors 'none'"));
  assert.equal(G.CARDS_HAND_CSP, G.CSP.replace("frame-ancestors 'none'", "frame-ancestors 'self'"), 'built from the site policy, so the two never drift');
});
