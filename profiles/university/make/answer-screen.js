// Answer on your phones: the big screen's side of taking a lesson. Preview only (serve.js serves it, screen.js loads it).
// A lecture unit with timed questions gets a button. It opens a lesson room and shows a QR code; every phone that
// scans it is a seat (up to 40). As the lecture plays and reaches the end of the line a question quotes, the lecture
// stops and the question goes to the phones. A phone gets two tries (the same rule as Check yourself on the page);
// then it is told the answer, the reason and the lecture's own line. The lecture carries on when every phone has
// answered, or when Carry on is pressed. Nothing about a phone is kept or shown here but how many have answered.
(function () {
  'use strict';
  if (typeof SLUG !== 'string' || !window.WebSocket) return;
  var info = null, open = null;
  // On the live site the rooms are voidtv.net's (its door lets this site open lesson rooms and nothing else), a phone
  // joins at this site's own /join, and no server stands behind the page. In the preview everything is this computer.
  var LIVE_SITE = /(^|\.)voidtv\.net$/.test(location.hostname);
  var ROOMS = LIVE_SITE ? 'wss://voidtv.net' : (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
  var clock = function (t) { return Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0'); };
  var words = function (s) { return String(s).trim().split(/\s+/).filter(Boolean).length; };

  // The questions of a unit, read from the page itself (the same ones Check yourself shows).
  function questions(unit) {
    return [].map.call(unit.querySelectorAll('.quiz .qq'), function (qq) {
      var p = qq.querySelector('p').cloneNode(true), b = p.querySelector('b'); if (b) b.remove();
      var bq = qq.querySelector('blockquote').cloneNode(true), qt = bq.querySelector('.qt'); if (qt) qt.remove();
      var at = qq.querySelector('button.qt[data-t]'), ps = qq.querySelectorAll('.qa p');
      var quote = bq.textContent.trim().replace(/^"|"$/g, '');
      return { q: p.textContent.trim(), choices: [].map.call(qq.querySelectorAll('.qc button'), function (x) { return x.textContent; }), a: +qq.dataset.a,
        why: ps.length > 1 ? ps[1].textContent : '', quote: quote, t: at ? +at.dataset.t : null, e: at ? (at.dataset.e ? +at.dataset.e : +at.dataset.t + Math.round(words(quote) / 2.5) + 2) : null };
    }).filter(function (x) { return x.t !== null && x.choices.length === 4; });
  }

  // its own button class: the making script answers every .makebtn
  var css = document.createElement('style');
  css.textContent = '.askbar{margin:12px 0}.askbtn{font:inherit;font-size:14px;padding:8px 16px;border-radius:999px;border:1px solid var(--line);background:var(--panel2);color:var(--fg);cursor:pointer}.askbtn:hover{border-color:var(--gold)}'
    + '.askbar .makepanel{display:flex;flex-wrap:wrap;gap:18px;align-items:flex-start;margin-top:12px;padding:16px;border:1px solid var(--line);border-radius:12px;background:var(--panel2)}'
    + '.askbar .makepanel button{font:inherit;font-size:14px;padding:8px 16px;border-radius:999px;border:1px solid var(--line);background:var(--panel2);color:var(--fg);cursor:pointer}.askbar .makepanel button:hover{border-color:var(--gold)}'
    + '.askbar .makeqr{background:#fff;border-radius:8px;padding:6px;line-height:0;flex:0 0 auto}.askbar .makeqr svg{width:190px;height:190px;display:block}'
    + '.askbar .makeside{flex:1 1 260px;min-width:0;font-size:15px}.askbar .makeside p{margin:0 0 8px}.askbar .makestate{font-weight:600}.askbar .makeaddr{color:var(--dim);font-size:14px;overflow-wrap:anywhere}.askbar .makerow{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}';
  document.head.appendChild(css);

  function addButtons() {
    [].forEach.call(document.querySelectorAll('.unit'), function (unit) {
      if (!unit.querySelector('video, audio') || !questions(unit).length) return;
      var bar = document.createElement('div');
      bar.className = 'askbar';
      bar.innerHTML = '<button type="button" class="askbtn" title="Shows a QR code. Everyone scans it, then the questions for this lecture come to their phones as the lecture reaches them.">Answer on your phones</button>';
      var after = unit.querySelector('.makebar') || unit.querySelector('.pieces');
      if (!after) return;
      after.parentNode.insertBefore(bar, after.nextSibling);
    });
  }
  if (LIVE_SITE) addButtons();
  else fetch('/api/make/info?slug=' + encodeURIComponent(SLUG)).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { if (!j) return; info = j; addButtons(); }).catch(function () {});

  document.addEventListener('click', function (e) {
    var b = e.target.closest('.askbtn');
    if (!b || open) return;
    if (document.querySelector('.makepanel')) { b.title = 'Press Done on the open panel first.'; return; }
    start(b.closest('.unit'));
  });

  function start(unit) {
    var bar = unit.querySelector('.askbar'), n = +unit.id.slice(1), video = unit.querySelector('video, audio');
    var s = { unit: unit, n: n, video: video, qs: questions(unit), seats: {}, cur: -1, which: 0, code: '', ws: null, panel: document.createElement('div'), asked: {} };
    open = s;
    bar.querySelector('.askbtn').hidden = true;
    s.panel.className = 'makepanel';
    s.panel.innerHTML = '<div class="makeqr" aria-hidden="true"></div><div class="makeside"><p class="makestate" role="status">Opening a room for the phones.</p><p class="makeaddr"></p><div class="makerow">'
      + '<button type="button" class="askgo" hidden title="Stop waiting for the phones that have not answered and play the lecture on.">Carry on</button>'
      + '<button type="button" class="makeother" hidden title="If a phone cannot open the page, this computer may have more than one address on your network. This shows the next one.">Phone cannot open it? Try another address</button>'
      + '<button type="button" class="makedone" title="End the lesson. Each phone shows its own score.">Done</button></div></div>';
    bar.appendChild(s.panel);
    s.panel.querySelector('.makedone').onclick = close;
    s.panel.querySelector('.makeother').onclick = function () { s.which++; paint(s); };
    s.panel.querySelector('.askgo').onclick = function () { settle(s); };
    // the exact second each quoted line ends, where the lecture has been heard; the page's own estimate otherwise
    if (!LIVE_SITE) fetch('/api/make/ends?slug=' + encodeURIComponent(SLUG) + '&n=' + n).then(function (r) { return r.json(); }).then(function (ends) {
      if (Array.isArray(ends)) s.qs.forEach(function (q) { var hit = ends.filter(function (x) { return x && x.t === q.t; })[0]; if (hit) q.e = hit.e; });
    }).catch(function () {});
    var ws = s.ws = new WebSocket(ROOMS + '/api/room/open?kind=lesson');
    ws.onmessage = function (ev) { var m; try { m = JSON.parse(ev.data); } catch (err) { return; } if (open === s) hear(s, m); };
    ws.onclose = function () { if (open === s) say(s, 'The room closed. Press Done, then Answer on your phones again.'); };
    s.tick = function () { if (open === s) watch(s); };
    if (video) { video.addEventListener('timeupdate', s.tick); video.addEventListener('ended', s.tick); }
  }

  function say(s, text) { s.panel.querySelector('.makestate').textContent = text; }
  function paint(s) {
    var list = (info && info.addresses) || [], host = list.length ? list[s.which % list.length] : '';
    var qr = s.panel.querySelector('.makeqr'), addr = s.panel.querySelector('.makeaddr');
    if (LIVE_SITE) {
      qr.innerHTML = window.PlayQR.svg(location.origin + '/join?r=' + s.code, 6);
      addr.textContent = 'Or open ' + location.host + '/join on a phone and type the code ' + s.code + '. Answers pass between this screen and the phones through voidtv.net and are not kept.';
      return;
    }
    s.panel.querySelector('.makeother').hidden = list.length < 2;
    if (!host) { qr.hidden = true; addr.textContent = 'This computer has no address on a network, so a phone cannot reach it. Join the Wi-Fi and try again.'; return; }
    var base = 'http://' + host + ':' + location.port;
    qr.innerHTML = window.PlayQR.svg(base + '/join?r=' + s.code, 6);
    addr.textContent = 'Or type this in the phone\'s browser: ' + base + '/join and then the code ' + s.code;
  }
  function tell(s, seat, msg) { if (s.ws.readyState === 1) s.ws.send(JSON.stringify({ to: seat, msg: msg })); }
  function seats(s) { return Object.keys(s.seats).filter(function (k) { return s.seats[k].here; }); }
  function waiting(s) { return seats(s).filter(function (k) { return !s.seats[k].done[s.cur]; }); }
  function status(s) {
    var n = seats(s).length, who = n + (n === 1 ? ' phone' : ' phones') + ' connected. ';
    if (s.cur < 0) say(s, n ? who + 'Play the lecture. Each question goes to the phones when the lecture reaches it (' + s.qs.length + ' in all).' : (LIVE_SITE ? 'Scan this with your phones.' : 'Scan this with your phones. They must be on the same Wi-Fi as this computer.'));
    else say(s, 'Question ' + (s.cur + 1) + ' of ' + s.qs.length + ' is on the phones. ' + (n - waiting(s).length) + ' of ' + n + ' answered.');
  }

  function send(s, seat, i) {
    var q = s.qs[i];
    tell(s, seat, { type: 'ask', i: i, of: s.qs.length, q: q.q.slice(0, 600) });
    q.choices.forEach(function (c, j) { tell(s, seat, { type: 'choice', i: i, j: j, text: c.slice(0, 300) }); });
    tell(s, seat, { type: 'go', i: i });
  }
  // The lecture has just passed the end of a quoted line: stop and ask. A line skipped over by more than a few
  // seconds is not asked, and can be asked if the lecture is wound back before it.
  function watch(s) {
    if (s.cur >= 0 || !s.video || !seats(s).length) return;
    var now = s.video.currentTime;
    for (var i = 0; i < s.qs.length; i++) {
      var q = s.qs[i];
      if (now < q.e - 0.2) { if (s.asked[i] === 'skipped') delete s.asked[i]; continue; }
      if (s.asked[i]) continue;
      if (now - q.e > 4 && !s.video.ended) { s.asked[i] = 'skipped'; continue; }
      s.asked[i] = 'asked'; s.cur = i;
      s.video.pause();
      seats(s).forEach(function (k) { send(s, +k, i); });
      s.panel.querySelector('.askgo').hidden = false;
      status(s);
      return;
    }
  }
  // Everyone has answered, or Carry on was pressed: phones still choosing are told the answer, and the lecture plays on.
  function settle(s) {
    if (s.cur < 0) return;
    var i = s.cur;
    waiting(s).forEach(function (k) { result(s, +k, i, -1, true); });
    s.cur = -1;
    s.panel.querySelector('.askgo').hidden = true;
    status(s);
    if (s.video && !s.video.ended) s.video.play().catch(function () {});
  }
  function result(s, seat, i, j, force) {
    var st = s.seats[seat], q = s.qs[i];
    if (!st || st.done[i]) return;
    var ok = j === q.a, tries = (st.tries[i] || 0) + (force ? 0 : 1);
    st.tries[i] = tries;
    if (!ok && !force && tries < 2) { tell(s, seat, { type: 'result', i: i, ok: false, more: true, j: j }); return; }
    st.done[i] = ok ? (tries > 1 ? 'second' : 'first') : 'missed';
    tell(s, seat, { type: 'result', i: i, ok: ok, more: false, j: j, a: q.a, second: ok && tries > 1, late: !!force });
    tell(s, seat, { type: 'why', i: i, text: q.why.slice(0, 700) });
    tell(s, seat, { type: 'quote', i: i, text: q.quote.slice(0, 700), clock: clock(q.t) });
  }

  function hear(s, m) {
    if (m.type === 'room') { s.code = m.code; paint(s); status(s); return; }
    if (m.type === 'join') {
      var st = s.seats[m.from] = s.seats[m.from] || { tries: {}, done: {} };
      st.here = true;
      tell(s, m.from, { type: 'unit', mode: 'answer', title: (s.unit.querySelector('h2') || {}).textContent || '', of: s.qs.length });
      if (s.cur >= 0 && !st.done[s.cur]) send(s, m.from, s.cur);
      status(s);
      return;
    }
    if (m.type === 'leave') { if (s.seats[m.from]) s.seats[m.from].here = false; status(s); if (s.cur >= 0 && !waiting(s).length) settle(s); return; }
    if (!m.msg || typeof m.msg !== 'object') return;
    var x = m.msg;
    if (x.type === 'pick' && x.i === s.cur && Number.isInteger(x.j) && x.j >= 0 && x.j < 4) {
      result(s, m.from, s.cur, x.j, false);
      status(s);
      if (!waiting(s).length) settle(s);
    }
  }

  // Done: every phone is told the lesson is over (it shows its own score), then the room ends.
  function close() {
    var s = open; if (!s) return;
    if (s.cur >= 0) settle(s);
    open = null;
    if (s.video) { s.video.removeEventListener('timeupdate', s.tick); s.video.removeEventListener('ended', s.tick); }
    try { if (s.ws.readyState === 1) { s.ws.send(JSON.stringify({ to: 'all', msg: { type: 'over' } })); s.ws.send(JSON.stringify({ relay: 'end' })); } s.ws.close(); } catch (e) {}
    s.panel.remove();
    s.unit.querySelector('.askbtn').hidden = false;
  }
})();
