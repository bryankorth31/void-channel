// VoidTV PLAY: the player page. Licence: GPL-2.0-or-later (play/LICENSE).
// Wires the blocks together: the card says what to load and which controls to draw, the hub turns every input into
// keys, the runner runs the core, the layout places the picture and the pad. ?game=<card id>, ?touch=1 to force the
// touch pad on, ?mute=1 for silent tests (nothing plays aloud on B's PC).
/* global PlayCards, PlayHub, PlayLayout, PlayTouch, PlaySaves, PlayRunner, PlayKeys */
(function () {
  'use strict';
  // The project's donation setting (scripts/lib/app.js DONATE_URL); play/test/page.test.js keeps the two the same.
  const DONATE_URL = 'https://square.link/u/bJl9PGAC';
  const DONATE_LINE = 'If you found this service helpful, please think of donating to keep it running and to make more services like this possible. Every donation goes to CASH (cashvalues.org) and feeds its mission in the real world.';

  const q = new URLSearchParams(location.search);
  const $ = (id) => document.getElementById(id);
  const base = new URL('./', location.href);
  // A TV's browser (plan T24): played with its remote or a gamepad, so it never draws the touch pad.
  const isTV = /SMART-TV|SmartTV|Tizen|Web0S|webOS|BRAVIA|Android TV|GoogleTV|CrKey|AFT[A-Z]|Roku|HbbTV/i.test(navigator.userAgent);
  const touchWanted = q.get('touch') === '1' || (q.get('touch') !== '0' && !isTV && matchMedia('(pointer: coarse)').matches);
  let sramKept = null;
  let card = null, build = null, runner = null, hub = null, pad = null, aspect = 4 / 3, touch = touchWanted, paused = false, started = false, padMode = false;

  for (const e of document.querySelectorAll('#donate-line, .donate-line')) e.textContent = DONATE_LINE;
  for (const e of document.querySelectorAll('#donate, .donate-link')) e.href = DONATE_URL;

  // A short note at the bottom of the picture; with undo, an Undo button for a few seconds.
  function toast(text, undo) {
    const e = $('toast'), b = $('toast-undo');
    $('toast-text').textContent = text;
    b.hidden = !undo; e.classList.toggle('has-undo', !!undo);
    b.onclick = undo ? () => { b.hidden = true; e.classList.remove('show', 'has-undo'); undo(); } : null;
    e.classList.add('show');
    clearTimeout(toast.t); toast.t = setTimeout(() => { e.classList.remove('show', 'has-undo'); b.hidden = true; }, undo ? 6000 : 2200);
  }
  const status = (t) => { $('status').textContent = t; };

  // The phone's own safe-area edges (the iPhone's home bar, rounded corners and notch), read from the phone through
  // env(safe-area-inset-*) on a hidden probe. ?inset=t,r,b,l stands in for a phone in tests.
  function insets() {
    const o = (q.get('inset') || '').split(',').map(Number);
    if (o.length === 4 && o.every((n) => n >= 0 && n < 200)) return { t: o[0], r: o[1], b: o[2], l: o[3] };
    let p = insets.probe;
    if (!p) { p = insets.probe = document.createElement('div'); p.className = 'inset-probe'; p.setAttribute('aria-hidden', 'true'); document.body.appendChild(p); }
    const s = getComputedStyle(p), n = (v) => Math.round(parseFloat(v) || 0);
    return { t: n(s.paddingTop), r: n(s.paddingRight), b: n(s.paddingBottom), l: n(s.paddingLeft) };
  }

  function place() {
    // The handheld shell: a phone (its short side up to 540 px) with the touch keys on, while a game plays.
    const shell = touch && !padMode && started && Math.min(innerWidth, innerHeight) <= 540;
    const ins = insets();
    // The picture may run under the edges (a game's picture under the home bar is fine); keys and the cross may not. Key
    // columns and the room under an upright picture are laid out inside the edges. A console pad sideways floats in its
    // own layer, which keeps inside them by itself, so the picture keeps its full size; controller mode has no keys.
    const sideFloat = touch && card && PlayCards.isPad(card) && innerWidth > innerHeight;
    const layIns = padMode ? null : sideFloat ? { t: ins.t, r: 0, b: 0, l: 0 } : ins;
    // In the shell a console pad floats over the side margins, so it needs no third key column: the picture gets the room.
    const L = PlayLayout.layout(innerWidth, innerHeight, aspect, touch, card ? (shell && PlayCards.isPad(card) ? 2 : PlayTouch.minCols(card)) : 2, padMode, shell, layIns);
    L.inset = ins;
    // Upright on a phone, the start screen says a sideways phone gives a bigger picture (audit: as a note during play it
    // covered the d-pad).
    if ($('cover-turn')) $('cover-turn').hidden = !(card && isPhone() && innerHeight > innerWidth && PlayCards.isPad(card));
    document.body.classList.toggle('padmode', padMode);
    document.body.classList.toggle('shell', shell);
    document.body.dataset.mode = L.mode;
    const set = (el, r) => { if (!r) { el.hidden = true; return; } el.hidden = false; Object.assign(el.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' }); };
    // A console pad floats in one layer: the whole stage sideways, the room under the picture upright.
    const floating = touch && card && PlayCards.isPad(card);
    set($('screen'), L.screen); set($('z-left'), floating ? null : L.left); set($('z-right'), floating ? null : L.right);
    set($('z-pad'), floating ? null : L.pad);
    // Sideways in the handheld shell the bar is away during play, so the pad layer takes the full height (the spacing
    // audit: with the bar's room kept, Start sat on the X button).
    const overTop = (shell ? 0 : PlayLayout.HEADER) + ins.t;
    set($('z-over'), floating && L.mode !== 'plain' ? (L.pad || { x: ins.l, y: overTop, w: innerWidth - ins.l - ins.r, h: innerHeight - overTop - ins.b }) : null);
    if (touch && hub && card) {
      const zones = floating ? { over: $('z-over'), mode: L.mode } : L.pad ? { pad: $('z-pad') } : { left: $('z-left'), right: $('z-right') };
      const sig = L.mode;
      if (place.sig !== sig) { pad = PlayTouch.build(zones, card, hub); place.sig = sig; }
    } else place.sig = '';
    $('b-touch').setAttribute('aria-pressed', String(touch));
    if (touch) PlayTouch.fit($('stage'));
  }

  // While the menu is open the game hears nothing: every held key is let go first, then the gamepad drives the menu.
  function setPaused(p) {
    if (!runner || !started || p === paused) return;
    if (p) { hub.releaseAll(); PlayTouch.releaseAll(); letGoMouse(); runner.rewind(false); paused = true; runner.pause(); autosave(); stayAwake(false); }
    else { paused = false; runner.resume(); runner.wakeSound(); stayAwake(true); }
    $('menu').hidden = !p; $('b-pause').textContent = p ? 'Resume' : 'Pause';
    document.body.classList.toggle('paused', p);
    // The engine credits and source offer move from the start screen into the pause menu once a game is on.
    if (p && $('credits').parentElement !== $('menu')) $('menu').appendChild($('credits'));
    if (!p) window.scrollTo(0, 0);
    if (p) $('m-resume').focus({ preventScroll: true }); else $('canvas').focus({ preventScroll: true });
  }

  // Continue (block C): an automatic slot per game, written when the menu opens, the tab hides, the page closes or Games
  // is pressed, under the same build rule as a manual save. The start screen then offers Continue.
  const AUTO = (c) => c.id + ':auto';
  let autoBusy = false, resumeState = null, autoTimer = 0;
  // A page that is closing cannot finish a save, so play also saves itself every 30 seconds (not while paused or hidden).
  const AUTO_EVERY_MS = 30000;
  // Bumped whenever play/core/host.c changes, so a browser fetches the rebuilt engines (2: cheats, 20 Nov 2026).
  const HOST_V = 'h3';   // 3: the battery save (host_sram), 20 Nov 2026
  async function autosave() {
    if (!started || !runner || autoBusy) return;
    autoBusy = true;
    // The game's own battery save, kept per game apart from save states, so a rebuilt engine or New game never loses it.
    try {
      if (runner.sram) {
        const b = await runner.sram();
        if (b && b.length) {
          const sig = b.length + ':' + b.reduce((s, x, i) => (s + x * (i % 251 + 1)) % 1000000007, 0);
          if (sig !== autosave.sramSig) { await PlaySaves.put(card.id + ':sram', b, {}); autosave.sramSig = sig; sramKept = b; }
        }
      }
    } catch (e) { /* best effort */ }
    // An arcade game keeps its own high-score table on this device (its battery memory; src/arcade-runner.js).
    try { if (runner.keepScores) await runner.keepScores(); } catch (e) { /* best effort */ }
    try { const s = await runner.save(); if (s) { await PlaySaves.put(AUTO(card), s, build); autosave.at = Date.now(); } } catch (e) { /* best effort */ }
    autoBusy = false;
  }
  function continueGame() {
    const rec = continueGame.rec;
    if (!rec) return begin();
    resumeState = rec.state;
    begin();
  }

  async function save() {
    if (!started) return;
    const state = await runner.save();
    if (!state && runner.saveWhy() === 'arcade') return toast('Arcade games cannot be saved yet');
    if (!state) return toast(runner.saveWhy() === 'dos' ? 'This game can be saved once it is past its DOS start menu' : 'The game could not be saved just now');
    try { await PlaySaves.put(card.id, state, build); toast('Saved in this browser'); keepStorage(); } catch (e) { toast('This browser would not keep the save'); }
  }
  // Load and Restart first keep where you are, so one wrong tap is undone with one tap.
  async function keepHere() { const s = await runner.save(); return s ? () => runner.load(s).then((ok) => toast(ok ? 'Back where you were' : 'That could not be undone')) : null; }
  async function load() {
    if (!started) return;
    let rec = null;
    try { rec = await PlaySaves.get(card.id); } catch (e) { /* no storage here */ }
    if (!rec) return toast('Nothing saved for this game yet');
    if (!PlaySaves.fits(rec, build)) return toast('That spot was saved with an older build of this game\'s engine, so it cannot load. Your in-game save is kept: load it from the game\'s own menu.');
    const undo = await keepHere();
    const ok = await runner.load(rec.state);
    toast(ok ? 'Back to your saved spot' : 'That save would not load', ok ? undo : null);
    if (ok) setPaused(false);
  }
  // Save to a file and Load from a file (whole-site audit, Bryan: "Yes, pass 2 and 3 to the lead"). One file per game: the
  // game's own battery save, the saved spot with the engine build that made it, and an arcade game's score table.
  // Nothing about the person is in the file or its name, and it never goes to voidtv.net: it is made and read here.
  const FILE_KIND = 'voidtv-play-save';
  const toB64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 32768) s += String.fromCharCode.apply(null, u8.subarray(i, i + 32768)); return btoa(s); };
  const fromB64 = (s) => { const b = atob(String(s)); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
  async function saveFile() {
    if (!started || !runner) return;
    const out = { kind: FILE_KIND, v: 1, game: card.id, title: card.title };
    try { const b = runner.sram && await runner.sram(); if (b && b.length) out.sram = toB64(b); } catch (e) { /* none */ }
    try {
      const s = await runner.save();
      if (s) out.spot = { core: build.core, commit: build.commit, state: toB64(new Uint8Array(s)) };
    } catch (e) { /* none */ }
    try {
      if (runner.keepScores) await runner.keepScores();
      const nv = await PlaySaves.get(card.id + ':nvram');
      if (nv && nv.state && typeof nv.state === 'object') {
        out.scores = { stamp: nv.stamp, files: {} };
        for (const [k, v] of Object.entries(nv.state)) out.scores.files[k] = toB64(new Uint8Array(v));
      }
    } catch (e) { /* none */ }
    if (!out.sram && !out.spot && !out.scores) return toast(runner.saveWhy() === 'dos' ? 'This game can be saved once it is past its DOS start menu' : 'Nothing to save for this game yet');
    const url = URL.createObjectURL(new Blob([JSON.stringify(out)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'voidtv-' + card.id + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    toast('Saved to a file on this device');
    keepStorage();
  }
  async function loadFile(file) {
    if (!started || !runner || !file) return;
    let f = null;
    try { f = JSON.parse(await file.text()); } catch (e) { /* not ours */ }
    if (!f || f.kind !== FILE_KIND) return toast('That file is not a PLAY save');
    if (f.game !== card.id) return toast('That file is for ' + (typeof f.title === 'string' ? f.title.slice(0, 60) : 'another game') + ', not this game');
    try {
      // The score table comes back for the next start (an arcade machine reads it on power-on).
      if (f.scores && f.scores.files) {
        const files = {}; for (const [k, v] of Object.entries(f.scores.files)) if (/^[A-Za-z0-9._ -]{1,80}$/.test(k)) files[k] = fromB64(v);
        await PlaySaves.put(card.id + ':nvram', files, { stamp: f.scores.stamp });
        if (isArcade()) return toast('The high scores are back: they show the next time this game starts');
      }
      const spot = f.spot && f.spot.state ? { state: fromB64(f.spot.state).buffer, core: f.spot.core, commit: f.spot.commit } : null;
      const sram = f.sram ? fromB64(f.sram) : null;
      if (sram) { await PlaySaves.put(card.id + ':sram', sram, {}); sramKept = sram; autosave.sramSig = ''; }
      if (spot && PlaySaves.fits(spot, build)) {
        await PlaySaves.put(card.id, spot.state, build);
        const undo = await keepHere();
        const ok = await runner.load(spot.state.slice(0));
        toast(ok ? 'Back to the spot saved in the file' : 'That save would not load', ok ? undo : null);
        if (ok) setPaused(false);
        return;
      }
      if (sram && runner.sramSet) {
        const ok = await runner.sramSet(sram);
        toast(spot ? 'The spot in that file was saved with an older build of this game\'s engine, so it cannot load. The game started over with its own save from the file: load it from the game\'s menu.'
          : ok ? 'The game started over with its own save from the file: load it from the game\'s menu.' : 'That save would not load');
        if (ok) setPaused(false);
        return;
      }
      toast(spot ? 'That file was saved with an older build of this game\'s engine, so it cannot load' : 'That file has nothing this game can load');
    } catch (e) { toast('That file would not load'); }
  }
  // Ask the browser once to keep PLAY's saves when the device runs low on space (no question of ours, nothing said if
  // it says no). Asked after the first Play or save, a tap the browser can see; remembered so it is never asked again.
  function keepStorage() {
    try {
      if (!navigator.storage || !navigator.storage.persist || localStorage.getItem('voidtv-play-keep')) return;
      localStorage.setItem('voidtv-play-keep', '1');
      navigator.storage.persisted().then((yes) => (yes ? true : navigator.storage.persist())).catch(() => {});
    } catch (e) { /* storage off */ }
  }

  async function restart() {
    if (!started) return;
    const undo = await keepHere();
    runner.reset(); setPaused(false);
    toast('The game started over', undo);
  }

  // Our own actions: menu and keyboard on the press; rewind for as long as it is held (console games).
  function action(name) {
    if (name === 'rewind') { if (runner && !paused) runner.rewind(true); return; }
    if (name === 'click' || name === 'rclick') { ptrButtons |= name === 'click' ? 1 : 2; sendMouse(0, 0); return; }
    if (name === 'menu') setPaused(!paused);
    else if (name === 'keyboard' && pad && !paused) pad.keyboard.classList.toggle('open');
  }

  // The menu with a gamepad: the d-pad or stick moves between its buttons, A presses one, B or Start goes back to the
  // game. Each acts when the button is let go, so nothing still held reaches the game afterwards.
  const menuWas = new Map();
  function menuPads(pads) {
    // The menu in order; while the Cheats list is open its switches come right after the Cheats button (audit: a pad
    // could not reach them, and Down landed on Back to the games).
    let items = [...$('menu').querySelectorAll('.menu-row button, .menu-row a')].filter((x) => x.offsetParent);
    const cheatsOpen = !$('cheats').hidden;
    if (cheatsOpen) { const at = items.indexOf($('m-cheats')) + 1; items.splice(at, 0, ...$('cheat-list').querySelectorAll('input')); }
    for (const p of pads) {
      if (!p || p.mapping !== 'standard') continue;
      const b = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
      const now = { prev: b(12) || b(14) || p.axes[1] < -0.6 || p.axes[0] < -0.6, next: b(13) || b(15) || p.axes[1] > 0.6 || p.axes[0] > 0.6,
        a: b(0), back: b(1) || (b(9) && !b(8)) };
      const was = menuWas.get(p.index) || {};
      const released = (k) => was[k] && !now[k];
      const i = items.indexOf(document.activeElement);
      const go = (el) => { el.focus(); el.scrollIntoView({ block: 'nearest' }); };
      if (now.prev && !was.prev) go(items[(i <= 0 ? items.length : i) - 1]);
      if (now.next && !was.next) go(items[(i + 1) % items.length]);
      if (released('a') && i >= 0) items[i].click();
      else if (released('back')) { if (cheatsOpen) { showCheats(false); go($('m-cheats')); } else setPaused(false); }
      menuWas.set(p.index, now);
    }
  }

  // Phones as gamepads (Bryan, 20 Nov 2026: "Yes, phone controllers"): a phone that scans the code on this screen joins
  // as one more standard gamepad, so it takes a seat, keeps it and drops like a real one (src/phones.js, play/rooms/).
  let phones = null;
  const allPads = () => [...(navigator.getGamepads ? [...navigator.getGamepads()] : []), ...(phones ? phones.pads() : [])];
  const phoneWord = (code) => PlayCards.actionFor(card, code) || (window.PlayTouch && PlayTouch.label ? PlayTouch.label(code) : code);
  const phoneCard = () => PlayPhones.cardFor(card, card ? PlayCards.gamepadMap(card) : {}, phoneWord);
  function phonesList(list) {
    const ul = $('phones-list'); ul.textContent = '';
    for (const p of list) {
      const li = document.createElement('li');
      li.textContent = (p.player ? 'Player ' + p.player : 'Phone ' + p.seat) + (p.delay === null ? '' : ', delay ' + p.delay + ' ms' + (p.delay > 120 ? ': presses will feel late' : ''));
      if (p.delay > 120) li.className = 'slow';
      const x = document.createElement('button'); x.type = 'button'; x.className = 'tool small'; x.textContent = 'Remove';
      x.setAttribute('aria-label', 'Remove ' + li.textContent.split(',')[0]); x.onclick = () => phones.remove(p.seat);
      li.appendChild(x);
      ul.appendChild(li);
    }
    if (!list.length) { const li = document.createElement('li'); li.textContent = 'No phones yet'; ul.appendChild(li); }
    const lock = $('phones-lock');
    lock.textContent = phones && phones.locked ? 'Let new phones in' : 'Lock: no new phones';
    lock.setAttribute('aria-pressed', String(!!(phones && phones.locked)));
  }
  function showPhones(open) {
    $('phones').hidden = !open; $('b-phones').setAttribute('aria-expanded', String(open));
    if (!open) return;
    if (!phones) phones = PlayPhones.create({ card: phoneCard, change: phonesList });
    $('phones-code').textContent = '....'; $('phones-site').textContent = location.host + '/join';
    phones.open().then((room) => {
      $('phones-code').textContent = room.code;
      $('phones-qr').innerHTML = PlayQR.svg(room.join, 8);
      phonesList(phones.list());
    }).catch((e) => { $('phones-code').textContent = ''; toast(e.message); });
  }
  $('b-phones').onclick = () => showPhones($('phones').hidden);
  $('phones-close').onclick = () => showPhones(false);
  $('phones-lock').onclick = () => { if (phones) phones.lock(!phones.locked); };
  addEventListener('pagehide', () => { if (phones) phones.close(); });

  // Gamepads are read once a frame. Before the game starts, a gamepad's A or Start presses Play, so a controller goes
  // from the shelf into the game with nothing else to touch.
  let padWasDown = true;
  function poll() {
    const pads = allPads();
    if (hub) {
      hub.pollPads(pads); if (phones) phones.seats((i) => hub.seat(i));
      if (!padMode && touchWanted && pads.some((p) => p && p.index < PlayPhones.BASE && p.mapping === 'standard' && p.buttons.some((b) => b.pressed))) controllerMode(true); if (paused) menuPads(pads); else { menuWas.clear(); padMouse(pads); }
      // A game started straight from the shelf (audit S6) has had no tap here yet: the first gamepad press wakes the sound.
      if (runner && pads.some((p) => p && p.buttons && p.buttons.some((b) => b.pressed))) runner.wakeSound();
    }
    else {
      const down = pads.some((p) => p && p.mapping === 'standard' && ((p.buttons[0] && p.buttons[0].pressed) || (p.buttons[9] && p.buttons[9].pressed)));
      if (down && !padWasDown && !$('b-play').hidden) (document.activeElement === $('b-continue') ? continueGame() : begin());
      padWasDown = down;
    }
    requestAnimationFrame(poll);
  }

  // If the game has not shown a picture by then, say why in one sentence and offer Play again: never "loading" forever.
  const DEADLINE_MS = 60000;
  let deadline = 0;

  // Phones and tablets (plan T22): on a phone, Play goes fullscreen and turns the screen sideways where the browser
  // allows it (Android; an iPhone page cannot), and while a game runs the screen stays awake.
  const isPhone = () => matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600;
  function phoneScreen() {
    if (!isPhone() || !document.fullscreenEnabled || document.fullscreenElement) return;
    document.documentElement.requestFullscreen({ navigationUI: 'hide' })
      .then(() => (screen.orientation && screen.orientation.lock ? screen.orientation.lock('landscape') : null))
      .catch(() => {});
  }
  let wake = null;
  function stayAwake(on) {
    if (on && !wake && navigator.wakeLock && !document.hidden) navigator.wakeLock.request('screen').then((w) => { wake = w; w.addEventListener('release', () => { wake = null; }); }).catch(() => {});
    if (!on && wake) { wake.release().catch(() => {}); wake = null; }
  }

  const isArcade = () => !!(card && PlayCards.CORES[card.core] && PlayCards.CORES[card.core].kind === 'mame');
  function begin() {
    keepStorage();
    window.scrollTo(0, 0);
    if (!$('phones').hidden) showPhones(false);   // the code steps aside for the game; the Phones button brings it back
    // MAME's classic module cannot start over in place: once one has run, a new start is the page loaded again.
    if (isArcade() && runner) return runner.reset();
    stopGame();
    phoneScreen();
    $('b-play').hidden = true; $('b-continue').hidden = true; status('Starting');
    deadline = setTimeout(() => fail('The game did not arrive from the Internet Archive in time. Check the connection and press Play to try again.'), DEADLINE_MS);
    runner = (isArcade() ? PlayArcade : PlayRunner).createRunner({ canvas: $('canvas'), mute: q.get('mute') === '1', on: {
      note: (t) => toast(t),
      status, error: (t) => fail(t),
      ready: () => { started = true; applyCheats(); place.sig = ''; place(); },
      cheats: (m) => { if (!m.ok) toast('This game\'s engine cannot take cheats'); else if (m.on) toast(m.on === 1 ? 'One cheat on' : m.on + ' cheats on'); },
      firstFrame: () => {
        clearTimeout(deadline); $('cover').hidden = true; $('canvas').focus({ preventScroll: true }); stayAwake(true); armBack();
        if (!PlayCards.isPad(card)) blankWatch();
        if (resumeState) { const s = resumeState; resumeState = null; runner.load(s).then((ok) => toast(ok ? 'Back where you left off' : 'That spot would not load; starting fresh')); }
      },
      aspect: (a) => { if (Math.abs(a - aspect) > 0.01) { aspect = a; place(); } },
    } });
    runner.prepareSound();                     // in the Play tap itself, so iPhone and iPad allow the sound
    hub = PlayHub.createHub({ send, onAction: action, onSeat: seatNote,
      onRelease: (name) => {
        if (name === 'rewind' && runner) runner.rewind(false);
        if (name === 'click' || name === 'rclick') { ptrButtons &= name === 'click' ? ~1 : ~2; sendMouse(0, 0); }
      } });
    hub.setCard(card, PlayCards.gamepadMap(card));
    runner.start(card, base, build.commit.slice(0, 12) + HOST_V, sramKept);
    autoTimer = setInterval(() => { if (started && !paused && !document.hidden) autosave(); }, AUTO_EVERY_MS);
    place.sig = ''; place();
  }

  // Audit D-2: some older DOS games keep the screen black for up to half a minute after they start. While the picture
  // has no more than a couple of colours, say so now and then, so nobody thinks it froze; stop once it shows something.
  function blankWatch() {
    const t0 = Date.now(), cv = $('canvas');
    const said = new Set();
    const tick = setInterval(() => {
      if (!started || !runner || Date.now() - t0 > 30000) return clearInterval(tick);
      let colours = new Set();
      try {
        const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
        for (let i = 0; i < d.length && colours.size < 4; i += 4 * 97) colours.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
      } catch (e) { return clearInterval(tick); }
      if (colours.size > 2) return clearInterval(tick);
      const at = Math.floor((Date.now() - t0) / 1000);
      for (const s of [3, 15]) if (at >= s && !said.has(s)) { said.add(s); toast('Older games can take half a minute to start'); }
    }, 1000);
  }

  // Couch mode (plan T18): say when a seat changes hands, and pause when a playing pad drops (a flat battery), the way
  // a console does, so nobody loses a life while they find the cable. The seat stays held for that pad.
  function seatNote(seat, what) {
    if (what === 'away' && padMode && !(navigator.getGamepads ? [...navigator.getGamepads()] : []).some((p) => p && p.connected)) controllerMode(false);
    const two = card && (card.players || 1) > 1;
    if (what === 'away') {
      if (started && !paused) setPaused(true);
      toast(two ? 'Player ' + seat + '’s controller dropped. Its place is kept' : 'Controller dropped. Paused');
    } else if (what === 'back') toast(two ? 'Player ' + seat + ' is back' : 'Controller back');
    else if (two && seat > 1) toast('Player ' + seat + ' joined');
  }

  // A DOS game's mouse (plan T21b; Bryan, 20 Nov 2026: "lets solve these problems"), on a card with controls.mouse.
  // On a computer a click on the picture hands the mouse to the game (pointer lock) and Esc lets it go. On a touch
  // screen the picture is a trackpad: drag moves, a tap is the left button, a two-finger tap the right. On a gamepad
  // the right stick moves, R3 is the left button and L3 the right. Nothing reaches the game while it is paused.
  const TOUCH_SPEED = 1.5, STICK_SPEED = 14, STICK_DEAD = 0.15, HOLD_MS = 350;
  const MOUSE_HOW = { keyboard: 'click the picture to use your mouse (Esc lets it go)',
    touch: 'drag on the picture to move, tap to click, two-finger tap for the right button, hold then drag to drag; or the L click and R click keys',
    pad: 'the right stick moves, RB clicks, RT right-clicks' };
  const wantsMouse = () => !!(card && card.controls && card.controls.mouse && !PlayCards.isPad(card));
  let ptrButtons = 0, padButtons = 0;
  const cv = $('canvas');
  function sendMouse(dx, dy) { if (runner && started && !paused && wantsMouse()) runner.mouse(dx, dy, ptrButtons | padButtons); }
  function letGoMouse() {
    ptrButtons = 0; padButtons = 0;
    if (runner && wantsMouse()) runner.mouse(0, 0, 0);
    if (document.pointerLockElement === cv && document.exitPointerLock) document.exitPointerLock();
  }
  cv.addEventListener('click', () => {
    if (!wantsMouse() || !started || paused || document.pointerLockElement === cv || !cv.requestPointerLock) return;
    try { const r = cv.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* the browser said no */ }
  });
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === cv) toast('The mouse is in the game. Esc lets it go');
    else {
      ptrButtons = 0; sendMouse(0, 0);
      // Audit M1: Esc lets the mouse go (the browser keeps that key while the pointer is locked), so letting go during
      // play pauses, as browser PC games do; a click on the picture after Resume takes the mouse again.
      if (started && !paused && wantsMouse()) { setPaused(true); toast('Paused. Resume, then click the picture to play'); }
    }
  });
  addEventListener('mousemove', (e) => { if (document.pointerLockElement === cv) sendMouse(e.movementX, e.movementY); });
  addEventListener('mousedown', (e) => { if (document.pointerLockElement === cv) { e.preventDefault(); ptrButtons = e.buttons & 7; sendMouse(0, 0); } });
  addEventListener('mouseup', (e) => { if (document.pointerLockElement === cv) { ptrButtons = e.buttons & 7; sendMouse(0, 0); } });
  cv.addEventListener('contextmenu', (e) => { if (wantsMouse()) e.preventDefault(); });
  const fingers = new Map();
  let tapAt = 0, travel = 0, most = 0, holdTimer = 0, holding = false;
  function tapClick(b) { ptrButtons = b; sendMouse(0, 0); setTimeout(() => { ptrButtons = 0; sendMouse(0, 0); }, 90); }
  cv.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch' || !wantsMouse() || !started) return;
    e.preventDefault();
    if (!fingers.size) {
      tapAt = Date.now(); travel = 0; most = 0; holding = false;
      // Hold still a moment, then drag: the left button stays down for the drag (moving a unit, a window, a slider).
      clearTimeout(holdTimer);
      holdTimer = setTimeout(() => { if (fingers.size === 1 && travel < 8) { holding = true; ptrButtons |= 1; sendMouse(0, 0); } }, HOLD_MS);
    }
    fingers.set(e.pointerId, [e.clientX, e.clientY]); most = Math.max(most, fingers.size);
    try { cv.setPointerCapture(e.pointerId); } catch (x) { /* synthetic pointers */ }
  });
  cv.addEventListener('pointermove', (e) => {
    const f = fingers.get(e.pointerId);
    if (!f) return;
    const dx = e.clientX - f[0], dy = e.clientY - f[1];
    fingers.set(e.pointerId, [e.clientX, e.clientY]);
    if (fingers.size === 1) { travel += Math.abs(dx) + Math.abs(dy); sendMouse(dx * TOUCH_SPEED, dy * TOUCH_SPEED); }
  });
  const lift = (e) => {
    if (!fingers.delete(e.pointerId) || fingers.size) return;
    clearTimeout(holdTimer);
    if (holding) { holding = false; ptrButtons &= ~1; sendMouse(0, 0); return; }
    if (Date.now() - tapAt < 300 && travel < 12) tapClick(most >= 2 ? 2 : 1);
  };
  cv.addEventListener('pointerup', lift);
  cv.addEventListener('pointercancel', lift);
  function padMouse(pads) {
    if (!wantsMouse()) return;
    const p = pads.find((x) => x && x.mapping === 'standard');
    if (!p) return;
    const lean = (v) => (Math.abs(v || 0) < STICK_DEAD ? 0 : Math.sign(v) * v * v * STICK_SPEED);
    const dx = lean(p.axes[2]), dy = lean(p.axes[3]);
    const b = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
    const now = (b(5) || b(11) ? 1 : 0) | (b(7) || b(10) ? 2 : 0);
    if (dx || dy || now !== padButtons) { padButtons = now; sendMouse(dx, dy); }
  }

  // Ends the game for good: the engine stops, nothing it sent late reaches the page, the menu closes.
  function stopGame() {
    clearTimeout(deadline); clearInterval(autoTimer); stayAwake(false);
    if (runner) runner.stop();
    runner = null; hub = null; started = false; paused = false;
    padState.fill(0); $('menu').hidden = true; $('b-pause').textContent = 'Pause';
  }

  // A console button (P1:A, P2:Start) goes to that player's pad as one bit; anything else is a PC key. While the menu
  // is open nothing new goes down (letting go still goes through, so nothing is left stuck).
  const PAD_BITS = { B: 0, Y: 1, Select: 2, Start: 3, Up: 4, Down: 5, Left: 6, Right: 7, A: 8, X: 9, L: 10, R: 11 };
  const padState = [0, 0, 0, 0];
  function send(code, down) {
    if (!runner || (paused && down)) return;
    const m = /^P([1-4]):([A-Za-z]+)$/.exec(code);
    if (!m) return runner.key(code, down);
    const port = +m[1] - 1, bit = 1 << PAD_BITS[m[2]];
    padState[port] = down ? padState[port] | bit : padState[port] & ~bit;
    runner.pad(port, padState[port]);
  }

  function fail(text) {
    stopGame();
    status(text); $('cover').hidden = false;
    $('b-play').textContent = 'Play again'; $('b-play').hidden = false;
  }

  // The start screen (block B): the item's own picture from the Archive (through /cors/, which this isolated page may
  // load), the title, year, maker and machine, and the first three actions for the input in hand.
  const SYSTEM_NAMES = { dos: 'PC (DOS)', a2600: 'Atari 2600', nes: 'NES', snes: 'Super Nintendo', genesis: 'Sega Genesis', sms: 'Master System', gamegear: 'Game Gear', gameboy: 'Game Boy', gbcolor: 'Game Boy Color', gba: 'Game Boy Advance', lynx: 'Atari Lynx', arcade: 'Arcade' };
  function device() {
    const pads = allPads();
    if (pads.some((p) => p && p.mapping === 'standard')) return 'pad';
    return touch ? 'touch' : 'keyboard';
  }
  function cover(c) {
    $('cover-title').textContent = c.title;
    $('cover-meta').textContent = [c.year, c.publisher, SYSTEM_NAMES[c.system]].filter(Boolean).join(' · ');
    const art = $('cover-art');
    art.onload = () => { art.hidden = false; }; art.onerror = () => { art.hidden = true; };
    art.src = 'https://archive.org/cors/' + c.archive.item + '/__ia_thumb.jpg';
    const where = { pad: 'gamepad', touch: 'screen', keyboard: 'keyboard' }[device()];
    const ul = $('cover-actions'); ul.textContent = '';
    for (const l of PlayCards.actionLines(c, device() === 'touch' ? 'touch' : device()).filter((x) => x.how).slice(0, 3)) {
      const li = document.createElement('li'); const b = document.createElement('b'); b.textContent = l.do;
      li.append(b, ': ' + l.how); ul.appendChild(li);
    }
    if (c.controls && c.controls.mouse && !PlayCards.isPad(c)) {
      const li = document.createElement('li'); const b = document.createElement('b'); b.textContent = 'Plays with a mouse';
      li.append(b, ': ' + MOUSE_HOW[device()]); ul.insertBefore(li, ul.firstChild);
    }
    ul.setAttribute('aria-label', 'How to play on the ' + where);
  }
  addEventListener('gamepadconnected', () => { if (card && !started) cover(card); });

  // The pause menu's Controls: the card's actions, each with how to do it on a gamepad, the keyboard and the screen
  // (PlayCards.actionLines), then one line on how to pause. A game is described once, on its card.
  function controls(c) {
    const ul = $('controls'); ul.textContent = '';
    for (const l of PlayCards.actionLines(c)) {
      const li = document.createElement('li'); const b = document.createElement('b'); b.textContent = l.do;
      li.append(b, ': ' + l.how); ul.appendChild(li);
    }
    if (PlayCards.isPad(c)) {
      const li = document.createElement('li'); const b = document.createElement('b'); b.textContent = 'Rewind';
      li.append(b, ': hold the left trigger (LT) on a gamepad, R on the keyboard, ◀◀ on screen (up to 20 seconds back)'); ul.appendChild(li);
    }
    if (PlayCards.isPad(c) && (c.players || 1) > 1) {
      const li = document.createElement('li'); const b = document.createElement('b'); b.textContent = 'Two players';
      li.append(b, ': a second gamepad plays as player 2, and each pad keeps its player all game'); ul.appendChild(li);
    }
    if (c.controls && c.controls.mouse && !PlayCards.isPad(c)) {
      const li = document.createElement('li'); const b = document.createElement('b'); b.textContent = 'Mouse';
      li.append(b, ': ' + MOUSE_HOW.keyboard + '; on a touch screen ' + MOUSE_HOW.touch + '; on a gamepad ' + MOUSE_HOW.pad); ul.appendChild(li);
      $('canvas').style.touchAction = 'none';
    }
    const esc = PlayCards.isPad(c) ? ', Esc on the keyboard' : '';
    $('pause-how').textContent = 'Pause: Back and Start together on a gamepad' + esc + ', or the Pause button.';
  }

  // The PC keyboard: every key the PC knew goes to the game; our own shortcuts stay out of its way.
  // Back (plan T24): a TV remote's Back, a phone's back gesture or the browser's Back opens the pause menu instead of
  // leaving the game; Back again from the menu leaves. Done with one history step pushed when the game starts.
  const BACK_KEYS = new Set(['GoBack', 'BrowserBack']);
  const BACK_CODES = new Set([461, 10009]); // webOS and Tizen remotes
  let backArmed = false;
  function armBack() { if (!backArmed) { history.pushState({ play: 1 }, ''); backArmed = true; } }
  addEventListener('popstate', () => {
    if (!backArmed) return;
    backArmed = false;
    if (started && !paused) { setPaused(true); armBack(); } // first Back: the menu; the next one leaves
    else toShelf();
  });
  // Audit B2: from the menu, Back goes to the shelf by its address. Stepping history back could skip the shelf and
  // leave voidtv.net (on a TV, the app) when the shelf was not the page before.
  // Audit B3: the menu saved as it opened, so a save from the last 5 seconds is enough and Back goes at once; an older
  // one is made first, and says so.
  function toShelf() {
    const go = () => location.assign($('b-games').href);
    if (Date.now() - (autosave.at || 0) < 5000) return go();
    toast('Saving your spot'); autosave().then(go);
  }
  function remoteKey(e) {
    if (!started) return false;
    if (BACK_KEYS.has(e.key) || BACK_CODES.has(e.keyCode)) { e.preventDefault(); if (!paused) setPaused(true); else toShelf(); return true; }
    if (e.key === 'MediaPlayPause' || e.key === 'MediaPause' || e.key === 'MediaPlay') { e.preventDefault(); setPaused(e.key === 'MediaPlay' ? false : e.key === 'MediaPause' ? true : !paused); return true; }
    return false;
  }

  function keyEvent(e, down) {
    if (down && remoteKey(e)) return;
    // An arcade game hears the PC keyboard itself (MAME's own key seats); keys our runner sends for the gamepad and the
    // touch pad are not fed back. Esc is caught before MAME sees it (arcadeEsc, below).
    if (runner) runner.wakeSound();   // first, so a key wakes an arcade game's sound too (audit, 20 Nov 2026)
    if (isArcade()) return;
    // Keys go to the game unless the pause menu is open and has the focus. A hidden panel never keeps them.
    if (!hub || !started || (!$('menu').hidden && e.target.closest('.menu'))) return;
    if (e.code === 'F11') return;
    // A console game: the card's keyboard seats (arrows, Z X A S Q W, Enter); a DOS game: the key itself.
    const keys = PlayCards.keyMap(card);
    const code = keys ? keys[e.code] : e.code;
    if (!code || (!keys && !PlayKeys.known(code))) return;
    e.preventDefault();
    if (!e.repeat) hub.keyboard(code, down);
  }
  // Arcade: Esc pauses and never reaches MAME, where it quits the game. Caught first, before any other listener.
  function arcadeEsc(e) {
    if (!isArcade() || !started || e.code !== 'Escape' || !e.isTrusted) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.type === 'keydown' && !e.repeat) setPaused(!paused);
  }
  addEventListener('keydown', arcadeEsc, true);
  addEventListener('keyup', arcadeEsc, true);
  // The PC keyboard's coin keys get the same short pulse as the pad, touch and phones (the runner's key()): some machines
  // ignore a coin held a quarter second, and a typed 5 can be held that long (audit, 20 Nov 2026). Caught before MAME.
  function arcadeCoin(e) {
    if (!isArcade() || !started || !e.isTrusted || (e.code !== 'Digit5' && e.code !== 'Digit6')) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (runner) runner.wakeSound();   // keyEvent never sees these keys, so they wake the sound here (iPad with a keyboard)
    if (e.type === 'keydown' && !e.repeat && runner) runner.key(e.code, true);
  }
  addEventListener('keydown', arcadeCoin, true);
  addEventListener('keyup', arcadeCoin, true);
  addEventListener('keydown', (e) => keyEvent(e, true));
  addEventListener('keyup', (e) => keyEvent(e, false));
  addEventListener('pointerdown', () => runner && runner.wakeSound(), { passive: true });
  addEventListener('blur', () => hub && hub.releaseAll());
  document.addEventListener('visibilitychange', () => { if (document.hidden && started) { if (!paused) setPaused(true); else autosave(); } });
  addEventListener('resize', place);
  // Turning the phone mid-game: nothing stays held down across the change (the keys move under the thumbs).
  addEventListener('orientationchange', () => { if (hub) hub.releaseAll(); PlayTouch.releaseAll(); });
  // The audit (Bryan: "3 of the directional buttons locked down" after a zoom): when the browser takes a touch for itself,
  // the finger's own lift never reaches the key. So when the last finger leaves the screen, or the page is zoomed, every
  // touch key and the d-pad let go, and their lights go out.
  for (const ev of ['touchend', 'touchcancel']) document.addEventListener(ev, (e) => { if (!e.touches.length) PlayTouch.releaseAll(); }, true);
  if (window.visualViewport) visualViewport.addEventListener('resize', () => PlayTouch.releaseAll());

  // Controller mode (Bryan, 20 Nov 2026: "people use game controllers on their phone ... the screen becomes the entire game
  // screen ... and no longer needs the controllers on the screen"). On a touch screen, the first press on a real gamepad
  // (not a phone joined through Phones: that mode belongs to the big screen) hides the touch keys and the bar, and the
  // picture fills the screen. A tap shows the bar for a few seconds; Touch brings the keys back; a pad that drops brings
  // them back too, with the usual pause.
  function controllerMode(on) {
    if (padMode === on || !touchWanted) return;
    padMode = on;
    touch = on ? false : touchWanted;
    place.sig = ''; place();
    if (on) toast('Controller found: the game fills the screen. Tap it for the bar');
  }
  let barTimer = 0;
  $('stage').addEventListener('pointerdown', (e) => {
    if (!(padMode || document.body.classList.contains('shell')) || e.target.closest('.menu, .give, .give-card, .phones, .pk, .pdpad, .zone')) return;
    document.body.classList.add('showbar'); clearTimeout(barTimer); barTimer = setTimeout(() => document.body.classList.remove('showbar'), 3000);
  });

  $('b-pause').onclick = () => setPaused(!paused);
  $('m-resume').onclick = () => setPaused(false);
  $('m-reset').onclick = restart;

  // The donation (Bryan, 20 Nov 2026: "a little cross icon someplace on the bottom"): a tap pauses the game and opens a
  // small card with the line and the link; closing it goes back to the game as it was.
  let giveResume = false;
  function showGive(open) {
    if (!$('give-card')) return;
    if (open) { giveResume = started && !paused; if (giveResume) setPaused(true); $('menu').hidden = true; }
    $('give-card').hidden = !open;
    if (!open) { if (giveResume) setPaused(false); else if (paused) $('menu').hidden = false; giveResume = false; }
  }
  if ($('give')) { $('give').onclick = () => showGive($('give-card').hidden); $('give-close').onclick = () => showGive(false); }
  // A phone that scrolled before (or turned sideways) goes back to the top: the page is one screen.
  for (const ev of ['resize', 'orientationchange']) addEventListener(ev, () => window.scrollTo(0, 0));

  // iPhone Safari zooms on two fast taps even where touch-action says not to (Bryan, a private tab: "It's going to keep
  // happening as you tap the buttons"). Cancelling the touch itself stops the zoom; the keys run on pointer events,
  // which still come first. The two buttons that work by click (the keyboard toggle and Hide keyboard) are left alone,
  // and so is pinch zoom on the rest of the page.
  // The whole game area, gaps between keys included (Bryan: the double tap made the page scroll and stick). Buttons and
  // links that work by click (Play, the menu, the cross and its card, the keyboard toggle) keep their taps.
  const noZoom = (e) => { if (!e.target.closest('.pkbd, .pkclose, button:not(.pk), a, input, label, .menu, .give-card, .phones')) e.preventDefault(); };
  for (const ev of ['touchstart', 'touchend']) $('stage').addEventListener(ev, noZoom, { passive: false });
  // The bar and the cross keep their taps, so a second tap within 350 ms there is cancelled instead (audit C): one tap
  // still works, two fast ones cannot zoom.
  let lastEnd = 0;
  const guard = (e) => { const now = e.timeStamp || Date.now(); if (now - lastEnd < 350) e.preventDefault(); lastEnd = now; };
  document.querySelector('.bar').addEventListener('touchend', guard, { passive: false });   // the cross is in the bar

  // Cheats (Bryan, 20 Nov 2026: "add toggle for cheats"): a console game whose engine takes cheats lists them in the pause
  // menu, each a switch; the ones switched on are kept for the game in this browser and set again when it starts. The
  // codes come from libretro-database (CC BY-SA 4.0; play/tools/cheats.js), credited under the list.
  const CHEAT_CORES = ['snes9x', 'fceumm', 'gambatte', 'genesis-plus-gx', 'mgba'];
  let cheatList = null, cheatsOn = new Set();
  const cheatKey = () => 'voidtv-cheats:' + card.id;
  function applyCheats() { if (runner && runner.cheats && cheatList && started) runner.cheats([...cheatsOn].sort((a, b) => a - b).map((i) => cheatList[i].code)); }
  function drawCheats() {
    const ul = $('cheat-list'); ul.textContent = '';
    cheatList.forEach((ch, i) => {
      const li = document.createElement('li'), box = document.createElement('input'), lab = document.createElement('label');
      box.type = 'checkbox'; box.id = 'cheat-' + i; box.checked = cheatsOn.has(i);
      lab.htmlFor = box.id; lab.textContent = ch.name + (ch.risky ? ' (can break the game)' : '');
      box.onchange = () => {
        if (box.checked) cheatsOn.add(i); else cheatsOn.delete(i);
        // Kept by code, not by place in the list, so a list pulled again in another order switches on the same cheats (audit).
        try { localStorage.setItem(cheatKey(), JSON.stringify([...cheatsOn].map((n) => cheatList[n].code))); } catch (e) { /* kept for this visit only */ }
        if (started) applyCheats();
      };
      li.append(box, lab); ul.appendChild(li);
    });
  }
  function loadCheats(c) {
    if (!c.cheats || !PlayCards.isPad(c) || !CHEAT_CORES.includes(c.core)) return;
    fetch('cheats/' + encodeURIComponent(c.id) + '.json').then((r) => (r.ok ? r.text() : null)).then((t) => {
      let j = null; try { j = JSON.parse(t); } catch (e) { return; }
      if (!j || !Array.isArray(j.cheats) || !j.cheats.length) return;
      cheatList = j.cheats.filter((x) => x && typeof x.name === 'string' && typeof x.code === 'string');
      if (/^https:\/\/github\.com\/libretro\/libretro-database\//.test(j.source || '')) $('cheat-src').href = j.source;
      try { const kept = JSON.parse(localStorage.getItem(cheatKey()) || '[]') || []; cheatsOn = new Set(cheatList.map((ch, n) => (kept.includes(ch.code) ? n : -1)).filter((n) => n >= 0)); } catch (e) { cheatsOn = new Set(); }
      drawCheats();
      $('m-cheats').hidden = false;
    }).catch(() => {});
  }
  function showCheats(open) {
    $('cheats').hidden = !open; $('m-cheats').setAttribute('aria-expanded', String(open));
    if (open) $('cheats').scrollIntoView({ block: 'start', behavior: 'smooth' });   // on a phone the list opens below the fold
  }
  $('m-cheats').onclick = () => showCheats($('cheats').hidden);
  $('b-save').onclick = save;
  $('b-load').onclick = load;
  $('b-file-save').onclick = saveFile;
  $('b-file-load').onclick = () => { $('file-in').value = ''; $('file-in').click(); };
  $('file-in').onchange = () => loadFile($('file-in').files[0]);
  $('b-touch').onclick = () => { if (padMode) { padMode = false; touch = true; } else touch = !touch; place.sig = ''; place(); };
  // iPhone has no fullscreen for a web page: the button shows only where the browser can do it.
  if (!document.fullscreenEnabled) $('b-full').hidden = true;
  $('b-full').onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); };
  $('b-play').onclick = () => { resumeState = null; begin(); };
  $('b-continue').onclick = continueGame;
  // Leaving keeps your place: Games saves first, then goes; a hidden tab or a closing page saves as it can.
  $('b-games').onclick = (e) => { if (!started) return; e.preventDefault(); const to = e.currentTarget.href; autosave().then(() => { location.href = to; }); };
  addEventListener('pagehide', () => { autosave(); });

  const id = q.get('game') || 'oregon-trail-1990';
  Promise.all([
    // Plan G4: the approve page's Try it opens a draft card (play/drafts, on this PC only; voidtv.net has none).
    fetch((/^[A-Za-z0-9._-]+$/.test(q.get('draft') || '') ? 'drafts/' + q.get('draft') + '/' : 'cards/') + encodeURIComponent(id) + '.json').then((r) => { if (!r.ok) throw new Error('There is no game by that name here. Pick one from the Games shelf.'); return r.text(); })
      // A card asked for while a deploy is spreading can come back as the site's home page (cached a few minutes).
      .then((t) => { try { return JSON.parse(t); } catch (e) { throw new Error('This game did not load. Try again in a few minutes, or pick another game.'); } }),
    // The nightly check's answer: a game whose file the Archive no longer has is off the shelf, and an old link says so.
    fetch('shelf/status.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    // The game's own battery save, read before anything can start, so even a game started straight away gets it back.
    PlaySaves.get(id + ':sram').then((rec) => (rec && rec.state) || null).catch(() => null),
  ]).then(([c, shelf, sram]) => {
    sramKept = sram;
    const bad = PlayCards.check(c);
    if (bad.length) throw new Error('This game card is not right yet (' + bad.join(', ') + ')');
    card = c; if (phones) phones.card(phoneCard()); loadCheats(c);
    const core = PlayCards.CORES[c.core];
    build = { core: c.core, commit: core.source.split('/').pop() };
    document.title = c.title + ' | PLAY | voidtv.net';
    $('title').textContent = c.title + (c.year ? ' (' + c.year + ')' : '');
    $('help').textContent = c.help || '';
    controls(c);
    cover(c);
    // The footer names this game's own engine, its licence and its exact source (and its licence text when not GPL).
    $('core-name').textContent = core.name; $('core-licence').textContent = core.licence; $('src-core').href = core.source;
    $('core-terms').hidden = !core.terms; if (core.terms) $('core-terms-link').href = core.terms;
    // A core whose licence is non-commercial (and Bryan's arcade 'No line'): no donation on its games. A Kids game keeps the
    // CASH donation behind the grown-up check (Bryan, 17 Nov 2026), so none here either.
    if (core.noDonation || c.kids) for (const e of document.querySelectorAll('.donate')) e.remove();
    $('from').innerHTML = '';
    const a = document.createElement('a'); a.href = PlayCards.itemPage(c); a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'the Internet Archive';
    $('from').append('The game plays straight from ', a, '.');
    if (shelf && shelf.games && shelf.games[c.id] && shelf.games[c.id].gone) throw new Error("This game's file is no longer on the Internet Archive, so it is off the shelf. Pick another from Games.");
    if (typeof SharedArrayBuffer === 'undefined' || typeof WebAssembly !== 'object') throw new Error('This browser cannot run PLAY games yet. A current Chrome, Edge, Firefox or Safari can.');
    if (!self.crossOriginIsolated) throw new Error('PLAY cannot start here: this page was served without the settings the engine needs. That is our side, not your browser.');
    status(''); $('b-play').hidden = false; $('b-play').focus({ preventScroll: true });
    // Audit S6: the Play or Continue on the back of a shelf box starts the game itself (?go=new or ?go=continue), so
    // shelf to game is two presses. A phone keeps its start screen: that tap is what lets the game go fullscreen.
    const go = q.get('go');
    if ((go === 'new' || go === 'continue') && !isPhone()) {
      if (go === 'new') { begin(); place(); return; }
      PlaySaves.get(AUTO(c)).then((rec) => {
        if (PlaySaves.fits(rec, build)) { continueGame.rec = rec; continueGame(); } else begin();
      }).catch(() => begin());
      place(); return;
    }
    // An automatic save from this same build: offer Continue first (focused) and the fresh start as New game.
    PlaySaves.get(AUTO(c)).then((rec) => {
      if (!PlaySaves.fits(rec, build) || started) return;
      continueGame.rec = rec;
      $('b-continue').hidden = false; $('b-play').textContent = 'New game'; $('b-play').classList.add('second');
      $('b-continue').focus({ preventScroll: true });
    }).catch(() => {});
    place();
  }).catch((e) => status(String(e.message || e)));
  place(); poll();
})();
