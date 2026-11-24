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

test('watch party: a TV that joins takes the first TV\'s time zone (Eastern and Central at the same moment), and one score list names each home', () => {
  const ny = V.tzOff('America/New_York'), chi = V.tzOff('America/Chicago'), kol = V.tzOff('Asia/Kolkata');
  const nov = Date.UTC(2026, 10, 20, 12), jul = Date.UTC(2026, 6, 1, 12);
  assert.equal(ny(nov), -5 * 3600e3); assert.equal(chi(nov), -6 * 3600e3); assert.equal(ny(jul), -4 * 3600e3); assert.equal(kol(nov), 5.5 * 3600e3);
  // The clocks go back at 2 am in New York on 1 Nov 2026 (06:00 UTC): the offset turns there, to the minute.
  assert.equal(ny(Date.UTC(2026, 10, 1, 5, 59)), -4 * 3600e3); assert.equal(ny(Date.UTC(2026, 10, 1, 6, 0)), -5 * 3600e3);
  for (const bad of ['', 'Nowhere/Land', '../etc', 'America/New_York;x', null, 42]) assert.equal(V.tzOff(bad), null, String(bad));
  assert.equal(V.zoneCity('America/Los_Angeles'), 'Los Angeles'); assert.equal(V.zoneCity('junk'), '');
  // The schedule with a zone (scripts/lib/tvgrid.js): Live TV's broadcast day starts at 6 am local, so a TV in Central that takes
  // New York's zone counts the same day at the same instant as the TV in New York, and its own zone starts the day an hour later.
  const G = require('../scripts/lib/tvgrid.js').tvgridFactory();
  const at = Date.UTC(2026, 10, 20, 11, 30);   // 6:30 am in New York, 5:30 am in Chicago
  G.setOff(ny); const dNy = G.dayOf(at);
  G.setOff(chi); const dChi = G.dayOf(at);
  G.setOff((ms) => -new Date(ms).getTimezoneOffset() * 60000);
  assert.equal(dChi, dNy - 1, 'in Chicago it is still the day before, by Live TV\'s 6 am day');
  // The score list: best first, ties share a place, each phone named by its home's city, never a person's name.
  const book = { 1: { score: 1400 }, 3: { score: 700 }, 4: { score: 1400 } };
  const homes = { 1: 'New York', 3: 'Chicago', 4: 'Chicago' };
  const list = V.partyScores(book, [1, 3, 4, 5], (s) => homes[s]);
  assert.deepEqual(list.map((r) => [r.seat, r.place, r.score, r.home]), [[1, 1, 1400, 'New York'], [4, 1, 1400, 'Chicago'], [3, 3, 700, 'Chicago'], [5, 4, 0, '']]);
  assert.equal(V.scoreLine(list, 3), '1st Phone 1 (New York) 1,400 · 1st Phone 4 (Chicago) 1,400 · 3rd Phone 3 (Chicago) 700');
  const big = V.partyScores(Object.fromEntries(Array.from({ length: 16 }, (_, i) => [i + 1, { score: i * 100 }])), Array.from({ length: 16 }, (_, i) => i + 1), () => 'Los Angeles');
  assert.ok(V.fits({ type: 'p-score', list: big.slice(0, 8) }), 'the list for the other TVs fits one message');
});

test('night audit N10: the phone takes no link from a message: its own donation setting, the logo home, a show only at its page on this site', () => {
  // A room's screen can be any script (the relay checks only the Origin header), so nothing it sends becomes a link.
  assert.equal(V.showPath('the-lucy-show'), '/show/the-lucy-show');
  for (const bad of ['javascript:alert(1)', '//evil.example', 'a/b', 'https:x', '', null, '../x', 'x y']) assert.equal(V.showPath(bad), '', String(bad));
  const pj = fs.readFileSync(path.join(ROOT, 'remote', 'src', 'phone.js'), 'utf8');
  const sets = pj.match(/\.href\s*=\s*[^;]+;/g) || [];
  assert.ok(sets.length >= 3, 'the phone sets its links');
  for (const x of sets) assert.match(x, /^\.href = (DONATE_URL|V\.showPath\((info|it)\.slug\));$/, 'every link is the site\'s own: ' + x);
  for (const field of ['site.donate', 'm.home', 'info.url', 'it.url']) assert.ok(!new RegExp('href\\s*=\\s*' + field.replace('.', '\\.')).test(pj), field + ' is never a link');
  // The donation setting is the project's one (scripts/lib/app.js DONATE_URL), as on Trivia's phone page.
  const appDonate = /const DONATE_URL = '([^']+)'/.exec(fs.readFileSync(path.join(ROOT, 'scripts', 'lib', 'app.js'), 'utf8'))[1];
  assert.equal(/const DONATE_URL = '([^']+)'/.exec(pj)[1], appDonate);
  // The logo is a plain link home in the page itself; no message changes it.
  assert.match(fs.readFileSync(path.join(ROOT, 'remote', 'index.html'), 'utf8'), /<a class="mark" id="mark" href="\/">/);
});

test('night audit: a show\'s details go to a phone only past the page\'s own adult door (adult, or Late Night by type or tag)', () => {
  const vm = require('vm');
  const src = fs.readFileSync(path.join(ROOT, 'remote', 'src', 'voidtv.js'), 'utf8');
  const shows = { plain: { slug: 'plain', show: 'Plain' }, ln: { slug: 'ln', show: 'Late', type: 'Late Night' }, tag: { slug: 'tag', show: 'Tagged', tags: ['Late Night'] }, ad: { slug: 'ad', show: 'Adult', adult: 1 } };
  const run = (adult) => {
    const ctx = { self: {}, document: {}, location: { origin: 'https://voidtv.net' }, ME: { adult }, BY_SLUG: shows, urlFor: (s) => '/show/' + s,
      Intl, Object, JSON, Math, Date, Number, String, Array, Map, Set, sessionStorage: { getItem: () => null } };
    ctx.self = ctx; ctx.self.RemoteScreen = {}; ctx.self.VoidRemote = V;
    vm.createContext(ctx);
    vm.runInContext('const isAdult=(s)=>!!(s&&(s.adult||s.type===\'Late Night\'||(s.tags||[]).includes(\'Late Night\')));const gated=(s)=>isAdult(s)&&!ME.adult;' + src, ctx);
    return ctx.self.SiteRemote;
  };
  const shut = run(false), open = run(true);
  assert.equal(shut.info('plain').t, 'Plain');
  for (const s of ['ln', 'tag', 'ad']) { assert.equal(shut.info(s), null, s + ' stays behind the door'); assert.equal(open.info(s).t, shows[s].show, s + ' past the door'); }
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
  assert.match(pj, /Every donation goes to CASH \(cashvalues\.org\)/); assert.match(pj, /if \(site && !site\.kids\)/);
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

// ---- Bryan, 22 Nov 2026: "the phone remote needs to have pause on it and also work for searching and interacting with the direct
// play areas of vtv". From the pictures he picked L1 (Live TV: pause, then catch up, with Back to live) and P1 (PLAY: pick a game
// on the phone, then the phone is its pad). ----

test('pause, play, back to live, search, areas, games and the hand-over are known actions, each with a checked value', () => {
  for (const a of ['pause', 'play', 'live', 'hand']) assert.deepEqual(V.readDo({ type: 'r-do', a }), { a });
  assert.deepEqual(V.readDo({ type: 'r-do', a: 'find', q: '  the love\nboat ' }), { a: 'find', q: 'the love boat' });
  assert.equal(V.readDo({ type: 'r-do', a: 'find', q: 'x'.repeat(300) }), null, 'a search is short');
  for (const q of [undefined, '', '   ', 5, {}]) assert.equal(V.readDo({ type: 'r-do', a: 'find', q }), null, String(q));
  assert.equal(V.readDo({ type: 'r-do', a: 'find', q: 'x'.repeat(100) }).q.length <= 60, true);
  assert.deepEqual(V.readDo({ type: 'r-do', a: 'area', id: 'play' }), { a: 'area', id: 'play' });
  assert.deepEqual(V.readDo({ type: 'r-do', a: 'watch', slug: 'the-love-boat' }), { a: 'watch', slug: 'the-love-boat' });
  // The longest PLAY game id (95 characters) is an id; an address or markup is not.
  const long = 'super-mario-advance-2-super-mario-world-compatible-with-retroachievements-playable-in-browser-gba';
  assert.deepEqual(V.readDo({ type: 'r-do', a: 'game', id: long }), { a: 'game', id: long });
  for (const id of ['<img>', '', 'a b', '//evil', 'x'.repeat(121)]) assert.equal(V.readDo({ type: 'r-do', a: 'game', id }), null, id);
  // An id is only looked up: PLAY starts a game from the shelf's own list, an area from the menu's own list (remote/src/play.js, screen.js).
  assert.match(fs.readFileSync(path.join(ROOT, 'remote', 'src', 'play.js'), 'utf8'), /const g = byId\.get\(cmd\.id\); if \(!g\) return;/);
  assert.match(fs.readFileSync(path.join(ROOT, 'remote', 'src', 'screen.js'), 'utf8'), /root\.VoidAreas\.areas\.find\(\(x\) => x\.id === id && x\.live\)/);
  assert.equal(V.readDo({ type: 'r-do', a: 'press', id: 'javascript:alert(1)' }), null);
});

test('the screen\'s buttons: an id or a slug rides along when the button needs one, About still asks about what is on', () => {
  const n = V.nowMsg({ k: 'page', t: 'Pac-Man', acts: [{ a: 'hand', l: 'Phone as controller' }, { a: 'area', id: 'play', l: 'Back to the games' },
    { a: 'info', l: 'About' }, { a: 'area', id: '<x>', l: 'bad' }, { a: 'find', l: 'no' }, { a: 'eval', l: 'no' }, { a: 'pause', l: 'Pause' }] });
  assert.deepEqual(n.acts, [{ a: 'hand', l: 'Phone as controller' }, { a: 'area', id: 'play', l: 'Back to the games' }, { a: 'info', l: 'About' }, { a: 'pause', l: 'Pause' }]);
  assert.deepEqual(V.nowMsg({ acts: [{ a: 'ch', l: 'CH' }] }).acts, [{ a: 'ch', l: 'CH' }]);
});

test('a list says what a tap on a row does, and the phone sends exactly that (tune when it says nothing)', () => {
  const games = V.listMsgs('games', 'Most played', [{ id: 'pac-man-nes', t: 'Pac-Man', s: 'NES · 1988' }], '', 3, 'game');
  assert.equal(games[0].a, 'game');
  const l = V.listTake({}, games[0]);
  assert.deepEqual(V.rowDo(l, l.items[0]), { type: 'r-do', a: 'game', id: 'pac-man-nes' });
  assert.deepEqual(V.readDo(V.rowDo(l, l.items[0])), { a: 'game', id: 'pac-man-nes' });
  const shows = V.listTake({}, V.listMsgs('find', 'Found', [{ id: 'the-love-boat', t: 'The Love Boat' }], '', 1, 'go')[0]);
  assert.deepEqual(V.rowDo(shows, shows.items[0]), { type: 'r-do', a: 'go', slug: 'the-love-boat' });
  for (const a of [undefined, 'eval', 'find', 'pause']) assert.equal(V.listMsgs('chans', 'On now', [{ id: 'void', t: 'The Void' }], '', 1, a)[0].a, 'tune', String(a));
  assert.equal(V.listTake({}, Object.assign(V.listMsgs('x', 'x', [{ id: 'a', t: 'a' }], '', 1)[0], { a: 'toString' })).a, 'tune');
});

test('night audit N10 holds for the hand-over: the phone gets four letters and builds the join address itself', () => {
  assert.deepEqual(V.handMsg('QANQ', 'the game controller'), { type: 'r-hand', code: 'QANQ', what: 'the game controller' });
  assert.equal(V.handPath(V.handMsg('QANQ', '')), '/join?r=QANQ');
  for (const code of ['qanq', 'QAN', 'QANQQ', 'QA1Q', 'https://evil.example/', '../x', null]) {
    assert.equal(V.handMsg(code, ''), null, String(code));
    assert.equal(V.handPath({ type: 'r-hand', code }), '', String(code));
  }
  assert.equal(V.handPath({ type: 'r-site', code: 'QANQ' }), '');
  const pj = fs.readFileSync(path.join(ROOT, 'remote', 'src', 'phone.js'), 'utf8');
  assert.match(pj, /location\.assign\(to\)/); assert.match(pj, /const to = V\.handPath\(m\)/);
  assert.ok(!/location\.(assign|replace)\([^)]*m\.(url|link|href|home)/.test(pj), 'no address from a message');
  assert.deepEqual(V.awayMsg('Void University'), { type: 'r-away', name: 'Void University' });
});

test('pause on Live TV (L1): how far behind the clock, in words that change once a minute, and Back to live past 20 s', () => {
  assert.equal(V.behind(736, 701), 35); assert.equal(V.behind(700, 705), 0); assert.equal(V.behind(NaN, 3), null);
  // A picture still loading (or switching to a backup copy) reads 0: not behind, no Back to live until it has a frame.
  assert.equal(V.behind(360, 0, false), null); assert.equal(V.behind(360, 350, true), 10);
  assert.equal(V.BEHIND_S, 20);
  assert.equal(V.behindWords(35), 'under a minute behind live'); assert.equal(V.behindWords(59), 'under a minute behind live');
  assert.equal(V.behindWords(61), '1 min behind live'); assert.equal(V.behindWords(250), '4 min behind live');
  // The adapter offers Play from here and Back to live once behind, and the player's own pause and play do the work.
  const src = fs.readFileSync(path.join(ROOT, 'remote', 'src', 'voidtv.js'), 'utf8');
  assert.match(src, /late \? \[\{ a: 'live', l: 'Back to live' \}\]/);
  assert.match(src, /if \(cmd\.a === 'live'\) \{[^}]*tvPlay\(T\.c, false\)/);
  assert.match(src, /if \(cmd\.a === 'pause'\) \{ const p = vp\(\); if \(p && !p\.v\.paused\) p\.pause\(\); return; \}/);
});

test('search: the site\'s own (qHit, shared with the list page), names that start with the words first, past the adult door', () => {
  const app = fs.readFileSync(path.join(ROOT, 'scripts', 'lib', 'app.js'), 'utf8');
  assert.match(app, /const qHit=\(s,q\)=>/); assert.match(app, /&&\(!q\|\|qHit\(s,q\)\)\);/);
  const g = ['Space Panic', 'Ms. Pac-Man', 'Pac-Man', 'Jumper'].map((t) => ({ title: t }));
  assert.deepEqual(V.rankFind(g, 'pac', 9).map((x) => x.title), ['Pac-Man', 'Ms. Pac-Man', 'Space Panic', 'Jumper']);
  assert.equal(V.rankFind(g, 'pac', 2).length, 2);
  assert.deepEqual(V.rankFind([{ show: 'a (b' }, { show: '(b' }], '(b').map((x) => x.show), ['(b', 'a (b'], 'words with signs in them');
  const vm = require('vm');
  const src = fs.readFileSync(path.join(ROOT, 'remote', 'src', 'voidtv.js'), 'utf8');
  const SHOWS = [{ slug: 'b', show: 'Boat People', eps: 2 }, { slug: 'the-love-boat', show: 'The Love Boat', eps: 9 }, { slug: 'boat-ln', show: 'Boat Night', type: 'Late Night', eps: 99 },
    { slug: 'movie-boat', show: 'Boat', eps: 1, year: 1981 }];
  const ctx = { self: {}, document: {}, location: { origin: 'https://voidtv.net' }, ME: { adult: false }, SHOWS, BY_SLUG: {}, Intl, Object, JSON, Math, Date, Number, String, Array, Map, Set, RegExp, sessionStorage: { getItem: () => null } };
  ctx.self = ctx; ctx.self.RemoteScreen = { areaList: () => [] }; ctx.self.VoidRemote = V;
  vm.createContext(ctx);
  vm.runInContext('const isAdult=(s)=>!!(s&&(s.adult||s.type===\'Late Night\'));const gated=(s)=>isAdult(s)&&!ME.adult;const qHit=(s,q)=>s.show.toLowerCase().includes(q);' + src, ctx);
  const f = ctx.self.SiteRemote.find('boat');
  assert.equal(f.a, 'go'); assert.equal(f.id, 'find');
  assert.deepEqual(f.items.map((x) => x.id), ['b', 'movie-boat', 'the-love-boat'], 'starts with first, then the most episodes; the Late Night show stays behind the door');
  assert.equal(f.items[1].s, 'Movie · 1981');
  assert.match(ctx.self.SiteRemote.find('zzz').title, /^Nothing found/);
  assert.equal(ctx.self.SiteRemote.find('  '), null);
});

test('the remote follows the big screen to PLAY and Trivia: each page loads the loader, which loads only for a tab that holds a room', () => {
  for (const [f, area] of [['play/index.html', 'play'], ['play/game.html', 'play'], ['trivia/index.html', 'trivia']]) {
    assert.match(fs.readFileSync(path.join(ROOT, f), 'utf8'), new RegExp('<script src="/remote/src/follow\\.js" defer data-area="' + area + '"></script>'), f);
  }
  const follow = fs.readFileSync(path.join(ROOT, 'remote', 'src', 'follow.js'), 'utf8');
  assert.match(follow, /held = sessionStorage\.getItem\('voidtv-remote-room'\)/); assert.match(follow, /if \(!held\) return;/);
  assert.match(follow, /if \(area !== 'play' && area !== 'trivia'\) return;/);
  // A push reaches a big screen at once: the build stamps the loader on PLAY's pages and Trivia's, and it passes the stamp on.
  assert.ok(fs.readFileSync(path.join(ROOT, 'scripts', 'site.js'), 'utf8').includes(String.raw`.replace(/(src="(?:src|\/remote\/src)\/[a-z0-9-]+\.js)"/g, '$1?v=' + v + '"')`));
  const { stampTrivia } = require('../scripts/trivia/stamp');
  assert.match(stampTrivia('<script src="/remote/src/follow.js" defer data-area="trivia"></script>', 'abc1234'), /follow\.js\?v=abc1234"/);
  assert.match(follow, /s\.src = f \+ \(v \? '\?v=' \+ v : ''\)/);
  // The shelf lends its phone room; the Trivia host tells its open room's code; nothing else of theirs is reached.
  assert.match(fs.readFileSync(path.join(ROOT, 'play', 'src', 'shelf-phones.js'), 'utf8'), /root\.PlayShelfPhones = \{ open: \(\) => start\(false\), count:/);
  assert.match(fs.readFileSync(path.join(ROOT, 'trivia', 'src', 'host.js'), 'utf8'), /window\.TriviaHostRoom = \(\) => \(room\.ws && room\.code\) \|\| '';/);
  for (const f of ['remote/src/follow.js', 'remote/src/play.js', 'remote/src/trivia.js', 'remote/src/party.js']) {
    assert.ok(!fs.readFileSync(path.join(ROOT, f), 'utf8').includes(String.fromCharCode(0x2014)), f + ' has an em dash');
  }
});

test('Trivia: the phone presses only the host\'s own Start, Start the game, Play again and Pause, and only while each shows', () => {
  const vm = require('vm');
  const src = fs.readFileSync(path.join(ROOT, 'remote', 'src', 'trivia.js'), 'utf8');
  const clicked = [];
  const btn = (id, o) => Object.assign({ id, hidden: false, disabled: false, offsetParent: {}, textContent: '', click() { clicked.push(id); } }, o);
  const els = { start: btn('start'), begin: btn('begin', { disabled: true }), again: btn('again', { hidden: true }), pause: btn('pause', { textContent: 'Go on' }), lock: btn('lock') };
  const ctx = { self: {}, document: { getElementById: (id) => els[id] || null }, location: { origin: 'https://voidtv.net' }, Object, String };
  const handed = [];
  ctx.self = ctx; ctx.self.RemoteScreen = { areaList: () => [], hand: (seat, code, w) => handed.push([seat, code, w]), area: () => {} };
  ctx.self.TriviaHostRoom = () => 'EJJN';
  vm.createContext(ctx); vm.runInContext(src, ctx);
  const A = ctx.self.SiteRemote;
  assert.equal(JSON.stringify(A.now().acts.map((x) => x.a + ':' + (x.id || x.l))), JSON.stringify(['hand:Play on this phone', 'press:start', 'play:Go on', 'area:live']));
  for (const id of ['begin', 'again', 'lock', 'b-phones']) A.act({ a: 'press', id }, 1);
  assert.deepEqual(clicked, [], 'a hidden, disabled or unlisted button is never pressed');
  A.act({ a: 'press', id: 'start' }, 1); A.act({ a: 'pause' }, 1); A.act({ a: 'play' }, 1);
  assert.deepEqual(clicked, ['start', 'pause'], 'Pause while paused does nothing; Go on presses the host\'s own button');
  A.act({ a: 'hand' }, 3);
  assert.deepEqual(handed, [[3, 'EJJN', 'Trivia Night']]);
});

test('the phone remote page says voidtv.net in its own two colours, as the site header does (DECISIONS B2; voidverse join J5, Bryan 24 Nov 2026: "Yes, those four")', () => {
  const page = fs.readFileSync(path.join(ROOT, 'remote', 'index.html'), 'utf8');
  const mark = page.match(/<a class="mark" id="mark" href="\/">[\s\S]*?<\/a>/)[0];
  assert.match(mark, /<span class="v">voidtv<\/span><span class="n">\.net<\/span>/);
  assert.equal(mark.replace(/<[^>]+>/g, ''), 'voidtv.net');
  const css = page.match(/<style>([\s\S]*?)<\/style>/)[1];
  assert.match(css, /--brand-pink:#ff4fc8/, 'the wordmark pink');
  assert.match(css, /--brand-blue:#5fe3ff/, 'the wordmark blue (not the page blue #5fd4ff)');
  assert.match(css, /\.mark \.v\{color:var\(--brand-pink\)\}/);
  assert.match(css, /\.mark \.n\{color:var\(--brand-blue\)\}/);
  assert.doesNotMatch(css, /\.mark span\{/, 'no rule colours both halves alike');
});
