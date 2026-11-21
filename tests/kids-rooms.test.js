// Tests for workers/kids/rooms.js, kids.voidtv.net's door to the phone rooms (Watch and Talk, T5).
// The door is called with hand-made requests and a stand-in for the ROOMS Durable Object binding.
// Run: node --test tests/kids-rooms.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const load = () => import(pathToFileURL(path.join(__dirname, '..', 'workers', 'kids', 'rooms.js')).href);
const KIDS = 'https://kids.voidtv.net';
const ws = (p, origin = KIDS) => new Request(KIDS + p, { headers: { Upgrade: 'websocket', origin } });

// A stand-in for the rooms: open rooms by code and kind; every request a room gets is written down.
function roomsBinding(open = {}) {
  const asked = [];
  return {
    asked,
    idFromName: (code) => code,
    get: (code) => ({
      fetch: async (r) => {
        const u = new URL(typeof r === 'string' ? r : r.url);
        asked.push(code + ' ' + u.pathname + u.search);
        if (u.pathname === '/lookup') return open[code] ? new Response(JSON.stringify({ kind: open[code] }), { status: 200 }) : new Response('{}', { status: 404 });
        return new Response('room ' + u.pathname, { status: 200 });
      },
    }),
  };
}

test('a kids page opens a talk room: a fresh code, on the kids origin', async () => {
  const { rooms } = await load(); const R = roomsBinding();
  const res = await rooms(ws('/api/room/open?kind=talk'), { ROOMS: R });
  assert.equal(await res.text(), 'room /open');
  const opened = R.asked.find((a) => a.includes('/open'));
  assert.match(opened, /^[2-9A-Z]{4} \/open\?code=[2-9A-Z]{4}&kind=talk&origin=https%3A%2F%2Fkids\.voidtv\.net$/);
});

test('no other kind of room opens from Kids: no game pad, trivia, lesson or remote', async () => {
  const { rooms } = await load(); const R = roomsBinding();
  for (const kind of ['pad', 'trivia', 'lesson', 'remote', '']) {
    const res = await rooms(ws('/api/room/open?kind=' + kind), { ROOMS: R });
    assert.equal(res.status, 400, kind);
  }
  assert.deepEqual(R.asked, [], 'no room was asked anything');
});

test('a phone joins a talk room with its seat token; a code for any other kind of room is not found', async () => {
  const { rooms } = await load(); const R = roomsBinding({ K7P4: 'talk', TRV2: 'trivia' });
  const ok = await rooms(ws('/api/room/k7p4/join?t=abcdefghijklmnop1234'), { ROOMS: R });
  assert.equal(await ok.text(), 'room /join');
  assert.ok(R.asked.includes('K7P4 /join?t=abcdefghijklmnop1234'));
  const no = await rooms(ws('/api/room/TRV2/join'), { ROOMS: R });
  assert.equal(no.status, 404);
  assert.ok(!R.asked.some((a) => a.startsWith('TRV2 /join')), 'never joined');
  const none = await rooms(ws('/api/room/ZZZZ/join'), { ROOMS: R });
  assert.equal(none.status, 404, 'no such room');
});

test('the lookup tells only of talk rooms', async () => {
  const { rooms } = await load(); const R = roomsBinding({ K7P4: 'talk', PAD3: 'pad' });
  const talk = await rooms(new Request(KIDS + '/api/room/K7P4'), { ROOMS: R });
  assert.equal(talk.status, 200);
  assert.deepEqual(await talk.json(), { kind: 'talk' });
  assert.equal((await rooms(new Request(KIDS + '/api/room/PAD3'), { ROOMS: R })).status, 404);
  assert.equal((await rooms(new Request(KIDS + '/api/room/not-a-code'), { ROOMS: R })).status, 404);
});

test('only pages of kids.voidtv.net may open or join, and only by WebSocket', async () => {
  const { rooms } = await load(); const R = roomsBinding({ K7P4: 'talk' });
  for (const origin of ['https://voidtv.net', 'https://example.com', '']) {
    assert.equal((await rooms(ws('/api/room/open?kind=talk', origin), { ROOMS: R })).status, 403, origin || 'no origin');
    assert.equal((await rooms(ws('/api/room/K7P4/join', origin), { ROOMS: R })).status, 403, origin || 'no origin');
  }
  assert.equal((await rooms(new Request(KIDS + '/api/room/open?kind=talk'), { ROOMS: R })).status, 426);
  assert.ok(!R.asked.some((a) => a.includes('/open') || a.includes('/join')));
});

test('the same tablet takes its waiting talk room back with the room key; a key for another kind of room does not', async () => {
  const { rooms } = await load(); const R = roomsBinding({ K7P4: 'talk', PAD3: 'pad' });
  const key = 'k'.repeat(24);
  const back = await rooms(ws('/api/room/open?kind=talk&code=K7P4&key=' + key), { ROOMS: R });
  assert.equal(await back.text(), 'room /open');
  assert.ok(R.asked.includes('K7P4 /open?code=K7P4&kind=talk&key=' + key));
  const pad = await rooms(ws('/api/room/open?kind=talk&code=PAD3&key=' + key), { ROOMS: R });
  assert.equal(pad.status, 404);
});

test('with no rooms binding the door says so plainly', async () => {
  const { rooms } = await load();
  const res = await rooms(ws('/api/room/open?kind=talk'), {});
  assert.equal(res.status, 503);
});

test("the code alphabet is the relay's own (play/rooms/room.js in void-channel, when it sits beside this folder)", async (t) => {
  const { ALPHABET } = await load();
  const relay = path.join(__dirname, '..', '..', 'void-channel', 'play', 'rooms', 'room.js');
  if (!fs.existsSync(relay)) { t.skip('void-channel is not beside void-kids here'); return; }
  assert.equal(ALPHABET, require(relay).ALPHABET);
});

test('through the kids Worker: room addresses reach the door before the page middleware; other /api/ addresses answer as before', async () => {
  const W = (await import(pathToFileURL(path.join(__dirname, '..', 'workers', 'kids', 'worker.js')).href)).default;
  const R = roomsBinding({ K7P4: 'talk' });
  const A = { fetch: async (r) => new Response('file ' + new URL(r.url).pathname, { status: 200, headers: { 'content-type': 'text/html' } }) };
  const look = await W.fetch(new Request(KIDS + '/api/room/K7P4'), { ASSETS: A, ROOMS: R });
  assert.equal(look.status, 200);
  assert.deepEqual(await look.json(), { kind: 'talk' });
  const join = await W.fetch(ws('/api/room/K7P4/join'), { ASSETS: A, ROOMS: R });
  assert.equal(await join.text(), 'room /join', 'the room answer comes back as the room gave it');
  const pad = await W.fetch(ws('/api/room/open?kind=pad'), { ASSETS: A, ROOMS: R });
  assert.equal(pad.status, 400);
  const other = await W.fetch(new Request(KIDS + '/api/something'), { ASSETS: A, ROOMS: R });
  assert.equal(other.status, 204, 'other /api/ paths unchanged');
  const page = await W.fetch(new Request(KIDS + '/'), { ASSETS: A, ROOMS: R });
  assert.match(page.headers.get('cache-control') || '', /no-transform/, 'pages still get noBeacon');
});
