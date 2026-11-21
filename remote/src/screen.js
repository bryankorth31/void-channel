// VoidTV phone remote: the big screen's side, the same for every VoidTV site. Licence: GPL-2.0-or-later.
// The screen opens a room of kind "remote" on the rooms relay (play/rooms/, /api/room/*), shows its code and QR, and answers the
// phones that join it through a site adapter (remote/src/voidtv.js on voidtv.net). The adapter gives:
//   site()      { name, home, donate, kids }                  who this screen is
//   now()       { k, where, t, s, nx, left, slug, art, acts }   what is on now (VoidRemote.nowMsg)
//   lists()     [{ id, title, items: [{ id, t, s }], on }]      lists to pick from (every channel and what is on it)
//   info(slug)  { slug, t, sub, ppl, about, url } or null       a show's details
//   act(cmd)    runs one checked action (VoidRemote.readDo)
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
  let lastNow = '', lastList = '', listVer = 0, timers = [];
  const send = (to, msg) => { if (ws && ws.readyState === 1 && V.fits(msg)) ws.send(JSON.stringify({ to, msg })); };

  // Everything a phone needs, to one phone (a join, a phone back, a phone asking again) or to all.
  function all(to) {
    send(to, V.siteMsg(ad.site()));
    const n = V.nowMsg(ad.now()); send(to, n); if (to === 'all') lastNow = sameKey(n);
    for (const l of ad.lists()) for (const m of V.listMsgs(l.id, l.title, l.items, l.on, listVer)) send(to, m);
  }
  // The time left is counted down on the phone, so it alone is no reason to send again (it changes every second; sending it
  // each poll made the phone redraw its buttons under a thumb). Anything else that changes goes at once.
  const sameKey = (n) => JSON.stringify(Object.assign({}, n, { left: null }));
  function tick(force) {
    if (!seats.size || !ad) return;
    const n = V.nowMsg(ad.now()), j = sameKey(n);
    if (force || j !== lastNow) { lastNow = j; send('all', n); }
  }
  function listTick() {
    if (!seats.size || !ad) return;
    const ls = ad.lists(), j = JSON.stringify(ls.map((l) => [l.id, l.on, l.items]));
    if (j === lastList) return;
    lastList = j; listVer = (listVer + 1) % 1e6;
    for (const l of ls) for (const m of V.listMsgs(l.id, l.title, l.items, l.on, listVer)) send('all', m);
  }

  function onMessage(e) {
    let m; try { m = JSON.parse(e.data); } catch (x) { return; }
    if (m.type === 'room') { room = { code: m.code, join: m.join }; retry = 0; if (m.key) keep({ code: m.code, key: m.key }); draw(); return; }
    if (m.type === 'join') { seats.add(m.from); all(m.from); draw(); return; }
    if (m.type === 'leave') { seats.delete(m.from); draw(); return; }
    const msg = m.msg || {};
    if (!seats.has(m.from)) return;
    if (msg.type === 'r-hi') { all(m.from); return; }
    const cmd = V.readDo(msg);
    if (!cmd) return;
    if (cmd.a === 'info') { const i = ad.info(cmd.slug); if (i) send(m.from, V.infoMsg(i)); return; }
    try { ad.act(cmd); } catch (x) { /* a page that cannot do it now: the phone sees nothing change */ }
    setTimeout(() => { tick(); listTick(); }, 250);   // the page has changed channel: say so at once, not at the next poll
  }

  function connect(k) {
    return new Promise((ok, no) => {
      const q = k ? '&code=' + k.code + '&key=' + encodeURIComponent(k.key) : '';
      const sock = ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/room/open?kind=remote' + q);
      let had = false;
      sock.onmessage = (e) => { if (!had) { had = true; ok(); } onMessage(e); };
      sock.onclose = (e) => {
        if (ws !== sock) return;
        ws = null; const was = room; room = null; seats.clear(); draw();
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
  function end() { ended = true; keep(null); if (ws && ws.readyState === 1) ws.send(JSON.stringify({ relay: 'end' })); if (ws) ws.close(); ws = null; room = null; seats.clear(); hide(); }

  // The panel: the code, the QR, how many phones. Small, in a corner, out of the picture's way once a phone is in.
  const CSS = '.vrm{position:fixed;right:16px;bottom:16px;z-index:9000;width:min(300px,calc(100vw - 32px));background:#0d0f16;color:#e8e8ee;border:1px solid #2a2f40;border-radius:16px;padding:16px;font:15px system-ui,Segoe UI,Roboto,sans-serif;box-shadow:0 10px 40px rgba(0,0,0,.6);text-align:center}'
    + '.vrm[hidden]{display:none}.vrm h3{margin:0 0 8px;font-size:17px}.vrm p{margin:6px 0;color:#a3a8bb;font-size:13px;line-height:1.4}.vrm b{color:#e8e8ee}'
    + '.vrm-qr{background:#fff;border-radius:10px;padding:8px;width:180px;height:180px;margin:6px auto}.vrm-qr svg{width:100%;height:100%;display:block}'
    + '.vrm-code{font:700 34px/1.1 ui-monospace,Consolas,monospace;letter-spacing:.18em;color:#5fd4ff;margin:4px 0}'
    + '.vrm-n{color:#ff4fc8!important;font-weight:600}.vrm-row{display:flex;gap:8px;justify-content:center;margin-top:10px}'
    + '.vrm button{font:inherit;font-size:14px;background:#161a25;color:#e8e8ee;border:1px solid #2a2f40;border-radius:10px;padding:8px 14px;cursor:pointer;min-height:40px}'
    + '.vrm button:hover{border-color:#5fd4ff}.vrm-err{color:#f3c969!important}'
    + '.vrm-chip{position:fixed;right:16px;bottom:16px;z-index:9000;background:#0d0f16;color:#e8e8ee;border:1px solid #ff4fc8;border-radius:999px;padding:8px 14px;font:600 13px system-ui,sans-serif;cursor:pointer}.vrm-chip[hidden]{display:none}';
  let box = null, chip = null, shown = false;
  function build() {
    if (box) return;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    box = document.createElement('div'); box.className = 'vrm'; box.hidden = true; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Phone remote');
    box.innerHTML = '<h3>Phone remote</h3><div class="vrm-qr" id="vrm-qr"></div><p>Scan with your phone’s camera, or go to <b id="vrm-site"></b> and type</p>'
      + '<div class="vrm-code" id="vrm-code">....</div><p class="vrm-n" id="vrm-n"></p><p class="vrm-err" id="vrm-err" role="status"></p>'
      + '<div class="vrm-row"><button type="button" id="vrm-hide">Hide</button><button type="button" id="vrm-end">End remote</button></div>';
    chip = document.createElement('button'); chip.type = 'button'; chip.className = 'vrm-chip'; chip.hidden = true; chip.onclick = () => show();
    document.body.appendChild(box); document.body.appendChild(chip);
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
    const n = seats.size;
    $('vrm-n').textContent = !room ? '' : n ? n + ' phone' + (n === 1 ? '' : 's') + ' connected' : 'No phone yet';
    chip.textContent = 'Phone remote' + (n ? ': ' + n + ' phone' + (n === 1 ? '' : 's') : '');
    chip.hidden = shown || !room;
  }
  function show() { build(); shown = true; box.hidden = false; draw(); }
  function hide() { shown = false; if (box) box.hidden = true; draw(); }

  // The page's one call: start(adapter) on the Phone remote button; start(adapter, true) on load, to take back a room this
  // tab held before a reload (nothing opens if it held none).
  function start(adapter, resume) {
    ad = adapter; build();
    if (!timers.length) {
      timers.push(setInterval(() => tick(false), POLL_MS), setInterval(listTick, LIST_MS), setInterval(() => tick(true), ALIVE_MS));
      addEventListener('pagehide', () => { if (ws) ws.close(); });   // a reload: the room waits 45 s for the next load
    }
    if (!resume) show();
    return open(!!resume).then((r) => { draw(); if (resume && room && !seats.size) hide(); return room; })
      .catch((e) => { show(); box.querySelector('#vrm-err').textContent = e.message; return null; });
  }

  root.RemoteScreen = { start, end, show, hide, get room() { return room; }, get phones() { return seats.size; }, changed: () => tick(false) };
})(typeof self !== 'undefined' ? self : this);
