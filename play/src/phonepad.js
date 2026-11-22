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
// - Lag (Bryan, 21 Nov 2026: "Yes, start" on a direct link). Every press went phone, Cloudflare, screen: about 65 ms one
//   way on voidtv.net, at times 160. Now, once joined, the phone also opens a link straight to the screen over the same
//   Wi-Fi (a WebRTC data channel, described to the screen through the room; no outside server is asked) and says every
//   state on both ways at once; the screen takes the first to arrive. If the link cannot connect, or stops, the relay
//   carries on as before and the phone tries the link again a few times. The line at the top says which way is in use
//   (Direct or Relay), its delay, and any state the relay dropped.
(function (root) {
  'use strict';
  // This script's own build (the site adds ?v= to it), so the layouts file is fetched fresh after a push too.
  const BUILD = typeof document !== 'undefined' && document.currentScript ? (/[?&]v=([0-9a-f]+)/.exec(document.currentScript.src) || [])[1] || '' : '';
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
  const PART = 600;       // the direct link's description goes through the room in pieces this long (the relay takes 1 KB)
  const GATHER_MS = 1500; // how long the phone looks for its own addresses before it offers
  const ANSWER_MS = 10000;   // no direct link this long after offering: that try is over
  const DIRECT_OK_MS = 3500; // the direct link answered a ping within this: it is the way in use
  const DIRECT_DEAD_MS = 10000;   // it has not answered for this long: closed, and tried again
  const RETRY_MS = [5000, 20000, 60000];   // the tries after the first, then no more until the phone joins again

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
  // Pure (tested): the line at the top of the pad: which way presses travel, how long one takes, and how many states the
  // relay dropped since this phone joined (nothing is said of none).
  function pathText(direct, ms, lost) {
    if (ms == null) return { text: '', slow: false };
    const slow = ms > SLOW_MS;
    return { text: (direct ? 'Direct ' : 'Relay ') + Math.round(ms) + ' ms' + (slow ? ': presses will feel late' : '') + (lost > 0 ? ', ' + lost + ' dropped' : ''), slow };
  }
  // Pure (tested): a text in pieces, and the pieces back into the text (the same pair as the screen's, src/phones.js).
  const pieces = (text, size) => { const out = []; for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size)); return out.length ? out : ['']; };
  function gather(store, m) {
    if (!m || !Number.isInteger(m.i) || !Number.isInteger(m.of) || m.of < 1 || m.of > 40 || m.i < 0 || m.i >= m.of || typeof m.d !== 'string' || m.d.length > 900) return null;
    if (store.id !== m.id || store.of !== m.of) { store.id = m.id; store.of = m.of; store.d = []; store.n = 0; }
    if (store.d[m.i] === undefined) { store.d[m.i] = m.d; store.n++; }
    if (store.n < store.of) return null;
    const text = store.d.join(''); store.id = undefined; store.d = []; store.n = 0;
    return text;
  }
  // Pure (tested): how long to wait before the next message may go, and how long until the beat is due.
  const waitFor = (now, lastAt) => Math.max(0, GAP_MS - (now - lastAt));
  const beatDue = (now, lastAt, changedAt, b) => now - lastAt >= (b || now - changedAt < 1000 ? BEAT_MS : REST_MS);
  // Pure (tested): which button a touch at (x, y) presses, from each button's box { n, x, y, w, h, round }: the one it
  // is on, or the nearest within REACH. only narrows it (a thumb sliding across the face buttons stays on face buttons).
  // How far (x, y) is from a button's edge (0 or less: on it).
  const offBy = (k, x, y) => (k.round ? Math.hypot(x - k.x - k.w / 2, y - k.y - k.h / 2) - k.w / 2
    : Math.hypot(Math.max(k.x - x, 0, x - (k.x + k.w)), Math.max(k.y - y, 0, y - (k.y + k.h))));
  function keyAt(boxes, x, y, only, reach) {
    let best = null, near = reach === undefined ? REACH : reach;
    for (const k of boxes) {
      if (only && !only(k)) continue;
      const d = offBy(k, x, y);
      if (d < near) { near = d; best = k; }
    }
    return best;
  }
  // Pure (tested): is a touch at (x, y) the round pad's? On the pad itself, always. In the ring just outside it (a thumb
  // a little off: RING of its half-width more), it is the pad's unless the touch is on a button: a button laid close to
  // the pad keeps its own taps. Bryan's own sideways layout (22 Nov 2026) has Start and Menu close beside the pad; on a
  // narrower phone their left edges came inside the ring, and the pad would have taken a thumb meant for them.
  const RING = 0.14;
  function onPad(pad, boxes, x, y) {
    if (!pad) return false;
    const c = pad.size / 2, d = Math.hypot(x - pad.x - c, y - pad.y - c);
    return d < c || (d < c * (1 + RING) && !keyAt(boxes, x, y, null, 0.01));
  }
  // Pure (tested): the button a finger is on after it slid to (x, y). cur is the button it was on (null once it slid off
  // everything). On the face buttons a thumb rolls: onto the next one (the first is let go), or it stays on its button
  // while it drifts no more than that button's width past its edge; clearly off, it holds nothing, and holds again when
  // it comes back onto a face button. Select, Start, L and R do not roll: off by more than their own height, they let go.
  function slide(boxes, cur, face, x, y) {
    if (cur && !cur.face) return offBy(cur, x, y) > cur.h ? null : cur;
    const k = keyAt(boxes, x, y, face ? (b) => b.face : null);
    if (k) return k;
    return cur && offBy(cur, x, y) <= cur.w ? cur : null;
  }

  const api = { BUTTONS, SLOW_MS, GAP_MS, BEAT_MS, REST_MS, QUIET_MS, AWAY_MS, REACH, RING, PART, DIRECT_OK_MS, bits, aim, dirs, delayText, pathText, pieces, gather, waitFor, beatDue, keyAt, onPad, slide };
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }
  root.PlayPhonePad = api;

  // ---- The page ----
  const $ = (id) => document.getElementById(id);
  const now = () => performance.now();
  const code = (new URLSearchParams(location.search).get('r') || '').toUpperCase();
  // Drawn inside the layout editor (play/tools/layout.html): the real pad, with no room to join and nothing asked of the browser.
  const EDIT = /[?&]edit=1\b/.test(location.search);
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
  // count goes up with every change, so the screen can tell a newer state from a late copy of an older one: the same
  // state travels by the relay and, where it is open, by the direct link, and the screen takes the first to arrive.
  let held = new Set(), cur = 0, count = 0, lastN = -1, lastAt = -1e9, changedAt = -1e9, timer = null, sentRelay = 0;
  const state = () => ({ type: 'pad', b: cur, n: count, v: 2 });
  // The direct link carries a state the moment it changes: it has no limit to keep under.
  function sayDirect() { if (ch && ch.readyState === 'open') { try { ch.send(JSON.stringify(state())); } catch (e) { /* closing: the relay has it */ } } }
  function say() { timer = null; lastN = count; lastAt = now(); if (ws && ws.readyState === 1) sentRelay++; send(state()); }
  function sendPad() {
    const b = bits(held);
    if (b !== cur) { cur = b; count++; changedAt = now(); sayDirect(); }
    if (count === lastN) return;
    const wait = waitFor(now(), lastAt);
    if (!wait) say(); else if (!timer) timer = setTimeout(say, wait);
  }
  // Said again by both ways, whether or not the other heard (a joined or returning screen, the beat).
  const sayAll = () => { say(); sayDirect(); };
  setInterval(() => { if (!timer && beatDue(now(), lastAt, changedAt, cur)) sayAll(); }, 50);

  // ---- The direct link, the phone's end: the phone offers, the screen answers, both through the room ----
  const RTC = typeof RTCPeerConnection !== 'undefined' && !/[?&]direct=0\b/.test(location.search) ? RTCPeerConnection : null;
  let pc = null, ch = null, linkId = 0, linkTries = 0, linkAgain = null, answer = {}, directMs = null, directAt = -1e9, relayMs = null, lost = 0;
  const pingsOut = new Map();   // a relay ping's time -> how many states had gone by the relay when it left
  const directNow = () => !!(ch && ch.readyState === 'open' && now() - directAt < DIRECT_OK_MS);
  function showPath() {
    const direct = directNow(), d = pathText(direct, direct ? directMs : relayMs, lost);
    $('delay').textContent = d.text; $('delay').classList.toggle('slow', d.slow); $('delay').dataset.path = direct ? 'direct' : 'relay';
  }
  function unlink() {
    const p = pc, c = ch; pc = ch = null; directAt = -1e9;
    try { if (c) c.close(); } catch (e) { /* gone */ }
    try { if (p) p.close(); } catch (e) { /* gone */ }
  }
  function retryLink() { if (linkAgain || linkTries >= RETRY_MS.length) return; linkAgain = setTimeout(() => { linkAgain = null; link(); }, RETRY_MS[linkTries++]); }
  // A new start for the link (the phone joined, or the screen opened a new page): the tries begin again.
  function resetLink() { unlink(); linkTries = 0; if (linkAgain) { clearTimeout(linkAgain); linkAgain = null; } }
  const found = (p) => new Promise((done) => {
    if (p.iceGatheringState === 'complete') return done();
    const t = setTimeout(done, GATHER_MS);
    p.addEventListener('icegatheringstatechange', () => { if (p.iceGatheringState === 'complete') { clearTimeout(t); done(); } });
  });
  async function link() {
    if (!RTC || !ws || ws.readyState !== 1 || away || ended) return;
    unlink();
    const id = ++linkId, mine = pc = new RTC({ iceServers: [] });   // no outside server: this network's own addresses only
    const c = ch = mine.createDataChannel('pad', { ordered: false, maxRetransmits: 0 });   // the newest state matters, not an old one sent again
    c.onopen = () => { if (c !== ch) return; sayDirect(); pingDirect(); };
    c.onclose = () => { if (c !== ch) return; unlink(); showPath(); retryLink(); };
    c.onmessage = (e) => {
      if (c !== ch) return;
      let m; try { m = JSON.parse(e.data); } catch (x) { return; }
      if (m.type !== 'pong') return;
      const first = !directNow();
      directMs = (now() - m.t) / 2; directAt = now(); linkTries = 0;
      if (first) { showPath(); send({ type: 'delay', ms: Math.round(directMs), direct: true }); }
    };
    mine.onconnectionstatechange = () => { if (mine === pc && mine.connectionState === 'failed') { unlink(); showPath(); retryLink(); } };
    try {
      await mine.setLocalDescription(await mine.createOffer());
      await found(mine);
      if (mine !== pc) return;
      const parts = pieces(mine.localDescription.sdp, PART);
      answer = {};
      parts.forEach((d, i) => send({ type: 'rtc', k: 'offer', id, i, of: parts.length, d }));
      setTimeout(() => { if (mine === pc && !directNow()) { unlink(); showPath(); retryLink(); } }, ANSWER_MS);
    } catch (e) { if (mine === pc) { unlink(); retryLink(); } }
  }
  function linkAnswer(m) {
    if (!pc || m.id !== linkId) return;
    const sdp = gather(answer, m);
    if (sdp) pc.setRemoteDescription({ type: 'answer', sdp }).catch(() => { unlink(); retryLink(); });
  }
  function pingDirect() { if (ch && ch.readyState === 'open') { try { ch.send(JSON.stringify({ type: 'ping', t: now() })); } catch (e) { /* closing */ } } }
  setInterval(() => {
    pingDirect();
    // Open but silent: the link is dead though nothing said so. The relay never stopped; close it and try again.
    if (ch && ch.readyState === 'open' && directAt > 0 && now() - directAt > DIRECT_DEAD_MS) { unlink(); retryLink(); }
    showPath();
  }, 1000);

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
  // A card in the earlier form (a word for each standard button; the shelf's remote sends one): the same parts, two
  // buttons as a pair, more as the diamond. The card is brought to today's form once, here.
  function modern(c) {
    if (Array.isArray(c.keys)) return c;
    const w = c.buttons || {}, at = { Y: [1, 2], X: [2, 1], B: [2, 3], A: [3, 2] }, paint = { A: 'red', B: 'yellow', X: 'pink', Y: 'cyan' }, keys = [];
    const face = ['A', 'B', 'X', 'Y'].filter((n) => n in w), few = face.length <= 2;
    face.forEach((n, i) => keys.push({ n, t: n, w: w[n], at: 'face', r: few ? 2 - i : at[n][0], c: few ? 1 + i : at[n][1], k: paint[n] }));
    for (const n of ['LB', 'RB']) if (n in w) keys.push({ n, t: n === 'LB' ? 'L' : 'R', w: w[n], at: n === 'LB' ? 'left' : 'right' });
    for (const n of ['Back', 'Start']) if (n in w) keys.push({ n, t: w[n] === 'Menu' ? 'Menu' : n === 'Back' ? 'Select' : 'Start', w: '', at: 'pill' });
    return Object.assign({}, c, { keys, cols: few ? Math.max(1, face.length) : 3, rows: few ? Math.max(1, face.length) : 3 });
  }
  let drawn = '';
  function draw(c) {
    c = modern(c);
    $('game').textContent = c.title || '';
    // The same buttons as are drawn already (the screen sends its card again to a phone that joins again): nothing is
    // rebuilt, so the fingers still down stay where they are and what they hold is kept.
    const same = JSON.stringify(c) === drawn;
    drawn = JSON.stringify(c); card = c;
    if (same) { $('note').hidden = true; $('pad').hidden = false; lay(); measure(); return; }
    for (const id of ['face', 'mid', 'left', 'right']) $(id).textContent = '';
    const face = $('face');
    face.className = 'face' + (c.shape ? ' s-' + c.shape : '') + ' g' + (c.cols || 3);
    face.style.setProperty('--cols', c.cols || 3); face.style.setProperty('--rows', c.rows || 3);
    for (const k of c.keys) button(k, $(k.at === 'face' ? 'face' : k.at === 'pill' ? 'mid' : k.at));
    $('dpad').style.visibility = c.dpad === false ? 'hidden' : '';
    $('note').hidden = true; $('pad').hidden = false;
    lay(); measure(); letGo();
  }
  // ---- Where each part sits: from play/layouts.json, set in the layout editor (src/padlayout.js) ----
  // Bryan, 21 Nov 2026: "i want a mock up of the controllers created for me with all parts moveaple ... so that i can
  // finetune this layout onece and for all". A part with an entry for this way of holding the phone goes where the entry
  // says; a part with none keeps the page's own place. draft is a layout the editor is trying (null: the built-in one).
  const Layout = root.PlayPadLayout || null;
  const PART_NAMES = { dpad: 'D-pad', face: 'Buttons', l: 'L', r: 'R', select: 'Select', start: 'Start', menu: 'Menu', info: 'Top line' };
  let layouts = null, draft;
  const partOf = (el) => (el.dataset.n === 'LB' ? 'l' : el.dataset.n === 'RB' ? 'r' : el.firstChild && el.firstChild.textContent === 'Menu' ? 'menu' : el.dataset.n === 'Back' ? 'select' : 'start');
  function partEls() {
    const els = { dpad: $('dpad'), face: $('face'), info: $('top') };
    for (const el of document.querySelectorAll('#pad .b:not(.f)')) els[partOf(el)] = el;
    return els;
  }
  // The screen without the phone's notch, rounded corners and home bar: parts are placed inside it.
  function area() {
    const s = getComputedStyle($('safe')), n = (v) => parseFloat(v) || 0;
    const l = n(s.paddingLeft), t = n(s.paddingTop);
    return { x: l, y: t, w: innerWidth - l - n(s.paddingRight), h: innerHeight - t - n(s.paddingBottom) };
  }
  function lay() {
    if (!Layout) return;
    const set = draft !== undefined ? draft : layouts && layouts.phone && layouts.phone[innerWidth >= innerHeight ? 'side' : 'up'];
    Layout.apply(area(), partEls(), set || null);
  }
  if (Layout) Layout.load('layouts.json' + (BUILD ? '?v=' + BUILD : '')).then((f) => { layouts = f; if (card) { lay(); measure(); } });

  // Where every button is now (after drawing, and when the phone turns).
  function measure() {
    boxes = [...document.querySelectorAll('#pad .b')].map((el) => { const r = el.getBoundingClientRect(); return { el, n: el.dataset.n, face: el.classList.contains('f'), round: el.classList.contains('f'), x: r.left, y: r.top, w: r.width, h: r.height }; });
    const d = $('dpad').getBoundingClientRect();
    dpadBox = $('dpad').style.visibility === 'hidden' || !d.width ? null : { x: d.left, y: d.top, size: d.width };
  }
  addEventListener('resize', () => { lay(); measure(); });
  addEventListener('orientationchange', () => setTimeout(() => { lay(); measure(); letGo(); }, 300));

  // ---- Touch: one rule for the whole screen ----
  // Each finger is on the round pad (it may slide between directions) or on a button (on the face buttons it may slide
  // from one to the next, as a thumb rolls on a real pad). What is held is whatever the fingers now down are on.
  const fingers = new Map();   // pointer id -> { pad: true, sector, dirs } or { key }
  function place(e, f) {
    if (f.pad) { if (!dpadBox) return; const a = aim(e.clientX - dpadBox.x, e.clientY - dpadBox.y, dpadBox.size, f.sector); f.sector = a.sector; f.dirs = a.dirs; return; }
    if (f.dead) return;
    const k = slide(boxes, f.key || null, !!f.face, e.clientX, e.clientY);
    if (!f.began) { f.began = true; if (!k) { f.none = true; return; } f.face = !!k.face; }   // a touch on nothing is no finger of ours
    else if (!k && !f.face) f.dead = true;   // slid off Select, Start, L or R: nothing more until it lifts
    f.key = k;
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
    if (onPad(dpadBox, boxes, e.clientX, e.clientY)) { f.pad = true; f.sector = null; f.dirs = []; }
    place(e, f);
    if (f.none) return;
    fingers.set(e.pointerId, f); refresh();
  }
  const move = (e) => { const f = fingers.get(e.pointerId); if (f) { place(e, f); refresh(); } };
  const up = (e) => { if (fingers.delete(e.pointerId)) refresh(); };
  // Everything is let go at once: the page hides or loses focus, the phone turns, or the browser says no finger is down.
  // No button is left held on the big screen. A connection that drops is another matter: the screen lets go by itself
  // (it hears the phone leave, or hears nothing for 0.8 s), and the fingers still down are kept, so that when the phone
  // is back a thumb that never moved is holding again (the auditor, 21 Nov 2026: by the relay alone, a 6 s network cut
  // with the thumb on Right left Right unpressed for good, since a finger that does not move sends no new touch).
  function letGo() { if (!fingers.size && !held.size) return; fingers.clear(); refresh(); }
  document.addEventListener('pointerdown', down);
  document.addEventListener('pointermove', move);
  for (const ev of ['pointerup', 'pointercancel']) document.addEventListener(ev, up);
  for (const ev of ['touchend', 'touchcancel']) document.addEventListener(ev, (e) => { if (!e.touches.length) letGo(); }, true);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { letGo(); if (timer) { clearTimeout(timer); timer = null; } if (count !== lastN) say(); } });   // said now: a hidden page's timers may not run
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
      if (m.type === 'hello') { tries = 0; lastN = -1; sentRelay = 0; lost = 0; pingsOut.clear(); resetLink(); if (card) { $('note').hidden = true; $('pad').hidden = false; say(); } else note('Joined', 'Waiting for the big screen.', false); }
      // The screen's buttons for this game. A screen is there now: the direct link is opened if it is not already.
      else if (m.type === 'card') { draw(m); sayAll(); if (!pc && !linkAgain) link(); }
      else if (m.type === 'seat') $('who').textContent = 'Player ' + m.seat;
      else if (m.type === 'pong') {
        relayMs = (now() - m.t) / 2;
        // Everything said by the relay before that ping had arrived when it did, unless the relay dropped it.
        if (pingsOut.has(m.t)) { if (Number.isInteger(m.g)) lost = Math.max(lost, pingsOut.get(m.t) - m.g); pingsOut.delete(m.t); }
        const direct = directNow();
        showPath(); send({ type: 'delay', ms: Math.round(direct ? directMs : relayMs), direct });
      }
      else if (m.type === 'rtc' && m.k === 'answer') linkAnswer(m);
      else if (m.type === 'host-gone') { ended = true; note('The game screen closed', 'Scan the new code on the big screen to join again.', true); }
      // The big screen is changing pages (the shelf opening a game): the phone stays connected and waits a moment.
      // While it is away nothing answers this phone's pings: that silence is the screen's, not a dead connection.
      else if (m.type === 'host-away') { away = true; resetLink(); $('game').textContent = 'The screen is opening the game...'; }
      // The new page sends its own buttons (and the direct link is opened to it then); it hears what is held now, and its
      // count of what the relay brought starts again, so the phone's does too.
      else if (m.type === 'host-back') { sentRelay = 0; lost = 0; pingsOut.clear(); resetLink(); say(); }
    };
    sock.onclose = (e) => {
      if (sock !== ws) return;   // an old connection this page already replaced
      ws = null; resetLink(); showPath();
      // The room is over for this phone (ended, or one of the answers below): nothing is held. A dropped connection keeps its fingers.
      if (ended || [4404, 4409, 4423, 4403, 4411, 4410, 4408].includes(e.code)) letGo();
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
    const t = now();
    if (ws && ws.readyState === 1) { pingsOut.set(t, sentRelay); if (pingsOut.size > 8) pingsOut.delete(pingsOut.keys().next().value); }
    send({ type: 'ping', t });
    // The screen answers every ping. Silence this long means the connection is dead though the browser has not said so:
    // let go, drop it and open a new one (the relay gives this phone its own seat back).
    if (ws && !ended && now() - heardAt > (away ? AWAY_MS : QUIET_MS)) {
      const dead = ws; ws = null; resetLink();   // the fingers still down are kept for the new connection
      try { dead.close(); } catch (e) { /* already gone */ }
      note('Reconnecting', 'The connection dropped. Trying again.', false);
      if (!again) again = setTimeout(connect, 200);
    }
  }, 2000);
  addEventListener('online', () => { if (!ws && !ended && !again) connect(); });
  // Android can hide the address bar for the pad (an iPhone page cannot): when the first touch lifts, once.
  addEventListener('pointerdown', stayAwake, { once: true });
  addEventListener('pointerup', () => {
    if (EDIT) return;
    try { const el = document.documentElement; if (document.fullscreenEnabled && !document.fullscreenElement && matchMedia('(pointer: coarse)').matches) el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {}); } catch (e) { /* not on this phone */ }
  }, { once: true });
  // The layout editor's own door to this page: draw a game's buttons, read where each part is, try a layout.
  if (EDIT) {
    api.editor = {
      draw(c) { drawn = ''; draw(c); },
      area,
      // Every part on the pad now: its name, its box inside the area, whether it keeps square, whether an entry placed it.
      parts() {
        const a = area();
        return Object.entries(partEls()).map(([id, el]) => {
          const r = el.getBoundingClientRect();
          return { id, name: PART_NAMES[id], square: id === 'dpad' || id === 'face', placed: el.classList.contains('placed'), shown: r.width > 0 && getComputedStyle(el).visibility !== 'hidden',
            box: { x: r.left - a.x, y: r.top - a.y, w: r.width, h: r.height } };
        }).filter((p) => p.shown);
      },
      // set: a layout to try (null: the built-in one; undefined: what the file says).
      show(set) { draft = set; lay(); measure(); },
    };
    return;
  }
  connect();
})(typeof self !== 'undefined' ? self : this);
