// VoidTV PLAY: the phone's side of a phone gamepad (play/pad.html). Licence: GPL-2.0-or-later (play/LICENSE).
// Bryan, 20 Nov 2026: "Yes, phone controllers". The phone joins the room the big screen opened and sends which buttons are
// held, as a standard gamepad would report them; the big screen feeds that to the hub as one more gamepad, so the seat
// rules, the card's button words and Back + Start for the menu all work as with a real controller.
//
// Bryan, 20 Nov 2026, after playing on it: "at first it seems like the lag is too much but after further it seems to just
// be playing on its own ... the design is off". What was measured, and what answers it here (the screen's half is
// src/phones.js, the relay's is play/rooms/room.js):
// - The phone spoke only when a button changed, once. The relay drops a message past its limit in silence (on voidtv.net,
//   13 of 100 sent at 50 a second never arrived), so a release that was dropped left the key held until the next touch.
//   Now the whole state goes out again on a beat (BEAT_MS while anything is held or just changed), so a lost message
//   heals in a fifth of a second, and the phone never sends faster than one message in GAP_MS.
// - The round pad had no steadiness: a thumb resting on the line between two directions flickered between them at every
//   touch report (a message each, 60 to 120 a second), which is what passed the limit. It now uses the hub's own rule
//   (steadyDir: a held direction stays until the thumb is clearly past its border), as the screen's touch pad does.
// - A finger whose lift the browser never reported stayed down for good. Now every finger gone means everything let go,
//   whatever the browser reported, and so does the page hiding, losing focus, or the connection dropping.
// - A dead connection was noticed only when the browser gave up on it. Now a phone that hears nothing from the screen
//   for QUIET_MS opens a new one, and takes its own seat back.
(function (root) {
  'use strict';
  const Hub = root.PlayHub || (typeof module === 'object' && module.exports ? require('./hub.js') : null);
  // The standard gamepad's button numbers (the same as PlayHub.BUTTONS).
  const BUTTONS = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, Back: 8, Start: 9, L3: 10, R3: 11, Up: 12, Down: 13, Left: 14, Right: 15, Home: 16 };
  const SLOW_MS = 120;    // past this a press feels late; the phone says so
  const GAP_MS = 20;      // at most one message in this long (50 a second; the relay allows a pad 60)
  const BEAT_MS = 200;    // the whole state again this often while anything is held, and for a second after a change
  const REST_MS = 1000;   // and this often with nothing held
  const QUIET_MS = 6000;  // nothing heard from the screen this long (it answers a ping every 2 s): the connection is dead
  const AWAY_MS = 50000;  // while the screen changes pages (the relay waits 45 s for it) nothing answers: wait that long
  const REACH = 30;       // a touch this near a button (px) presses it: a thumb need not be exact

  // Pure (tested): the held buttons as one number, bit n for button n. A name may hold two ("Back+Start", the menu).
  const bits = (held) => [...held].reduce((b, name) => name.split('+').reduce((x, n) => (n in BUTTONS ? x | (1 << BUTTONS[n]) : x), b), 0);
  // Pure (tested): where a finger at (x, y) on the round pad of that size points, by the hub's steady rule. prev is the
  // sector this finger held before (or null). Answers { sector, dirs }: a small middle does nothing, a finger between
  // two directions holds both, and a direction held stays until the finger is clearly past its border.
  function aim(x, y, size, prev) {
    const s = Hub.steadyDir((x / size - 0.5) * 2, (y / size - 0.5) * 2, prev == null ? null : prev, 0.16, 0.1, 22);
    const d = s == null ? '' : Hub.SECTORS[s], dirs = [];
    if (d.includes('R')) dirs.push('Right');
    if (d.includes('D')) dirs.push('Down');
    if (d.includes('L')) dirs.push('Left');
    if (d.includes('U')) dirs.push('Up');
    return { sector: s, dirs };
  }
  const dirs = (x, y, size, prev) => aim(x, y, size, prev).dirs;
  // Pure (tested): what the phone says about the delay, from a round trip in ms.
  const delayText = (rtt) => { const ms = Math.round(rtt / 2); return { text: 'Delay ' + ms + ' ms', slow: ms > SLOW_MS }; };
  // Pure (tested): how long to wait before the next message may go, and how long until the beat is due.
  const waitFor = (now, lastAt) => Math.max(0, GAP_MS - (now - lastAt));
  const beatDue = (now, lastAt, changedAt, b) => now - lastAt >= (b || now - changedAt < 1000 ? BEAT_MS : REST_MS);
  // Pure (tested): which button a touch at (x, y) presses, from each button's box { n, x, y, w, h, round }: the one it
  // is on, or the nearest within REACH. only narrows it (a thumb sliding across the face buttons stays on face buttons).
  function keyAt(boxes, x, y, only) {
    let best = null, near = REACH;
    for (const k of boxes) {
      if (only && !only(k)) continue;
      const cx = k.x + k.w / 2, cy = k.y + k.h / 2;
      const d = k.round ? Math.hypot(x - cx, y - cy) - k.w / 2 : Math.hypot(Math.max(k.x - x, 0, x - (k.x + k.w)), Math.max(k.y - y, 0, y - (k.y + k.h)));
      if (d < near) { near = d; best = k; }
    }
    return best;
  }

  const api = { BUTTONS, SLOW_MS, GAP_MS, BEAT_MS, REST_MS, QUIET_MS, AWAY_MS, REACH, bits, aim, dirs, delayText, waitFor, beatDue, keyAt };
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }
  root.PlayPhonePad = api;

  // ---- The page ----
  const $ = (id) => document.getElementById(id);
  const now = () => performance.now();
  const code = (new URLSearchParams(location.search).get('r') || '').toUpperCase();
  // A random seat token for this tab only (sent only to its room, gone when the tab closes): a phone that drops and
  // comes back within a minute keeps its seat.
  let seatToken = null;
  function token() {
    if (seatToken) return seatToken;
    try { seatToken = sessionStorage.getItem('voidtv-seat'); } catch (e) { /* private mode: kept in memory only */ }
    if (!seatToken || !/^[A-Za-z0-9_-]{16,64}$/.test(seatToken)) {
      seatToken = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
      try { sessionStorage.setItem('voidtv-seat', seatToken); } catch (e) { /* fine */ }
    }
    return seatToken;
  }
  let ws = null, ended = false, tries = 0, heardAt = 0, again = null, away = false;
  function note(h, p, link) { $('note-h').textContent = h; $('note-p').textContent = p; $('note-a').hidden = !link; $('note').hidden = false; $('pad').hidden = true; }
  const send = (m) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };
  const buzz = () => { try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) { /* not on this phone */ } };

  // What is held, and saying so: at once when it changes (never faster than one message in GAP_MS; the newest state is
  // what goes), and again on the beat. Each message is the whole state with a count, so the screen can drop a late one.
  let held = new Set(), lastB = -1, lastAt = -1e9, changedAt = -1e9, count = 0, timer = null;
  function say() { timer = null; lastB = bits(held); lastAt = now(); send({ type: 'pad', b: lastB, n: ++count, v: 2 }); }
  function sendPad() {
    if (bits(held) === lastB) return;
    changedAt = now();
    const wait = waitFor(changedAt, lastAt);
    if (!wait) say(); else if (!timer) timer = setTimeout(say, wait);
  }
  setInterval(() => { if (!timer && beatDue(now(), lastAt, changedAt, lastB > 0 ? lastB : 0)) say(); }, 50);

  // ---- The buttons, drawn from the card the big screen sent ----
  let boxes = [], dpadBox = null, card = null;
  const fits = (t) => (t.length <= 2 ? 's1' : t.length <= 6 ? 's2' : 's3');
  function button(k, into) {
    const b = document.createElement('div');
    b.className = 'b ' + (k.at === 'face' ? 'f ' : k.at === 'pill' ? 'p ' : 'sh ') + fits(k.t); b.dataset.n = k.n; if (k.k) b.dataset.k = k.k;
    b.setAttribute('role', 'button'); b.setAttribute('aria-label', k.t + (k.w ? ', ' + k.w : ''));
    const big = document.createElement('span'); big.textContent = k.t; b.appendChild(big);
    if (k.w) { const small = document.createElement('small'); small.textContent = k.w; b.appendChild(small); }
    if (k.at === 'face') { b.style.setProperty('--r', k.r); b.style.setProperty('--c', k.c); }
    into.appendChild(b);
  }
  // A pad page still open from before the card carried keys: the earlier form, a word for each standard button.
  function keysOf(c) {
    if (Array.isArray(c.keys)) return c.keys;
    const w = c.buttons || {}, at = { Y: [1, 2], X: [2, 1], B: [2, 3], A: [3, 2] }, out = [];
    for (const n of ['Y', 'X', 'B', 'A']) if (n in w) out.push({ n, t: n, w: w[n], at: 'face', r: at[n][0], c: at[n][1], k: 'red' });
    for (const n of ['LB', 'RB']) if (n in w) out.push({ n, t: n === 'LB' ? 'L' : 'R', w: w[n], at: n === 'LB' ? 'left' : 'right' });
    for (const n of ['Back', 'Start']) if (n in w) out.push({ n, t: w[n] === 'Menu' ? 'Menu' : n === 'Back' ? 'Select' : 'Start', w: '', at: 'pill' });
    return out;
  }
  function draw(c) {
    card = c;
    $('game').textContent = c.title || '';
    for (const id of ['face', 'mid', 'left', 'right']) $(id).textContent = '';
    const face = $('face');
    face.className = 'face' + (c.shape ? ' s-' + c.shape : '') + ' g' + (c.cols || 3);
    face.style.setProperty('--cols', c.cols || 3); face.style.setProperty('--rows', c.rows || 3);
    for (const k of keysOf(c)) button(k, $(k.at === 'face' ? 'face' : k.at === 'pill' ? 'mid' : k.at));
    $('dpad').style.visibility = c.dpad === false ? 'hidden' : '';
    $('note').hidden = true; $('pad').hidden = false;
    measure(); letGo();
  }
  // Where every button is now (after drawing, and when the phone turns).
  function measure() {
    boxes = [...document.querySelectorAll('#pad .b')].map((el) => { const r = el.getBoundingClientRect(); return { el, n: el.dataset.n, face: el.classList.contains('f'), round: el.classList.contains('f'), x: r.left, y: r.top, w: r.width, h: r.height }; });
    const d = $('dpad').getBoundingClientRect();
    dpadBox = $('dpad').style.visibility === 'hidden' || !d.width ? null : { x: d.left, y: d.top, size: d.width };
  }
  addEventListener('resize', measure);
  addEventListener('orientationchange', () => setTimeout(() => { measure(); letGo(); }, 300));

  // ---- Touch: one rule for the whole screen ----
  // Each finger is on the round pad (it may slide between directions) or on a button (on the face buttons it may slide
  // from one to the next, as a thumb rolls on a real pad). What is held is whatever the fingers now down are on.
  const fingers = new Map();   // pointer id -> { pad: true, sector, dirs } or { key }
  function place(e, f) {
    if (f.pad) { if (!dpadBox) return; const a = aim(e.clientX - dpadBox.x, e.clientY - dpadBox.y, dpadBox.size, f.sector); f.sector = a.sector; f.dirs = a.dirs; return; }
    if (f.key && !f.key.face) return;   // Select, Start, L and R do not slide
    const k = keyAt(boxes, e.clientX, e.clientY, f.key ? (x) => x.face : null);
    if (k) f.key = k; else if (!f.key) f.none = true;
  }
  function refresh() {
    const next = new Set();
    for (const f of fingers.values()) { if (f.pad) for (const d of f.dirs) next.add(d); else if (f.key) next.add(f.key.n); }
    let pressed = false;
    for (const n of next) if (!held.has(n)) pressed = true;
    held = next;
    for (const k of boxes) k.el.classList.toggle('on', held.has(k.n));
    const pad = $('dpad');
    for (const d of ['Up', 'Down', 'Left', 'Right']) pad.classList.toggle(d, held.has(d));
    if (pressed) buzz();
    sendPad();
  }
  function down(e) {
    if (!card || $('pad').hidden) return;
    const f = {};
    if (dpadBox) { const c = dpadBox.size / 2; if (Math.hypot(e.clientX - dpadBox.x - c, e.clientY - dpadBox.y - c) < c * 1.14) { f.pad = true; f.sector = null; f.dirs = []; } }
    place(e, f);
    if (f.none) return;
    fingers.set(e.pointerId, f); refresh();
  }
  const move = (e) => { const f = fingers.get(e.pointerId); if (f) { place(e, f); refresh(); } };
  const up = (e) => { if (fingers.delete(e.pointerId)) refresh(); };
  // Everything is let go at once: the page hides or loses focus, the phone turns, the connection drops, or the browser
  // says no finger is down. No button is left held on the big screen.
  function letGo() { if (!fingers.size && !held.size) return; fingers.clear(); refresh(); }
  document.addEventListener('pointerdown', down);
  document.addEventListener('pointermove', move);
  for (const ev of ['pointerup', 'pointercancel']) document.addEventListener(ev, up);
  for (const ev of ['touchend', 'touchcancel']) document.addEventListener(ev, (e) => { if (!e.touches.length) letGo(); }, true);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { letGo(); if (timer) { clearTimeout(timer); timer = null; } if (bits(held) !== lastB) say(); } });   // said now: a hidden page's timers may not run
  for (const ev of ['blur', 'pagehide']) addEventListener(ev, letGo);
  // iPhone Safari zooms on fast taps and scrolls or selects on a long press whatever touch-action says; the pad runs on
  // pointer events, so the touches themselves go (the notes' link and the header stay ordinary).
  for (const ev of ['touchstart', 'touchmove', 'touchend']) document.addEventListener(ev, (e) => { if (!e.target.closest('a')) e.preventDefault(); }, { passive: false });
  for (const ev of ['gesturestart', 'contextmenu', 'dblclick', 'selectstart']) document.addEventListener(ev, (e) => e.preventDefault());

  let lock = null;
  async function stayAwake() { try { if (navigator.wakeLock && !lock) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); } } catch (e) { /* not allowed */ } }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) stayAwake(); });

  function connect() {
    again = null;
    if (!/^[2-9A-Z]{4}$/.test(code)) { note('No room code', 'Scan the code on the big screen, or type it.', true); return; }
    const sock = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/room/' + code + '/join?t=' + token());
    ws = sock; heardAt = now(); away = false;
    sock.onmessage = (e) => {
      if (sock !== ws) return;
      heardAt = now();
      let m; try { m = JSON.parse(e.data); } catch (x) { return; }
      if (m.type !== 'host-away') away = false;
      if (m.type === 'hello') { tries = 0; lastB = -1; if (card) { $('note').hidden = true; $('pad').hidden = false; say(); } else note('Joined', 'Waiting for the big screen.', false); }
      else if (m.type === 'card') { draw(m); say(); }
      else if (m.type === 'seat') $('who').textContent = 'Player ' + m.seat;
      else if (m.type === 'pong') { const d = delayText(now() - m.t); $('delay').textContent = d.text + (d.slow ? ': presses will feel late' : ''); $('delay').classList.toggle('slow', d.slow); send({ type: 'delay', ms: Math.round((now() - m.t) / 2) }); }
      else if (m.type === 'host-gone') { ended = true; note('The game screen closed', 'Scan the new code on the big screen to join again.', true); }
      // The big screen is changing pages (the shelf opening a game): the phone stays connected and waits a moment.
      // While it is away nothing answers this phone's pings: that silence is the screen's, not a dead connection.
      else if (m.type === 'host-away') { away = true; $('game').textContent = 'The screen is opening the game...'; }
      else if (m.type === 'host-back') say();   // the new page sends its own buttons; it hears what is held now
    };
    sock.onclose = (e) => {
      if (sock !== ws) return;   // an old connection this page already replaced
      ws = null; letGo();
      if (ended) return;
      if (e.code === 4404) { note('No room with that code', 'The code changes each time. Check the big screen.', true); return; }
      if (e.code === 4409) { note('This game is full', 'Up to 16 phones can join one screen.', false); return; }
      if (e.code === 4423) { note('This room is locked', 'The screen is not letting new phones in right now.', false); return; }
      if (e.code === 4403) { ended = true; note('The screen removed this phone', 'Ask whoever runs the screen if that was a mistake.', false); return; }
      if (e.code === 4411) { ended = true; note('This phone joined again', 'The pad is open in another tab on this phone. Close this one.', false); return; }
      if (e.code === 4410 || e.code === 4408) { note('The game screen closed', 'Scan the new code on the big screen to join again.', true); return; }
      // A dropped connection (a phone walking out of Wi-Fi): try again, a little slower each time.
      note('Reconnecting', 'The connection dropped. Trying again.', false);
      if (!again) again = setTimeout(connect, Math.min(8000, 500 * 2 ** tries++));
    };
  }
  setInterval(() => {
    send({ type: 'ping', t: now() });
    // The screen answers every ping. Silence this long means the connection is dead though the browser has not said so:
    // let go, drop it and open a new one (the relay gives this phone its own seat back).
    if (ws && !ended && now() - heardAt > (away ? AWAY_MS : QUIET_MS)) {
      const dead = ws; ws = null; letGo();
      try { dead.close(); } catch (e) { /* already gone */ }
      note('Reconnecting', 'The connection dropped. Trying again.', false);
      if (!again) again = setTimeout(connect, 200);
    }
  }, 2000);
  addEventListener('online', () => { if (!ws && !ended && !again) connect(); });
  // Android can hide the address bar for the pad (an iPhone page cannot): when the first touch lifts, once.
  addEventListener('pointerdown', stayAwake, { once: true });
  addEventListener('pointerup', () => {
    try { const el = document.documentElement; if (document.fullscreenEnabled && !document.fullscreenElement && matchMedia('(pointer: coarse)').matches) el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {}); } catch (e) { /* not on this phone */ }
  }, { once: true });
  connect();
})(typeof self !== 'undefined' ? self : this);
