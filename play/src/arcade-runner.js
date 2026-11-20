// VoidTV PLAY: the arcade runner, for MAME's own web build. Licence: GPL-2.0-or-later (play/LICENSE).
// Bryan, 20 Nov 2026: arcade games on current MAME, no donation line. MAME's web build is not a libretro core: it reads
// a global Module (canvas, arguments, preRun) and runs on the page itself, drawing with WebGL. So this runner gives
// the page the same surface as PlayRunner (runner.js), and the page needs to know only which one it made.
// Design notes: the PLAY notes folder, PLAY-arcade-runner-design-2026-11-20.md.
//   * The game's zip comes from the Internet Archive (/cors/), or from the viewer's own kept copy (K5).
//   * The PC keyboard reaches MAME by itself; the gamepad and the touch pad press keys through key(), which sends the
//     same keyboard events MAME's SDL layer reads (marked as ours, so the page does not feed them back).
//   * Pause is MAME's main loop paused. A classic module cannot be torn down, so a new game reloads the page.
//   * Save and load wait for a second step (MAME saves at the end of a frame into its own state file); until then a
//     save answers "no" with the reason 'arcade', and the page says so.
(function (root) {
  'use strict';
  const KEPT = 'voidtv-play-games';

  function createRunner(opts) {
    const canvas = opts.canvas, on = opts.on || {};
    let started = false, paused = false, frames = 0;

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

    // The picture has come when MAME first draws. A WebGL canvas reads back blank to a page, so instead the canvas's
    // getContext is wrapped before MAME asks for it, and the context's draw calls are counted.
    function watchFrames() {
      const own = canvas.getContext.bind(canvas);
      let shown = false;
      canvas.getContext = function (type, attrs) {
        const ctx = own(type, attrs);
        if (ctx && /webgl/.test(type) && !ctx.__playCounted) {
          ctx.__playCounted = true;
          for (const fn of ['drawArrays', 'drawElements']) {
            const real = ctx[fn].bind(ctx);
            ctx[fn] = function () { frames++; if (!shown) { shown = true; pace(); if (on.firstFrame) on.firstFrame(); } return real.apply(null, arguments); };
          }
        }
        return ctx;
      };
    }

    // A screen faster than 60 Hz would run the game fast (one 1/60 s step per browser frame): measure the browser's frame
    // rate for a second, then let MAME's loop run every n-th frame (1 on 60 Hz, 2 on 120 Hz).
    function pace() {
      let n = 0;
      const t0 = performance.now();
      const count = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(count); else set(n * 1000 / (performance.now() - t0)); };
      const set = (rate) => { try { if (root._emscripten_set_main_loop_timing) root._emscripten_set_main_loop_timing(1, Math.max(1, Math.round(rate / 60))); } catch (e) { /* keep the default */ } };
      requestAnimationFrame(count);
    }

    // MAME names the window after the game and its own version; the tab keeps PLAY's title.
    function keepTitle() {
      const mine = document.title;
      const t = document.querySelector('title');
      if (t) new MutationObserver(() => { if (document.title !== mine) document.title = mine; }).observe(t, { childList: true, characterData: true, subtree: true });
    }

    async function start(card) {
      const a = card.archive, url = 'https://archive.org/cors/' + a.item + '/' + a.file;
      on.status && on.status('Fetching the game from the Internet Archive');
      const zips = [{ name: a.file.split('/').pop(), bytes: await bytesOf(url, a.size) }];
      // A clone runs on its parent's chips too: the card names the parent's zip, fetched the same way.
      for (const p of a.parents || []) zips.push({ name: p.file.split('/').pop(), bytes: await bytesOf('https://archive.org/cors/' + p.item + '/' + p.file, p.size) });
      on.status && on.status('Starting the game');
      const engine = new URL(PlayCards.engineOf(card), location.href).href;
      const vertical = (card.aspect || 4 / 3) < 1;
      const args = [a.driver, '-rompath', '/roms', '-window', '-nomaximize', '-skip_gameinfo', '-nokeepaspect',
        '-resolution', vertical ? '480x640' : '640x480', '-video', 'accel',
        // Audit AR4: the gamepad reaches the game through PLAY's own controls only; MAME reading it too would press twice.
        '-nojoystick',
        // MAME's web build emulates 1/60 s per main-loop call, so the browser's frames are the clock; MAME's own throttle on
        // top of that busy-waits on the page and the two clocks fight (the game ran below 15% speed). The assistant
        // session measured the engine alone at about 20 times real speed.
        '-nothrottle', '-nosleep'];
      if (opts.mute) args.push('-sound', 'none');
      // A machine that keeps its settings in battery memory (Williams) shows "FACTORY SETTINGS RESTORED" on a first boot
      // and waits there for ever; our page keeps no battery memory, so every boot is a first boot. One soft reset (the
      // operator's reset button) goes on to the game. It is timed on the game's own clock, not the page's, so a slow
      // computer still lets the memory test finish first; after the reset the script runs again and does nothing.
      const reset = card.firstBoot && +card.firstBoot.resetAt;
      const lua = reset > 0 ? ['local AT = ' + reset,
        'if manager.machine.time:as_double() < AT then',
        '  sub = emu.add_machine_frame_notifier(function()',
        '    if manager.machine.time:as_double() >= AT then sub = nil; manager.machine:soft_reset() end',
        '  end)',
        'end', ''].join('\n') : '';
      if (lua) args.push('-autoboot_script', '/lua/firstboot.lua');
      root.Module = {
        canvas, arguments: args,
        preRun: [() => { const fs = root.Module.FS || root.FS; fs.mkdir('/roms'); for (const z of zips) fs.writeFile('/roms/' + z.name, z.bytes);
          if (lua) { fs.mkdir('/lua'); fs.writeFile('/lua/firstboot.lua', lua); } }],
        print: (t) => console.log('[mame]', t),
        printErr: (t) => console.warn('[mame]', t),
        // One plain sentence; the engine's own words go to the console for whoever looks.
        onAbort: (why) => { console.warn('[mame] stopped:', why); if (on.error) on.error('This arcade game stopped. Press Play to try again, or pick another game.'); },
        onRuntimeInitialized: () => { started = true; on.ready && on.ready({}); },
      };
      if (on.aspect) on.aspect(card.aspect || 4 / 3);
      watchFrames(); keepTitle();
      const s = document.createElement('script');
      s.src = engine;
      s.onerror = () => on.error && on.error('The arcade engine did not load. Try again in a moment.');
      document.body.appendChild(s);
    }

    // A key from the gamepad or the touch pad, sent the way the PC keyboard's would be. isTrusted is false on these,
    // which is how the page tells them from the real keyboard.
    const KEYS = { ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, Enter: 13, Space: 32, ControlLeft: 17, AltLeft: 18,
      ShiftLeft: 16, Digit1: 49, Digit2: 50, Digit5: 53, Digit6: 54 };
    function key(code, down) {
      const k = code.startsWith('Digit') ? code.slice(5) : code.startsWith('Key') ? code.slice(3).toLowerCase()
        : { Space: ' ', ControlLeft: 'Control', AltLeft: 'Alt', ShiftLeft: 'Shift' }[code] || code;
      const ev = new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: k, keyCode: KEYS[code] || 0, which: KEYS[code] || 0, bubbles: true, cancelable: true });
      document.dispatchEvent(ev);
    }

    return {
      start, key,
      stop: () => { try { if (root.Module && root.Module.pauseMainLoop) root.Module.pauseMainLoop(); } catch (e) { /* not running */ } },
      prepareSound: () => {},
      pad: () => {}, mouse: () => {}, rewind: () => {},
      pause: () => { paused = true; try { root.Module.pauseMainLoop(); } catch (e) { /* not yet running */ } },
      resume: () => { paused = false; try { root.Module.resumeMainLoop(); } catch (e) { /* not yet running */ } },
      save: () => Promise.resolve(null),
      load: () => Promise.resolve(false),
      saveWhy: () => 'arcade',
      // A classic module cannot start over in place: a new game is the same page, loaded again.
      reset: () => { const u = new URL(location.href); u.searchParams.set('go', 'new'); location.replace(u.href); },
      frames: () => frames,
      wakeSound: () => {},
      isArcade: true,
    };
  }

  const api = { createRunner };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlayArcade = api;
})(typeof self !== 'undefined' ? self : this);
