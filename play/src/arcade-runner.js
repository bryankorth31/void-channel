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

    // Each turn of MAME's loop emulates 1/60 s. Audit AR6: on any screen (60, 75, 90, 120, 144 Hz) the game keeps real
    // speed when it is paced by time, not by counting frames: the loop is offered every browser frame, and a hook before
    // each turn lets it run only when 1/60 s of real time has built up since the last (Emscripten skips a turn when a
    // pre-main-loop hook answers false). Some panes and covered windows say 'visible' yet fire few or no frames; there
    // the loop goes on a 60 Hz timer instead and is woken once. A hidden tab simply waits, as it should.
    const STEP = 1000 / 60;
    function gate() {
      let owed = 0, last = performance.now();
      return () => {
        const now = performance.now();
        owed = Math.min(owed + (now - last), 3 * STEP);   // after a pause or a stall, catch up a little, never race
        last = now;
        if (owed < STEP - 1) return false;
        owed -= STEP;
        return true;
      };
    }
    function pace() {
      let n = 0, first = 0, decided = false;
      const decide = (rate) => {
        if (decided) return;
        decided = true;
        try {
          if (rate >= 30) {
            root._emscripten_set_main_loop_timing(1, 1);
            if (root.MainLoop && root.MainLoop.preMainLoop) root.MainLoop.preMainLoop.push(gate());
          } else { root._emscripten_set_main_loop_timing(0, STEP); if (root.MainLoop && root.MainLoop.scheduler) root.MainLoop.scheduler(); }
        } catch (e) { /* keep the default */ }
      };
      const count = (now) => {
        if (decided) return;
        if (!first) first = now;
        n++;
        if (now - first < 1000) requestAnimationFrame(count); else decide(n * 1000 / (now - first));
      };
      requestAnimationFrame(count);
      setTimeout(() => { if (!decided && document.visibilityState === 'visible') decide(n / 2); }, 2000);
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
      // A big engine is kept gzipped (Cloudflare serves no file over 25 MiB, and a 68000 engine is 26 to 31 MiB plain).
      // The page unpacks it and hands it to Emscripten as Module.wasmBinary. With no .wasm.gz the engine fetches its
      // own plain .wasm, as before. The magic-byte check covers a server that already unpacked it on the way.
      try {
        const res = await fetch(engine.replace(/\.js$/, '.wasm.gz'));
        if (res.ok) {
          let buf = new Uint8Array(await res.arrayBuffer());
          if (buf[0] === 0x1f && buf[1] === 0x8b) {
            if (!root.DecompressionStream) throw new Error('no DecompressionStream');
            buf = new Uint8Array(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
          }
          // Only real wasm is used (it starts "\0asm"): a missing file can come back as the site's own page with a 200.
          // MAME 0.289's build skips wasmBinary and always fetches its plain .wasm, but it asks instantiateWasm first,
          // so the unpacked engine is handed over there.
          if (buf[0] === 0 && buf[1] === 0x61 && buf[2] === 0x73 && buf[3] === 0x6d) {
            root.Module.wasmBinary = buf;
            root.Module.instantiateWasm = (imports, done) => {
              WebAssembly.instantiate(buf, imports).then((r) => done(r.instance, r.module), (e) => {
                console.warn('[mame] engine start:', e);
                if (on.error) on.error('The arcade engine did not load. Try again in a moment.');
              });
              return {};
            };
          }
        }
      } catch (e) {
        console.warn('[mame] engine unpack:', e);
        if (on.error) on.error('The arcade engine did not load. Try again in a moment, or use a newer browser.');
        return;
      }
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
