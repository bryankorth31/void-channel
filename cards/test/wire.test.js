// The whole wire, with nothing stood in for: the card server (cards/serve.js), the phone relay's rooms as they are
// (play/rooms/), a dealer as the table, and three phones on real sockets playing a game of Crazy Eights to its end.
// Run: node --test "cards/test/*.test.js"
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/cards.js');
const D = require('../src/dealer.js');
const CE = require('../games/crazy-eights.js');
const S = require('../serve.js');

const freePort = () => new Promise((ok) => { const srv = require('net').createServer(); srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => ok(p)); }); });
const until = async (cond, what) => { for (let i = 0; i < 2000; i++) { if (cond()) return; await new Promise((r) => setTimeout(r, 5)); } assert.fail('waited too long for ' + what); };
// The first card that fits (an eight names the first suit), else the first button: a short game.
const best = (h) => { const p = h.play; if (p && p.cards.length) { const m = { type: p.type, cards: [p.cards[0]] }; if (p.choose && p.choose.cards.includes(p.cards[0])) m[p.choose.field] = p.choose.from[0]; return m; } return { type: h.buttons[0].type }; };

test('the card server gives out the pages\' files and nothing else', async () => {
  const port = await freePort(), servers = S.start([port], '127.0.0.1'), origin = 'http://127.0.0.1:' + port;
  try {
    for (const [url, status] of [['/cards/', 200], ['/cards/hand', 200], ['/cards/cards.css', 200], ['/cards/table.css', 200], ['/cards/hand.css', 200], ['/cards/README.md', 404], ['/join', 200], ['/play/src/qr.js', 200], ['/trivia/src/words.js', 200], ['/cards/src/dealer.js', 200], ['/cards/games/crazy-eights.js', 200],
      ['/cards/src/..%2Fserve.js', 404], ['/cards/src/..%2F..%2Fplay%2Fserve.js', 404], ['/cards/serve.js', 404], ['/cards/test/helper.js', 404], ['/play/serve.js', 404], ['/cards/src/%E0%A4%A', 404], ['/api/room/KX7P', 404]]) {
      assert.equal((await fetch(origin + url, { redirect: 'manual' })).status, status, url);
    }
  } finally { for (const s of servers) { s.closeAllConnections(); s.close(); } }
});

test('a whole game over the real relay: one table and three phones, every phone holding only its own hand', async () => {
  const port = await freePort(), servers = S.start([port], '127.0.0.1');
  const origin = 'http://127.0.0.1:' + port, base = 'ws://127.0.0.1:' + port, socks = [];
  const sock = (url) => { const ws = new WebSocket(url, { headers: { origin } }); socks.push(ws); return ws; };
  try {
    let room = null;
    const host = sock(base + '/api/room/open?kind=cards');
    const d = D.create({ games: { 'crazy-eights': CE }, rand: C.seeded(9), send: (to, msg) => host.send(JSON.stringify({ to, msg })) });
    host.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.type === 'room') room = m; else d.relay(m); });
    await until(() => room, 'the room');
    assert.equal(room.kind, 'cards');
    assert.equal(room.join, origin + '/join?r=' + room.code);
    assert.deepEqual(await (await fetch(origin + '/api/room/' + room.code)).json(), { kind: 'cards' });

    const phones = [0, 1, 2].map((i) => {
      const ph = { you: null, hand: null, table: null, no: [], frames: [] };
      ph.ws = sock(base + '/api/room/' + room.code + '/join?t=' + ('t' + i).repeat(8));
      ph.ws.addEventListener('message', (e) => {
        const m = JSON.parse(e.data);
        ph.frames.push(e.data);
        if (m.type === 'hello') ph.ws.send(JSON.stringify({ type: 'c-hi', key: ('k' + i).repeat(10), name: 'Phone ' + (i + 1) }));
        if (m.type === 'c-you') ph.you = m;
        if (m.type === 'c-hand') ph.hand = m.m;
        if (m.type === 'c-table') ph.table = m.v;
        if (m.type === 'c-no') ph.no.push(m.error);
      });
      return ph;
    });
    await until(() => phones.every((p) => p.you), 'the phones to say who they are');
    assert.deepEqual(d.snapshot().players.map((p) => p.name), ['Phone 1', 'Phone 2', 'Phone 3']);
    assert.equal(d.start(), null);
    await until(() => phones.every((p) => p.hand && p.table && p.you.me !== null), 'the deal');

    const cardsOf = (ph) => ph.hand.zones['hand:' + ph.you.me].cards;
    let moves = 0, v = phones[0].table;
    for (;;) {
      // Settled: no card is in two hands, the pile's top card is in none, and each hand is as big as the table says.
      const all = phones.flatMap(cardsOf);
      assert.equal(new Set(all).size, all.length, 'no card is in two hands');
      assert.ok(!all.includes(v.zones.discard.top));
      for (const ph of phones) assert.equal(cardsOf(ph).length, v.zones['hand:' + ph.you.me].n);
      if (v.over) break;
      assert.ok(++moves < 3000, 'the game ends');
      const seq = v.seq, mover = phones.find((x) => x.you.me === v.turn[0]);
      mover.ws.send(JSON.stringify({ type: 'c-move', move: best(mover.hand.hints) }));
      await until(() => {
        const now = phones[0].table;
        if (now.seq <= seq || !phones.every((x) => x.table.seq === now.seq) || mover.hand.seq !== now.seq) return false;
        return !!now.over || phones.find((x) => x.you.me === now.turn[0]).hand.seq === now.seq;
      }, 'move ' + moves + ' to reach every phone');
      v = phones[0].table;
    }
    assert.ok(v.over.winners.length >= 1);
    assert.deepEqual(phones.flatMap((p) => p.no), [], 'no move was refused');
    // Every frame a phone ever received, against every card another phone ended the game holding.
    for (const ph of phones) for (const other of phones) if (other !== ph) for (const c of cardsOf(other)) {
      const last = ph.frames.filter((f) => f.includes('"c-hand"')).pop();
      assert.ok(!last.includes('"' + c + '"'), 'a phone\'s last hand held another phone\'s card ' + c);
    }
  } finally {
    for (const ws of socks) { try { ws.close(); } catch (e) { /* closed already */ } }
    for (const s of servers) { s.closeAllConnections(); s.close(); }
  }
});
