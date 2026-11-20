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
  assert.ok(src.includes("a.state === 'gone' || a.state === 'changed' ? true : a.state === 'ok' ? false : !!before.gone"));
  // S4: the same file, not just a file: a different size than the card records takes the game off the shelf.
  assert.ok(src.includes("if (card.archive.size && total && total !== card.archive.size) return { state: 'changed', code: total };"));
  for (const c of Tool.loadCards()) assert.ok(c.archive.size > 0, c.id + ' records its file size');
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

test('T25: a box picked up turns over to what a shop box says on its back', () => {
  assert.deepEqual(Shelf.backLines({ system: 'genesis', year: 1989, publisher: 'Sega', players: 2 }), [
    ['Machine', 'Sega Genesis'], ['Year', '1989'], ['Made by', 'Sega'], ['Players', '1 or 2, a gamepad each'],
    ['Plays with', 'a gamepad, the keyboard or touch']]);
  for (const g of JSON.parse(fs.readFileSync(path.join(PLAY, 'shelf', 'index.json'), 'utf8')).games) assert.ok(g.help, g.id + ' has a line for the back');
  const src = fs.readFileSync(path.join(PLAY, 'src', 'shelf.js'), 'utf8');
  for (const bit of ["e.preventDefault(); pickUp(g, a);", "if (e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;",
    "if (now.a && !before.a) play();", "else if (now.b && !before.b) putBack();", "if (e.key === 'Escape' || e.key === 'Backspace')"]) assert.ok(src.includes(bit), bit);
});

test('T25: the idle tour waits a minute, runs only on a couch screen, and any input stops it', () => {
  assert.equal(Shelf.IDLE_MS, 60000);
  const src = fs.readFileSync(path.join(PLAY, 'src', 'shelf.js'), 'utf8');
  assert.ok(src.includes("const couch = () => (padSeen || TV.test(navigator.userAgent)) && !matchMedia('(pointer: coarse)').matches;"));
  assert.ok(src.includes("for (const ev of ['pointerdown', 'pointermove', 'wheel', 'touchstart']) addEventListener(ev, woke, { passive: true });"));
  const css = fs.readFileSync(path.join(PLAY, 'shelf.css'), 'utf8');
  assert.ok(css.includes('@media (prefers-reduced-motion:reduce){.held .turn{transition:none}'));
});
