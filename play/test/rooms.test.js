// Rooms (phone controllers and Trivia Nights; Bryan, 20 Nov 2026: "Yes, phone controllers"): the relay core passes
// messages between one screen and its phones, keeps nothing, and holds to its limits. Run: node --test "play/test/*.test.js"
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../rooms/room.js');

function harness(kind = 'pad') {
  let clock = 1000000;
  const sent = new Map(), closed = new Map();
  const room = R.createRoom({ code: 'KX7P', kind, now: () => clock,
    send: (s, t) => { if (!sent.has(s)) sent.set(s, []); sent.get(s).push(JSON.parse(t)); },
    close: (s, code) => closed.set(s, code) });
  return { room, sent: (s) => sent.get(s) || [], closed, advance: (ms) => { clock += ms; } };
}

test('codes are four easy-to-read characters, and only a real code passes', () => {
  let i = 0; const seq = [0, 0.5, 0.99, 0.25];
  const c = R.makeCode(() => seq[i++ % 4]);
  assert.equal(c.length, 4);
  assert.equal(R.normCode(' kx7p '), 'KX7P');
  for (const bad of ['KX7', 'KX7PP', 'KXOP', 'KX1P', 'KXSP', '', null, '<scr']) assert.equal(R.normCode(bad), null, String(bad));
  for (const x of '0O1ILBSZ') assert.ok(!R.ALPHABET.includes(x), x);
});

test('a screen opens the room; phones get the lowest free seat; the screen hears joins and leaves', () => {
  const h = harness();
  assert.equal(h.room.addPhone('early'), null, 'no phone before the screen');
  assert.equal(h.closed.get('early'), R.CLOSE.noRoom);
  assert.ok(h.room.addHost('tv', 'https://voidtv.net'));
  assert.deepEqual(h.sent('tv')[0], { type: 'room', code: 'KX7P', kind: 'pad', join: 'https://voidtv.net/join?r=KX7P' });
  assert.equal(h.room.addPhone('a'), 1);
  assert.equal(h.room.addPhone('b'), 2);
  assert.deepEqual(h.sent('a')[0], { type: 'hello', seat: 1, kind: 'pad' });
  h.room.drop('a');
  assert.equal(h.room.addPhone('c'), 1, 'a seat let go is given out again');
  assert.deepEqual(h.sent('tv').slice(1), [{ type: 'join', from: 1 }, { type: 'join', from: 2 }, { type: 'leave', from: 1 }, { type: 'join', from: 1 }]);
  assert.equal(h.room.addHost('tv2'), false, 'one screen a room');
});

test('messages: a phone reaches the screen with its seat; the screen reaches one phone or all; nothing else is read', () => {
  const h = harness('trivia');
  h.room.addHost('tv'); h.room.addPhone('a'); h.room.addPhone('b');
  h.room.message('a', JSON.stringify({ type: 'a', pick: 2 }));
  assert.deepEqual(h.sent('tv').at(-1), { from: 1, msg: { type: 'a', pick: 2 } });
  h.room.message('tv', JSON.stringify({ to: 2, msg: { type: 'q', n: 1 } }));
  assert.deepEqual(h.sent('b').at(-1), { type: 'q', n: 1 });
  assert.equal(h.sent('a').length, 1, 'only seat 2 got it');
  h.room.message('tv', JSON.stringify({ to: 'all', msg: { type: 'end' } }));
  assert.deepEqual(h.sent('a').at(-1), { type: 'end' });
  const before = h.sent('tv').length;
  h.room.message('a', 'not json'); h.room.message('stranger', JSON.stringify({ x: 1 }));
  assert.equal(h.sent('tv').length, before, 'junk and strangers are ignored');
});

test('limits: 16 phones, 60 messages a second a phone, 1 KB a message', () => {
  const h = harness();
  h.room.addHost('tv');
  for (let i = 0; i < 16; i++) assert.ok(h.room.addPhone('p' + i));
  assert.equal(h.room.addPhone('p16'), null);
  assert.equal(h.closed.get('p16'), R.CLOSE.full);
  const before = h.sent('tv').length;
  for (let i = 0; i < 100; i++) h.room.message('p0', '{"type":"press"}');
  assert.equal(h.sent('tv').length - before, 60);
  h.advance(1000); h.room.message('p0', '{"type":"press"}');
  assert.equal(h.sent('tv').length - before, 61, 'a new second, a new allowance');
  h.room.message('p1', JSON.stringify({ t: 'x'.repeat(2000) }));
  assert.equal(h.closed.get('p1'), R.CLOSE.tooBig);
});

test('the room ends with its screen, after 30 idle minutes, or after 4 hours', () => {
  const h = harness();
  h.room.addHost('tv'); h.room.addPhone('a');
  assert.equal(h.room.drop('tv'), 'ended');
  assert.deepEqual(h.sent('a').at(-1), { type: 'host-gone' });
  assert.equal(h.closed.get('a'), R.CLOSE.hostGone);
  assert.equal(h.room.open, false);
  const g = harness();
  g.room.addHost('tv'); g.advance(29 * 60 * 1000); assert.equal(g.room.tick(), null);
  g.advance(2 * 60 * 1000); assert.equal(g.room.tick(), 'ended');
  const k = harness();
  k.room.addHost('tv'); k.room.addPhone('a');
  for (let m = 0; m < 5 * 60; m += 10) { k.advance(10 * 60 * 1000); k.room.message('a', '{}'); if (k.room.tick()) break; }
  assert.equal(k.room.open, false, 'even a busy room ends at 4 hours');
});

test('R2: the local server runs rooms over real WebSockets: open, join, both ways, lookup, the screen leaving, and no other site', async () => {
  const { spawn } = require('child_process');
  const path = require('path');
  const port = 8795 + Math.floor(Math.random() * 100);
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'serve.js'), String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await new Promise((ok) => srv.stdout.once('data', ok));
    const base = 'ws://127.0.0.1:' + port, origin = 'http://127.0.0.1:' + port;
    const open = (url, o = origin) => new Promise((ok, no) => {
      const ws = new WebSocket(url, { headers: { origin: o } });
      const q = []; let wake = null;
      ws.onmessage = (e) => { q.push(JSON.parse(e.data)); if (wake) { wake(); wake = null; } };
      ws.next = async () => { while (!q.length) await new Promise((w) => { wake = w; }); return q.shift(); };
      ws.onopen = () => ok(ws); ws.onerror = () => no(new Error('refused'));
      ws.closed = new Promise((c) => { ws.onclose = (e) => c(e.code); });
    });
    const tv = await open(base + '/api/room/open?kind=pad');
    const room = await tv.next();
    assert.equal(room.type, 'room'); assert.equal(R.normCode(room.code), room.code);
    assert.equal(room.join, origin + '/join?r=' + room.code);
    const look = await fetch('http://127.0.0.1:' + port + '/api/room/' + room.code.toLowerCase());
    assert.deepEqual(await look.json(), { kind: 'pad' });
    assert.equal((await fetch('http://127.0.0.1:' + port + '/api/room/2222')).status, 404);
    const phone = await open(base + '/api/room/' + room.code + '/join');
    assert.deepEqual(await phone.next(), { type: 'hello', seat: 1, kind: 'pad' });
    assert.deepEqual(await tv.next(), { type: 'join', from: 1 });
    phone.send(JSON.stringify({ type: 'press', key: 'P1:A', down: true }));
    assert.deepEqual(await tv.next(), { from: 1, msg: { type: 'press', key: 'P1:A', down: true } });
    tv.send(JSON.stringify({ to: 1, msg: { type: 'pong', t: 5 } }));
    assert.deepEqual(await phone.next(), { type: 'pong', t: 5 });
    await assert.rejects(open(base + '/api/room/' + room.code + '/join', 'https://evil.example'), 'another site cannot join');
    tv.close();
    assert.deepEqual(await phone.next(), { type: 'host-gone' });
    assert.equal(await phone.closed, R.CLOSE.hostGone);
    const late = await open(base + '/api/room/' + room.code + '/join');
    assert.equal(await late.closed, R.CLOSE.noRoom, 'the room is gone with its screen');
  } finally { srv.kill(); }
});

test('R5: the QR maker writes codes an independent reader (OpenCV) decodes, from a short join address up to version 10', (t) => {
  const { execFileSync } = require('child_process');
  const fs = require('fs'), os = require('os'), path = require('path');
  const Q = require('../rooms/qr.js');
  const PY = process.env.PLAY_PYTHON || 'C:/Users/bryan/AppData/Local/Programs/Python/Python312/python.exe';
  try { execFileSync(PY, ['-I', '-c', 'import cv2, numpy'], { stdio: 'ignore' }); } catch (e) { t.skip('no Python with OpenCV here'); return; }
  const texts = ['https://voidtv.net/join?r=KX7P', 'A', 'https://voidtv.net/join?r=KX7P&x=' + 'x'.repeat(60), 'x'.repeat(150), 'y'.repeat(210), 'https://voidtv.net/join?r=ÆØÅ'];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qr-'));
  const file = path.join(dir, 'codes.json');
  fs.writeFileSync(file, JSON.stringify(texts.map((x) => ({ t: x, m: Q.encode(x).map((r) => r.map((b) => (b ? 1 : 0))) }))));
  const out = execFileSync(PY, ['-I', '-c', [
    'import cv2, sys, json, numpy as np',
    'd = cv2.QRCodeDetector()',
    'for c in json.load(open(sys.argv[1], encoding="utf8")):',
    '    img = np.pad(np.where(np.array(c["m"]) == 1, 0, 255).astype(np.uint8), 4, constant_values=255)',
    '    img = cv2.resize(img, None, fx=8, fy=8, interpolation=cv2.INTER_NEAREST)',
    '    print("OK" if d.detectAndDecode(img)[0] == c["t"] else "FAIL")'].join('\n'), file], { encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true, force: true });
  assert.deepEqual(out.trim().split(/\r?\n/), texts.map(() => 'OK'));
  assert.throws(() => Q.encode('z'.repeat(300)), /Too long/);
  assert.match(Q.svg('A'), /^<svg [^>]*viewBox="0 0 232 232"/);
});
