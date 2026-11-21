// VoidTV phone remote: the phone's side (remote/index.html). Licence: GPL-2.0-or-later.
// It joins the room by its code, draws what the screen says (remote/src/remote.js has the messages) and sends back actions by
// name. Saved shows live in this phone's own storage and go nowhere. A dropped connection (the phone slept, the Wi-Fi
// changed) joins again with the same seat token, so the phone keeps its seat.
(function () {
  'use strict';
  const V = window.VoidRemote;
  const $ = (id) => document.getElementById(id);
  const code = (new URLSearchParams(location.search).get('r') || '').trim().toUpperCase();
  const SAVE_KEY = 'voidtv-remote-saved';
  let sock = null, ended = false, tries = 0, site = null, now = null, nowAt = 0, list = null, info = null, wantSave = '', drawnActs = '';
  const parts = {};
  let saved = V.savedRead((() => { try { return localStorage.getItem(SAVE_KEY); } catch (e) { return '[]'; } })());
  const store = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(saved)); } catch (e) { /* private mode: this visit only */ } };

  function token() {
    let t = ''; try { t = sessionStorage.getItem('voidtv-remote-seat') || ''; } catch (e) { /* memory only */ }
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(t)) {
      const a = new Uint8Array(18); crypto.getRandomValues(a);
      t = btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      try { sessionStorage.setItem('voidtv-remote-seat', t); } catch (e) { /* fine */ }
    }
    return t;
  }
  const say = (m) => { if (sock && sock.readyState === 1) sock.send(JSON.stringify(m)); };
  const act = (a, more) => say(Object.assign({ type: 'r-do', a }, more || {}));
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const status = (t) => { $('status').textContent = t; };
  function note(h, p) { $('note-h').textContent = h; $('note-p').textContent = p; $('note').classList.add('on'); $('app').hidden = true; status(''); }

  // What is on now, with the buttons the screen says make sense.
  function drawNow() {
    if (!now) return;
    $('n-where').textContent = now.where; $('n-t').textContent = now.t; $('n-s').textContent = now.s; $('n-nx').textContent = now.nx;
    const art = $('n-art'); if (now.art) { if (art.getAttribute('src') !== now.art) art.src = now.art; art.hidden = false; } else art.hidden = true;
    tickLeft();
    // The buttons are drawn again only when they change, so a thumb on one is never lifted off a button that was replaced.
    const key = JSON.stringify([now.acts, now.slug, V.savedHas(saved, now.slug)]);
    if (key === drawnActs) return;
    drawnActs = key;
    const box = $('n-acts'); box.textContent = '';
    let ch = false;
    for (const x of now.acts) {
      if (x.a === 'ch') { ch = true; continue; }
      const b = el('button', '', x.l); b.type = 'button';
      b.onclick = () => (x.a === 'info' ? ask(now.slug) : act(x.a));
      box.appendChild(b);
    }
    if (now.slug) {
      const on = V.savedHas(saved, now.slug);
      const b = el('button', on ? 'saved-on' : '', on ? 'Saved on this phone' : 'Save to phone'); b.type = 'button';
      b.onclick = () => { if (V.savedHas(saved, now.slug)) { tab('s'); return; } save(now.slug); };
      box.appendChild(b);
    }
    $('ch').hidden = !ch;
  }
  function tickLeft() {
    if (!now || now.left == null) { $('n-left').textContent = ''; return; }
    const sec = now.left - (Date.now() - nowAt) / 1000;
    $('n-left').textContent = now.k === 'tv' && /^Up next|^A short/.test(now.t) ? 'Starts in ' + V.leftWords(sec).replace(/ left$/, '') : V.leftWords(sec);
  }
  function ask(slug) { if (slug) act('info', { slug }); }
  function save(slug) {
    if (info && info.slug === slug) { saved = V.savedAdd(saved, { slug, t: info.t, s: info.sub, url: info.url }, Date.now()); store(); drawNow(); drawSaved(); return; }
    wantSave = slug; ask(slug);   // the details come first, so the saved show has its own name and address
  }
  function drawInfo() {
    const box = $('info'); box.textContent = '';
    if (!info) { box.hidden = true; return; }
    box.appendChild(el('div', 't', info.t)); box.appendChild(el('div', 's', info.sub));
    if (info.ppl) box.appendChild(el('p', 'ppl', 'With ' + info.ppl));
    if (info.about) box.appendChild(el('p', '', info.about));
    const acts = el('div', 'acts');
    if (info.url) { const a = el('a', 'btn', 'Open on this phone'); a.href = info.url; acts.appendChild(a); }
    const on = V.savedHas(saved, info.slug);
    const b = el('button', on ? 'saved-on' : '', on ? 'Saved on this phone' : 'Save to phone'); b.type = 'button';
    b.onclick = () => { if (!V.savedHas(saved, info.slug)) save(info.slug); else tab('s'); drawInfo(); };
    acts.appendChild(b);
    const x = el('button', '', 'Close'); x.type = 'button'; x.onclick = () => { info = null; drawInfo(); }; acts.appendChild(x);
    box.appendChild(acts); box.hidden = false;
  }
  function drawList() {
    if (!list) return;
    $('list-box').hidden = false; $('list-h').textContent = list.title;
    const q = $('find').value.trim().toLowerCase(), ul = $('list');
    ul.textContent = '';
    for (const it of list.items) {
      if (q && !(it.t + ' ' + it.s).toLowerCase().includes(q)) continue;
      const li = el('li'), b = el('button', 'row' + (it.id === list.on ? ' on' : '')); b.type = 'button';
      b.appendChild(el('b', '', it.t)); b.appendChild(el('small', '', it.s));
      b.onclick = () => act('tune', { id: it.id });
      li.appendChild(b); ul.appendChild(li);
    }
  }
  // Saved on this phone: open it here, put it on the big screen, or let it go.
  function drawSaved() {
    const box = $('saved'); box.textContent = '';
    $('tab-s').textContent = 'Saved' + (saved.length ? ' (' + saved.length + ')' : '');
    if (!saved.length) box.appendChild(el('p', 'empty', 'Shows you save stay here, on this phone only. No account.'));
    for (const it of saved) {
      const c = el('div', 'card sv'); c.appendChild(el('div', 't', it.t)); if (it.s) c.appendChild(el('div', 's', it.s));
      const acts = el('div', 'acts');
      if (it.url) { const a = el('a', 'btn', 'Open on this phone'); a.href = it.url; acts.appendChild(a); }
      const g = el('button', '', 'Big screen'); g.type = 'button'; g.onclick = () => { act('go', { slug: it.slug }); tab('r'); }; acts.appendChild(g);
      const d = el('button', '', 'Remove'); d.type = 'button'; d.onclick = () => { saved = V.savedDrop(saved, it.slug); store(); drawSaved(); drawNow(); }; acts.appendChild(d);
      c.appendChild(acts); box.appendChild(c);
    }
    // The one ask, where the service is delivered; never on Kids (its donation sits behind the grown-up check).
    const give = $('give');
    if (site && site.donate && !site.kids) {
      give.textContent = 'If you found this service helpful, please think of donating to keep it running and to make more services like this possible. Every donation goes to CASH (cashvalues.org) and feeds its mission in the real world. ';
      const a = el('a', '', 'Donate to CASH'); a.href = site.donate; a.target = '_blank'; a.rel = 'noopener'; give.appendChild(a);
      give.hidden = false;
    } else give.hidden = true;
  }
  function tab(w) {
    $('tab-r').setAttribute('aria-selected', String(w === 'r')); $('tab-s').setAttribute('aria-selected', String(w === 's'));
    $('v-r').hidden = w !== 'r'; $('v-s').hidden = w !== 's';
  }

  function onMsg(m) {
    if (m.type === 'hello') { tries = 0; $('note').classList.remove('on'); $('app').hidden = false; status('Room ' + code); say({ type: 'r-hi' }); return; }
    if (m.type === 'host-away') { status('The big screen is reloading'); return; }
    if (m.type === 'host-back') { status('Room ' + code); say({ type: 'r-hi' }); return; }
    if (m.type === 'host-gone') { ended = true; note('The big screen ended the remote', 'Press Phone remote on the big screen for a new code.'); return; }
    if (m.type === 'r-site') { site = m; $('mark').href = m.home || '/'; document.title = 'Remote | ' + (m.name || 'voidtv.net'); drawSaved(); return; }
    if (m.type === 'r-now') { now = m; nowAt = Date.now(); drawNow(); return; }
    if (m.type === 'r-list') { const l = V.listTake(parts, m); if (l) { list = l; drawList(); } return; }
    if (m.type === 'r-info') {
      info = m;
      if (wantSave === m.slug) { wantSave = ''; saved = V.savedAdd(saved, { slug: m.slug, t: m.t, s: m.sub, url: m.url }, Date.now()); store(); drawSaved(); drawNow(); }
      drawInfo(); return;
    }
    // t- messages are Trivia's (trivia/src/live.js), drawn here once the Live TV trivia slice lands.
  }
  function join() {
    if (!/^[2-9A-Z]{4}$/.test(code)) { note('No room code', 'Scan the code on the big screen, or type it.'); return; }
    status(tries ? 'Joining again' : 'Connecting');
    const s = sock = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/room/' + code + '/join?t=' + token());
    s.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch (x) { return; } onMsg(m); };
    s.onclose = (e) => {
      if (sock !== s) return;
      sock = null;
      if (ended) return;
      if (e.code === 4404) { note('No room with that code', 'The code changes each time. Check the big screen.'); return; }
      if (e.code === 4409) { note('This remote is full', 'Up to 16 phones can join one big screen.'); return; }
      if (e.code === 4423) { note('This room is locked', 'The big screen is not letting new phones in right now.'); return; }
      if (e.code === 4403) { note('The big screen removed this phone', 'Scan the code again to come back.'); return; }
      if (e.code === 4410 || e.code === 4408) { note('The big screen ended the remote', 'Press Phone remote on the big screen for a new code.'); return; }
      if (tries++ < 8) { status('Connection lost, joining again'); setTimeout(join, Math.min(8000, 800 * tries)); }
      else note('Lost the big screen', 'Check the Wi-Fi, then scan the code again.');
    };
  }

  $('tab-r').onclick = () => tab('r'); $('tab-s').onclick = () => tab('s');
  $('ch-up').onclick = () => act('ch', { dir: 1 }); $('ch-down').onclick = () => act('ch', { dir: -1 });
  $('find').oninput = drawList;
  // A phone that wakes up asks again (it may have slept through a channel change); a dead socket closes and joins again.
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { if (sock && sock.readyState === 1) say({ type: 'r-hi' }); else if (!sock && !ended) { tries = 0; join(); } } });
  setInterval(tickLeft, 15000);
  drawSaved(); join();
})();
