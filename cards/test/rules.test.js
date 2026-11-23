// The rules card (cards/src/rules.js) and the practice hand's tips in every rule file (Bryan, 23 Nov 2026: "Rules B,
// practice C"). Run: node --test cards/test/rules.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../src/cards.js');
const R = require('../src/rules.js');
const D = require('../src/dealer.js');
const P = require('../src/practice.js');
const T = require('../src/table.js');

const DIR = path.join(__dirname, '..', 'games');
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.js'));
const games = [];
for (const f of files) { const g = require(path.join(DIR, f)); games.push(g); if (g.pairs) games.push(g.pairs); }
const byId = {};
for (const g of games) byId[g.id] = g;
const DASH = new RegExp('[' + String.fromCharCode(8211, 8212) + ']');

test('read: the things a picture may hold', () => {
  assert.deepEqual(R.read('4H'), { kind: 'card', id: '4H' });
  assert.deepEqual(R.read('TC'), { kind: 'card', id: 'TC' });
  assert.deepEqual(R.read('back'), { kind: 'back' });
  assert.deepEqual(R.read('>'), { kind: 'arrow' });
  assert.deepEqual(R.read('suit:H'), { kind: 'suit', suit: 'H' });
  assert.deepEqual(R.read('=0 left'), { kind: 'words', text: '0 left' });
  for (const bad of ['', '1H', '4X', 'suit:X', '=', '=far too many words here', null, 7]) assert.equal(R.read(bad), null, JSON.stringify(bad));
});

test('every game has a rules card: four lines, each a short line under a picture we can draw, from its own pack', () => {
  assert.ok(games.length >= 7, 'every rule file, and Go Fish (pairs)');
  for (const g of games) {
    assert.deepEqual(R.check(g), [], g.id);
    for (const line of g.howto) assert.ok(!DASH.test(line.say), g.id + ': no dash characters');
  }
  // A picture may never show a card the game is played without.
  const bad = Object.assign({}, byId.conquian, { howto: byId.conquian.howto.slice(0, 3).concat([{ show: ['9S'], say: 'A 9' }]) });
  assert.match(R.check(bad).join(' '), /9S is not in this game's pack/);
  assert.match(R.check({ howto: [] }).join(' '), /4 lines/);
});

test('Go Fish (pairs) has its own last line: two of a kind', () => {
  assert.match(byId['go-fish-pairs'].howto[3].say, /pair/);
  assert.match(byId['go-fish'].howto[3].say, /book/);
});

test('the word helpers', () => {
  assert.equal(R.list([]), '');
  assert.equal(R.list(['a']), 'a');
  assert.equal(R.list(['a', 'b']), 'a and b');
  assert.equal(R.list(['a', 'b', 'c']), 'a, b and c');
  assert.equal(R.an('4'), 'a 4');
  assert.equal(R.an('8'), 'an 8');
  assert.equal(R.an('ace'), 'an ace');
  assert.equal(R.an('king'), 'a king');
  assert.equal(R.ranks('7'), '7s');
  assert.equal(R.ranks('K'), 'kings');
  assert.equal(R.suit('H'), 'hearts');
});

// The cards a tip names, as ids, from its words ("the 4 of clubs", "your 8 of hearts").
const NAME = /\b(ace|king|queen|jack|10|[2-9]) of (spades|hearts|diamonds|clubs)\b/g;
const RANK = { ace: 'A', king: 'K', queen: 'Q', jack: 'J', 10: 'T' };
const SUIT = { spades: 'S', hearts: 'H', diamonds: 'D', clubs: 'C' };
const named = (words) => [...String(words).matchAll(NAME)].map((m) => (RANK[m[1]] || m[1]) + SUIT[m[2]]);
// Every card a viewer may see now: the faces in the view's zones, and those the events carried.
function seen(view, events, extra) {
  const out = new Set();
  for (const z of Object.values((view && view.zones) || {})) {
    if (z && Array.isArray(z.cards)) z.cards.forEach((c) => out.add(c));
    if (z && z.top) out.add(z.top);
  }
  for (const e of events || []) if (e && Array.isArray(e.cards)) e.cards.forEach((c) => out.add(c));
  for (const z of Object.values((extra && extra.zones) || {})) if (z && Array.isArray(z.cards)) z.cards.forEach((c) => out.add(c));
  return out;
}

// A whole practice hand by chance, the table playing every seat but the first, which a "person" plays through the same
// moves. The big screen's tip is made after every change from the public view, the phone's on every one of the person's
// turns from their own message; each must name only cards its screen may show.
function practiceGame(game, seed, onTip) {
  const queue = [], sent = [];
  let practice = null;
  const dealing = { games: byId, opts: {}, rand: C.seeded(seed),
    send: (to, msg) => { if (practice && practice.deliver(to, msg)) return; sent.push([to, msg]); },
    onChange: (events) => {
      if (!practice || !practice.on) return;
      const s = dealer.snapshot();
      if (s.view) onTip('table', game.teach.table(s.view, events, (i) => 'Player ' + (i + 1)), s.view, events);
    } };
  const dealer = D.create(dealing);
  practice = P.create({ dealer, games: byId, rand: C.seeded(seed + 7), schedule: (fn) => { queue.push(fn); return queue.length; }, cancel() {} });
  dealer.relay({ type: 'join', from: 1 });
  dealer.relay({ from: 1, msg: { type: 'c-hi', key: 'person-key-0123456789', name: 'Ann' } });
  dealer.pick(game.id);
  practice.begin(game, 1);
  dealing.opts = (game.practice && game.practice.opts) || {};
  assert.equal(dealer.start(), null);
  dealing.opts = {};
  // The person's phone: what it was last told.
  let table = null, mine = null, me = null, steps = 0;
  const read = () => {
    for (const [to, msg] of sent.splice(0)) {
      if (to !== 1 && to !== 'all') assert.fail('only the person\'s phone and everyone are written to, not ' + to);
      if (msg.type === 'c-table') table = msg;
      if (msg.type === 'c-hand') mine = msg.m;
      if (msg.type === 'c-you') me = msg.me;
    }
  };
  while (steps++ < 20000) {
    read();
    if (table && table.v.over) break;
    if (table && mine && mine.hints && table.v.turn.includes(me)) {
      onTip('phone', game.teach.phone(mine, table.v, me), table.v, [], mine);
      for (const move of P.candidates(game, mine, table.v, me, C.seeded(steps))) {
        dealer.relay({ from: 1, msg: { type: 'c-move', move } });
        const no = sent.some(([to, m]) => to === 1 && m.type === 'c-no');
        if (!no) break;
        sent.splice(0, sent.length, ...sent.filter(([, m]) => m.type !== 'c-no'));
      }
      continue;
    }
    if (!queue.length) break;
    queue.shift()();
  }
  read();
  return { over: !!(table && table.v.over), steps };
}

test('a practice hand of every game plays to the end, and every tip names only cards its own screen may show', () => {
  for (const g of games) {
    for (const seed of [1, 2, 3]) {
      let tips = 0;
      const r = practiceGame(g, seed, (where, words, view, events, own) => {
        assert.equal(typeof words, 'string', g.id + ' ' + where);
        if (!words) return;
        tips++;
        assert.ok(!/undefined|null|NaN|\[object/.test(words), g.id + ' ' + where + ': ' + words);
        assert.ok(!DASH.test(words), g.id + ': no dash characters');
        assert.ok(words.length <= (where === 'table' ? 150 : 190), g.id + ' ' + where + ' tip too long (' + words.length + '): ' + words);
        const may = seen(view, events, own);
        // Hearts names the queen of spades as a rule ("High hearts and the queen of spades are good to pass"), never as a card held.
        for (const c of named(words.replace(/hearts? (and|or) the queen of spades/g, ''))) assert.ok(may.has(c), g.id + ' ' + where + ' tip names ' + c + ', which its screen may not show: ' + words);
      });
      assert.ok(r.over, g.id + ' seed ' + seed + ' did not finish (' + r.steps + ' steps)');
      assert.ok(tips > 3, g.id + ' gave tips');
    }
  }
});

test('the big screen\'s tip is made from the public view alone: a hand in it changes nothing', () => {
  // Two tables alike in public, different in a hidden hand, give the same tip.
  for (const g of games) {
    const a = T.create(g, { players: 3 > g.players.max ? g.players.max : Math.max(3, g.players.min), rand: C.seeded(5) });
    const v = T.view(g, a.state, null), who = (i) => 'P' + i;
    const tip = g.teach.table(v, a.events, who);
    const b = JSON.parse(JSON.stringify(a.state));
    const h = b.zones['hand:0'];
    if (h && h.length > 1) h.reverse();
    assert.equal(g.teach.table(T.view(g, b, null), a.events, who), tip, g.id);
  }
});
