// VoidTV PLAY: the runner, the page's half of the host. Licence: GPL-2.0-or-later (play/LICENSE).
// One contract for every core (Couch Craft's runner rule): start(card), key(code, down), pause(), resume(),
// save(), load(state), reset(), stop(). The core itself runs in core-worker.js; this side draws each picture on the
// canvas at the game's own size (CSS scales it, sharp pixels) and plays the sound through one small audio worklet.
(function (root) {
  // The sound side: a ring of stereo samples, drained by the audio thread at the speaker's pace. If it gets more than
  // a fifth of a second ahead it drops the oldest, so the sound never drifts behind the picture.
  const WORKLET = `
  class PlaySound extends AudioWorkletProcessor {
    constructor() { super(); this.buf = new Float32Array(32768); this.r = 0; this.w = 0;
      this.port.onmessage = (e) => { const s = e.data; for (let i = 0; i < s.length; i++) { this.buf[this.w] = s[i] / 32768; this.w = (this.w + 1) & 32767; }
        const have = (this.w - this.r) & 32767; const max = Math.floor(sampleRate * 0.2) * 2; if (have > max) this.r = (this.w - max) & 32767; }; }
    process(_, out) { const L = out[0][0], R = out[0][1] || out[0][0];
      for (let i = 0; i < L.length; i++) { if (this.r === this.w) { L[i] = R[i] = 0; continue; }
        L[i] = this.buf[this.r]; R[i] = this.buf[(this.r + 1) & 32767]; this.r = (this.r + 2) & 32767; } return true; } }
  registerProcessor('play-sound', PlaySound);`;

  function createRunner(opts) {
    const canvas = opts.canvas, ctx = canvas.getContext('2d', { alpha: false });
    const on = opts.on || {};
    let worker = null, audio = null, node = null, rate = 44100, waiting = null, frames = 0;

    async function startSound() {
      if (opts.mute || audio) return;
      try {
        audio = new AudioContext({ sampleRate: rate, latencyHint: 'interactive' });
        const url = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }));
        await audio.audioWorklet.addModule(url);
        node = new AudioWorkletNode(audio, 'play-sound', { outputChannelCount: [2] });
        node.connect(audio.destination);
      } catch (e) { audio = null; node = null; on.status && on.status('Sound is off on this device'); }
    }

    function draw(m) {
      if (canvas.width !== m.w || canvas.height !== m.h) { canvas.width = m.w; canvas.height = m.h; }
      ctx.putImageData(new ImageData(new Uint8ClampedArray(m.pixels), m.w, m.h), 0, 0);
      frames++;
      if (frames === 1 && on.firstFrame) on.firstFrame();
      if (on.aspect) on.aspect(m.aspect || m.w / m.h);
    }

    function start(card, base) {
      const worker_url = new URL('src/core-worker.js', base);
      worker_url.searchParams.set('engine', '../' + PlayCards.engineOf(card));
      worker = new Worker(worker_url);
      worker.onmessage = (e) => {
        const m = e.data;
        if (m.type === 'frame') draw(m);
        else if (m.type === 'sound') { if (node) node.port.postMessage(new Int16Array(m.samples), [m.samples]); }
        else if (m.type === 'ready') { rate = m.rate; startSound(); on.ready && on.ready(m); }
        else if (m.type === 'status') on.status && on.status(m.text);
        else if (m.type === 'error') on.error && on.error(m.text);
        else if ((m.type === 'saved' || m.type === 'loaded') && waiting) { const w = waiting; waiting = null; w(m.type === 'saved' ? m.state : m.ok); }
      };
      worker.onerror = (e) => on.error && on.error(e.message || 'The engine stopped');
      worker.postMessage({ type: 'start', gameUrl: PlayCards.gameUrl(card), gameFile: PlayCards.gameFile(card),
        start: card.archive.start || '', vars: card.vars || {},
        pads: PlayCards.isPad(card) ? Math.max(1, card.players || 1) : 0 });
    }

    const post = (m) => worker && worker.postMessage(m);
    const ask = (m) => new Promise((ok) => { waiting = ok; post(m); });
    return {
      start,
      key: (code, down) => post({ type: 'key', code, down }),
      pad: (port, bits) => post({ type: 'pad', port, bits }),
      pause: () => { post({ type: 'pause' }); if (audio) audio.suspend(); },
      resume: () => { post({ type: 'resume' }); if (audio) audio.resume(); },
      save: () => ask({ type: 'save' }),
      load: (state) => ask({ type: 'load', state }),
      reset: () => post({ type: 'reset' }),
      stop: () => { post({ type: 'stop' }); worker = null; if (audio) audio.close(); },
      frames: () => frames,
      wakeSound: () => { if (audio && audio.state === 'suspended') audio.resume(); },
    };
  }
  root.PlayRunner = { createRunner };
})(typeof self !== 'undefined' ? self : this);
