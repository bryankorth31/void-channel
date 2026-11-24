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

test("a phone link with a code the codes never use is told there is no such room, the way a room that is not open tells it: the socket is taken and closed with 4404 (the Voidverse function test's F6, 24 Nov 2026; Bryan: \"Yes, fix it\")", async () => {
  // Before: the door answered that join with a plain 404. A phone page reads that as a line that dropped, so the pad,
  // the Trivia phone and the Cards hand said "Reconnecting" and tried again for good. They all show their own
  // "no room" words on a 4404 close. Node has no WebSocketPair and its Response refuses 101, so both are stood in for.
  const f = fakeRooms(), had = { pair: global.WebSocketPair, response: global.Response }, made = [];
  const side = () => ({ accepted: false, closed: null, accept() { this.accepted = true; }, close(code, why) { this.closed = [code, why]; } });
  global.WebSocketPair = function () { const p = [side(), side()]; made.push(p); return p; };
  global.Response = class extends had.response { constructor(body, init) { if (init && init.status === 101) return { status: 101, webSocket: init.webSocket }; super(body, init); } };
  try {
    // A letter the codes never use (Z, B, S, O, I, L, 0, 1), too short, too long, or not letters at all.
    for (const bad of ['ZZZZ', 'ABCD', 'kx7s', 'KX7', 'KX7PQ', 'KX-7']) {
      const r = await call(ws('https://voidtv.net/api/room/' + bad + '/join'), { ROOMS: f.ROOMS }, [bad, 'join']);
      const pair = made.at(-1);
      assert.equal(r.status, 101, bad + ': the socket is taken, not refused');
      assert.equal(r.webSocket, pair[0], bad + ': the phone gets its end of it');
      assert.equal(pair[1].accepted, true, bad);
      assert.deepEqual(pair[1].closed, [4404, 'No room by that code'], bad + ': closed as a room that is not open is');
    }
    assert.equal(made.length, 6);
    assert.deepEqual(f.calls, [], 'no room is asked about a code that cannot be one');
    // What was refused before is refused still, before any socket is taken.
    assert.equal((await call(ws('https://voidtv.net/api/room/ZZZZ/join', 'https://evil.example'), { ROOMS: f.ROOMS }, ['ZZZZ', 'join'])).status, 403, 'another site');
    assert.equal((await call(new Request('https://voidtv.net/api/room/ZZZZ/join'), { ROOMS: f.ROOMS }, ['ZZZZ', 'join'])).status, 426, 'a plain request where a socket is needed');
    assert.equal((await call(ws('https://voidtv.net/api/room/ZZZZ/join'), {}, ['ZZZZ', 'join'])).status, 503, 'a site with no rooms bound');
    assert.equal(made.length, 6, 'none of those took a socket');
    // The join page's own question about such a code is a plain 404, as before: it is not a socket.
    assert.equal((await call(new Request('https://voidtv.net/api/room/ZZZZ'), { ROOMS: f.ROOMS }, ['ZZZZ'])).status, 404);
    // A code that can be one still goes to its room, which answers for itself.
    assert.equal(await (await call(ws('https://voidtv.net/api/room/KX7P/join'), { ROOMS: f.ROOMS }, ['KX7P', 'join'])).text(), 'ws:/join');
    assert.deepEqual(f.calls, ['KX7P /join?t=']);
  } finally {
    if (had.pair === undefined) delete global.WebSocketPair; else global.WebSocketPair = had.pair;
    global.Response = had.response;
  }
  // The same answer everywhere a phone can join: the Worker's room, the local server, and now the site's door.
  const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
  assert.ok(read('functions', 'api', 'room', '[[path]].js').includes("pair[1].accept(); pair[1].close(R.CLOSE.noRoom, 'No room by that code');\n      return new Response(null, { status: 101, webSocket: pair[0] });"));
  assert.ok(read('play', 'rooms', 'worker', 'worker.js').includes("close(server, R.CLOSE.noRoom, 'No room by that code'); return new Response(null, { status: 101, webSocket: client });"));
  assert.ok(read('play', 'rooms', 'local.js').includes("if (!room || !room.open) { conn.close(R.CLOSE.noRoom, 'No room by that code'); return; }"));
  assert.equal(require('../rooms/room.js').CLOSE.noRoom, 4404);
  // And every phone page shows its own words for that close, where any other end is a line that dropped.
  assert.ok(read('play', 'src', 'phonepad.js').includes("if (e.code === 4404) { note('No room with that code',"));
  assert.ok(read('trivia', 'src', 'phone.js').includes("if (e.code === 4404) { note('No game with that code',"), 'the Trivia phone');
  assert.ok(read('cards', 'src', 'hand.js').includes("if (e.code === 4404) return stop('No game with that code',"), 'the Cards hand');
  // The Trivia phone lets any four letters and digits through to the door (Z among them), and the pad sends whatever
  // its link holds, so the door must answer well. The Cards hand has since learned to refuse such a code itself, before
  // it connects (the Card games chat, 901053ddc, the same day); that guard and this door do not get in each other's way.
  assert.ok(read('trivia', 'src', 'phone.js').includes('if (!/^[2-9A-Z]{4}$/.test(code))'), 'the Trivia phone');
});
