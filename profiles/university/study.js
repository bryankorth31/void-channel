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
    Object.keys(bank).forEach(function (k) { var b = bank[k]; if ((!b.q || b.q.length < 2) && !b.crystal) return; (courses[b.course] = courses[b.course] || []).push({ key: k, b: b }); });
    Object.keys(courses).sort().forEach(function (c) {
      var g = t('div', 'setgroup'); g.appendChild(t('h3', null, c));
      courses[c].forEach(function (x) {
        var b = t('button', 'setbtn', x.b.title); b.type = 'button'; b.title = 'Study this lesson together';
        b.appendChild(t('small', null, [x.b.q.length >= 2 ? x.b.q.length + ' questions' : '', x.b.crystal ? 'Pattern Eater' : ''].filter(Boolean).join(', ')));
        b.onclick = function () { choose(x); };
        g.appendChild(b);
      });
      list.appendChild(g);
    });
    $('find').oninput = function () { var q = this.value.toLowerCase(); list.querySelectorAll('.setbtn').forEach(function (b) { b.hidden = q && b.textContent.toLowerCase().indexOf(q) < 0; }); };
  });

  // ---- the room
  $('open').onclick = function () {
    this.hidden = true; $('end').hidden = false; // End the session only once there is a room to end (the function test's F35)
    if (!LIVE_SITE) fetch('/api/make/info').then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { S.info = j; paintQR(); }).catch(function () {});
    var ws = S.ws = new WebSocket(ROOMS + '/api/room/open?kind=lesson');
    ws.onmessage = function (ev) { var m; try { m = JSON.parse(ev.data); } catch (e) { return; } hear(m); };
    ws.onclose = function () { if (S.ws !== ws) return; say('The room closed. Open a new one to go on.'); $('open').hidden = false; $('end').hidden = true; $('qr').textContent = ''; };
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
    if (x.type === 'give' && typeof x.id === 'string') { gave(m.from, x.id); return; }
    if (x.type === 'said' && S.say && !S.say.shown && typeof x.text === 'string' && x.text.trim()) { S.say.said[m.from] = x.text.trim().slice(0, 300); tell(m.from, { type: 'heard' }); sayCount(); return; }
    if (x.type === 'vote' && S.say && S.say.shown && Number.isInteger(x.i) && S.say.cards[x.i] && S.say.cards[x.i].from !== String(m.from)) { S.say.votes[m.from] = x.i; paintCards(); sayCount(); return; }
    if (x.type === 'pick' && x.i === S.i && !S.shown && Number.isInteger(x.j) && x.j >= 0 && x.j < 4 && S.picks[m.from] == null) { S.picks[m.from] = x.j; tally(); }
  }

  // ---- a set, one question at a time
  // a lesson can be studied two ways: guess first on its questions, or Pattern Eater on its crystal
  function choose(x) {
    S.set = x; S.i = -1; S.eat = null;
    $('pick').hidden = true; $('how').hidden = false; $('run').hidden = true; $('eatbox').hidden = true;
    $('howname').textContent = x.b.course + ': ' + x.b.title;
    $('howguess').hidden = !(x.b.q.length >= 2); $('howeat').hidden = !x.b.crystal; $('howsay').hidden = !x.b.crystal;
  }
  $('howguess').onclick = function () {
    $('how').hidden = true; $('run').hidden = false;
    $('setname').textContent = S.set.b.course + ': ' + S.set.b.title;
    here().forEach(function (k) { tell(+k, { type: 'unit', mode: 'study', title: S.set.b.title }); });
    next();
  };
  $('howeat').onclick = function () { $('how').hidden = true; eat(); };
  $('howsay').onclick = function () { $('how').hidden = true; say2(); };
  $('eatsay').onclick = function () { $('eatbox').hidden = true; say2(); };

  // ---- Say it another way (Bryan: learned is when you can "ask the answer in another way"). Every phone writes the
  // idea in its own words; nothing shows until all are in (so nobody copies); then the cards show without names, in a
  // shuffled order, and each phone picks the one that says it most clearly. Nothing is kept.
  function say2() {
    S.say = { said: {}, shown: false, votes: {}, cards: [] };
    $('saybox').hidden = false; $('sayname').textContent = S.set.b.course + ': ' + S.set.b.title;
    $('sayidea').textContent = S.set.b.crystal.key; $('cards').textContent = ''; $('saypick').textContent = '';
    here().forEach(function (k) { tell(+k, { type: 'say', title: S.set.b.title, idea: S.set.b.crystal.key.slice(0, 500) }); });
    sayCount();
  }
  function sayCount() {
    if (!S.say) return;
    var n = here().length, w = here().filter(function (k) { return S.say.said[k]; }).length;
    say(S.say.shown ? Object.keys(S.say.votes).length + ' of ' + n + ' have picked.' : w + ' of ' + n + ' have written.');
    $('showcards').hidden = S.say.shown || !w;
    if (!S.say.shown && n && w === n) showCards();
  }
  function showCards() {
    var Y = S.say; if (Y.shown) return; Y.shown = true;
    Y.cards = shuffle(Object.keys(Y.said).map(function (k) { return { from: k, text: Y.said[k] }; }));
    paintCards();
    here().forEach(function (k) {
      tell(+k, { type: 'vote', n: Y.cards.length });
      Y.cards.forEach(function (c, i) { tell(+k, { type: 'card', i: i, text: c.text, mine: c.from === k }); });
    });
    sayCount();
  }
  function paintCards() {
    var Y = S.say, box = $('cards'); box.textContent = '';
    var counts = Y.cards.map(function () { return 0; }); Object.keys(Y.votes).forEach(function (k) { counts[Y.votes[k]]++; });
    var top = Math.max.apply(null, counts.concat([0]));
    Y.cards.forEach(function (c, i) { var d = t('div', 'card2' + (top && counts[i] === top ? ' pick' : ''), c.text); if (counts[i]) d.appendChild(t('small', null, counts[i] + (counts[i] === 1 ? ' pick' : ' picks'))); box.appendChild(d); });
    $('saypick').textContent = top ? 'The room\'s pick so far is lit. Nothing here is graded: the point is hearing it said other ways.' : '';
  }
  $('showcards').onclick = showCards;
  $('sayback').onclick = function () { $('saybox').hidden = true; $('pick').hidden = false; S.set = null; S.say = null; };
  $('howback').onclick = function () { $('how').hidden = true; $('pick').hidden = false; S.set = null; };

  // ---- Pattern Eater together (Bryan's design, Dec 2025, in plans/research-aha-nucleation-pattern-eater.md): the
  // lesson's true pieces and its wrong "whole answers" are dealt out to the phones; people send the ones they think
  // belong; a wrong one cracks the crystal and dissolves, the next right one rebuilds it; when every true piece is in,
  // the room says out loud what idea just set before the screen shows it.
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), x = a[i]; a[i] = a[j]; a[j] = x; } return a; }
  function eat() {
    var cr = S.set.b.crystal;
    var pieces = cr.partials.map(function (p, i) { return { id: 'p' + i, text: p, ok: true }; }).concat(cr.decoys.map(function (d, i) { return { id: 'd' + i, text: d.text, ok: false, why: d.why }; }));
    S.eat = { pieces: shuffle(pieces), placed: [], cracked: null, set: false, need: cr.partials.length };
    $('eatbox').hidden = false; $('eatname').textContent = S.set.b.course + ': ' + S.set.b.title;
    deal(); paintEat();
  }
  function deal() {
    var E = S.eat, seats = here(), left = E.pieces.filter(function (p) { return !E.placed.some(function (q) { return q.id === p.id; }) && !p.gone; });
    var hands = {}; seats.forEach(function (k) { hands[k] = []; });
    left.forEach(function (p, i) { if (seats.length) hands[seats[i % seats.length]].push(p); });
    seats.forEach(function (k) {
      tell(+k, { type: 'eat', title: S.set.b.title, n: hands[k].length });
      hands[k].forEach(function (p) { tell(+k, { type: 'piece', id: p.id, text: p.text.slice(0, 400) }); });
    });
    say(seats.length ? 'The pieces are on the phones. Send the ones that belong.' : 'Join with phones first, then deal the pieces again.');
  }
  function paintEat() {
    var E = S.eat, L = $('eatleft'), R = $('eatright'); L.textContent = ''; R.textContent = '';
    E.placed.forEach(function (p, i) { (i % 2 ? R : L).appendChild(t('div', 'chip in', p.text)); });
    var gem = $('gem'); gem.className = 'gem' + (E.cracked ? ' cracked' : '') + (E.set ? ' set' : '');
    gem.textContent = E.set ? S.set.b.crystal.key : E.cracked ? 'Cracked' : 'Not set yet';
    $('eatline').textContent = E.set ? (S.set.b.crystal.aha || '') : E.cracked ? 'That cracked it: "' + E.cracked.text.replace(/[.!?]$/, '') + '." ' + (E.cracked.why || 'It is not part of this idea.') + ' The next piece that belongs rebuilds it.' : E.placed.length === E.need ? 'Every piece is in. Before you look: say out loud, in your own words, what idea just set.' : E.placed.length + ' of ' + E.need + ' pieces in. Someone holds the rest.';
    $('showidea').hidden = E.set || E.placed.length < E.need;
  }
  $('showidea').onclick = function () {
    var E = S.eat; E.set = true; paintEat();
    here().forEach(function (k) { tell(+k, { type: 'set', idea: S.set.b.crystal.key.slice(0, 500), aha: (S.set.b.crystal.aha || '').slice(0, 400) }); });
    say('It set. Say it another way, each of you, out loud.');
  };
  $('redeal').onclick = function () { if (S.eat) deal(); };
  $('eatback').onclick = function () { $('eatbox').hidden = true; $('pick').hidden = false; S.set = null; S.eat = null; };
  function gave(seat, id) {
    var E = S.eat; if (!E || E.set) return;
    var p = E.pieces.filter(function (x) { return x.id === id; })[0]; if (!p || p.gone || E.placed.indexOf(p) >= 0) return;
    if (p.ok) { E.placed.push(p); E.cracked = null; tell(seat, { type: 'took', id: id, ok: true }); }
    else { p.gone = true; E.cracked = p; tell(seat, { type: 'took', id: id, ok: false, why: (p.why || '').slice(0, 400) }); }
    paintEat();
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
    S.ws = null; S.seats = {}; S.code = ''; S.eat = null; S.say = null; people(); $('how').hidden = true; $('eatbox').hidden = true; $('saybox').hidden = true; $('code').textContent = ''; $('qr').textContent = ''; $('addr').textContent = ''; $('open').hidden = false; $('end').hidden = true; $('run').hidden = true; $('pick').hidden = false;
    say('The session is over. Nothing from it was kept.');
  };
  root._study = { state: function () { return { code: S.code, phones: here().length, i: S.i, shown: S.shown, picks: Object.assign({}, S.picks) }; } };
})();
