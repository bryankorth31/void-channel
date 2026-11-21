// The phone remote (Bryan, 20 Nov 2026: "a channel switcher, save to phone, info on the phone about the show", "also use this for
// cast, and kids, across the entire voidtv universe"): the shared messages fit the relay, a phone can only ask for known actions,
// the saved list stays sane, the remote room kind holds its limits, and a phone and a screen talk over the local relay.
// Run: node --test tests/remote.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const V = require('../remote/src/remote.js');
const R = require('../play/rooms/room.js');
const ROOT = path.join(__dirname, '..');

test('a phone can ask only for the known actions, each with a checked value', () => {
  assert.deepEqual(V.readDo({ type: 'r-do', a: 'ch', dir: 1 }), { a: 'ch', dir: 1 });
  assert.deepEqual(V.readDo({ type: 'r-do', a: 'tune', id: 'void' }), { a: 'tune', id: 'void' });
  assert.deepEqual(V.readDo({ type: 'r-do', a: 'go', slug: 'the-lucy-show', extra: 'x' }), { a: 'go', slug: 'the-lucy-show' });
  assert.deepEqual(V.readDo({ type: 'r-do', a: 'now' }), { a: 'now' });
  for (const bad of [null, {}, { type: 'r-do' }, { type: 'r-do', a: 'eval' }, { type: 'r-do', a: 'ch', dir: 5 }, { type: 'r-do', a: 'tune', id: '<script>' },
    { type: 'r-do', a: 'go', slug: '' }, { type: 'r-do', a: '__proto__' }, { type: 'r-do', a: 'toString' }, { type: 'x', a: 'ch', dir: 1 }]) assert.equal(V.readDo(bad), null, JSON.stringify(bad));
});

test('every message fits the relay\'s 1 KB with its envelope, however long the words', () => {
  const long = 'word '.repeat(600);
  const n = V.nowMsg({ k: 'tv', where: long, t: long, s: long, nx: long, left: 1080.4, slug: 'x', art: 'https://image.tmdb.org/' + 'a'.repeat(190), acts: [{ a: 'ch', l: 'CH' }, { a: 'bogus', l: 'no' }] });
  assert.ok(V.fits(n)); assert.equal(n.left, 1080); assert.deepEqual(n.acts, [{ a: 'ch', l: 'CH' }]);
  assert.equal(V.nowMsg({ art: 'javascript:alert(1)' }).art, '');
  const i = V.infoMsg({ slug: 'x', t: long, sub: long, ppl: long, about: long, url: 'https://voidtv.net/show/x' });
  assert.ok(V.fits(i)); assert.ok(i.about.length <= 420);
  assert.equal(V.infoMsg({ url: 'javascript:alert(1)' }).url, '');
  assert.equal(V.clip('a\u0000b\nc', 10), 'a b c');
});

test('a long channel list is cut into parts that each fit, and the phone puts them back together', () => {
  const items = Array.from({ length: 180 }, (_, k) => ({ id: 'ch-' + k, t: 'Channel number ' + k + ' with a longish name', s: 'A show with quite a long title, part ' + k }));
  const ms = V.listMsgs('chans', 'On now', items, 'ch-7', 3);
  assert.ok(ms.length > 5);
  for (const m of ms) { assert.ok(V.fits(m), 'part ' + m.part + ' is ' + V.size(m)); assert.equal(m.of, ms.length); }
  const store = {};
  let whole = null;
  for (const m of ms.slice().reverse()) whole = V.listTake(store, m) || whole;
  assert.equal(whole.items.length, 180); assert.equal(whole.items[0].id, 'ch-0'); assert.equal(whole.on, 'ch-7');
  // A part of a newer list starts over: an old part never mixes in.
  assert.equal(V.listTake(store, V.listMsgs('chans', 'On now', items, 'ch-8', 4)[0]), null);
  assert.equal(V.listMsgs('chans', 'On now', [], '', 1).length, 1);
});

test('saved on the phone: newest first, one entry a show, a cap, and junk from storage is dropped', () => {
  let s = V.savedAdd([], { slug: 'a', t: 'A' }, 1);
  s = V.savedAdd(s, { slug: 'b', t: 'B' }, 2);
  s = V.savedAdd(s, { slug: 'a', t: 'A again' }, 3);
  assert.deepEqual(s.map((x) => x.slug), ['a', 'b']); assert.equal(s[0].t, 'A again');
  assert.ok(V.savedHas(s, 'b')); assert.deepEqual(V.savedDrop(s, 'b').map((x) => x.slug), ['a']);
  for (let k = 0; k < 150; k++) s = V.savedAdd(s, { slug: 's' + k, t: 'S' }, k);
  assert.equal(s.length, V.SAVED_MAX);
  assert.deepEqual(V.savedRead('not json'), []);
  assert.deepEqual(V.savedRead('{"a":1}'), []);
  assert.deepEqual(V.savedRead(JSON.stringify([{ slug: 'ok', t: 'Ok', url: 'javascript:x' }, { slug: '<b>' }])), [{ slug: 'ok', t: 'Ok', s: '', url: '', at: 0 }]);
});

test('trivia in the breaks: the question fits, each phone answers once and in time, results score with Trivia\'s points and give places', () => {
  const G = require('../trivia/src/game.js');
  const z = { n: 77, show: 'The Lucy Show', q: 'Who played Lucy? '.repeat(40), choices: ['Ann', 'Bea', 'Lucille Ball', 'Di'], answer: 2, phase: 'q', endsAt: 30000, msTotal: 27000, src: { site: 'TMDB' } };
  const ask = V.quizAsk(z, 3000);
  assert.ok(V.fits(ask)); assert.equal(ask.type, 't-q'); assert.equal(ask.live, true); assert.equal(ask.secs, 27); assert.equal(ask.kick, 'Trivia: The Lucy Show'); assert.equal(ask.pick, null);
  const book = {};
  assert.deepEqual(V.quizAnswer(book, 1, { type: 't-a', n: 77, pick: 2 }, z, 3000), { type: 't-got', n: 77, pick: 2 });   // right, with the whole time left
  assert.equal(V.quizAnswer(book, 1, { type: 't-a', n: 77, pick: 0 }, z, 4000), null, 'one answer a question');
  assert.deepEqual(V.quizAnswer(book, 2, { type: 't-a', n: 77, pick: 0 }, z, 20000), { type: 't-got', n: 77, pick: 0 });  // wrong
  for (const [m, t] of [[{ type: 't-a', n: 76, pick: 1 }, 5000], [{ type: 't-a', n: 77, pick: 4 }, 5000], [{ type: 't-a', n: 77, pick: '1' }, 5000], [{ type: 't-a', n: 77, pick: 1 }, 30001]])
    assert.equal(V.quizAnswer(book, 3, m, z, t), null, JSON.stringify(m) + ' at ' + t);
  assert.equal(V.quizAnswer(book, 3, { type: 't-a', n: 77, pick: 1 }, Object.assign({}, z, { phase: 'a' }), 5000), null, 'not once the answer is out');
  const res = new Map(V.quizResults(book, [1, 2, 3], Object.assign({}, z, { phase: 'a' }), G.points));
  assert.equal(res.get(1).right, true); assert.equal(res.get(1).points, G.points(true, 27000, 27000)); assert.equal(res.get(1).place, 1);
  assert.equal(res.get(2).right, false); assert.equal(res.get(2).points, 0); assert.equal(res.get(2).pick, 0);
  assert.equal(res.get(3).pick, null); assert.equal(res.get(3).place, 2, 'a tie shares a place');
  assert.equal(res.get(1).a, 'C: Lucille Ball'); assert.equal(res.get(1).src, 'TMDB'); assert.equal(res.get(1).of, 3);
  for (const m of res.values()) assert.ok(V.fits(m));
  assert.deepEqual(V.quizCount(book, [1, 2, 3], z), { phones: 3, answered: 2, right: 1 });
  // The next question: scores carry over, answers start fresh.
  const z2 = Object.assign({}, z, { n: 78, answer: 0, endsAt: 90000 });
  V.quizAnswer(book, 2, { type: 't-a', n: 78, pick: 0 }, z2, 63000);
  const r2 = new Map(V.quizResults(book, [1, 2, 3], Object.assign({}, z2, { phase: 'a' }), G.points));
  assert.equal(r2.get(2).score, G.points(true, 27000, 27000)); assert.equal(r2.get(1).score, r2.get(2).score); assert.equal(r2.get(1).place, 1); assert.equal(r2.get(2).place, 1);
});

test('pop-ups during the show: 3 minutes in, then every 5, open 40 s with the result 15 s more, none in the last minute; the same for everyone', () => {
  const st = 1000000, en = st + 22 * 60e3, at = (min) => V.popAt(st, en, st + min * 60e3);
  assert.equal(at(0), null); assert.equal(at(2.99), null);
  assert.deepEqual(at(3), { i: 0, start: st + 3 * 60e3, close: st + 3 * 60e3 + 40e3, until: st + 3 * 60e3 + 55e3 });
  assert.equal(at(3.5).i, 0, 'the result is still showing at 3:30');
  assert.equal(at(4), null, 'and gone by 4:00');
  assert.equal(at(8.2).i, 1); assert.equal(at(13.1).i, 2); assert.equal(at(18.5).i, 3);
  assert.equal(at(21.5), null, 'nothing that would run into the last minute');
  // A 22-minute episode gets four; a 7-minute short gets one; a 3-minute one none.
  const count = (mins) => { const s = new Set(); for (let t = 0; t < mins * 60e3; t += 1000) { const w = V.popAt(st, st + mins * 60e3, st + t); if (w) s.add(w.i); } return s.size; };
  assert.equal(count(22), 4); assert.equal(count(7), 1); assert.equal(count(3), 0);
  assert.equal(V.popAt(st, en, st - 1), null); assert.equal(V.popAt(st, en, en + 1), null);
  assert.equal(V.quizAsk({ n: 1, show: 'S', q: 'Q', choices: ['a', 'b'], endsAt: 0, pop: true }, 0).pop, true, 'the phone knows the answer comes to it, not the big screen');
  assert.equal(V.quizAsk({ n: 1, show: 'S', q: 'Q', choices: ['a', 'b'], endsAt: 0 }, 0).pop, false);
});

test('the remote room: 16 phones, 10 a second, waits 45 s for its screen, and lasts 12 hours', () => {
  assert.ok(R.KINDS.includes('remote'));
  assert.deepEqual(R.LIMITS.remote, { phones: 16, perSecond: 10, screenHoldMs: 45000, lifeMs: 12 * 3600 * 1000 });
  let clock = 0;
  const closed = [];
  const room = R.createRoom({ code: 'KX7R', kind: 'remote', key: 'k'.repeat(32), now: () => clock, send: () => {}, close: (s, c) => closed.push([s, c]) });
  room.addHost('tv');
  // Keep it talking (a screen says what is on now every few minutes): past 4 hours it is still open; past 12 it ends.
  for (clock = 0; clock < 5 * 3600 * 1000; clock += 10 * 60 * 1000) { room.message('tv', '{"to":"all","msg":{"type":"r-now"}}'); assert.equal(room.tick(), null); }
  clock = 12 * 3600 * 1000 + 1;
  assert.equal(room.tick(), 'ended');
  // End remote: the screen says end, and the room ends now with its phones told, instead of waiting 45 s for a reload.
  const sent = [], shut = [];
  const r2 = R.createRoom({ code: 'KX7S', kind: 'remote', key: 'k'.repeat(32), now: () => 0, send: (s, t) => sent.push([s, JSON.parse(t)]), close: (s, c) => shut.push([s, c]) });
  r2.addHost('tv'); r2.addPhone('ph', 'p'.repeat(20));
  r2.message('tv', '{"relay":"end"}');
  assert.ok(sent.some(([s, m]) => s === 'ph' && m.type === 'host-gone'));
  assert.deepEqual(shut, [['ph', R.CLOSE.hostGone], ['tv', R.CLOSE.ended]]);
  assert.equal(r2.open, false); assert.equal(r2.drop('tv'), null);
  // A phone cannot end it.
  const r3 = R.createRoom({ code: 'KX7T', kind: 'remote', key: 'k'.repeat(32), now: () => 0, send: () => {}, close: () => {} });
  r3.addHost('tv'); r3.addPhone('ph'); r3.message('ph', '{"relay":"end"}'); assert.equal(r3.open, true);
  // Other kinds keep the 4 hours.
  clock = 0;
  const pad = R.createRoom({ code: 'KX7P', kind: 'pad', now: () => clock, send: () => {}, close: () => {} });
  pad.addHost('tv'); clock = 4 * 3600 * 1000 - 1000; pad.message('tv', '{"relay":"lock","on":false}'); clock = 4 * 3600 * 1000 + 1;
  assert.equal(pad.tick(), 'ended');
});

test('the pages are wired: join sends a remote room to /remote/, the site copies it, the page loads it on Phone remote', () => {
  const join = fs.readFileSync(path.join(ROOT, 'play', 'join.html'), 'utf8');
  assert.match(join, /remote: '\/remote\/\?r='/);
  const site = fs.readFileSync(path.join(ROOT, 'scripts', 'site.js'), 'utf8');
  assert.match(site, /path\.join\(ROOT, 'remote'\)/);
  const app = fs.readFileSync(path.join(ROOT, 'scripts', 'lib', 'app.js'), 'utf8');
  assert.match(app, /onclick="remoteOpen\(\)"/);
  assert.match(app, /'remote\/src\/screen\.js','remote\/src\/voidtv\.js'/);
  const phone = fs.readFileSync(path.join(ROOT, 'remote', 'index.html'), 'utf8');
  assert.match(phone, /src="\/remote\/src\/remote\.js"/); assert.match(phone, /src="\/remote\/src\/phone\.js"/);
  for (const f of ['remote/index.html', 'remote/src/remote.js', 'remote/src/screen.js', 'remote/src/phone.js', 'remote/src/voidtv.js', 'remote/README.md']) {
    const t = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.ok(!t.includes(String.fromCharCode(0x2014)), f + ' has an em dash');
  }
  // The one donation ask carries CASH by name and stays off Kids.
  const pj = fs.readFileSync(path.join(ROOT, 'remote', 'src', 'phone.js'), 'utf8');
  assert.match(pj, /Every donation goes to CASH \(cashvalues\.org\)/); assert.match(pj, /site\.donate && !site\.kids/);
});

test('a phone and a screen talk through the local relay: the screen opens a remote room, the join page finds it, the phone asks and is answered', async () => {
  const freePort = () => new Promise((ok) => { const srv = require('net').createServer(); srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => ok(p)); }); });
  const port = await freePort();
  const srv = spawn(process.execPath, [path.join(ROOT, 'play', 'serve.js'), String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await new Promise((ok) => srv.stdout.once('data', ok));
    const base = 'ws://127.0.0.1:' + port, origin = 'http://127.0.0.1:' + port;
    const open = (url) => new Promise((ok, no) => {
      const ws = new WebSocket(url, { headers: { origin } });
      const q = []; let wake = null;
      ws.onmessage = (e) => { q.push(JSON.parse(e.data)); if (wake) { wake(); wake = null; } };
      ws.next = async () => { while (!q.length) await new Promise((w) => { wake = w; }); return q.shift(); };
      ws.onopen = () => ok(ws); ws.onerror = () => no(new Error('refused'));
    });
    const tv = await open(base + '/api/room/open?kind=remote');
    const room = await tv.next();
    assert.equal(room.kind, 'remote');
    const look = await fetch(origin + '/api/room/' + room.code);
    assert.deepEqual(await look.json(), { kind: 'remote' });
    const phone = await open(base + '/api/room/' + room.code + '/join?t=' + 'p'.repeat(20));
    assert.equal((await phone.next()).type, 'hello');
    assert.deepEqual(await tv.next(), { type: 'join', from: 1 });
    phone.send(JSON.stringify({ type: 'r-do', a: 'ch', dir: 1 }));
    const got = await tv.next();
    assert.deepEqual(V.readDo(got.msg), { a: 'ch', dir: 1 });
    tv.send(JSON.stringify({ to: 1, msg: V.nowMsg({ k: 'tv', where: 'Now on The Void', t: 'The Lucy Show', left: 600, acts: [{ a: 'ch', l: 'CH' }] }) }));
    const now = await phone.next();
    assert.equal(now.type, 'r-now'); assert.equal(now.t, 'The Lucy Show');
    tv.close(); phone.close();
  } finally { srv.kill(); }
});
