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

  // ----- What the bottom bar offers (hints are the game's own words, see cards/README.md "What a phone is told it may do") -----
  // Every move made with cards that this turn offers: the ones in hints.plays, then hints.play last (the main one).
  function cardMoves(h) {
    if (!h) return [];
    const list = Array.isArray(h.plays) ? h.plays.filter(Boolean) : [];
    return h.play ? list.concat([h.play]) : list;
  }
  // How many cards a tap may pick up to: the most any move of the turn takes, and at least one.
  function pickLimit(h) {
    return Math.max(1, ...cardMoves(h).map((m) => (m.max === undefined ? 1 : m.max)));
  }
  // The cards worth tapping now: every card some move lists. null when no card is held back (nothing is dimmed).
  function pickable(h) {
    const moves = cardMoves(h), out = [];
    if (!moves.length || moves.some((m) => !Array.isArray(m.cards))) return null;
    for (const m of moves) for (const c of m.cards) if (!out.includes(c)) out.push(c);
    return out;
  }
  // The bar's buttons for a turn, in the order they are drawn: first the moves with no cards (Draw a card, Pass, Bid),
  // then the moves made with cards, the main one last. A card move is lit only when the number of cards picked fits its
  // own min and max. Nothing at all when it is not this player's turn.
  function barItems(h, selected, myTurn) {
    if (!h || !myTurn) return [];
    const out = [];
    for (const b of Array.isArray(h.buttons) ? h.buttons : []) {
      out.push({ key: 'button:' + b.type, kind: 'button', type: b.type, label: String(b.label || b.type), choose: b.choose || null, enabled: true, main: false });
    }
    const moves = cardMoves(h);
    moves.forEach((m, i) => {
      out.push({ key: 'move:' + m.type, kind: 'move', type: m.type, label: String(m.label || 'Play'), choose: m.choose || null, enabled: canSend(selected, m, true), main: i === moves.length - 1 });
    });
    return out;
  }
  // The question to ask before this button's move goes out, or null. A button asks it always; a move made with cards asks
  // it when the choice names no cards, or one of the cards picked is among the ones it names (an eight asks for a suit).
  function choiceFor(item, selected) {
    const ch = item && item.choose;
    if (!ch) return null;
    if (item.kind === 'button' || !Array.isArray(ch.cards)) return ch;
    return (selected || []).some((c) => ch.cards.includes(c)) ? ch : null;
  }
  // The message for a bar button pressed: a button sends no cards, a card move sends the cards picked; extra is the answer.
  function itemMessage(item, selected, extra) {
    return moveMessage(item.type, item.kind === 'move' ? selected : null, extra);
  }
  // How a question's answers are laid out: a long list (a bid of nil to 13) goes four to a row so the whole of it fits a phone.
  const choiceColumns = (count) => (count > 6 ? 4 : count > 3 ? 3 : 2);
  // What the phone's small pile at the top shows: the trick being played, else the top of the pile, else the card on offer
  // (Conquian), as { cards, trick }. Only cards the public table shows.
  function pileView(v) {
    const z = (v && v.zones) || {}, trick = z.trick, disc = z.discard, offer = z.offer;
    if (trick && Array.isArray(trick.cards) && trick.cards.length) return { cards: trick.cards.slice(-6), trick: true };
    if (disc && disc.top) return { cards: [disc.top], trick: false };
    if (offer && Array.isArray(offer.cards) && offer.cards.length) return { cards: [offer.cards[0]], trick: false };
    return { cards: [], trick: false };
  }
  // The line about another player at the top of the phone: their name, how many cards they hold, and the game's own line
  // for their seat ("Bid 3, took 2") when it has one.
  function otherLine(v, roster, i) {
    const z = v && v.zones && v.zones['hand:' + i], note = v && v.pub && Array.isArray(v.pub.notes) ? v.pub.notes[i] : '';
    return nameAt(roster, i) + (z ? ' ' + z.n : '') + (note ? ' · ' + note : '');
  }

  const api = { layout, slot, indexAt, keyRecord, nextSelection, canSend, turnLine, winnerLine, moveMessage,
    cardMoves, pickLimit, pickable, barItems, choiceFor, itemMessage, choiceColumns, pileView, otherLine, KEY_NAME, SEAT_NAME };
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
  // The host's own hand on a phones-only table comes with the name the host typed on the start screen (src/screen.js).
  { const given = (new URLSearchParams(location.search).get('name') || '').trim().slice(0, 16); if (given) myName = given; }
  let practice = false;           // a practice hand is on: this phone shows its own player's tips (Bryan, 23 Nov 2026, "practice C")
  let phonesOnly = false;         // no TV: this phone shows the whole table behind its Table button (Bryan, 24 Nov 2026, "B, hand first")
  let tableOpen = false;
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
    // A code the rooms could never make (the letters of play/join.html) is said at once: the room door answers it with a plain 404,
    // which never reaches the 4404 below, so it sat on Reconnecting for good (voidverse function test F6, 24 Nov 2026).
    if (!code) { blocker = { h: 'No room code', p: "Type the 4 letters from the host's phone or the TV, or scan its code.", link: true }; render(); return; }
    if (!/^[2-9ACDEFGHJKMNPQRTUVWXY]{4}$/.test(code)) { blocker = { h: 'No game with that code', p: "Check the 4 letters on the host's phone or the TV.", link: true }; ended = true; render(); return; }
    ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/room/' + code + '/join?t=' + token());
    ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch (x) { return; } onMessage(m); };
    ws.onclose = (e) => {
      ws = null;
      if (ended) return;
      const stop = (h, p, link, final) => { if (final) ended = true; blocker = { h, p, link }; render(); };
      if (e.code === 4404) return stop('No game with that code', "The code changes each game. Check the host's phone or the TV.", true);
      if (e.code === 4409) return stop('This game is full', 'The table has no room for more phones.', false);
      if (e.code === 4423) return stop('This game is locked', 'The table is not letting new phones in right now.', false);
      if (e.code === 4403) return stop('The table removed this phone', 'Ask whoever runs the table if that was a mistake.', false, true);
      if (e.code === 4410 || e.code === 4408) return stop('The table closed', 'Join with the new code to play again.', true);
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
      if (m.refused) { $('name-err').textContent = 'That name cannot go on the table. Try another, or just play.'; askName = true; }
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
    if (m.type === 'c-practice') { practice = !!m.on; render(); return; }
    if (m.type === 'c-mode') { phonesOnly = !!m.phones; render(); return; }
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

  // Make an element for every card in the hand, keep the old ones so they can slide, and let the ones that left go. Returns
  // the cards that are new.
  function syncCards() {
    const box = $('handbox'), added = [];
    for (const [id, el] of els) if (!order.includes(id)) { els.delete(id); leave(el); }
    for (const id of order) {
      if (els.has(id)) continue;
      const el = document.createElement('div');
      el.className = 'hc'; el.dataset.id = id;
      el.appendChild(F.card(id));
      box.appendChild(el);
      els.set(id, el);
      added.push(id);
    }
    $('nohand').hidden = order.length > 0;
    return added;
  }
  // Motion on the phone (Bryan, 23 Nov 2026, with the big screen's in src/motion.js): CSS only, nothing that flashes, and
  // none at all on a phone that asks for reduced motion (decision B9).
  const still = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  // A card that left the hand (played, laid down, given away) lifts off it and goes up, toward the big screen.
  function leave(el) {
    if (still()) { el.remove(); return; }
    el.classList.add('gone');
    el.style.transform += ' translateY(-140%) scale(.85)';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 460);
  }
  // New cards come in from above, from the big screen: a new hand one card after another, as it is dealt; a card or two
  // drawn, at once. They start where they will lie, only higher, so they drop into place.
  function enter(ids) {
    const dealt = ids.length > 3;
    ids.forEach((id, k) => {
      const el = els.get(id), p = slot(lay, order.indexOf(id)), d = dealt ? k * 45 : 0;
      el.style.fontSize = (lay.cardW / 5) + 'px';
      el.style.transition = 'none';
      el.style.transform = 'translate(' + p.x + 'px,' + (-lay.cardH * 1.2) + 'px)';
      el.style.opacity = '0';
      void el.offsetWidth;
      el.style.transition = 'transform .45s cubic-bezier(.2,.75,.25,1) ' + d + 'ms, opacity .2s linear ' + d + 'ms';
      el.style.opacity = '';
      setTimeout(() => { el.style.transition = ''; }, 480 + d);
    });
  }
  function measure() {
    const r = $('handbox').getBoundingClientRect();
    lay = layout(order.length, Math.max(1, r.width - 2 * PAD), Math.max(1, r.height - 2 * PAD), GAP);
    lay.left += PAD; lay.top += PAD;
  }
  function placeOne(id, i, ok, lit) {
    const el = els.get(id), p = slot(lay, i);
    const up = selected.includes(id) ? -lay.cardH * 0.14 : 0;
    el.style.fontSize = (lay.cardW / 5) + 'px';
    el.style.transform = 'translate(' + p.x + 'px,' + (p.y + up) + 'px)';
    el.classList.toggle('sel', selected.includes(id));
    el.classList.toggle('fresh', fresh.has(id));
    el.classList.toggle('dim', !!(ok && !ok.includes(id)));
    el.classList.toggle('lit', !!(lit && lit.includes(id)));
  }
  function placeAll(except) {
    if (!lay) return;
    const ok = myTurn() ? pickable(hints()) : null;   // a card no move of this turn lists is dimmed
    // In a practice hand the cards that can go now are lit as well, when some of the hand cannot.
    const lit = practice && ok && ok.length < order.length ? ok : null;
    order.forEach((id, i) => { if (id !== except && els.has(id)) placeOne(id, i, ok, lit); });
  }
  function drawHand() {
    const added = syncCards();
    measure();
    if (added.length && lay && !still()) enter(added);
    placeAll(drag && drag.moving ? drag.id : null);
  }

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
    else if (e.type === 'pointerup') { selected = nextSelection(selected, d.id, pickLimit(hints())); }
    placeAll(); drawBar();
  }
  function reorder(fn) { order = fn(order); saveRecord(); placeAll(); }

  // ----- The playing page -----
  function drawTop() {
    const v = table && table.v, me = meSeat();
    $('room').textContent = 'room ' + code;
    $('practice').hidden = !practice;
    $('b-table').hidden = !phonesOnly;
    const turn = $('turn');
    turn.textContent = turnLine(v, roster, me);
    turn.classList.toggle('mine', !!(v && me !== null && v.turn.includes(me)));
    $('status').textContent = (table && table.status) || '';
    const pile = $('pile'), pv = pileView(v);
    pile.textContent = '';
    pile.classList.toggle('trick', pv.trick);
    for (const c of pv.cards) pile.appendChild(F.card(c));
    const others = $('others');
    others.textContent = '';
    if (!v) return;
    const notes = !!(v.pub && Array.isArray(v.pub.notes) && v.pub.notes.some(Boolean));
    others.classList.toggle('noted', notes);
    for (let i = 0; i < v.n; i++) {
      if (i === me) continue;
      const s = document.createElement('span');
      s.textContent = otherLine(v, roster, i);
      if (v.turn.includes(i)) s.className = 'turnp';
      if (roster && roster.players && roster.players[i] && roster.players[i].here === false) s.classList.add('away');
      others.appendChild(s);
    }
    // This player's own line from the game ("Bid 3, took 1"), after the others.
    const own = notes && me !== null && v.pub.notes[me];
    if (own) { const s = document.createElement('span'); s.textContent = 'You · ' + own; others.appendChild(s); }
  }
  // The rule file for the game on now, which this page loads for its rules card and tips, or null.
  const gameNow = () => (roster && root.VoidGames && Object.prototype.hasOwnProperty.call(root.VoidGames, roster.game) ? root.VoidGames[roster.game] : null);
  // A practice hand's tip for this player, on their turn: made by the game's rule file from this phone's own cards and
  // what it may do, and the public table. Nothing else is on this phone to make it from.
  function drawTip() {
    let words = '';
    if (practice && myTurn()) {
      const g = gameNow();
      try { words = g && g.teach ? String(g.teach.phone(mine, table.v, meSeat()) || '') : ''; } catch (e) { words = ''; }
    }
    $('tip-t').textContent = words;
    $('tip').hidden = !words;
  }
  // The rules card (Bryan, 23 Nov 2026, "Rules B"), open at any time: from the lobby or over the hand.
  function openRules() {
    const g = gameNow(), card = g && root.VoidRules ? root.VoidRules.draw(g) : null;
    if (!card) { toast('This game has no rules card yet.'); return; }
    $('rules-h').textContent = g.name;
    const body = $('rules-body');
    body.textContent = '';
    body.append(card);
    $('rules-back').textContent = $('game').hidden ? 'Back' : 'Back to my hand';
    $('rules').hidden = false;
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
  // The buttons are made again only when the turn offers different ones; a tap on a card only lights or dims them, so a
  // button is not replaced under a finger that is pressing it.
  let barSig = '';
  function drawBar() {
    const items = barItems(hints(), selected, myTurn()), mv = $('moves'), hb = $('hint-btns');
    const sig = items.map((i) => i.key + '|' + i.label + '|' + (i.main ? 1 : 0)).join('\n');
    if (sig !== barSig) {
      barSig = sig;
      hb.textContent = ''; mv.textContent = '';
      for (const it of items) {
        const el = document.createElement('button');
        el.type = 'button'; el.className = 'btn' + (it.main ? ' solid' : ''); el.textContent = it.label; el.dataset.key = it.key;
        el.addEventListener('click', () => press(it.key));
        (it.kind === 'button' ? hb : mv).appendChild(el);
      }
      mv.hidden = !mv.childNodes.length;
    }
    $('bar').classList.toggle('myturn', myTurn());   // a soft gold light along the bar while it is this player's turn
    for (const el of $('bar').querySelectorAll('button[data-key]')) {
      const it = items.find((i) => i.key === el.dataset.key);
      el.disabled = !(it && it.enabled);
    }
    if (choosing && !items.length) { $('choose').hidden = true; choosing = false; }   // the turn moved on while a question was open
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

  // ----- A bar button and the extra choice -----
  // Every button of the bar, those with no cards (Draw a card, Pass, Bid) and those made with cards (Play, Lay down, Discard),
  // goes through here. A button that asks a question opens the same panel whichever kind it is, then sends its answer.
  function sendItem(it, extra) {
    send(itemMessage(it, selected, extra));
    try { if (navigator.vibrate) navigator.vibrate(12); } catch (e) { /* not on this phone */ }
  }
  function press(key) {
    if (choosing) return;
    const it = barItems(hints(), selected, myTurn()).find((i) => i.key === key);
    if (!it || !it.enabled) return;
    const ch = choiceFor(it, selected);
    if (ch) { openChoose(ch, it); return; }
    sendItem(it);
  }
  function openChoose(ch, it) {
    $('choose-h').textContent = ch.title || 'Choose';
    const list = $('choose-list');
    list.textContent = '';
    list.dataset.cols = String(choiceColumns((ch.from || []).length));
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
      b.addEventListener('click', () => { $('choose').hidden = true; choosing = false; sendItem(it, { field: ch.field, value: val }); });
      list.appendChild(b);
    }
    $('choose').hidden = false; choosing = true;
  }

  // ----- The whole table, on a phones-only table (no TV shows it) -----
  // Drawn from the public table alone (table.v, what the big screen would draw), with the table page's own helpers
  // (src/screen.js, its pure part): the trick or the middle of the table, then every player with their cards in hand, their
  // game line and what they have laid down. Nothing here comes from another phone's hand.
  function cardRow(ids, cls) {
    const row = document.createElement('div');
    row.className = 'ts-cards' + (cls ? ' ' + cls : '');
    for (const id of ids || []) row.appendChild(id ? F.card(id) : F.back());
    return row;
  }
  function drawTable() {
    const S = root.VoidScreen, v = table && table.v, body = $('table-body'), me = meSeat();
    body.textContent = '';
    $('table-turn').textContent = turnLine(v, roster, me);
    if (!v || !S) return;
    const mid = document.createElement('div');
    mid.className = 'ts-mid';
    const trick = v.zones && v.zones.trick && Array.isArray(v.zones.trick.cards) ? v.zones.trick.cards : [];
    if (trick.length) {
      const t = document.createElement('div');
      t.className = 'ts-trick';
      trick.forEach((c, i) => {
        const cell = document.createElement('div'), who = S.trickSeat(v, i), name = document.createElement('small');
        cell.className = 'ts-played';
        cell.appendChild(F.card(c));
        name.textContent = who === null ? '' : who === me ? 'You' : nameAt(roster, who);
        cell.appendChild(name);
        t.appendChild(cell);
      });
      mid.appendChild(t);
    }
    for (const it of S.centreItems(v)) {
      const box = document.createElement('div'), say = document.createElement('small');
      box.className = 'ts-item';
      if (it.kind === 'pack') { box.appendChild(cardRow([null])); say.textContent = it.n + ' in the pack'; }
      else if (it.kind === 'pile') { box.appendChild(cardRow([it.card])); say.textContent = 'Top of the pile'; }
      else if (it.kind === 'offer') { if (it.card) box.appendChild(cardRow([it.card])); say.textContent = it.card ? 'On offer' : 'Nothing on offer'; }
      else if (it.kind === 'waste') { box.appendChild(cardRow([it.top])); say.textContent = it.n + ' set aside'; }
      else if (it.kind === 'groups') { for (const g of it.groups) box.appendChild(cardRow(g, 'ts-group')); say.textContent = 'On the table'; }
      box.appendChild(say);
      mid.appendChild(box);
    }
    body.appendChild(mid);
    for (let i = 0; i < v.n; i++) {
      const row = document.createElement('div'), head = document.createElement('div'), b = document.createElement('b'), info = document.createElement('span');
      row.className = 'ts-seat' + (v.turn.includes(i) ? ' turn' : '') + (i === me ? ' me' : '');
      b.textContent = i === me ? 'You' : nameAt(roster, i);
      const z = v.zones && v.zones['hand:' + i], note = S.seatNote(v, i);
      info.textContent = [z ? z.n + (z.n === 1 ? ' card' : ' cards') : '', note, v.turn.includes(i) ? 'to play' : ''].filter(Boolean).join(' · ');
      head.className = 'ts-head';
      head.append(b, info);
      row.appendChild(head);
      const laid = S.laidGroups(v, i);
      if (laid.length) { const l = document.createElement('div'); l.className = 'ts-laid'; for (const g of laid) l.appendChild(cardRow(g, 'ts-group')); row.appendChild(l); }
      body.appendChild(row);
    }
  }
  function openTable() { tableOpen = true; $('tablesheet').hidden = false; drawTable(); }
  function closeTable() { tableOpen = false; $('tablesheet').hidden = true; }

  // ----- Which page is showing -----
  function only(id) { for (const s of ['note', 'name', 'lobby', 'watch', 'game']) $(s).hidden = s !== id; $('home-out').hidden = id === 'game'; }
  // A way back to voidtv.net from every screen (Bryan's rule: a visible way back on every page; 24 Nov 2026: "on mobile umm Caitlin
  // was unable to back out of the card game and go back to void TV"). The game screen's wordmark is the link; the other screens get a
  // small one at the top. While a game is on it asks first, and the host of a phones-only table (this page in the table's frame) is
  // told the table closes for everyone.
  const inFrame = (() => { try { return window.top !== window.self; } catch (e) { return true; } })();
  function goHome(e) {
    const playing = !!(roster && roster.phase === 'play' && meSeat() !== null);
    if (!playing && !inFrame) return;
    const words = inFrame ? 'Leave and go to voidtv.net? You are the host, so the table closes for everyone.' : 'Leave the game and go to voidtv.net?';
    if (!confirm(words)) e.preventDefault();
  }
  function note(h, p, link) { $('note-h').textContent = h; $('note-p').textContent = p; $('note-a').hidden = !link; only('note'); }
  function render() {
    if (blocker) { note(blocker.h, blocker.p, blocker.link); return; }
    if (!you || !roster) { note('Joining', 'Finding the table.', false); return; }
    if (askName) { only('name'); return; }
    const me = meSeat();
    if (roster.phase === 'lobby') {
      $('lobby-h').textContent = 'You are in, ' + you.name + '.';
      $('lobby-p').textContent = (roster.title || 'The game') + ' starts when the table deals.';
      const list = $('lobby-list');
      list.textContent = '';
      for (const pl of roster.players || []) { const li = document.createElement('li'); li.textContent = pl.name; list.appendChild(li); }
      $('lobby-rules').textContent = 'How to play ' + (roster.title || 'the game');
      $('lobby-rules').hidden = !(gameNow() && gameNow().howto);
      only('lobby'); return;
    }
    if (me === null) { only('watch'); return; }
    if (!mine || !table) { note('Dealing', 'Getting your cards.', false); return; }
    only('game');
    drawTop(); drawTip(); drawHand(); drawPrivs(); drawBar(); overPanel();
    if (tableOpen) drawTable();
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
  $('choose-back').addEventListener('click', () => { $('choose').hidden = true; choosing = false; });
  $('b-rules').addEventListener('click', openRules);
  $('lobby-rules').addEventListener('click', openRules);
  $('rules-back').addEventListener('click', () => { $('rules').hidden = true; });
  $('home').addEventListener('click', goHome);
  $('home-out').addEventListener('click', goHome);
  $('b-table').addEventListener('click', openTable);
  $('table-back').addEventListener('click', closeTable);
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
