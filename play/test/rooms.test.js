// Rooms (phone controllers and Trivia Nights; Bryan, 20 Nov 2026: "Yes, phone controllers"): the relay core passes
// messages between one screen and its phones, keeps nothing, and holds to its limits. Run: node --test "play/test/*.test.js"
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../rooms/room.js');
// A port the system says is free right now: a fixed range could land on another program's server and hang the test.
const freePort = () => new Promise((ok) => { const srv = require('net').createServer(); srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => ok(p)); }); });

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

test('limits: a pad room takes 16 phones at 60 messages a second each, 1 KB a message', () => {
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

test('Bryan, 20 Nov 2026 ("connect the phone as the controller prior to being in a game"): a pad room waits 45 seconds for the next page of its screen, which takes it back with the key; then it ends', () => {
  let clock = 1000000;
  const sent = new Map(), closed = new Map();
  const room = R.createRoom({ code: 'KX7P', kind: 'pad', key: 'k'.repeat(32), now: () => clock,
    send: (s, t) => { if (!sent.has(s)) sent.set(s, []); sent.get(s).push(JSON.parse(t)); }, close: (s, code) => closed.set(s, code) });
  const got = (s) => sent.get(s) || [];
  room.addHost('shelf', ''); room.addPhone('a');
  assert.equal(got('shelf')[0].key, 'k'.repeat(32));
  assert.equal(room.drop('shelf'), 'away');
  assert.deepEqual(got('a').at(-1), { type: 'host-away' });
  assert.ok(room.open && room.waiting, 'the code stays taken while the room waits');
  room.message('a', JSON.stringify({ type: 'pad', b: 1 }));   // goes nowhere, breaks nothing
  assert.equal(room.reclaim('thief', 'x'.repeat(32)), false); assert.equal(closed.get('thief'), R.CLOSE.noRoom);
  assert.ok(room.reclaim('game', 'k'.repeat(32)));
  assert.deepEqual(got('game'), [{ type: 'room', code: 'KX7P', kind: 'pad', join: '/join?r=KX7P', key: 'k'.repeat(32), back: true }, { type: 'join', from: 1, back: true }]);
  assert.deepEqual(got('a').at(-1), { type: 'host-back' });
  // The game page closes and nobody comes back: after the wait the room ends and lets its phones go.
  room.drop('game'); clock += 30 * 1000; assert.equal(room.tick(), null);
  clock += 16 * 1000; assert.equal(room.tick(), 'ended');
  assert.deepEqual(got('a').at(-1), { type: 'host-gone' }); assert.equal(closed.get('a'), R.CLOSE.hostGone);
  assert.equal(room.reclaim('late', 'k'.repeat(32)), false);
  // A trivia room, and any room with no key, ends with its screen as before.
  const tr = R.createRoom({ code: 'KX7Q', kind: 'trivia', key: 'k'.repeat(32), send: () => {}, close: () => {} });
  tr.addHost('tv'); assert.equal(tr.drop('tv'), 'ended');
});

test('R2: the local server runs rooms over real WebSockets: open, join, both ways, lookup, the screen leaving, and no other site', async () => {
  const { spawn } = require('child_process');
  const path = require('path');
  const port = await freePort();
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
    // The screen's page closes (the shelf opening a game): the room waits; the phone stays, told the screen is changing.
    assert.ok(/^[A-Za-z0-9_-]{20,64}$/.test(room.key), 'the screen gets the room key');
    tv.close();
    assert.deepEqual(await phone.next(), { type: 'host-away' });
    const wrong = await open(base + '/api/room/open?kind=pad&code=' + room.code + '&key=' + 'x'.repeat(32));
    assert.equal(await wrong.closed, R.CLOSE.noRoom, 'only the key takes the room back');
    const tv2 = await open(base + '/api/room/open?kind=pad&code=' + room.code + '&key=' + room.key);
    assert.deepEqual(await tv2.next(), { type: 'room', code: room.code, kind: 'pad', join: room.join, key: room.key, back: true });
    assert.deepEqual(await tv2.next(), { type: 'join', from: 1, back: true }, 'the next page hears of the phone in its seat');
    assert.deepEqual(await phone.next(), { type: 'host-back' });
    phone.send(JSON.stringify({ type: 'pad', b: 1 }));
    assert.deepEqual(await tv2.next(), { from: 1, msg: { type: 'pad', b: 1 } });
  } finally { srv.kill(); }
});

test('R5: the QR maker writes codes an independent reader (OpenCV) decodes, from a short join address up to version 10', (t) => {
  const { execFileSync } = require('child_process');
  const fs = require('fs'), os = require('os'), path = require('path');
  const Q = require('../src/qr.js');
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

test('R3 and R4: a phone sends held buttons as a gamepad would; the screen turns them into a gamepad that takes a seat like a real one', () => {
  const PP = require('../src/phonepad.js'), PH = require('../src/phones.js'), Hub = require('../src/hub.js');
  const Cards = require('../src/cards.js');
  const fs = require('fs'), path = require('path');
  assert.deepEqual(PP.BUTTONS, Hub.BUTTONS, 'the phone numbers buttons as the hub does');
  assert.equal(PP.bits(new Set(['A', 'Start', 'Left'])), (1 << 0) | (1 << 9) | (1 << 14));
  assert.deepEqual(PP.dirs(50, 50, 100), [], 'the middle of the pad does nothing');
  assert.deepEqual(PP.dirs(95, 50, 100), ['Right']);
  assert.deepEqual(PP.dirs(50, 5, 100), ['Up']);
  assert.deepEqual(PP.dirs(90, 90, 100).sort(), ['Down', 'Right'], 'a diagonal holds both');
  assert.deepEqual(PP.delayText(80), { text: 'Delay 40 ms', slow: false });
  assert.equal(PP.delayText(300).slow, true);
  const pad = PH.padOf(2, PP.bits(new Set(['A'])));
  assert.equal(pad.index, 102); assert.equal(pad.mapping, 'standard'); assert.equal(pad.buttons[0].pressed, true); assert.equal(pad.buttons[1].pressed, false);
  // Joust on two phones: each gets its own seat-free key (arcade keys are not per player), Start opens the menu on the phone too.
  const joust = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cards', 'joust-arcade.json'), 'utf8'));
  const c = PH.cardFor(joust, Cards.gamepadMap(joust), (code) => Cards.actionFor(joust, code));
  assert.equal(c.type, 'card'); assert.equal(c.title, 'Joust'); assert.equal(c.dpad, true);
  assert.equal(c.buttons.A, 'Flap'); assert.ok('Back' in c.buttons && 'Start' in c.buttons);
  // A console game on a phone: a second phone plays as player 2, and a phone that drops leaves its seat held.
  const sent = [], seats = [];
  const hub = Hub.createHub({ send: (code, down) => sent.push(code + (down ? ' down' : ' up')), onSeat: (s, w) => seats.push(s + ' ' + w) });
  const golden = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cards', 'golden-axe-genesis.json'), 'utf8'));
  hub.setCard(golden, Cards.gamepadMap(golden));
  hub.pollPads([PH.padOf(1, PP.bits(new Set(['A']))), PH.padOf(2, PP.bits(new Set(['A'])))]);
  assert.deepEqual(sent, ['P1:B down', 'P2:B down'], 'Golden Axe (Genesis) keeps its buttons by place');
  assert.equal(hub.seat(101), 1); assert.equal(hub.seat(102), 2);
  hub.pollPads([PH.padOf(1, 0)]);
  assert.ok(seats.includes('2 away'), 'the phone that left keeps its seat held');
  hub.pollPads([PH.padOf(1, 0), PH.padOf(2, 0)]);
  assert.ok(seats.includes('2 back'), 'the same phone seat coming back is player 2 again');
});

test('R3: the pages: the join page sends a phone to the room kind, the pad page and the Phones panel are wired, and the site copies them', () => {
  const fs = require('fs'), path = require('path');
  const P = path.join(__dirname, '..');
  const join = fs.readFileSync(path.join(P, 'join.html'), 'utf8');
  assert.ok(join.includes("const PAGES = { pad: '/play/pad.html?r=', trivia: '/trivia/phone?r=', remote: '/remote/?r=', cards: '/cards/hand?r=' };"));
  assert.ok(join.includes("const ALPHABET = '" + R.ALPHABET + "';"), 'the join page knows the same codes');
  const game = fs.readFileSync(path.join(P, 'game.html'), 'utf8');
  for (const bit of ['id="b-phones"', 'id="phones-qr"', '<script src="src/qr.js"></script>\n<script src="src/phones.js"></script>\n<script src="src/play.js"></script>']) assert.ok(game.includes(bit), bit);
  const js = fs.readFileSync(path.join(P, 'src', 'play.js'), 'utf8');
  assert.ok(js.includes('hub.pollPads(pads); if (phones) phones.seats((i) => hub.seat(i));'));
  // The pads and the phones in one list; while the game is popped out its window is read for the pads.
  assert.ok(js.includes("const allPads = () => [...(padNav().getGamepads ? [...padNav().getGamepads()] : []), ...(phones ? phones.pads() : [])];"));
  const site = fs.readFileSync(path.join(P, '..', 'scripts', 'site.js'), 'utf8');
  assert.ok(site.includes("'pad.html', 'join.html'"), 'the site build copies the phone pages');
});

test('audit review: a trivia room takes 200 phones at 5 messages a second; a dropped phone gets its seat back within a minute; the screen can remove a phone and lock the room', () => {
  const t = harness('trivia');
  t.room.addHost('tv');
  for (let i = 0; i < 200; i++) assert.ok(t.room.addPhone('p' + i));
  assert.equal(t.room.addPhone('p200'), null);
  const before = t.sent('tv').length;
  for (let i = 0; i < 20; i++) t.room.message('p0', '{"type":"a","pick":1}');
  assert.equal(t.sent('tv').length - before, 5);

  const h = harness();
  h.room.addHost('tv');
  const tok = 'abcdefghijklmnop1234';
  assert.equal(h.room.addPhone('a', tok), 1);
  assert.equal(h.room.addPhone('b'), 2);
  h.room.drop('a');
  assert.equal(h.room.addPhone('c'), 3, 'the seat of the phone that dropped is kept for it');
  h.advance(30 * 1000);
  assert.equal(h.room.addPhone('a2', tok), 1, 'the same phone back within a minute takes seat 1');
  assert.deepEqual(h.sent('tv').at(-1), { type: 'join', from: 1, back: true });
  h.room.drop('a2'); h.advance(61 * 1000);
  assert.equal(h.room.addPhone('d'), 1, 'after a minute the seat is free for anyone');
  assert.equal(h.room.addPhone('e', 'short'), 4, 'a bad token is just no token');

  h.room.message('tv', JSON.stringify({ relay: 'remove', seat: 2 }));
  assert.equal(h.closed.get('b'), R.CLOSE.removed);
  assert.deepEqual(h.sent('tv').at(-1), { type: 'leave', from: 2 });
  h.room.message('tv', JSON.stringify({ relay: 'lock', on: true }));
  assert.deepEqual(h.sent('tv').at(-1), { type: 'locked', on: true });
  assert.equal(h.room.addPhone('stranger'), null);
  assert.equal(h.closed.get('stranger'), R.CLOSE.locked);
  const tok2 = 'zyxwvutsrqponmlk9876';
  h.room.message('tv', JSON.stringify({ relay: 'lock', on: false }));
  assert.ok(h.room.addPhone('f', tok2));
  h.room.message('tv', JSON.stringify({ relay: 'lock', on: true }));
  h.room.drop('f');
  assert.ok(h.room.addPhone('f2', tok2), 'a phone of this room coming back gets in even when locked');
  assert.equal(h.room.message('f2', JSON.stringify({ relay: 'remove', seat: 1 })), undefined);
  assert.ok(![...h.closed.values()].includes(R.CLOSE.removed) || h.closed.get('d') !== R.CLOSE.removed, 'a phone cannot remove anyone');
});

test('audit review over real sockets: a phone back with its token keeps its seat; the screen removes and locks', async () => {
  const { spawn } = require('child_process');
  const path = require('path');
  const port = await freePort();
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'serve.js'), String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await new Promise((ok) => srv.stdout.once('data', ok));
    const base = 'ws://127.0.0.1:' + port, origin = 'http://127.0.0.1:' + port;
    const open = (url) => new Promise((ok, no) => {
      const ws = new WebSocket(url, { headers: { origin } });
      const q = []; let wake = null;
      ws.onmessage = (e) => { q.push(JSON.parse(e.data)); if (wake) { wake(); wake = null; } };
      ws.next = async () => { while (!q.length) await new Promise((w) => { wake = w; }); return q.shift(); };
      ws.onopen = () => ok(ws); ws.onerror = () => no(new Error('refused'));
      ws.closed = new Promise((c) => { ws.onclose = (e) => c(e.code); });
    });
    const tv = await open(base + '/api/room/open?kind=pad');
    const { code } = await tv.next();
    const tok = 'phone-token-0123456789';
    const a = await open(base + '/api/room/' + code + '/join?t=' + tok);
    assert.equal((await a.next()).seat, 1); await tv.next();
    const b = await open(base + '/api/room/' + code + '/join');
    assert.equal((await b.next()).seat, 2); await tv.next();
    a.close(); assert.deepEqual(await tv.next(), { type: 'leave', from: 1 });
    const a2 = await open(base + '/api/room/' + code + '/join?t=' + tok);
    assert.equal((await a2.next()).seat, 1, 'back in its own seat');
    assert.deepEqual(await tv.next(), { type: 'join', from: 1, back: true });
    tv.send(JSON.stringify({ relay: 'remove', seat: 2 }));
    assert.deepEqual(await tv.next(), { type: 'leave', from: 2 });
    assert.equal(await b.closed, R.CLOSE.removed);
    tv.send(JSON.stringify({ relay: 'lock', on: true }));
    assert.deepEqual(await tv.next(), { type: 'locked', on: true });
    const c = await open(base + '/api/room/' + code + '/join');
    assert.equal(await c.closed, R.CLOSE.locked);
    tv.close();
  } finally { srv.kill(); }
});

test('Void University (Bryan, 20 Nov 2026): a lesson room takes 40 phones at 10 messages a second and ends with its screen', () => {
  assert.ok(R.KINDS.includes('lesson'));
  assert.deepEqual(R.LIMITS.lesson, { phones: 40, perSecond: 10, screenHoldMs: 0 });
  const room = R.createRoom({ code: 'KX7L', kind: 'lesson', key: 'k'.repeat(32), send: () => {}, close: () => {} });
  room.addHost('tv'); assert.equal(room.addPhone('a'), 1); assert.equal(room.drop('tv'), 'ended');
});

test('Watch and Talk (Bryan, 21 Nov 2026): a talk room takes two grown-ups\' phones at 5 messages a second, waits 45 seconds for its kids page, and leaves the other kinds as they were', () => {
  assert.ok(R.KINDS.includes('talk'));
  assert.deepEqual(R.LIMITS.talk, { phones: 2, perSecond: 5, screenHoldMs: 45 * 1000 });
  assert.deepEqual(R.LIMITS.pad, { phones: 16, perSecond: 60, screenHoldMs: 45 * 1000 });
  assert.deepEqual(R.LIMITS.trivia, { phones: 200, perSecond: 5, screenHoldMs: 0 });
  assert.deepEqual(R.LIMITS.lesson, { phones: 40, perSecond: 10, screenHoldMs: 0 });
  assert.equal(R.LIMITS.remote.phones, 16);
  assert.throws(() => R.createRoom({ code: 'KX7T', kind: 'chat', send: () => {}, close: () => {} }), /kind/);
  const h = harness('talk');
  assert.ok(h.room.addHost('tablet', 'https://kids.voidtv.net'));
  assert.equal(h.room.addPhone('mum'), 1);
  assert.equal(h.room.addPhone('dad'), 2);
  assert.equal(h.room.addPhone('third'), null, 'a third phone is refused');
  assert.equal(h.closed.get('third'), R.CLOSE.full);
  for (let i = 0; i < 6; i++) h.room.message('mum', JSON.stringify({ type: i % 2 ? 'play' : 'pause' }));
  assert.equal(h.sent('tablet').filter((m) => m.from === 1 && m.msg).length, 5, 'the sixth message in one second is dropped');
  h.room.message('tablet', JSON.stringify({ to: 'all', msg: { type: 'q', id: 'sesame-street-32x62:1' } }));
  assert.deepEqual(h.sent('dad').slice(-1), [{ type: 'q', id: 'sesame-street-32x62:1' }]);
  const keyed = R.createRoom({ code: 'KX7K', kind: 'talk', key: 'k'.repeat(32), send: () => {}, close: () => {} });
  keyed.addHost('tablet'); keyed.addPhone('mum');
  assert.equal(keyed.drop('tablet'), 'away', 'the kids page can change without losing the phone');
});
