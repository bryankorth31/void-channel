// R6: the voidtv.net side of the rooms: the site's Function routes to one Durable Object per code, only for this site's
// pages, and the Worker runs the same room core. Run: node --test "play/test/*.test.js"
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '..', '..');
const fn = import(pathToFileURL(path.join(ROOT, 'functions', 'api', 'room', '[[path]].js')).href);

function fakeRooms() {
  const open = new Set(), calls = [];
  const ROOMS = {
    idFromName: (n) => n,
    get: (code) => ({ fetch: async (req) => {
      const u = new URL(typeof req === 'string' ? req : req.url);
      calls.push(code + ' ' + u.pathname + u.search);
      if (u.pathname === '/lookup') return new Response(JSON.stringify(open.has(code) ? { kind: 'pad' } : {}), { status: open.has(code) ? 200 : 404 });
      if (u.pathname === '/open') open.add(code);
      return new Response('ws:' + u.pathname, { status: 200 });
    } }),
  };
  return { ROOMS, open, calls };
}
const ws = (url, origin = 'https://voidtv.net') => new Request(url, { headers: { upgrade: 'websocket', origin } });
const call = async (request, env, p) => (await fn).onRequest({ request, env, params: { path: p } });

test('a screen opens a room with a fresh code; a phone joins by code; the join page looks a room up', async () => {
  const f = fakeRooms();
  const r = await call(ws('https://voidtv.net/api/room/open?kind=pad'), { ROOMS: f.ROOMS }, ['open']);
  assert.equal(await r.text(), 'ws:/open');
  const opened = [...f.open][0];
  assert.equal(f.calls.at(-1), opened + ' /open?code=' + opened + '&kind=pad&origin=https%3A%2F%2Fvoidtv.net');
  assert.equal(await (await call(ws('https://voidtv.net/api/room/' + opened.toLowerCase() + '/join'), { ROOMS: f.ROOMS }, [opened.toLowerCase(), 'join'])).text(), 'ws:/join');
  const look = await call(new Request('https://voidtv.net/api/room/' + opened), { ROOMS: f.ROOMS }, [opened]);
  assert.equal(look.status, 200);
  assert.equal((await call(new Request('https://voidtv.net/api/room/0000'), { ROOMS: f.ROOMS }, ['0000'])).status, 404, 'not a code at all');
});

test('refused: another site, an unknown kind, a plain request where a socket is needed, and a site with no rooms bound', async () => {
  const f = fakeRooms();
  assert.equal((await call(ws('https://voidtv.net/api/room/open?kind=pad', 'https://evil.example'), { ROOMS: f.ROOMS }, ['open'])).status, 403);
  assert.equal((await call(ws('https://voidtv.net/api/room/open?kind=chat'), { ROOMS: f.ROOMS }, ['open'])).status, 400);
  assert.equal((await call(new Request('https://voidtv.net/api/room/open?kind=pad'), { ROOMS: f.ROOMS }, ['open'])).status, 426);
  assert.equal((await call(ws('https://voidtv.net/api/room/open?kind=pad'), {}, ['open'])).status, 503, 'not set up yet says so');
  assert.equal(f.open.size, 0);
});

test('a named guest (University) may open and join lesson rooms only, read their lookup across sites, and nothing else', async () => {
  // Bryan, 21 Nov 2026: "we need to corect the relay door to allow university".
  const kinds = new Map(), calls = [];
  const ROOMS = { idFromName: (n) => n, get: (code) => ({ fetch: async (req) => {
    const u = new URL(typeof req === 'string' ? req : req.url);
    calls.push(code + ' ' + u.pathname + u.search);
    if (u.pathname === '/lookup') return new Response(JSON.stringify(kinds.has(code) ? { kind: kinds.get(code) } : {}), { status: kinds.has(code) ? 200 : 404 });
    if (u.pathname === '/open') kinds.set(code, u.searchParams.get('kind'));
    return new Response('ws:' + u.pathname, { status: 200 });
  } }) };
  const UNI = 'https://university.voidtv.net';
  const opened = await call(ws('https://voidtv.net/api/room/open?kind=lesson', UNI), { ROOMS }, ['open']);
  assert.equal(await opened.text(), 'ws:/open');
  const lesson = [...kinds.keys()][0];
  assert.match(calls.at(-1), /&origin=https%3A%2F%2Funiversity\.voidtv\.net$/, 'the QR leads to the guest\'s own join page');
  assert.equal(await (await call(ws('https://voidtv.net/api/room/' + lesson + '/join', UNI), { ROOMS }, [lesson, 'join'])).text(), 'ws:/join');
  const look = await call(new Request('https://voidtv.net/api/room/' + lesson, { headers: { origin: UNI } }), { ROOMS }, [lesson]);
  assert.equal(look.status, 200); assert.equal(look.headers.get('access-control-allow-origin'), UNI);
  // Not its kinds: it can neither open, join nor look up a pad, remote, trivia or talk room.
  for (const k of ['pad', 'remote', 'trivia', 'talk']) assert.equal((await call(ws('https://voidtv.net/api/room/open?kind=' + k, UNI), { ROOMS }, ['open'])).status, 403, k);
  await call(ws('https://voidtv.net/api/room/open?kind=pad'), { ROOMS }, ['open']);
  const pad = [...kinds.entries()].find(([, k]) => k === 'pad')[0];
  assert.equal((await call(ws('https://voidtv.net/api/room/' + pad + '/join', UNI), { ROOMS }, [pad, 'join'])).status, 403);
  assert.equal((await call(new Request('https://voidtv.net/api/room/' + pad, { headers: { origin: UNI } }), { ROOMS }, [pad])).status, 404);
  // The exact origin only: no other subdomain, no http, no look-alike.
  for (const o of ['https://kids.voidtv.net', 'http://university.voidtv.net', 'https://university.voidtv.net.evil.example', 'https://evil.example'])
    assert.equal((await call(ws('https://voidtv.net/api/room/open?kind=lesson', o), { ROOMS }, ['open'])).status, 403, o);
  // This site's own pages are unchanged: every kind.
  assert.equal(await (await call(ws('https://voidtv.net/api/room/' + lesson + '/join'), { ROOMS }, [lesson, 'join'])).text(), 'ws:/join');
});

test('the Worker runs the shared room core, keeps nothing in storage, and the middleware passes a socket handover untouched', async () => {
  const w = fs.readFileSync(path.join(ROOT, 'play', 'rooms', 'worker', 'worker.js'), 'utf8');
  assert.ok(w.includes("import R from '../room.js';"));
  assert.ok(!/storage\.(put|get)\(/.test(w), 'no room data is written');
  const toml = fs.readFileSync(path.join(ROOT, 'play', 'rooms', 'worker', 'wrangler.toml'), 'utf8');
  assert.match(toml, /name = "voidtv-rooms"/); assert.match(toml, /class_name = "Room"/);
  const mw = await import(pathToFileURL(path.join(ROOT, 'functions', '_middleware.js')).href);
  const res = { status: 101, headers: { set() { throw new Error('touched'); } } };
  const out = await mw.onRequest({ request: new Request('https://voidtv.net/api/room/open'), env: {}, next: async () => res });
  assert.equal(out, res);
});
