// The big-screen table page (cards/index.html, cards/src/screen.js): its pure parts, and what the files must keep to.
// Run: node --test cards/test/screen.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const S = require('../src/screen.js');

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', '..', ...p), 'utf8');
const names = [{ name: 'Sam' }, { name: 'Kim' }, { name: 'Lee' }, { name: 'Ana' }];

test('seatSpots: the first seat is at the bottom centre and the rest go clockwise', () => {
  assert.deepEqual(S.seatSpots(1), [{ x: 50, y: 82 }]);
  const four = S.seatSpots(4);
  assert.equal(four.length, 4);
  assert.deepEqual(four[0], { x: 50, y: 82 });
  assert.ok(four[1].x < 50 && Math.abs(four[1].y - 50) < 0.01, 'next is on the left');
  assert.ok(Math.abs(four[2].x - 50) < 0.01 && four[2].y < 50, 'then the top');
  assert.ok(four[3].x > 50, 'then the right');
});

test('seatSpots: for 1 to 16 players no plates overlap and none is in the corner where the small code sits', () => {
  for (let n = 1; n <= 16; n++) {
    const spots = S.seatSpots(n), box = S.plateBox(n);
    assert.equal(spots.length, n);
    spots.forEach((a, i) => {
      assert.ok(a.x - box.w / 2 >= 0 && a.x + box.w / 2 <= 100 && a.y - box.h / 2 >= 0 && a.y + box.h / 2 <= 100, 'n=' + n + ' seat ' + i + ' is on the screen');
      assert.ok(!(a.x + box.w / 2 > 85 && a.y + box.h / 2 > 76), 'n=' + n + ' seat ' + i + ' is in the bottom right corner');
      for (let j = i + 1; j < n; j++) {
        const b = spots[j];
        assert.ok(Math.abs(a.x - b.x) >= box.w || Math.abs(a.y - b.y) >= box.h, 'n=' + n + ' seats ' + i + ' and ' + j + ' overlap');
      }
    });
  }
});

test('turnLine: one, several, everyone, nobody', () => {
  assert.equal(S.turnLine({ n: 4, turn: [1] }, names), 'Kim to play');
  assert.equal(S.turnLine({ n: 4, turn: [0, 2] }, names), 'Sam and Lee to play');
  assert.equal(S.turnLine({ n: 4, turn: [0, 1, 2] }, names), 'Sam, Kim and Lee to play');
  assert.equal(S.turnLine({ n: 4, turn: [0, 1, 2, 3] }, names), 'Everyone to play');
  assert.equal(S.turnLine({ n: 4, turn: [] }, names), '');
  assert.equal(S.turnLine(null, names), '');
  assert.equal(S.turnLine({ n: 2, turn: [1] }, []), 'Player 2 to play');
});

test('winnerLine: one winner, a tie, and no result', () => {
  assert.equal(S.winnerLine({ over: { winners: [2] } }, names), 'Lee wins');
  assert.equal(S.winnerLine({ over: { winners: [0, 3] } }, names), 'Sam and Ana win');
  assert.equal(S.winnerLine({ over: { winners: [] } }, names), '');
  assert.equal(S.winnerLine({ over: null }, names), '');
});

test('trickSeat: counted from whoever led, round the table', () => {
  const v = { n: 4, pub: { led: 2 } };
  assert.deepEqual([0, 1, 2, 3].map((i) => S.trickSeat(v, i)), [2, 3, 0, 1]);
  assert.equal(S.trickSeat({ n: 4, pub: { led: null } }, 0), null);
  assert.equal(S.trickSeat({ n: 4, pub: {} }, 0), null);
});

test('joinHost: the host from the join address, with /join', () => {
  assert.equal(S.joinHost('https://voidtv.net/join?c=ABCD'), 'voidtv.net/join');
  assert.equal(S.joinHost('http://127.0.0.1:8791/join?c=ABCD'), '127.0.0.1:8791/join');
  assert.equal(S.joinHost('not a url'), 'voidtv.net/join');
  assert.equal(S.joinHost(undefined), 'voidtv.net/join');
});

test('heldTrick: the events of the move that takes a trick give its cards, who led and who won; no other move does', () => {
  const four = ['KD', '9D', '2D', 'AD'];
  const events = [
    { ev: 'move', from: 'hand:3', to: 'trick', n: 1, cards: ['AD'], by: 3 },
    { ev: 'trick', won: 3, led: 0 },
    { ev: 'move', from: 'trick', to: 'won:3', n: 4, cards: four },
  ];
  assert.deepEqual(S.heldTrick(events), { cards: four, led: 0, won: 3 });
  assert.notEqual(S.heldTrick(events).cards, four, 'a copy, not the event\'s own list');
  assert.equal(S.heldTrick(events.slice(0, 1)), null, 'a card played to the trick takes nothing');
  assert.equal(S.heldTrick([events[1]]), null, 'no cards in the events: nothing to hold');
  assert.equal(S.heldTrick([{ ev: 'move', from: 'trick', to: 'won:3', n: 4 }, events[1]]), null, 'a move that does not carry the cards (they were not all face up) holds nothing');
  assert.equal(S.heldTrick([{ ev: 'trick', won: 'x', led: 0 }, events[2]]), null);
  assert.equal(S.heldTrick(undefined), null);
  assert.equal(S.heldTrick([null, 4, 'x']), null);
});

test('trickCards: the trick being played in front of the seats that played it, else the one just taken, else nothing', () => {
  const live = { n: 4, pub: { led: 2 }, zones: { trick: { n: 2, cards: ['QS', '2C'] } } };
  assert.deepEqual(S.trickCards(live, null), [{ card: 'QS', seat: 2 }, { card: '2C', seat: 3 }]);
  const empty = { n: 4, pub: { led: 1 }, zones: { trick: { n: 0, cards: [] } } };
  const held = { cards: ['KD', '9D', '2D', 'AD'], led: 1, won: 0 };
  assert.deepEqual(S.trickCards(empty, held), [{ card: 'KD', seat: 1 }, { card: '9D', seat: 2 }, { card: '2D', seat: 3 }, { card: 'AD', seat: 0 }], 'the taken trick lies in front of the four seats, counted from whoever led it');
  assert.deepEqual(S.trickCards(live, held), [{ card: 'QS', seat: 2 }, { card: '2C', seat: 3 }], 'a card played to the next trick ends the hold');
  assert.deepEqual(S.trickCards(empty, null), []);
  assert.deepEqual(S.trickCards({ n: 4, pub: {}, zones: {} }, held), [{ card: 'KD', seat: 1 }, { card: '9D', seat: 2 }, { card: '2D', seat: 3 }, { card: 'AD', seat: 0 }], 'a game with no trick zone shows only what was held');
  assert.deepEqual(S.trickCards(null, held), []);
  assert.deepEqual(S.trickCards({ n: 4, pub: { led: null }, zones: { trick: { n: 1, cards: ['QS'] } } }, null), [], 'a trick whose leader is not known is not placed');
});

test('cutGroups: a zone cut into its groups by the sizes the game gives', () => {
  const cards = ['5H', '5C', '5D', 'AS', '2S', '3S', '4S'];
  assert.deepEqual(S.cutGroups(cards, [3, 4]), [['5H', '5C', '5D'], ['AS', '2S', '3S', '4S']]);
  assert.deepEqual(S.cutGroups(cards, []), [cards], 'no cuts: the whole zone is one group');
  assert.deepEqual(S.cutGroups(cards, undefined), [cards]);
  assert.deepEqual(S.cutGroups(cards, [3]), [['5H', '5C', '5D'], ['AS', '2S', '3S', '4S']], 'cards past the last cut make one more group');
  assert.deepEqual(S.cutGroups(cards, [3, 9]), [['5H', '5C', '5D'], ['AS', '2S', '3S', '4S']], 'a cut larger than what is left takes what is left');
  assert.deepEqual(S.cutGroups(cards, [0, -1, 2.5, 'x', 3, 4]), [['5H', '5C', '5D'], ['AS', '2S', '3S', '4S']], 'sizes that are not whole numbers above 0 are skipped');
  assert.deepEqual(S.cutGroups([], [3]), []);
  assert.deepEqual(S.cutGroups(null, [3]), []);
  assert.deepEqual(S.cutGroups(['AH', '2H', '3H'], [3, 3, 3]), [['AH', '2H', '3H']], 'cuts past the cards make no empty groups');
});

test('seatNote and seatSide: the game line for a seat and the side it plays for', () => {
  const v = { pub: { notes: ['Bid 3, took 2', '', 'Nil, took 0'], teams: [0, 1, 0, 1] } };
  assert.equal(S.seatNote(v, 0), 'Bid 3, took 2');
  assert.equal(S.seatNote(v, 1), '');
  assert.equal(S.seatNote(v, 7), '');
  assert.equal(S.seatNote({ pub: {} }, 0), '');
  assert.equal(S.seatNote({ pub: { notes: [4] } }, 0), '', 'only words');
  assert.equal(S.hasNotes(v), true);
  assert.equal(S.hasNotes({ pub: {} }), false);
  assert.deepEqual([0, 1, 2, 3].map((i) => S.seatSide(v, i)), [0, 1, 0, 1]);
  assert.equal(S.seatSide({ pub: {} }, 0), null);
  assert.equal(S.seatSide({ pub: { teams: ['a'] } }, 0), null);
});

test('centreItems: the pack, then sets and runs, then the pile or the card on offer, then the waste', () => {
  // Rummy: the pack, the melds in groups, the top of the pile.
  const rummy = { zones: { draw: { n: 20 }, discard: { n: 2, top: '9C' }, melds: { n: 7, cards: ['5H', '5C', '5D', 'AS', '2S', '3S', '4S'] }, 'hand:0': { n: 7 } }, pub: { cuts: { melds: [3, 4] } } };
  assert.deepEqual(S.centreItems(rummy), [
    { kind: 'pack', n: 20 },
    { kind: 'groups', id: 'melds', groups: [['5H', '5C', '5D'], ['AS', '2S', '3S', '4S']] },
    { kind: 'pile', card: '9C' }]);
  // No sets yet, and an empty pack: only the pile.
  assert.deepEqual(S.centreItems({ zones: { draw: { n: 0 }, discard: { n: 1, top: '9C' }, melds: { n: 0, cards: [] } }, pub: { cuts: { melds: [] } } }), [{ kind: 'pile', card: '9C' }]);
  // Conquian: the pack, the card on offer drawn where the pile's top card goes, the waste with its top card.
  const conquian = { zones: { draw: { n: 17 }, offer: { n: 1, cards: ['7H'] }, waste: { n: 3, top: 'KC' }, 'laid:0': { n: 3, cards: ['AH', '2H', '3H'] } }, pub: { cuts: { 'laid:0': [3], 'laid:1': [] } } };
  assert.deepEqual(S.centreItems(conquian), [{ kind: 'pack', n: 17 }, { kind: 'offer', card: '7H' }, { kind: 'waste', top: 'KC', n: 3 }],
    'a player\'s laid cards (a zone with a colon) are not in the middle');
  assert.deepEqual(S.centreItems({ zones: { draw: { n: 17 }, offer: { n: 0, cards: [] }, waste: { n: 0 } }, pub: { cuts: {} } }), [{ kind: 'pack', n: 17 }, { kind: 'offer', card: null }], 'nothing on offer is an empty place, an empty waste is not drawn');
  // A game with neither (Crazy Eights, Spades): as before.
  assert.deepEqual(S.centreItems({ zones: { draw: { n: 30 }, discard: { n: 4, top: 'QD' } }, pub: {} }), [{ kind: 'pack', n: 30 }, { kind: 'pile', card: 'QD' }]);
  assert.deepEqual(S.centreItems({ zones: { draw: { n: 0 }, trick: { n: 2, cards: ['QS', '2C'] } }, pub: {} }), []);
  assert.deepEqual(S.centreItems(null), []);
});

test('laidGroups: a player\'s laid cards as groups, cut by the game, or one group when it gives no cuts', () => {
  const v = { zones: { 'laid:0': { n: 7, cards: ['5H', '5C', '5D', 'AS', '2S', '3S', '4S'] }, 'laid:1': { n: 0, cards: [] } }, pub: { cuts: { 'laid:0': [3, 4] } } };
  assert.deepEqual(S.laidGroups(v, 0), [['5H', '5C', '5D'], ['AS', '2S', '3S', '4S']]);
  assert.deepEqual(S.laidGroups(v, 1), []);
  assert.deepEqual(S.laidGroups(v, 2), []);
  const books = { zones: { 'laid:1': { n: 8, cards: ['2H', '2S', '2C', '2D', '3H', '3S', '3C', '3D'] } }, pub: {} };
  assert.equal(S.laidGroups(books, 1).length, 1, 'with no cuts (Go Fish books) the laid cards are one row, as before');
});

test('laidAnchor: groups start at the plate\'s inner edge, never under the plate, and stay clear of the small code', () => {
  for (let n = 2; n <= 8; n++) {
    const box = S.plateBox(n);
    for (const spot of S.seatSpots(n)) {
      const at = S.laidAnchor(spot);
      assert.ok(at.max > 0 && at.edge >= 0);
      const left = at.side === 'left' ? at.edge : 100 - at.edge - at.max, right = left + at.max;
      assert.ok(at.side === 'left' ? left >= spot.x + box.w / 2 : right <= spot.x - box.w / 2, 'n=' + n + ' groups beside the plate, not under it');
      assert.ok(left >= 0 && right <= 100, 'n=' + n + ' on the screen');
      assert.ok(!(right > 89.5 && spot.y + 5 > 76), 'n=' + n + ' clear of the small code in the bottom right');
    }
  }
  assert.equal(S.laidAnchor({ x: 50, y: 82 }).side, 'left', 'a seat in the middle column sends its groups to the right of the plate (anchored on the left edge)');
  assert.equal(S.laidAnchor({ x: 89, y: 50 }).side, 'right');
});

test('index.html loads the scripts in the order the page needs', () => {
  const html = read('cards', 'index.html');
  const src = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]);
  // The engine first, then every game there is a rule file for (a new game is one more line), then the motion and the
  // page's own script.
  const games = require('fs').readdirSync(require('path').join(__dirname, '..', 'games')).filter((f) => f.endsWith('.js')).map((f) => '/cards/games/' + f);
  assert.deepEqual(src.slice(0, 6), ['/play/src/qr.js', '/trivia/src/words.js', '/cards/src/cards.js', '/cards/src/table.js', '/cards/src/dealer.js', '/cards/src/face.js']);
  assert.deepEqual(src.slice(6, -2).slice().sort(), games.slice().sort(), 'every game in cards/games is loaded by the table page, and nothing else');
  assert.deepEqual(src.slice(-2), ['/cards/src/motion.js', '/cards/src/screen.js']);
  const css = [...html.matchAll(/<link[^>]*\shref="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(css, ['/cards/cards.css', '/cards/table.css']);
  assert.ok(!/\son[a-z]+\s*=/i.test(html), 'no inline event handlers');
});

test('screen.js asks the dealer for relay, pick, start, stop and snapshot only', () => {
  const js = read('cards', 'src', 'screen.js');
  const used = new Set([...js.matchAll(/\bdealer\.(\w+)/g)].map((m) => m[1]));
  assert.ok(used.size > 0);
  for (const u of used) assert.ok(['relay', 'pick', 'start', 'stop', 'snapshot'].includes(u), 'the page uses dealer.' + u);
  for (const u of ['relay', 'pick', 'start', 'stop', 'snapshot']) assert.ok(used.has(u), 'the page should use dealer.' + u);
  assert.ok(!/innerHTML\s*=/.test(js.replace(/box\.innerHTML = root\.PlayQR\.svg\(room\.join, 8\);/, '')), 'innerHTML only for the QR code');
});

test('the donation words appear once, in screen.js, and the link goes where the site keeps it', () => {
  const js = read('cards', 'src', 'screen.js'), html = read('cards', 'index.html');
  const words = 'If you found this service helpful, please think of donating to keep it running and to make more services like this possible. Every donation goes to CASH (cashvalues.org) and feeds its mission in the real world.';
  const count = (text) => text.split(words).length - 1;
  assert.equal(count(js) + count(html), 1);
  const mine = js.match(/^\s*const DONATE_URL = '([^']+)'/m), site = read('scripts', 'lib', 'app.js').match(/^const DONATE_URL = '([^']+)'/m);
  assert.ok(mine && site);
  assert.equal(mine[1], site[1]);
  assert.equal(S.DONATE_URL, site[1]);
});

test('no dash characters in the page files', () => {
  for (const f of [['cards', 'index.html'], ['cards', 'src', 'screen.js'], ['cards', 'src', 'motion.js'], ['cards', 'table.css']]) assert.ok(!new RegExp('[' + String.fromCharCode(8211, 8212) + ']').test(read(...f)), f.join('/'));
});

test('laidScale: a few groups keep the usual size; a table full of pairs or books gets smaller cards, never taller than 14 units', () => {
  const g = (k, n) => Array.from({ length: n }, () => Array(k).fill('x'));
  assert.equal(S.laidScale(g(3, 2), 31), 0.7, 'two sets of three: the usual size');
  assert.equal(S.laidScale([], 31), 0.7);
  const tall = (groups, max, sc) => { const room = max / sc; let rows = 1, x = 0; for (const grp of groups) { const w = 5.7 + (grp.length - 1) * 2.3; if (x && x + 2 + w > room) { rows++; x = w; } else x += (x ? 2 : 0) + w; } return (rows * 8.8 - 1.1) * sc; };
  for (const [k, n] of [[2, 13], [2, 26], [4, 7], [4, 13], [3, 6]]) for (const max of [22, 31]) {
    const sc = S.laidScale(g(k, n), max);
    assert.ok(sc <= 0.7 && sc >= 0.3, k + 'x' + n);
    if (sc > 0.3) assert.ok(tall(g(k, n), max, sc) <= 14, k + ' cards a group, ' + n + ' groups, in ' + max + ': ' + sc);
  }
  assert.ok(S.laidScale(g(2, 13), 31) < 0.7, 'thirteen pairs come down a size');
  assert.ok(S.laidScale(g(4, 13), 31) <= S.laidScale(g(2, 13), 31), 'books of four need at least as much room as pairs');
});
