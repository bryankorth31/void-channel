// VoidTV PLAY: the runner, the page's half of the host. Licence: GPL-2.0-or-later (play/LICENSE).
// One contract for every core (Couch Craft's runner rule): start(card), key(code, down), pause(), resume(),
// save(), load(state), reset(), stop(). The core itself runs in core-worker.js; this side draws each picture on the
// canvas at the game's own size (CSS scales it, sharp pixels) and plays the sound through one small audio worklet.
(function (root) {
  // The sound side: a ring of stereo samples, drained by the audio thread at the speaker's pace. The core's own sample
  // rate may differ from the speaker's (the sound is made at the Play tap, before the core says its rate), so the worklet
  // steps through the ring at the ratio of the two. If it gets more than a fifth of a second ahead it drops the oldest,
  // so the sound never drifts behind the picture.
  const WORKLET = `
  class PlaySound extends AudioWorkletProcessor {
    constructor() { super(); this.buf = new Float32Array(65536); this.r = 0; this.w = 0; this.step = 1; this.frac = 0;
      this.port.onmessage = (e) => { const s = e.data;
        if (s && s.rate) { this.step = s.rate / sampleRate; return; }
        for (let i = 0; i < s.length; i++) { this.buf[this.w] = s[i] / 32768; this.w = (this.w + 1) & 65535; }
        const have = (this.w - this.r) & 65535; const max = Math.floor(sampleRate * this.step * 0.2) * 2; if (have > max) this.r = ((this.w - max) & 65535) & ~1; }; }
    process(_, out) { const L = out[0][0], R = out[0][1] || out[0][0];
      for (let i = 0; i < L.length; i++) {
        if (((this.w - this.r) & 65535) < 4) { L[i] = R[i] = 0; continue; }
        L[i] = this.buf[this.r]; R[i] = this.buf[(this.r + 1) & 65535];
        this.frac += this.step; const whole = Math.floor(this.frac); this.frac -= whole; this.r = (this.r + 2 * whole) & 65535; }
      return true; } }
  registerProcessor('play-sound', PlaySound);`;

  const ASK_MS = 8000; // a save or load that takes longer than this is treated as failed, never left hanging

  function createRunner(opts) {
    const canvas = opts.canvas, ctx = canvas.getContext('2d', { alpha: false });
    const on = opts.on || {};
    let worker = null, audio = null, node = null, rate = 0, frames = 0, stopped = false;
    let why = '';                           // why the last save failed, when the engine said ('dos': still at DOS)
    let asking = null;                      // the one save or load waiting for its answer: { done, timer }
    const queue = [];                       // the rest, one at a time

    // Called inside the Play tap itself: iPhone and iPad only let sound start in a tap.
    function prepareSound() {
      if (opts.mute || audio) return;
      try {
        audio = new AudioContext({ latencyHint: 'interactive' });
        audio.resume();
        const url = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }));
        audio.audioWorklet.addModule(url).then(() => {
          if (stopped || !audio) return;
          node = new AudioWorkletNode(audio, 'play-sound', { outputChannelCount: [2] });
          node.connect(audio.destination);
          if (rate) node.port.postMessage({ rate });
        }).catch(() => { node = null; on.status && on.status('Sound is off on this device'); });
      } catch (e) { audio = null; node = null; }
    }

    function draw(m) {
      if (canvas.width !== m.w || canvas.height !== m.h) { canvas.width = m.w; canvas.height = m.h; }
      ctx.putImageData(new ImageData(new Uint8ClampedArray(m.pixels), m.w, m.h), 0, 0);
      frames++;
      if (frames === 1 && on.firstFrame) on.firstFrame();
      if (on.aspect) on.aspect(m.aspect || m.w / m.h);
    }

    function settle(value) {
      if (!asking) return;
      clearTimeout(asking.timer);
      const done = asking.done; asking = null;
      done(value);
      next();
    }
    function next() {
      if (asking || !queue.length) return;
      const job = queue.shift();
      if (!worker) { job.done(null); return next(); }
      asking = { done: job.done, timer: setTimeout(() => settle(null), ASK_MS) };
      worker.postMessage(job.msg, job.transfer || []);
    }
    const ask = (msg, transfer) => new Promise((done) => { queue.push({ msg, transfer, done }); next(); });

    function start(card, base, version) {
      const workerUrl = new URL('src/core-worker.js', base);
      // ?v= the engine's build: a new engine never meets an old one in the browser's cache (the js and wasm always match).
      workerUrl.searchParams.set('engine', '../' + PlayCards.engineOf(card) + (version ? '?v=' + version : ''));
      worker = new Worker(workerUrl);
      worker.onmessage = (e) => {
        if (stopped) return;
        const m = e.data;
        if (m.type === 'frame') draw(m);
        else if (m.type === 'sound') { if (node) node.port.postMessage(new Int16Array(m.samples), [m.samples]); }
        else if (m.type === 'ready') { rate = m.rate; if (node) node.port.postMessage({ rate }); on.ready && on.ready(m); }
        else if (m.type === 'status') on.status && on.status(m.text);
        else if (m.type === 'cheats') on.cheats && on.cheats(m);
        else if (m.type === 'error') on.error && on.error(m.text);
        else if (m.type === 'saved') { why = m.why || ''; settle(m.state || null); }
        else if (m.type === 'loaded') settle(!!m.ok);
      };
      worker.onerror = (e) => { if (!stopped && on.error) on.error(e.message || 'The engine stopped'); };
      worker.postMessage({ type: 'start', gameUrl: PlayCards.gameUrl(card), gameFile: PlayCards.gameFile(card),
        start: card.archive.start || '', vars: card.vars || {}, gameSize: card.archive.size || 0,
        // Plan T21: a big many-file game reads in pieces through voidtv.net's pass-through, by game id only.
        stream: card.archive.stream ? { url: new URL('/api/piece?game=' + encodeURIComponent(card.id), location.href).href, size: card.archive.size } : null,
        pads: PlayCards.isPad(card) ? Math.max(1, card.players || 1) : 0,
        rewind: PlayCards.isPad(card) });
    }

    // Stop means stopped: the worker and its helper threads end now, no late picture or sound reaches the page, and a
    // save or load still waiting is answered "no".
    function stop() {
      stopped = true;
      if (worker) { worker.onmessage = null; worker.onerror = null; worker.terminate(); worker = null; }
      if (asking) { clearTimeout(asking.timer); const d = asking.done; asking = null; d(null); }
      while (queue.length) queue.shift().done(null);
      if (audio) { try { audio.close(); } catch (e) { /* already closed */ } audio = null; node = null; }
    }

    const post = (m) => { if (worker) worker.postMessage(m); };
    return {
      start, stop, prepareSound,
      key: (code, down) => post({ type: 'key', code, down }),
      pad: (port, bits) => post({ type: 'pad', port, bits }),
      // A DOS game's mouse (plan T21b): movement since the last call, and the buttons held (1 left, 2 right, 4 middle).
      mouse: (dx, dy, buttons) => post({ type: 'mouse', dx: Math.round(dx), dy: Math.round(dy), buttons }),
      // Cheats: the codes of the ones switched on (all others off).
      cheats: (codes) => post({ type: 'cheats', codes: (codes || []).slice(0, 40) }),
      pause: () => { post({ type: 'pause' }); if (audio) audio.suspend(); },
      resume: () => { post({ type: 'resume' }); if (audio) audio.resume(); },
      save: () => ask({ type: 'save' }),
      load: (state) => { const copy = state.slice(0); return ask({ type: 'load', state: copy }, [copy]); },
      reset: () => post({ type: 'reset' }),
      rewind: (on) => post({ type: 'rewind', on: !!on }),
      frames: () => frames,
      saveWhy: () => why,
      wakeSound: () => { if (audio && audio.state === 'suspended') audio.resume(); },
    };
  }
  root.PlayRunner = { createRunner };
})(typeof self !== 'undefined' ? self : this);
