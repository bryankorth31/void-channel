// VoidTV PLAY: the Flash runner, for Ruffle's own web build. Licence: GPL-2.0-or-later (play/LICENSE).
// Bryan, 20 Nov 2026: "Yes, build Ruffle" (Flash games for kids, the Archive's softwarelibrary_flash collections). Ruffle
// is not a libretro core: it is a whole Flash player in WebAssembly, built here from its own source (play/core/ruffle.txt)
// and drawing into its own element. So, like the arcade runner beside MAME, this runner gives the page the same surface
// as PlayRunner (runner.js), and the page only needs to know which one it made.
//   * The .swf comes from the Internet Archive (/cors/), or from the viewer's own kept copy, as every game does.
//   * Ruffle's player is laid over the page's canvas, in its place and at its size, so the page's layout, cover and
//     toolbar work unchanged. The mouse and a finger reach the game directly (a tap is a click).
//   * The PC keyboard reaches Ruffle by itself; the gamepad and the touch keys press keys through key(), sent the way
//     the keyboard's would be (isTrusted false, so the page does not feed them back).
//   * Nothing leaves the game: no link opens a page, no other site is reached. Flash games keep their own small saves
//     in this browser (Ruffle's), so the save button says so instead.
(function (root) {
  'use strict';
  const KEPT = 'voidtv-play-games';
  // What Ruffle is told, every game: start at once, no splash, no right-click menu of its own, no links out, and only
  // the game's own files over the network (the Archive item it came from).
  const CONFIG = {
    autoplay: 'on', unmuteOverlay: 'hidden', splashScreen: false, contextMenu: 'off', showSwfDownload: false,
    polyfills: false, openUrlMode: 'deny', allowNetworking: 'internal', allowScriptAccess: false,
    warnOnUnsupportedContent: false, letterbox: 'on', logLevel: 'error', menu: false, allowFullscreen: false,
    backgroundColor: '#000000', upgradeToHttps: true,
  };

  function loadEngine(src) {
    if (root.RufflePlayer && root.RufflePlayer.newest) return Promise.resolve();
    root.RufflePlayer = root.RufflePlayer || {};
    root.RufflePlayer.config = Object.assign({}, CONFIG);
    return new Promise((ok, no) => {
      const s = document.createElement('script');
      s.src = src; s.onload = () => ok(); s.onerror = () => no(new Error('The Flash engine did not load. Try again in a few minutes.'));
      document.head.appendChild(s);
    });
  }

  function createRunner(opts) {
    const canvas = opts.canvas, on = opts.on || {};
    // opts.mute (the page's ?mute=1, every test): no sound at all, whatever the volume control says.
    const mute = !!opts.mute;
    let player = null, api = null, frames = 0, stopped = false, level = mute ? 0 : opts.volume == null ? 1 : opts.volume;
    let paused = false, follow = null, firstTimer = 0;

    async function bytesOf(url, size) {
      try {
        if (root.caches) {
          const r = await (await caches.open(KEPT)).match(url);
          if (r) { const b = new Uint8Array(await r.arrayBuffer()); if (!size || b.length === size) return b; }
        }
      } catch (e) { /* no kept copy */ }
      let r;
      try { r = await fetch(url, { credentials: 'omit' }); } catch (e) { throw new Error('The Internet Archive is not answering right now. Check the connection and press Play to try again.'); }
      if ([403, 404, 410].includes(r.status)) throw new Error("This game's file is no longer on the Internet Archive, so it cannot play here.");
      if (!r.ok) throw new Error('The Internet Archive is busy right now (it answered ' + r.status + '). Try again in a little while.');
      const b = new Uint8Array(await r.arrayBuffer());
      try { if (root.caches) await (await caches.open(KEPT)).put(url, new Response(b)); } catch (e) { /* no room */ }
      return b;
    }

    // Ruffle's own screens stay out of sight (the PLAY lead, 20 Nov 2026: all four Flash cards are kids games). If the
    // engine crashes, Ruffle draws its crash panel with links to ruffle.rs and GitHub inside its player; the moment it
    // appears, the game stops and the page says so in its own words (on Kids, its way back is the kids games). Any other
    // link Ruffle draws loses its address, so nothing in the player leads off the site.
    let guard = null;
    const CRASH = 'This game stopped working in the Flash player. Press Play again to try once more, or pick another game.';
    function watchScreens() {
      const sr = player && player.shadowRoot;
      if (!sr || !root.MutationObserver) return;
      const look = () => {
        if (stopped) return;
        if (sr.querySelector('#panic')) {
          guard.disconnect();
          for (const p of sr.querySelectorAll('#panic')) p.remove();
          on.error && on.error(CRASH);
          return;
        }
        for (const a of sr.querySelectorAll('a[href]')) if (a.getAttribute('href') !== '#') { a.removeAttribute('href'); a.removeAttribute('target'); }
      };
      guard = new MutationObserver(look);
      guard.observe(sr, { childList: true, subtree: true });
      look();
    }

    // Ruffle's element sits exactly where the canvas is, and moves with it (the page sizes the canvas to the game).
    function lay() {
      if (!player || stopped) return;
      const r = canvas.getBoundingClientRect(), p = (player.offsetParent || document.body).getBoundingClientRect();
      Object.assign(player.style, { left: (r.left - p.left) + 'px', top: (r.top - p.top) + 'px', width: r.width + 'px', height: r.height + 'px' });
    }

    async function start(card, base, version) {
      try {
        on.status && on.status('Loading the Flash engine');
        // ?v= the page's build, as every engine gets: a new script never meets an old one in the browser's cache. Its
        // WebAssembly keeps Ruffle's own hashed name, so the two always match.
        const src = new URL(PlayCards.engineOf(card), base);
        if (version) src.searchParams.set('v', version);
        await loadEngine(src.href);
        if (stopped) return;
        on.status && on.status('Fetching the game from the Internet Archive');
        const data = await bytesOf(PlayCards.gameUrl(card), card.archive.size || 0);
        if (stopped) return;
        player = root.RufflePlayer.newest().createPlayer();
        player.classList.add('flash-player');
        player.style.position = 'absolute';
        canvas.style.visibility = 'hidden';
        canvas.insertAdjacentElement('afterend', player);
        api = player.ruffle ? player.ruffle() : player;
        watchScreens();
        lay();
        if (root.ResizeObserver) { follow = new ResizeObserver(lay); follow.observe(canvas); }
        addEventListener('resize', lay);
        api.volume = level;   // before the movie starts, so a muted test never makes a sound
        await api.load(Object.assign({}, CONFIG, {
          data, swfFileName: PlayCards.gameFile(card),
          // The game's own extra files (a second .swf, a sound) are read from the same Archive item.
          base: PlayCards.gameUrl(card).replace(/[^/]*$/, ''),
          parameters: card.flashvars || {},
        }));
        if (stopped) return;
        api.volume = level;
        // The movie's own shape, once Ruffle has read it, so the page sizes the picture to it.
        const shape = () => {
          const m = api.metadata;
          if (m && m.width && m.height) { canvas.width = m.width; canvas.height = m.height; on.aspect && on.aspect(m.width / m.height); lay(); return true; }
          return false;
        };
        on.ready && on.ready({ fps: 0, rate: 0 });
        // Ruffle draws on its own: the first picture is counted when the movie has started.
        const wait = () => {
          if (stopped) return;
          if (api.readyState === 2 || (api.metadata && api.metadata.width)) {
            shape(); frames = 1; on.firstFrame && on.firstFrame();
            // The page focuses its canvas on the first picture; the keys belong to Ruffle's player instead (Tab and Enter
            // walk a Flash game's buttons).
            try { player.tabIndex = 0; player.focus({ preventScroll: true }); } catch (e) { /* no focus */ }
            const count = () => { if (!stopped) { if (!paused) frames++; requestAnimationFrame(count); } };
            requestAnimationFrame(count);
          } else firstTimer = setTimeout(wait, 100);
        };
        wait();
      } catch (e) { if (!stopped && on.error) on.error(String((e && e.message) || e)); }
    }

    function stop() {
      stopped = true; clearTimeout(firstTimer);
      if (follow) follow.disconnect();
      if (guard) guard.disconnect();
      removeEventListener('resize', lay);
      try { if (api && api.suspend) api.suspend(); } catch (e) { /* already gone */ }
      if (player) { try { player.remove(); } catch (e) { /* gone */ } }
      if (arrow) { arrow.remove(); arrow = null; }
      player = null; api = null;
      canvas.style.visibility = '';
    }

    // A key from the gamepad or the touch keys, sent to Ruffle the way the PC keyboard's would be.
    const KEYS = { ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, Enter: 13, Space: 32, Escape: 27, Backspace: 8,
      Tab: 9, ControlLeft: 17, AltLeft: 18, ShiftLeft: 16 };
    function key(code, down) {
      if (!player || paused) return;
      const k = code.startsWith('Digit') ? code.slice(5) : code.startsWith('Key') ? code.slice(3).toLowerCase()
        : { Space: ' ', ControlLeft: 'Control', AltLeft: 'Alt', ShiftLeft: 'Shift' }[code] || code;
      const kc = KEYS[code] || (code.startsWith('Key') ? code.charCodeAt(3) : code.startsWith('Digit') ? code.charCodeAt(5) : 0);
      const ev = new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: k, keyCode: kc, which: kc, bubbles: true, cancelable: true });
      player.dispatchEvent(ev);
    }

    // The gamepad's pointer (play.js padMouse: the right stick moves, RB clicks): a pointer of our own over the game, sent
    // to Ruffle as the mouse's would be. The real mouse and a finger never come through here; they reach Ruffle directly.
    let px = -1, py = -1, held = 0, arrow = null;
    function mouse(dx, dy, buttons) {
      if (!player || paused || stopped) return;
      const r = player.getBoundingClientRect();
      if (!r.width) return;
      if (px < 0) { px = r.left + r.width / 2; py = r.top + r.height / 2; }
      px = Math.max(r.left, Math.min(r.right - 1, px + dx)); py = Math.max(r.top, Math.min(r.bottom - 1, py + dy));
      if (!arrow) {
        arrow = document.createElement('div');
        arrow.className = 'flash-pointer';
        Object.assign(arrow.style, { position: 'fixed', width: '0', height: '0', borderLeft: '7px solid transparent', borderRight: '7px solid transparent',
          borderBottom: '18px solid #fff', filter: 'drop-shadow(0 0 2px #000)', transform: 'translate(-7px, 0) rotate(-25deg)', transformOrigin: '7px 0',
          pointerEvents: 'none', zIndex: '5' });
        document.body.appendChild(arrow);
      }
      arrow.style.left = px + 'px'; arrow.style.top = py + 'px';
      const target = (player.shadowRoot && player.shadowRoot.querySelector('canvas')) || player;
      const fire = (type, button) => {
        const o = { clientX: px, clientY: py, button, buttons: buttons & 1, bubbles: true, cancelable: true, composed: true,
          pointerId: 99, pointerType: 'mouse', isPrimary: true };
        target.dispatchEvent(new PointerEvent(type, o));
      };
      if (dx || dy) fire('pointermove', -1);
      const was = held; held = buttons & 1;
      if (held && !was) fire('pointerdown', 0);
      else if (!held && was) fire('pointerup', 0);
    }

    // While paused the player takes no taps or clicks, and Ruffle's own play button (the whole stage, drawn when it is
    // suspended) is out of sight: a tap beside the Paused panel started the film again under it (the Kids session and
    // the auditor, 21 Nov 2026). Both come back on resume.
    function still(on) {
      if (!player) return;
      player.style.pointerEvents = on ? 'none' : '';
      const b = player.shadowRoot && player.shadowRoot.querySelector('#play-button');
      if (b) b.style.visibility = on ? 'hidden' : '';
    }

    return {
      start, stop, key, mouse,
      prepareSound: () => {},
      pad: () => {}, rewind: () => {}, cheats: () => {},
      pause: () => { paused = true; try { if (api) api.suspend(); } catch (e) { /* not yet running */ } still(true); },
      resume: () => { paused = false; still(false); try { if (api) api.resume(); } catch (e) { /* not yet running */ } },
      save: () => Promise.resolve(null),
      load: () => Promise.resolve(false),
      sram: () => Promise.resolve(null),
      sramSet: () => Promise.resolve(false),
      saveWhy: () => 'flash',
      reset: () => { try { if (api && api.reload) api.reload(); } catch (e) { /* not yet running */ } },
      frames: () => frames,
      wakeSound: () => {},
      volume: (v) => { level = mute ? 0 : v; try { if (api) api.volume = level; } catch (e) { /* not yet running */ } },
      isFlash: true,
    };
  }
  const api = { createRunner, CONFIG };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlayFlash = api;
})(typeof self !== 'undefined' ? self : this);
