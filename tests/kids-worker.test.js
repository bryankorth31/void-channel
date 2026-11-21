// Tests for workers/kids/worker.js, the open kids site at kids.voidtv.net (Bryan, 17 Nov 2026: no password anymore).
// The Worker is loaded as the module it is and called with hand-made requests and a stand-in for the ASSETS binding.
// Run: node --test tests/kids-worker.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const load = () => import(pathToFileURL(path.join(__dirname, '..', 'workers', 'kids', 'worker.js')).href).then((m) => m.default);
const assets = () => { const asked = []; return { asked, fetch: async (req) => { asked.push(new URL(req.url).pathname); return new Response('file ' + new URL(req.url).pathname, { status: 200, headers: { 'content-type': 'text/html' } }); } }; };
const req = (p, o = {}) => new Request('https://kids.voidtv.net' + p, o);

test('every page, game and data file is served with no password, carrying the kids policy, open to search engines', async () => {
  const W = await load(); const A = assets();
  for (const p of ['/', '/village/', '/play/', '/show/arthur/', '/data/breaks.json', '/assets/kids/voice/x-a.mp3']) {
    const res = await W.fetch(req(p), { ASSETS: A });
    assert.equal(res.status, 200, p);
    assert.equal(await res.text(), 'file ' + p);
    assert.equal(res.headers.get('x-robots-tag'), null, p + ': no noindex');
    assert.equal(res.headers.get('x-frame-options'), 'DENY', p);
    assert.match(res.headers.get('content-security-policy-report-only'), /img-src 'self' data:;/, p + ': the kids policy, no TMDB or Sentry');
  }
});

test('a password left on the Worker by mistake does not bring the gate back', async () => {
  const W = await load(); const A = assets();
  const res = await W.fetch(req('/village/'), { ASSETS: A, SITE_PASSWORD: 'left over' });
  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'file /village/');
  assert.equal(res.headers.get('set-cookie'), null, 'no cookie is ever set');
});

test('robots.txt is served from the build', async () => {
  const W = await load(); const A = assets();
  const res = await W.fetch(req('/robots.txt'), { ASSETS: A });
  assert.equal(await res.text(), 'file /robots.txt');
});

// Since 18 Nov 2026 the kids Worker keeps counts (which show and episode, how many times) and nothing else.
test('analytics keep counts only, refuse requests from scripts, and the copied Pages files and QR codes are not served', async () => {
  const W = await load(); const A = assets(); const points = [];
  const env = { ASSETS: A, VOIDTV_EVENTS: { writeDataPoint: (d) => points.push(d) } };
  const body = JSON.stringify([{ t: 'play', slug: 'arthur', ep: '1x2', sid: 'abc', dev: 'phone' }]);
  const e = await W.fetch(req('/api/e', { method: 'POST', body, headers: { 'sec-fetch-site': 'same-origin', 'content-length': String(body.length) } }), env);
  assert.equal(e.status, 204);
  assert.deepEqual(points, [{ indexes: ['arthur'], blobs: ['play', 'arthur', '1x2', 'kids'], doubles: [1] }], 'the show, the episode and nothing about the child or device');
  const bot = await W.fetch(req('/api/e', { method: 'POST', body, headers: { 'content-length': String(body.length) } }), env);
  assert.equal(bot.status, 403);
  assert.equal(points.length, 1);
  for (const p of ['/functions/_middleware.js', '/functions/api/e.js', '/_routes.json', '/q/abc', '/qr.json']) {
    const res = await W.fetch(req(p), { ASSETS: A });
    assert.equal(res.status, 404, p);
  }
  assert.deepEqual(A.asked, []);
});

test('every kids HTML page is marked no-transform, so Cloudflare adds no page-view beacon to it (the PLAY auditor, 21 Nov 2026)', async () => {
  const W = await load(); const A = assets();
  for (const p of ['/', '/play/', '/games/', '/games/game.html']) {
    const res = await W.fetch(req(p), { ASSETS: A });
    assert.match(res.headers.get('cache-control') || '', /no-transform/, p);
  }
  const json = { fetch: async () => new Response('{}', { headers: { 'content-type': 'application/json' } }) };
  const res = await W.fetch(req('/data/breaks.json'), { ASSETS: json });
  assert.doesNotMatch(res.headers.get('cache-control') || '', /no-transform/, 'only HTML needs it');
});
