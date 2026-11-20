// VoidTV PLAY: the shelf (plan T14). Licence: GPL-2.0-or-later (play/LICENSE).
// One box per game, on shelves by decade (the 80s, the 90s, the 2000s), drawn from play/shelf/index.json, which the
// nightly check keeps to the games the Internet Archive still has. Each box shows the game's picture from its Archive
// item, its machine, its year and how many can play. A tap, a click, Enter or a gamepad's A opens the game.
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
  };
  const decadeOf = (y) => (y ? Math.floor(y / 10) * 10 : null);
  const decadeName = (d) => (d === null ? 'More games' : d >= 2000 ? 'The ' + d + 's' : 'The ' + String(d).slice(2) + 's');

  // Shelves in order, each with its games in year order (pure: tested in play/test/shelf.test.js).
  function shelves(games) {
    const by = new Map();
    for (const g of games) { const d = decadeOf(g.year); if (!by.has(d)) by.set(d, []); by.get(d).push(g); }
    return [...by.entries()].sort((a, b) => (a[0] === null) - (b[0] === null) || a[0] - b[0])
      .map(([d, list]) => ({ title: decadeName(d), games: list.slice().sort((a, b) => (a.year || 0) - (b.year || 0) || a.title.localeCompare(b.title)) }));
  }

  // Gamepad or arrow keys: move to the nearest box in that direction (by the boxes' places on screen).
  function nearest(from, all, dir) {
    const a = from.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best = null, bestScore = Infinity;
    for (const el of all) {
      if (el === from) continue;
      const b = el.getBoundingClientRect(), bx = b.left + b.width / 2, by = b.top + b.height / 2, dx = bx - ax, dy = by - ay;
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
  const sysOf = (g) => SYSTEMS[g.system] || { name: g.system, shape: 'cart', color: '#8a8fa3' };

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
    let el = document.getElementById('held');
    if (el) return el;
    el = document.createElement('div'); el.id = 'held'; el.className = 'held'; el.hidden = true;
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
    el.innerHTML = '<div class="scrim"></div><div class="lift"><div class="turn"><div class="face front"><span class="art"><img alt="" decoding="async"></span></div>'
      + '<div class="face back"><span class="strip"><img alt="" decoding="async"></span><h3></h3><ul class="how"></ul><dl></dl><p class="help"></p>'
      + '<div class="acts"><a class="cont" hidden>Continue</a><a class="play">Play</a><button type="button" class="put">Put back</button></div><p class="hint">Turn it over: left or right</p></div></div></div>';
    document.body.appendChild(el);
    el.querySelector('.scrim').onclick = putBack;
    el.querySelector('.put').onclick = putBack;
    el.querySelector('.turn').addEventListener('click', (e) => { if (!e.target.closest('a,button')) turnOver(); });
    return el;
  }
  function pickUp(g, from) {
    const el = heldLayer(), sys = sysOf(g);
    held = { g, from };
    el.style.setProperty('--sys', sys.color);
    el.querySelector('.turn').className = 'turn ' + sys.shape;
    el.setAttribute('aria-label', g.title);
    const pic = from.querySelector('img') ? from.querySelector('img').src : '';
    for (const img of el.querySelectorAll('img')) { img.src = pic; img.hidden = !pic; }
    el.querySelector('h3').textContent = g.title;
    const dl = el.querySelector('dl'); dl.textContent = '';
    for (const [k, v] of backLines(g)) { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = k; dd.textContent = v; dl.append(dt, dd); }
    // Audit S5: the first three things to do, said for the input in hand; the help line only when there are none.
    const ul = el.querySelector('.how'); ul.textContent = '';
    // A collection's game plays as its machine does (plan C4: libHow, once per machine in the shelf list).
    const lib = (g.b && libHow[g.system]) || {};
    for (const [d, h] of ((g.how || lib.how) && (g.how || lib.how)[inputNow()]) || []) {
      const li = document.createElement('li'), b = document.createElement('b'); b.textContent = d; li.append(b, ' ' + h); ul.appendChild(li);
    }
    el.querySelector('.help').textContent = ul.children.length ? '' : (g.help || lib.help || '');
    // Audit S6: Play starts the game itself (a phone keeps its start screen, which allows fullscreen); a game with an
    // automatic save offers Continue first and calls Play "New game".
    const cont = el.querySelector('.cont'), play = el.querySelector('.play');
    const direct = !phone();
    play.href = from.href + (direct ? '&go=new' : ''); play.textContent = 'Play';
    cont.hidden = true; cont.href = from.href + (direct ? '&go=continue' : '');
    if (root.PlaySaves) root.PlaySaves.get(g.id + ':auto').then((rec) => {
      if (!rec || !held || held.g !== g) return;
      cont.hidden = false; play.textContent = 'New game'; cont.focus({ preventScroll: true });
    }).catch(() => {});
    el.hidden = false;
    el.classList.remove('flipped');
    void el.offsetWidth;                       // lay the front out first, so the turn to the back is seen
    el.classList.add('flipped');
    el.querySelector('.play').focus({ preventScroll: true });
  }
  function putBack() {
    if (!held) return;
    const el = heldLayer(), from = held.from;
    held = null; el.hidden = true; el.classList.remove('flipped');
    from.focus({ preventScroll: true });
  }
  function turnOver() { if (held) heldLayer().classList.toggle('flipped'); }

  function box(g) {
    const sys = sysOf(g);
    const a = document.createElement('a');
    a.className = 'box ' + sys.shape; a.href = 'game.html?game=' + encodeURIComponent(g.id) + (g.b ? '&b=' + encodeURIComponent(g.b) : '');
    a.style.setProperty('--sys', sys.color);
    a.setAttribute('aria-label', g.title + ', ' + sys.name + (g.year ? ', ' + g.year : '') + (g.players > 1 ? ', up to ' + g.players + ' players' : ''));
    const art = document.createElement('span'); art.className = 'art';
    const img = new Image(); img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
    img.src = 'https://archive.org/services/img/' + encodeURIComponent(g.item);
    img.onerror = () => { img.remove(); art.classList.add('none'); };
    const fallback = document.createElement('span'); fallback.className = 'fallback'; fallback.textContent = g.title;
    art.append(img, fallback);
    const label = document.createElement('span'); label.className = 'label';
    const t = document.createElement('span'); t.className = 'title'; t.textContent = g.title;
    const m = document.createElement('span'); m.className = 'meta';
    m.textContent = sys.name + (g.year ? ' · ' + g.year : '') + (g.players > 1 ? ' · ' + g.players + ' players' : '');
    label.append(t, m);
    a.append(art, label);
    a.addEventListener('click', (e) => {
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;   // a new tab still opens the game itself
      e.preventDefault(); pickUp(g, a);
    });
    return a;
  }

  // Plan G2: Wikidata's genres are fine-grained ("side-scrolling beat 'em up"), so the shelf files them under a few plain
  // ones. A game can sit under two (boxing is Action and Sports). Pure: tested in play/test/shelf.test.js.
  const GENRES = [
    ['Action', /beat 'em up|hack and slash|fighting|boxing|shoot|run and gun|action game/i],
    ['Platform', /platform/i],
    ['Puzzle and maze', /puzzle|maze/i],
    ['Adventure', /adventure|role-playing|text-based|interactive fiction/i],
    ['Strategy and simulation', /strateg|simulation|management/i],
    ['Sports and racing', /sport|boxing|racing|football|soccer|golf|tennis/i],
    ['Learning', /educational|learning/i],
  ];
  const genresOf = (labels) => GENRES.filter(([, re]) => (labels || []).some((l) => re.test(l))).map(([n]) => n);
  // Accents fold away on both sides (audit: "pokemon" found nothing; the titles say Pokémon).
  const fold = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();

  // The filter lives in the address (?m=snes&g=Platform&p=2&d=1990&q=mario), so a link shares what it shows.
  const KEYS = { m: 'Machine', g: 'Genre', p: 'Players', d: 'Decade' };
  function readFilter(search) {
    const q = new URLSearchParams(search || '');
    const f = {};
    for (const k of [...Object.keys(KEYS), 'q']) if (q.get(k)) f[k] = q.get(k).slice(0, 60);
    return f;
  }
  function writeFilter(f) {
    const q = new URLSearchParams();
    for (const k of [...Object.keys(KEYS), 'q']) if (f[k]) q.set(k, f[k]);
    const s = q.toString();
    return s ? '?' + s : '';
  }
  function matches(g, f) {
    if (f.m && g.system !== f.m) return false;
    if (f.g && !(g.genres || []).includes(f.g)) return false;
    if (f.p === '2' && !((g.players || 1) >= 2)) return false;
    if (f.d && String(decadeOf(g.year)) !== f.d) return false;
    if (f.q && !fold(g.title + ' ' + (g.publisher || '')).includes(fold(f.q))) return false;
    return true;
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
  let shelfIndexSeen = null;
  function render(index) {
    shelfIndexSeen = index;
    shelfGames = index.games; libHow = index.libHow || {};
    filter = readFilter(location.search);
    filterRow();
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
    q.oninput = () => { filter.q = q.value.trim(); changed(); };
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
  function changed() {
    history.replaceState(null, '', location.pathname + writeFilter(filter));
    chipLabels(); show();
  }
  function openPick(chip) {
    const pick = document.getElementById('pick'), k = chip.dataset.f;
    pick.textContent = '';
    for (const [v, label] of choices(shelfGames, k)) {
      const o = document.createElement('button'); o.type = 'button'; o.className = 'opt' + (v === (filter[k] || '') ? ' on' : '');
      o.textContent = label;
      o.onclick = () => { if (v) filter[k] = v; else delete filter[k]; closePick(); changed(); };
      pick.appendChild(o);
    }
    pick.style.left = chip.offsetLeft + 'px'; pick.style.top = (chip.offsetTop + chip.offsetHeight + 6) + 'px';
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

  function show() {
    const rows = document.getElementById('rows');
    rows.textContent = '';
    const games = shelfGames.filter((g) => matches(g, filter));
    if (shelfGames.length && !games.length) {
      const p = document.createElement('p'); p.className = 'loading none';
      const b = document.createElement('button'); b.type = 'button'; b.className = 'flt all'; b.textContent = 'Show all';
      b.onclick = () => { filter = {}; document.getElementById('f-q').value = ''; changed(); };
      p.append('No games match these choices. ', b);
      rows.appendChild(p);
      return;
    }
    for (const s of shelves(games)) {
      const sec = document.createElement('section'); sec.className = 'row';
      const h = document.createElement('h2'); h.textContent = s.title;
      const list = document.createElement('div'); list.className = 'boxes';
      // Plan C4: a shelf of hundreds shows a page at a time; the last box is "More", which adds the next page in place.
      let shown = 0;
      const more = document.createElement('button'); more.type = 'button'; more.className = 'box more';
      const page = () => {
        const next = s.games.slice(shown, shown + (shown ? PAGE_MORE : PAGE_FIRST));
        for (const g of next) list.insertBefore(box(g), more);
        shown += next.length;
        const left = s.games.length - shown;
        more.hidden = left <= 0; more.textContent = 'More (' + left + ')';
        more.setAttribute('aria-label', left + ' more games from ' + s.title);
      };
      more.onclick = () => { const at = shown; page(); const first = list.children[at]; if (first) first.focus({ preventScroll: true }); };
      list.appendChild(more); page();
      sec.append(h, list); rows.appendChild(sec);
    }
    if (!shelfGames.length) rows.innerHTML = '<p class="loading">No games on the shelf right now.</p>';
  }

  // Arrow keys and the gamepad walk the boxes; A or Enter opens one. The first box gets the focus when a pad wakes up.
  function steer() {
    let padSeen = false, idleTimer = 0, tourTimer = 0;   // the idle tour, below
    const boxes = () => [...document.querySelectorAll('.box')];
    // What the arrows and the d-pad walk: the filter row and the boxes, or only the open list of choices.
    const stops = () => [...document.querySelectorAll(pickOpen() ? '#pick .opt' : '#filters:not([hidden]) .flt, .flt.all, .box')];
    const onStop = () => { const a = document.activeElement; return a && a.matches && a.matches('.box, .flt, .opt') ? a : null; };
    const move = (dir) => {
      const all = stops(); if (!all.length) return;
      const cur = onStop();
      const next = cur ? nearest(cur, all, dir) : (boxes()[0] || all[0]);
      if (next) { next.focus(); next.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }); }
    };
    const play = () => {
      if (!held) return;
      const l = heldLayer(), c = l.querySelector('.cont');
      location.href = (document.activeElement === c && !c.hidden ? c : l.querySelector('.play')).href;
    };
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
      const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter((p) => p && p.mapping === 'standard') : [];
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
          if (now.b && !before.b) closePick();
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
  }
  const IDLE_MS = 60000, TOUR_MS = 4000;
  const PAGE_FIRST = 24, PAGE_MORE = 48;   // plan C4: boxes a shelf shows at first, and per More
  const TV = /SMART-TV|SmartTV|Tizen|Web0S|webOS|BRAVIA|Android TV|GoogleTV|CrKey|AFT[A-Z]|Roku|HbbTV/i;

  const api = { PAGE_FIRST, PAGE_MORE, shelves, SYSTEMS, decadeName, backLines, IDLE_MS, TOUR_MS, GENRES, genresOf, readFilter, writeFilter, matches, choices };
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }
  root.PlayShelf = api;
  // The 18+ shelf (Bryan, 20 Nov 2026: adult-themed games kept behind a gate): ?r=18 asks the age question first, then
  // shows its own list; the main shelf never lists those games, and a link to them shows only when there are some.
  const R18 = 'voidtv-play-18';
  const adultOk = () => { try { return localStorage.getItem(R18) === 'yes'; } catch (e) { return false; } };
  const failed = () => { document.getElementById('rows').innerHTML = '<p class="loading">The shelf did not load. Try again in a moment.</p>'; };
  const load = (file) => fetch(file, { cache: 'no-store' }).then((r) => r.json()).then(render).catch(failed);
  function adultShelf() {
    document.body.classList.add('r18');
    document.querySelector('.intro h1').textContent = 'Games for adults';
    document.querySelector('.intro p').textContent = 'Made for grown-ups: some have sexual content, gore or gambling. Kept apart from the rest of PLAY, and never on Kids.';
    for (const e of document.querySelectorAll('header .give')) e.remove();
    load('shelf/index-18.json');
  }
  if (new URLSearchParams(location.search).get('r') === '18') {
    for (const e of document.querySelectorAll('header .give')) e.remove();   // no donation beside the 18+ question either
    if (adultOk()) adultShelf();
    else {
      const rows = document.getElementById('rows');
      rows.innerHTML = '<section class="gate18" role="dialog" aria-label="Games for adults"><h2>Games for adults</h2>'
        + '<p>These games were made for grown-ups. Some have sexual content, gore or gambling. They are kept apart from the rest of PLAY and are never on Kids.</p>'
        + '<p><b>Are you 18 or older?</b></p><p class="gate-acts"><button type="button" class="flt" id="r18-yes">Yes, I am 18 or older</button> <a class="flt" href="./">No, back to the games</a></p></section>';
      document.getElementById('r18-yes').onclick = () => { try { localStorage.setItem(R18, 'yes'); } catch (e) { /* asked again next time */ } adultShelf(); };
      document.getElementById('r18-yes').focus();
    }
  } else load('shelf/index.json').then(() => {
    const ix = shelfIndexSeen; if (!ix || !ix.adultShelf) return;
    const foot = document.querySelector('.foot p'); if (!foot) return;
    const a = document.createElement('a'); a.href = '?r=18'; a.textContent = '18+ games'; a.className = 'r18-link';
    foot.append(' · ', a);
  });
  // Back goes where the visitor came from on this site; from outside (or nothing), to the home page.
  try { const back = document.getElementById('back'); if (back && document.referrer && new URL(document.referrer).origin === location.origin) back.addEventListener('click', (e) => { e.preventDefault(); history.back(); }); } catch (e) { /* the link still goes home */ }
  steer();
})(typeof self !== 'undefined' ? self : this);
