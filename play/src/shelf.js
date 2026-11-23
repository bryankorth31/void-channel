// VoidTV PLAY: the front page (plan T14). Licence: GPL-2.0-or-later (play/LICENSE).
// Laid out like the VoidTV home page (Bryan, 20 Nov 2026: "a hero that cycles thru the most popular games/consoles. below
// the cycling hero it should be the rows like voidtv starting with continue playing, and then genres and filters as rows").
// Drawn from play/shelf/index.json, which the nightly check keeps to the games the Internet Archive still has. A hero
// turns through the most played games and the machines; under it, rows that scroll sideways, each with its most played
// games first. A card shows its game's picture from its Archive item, its name, machine and year; resting on it (a
// mouse, or the focus from a gamepad, the keyboard or a TV remote) shows what the game is and how it plays. A tap, a
// click, Enter or a gamepad's A picks the box up, and Play starts it. A search box and four filters (machine, genre,
// players, decade) narrow everything to one list, kept in the address so a link shares what it shows.
// Ideas studied, no code taken (play/SOURCES.md): Halcyon Video's shelf of boxes shaped per system.
(function (root) {
  'use strict';
  // Each machine's name on the box, its colour stripe and its box shape (a tall PC box, a cartridge, a handheld card).
  const SYSTEMS = {
    dos: { name: 'PC (DOS)', shape: 'bigbox', color: '#f2a93b' },
    a2600: { name: 'Atari 2600', shape: 'cart', color: '#e0623a' },
    nes: { name: 'NES', shape: 'cart', color: '#e23b4a' },
    snes: { name: 'Super Nintendo', shape: 'cart', color: '#8b7cf6' },
    genesis: { name: 'Sega Genesis', shape: 'cart', color: '#3a8cf0' },
    sms: { name: 'Master System', shape: 'cart', color: '#d9d9e3' },
    gamegear: { name: 'Game Gear', shape: 'handheld', color: '#5fe3ff' },
    gameboy: { name: 'Game Boy', shape: 'handheld', color: '#9bbc0f' },
    gbcolor: { name: 'Game Boy Color', shape: 'handheld', color: '#ff4fc8' },
    gba: { name: 'Game Boy Advance', shape: 'handheld', color: '#7b6cf6' },
    lynx: { name: 'Atari Lynx', shape: 'handheld', color: '#ff8a3d' },
    arcade: { name: 'Arcade', shape: 'bigbox', color: '#ff4fc8' },
    win3: { name: 'Windows 3.1', shape: 'bigbox', color: '#3fbfb0' },
    flash: { name: 'Flash', shape: 'bigbox', color: '#e8383d' },
    cdrom: { name: 'PC CD-ROM', shape: 'bigbox', color: '#b48cff' },
  };
  const decadeOf = (y) => (y ? Math.floor(y / 10) * 10 : null);
  const decadeName = (d) => (d === null ? 'More games' : d >= 2000 ? 'The ' + d + 's' : 'The ' + String(d).slice(2) + 's');
  const sysOf = (g) => SYSTEMS[g.system] || { name: g.system, shape: 'cart', color: '#8a8fa3' };

  // Most played at the Internet Archive first; between equals the newer game, then by name (pure: tested).
  const byPopular = (a, b) => (b.plays || 0) - (a.plays || 0) || (b.year || 0) - (a.year || 0) || a.title.localeCompare(b.title);

  // The sets a row can be besides a filter: the machine families, the eras and the lists (pure: tested).
  const CONSOLE = (g) => !['arcade', 'dos', 'win3', 'flash', 'cdrom'].includes(g.system);
  const SETS = {
    most: { title: 'Most played', has: () => true },
    newer: { title: 'Newer games', has: (g) => g.year >= 1995 },
    '90s': { title: '90s consoles', has: (g) => CONSOLE(g) && g.year >= 1990 && g.year <= 1999 },
    nintendo: { title: 'Nintendo', has: (g) => ['nes', 'snes', 'gameboy', 'gbcolor', 'gba'].includes(g.system) },
    sega: { title: 'Sega', has: (g) => ['genesis', 'sms', 'gamegear'].includes(g.system) },
    atari: { title: 'Atari', has: (g) => ['a2600', 'lynx'].includes(g.system) },
    handheld: { title: 'Handhelds', has: (g) => sysOf(g).shape === 'handheld' },
    classic: { title: 'Classic arcade and early games', has: (g) => g.system === 'arcade' || (g.year && g.year < 1985) },
    kids: { title: 'Learning games for kids', has: (g) => !!g.kids },
  };
  // The front page's rows in order, each a filter, so its "See all" opens that filter (pure: tested).
  const HOME_ROWS = [{ s: 'most' }, { s: 'newer' }, { s: '90s' }, { s: 'nintendo' }, { s: 'sega' }, { g: 'Action' }, { g: 'Adventure' },
    { g: 'Sports and racing' }, { s: 'classic' }, { g: 'Platform' }, { g: 'Puzzle and maze' }, { p: '2' }, { s: 'handheld' }, { s: 'atari' },
    { m: 'dos' }, { g: 'Strategy and simulation' }, { s: 'kids' }];
  // The main showing (Bryan, 22 Nov 2026: "clean the main showing of games down to the most known or played or quality
  // of the games"; "Yes, best 40 each"): the front page's rows and banner draw only on each machine's best 40, marked
  // front by play/tools/shelf.js with their score, best first; a row's count and See all still open every game.
  const byFront = (a, b) => (b.front || 0) - (a.front || 0) || byPopular(a, b);
  const mainOf = (games) => (games.some((g) => g.front) ? games.filter((g) => g.front) : games);
  // One box a game in a row: Mortal Kombat on the Genesis and the Game Gear is one game there, its best copy (pure).
  const nameKey = (t) => String(t).toLowerCase().replace(/\([^)]*\)/g, '').replace(/\b(the|ms-?dos|dos)\b/g, '').replace(/[^a-z0-9]+/g, '');
  const oneEach = (list) => { const seen = new Set(); return list.filter((g) => { const k = nameKey(g.title); if (seen.has(k)) return false; seen.add(k); return true; }); };
  function homeRows(games) {
    const main = mainOf(games);
    return HOME_ROWS.map((f) => ({ f, title: viewTitle(f), games: oneEach(main.filter((g) => matches(g, f)).sort(byFront)), count: games.filter((g) => matches(g, f)).length }))
      .filter((r) => r.games.length);
  }

  // A list's own rows, like VoidTV's pages for one kind of show (pure: tested): a machine, a family, a kind or a decade
  // opens with its most played, then one row for each way left to narrow it (by machine, by kind, two at once, by
  // decade), each with at least LIST_ROW_MIN games; every game follows, A to Z. A search, or a list that fits in one
  // row, is just its games.
  const LIST_ROW_MIN = 4;
  function listRows(games, f) {
    if (f.q || games.length <= ROW_CAP) return [];
    const rows = [{ title: 'Most played', f: null, games: games.slice().sort(byPopular) }];
    const add = (title, more) => {
      const nf = Object.assign({}, f, more), list = games.filter((g) => matches(g, nf)).sort(byPopular);
      if (list.length >= LIST_ROW_MIN && list.length < games.length) rows.push({ title, f: nf, games: list });
    };
    if (!f.m) {
      const count = new Map(); for (const g of games) count.set(g.system, (count.get(g.system) || 0) + 1);
      for (const [k] of [...count].sort((a, b) => b[1] - a[1])) add(sysOf({ system: k }).name, { m: k });
    }
    if (!f.g) for (const [k] of GENRES) add(k, { g: k });
    if (!f.p) add('Two at once', { p: '2' });
    if (!f.d) for (const d of [...new Set(games.map((g) => decadeOf(g.year)).filter((d) => d !== null))].sort((a, b) => a - b)) add(decadeName(d), { d: String(d) });
    return rows;
  }
  const byName = (a, b) => a.title.localeCompare(b.title);

  // The hero (pure: tested): the most played game of each machine, the most played first, with a machine between every
  // two games, the machines most played first. A slide is { g } for a game or { system, name, count, games } for a machine.
  function heroSlides(games, nGames = 8, nMachines = 4) {
    const by = new Map();
    // From the main showing, each machine's best first (Bryan, 22 Nov 2026: he did not want Oregon Trail "and many of
    // the games in the hero to be shown atleast as the first ones").
    for (const g of mainOf(games).slice().sort(byFront)) { if (!by.has(g.system)) by.set(g.system, []); by.get(g.system).push(g); }
    // Bryan's banner list (play/shelf/front-picks.json) opens it, in his order; each machine's best follows.
    const picked = mainOf(games).filter((g) => g.banner).sort((x, y) => x.banner - y.banner);
    const tops = oneEach(picked.concat([...by.values()].map((l) => l[0]).sort(byFront))).slice(0, Math.max(nGames, picked.length));
    const sum = (l) => l.reduce((n, g) => n + (g.plays || 0), 0);
    const machines = [...by.entries()].sort((a, b) => sum(b[1]) - sum(a[1])).slice(0, nMachines)
      .map(([system, l]) => ({ system, name: sysOf({ system }).name, count: l.length, games: l.slice(0, 3) }));
    const out = [];
    tops.forEach((g, i) => { out.push({ g }); if (i % 2 === 1 && machines.length) out.push(machines.shift()); });
    return out.concat(machines);
  }

  // A line about the game, from what its card knows (pure: tested).
  const KIND = { Action: 'an action game', Platform: 'a platform game', 'Puzzle and maze': 'a puzzle game', Adventure: 'an adventure',
    'Strategy and simulation': 'a strategy game', 'Sports and racing': 'a sports or racing game', Learning: 'a learning game' };
  const COUNT = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
  function aboutLine(g) {
    const kind = KIND[(g.genres || [])[0]] || 'a game';
    let s = kind[0].toUpperCase() + kind.slice(1) + (g.system === 'arcade' ? ' from the arcades' : g.system === 'dos' ? ' for the PC' : g.system === 'win3' ? ' for Windows' : g.system === 'flash' ? ' for the web, in Flash' : g.system === 'cdrom' ? ' on CD-ROM' : ' for the ' + sysOf(g).name);
    if (g.publisher) s += ', made by ' + g.publisher;
    if (g.year) s += ' in ' + g.year;
    s += '.';
    if (g.players > 1) s += g.players === 2 ? ' One or two players.' : ' One to ' + (COUNT[g.players] || g.players) + ' players.';
    return s;
  }
  // The Internet Archive's count of a game's plays, never voidtv.net's own: every place it shows says whose it is.
  const playsText = (n) => (!n ? '' : n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + ' million plays' : n.toLocaleString('en-US') + (n === 1 ? ' play' : ' plays'));
  const metaLine = (g) => [sysOf(g).name, g.year, g.players > 1 ? '1 to ' + g.players + ' players' : '', (g.genres || [])[0]].filter(Boolean).join(' · ');

  // Gamepad or arrow keys: move to the nearest stop in that direction (by the stops' places on screen).
  function nearest(from, all, dir) {
    const a = from.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best = null, bestScore = Infinity;
    for (const el of all) {
      if (el === from) continue;
      const b = el.getBoundingClientRect(), bx = b.left + b.width / 2, by = b.top + b.height / 2, dx = bx - ax, dy = by - ay;
      if (!b.width && !b.height) continue;     // hidden
      const ahead = dir === 'right' ? dx > 4 : dir === 'left' ? dx < -4 : dir === 'down' ? dy > 4 : dy < -4;
      if (!ahead) continue;
      const along = dir === 'left' || dir === 'right' ? Math.abs(dx) : Math.abs(dy);
      const across = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
      const score = along + across * 3;
      if (score < bestScore) { bestScore = score; best = el; }
    }
    return best;
  }

  const phone = () => matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600;
  // Which input to speak of: a gamepad once one is seen, touch on a touch screen, else the keyboard.
  let padEver = false;
  const inputNow = () => (padEver ? 'pad' : matchMedia('(pointer: coarse)').matches ? 'touch' : 'keyboard');
  const hrefOf = (g) => 'game.html?game=' + encodeURIComponent(g.id) + (g.b ? '&b=' + encodeURIComponent(g.b) : '');
  const picOf = (g) => 'https://archive.org/services/img/' + encodeURIComponent(g.item);
  // A collection's game plays as its machine does (plan C4: libHow, once per machine in the shelf list).
  const howOf = (g) => { const lib = (g.b && libHow[g.system]) || {}; return { how: ((g.how || lib.how) || {})[inputNow()] || [], help: g.help || lib.help || '' }; };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  // The back of a box (plan T25): what a player turns a box over in a shop to read (pure: tested in shelf.test.js).
  function backLines(g) {
    const lines = [['Machine', sysOf(g).name]];
    if (g.year) lines.push(['Year', String(g.year)]);
    if (g.publisher) lines.push(['Made by', g.publisher]);
    if (g.genres && g.genres.length) lines.push(['Kind', g.genres.join(', ')]);
    lines.push(['Players', g.players > 1 ? '1 or ' + g.players + ', a gamepad each' : '1']);
    lines.push(['Plays with', g.mouse ? 'a mouse; on a touch screen the picture is a trackpad; on a gamepad the right stick' : 'a gamepad, the keyboard or touch']);
    return lines;
  }

  // Pick a box up (plan T25): a tap, a click, Enter or A lifts the box off the shelf and turns it over to its back.
  // A or Enter again plays, B, Esc or a tap beside it puts it back, left and right turn it over.
  let held = null;                             // { g, from } while a box is in hand
  function heldLayer() {
    let l = document.getElementById('held');
    if (l) return l;
    l = document.createElement('div'); l.id = 'held'; l.className = 'held'; l.hidden = true;
    l.setAttribute('role', 'dialog'); l.setAttribute('aria-modal', 'true');
    l.innerHTML = '<div class="scrim"></div><div class="lift"><div class="turn"><div class="face front"><span class="art"><img alt="" decoding="async"></span></div>'
      + '<div class="face back"><span class="strip"><img alt="" decoding="async"></span><h3></h3><ul class="how"></ul><dl></dl><p class="help"></p>'
      + '<div class="acts"><a class="cont" hidden>Continue</a><a class="play">Play</a><button type="button" class="put">Put back</button></div><p class="hint">Turn it over: left or right</p></div></div></div>';
    document.body.appendChild(l);
    l.querySelector('.scrim').onclick = putBack;
    l.querySelector('.put').onclick = putBack;
    l.querySelector('.turn').addEventListener('click', (e) => { if (!e.target.closest('a,button')) turnOver(); });
    return l;
  }
  function pickUp(g, from) {
    const l = heldLayer(), sys = sysOf(g);
    peekHide(); heroHold(true);
    held = { g, from };
    l.style.setProperty('--sys', sys.color);
    l.querySelector('.turn').className = 'turn ' + sys.shape;
    l.setAttribute('aria-label', g.title);
    const pic = picOf(g);
    for (const img of l.querySelectorAll('img')) { img.src = pic; img.hidden = false; img.onerror = () => { img.hidden = true; }; }
    l.querySelector('h3').textContent = g.title;
    const dl = l.querySelector('dl'); dl.textContent = '';
    for (const [k, v] of backLines(g)) { const dt = el('dt', '', k), dd = el('dd', '', v); dl.append(dt, dd); }
    // Audit S5: the first three things to do, said for the input in hand; the help line only when there are none.
    const ul = l.querySelector('.how'); ul.textContent = '';
    const h = howOf(g);
    for (const [d, w] of h.how) { const li = el('li'), b = el('b', '', d); li.append(b, ' ' + w); ul.appendChild(li); }
    l.querySelector('.help').textContent = ul.children.length ? '' : h.help;
    // Audit S6: Play starts the game itself (a phone keeps its start screen, which allows fullscreen); a game with an
    // automatic save offers Continue first and calls Play "New game".
    const cont = l.querySelector('.cont'), play = l.querySelector('.play');
    const direct = !phone();
    play.href = from.href + (direct ? '&go=new' : ''); play.textContent = 'Play';
    cont.hidden = true; cont.href = from.href + (direct ? '&go=continue' : '');
    if (root.PlaySaves) root.PlaySaves.get(g.id + ':auto').then((rec) => {
      if (!rec || !held || held.g !== g) return;
      cont.hidden = false; play.textContent = 'New game'; cont.focus({ preventScroll: true });
    }).catch(() => {});
    l.hidden = false;
    l.classList.remove('flipped');
    void l.offsetWidth;                        // lay the front out first, so the turn to the back is seen
    l.classList.add('flipped');
    l.querySelector('.play').focus({ preventScroll: true });
  }
  function putBack() {
    if (!held) return;
    const l = heldLayer(), from = held.from;
    held = null; l.hidden = true; l.classList.remove('flipped');
    heroHold(false);
    from.focus({ preventScroll: true });
  }
  function turnOver() { if (held) heldLayer().classList.toggle('flipped'); }

  // A card, drawn like a VoidTV show card: the picture (whole, at the screenshot's own 4:3), then the name and a line.
  function box(g) {
    const sys = sysOf(g);
    const a = el('a', 'box ' + sys.shape); a.href = hrefOf(g);
    a.style.setProperty('--sys', sys.color);
    a.setAttribute('aria-label', g.title + ', ' + sys.name + (g.year ? ', ' + g.year : '') + (g.players > 1 ? ', up to ' + g.players + ' players' : ''));
    const art = el('span', 'art');
    const img = new Image(); img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
    img.src = picOf(g);
    img.onerror = () => { img.remove(); art.classList.add('none'); };
    art.append(img, el('span', 'fallback', g.title));
    const label = el('span', 'label');
    label.append(el('span', 'title', g.title), el('span', 'meta', sys.name + (g.year ? ' · ' + g.year : '') + (g.players > 1 ? ' · ' + g.players + ' players' : '')));
    a.append(art, label);
    a.addEventListener('click', (e) => {
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;   // a new tab still opens the game itself
      e.preventDefault(); pickUp(g, a);
    });
    a.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') peekSoon(g, a); });
    a.addEventListener('pointerleave', peekHide);
    a.addEventListener('focus', () => { let kb = false; try { kb = a.matches(':focus-visible'); } catch (x) { /* an old browser: no card info on focus */ } if (kb) peekShow(g, a, true); });
    a.addEventListener('blur', peekHide);
    return a;
  }

  // Resting on a card shows what the game is (VoidTV's show card info): a mouse after a moment, the focus from a
  // gamepad, the keyboard or a remote at once. Never on a phone-sized screen, where a tap picks the box up instead.
  let peekTimer = 0, peekOn = null, peekFrame = 0;   // peekOn: { g, a, kb } while it shows
  function peekLayer() {
    let p = document.getElementById('peek');
    if (!p) { p = el('div', 'peek'); p.id = 'peek'; p.hidden = true; p.setAttribute('aria-hidden', 'true'); document.body.appendChild(p); }
    return p;
  }
  function peekSoon(g, a) { clearTimeout(peekTimer); peekTimer = setTimeout(() => peekShow(g, a), 350); }
  function peekHide() { clearTimeout(peekTimer); peekOn = null; const p = document.getElementById('peek'); if (p) p.hidden = true; }
  // A scroll moves a card the focus walked to (the page follows the focus), so its info follows it; a mouse's goes.
  function peekScrolled() {
    if (!peekOn || !peekOn.kb || document.activeElement !== peekOn.a) return peekHide();
    cancelAnimationFrame(peekFrame); peekFrame = requestAnimationFrame(() => { if (peekOn) peekPlace(peekOn.a); });
  }
  function peekPlace(a) {
    const p = peekLayer(), r = a.getBoundingClientRect(), w = p.offsetWidth, ht = p.offsetHeight;
    let x = r.right + 12;
    if (x + w > innerWidth - 8) x = r.left - w - 12;
    if (x < 8) x = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2));
    const top = Math.max(60, Math.min(innerHeight - ht - 8, r.top));
    p.style.left = Math.round(x) + 'px'; p.style.top = Math.round(top) + 'px';
  }
  function peekShow(g, a, kb) {
    clearTimeout(peekTimer);
    if (held || innerWidth < 640 || innerHeight < 360) return;
    const p = peekLayer(), sys = sysOf(g);
    p.style.setProperty('--sys', sys.color);
    p.textContent = '';
    p.append(el('b', '', g.title), el('span', 'm', metaLine(g)), el('p', '', aboutLine(g)));
    const h = howOf(g);
    if (h.how.length) {
      const ul = el('ul', 'how');
      for (const [d, w] of h.how) { const li = el('li'), b = el('b', '', d); li.append(b, ' ' + w); ul.appendChild(li); }
      p.append(ul);
    } else if (h.help) p.append(el('p', 'help', h.help));
    if (g.plays) p.append(el('span', 'plays', playsText(g.plays) + ' on the Internet Archive'));
    p.append(el('span', 'hint', inputNow() === 'pad' ? 'A to pick it up' : inputNow() === 'touch' ? 'Tap to pick it up' : 'Click or Enter to pick it up'));
    p.hidden = false;
    peekOn = { g, a, kb: !!kb };
    peekPlace(a);
  }

  // Plan G2: Wikidata's genres are fine-grained ("side-scrolling beat 'em up"), so the shelf files them under a few plain
  // ones. A game can sit under two (boxing is Action and Sports). Pure: tested in play/test/shelf.test.js.
  const GENRES = [
    // Wikidata's own words for the games added 22 Nov (the PLAY assistant's facts: vehicular combat, Metroidvania, wrestling).
    ['Action', /beat 'em up|hack and slash|fighting|boxing|shoot|run and gun|action game|vehicular combat|metroidvania|wrestling/i],
    ['Platform', /platform/i],
    ['Puzzle and maze', /puzzle|maze|breakout|pinball|board game|chess|trivia|game show/i],
    ['Adventure', /adventure|role-playing|text-based|interactive fiction/i],
    ['Strategy and simulation', /strateg|simulation|simulator|management/i],
    ['Sports and racing', /sport|boxing|racing|football|soccer|golf|tennis|hockey|basketball|baseball|athletics|skateboarding|volleyball|wrestling/i],
    ['Learning', /educational|learning/i],
  ];
  const genresOf = (labels) => GENRES.filter(([, re]) => (labels || []).some((l) => re.test(l))).map(([n]) => n);
  // Accents fold away on both sides (audit: "pokemon" found nothing; the titles say Pokémon).
  const fold = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();

  // The filter lives in the address (?m=snes&g=Platform&p=2&d=1990&q=mario, and s= for a row's set such as ?s=sega), so a
  // link shares what it shows.
  const KEYS = { m: 'Machine', g: 'Genre', p: 'Players', d: 'Decade' };
  const ALL_KEYS = [...Object.keys(KEYS), 's', 'q'];
  function readFilter(search) {
    const q = new URLSearchParams(search || '');
    const f = {};
    for (const k of ALL_KEYS) if (q.get(k)) f[k] = q.get(k).slice(0, 60);
    if (f.s && !SETS[f.s]) delete f.s;
    return f;
  }
  function writeFilter(f) {
    const q = new URLSearchParams();
    for (const k of ALL_KEYS) if (f[k]) q.set(k, f[k]);
    const s = q.toString();
    return s ? '?' + s : '';
  }
  function matches(g, f) {
    if (f.m && g.system !== f.m) return false;
    if (f.g && !(g.genres || []).includes(f.g)) return false;
    if (f.p === '2' && !((g.players || 1) >= 2)) return false;
    if (f.d && String(decadeOf(g.year)) !== f.d) return false;
    if (f.s && !(SETS[f.s] && SETS[f.s].has(g))) return false;
    if (f.q && !fold(g.title + ' ' + (g.publisher || '')).includes(fold(f.q))) return false;
    return true;
  }
  // What a filtered list is called (pure: tested): "Sega", "Action", "Super Nintendo, Two at once", 'Found: "mario"'.
  function viewTitle(f) {
    const parts = [];
    if (f.s && SETS[f.s] && !f.m) parts.push(SETS[f.s].title);   // "Sega Genesis", not "Sega, Sega Genesis"
    if (f.m) parts.push(sysOf({ system: f.m }).name);
    if (f.g) parts.push(f.g);
    if (f.p === '2') parts.push('Two at once');
    if (f.d) parts.push(decadeName(Number(f.d)));
    if (f.q) parts.push('Found: "' + f.q + '"');
    return parts.join(', ') || 'Every game';
  }
  // What each filter can be set to: only what some game on the shelf has, so no choice ever leads to nothing.
  function choices(games, key) {
    const seen = new Map();
    for (const g of games) {
      if (key === 'm') seen.set(g.system, sysOf(g).name);
      else if (key === 'g') for (const x of g.genres || []) seen.set(x, x);
      else if (key === 'p' && (g.players || 1) >= 2) seen.set('2', 'Two at once');
      else if (key === 'd' && g.year) seen.set(String(decadeOf(g.year)), decadeName(decadeOf(g.year)));
    }
    const list = [...seen].sort((a, b) => (key === 'd' ? a[0] - b[0] : a[1].localeCompare(b[1])));
    return [['', key === 'p' ? 'Any number' : 'All']].concat(list);
  }

  let shelfGames = [], filter = {}, libHow = {};
  const isHome = () => !Object.keys(filter).length;
  function render(index) {
    shelfGames = index.games; libHow = index.libHow || {};
    filter = readFilter(location.search);
    filterRow();
    hero();
    show();
  }

  // The filter row: a search box and one button per filter; a button opens its list of choices. Gamepad and arrows walk
  // it like the boxes.
  function filterRow() {
    const row = document.getElementById('filters');
    if (!row || !shelfGames.length) return;
    row.hidden = false;
    const q = document.getElementById('f-q');
    q.value = filter.q || '';
    q.oninput = () => { filter.q = q.value.trim(); if (!filter.q) delete filter.q; changed(); };
    for (const b of row.querySelectorAll('.chip')) b.onclick = () => openPick(b);
    chipLabels();
  }
  function chipLabels() {
    for (const b of document.querySelectorAll('#filters .chip')) {
      const k = b.dataset.f, c = choices(shelfGames, k).find(([v]) => v === (filter[k] || ''));
      b.textContent = KEYS[k] + ': ' + (c ? c[1] : 'All');
      b.classList.toggle('on', !!filter[k]);
    }
  }
  // A chip or the search changes the list in place; a row's "See all", a machine or the hero opens a list Back returns from.
  function changed() {
    history.replaceState(null, '', location.pathname + writeFilter(filter));
    chipLabels(); show();
  }
  function open(f) {
    filter = Object.assign({}, f);
    history.pushState(null, '', location.pathname + writeFilter(filter));
    const q = document.getElementById('f-q'); if (q) q.value = filter.q || '';
    chipLabels(); show();
    scrollTo({ top: 0 });
    const first = document.querySelector('#rows .box'); if (first && padEver) first.focus({ preventScroll: true });
  }
  function openPick(chip) {
    const pick = document.getElementById('pick'), k = chip.dataset.f;
    pick.textContent = '';
    for (const [v, label] of choices(shelfGames, k)) {
      const o = el('button', 'opt' + (v === (filter[k] || '') ? ' on' : ''), label); o.type = 'button';
      o.onclick = () => { if (v) filter[k] = v; else delete filter[k]; closePick(); changed(); };
      pick.appendChild(o);
    }
    pick.style.left = Math.max(0, Math.min(chip.offsetLeft, chip.parentElement.clientWidth - 220)) + 'px';
    pick.style.top = (chip.offsetTop + chip.offsetHeight + 6) + 'px';
    pick.hidden = false; pick.dataset.for = k;
    (pick.querySelector('.opt.on') || pick.querySelector('.opt')).focus();
  }
  function closePick() {
    const pick = document.getElementById('pick');
    if (!pick || pick.hidden) return false;
    pick.hidden = true;
    const chip = document.querySelector('#filters .chip[data-f="' + pick.dataset.for + '"]');
    if (chip) chip.focus();
    return true;
  }
  const pickOpen = () => { const p = document.getElementById('pick'); return !!(p && !p.hidden); };

  // ---- The hero (VoidTV's .hero-home): one slide at a time, a slow push in, the next after a while. A slide is a game
  // (its picture, name, machine, year, Play) or a machine (three of its games, "See the N games"). Arrows, a swipe or a
  // gamepad turn it by hand; resting on it, a box in hand or a hidden tab holds it still.
  // ---- The background (Bryan, 20 Nov 2026: "i want the background to move and scroll like the voidtv does", "the bg needs
  // the cool infinite scrolling paralax effect using the overlapping opacity with the lightning images") is not drawn here:
  // it is the one every Void area shares, /assets/brand/atmos/atmos.js, loaded by index.html with his two pictures.

  const HERO_MS = 8000;
  // Bryan's voidarcade art (assets/brand/bg/voidarcade-*.webp, from his own pictures, 20 Nov 2026).
  const ART = [{ art: 'wall', kicker: 'The arcade is open', line: 'Hundreds of old games from the Internet Archive. Free, no account, nothing to install.' },
    { art: 'player', kicker: 'Pull up a crate', line: 'Arcade, consoles and old PCs. A keyboard, a gamepad, a touch screen or your phone.' }];
  let heroList = [], heroAt = 0, heroTimer = 0, heroHeld = 0;
  function heroHold(on) { heroHeld = Math.max(0, heroHeld + (on ? 1 : -1)); }
  function hero() {
    const h = document.getElementById('hero');
    if (!h || !shelfGames.length) return;
    // A moment in the news opens the banner (play/src/moments-shelf.js), before Bryan's list and the rule's slides.
    heroList = (root.PlayMoments ? root.PlayMoments.slides(shelfGames) : []).concat(heroSlides(shelfGames));
    if (!heroList.length) return;
    // Bryan's voidarcade art is not in the hero (20 Nov 2026, on seeing it: "no. i want to have the hero treated like the
    // hero in voidtv.net. how its playing live tv"); the hero shows the games until that is built. ART stays for later.
    void ART;
    h.textContent = '';
    const slides = el('div', 'slides');
    for (const s of heroList) {
      if (s.moment) { slides.append(el('div', 's moment')); continue; }   // our own look: no game picture behind the ad line
      const one = el('div', 's' + (s.art ? ' art ' + s.art : ''));
      if (s.art) {
        const bg = new Image(); bg.alt = ''; bg.className = 'bg'; bg.decoding = 'async';
        const base = '/assets/brand/bg/voidarcade-' + s.art;
        bg.dataset.src = base + '.webp'; bg.dataset.srcset = base + '-m.webp 960w, ' + base + '.webp 1920w';   // the browser picks by screen
        one.append(bg); slides.append(one); continue;
      }
      const g0 = s.g || s.games[0];
      const bg = new Image(); bg.alt = ''; bg.className = 'bg'; bg.decoding = 'async'; bg.dataset.src = picOf(g0);
      one.append(bg);
      for (const [i, g] of (s.g ? [s.g] : s.games).entries()) {
        const scr = el('span', 'scr' + (s.g ? '' : ' f' + (i + 1))); scr.style.setProperty('--sys', sysOf(g).color);
        const img = new Image(); img.alt = ''; img.decoding = 'async'; img.dataset.src = picOf(g);
        img.onerror = () => { img.remove(); };
        scr.append(img); one.append(scr);
      }
      slides.append(one);
    }
    const copy = el('div', 'copy');
    const l = el('button', 'harrow l', '‹'), r = el('button', 'harrow r', '›');
    l.type = r.type = 'button'; l.setAttribute('aria-label', 'Back one'); r.setAttribute('aria-label', 'Next');
    l.onclick = () => heroGo(heroAt - 1, true); r.onclick = () => heroGo(heroAt + 1, true);
    h.append(slides, el('div', 'shade'), copy, l, r, el('span', 'hcount'));
    h.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') heroHold(true); });
    h.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') heroHold(false); });
    h.addEventListener('focusin', () => heroHold(true));
    h.addEventListener('focusout', () => heroHold(false));
    let x0 = null;
    h.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') x0 = e.clientX; }, { passive: true });
    h.addEventListener('pointerup', (e) => {
      if (x0 === null) return; const dx = e.clientX - x0; x0 = null;
      if (Math.abs(dx) > 50) heroGo(heroAt + (dx < 0 ? 1 : -1), true);
    }, { passive: true });
    heroGo(0);
    heroRun();
  }
  // The turn by itself, none when the viewer asks for less motion; a turn by hand starts the wait again.
  function heroRun() {
    clearInterval(heroTimer);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    heroTimer = setInterval(() => { if (!heroHeld && !document.hidden && isHome()) heroGo(heroAt + 1); }, HERO_MS);
  }
  function heroGo(i, byHand) {
    const h = document.getElementById('hero'); if (!h || !heroList.length) return;
    heroAt = (i + heroList.length) % heroList.length;
    const all = h.querySelectorAll('.slides .s');
    all.forEach((s, j) => {
      s.classList.toggle('on', j === heroAt);
      // Pictures load for this slide and the next only.
      if (j === heroAt || j === (heroAt + 1) % all.length) for (const img of s.querySelectorAll('img[data-src]')) { if (img.dataset.srcset) { img.sizes = '100vw'; img.srcset = img.dataset.srcset; } img.src = img.dataset.src; img.removeAttribute('data-src'); }
    });
    const s = heroList[heroAt], copy = h.querySelector('.copy');
    copy.textContent = '';
    copy.append(el('span', 'hline', 'PLAY · old games from the Internet Archive, free, no account'));
    h.classList.toggle('art-on', !!s.art);
    if (s.moment) {
      copy.append(el('span', 'kicker', s.kicker), el('h2', 'ht', s.title), el('p', 'ov', s.line));
      const acts = el('div', 'acts'), go = el('a', 'btn gold', s.go); go.href = '#rows';
      go.addEventListener('click', (e) => { e.preventDefault(); const r = document.querySelector(s.to) || document.querySelector('.shelf .row'); if (!r) return; r.scrollIntoView({ behavior: 'smooth', block: 'start' }); const b = r.querySelector('.box'); if (b) b.focus({ preventScroll: true }); });
      acts.append(go); copy.append(acts);
    } else if (s.art) {
      copy.append(el('span', 'kicker', s.kicker), el('p', 'ov', s.line));
      const acts = el('div', 'acts');
      const go = el('a', 'btn gold', 'Pick a game'); go.href = '#rows';
      go.addEventListener('click', (e) => { e.preventDefault(); const r = document.querySelector('.shelf .row'); if (r) r.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
      acts.append(go); copy.append(acts);
    } else if (s.g) {
      const g = s.g, sys = sysOf(g);
      copy.append(el('span', 'kicker', 'Most played on ' + (g.system === 'arcade' ? 'the arcade' : sys.name)), el('h2', 'ht', g.title),
        el('p', 'ov', aboutLine(g)), el('div', 'meta', [g.year, g.players > 1 ? '1 to ' + g.players + ' players' : '', g.plays ? playsText(g.plays) + ' on the Internet Archive' : ''].filter(Boolean).join(' · ')));
      const acts = el('div', 'acts');
      const play = el('a', 'btn gold', 'Play'); play.href = hrefOf(g);
      play.addEventListener('click', (e) => { if (e.ctrlKey || e.metaKey || e.shiftKey || e.button) return; e.preventDefault(); pickUp(g, play); });
      const more = el('a', 'btn ghost', 'More ' + sys.name + ' games'); more.href = writeFilter({ m: g.system }) || './';
      more.addEventListener('click', (e) => { if (e.ctrlKey || e.metaKey || e.shiftKey || e.button) return; e.preventDefault(); open({ m: g.system }); });
      acts.append(play, more); copy.append(acts);
    } else {
      copy.append(el('span', 'kicker', 'A machine to play'), el('h2', 'ht', s.name),
        el('p', 'ov', s.count + ' games.' + (s.games.length > 1 ? ' The most played: ' + s.games.slice(0, 2).map((g) => g.title).join(' and ') + '.' : '')));
      const acts = el('div', 'acts');
      const all = el('a', 'btn gold', 'See the ' + s.count + ' games'); all.href = writeFilter({ m: s.system });
      all.addEventListener('click', (e) => { if (e.ctrlKey || e.metaKey || e.shiftKey || e.button) return; e.preventDefault(); open({ m: s.system }); });
      acts.append(all); copy.append(acts);
    }
    h.querySelector('.hcount').textContent = (heroAt + 1) + ' / ' + heroList.length;
    if (byHand) heroRun();
  }

  // ---- The rows. Home: Continue playing, the rows by popularity, the machines. A filter or a search: one list, a page
  // at a time.
  const ROW_CAP = 36;                          // cards a row shows before its "See all" card (VoidTV's SHELF_CAP)
  function rowSection(title, list, f, count) {
    const sec = el('section', 'row');
    const h = el('h2', '', title);
    if (count) h.append(el('small', '', count.toLocaleString('en-US') + (count === 1 ? ' game' : ' games')));
    if (f) { const see = el('a', 'see', 'See all ›'); see.href = writeFilter(f); see.onclick = (e) => { e.preventDefault(); open(f); }; h.append(see); }
    const wrap = el('div', 'rowwrap'), track = el('div', 'track');
    for (const g of list.slice(0, ROW_CAP)) track.append(box(g));
    // The end card counts every game the row's See all opens, not only the ones the main showing put in the row.
    const total = Math.max(count || 0, list.length), showing = Math.min(list.length, ROW_CAP);
    if (f && total > showing) {
      const end = el('a', 'box endcard'); end.href = writeFilter(f);
      end.append(el('b', '', '+' + (total - showing)), el('span', '', 'See all ' + total));
      end.onclick = (e) => { e.preventDefault(); open(f); };
      track.append(end);
    }
    const arrow = (d) => rowArrow(track, d);
    track.addEventListener('scroll', peekScrolled, { passive: true });
    wrap.append(arrow(-1), track, arrow(1));
    sec.append(h, wrap);
    return sec;
  }
  // VoidTV's row arrows (Bryan, 20 Nov 2026: "exactly like voidtv"): its own chevron icon, and a press moves the row by
  // whole boxes, as many as fit less one arrow's room, so a box never stops cut in half (site/index.html slide()).
  function rowArrow(track, d) {
    const b = el('button', 'arrow ' + (d < 0 ? 'l' : 'r')); b.type = 'button'; b.tabIndex = -1;
    b.append(el('i', 'ico ' + (d < 0 ? 'chevron-left' : 'chevron-right')));
    b.setAttribute('aria-label', d < 0 ? 'Scroll left' : 'Scroll right'); b.title = d < 0 ? 'Scroll left' : 'Scroll right';
    b.onclick = () => {
      const first = track.firstElementChild, gap = parseFloat(getComputedStyle(track).columnGap) || 14;
      const step = first ? first.getBoundingClientRect().width + gap : 168;
      track.scrollBy({ left: d * Math.max(step, Math.floor((track.clientWidth - 120) / step) * step), behavior: 'smooth' });
    };
    return b;
  }
  function machineRow() {
    const counts = new Map();
    for (const g of shelfGames) counts.set(g.system, (counts.get(g.system) || 0) + 1);
    const sec = el('section', 'row');
    sec.append(el('h2', '', 'Machines'));
    const track = el('div', 'track machines');
    for (const k of Object.keys(SYSTEMS)) {
      if (!counts.get(k)) continue;
      const a = el('a', 'mtile'); a.href = writeFilter({ m: k }); a.style.setProperty('--sys', SYSTEMS[k].color);
      a.append(el('b', '', SYSTEMS[k].name), el('span', '', counts.get(k) + (counts.get(k) === 1 ? ' game' : ' games')));
      a.onclick = (e) => { if (e.ctrlKey || e.metaKey || e.shiftKey || e.button) return; e.preventDefault(); open({ m: k }); };
      track.append(a);
    }
    const wrap = el('div', 'rowwrap'); wrap.append(rowArrow(track, -1), track, rowArrow(track, 1)); sec.append(wrap);
    return sec;
  }
  // Continue playing: the games with an automatic save in this browser, the last played first (saves.js keeps them).
  async function continueRow() {
    if (!root.PlaySaves || !root.PlaySaves.keys) return null;
    const ids = new Set((await root.PlaySaves.keys()).map(String).filter((k) => k.endsWith(':auto')).map((k) => k.slice(0, -5)));
    const games = shelfGames.filter((g) => ids.has(g.id));
    const when = await Promise.all(games.map((g) => root.PlaySaves.get(g.id + ':auto').then((r) => (r && r.when) || 0).catch(() => 0)));
    const list = games.map((g, i) => [g, when[i]]).sort((a, b) => b[1] - a[1]).map(([g]) => g);
    if (!list.length) return null;
    const sec = rowSection('Continue playing', list);
    sec.classList.add('cont-row');
    return sec;
  }

  let shown = 0;                               // which show() is current (a slow Continue row never lands on a later list)
  function show() {
    const rows = document.getElementById('rows'), intro = document.getElementById('intro'), heroEl = document.getElementById('hero');
    const turn = ++shown;
    peekHide();
    rows.textContent = '';
    const home = isHome();
    if (heroEl) heroEl.hidden = !home || !heroList.length;
    if (intro) intro.classList.add('quiet');     // the hero or the list's own heading says what the page is
    document.body.classList.toggle('home', home);
    if (!shelfGames.length) { rows.innerHTML = '<p class="loading">No games on the shelf right now.</p>'; return; }
    if (home) {
      const list = homeRows(shelfGames);
      rows.append(rowSection(list[0].title, list[0].games, list[0].f, list[0].count), machineRow());
      for (const r of list.slice(1)) rows.append(rowSection(r.title, r.games, r.f, r.count));
      // What is in the news (play/src/moments-shelf.js, the shared moments engine): its rows go first under the banner.
      if (root.PlayMoments) root.PlayMoments.place(rows, shelfGames, rowSection, () => turn === shown);
      continueRow().then((sec) => { if (sec && turn === shown) rows.prepend(sec); }).catch(() => {});
      return;
    }
    let games = shelfGames.filter((g) => matches(g, filter)).sort(byPopular);
    const own = listRows(games, filter);
    const head = el('div', 'vhead');
    const back = el('button', 'flt crumb', '← All games'); back.type = 'button';
    back.onclick = () => { filter = {}; const q = document.getElementById('f-q'); if (q) q.value = ''; changed(); };
    const h = el('h2', '', viewTitle(filter));
    h.append(el('small', '', games.length ? games.length.toLocaleString('en-US') + (games.length === 1 ? ' game' : own.length ? ' games' : ' games, the most played first') : ''));
    head.append(back, h);
    rows.append(head);
    if (!games.length) {
      const p = el('p', 'loading none');
      const b = el('button', 'flt all', 'Show all'); b.type = 'button';
      b.onclick = () => { filter = {}; document.getElementById('f-q').value = ''; changed(); };
      p.append('No games match these choices. ', b);
      rows.appendChild(p);
      return;
    }
    for (const r of own) rows.append(rowSection(r.title, r.games, r.f, r.games.length));
    if (own.length) {
      games = games.slice().sort(byName);
      const sec = el('section', 'row'); sec.append(el('h2', '', 'Every game, A to Z')); rows.append(sec);
    }
    const list = el('div', 'boxes');
    // Plan C4: a list of hundreds shows a page at a time; the last box is "More", which adds the next page in place.
    let at = 0;
    const more = el('button', 'box more'); more.type = 'button';
    const page = () => {
      const next = games.slice(at, at + (at ? PAGE_MORE : PAGE_FIRST));
      for (const g of next) list.insertBefore(box(g), more);
      at += next.length;
      const left = games.length - at;
      more.hidden = left <= 0; more.textContent = 'More (' + left + ')';
      more.setAttribute('aria-label', left + ' more games');
    };
    more.onclick = () => { const from = at; page(); const first = list.children[from]; if (first) first.focus({ preventScroll: true }); };
    list.appendChild(more); page();
    rows.appendChild(list);
  }

  // Arrow keys and the gamepad walk the page; A or Enter opens what has the focus. The first card gets the focus when a
  // pad wakes up.
  function steer() {
    let padSeen = false, idleTimer = 0, tourTimer = 0;   // the idle tour, below
    const boxes = () => [...document.querySelectorAll('.box')];
    // What the arrows and the d-pad walk: the hero's buttons, the filter row, the rows' links and the cards, or only the
    // open list of choices.
    const STOPS = '.hero-home:not([hidden]) .btn, .hero-home:not([hidden]) .harrow, #filters:not([hidden]) .flt, .flt.all, .flt.crumb, .see, .mtile, .box';
    const stops = () => [...document.querySelectorAll(pickOpen() ? '#pick .opt' : STOPS)];
    const onStop = () => { const a = document.activeElement; return a && a.matches && a.matches(STOPS + ', .opt') ? a : null; };
    const move = (dir) => {
      const all = stops(); if (!all.length) return;
      const cur = onStop();
      const next = cur ? nearest(cur, all, dir) : (boxes()[0] || all[0]);
      if (next) { next.focus({ preventScroll: true }); next.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }); }
    };
    const play = () => {
      if (!held) return;
      const l = heldLayer(), c = l.querySelector('.cont');
      location.href = (document.activeElement === c && !c.hidden ? c : l.querySelector('.play')).href;
    };
    // B, Esc or Backspace on a list goes back to the front page.
    const back = () => { if (isHome()) return false; filter = {}; const q = document.getElementById('f-q'); if (q) q.value = ''; changed(); return true; };
    addEventListener('keydown', (e) => {
      woke();
      if (held) {
        if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); putBack(); }
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); turnOver(); }
        else if (e.key === 'Tab') {             // the focus stays on the box in hand
          e.preventDefault();
          const l = heldLayer(), stops = [...l.querySelectorAll('.acts a:not([hidden]), .acts button')];
          stops[(stops.indexOf(document.activeElement) + (e.shiftKey ? stops.length - 1 : 1)) % stops.length].focus();
        }
        return;
      }
      if (e.key === 'Escape' && closePick()) { e.preventDefault(); return; }
      const dir = { ArrowRight: 'right', ArrowLeft: 'left', ArrowDown: 'down', ArrowUp: 'up' }[e.key];
      // In the search box, left and right move the cursor; up and down leave it.
      if (dir && e.target && e.target.id === 'f-q' && (dir === 'left' || dir === 'right')) return;
      if (dir) { e.preventDefault(); move(dir); }
    });
    const was = new Map();
    const AXIS = 0.6;
    (function poll() {
      // A phone connected as a controller steers the shelf too, as one more gamepad (src/shelf-phones.js).
      const pads = (navigator.getGamepads ? [...navigator.getGamepads()] : []).concat(root.PlayShelfPads ? root.PlayShelfPads() : []).filter((p) => p && p.mapping === 'standard');
      if (pads.length) { document.getElementById('pad-hint').hidden = false; padSeen = true; padEver = true; }
      for (const p of pads) {
        const b = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
        const now = { up: b(12) || p.axes[1] < -AXIS, down: b(13) || p.axes[1] > AXIS, left: b(14) || p.axes[0] < -AXIS, right: b(15) || p.axes[0] > AXIS, a: b(0) || b(9), b: b(1) };
        const before = was.get(p.index) || {};
        if (Object.keys(now).some((k) => now[k] && !before[k])) woke();
        if (held) {
          if (now.a && !before.a) play();
          else if (now.b && !before.b) putBack();
          else if ((now.left && !before.left) || (now.right && !before.right)) turnOver();
        } else {
          for (const dir of ['up', 'down', 'left', 'right']) if (now[dir] && !before[dir]) move(dir);
          if (now.a && !before.a) {
            const cur = onStop();
            if (cur && cur.id === 'f-q') cur.focus(); else if (cur) cur.click(); else move('right');
          }
          if (now.b && !before.b && !closePick()) back();
        }
        was.set(p.index, now);
      }
      requestAnimationFrame(poll);
    })();

    // The idle tour (plan T25): on a couch screen (a TV, or once a gamepad has been seen) left alone for a minute, the
    // shelf walks itself, box to box, the way a shop window turns. Any key, button, touch or mouse stops it. Never on a
    // phone or tablet, where a page that moves by itself is in the way.
    const couch = () => (padSeen || TV.test(navigator.userAgent)) && !matchMedia('(pointer: coarse)').matches;
    function woke() {
      clearInterval(tourTimer); tourTimer = 0; clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        if (!couch() || held || document.hidden) return woke();
        tourTimer = setInterval(() => {
          const all = boxes(); if (!all.length) return;
          const i = all.indexOf(document.activeElement);
          const next = all[(i + 1) % all.length];
          next.focus({ preventScroll: true }); next.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
        }, TOUR_MS);
      }, IDLE_MS);
    }
    for (const ev of ['pointerdown', 'pointermove', 'wheel', 'touchstart']) addEventListener(ev, woke, { passive: true });
    woke();
    addEventListener('scroll', peekScrolled, { passive: true });
  }
  const IDLE_MS = 60000, TOUR_MS = 4000;
  const PAGE_FIRST = 24, PAGE_MORE = 48;   // plan C4: boxes a list shows at first, and per More
  const TV = /SMART-TV|SmartTV|Tizen|Web0S|webOS|BRAVIA|Android TV|GoogleTV|CrKey|AFT[A-Z]|Roku|HbbTV/i;

  const api = { PAGE_FIRST, PAGE_MORE, ROW_CAP, HERO_MS, SYSTEMS, SETS, HOME_ROWS, decadeName, backLines, IDLE_MS, TOUR_MS, GENRES, genresOf,
    readFilter, writeFilter, matches, choices, byPopular, homeRows, listRows, heroSlides, aboutLine, playsText, viewTitle };
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }
  root.PlayShelf = api;
  // The first draw waits up to 1.5 s for the moments in the news, so the banner can open on one (moments-shelf.js).
  Promise.all([fetch('shelf/index.json', { cache: 'no-store' }).then((r) => r.json()), root.PlayMoments ? root.PlayMoments.wait(1500) : null]).then(([index]) => render(index))
    .catch(() => { document.getElementById('rows').innerHTML = '<p class="loading">The shelf did not load. Try again in a moment.</p>'; });
  // Back goes where the visitor came from on this site; from outside (or nothing), to the home page.
  try { const back = document.getElementById('back'); if (back && document.referrer && new URL(document.referrer).origin === location.origin) back.addEventListener('click', (e) => { e.preventDefault(); history.back(); }); } catch (e) { /* the link still goes home */ }
  addEventListener('popstate', () => {
    filter = readFilter(location.search);
    const q = document.getElementById('f-q'); if (q) q.value = filter.q || '';
    chipLabels(); show();
  });
  steer();
})(typeof self !== 'undefined' ? self : this);
