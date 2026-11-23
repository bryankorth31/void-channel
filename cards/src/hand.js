// VoidTV cards: the phone's hand page. Licence: GPL-2.0-or-later (play/LICENSE).
// Bryan, 22 Nov 2026: "my hand is on my phone able to be looked through and reorganized how i want them". He picked
// "hand B, the rows": every card in full, in rows, never scrolled. The player drags a card to any spot, or taps Group
// suits or By number. The order belongs to this phone: moving a card sends nothing to the table.
// The top part is pure (tested in cards/test/hand.test.js); the part below it draws the page and runs only in a browser.
(function (root) {
  'use strict';
  const C = root.VoidCards || require('./cards.js');
  const KEY_NAME = 'voidtv-cards', SEAT_NAME = 'voidtv-seat';
  const MIN_COLS = 4, MAX_COLS = 8, MAX_CARD_W = 120, SHAPE = 1.4;

  // ---------- Pure parts ----------
  // Where the hand goes: the fewest columns (4 to 8) that fit every card in the space, so nothing ever scrolls. A card
  // keeps its 5 by 7 shape. The grid is centred. If even 8 columns do not fit, the cards are made smaller.
  function layout(count, width, height, gap) {
    const n = Math.max(0, Math.floor(count) || 0), W = Math.max(1, width), H = Math.max(1, height), g = Math.max(0, gap || 0);
    let cols = MIN_COLS, rows = 1, cardW = 0, found = false;
    for (let c = MIN_COLS; c <= MAX_COLS && !found; c++) {
      cols = c; rows = Math.max(1, Math.ceil(n / c));
      cardW = (W - g * (c - 1)) / c;
      if (rows * cardW * SHAPE + (rows - 1) * g <= H) found = true;
    }
    if (!found) cardW = Math.min(cardW, (H - (rows - 1) * g) / (rows * SHAPE));
    cardW = Math.max(1, Math.min(cardW, MAX_CARD_W));
    const cardH = cardW * SHAPE, used = Math.max(1, Math.min(n, cols));
    const gridW = used * cardW + (used - 1) * g, gridH = rows * cardH + (rows - 1) * g;
    return { cols, rows, cardW, cardH, gap: g, left: (W - gridW) / 2, top: (H - gridH) / 2 };
  }
  // The top left corner of the card at a hand position.
  function slot(lay, i) {
    return { x: lay.left + (i % lay.cols) * (lay.cardW + lay.gap), y: lay.top + Math.floor(i / lay.cols) * (lay.cardH + lay.gap) };
  }
  // The hand position under a point (in the same space as the layout), kept inside 0..count-1.
  function indexAt(x, y, lay, count) {
    if (!(count > 0)) return 0;
    const col = Math.max(0, Math.min(lay.cols - 1, Math.floor((x - lay.left) / (lay.cardW + lay.gap))));
    const row = Math.max(0, Math.min(lay.rows - 1, Math.floor((y - lay.top) / (lay.cardH + lay.gap))));
    return Math.max(0, Math.min(count - 1, row * lay.cols + col));
  }
  // This phone's player key and the order of its hand, from what storage held. The same room keeps both; a new room, or
  // anything that is not our record, starts again with a new key and an empty order.
  function keyRecord(storageText, room, makeKey) {
    let r = null;
    try { r = JSON.parse(storageText); } catch (e) { r = null; }
    const ok = r && typeof r === 'object' && r.room === room && typeof r.key === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(r.key);
    if (ok) return { room, key: r.key, order: Array.isArray(r.order) ? r.order.filter((c) => typeof c === 'string') : [] };
    return { room, key: makeKey(), order: [] };
  }
  // A tap on a card: unselect it if it is picked; else pick it. With room for one the pick moves; with more, up to max.
  function nextSelection(selected, card, max) {
    const sel = selected || [], limit = Math.max(1, max || 1);
    if (sel.includes(card)) return sel.filter((c) => c !== card);
    if (limit === 1) return [card];
    return sel.length < limit ? sel.concat(card) : sel.slice();
  }
  // May the main button send now: your turn, a play to make, and the number picked within the game's limits.
  function canSend(selected, play, myTurn) {
    if (!myTurn || !play) return false;
    const n = (selected || []).length, min = play.min === undefined ? 1 : play.min, max = play.max === undefined ? 1 : play.max;
    return n >= min && n <= max;
  }
  const nameAt = (roster, p) => (roster && roster.players && roster.players[p] ? roster.players[p].name : 'Player ' + (p + 1));
  // The big line at the top: whose turn it is.
  function turnLine(v, roster, me) {
    if (!v || !Array.isArray(v.turn) || !v.turn.length) return '';
    if (me !== null && me !== undefined && v.turn.includes(me)) return 'Your turn';
    if (v.turn.length > 1) return nameAt(roster, v.turn[0]) + ' and others';
    return nameAt(roster, v.turn[0]) + "'s turn";
  }
  // The words on the end panel.
  function winnerLine(v, roster, me) {
    if (!v || !v.over) return '';
    const w = Array.isArray(v.over.winners) ? v.over.winners : [];
    if (me !== null && me !== undefined && w.includes(me)) return 'You won!';
    if (!w.length) return 'Game over.';
    return w.map((p) => nameAt(roster, p)).join(' and ') + ' won.';
  }

  // What the phone sends to ask the table for a move: a button's move has no cards; the main button's has the cards
  // picked, and the extra choice when one was asked for. Both go the same way, so neither can be sent wrongly.
  // (Found in the browser, 22 Nov 2026: Draw a card did nothing, because a button's move went out bare, not as a c-move.)
  function moveMessage(type, cards, extra) {
    const move = { type };
    if (cards) move.cards = cards.slice();
    if (extra) move[extra.field] = extra.value;
    return { type: 'c-move', move };
  }

  const api = { layout, slot, indexAt, keyRecord, nextSelection, canSend, turnLine, winnerLine, moveMessage, KEY_NAME, SEAT_NAME };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VoidHand = api;

  // ---------- The page ----------
  if (typeof document === 'undefined') return;
  const F = root.VoidFace;
  const $ = (id) => document.getElementById(id);
  const hex32 = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const code = (new URLSearchParams(location.search).get('r') || '').toUpperCase();
  // Whether this phone has been asked its name in this room already (kept on the phone, beside its player key).
  const ASKED_NAME = 'voidtv-cards-asked';
  const wasAsked = () => { try { return localStorage.getItem(ASKED_NAME) === code; } catch (e) { return false; } };
  const markAsked = () => { try { localStorage.setItem(ASKED_NAME, code); } catch (e) { /* asked again after a reload, no harm */ } };
  const GAP = 6, PAD = 6;

  let ws = null, ended = false, tries = 0;
  let blocker = null;             // { h, p, link }: a note that replaces the page (an error, or a wait)
  let you = null, roster = null, table = null, mine = null;   // what the table last told this phone
  let askName = false, askedName = false, myName = '';
  let rec = null;                 // { room, key, order }
  let order = [];                 // the hand in the player's own order
  let selected = [], fresh = new Set(), lay = null, drag = null, choosing = false;
  const els = new Map();          // card id -> its element in the hand
  let toastTimer = 0;

  // ----- Storage: the key and the order, kept if the phone lets us -----
  let memory = null;
  function loadRecord() {
    let text = null;
    try { text = localStorage.getItem(KEY_NAME); } catch (e) { text = memory; }
    rec = keyRecord(text, code, hex32);
    order = rec.order.slice();
    saveRecord();
  }
  function saveRecord() {
    rec.order = order.slice();
    const text = JSON.stringify(rec);
    memory = text;
    try { localStorage.setItem(KEY_NAME, text); } catch (e) { /* kept in memory */ }
  }
  function token() {
    let t = null;
    try { t = sessionStorage.getItem(SEAT_NAME); } catch (e) { /* private mode */ }
    if (!t || !/^[A-Za-z0-9_-]{16,64}$/.test(t)) {
      t = hex32();
      try { sessionStorage.setItem(SEAT_NAME, t); } catch (e) { /* fine */ }
    }
    return t;
  }

  // ----- Talking to the table -----
  const send = (m) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };
  function toast(words) {
    const t = $('toast');
    t.textContent = words; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 4000);
  }
  function connect() {
    if (!/^[2-9A-Z]{4}$/.test(code)) { blocker = { h: 'No room code', p: 'Scan the code on the big screen, or type it.', link: true }; render(); return; }
    ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/room/' + code + '/join?t=' + token());
    ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch (x) { return; } onMessage(m); };
    ws.onclose = (e) => {
      ws = null;
      if (ended) return;
      const stop = (h, p, link, final) => { if (final) ended = true; blocker = { h, p, link }; render(); };
      if (e.code === 4404) return stop('No game with that code', 'The code changes each game. Check the big screen.', true);
      if (e.code === 4409) return stop('This game is full', 'The table has no room for more phones.', false);
      if (e.code === 4423) return stop('This game is locked', 'The big screen is not letting new phones in right now.', false);
      if (e.code === 4403) return stop('The big screen removed this phone', 'Ask whoever runs the screen if that was a mistake.', false, true);
      if (e.code === 4410 || e.code === 4408) return stop('The big screen closed', 'Scan the new code on the big screen to play again.', true);
      // A dropped connection: try again, a little slower each time; the seat is kept for a minute.
      if (e.code === 4411) { /* the seat was taken over: nothing special, try again */ }
      blocker = { h: 'Reconnecting', p: 'The connection dropped. Trying again.', link: false }; render();
      setTimeout(connect, Math.min(8000, 500 * 2 ** tries++));
    };
  }

  function onMessage(m) {
    if (!m || typeof m.type !== 'string') return;
    if (m.type === 'hello') { tries = 0; blocker = null; const hi = { type: 'c-hi', key: rec.key }; if (myName) hi.name = myName; send(hi); render(); return; }
    if (m.type === 'host-away') { blocker = { h: 'One moment', p: "The table's page is reloading. One moment.", link: false }; render(); return; }
    if (m.type === 'host-back') { blocker = null; render(); return; }
    if (m.type === 'host-gone') { ended = true; blocker = { h: 'The table closed', p: 'The table closed. Scan the new code to play again.', link: true }; render(); return; }
    if (m.type === 'c-moved') {
      ended = true;
      blocker = { h: 'Open somewhere else', p: 'This player is now open on another phone or tab.', link: false };
      try { if (ws) ws.close(); } catch (e) { /* already closed */ }
      render(); return;
    }
    if (m.type === 'c-you') {
      you = m;
      if (m.refused) { $('name-err').textContent = 'That name cannot go on the big screen. Try another, or just play.'; askName = true; }
      // Asked once in a room, and only in the lobby: a phone coming back in the middle of a game goes straight to its
      // hand, and the question does not come up again between games (found in the browser, 22 Nov 2026).
      else if (!askedName && !wasAsked() && !m.named && m.phase === 'lobby') { askedName = true; askName = true; markAsked(); }
      else if (m.named) askName = false;
      // A hand that has been dealt is never hidden behind the name question.
      if (typeof m.me === 'number' && !m.refused) askName = false;
      render(); return;
    }
    if (m.type === 'c-roster') { roster = m; render(); return; }
    if (m.type === 'c-table') { table = m; render(); return; }
    if (m.type === 'c-hand') { takeHand(m.m); render(); return; }
    if (m.type === 'c-no') { toast(String(m.error || 'That move was not allowed.')); }
  }

  // ----- The hand -----
  const meSeat = () => (you && typeof you.me === 'number' ? you.me : null);
  function handOf(m) {
    const z = m && m.zones && m.zones['hand:' + meSeat()];
    return z && Array.isArray(z.cards) ? z.cards : [];
  }
  function takeHand(m) {
    const before = mine ? new Set(handOf(mine)) : null;
    mine = m || null;
    const hand = handOf(mine);
    order = C.arrange(rec.order, hand);
    saveRecord();
    selected = selected.filter((c) => hand.includes(c));
    if (before && before.size) {
      for (const c of hand) if (!before.has(c)) {
        fresh.add(c);
        setTimeout(() => { fresh.delete(c); placeAll(); }, 1500);
      }
    }
    if (!mine.hints) selected = [];
  }
  const hints = () => (mine && mine.hints) || null;
  const myTurn = () => {
    const me = meSeat();
    return !!(hints() && me !== null && table && table.v && !table.v.over && table.v.turn.includes(me));
  };

  // Make an element for every card in the hand, keep the old ones so they can slide, and drop the ones that left.
  function syncCards() {
    const box = $('handbox');
    for (const [id, el] of els) if (!order.includes(id)) { el.remove(); els.delete(id); }
    for (const id of order) {
      if (els.has(id)) continue;
      const el = document.createElement('div');
      el.className = 'hc'; el.dataset.id = id;
      el.appendChild(F.card(id));
      box.appendChild(el);
      els.set(id, el);
    }
    $('nohand').hidden = order.length > 0;
  }
  function measure() {
    const r = $('handbox').getBoundingClientRect();
    lay = layout(order.length, Math.max(1, r.width - 2 * PAD), Math.max(1, r.height - 2 * PAD), GAP);
    lay.left += PAD; lay.top += PAD;
  }
  function placeOne(id, i) {
    const el = els.get(id), p = slot(lay, i), play = hints() && hints().play;
    const up = selected.includes(id) ? -lay.cardH * 0.14 : 0;
    el.style.fontSize = (lay.cardW / 5) + 'px';
    el.style.transform = 'translate(' + p.x + 'px,' + (p.y + up) + 'px)';
    el.classList.toggle('sel', selected.includes(id));
    el.classList.toggle('fresh', fresh.has(id));
    el.classList.toggle('dim', !!(myTurn() && play && Array.isArray(play.cards) && !play.cards.includes(id)));
  }
  function placeAll(except) {
    if (!lay) return;
    order.forEach((id, i) => { if (id !== except && els.has(id)) placeOne(id, i); });
  }
  function drawHand() { syncCards(); measure(); placeAll(drag && drag.moving ? drag.id : null); }

  // ----- Dragging and tapping -----
  function point(e) { const r = $('handbox').getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function onDown(e) {
    const el = e.target.closest ? e.target.closest('.hc') : null;
    if (!el || drag || choosing) return;
    const id = el.dataset.id, p = point(e), s = slot(lay, order.indexOf(id));
    drag = { id, pid: e.pointerId, sx: p.x, sy: p.y, ox: p.x - s.x, oy: p.y - s.y, moving: false };
    try { $('handbox').setPointerCapture(e.pointerId); } catch (x) { /* not needed */ }
  }
  function onMove(e) {
    if (!drag || e.pointerId !== drag.pid) return;
    const p = point(e), el = els.get(drag.id);
    if (!drag.moving) {
      if (Math.hypot(p.x - drag.sx, p.y - drag.sy) <= 8) return;
      drag.moving = true; el.classList.add('lift');
    }
    el.style.transform = 'translate(' + (p.x - drag.ox) + 'px,' + (p.y - drag.oy) + 'px) scale(1.12)';
    const to = indexAt(p.x, p.y, lay, order.length);
    if (to !== order.indexOf(drag.id)) { order = C.place(order, drag.id, to); placeAll(drag.id); }
  }
  function onUp(e) {
    if (!drag || e.pointerId !== drag.pid) return;
    const d = drag, el = els.get(d.id);
    drag = null;
    if (el) el.classList.remove('lift');
    if (d.moving) { saveRecord(); }
    else if (e.type === 'pointerup') { selected = nextSelection(selected, d.id, hints() && hints().play ? hints().play.max : 1); }
    placeAll(); drawBar();
  }
  function reorder(fn) { order = fn(order); saveRecord(); placeAll(); }

  // ----- The playing page -----
  function drawTop() {
    const v = table && table.v, me = meSeat();
    $('room').textContent = 'room ' + code;
    const turn = $('turn');
    turn.textContent = turnLine(v, roster, me);
    turn.classList.toggle('mine', !!(v && me !== null && v.turn.includes(me)));
    $('status').textContent = (table && table.status) || '';
    const pile = $('pile');
    pile.textContent = '';
    const trick = v && v.zones && v.zones.trick, disc = v && v.zones && v.zones.discard;
    pile.classList.toggle('trick', !!(trick && trick.cards && trick.cards.length));
    if (trick && trick.cards && trick.cards.length) for (const c of trick.cards.slice(-6)) pile.appendChild(F.card(c));
    else if (disc && disc.top) pile.appendChild(F.card(disc.top));
    const others = $('others');
    others.textContent = '';
    if (!v) return;
    for (let i = 0; i < v.n; i++) {
      if (i === me) continue;
      const z = v.zones['hand:' + i], s = document.createElement('span');
      s.textContent = nameAt(roster, i) + (z ? ' ' + z.n : '');
      if (v.turn.includes(i)) s.className = 'turnp';
      if (roster && roster.players && roster.players[i] && roster.players[i].here === false) s.classList.add('away');
      others.appendChild(s);
    }
  }
  function drawPrivs() {
    const box = $('privs'), me = meSeat();
    box.textContent = '';
    if (!mine) return;
    for (const id of Object.keys(mine.zones)) {
      const z = mine.zones[id];
      if (id === 'hand:' + me || !z || !Array.isArray(z.cards) || !z.cards.length) continue;
      const row = document.createElement('div'), label = document.createElement('b'), cs = document.createElement('div');
      row.className = 'priv'; cs.className = 'cs';
      const nm = id.split(':')[0];
      label.textContent = nm.charAt(0).toUpperCase() + nm.slice(1);
      for (const c of z.cards) cs.appendChild(F.card(c));
      row.append(label, cs);
      box.appendChild(row);
    }
  }
  function drawBar() {
    const h = hints(), turn = myTurn(), play = h && h.play, main = $('b-main'), hb = $('hint-btns');
    hb.textContent = '';
    if (turn && h && Array.isArray(h.buttons)) {
      for (const b of h.buttons) {
        const el = document.createElement('button');
        el.type = 'button'; el.className = 'btn'; el.textContent = String(b.label || b.type);
        el.addEventListener('click', () => send(moveMessage(b.type)));
        hb.appendChild(el);
      }
    }
    main.hidden = !(turn && play);
    if (play) { main.textContent = play.label || 'Play'; main.disabled = !canSend(selected, play, turn); }
  }
  function overPanel() {
    const v = table && table.v, over = !!(v && v.over);
    $('over').hidden = !over;
    if (over) {
      $('over-h').textContent = winnerLine(v, roster, meSeat());
      const note = $('over-note');
      note.textContent = v.over.note ? String(v.over.note) : '';
      note.hidden = !v.over.note;
      $('choose').hidden = true; choosing = false;
    }
  }

  // ----- The main button and the extra choice -----
  function sendPlay(extra) {
    const play = hints() && hints().play;
    if (!play) return;
    send(moveMessage(play.type, selected, extra));
    try { if (navigator.vibrate) navigator.vibrate(12); } catch (e) { /* not on this phone */ }
  }
  function onMain() {
    const play = hints() && hints().play;
    if (!play || !canSend(selected, play, myTurn())) return;
    const ch = play.choose;
    if (ch && (!ch.cards || selected.some((c) => ch.cards.includes(c)))) { openChoose(ch); return; }
    sendPlay();
  }
  function openChoose(ch) {
    $('choose-h').textContent = ch.title || 'Choose';
    const list = $('choose-list');
    list.textContent = '';
    for (const entry of ch.from || []) {
      const val = entry !== null && typeof entry === 'object' ? entry.v : entry;
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn';
      if (ch.kind === 'suit') {
        const mark = document.createElement('span'), nm = document.createElement('span');
        mark.className = 'mark2'; mark.textContent = F.GLYPH[val] || String(val);
        nm.textContent = C.SUIT_NAMES[val] || String(val);
        b.classList.add(val === 'H' || val === 'D' ? 'red' : 'black');
        b.append(mark, nm);
      } else if (ch.kind === 'player') {
        b.textContent = nameAt(roster, val);
      } else {
        b.textContent = entry !== null && typeof entry === 'object' && entry.label !== undefined ? String(entry.label) : String(val);
      }
      b.addEventListener('click', () => { $('choose').hidden = true; choosing = false; sendPlay({ field: ch.field, value: val }); });
      list.appendChild(b);
    }
    $('choose').hidden = false; choosing = true;
  }

  // ----- Which page is showing -----
  function only(id) { for (const s of ['note', 'name', 'lobby', 'watch', 'game']) $(s).hidden = s !== id; }
  function note(h, p, link) { $('note-h').textContent = h; $('note-p').textContent = p; $('note-a').hidden = !link; only('note'); }
  function render() {
    if (blocker) { note(blocker.h, blocker.p, blocker.link); return; }
    if (!you || !roster) { note('Joining', 'Finding the big screen.', false); return; }
    if (askName) { only('name'); return; }
    const me = meSeat();
    if (roster.phase === 'lobby') {
      $('lobby-h').textContent = 'You are in, ' + you.name + '.';
      $('lobby-p').textContent = (roster.title || 'The game') + ' starts when the table deals.';
      const list = $('lobby-list');
      list.textContent = '';
      for (const pl of roster.players || []) { const li = document.createElement('li'); li.textContent = pl.name; list.appendChild(li); }
      only('lobby'); return;
    }
    if (me === null) { only('watch'); return; }
    if (!mine || !table) { note('Dealing', 'Getting your cards.', false); return; }
    only('game');
    drawTop(); drawHand(); drawPrivs(); drawBar(); overPanel();
    measure(); placeAll(drag && drag.moving ? drag.id : null);   // the strips can change height: measure again
  }

  // ----- Wiring -----
  $('name-f').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('name-i').value.trim().slice(0, 16);
    if (!v) return;
    $('name-err').textContent = '';
    myName = v; askName = false;
    send({ type: 'c-name', name: v });
    render();
  });
  $('skip').addEventListener('click', () => { $('name-err').textContent = ''; askName = false; render(); });
  $('b-suit').addEventListener('click', () => reorder(C.bySuit));
  $('b-rank').addEventListener('click', () => reorder(C.byRank));
  $('b-main').addEventListener('click', onMain);
  $('choose-back').addEventListener('click', () => { $('choose').hidden = true; choosing = false; });
  const box = $('handbox');
  box.addEventListener('pointerdown', onDown);
  box.addEventListener('pointermove', onMove);
  box.addEventListener('pointerup', onUp);
  box.addEventListener('pointercancel', onUp);
  box.addEventListener('contextmenu', (e) => e.preventDefault());
  const relayout = () => { if (!$('game').hidden) { measure(); placeAll(drag && drag.moving ? drag.id : null); } };
  addEventListener('resize', relayout);
  addEventListener('orientationchange', () => setTimeout(relayout, 200));
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(relayout).observe(box);

  // Keep the phone's screen on during the game.
  let lock = null;
  async function stayAwake() { try { if (navigator.wakeLock && !lock) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); } } catch (e) { /* not allowed */ } }
  addEventListener('pointerdown', stayAwake, { once: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) stayAwake(); });

  loadRecord();
  connect();
})(typeof self !== 'undefined' ? self : this);
