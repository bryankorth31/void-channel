// Study together (Bryan, 22 Nov 2026: "i want this to be a side room ppl can use on void u"; "Yes, build both").
// The shared screen's side of a study room. It opens a lesson room on the phone relay (voidtv.net's on the live site,
// this computer's in the preview), shows a QR code, and runs a set chosen from the University's own lessons: each
// question goes to every phone, each phone locks in a guess nobody else sees, and when all are in (or Show how the
// room split is pressed) the screen shows the split, then the source settles it as a plain fact. No names, no scores,
// nothing kept: the relay only passes messages while the room is open. The phones run make/phone.html in its study mode.
(function () {
  'use strict';
  var root = document.getElementById('study'); if (!root || !window.WebSocket) return;
  var LIVE_SITE = /(^|\.)voidtv\.net$/.test(location.hostname);
  var ROOMS = LIVE_SITE ? 'wss://voidtv.net' : (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
  var $ = function (id) { return document.getElementById(id); };
  var t = function (tag, cls, s) { var e = document.createElement(tag); if (cls) e.className = cls; if (s != null) e.textContent = s; return e; };
  var S = { ws: null, code: '', seats: {}, set: null, i: -1, picks: {}, shown: false, which: 0, info: null };

  // ---- the sets: every lesson with questions, read from recall.json (the same file Remember it reads)
  fetch('recall.json').then(function (r) { return r.json(); }).then(function (bank) {
    var list = $('sets'), courses = {};
    Object.keys(bank).forEach(function (k) { var b = bank[k]; if (!b.q || b.q.length < 2) return; (courses[b.course] = courses[b.course] || []).push({ key: k, b: b }); });
    Object.keys(courses).sort().forEach(function (c) {
      var g = t('div', 'setgroup'); g.appendChild(t('h3', null, c));
      courses[c].forEach(function (x) {
        var b = t('button', 'setbtn', x.b.title); b.type = 'button'; b.title = 'Study this lesson together: ' + x.b.q.length + ' questions';
        b.appendChild(t('small', null, x.b.q.length + ' questions'));
        b.onclick = function () { choose(x); };
        g.appendChild(b);
      });
      list.appendChild(g);
    });
    $('find').oninput = function () { var q = this.value.toLowerCase(); list.querySelectorAll('.setbtn').forEach(function (b) { b.hidden = q && b.textContent.toLowerCase().indexOf(q) < 0; }); };
  });

  // ---- the room
  $('open').onclick = function () {
    this.hidden = true;
    if (!LIVE_SITE) fetch('/api/make/info').then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { S.info = j; paintQR(); }).catch(function () {});
    var ws = S.ws = new WebSocket(ROOMS + '/api/room/open?kind=lesson');
    ws.onmessage = function (ev) { var m; try { m = JSON.parse(ev.data); } catch (e) { return; } hear(m); };
    ws.onclose = function () { say('The room closed. Open a new one to go on.'); $('open').hidden = false; $('qr').textContent = ''; };
    say('Opening a room for the phones.');
  };
  function paintQR() {
    if (!S.code) return;
    var qr = $('qr'), addr = $('addr');
    if (LIVE_SITE) { qr.innerHTML = window.PlayQR.svg(location.origin + '/join?r=' + S.code, 6); addr.textContent = 'Or open ' + location.host + '/join on a phone and type ' + S.code + '.'; return; }
    var list = (S.info && S.info.addresses) || [], host = list.length ? list[S.which % list.length] : '';
    $('other').hidden = list.length < 2;
    if (!host) { addr.textContent = 'This computer has no address on a network, so a phone cannot reach it. Join the Wi-Fi and try again.'; return; }
    var base = 'http://' + host + ':' + location.port;
    qr.innerHTML = window.PlayQR.svg(base + '/join?r=' + S.code, 6);
    addr.textContent = 'Or type ' + base + '/join in the phone\'s browser, then ' + S.code + '.';
  }
  $('other').onclick = function () { S.which++; paintQR(); };
  function say(s) { $('state').textContent = s; }
  function tell(seat, msg) { if (S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify({ to: seat, msg: msg })); }
  var here = function () { return Object.keys(S.seats).filter(function (k) { return S.seats[k]; }); };
  function people() { var n = here().length; $('count').textContent = n + (n === 1 ? ' phone' : ' phones') + ' in the room'; }

  function hear(m) {
    if (m.type === 'room') { S.code = m.code; $('code').textContent = m.code; paintQR(); say('Scan with your phones. ' + (LIVE_SITE ? '' : 'They must be on the same Wi-Fi as this computer.')); return; }
    if (m.type === 'join') { S.seats[m.from] = true; people(); tell(m.from, { type: 'unit', mode: 'study', title: S.set ? S.set.b.title : 'Study together' }); if (S.i >= 0 && !S.shown) ask(m.from); return; }
    if (m.type === 'leave') { S.seats[m.from] = false; people(); tally(); return; }
    var x = m.msg; if (!x || typeof x !== 'object') return;
    if (x.type === 'pick' && x.i === S.i && !S.shown && Number.isInteger(x.j) && x.j >= 0 && x.j < 4 && S.picks[m.from] == null) { S.picks[m.from] = x.j; tally(); }
  }

  // ---- a set, one question at a time
  function choose(x) {
    S.set = x; S.i = -1;
    $('pick').hidden = true; $('run').hidden = false;
    $('setname').textContent = x.b.course + ': ' + x.b.title;
    here().forEach(function (k) { tell(+k, { type: 'unit', mode: 'study', title: x.b.title }); });
    next();
  }
  function q() { return S.set.b.q[S.i]; }
  function ask(seat) {
    var Q = q();
    tell(seat, { type: 'ask', i: S.i, of: S.set.b.q.length, q: Q.q.slice(0, 600) });
    Q.choices.forEach(function (c, j) { tell(seat, { type: 'choice', i: S.i, j: j, text: c.slice(0, 300) }); });
    tell(seat, { type: 'go', i: S.i });
  }
  function next() {
    S.i++; S.picks = {}; S.shown = false;
    if (S.i >= S.set.b.q.length) { $('qtext').textContent = 'That is the set. Pick another lesson, or end the session.'; $('bars').textContent = ''; $('reveal').hidden = true; $('next').hidden = true; $('source').hidden = true; $('again').hidden = false; return; }
    var Q = q();
    $('qn').textContent = 'Question ' + (S.i + 1) + ' of ' + S.set.b.q.length + '. Guess first: every phone locks in privately.';
    $('qtext').textContent = Q.q; $('source').hidden = true; $('next').hidden = true; $('reveal').hidden = false; $('again').hidden = true;
    bars(false);
    here().forEach(function (k) { ask(+k); });
    tally();
  }
  function tally() {
    if (!S.set || S.i < 0 || S.shown) return;
    var n = here().length, in_ = here().filter(function (k) { return S.picks[k] != null; }).length;
    say(in_ + ' of ' + n + ' locked in.');
    if (n && in_ === n) show();
  }
  function bars(open) {
    var Q = q(), box = $('bars'); box.textContent = '';
    var counts = [0, 0, 0, 0]; Object.keys(S.picks).forEach(function (k) { if (S.seats[k] !== undefined) counts[S.picks[k]]++; });
    var top = Math.max(1, Math.max.apply(null, counts));
    Q.choices.forEach(function (c, j) {
      var row = t('div', 'bar' + (open && j === Q.a ? ' real' : ''));
      row.appendChild(t('span', 'bt', c));
      var tr = t('span', 'track'), fill = t('i'); fill.style.width = open ? (counts[j] / top * 100) + '%' : '0%'; tr.appendChild(fill); row.appendChild(tr);
      row.appendChild(t('b', null, open ? String(counts[j]) : ''));
      box.appendChild(row);
    });
  }
  // the split, then the source: the gap is said as it is, never as right or wrong
  function show() {
    if (S.shown) return; S.shown = true;
    var Q = q(); bars(true);
    var n = Object.keys(S.picks).length, same = Object.keys(S.picks).filter(function (k) { return S.picks[k] === Q.a; }).length;
    $('srcline').textContent = 'The source says: ' + Q.choices[Q.a] + '. ' + (n ? same + ' of ' + n + ' picked that.' : '') + ' ' + (Q.why || '');
    $('srcquote').textContent = Q.quote ? '"' + Q.quote + '" (' + Q.from + ')' : '';
    $('source').hidden = false; $('reveal').hidden = true; $('next').hidden = false;
    say('Talk it over: why did people pick what they picked?');
    here().forEach(function (k) {
      var j = S.picks[k] == null ? -1 : S.picks[k];
      tell(+k, { type: 'result', i: S.i, ok: j === Q.a, more: false, j: j, a: Q.a });
      if (Q.why) tell(+k, { type: 'why', i: S.i, text: Q.why.slice(0, 700) });
      if (Q.quote) tell(+k, { type: 'quote', i: S.i, text: Q.quote.slice(0, 700), clock: Q.from.slice(0, 120) });
    });
  }
  $('reveal').onclick = show;
  $('next').onclick = next;
  $('again').onclick = function () { $('run').hidden = true; $('pick').hidden = false; S.set = null; S.i = -1; };
  $('end').onclick = function () {
    try { if (S.ws && S.ws.readyState === 1) { S.ws.send(JSON.stringify({ to: 'all', msg: { type: 'over' } })); S.ws.send(JSON.stringify({ relay: 'end' })); } if (S.ws) S.ws.close(); } catch (e) {}
    S.ws = null; S.seats = {}; S.code = ''; people(); $('code').textContent = ''; $('qr').textContent = ''; $('addr').textContent = ''; $('open').hidden = false; $('run').hidden = true; $('pick').hidden = false;
    say('The session is over. Nothing from it was kept.');
  };
  root._study = { state: function () { return { code: S.code, phones: here().length, i: S.i, shown: S.shown, picks: Object.assign({}, S.picks) }; } };
})();
