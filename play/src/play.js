// VoidTV PLAY: the player page. Licence: GPL-2.0-or-later (play/LICENSE).
// Wires the blocks together: the card says what to load and which controls to draw, the hub turns every input into
// keys, the runner runs the core, the layout places the picture and the pad. ?game=<card id>, ?touch=1 to force the
// touch pad on, ?mute=1 for silent tests (nothing plays aloud on B's PC).
/* global PlayCards, PlayHub, PlayLayout, PlayTouch, PlaySaves, PlayRunner */
(function () {
  'use strict';
  // The project's donation setting (scripts/lib/app.js DONATE_URL); tests/play.test.js keeps the two the same.
  const DONATE_URL = 'https://square.link/u/bJl9PGAC';
  const DONATE_LINE = 'If you found this service helpful, please think of donating to keep it running and to make more services like this possible. Every donation goes to CASH (cashvalues.org) and feeds its mission in the real world.';

  const q = new URLSearchParams(location.search);
  const $ = (id) => document.getElementById(id);
  const base = new URL('./', location.href);
  const touchWanted = q.get('touch') === '1' || (q.get('touch') !== '0' && matchMedia('(pointer: coarse)').matches);
  let card = null, runner = null, hub = null, pad = null, aspect = 4 / 3, touch = touchWanted, paused = false, started = false;

  for (const e of document.querySelectorAll('#donate-line, .donate-line')) e.textContent = DONATE_LINE;
  for (const e of document.querySelectorAll('#donate, .donate-link')) e.href = DONATE_URL;

  const toast = (t) => { const e = $('toast'); e.textContent = t; e.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove('show'), 2200); };
  const status = (t) => { $('status').textContent = t; };

  function place() {
    const L = PlayLayout.layout(innerWidth, innerHeight, aspect, touch);
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

  function setPaused(p) {
    if (!runner || !started) return;
    paused = p; $('menu').hidden = !p; $('b-pause').textContent = p ? 'Resume' : 'Pause';
    if (p) { hub.releaseAll(); runner.pause(); } else { runner.resume(); runner.wakeSound(); $('canvas').focus({ preventScroll: true }); }
  }

  async function save() {
    if (!started) return;
    const state = await runner.save();
    if (!state) return;
    try { await PlaySaves.put(card.id, state); toast('Saved in this browser'); } catch (e) { toast('This browser would not keep the save'); }
  }
  async function load() {
    if (!started) return;
    let rec = null;
    try { rec = await PlaySaves.get(card.id); } catch (e) { /* no storage here */ }
    if (!rec) return toast('Nothing saved for this game yet');
    toast((await runner.load(rec.state)) ? 'Back to your saved spot' : 'That save would not load');
  }

  function action(name) {
    if (name === 'menu') setPaused(!paused);
    else if (name === 'keyboard' && pad) pad.keyboard.classList.toggle('open');
  }

  // Gamepads are read once a frame; the hub decides what each button means for this card.
  function poll() { if (hub && navigator.getGamepads) hub.pollPads([...navigator.getGamepads()]); requestAnimationFrame(poll); }

  // If the game has not shown a picture by then, say why in one sentence and offer Play again: never "loading" forever.
  const DEADLINE_MS = 60000;
  let deadline = 0;

  function begin() {
    if (runner) { runner.stop(); runner = null; started = false; }
    $('b-play').hidden = true; status('Starting');
    clearTimeout(deadline);
    deadline = setTimeout(() => fail('The game did not arrive from the Internet Archive in time. Check the connection and press Play to try again.'), DEADLINE_MS);
    runner = PlayRunner.createRunner({ canvas: $('canvas'), mute: q.get('mute') === '1', on: {
      status, error: (t) => fail(t),
      ready: () => { started = true; },
      firstFrame: () => { clearTimeout(deadline); $('cover').hidden = true; $('canvas').focus({ preventScroll: true }); },
      aspect: (a) => { if (Math.abs(a - aspect) > 0.01) { aspect = a; place(); } },
    } });
    hub = PlayHub.createHub({ send: (code, down) => runner.key(code, down), onAction: action });
    hub.setCard(card);
    runner.start(card, base);
    place.sig = ''; place();
  }

  function fail(text) {
    clearTimeout(deadline);
    status(text); $('cover').hidden = false;
    $('b-play').textContent = 'Play again'; $('b-play').hidden = false;
  }

  // The gamepad line in the pause menu, drawn from the card, so it always says what the buttons really do.
  function padHelp(c) {
    const say = (v) => v === '@keyboard' ? 'opens the keyboard' : v === '@menu' ? 'pauses' : 'is ' + PlayTouch.label(v);
    const map = Object.assign({ Start: '@menu' }, c.gamepad || {});
    const order = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Start'];
    const parts = order.filter((b) => map[b]).map((b) => b + ' ' + say(map[b]));
    if (map.Up) parts.push('the d-pad and stick are the arrows');
    return parts.join(', ') + '.';
  }

  // The PC keyboard: every key the PC knew goes to the game; our own shortcuts stay out of its way.
  function keyEvent(e, down) {
    // Keys go to the game unless the pause menu is open and has the focus. A hidden panel never keeps them.
    if (!hub || !started || (!$('menu').hidden && e.target.closest('.menu'))) return;
    if (e.code === 'F11') return;
    if (!PlayKeys.known(e.code)) return;
    e.preventDefault();
    if (!e.repeat) hub.keyboard(e.code, down);
  }
  addEventListener('keydown', (e) => keyEvent(e, true));
  addEventListener('keyup', (e) => keyEvent(e, false));
  addEventListener('blur', () => hub && hub.releaseAll());
  document.addEventListener('visibilitychange', () => { if (document.hidden && started && !paused) setPaused(true); });
  addEventListener('resize', place);

  $('b-pause').onclick = () => setPaused(!paused);
  $('m-resume').onclick = () => setPaused(false);
  $('m-reset').onclick = () => { runner.reset(); setPaused(false); };
  $('b-save').onclick = save;
  $('b-load').onclick = load;
  $('b-touch').onclick = () => { touch = !touch; place.sig = ''; place(); };
  $('b-full').onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); };
  $('b-play').onclick = begin;

  fetch('cards/' + encodeURIComponent(q.get('game') || 'oregon-trail-1990') + '.json').then((r) => {
    if (!r.ok) throw new Error('There is no game by that name here');
    return r.json();
  }).then((c) => {
    const bad = PlayCards.check(c);
    if (bad.length) throw new Error('This game card is not right yet (' + bad.join(', ') + ')');
    card = c;
    document.title = c.title + ' | PLAY | voidtv.net';
    $('title').textContent = c.title + (c.year ? ' (' + c.year + ')' : '');
    $('help').textContent = c.help || '';
    $('pad-help').textContent = padHelp(c);
    $('from').innerHTML = '';
    const a = document.createElement('a'); a.href = PlayCards.itemPage(c); a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'the Internet Archive';
    $('from').append('The game plays straight from ', a, '.');
    if (typeof SharedArrayBuffer === 'undefined' || typeof WebAssembly !== 'object') throw new Error('This browser cannot run PLAY games yet. A current Chrome, Edge, Firefox or Safari can.');
    if (!self.crossOriginIsolated) throw new Error('PLAY cannot start here: this page was served without the settings the engine needs. That is our side, not your browser.');
    status(c.title + ' is ready'); $('b-play').hidden = false; $('b-play').focus({ preventScroll: true });
    place();
  }).catch((e) => status(String(e.message || e)));
  place(); poll();
})();
