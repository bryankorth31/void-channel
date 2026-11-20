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
  // The engine files are cached for a day at the edge, and a missing file there is answered with the site's home page, which
  // is cached too. If an engine is asked for while a deploy is still spreading, that wrong answer sticks. Bump ENGINE_V
  // whenever an engine file changes under the same name, as brand files bump ?v= (20 Nov 2026: williams.wasm.gz was
  // answered with the home page for a day after the push that added it).
  // Per engine, so a rebuild of one does not set aside the high scores kept on the others (m68000: 4, Mercs and CPS1).
  // A trackball or dial machine: its card says it rolls or turns (play/tools/arcade-cards.js, moveWord).
  const mouseGame = (card) => (card.actions || []).some((x) => x.do === 'Roll' || x.do === 'Turn');
  const ENGINE_VS ={ atari: '3', classics: '3', m68000: '4' };   // williams retired (audit A10: Joust is on classics)

  function createRunner(opts) {
    const canvas = opts.canvas, on = opts.on || {};
    let started = false, paused = false, frames = 0, ENGINE_V = '3';
    const nv = { dir: null, key: null, stamp: null, back: null, after: 5 };
    // The game's own clock: each turn MAME runs is 1/60 s of game time. Counted after each turn that ran (postMainLoop), not
    // by the loop's frame number, which also counts the frames the AR6 pace gate skips (2.4 times too fast at 144 Hz; the
    // assistant session's catch). Counting starts at the first picture, so it can only run late, which is the safe side.
    let turns = 0;
    const gameSeconds = () => turns / 60;
    // Save the machine's battery memory and keep it on this device. Called by the page's autosave (Pause, Games, leaving,
    // and every minute while playing).
    async function keepScores() {
      if (!started || !nv.dir || gameSeconds() < nv.after) return false;
      const M = root.Module;
      const save = M && M.__ZN15running_machine10nvram_saveEv, machine = M && M.__ZN15running_machine30emscripten_get_running_machineEv;
      if (typeof save !== 'function' || typeof machine !== 'function') return false;
      const fs = M.FS || root.FS, files = {};
      try {
        const m = machine(); if (!m) return false;
        save(m);
        const walk = (dir, rel) => { for (const n of fs.readdir(dir)) { if (n === '.' || n === '..') continue; const p = dir + '/' + n; if (fs.isDir(fs.stat(p).mode)) walk(p, rel + n + '/'); else files[rel + n] = fs.readFile(p); } };
        walk(nv.dir, '');
      } catch (e) { return false; }
      if (!Object.keys(files).length || !root.PlaySaves) return false;
      try { await root.PlaySaves.put(nv.key, files, { stamp: nv.stamp }); return true; } catch (e) { return false; }
    }

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
      // A big game (SF Alpha 2 is 22 MB) says how far its download has come, as the DOS games do, so a wait never looks
      // like a hang (audit, 20 Nov 2026).
      let b;
      if (size > 2e6 && r.body && on.status) {
        b = new Uint8Array(size);
        let got = 0, said = -1;
        const reader = r.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (got + value.length > b.length) { const bigger = new Uint8Array(got + value.length); bigger.set(b.subarray(0, got)); b = bigger; }
          b.set(value, got); got += value.length;
          const mb = Math.floor(got / 1e6);
          if (mb !== said) { said = mb; on.status('Fetching the game: ' + mb + ' of ' + Math.round(size / 1e6) + ' MB'); }
        }
        b = b.subarray(0, got);
      } else b = new Uint8Array(await r.arrayBuffer());
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
      try { if (root.MainLoop && Array.isArray(root.MainLoop.postMainLoop)) root.MainLoop.postMainLoop.push(() => { turns++; }); } catch (e) { /* no clock: nothing is saved */ }
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
      ENGINE_V = ENGINE_VS[card.archive.engine] || '3';
      const a = card.archive, url = 'https://archive.org/cors/' + a.item + '/' + a.file;
      on.status && on.status('Fetching the game from the Internet Archive');
      const zips = [{ name: a.file.split('/').pop(), bytes: await bytesOf(url, a.size) }];
      // A clone runs on its parent's chips too: the card names the parent's zip, fetched the same way.
      // A parent may be saved under the name MAME looks for (Q*Bert's speech chip is votrax.zip; MAME wants votrsc01a.zip).
      for (const p of a.parents || []) zips.push({ name: p.as || p.file.split('/').pop(), bytes: await bytesOf('https://archive.org/cors/' + p.item + '/' + p.file, p.size) });
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
        '-nothrottle', '-nosleep',
        // Sound samples: MAME looks for <machine>.zip in its sample path, by default a folder no page has. Some Archive
        // zips carry the machine's samples beside its chips (Zaxxon's twelve .wav files are inside zaxxon.zip), so the
        // sample path is the same folder as the games. Without it Zaxxon plays silent (audit, 20 Nov 2026).
        '-samplepath', '/roms'];
      if (opts.mute) args.push('-sound', 'none');
      // Audit A11: a trackball or dial machine (Missile Command, Crystal Castles, Sprint 2) takes the computer's mouse as
      // its trackball or dial, as the cabinet's own; a click on the picture hands the mouse to the game and Esc lets it
      // go. The keys still work. Not on a touch screen, where a finger on the picture shows the bar.
      if (mouseGame(card) && typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches) args.push('-mouse');
      // A machine that keeps its settings in battery memory (Williams) shows "FACTORY SETTINGS RESTORED" on a first boot
      // and waits there for ever; our page keeps no battery memory, so every boot is a first boot. One soft reset (the
      // operator's reset button) goes on to the game. It is timed on the game's own clock, not the page's, so a slow
      // computer still lets the memory test finish first; after the reset the script runs again and does nothing.
      // High scores (Bryan, 20 Nov 2026: step 1, kept on this device only): the machine's own battery memory, where an
      // arcade board keeps its high-score table and settings, is saved by MAME into /nvram/<driver>/ and kept here between
      // visits, stamped with the engine. With it back, the machine is no longer on its first boot, so firstBoot is skipped.
      nv.dir = '/nvram/' + a.driver; nv.key = card.id + ':nvram'; nv.stamp = a.engine + '-' + ENGINE_V;
      try {
        const rec = root.PlaySaves && await root.PlaySaves.get(nv.key);
        if (rec && rec.stamp === nv.stamp && rec.state && typeof rec.state === 'object') nv.back = rec.state;
        else if (rec && on.note) on.note('The high scores here were kept by an older engine; this one starts fresh');
      } catch (e) { /* no kept memory */ }
      const firstBoot = nv.back ? null : card.firstBoot;
      const reset = firstBoot && +firstBoot.resetAt;
      // A few machines wait on an operator screen instead (Slither, Victory): the card names the presses, in MAME's own
      // input names, at a time on the game's clock; each is held a third of a second.
      const presses = ((firstBoot && firstBoot.press) || []).filter((p) => +p.at > 0 && /^[A-Za-z0-9 ]{1,40}$/.test(p.input || ''));
      const lua = [
        reset > 0 ? ['local AT = ' + reset,
          'if manager.machine.time:as_double() < AT then',
          '  sub = emu.add_machine_frame_notifier(function()',
          '    if manager.machine.time:as_double() >= AT then sub = nil; manager.machine:soft_reset() end',
          '  end)',
          'end'].join('\n') : '',
        presses.length ? ['local PRESS = {' + presses.map((p) => '{' + +p.at + ', "' + p.input + '"}').join(', ') + '}',
          'local function field(name) for _, port in pairs(manager.machine.ioport.ports) do local f = port.fields[name]; if f then return f end end end',
          'local i, held, upto = 1, nil, 0',
          'if manager.machine.time:as_double() < PRESS[1][1] then',
          '  presser = emu.add_machine_frame_notifier(function()',
          '    local t = manager.machine.time:as_double()',
          '    if held and t >= upto then held:clear_value(); held = nil end',
          '    if not held and PRESS[i] and t >= PRESS[i][1] then local f = field(PRESS[i][2]); if f then f:set_value(1); held = f; upto = t + 0.33 end; i = i + 1 end',
          '    if not held and not PRESS[i] then presser = nil end',
          '  end)',
          'end'].join('\n') : '',
      ].filter(Boolean).join('\n') + '\n';
      const hasLua = reset > 0 || presses.length > 0;
      // Not saved until the first boot's last step is well behind it: memory saved before the reset is the factory state,
      // and the next visit (which skips firstBoot) would stay stuck on it (the assistant session's warning).
      nv.after = Math.max(0, reset || 0, ...presses.map((p) => +p.at)) + 5;
      if (hasLua) args.push('-autoboot_script', '/lua/firstboot.lua');
      root.Module = {
        canvas, arguments: args,
        preRun: [() => { const fs = root.Module.FS || root.FS; fs.mkdir('/roms'); for (const z of zips) fs.writeFile('/roms/' + z.name, z.bytes);
          if (hasLua) { fs.mkdir('/lua'); fs.writeFile('/lua/firstboot.lua', lua); }
          for (const [rel, bytes] of Object.entries(nv.back || {})) {
            if (!/^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/.test(rel) || rel.split('/').includes('..') || !(bytes instanceof Uint8Array)) continue;
            const full = nv.dir + '/' + rel;
            fs.mkdirTree(full.slice(0, full.lastIndexOf('/')));
            fs.writeFile(full, bytes);
          } }],
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
      // One quiet second try: a download broken partway is the usual cause of a failed unpack (audit: Joust live, once).
      const unpacked = async () => {
        const res = await fetch(engine.replace(/\.js$/, '.wasm.gz') + '?v=' + ENGINE_V);
        if (!res.ok) return null;
        let b = new Uint8Array(await res.arrayBuffer());
        if (b[0] === 0x1f && b[1] === 0x8b) {
          if (!root.DecompressionStream) throw new Error('no DecompressionStream');
          b = new Uint8Array(await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
        }
        return b;
      };
      try {
        let buf;
        try { buf = await unpacked(); } catch (e) { if (!root.DecompressionStream) throw e; console.warn('[mame] engine, second try:', e); buf = await unpacked(); }
        if (buf) {
          // Only real wasm is used (it starts "\0asm"): a missing file can come back as the site's own page with a 200.
          // MAME 0.289's build skips wasmBinary and always fetches its plain .wasm, but it asks instantiateWasm first,
          // so the unpacked engine is handed over there.
          if (buf[0] === 0 && buf[1] === 0x61 && buf[2] === 0x73 && buf[3] === 0x6d) {
            // Once it runs, the unpacked bytes are let go (31 MiB for the 68000 engine, which matters on a phone; audit).
            root.Module.instantiateWasm = (imports, done) => {
              WebAssembly.instantiate(buf, imports).then((r) => { buf = null; done(r.instance, r.module); }, (e) => {
                console.warn('[mame] engine start:', e);
                if (on.error) on.error('The arcade engine did not load. Try again in a moment.');
              });
              return {};
            };
          }
        }
      } catch (e) {
        console.warn('[mame] engine unpack:', e);
        if (on.error) on.error(root.DecompressionStream ? 'The arcade engine did not load. Try again in a moment.'
          : 'This browser cannot open the arcade engine. A newer browser can.');
        return;
      }
      watchFrames(); keepTitle();
      const s = document.createElement('script');
      // The script carries the same version as its .wasm.gz: an engine's .js and .wasm are one build, and the edge kept an
      // old williams.js beside the new wasm for a day ("memory access out of bounds", Joust live, 20 Nov 2026; audit).
      s.src = engine + '?v=' + ENGINE_V;
      s.onerror = () => on.error && on.error('The arcade engine did not load. Try again in a moment.');
      document.body.appendChild(s);
    }

    // A key from the gamepad or the touch pad, sent the way the PC keyboard's would be. isTrusted is false on these,
    // which is how the page tells them from the real keyboard.
    const KEYS = { ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, Enter: 13, Space: 32, ControlLeft: 17, AltLeft: 18,
      ShiftLeft: 16, Digit1: 49, Digit2: 50, Digit5: 53, Digit6: 54 };
    function send(code, down) {
      const k = code.startsWith('Digit') ? code.slice(5) : code.startsWith('Key') ? code.slice(3).toLowerCase()
        : { Space: ' ', ControlLeft: 'Control', AltLeft: 'Alt', ShiftLeft: 'Shift' }[code] || code;
      const ev = new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: k, keyCode: KEYS[code] || 0, which: KEYS[code] || 0, bubbles: true, cancelable: true });
      document.dispatchEvent(ev);
    }
    // A coin is a short pulse, however long the button is held, as a real coin switch is: some machines ignore a coin
    // held past a fifth of a second (Space Fury, Zektor; Tehkan World Cup past a quarter), and a tap on glass often lasts
    // that long (the arcade audit, 20 Nov 2026). MAME's default coin keys are 5 and 6 on every machine.
    const COIN = new Set(['Digit5', 'Digit6']);
    function key(code, down) {
      if (!COIN.has(code)) return send(code, down);
      if (!down) return;
      send(code, true);
      setTimeout(() => send(code, false), 80);   // 80 ms: measured to credit Space Fury and Star Trek (audit)
    }

    return {
      start, key, keepScores,
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
      // MAME makes its own sound context when the game first makes a sound, seconds after the Play tap, so iPhone and iPad
      // start it suspended; MAME's own watchdog asks it to resume outside any tap, which they refuse. The page calls
      // wakeSound on every tap and key, and a resume asked for there is allowed (audit, 20 Nov 2026).
      wakeSound: () => {
        try {
          const c = root.jsmame_web_audio && root.jsmame_web_audio.get_context();
          if (c && c.state === 'suspended') c.resume();
        } catch (e) { /* no sound yet */ }
      },
      isArcade: true,
    };
  }

  const api = { createRunner, mouseGame };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlayArcade = api;
})(typeof self !== 'undefined' ? self : this);
