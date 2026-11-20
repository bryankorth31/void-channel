// VoidTV Trivia Nights: the host screen (plan T6, phones T9). The screen shows a question and four answers, a clock runs,
// then the right answer shows with its source. With phones, the screen opens a room on VoidTV's room relay (play/rooms/,
// the PLAY lead's; contract in ROOMS-relay-contract-2026-11-20.md), shows a QR code, and keeps score for each phone.
// Nothing about anyone is kept: a nickname and a score live in this page's memory and die with the room. The only thing
// this page stores is which questions this screen has already shown, so the next game picks new ones.
// Licence: GPL-2.0-or-later.
(function () {
  'use strict';
  const G = window.TriviaGame, W = window.TriviaWords;
  // The project's donation setting (scripts/lib/app.js DONATE_URL); tests/trivia-host.test.js keeps the two the same.
  const DONATE_URL = 'https://square.link/u/bJl9PGAC';
  const DONATE_LINE = 'If you found this service helpful, please think of donating to keep it running and to make more services like this possible. Every donation goes to CASH (cashvalues.org) and feeds its mission in the real world.';
  const SEEN_KEY = 'voidtv-trivia-seen';
  const SHAPES = ['▲', '◆', '●', '■']; // triangle, diamond, circle, square
  const LETTERS = ['A', 'B', 'C', 'D'];

  const $ = (id) => document.getElementById(id);
  for (const e of document.querySelectorAll('.donate-line')) e.textContent = DONATE_LINE;
  for (const e of document.querySelectorAll('.donate-link')) e.href = DONATE_URL;
  // The donation mark (B, 20 Nov 2026: "The winged cross"; shared pattern DONATION-CROSS-pattern-2026-11-20.md): one setting.
  const CROSS = '/assets/brand/cash-cross.png';
  for (const e of document.querySelectorAll('.donate-cross')) e.src = CROSS;

  // Is voidtv.net's room service on? Phones need it (the rooms Worker is Bryan's one-time Cloudflare step). Asking for a room
  // that is not there gets the service's own answer, {"error":"No room by that code"} (or {kind} if the code is in use); anything
  // else (503 "not set up", a plain page, no answer) means it is off. When it is off the game starts on "Out loud" and the phones
  // choice says so, instead of failing at Start (audit A20).
  fetch('/api/room/2222', { cache: 'no-store' })
    .then((r) => r.json().then((j) => (r.status === 200 && !!j.kind) || (r.status === 404 && /no room/i.test(j.error || ''))))
    .catch(() => false).then((on) => {
    const phonesIn = document.querySelector('input[name="mode"][value="phones"]');
    $('phones-off').hidden = on;
    $('phones-l').classList.toggle('disabled', !on);
    phonesIn.disabled = !on;
    if (!on) {
      $('phones-l').title = 'Phone answering is not switched on on this site yet. Play out loud for now.';
      const loud = document.querySelector('input[name="mode"][value="loud"]');
      if (phonesIn.checked) loud.checked = true;
    }
    showAvailable();
  });

  // A link may preset the settings (the home page's Trivia row does): ?crowd=family|after-dark&topics=tv,movies,games&mode=phones|loud
  (function preset() {
    const p = new URLSearchParams(location.search);
    const pick = (name, value) => { const e = document.querySelector('input[name="' + name + '"][value="' + value + '"]'); if (e) e.checked = true; };
    if (/^(family|after-dark)$/.test(p.get('crowd') || '')) pick('band', p.get('crowd'));
    if (/^(phones|loud)$/.test(p.get('mode') || '')) pick('mode', p.get('mode'));
    const topics = (p.get('topics') || '').split(',').filter((t) => /^(tv|movies|games)$/.test(t));
    if (topics.length) for (const e of document.querySelectorAll('input[name="cat"]')) e.checked = topics.includes(e.value);
  })();

  let index = null;          // trivia/bank/index.json
  const loaded = new Map();  // file name -> questions
  let game = null;           // { qs, at, opts, startedAt }
  let phase = 'setup';       // setup | lobby | ask | reveal | board | done
  let timer = null, endsAt = 0, leftMs = 0, paused = false;

  function readSeen() { try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); } catch (e) { return new Set(); } }
  function writeSeen(ids) {
    try { const all = [...readSeen(), ...ids]; localStorage.setItem(SEEN_KEY, JSON.stringify(all.slice(-3000))); } catch (e) { /* private window: fine */ }
  }

  function opts() {
    const val = (n) => (document.querySelector('input[name="' + n + '"]:checked') || {}).value;
    return {
      phones: val('mode') !== 'loud',
      band: val('band') || 'family',
      categories: [...document.querySelectorAll('input[name="cat"]:checked')].map((e) => e.value),
      count: +val('count') || 20,
      secs: +(val('secs') || 0),
      clips: !!document.querySelector('input[name="clips"]:checked'),
      publicNight: val('where') === 'public',
      publicClips: val('where') === 'public' && !!document.querySelector('input[name="pubclips"]:checked'),
    };
  }

  async function filesFor(categories) {
    const want = index.files.filter((f) => categories.includes(f.category));
    await Promise.all(want.filter((f) => !loaded.has(f.file)).map(async (f) => {
      const r = await fetch('bank/' + f.file);
      if (!r.ok) throw new Error('bank/' + f.file + ' answered ' + r.status);
      loaded.set(f.file, await r.json());
    }));
    return want.flatMap((f) => loaded.get(f.file));
  }

  // How many questions the chosen crowd and topics allow, shown under the settings.
  function showAvailable() {
    if (!index) return;
    const o = opts();
    const files = index.files.filter((f) => o.categories.includes(f.category));
    // The opening words follow the mode (audit A21).
    $('lede').textContent = o.phones
      ? 'Put this screen on the TV or projector. Everyone scans a code with their phone and taps an answer; the screen keeps score. Every answer comes from a record we can point to, and the source shows with it.'
      : 'Put this screen on the TV or projector. Read each question out, let the room shout or write down answers, then show the answer. Every answer comes from a record we can point to, and the source shows with it.';
    const noMedia = !o.clips || (o.publicNight && !o.publicClips);
    // The public-night clips switch only means something on a public night.
    $('pubclips-l').hidden = !o.publicNight;
    const n = files.reduce((s, f) => s + (o.band === 'family' ? f.family - (noMedia ? f.mediaFamily || 0 : 0) : f.count - (noMedia ? f.media || 0 : 0)), 0);
    $('avail').textContent = o.categories.length ? n.toLocaleString() + ' questions to pick from' : 'Pick at least one topic';
    $('start').disabled = !o.categories.length || !n;
  }

  const SECTIONS = ['setup', 'lobby', 'stage', 'board', 'done'];
  function show(which) {
    for (const id of SECTIONS) $(id).hidden = id !== which;
    $('pause').hidden = which !== 'stage';
    document.body.classList.toggle('playing', which === 'stage' || which === 'board' || which === 'lobby');
    document.body.classList.toggle('finished', which === 'done');
    $('back').title = which === 'setup' ? 'Back to voidtv.net' : 'End this game and go back to the settings';
    $('back').setAttribute('aria-label', $('back').title);
    showWhere();
  }

  // ---------- the phone room ----------

  const room = { ws: null, code: null, join: null, locked: false, players: new Map() };
  const send = (to, msg) => { if (room.ws && room.ws.readyState === 1) room.ws.send(JSON.stringify({ to, msg })); };
  const nameOf = (p) => p.name || 'Player ' + p.seat;

  function openRoom() {
    if (room.ws) return Promise.resolve();
    return new Promise((ok, no) => {
      let ws;
      try { ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/room/open?kind=trivia'); }
      catch (e) { no(e); return; }
      room.ws = ws;
      ws.onmessage = (e) => {
        let m; try { m = JSON.parse(e.data); } catch (x) { return; }
        if (m.type === 'room') { room.code = m.code; room.join = m.join; drawLobby(); ok(); return; }
        if (m.type === 'join') { joined(m.from, m.back); return; }
        if (m.type === 'leave') { const p = room.players.get(m.from); if (p) { p.gone = true; drawPlayers(); } return; }
        if (m.type === 'locked') { room.locked = !!m.on; $('lock').textContent = room.locked ? 'Let phones in' : 'Lock the room'; showWhere(); return; }
        if (Number.isInteger(m.from)) fromPhone(m.from, m.msg || {});
      };
      ws.onclose = () => {
        const had = !!room.code;
        room.ws = null; room.code = null; room.join = null; room.locked = false;
        if (!had) { no(new Error('closed')); return; }
        // The relay went away mid-game: the game goes on out loud, and the screen says so.
        if (game) { game.opts.phones = false; $('hint').textContent = 'The phone connection dropped. Carry on out loud.'; showWhere(); }
      };
    });
  }

  function closeRoom() { if (room.ws) { const w = room.ws; room.ws = null; w.onclose = null; w.close(); } room.code = null; room.players.clear(); }

  function joined(seat, back) {
    let p = room.players.get(seat);
    if (!p || !back) { p = { seat, name: null, score: 0, pick: null, msLeft: 0, gone: false }; room.players.set(seat, p); }
    p.gone = false;
    send(seat, { type: 't-you', seat, name: nameOf(p), named: !!p.name, family: !game || game.opts.band === 'family' });
    send(seat, stateFor(p));
    drawPlayers();
  }

  // What a phone should show right now (for a phone that joins or comes back mid-game).
  function stateFor(p) {
    if (!game || phase === 'lobby') return { type: 't-wait', text: 'You are in. The game starts soon.' };
    if (phase === 'ask') return questionMsg(p.pick);
    if (phase === 'done') return endMsg(p);
    return { type: 't-wait', text: 'Next question coming up.' };
  }

  function fromPhone(seat, msg) {
    const p = room.players.get(seat);
    if (!p) return;
    if (msg.type === 't-hi') {
      p.name = W.cleanName(msg.name, game ? game.opts.band : opts().band);
      send(seat, { type: 't-you', seat, name: nameOf(p), named: !!p.name, refused: !!msg.name && !p.name });
      drawPlayers();
      return;
    }
    if (phase !== 'ask' || !game) return;
    const pick = G.answerOf(msg, game.at);
    if (pick === null || p.pick !== null) return;
    p.pick = pick;
    p.msLeft = game.opts.secs ? Math.max(0, (paused ? leftMs : endsAt - performance.now())) : 0;
    send(seat, { type: 't-got', n: game.at, pick });
    showAnswered();
  }

  function present() { return [...room.players.values()].filter((p) => !p.gone); }

  function showAnswered() {
    if (!game || !game.opts.phones) return;
    const here = present(), n = here.filter((p) => p.pick !== null).length;
    $('where').textContent = n + ' of ' + here.length + ' answered';
    // Everyone has answered: no need to wait out the clock.
    if (phase === 'ask' && here.length && n === here.length && !paused) setTimeout(() => { if (phase === 'ask' && present().every((p) => p.pick !== null)) reveal(); }, 700);
  }

  function showWhere() {
    const w = $('where');
    w.textContent = '';
    if (!room.code || phase === 'setup' || phase === 'done') return;
    if (phase === 'ask') { showAnswered(); return; }
    if (!room.locked && phase !== 'lobby') w.textContent = 'Join: ' + hostOf(room.join) + ' code ' + room.code;
  }
  const hostOf = (url) => { try { const u = new URL(url); return u.host + '/join'; } catch (e) { return 'voidtv.net/join'; } };

  function drawLobby() {
    $('qr').innerHTML = window.PlayQR.svg(room.join, 8);
    $('code').textContent = room.code;
    $('join-host').textContent = hostOf(room.join);
    drawPlayers();
  }

  function drawPlayers() {
    const here = present();
    $('joined').textContent = here.length ? here.length + (here.length === 1 ? ' phone in' : ' phones in') : 'Nobody yet';
    const ul = $('players');
    ul.textContent = '';
    for (const p of here) {
      const li = document.createElement('li');
      li.textContent = nameOf(p);
      li.title = 'Remove ' + nameOf(p) + ' from this game';
      li.tabIndex = 0;
      li.addEventListener('click', () => removePlayer(p.seat));
      ul.appendChild(li);
    }
    $('begin').disabled = !here.length;
    if (phase === 'ask') showAnswered();
  }

  function removePlayer(seat) {
    if (room.ws && room.ws.readyState === 1) room.ws.send(JSON.stringify({ relay: 'remove', seat }));
    room.players.delete(seat);
    drawPlayers();
  }

  // ---------- the game ----------

  async function start() {
    const o = opts();
    $('start').disabled = true;
    $('avail').textContent = 'Getting the questions ready';
    let all;
    try { all = await filesFor(o.categories); }
    catch (e) { $('avail').textContent = 'The questions did not load. Check the connection and press Start again.'; $('start').disabled = false; return; }
    const qs = G.pickGame(all, { ...o, seen: readSeen() });
    if (!qs.length) { showAvailable(); return; }
    game = { qs, at: -1, opts: o };
    writeSeen(qs.map((q) => q.id));
    if (!o.phones) { show('stage'); next(); return; }
    if (room.code) { for (const p of room.players.values()) { p.score = 0; p.pick = null; } phase = 'lobby'; show('lobby'); drawPlayers(); send('all', { type: 't-wait', text: 'A new game starts soon.' }); $('begin').focus(); return; }
    $('avail').textContent = 'Opening the phone room';
    try { await openRoom(); }
    catch (e) {
      game = null;
      $('avail').textContent = 'The phone room did not open (phones need voidtv.net\'s room service). Pick "Out loud" to play without phones.';
      $('start').disabled = false;
      return;
    }
    phase = 'lobby';
    show('lobby');
    $('begin').focus();
  }

  function begin() {
    if (phase !== 'lobby') return;
    show('stage');
    next();
  }

  function stopClock() { if (timer) cancelAnimationFrame(timer); timer = null; }

  // ---------- clips, pictures and sound: played straight from archive.org ----------
  const vid = $('vid');
  let clip = null;          // the media of the question on screen
  let clockWaiting = false; // the clock starts when the clip is ready (or after 8 seconds, whatever happens)
  function stopMedia() {
    clip = null; clockWaiting = false;
    vid.onloadeddata = vid.onplaying = vid.onerror = vid.ontimeupdate = null;
    try { vid.pause(); } catch (e) { /* fine */ }
    vid.removeAttribute('src'); vid.load();
    $('media').hidden = true; $('media').classList.remove('listen'); $('ear').hidden = true; $('mnote').textContent = '';
    $('stage').classList.remove('with-media');
  }
  function playClip(fromStart) {
    if (!clip || clip.kind === 'still') return;
    try { vid.currentTime = clip.start; } catch (e) { /* fine */ }
    vid.play().catch(() => { $('mnote').textContent = 'Press R or click the picture to play the clip.'; });
  }
  function showMedia(m) {
    clip = m;
    const box = $('media');
    box.hidden = false;
    box.classList.toggle('listen', m.kind === 'audio');
    $('ear').hidden = m.kind !== 'audio';
    $('stage').classList.add('with-media');
    $('mnote').textContent = 'Loading from the Internet Archive';
    clockWaiting = true;
    const ready = () => { $('mnote').textContent = ''; if (clockWaiting) { clockWaiting = false; startClock(); } };
    setTimeout(() => { if (clip === m && clockWaiting) { clockWaiting = false; startClock(); } }, 8000);
    vid.onloadeddata = () => { if (clip !== m) return; if (m.kind === 'still') { vid.pause(); ready(); } else playClip(); };
    vid.onplaying = () => { if (clip === m) ready(); };
    vid.ontimeupdate = () => { if (clip === m && m.kind !== 'still' && vid.currentTime >= m.end) vid.pause(); };
    vid.onerror = () => { if (clip !== m) return; $('mnote').textContent = 'This clip did not load from the Internet Archive. Enter shows the answer.'; if (clockWaiting) { clockWaiting = false; startClock(); } };
    vid.muted = m.kind === 'still';
    vid.src = m.url + '#t=' + m.start + ',' + m.end;
    vid.load();
  }
  function startClock() {
    if (phase !== 'ask' || !game || !game.opts.secs) return;
    leftMs = game.opts.secs * 1000; endsAt = performance.now() + leftMs; tick();
  }

  // The question as a phone gets it: the answers, and the question too when it fits in the relay's 1 KB.
  function questionMsg(pick) {
    const q = game.qs[game.at];
    const m = { type: 't-q', n: game.at, of: game.qs.length, q: q.q, choices: q.choices, secs: game.opts.secs, pick: pick == null ? null : pick };
    if (JSON.stringify(m).length > 900) delete m.q;
    if (JSON.stringify(m).length > 900) m.choices = q.choices.map((c) => c.slice(0, 80));
    return m;
  }

  function ask(q) {
    phase = 'ask'; paused = false;
    $('pause').textContent = 'Pause';
    $('num').textContent = 'Question ' + (game.at + 1) + ' of ' + game.qs.length;
    $('kind').textContent = (G.CATEGORY_NAMES[q.category] || '') + ' · ' + (G.ROUND_NAMES[q.round] || '');
    $('q').textContent = q.q;
    const ol = $('answers');
    ol.textContent = '';
    q.choices.forEach((c, i) => {
      const li = document.createElement('li');
      li.className = 'a a' + i;
      const shape = document.createElement('span'); shape.className = 'shape'; shape.textContent = SHAPES[i]; shape.setAttribute('aria-hidden', 'true');
      const letter = document.createElement('span'); letter.className = 'letter'; letter.textContent = LETTERS[i];
      const text = document.createElement('span'); text.className = 'text'; text.textContent = c;
      const tally = document.createElement('span'); tally.className = 'tally';
      li.append(shape, letter, text, tally);
      ol.appendChild(li);
    });
    $('source').hidden = true;
    $('hint').classList.remove('warn'); $('board-hint').classList.remove('warn');
    stopMedia();
    const secs = game.opts.secs;
    $('clock').hidden = !secs;
    $('hint').textContent = (game.opts.phones ? 'Answer on your phone. ' : '') + (secs ? 'Enter shows the answer early. P pauses.' : 'Enter shows the answer.');
    stopClock();
    if (game.opts.phones) {
      for (const p of room.players.values()) { p.pick = null; p.msLeft = 0; }
      send('all', questionMsg(null));
    }
    showWhere();
    if (q.media) showMedia(q.media);
    else if (secs) startClock();
    else $('fill').style.width = '0%';
  }

  function tick() {
    const left = Math.max(0, endsAt - performance.now());
    $('fill').style.width = (100 * left / (game.opts.secs * 1000)) + '%';
    $('clock').classList.toggle('low', left < 5000);
    if (left <= 0) { timer = null; reveal(); return; }
    timer = requestAnimationFrame(tick);
  }

  function pause() {
    if (phase !== 'ask' || !game.opts.secs) return;
    if (!paused) { paused = true; leftMs = Math.max(0, endsAt - performance.now()); stopClock(); $('pause').textContent = 'Go on'; $('hint').textContent = 'Paused. P or Go on starts the clock again.'; }
    else { paused = false; endsAt = performance.now() + leftMs; $('pause').textContent = 'Pause'; $('hint').textContent = 'Enter shows the answer early. P pauses.'; tick(); }
  }

  function reveal() {
    if (phase !== 'ask') return;
    stopClock();
    phase = 'reveal';
    const q = game.qs[game.at];
    const lis = [...$('answers').children];
    lis.forEach((li, i) => li.classList.add(i === q.answer ? 'right' : 'wrong'));
    // A sound question shows its picture with the answer; a clip stops where it is.
    clockWaiting = false;
    if (clip) { $('media').classList.remove('listen'); $('ear').hidden = true; if (clip.kind !== 'still') { try { vid.pause(); } catch (e) { /* fine */ } } }
    $('fill').style.width = '0%';
    const s = q.source || {};
    const src = $('source');
    src.textContent = '';
    const b = document.createElement('b'); b.textContent = 'Source: ' + s.site;
    const a = document.createElement('a'); a.href = s.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = s.url.replace(/^https:\/\/(www\.)?/, ''); a.title = 'Open the source';
    src.append(b, ', ' + s.fact + '. ', a);
    src.hidden = false;
    if (game.opts.phones) {
      const tally = [0, 0, 0, 0];
      for (const p of room.players.values()) if (p.pick !== null) tally[p.pick]++;
      lis.forEach((li, i) => { li.querySelector('.tally').textContent = tally[i] ? String(tally[i]) : ''; });
      const gained = new Map();
      for (const p of room.players.values()) { const pts = G.points(p.pick === q.answer, p.msLeft, game.opts.secs * 1000); p.score += pts; gained.set(p.seat, pts); }
      const ranks = G.standings([...room.players.values()]);
      for (const r of ranks) {
        const p = room.players.get(r.seat);
        send(r.seat, { type: 't-res', n: game.at, pick: p.pick, answer: q.answer, right: p.pick === q.answer, points: gained.get(r.seat), score: p.score, place: r.place, of: ranks.length });
      }
      $('where').textContent = '';
    }
    $('hint').textContent = game.at + 1 < game.qs.length ? (game.opts.phones ? 'Enter for the scores.' : 'Enter for the next question.') : (game.opts.phones ? 'Enter for the final scores.' : 'Enter to finish.');
  }

  function drawRanks(ol, limit) {
    ol.textContent = '';
    for (const r of G.standings([...room.players.values()]).slice(0, limit)) {
      const li = document.createElement('li');
      const place = document.createElement('span'); place.className = 'place'; place.textContent = G.ordinal(r.place);
      const name = document.createElement('span'); name.className = 'pname'; name.textContent = nameOf(r);
      const pts = document.createElement('span'); pts.className = 'pts'; pts.textContent = r.score.toLocaleString();
      li.append(place, name, pts);
      ol.appendChild(li);
    }
  }

  function board() {
    stopMedia();
    phase = 'board';
    $('board-h').textContent = 'Scores after ' + (game.at + 1) + ' of ' + game.qs.length;
    drawRanks($('ranks'), 10);
    $('board-hint').textContent = 'Enter for the next question.';
    show('board');
    send('all', { type: 't-wait', text: 'Next question coming up.' });
  }

  function next() {
    if (phase === 'ask') return reveal();
    if (phase === 'reveal' && game.opts.phones && room.players.size && game.at + 1 < game.qs.length) return board();
    if (game.at + 1 >= game.qs.length) return finish();
    game.at++;
    show('stage');
    ask(game.qs[game.at]);
  }

  function endMsg(p) {
    const ranks = G.standings([...room.players.values()]);
    const r = ranks.find((x) => x.seat === p.seat) || { place: ranks.length + 1 };
    return { type: 't-end', score: p.score, place: r.place, of: ranks.length };
  }

  function finish() {
    stopMedia();
    stopClock();
    phase = 'done';
    const withPhones = game.opts.phones && room.players.size;
    if (withPhones) {
      const top = G.standings([...room.players.values()])[0];
      $('done-line').textContent = game.qs.length + ' questions played. ' + (top ? nameOf(top) + ' wins with ' + top.score.toLocaleString() + '.' : '');
      drawRanks($('final'), 10);
      for (const p of room.players.values()) send(p.seat, endMsg(p));
    } else {
      $('done-line').textContent = game.qs.length + ' questions played. Thanks for playing.';
      $('final').textContent = '';
    }
    show('done');
    $('again').focus();
  }

  function backToSetup() {
    stopMedia();
    stopClock();
    if (room.ws) send('all', { type: 't-wait', text: 'The game was stopped. Wait here for the next one.' });
    phase = 'setup'; game = null;
    show('setup');
    showAvailable();
    $('start').focus();
  }

  // Back during a game asks once on the screen itself (TV browsers often block pop-up boxes): a second Back within
  // 4 seconds ends the game.
  let backArmed = 0;
  function back() {
    if (phase === 'setup') { closeRoom(); location.href = '/'; return; }
    if (phase === 'done' || phase === 'lobby') return backToSetup();
    if (performance.now() - backArmed < 4000) { backArmed = 0; backToSetup(); return; }
    backArmed = performance.now();
    const h = phase === 'board' ? $('board-hint') : $('hint'), was = h.textContent;
    h.textContent = 'Press Back (or Esc) again to end this game.';
    h.classList.add('warn');
    setTimeout(() => { if (h.textContent.startsWith('Press Back')) { h.textContent = was; h.classList.remove('warn'); } }, 4000);
  }

  function full() {
    const d = document;
    if (d.fullscreenElement) d.exitFullscreen && d.exitFullscreen();
    else if (d.documentElement.requestFullscreen) d.documentElement.requestFullscreen().catch(() => {});
  }

  // Keys: the same few on a keyboard, a presentation clicker and a TV remote.
  document.addEventListener('keydown', (e) => {
    if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) && e.key !== 'Enter') return;
    if (e.key === 'f' || e.key === 'F') { full(); return; }
    if ((e.key === 'r' || e.key === 'R') && clip && phase === 'ask') { playClip(); return; }
    const act = G.keyAction(e);
    if (!act) return;
    if (phase === 'setup') { if (act === 'next' && e.key === 'Enter' && !$('start').disabled && e.target === document.body) { e.preventDefault(); start(); } return; }
    e.preventDefault();
    if (act === 'next') { if (phase === 'done') start(); else if (phase === 'lobby') { if (!$('begin').disabled) begin(); } else if (!paused) next(); }
    else if (act === 'pause') pause();
    else if (act === 'back') back();
  });

  $('back').addEventListener('click', (e) => { if (phase !== 'setup') { e.preventDefault(); back(); } else closeRoom(); });
  $('start').addEventListener('click', start);
  $('begin').addEventListener('click', begin);
  $('lock').addEventListener('click', () => { if (room.ws && room.ws.readyState === 1) room.ws.send(JSON.stringify({ relay: 'lock', on: !room.locked })); });
  $('again').addEventListener('click', start);
  $('change').addEventListener('click', backToSetup);
  $('pause').addEventListener('click', pause);
  $('full').addEventListener('click', full);
  $('stage').addEventListener('click', (e) => { if (e.target.closest('#media')) { if (phase === 'ask') playClip(); return; } if (!e.target.closest('a') && !paused) next(); });
  $('board').addEventListener('click', () => next());
  for (const i of document.querySelectorAll('.setup input')) i.addEventListener('change', showAvailable);
  addEventListener('pagehide', closeRoom);

  fetch('bank/index.json').then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }).then((j) => { index = j; showAvailable(); $('start').focus(); })
    .catch(() => { $('avail').textContent = 'The questions did not load. Check the connection and reload the page.'; });
})();
