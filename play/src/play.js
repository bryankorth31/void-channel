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
  const touchWanted = q.get('touch') === '1' || (q.get('touch') !== '0' && matchMedia('(pointer: coarse)').matches);
  let card = null, build = null, runner = null, hub = null, pad = null, aspect = 4 / 3, touch = touchWanted, paused = false, started = false;

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

  function place() {
    const L = PlayLayout.layout(innerWidth, innerHeight, aspect, touch, card ? PlayTouch.minCols(card) : 2);
    document.body.dataset.mode = L.mode;
    const set = (el, r) => { if (!r) { el.hidden = true; return; } el.hidden = false; Object.assign(el.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' }); };
    set($('screen'), L.screen); set($('z-left'), L.left); set($('z-right'), L.right); set($('z-pad'), L.pad);
    if (touch && hub && card) {
      const zones = L.pad ? { pad: $('z-pad') } : { left: $('z-left'), right: $('z-right') };
      const sig = L.mode;
      if (place.sig !== sig) { pad = PlayTouch.build(zones, card, hub); place.sig = sig; }
    } else place.sig = '';
    $('b-touch').setAttribute('aria-pressed', String(touch));
  }

  // While the menu is open the game hears nothing: every held key is let go first, then the gamepad drives the menu.
  function setPaused(p) {
    if (!runner || !started || p === paused) return;
    if (p) { hub.releaseAll(); paused = true; runner.pause(); autosave(); }
    else { paused = false; runner.resume(); runner.wakeSound(); }
    $('menu').hidden = !p; $('b-pause').textContent = p ? 'Resume' : 'Pause';
    if (p) $('m-resume').focus({ preventScroll: true }); else $('canvas').focus({ preventScroll: true });
  }

  // Continue (block C): an automatic slot per game, written when the menu opens, the tab hides, the page closes or Games
  // is pressed, under the same build rule as a manual save. The start screen then offers Continue.
  const AUTO = (c) => c.id + ':auto';
  let autoBusy = false, resumeState = null;
  async function autosave() {
    if (!started || !runner || autoBusy) return;
    autoBusy = true;
    try { const s = await runner.save(); if (s) await PlaySaves.put(AUTO(card), s, build); } catch (e) { /* best effort */ }
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
    if (!state) return toast('The game could not be saved just now');
    try { await PlaySaves.put(card.id, state, build); toast('Saved in this browser'); } catch (e) { toast('This browser would not keep the save'); }
  }
  // Load and Restart first keep where you are, so one wrong tap is undone with one tap.
  async function keepHere() { const s = await runner.save(); return s ? () => runner.load(s).then((ok) => toast(ok ? 'Back where you were' : 'That could not be undone')) : null; }
  async function load() {
    if (!started) return;
    let rec = null;
    try { rec = await PlaySaves.get(card.id); } catch (e) { /* no storage here */ }
    if (!rec) return toast('Nothing saved for this game yet');
    if (!PlaySaves.fits(rec, build)) return toast('That save was made with an older build of this game\'s engine, so it cannot load. Save again to start a new one.');
    const undo = await keepHere();
    const ok = await runner.load(rec.state);
    toast(ok ? 'Back to your saved spot' : 'That save would not load', ok ? undo : null);
    if (ok) setPaused(false);
  }
  async function restart() {
    if (!started) return;
    const undo = await keepHere();
    runner.reset(); setPaused(false);
    toast('The game started over', undo);
  }

  function action(name) {
    if (name === 'menu') setPaused(!paused);
    else if (name === 'keyboard' && pad && !paused) pad.keyboard.classList.toggle('open');
  }

  // The menu with a gamepad: the d-pad or stick moves between its buttons, A presses one, B or Start goes back to the
  // game. Each acts when the button is let go, so nothing still held reaches the game afterwards.
  const menuWas = new Map();
  function menuPads(pads) {
    const items = [...$('menu').querySelectorAll('button, a')].filter((x) => x.offsetParent);
    for (const p of pads) {
      if (!p || p.mapping !== 'standard') continue;
      const b = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
      const now = { prev: b(12) || b(14) || p.axes[1] < -0.6 || p.axes[0] < -0.6, next: b(13) || b(15) || p.axes[1] > 0.6 || p.axes[0] > 0.6,
        a: b(0), back: b(1) || (b(9) && !b(8)) };
      const was = menuWas.get(p.index) || {};
      const released = (k) => was[k] && !now[k];
      const i = items.indexOf(document.activeElement);
      if (now.prev && !was.prev) items[(i <= 0 ? items.length : i) - 1].focus();
      if (now.next && !was.next) items[(i + 1) % items.length].focus();
      if (released('a') && i >= 0) items[i].click();
      else if (released('back')) setPaused(false);
      menuWas.set(p.index, now);
    }
  }

  // Gamepads are read once a frame. Before the game starts, a gamepad's A or Start presses Play, so a controller goes
  // from the shelf into the game with nothing else to touch.
  let padWasDown = true;
  function poll() {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()] : [];
    if (hub) { hub.pollPads(pads); if (paused) menuPads(pads); else menuWas.clear(); }
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

  function begin() {
    stopGame();
    $('b-play').hidden = true; $('b-continue').hidden = true; status('Starting');
    deadline = setTimeout(() => fail('The game did not arrive from the Internet Archive in time. Check the connection and press Play to try again.'), DEADLINE_MS);
    runner = PlayRunner.createRunner({ canvas: $('canvas'), mute: q.get('mute') === '1', on: {
      status, error: (t) => fail(t),
      ready: () => { started = true; },
      firstFrame: () => {
        clearTimeout(deadline); $('cover').hidden = true; $('canvas').focus({ preventScroll: true });
        if (resumeState) { const s = resumeState; resumeState = null; runner.load(s).then((ok) => toast(ok ? 'Back where you left off' : 'That spot would not load; starting fresh')); }
      },
      aspect: (a) => { if (Math.abs(a - aspect) > 0.01) { aspect = a; place(); } },
    } });
    runner.prepareSound();                     // in the Play tap itself, so iPhone and iPad allow the sound
    hub = PlayHub.createHub({ send, onAction: action });
    hub.setCard(card, PlayCards.gamepadMap(card));
    runner.start(card, base, build.commit.slice(0, 12));
    place.sig = ''; place();
  }

  // Ends the game for good: the engine stops, nothing it sent late reaches the page, the menu closes.
  function stopGame() {
    clearTimeout(deadline);
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
  const SYSTEM_NAMES = { dos: 'PC (DOS)', a2600: 'Atari 2600', nes: 'NES', snes: 'Super Nintendo', genesis: 'Sega Genesis', sms: 'Master System', gamegear: 'Game Gear', gameboy: 'Game Boy', gbcolor: 'Game Boy Color' };
  function device() {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()] : [];
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
    const esc = PlayCards.isPad(c) ? ', Esc on the keyboard' : '';
    $('pause-how').textContent = 'Pause: Back and Start together on a gamepad' + esc + ', or the Pause button.';
  }

  // The PC keyboard: every key the PC knew goes to the game; our own shortcuts stay out of its way.
  function keyEvent(e, down) {
    if (runner) runner.wakeSound();
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
  addEventListener('keydown', (e) => keyEvent(e, true));
  addEventListener('keyup', (e) => keyEvent(e, false));
  addEventListener('pointerdown', () => runner && runner.wakeSound(), { passive: true });
  addEventListener('blur', () => hub && hub.releaseAll());
  document.addEventListener('visibilitychange', () => { if (document.hidden && started) { if (!paused) setPaused(true); else autosave(); } });
  addEventListener('resize', place);

  $('b-pause').onclick = () => setPaused(!paused);
  $('m-resume').onclick = () => setPaused(false);
  $('m-reset').onclick = restart;
  $('b-save').onclick = save;
  $('b-load').onclick = load;
  $('b-touch').onclick = () => { touch = !touch; place.sig = ''; place(); };
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
    fetch('cards/' + encodeURIComponent(id) + '.json').then((r) => { if (!r.ok) throw new Error('There is no game by that name here. Pick one from the Games shelf.'); return r.json(); }),
    // The nightly check's answer: a game whose file the Archive no longer has is off the shelf, and an old link says so.
    fetch('shelf/status.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]).then(([c, shelf]) => {
    const bad = PlayCards.check(c);
    if (bad.length) throw new Error('This game card is not right yet (' + bad.join(', ') + ')');
    card = c;
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
    // A core whose licence is non-commercial: no donation line on its games, in the pause menu or the footer.
    if (core.noDonation) for (const e of document.querySelectorAll('.donate')) e.remove();
    $('from').innerHTML = '';
    const a = document.createElement('a'); a.href = PlayCards.itemPage(c); a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'the Internet Archive';
    $('from').append('The game plays straight from ', a, '.');
    if (shelf && shelf.games && shelf.games[c.id] && shelf.games[c.id].gone) throw new Error("This game's file is no longer on the Internet Archive, so it is off the shelf. Pick another from Games.");
    if (typeof SharedArrayBuffer === 'undefined' || typeof WebAssembly !== 'object') throw new Error('This browser cannot run PLAY games yet. A current Chrome, Edge, Firefox or Safari can.');
    if (!self.crossOriginIsolated) throw new Error('PLAY cannot start here: this page was served without the settings the engine needs. That is our side, not your browser.');
    status(''); $('b-play').hidden = false; $('b-play').focus({ preventScroll: true });
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
