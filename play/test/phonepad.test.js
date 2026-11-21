// A phone as the gamepad, made dependable (Bryan, 20 Nov 2026: "at first it seems like the lag is too much but after further
// it seems to just be playing on its own ... the design is off"). Each test here is one measured cause, kept fixed:
// a dropped release, a round pad that flickered on a border, a phone gone silent with a button held, a dead socket's
// ghost, a tap lost between two frames, and a pad that showed six buttons for a two-button machine.
// Run: node --test "play/test/*.test.js"
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const R = require('../rooms/room.js');
const PP = require('../src/phonepad.js');
const PH = require('../src/phones.js');
const Hub = require('../src/hub.js');
const Cards = require('../src/cards.js');
const P = path.join(__dirname, '..');
const cardOf = (id) => JSON.parse(fs.readFileSync(path.join(P, 'cards', id + '.json'), 'utf8'));
const phoneCard = (id) => { const c = cardOf(id); return PH.cardFor(c, Cards.gamepadMap(c), (code) => Cards.actionFor(c, code)); };

function relay() {
  let clock = 1000000;
  const sent = new Map(), closed = new Map();
  const room = R.createRoom({ code: 'KX7P', kind: 'pad', now: () => clock,
    send: (s, t) => { if (!sent.has(s)) sent.set(s, []); sent.get(s).push(JSON.parse(t)); },
    close: (s, code) => closed.set(s, code) });
  return { room, sent: (s) => sent.get(s) || [], closed, advance: (ms) => { clock += ms; } };
}

function relay2(key) {
  const sent = new Map(), closed = new Map();
  const room = R.createRoom({ code: 'KX7P', kind: 'pad', key, now: () => 1000000,
    send: (s, t) => { assert.ok(s, 'nothing is sent to a screen that is not there'); if (!sent.has(s)) sent.set(s, []); sent.get(s).push(JSON.parse(t)); },
    close: (s, code) => closed.set(s, code) });
  return { room, sent: (s) => sent.get(s) || [], closed };
}

test('the relay: a phone back on a new socket takes its seat from its own dead socket, which is closed', () => {
  const h = relay();
  h.room.addHost('tv');
  const tok = 'abcdefghijklmnop1234';
  assert.equal(h.room.addPhone('old', tok), 1);
  assert.equal(h.room.addPhone('other'), 2);
  h.room.message('old', JSON.stringify({ type: 'pad', b: 1 << 15 }));
  // The phone's Wi-Fi dropped: no close came for 'old'. The same phone joins again.
  assert.equal(h.room.addPhone('new', tok), 1, 'the same seat, not a third one');
  assert.equal(h.closed.get('old'), R.CLOSE.replaced);
  assert.deepEqual(h.sent('tv').at(-1), { type: 'join', from: 1, back: true }, 'the screen starts that phone clean');
  assert.deepEqual(h.sent('new').at(-1), { type: 'hello', seat: 1, kind: 'pad' });
  assert.equal(h.room.phones, 2);
  const before = h.sent('tv').length;
  assert.equal(h.room.drop('old'), null, 'the old socket closing later takes nothing with it');
  h.room.message('old', JSON.stringify({ type: 'pad', b: 1 << 15 }));
  assert.equal(h.sent('tv').length, before, 'and it can no longer speak');
  h.room.message('new', JSON.stringify({ type: 'pad', b: 0 }));
  assert.deepEqual(h.sent('tv').at(-1), { from: 1, msg: { type: 'pad', b: 0 } });
  // A locked room still lets its own phone back.
  h.room.message('tv', JSON.stringify({ relay: 'lock', on: true }));
  assert.equal(h.room.addPhone('newer', tok), 1);
  assert.equal(R.LIMITS.pad.perSecond, 60);
  // While the screen is between pages (the shelf opening a game) the same handover works, and the phone is told to wait.
  const w = relay2('abcdefghijklmnopqrstuvwx');
  w.room.addHost('shelf'); w.room.addPhone('p', tok);
  assert.equal(w.room.drop('shelf'), 'away');
  assert.equal(w.room.addPhone('p2', tok), 1);
  assert.equal(w.closed.get('p'), R.CLOSE.replaced);
  assert.deepEqual(w.sent('p2').slice(-2), [{ type: 'hello', seat: 1, kind: 'pad' }, { type: 'host-away' }]);
  assert.ok(w.room.reclaim('game', 'abcdefghijklmnopqrstuvwx'));
  assert.deepEqual(w.sent('game').filter((m) => m.type === 'join'), [{ type: 'join', from: 1, back: true }], 'the game page hears of the phone once, on its new socket');
  assert.deepEqual(w.sent('p2').at(-1), { type: 'host-back' });
});

test('the phone never passes the relay limit and says its state again on a beat, so a lost message heals', () => {
  assert.ok(1000 / PP.GAP_MS < R.LIMITS.pad.perSecond, 'at most 50 a second against a limit of 60');
  assert.equal(PP.waitFor(1000, 1000 - PP.GAP_MS), 0, 'far enough from the last message: goes at once');
  assert.equal(PP.waitFor(1005, 1000), PP.GAP_MS - 5, 'too soon: waits the rest of the gap');
  // The beat: while anything is held, and for a second after a change, the state goes again every BEAT_MS.
  assert.equal(PP.beatDue(1000 + PP.BEAT_MS, 1000, 0, 1 << 15), true, 'held: due');
  assert.equal(PP.beatDue(1000 + PP.BEAT_MS - 1, 1000, 0, 1 << 15), false);
  assert.equal(PP.beatDue(5000 + PP.BEAT_MS, 5000, 4900, 0), true, 'just let go: the release is said again, in case it was lost');
  assert.equal(PP.beatDue(9000 + PP.BEAT_MS, 9000, 0, 0), false, 'nothing held for a while: the slow beat');
  assert.equal(PP.beatDue(9000 + PP.REST_MS, 9000, 0, 0), true);
  assert.ok(PP.BEAT_MS * 3 < PH.QUIET_MS, 'three beats may be lost before the screen calls a phone silent');
  assert.equal(PP.bits(new Set(['A', 'Back+Start'])), (1 << 0) | (1 << 8) | (1 << 9), 'Menu holds Back and Start together');
});

test('the round pad is steady: a thumb resting on the line between two directions does not flicker', () => {
  // Before: a thumb at 22.5 degrees moving a pixel and a half either way changed direction at every report, a message
  // each (242 in two seconds on the real page; the relay passed 90 and the lift was among the lost).
  const size = 300, r = 100, at = (deg) => [size / 2 + Math.cos(deg * Math.PI / 180) * r, size / 2 + Math.sin(deg * Math.PI / 180) * r];
  let sector = null, changes = 0, last = '';
  for (let n = 0; n < 240; n++) {
    const [x, y] = at(22.5); const a = PP.aim(x, y + (n % 2 ? 1.5 : -1.5), size, sector);
    sector = a.sector;
    if (a.dirs.join() !== last) { changes++; last = a.dirs.join(); }
  }
  assert.equal(changes, 1, 'one direction, held');
  // It still follows a thumb that really moves: a full turn passes all eight directions once each, and comes back to the first.
  sector = null; changes = 0; last = '';
  for (let deg = 0; deg < 360; deg += 2) { const [x, y] = at(deg); const a = PP.aim(x, y, size, sector); sector = a.sector; if (a.dirs.join() !== last) { changes++; last = a.dirs.join(); } }
  assert.equal(changes, 9);
  assert.deepEqual(PP.dirs(150, 150, 300), [], 'the middle does nothing');
  assert.deepEqual(PP.dirs(290, 150, 300), ['Right']);
  assert.deepEqual(PP.dirs(270, 270, 300), ['Right', 'Down'], 'a diagonal holds both');
});

test('a touch near a button presses it; a thumb sliding over the face buttons moves from one to the next', () => {
  const boxes = [{ n: 'A', face: true, round: true, x: 100, y: 100, w: 80, h: 80 }, { n: 'B', face: true, round: true, x: 200, y: 40, w: 80, h: 80 },
    { n: 'Start', x: 0, y: 30, w: 90, h: 44 }];
  assert.equal(PP.keyAt(boxes, 140, 140).n, 'A', 'on it');
  assert.equal(PP.keyAt(boxes, 140, 80).n, 'A', 'a little off its edge');
  assert.equal(PP.keyAt(boxes, 400, 400), null, 'nowhere near anything');
  assert.equal(PP.keyAt(boxes, 190, 95).n, 'B', 'between two: the nearer one');
  assert.equal(PP.keyAt(boxes, 100, 90).n, 'Start', 'between a pill and a face button: the nearer one');
  assert.equal(PP.keyAt(boxes, 100, 90, (k) => k.face).n, 'A', 'but a thumb that started on a face button stays on face buttons');
  assert.equal(PP.keyAt(boxes, 100, 50).n, 'Start', 'just past the pill');
  // A thumb rolling (the auditor's question on the fix): from A onto B lets go of A and presses B; a little drift off a
  // button keeps it; clearly off everything holds nothing; back onto a face button holds again.
  const [A, B, START] = boxes;
  assert.equal(PP.slide(boxes, A, true, 240, 80), B, 'rolled onto B: B, and A no more');
  assert.equal(PP.slide(boxes, A, true, 140, 240), A, 'drifted 60 px under A: still A');
  assert.equal(PP.slide(boxes, A, true, 140, 370), null, 'far from every button: nothing is held');
  assert.equal(PP.slide(boxes, null, true, 140, 140), A, 'and back on A: held again');
  assert.equal(PP.slide(boxes, null, true, 40, 50), null, 'a thumb that began on a face button never lands on a pill');
  assert.equal(PP.slide(boxes, START, false, 60, 100), START, 'a pill keeps a little drift');
  assert.equal(PP.slide(boxes, START, false, 60, 200), null, 'and lets go when the finger is clearly off it');
  assert.equal(PP.slide(boxes, START, false, 140, 140), null, 'without ever turning into a face button');
});

test('the screen: every tap reaches the game as a press and a release, in order, even when both arrive in one frame', () => {
  const A = 1, RIGHT = 1 << 15;
  const p = PH.fresh(0);
  PH.take(p, A, 1, 0); PH.take(p, 0, 2, 0);          // a tap whose two messages came together
  assert.equal(PH.settle(p, 0), A, 'the press is shown');
  assert.equal(PH.settle(p, 16), A, 'and stays two frames');
  assert.equal(PH.settle(p, PH.HOLD_MS), 0, 'then the release');
  // Three fast taps bunched by the network come out as three presses.
  const q = PH.fresh(0); let presses = 0, was = 0;
  for (let n = 1; n <= 6; n++) PH.take(q, n % 2 ? A : 0, n, 0);
  for (let t = 0; t <= 400; t += 16) { const b = PH.settle(q, t); if (b && !was) presses++; was = b; }
  assert.equal(presses, 3); assert.equal(was, 0);
  // A button that did not just change is not held up by one that did.
  const s = PH.fresh(0);
  PH.take(s, A, 1, 0); PH.settle(s, 0);
  PH.take(s, RIGHT, 2, 5);
  assert.equal(PH.settle(s, 16), A | RIGHT, 'Right goes down at once; A waits out its two frames');
  assert.equal(PH.settle(s, 40), RIGHT);
  // A late, older message is ignored (the count the phone puts on each state).
  const o = PH.fresh(0);
  PH.take(o, RIGHT, 5, 0); PH.take(o, 0, 6, 100); PH.take(o, RIGHT, 5, 110);
  PH.settle(o, 100); assert.equal(PH.settle(o, 200), 0);
  // Far behind: the newest state wins, the screen never runs late.
  const f = PH.fresh(0);
  for (let n = 1; n <= 200; n++) PH.take(f, n % 2 ? A : 0, n, 0);
  assert.ok(f.queue.length <= 24);
});

test('the screen page itself stalling is not the phones going silent; a phone on a new page or a new socket keeps its player number', async () => {
  const s = screen();
  try {
    await s.opened;
    s.say({ type: 'join', from: 1 }); s.say({ type: 'join', from: 2 });
    s.say({ from: 1, msg: { type: 'pad', b: 1 << 15, n: 1, v: 2 } }); s.say({ from: 2, msg: { type: 'pad', b: 1, n: 1, v: 2 } });
    s.frame(16);
    assert.deepEqual(s.hub.held(), ['P1:Right', 'P2:B']);
    // The page does not run for two seconds (a save state loading). The phones' beats sit unread behind that frame.
    s.frame(2000);
    assert.deepEqual(s.hub.held(), ['P1:Right', 'P2:B'], 'nothing is let go for a stall of the screen page itself');
    s.say({ from: 1, msg: { type: 'pad', b: 1 << 15, n: 9, v: 2 } }); s.say({ from: 2, msg: { type: 'pad', b: 1, n: 9, v: 2 } });
    s.frame(16);
    assert.deepEqual(s.hub.held(), ['P1:Right', 'P2:B']);
    // But a phone that then really stays silent still lets go.
    for (let t = 0; t < PH.QUIET_MS + 100; t += 16) { s.frame(16); if (t % 192 === 0) s.say({ from: 2, msg: { type: 'pad', b: 1, n: 10 + t, v: 2 } }); }
    assert.deepEqual(s.hub.held(), ['P2:B'], 'phone 1 went silent; phone 2 kept its beat');
    // Phone 1 locked its screen: after 5 s it is away, its place kept. It comes back on a new socket within the minute
    // (the relay says join, back) and is player 1 again with nobody touching the big screen.
    for (let t = 0; t < PH.GONE_MS + 100; t += 16) { s.frame(16); if (t % 192 === 0) s.say({ from: 2, msg: { type: 'pad', b: 1, n: 5000 + t, v: 2 } }); }
    assert.ok(s.seats.includes('1 away'));
    s.say({ type: 'join', from: 1, back: true });
    // Its count carries on from where its page was (the page did not reload): the new start must not turn it away.
    s.say({ from: 1, msg: { type: 'pad', b: 1 << 14, n: 500, v: 2 } });
    s.frame(16);
    assert.equal(s.hub.seat(101), 1, 'the same player number');
    assert.ok(s.seats.includes('1 back'));
    assert.deepEqual(s.hub.held(), ['P1:Left', 'P2:B'], 'and it is heard at once, count 500 and all');
  } finally { s.done(); }
});

// A screen with its room, on a clock the test moves; the relay's messages are handed to it directly.
function screen() {
  let now = 0, sock = null;
  const realWS = global.WebSocket, realLoc = global.location;
  global.WebSocket = class { constructor() { sock = this; this.readyState = 1; this.out = []; } send(t) { this.out.push(JSON.parse(t)); } close() {} };
  global.location = { protocol: 'https:', host: 'voidtv.net' };
  const t = PH.create({ now: () => now, card: () => ({ type: 'card' }) });
  const opened = t.open();
  const say = (m) => sock.onmessage({ data: JSON.stringify(m) });
  say({ type: 'room', code: 'KX7P', join: 'https://voidtv.net/join?r=KX7P' });
  const keys = [], seats = [];
  const hub = Hub.createHub({ send: (code, down) => keys.push(code + (down ? ' down' : ' up')), onSeat: (s, w) => seats.push(s + ' ' + w) });
  const golden = cardOf('golden-axe-genesis');
  hub.setCard(golden, Cards.gamepadMap(golden));
  const frame = (ms) => { now += ms; hub.pollPads(t.pads()); t.seats((i) => hub.seat(i)); };
  // Time passes a frame at a time, as on a real page (one long step would be the page itself stalling).
  const run = (ms) => { for (let t = 0; t < ms; t += 16) frame(16); };
  return { t, opened, say, hub, keys, seats, frame, run, done: () => { global.WebSocket = realWS; global.location = realLoc; }, sock: () => sock };
}

test('the stuck-key guard: a phone that goes silent with a direction held lets go, then gives up its seat like a dropped pad', async () => {
  const s = screen();
  try {
    await s.opened;
    s.say({ type: 'join', from: 1 });
    s.say({ from: 1, msg: { type: 'pad', b: 1 << 15, n: 1, v: 2 } });
    s.frame(16);
    assert.deepEqual(s.hub.held(), ['P1:Right']);
    // The beat keeps it held: a message every 200 ms.
    for (let i = 2; i < 12; i++) { s.run(200); s.say({ from: 1, msg: { type: 'pad', b: 1 << 15, n: i, v: 2 } }); }
    s.frame(16);
    assert.deepEqual(s.hub.held(), ['P1:Right'], 'held as long as the phone says so');
    // The phone freezes (its page put away, its network gone): nothing more arrives, and no close.
    s.run(PH.QUIET_MS - 50);
    assert.deepEqual(s.hub.held(), ['P1:Right']);
    s.run(100);
    assert.deepEqual(s.hub.held(), [], 'let go within ' + PH.QUIET_MS + ' ms of silence');
    assert.equal(s.t.list()[0].quiet, false);
    s.run(PH.GONE_MS);
    assert.equal(s.t.list()[0].quiet, true, 'and after 5 s it is away');
    assert.ok(s.seats.includes('1 away'), 'its seat is held for it, as for a real pad that dropped');
    // It comes back and plays on as the same player.
    s.say({ from: 1, msg: { type: 'pad', b: 1, n: 30, v: 2 } });
    s.frame(16);
    assert.deepEqual(s.hub.held(), ['P1:B']);
    assert.ok(s.seats.includes('1 back'));
    // Its socket is killed outright (the relay says it left): nothing stays pressed.
    s.say({ type: 'leave', from: 1 }); s.frame(16);
    assert.deepEqual(s.hub.held(), []);
    // The same phone on a new socket starts clean, whatever it held before.
    s.say({ type: 'join', from: 2 }); s.say({ from: 2, msg: { type: 'pad', b: 1 << 14, n: 1, v: 2 } }); s.frame(16);
    assert.ok(s.hub.held().length === 1);
    s.say({ type: 'join', from: 2, back: true }); s.frame(16);
    assert.deepEqual(s.hub.held(), [], 'a rejoin holds nothing until the phone says so');
    // A pad page from before the beat (still open on some phone) is never called silent: it would lose a long hold.
    s.say({ type: 'join', from: 3 }); s.say({ from: 3, msg: { type: 'pad', b: 1 << 15 } }); s.frame(16);
    s.run(PH.GONE_MS * 2);
    assert.equal(s.hub.held().length, 1, 'an earlier pad page keeps its hold');
  } finally { s.done(); }
});

test('the pad shows the game\'s own buttons: only what the machine has, its letters, its shape, what each does', () => {
  // A Nintendo game: B and A, Select and Start. Before, the phone drew Y, X, B, A, LB and RB, lettered as an Xbox pad.
  const nes = phoneCard('mario-bros-nes');
  assert.deepEqual(nes.keys.filter((k) => k.at === 'face').map((k) => k.t + '=' + k.n), ['B=A', 'A=B'], 'the machine\'s B is the pad\'s bottom button');
  assert.equal(nes.shape, 'pair'); assert.equal(nes.cols, 2);
  assert.ok(!nes.keys.some((k) => k.at === 'left' || k.at === 'right'), 'no L or R on a machine without them');
  assert.deepEqual(nes.keys.filter((k) => k.at === 'pill').map((k) => k.t + '=' + k.n), ['Select=Back', 'Start=Start', 'Menu=Back+Start']);
  assert.deepEqual(Object.keys(nes.buttons).sort(), ['A', 'B', 'Back', 'Start'], 'the earlier form, for a pad page still open, lists the same four');
  // Genesis: A, B and C in a line, as printed on the pad; no word that only repeats the letter.
  const gen = phoneCard('aladdin-genesis');
  assert.deepEqual(gen.keys.filter((k) => k.at === 'face').map((k) => [k.t, k.n, k.r, k.c, k.k, k.w]), [['A', 'X', 3, 1, 'red', ''], ['B', 'A', 2, 2, 'yellow', ''], ['C', 'B', 1, 3, 'pink', '']]);
  assert.equal(gen.shape, 'abc');
  // Super Nintendo: the diamond, L and R.
  const snes = phoneCard('donkey-kong-country-snes');
  assert.deepEqual(snes.keys.filter((k) => k.at === 'face').map((k) => k.t).sort(), ['A', 'B', 'X', 'Y']);
  assert.deepEqual(snes.keys.filter((k) => k.at === 'left' || k.at === 'right').map((k) => k.t + '=' + k.n), ['L=LB', 'R=RB']);
  // An arcade machine: its buttons by the names on the card, Coin and Start, and Menu.
  const arc = phoneCard('1941-counter-attack-arcade');
  assert.deepEqual(arc.keys.map((k) => k.t), ['Button 1', 'Button 2', 'Coin', 'Start', 'Menu']);
  assert.equal(arc.cols, 2);
  // A PC game: the key and what it does; Start is already the menu, so there is no second Menu.
  const dos = phoneCard('a-j-s-world-of-discovery-1992');
  assert.deepEqual(dos.keys.map((k) => k.t + (k.w ? ':' + k.w : '')), ['Enter:Confirm', 'Esc:Back out', 'Space:Go on', 'Menu']);
  // Every card gives a pad a phone can draw: each key has a button to press and a place.
  for (const f of fs.readdirSync(path.join(P, 'cards')).filter((x) => x.endsWith('.json'))) {
    const c = phoneCard(f.replace(/\.json$/, ''));
    for (const k of c.keys) {
      assert.ok(k.t && k.n.split('+').every((n) => n in PP.BUTTONS), f + ' ' + JSON.stringify(k));
      if (k.at === 'face') assert.ok(k.r >= 1 && k.r <= c.rows && k.c >= 1 && k.c <= c.cols, f + ' places ' + k.t);
    }
    const face = c.keys.filter((k) => k.at === 'face');
    assert.equal(new Set(face.map((k) => k.r + ',' + k.c)).size, face.length, f + ': no two face buttons in one place');
    assert.ok(c.keys.some((k) => k.t === 'Menu'), f + ' can open the menu');
    assert.ok(JSON.stringify(c).length < R.LIMITS.bytes - 30, f + ': the card fits one relay message');
  }
});

test('the pad page: the handheld\'s own parts, the hub\'s steady rule, no zoom or scroll, and every way a finger can vanish lets go', () => {
  const html = fs.readFileSync(path.join(P, 'pad.html'), 'utf8'), js = fs.readFileSync(path.join(P, 'src', 'phonepad.js'), 'utf8');
  assert.ok(html.includes('<script src="src/hub.js"></script>\n<script src="src/phonepad.js"></script>'), 'the hub\'s steadyDir is loaded for the round pad');
  for (const f of html.match(/skin\/[a-z-]+\.(?:webp|svg)/g)) assert.ok(fs.existsSync(path.join(P, f)), f);
  for (const part of ['skin/dpad-well.svg', 'skin/dpad-cross.svg', 'skin/btn-red.webp', 'skin/btn-yellow.webp', 'skin/pill.webp', 'skin/label.webp', 'skin/plastic.webp']) assert.ok(html.includes(part), part);
  assert.ok(html.includes('user-scalable=no') && html.includes('touch-action:none') && html.includes('overscroll-behavior:none') && html.includes('position:fixed'));
  assert.ok(html.includes('@media (orientation:portrait)'), 'upright has its own layout');
  assert.ok(js.includes("for (const ev of ['touchend', 'touchcancel']) document.addEventListener(ev, (e) => { if (!e.touches.length) letGo(); }, true);"), 'no finger down: nothing held');
  assert.ok(js.includes("for (const ev of ['pointerup', 'pointercancel']) document.addEventListener(ev, up);"));
  assert.ok(js.includes("for (const ev of ['blur', 'pagehide']) addEventListener(ev, letGo);"));
  assert.ok(js.includes('if (sock !== ws) return;   // an old connection this page already replaced'));
  assert.ok(js.includes("if (e.code === 4411) { ended = true;"), 'a second tab does not fight the first for the seat');
  assert.ok(js.includes('now() - heardAt > (away ? AWAY_MS : QUIET_MS)'), 'a dead connection is dropped and opened again; a screen changing pages is waited for');
  assert.ok(PP.AWAY_MS > R.LIMITS.pad.screenHoldMs, 'the phone waits longer than the relay holds the room for its screen');
});
