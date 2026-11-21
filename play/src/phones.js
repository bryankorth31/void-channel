// VoidTV PLAY: phones as gamepads, the big screen side. Licence: GPL-2.0-or-later (play/LICENSE).
// Bryan, 20 Nov 2026: "Yes, phone controllers". The screen opens a room (play/rooms/, the shared relay); each phone that joins
// becomes one more standard gamepad for the hub, so it takes a seat, keeps it, and drops the same way a real pad does.
//
// Bryan, 20 Nov 2026, after playing on a phone: "at first it seems like the lag is too much but after further it seems to
// just be playing on its own". Measured causes and what answers each here (the phone's half is src/phonepad.js):
// - A phone that stopped talking with a button held (its page frozen, its Wi-Fi gone: no close ever reaches the relay)
//   kept that button held on the screen for good. A phone now says its whole state on a beat, and one not heard for
//   QUIET_MS has let go of everything; after GONE_MS it is treated as a pad that dropped (its seat held for it).
// - A press and its release that arrive together (a home network often delivers two messages at once) fell between two
//   frames and the game never saw the press. Each change now stays HOLD_MS, so every tap reaches the game, in order.
// - Lag (Bryan, 21 Nov 2026: "Yes, start" on a direct link). Through the relay a press takes about 65 ms one way on
//   voidtv.net, at times 160: phone, Cloudflare, screen. Now the phone also opens a link straight to this page over the
//   same Wi-Fi (a WebRTC data channel; no outside server is asked, so it connects only where the two can reach each
//   other) and says every state on both. The screen takes whichever copy comes first: each state carries the phone's
//   count, so the later copy is dropped. Where the link cannot connect, everything is as before.
(function (root) {
  'use strict';
  const NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Back', 'Start', 'L3', 'R3', 'Up', 'Down', 'Left', 'Right', 'Home'];
  const ON_PHONE = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'Back', 'Start'];
  const BASE = 100;   // phone n is gamepad index 100 + n, clear of the browser's own pads (0 to 3)
  const HOLD_MS = 34;      // a button stays as it is for two frames before it may change again
  const QUIET_MS = 800;    // a phone on the beat (one message every 200 ms while it holds anything) not heard this long
  const GONE_MS = 5000;    // not heard this long: gone, like a pad whose battery died
  const QUEUE = 24;        // states waiting their turn; past this the newest wins, so the screen never runs behind
  const STALL_MS = 250;    // the screen's own page did not run for this long: its silence, not the phones'
  const PART = 600;        // a link's description goes through the room in pieces this long (the relay takes 1 KB)
  const GATHER_MS = 1500;  // how long this page looks for its own addresses before it answers
  const RECLAIM_MS = 400, RECLAIM_TRIES = 8;   // asking for a kept room again while it still stands (see open())

  // Pure (tested): a gamepad as the hub reads one, from the phone's held-button number.
  function padOf(seat, b) {
    return { index: BASE + seat, id: 'phone ' + seat, mapping: 'standard', connected: true,
      buttons: NAMES.map((_, i) => { const on = ((b >>> i) & 1) === 1; return { pressed: on, value: on ? 1 : 0 }; }), axes: [0, 0, 0, 0] };
  }

  // One phone as the screen keeps it. shown is what the game sees; queue holds the states that came in and wait.
  const fresh = (now) => ({ shown: 0, queue: [], flip: [], heard: now, beat: false, n: -1, delay: null, player: null, quiet: false,
    direct: false, got: 0, gotDirect: 0, pc: null, ch: null, parts: null, silent: false });
  // Pure (tested): a text in pieces, and the pieces back into the text. store keeps one text at a time (id names it: a
  // new id starts over); answers the whole text when its last piece has come, else null.
  const pieces = (text, size) => { const out = []; for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size)); return out.length ? out : ['']; };
  function gather(store, m) {
    if (!m || !Number.isInteger(m.i) || !Number.isInteger(m.of) || m.of < 1 || m.of > 40 || m.i < 0 || m.i >= m.of || typeof m.d !== 'string' || m.d.length > 900) return null;
    if (store.id !== m.id || store.of !== m.of) { store.id = m.id; store.of = m.of; store.d = []; store.n = 0; }
    if (store.d[m.i] === undefined) { store.d[m.i] = m.d; store.n++; }
    if (store.n < store.of) return null;
    const text = store.d.join(''); store.id = undefined; store.d = []; store.n = 0;
    return text;
  }
  // Pure (tested): a state arrived from the phone. n is the phone's own count: an older one that arrives late is ignored.
  function take(p, b, n, now) {
    p.heard = now;
    if (Number.isInteger(n)) { if (n <= p.n) return; p.n = n; }
    const last = p.queue.length ? p.queue[p.queue.length - 1] : p.shown;
    if (b === last) return;
    p.queue.push(b);
    if (p.queue.length > QUEUE) p.queue.splice(0, p.queue.length - 1);
  }
  // Pure (tested): what the game sees this frame. Waiting states are let through in order; a button that changed less
  // than HOLD_MS ago waits (the others go through at once), so a tap shorter than a frame is still a press and a release.
  function settle(p, now) {
    if (p.beat && now - p.heard > QUIET_MS) {
      // What the screen had is forgotten, so the phone's next word must count though it carries the count already seen:
      // a phone back from a silence with the thumb still down says the same state again, and the hold must come back
      // (the auditor, 21 Nov 2026: it did not, since the count stopped going up with every beat). Once a silence.
      if (!p.silent) { p.silent = true; p.n -= 1; }
      p.queue.length = 0; p.shown = 0; return 0;
    }
    p.silent = false;
    while (p.queue.length) {
      const next = p.queue[0];
      let ok = 0, wait = 0;
      for (let i = 0; i < NAMES.length; i++) {
        const bit = 1 << i;
        if (!((next ^ p.shown) & bit)) continue;
        if (now - (p.flip[i] === undefined ? -1e9 : p.flip[i]) < HOLD_MS) wait |= bit; else { ok |= bit; p.flip[i] = now; }
      }
      p.shown = (p.shown & ~ok) | (next & ok);
      if (wait) break;
      p.queue.shift();
    }
    return p.shown;
  }

  // What the phone draws, from the card (tested). A phone shows the game's own buttons, as the screen's touch pad does:
  // a console game its machine's buttons and no others (a Nintendo game has A and B, not six), each with the machine's
  // letter and what it does, in the machine's own shape; a PC or arcade game its key names. keys is for the pad page
  // of today; buttons is the earlier form, kept so a pad page a phone still has open keeps working.
  const KEY_WORDS = { Escape: 'Esc', ControlLeft: 'Ctrl', AltLeft: 'Alt', ShiftLeft: 'Shift', ShiftRight: 'Shift', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right' };
  const DIAMOND = { Y: [1, 2], X: [2, 1], B: [2, 3], A: [3, 2] };
  // The painted buttons of the handheld (play.css): B red and A yellow, X cyan and Y pink; Genesis A red, B yellow, C pink.
  const PAINT = { 'P1:B': 'red', 'P1:A': 'yellow', 'P1:X': 'cyan', 'P1:Y': 'pink' }, PAINT_ABC = { 'P1:Y': 'red', 'P1:B': 'yellow', 'P1:A': 'pink' };
  const PAINT_PAD = { A: 'red', B: 'yellow', X: 'pink', Y: 'cyan' };
  function cardFor(card, map, word) {
    const full = Object.assign({ Start: '@menu' }, map || {});
    const c = (card && card.controls) || {}, pad = c.kind === 'pad', names = c.labels || {};
    const say = word || (() => '');
    const has = (code) => !pad || (c.keys || []).includes(code);   // a console card lists the buttons its machine has
    const letter = (code) => names[code] || KEY_WORDS[code] || code.replace(/^P[1-4]:/, '').replace(/^Key|^Digit/, '');
    const key = (n, code, more) => {
      // No word when it only repeats the letter ("A button" on A, "Button 1" on Button 1).
      const t = letter(code), w = say(code) || '', a = w.toLowerCase(), b = t.toLowerCase();
      return Object.assign({ n, t, w: a === b || a === b + ' button' || a === 'button ' + b ? '' : w }, more);
    };
    const usable = (n) => full[n] && full[n][0] !== '@' && has(full[n]);
    const keys = [], buttons = {};
    // The face buttons, in the machine's shape.
    const Touch = root.PlayTouch || (typeof module === 'object' && module.exports ? require('./touchpad.js') : null);
    const shape = pad && Touch ? Touch.shapeOf(card) : null;
    const kind = pad && Touch ? (Touch.SYSTEM_SHAPE[card.system] || 'pair') : '';
    let cols = 3, rows = 3;
    if (shape) {
      cols = shape.cols; rows = shape.rows;
      for (const [code, r, col] of shape.face) {
        const n = ['A', 'B', 'X', 'Y'].find((x) => full[x] === code);
        if (n && has(code)) keys.push(key(n, code, { at: 'face', r, c: col, k: (kind === 'abc' ? PAINT_ABC : PAINT)[code] || 'red' }));
      }
    } else {
      const face = ['A', 'B', 'X', 'Y'].filter(usable);
      if (face.length === 1) { cols = rows = 1; keys.push(key(face[0], full[face[0]], { at: 'face', r: 1, c: 1, k: PAINT_PAD[face[0]] })); }
      else if (face.length === 2) { cols = rows = 2; face.forEach((n, i) => keys.push(key(n, full[n], { at: 'face', r: 2 - i, c: 1 + i, k: PAINT_PAD[n] }))); }
      else for (const n of face) keys.push(key(n, full[n], { at: 'face', r: DIAMOND[n][0], c: DIAMOND[n][1], k: PAINT_PAD[n] }));
    }
    for (const n of ['LB', 'RB']) if (usable(n)) keys.push(key(n, full[n], { at: n === 'LB' ? 'left' : 'right' }));
    // Select and Start; and Menu, which every pad opens with Back and Start held together (hub.js).
    let menu = false;
    for (const n of ['Back', 'Start']) {
      if (full[n] === '@menu') { keys.push({ n, t: 'Menu', w: '', at: 'pill' }); menu = true; }
      else if (usable(n)) keys.push(key(n, full[n], { at: 'pill' }));
    }
    if (!menu) keys.push({ n: 'Back+Start', t: 'Menu', w: '', at: 'pill' });
    for (const n of ON_PHONE) {
      const code = full[n];
      if (!code || (code[0] === '@' && code !== '@menu') || (code !== '@menu' && !has(code))) continue;
      buttons[n] = code === '@menu' ? 'Menu' : say(code) || '';
    }
    const dpad = c.dpad !== false && ['Up', 'Down', 'Left', 'Right'].some((d) => full[d]);
    return { type: 'card', title: (card && card.title) || '', buttons, dpad, keys, cols, rows, shape: kind };
  }

  // The room this tab holds, kept for the tab only (Bryan, 20 Nov 2026: "i want to able to connect the phone as the
  // controller prior to being in a game"): the shelf opens it, the game page takes it back, the phones stay in their seats.
  const KEEP = 'voidtv-play-room';
  const kept = () => { try { const k = JSON.parse(sessionStorage.getItem(KEEP) || 'null'); return k && /^[2-9A-Z]{4}$/.test(k.code) && k.key ? k : null; } catch (e) { return null; } };
  const keep = (k) => { try { if (k) sessionStorage.setItem(KEEP, JSON.stringify(k)); else sessionStorage.removeItem(KEEP); } catch (e) { /* this page only */ } };

  function create(opts) {
    const on = opts || {};
    const clock = on.now || (() => performance.now());
    let ws = null, room = null, locked = false, polled = null;
    const phones = new Map();   // room seat -> the phone (fresh())
    const changed = () => on.change && on.change(list());
    const send = (to, msg) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ to, msg })); };
    const list = () => [...phones].map(([seat, p]) => ({ seat, player: p.player, delay: p.delay, quiet: p.quiet, direct: p.direct })).sort((a, b) => a.seat - b.seat);

    // ---- The direct link, this page's end: the phone offers, this page answers ----
    const RTC = on.rtc !== undefined ? on.rtc : (typeof RTCPeerConnection !== 'undefined' ? RTCPeerConnection : null);
    function unlink(p) {
      const pc = p.pc, ch = p.ch; p.pc = p.ch = null; p.parts = null;
      if (p.direct) { p.direct = false; }
      try { if (ch) ch.close(); } catch (e) { /* gone */ }
      try { if (pc) pc.close(); } catch (e) { /* gone */ }
    }
    const found = (pc) => new Promise((done) => {
      if (pc.iceGatheringState === 'complete') return done();
      const t = setTimeout(done, GATHER_MS);
      pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); done(); } });
    });
    async function link(seat, p, sdp, id) {
      unlink(p);
      if (!RTC) return;
      const pc = p.pc = new RTC({ iceServers: [] });   // no outside server: this network's own addresses only
      const mine = () => p.pc === pc && phones.get(seat) === p;
      pc.ondatachannel = (e) => {
        const ch = e.channel;
        if (!mine()) return;
        p.ch = ch;
        ch.onmessage = (ev) => { if (p.ch !== ch || !mine()) return; let m; try { m = JSON.parse(ev.data); } catch (x) { return; } hear(seat, p, m, ch); };
        ch.onclose = () => { if (p.ch === ch) { p.ch = null; if (p.direct) { p.direct = false; changed(); } } };
      };
      try {
        await pc.setRemoteDescription({ type: 'offer', sdp });
        await pc.setLocalDescription(await pc.createAnswer());
        await found(pc);
        if (!mine()) return;
        const parts = pieces(pc.localDescription.sdp, PART);
        parts.forEach((d, i) => send(seat, { type: 'rtc', k: 'answer', id, i, of: parts.length, d }));
      } catch (e) { if (mine()) unlink(p); }
    }
    // One message from a phone, by the relay (ch null) or by its direct link (ch). The same rules for both.
    function hear(seat, p, msg, ch) {
      p.heard = clock();
      if (msg.type === 'pad' && Number.isInteger(msg.b)) { if (msg.v >= 2) p.beat = true; if (ch) p.gotDirect++; else p.got++; take(p, msg.b & 0x1ffff, msg.n, p.heard); }
      // The answer goes back the way the question came, with how many states this page has had that way (the phone
      // shows any the relay dropped).
      else if (msg.type === 'ping') { const pong = { type: 'pong', t: msg.t, g: ch ? p.gotDirect : p.got }; if (ch) { try { ch.send(JSON.stringify(pong)); } catch (e) { /* closing */ } } else send(seat, pong); }
      else if (msg.type === 'delay' && Number.isFinite(msg.ms)) { p.delay = Math.max(0, Math.min(9999, Math.round(msg.ms))); p.direct = !!msg.direct; changed(); }
      else if (msg.type === 'rtc' && !ch && msg.k === 'offer') { p.parts = p.parts || {}; const sdp = gather(p.parts, msg); if (sdp) link(seat, p, sdp, msg.id); }
    }

    // open(): the room this tab already holds if it is still waiting, else a new one. resumeOnly: only take a held room
    // back (a page opening with a phone already connected), never open a new one.
    let opening = null;
    function open(resumeOnly) {
      if (ws && room) return Promise.resolve(room);
      if (opening) return opening;
      const k = kept();
      if (resumeOnly && !k) return Promise.resolve(null);
      // The page before this one (the shelf opening a game) closes its socket as it goes, but the relay may hear of that
      // a moment after this page asks for the room, and says no while the old socket still looks open. Found 21 Nov 2026:
      // the phone was then lost, every few tries. So while the room still stands (the relay's own lookup says so), ask
      // again for a few seconds; only a room that is gone is forgotten.
      const stands = (code) => (on.lookup ? on.lookup(code) : fetch('/api/room/' + code, { cache: 'no-store' }).then((r) => r.ok)).catch(() => false);
      const takeBack = (left) => connect(k).catch((e) => (left <= 0 ? Promise.reject(e)
        : stands(k.code).then((yes) => (yes ? new Promise((r) => setTimeout(r, on.reclaimMs === undefined ? RECLAIM_MS : on.reclaimMs)).then(() => takeBack(left - 1)) : Promise.reject(e)))));
      opening = (k ? takeBack(RECLAIM_TRIES) : connect(null)).catch((e) => {
        if (k) { keep(null); return resumeOnly ? null : connect(null); }   // the room did not wait: a new one
        throw e;
      }).finally(() => { opening = null; });
      return opening;
    }
    function connect(k) {
      return new Promise((ok, no) => {
        const q = k ? '&code=' + k.code + '&key=' + encodeURIComponent(k.key) : '';
        ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/room/open?kind=pad' + q);
        ws.onmessage = (e) => {
          let m; try { m = JSON.parse(e.data); } catch (x) { return; }
          if (m.type === 'room') { room = { code: m.code, join: m.join, back: !!m.back }; if (m.key) keep({ code: m.code, key: m.key }); ok(room); changed(); return; }
          // A join (also a phone back on a new socket, or this page taking the room back) starts clean: nothing it held
          // before is held now, and it counts as heard from this moment.
          if (m.type === 'join') { if (phones.has(m.from)) unlink(phones.get(m.from)); phones.set(m.from, fresh(clock())); if (on.card) send(m.from, on.card()); changed(); return; }
          if (m.type === 'leave') { if (phones.has(m.from)) unlink(phones.get(m.from)); phones.delete(m.from); changed(); return; }
          if (m.type === 'locked') { locked = !!m.on; changed(); return; }
          const p = phones.get(m.from), msg = m.msg || {};
          if (!p || typeof msg !== 'object') return;
          hear(m.from, p, msg, null);
        };
        ws.onclose = () => { const had = !!room; ws = null; room = null; locked = false; for (const p of phones.values()) unlink(p); phones.clear(); changed(); if (!had) no(new Error('The phone room did not open. Check the connection and try again.')); };
      });
    }

    return {
      open, list,
      get room() { return room; },
      get locked() { return locked; },
      // The screen's say over its room (audit review): remove one phone, or lock the room to new phones.
      remove: (seat) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ relay: 'remove', seat })); },
      lock: (on) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ relay: 'lock', on: !!on })); },
      // The phones as gamepads, for the hub's poll each frame. A phone on the beat that has gone silent is left out, so
      // the hub lets go of its keys and holds its seat, as for a real pad that dropped.
      pads() {
        const now = clock(), out = [];
        let turned = false;
        // The screen's own page stalled (a save loading, the tab coming back to the front): the phones' messages wait
        // unread behind this very call, so a phone still with us is not called silent for it (the auditor's review).
        if (polled !== null && now - polled > STALL_MS) for (const p of phones.values()) if (!p.quiet) p.heard = now;
        polled = now;
        for (const [seat, p] of phones) {
          const quiet = p.beat && now - p.heard > GONE_MS;
          if (quiet !== p.quiet) { p.quiet = quiet; turned = true; }
          const b = settle(p, now);
          if (!quiet) out.push(padOf(seat, b));
        }
        if (turned) changed();
        return out;
      },
      // After the hub's poll: tell each phone which player it is when that changes.
      seats(seatOf) {
        for (const [seat, p] of phones) {
          const player = seatOf(BASE + seat) || null;
          if (player !== p.player) { p.player = player; if (player) send(seat, { type: 'seat', seat: player }); changed(); }
        }
      },
      // The game changed (or loaded): every phone redraws its buttons.
      card: (c) => send('all', c),
      // The page is going (another page of PLAY may take the room back): the socket closes, the room waits.
      close() { if (ws) ws.close(); },
      // The player is done with phones here: the room ends now, nothing is kept.
      end() { keep(null); if (ws) ws.close(); },
      get held() { return !!kept(); },
    };
  }

  const api = { create, padOf, cardFor, take, settle, fresh, pieces, gather, PART, BASE, ON_PHONE, HOLD_MS, QUIET_MS, GONE_MS, STALL_MS, kept };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlayPhones = api;
})(typeof self !== 'undefined' ? self : this);
