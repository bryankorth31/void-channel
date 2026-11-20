// PLAY shelf (T14) and the nightly Archive check (T26): shelves by decade in year order, the shelf list matches the
// cards, a game the Archive says is gone leaves the shelf, a bad night changes nothing, and the shelf page is not
// cross-origin isolated (so Archive box art loads) while the player is. Run: node --test "play/test/*.test.js"
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const PLAY = path.join(__dirname, '..');
const Shelf = require('../src/shelf.js');
const Tool = require('../tools/shelf.js');

test('shelves come by decade, oldest first, each in year order', () => {
  const s = Shelf.shelves([{ id: 'b', title: 'B', year: 1991 }, { id: 'a', title: 'A', year: 1982 }, { id: 'c', title: 'C', year: 1989 },
    { id: 'd', title: 'D', year: 2003 }]);
  assert.deepEqual(s.map((x) => x.title), ['The 80s', 'The 90s', 'The 2000s']);
  assert.deepEqual(s[0].games.map((g) => g.id), ['a', 'c']);
});

test('every machine on a card has a name and a box shape on the shelf', () => {
  for (const c of Tool.loadCards()) {
    const sys = Shelf.SYSTEMS[c.system];
    assert.ok(sys && sys.name && /^(bigbox|cart|handheld)$/.test(sys.shape), c.id);
  }
});

test('the committed shelf list matches the cards (run node play/tools/shelf.js after adding a card)', () => {
  const committed = JSON.parse(fs.readFileSync(path.join(PLAY, 'shelf', 'index.json'), 'utf8'));
  const status = JSON.parse(fs.readFileSync(path.join(PLAY, 'shelf', 'status.json'), 'utf8'));
  assert.deepEqual(committed.games, Tool.buildIndex(Tool.loadCards(), status).games);
});

test('a game the Archive says is gone leaves the shelf; the rest stay', () => {
  const cards = Tool.loadCards();
  const status = { checked: 'x', games: { [cards[0].id]: { gone: true } } };
  const ids = Tool.buildIndex(cards, status).games.map((g) => g.id);
  assert.ok(!ids.includes(cards[0].id));
  assert.equal(ids.length, cards.length - 1);
});

test('the nightly check: a hard answer decides, a hiccup keeps the last state', () => {
  const src = fs.readFileSync(path.join(PLAY, 'tools', 'shelf.js'), 'utf8');
  assert.match(src, /\[403, 404, 410\]\.includes\(r\.status\)\) return \{ state: 'gone'/);
  assert.match(src, /a\.state === 'gone' \? true : a\.state === 'ok' \? false : !!before\.gone/);
  assert.match(src, /Range: 'bytes=0-15'/);
  assert.match(src, /PAUSE_MS = \d{4}/);
});

test('the shelf page is plain; the player and its files are cross-origin isolated', async () => {
  const port = 18789 + Math.floor(Math.random() * 500);
  const server = spawn(process.execPath, [path.join(PLAY, 'serve.js')], { env: Object.assign({}, process.env, { PORT: String(port) }) });
  try {
    await new Promise((ok) => server.stdout.once('data', ok));
    const head = (p) => new Promise((ok, fail) => http.get({ host: '127.0.0.1', port, path: p }, (r) => { r.resume(); ok(r.headers); }).on('error', fail));
    const shelf = await head('/play/'), game = await head('/play/game.html'), worker = await head('/play/src/core-worker.js');
    assert.equal(shelf['cross-origin-embedder-policy'], undefined);
    assert.equal(game['cross-origin-embedder-policy'], 'require-corp');
    assert.equal(game['cross-origin-opener-policy'], 'same-origin');
    assert.equal(worker['cross-origin-embedder-policy'], 'require-corp');
  } finally { server.kill(); }
});

test('the game page links back to the shelf', () => {
  const html = fs.readFileSync(path.join(PLAY, 'game.html'), 'utf8');
  assert.match(html, /id="b-games" class="tool" href="\.\/"/);
});
