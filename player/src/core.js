/*
 * VOID player core: detects playback trouble and decides what to do about it.
 *
 * It never touches the page or a <video>. The DOM layer (player.js) feeds it samples and media events,
 * and carries out the actions it asks for. That split keeps every decision deterministic and testable
 * in plain Node (see ../test/core.test.js).
 *
 * Trouble it recognises:
 *   stall       the playhead stops moving while playing. Two kinds:
 *                 starved   nothing buffered ahead: the Archive server stopped sending (measured: its storage
 *                           servers intermittently hang for 20 s or more). Answer: a fresh connection to the
 *                           item's other server, quickly, cycling between servers before giving up on the copy.
 *                 buffered  data is there but the playhead is stuck: a browser-side hiccup. Answer: the ladder.
 *   starving    the buffered end stops growing while little is buffered ahead, though the picture still moves.
 *               The download has stalled and the picture will stop soon; hop now instead of after it stops.
 *   freeze      the clock (sound) keeps moving but no new picture frames arrive
 *   drift       picture frames arrive, but behind the sound by more than DRIFT_S
 *   error       the media element reports an error
 *   silent      the copy plays but no sound is decoded (an audio codec this browser lacks)
 *   slow-start  nothing plays within START_MS of asking
 *
 * What it does, in escalating steps, per source:
 *   nudge     jump to the current time (flushes the browser's decoders; re-aligns picture and sound)
 *   reload    reload the same source at the current time
 *   switch    move to the next source (same file on the backup server, then the next copy)
 *   fail      nothing left to try: tell the viewer, offer retry / download / next
 *
 * Every decision is reported through emit() so the host can log it (analytics, Sentry, the lab).
 *
 * When it fails, the failed event and the show-failure action carry a cause, the one place the page and the
 * logs learn why: "network" (the Archive stopped sending), "format" (this browser cannot decode the file) or
 * "playback" (anything else: frozen picture, drift, an aborted load). The page never guesses it from the
 * reason text. The table of reasons and causes is in ../DESIGN.md.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VoidCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULTS = {
    STALL_GRACE_MS: 6000,     // a normal buffering pause; only after this long do we act
    STALL_STEP_MS: 6000,      // how long each stall step gets before the next one
    STARVED_S: 1,             // less than this buffered ahead = the server stopped sending
    STARVE_MS: 3000,          // a starved stall this long moves to the item's other server
    STARVE_STEP_MS: 4000,     // each further starved stretch moves on again
    STARVE_CYCLES: 2,         // full passes over a copy's servers before trying the next copy
    FREEZE_MS: 1500,          // sound advancing with no new frames for this long = frozen picture
    DRIFT_S: 0.45,            // picture behind sound by more than this...
    DRIFT_FRAMES: 6,          // ...for this many frames in a row = drift
    START_MS: 15000,          // no playback this long after asking = slow start
    SETTLE_MS: 2500,          // after acting, let the browser settle before judging again
    HEALTHY_MS: 5000,         // this long of clean playback after an action = recovered
    REPEAT_WINDOW_MS: 120000, // trouble repeating on one source inside this window escalates
    QUALITY_EVERY_MS: 60000,  // periodic quality report while playing
    NET_RETRY_MS: 1500,       // wait before retrying a network error on the same source
    BUFFER_STALL_MS: 4000,    // the buffered end has not advanced this long while playing...
    BUFFER_LOW_S: 10,         // ...and less than this is buffered ahead = the download stalled: hop before the picture stops
    BUFFER_GROW_S: 0.05,      // the buffered end must advance by more than this to count as growing
    STARVE_RELOADS: 1,        // a lone last server (nothing to hop to) is reloaded this often before the copy is given up
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
    let starveSwitches = 0;   // server switches for starvation on the current copy
    let lastQualityAt = 0;
    const totals = { watchMs: 0, stallMs: 0, stalls: 0, freezes: 0, drifts: 0, errors: 0, actions: 0, recovered: 0, switches: 0, longestPauseMs: 0, startupMs: null };
    let lastSampleAt = 0;
    let lastErrCode = null;   // code of the last media error (1 aborted, 2 network, 3 decode, 4 not supported)
    const reloaded = new Map(); // source index -> reloads spent on a lone server that went quiet
    let pauseSince = 0;       // when the viewer last saw the picture stop; kept across hops, so the whole pause is counted
    let lastHopAt = 0;        // when the core last hopped or reloaded for starvation (the allowance refills 2 minutes after)
    let lastBufEnd = -1, bufGrowAt = 0; // where the buffered end was last seen to move to, and when
    let bufHist = [];         // [{at, end}] about once a second, to tell how fast the buffer grows
    const resetBuf = (now) => { lastBufEnd = -1; bufGrowAt = now; bufHist = []; };
    const log = [];           // recent decisions, for diagnostics
    let t0 = 0;               // when the current episode was loaded; decisions are logged in seconds from here
    const note = (o) => { o.sec = Math.round((o.at - t0) / 100) / 10; log.push(o); if (log.length > 80) log.shift(); };

    function src() { return sources[si] || null; }
    function setState(s, now) { if (state !== s) { const from = state; state = s; emit({ type: 'state', from, to: s, at: now }); } }

    // Why playback failed, as the viewer should be told and the logs should count it. The page does not guess
    // this from the reason text (it once read "starved" as a browser problem). The last trouble decides.
    //   network   the Archive stopped sending, or never started: starved, stall, slow-start, error-net
    //   format    this browser cannot decode the file: a decode or not-supported error, or no copy it can play
    //   playback  anything else: frozen picture, drift, an aborted load
    function causeOf(reason) {
      if (reason === 'starved' || reason === 'stall' || reason === 'slow-start' || reason === 'error-net') return 'network';
      if (reason === 'no-sources') return 'format';
      if (reason === 'error-fatal') return lastErrCode === 3 || lastErrCode === 4 ? 'format' : 'playback';
      return 'playback';
    }

    // The buffered end moves as the download goes. Called once per playing sample. Returns nothing; reads back
    // through bufGrowth(). A browser that deliberately stopped fetching (networkState idle) counts as growing:
    // it paused the download itself, the server did not hang.
    function trackBuffer(s, now) {
      if (typeof s.ahead !== 'number') return;
      const end = typeof s.bufEnd === 'number' ? s.bufEnd : s.t + s.ahead;
      if (lastBufEnd < 0 || end > lastBufEnd + C.BUFFER_GROW_S || end < lastBufEnd - C.BUFFER_GROW_S) { lastBufEnd = end; bufGrowAt = now; }
      if (s.networkState === 1) bufGrowAt = now;
      if (!bufHist.length || now - bufHist[bufHist.length - 1].at >= 1000) { bufHist.push({ at: now, end }); while (bufHist.length > 12) bufHist.shift(); }
    }
    // Seconds of video the buffer gained over roughly the last 10 s of play, and over how many ms: about as many
    // seconds as ms/1000 means the line keeps up; far fewer means a slow or hung one.
    function bufGrowth(now) {
      if (!bufHist.length || lastBufEnd < 0) return { grewS: 0, spanMs: 0 };
      const old = bufHist[0];
      return { grewS: Math.round(Math.max(0, lastBufEnd - old.end) * 10) / 10, spanMs: Math.round(now - old.at) };
    }

    function load(list, startAt, now, autoplay) {
      sources = (list || []).filter((s) => s && s.url);
      log.length = 0; t0 = now; // diagnostics describe the current episode only
      for (const k of Object.keys(totals)) totals[k] = k === 'startupMs' ? null : 0;
      totals.startupMs = null;
      history = []; pending = null; driftRun = 0; bufferingSince = 0; stallStep = 0; starveSwitches = 0;
      reloaded.clear(); lastErrCode = null; pauseSince = 0; lastHopAt = 0; resetBuf(now);
      goodT = Math.max(0, +startAt || 0);
      want = autoplay !== false;
      askedAt = now; startedAt = 0;
      lastT = goodT; lastProgressAt = now; lastFrames = -1; lastFrameAt = now; framesKnown = false; lastQualityAt = now;
      if (!sources.length) { setState('failed', now); emit({ type: 'failed', reason: 'no-sources', cause: causeOf('no-sources'), at: now }); act({ type: 'show-failure', reason: 'no-sources', cause: causeOf('no-sources') }); return; }
      si = 0;
      setState('loading', now);
      settleUntil = now + C.SETTLE_MS;
      act({ type: 'set-source', index: si, source: src(), at: goodT, play: want });
    }

    // Starved: hop to the copy's next server (cyclically: the first one may have recovered by now). After
    // STARVE_CYCLES full passes without luck, the copy itself is the problem: try the next copy.
    function hopServer(now) {
      const cur = src();
      const keyed = !!cur && cur.fileKey != null;
      const same = keyed ? sources.map((x, k) => k).filter((k) => sources[k].fileKey === cur.fileKey) : [si];
      if (keyed) starveSwitches += 1;
      if (same.length < 2) {
        // A lone server has nowhere to hop. If it is also the last source, a failure now would be final, so it
        // gets a reload first (SP-019): an Archive link may redirect to another server the second time. Capped
        // at STARVE_RELOADS per source; it never loops between sources.
        if (si === sources.length - 1 && (reloaded.get(si) || 0) < C.STARVE_RELOADS) return reloadLone(now);
        return nextSource('starved', now, keyed);
      }
      if (starveSwitches > STARVE_LIMIT(same.length)) return nextSource('starved', now, true);
      const at = same.indexOf(si);
      const j = same[(at + 1) % same.length];
      const from = cur;
      si = j; history = []; driftRun = 0; bufferingSince = 0; stallStep = 0; lastHopAt = now; resetBuf(now);
      totals.switches += 1; totals.actions += 1;
      pending = { kind: 'starved', step: 'switch', at: now };
      settleUntil = now + C.SETTLE_MS;
      setState('recovering', now);
      emit({ type: 'action', kind: 'starved', step: 'switch', source: from && from.label, t: goodT, n: starveSwitches, at: now });
      emit({ type: 'switch', reason: 'starved', from: from && from.label, to: src().label, t: goodT, at: now });
      note({ at: now, did: 'switch', kind: 'starved', to: src().label, n: starveSwitches });
      act({ type: 'set-source', index: si, source: src(), at: goodT, play: want });
    }
    const STARVE_LIMIT = (n) => n * C.STARVE_CYCLES - 1;

    // Would a hop now be a move, and not the end of the road? The buffer watch asks before it acts: it may hop to
    // another server or the next copy, but it must never end playback (no failure card while video is still
    // buffered) and never throw the buffer away for a reload of a lone server. Only the stopped-picture path may
    // do those, because only then has playback really stopped. Mirrors the choices in hopServer, changing nothing.
    function bufferHopOk() {
      const cur = src();
      if (!cur) return false;
      const keyed = cur.fileKey != null;
      const servers = keyed ? sources.filter((x) => x.fileKey === cur.fileKey).length : 1;
      if (servers >= 2 && starveSwitches + 1 <= STARVE_LIMIT(servers)) return true; // another server of this copy
      let j = si + 1;
      if (keyed) while (j < sources.length && sources[j].fileKey === cur.fileKey) j++;
      return j < sources.length; // the next copy
    }

    // The one reload of a lone last server that stopped sending. Same source, same place; no card is shown, so
    // nothing the failure card offers (a download link included) appears because of it.
    function reloadLone(now) {
      const n = (reloaded.get(si) || 0) + 1;
      reloaded.set(si, n);
      history = []; driftRun = 0; bufferingSince = 0; stallStep = 0; lastHopAt = now; resetBuf(now);
      totals.actions += 1;
      pending = { kind: 'starved', step: 'retry', at: now };
      settleUntil = now + C.SETTLE_MS;
      setState('recovering', now);
      emit({ type: 'action', kind: 'starved', step: 'retry', source: src() && src().label, t: goodT, n, at: now });
      note({ at: now, did: 'retry', kind: 'starved', n });
      act({ type: 'reload', at: goodT, play: want, delayMs: 0 });
    }

    // newFile: skip the other servers of the same copy (a decode error or a silent copy is the file's fault,
    // so the same file from another server cannot help).
    function nextSource(reason, now, newFile) {
      const from = src();
      let j = si + 1;
      if (newFile && from && from.fileKey != null) while (j < sources.length && sources[j].fileKey === from.fileKey) j++;
      if (reason === 'silent' && j >= sources.length) {
        pending = null;
        emit({ type: 'silent-final', source: from && from.label, at: now });
        note({ at: now, did: 'notice', reason });
        act({ type: 'show-notice', reason: 'silent' });
        return;
      }
      if (j >= sources.length) {
        setState('failed', now);
        pending = null;
        if (!sources.length) reason = 'no-sources'; // Try again with nothing to try: still the same failure
        const cause = causeOf(reason);
        emit({ type: 'failed', reason, cause, code: lastErrCode, source: from && from.label, at: now });
        note({ at: now, did: 'fail', reason, cause });
        act({ type: 'show-failure', reason, cause, code: lastErrCode });
        return;
      }
      if (newFile || (sources[j] && from && sources[j].fileKey !== from.fileKey)) starveSwitches = 0;
      si = j; history = []; driftRun = 0; bufferingSince = 0; stallStep = 0; lastHopAt = now; resetBuf(now);
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
      if (kind === 'slow-start' || kind === 'silent') step = 'switch';
      else if (kind === 'error-fatal') step = 'switch';
      else if (kind === 'error-net') step = n === 1 ? 'reload' : 'switch';
      else step = n === 1 ? 'nudge' : n === 2 ? 'reload' : 'switch';
      emit({ type: 'action', kind, step, source: src() && src().label, t: goodT, n, at: now });
      note({ at: now, did: step, kind, n });
      if (step === 'switch') return nextSource(kind, now, kind === 'error-fatal' || kind === 'silent');
      resetBuf(now); // a nudge or reload gives the download a fresh start: judge the buffer from here
      pending = { kind, step, at: now };
      settleUntil = now + C.SETTLE_MS + (step === 'reload' ? C.SETTLE_MS : 0);
      setState('recovering', now);
      driftRun = 0;
      if (step === 'nudge') act({ type: 'seek', at: goodT });
      else act({ type: 'reload', at: goodT, play: want, delayMs: kind === 'error-net' ? C.NET_RETRY_MS : 0 });
    }

    // Called every ~250 ms by the DOM layer.
    // s = {now, t, paused, seeking, ended, ready, hidden, hasVideo, frames, dropped, totalFrames, ahead,
    //      bufEnd, duration, networkState}. The last three are for the buffer watch: where the buffered range
    //      ends (t + ahead when absent), how long the file is (the watch stays off without it, so a flat buffer
    //      at the end of the file is never read as a hang) and the media element's networkState (1 = the browser
    //      itself stopped fetching, which is not a hang).
    function sample(s) {
      const now = s.now;
      const dt = lastSampleAt ? Math.min(1000, now - lastSampleAt) : 0;
      lastSampleAt = now;
      if (state === 'failed' || state === 'idle') return;
      if (s.ended) { if (state !== 'ended') { setState('ended', now); emit({ type: 'ended', at: now }); } return; }
      if (s.paused) {
        // Waiting for an autoplay to start is "loading"; an episode nobody asked to play yet is simply paused
        // (so the page shows a play button, not an endless spinner).
        if (state !== 'recovering' && !(state === 'loading' && want)) setState('paused', now);
        lastProgressAt = now; lastFrameAt = now; bufferingSince = 0; pauseSince = 0; driftRun = 0; resetBuf(now);
        return;
      }
      if (s.seeking) { lastProgressAt = now; lastFrameAt = now; resetBuf(now); return; }
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
        if (bufferingSince) { bufferingSince = 0; stallStep = 0; }
        if (pauseSince) { // the whole pause the viewer saw, hops and reconnects included
          const paused = now - pauseSince;
          totals.stallMs += paused; if (paused > totals.longestPauseMs) totals.longestPauseMs = paused;
          pauseSince = 0;
        }
        // The hop allowance is per hang, not per episode: two minutes of playing after the last hop or reload
        // gives it back, so hangs that healed long ago do not decide how a later one ends.
        if ((starveSwitches || reloaded.size) && lastHopAt && state === 'playing' && now - lastHopAt >= C.REPEAT_WINDOW_MS) { starveSwitches = 0; reloaded.clear(); }
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
      trackBuffer(s, now);
      if (settling) return;
      if (!startedAt) return; // before the first frame, only slow-start applies

      // Buffer watch: the download stopped growing while little is buffered. The picture still moves, but it will
      // stop when the buffer runs out, and every other trigger below waits for that. Hop now. Not for a playhead
      // stuck on buffered data (a browser hiccup: the ladder's job), not while the buffer still grows (a slow
      // line), not when the browser paused the download itself, and not near the end of the file. The 4 s clock
      // runs from the end of the settle window, so a fresh connection gets the same time to start as it does
      // under the stopped-picture path (about 6 s). The watch may only move (another server, the next copy): it
      // never fails and never reloads a lone server, so it cannot end playback; the stopped-picture path does that.
      if (typeof s.ahead === 'number' && typeof s.duration === 'number' && s.duration > 0 && isFinite(s.duration)
          && (moved || now - lastProgressAt <= 600 || s.ahead < C.STARVED_S)
          && s.ahead < C.BUFFER_LOW_S && lastBufEnd < s.duration - 0.5 && now - Math.max(bufGrowAt, settleUntil) >= C.BUFFER_STALL_MS
          && bufferHopOk()) {
        const flat = now - bufGrowAt, g = bufGrowth(now);
        if (!bufferingSince) { totals.stalls += 1; emit({ type: 'stall', trigger: 'buffer', t: s.t, ahead: s.ahead, flatMs: Math.round(flat), grewS: g.grewS, spanMs: g.spanMs, at: now }); note({ at: now, did: 'stall', trigger: 'buffer', t: Math.round(s.t), ahead: Math.round(s.ahead * 10) / 10, flatMs: Math.round(flat), ready: s.ready }); }
        if (!pauseSince) pauseSince = now;
        stallStep += 1; note({ at: now, did: 'starved', t: Math.round(s.t), waitedMs: Math.round(flat) });
        return hopServer(now);
      }

      // Stall: the playhead is not moving.
      if (!moved && now - lastProgressAt > 600) {
        if (!bufferingSince) {
          const g = bufGrowth(now);
          bufferingSince = now; stallStep = 0; totals.stalls += 1; if (!pauseSince) pauseSince = now;
          emit({ type: 'stall', trigger: 'picture', t: s.t, ahead: s.ahead, flatMs: lastBufEnd < 0 ? 0 : Math.round(now - bufGrowAt), grewS: g.grewS, spanMs: g.spanMs, at: now });
          note({ at: now, did: 'stall', t: Math.round(s.t), ahead: Math.round((s.ahead || 0) * 10) / 10, ready: s.ready });
        }
        if (state !== 'buffering' && state !== 'recovering') setState('buffering', now);
        const waited = now - bufferingSince;
        const starved = (s.ahead || 0) < C.STARVED_S;
        if (starved) {
          const due = C.STARVE_MS + stallStep * C.STARVE_STEP_MS;
          if (waited > due) { stallStep += 1; note({ at: now, did: 'starved', t: Math.round(s.t), waitedMs: Math.round(waited) }); return hopServer(now); }
          return;
        }
        const due = C.STALL_GRACE_MS + stallStep * C.STALL_STEP_MS;
        if (waited > due) { stallStep += 1; return escalate('stall', now); }
        return;
      }

      // Freeze: sound clock moves, picture does not.
      if (moved && framesKnown && s.hasVideo !== false && !s.hidden && now - lastFrameAt > C.FREEZE_MS) {
        totals.freezes += 1;
        emit({ type: 'freeze', t: s.t, ms: now - lastFrameAt, ahead: s.ahead, at: now });
        note({ at: now, did: 'freeze', t: Math.round(s.t), ms: Math.round(now - lastFrameAt), ahead: Math.round((s.ahead || 0) * 10) / 10, dropped: s.dropped, frames: s.totalFrames });
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
        note({ at: now, did: 'drift', t: Math.round(t), lag: Math.round(lag * 1000) / 1000 });
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
        lastErrCode = typeof code === 'number' ? code : null;
        // 1 aborted, 2 network, 3 decode, 4 not supported. Network errors and "never loaded" get one retry.
        const net = code === 2 || (info && info.neverLoaded && code !== 3);
        emit({ type: 'error', code, net: !!net, source: src() && src().label, at: now });
        return escalate(net ? 'error-net' : 'error-fatal', now);
      }
      if (name === 'silent') { if (state === 'failed' || state === 'ended') return; emit({ type: 'silent', source: src() && src().label, at: now }); return escalate('silent', now); }
      if (name === 'user-play') { want = true; if (!startedAt) askedAt = now; return; }
      if (name === 'user-pause') { want = false; return; }
      if (name === 'user-seek') { settleUntil = now + C.SETTLE_MS; driftRun = 0; bufferingSince = 0; pauseSince = 0; resetBuf(now); lastProgressAt = now; lastFrameAt = now; if (info && typeof info.t === 'number') goodT = info.t; return; }
      if (name === 'retry') { // the viewer pressed Retry on the failure card: start over from the best source
        history = []; pending = null; starveSwitches = 0; reloaded.clear(); lastErrCode = null; pauseSince = 0; lastHopAt = 0; resetBuf(now); // a fresh start gets the full allowance again
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
