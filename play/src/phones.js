// VoidTV PLAY: phones as gamepads, the big screen side. Licence: GPL-2.0-or-later (play/LICENSE).
// Bryan, 20 Nov 2026: "Yes, phone controllers". The screen opens a room (play/rooms/, the shared relay); each phone that joins
// becomes one more standard gamepad for the hub, so it takes a seat, keeps it, and drops the same way a real pad does.
(function (root) {
  'use strict';
  const NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Back', 'Start', 'L3', 'R3', 'Up', 'Down', 'Left', 'Right', 'Home'];
  const ON_PHONE = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'Back', 'Start'];
  const BASE = 100;   // phone n is gamepad index 100 + n, clear of the browser's own pads (0 to 3)

  // Pure (tested): a gamepad as the hub reads one, from the phone's held-button number.
  function padOf(seat, b) {
    return { index: BASE + seat, id: 'phone ' + seat, mapping: 'standard', connected: true,
      buttons: NAMES.map((_, i) => { const on = ((b >>> i) & 1) === 1; return { pressed: on, value: on ? 1 : 0 }; }), axes: [0, 0, 0, 0] };
  }
  // Pure (tested): what the phone draws for a card: each button the game uses and its word, and whether it has arrows.
  function cardFor(card, map, word) {
    const buttons = {};
    const full = Object.assign({ Start: '@menu' }, map || {});
    for (const n of ON_PHONE) {
      const code = full[n];
      if (!code) continue;
      if (code === '@menu') { buttons[n] = 'Menu'; continue; }
      if (code[0] === '@') continue;   // the on-screen keyboard and the mouse stay on the big screen's own controls
      buttons[n] = word(code) || '';
    }
    const dpad = ['Up', 'Down', 'Left', 'Right'].some((d) => full[d]);
    return { type: 'card', title: (card && card.title) || '', buttons, dpad };
  }

  function create(opts) {
    const on = opts || {};
    let ws = null, room = null, locked = false;
    const phones = new Map();   // room seat -> { b, delay, player }
    const changed = () => on.change && on.change(list());
    const send = (to, msg) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ to, msg })); };
    const list = () => [...phones].map(([seat, p]) => ({ seat, player: p.player, delay: p.delay })).sort((a, b) => a.seat - b.seat);

    function open() {
      if (ws) return Promise.resolve(room);
      return new Promise((ok, no) => {
        ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/room/open?kind=pad');
        ws.onmessage = (e) => {
          let m; try { m = JSON.parse(e.data); } catch (x) { return; }
          if (m.type === 'room') { room = { code: m.code, join: m.join }; ok(room); changed(); return; }
          if (m.type === 'join') { phones.set(m.from, { b: 0, delay: null, player: null }); if (on.card) send(m.from, on.card()); changed(); return; }
          if (m.type === 'leave') { phones.delete(m.from); changed(); return; }
          if (m.type === 'locked') { locked = !!m.on; changed(); return; }
          const p = phones.get(m.from), msg = m.msg || {};
          if (!p) return;
          if (msg.type === 'pad' && Number.isInteger(msg.b)) p.b = msg.b & 0x1ffff;
          else if (msg.type === 'ping') send(m.from, { type: 'pong', t: msg.t });
          else if (msg.type === 'delay' && Number.isFinite(msg.ms)) { p.delay = Math.max(0, Math.min(9999, Math.round(msg.ms))); changed(); }
        };
        ws.onclose = () => { const had = !!room; ws = null; room = null; locked = false; phones.clear(); changed(); if (!had) no(new Error('The phone room did not open. Check the connection and try again.')); };
      });
    }

    return {
      open, list,
      get room() { return room; },
      get locked() { return locked; },
      // The screen's say over its room (audit review): remove one phone, or lock the room to new phones.
      remove: (seat) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ relay: 'remove', seat })); },
      lock: (on) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ relay: 'lock', on: !!on })); },
      // The phones as gamepads, for the hub's poll each frame.
      pads: () => [...phones].map(([seat, p]) => padOf(seat, p.b)),
      // After the hub's poll: tell each phone which player it is when that changes.
      seats(seatOf) {
        for (const [seat, p] of phones) {
          const player = seatOf(BASE + seat) || null;
          if (player !== p.player) { p.player = player; if (player) send(seat, { type: 'seat', seat: player }); changed(); }
        }
      },
      // The game changed (or loaded): every phone redraws its buttons.
      card: (c) => send('all', c),
      close() { if (ws) ws.close(); },
    };
  }

  const api = { create, padOf, cardFor, BASE, ON_PHONE };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlayPhones = api;
})(typeof self !== 'undefined' ? self : this);
