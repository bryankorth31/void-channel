// VoidTV watch party: a TV that joins another TV's party. Licence: GPL-2.0-or-later.
// Bryan, 20 Nov 2026: "my parents live in central tz and i eastern. i want to be able to interact with them and or my son in
// central timezone using the qr code system and trivia"; "we do this as an overlay that is selected prior to watching live
// tv. then the party that initiated gets their live tv to be the dominant and then when the others go they are on that one".
//
// The first TV opens the party (the phone remote's room, remote/src/screen.js, as a watch party). Another TV presses Watch
// party and types the code: it joins that room as a member, plays Live TV in the first TV's time zone and on its channel,
// and follows each channel change; its own channel buttons wait. Phones in its home scan the code it shows (which says this
// TV is their home) and play in the same game, on the same score list. Leaving gives this TV back its own zone and channel.
// The site's adapter does the Live TV part (remote/src/voidtv.js: partyApply, partyLeave, popShow).
(function (root) {
  'use strict';
  if (typeof document === 'undefined' || !root.VoidRemote) return;
  const V = root.VoidRemote;
  const KEEP = 'voidtv-party', SEAT = 'voidtv-party-seat';
  const myZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; } };
  const store = (k, v) => { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { /* this page only */ } };
  const read = (k) => { try { return sessionStorage.getItem(k) || ''; } catch (e) { return ''; } };
  function token() {
    let t = read(SEAT);
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(t)) {
      const a = new Uint8Array(18); crypto.getRandomValues(a);
      t = btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      store(SEAT, t);
    }
    return t;
  }

  let ad = null, ws = null, code = '', seat = 0, on = false, left = true, tries = 0;
  let host = null, skew = 0, quiz = null, scores = [], note = '';
  const say = (m) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };

  function join(c, adapter) {
    if (adapter) ad = adapter;
    const k = (c || '').trim().toUpperCase();
    if (!/^[2-9A-Z]{4}$/.test(k)) return Promise.reject(new Error('A party code is four letters and numbers, like KX7P.'));
    if (root.RemoteScreen && root.RemoteScreen.room) return Promise.reject(new Error('This TV has its own party or remote open. End it first.'));
    code = k; left = false; tries = 0;
    return connect();
  }
  function connect() {
    return new Promise((ok, no) => {
      const sock = ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/room/' + code + '/join?t=' + token());
      let had = false;
      sock.onmessage = (e) => {
        let m; try { m = JSON.parse(e.data); } catch (x) { return; }
        if (m.type === 'hello') { had = true; tries = 0; seat = m.seat; on = true; note = ''; store(KEEP, code); say({ type: 'p-hi', zone: myZone() }); draw(); ok(); return; }
        if (m.type === 'host-away') { note = 'The party’s first TV is reloading'; draw(); return; }
        if (m.type === 'host-back') { note = ''; say({ type: 'p-hi', zone: myZone() }); draw(); return; }
        if (m.type === 'host-gone') { leave('The party ended.'); return; }
        if (m.type === 'p-tv') { host = m; skew = Number.isFinite(m.t) ? m.t - Date.now() : 0; try { ad.partyApply(m); } catch (x) { /* the page is changing */ } draw(); return; }
        if (m.type === 'p-quiz') { quiz = m.n == null ? null : m; try { ad.popShow(quiz); } catch (x) { /* fine */ } return; }
        if (m.type === 'p-score') { scores = Array.isArray(m.list) ? m.list : []; }
      };
      sock.onclose = (e) => {
        if (ws !== sock) return;
        ws = null;
        if (left) return;
        const why = { 4404: 'No party with that code. Check the first TV: the code changes each time.', 4409: 'This party is full.', 4423: 'The party is locked.', 4403: 'The party’s first TV removed this TV.', 4410: 'The party ended.', 4408: 'The party ended.' }[e.code];
        if (why) { if (!had && !on) { left = true; no(new Error(why)); } else leave(why); return; }
        if (!had && !on) { left = true; no(new Error('The party did not answer. Check the connection and try again.')); return; }
        if (tries++ < 8) { note = 'Connection lost, joining again'; draw(); setTimeout(() => { if (!left && !ws) connect().catch(() => {}); }, Math.min(8000, 800 * tries)); }
        else leave('Lost the party. Join again with the code.');
      };
    });
  }
  // Leave: this TV gets its own time zone and channel back.
  function leave(why) {
    left = true; const was = on; on = false; store(KEEP, null);
    if (ws) { const s = ws; ws = null; try { s.close(); } catch (e) { /* gone */ } }
    host = null; quiz = null; scores = [];
    if (was) { try { ad.popShow(null); ad.partyLeave(); } catch (e) { /* fine */ } }
    note = why || ''; draw();
  }

  // Is this channel change one to hold? In a party the first TV picks the channel (the follow itself passes, while following).
  let following = false;
  function holds(id) {
    if (!on || following || !host || !host.chan || id === host.chan) return false;
    note = 'In a watch party the first TV picks the channel.'; draw();
    setTimeout(() => { if (note.startsWith('In a watch party')) { note = ''; draw(); } }, 4000);
    return true;
  }
  function follow(fn) { following = true; try { fn(); } finally { following = false; } }

  // ---- What shows on this TV: a small chip, and a panel with the code for this home's phones ----
  const CSS = '.vwp-chip{position:fixed;left:16px;bottom:16px;z-index:9000;background:#0d0f16;color:#e8e8ee;border:1px solid #5fd4ff;border-radius:999px;padding:8px 14px;font:600 13px system-ui,sans-serif;cursor:pointer;max-width:calc(100vw - 32px)}'
    + '.vwp-chip[hidden],.vwp[hidden]{display:none}'
    + '.vwp{position:fixed;left:16px;bottom:16px;z-index:9001;width:min(320px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;background:#0d0f16;color:#e8e8ee;border:1px solid #2a2f40;border-radius:16px;padding:16px;font:15px system-ui,Segoe UI,Roboto,sans-serif;box-shadow:0 10px 40px rgba(0,0,0,.6);text-align:center}'
    + '.vwp h3{margin:0 0 8px;font-size:17px}.vwp p{margin:6px 0;color:#a3a8bb;font-size:13px;line-height:1.4}.vwp b{color:#e8e8ee}'
    + '.vwp-qr{background:#fff;border-radius:10px;padding:8px;width:170px;height:170px;margin:6px auto}.vwp-qr svg{width:100%;height:100%;display:block}'
    + '.vwp-code{font:700 30px/1.1 ui-monospace,Consolas,monospace;letter-spacing:.18em;color:#5fd4ff;margin:4px 0}'
    + '.vwp input{width:7ch;font:700 26px/1 ui-monospace,Consolas,monospace;letter-spacing:.18em;text-transform:uppercase;text-align:center;background:#07080c;color:#e8e8ee;border:1px solid #2a2f40;border-radius:10px;padding:8px}'
    + '.vwp-row{display:flex;gap:8px;justify-content:center;align-items:center;margin-top:10px;flex-wrap:wrap}'
    + '.vwp button{font:inherit;font-size:14px;background:#161a25;color:#e8e8ee;border:1px solid #2a2f40;border-radius:10px;padding:8px 14px;cursor:pointer;min-height:40px}'
    + '.vwp button.go{background:#5fd4ff;border-color:#5fd4ff;color:#07080c;font-weight:700}.vwp button:hover{border-color:#5fd4ff}.vwp-why{color:#f3c969!important;min-height:1em}'
    + '.vwp hr{border:0;border-top:1px solid #1d2130;margin:12px 0}';
  let chip = null, box = null, open = false;
  function build() {
    if (chip) return;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    chip = document.createElement('button'); chip.type = 'button'; chip.className = 'vwp-chip'; chip.hidden = true; chip.onclick = () => { open = true; draw(); };
    box = document.createElement('div'); box.className = 'vwp'; box.hidden = true; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Watch party');
    document.body.appendChild(chip); document.body.appendChild(box);
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) { e.stopPropagation(); open = false; draw(); } }, true);
  }
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const btn = (text, fn, cls) => { const b = el('button', cls || '', text); b.type = 'button'; b.onclick = fn; return b; };
  function draw() {
    if (!chip) return;
    const city = host ? V.zoneCity(host.zone) : '';
    chip.textContent = !on ? '' : note || ('Watch party ' + code + (city ? ' · ' + city + ' time' : '') + (host && host.tvs ? ' · ' + host.tvs + ' TVs' : ''));
    chip.hidden = !on || open;
    box.hidden = !open;
    if (!open) return;
    box.textContent = '';
    if (on) {
      // This home's phones: the same party, and the code says this TV is their home (for the score list).
      box.appendChild(el('h3', '', 'Watch party ' + code));
      box.appendChild(el('p', '', 'Playing the first TV’s channel' + (city ? ', on ' + city + ' time' : '') + '. It picks the channel; this TV follows.'));
      const url = location.origin + '/remote/?r=' + code + '&h=' + seat;
      const qr = el('div', 'vwp-qr'); if (root.PlayQR) qr.innerHTML = root.PlayQR.svg(url, 5); box.appendChild(qr);
      box.appendChild(el('p', '', 'Phones in this home: scan this to play along.'));
      if (Math.abs(skew) > 5000) box.appendChild(el('p', 'vwp-why', 'This TV’s clock is ' + Math.round(Math.abs(skew) / 1000) + ' s ' + (skew > 0 ? 'behind' : 'ahead of') + ' the first TV’s, so the shows may not line up. Setting the clock to automatic fixes it.'));
      box.appendChild(el('p', 'vwp-why', note));
      const row = el('div', 'vwp-row'); row.appendChild(btn('Hide', () => { open = false; draw(); })); row.appendChild(btn('Leave the party', () => { open = false; leave(''); })); box.appendChild(row);
      return;
    }
    // Not in a party: start one here, or join another TV's.
    box.appendChild(el('h3', '', 'Watch party'));
    box.appendChild(el('p', '', 'Watch Live TV together from different homes, even in different time zones, and play along on your phones.'));
    box.appendChild(btn('Start a party on this TV', () => { open = false; draw(); if (root.RemoteScreen) root.RemoteScreen.start(ad, false, true); }, 'go'));
    box.appendChild(el('hr'));
    box.appendChild(el('p', '', 'Or join one: type the code on the other TV.'));
    const row = el('div', 'vwp-row'), input = el('input'); input.maxLength = 4; input.setAttribute('aria-label', 'Party code'); input.autocomplete = 'off';
    const why = el('p', 'vwp-why', note);
    const go = () => { why.textContent = 'Joining'; join(input.value, ad).then(() => { open = false; draw(); }).catch((e) => { why.textContent = e.message; }); };
    input.onkeydown = (e) => { if (e.key === 'Enter') go(); };
    row.appendChild(input); row.appendChild(btn('Join', go, 'go')); box.appendChild(row); box.appendChild(why);
    box.appendChild(el('div', 'vwp-row')).appendChild(btn('Close', () => { open = false; draw(); }));
    setTimeout(() => input.focus(), 0);
  }

  // The page's calls: chooser(adapter) on the Watch party button; rejoin(adapter) on load, back into a party this tab was in.
  function chooser(adapter) {
    ad = adapter; build();
    if (!on && root.RemoteScreen && root.RemoteScreen.room) { root.RemoteScreen.start(ad, false, true); return; }   // this TV leads one already
    open = true; draw();
  }
  // The icon is drawn again each second from the first TV's last word, so a page that was still loading when it came, or a
  // channel page drawn anew, shows it too.
  setInterval(() => { if (on && ad) { try { ad.popShow(quiz); } catch (e) { /* the page is changing */ } } }, 1000);
  function rejoin(adapter) { ad = adapter; build(); const k = read(KEEP); return k ? join(k, adapter).catch(() => { store(KEEP, null); }) : Promise.resolve(); }

  root.PartyGuest = { chooser, rejoin, join, leave, holds, follow,
    get on() { return on; }, get host() { return host; }, get skew() { return skew; }, get seat() { return seat; }, get code() { return code; },
    // The same calls the first TV's RemoteScreen gives the page's trivia card, from what the first TV says.
    quizCount: (z) => (quiz && z && quiz.n === z.n && quiz.phones ? { phones: quiz.phones, answered: quiz.answered, right: quiz.right } : null),
    scores: () => scores };
})(typeof self !== 'undefined' ? self : this);
