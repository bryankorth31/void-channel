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

// Bryan, 20 Nov 2026: "a hero that cycles thru the most popular games/consoles. below the cycling hero it should be the
// rows like voidtv starting with continue playing, and then genres and filters as rows ... filter towards the most popular".
test('the front page: rows like VoidTV, each a filter, the most played first (the newer between equals)', () => {
  const g = (id, o) => Object.assign({ id, title: id.toUpperCase(), system: 'nes', players: 1, plays: 0, genres: [] }, o);
  const games = [g('a', { plays: 50, year: 1990 }), g('b', { plays: 900, year: 1985, system: 'genesis', genres: ['Action'] }),
    g('c', { plays: 50, year: 1994, genres: ['Action'] }), g('d', { plays: 10, system: 'arcade', year: 1981, players: 2 })];
  assert.deepEqual(games.slice().sort(Shelf.byPopular).map((x) => x.id), ['b', 'c', 'a', 'd']);
  const rows = Shelf.homeRows(games);
  assert.equal(rows[0].title, 'Most played');
  assert.deepEqual(rows.map((r) => r.title), ['Most played', '90s consoles', 'Nintendo', 'Sega', 'Action', 'Classic arcade and early games', 'Two at once']);
  assert.deepEqual(rows.find((r) => r.title === 'Action').games.map((x) => x.id), ['b', 'c']);
  // A row's "See all" is its filter, kept in the address, and the list it opens is called by the row's name.
  for (const r of rows) assert.equal(Shelf.viewTitle(Shelf.readFilter(Shelf.writeFilter(r.f))), r.title);
  assert.deepEqual(Shelf.readFilter('?s=sega&s2=x'), { s: 'sega' });
  assert.deepEqual(Shelf.readFilter('?s=nonsense'), {}, 'a set the page does not know is dropped');
  assert.equal(Shelf.viewTitle({ m: 'snes', p: '2' }), 'Super Nintendo, Two at once');
  assert.equal(Shelf.viewTitle({ s: 'sega', m: 'genesis' }), 'Sega Genesis');
  // Every set row on the real shelf has games, and Continue playing comes first, from the saves in this browser.
  const index = JSON.parse(fs.readFileSync(path.join(PLAY, 'shelf', 'index.json'), 'utf8'));
  for (const k of Object.keys(Shelf.SETS)) assert.ok(index.games.some((x) => Shelf.matches(x, { s: k })), k);
  const src = fs.readFileSync(path.join(PLAY, 'src', 'shelf.js'), 'utf8');
  assert.ok(src.includes("const sec = rowSection('Continue playing', list);") && src.includes('if (sec && turn === shown) rows.prepend(sec);'));
  assert.ok(src.includes(".filter((k) => k.endsWith(':auto'))"));
  assert.ok(fs.readFileSync(path.join(PLAY, 'src', 'saves.js'), 'utf8').includes("keys: () => run('readonly', (s) => s.getAllKeys()),"));
});

test("a list opens with its own rows, like VoidTV's pages for one kind of show; a search or a short list is just its games", () => {
  const g = (id, o) => Object.assign({ id, title: id, system: 'genesis', players: 1, plays: 0, year: 1991, genres: [] }, o);
  const games = [];
  for (let i = 0; i < 30; i++) games.push(g('g' + i, { plays: i, genres: i < 6 ? ['Action'] : [] }));
  for (let i = 0; i < 10; i++) games.push(g('s' + i, { system: 'sms', plays: 100 + i, year: 1987, players: i < 2 ? 2 : 1 }));
  const rows = Shelf.listRows(games, { s: 'sega' });
  assert.deepEqual(rows.map((r) => r.title), ['Most played', 'Sega Genesis', 'Master System', 'Action', 'The 80s', 'The 90s']);
  assert.equal(rows[0].f, null, 'the most played row needs no See all: every game follows');
  assert.deepEqual(rows[1].f, { s: 'sega', m: 'genesis' }, 'a row narrows the list it sits in');
  assert.equal(rows[0].games[0].id, 's9');
  assert.ok(!rows.some((r) => r.title === 'Two at once'), 'a row of fewer than four is left out');
  assert.deepEqual(Shelf.listRows(games, { q: 'g' }), []);
  assert.deepEqual(Shelf.listRows(games.slice(0, 20), { m: 'genesis' }), []);
  const src = fs.readFileSync(path.join(PLAY, 'src', 'shelf.js'), 'utf8');
  assert.ok(src.includes("sec.append(el('h2', '', 'Every game, A to Z'));"));
});

test("the hero turns through each machine's most played game, a machine between every two", () => {
  const g = (id, system, plays) => ({ id, title: id, system, plays, year: 1990, players: 1, genres: [] });
  const s = Shelf.heroSlides([g('n1', 'nes', 30), g('n2', 'nes', 20), g('s1', 'snes', 10), g('a1', 'arcade', 99), g('d1', 'dos', 5)], 8, 2);
  assert.deepEqual(s.map((x) => (x.g ? x.g.id : '[' + x.system + ']')), ['a1', 'n1', '[arcade]', 's1', 'd1', '[nes]']);
  assert.deepEqual(s[5].games.map((x) => x.id), ['n1', 'n2']);
  assert.equal(s[5].count, 2);
  const index = JSON.parse(fs.readFileSync(path.join(PLAY, 'shelf', 'index.json'), 'utf8'));
  const real = Shelf.heroSlides(index.games);
  assert.equal(real.length, 12);
  // Bryan's banner list (play/shelf/front-picks.json) opens it in his order; the rest is each machine's best.
  const banner = JSON.parse(fs.readFileSync(path.join(PLAY, 'shelf', 'front-picks.json'), 'utf8')).banner;
  const firstGames = real.filter((x) => x.g).map((x) => x.g.item);
  assert.deepEqual(firstGames.slice(0, banner.length), banner);
  assert.notEqual(real[0].g && real[0].g.title, 'The Oregon Trail');
  assert.equal(Shelf.HERO_MS, 8000);
  const src = fs.readFileSync(path.join(PLAY, 'src', 'shelf.js'), 'utf8');
  assert.ok(src.includes("if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;"), 'no turning by itself for less motion');
  assert.ok(src.includes('if (!heroHeld && !document.hidden && isHome()) heroGo(heroAt + 1);'), 'held still while rested on or a box is in hand');
});

test("a card's info says what the game is, from its card; plays read in plain words", () => {
  assert.equal(Shelf.aboutLine({ system: 'snes', publisher: 'Nintendo', year: 1991, players: 2, genres: ['Platform'] }),
    'A platform game for the Super Nintendo, made by Nintendo in 1991. One or two players.');
  assert.equal(Shelf.aboutLine({ system: 'arcade', year: 1981, players: 1, genres: [] }), 'A game from the arcades in 1981.');
  assert.equal(Shelf.aboutLine({ system: 'dos', publisher: 'MECC', players: 4, genres: ['Adventure'] }), 'An adventure for the PC, made by MECC. One to four players.');
  assert.equal(Shelf.playsText(13974767), '14 million plays');
  assert.equal(Shelf.playsText(2165497), '2.2 million plays');
  assert.equal(Shelf.playsText(12353), '12,353 plays');
  assert.equal(Shelf.playsText(0), '');
  // The auditor: the counts are the Internet Archive's, not voidtv.net's, and every place they show says so.
  const js = fs.readFileSync(path.join(PLAY, 'src', 'shelf.js'), 'utf8');
  assert.equal((js.match(/playsText(g.plays)/g) || []).length, (js.match(/playsText(g.plays) + ' on the Internet Archive'/g) || []).length);
  // Every game on the shelf carries its plays (play/shelf/plays.json, refreshed with node play/tools/shelf.js --plays).
  const index = JSON.parse(fs.readFileSync(path.join(PLAY, 'shelf', 'index.json'), 'utf8'));
  for (const x of index.games) assert.equal(typeof x.plays, 'number', x.id);
  assert.ok(index.games.filter((x) => x.plays > 0).length > index.games.length * 0.95);
  const css = fs.readFileSync(path.join(PLAY, 'shelf.css'), 'utf8');
  assert.ok(css.includes('.peek{position:fixed;z-index:12;width:300px;pointer-events:none;'));
  assert.ok(css.includes('.track{display:flex;gap:14px;overflow-x:auto;overflow-y:hidden;overscroll-behavior-x:contain;'));
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
  assert.deepEqual(games.filter((g) => !g.b && Shelf.matches(g, { q: 'golden' })).map((g) => g.id).sort(), ['golden-axe-genesis', 'golden-axe-sms']);   // hand-made cards; the collections add Ax Battler and the like
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

test('the shelf rows use VoidTV\'s own side arrows (Bryan, 20 Nov 2026: "exactly like voidtv"): always there on a computer, its chevron icon, whole boxes per press, every row', () => {
  const fs = require('fs'), path = require('path');
  const css = fs.readFileSync(path.join(__dirname, '..', 'shelf.css'), 'utf8'), js = fs.readFileSync(path.join(__dirname, '..', 'src', 'shelf.js'), 'utf8');
  assert.ok(!css.includes('.rowwrap:hover .arrow{opacity:1}') && !/\.arrow\{[^}]*opacity:0/.test(css), 'not only on hover');
  assert.ok(css.includes('.arrow.l{left:-2px}.arrow.r{right:-2px}') && css.includes('background:linear-gradient(180deg,#1a242b 0%,#121a1f 100%);border:1px solid rgba(95,212,255,.55)'));
  assert.ok(css.includes('.arrow .ico.chevron-left{--m:url(/assets/brand/ui/icons/chevron-left.png)}') && css.includes('@media (hover:none){.arrow{display:none}}'));
  assert.ok(js.includes('Math.floor((track.clientWidth - 120) / step) * step'), 'whole boxes, as VoidTV slide()');
  assert.ok(js.includes("wrap.append(rowArrow(track, -1), track, rowArrow(track, 1));"), 'the Machines row too');
});

test('the shelf looks like voidtv.net (Bryan, 20 Nov 2026: "like voidtv.net with the lighting like elements and the images of the character"): VoidTV\'s lightning static behind, his voidarcade art in the hero', () => {
  const fs = require('fs'), path = require('path'), P = path.join(__dirname, '..');
  const css = fs.readFileSync(path.join(P, 'shelf.css'), 'utf8'), js = fs.readFileSync(path.join(P, 'src', 'shelf.js'), 'utf8');
  const html = fs.readFileSync(path.join(P, 'index.html'), 'utf8');
  // The background is the one every Void area shares (tests/atmos.test.js has its rules): his own two pictures, whole ("use it
  // like that"), and it moves like voidtv.net's (Bryan: "move and scroll like the voidtv does").
  assert.ok(html.includes('<script src="/assets/brand/atmos/atmos.js" data-far="voidarcade-wall.webp,voidarcade-player.webp"></script>'));
  assert.ok(!html.includes('data-fit='), 'the whole picture shows, not a crop');
  assert.ok(!css.includes('.bgimg') && !js.includes('.atmos'), 'no copy of the layer of its own');
  for (const f of ['voidarcade-wall', 'voidarcade-wall-m', 'voidarcade-player', 'voidarcade-player-m']) {
    const p = path.join(P, '..', 'assets', 'brand', 'bg', f + '.webp');
    assert.ok(fs.existsSync(p) && fs.statSync(p).size < 300 * 1024, f);
  }
  assert.ok(!js.includes('heroList.unshift(ART[0])'), 'Bryan said no to the art in the hero ("i want to have the hero treated like the hero in voidtv.net")');
  assert.ok(js.includes("bg.dataset.srcset = base + '-m.webp 960w, ' + base + '.webp 1920w';"), 'the browser picks the size');
});

test('Bryan, 20 Nov 2026 ("the cool infinite scrolling paralax effect using the overlapping opacity with the lightning images"): VoidTV’s column on the shelf, his pictures and the lightning static', () => {
  const fs = require('fs'), path = require('path'), P = path.join(__dirname, '..');
  const css = fs.readFileSync(path.join(P, 'shelf.css'), 'utf8'), js = fs.readFileSync(path.join(P, 'src', 'shelf.js'), 'utf8');
  // The shared background lays VoidTV's three lightning statics over his pictures, see-through, at another speed.
  const atmos = fs.readFileSync(path.join(P, '..', 'assets', 'brand', 'atmos', 'atmos.js'), 'utf8');
  assert.ok(atmos.includes("var MID = ['col/static-glitch.jpg', 'col/static-bolt.jpg', 'col/static-dark.jpg'];") && atmos.includes('.vatm-mid{mix-blend-mode:screen}'));
  assert.ok(!js.includes('function column') && !css.includes('.column'), 'PLAY keeps no column of its own');
  for (const f of ['static-glitch', 'static-bolt', 'static-dark']) for (const s of ['', '-m']) assert.ok(fs.existsSync(path.join(P, '..', 'assets', 'brand', 'bg', 'col', f + s + '.jpg')), f + s);
});

// Bryan, 23 Nov 2026, picked from pictures: "P3, Play with friends". The rooms where the TV is the table and the phones
// are the hands, first on the home shelf (Continue playing and the news rows still go above it).
test('Play with friends: a row of Card games and Trivia Night, first on the home shelf, in the shelf\'s own boxes', () => {
  const js = fs.readFileSync(path.join(PLAY, 'src', 'shelf.js'), 'utf8').replace(/\r\n/g, '\n');
  assert.ok(js.includes('rows.append(friendsRow(), rowSection(list[0].title, list[0].games, list[0].f, list[0].count), machineRow());'), 'first on the home shelf');
  const table = js.slice(js.indexOf('const FRIENDS = ['), js.indexOf('];', js.indexOf('const FRIENDS = [')));
  const rows = [...table.matchAll(/\['([^']+)', '([^']+)', '([^']+)', '([^']+)', '(#[0-9a-f]{6})'\]/g)].map((m) => m.slice(1));
  assert.deepEqual(rows.map((r) => [r[0], r[2]]), [['/cards/', 'Card games'], ['/trivia/', 'Trivia Night']]);
  for (const r of rows) assert.ok(fs.existsSync(path.join(PLAY, '..', r[1])), r[1] + ' is in the repo');
  assert.ok(js.includes("const a = el('a', 'box bigbox'); a.href = href;"), 'the shelf\'s own big boxes');
  assert.doesNotMatch(table, new RegExp('[' + String.fromCharCode(8211, 8212) + ']'), 'no em or en dashes');
  // Only PLAY's front page loads the shelf (Kids lives on its own branch and site, and loads none of it).
  const pages = fs.readdirSync(PLAY).filter((f) => f.endsWith('.html') && fs.readFileSync(path.join(PLAY, f), 'utf8').includes('src/shelf.js'));
  assert.deepEqual(pages, ['index.html']);
  // And if Kids' PLAY ever takes this file, the row stays off there: on a kids.* address friendsRow() adds nothing.
  const fn = js.slice(js.indexOf('  function friendsRow() {'), js.indexOf('\n  function machineRow() {'));
  const made = (host) => require('vm').runInNewContext('(' + fn.trim().replace(/^function friendsRow\(\)/, 'function ()') + ')()', {
    location: { hostname: host }, FRIENDS: [], Image: function () { return {}; },
    document: { createDocumentFragment: () => ({ kind: 'fragment' }) },
    el: (tag, cls) => ({ kind: 'el', tag, cls, append() {}, style: { setProperty() {} }, setAttribute() {}, classList: { add() {} } }) });
  assert.deepEqual(made('kids.voidtv.net'), { kind: 'fragment' }, 'nothing on Kids');
  assert.equal(made('voidtv.net').cls, 'row friends-row', 'the row on voidtv.net');
});

// The polish review of 22 Nov 2026, PLAY-01 (critical): in Bryan's 1278x513 window a click on "Machine: All" slid the search
// box and the four buttons out of sight and left one choice in reach. The list was a child of the row, which scrolls
// sideways in a short window. Root fix: the list is a layer of its own, placed from its button, sized to the room.
test('PLAY-01: a filter list is its own layer, opens where there is room, and takes columns before it scrolls', () => {
  const html = fs.readFileSync(path.join(PLAY, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(PLAY, 'shelf.css'), 'utf8');
  const js = fs.readFileSync(path.join(PLAY, 'src', 'shelf.js'), 'utf8');
  const row = html.slice(html.indexOf('<div class="filters" id="filters"'), html.indexOf('<div id="rows">'));
  assert.ok(row.indexOf('id="pick"') > row.indexOf('</div>'), 'the list comes after the row closes, never inside it');
  assert.match(css, /\.pick\{position:fixed;[^}]*display:grid;grid-auto-flow:column;[^}]*overflow:auto;overscroll-behavior:contain;/);
  assert.ok(!/\.pick\{[^}]*max-height:min\(60vh/.test(css), 'no fixed share of the window: the room is measured');
  assert.match(css, /\.opt\{[^}]*white-space:nowrap;/);
  // His window: the button's foot at 284 of 513, the top bar's at 52. 16 machines, 40 px each, 14 px of edges.
  const his = Shelf.pickRoom(16, 40, 14, 513 - 8 - (284 + 6), (244 - 6) - (52 + 8));
  assert.deepEqual(his, { up: false, room: 215, rows: 5 }, 'under the button, five rows of room: 16 choices take four columns of four');
  // A tall hero above and little under (1316x821): over the button, where eight rows fit.
  assert.deepEqual(Shelf.pickRoom(16, 40, 14, 184, 524), { up: true, room: 524, rows: 12 });
  // Everything fits under the button: it opens there even when there is more room above.
  assert.equal(Shelf.pickRoom(2, 40, 14, 184, 524).up, false);
  // Hardly any room either way: still one row, and the list scrolls.
  assert.deepEqual(Shelf.pickRoom(16, 40, 14, 20, 10), { up: false, room: 54, rows: 1 });
  for (const bit of ["chip.scrollIntoView({ block: 'nearest', inline: 'nearest' });", "s.maxHeight = room + 'px'; s.maxWidth = (W - 2 * EDGE) + 'px';",
    "s.left = Math.max(EDGE, Math.min(r.left, W - EDGE - pick.offsetWidth)) + 'px';", "s.top = (up ? r.top - GAP - pick.offsetHeight : r.bottom + GAP) + 'px';",
    "if (cols === 1 || pick.offsetWidth <= W - 2 * EDGE) break;", "addEventListener('scroll', again, true);",
    "if (pickOpen() && !(e.target.closest && e.target.closest('#pick, #filters .chip'))) closePick(false);",
    "if (!pick.hidden && pick.dataset.for === k) { closePick(); return; }"]) assert.ok(js.includes(bit), bit);
});
