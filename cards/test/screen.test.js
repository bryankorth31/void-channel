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

test('index.html loads the scripts in the order the page needs', () => {
  const html = read('cards', 'index.html');
  const src = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]);
  // The engine first, then every game there is a rule file for (a new game is one more line), then the page's own script.
  const games = require('fs').readdirSync(require('path').join(__dirname, '..', 'games')).filter((f) => f.endsWith('.js')).map((f) => '/cards/games/' + f);
  assert.deepEqual(src.slice(0, 6), ['/play/src/qr.js', '/trivia/src/words.js', '/cards/src/cards.js', '/cards/src/table.js', '/cards/src/dealer.js', '/cards/src/face.js']);
  assert.deepEqual(src.slice(6, -1).slice().sort(), games.slice().sort(), 'every game in cards/games is loaded by the table page, and nothing else');
  assert.equal(src[src.length - 1], '/cards/src/screen.js');
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
  for (const f of [['cards', 'index.html'], ['cards', 'src', 'screen.js'], ['cards', 'table.css']]) assert.ok(!new RegExp('[' + String.fromCharCode(8211, 8212) + ']').test(read(...f)), f.join('/'));
});
