// VoidTV cards: voidtv.net/cards opened on a phone. Licence: GPL-2.0-or-later (play/LICENSE).
// Bryan, 24 Nov 2026: "That little card game chooser badly shown and sized. It needs an inviting card game page to show more
// than this empty looking introduction", and "The menus aren't just the same across the verse". He picked look B from three
// pictures: "B games first". On a phone the table page (made for a TV) is not drawn small; this page is shown instead:
// the voidtv.net areas menu, the games as big tiles (each opens its rules card), a line on how to host, and a join box that
// stays at the bottom and hands the code to /join, which sends the phone to the right room. No room is opened here.
// "Show the table on this screen" (?table) still opens the table on a phone, for a phone or tablet plugged into a TV.
// Two parts, as in screen.js: the pure part (isPhone, normCode, playersLine, tiles) is tested in Node; the page part draws.
(function (root) {
  'use strict';

  // ---------- the pure part ----------

  // A phone: a touch screen whose short side is under 600 CSS pixels (an upright or sideways phone, not a tablet or a TV),
  // unless the address asks for the table (?table). w: { innerWidth, innerHeight, matchMedia, location }.
  function isPhone(w) {
    if (!w) return false;
    const search = (w.location && w.location.search) || '';
    if (/[?&]table(?:[=&]|$)/.test(search)) return false;
    let coarse = false;
    try { coarse = !!(w.matchMedia && w.matchMedia('(pointer: coarse)').matches); } catch (e) { coarse = false; }
    return coarse && Math.min(w.innerWidth || 0, w.innerHeight || 0) > 0 && Math.min(w.innerWidth, w.innerHeight) < 600;
  }

  // A room code as the rooms make them (play/join.html): four of these letters and numbers, or null.
  const ALPHABET = '23456789ACDEFGHJKMNPQRTUVWXY';
  function normCode(s) {
    const c = String(s || '').replace(/\s+/g, '').toUpperCase();
    return c.length === 4 && [...c].every((x) => ALPHABET.includes(x)) ? c : null;
  }

  // "2 to 7 players", "4 players", "2 players".
  function playersLine(game) {
    const p = (game && game.players) || {};
    if (!(p.min > 0)) return '';
    return p.max > p.min ? p.min + ' to ' + p.max + ' players' : p.min + (p.min === 1 ? ' player' : ' players');
  }

  // The tiles in the order of the picture Bryan picked; a game added later comes after them. Each tile shows a few cards
  // of its own game (ids as cards.js names them).
  const ORDER = ['crazy-eights', 'hearts', 'spades', 'rummy', 'go-fish', 'go-fish-pairs', 'conquian'];
  const FAN = {
    'crazy-eights': ['8S', '8H', '5H'], hearts: ['QS', 'AH', '2H'], spades: ['AS', 'KS', 'QS'], rummy: ['4D', '5D', '6D'],
    'go-fish': ['7C', '7D', '7H'], 'go-fish-pairs': ['KS', 'KH'], conquian: ['3C', '3D', '3S'],
  };
  const TINT = ['felt', 'rose', 'navy', 'amber', 'felt', 'teal', 'plum'];
  function tiles(games) {
    const ids = Object.keys(games || {});
    const order = ORDER.filter((id) => ids.includes(id)).concat(ids.filter((id) => !ORDER.includes(id)));
    return order.map((id, i) => ({ id, name: games[id].name || id, players: playersLine(games[id]), cards: FAN[id] || ['AS', 'KH', 'QD'], tint: TINT[i % TINT.length] }));
  }

  const api = { isPhone, normCode, playersLine, tiles, ORDER, ALPHABET };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VoidCardsPhone = api;

  // ---------- the page part ----------

  if (typeof document === 'undefined') return;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // The rules card of one game in a sheet over the page; Close, Escape or a tap outside takes it away.
  function openRules(game, back) {
    const shade = el('div', 'ph-shade'), sheet = el('div', 'ph-sheet');
    sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-label', 'How to play ' + game.name);
    const head = el('div', 'ph-sheet-head'), h = el('h2', '', 'How to play ' + game.name), close = el('button', 'ph-close', 'Close');
    close.type = 'button';
    head.append(h, close);
    sheet.append(head, el('p', 'ph-sheet-players', playersLine(game)));
    if (root.VoidRules && root.VoidRules.draw) sheet.append(root.VoidRules.draw(game));
    sheet.append(el('p', 'ph-sheet-note', 'Deal it from the table on a TV or a computer: voidtv.net/cards'));
    shade.append(sheet);
    const done = () => { shade.remove(); document.removeEventListener('keydown', key); if (back) back.focus(); };
    const key = (e) => { if (e.key === 'Escape') done(); };
    close.addEventListener('click', done);
    shade.addEventListener('click', (e) => { if (e.target === shade) done(); });
    document.addEventListener('keydown', key);
    document.body.append(shade);
    close.focus();
  }

  // The join box: four letter boxes over one input, and Join.
  function joinBox() {
    const form = el('form', 'ph-join');
    form.setAttribute('novalidate', '');
    const label = el('label', 'ph-join-label', 'Joining a table?');
    label.htmlFor = 'ph-code';
    label.append(el('small', '', 'Type the 4 letters on the TV'));
    const field = el('div', 'ph-code');
    const boxes = [0, 1, 2, 3].map(() => field.appendChild(el('span', 'ph-box')));
    const input = el('input');
    input.id = 'ph-code'; input.maxLength = 4; input.autocomplete = 'off'; input.spellcheck = false;
    input.setAttribute('autocapitalize', 'characters'); input.setAttribute('inputmode', 'text'); input.setAttribute('aria-label', 'Room code');
    field.append(input);
    const go = el('button', 'ph-go', 'Join');
    go.type = 'submit';
    const why = el('p', 'ph-why');
    why.setAttribute('role', 'status');
    const show = () => {
      const v = input.value.replace(/\s+/g, '').toUpperCase().slice(0, 4);
      if (input.value !== v) input.value = v;
      boxes.forEach((b, i) => { b.textContent = v[i] || ''; b.classList.toggle('on', i === Math.min(v.length, 3) && document.activeElement === input); });
    };
    // A new letter clears the last message; focus alone does not (the message asks to look at the TV and type again).
    input.addEventListener('input', () => { why.textContent = ''; show(); });
    input.addEventListener('focus', show); input.addEventListener('blur', show);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const code = normCode(input.value);
      if (!code) { why.textContent = 'The code is four letters and numbers, like KX7P. It is on the TV.'; input.focus(); return; }
      location.href = '/join?r=' + code;
    });
    form.append(label, field, go, why);
    show();
    return form;
  }

  // Draws the page into #app. Returns true when this is a phone and the page was drawn (the table then does not start).
  function take() {
    if (!isPhone(root)) return false;
    const F = root.VoidFace, games = root.VoidGames || {};
    document.documentElement.classList.add('phone-page');
    document.title = 'Card games on voidtv.net';
    const app = document.getElementById('app');
    app.textContent = '';
    const top = el('header', 'ph-top');
    const menu = el('span'); menu.setAttribute('data-void-areas-menu', '');
    const mark = el('a', 'ph-mark'); mark.href = '/'; mark.setAttribute('aria-label', 'voidtv.net home');
    mark.append(el('span', 'v', 'voidtv'), el('span', 'n', '.net'));
    top.append(menu, mark, el('span', 'ph-here', 'Card games'));
    const main = el('main', 'ph-main');
    const intro = el('div', 'ph-intro');
    intro.append(el('h1', '', 'Card games'), el('p', '', 'Play on the big screen together. Each phone holds one hand.'));
    const grid = el('div', 'ph-grid');
    for (const t of tiles(games)) {
      const b = el('button', 'ph-tile ph-' + t.tint);
      b.type = 'button';
      b.setAttribute('aria-label', t.name + ', ' + t.players + '. How to play');
      const fan = el('span', 'ph-fan');
      fan.setAttribute('aria-hidden', 'true');
      if (F) for (const id of t.cards) fan.append(F.card(id));
      b.append(fan, el('b', '', t.name), el('small', '', t.players));
      b.addEventListener('click', () => openRules(games[t.id], b));
      grid.append(b);
    }
    const more = el('div', 'ph-tile ph-more');
    more.append(el('b', '', 'Board games'), el('small', '', 'coming later'));
    grid.append(more);
    const host = el('p', 'ph-host');
    host.append('To host, open ', el('b', '', 'voidtv.net/cards'), ' on a TV or a computer. ');
    const here = el('a', '', 'Show the table on this screen'); here.href = '/cards/?table';
    host.append(here, '.');
    main.append(intro, grid, host);
    app.append(top, main, joinBox());
    return true;
  }
  root.VoidCardsPhone.take = take;
})(typeof self !== 'undefined' ? self : this);
