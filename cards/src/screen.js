// VoidTV cards: the big-screen table page's code. Licence: GPL-2.0-or-later (play/LICENSE).
// Bryan picked the round table from pictures (22 Nov 2026, "table A"): everyone sits round an oval and cards land in the middle.
// Two parts. The pure part (seatSpots, turnLine, winnerLine, trickSeat, joinHost) is tested in Node. The page part runs
// only where there is a document: it opens a room on the phone relay, makes the dealer, and draws from the dealer's
// snapshot and nothing else. The page never reads a game's state, so a hand cannot show here (see cards/README.md).
// Of the dealer it uses five things only: relay, pick, start, stop and snapshot.
(function (root) {
  'use strict';

  // The one donation setting for this page. It is shown on the game-over panel and nowhere else.
  const DONATE_URL = 'https://square.link/u/bJl9PGAC';
  const DONATE_LINE = 'If you found this service helpful, please think of donating to keep it running and to make more services like this possible. Every donation goes to CASH (cashvalues.org) and feeds its mission in the real world.';

  // ---------- the pure part ----------

  // Where the name plates sit, in percent of the screen: evenly round an ellipse, the first at the bottom centre and the
  // rest clockwise. Made for 1 to 16 players.
  const RING = { cx: 50, cy: 50, rx: 39, ry: 32 };
  function seatSpots(n) {
    const count = Math.max(1, Math.min(16, Math.floor(n) || 1)), out = [];
    for (let i = 0; i < count; i++) {
      const a = Math.PI / 2 + (i * 2 * Math.PI) / count;
      out.push({ x: Math.round((RING.cx + RING.rx * Math.cos(a)) * 100) / 100, y: Math.round((RING.cy + RING.ry * Math.sin(a)) * 100) / 100 });
    }
    return out;
  }
  // How big a plate is, in percent of the screen, for a table of n (a crowded table gets smaller words).
  const plateBox = (n) => ({ w: 11, h: n > 8 ? 9 : 10 });

  const nameAt = (players, i) => (players && players[i] && players[i].name) || 'Player ' + (i + 1);
  // "Sam", "Sam and Kim", "Sam, Kim and Lee".
  function joinNames(names) {
    if (names.length < 2) return names.join('');
    return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  }
  // The big line over the table: who may act now.
  function turnLine(view, players) {
    if (!view || !Array.isArray(view.turn) || !view.turn.length) return '';
    if (view.n > 1 && view.turn.length >= view.n) return 'Everyone to play';
    return joinNames(view.turn.map((p) => nameAt(players, p))) + ' to play';
  }
  // The game-over line.
  function winnerLine(view, players) {
    const w = view && view.over && Array.isArray(view.over.winners) ? view.over.winners : [];
    if (!w.length) return '';
    return joinNames(w.map((p) => nameAt(players, p))) + (w.length === 1 ? ' wins' : ' win');
  }
  // Which player laid the i-th card of the trick on the table (the trick is counted from whoever led), or null.
  function trickSeat(view, i) {
    if (!view || !view.pub || !Number.isInteger(view.pub.led) || !(view.n > 0)) return null;
    return (view.pub.led + i) % view.n;
  }
  // "voidtv.net/join" from the join address the relay gives.
  function joinHost(joinUrl) {
    try { return new URL(joinUrl).host + '/join'; } catch (e) { return 'voidtv.net/join'; }
  }

  const api = { seatSpots, plateBox, turnLine, winnerLine, trickSeat, joinHost, DONATE_URL };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VoidScreen = api;

  // ---------- the page part ----------

  if (typeof document === 'undefined') return;

  const CLOSED = 'The phone room is closed. Reload this page to open a new one.';
  const NOT_SET_UP = 'Phone rooms are not set up on this site yet.';
  const room = { code: null, join: null };
  let socket = null, problem = '', note = '';

  const send = (to, msg) => { if (socket && socket.readyState === 1) socket.send(JSON.stringify({ to, msg })); };
  const dealer = root.VoidDealer.create({
    games: root.VoidGames, send,
    cleanName: (raw) => root.TriviaWords.cleanName(raw, 'family'),
    onChange: (events) => changed(events),
    warn: (w) => console.warn(w),
  });

  const app = document.getElementById('app');
  // Everything typed by a phone goes in with textContent. Only the QR's own SVG goes in as markup.
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }
  const plural = (k, one, many) => k + ' ' + (k === 1 ? one : many);
  function button(text, onClick, cls) {
    const b = el('button', cls || '', text);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }
  function qr(cls) {
    const box = el('div', cls);
    if (room.join) box.innerHTML = root.PlayQR.svg(room.join, 8);
    return box;
  }

  function deal() {
    note = dealer.start() || '';
    if (note) render();
  }
  function pickBy(step) {
    const s = dealer.snapshot();
    if (s.phase === 'play' || s.games.length < 2) return;
    const at = s.games.findIndex((g) => g.id === s.game.id);
    note = '';
    dealer.pick(s.games[(at + step + s.games.length) % s.games.length].id);
  }

  // ---------- the lobby ----------
  // All of the lobby's drawing is here, so it can be replaced without touching the table.
  function drawLobby(stage, s) {
    stage.append(el('div', 'lobby-title', 'Card games'));
    const left = el('div', 'lobby-join');
    left.append(qr('qr qr-big'), el('div', 'join-say', 'Scan to join'), el('div', 'join-host', room.join ? joinHost(room.join) : ''), el('div', 'join-code', room.code || ''));
    const right = el('div', 'lobby-info');
    const names = el('div', 'lobby-players');
    if (s.players.length) for (const p of s.players) names.append(el('div', 'lobby-name' + (p.here ? '' : ' away'), p.name));
    else names.append(el('div', 'lobby-empty', 'Waiting for players'));
    const g = s.game, range = g.min === g.max ? g.min + ' players' : g.min + ' to ' + g.max + ' players';
    const pick = el('div', 'lobby-pick');
    pick.append(button('‹', () => pickBy(-1), 'arrow'), el('div', 'lobby-game', g.name), button('›', () => pickBy(1), 'arrow'));
    right.append(names, pick, el('div', 'lobby-range', range), button('Deal', deal, 'big-button'), el('div', 'lobby-note', note));
    stage.append(left, right);
  }

  // ---------- the table ----------
  function cardIn(cls, card) {
    const w = el('div', cls);
    w.append(card);
    return w;
  }
  const toward = (spot, k) => ({ x: 50 + (spot.x - 50) * k, y: 50 + (spot.y - 50) * k });
  function place(e, x, y) { e.style.left = x + '%'; e.style.top = y + '%'; return e; }

  function drawTable(stage, s) {
    const v = s.view, n = v.n, spots = seatSpots(n), zones = v.zones, F = root.VoidFace, C = root.VoidCards;
    stage.append(el('div', 'turnline', turnLine(v, s.players)), el('div', 'felt'));

    // The middle: the pack, the pile, and a suit that was called.
    const mid = el('div', 'centre');
    if (zones.draw && zones.draw.n > 0) {
      const pack = el('div', 'centre-item');
      pack.append(cardIn('cardbox big', F.back()), el('div', 'count', zones.draw.n + ' left'));
      mid.append(pack);
    }
    const top = zones.discard && zones.discard.top;
    if (top) {
      const pile = el('div', 'centre-item');
      pile.append(cardIn('cardbox big', F.card(top)));
      mid.append(pile);
    }
    const suit = v.pub && v.pub.suit;
    if (suit && top && C.suitOf(top) !== suit && F.GLYPH[suit]) {
      const mark = el('div', 'centre-item');
      mark.append(el('div', 'suitmark' + (suit === 'H' || suit === 'D' ? ' red' : ''), F.GLYPH[suit]), el('div', 'count', C.SUIT_NAMES[suit].charAt(0).toUpperCase() + C.SUIT_NAMES[suit].slice(1) + ' called'));
      mid.append(mark);
    }
    stage.append(mid);

    // The trick: each card in front of the seat that played it.
    const trick = zones.trick && zones.trick.cards;
    if (trick) {
      trick.forEach((id, i) => {
        const seat = trickSeat(v, i);
        if (seat === null || !spots[seat]) return;
        const at = toward(spots[seat], 0.7);
        stage.append(place(cardIn('cardbox trick', F.card(id)), at.x, at.y));
      });
    }

    // A plate, and any cards laid face up, for each player.
    spots.forEach((spot, i) => {
      const p = s.players[i], hand = zones['hand:' + i], won = zones['won:' + i], laid = zones['laid:' + i];
      const mine = v.turn.includes(i), plate = el('div', 'plate' + (mine ? ' turn' : '') + (p && !p.here ? ' away' : '') + (n > 8 ? ' tight' : ''));
      plate.dataset.seat = i;
      const meta = [];
      if (hand) meta.push(plural(hand.n, 'card', 'cards'));
      if (v.pub && Array.isArray(v.pub.scores) && v.pub.scores[i] !== undefined) meta.push('score ' + v.pub.scores[i]);
      const tags = [];
      if (won && won.n > 0) tags.push(won.n + ' taken');
      if (p && !p.here) tags.push('away');
      if (mine) tags.push('to play');
      plate.append(el('div', 'pname', nameAt(s.players, i)), el('div', 'pmeta', meta.join(', ')), el('div', 'ptags', tags.join(', ')));
      stage.append(place(plate, spot.x, spot.y));
      if (laid && laid.cards && laid.cards.length) {
        const row = el('div', 'laid');
        for (const id of laid.cards) row.append(cardIn('cardbox small', F.card(id)));
        stage.append(place(row, spot.x + (spot.x > 52 ? -10.5 : 10.5), spot.y));
      }
    });

    stage.append(el('div', 'status', s.status || ''));
  }

  // ---------- game over ----------
  function drawOver(stage, s) {
    const v = s.view, over = v.over || {}, panel = el('div', 'over');
    panel.append(el('div', 'over-win', winnerLine(v, s.players)));
    if (over.note) panel.append(el('div', 'over-note', over.note));
    const rows = el('div', 'over-rows');
    for (let i = 0; i < v.n; i++) {
      const bits = [];
      if (Array.isArray(over.left) && over.left[i] !== undefined) bits.push(plural(over.left[i], 'point left', 'points left'));
      if (Array.isArray(over.scores) && over.scores[i] !== undefined) bits.push('score ' + over.scores[i]);
      const row = el('div', 'over-row');
      row.append(el('span', 'over-name', nameAt(s.players, i)), el('span', 'over-what', bits.join(', ')));
      rows.append(row);
    }
    const buttons = el('div', 'over-buttons');
    buttons.append(button('Deal again', deal, 'big-button'), button('Change game', () => dealer.stop(), 'big-button quiet'));
    const donate = el('div', 'donate', DONATE_LINE + ' ');
    const link = el('a', '', 'Donate');
    link.href = DONATE_URL; link.target = '_blank'; link.rel = 'noopener';
    donate.append(link);
    panel.append(rows, buttons, el('div', 'lobby-note', note), donate);
    stage.append(panel);
  }

  // ---------- the whole page ----------
  function drawCorner(stage, s) {
    if (!room.join) return;
    const corner = el('div', 'corner');
    corner.append(qr('qr qr-small'), el('div', 'corner-code', 'Join: ' + (room.code || '')));
    if (s.waiting > 0) corner.append(el('div', 'corner-wait', s.waiting + ' waiting for the next game'));
    stage.append(corner);
  }

  function render() {
    const s = dealer.snapshot(), stage = el('div', 'stage');
    if (s.phase === 'lobby' || !s.view) drawLobby(stage, s);
    else {
      drawTable(stage, s);
      drawCorner(stage, s);
      if (s.phase === 'over') drawOver(stage, s);
    }
    if (problem) stage.append(el('div', 'problem', problem));
    app.textContent = '';
    app.append(stage);
  }

  // A card just laid face up grows in from its player's plate toward where it now lies.
  function grow(ev) {
    const seat = app.querySelector('.plate[data-seat="' + ev.by + '"]');
    let card = null;
    for (const c of app.querySelectorAll('[data-card]')) if (c.dataset.card === ev.cards[0]) card = c;
    if (!seat || !card) return;
    const a = seat.getBoundingClientRect(), b = card.getBoundingClientRect();
    card.style.transition = 'none';
    card.style.transform = 'translate(' + (a.left + a.width / 2 - b.left - b.width / 2) + 'px,' + (a.top + a.height / 2 - b.top - b.height / 2) + 'px) scale(.3)';
    card.getBoundingClientRect();
    card.style.transition = 'transform 300ms ease-out';
    card.style.transform = '';
  }
  function changed(events) {
    note = '';
    render();
    for (const ev of events || []) if (ev && ev.ev === 'move' && ev.cards && ev.cards.length && ev.by !== undefined) grow(ev);
  }

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const phase = dealer.snapshot().phase, onButton = !!(e.target && e.target.closest && e.target.closest('button'));
    if (e.key === 'ArrowLeft' && phase === 'lobby') { e.preventDefault(); pickBy(-1); }
    else if (e.key === 'ArrowRight' && phase === 'lobby') { e.preventDefault(); pickBy(1); }
    else if (e.key === 'Enter' && !onButton && phase !== 'play') { e.preventDefault(); deal(); }
    else if (e.key === 'Escape' && phase === 'over') { e.preventDefault(); dealer.stop(); }
  });

  function openRoom() {
    let ws;
    try { ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/room/open?kind=cards'); }
    catch (e) { problem = CLOSED; render(); return; }
    socket = ws;
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch (x) { return; }
      if (!m || typeof m !== 'object') return;
      if (m.type === 'room') { room.code = m.code; room.join = m.join; render(); return; }
      dealer.relay(m);
    };
    ws.onclose = () => { room.code = null; room.join = null; if (!problem) problem = CLOSED; render(); };
  }

  render();
  document.body.focus();
  // Is the room service on? Phones need it. A 503 means this site has not set it up.
  fetch('/api/room/2222', { cache: 'no-store' })
    .then((r) => { if (r.status === 503) { problem = NOT_SET_UP; render(); } else openRoom(); })
    .catch(() => openRoom());
})(typeof self !== 'undefined' ? self : this);
