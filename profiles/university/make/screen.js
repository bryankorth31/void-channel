// Make questions with a phone: the big screen's side. Preview only (serve.js serves it; the public copy never loads it).
// A lecture unit gets a button. Pressing it opens a lesson room on the phone relay and shows a QR code. The phone
// that scans it becomes the note pad: it marks a moment, this page reads the lecture's time, asks the preview server
// for the words said there, and passes them to the phone a line at a time (the relay carries 1,024 characters a
// message). The question written on the phone comes back the same way, and this page hands it to the server, which
// checks it against the lecture and writes it into the unit.
(function () {
  'use strict';
  if (typeof SLUG !== 'string' || !window.WebSocket) return;
  var info = null, open = null;
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var clock = function (t) { return Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0'); };

  var css = document.createElement('style');
  css.textContent = '.makebar{margin:12px 0}.makebtn,.makepanel button{font:inherit;font-size:14px;padding:8px 16px;border-radius:999px;border:1px solid var(--line);background:var(--panel2);color:var(--fg);cursor:pointer}'
    + '.makebtn:hover,.makepanel button:hover{border-color:var(--gold)}'
    + '.makepanel{display:flex;flex-wrap:wrap;gap:18px;align-items:flex-start;margin-top:12px;padding:16px;border:1px solid var(--line);border-radius:12px;background:var(--panel2)}'
    + '.makeqr{background:#fff;border-radius:8px;padding:6px;line-height:0;flex:0 0 auto}.makeqr svg{width:190px;height:190px;display:block}'
    + '.makeside{flex:1 1 260px;min-width:0;font-size:15px}.makeside p{margin:0 0 8px}.makestate{font-weight:600}.makeaddr{color:var(--dim);font-size:14px;overflow-wrap:anywhere}.makeaddr b{color:var(--fg);letter-spacing:.08em}'
    + '.makelist{margin:8px 0;padding-left:22px}.makelist li{margin:0 0 4px}.makelist i{font-style:normal;color:var(--gold);margin-right:8px}.makerow{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}';
  document.head.appendChild(css);
  var take = document.createElement('script'); take.src = '/make/answer-screen.js'; document.head.appendChild(take);

  fetch('/api/make/info?slug=' + encodeURIComponent(SLUG)).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
    if (!j) return;
    info = j;
    j.units.forEach(function (n) { var bar = document.querySelector('#u' + n + ' .makebar'); if (bar) bar.hidden = false; });
  }).catch(function () {});

  document.addEventListener('click', function (e) {
    var b = e.target.closest('.makebtn');
    if (b) { if (open) close(false); start(b.closest('.unit')); }
  });

  function start(unit) {
    var bar = unit.querySelector('.makebar'), n = +unit.id.slice(1), video = unit.querySelector('video, audio');
    var s = { unit: unit, n: n, video: video, fields: {}, made: 0, which: 0, code: '', ws: null, panel: document.createElement('div') };
    open = s;
    bar.querySelector('.makebtn').hidden = true;
    s.panel.className = 'makepanel';
    s.panel.innerHTML = '<div class="makeqr" aria-hidden="true"></div><div class="makeside"><p class="makestate" role="status">Opening a room for your phone.</p><p class="makeaddr"></p>'
      + '<ol class="makelist"></ol><div class="makerow">'
      + '<button type="button" class="makeother" hidden title="If the phone cannot open the page, this computer may have more than one address on your network. This shows the next one.">Phone cannot open it? Try another address</button>'
      + '<button type="button" class="makedone" title="Close the room. Questions you made are added to this page.">Done</button></div></div>';
    bar.appendChild(s.panel);
    s.panel.querySelector('.makedone').onclick = function () { close(true); };
    s.panel.querySelector('.makeother').onclick = function () { s.which++; paint(s); };
    var ws = s.ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/room/open?kind=lesson');
    ws.onmessage = function (ev) { var m; try { m = JSON.parse(ev.data); } catch (err) { return; } if (open === s) hear(s, m); };
    ws.onclose = function () { if (open === s) say(s, 'The room closed. Press Done, then Make questions again.'); };
  }

  function say(s, text) { s.panel.querySelector('.makestate').textContent = text; }
  function paint(s) {
    var list = (info && info.addresses) || [], host = list.length ? list[s.which % list.length] : '';
    var qr = s.panel.querySelector('.makeqr'), addr = s.panel.querySelector('.makeaddr');
    s.panel.querySelector('.makeother').hidden = list.length < 2;
    if (!host) { qr.hidden = true; addr.textContent = 'This computer has no address on a network, so a phone cannot reach it. Join the Wi-Fi and press Make questions again.'; return; }
    var base = 'http://' + host + ':' + location.port;
    qr.innerHTML = window.PlayQR.svg(base + '/join?r=' + s.code, 6);
    addr.innerHTML = 'Or type this in the phone\'s browser: ' + esc(base) + '/join and then the code <b>' + esc(s.code) + '</b>';
  }
  function tell(s, seat, msg) { if (s.ws.readyState === 1) s.ws.send(JSON.stringify({ to: seat, msg: msg })); }

  function hear(s, m) {
    if (m.type === 'room') { s.code = m.code; paint(s); say(s, 'Scan this with your phone\'s camera. The phone must be on the same Wi-Fi as this computer.'); return; }
    if (m.type === 'join') {
      say(s, 'Phone connected. Play the lecture, and tap Mark on the phone when something worth a question is said.');
      tell(s, m.from, { type: 'unit', title: (s.unit.querySelector('h2') || {}).textContent || '', course: typeof CNAME === 'string' ? CNAME : '', made: s.made, playing: !!(s.video && !s.video.paused) });
      return;
    }
    if (m.type === 'leave') { say(s, 'The phone left. Scan the code again to carry on.'); return; }
    if (!m.msg || typeof m.msg !== 'object') return;
    var seat = m.from, x = m.msg;
    if (x.type === 'mark') { var t = s.video ? s.video.currentTime : 0; if (s.video) s.video.pause(); lines(s, seat, t); say(s, 'Marked at ' + clock(t) + '. Write the question on the phone.'); return; }
    if (x.type === 'more' && typeof x.t === 'number' && isFinite(x.t)) { lines(s, seat, Math.max(0, x.t)); return; }
    if (x.type === 'field' && /^(q|why|c[0-3])$/.test(x.k)) { s.fields[seat] = s.fields[seat] || {}; s.fields[seat][x.k] = String(x.v == null ? '' : x.v).slice(0, 600); return; }
    if (x.type === 'toggle' && s.video) { if (s.video.paused) s.video.play().catch(function () {}); else s.video.pause(); tell(s, seat, { type: 'playing', on: !s.video.paused }); return; }
    if (x.type === 'cancel') { if (s.video) s.video.play().catch(function () {}); say(s, 'Phone connected. Tap Mark on the phone at the next good moment.'); tell(s, seat, { type: 'playing', on: true }); return; }
    if (x.type === 'save') { save(s, seat, x); return; }
  }

  function lines(s, seat, t) {
    fetch('/api/make/lines?slug=' + encodeURIComponent(SLUG) + '&n=' + s.n + '&t=' + t).then(function (r) { return r.json(); }).then(function (j) {
      if (j.error) { tell(s, seat, { type: 'error', text: j.error }); return; }
      var id = Date.now() % 1000000;
      tell(s, seat, { type: 'at', id: id, t: j.t, clock: clock(j.t) });
      j.lines.forEach(function (l) { tell(s, seat, { type: 'line', id: id, a: l.a, b: l.b, t: l.t, here: !!l.here, text: l.text.slice(0, 700) }); });
      tell(s, seat, { type: 'end', id: id, n: j.lines.length });
    }).catch(function () { tell(s, seat, { type: 'error', text: 'The computer could not read the lecture\'s words.' }); });
  }

  function save(s, seat, x) {
    var f = s.fields[seat] || {};
    var body = { slug: SLUG, n: s.n, q: f.q || '', choices: [f.c0 || '', f.c1 || '', f.c2 || '', f.c3 || ''], a: 0, why: f.why || '', from: x.from, to: x.to };
    fetch('/api/make/save', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(function (r) { return r.json(); }).then(function (j) {
      if (j.error || !j.item) { tell(s, seat, { type: 'saved', ok: false, text: j.error || 'It could not be saved.' }); return; }
      s.made++; s.fields[seat] = {};
      var li = document.createElement('li');
      li.innerHTML = '<i>' + clock(j.item.t) + '</i>' + esc(j.item.q);
      s.panel.querySelector('.makelist').appendChild(li);
      say(s, s.made + (s.made === 1 ? ' question' : ' questions') + ' made this sitting. ' + (j.where === 'draft' ? 'They are in this unit\'s draft.' : 'They are in this unit.'));
      tell(s, seat, { type: 'saved', ok: true, clock: clock(j.item.t), made: s.made, count: j.count });
      if (s.video) s.video.play().catch(function () {});
    }).catch(function () { tell(s, seat, { type: 'saved', ok: false, text: 'The computer did not answer. Try Save again.' }); });
  }

  // Done: the room ends; if questions were made, the page is built again and opens at this unit with them in Check yourself.
  function close(rebuild) {
    var s = open; if (!s) return;
    open = null;
    try { if (s.ws.readyState === 1) s.ws.send(JSON.stringify({ relay: 'end' })); s.ws.close(); } catch (e) {}
    var bar = s.unit.querySelector('.makebar');
    if (rebuild && s.made) {
      s.panel.querySelector('.makestate').textContent = 'Adding your questions to the page.';
      fetch('/api/make/rebuild', { method: 'POST' }).then(function () { location.hash = '#' + s.unit.id; location.reload(); }).catch(function () { location.reload(); });
      return;
    }
    s.panel.remove();
    bar.querySelector('.makebtn').hidden = false;
  }
})();
