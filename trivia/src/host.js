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

  // Is voidtv.net's room service on? Phones need it (the rooms Worker is Bryan's one-time Cloudflare step). The room door
  // answers the plain question GET /api/room with 200 {"on":true} when its rooms answer; anything else (503 "not set up",
  // a plain page, no answer) means it is off (G.roomsOn). Asking the plain question leaves no red 404 in the console
  // (Bryan, 24 Nov 2026: "Fix the red line"). When it is off the game starts on "Out loud" and the phones choice says so,
  // instead of failing at Start (audit A20).
  fetch('/api/room', { cache: 'no-store' })
    .then((r) => r.json().then((j) => G.roomsOn(r.ok, j)))
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

  // The 18+ door (Bryan, 25 Nov 2026: "Yes, add the door"; decision A7, the voidtv function test's F1): After dark sits behind
  // the home page's own Late Night door. Picking it (or a link that starts on it) with the door shut on this browser shows the
  // door; "I am 18 or older, enter" opens it for the whole site (voidtv:me, field adult) and keeps After dark; "Not now",
  // a click outside the box or a back key keeps it shut and picks Family again. With the door open nothing is asked.
  const ME_KEY = 'voidtv:me';
  let doorHere = false;      // opened on this page (also when the browser will not store it)
  const isAfterDark = () => { const e = document.querySelector('input[name="band"]:checked'); return !!e && e.value === 'after-dark'; };
  function doorOpen() {
    if (doorHere) return true;
    try { return G.adultOpen(localStorage.getItem(ME_KEY)); } catch (e) { return false; }
  }
  function askDoor() {
    if (doorOpen()) return true;
    $('gate').hidden = false;
    $('gate-yes').focus();
    return false;
  }
  function shutDoor(enter) {
    $('gate').hidden = true;
    if (enter) {
      doorHere = true;
      try { const out = G.adultOpened(localStorage.getItem(ME_KEY), Date.now()); if (out) localStorage.setItem(ME_KEY, out); } catch (e) { /* private window: open for this page only */ }
    } else {
      document.querySelector('input[name="band"][value="family"]').checked = true;
      showAvailable();
    }
    $('start').focus();
  }
  $('gate-yes').addEventListener('click', () => shutDoor(true));
  $('gate-no').addEventListener('click', () => shutDoor(false));
  $('gate').addEventListener('click', (e) => { if (e.target === $('gate')) shutDoor(false); });
  document.querySelector('input[name="band"][value="after-dark"]').addEventListener('change', (e) => { if (e.target.checked) askDoor(); });
  if (isAfterDark()) askDoor();

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
      theme: val('theme') && val('theme') !== 'all' ? val('theme') : null,
      categories: [...document.querySelectorAll('input[name="cat"]:checked')].map((e) => e.value),
      count: +val('count') || 20,
      secs: +(val('secs') || 0),
      format: val('format') === 'shelf' ? 'shelf' : 'classic',
      hl: !!document.querySelector('input[name="hl"]:checked'),
      yearGuess: !!document.querySelector('input[name="yg"]:checked'),
      clips: !!document.querySelector('input[name="clips"]:checked'),
      publicNight: val('where') === 'public',
      publicClips: val('where') === 'public' && !!document.querySelector('input[name="pubclips"]:checked'),
    };
  }

  let datesCache = null;
  async function datesFile() {
    if (!datesCache) { const r = await fetch('bank/' + index.dates.file); if (!r.ok) throw new Error(r.status); datesCache = await r.json(); }
    return datesCache;
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
    // With a theme, each file's own counts for that theme (the bank writes them as groups).
    const n = files.map((f) => (o.theme ? (f.groups && f.groups[o.theme]) || null : f)).filter(Boolean)
      .reduce((s, f) => s + (o.band === 'family' ? f.family - (noMedia ? f.mediaFamily || 0 : 0) : f.count - (noMedia ? f.media || 0 : 0)), 0);
    $('avail').textContent = o.categories.length ? n.toLocaleString() + ' questions to pick from' : 'Pick at least one topic';
    $('start').disabled = !o.categories.length || !n;
  }

  const SECTIONS = ['setup', 'lobby', 'stage', 'board', 'shelf', 'wager', 'done'];
  function show(which) {
    for (const id of SECTIONS) $(id).hidden = id !== which;
    if (which !== 'stage' && which !== 'board') clearAfter();
    $('pause').hidden = which !== 'stage' && !(which === 'board' && game && game.opts.secs);
    document.body.classList.toggle('playing', ['stage', 'board', 'lobby', 'shelf', 'wager'].includes(which));
    document.body.classList.toggle('finished', which === 'done');
    $('back').title = which === 'setup' ? 'Back to voidtv.net' : 'End this game and go back to the settings';
    $('back').setAttribute('aria-label', $('back').title);
    showWhere();
  }

  // ---------- the phone room ----------

  const room = { ws: null, code: null, join: null, locked: false, players: new Map() };
  // The phone remote (remote/src/trivia.js) asks for the open room's four letters, to hand a phone to the answer page.
  window.TriviaHostRoom = () => (room.ws && room.code) || '';
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
    if (phase === 'ask') return questionMsg(game.qs[game.at].round === 'year-guess' ? p.guess : p.pick);
    if (phase === 'done') return endMsg(p);
    if (phase === 'wager') return betAsk(p);
    if (phase === 'shelf') return { type: 't-wait', text: pickerLine() };
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
    if (phase === 'wager' && game) {
      const bet = G.wagerOf(msg, p.score);
      if (bet === null || p.bet != null) return;
      p.bet = bet;
      send(seat, { type: 't-bet-got', amount: bet });
      showBets();
      return;
    }
    if (phase !== 'ask' || !game) return;
    const q = game.qs[game.at];
    if (answered(p, q)) return;
    if (q.round === 'year-guess') {
      const year = G.guessOf(msg, game.at, q);
      if (year === null) return;
      p.guess = year;
      send(seat, { type: 't-got', n: game.at, year });
    } else {
      const pick = G.answerOf(msg, game.at);
      if (pick === null || pick >= q.choices.length) return;
      p.pick = pick;
      send(seat, { type: 't-got', n: game.at, pick });
    }
    p.msLeft = game.opts.secs ? Math.max(0, (paused ? leftMs : endsAt - performance.now())) : 0;
    showAnswered();
  }

  function present() { return [...room.players.values()].filter((p) => !p.gone); }
  const answered = (p, q) => (q && q.round === 'year-guess' ? p.guess != null : p.pick !== null);

  function showAnswered() {
    if (!game || !game.opts.phones) return;
    const q = game.qs[game.at];
    const here = present(), n = here.filter((p) => answered(p, q)).length;
    $('where').textContent = n + ' of ' + here.length + ' answered';
    // Everyone has answered: no need to wait out the clock.
    if (phase === 'ask' && here.length && n === here.length && !paused) setTimeout(() => { if (phase === 'ask' && present().every((p) => answered(p, q))) reveal(); }, 700);
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
    if (isAfterDark() && !askDoor()) return;   // no After dark game while the 18+ door is shut
    const o = opts();
    $('start').disabled = true;
    $('avail').textContent = 'Getting the questions ready';
    let all;
    try { all = await filesFor(o.categories); }
    catch (e) { $('avail').textContent = 'The questions did not load. Check the connection and press Start again.'; $('start').disabled = false; return; }
    if (o.format === 'shelf') {
      const shelf = G.buildShelf(all, { ...o, seen: readSeen() }, Math.random);
      if (!shelf) { $('avail').textContent = 'Not enough questions for a board with these settings. Add a topic.'; $('start').disabled = false; return; }
      game = { mode: 'shelf', shelf, qs: [], at: -1, opts: o, total: shelf.cats.reduce((n, c) => n + c.cells.length, 0) + 1, picker: 0, focus: [0, 0] };
      writeSeen(shelf.cats.flatMap((c) => c.cells.map((x) => x.q.id)).concat([shelf.final.id]));
      return afterStart(o);
    }
    // Our own formats (plan G3, G4): a Higher or Lower run and year guesses, built from the dates every question proved.
    let run = [], years = [];
    if ((o.hl || o.yearGuess) && index.dates) {
      try {
        const d = await datesFile();
        const taken = new Set();
        if (o.hl && o.count >= 10) run = G.hlRun(d, o, 4, Math.random, taken);
        if (o.yearGuess) years = G.yearQs(d, o, o.count >= 20 ? 2 : 1, Math.random, taken);
      } catch (e) { run = []; years = []; }
    }
    const regular = G.pickGame(all, { ...o, count: o.count - run.length - years.length, seen: readSeen() });
    const qs = G.compose(regular, run, years);
    if (!qs.length) { showAvailable(); return; }
    game = { mode: 'classic', qs, at: -1, opts: o };
    writeSeen(qs.map((q) => q.id));
    return afterStart(o);
  }

  // After the questions are ready: straight in out loud, or through the phone room's lobby.
  async function afterStart(o) {
    if (!o.phones) { firstStep(); return; }
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
    firstStep();
  }
  function firstStep() {
    if (game.mode === 'shelf') { showShelf(); return; }
    show('stage');
    next();
  }

  // ---------- The Shelf (plan G1) ----------
  // Who picks the next square, with phones: the players take turns, in the order they joined.
  function picker() {
    const here = present();
    return here.length ? here[game.picker % here.length] : null;
  }
  function pickerLine() { const p = game && game.opts.phones ? picker() : null; return p ? nameOf(p) + ' picks a square.' : 'Pick a square.'; }
  function showShelf() {
    phase = 'shelf';
    const grid = $('grid');
    const cats = game.shelf.cats;
    grid.style.setProperty('--cols', cats.length);
    grid.textContent = '';
    for (const c of cats) { const h = document.createElement('div'); h.className = 'cat'; h.textContent = c.name; grid.appendChild(h); }
    for (let r = 0; r < G.SHELF_VALUES.length; r++) {
      cats.forEach((c, ci) => {
        const cell = c.cells[r];
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'cell'; b.textContent = String(cell.value);
        b.dataset.c = ci; b.dataset.r = r;
        b.disabled = cell.used;
        b.title = c.name + ' for ' + cell.value;
        b.addEventListener('click', () => openCell(ci, r));
        grid.appendChild(b);
      });
    }
    $('shelf-who').textContent = pickerLine();
    if (game.opts.phones) { drawRanks($('shelf-ranks'), 6); send('all', { type: 't-wait', text: pickerLine() }); } else $('shelf-ranks').textContent = '';
    show('shelf');
    focusCell(game.focus[0], game.focus[1]);
  }
  function cellButton(c, r) { return $('grid').querySelector('.cell[data-c="' + c + '"][data-r="' + r + '"]'); }
  function focusCell(c, r) {
    const b = cellButton(c, r);
    if (b && !b.disabled) { game.focus = [c, r]; b.focus(); return; }
    const open = $('grid').querySelector('.cell:not(:disabled)');
    if (open) { game.focus = [+open.dataset.c, +open.dataset.r]; open.focus(); }
  }
  // The arrows move between squares that are still open, skipping used ones.
  function moveFocus(dc, dr) {
    const cols = game.shelf.cats.length, rows = G.SHELF_VALUES.length;
    let [c, r] = game.focus;
    for (let i = 0; i < cols * rows; i++) {
      c = (c + dc + cols) % cols; r = (r + dr + rows) % rows;
      const b = cellButton(c, r);
      if (b && !b.disabled) { game.focus = [c, r]; b.focus(); return; }
      if (!dc && !dr) return;
    }
  }
  function openCell(c, r) {
    const cat = game.shelf.cats[c], cell = cat.cells[r];
    if (!cell || cell.used || phase !== 'shelf') return;
    cell.used = true;
    const q = Object.assign({}, cell.q, { shelfValue: cell.value, shelfCat: cat.name });
    game.qs.push(q);
    game.at = game.qs.length - 1;
    show('stage');
    ask(q);
  }
  // The final: everyone with a phone bets part of their score, then one question.
  function betAsk(p) { return { type: 't-bet-ask', max: Math.max(0, p.score), cat: G.ROUND_NAMES[game.shelf.final.round] || '' }; }
  function startWager() {
    phase = 'wager';
    const f = game.shelf.final;
    $('wager-cat').textContent = 'The category: ' + (G.ROUND_NAMES[f.round] || 'trivia') + '.';
    if (game.opts.phones && room.players.size) {
      for (const p of room.players.values()) { p.bet = null; send(p.seat, betAsk(p)); }
      $('wager-note').textContent = 'Bet part of your score on your phone. Right, and you win what you bet; wrong, and you lose it.';
      showBets();
    } else {
      $('wager-note').textContent = 'One last question.';
      $('wager-count').textContent = '';
    }
    show('wager');
  }
  function showBets() {
    if (phase !== 'wager') return;
    const here = present(), n = here.filter((p) => p.bet != null).length;
    $('wager-count').textContent = n + ' of ' + here.length + ' have bet';
  }
  function askFinal() {
    const q = Object.assign({}, game.shelf.final, { final: true });
    for (const p of room.players.values()) if (p.bet == null) p.bet = 0;
    game.qs.push(q);
    game.at = game.qs.length - 1;
    show('stage');
    ask(q);
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
    if (q.round === 'year-guess') return { type: 't-q', n: game.at, of: game.total || game.qs.length, q: q.q, kind: 'year', min: q.min, max: q.max, secs: game.opts.secs, guess: pick == null ? null : pick };
    const m = { type: 't-q', n: game.at, of: game.total || game.qs.length, q: q.q, choices: q.choices, secs: game.opts.secs, pick: pick == null ? null : pick };
    if (JSON.stringify(m).length > 900) delete m.q;
    if (JSON.stringify(m).length > 900) m.choices = q.choices.map((c) => c.slice(0, 80));
    return m;
  }

  function ask(q) {
    phase = 'ask'; paused = false;
    $('pause').textContent = 'Pause';
    $('num').textContent = q.final ? 'Final question' : q.shelfValue ? q.shelfCat + ' for ' + q.shelfValue : 'Question ' + (game.at + 1) + ' of ' + game.qs.length;
    $('kind').textContent = (G.CATEGORY_NAMES[q.category] || '') + ' · ' + (G.ROUND_NAMES[q.round] || '');
    $('q').textContent = q.q;
    const ol = $('answers');
    ol.textContent = '';
    ol.classList.toggle('two', q.choices.length === 2);
    ol.hidden = q.round === 'year-guess';
    drawRun(q, false);
    drawYear(q, false);
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
    $('source').hidden = true; $('why').hidden = true;
    $('hint').classList.remove('warn'); $('board-hint').classList.remove('warn');
    stopMedia();
    const secs = game.opts.secs;
    $('clock').hidden = !secs;
    $('hint').textContent = (game.opts.phones ? 'Answer on your phone. ' : '') + (secs ? 'Enter shows the answer early. P pauses.' : 'Enter shows the answer.');
    stopClock();
    if (game.opts.phones) {
      for (const p of room.players.values()) { p.pick = null; p.guess = null; p.msLeft = 0; }
      send('all', questionMsg(null));
    }
    showWhere();
    if (q.media) showMedia(q.media);
    else if (secs) startClock();
    else $('fill').style.width = '0%';
  }

  // Higher or Lower: the last title with its date, then the next title, its date shown when the answer is.
  function shownDate(d, other) {
    const y = String(d.date).slice(0, 4);
    if (String(d.date).length === 10 && other && String(other.date).slice(0, 4) === y) return new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return y;
  }
  function drawRun(q, open) {
    const bar = $('run');
    bar.hidden = q.round !== 'higher-lower';
    if (bar.hidden) return;
    const { prev, next, step, of } = q.hl;
    bar.textContent = '';
    const card = (d, show, cls) => {
      const box = document.createElement('div'); box.className = 'runcard ' + cls;
      const t = document.createElement('span'); t.className = 'rt'; t.textContent = d.title;
      const y = document.createElement('b'); y.className = 'ry'; y.textContent = show ? shownDate(d, d === prev ? next : prev) : '?';
      box.append(t, y);
      return box;
    };
    const arrow = document.createElement('span'); arrow.className = 'rarrow'; arrow.textContent = 'then';
    const count = document.createElement('small'); count.className = 'rstep'; count.textContent = 'Step ' + step + ' of ' + of;
    bar.append(card(prev, true, 'was'), arrow, card(next, open, 'now'), count);
  }
  // Closest Without Going Over: a big year box; its range before, the year after.
  function drawYear(q, open, line) {
    const box = $('yearbox');
    box.hidden = q.round !== 'year-guess';
    if (box.hidden) return;
    $('yearval').textContent = open ? String(q.year) : '?';
    $('yearnote').textContent = open ? (line || '') : 'Guess the year, from ' + q.min + ' to ' + q.max + '. The closest guess that is not past it wins.';
  }

  function tick() {
    const left = Math.max(0, endsAt - performance.now());
    $('fill').style.width = (100 * left / (game.opts.secs * 1000)) + '%';
    $('clock').classList.toggle('low', left < 5000);
    if (left <= 0) { timer = null; reveal(); return; }
    timer = requestAnimationFrame(tick);
  }

  // MOVING ON BY ITSELF (Bryan, 22 Nov 2026: "on trivia the lag or wait time between questions is to long"). With a clock on, the
  // answer stays up AFTER_S.reveal seconds and the scores AFTER_S.board seconds, counting down where the hint was, then the game
  // goes on. Enter still goes on at once; P or Pause holds it. A game set to No clock waits for Enter, as that setting says.
  const AFTER_S = { reveal: 7, board: 5 };
  let after = null; // the countdown on screen: { until, left, iv, draw }
  function clearAfter() { if (after) { clearInterval(after.iv); after = null; } }
  function autoNext(el, words) {
    clearAfter();
    if (!game || game.mode === 'shelf' || !game.opts.secs) return;
    const kind = phase === 'board' ? 'board' : 'reveal';
    const a = after = { until: performance.now() + AFTER_S[kind] * 1000, left: 0, iv: 0 };
    a.draw = () => {
      const s = Math.max(1, Math.ceil((paused ? a.left : a.until - performance.now()) / 1000));
      el.textContent = paused ? 'Paused. P or Go on starts the countdown again.' : words(s);
    };
    a.iv = setInterval(() => {
      if (after !== a || paused) return;
      if (performance.now() >= a.until) { clearAfter(); next(); return; }
      a.draw();
    }, 250);
    a.draw();
  }
  // What the countdown says after an answer: where the game goes next, and that Enter goes there now.
  function revealWords(s) {
    const last = game.at + 1 >= game.qs.length, phones = game.opts.phones && room.players.size;
    if (last) return (phones ? 'Final scores in ' : 'The end in ') + s + '. Enter goes on now.';
    return (phones ? 'Scores in ' : 'Next question in ') + s + '. Enter goes on now.';
  }

  function pause() {
    if (after && (phase === 'reveal' || phase === 'board')) {
      if (!paused) { paused = true; after.left = Math.max(0, after.until - performance.now()); $('pause').textContent = 'Go on'; }
      else { paused = false; after.until = performance.now() + after.left; $('pause').textContent = 'Pause'; }
      after.draw();
      return;
    }
    if (phase !== 'ask' || !game.opts.secs) return;
    if (!paused) { paused = true; leftMs = Math.max(0, endsAt - performance.now()); stopClock(); $('pause').textContent = 'Go on'; $('hint').textContent = 'Paused. P or Go on starts the clock again.'; }
    else { paused = false; endsAt = performance.now() + leftMs; $('pause').textContent = 'Pause'; $('hint').textContent = 'Enter shows the answer early. P pauses.'; tick(); }
  }

  function reveal() {
    if (phase !== 'ask') return;
    const shelfQ = game.mode === 'shelf' ? game.qs[game.at] : null;
    stopClock();
    phase = 'reveal';
    const q = game.qs[game.at];
    const lis = [...$('answers').children];
    lis.forEach((li, i) => li.classList.add(i === q.answer ? 'right' : 'wrong'));
    drawRun(q, true);
    // A sound question shows its picture with the answer; a clip stops where it is.
    clockWaiting = false;
    if (clip) { $('media').classList.remove('listen'); $('ear').hidden = true; if (clip.kind !== 'still') { try { vid.pause(); } catch (e) { /* fine */ } } }
    $('fill').style.width = '0%';
    const s = q.source || {};
    const why = G.whyLine(q);
    $('why').textContent = why || ''; $('why').hidden = !why; // "and this is why it's right" (Bryan, 24 Nov 2026)
    const src = $('source');
    src.textContent = '';
    const b = document.createElement('b'); b.textContent = 'Source: ' + s.site;
    const a = document.createElement('a'); a.href = s.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = s.url.replace(/^https:\/\/(www\.)?/, ''); a.title = 'Open the source';
    src.append(b, ', ' + s.fact + '. ', a);
    if (q.source2) src.append(' Then: ' + q.source2.site + ', ' + q.source2.fact + '.');
    src.hidden = false;
    if (q.round === 'year-guess') return revealYear(q);
    if (game.opts.phones) {
      const tally = [0, 0, 0, 0];
      for (const p of room.players.values()) if (p.pick !== null) tally[p.pick]++;
      lis.forEach((li, i) => { li.querySelector('.tally').textContent = tally[i] ? String(tally[i]) : ''; });
      const gained = new Map();
      for (const p of room.players.values()) { const pts = pointsFor(p, q); p.score += pts; gained.set(p.seat, pts); }
      const ranks = G.standings([...room.players.values()]);
      for (const r of ranks) {
        const p = room.players.get(r.seat);
        send(r.seat, { type: 't-res', n: game.at, pick: p.pick, answer: q.answer, why: why ? why.slice(0, 240) : undefined, right: p.pick === q.answer, points: gained.get(r.seat), score: p.score, place: r.place, of: ranks.length });
      }
      $('where').textContent = '';
    }
    $('hint').textContent = shelfQ ? (shelfQ.final ? 'Enter to finish.' : 'Enter for the board.')
      : game.at + 1 < game.qs.length ? (game.opts.phones ? 'Enter for the scores.' : 'Enter for the next question.') : (game.opts.phones ? 'Enter for the final scores.' : 'Enter to finish.');
    autoNext($('hint'), revealWords);
  }

  // Closest Without Going Over, scored and told: the year, who was closest, and each phone its own result.
  function revealYear(q) {
    let line = '';
    if (game.opts.phones) {
      const guesses = new Map([...room.players.values()].map((p) => [p.seat, p.guess == null ? null : p.guess]));
      const gained = G.yearPoints(guesses, q.year);
      for (const p of room.players.values()) p.score += gained.get(p.seat) || 0;
      const winners = [...room.players.values()].filter((p) => (gained.get(p.seat) || 0) > 0);
      line = winners.length
        ? (winners[0].guess === q.year ? 'Spot on: ' : 'Closest without going over: ') + winners.slice(0, 4).map((p) => nameOf(p) + ' (' + p.guess + ')').join(', ') + (winners.length > 4 ? ' and ' + (winners.length - 4) + ' more' : '')
        : 'Nobody got under it without going over.';
      const ranks = G.standings([...room.players.values()]);
      for (const r of ranks) {
        const p = room.players.get(r.seat);
        send(r.seat, { type: 't-res', n: game.at, kind: 'year', guess: p.guess == null ? null : p.guess, year: q.year, right: (gained.get(r.seat) || 0) > 0, points: gained.get(r.seat) || 0, score: p.score, place: r.place, of: ranks.length });
      }
      $('where').textContent = '';
    }
    drawYear(q, true, line);
    $('hint').textContent = game.at + 1 < game.qs.length ? (game.opts.phones ? 'Enter for the scores.' : 'Enter for the next question.') : (game.opts.phones ? 'Enter for the final scores.' : 'Enter to finish.');
    autoNext($('hint'), revealWords);
  }

  function pointsFor(p, q) {
    const right = p.pick === q.answer;
    if (q.final) return G.settleWager(right, p.bet || 0);
    if (q.shelfValue) return right ? q.shelfValue : 0;
    return G.points(right, p.msLeft, game.opts.secs * 1000);
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
    paused = false; $('pause').textContent = 'Pause'; // a pause held over the answer does not carry onto the scores
    send('all', { type: 't-wait', text: 'Next question coming up.' });
    autoNext($('board-hint'), (n) => 'Next question in ' + n + '. Enter goes on now.');
  }

  function next() {
    clearAfter();
    if (phase === 'ask') return reveal();
    if (game.mode === 'shelf') {
      if (phase === 'wager') return askFinal();
      const q = game.qs[game.at];
      if (q && q.final) return finish();
      if (game.shelf.cats.every((c) => c.cells.every((x) => x.used))) return startWager();
      game.picker++;
      return showShelf();
    }
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
    const h = phase === 'board' ? $('board-hint') : phase === 'shelf' ? $('shelf-hint') : phase === 'wager' ? $('wager-hint') : $('hint'), was = h.textContent;
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
    // While the 18+ door shows, its two buttons take the keys: Tab or a remote's arrows move between them, Enter (or a
    // remote's OK) presses the one in focus, the gold one when the browser left its focus elsewhere at load, and a back key
    // means Not now.
    if (!$('gate').hidden) {
      if (G.keyAction(e) === 'back') { e.preventDefault(); shutDoor(false); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); shutDoor(document.activeElement !== $('gate-no')); }
      else if (/^(Tab|ArrowLeft|ArrowRight|ArrowUp|ArrowDown)$/.test(e.key)) { e.preventDefault(); (document.activeElement === $('gate-yes') ? $('gate-no') : $('gate-yes')).focus(); }
      return;
    }
    if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) && e.key !== 'Enter') return;
    if (e.key === 'f' || e.key === 'F') { full(); return; }
    if ((e.key === 'r' || e.key === 'R') && clip && phase === 'ask') { playClip(); return; }
    // On the board the arrows move between open squares and Enter (or a clicker's next) opens one.
    if (phase === 'shelf') {
      const mv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (mv) { e.preventDefault(); moveFocus(mv[0], mv[1]); return; }
      const a0 = G.keyAction(e);
      if (a0 === 'next') { e.preventDefault(); openCell(game.focus[0], game.focus[1]); return; }
      if (a0 === 'back') { e.preventDefault(); back(); }
      return;
    }
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
  $('wager').addEventListener('click', () => { if (phase === 'wager') next(); });
  for (const i of document.querySelectorAll('.setup input')) i.addEventListener('change', showAvailable);
  addEventListener('pagehide', closeRoom);

  fetch('bank/index.json').then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }).then((j) => { index = j; showAvailable(); if ($('gate').hidden) $('start').focus(); })
    .catch(() => { $('avail').textContent = 'The questions did not load. Check the connection and reload the page.'; });
})();
