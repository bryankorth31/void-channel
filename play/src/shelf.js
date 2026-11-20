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

  function box(g) {
    const sys = SYSTEMS[g.system] || { name: g.system, shape: 'cart', color: '#8a8fa3' };
    const a = document.createElement('a');
    a.className = 'box ' + sys.shape; a.href = 'game.html?game=' + encodeURIComponent(g.id);
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
    return a;
  }

  function render(index) {
    const rows = document.getElementById('rows');
    rows.textContent = '';
    for (const s of shelves(index.games)) {
      const sec = document.createElement('section'); sec.className = 'row';
      const h = document.createElement('h2'); h.textContent = s.title;
      const list = document.createElement('div'); list.className = 'boxes';
      for (const g of s.games) list.appendChild(box(g));
      sec.append(h, list); rows.appendChild(sec);
    }
    if (!index.games.length) rows.innerHTML = '<p class="loading">No games on the shelf right now.</p>';
  }

  // Arrow keys and the gamepad walk the boxes; A or Enter opens one. The first box gets the focus when a pad wakes up.
  function steer() {
    const boxes = () => [...document.querySelectorAll('.box')];
    const move = (dir) => {
      const all = boxes(); if (!all.length) return;
      const cur = document.activeElement && document.activeElement.classList.contains('box') ? document.activeElement : null;
      const next = cur ? nearest(cur, all, dir) : all[0];
      if (next) { next.focus(); next.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }); }
    };
    addEventListener('keydown', (e) => {
      const dir = { ArrowRight: 'right', ArrowLeft: 'left', ArrowDown: 'down', ArrowUp: 'up' }[e.key];
      if (dir) { e.preventDefault(); move(dir); }
    });
    const was = new Map();
    const AXIS = 0.6;
    (function poll() {
      const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter((p) => p && p.mapping === 'standard') : [];
      if (pads.length) document.getElementById('pad-hint').hidden = false;
      for (const p of pads) {
        const b = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
        const now = { up: b(12) || p.axes[1] < -AXIS, down: b(13) || p.axes[1] > AXIS, left: b(14) || p.axes[0] < -AXIS, right: b(15) || p.axes[0] > AXIS, a: b(0) || b(9) };
        const before = was.get(p.index) || {};
        for (const dir of ['up', 'down', 'left', 'right']) if (now[dir] && !before[dir]) move(dir);
        if (now.a && !before.a) {
          const cur = document.activeElement && document.activeElement.classList.contains('box') ? document.activeElement : null;
          if (cur) cur.click(); else move('right');
        }
        was.set(p.index, now);
      }
      requestAnimationFrame(poll);
    })();
  }

  const api = { shelves, SYSTEMS, decadeName };
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }
  root.PlayShelf = api;
  fetch('shelf/index.json', { cache: 'no-store' }).then((r) => r.json()).then(render)
    .catch(() => { document.getElementById('rows').innerHTML = '<p class="loading">The shelf did not load. Try again in a moment.</p>'; });
  steer();
})(typeof self !== 'undefined' ? self : this);
