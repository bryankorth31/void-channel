// VoidTV PLAY: the phone's side of a phone gamepad (play/pad.html). Licence: GPL-2.0-or-later (play/LICENSE).
// Bryan, 20 Nov 2026: "Yes, phone controllers". The phone joins the room the big screen opened and sends which buttons are
// held, as a standard gamepad would report them; the big screen feeds that to the hub as one more gamepad, so the seat
// rules, the card's button words and Back + Start for the menu all work as with a real controller.
(function (root) {
  'use strict';
  // The standard gamepad's button numbers (the same as PlayHub.BUTTONS).
  const BUTTONS = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, Back: 8, Start: 9, L3: 10, R3: 11, Up: 12, Down: 13, Left: 14, Right: 15, Home: 16 };
  const SLOW_MS = 120;   // past this a press feels late; the phone says so

  // Pure (tested): the held buttons as one number, bit n for button n.
  const bits = (held) => [...held].reduce((b, name) => (name in BUTTONS ? b | (1 << BUTTONS[name]) : b), 0);
  // Pure (tested): the directions a finger at (x, y) on the round pad means, from its centre; a small middle does nothing,
  // and a finger between two directions holds both (a diagonal).
  function dirs(x, y, size) {
    const dx = x - size / 2, dy = y - size / 2, r = Math.hypot(dx, dy);
    if (r < size * 0.12) return [];
    const a = Math.atan2(dy, dx) * 180 / Math.PI, out = [];   // 0 = right, 90 = down
    if (a > -67.5 && a < 67.5) out.push('Right');
    if (a > 22.5 && a < 157.5) out.push('Down');
    if (a > 112.5 || a < -112.5) out.push('Left');
    if (a > -157.5 && a < -22.5) out.push('Up');
    return out;
  }
  // Pure (tested): what the phone says about the delay, from a round trip in ms.
  const delayText = (rtt) => { const ms = Math.round(rtt / 2); return { text: 'Delay ' + ms + ' ms', slow: ms > SLOW_MS }; };

  const api = { BUTTONS, SLOW_MS, bits, dirs, delayText };
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }
  root.PlayPhonePad = api;

  // ---- The page ----
  const $ = (id) => document.getElementById(id);
  const code = (new URLSearchParams(location.search).get('r') || '').toUpperCase();
  const held = new Set();
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
  let ws = null, ended = false, tries = 0, lastSent = -1;
  function note(h, p, link) { $('note-h').textContent = h; $('note-p').textContent = p; $('note-a').hidden = !link; $('note').hidden = false; $('pad').hidden = true; }
  const send = (m) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };
  function sendPad() { const b = bits(held); if (b !== lastSent) { lastSent = b; send({ type: 'pad', b }); } }
  const buzz = () => { try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) { /* not on this phone */ } };

  function button(name, word, into) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'b'; b.dataset.n = name;
    b.innerHTML = '<span></span><small></small>';
    b.firstChild.textContent = name; b.lastChild.textContent = word || '';
    b.setAttribute('aria-label', name + (word ? ', ' + word : ''));
    const up = () => { if (held.delete(name)) { b.classList.remove('on'); sendPad(); } };
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (x) { /* fine */ } held.add(name); b.classList.add('on'); buzz(); sendPad(); });
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
    into.appendChild(b);
  }

  // The card's words for each button come from the big screen; a button the game does not use is not drawn.
  function draw(card) {
    $('game').textContent = card.title || '';
    for (const id of ['face', 'mid', 'shoulders']) $(id).textContent = '';
    const w = card.buttons || {};
    for (const n of ['Y', 'X', 'B', 'A']) if (n in w) button(n, w[n], $('face'));
    for (const n of ['Back', 'Start']) if (n in w) button(n, w[n], $('mid'));
    for (const n of ['LB', 'RB']) if (n in w) button(n, w[n], $('shoulders'));
    $('dpad').style.visibility = card.dpad === false ? 'hidden' : '';
    $('note').hidden = true; $('pad').hidden = false;
  }

  // The round pad: a finger can slide between directions without lifting.
  const pad = $('dpad'), fingers = new Map();
  function aim(e) {
    const r = pad.getBoundingClientRect();
    fingers.set(e.pointerId, dirs(e.clientX - r.left, e.clientY - r.top, r.width));
    update();
  }
  function update() {
    const now = new Set([].concat(...fingers.values()));
    let changed = false;
    for (const d of ['Up', 'Down', 'Left', 'Right']) {
      if (now.has(d) && !held.has(d)) { held.add(d); changed = true; buzz(); }
      if (!now.has(d) && held.has(d)) { held.delete(d); changed = true; }
      pad.querySelector('[data-d=' + d + ']').classList.toggle('on', now.has(d));
    }
    if (changed) sendPad();
  }
  pad.addEventListener('pointerdown', (e) => { e.preventDefault(); try { pad.setPointerCapture(e.pointerId); } catch (x) { /* fine */ } aim(e); });
  pad.addEventListener('pointermove', (e) => { if (fingers.has(e.pointerId)) aim(e); });
  const lift = (e) => { if (fingers.delete(e.pointerId)) update(); };
  pad.addEventListener('pointerup', lift); pad.addEventListener('pointercancel', lift);

  // Everything is let go when the phone is put down or the page hides, so no button sticks on the big screen.
  function letGo() { held.clear(); fingers.clear(); for (const e of document.querySelectorAll('.on')) e.classList.remove('on'); sendPad(); }
  document.addEventListener('visibilitychange', () => { if (document.hidden) letGo(); });

  let lock = null;
  async function stayAwake() { try { if (navigator.wakeLock && !lock) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); } } catch (e) { /* not allowed */ } }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) stayAwake(); });

  function connect() {
    if (!/^[2-9A-Z]{4}$/.test(code)) { note('No room code', 'Scan the code on the big screen, or type it.', true); return; }
    ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/room/' + code + '/join?t=' + token());
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch (x) { return; }
      if (m.type === 'hello') { tries = 0; lastSent = -1; note('Joined', 'Waiting for the big screen.', false); }
      else if (m.type === 'card') draw(m);
      else if (m.type === 'seat') $('who').textContent = 'Player ' + m.seat;
      else if (m.type === 'pong') { const d = delayText(performance.now() - m.t); $('delay').textContent = d.text + (d.slow ? ': presses will feel late' : ''); $('delay').classList.toggle('slow', d.slow); send({ type: 'delay', ms: Math.round((performance.now() - m.t) / 2) }); }
      else if (m.type === 'host-gone') { ended = true; note('The game screen closed', 'Scan the new code on the big screen to join again.', true); }
    };
    ws.onclose = (e) => {
      ws = null;
      if (ended) return;
      if (e.code === 4404) { note('No room with that code', 'The code changes each time. Check the big screen.', true); return; }
      if (e.code === 4409) { note('This game is full', 'Up to 16 phones can join one screen.', false); return; }
      if (e.code === 4423) { note('This room is locked', 'The screen is not letting new phones in right now.', false); return; }
      if (e.code === 4403) { ended = true; note('The screen removed this phone', 'Ask whoever runs the screen if that was a mistake.', false); return; }
      if (e.code === 4410 || e.code === 4408) { note('The game screen closed', 'Scan the new code on the big screen to join again.', true); return; }
      // A dropped connection (a phone walking out of Wi-Fi): try again, a little slower each time.
      note('Reconnecting', 'The connection dropped. Trying again.', false);
      setTimeout(connect, Math.min(8000, 500 * 2 ** tries++));
    };
  }
  // iPhone Safari zooms on fast taps regardless of touch-action; the buttons run on pointer events, so the touches go.
  for (const id of ['pad', 'shoulders']) for (const ev of ['touchstart', 'touchend']) $(id).addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  setInterval(() => send({ type: 'ping', t: performance.now() }), 2000);
  addEventListener('pointerdown', stayAwake, { once: true });
  connect();
})(typeof self !== 'undefined' ? self : this);
