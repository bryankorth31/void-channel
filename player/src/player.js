/*
 * VOID player: the page side. Builds the controls once, reuses one <video> for its whole life, feeds the
 * core (core.js) samples and events, and carries out what the core decides.
 *
 *   const p = VoidPlayer.create(document.getElementById('stage'), { onEvent: (e) => console.log(e) });
 *   p.load({ title, show, files: [...ranked copies from tools/rank-sources.js] }, { startAt: 0, autoplay: true });
 *
 * Needs core.js and icons.js loaded first (they set window.VoidCore and window.VoidIcons).
 * Nothing here knows about VOIDtv's pages; the host passes callbacks (onNext, onEnded, onEvent...).
 */
(function (root) {
  'use strict';
  const Core = root.VoidCore;
  const ICON = root.VoidIcons || {};
  const now = () => (root.performance && performance.now ? performance.now() : Date.now());
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } } };
  const sstore = { get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* private mode */ } } };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (t) => { t = Math.max(0, t | 0); const h = (t / 3600) | 0, m = ((t % 3600) / 60) | 0, x = t % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };

  const DEFAULTS = {
    skipBack: 10, skipFwd: 30, arrowSkip: 10, volumeKeys: true, storageKey: 'voidplayer', globalKeys: false, resolveServers: true, metadataTimeoutMs: 2500,
    onEvent: null, onEnded: null, onNext: null, onPrev: null, onReport: null, config: null,
  };

  // ---------- Archive servers: every item lives on a primary and a backup storage server ----------
  const serverCache = new Map();
  function fetchJson(url, ms) {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = setTimeout(() => ctl && ctl.abort(), ms);
    return fetch(url, { signal: ctl && ctl.signal, credentials: 'omit' }).then((r) => (r.ok ? r.json() : null)).catch(() => null).finally(() => clearTimeout(timer));
  }
  function servers(item, ms) {
    if (!item) return Promise.resolve(null);
    if (serverCache.has(item)) return serverCache.get(item);
    const cached = sstore.get('voidplayer:srv:' + item);
    if (cached) { try { const c = JSON.parse(cached); if (c.at > Date.now() - 3600e3) { const p = Promise.resolve(c); serverCache.set(item, p); return p; } } catch (e) { /* stale */ } }
    const base = 'https://archive.org/metadata/' + encodeURIComponent(item) + '/';
    const p = Promise.all([fetchJson(base + 'workable_servers', ms), fetchJson(base + 'dir', ms)]).then(([w, d]) => {
      const list = w && Array.isArray(w.result) ? w.result.filter((h) => /^[a-z0-9.-]+\.archive\.org$/.test(h)) : [];
      const dir = d && typeof d.result === 'string' && /^\/[\w./-]+$/.test(d.result) ? d.result : '';
      if (!list.length || !dir) return null;
      const r = { hosts: list.slice(0, 2), dir, at: Date.now() };
      sstore.set('voidplayer:srv:' + item, JSON.stringify(r));
      return r;
    });
    serverCache.set(item, p);
    p.then((r) => { if (!r) serverCache.delete(item); });
    return p;
  }

  // Which copies this browser can play at all.
  function supported(f, video) {
    if (f.needs === 'mkv') return !!video.canPlayType('video/x-matroska; codecs="avc1.640028, mp4a.40.2"') || !!video.canPlayType('video/webm; codecs="avc1.640028"');
    if (f.needs === 'ogg') return !!video.canPlayType('video/ogg; codecs="theora"');
    return true;
  }

  class Player {
    constructor(container, options) {
      if (!Core) throw new Error('VoidPlayer needs core.js loaded first');
      this.o = Object.assign({}, DEFAULTS, options || {});
      this.events = [];
      this._timers = new Set();
      this._listeners = [];
      this.ep = null;
      this._build(container);
      this.core = Core.create({ config: this.o.config, emit: (e) => this._emit(e), act: (a) => this._act(a) });
      this._wire();
      this._loop = setInterval(() => this._sample(), 250);
    }

    // ---------- public API ----------
    async load(ep, opts) {
      opts = opts || {};
      this.ep = ep;
      this._teardown(); // stop the previous episode now, not after the server lookup
      this._resetUi();
      this._setTitle();
      this._token = (this._token || 0) + 1;
      const token = this._token;
      const v = this.v;
      const files = (ep.files || []).filter((f) => f && f.url && supported(f, v));
      // Build the try-order: each copy on its primary server, then its backup server, then the Archive's
      // normal link (which lets the Archive pick a server). One small lookup per item, cached.
      let srv = [];
      if (this.o.resolveServers) srv = await Promise.all(files.map((f) => servers(f.item, this.o.metadataTimeoutMs)));
      if (token !== this._token) return; // a newer load() won
      const list = [];
      files.forEach((f, i) => {
        const tag = 'copy' + (i + 1);
        const s = srv[i];
        if (s && f.path) s.hosts.forEach((h, k) => list.push({ url: 'https://' + h + s.dir + '/' + f.path, label: tag + (k ? '@backup' : '@primary'), file: f, fileKey: i, server: h }));
        list.push({ url: f.url, label: tag + '@archive', file: f, fileKey: i, server: 'archive.org' });
      });
      this._emit({ type: 'load', id: ep.id, title: ep.title, sources: list.map((x) => x.label), at: now() });
      this._setMedia(ep);
      this.core.load(list, opts.startAt || 0, now(), opts.autoplay !== false);
    }
    play() { this.core.event('user-play', now()); const p = this.v.play(); if (p && p.catch) p.catch(() => this._needTap()); }
    pause() { this.core.event('user-pause', now()); this.v.pause(); }
    toggle() { if (this.v.paused) this.play(); else this.pause(); }
    seek(t) { const v = this.v; if (!v.duration) return; t = Math.max(0, Math.min(v.duration - 0.5, t)); this.core.event('user-seek', now(), { t }); v.currentTime = t; }
    skip(d) { this.seek(this.v.currentTime + d); this._flash(d < 0 ? '−' + Math.abs(d) + 's' : '+' + d + 's', d < 0 ? 'l' : 'r'); }
    get currentTime() { return this.v.currentTime; }
    get duration() { return this.v.duration || 0; }
    diagnostics() {
      const v = this.v, q = v.getVideoPlaybackQuality ? v.getVideoPlaybackQuality() : null;
      return {
        when: new Date().toISOString(), episode: this.ep && { id: this.ep.id, title: this.ep.title, show: this.ep.show },
        state: this.core.state, source: this.core.source && { label: this.core.source.label, url: this.core.source.url },
        time: Math.round(v.currentTime * 10) / 10, duration: Math.round((v.duration || 0) * 10) / 10, ahead: Math.round(this._ahead() * 10) / 10,
        readyState: v.readyState, networkState: v.networkState, error: v.error && v.error.code, size: v.videoWidth + 'x' + v.videoHeight,
        frames: q && { total: q.totalVideoFrames, dropped: q.droppedVideoFrames }, pageDrawing: !!this._drawing, summary: this.core.summary(), decisions: this.core.log,
        events: this.events.slice(-40), ua: navigator.userAgent,
      };
    }
    // Shows an "up next" card with a countdown. Resolves true (play it) or false (cancelled).
    upNext(title, seconds) {
      seconds = seconds || 10;
      return new Promise((resolve) => {
        let n = seconds;
        const draw = () => this._card('<p class="vpx-k">Up next</p><p class="vpx-t">' + esc(title) + '</p><div class="vpx-acts"><button data-c="go" class="vpx-primary">Play now</button><button data-c="stop">Cancel</button><span class="vpx-dim">' + n + 's</span></div>', (c) => { clearInterval(iv); this._timers.delete(iv); this._hideCard(); resolve(c === 'go'); });
        draw();
        const iv = setInterval(() => { n -= 1; if (n <= 0) { clearInterval(iv); this._timers.delete(iv); this._hideCard(); resolve(true); } else draw(); }, 1000);
        this._timers.add(iv);
      });
    }
    destroy() {
      if (this.ep) this._emit({ type: 'summary', summary: this.core.summary(), at: now() });
      this.ep = null;
      clearInterval(this._loop);
      if (this._raf && root.cancelAnimationFrame) cancelAnimationFrame(this._raf);
      this._timers.forEach((t) => { clearInterval(t); clearTimeout(t); });
      this._listeners.forEach(([t, ev, fn, o]) => t.removeEventListener(ev, fn, o));
      if (this._io) this._io.disconnect();
      this._teardown();
      if ('mediaSession' in navigator) ['play', 'pause', 'seekbackward', 'seekforward', 'previoustrack', 'nexttrack', 'seekto'].forEach((a) => { try { navigator.mediaSession.setActionHandler(a, null); } catch (e) { /* unsupported */ } });
      this.root.remove();
    }

    // ---------- building ----------
    _build(container) {
      const b = (a, icon, label, extra) => '<button type="button" data-a="' + a + '" aria-label="' + esc(label) + '" title="' + esc(label) + '"' + (extra || '') + '>' + (ICON[icon] || '') + '</button>';
      const r = document.createElement('div');
      r.className = 'vpx paused';
      r.tabIndex = 0;
      r.setAttribute('role', 'region');
      r.setAttribute('aria-label', 'Video player');
      r.innerHTML = '<video playsinline preload="metadata"></video>'
        + '<div class="vpx-shade" aria-hidden="true"></div>'
        + '<div class="vpx-status" role="status" aria-live="polite"><span class="vpx-spin" aria-hidden="true"></span><span class="vpx-status-t"></span></div>'
        + '<button type="button" class="vpx-big" data-a="toggle" aria-label="Play">' + (ICON.play || '') + '</button>'
        + '<div class="vpx-flash" aria-hidden="true"></div>'
        + '<div class="vpx-card" role="dialog" aria-live="assertive" hidden></div>'
        + '<div class="vpx-bar">'
        + '<div class="vpx-title"></div>'
        + '<div class="vpx-seek"><div class="vpx-buf"></div><div class="vpx-played"></div><input type="range" min="0" max="1000" step="1" value="0" aria-label="Seek"></div>'
        + '<div class="vpx-row">'
        + b('toggle', 'play', 'Play (K)') + b('back', 'back10', 'Back ' + this.o.skipBack + ' seconds (J)') + b('fwd', this.o.skipFwd === 10 ? 'fwd10' : 'fwd30', 'Forward ' + this.o.skipFwd + ' seconds (L)')
        + '<span class="vpx-time" aria-live="off">0:00 / 0:00</span><span class="vpx-sp"></span>'
        + b('mute', 'volume', 'Mute (M)') + '<input class="vpx-vol" type="range" min="0" max="100" step="1" value="100" aria-label="Volume">'
        + b('cc', 'captions', 'Captions (C)') + '<button type="button" data-a="speed" class="vpx-speed" aria-label="Playback speed" title="Playback speed">1×</button>'
        + b('pip', 'pip', 'Picture in picture') + (this.o.onNext ? b('next', 'next', 'Next episode (N)') : '') + b('fs', 'fullscreen', 'Fullscreen (F)')
        + '</div></div>';
      container.appendChild(r);
      this.root = r;
      this.v = r.querySelector('video');
      const q = (s) => r.querySelector(s);
      this.ui = { seek: q('.vpx-seek input'), played: q('.vpx-played'), buf: q('.vpx-buf'), time: q('.vpx-time'), vol: q('.vpx-vol'), status: q('.vpx-status'), statusT: q('.vpx-status-t'), card: q('.vpx-card'), flash: q('.vpx-flash'), title: q('.vpx-title'), speed: q('.vpx-speed'), mute: q('[data-a=mute]'), cc: q('[data-a=cc]'), fs: q('[data-a=fs]') };
      const sv = store.get(this.o.storageKey + ':vol');
      if (sv != null && !isNaN(+sv)) this.v.volume = Math.max(0, Math.min(1, +sv));
      this._syncVol();
    }

    _on(t, ev, fn, o) { t.addEventListener(ev, fn, o); this._listeners.push([t, ev, fn, o]); }

    _wire() {
      const r = this.root, v = this.v, ui = this.ui;
      // Frame timing: the only reliable way to see a frozen or lagging picture.
      this._frames = 0;
      this._rvfc = typeof v.requestVideoFrameCallback === 'function';
      if (this._rvfc) {
        const cb = (t, meta) => { this._frames += 1; this.core.frame(meta.mediaTime, v.currentTime, now()); this._rvfcId = v.requestVideoFrameCallback(cb); };
        this._rvfcId = v.requestVideoFrameCallback(cb);
      }
      // Is the page actually being drawn? Embedded views, covered windows and some TV browsers report
      // "visible" while drawing nothing; then no video frames arrive either, and that is not a freeze.
      // The browser's own drawing heartbeat (requestAnimationFrame) is the only honest signal.
      this._lastRaf = 0;
      const beat = () => { this._lastRaf = now(); this._raf = root.requestAnimationFrame ? requestAnimationFrame(beat) : 0; };
      if (root.requestAnimationFrame) this._raf = requestAnimationFrame(beat);
      // Off-screen or hidden video gets no frames; tell the core so it never mistakes that for a freeze.
      this._visible = true;
      if (typeof IntersectionObserver !== 'undefined') { this._io = new IntersectionObserver((es) => { this._visible = es[es.length - 1].isIntersecting; }); this._io.observe(r); }

      this._on(r, 'click', (e) => {
        const btn = e.target.closest('[data-a]');
        if (btn) { this._do(btn.dataset.a, btn); this._show(); return; }
        if (e.target === v || e.target.classList.contains('vpx-shade')) {
          if (this._touch) { r.classList.contains('show') && !v.paused ? r.classList.remove('show') : this._show(); return; }
          clearTimeout(this._clickT); this._clickT = setTimeout(() => this.toggle(), 220);
        }
      });
      this._on(r, 'dblclick', (e) => { if (e.target === v || e.target.classList.contains('vpx-shade')) { clearTimeout(this._clickT); this._do('fs'); } });
      let lastTap = 0;
      this._on(r, 'touchstart', () => { this._touch = true; }, { passive: true });
      this._on(v, 'touchend', (e) => {
        const t = Date.now();
        if (t - lastTap < 320 && e.changedTouches.length) {
          const x = e.changedTouches[0].clientX - r.getBoundingClientRect().left, w = r.clientWidth;
          if (x < w * 0.4) this.skip(-this.o.skipBack); else if (x > w * 0.6) this.skip(this.o.skipFwd);
          e.preventDefault();
        }
        lastTap = t;
      }, { passive: false });
      ['mousemove', 'touchstart', 'focusin'].forEach((ev) => this._on(r, ev, () => this._show(), { passive: true }));
      this._on(r, 'keydown', (e) => this._key(e));
      if (this.o.globalKeys) this._on(document, 'keydown', (e) => { if (!r.contains(e.target)) this._key(e, true); });

      this._on(ui.seek, 'input', () => { if (v.duration) { this.seek(ui.seek.value / 1000 * v.duration); } this._show(); });
      this._on(ui.vol, 'input', () => { v.volume = ui.vol.value / 100; v.muted = +ui.vol.value === 0; store.set(this.o.storageKey + ':vol', String(v.volume)); this._show(); });

      this._on(v, 'play', () => this._icons());
      this._on(v, 'pause', () => this._icons());
      this._on(v, 'volumechange', () => this._syncVol());
      this._on(v, 'timeupdate', () => this._progress());
      this._on(v, 'progress', () => this._progress());
      this._on(v, 'loadedmetadata', () => { this._progress(); if (v.textTracks.length) { ui.cc.classList.add('has'); v.textTracks[0].mode = 'hidden'; } });
      this._on(v, 'error', () => { if (!v.getAttribute('src')) return; this.core.event('error', now(), { code: v.error && v.error.code, neverLoaded: v.readyState === 0 }); });
      this._on(v, 'ended', () => { this._icons(); this._emit({ type: 'summary', summary: this.core.summary(), at: now() }); if (this.o.onEnded) this.o.onEnded(this); });
      this._on(document, 'fullscreenchange', () => { const on = document.fullscreenElement === r; r.classList.toggle('fs', on); ui.fs.innerHTML = ICON[on ? 'exit-fullscreen' : 'fullscreen'] || ''; ui.fs.setAttribute('aria-label', on ? 'Exit fullscreen (F)' : 'Fullscreen (F)'); });
      this._on(root, 'pagehide', () => this._emit({ type: 'summary', summary: this.core.summary(), at: now() }));
      this._icons();
    }

    // ---------- carrying out the core's decisions ----------
    _act(a) {
      const v = this.v;
      if (a.type === 'set-source') return this._setSrc(a.source.url, a.at, a.play);
      if (a.type === 'seek') { v.currentTime = a.at; this._status('Catching up…', 1500); return; }
      if (a.type === 'reload') {
        this._status('Reconnecting…');
        const go = () => this._setSrc(v.getAttribute('src'), a.at, a.play);
        if (a.delayMs) { const t = setTimeout(go, a.delayMs); this._timers.add(t); } else go();
        return;
      }
      if (a.type === 'show-failure') return this._failure(a.reason);
      if (a.type === 'show-notice') return this._notice(a.reason);
    }

    // Swap the source on the ONE video element, shutting the previous stream down properly first.
    _setSrc(url, at, play) {
      const v = this.v;
      this._teardown(true);
      if (!url) return;
      const onMeta = () => { v.removeEventListener('loadedmetadata', onMeta); if (at > 1 && v.duration && at < v.duration - 3) v.currentTime = at; };
      v.addEventListener('loadedmetadata', onMeta);
      v.src = url;
      v.load();
      // Silent copy check: some copies carry sound this browser cannot decode (AC3, DTS...). Chromium and Safari
      // count decoded audio bytes; zero after a few seconds of playing with the sound on means a silent copy.
      const mine = url;
      const onPlaying = () => {
        v.removeEventListener('playing', onPlaying);
        const t = setTimeout(() => {
          this._timers.delete(t);
          if (v.getAttribute('src') !== mine || v.paused || v.muted || v.volume === 0 || v.currentTime < 2) return;
          if (typeof v.webkitAudioDecodedByteCount === 'number' && v.webkitAudioDecodedByteCount === 0) this.core.event('silent', now());
        }, 4500);
        this._timers.add(t);
      };
      v.addEventListener('playing', onPlaying);
      if (play) { const p = v.play(); if (p && p.catch) p.catch((e) => { if (e && e.name === 'NotAllowedError') this._needTap(); }); }
    }
    _teardown(keepUi) {
      const v = this.v;
      try { v.pause(); } catch (e) { /* not ready */ }
      if (v.getAttribute('src')) { v.removeAttribute('src'); try { v.load(); } catch (e) { /* ignore */ } }
      if (!keepUi) this._hideCard();
    }

    _sample() {
      const v = this.v;
      let total, dropped;
      if (v.getVideoPlaybackQuality) { const q = v.getVideoPlaybackQuality(); total = q.totalVideoFrames; dropped = q.droppedVideoFrames; }
      this._drawing = !root.requestAnimationFrame || now() - this._lastRaf < 500;
      const hidden = document.hidden || !this._visible || !this._drawing || document.pictureInPictureElement === v;
      this.core.sample({
        now: now(), t: v.currentTime, paused: v.paused, seeking: v.seeking, ended: v.ended, ready: v.readyState, hidden,
        hasVideo: v.readyState >= 1 ? v.videoWidth > 0 : undefined,
        frames: this._rvfc ? this._frames : total, dropped, totalFrames: total, ahead: this._ahead(),
      });
      const st = this.core.state;
      this.root.classList.toggle('wait', st === 'buffering' || st === 'loading' || st === 'recovering');
      if (st === 'playing' && this._statusUntil && now() > this._statusUntil) this._status('');
    }
    _ahead() { const v = this.v, b = v.buffered; for (let i = 0; i < b.length; i++) if (b.start(i) <= v.currentTime + 0.1 && b.end(i) >= v.currentTime) return b.end(i) - v.currentTime; return 0; }

    _emit(e) {
      this.events.push(e); if (this.events.length > 200) this.events.shift();
      if (e.type === 'state' && e.to === 'recovering') this._status('Reconnecting…');
      if (e.type === 'switch') this._status('Switching to a backup copy…');
      if (e.type === 'recovered' || (e.type === 'state' && e.to === 'playing')) this._statusUntil = now() + 1200;
      if (this.o.onEvent) { try { this.o.onEvent(e, this); } catch (x) { /* host bug must not break playback */ } }
    }

    // ---------- UI ----------
    _do(a, btn) {
      const v = this.v;
      if (a === 'toggle') return this.toggle();
      if (a === 'back') return this.skip(-this.o.skipBack);
      if (a === 'fwd') return this.skip(this.o.skipFwd);
      if (a === 'mute') { v.muted = !v.muted; if (!v.muted && v.volume === 0) v.volume = 0.5; return; }
      if (a === 'cc') return this._captions();
      if (a === 'speed') { const r = [1, 1.25, 1.5, 1.75, 2, 0.75]; v.playbackRate = r[(r.indexOf(v.playbackRate) + 1) % r.length]; this.ui.speed.textContent = v.playbackRate + '×'; this.ui.speed.classList.toggle('on', v.playbackRate !== 1); return; }
      if (a === 'pip') { if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {}); else if (v.requestPictureInPicture) v.requestPictureInPicture().catch(() => {}); return; }
      if (a === 'next') { if (this.o.onNext) this.o.onNext(this); return; }
      if (a === 'fs') {
        if (document.fullscreenElement) return document.exitFullscreen().catch(() => {});
        if (this.root.requestFullscreen) return this.root.requestFullscreen().catch(() => {});
        if (v.webkitEnterFullscreen) v.webkitEnterFullscreen();
      }
    }

    _key(e, outside) {
      if (e.defaultPrevented) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return; // never steal browser shortcuts (Ctrl+C, Ctrl+F, Alt+←)
      const t = e.target;
      if (t && t.matches && t.matches('input:not([type=range]),textarea,select,[contenteditable],[contenteditable] *')) return;
      const onButton = t && t.tagName === 'BUTTON';
      const k = e.key;
      // Keys pressed elsewhere on the page: letters still drive the player, but Space, Enter and arrows
      // belong to whatever link or button has focus there.
      if (outside && (k === ' ' || k === 'Enter' || k.startsWith('Arrow')) && t && t.closest && t.closest('a,button,[role=button],[tabindex]:not(body)')) return;
      if ((k === ' ' || k === 'Enter') && onButton) return; // the focused button handles it
      if (t && t.type === 'range' && (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown')) return; // the slider handles its own arrows
      // TV remotes: Left/Right move between focused controls instead of seeking.
      if (onButton && !outside && (k === 'ArrowLeft' || k === 'ArrowRight')) { this._moveFocus(t, k === 'ArrowRight' ? 1 : -1); e.preventDefault(); return; }
      let did = true;
      if (k === ' ' || k === 'k' || k === 'K' || k === 'MediaPlayPause') this.toggle();
      else if (k === 'ArrowLeft') this.skip(-this.o.arrowSkip);
      else if (k === 'ArrowRight') this.skip(this.o.arrowSkip);
      else if (k === 'j' || k === 'J') this.skip(-this.o.skipBack);
      else if (k === 'l' || k === 'L') this.skip(this.o.skipFwd);
      else if (k === 'ArrowUp' && !onButton && this.o.volumeKeys) { this.v.volume = Math.min(1, this.v.volume + 0.1); this.v.muted = false; store.set(this.o.storageKey + ':vol', String(this.v.volume)); }
      else if (k === 'ArrowDown' && !onButton && this.o.volumeKeys) { this.v.volume = Math.max(0, this.v.volume - 0.1); store.set(this.o.storageKey + ':vol', String(this.v.volume)); }
      else if (k === 'f' || k === 'F') this._do('fs');
      else if (k === 'm' || k === 'M') this._do('mute');
      else if (k === 'c' || k === 'C') this._captions();
      else if ((k === 'n' || k === 'N' || k === 'MediaTrackNext') && this.o.onNext) this.o.onNext(this);
      else if (k === 'MediaTrackPrevious' && this.o.onPrev) this.o.onPrev(this);
      else if (/^[0-9]$/.test(k) && this.v.duration) this.seek(this.v.duration * +k / 10);
      else if (k === 'Escape' && document.fullscreenElement === this.root) { document.exitFullscreen().catch(() => {}); e.stopPropagation(); }
      else did = false;
      if (did) { e.preventDefault(); this._show(); }
    }
    _moveFocus(from, dir) {
      const all = [...this.root.querySelectorAll('.vpx-row button, .vpx-row input')].filter((x) => x.offsetParent !== null);
      const i = all.indexOf(from);
      const n = all[(i + dir + all.length) % all.length];
      if (n) n.focus();
    }

    _show() {
      const r = this.root;
      r.classList.add('show');
      clearTimeout(this._hideT);
      this._hideT = setTimeout(() => { if (!this.v.paused && !r.contains(document.activeElement && document.activeElement.closest('.vpx-row') ? document.activeElement : null)) r.classList.remove('show'); }, 3000);
    }
    _icons() {
      const p = this.v.paused;
      this.root.classList.toggle('paused', p);
      this.root.querySelectorAll('[data-a=toggle]').forEach((b) => { b.innerHTML = ICON[p ? 'play' : 'pause'] || ''; b.setAttribute('aria-label', p ? 'Play (K)' : 'Pause (K)'); });
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = p ? 'paused' : 'playing';
    }
    _syncVol() {
      const v = this.v, ui = this.ui, m = v.muted || v.volume === 0;
      ui.vol.value = m ? 0 : Math.round(v.volume * 100);
      ui.mute.innerHTML = ICON[m ? 'mute' : v.volume < 0.5 ? 'volume-low' : 'volume'] || '';
      ui.mute.setAttribute('aria-label', m ? 'Unmute (M)' : 'Mute (M)');
    }
    _progress() {
      const v = this.v, ui = this.ui;
      if (!v.duration) return;
      const p = v.currentTime / v.duration;
      if (document.activeElement !== ui.seek) ui.seek.value = Math.round(p * 1000);
      ui.played.style.width = p * 100 + '%';
      ui.buf.style.width = Math.min(100, (v.currentTime + this._ahead()) / v.duration * 100) + '%';
      ui.time.textContent = fmt(v.currentTime) + ' / ' + fmt(v.duration);
      ui.seek.setAttribute('aria-valuetext', fmt(v.currentTime) + ' of ' + fmt(v.duration));
    }
    _resetUi() {
      const ui = this.ui;
      ui.seek.value = 0; ui.played.style.width = '0%'; ui.buf.style.width = '0%'; ui.time.textContent = '0:00 / 0:00'; ui.seek.removeAttribute('aria-valuetext');
      ui.cc.classList.remove('has', 'on'); this._status('');
      [...this.v.querySelectorAll('track')].forEach((t) => t.remove()); // captions picked for the last episode do not belong to this one
    }
    _status(text, ms) {
      this.ui.statusT.textContent = text || '';
      this.root.classList.toggle('has-status', !!text);
      this._statusUntil = text && ms ? now() + ms : 0;
    }
    _flash(text, side) {
      const f = this.ui.flash;
      f.textContent = text; f.className = 'vpx-flash on ' + side;
      clearTimeout(this._flashT); this._flashT = setTimeout(() => { f.className = 'vpx-flash'; }, 650);
    }
    _setTitle() { this.ui.title.textContent = this.ep ? [this.ep.show, this.ep.title].filter(Boolean).join(' · ') : ''; }
    _setMedia(ep) {
      if (!('mediaSession' in navigator)) return;
      try {
        navigator.mediaSession.metadata = new MediaMetadata({ title: ep.title || '', artist: ep.show || '', album: 'VOIDtv', artwork: ep.artwork ? [{ src: ep.artwork, sizes: '512x512' }] : [] });
        const ms = navigator.mediaSession, set = (a, f) => { try { ms.setActionHandler(a, f); } catch (e) { /* unsupported action */ } };
        set('play', () => this.play()); set('pause', () => this.pause());
        set('seekbackward', () => this.skip(-this.o.skipBack)); set('seekforward', () => this.skip(this.o.skipFwd));
        set('seekto', (d) => this.seek(d.seekTime));
        set('nexttrack', this.o.onNext ? () => this.o.onNext(this) : null); set('previoustrack', this.o.onPrev ? () => this.o.onPrev(this) : null);
      } catch (e) { /* older browsers */ }
    }
    _needTap() { this.core.event('user-pause', now()); this.root.classList.add('paused'); this._show(); this.root.querySelector('.vpx-big').focus({ preventScroll: true }); }

    _card(html, onPick) {
      const c = this.ui.card;
      c.innerHTML = html; c.hidden = false;
      c.onclick = (e) => { const b = e.target.closest('[data-c]'); if (b) onPick(b.dataset.c); };
      const first = c.querySelector('button'); if (first && !c.contains(document.activeElement)) first.focus({ preventScroll: true });
    }
    _hideCard() { this.ui.card.hidden = true; this.ui.card.innerHTML = ''; }
    _failure(reason) {
      this._status('');
      const f = this.ep && (this.ep.files || [])[0];
      const net = /net|stall|slow/.test(reason || '');
      this._card('<p class="vpx-k">' + (net ? 'The Archive is not sending this episode right now' : 'This episode will not play in this browser') + '</p>'
        + '<p class="vpx-dim">' + (net ? 'We tried every copy and both of its servers. They hiccup now and then; trying again in a minute usually works.' : 'We tried every copy we have. You can download the file and play it in VLC.') + '</p>'
        + '<div class="vpx-acts"><button data-c="retry" class="vpx-primary">' + (ICON.retry || '') + 'Try again</button>'
        + (f ? '<a class="vpx-btn" href="' + esc(f.url) + '" target="_blank" rel="noopener" download>' + (ICON.download || '') + 'Download</a>' : '')
        + (this.o.onNext ? '<button data-c="next">' + (ICON.next || '') + 'Next episode</button>' : '')
        + (this.o.onReport ? '<button data-c="report">' + (ICON.flag || '') + 'Report</button>' : '') + '</div>', (c) => {
        if (c === 'retry') { this._hideCard(); this.core.event('retry', now()); }
        if (c === 'next' && this.o.onNext) { this._hideCard(); this.o.onNext(this); }
        if (c === 'report' && this.o.onReport) this.o.onReport(this.diagnostics(), this);
      });
    }

    _notice(reason) {
      if (reason !== 'silent') return;
      const f = this.ep && (this.ep.files || [])[0];
      this._card('<p class="vpx-k">No sound for this episode in this browser</p><p class="vpx-dim">Its sound is in a format this browser cannot play, and we have no other copy. Edge, Safari and most TVs can play it, or download it for VLC.</p>'
        + '<div class="vpx-acts"><button data-c="keep" class="vpx-primary">Keep watching</button>'
        + (f ? '<a class="vpx-btn" href="' + esc(f.url) + '" target="_blank" rel="noopener" download>' + (ICON.download || '') + 'Download</a>' : '')
        + (this.o.onNext ? '<button data-c="next">' + (ICON.next || '') + 'Next episode</button>' : '') + '</div>', (c) => {
        this._hideCard();
        if (c === 'next' && this.o.onNext) this.o.onNext(this);
      });
    }

    _captions() {
      const v = this.v, btn = this.ui.cc, tracks = [...v.textTracks];
      if (tracks.length) { const t = tracks[0]; t.mode = t.mode === 'showing' ? 'hidden' : 'showing'; btn.classList.toggle('on', t.mode === 'showing'); return; }
      const i = document.createElement('input');
      i.type = 'file'; i.accept = '.srt,.vtt,text/vtt,text/plain';
      i.onchange = async () => {
        const f = i.files[0]; if (!f) return;
        const buf = await f.arrayBuffer();
        let txt; try { txt = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { txt = new TextDecoder('windows-1252').decode(buf); }
        if (!/^﻿?WEBVTT/.test(txt)) txt = 'WEBVTT\n\n' + txt.replace(/\r/g, '').replace(/(\d{1,2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
        const tr = document.createElement('track');
        tr.kind = 'subtitles'; tr.label = f.name; tr.srclang = 'en'; tr.src = URL.createObjectURL(new Blob([txt], { type: 'text/vtt' }));
        v.appendChild(tr); tr.track.mode = 'showing'; btn.classList.add('on');
        this._emit({ type: 'captions-file', at: now() });
      };
      i.click();
    }
  }

  root.VoidPlayer = { create: (el, opts) => new Player(el, opts), servers, supported, version: '0.1.0' };
})(typeof self !== 'undefined' ? self : this);
