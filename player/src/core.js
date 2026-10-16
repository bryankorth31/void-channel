/*
 * VOID player core: detects playback trouble and decides what to do about it.
 *
 * It never touches the page or a <video>. The DOM layer (player.js) feeds it samples and media events,
 * and carries out the actions it asks for. That split keeps every decision deterministic and testable
 * in plain Node (see ../test/core.test.js).
 *
 * Trouble it recognises:
 *   stall       the playhead stops moving while playing (the network or server is not keeping up)
 *   freeze      the clock (sound) keeps moving but no new picture frames arrive
 *   drift       picture frames arrive, but behind the sound by more than DRIFT_S
 *   error       the media element reports an error
 *   slow-start  nothing plays within START_MS of asking
 *
 * What it does, in escalating steps, per source:
 *   nudge     jump to the current time (flushes the browser's decoders; re-aligns picture and sound)
 *   reload    reload the same source at the current time
 *   switch    move to the next source (same file on the backup server, then the next copy)
 *   fail      nothing left to try: tell the viewer, offer retry / download / next
 *
 * Every decision is reported through emit() so the host can log it (analytics, Sentry, the lab).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VoidCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULTS = {
    STALL_GRACE_MS: 6000,     // a normal buffering pause; only after this long do we act
    STALL_STEP_MS: 6000,      // how long each stall step gets before the next one
    FREEZE_MS: 1500,          // sound advancing with no new frames for this long = frozen picture
    DRIFT_S: 0.45,            // picture behind sound by more than this...
    DRIFT_FRAMES: 6,          // ...for this many frames in a row = drift
    START_MS: 15000,          // no playback this long after asking = slow start
    SETTLE_MS: 2500,          // after acting, let the browser settle before judging again
    HEALTHY_MS: 5000,         // this long of clean playback after an action = recovered
    REPEAT_WINDOW_MS: 120000, // trouble repeating on one source inside this window escalates
    QUALITY_EVERY_MS: 60000,  // periodic quality report while playing
    NET_RETRY_MS: 1500,       // wait before retrying a network error on the same source
  };

  function create(opts) {
    const C = Object.assign({}, DEFAULTS, (opts && opts.config) || {});
    const emit = (opts && opts.emit) || function () {};
    const act = (opts && opts.act) || function () {};

    let sources = [];         // [{url, label, file, server}], best first
    let si = -1;              // index of the source in use
    let state = 'idle';       // idle | loading | playing | paused | buffering | recovering | failed | ended
    let want = false;         // the viewer wants playback (pressed play / autoplay)
    let lastT = 0, lastProgressAt = 0, lastFrames = -1, lastFrameAt = 0;
    let goodT = 0;            // where the sound is (resume point for every action)
    let askedAt = 0, startedAt = 0, settleUntil = 0;
    let driftRun = 0;
    let framesKnown = false;  // only judge freezes once we can actually see frames arrive
    let bufferingSince = 0, stallStep = 0;
    let pending = null;       // the action in flight: {kind, step, at}
    let history = [];         // trouble on the current source: [{kind, at}]
    let lastQualityAt = 0;
    const totals = { watchMs: 0, stallMs: 0, stalls: 0, freezes: 0, drifts: 0, errors: 0, actions: 0, recovered: 0, switches: 0, startupMs: null };
    let lastSampleAt = 0;
    const log = [];           // recent decisions, for diagnostics
    const note = (o) => { log.push(o); if (log.length > 60) log.shift(); };

    function src() { return sources[si] || null; }
    function setState(s, now) { if (state !== s) { const from = state; state = s; emit({ type: 'state', from, to: s, at: now }); } }

    function load(list, startAt, now, autoplay) {
      sources = (list || []).filter((s) => s && s.url);
      log.length = 0; // diagnostics describe the current episode only
      for (const k of Object.keys(totals)) totals[k] = k === 'startupMs' ? null : 0;
      totals.startupMs = null;
      history = []; pending = null; driftRun = 0; bufferingSince = 0; stallStep = 0;
      goodT = Math.max(0, +startAt || 0);
      want = autoplay !== false;
      askedAt = now; startedAt = 0;
      lastT = goodT; lastProgressAt = now; lastFrames = -1; lastFrameAt = now; framesKnown = false; lastQualityAt = now;
      if (!sources.length) { setState('failed', now); emit({ type: 'failed', reason: 'no-sources', at: now }); act({ type: 'show-failure', reason: 'no-sources' }); return; }
      si = 0;
      setState('loading', now);
      settleUntil = now + C.SETTLE_MS;
      act({ type: 'set-source', index: si, source: src(), at: goodT, play: want });
    }

    function nextSource(reason, now) {
      const from = src();
      if (si + 1 >= sources.length) {
        setState('failed', now);
        pending = null;
        emit({ type: 'failed', reason, source: from && from.label, at: now });
        note({ at: now, did: 'fail', reason });
        act({ type: 'show-failure', reason });
        return;
      }
      si += 1; history = []; driftRun = 0; bufferingSince = 0; stallStep = 0;
      totals.switches += 1;
      pending = { kind: reason, step: 'switch', at: now };
      settleUntil = now + C.SETTLE_MS;
      setState('recovering', now);
      emit({ type: 'switch', reason, from: from && from.label, to: src().label, t: goodT, at: now });
      note({ at: now, did: 'switch', reason, to: src().label });
      act({ type: 'set-source', index: si, source: src(), at: goodT, play: want });
    }

    // One step up the ladder for this kind of trouble on the current source.
    function escalate(kind, now) {
      history = history.filter((h) => now - h.at < C.REPEAT_WINDOW_MS);
      history.push({ kind, at: now });
      const n = history.length;
      totals.actions += 1;
      let step;
      if (kind === 'slow-start') step = 'switch';
      else if (kind === 'error-fatal') step = 'switch';
      else if (kind === 'error-net') step = n === 1 ? 'reload' : 'switch';
      else step = n === 1 ? 'nudge' : n === 2 ? 'reload' : 'switch';
      emit({ type: 'action', kind, step, source: src() && src().label, t: goodT, n, at: now });
      note({ at: now, did: step, kind, n });
      if (step === 'switch') return nextSource(kind, now);
      pending = { kind, step, at: now };
      settleUntil = now + C.SETTLE_MS + (step === 'reload' ? C.SETTLE_MS : 0);
      setState('recovering', now);
      driftRun = 0;
      if (step === 'nudge') act({ type: 'seek', at: goodT });
      else act({ type: 'reload', at: goodT, play: want, delayMs: kind === 'error-net' ? C.NET_RETRY_MS : 0 });
    }

    // Called every ~250 ms by the DOM layer.
    // s = {now, t, paused, seeking, ended, ready, hidden, hasVideo, frames, dropped, totalFrames, ahead}
    function sample(s) {
      const now = s.now;
      const dt = lastSampleAt ? Math.min(1000, now - lastSampleAt) : 0;
      lastSampleAt = now;
      if (state === 'failed' || state === 'idle') return;
      if (s.ended) { if (state !== 'ended') { setState('ended', now); emit({ type: 'ended', at: now }); } return; }
      if (s.paused) {
        if (state !== 'loading' && state !== 'recovering') setState('paused', now);
        lastProgressAt = now; lastFrameAt = now; bufferingSince = 0; driftRun = 0;
        return;
      }
      if (s.seeking) { lastProgressAt = now; lastFrameAt = now; return; }
      if (s.hidden) lastFrameAt = now; // hidden tabs and off-screen video get no frame callbacks: never read that as a freeze

      const moved = s.t > lastT + 0.02;
      if (moved) lastProgressAt = now;
      if (typeof s.frames === 'number') { framesKnown = true; if (s.frames !== lastFrames) { if (s.frames > lastFrames) lastFrameAt = now; lastFrames = s.frames; } }
      lastT = s.t;
      if (moved) goodT = s.t; // the sound's position: recovering here repeats nothing and skips nothing

      if (moved && state !== 'buffering') totals.watchMs += dt;

      // First real playback.
      if (!startedAt && moved && (s.hasVideo === false || now - lastFrameAt < 1000)) {
        startedAt = now;
        totals.startupMs = now - askedAt;
        emit({ type: 'started', ms: totals.startupMs, source: src() && src().label, at: now });
        note({ at: now, did: 'started', ms: totals.startupMs });
      }

      // Slow start: asked to play, nothing happened.
      if (!startedAt && want && now - askedAt > C.START_MS && now >= settleUntil) {
        askedAt = now; // give the next source its own full window
        return escalate('slow-start', now);
      }

      const settling = now < settleUntil;

      // Healthy playback.
      const framesFlowing = s.hasVideo === false || now - lastFrameAt < C.FREEZE_MS;
      if (moved && framesFlowing && driftRun === 0) {
        goodT = s.t;
        if (bufferingSince) { totals.stallMs += now - bufferingSince; bufferingSince = 0; stallStep = 0; }
        if (state !== 'playing' && !settling && (!pending || now - pending.at > C.SETTLE_MS)) {
          if (pending && now - pending.at >= C.HEALTHY_MS) {
            totals.recovered += 1;
            emit({ type: 'recovered', kind: pending.kind, step: pending.step, ms: now - pending.at, at: now });
            note({ at: now, did: 'recovered', kind: pending.kind, step: pending.step });
            pending = null;
          }
          if (!pending) setState('playing', now);
        }
        if (now - lastQualityAt > C.QUALITY_EVERY_MS && s.totalFrames > 0) {
          lastQualityAt = now;
          emit({ type: 'quality', dropPct: Math.round((s.dropped || 0) * 1000 / s.totalFrames) / 10, ahead: s.ahead, source: src() && src().label, at: now });
        }
      }
      if (settling) return;
      if (!startedAt) return; // before the first frame, only slow-start applies

      // Stall: the playhead is not moving.
      if (!moved && now - lastProgressAt > 600) {
        if (!bufferingSince) { bufferingSince = now; stallStep = 0; totals.stalls += 1; emit({ type: 'stall', t: s.t, ahead: s.ahead, at: now }); }
        if (state !== 'buffering' && state !== 'recovering') setState('buffering', now);
        const waited = now - bufferingSince;
        const due = C.STALL_GRACE_MS + stallStep * C.STALL_STEP_MS;
        if (waited > due) { stallStep += 1; return escalate('stall', now); }
        return;
      }

      // Freeze: sound clock moves, picture does not.
      if (moved && framesKnown && s.hasVideo !== false && !s.hidden && now - lastFrameAt > C.FREEZE_MS) {
        totals.freezes += 1;
        emit({ type: 'freeze', t: s.t, ms: now - lastFrameAt, at: now });
        lastFrameAt = now;
        return escalate('freeze', now);
      }
    }

    // Called for each presented video frame (requestVideoFrameCallback) with the frame's media time
    // and the playhead time read at that moment.
    function frame(mediaTime, t, now) {
      lastFrameAt = now; framesKnown = true;
      if (state === 'failed' || state === 'ended' || now < settleUntil) { driftRun = 0; return; }
      const lag = t - mediaTime;
      driftRun = Math.abs(lag) > C.DRIFT_S ? driftRun + 1 : 0;
      if (driftRun >= C.DRIFT_FRAMES) {
        totals.drifts += 1;
        emit({ type: 'drift', lag: Math.round(lag * 1000) / 1000, t, at: now });
        driftRun = 0;
        escalate('drift', now);
      }
    }

    // Media element events the DOM layer forwards: error (with code), playing, pause/play by the viewer,
    // seeked by the viewer.
    function event(name, now, info) {
      if (name === 'error') {
        if (state === 'failed') return;
        totals.errors += 1;
        const code = info && info.code;
        // 1 aborted, 2 network, 3 decode, 4 not supported. Network errors and "never loaded" get one retry.
        const net = code === 2 || (info && info.neverLoaded && code !== 3);
        emit({ type: 'error', code, net: !!net, source: src() && src().label, at: now });
        return escalate(net ? 'error-net' : 'error-fatal', now);
      }
      if (name === 'user-play') { want = true; if (!startedAt) askedAt = now; return; }
      if (name === 'user-pause') { want = false; return; }
      if (name === 'user-seek') { settleUntil = now + C.SETTLE_MS; driftRun = 0; bufferingSince = 0; lastProgressAt = now; lastFrameAt = now; if (info && typeof info.t === 'number') goodT = info.t; return; }
      if (name === 'retry') { // the viewer pressed Retry on the failure card: start over from the best source
        history = []; pending = null;
        si = -1; setState('recovering', now);
        return nextSource('viewer-retry', now);
      }
    }

    function summary() {
      const watch = totals.watchMs || 0;
      return Object.assign({}, totals, { rebufferRatio: watch ? Math.round(totals.stallMs * 1000 / (watch + totals.stallMs)) / 1000 : 0, source: src() && src().label, sourceIndex: si, sources: sources.length, state });
    }

    return { load, sample, frame, event, summary, get state() { return state; }, get sourceIndex() { return si; }, get source() { return src(); }, get log() { return log.slice(); }, config: C };
  }

  return { create, DEFAULTS };
});
