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
  const index = JSON.parse(fs.readFileSync(path.join(PLAY, 'shelf', 'index.json'), 'utf8'));
  for (const g of index.games) assert.ok(g.help || (g.b && index.libHow[g.system].help), g.id + ' has a line for the back');
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

test('G1: Wikidata facts match by the same title on the same machine; a near title or another machine does not', () => {
  const F = require('../tools/facts.js');
  const cand = (id, labels, inst, platforms, genres, year) => ({ id, labels, inst, platforms, genres, players: null, year });
  const found = [
    cand('Q1', ['Golden Axe Warrior'], ['Q7889'], ['Q209868'], ['role-playing video game'], 1991),
    cand('Q2', ['Golden Axe'], ['Q7058673'], ['Q209868', 'Q10676'], ["side-scrolling beat 'em up"], 1989),
  ];
  const sms = F.pick({ title: 'Golden Axe', system: 'sms', year: 1989 }, found);
  assert.equal(sms.source, 'https://www.wikidata.org/wiki/Q2', 'not Golden Axe Warrior');
  assert.match(sms.note, /series item/);
  assert.equal(F.pick({ title: 'Golden Axe', system: 'nes', year: 1989 }, found), null, 'not on that machine');
  assert.equal(F.norm('Kirby & The Amazing Mirror'), F.norm('Kirby and the Amazing Mirror'));
  assert.equal(F.searchTitle('Ms. Pac-Man (Lynx)'), 'Ms. Pac-Man');
  assert.equal(F.PLATFORM.lynx[0], 'Q753657', 'the Lynx, not the Atari 7800 (Q753600)');
  // Arcade: the platform is the game's own board, so the same title must come out the same year (give or take one).
  const arcade = [cand('Q1043534', ['Galaga'], ['Q7889'], ['Q3870048', 'Q172742'], ["shoot 'em up"], 1981), cand('Q9', ['Galaga'], ['Q7889'], ['Q1406'], ['remake'], 2008)];
  assert.equal(F.pick({ title: 'Galaga', system: 'arcade', year: 1981 }, arcade).source, 'https://www.wikidata.org/wiki/Q1043534');
  assert.equal(F.pick({ title: 'Galaga', system: 'arcade', year: 1995 }, arcade), null, 'a far year is another game');
  const src = fs.readFileSync(path.join(PLAY, 'tools', 'facts.js'), 'utf8');
  assert.ok(!/mobygames\.com|igdb\.com/i.test(src.replace(/MobyGames and IGDB have terms against this/, '')), 'no other game site is read');
  // Hand-made cards; a whole collection's games get their genres from the facts tool later (plan C2), not by hand.
  for (const c of Tool.loadCards().filter((x) => !x.__b)) assert.ok((c.genre && c.genre.length) || (c.facts && c.facts.source), c.id + ' has a genre, by hand or from Wikidata');
});

test('G2: plain genres, filters that only offer what exists, and the choice kept in the address', () => {
  assert.deepEqual(Shelf.genresOf(['boxing video game']), ['Action', 'Sports and racing']);
  assert.deepEqual(Shelf.genresOf(['2D platform game']), ['Platform']);
  const f = Shelf.readFilter('?m=snes&g=Platform&p=2&d=1990&q=mario&evil=1');
  assert.deepEqual(f, { m: 'snes', g: 'Platform', p: '2', d: '1990', q: 'mario' });
  assert.equal(Shelf.writeFilter(f), '?m=snes&g=Platform&p=2&d=1990&q=mario');
  const games = JSON.parse(fs.readFileSync(path.join(PLAY, 'shelf', 'index.json'), 'utf8')).games;
  assert.deepEqual(games.filter((g) => Shelf.matches(g, f)).map((g) => g.id).sort(), ['super-mario-world', 'super-mario-all-stars-snes'].sort()); // All-Stars: two players since the audit's two-player check
  assert.deepEqual(games.filter((g) => Shelf.matches(g, { q: 'golden' })).map((g) => g.id).sort(), ['golden-axe-genesis', 'golden-axe-sms']);
  for (const k of ['m', 'g', 'p', 'd']) for (const [v] of Shelf.choices(games, k).slice(1)) {
    assert.ok(games.some((g) => Shelf.matches(g, { [k]: v })), k + '=' + v + ' leads to at least one game');
  }
  const html = fs.readFileSync(path.join(PLAY, 'index.html'), 'utf8');
  assert.match(html, /<input id="f-q" class="flt" type="search"/);
  assert.ok(fs.readFileSync(path.join(PLAY, 'src', 'shelf.js'), 'utf8').includes("p.append('No games match these choices. ', b);"));
});

test('Bryan, 20 Nov 2026 ("the card dimension aspect ratio doesn\'t fit the artwork"): every box shows its whole picture at the screenshot\'s own shape', () => {
  const css = fs.readFileSync(path.join(PLAY, 'shelf.css'), 'utf8');
  assert.ok(css.includes('.box .art{aspect-ratio:4/3}'));
  assert.ok(!/\.box\.(bigbox|cart|handheld) \.art\{aspect-ratio/.test(css), 'no tall or square frames');
  assert.ok(css.includes('.box img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;'));
  assert.ok(css.includes('.held .front img{width:100%;height:100%;object-fit:contain;'));
  assert.ok(!/\.box img\{[^}]*object-fit:cover/.test(css));
});

test('the audit: search folds accents, so "pokemon" finds the Pokémon games', () => {
  const games = JSON.parse(fs.readFileSync(path.join(PLAY, 'shelf', 'index.json'), 'utf8')).games;
  const hits = (q) => games.filter((g) => Shelf.matches(g, { q })).length;
  assert.ok(hits('pokemon') >= 5);
  assert.equal(hits('pokemon'), hits('pokémon'));
});
