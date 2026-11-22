// VoidTV phone remote: the big screen's side, the same for every VoidTV site. Licence: GPL-2.0-or-later.
// The screen opens a room of kind "remote" on the rooms relay (play/rooms/, /api/room/*), shows its code and QR, and answers the
// phones that join it through a site adapter (remote/src/voidtv.js on voidtv.net). The adapter gives:
//   site()      { name, home, donate, kids }                  who this screen is
//   now()       { k, where, t, s, nx, left, slug, art, acts }   what is on now (VoidRemote.nowMsg)
//   lists()     [{ id, title, items: [{ id, t, s }], on, a }]   lists to pick from (every channel and what is on it; the areas);
//                                                                a: what a tap on a row does (tune, go, game, area)
//   info(slug)  { slug, t, sub, ppl, about, url } or null       a show's details
//   act(cmd, seat)  runs one checked action (VoidRemote.readDo); seat: the phone that asked (a hand-over answers that phone)
//   find(q)     { id, title, items, a } or null                 the site's own search, for one phone (optional)
// The same room follows the big screen from area to area of voidtv.net (remote/src/follow.js): each area's page has its own
// adapter (voidtv.js for On Demand and Live TV, play.js for PLAY, trivia.js for Trivia) and takes the room back on load.
// The room stays when the page reloads: its key is kept for this tab only (sessionStorage), as PLAY's game pad room is
// (play/src/phones.js), and the next load takes it back within 45 seconds, phones still in their seats.
(function (root) {
  'use strict';
  if (typeof document === 'undefined' || !root.VoidRemote) return;
  const V = root.VoidRemote;
  const KEEP = 'voidtv-remote-room';
  const POLL_MS = 1500, LIST_MS = 30 * 1000, ALIVE_MS = 10 * 60 * 1000;
  const kept = () => { try { const k = JSON.parse(sessionStorage.getItem(KEEP) || 'null'); return k && /^[2-9A-Z]{4}$/.test(k.code) && k.key ? k : null; } catch (e) { return null; } };
  const keep = (k) => { try { if (k) sessionStorage.setItem(KEEP, JSON.stringify(k)); else sessionStorage.removeItem(KEEP); } catch (e) { /* this page only */ } };

  let ad = null, ws = null, room = null, ended = false, opening = null, retry = 0;
  const seats = new Set();
  let lastNow = '', lastList = '', listVer = 0, findVer = 0, timers = [];
  // THE WATCH PARTY (remote/README.md). Other TVs join this room as members (they say p-hi with their zone) and follow this
  // one: it sends them its zone and channel (p-tv), the question's progress (p-quiz) and the one score list (p-score).
  // homes: a phone that scanned another TV's code says which TV (its r-hi carries h), so the list can name its home.
  const tvs = new Map(), homes = new Map();
  const phoneSeats = () => [...seats].filter((s) => !tvs.has(s));
  let partyMode = false, partyKey = '', partyAt = 0, quizKey = '';
  const myZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; } };
  // A phone keeps its home's name after its TV leaves the party (its score stays on the list).
  const homeZones = new Map();
  const homeOf = (seat) => {
    const h = homes.get(seat);
    if (h !== undefined && tvs.has(h) && tvs.get(h).zone) homeZones.set(seat, tvs.get(h).zone);
    return V.zoneCity(homeZones.get(seat) || (h !== undefined ? '' : myZone()));
  };
  const scores = () => V.partyScores(book, phoneSeats(), homeOf);
  function partyTick(force) {
    if (!tvs.size || !ad || !ad.party) return;
    const p = ad.party();
    if (!p) return;
    const m = { type: 'p-tv', zone: myZone(), chan: p.chan || '', on: !!p.on, phones: phoneSeats().length, tvs: tvs.size + 1 };
    const key = JSON.stringify(m), t = Date.now();
    if (!force && key === partyKey && t - partyAt < 30000) return;   // and again every 30 s, which also carries this TV's clock
    partyKey = key; partyAt = t; m.t = t;
    for (const s of tvs.keys()) send(s, m);
  }
  function partyQuiz(z) {
    if (!tvs.size) return;
    const k = z && V.quizCount(book, phoneSeats(), z);
    const m = z ? { type: 'p-quiz', n: z.n, phase: z.phase, pop: !!z.pop, answered: k.answered, right: k.right, phones: k.phones } : { type: 'p-quiz', n: null };
    const key = JSON.stringify(m);
    if (key === quizKey) return;
    quizKey = key;
    for (const s of tvs.keys()) send(s, m);
  }
  function partyScores(to) {
    if (!tvs.size) return;
    const m = { type: 'p-score', list: scores().slice(0, 8).map((r) => ({ seat: r.seat, score: r.score, place: r.place, home: r.home })) };
    for (const s of to ? [to] : tvs.keys()) send(s, m);
  }
  // Trivia in the breaks: an adapter may give quiz() (remote/src/remote.js says what a quiz is). book: each seat's score and
  // its answer to the question now open, for this room's evening.
  // The scores are kept for this tab with the room, so a reload (or the page changing) does not wipe a phone's evening.
  const book = {}, BOOK = 'voidtv-remote-book';
  function bookLoad(code, back) {
    for (const s in book) delete book[s];
    if (!back) return;
    try {
      const k = JSON.parse(sessionStorage.getItem(BOOK) || 'null');
      if (k && k.code === code && k.book) for (const s in k.book) {
        const p = k.book[s];
        if (/^\d+$/.test(s) && p && Number.isFinite(p.score)) book[s] = Number.isInteger(p.n) ? { score: p.score, n: p.n, pick: p.pick, at: p.at } : { score: p.score };
      }
    } catch (e) { /* none kept */ }
  }
  function bookSave() { try { if (room) sessionStorage.setItem(BOOK, JSON.stringify({ code: room.code, book })); } catch (e) { /* this page only */ } }
  let quizN = null, quizPhase = '';
  const quizNow = () => { try { return ad && ad.quiz ? ad.quiz() : null; } catch (e) { return null; } };
  function quizTick() {
    const z = quizNow();
    partyQuiz(z);
    if (!z) { quizN = null; quizPhase = ''; return; }
    // Each phone is asked with its own answer, if it gave one (the page reloaded mid-question: its buttons stay locked).
    if (z.phase === 'q' && quizN !== z.n) {
      quizN = z.n; quizPhase = 'q';
      const q = V.quizAsk(z, Date.now());
      for (const seat of phoneSeats()) { const p = book[seat]; send(seat, Object.assign({}, q, { pick: p && p.n === z.n ? p.pick : null })); }
      return;
    }
    // The answer is out: each phone hears its own result once. A question this screen never asked (it tuned in at the answer)
    // gives no results, only the answer on the TV.
    if (z.phase === 'a' && quizPhase !== 'a') {
      const asked = quizN === z.n; quizN = z.n; quizPhase = 'a';
      if (asked) { for (const [seat, m] of V.quizResults(book, phoneSeats(), z, root.TriviaGame && root.TriviaGame.points)) send(seat, m); bookSave(); partyScores(); }
    }
  }
  const send = (to, msg) => { if (ws && ws.readyState === 1 && V.fits(msg)) ws.send(JSON.stringify({ to, msg })); };

  // Everything a phone needs, to one phone (a join, a phone back, a phone asking again) or to all.
  function all(to) {
    send(to, V.siteMsg(ad.site()));
    const n = V.nowMsg(ad.now()); send(to, n); if (to === 'all') lastNow = sameKey(n);
    for (const l of ad.lists()) for (const m of V.listMsgs(l.id, l.title, l.items, l.on, listVer, l.a)) send(to, m);
    // A phone that joins (or wakes) while a question is open gets it, with its own answer if it gave one.
    const z = quizNow();
    if (to !== 'all' && z && z.phase === 'q' && quizN === z.n) {
      const q = V.quizAsk(z, Date.now()), p = book[to];
      if (p && p.n === z.n) q.pick = p.pick;
      send(to, q);
    }
  }
  // The time left is counted down on the phone, so it alone is no reason to send again (it changes every second; sending it
  // each poll made the phone redraw its buttons under a thumb). Anything else that changes goes at once.
  // Whether there is a time left at all does count: an episode's comes once the player knows its length, and goes while paused.
  const sameKey = (n) => JSON.stringify(Object.assign({}, n, { left: n.left === null ? null : 1 }));
  function tick(force) {
    if (!seats.size || !ad) return;
    const n = V.nowMsg(ad.now()), j = sameKey(n);
    if (force || j !== lastNow) { lastNow = j; send('all', n); }
    partyTick(false);
  }
  function listTick() {
    if (!seats.size || !ad) return;
    const ls = ad.lists(), j = JSON.stringify(ls.map((l) => [l.id, l.on, l.a, l.items]));
    if (j === lastList) return;
    lastList = j; listVer = (listVer + 1) % 1e6;
    for (const l of ls) for (const m of V.listMsgs(l.id, l.title, l.items, l.on, listVer, l.a)) send('all', m);
  }

  function onMessage(e) {
    let m; try { m = JSON.parse(e.data); } catch (x) { return; }
    if (m.type === 'room') { if (!room || room.code !== m.code) bookLoad(m.code, !!m.back); room = { code: m.code, join: m.join }; retry = 0; if (m.key) keep({ code: m.code, key: m.key, party: partyMode }); draw(); return; }
    // The first phone in: the panel steps aside after a moment (the chip in the corner brings it back), so it never sits over
    // the picture or a trivia card.
    if (m.type === 'join') { const first = !phoneSeats().length; seats.add(m.from); all(m.from); draw(); if (first && shown && !partyMode) setTimeout(() => { if (phoneSeats().length) hide(); }, 2500); return; }
    if (m.type === 'leave') { seats.delete(m.from); tvs.delete(m.from); homes.delete(m.from); draw(); partyTick(true); return; }
    const msg = m.msg || {};
    if (!seats.has(m.from)) return;
    // Another TV joins the party: it hears this TV's zone, channel and clock at once, and the score list so far.
    if (msg.type === 'p-hi') { tvs.set(m.from, { zone: V.zoneOk(msg.zone) ? msg.zone : '' }); for (const p of homes.keys()) homeOf(p); quizKey = ''; draw(); partyTick(true); partyScores(m.from); return; }
    if (tvs.has(m.from)) return;   // a TV in the party only follows; it does not steer
    if (msg.type === 'r-hi') { if (Number.isInteger(msg.h) && msg.h !== m.from) { homes.set(m.from, msg.h); homeOf(m.from); } all(m.from); return; }
    if (msg.type === 't-a') { const g = V.quizAnswer(book, m.from, msg, quizN === null ? null : quizNow(), Date.now()); if (g) { send(m.from, g); bookSave(); } return; }
    const cmd = V.readDo(msg);
    if (!cmd) return;
    if (cmd.a === 'info') { const i = ad.info(cmd.slug); if (i) send(m.from, V.infoMsg(i)); return; }
    // A search: the answer goes to the phone that asked only, as a list (each phone keeps its own search).
    if (cmd.a === 'find') {
      let l = null; try { l = ad.find ? ad.find(cmd.q) : null; } catch (x) { l = null; }
      if (l) { findVer = (findVer + 1) % 1e6; for (const x of V.listMsgs(l.id || 'find', l.title, l.items, '', findVer, l.a)) send(m.from, x); }
      return;
    }
    try { ad.act(cmd, m.from); } catch (x) { /* a page that cannot do it now: the phone sees nothing change */ }
    setTimeout(() => { tick(); listTick(); partyTick(true); }, 250);   // the page has changed channel: say so at once, not at the next poll
  }

  function connect(k) {
    return new Promise((ok, no) => {
      const q = k ? '&code=' + k.code + '&key=' + encodeURIComponent(k.key) : '';
      const sock = ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/room/open?kind=remote' + q);
      let had = false;
      sock.onmessage = (e) => { if (!had) { had = true; ok(); } onMessage(e); };
      sock.onclose = (e) => {
        if (ws !== sock) return;
        ws = null; const was = room; room = null; seats.clear(); tvs.clear(); draw();
        if (!had) { no(new Error('The phone remote did not open. Check the connection and try again.')); return; }
        // The room timed out (12 hours, or 30 minutes with no word) or ended: start clean the next time. Otherwise the connection
        // dropped: take the same room back while it waits, so the phones stay.
        if (ended || e.code === 4408 || e.code === 4404) { keep(null); return; }
        if (was && retry < 5) { retry++; setTimeout(() => { if (!ws && !ended) open(true).catch(() => {}); }, 1500 * retry); }
      };
    });
  }
  // open(): the room this tab holds if it still waits, else a new one. resumeOnly: only take a held room back.
  function open(resumeOnly) {
    if (ws) return Promise.resolve(room);
    if (opening) return opening;
    const k = kept();
    if (resumeOnly && !k) return Promise.resolve(null);
    ended = false;
    opening = connect(k).catch((e) => { if (k) { keep(null); return resumeOnly ? null : connect(null); } throw e; })
      .finally(() => { opening = null; });
    return opening;
  }
  // End remote: the relay ends the room at once and tells the phones (a plain close would keep it 45 s for a reload).
  function end() { ended = true; keep(null); try { sessionStorage.removeItem(BOOK); } catch (e) { /* fine */ } if (ws && ws.readyState === 1) ws.send(JSON.stringify({ relay: 'end' })); if (ws) ws.close(); ws = null; room = null; seats.clear(); tvs.clear(); homes.clear(); partyMode = false; hide(); }

  // The panel: the code, the QR, how many phones. Small, in a corner, out of the picture's way once a phone is in.
  const CSS = '.vrm{position:fixed;right:16px;bottom:16px;z-index:9000;width:min(300px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;background:#0d0f16;color:#e8e8ee;border:1px solid #2a2f40;border-radius:16px;padding:16px;font:15px system-ui,Segoe UI,Roboto,sans-serif;box-shadow:0 10px 40px rgba(0,0,0,.6);text-align:center}'
    + '.vrm[hidden]{display:none}.vrm h3{margin:0 0 8px;font-size:17px}.vrm p{margin:6px 0;color:#a3a8bb;font-size:13px;line-height:1.4}.vrm b{color:#e8e8ee}'
    + '.vrm-qr{background:#fff;border-radius:10px;padding:8px;width:180px;height:180px;margin:6px auto}.vrm-qr svg{width:100%;height:100%;display:block}'
    + '.vrm-code{font:700 34px/1.1 ui-monospace,Consolas,monospace;letter-spacing:.18em;color:#5fd4ff;margin:4px 0}'
    + '.vrm-n{color:#ff4fc8!important;font-weight:600}.vrm-row{display:flex;gap:8px;justify-content:center;margin-top:10px}'
    + '.vrm button{font:inherit;font-size:14px;background:#161a25;color:#e8e8ee;border:1px solid #2a2f40;border-radius:10px;padding:8px 14px;cursor:pointer;min-height:40px}'
    + '.vrm button:hover{border-color:#5fd4ff}.vrm-err{color:#f3c969!important}'
    // Inside the picture (night audit N14): the panel sits in the picture's top corner, never on the buttons under it, and shows
    // in fullscreen too. Smaller there, and it scrolls if the picture is short.
    + '.vrm.vrm-in{position:absolute;top:12px;right:12px;bottom:auto;z-index:40;width:min(270px,46%);max-height:calc(100% - 84px);padding:12px}.vrm-in .vrm-qr{width:128px;height:128px}.vrm-in .vrm-code{font-size:28px}'
    + '.vrm-chip{position:fixed;right:16px;bottom:16px;z-index:9000;background:#0d0f16;color:#e8e8ee;border:1px solid #ff4fc8;border-radius:999px;padding:8px 14px;font:600 13px system-ui,sans-serif;cursor:pointer}.vrm-chip[hidden]{display:none}';
  let box = null, chip = null, shown = false;
  function build() {
    if (box) return;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    box = document.createElement('div'); box.className = 'vrm'; box.hidden = true; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Phone remote');
    box.innerHTML = '<h3 id="vrm-h">Phone remote</h3><div class="vrm-qr" id="vrm-qr"></div><p>Scan with your phone’s camera, or go to <b id="vrm-site"></b> and type</p>'
      + '<div class="vrm-code" id="vrm-code">....</div><p class="vrm-n" id="vrm-n"></p>'
      + '<p id="vrm-party" hidden>Another TV joins: on voidtv.net, Live TV, press <b>Watch party</b> and type this code. It plays this TV’s channel, at this TV’s time.</p>'
      + '<p class="vrm-err" id="vrm-err" role="status"></p>'
      + '<div class="vrm-row"><button type="button" id="vrm-hide">Hide</button><button type="button" id="vrm-end">End remote</button></div>';
    chip = document.createElement('button'); chip.type = 'button'; chip.className = 'vrm-chip'; chip.hidden = true; chip.onclick = () => show();
    document.body.appendChild(box); document.body.appendChild(chip);
    // Inside the picture, a tap on the panel is the panel's: it never pauses the show or turns on fullscreen under it.
    for (const t of ['click', 'dblclick', 'pointerdown', 'mousedown', 'touchstart', 'pointerup', 'mouseup']) box.addEventListener(t, (e) => e.stopPropagation());
    box.querySelector('#vrm-hide').onclick = hide;
    box.querySelector('#vrm-end').onclick = end;
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && shown) { e.stopPropagation(); hide(); } }, true);
  }
  function draw() {
    if (!box) return;
    const $ = (id) => box.querySelector('#' + id);
    $('vrm-site').textContent = location.host + '/join';
    $('vrm-code').textContent = room ? room.code : '....';
    $('vrm-qr').innerHTML = room && root.PlayQR ? root.PlayQR.svg(room.join, 6) : '';
    const n = phoneSeats().length, t = tvs.size, party = partyMode || t > 0;
    const tvWords = t ? t + ' other TV' + (t === 1 ? '' : 's') : '';
    $('vrm-h').textContent = party ? 'Watch party' : 'Phone remote';
    $('vrm-end').textContent = party ? 'End the party' : 'End remote';
    $('vrm-party').hidden = !party;
    $('vrm-n').textContent = !room ? '' : [n ? n + ' phone' + (n === 1 ? '' : 's') + ' connected' : 'No phone yet', tvWords].filter(Boolean).join(' · ');
    chip.textContent = (party ? 'Watch party' : 'Phone remote') + (n || t ? ': ' + [n ? n + ' phone' + (n === 1 ? '' : 's') : '', tvWords].filter(Boolean).join(', ') : '');
    chip.hidden = shown || !room;
  }
  // Where the panel goes: inside the picture when the page has one (the adapter's panelHost), else the window's corner.
  function place() {
    if (!box) return;
    let host = null; try { host = ad && ad.panelHost ? ad.panelHost() : null; } catch (e) { host = null; }
    const want = host || document.body;
    if (box.parentNode !== want) want.appendChild(box);
    box.classList.toggle('vrm-in', !!host);
  }
  function show() { build(); shown = true; place(); box.hidden = false; draw(); }
  function hide() { shown = false; if (box) box.hidden = true; draw(); }

  // The page's one call: start(adapter) on the Phone remote button; start(adapter, true) on load, to take back a room this
  // tab held before a reload (nothing opens if it held none).
  // start(adapter, false, true): the same room, opened as a watch party (its panel tells another TV how to join).
  function start(adapter, resume, party) {
    ad = adapter; build();
    if (party || (kept() && kept().party)) partyMode = true;
    if (!timers.length) {
      timers.push(setInterval(() => tick(false), POLL_MS), setInterval(listTick, LIST_MS), setInterval(() => tick(true), ALIVE_MS), setInterval(quizTick, 400), setInterval(() => { if (shown) place(); }, 1000));
      addEventListener('pagehide', () => { if (ws) ws.close(); });   // a reload: the room waits 45 s for the next load
    }
    if (!resume) show();
    return open(!!resume).then((r) => { draw(); if (resume && room && !seats.size) hide(); return room; })
      .catch((e) => { show(); box.querySelector('#vrm-err').textContent = e.message; return null; });
  }

  // The hand-over: one phone is told the room code of the area's own phone page (V.handMsg); it goes there through /join.
  const hand = (seat, code, what) => { const msg = V.handMsg(code, what); if (msg && seats.has(seat) && !tvs.has(seat)) { send(seat, msg); return true; } return false; };
  // The screen goes where the remote cannot follow (another address): the phones are told where, then the room ends.
  function away(name) { if (ws && ws.readyState === 1) for (const s of phoneSeats()) send(s, V.awayMsg(name)); end(); }
  // An area from the shared menu (assets/brand/areas/areas.js), on the big screen. Only an area that is open, from this page's own
  // copy of the list: the phone sends an id, never an address. here(area): the page goes there itself (true), as voidtv.net does
  // for On Demand and Live TV. An area on voidtv.net is the same tab on the same site, so the room is kept and the next page takes it
  // back (remote/src/follow.js); one on its own address (University, Kids, Hindi, lexROM) cannot take it, so the remote ends there.
  function area(id, here) {
    const A = root.VoidAreas && root.VoidAreas.areas ? root.VoidAreas.areas.find((x) => x.id === id && x.live) : null;
    if (!A || (here && here(A))) return;
    if (A.site === 'main' && A.path) { location.assign(A.path); return; }
    if (A.url && /^https:\/\//.test(A.url)) { away(A.name); location.assign(A.url); }
  }
  // The areas as the phone's Areas list: every open one, this one marked.
  const areaList = (hereId) => {
    const L = root.VoidAreas && root.VoidAreas.areas ? root.VoidAreas.areas.filter((x) => x.live) : [];
    return L.length ? [{ id: 'areas', title: 'Areas', a: 'area', on: hereId || '', items: L.map((x) => ({ id: x.id, t: x.name, s: x.line })) }] : [];
  };

  root.RemoteScreen = { start, end, show, hide, hand, away, area, areaList, get room() { return room; }, get phones() { return phoneSeats().length; }, get tvs() { return tvs.size; },
    get party() { return partyMode || tvs.size > 0; }, changed: () => { tick(false); listTick(); },
    // For the TV's trivia card: how many phones answered the open question, and how many got it right; the party's score list.
    quizCount: (z) => (z && phoneSeats().length ? V.quizCount(book, phoneSeats(), z) : null),
    scores: () => scores() };
})(typeof self !== 'undefined' ? self : this);
