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
 * Measured and reported only, never acted on (no seek, no speed change, no hop, no switch), and only while the
 * picture plays steadily (not paused, seeking, waiting, hidden or settling, not in the first STEADY_MS, at speed 1):
 *   hitch       a shown frame arrives HITCH_MS or more after the one before, while the sound ran (under THROTTLE_MS, 1 s;
 *               a gap of 1 to 1.5 s is a throttled stretch, not a hitch and not yet a freeze)
 *   avlag       picture and sound apart by more than AVLAG_S for AVLAG_HOLD_MS, allowing for the display delay
 *   lowfps      the pictures a second the page shows stay under LOWFPS_RATIO of the file's rate (an estimate: see below)
 *   decodelag   the browser drops more than DECODELAG_SHARE of its frames: it is falling behind
 * Beside them it logs the stretches when the browser stopped calling for frames while the sound ran and the page was
 * on screen (throttled: Edge efficiency mode, power throttling), and whether the page's drawing stopped too. Time
 * hidden or throttled is left out of all the measures above.
 * The file's rate (sourceFps) is only an ESTIMATE from the media-time steps of the frames shown. The page cannot tell a file
 * that holds few frames from a browser that skips frames without counting them, so it never says the file is at fault:
 * only the file's own header (an ffprobe look) gives the true rate. A low estimate with a high dropped share, or with a
 * decoded rate under the estimate, means the browser fell behind.
 * What these cannot see, an offset built into the file, is in ../DESIGN.md ("Picture and sound out of step").
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
    // Measured and reported only (see the header): none of these makes the core do anything.
    HITCH_MS: 250,            // a shown-frame interval over this (and under THROTTLE_MS: 1 to 1.5 s is a throttled stretch) while the sound ran = a hitch
    HITCH_SRC_FRAMES: 3,      // ...and over this many frames of the file's own pace, so a slow file is not all hitches
    HITCH_EMIT_MS: 1000,      // at most one hitch event per this long...
    HITCH_EMIT_MAX: 20,       // ...and this many per episode (every hitch is still counted)
    AVLAG_S: 0.25,            // picture and sound apart by more than this (allowing for the display delay)...
    AVLAG_HOLD_MS: 1000,      // ...for this long without a break = A/V lag
    AVLAG_EVERY_MS: 10000,    // a lag that lasts is counted again at most this often
    GAP_SAMPLE_MS: 500,       // one gap reading kept per this long (the last 30 go with the viewer's Out of sync? stamp)
    STEADY_MS: 2000,          // the sync, hitch and rate measures start this long after play, seek, hop or resume
    RATE_WINDOW_MS: 10000,    // pictures-a-second figures are over this rolling window...
    RATE_MIN_MS: 3000,        // ...and are shown once the window holds this much
    RATE_MIN_FRAMES: 10,      // the dropped share needs at least this many frames in the window
    SRC_MIN_STEPS: 24,        // steps between shown frames needed before the file's frame rate is reported
    LOWFPS_RATIO: 0.6,        // shown frames a second under this share of the file's rate...
    LOWFPS_MS: 10000,         // ...for this long of steady playing = lowfps
    DECODELAG_SHARE: 0.1,     // dropped frames over this share of the window's frames...
    DECODELAG_MS: 10000,      // ...for this long of steady playing = decodelag
    THROTTLE_MS: 1000,        // no frame callback this long while the sound runs and the page is on screen = throttled
    THROTTLE_EMIT_MAX: 50,    // throttle events per episode (every stretch is still counted)
    BEHIND_RATIO: 0.9,        // a steady minute with decoded frames a second under this share of the file's rate = a minute behind
  };
  const MINUTE_MS = 60000;

  function create(opts) {
    const C = Object.assign({}, DEFAULTS, (opts && opts.config) || {});
    const emit = (opts && opts.emit) || function () {};
    const actOut = (opts && opts.act) || function () {};
    // Every action (a new source, a seek, a reload, a card) breaks the run of shown frames the measures read; a new
    // copy of the file also starts the file's frame rate afresh (another server of the same copy does not).
    const act = (a) => {
      chainOff(); unsteady();
      if (a && a.type === 'set-source') { const k = a.source && a.source.fileKey; if (k == null || k !== rateFile) { resetRate(); rateFile = k; } }
      actOut(a);
    };

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
    const totals = { watchMs: 0, stallMs: 0, stalls: 0, freezes: 0, drifts: 0, errors: 0, actions: 0, recovered: 0, switches: 0, longestPauseMs: 0, startupMs: null,
      hitches: 0, longestHitchMs: 0, avlags: 0, maxAvGapMs: 0, lowfps: 0, decodelags: 0, outOfSyncPresses: 0, minutesBehind: 0, minutesMeasured: 0,
      throttles: 0, throttledMs: 0, throttlesPageWide: 0 };
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

    // ---- Picture rate and sync: measured and reported only. Nothing here seeks, changes the speed, hops or
    // switches. It uses counters and fixed rings made once, so the per-frame path allocates nothing. ----
    const RING = 64, STEP_RING = 240, GAPS = 30, HITS = 8, NEVER = -1e12; // NEVER: the time of something that has not happened yet
    const wT = new Float64Array(RING), wP = new Float64Array(RING), wD = new Float64Array(RING), wX = new Float64Array(RING); // the rolling window: time, frames shown, frames made, frames dropped
    let wHead = 0, wN = 0;
    const stepR = new Float32Array(STEP_RING), stepS = new Float32Array(STEP_RING); // media-time steps between shown frames, and a sorted copy
    let stepW = 0, stepN = 0, prevMt = -1, lastEstAt = NEVER;
    const gapR = new Float32Array(GAPS); let gapW = 0, gapN = 0, lastGapAt = NEVER;      // sound minus picture (s), one reading per GAP_SAMPLE_MS
    const hitR = new Float64Array(HITS * 3); let hitW = 0, hitN = 0;                 // the last hitches: media time, ms, when
    let rvfcSeen = false, rvfcKnown = false;  // does this browser give per-frame timing at all (requestVideoFrameCallback)
    let presented = 0, avFrames = 0;          // frames shown since load, and how many of them were measured
    let steadySince = 0, steadyUntil = 0;     // playing steadily since / the frame feed may measure until
    let avRun = 0, lastAvlagAt = NEVER, prevFrameAt = 0, prevT = 0, lastHitchEmitAt = NEVER, hitchEmitted = 0;
    let srcFps = null, rateFile;              // the file's own frame rate, and the copy it was measured on
    let clockNow = 0, lastCbAt = 0, lastCbT = -1, lastAwayAt = 0, lastRafOffAt = 0, thrNow = false; // frame callbacks: when the last came, where the playhead was, when the page was last off screen / not drawing, throttled right now
    const THR = 10, thrR = new Float64Array(THR * 3); let thrW = 0, thrN = 0, thrEmitted = 0;         // the last throttled stretches: ended at, ms, drawing stopped too
    let curPres = null, curDec = null, curDrop = null;     // the rolling window now (null: cannot be measured now)
    let heldPres = null, heldDec = null, heldDrop = null;  // the last window that could be measured
    let lowSince = 0, decSince = 0, lowfpsFired = false, decodeFired = false;
    let qHave = false, qNow = 0, qP = 0, qT = -1, qX = 0;  // the previous steady sample, for differences
    let mMs = 0, mPres = 0, mDecMs = 0, mDec = 0, mDrop = 0; // sums over the steady playing of the episode
    let minMs = 0, minFramesMs = 0, minFrames = 0;           // the steady minute being counted
    const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10), r3 = (v) => (v == null ? null : Math.round(v * 1000) / 1000);
    // The picture stopped being steady (paused, seeking, waiting, hidden, settling, another speed...): start the windows again.
    // A break in the run of shown frames (a seek, a pause, a new source...): the next frame is not compared with the last.
    // A stretch of throttling that is still going on when the run breaks (the freeze check nudged, the viewer paused or
    // sought, a new source) is logged as it stands.
    function chainOff() {
      if (thrNow && lastCbT >= 0 && lastCbAt > 0 && clockNow - lastCbAt > C.THROTTLE_MS) logThrottle(clockNow - lastCbAt, clockNow, lastT, undefined);
      prevMt = -1; lastCbAt = clockNow; lastCbT = -1;
    }
    function unsteady() { thrNow = false; steadySince = 0; steadyUntil = 0; wHead = 0; wN = 0; curPres = curDec = curDrop = null; lowSince = 0; decSince = 0; qHave = false; avRun = 0; prevFrameAt = 0; }
    function resetRate() { stepW = 0; stepN = 0; srcFps = null; lastEstAt = NEVER; }
    function resetQuality() {
      unsteady(); resetRate(); chainOff(); rateFile = undefined; thrW = 0; thrN = 0; thrEmitted = 0; lastAwayAt = 0; lastRafOffAt = 0;
      presented = 0; avFrames = 0; gapW = 0; gapN = 0; lastGapAt = NEVER; hitW = 0; hitN = 0; lastAvlagAt = NEVER; lastHitchEmitAt = NEVER; hitchEmitted = 0;
      heldPres = heldDec = heldDrop = null; lowfpsFired = false; decodeFired = false;
      mMs = 0; mPres = 0; mDecMs = 0; mDec = 0; mDrop = 0; minMs = 0; minFramesMs = 0; minFrames = 0;
    }
    function noteStep(m) {
      if (prevMt >= 0) { const d = m - prevMt; if (d > 0.002 && d < 1) { stepR[stepW] = d; stepW = (stepW + 1) % STEP_RING; if (stepN < STEP_RING) stepN += 1; } }
      prevMt = m;
    }
    // An ESTIMATE of the file's frame rate, from the media-time step between shown frames. A browser that falls behind shows only
    // some of the frames, so many steps are 2, 3, 4 frames long; the file's own step is the smallest one that keeps
    // turning up (at least 3 steps, and 2 percent of them, within 12 percent of each other), and its median gives the rate.
    function estimateSource() {
      const n = stepN;
      if (n < C.SRC_MIN_STEPS) return;
      for (let i = 0; i < STEP_RING; i++) stepS[i] = i < n ? stepR[i] : Infinity;
      stepS.sort();
      const need = Math.max(3, Math.ceil(n * 0.02));
      let hi = 0;
      for (let i = 0; i + need <= n; i++) {
        if (hi < i) hi = i;
        const lim = stepS[i] * 1.12;
        while (hi < n && stepS[hi] <= lim) hi += 1;
        if (hi - i >= need) { srcFps = Math.round(100 / stepS[i + ((hi - i) >> 1)]) / 100; return; }
      }
    }
    // Called from sample() once per sample while playing. Decides whether the picture plays steadily; if so it feeds the
    // rolling window, the sums and the three rate events.
    function trackQuality(s, now, moved) {
      if (typeof s.rvfc === 'boolean') rvfcKnown = s.rvfc;
      if (now - lastEstAt >= 1000) { lastEstAt = now; estimateSource(); }
      thrNow = (rvfcSeen || rvfcKnown) && lastCbAt > 0 && lastCbT >= 0 && now - lastCbAt > C.THROTTLE_MS && (moved || now - lastProgressAt <= 600) && lastAwayAt < lastCbAt;
      const ok = state === 'playing' && now >= settleUntil && !thrNow && !s.hidden && s.hasVideo !== false
        && (s.ready === undefined || s.ready >= 3) && (s.rate === undefined || s.rate === 1) && (moved || now - lastProgressAt <= 600);
      if (!ok) { const thr = thrNow; unsteady(); thrNow = thr; return; } // (still throttled right now, if it is)
      if (!steadySince) steadySince = now;
      if (now - steadySince < C.STEADY_MS) { steadyUntil = 0; return; }
      steadyUntil = now + C.FREEZE_MS + 500; // longer than the longest hitch, so a busy page that delays this sample does not hide one
      const perFrame = rvfcSeen || rvfcKnown;
      const tot = typeof s.totalFrames === 'number' ? s.totalFrames : -1, drp = typeof s.dropped === 'number' ? s.dropped : 0;
      if (wN && tot >= 0 && tot < wD[(wHead + wN - 1) % RING]) { wHead = 0; wN = 0; qHave = false; } // the element started its counts again (a new source)
      while (wN > 2 && wT[wHead] < now - C.RATE_WINDOW_MS) { wHead = (wHead + 1) % RING; wN -= 1; }
      if (wN === RING) { wHead = (wHead + 1) % RING; wN -= 1; }
      const wi = (wHead + wN) % RING;
      wT[wi] = now; wP[wi] = presented; wD[wi] = tot; wX[wi] = drp; wN += 1;
      const a = wHead, z = (wHead + wN - 1) % RING, span = wT[z] - wT[a];
      curPres = curDec = curDrop = null;
      if (span >= C.RATE_MIN_MS) {
        if (perFrame) curPres = (wP[z] - wP[a]) * 1000 / span;
        if (wD[a] >= 0 && wD[z] >= wD[a]) {
          const dT = wD[z] - wD[a];
          curDec = dT * 1000 / span;
          if (dT >= C.RATE_MIN_FRAMES) curDrop = (wX[z] - wX[a]) / dT;
        }
        if (curPres !== null) heldPres = curPres;
        if (curDec !== null) heldDec = curDec;
        if (curDrop !== null) heldDrop = curDrop;
      }
      // sums for the episode, and the steady minute being counted
      if (qHave) {
        const dms = Math.min(1000, now - qNow);
        mMs += dms; minMs += dms;
        if (perFrame) mPres += presented - qP;
        if (tot >= 0 && qT >= 0) { mDecMs += dms; mDec += tot - qT; mDrop += drp - qX; minFramesMs += dms; minFrames += tot - qT; }
        if (minMs >= MINUTE_MS) {
          if (srcFps && minFramesMs >= minMs * 0.8) { totals.minutesMeasured += 1; if (minFrames * 1000 / minFramesMs < C.BEHIND_RATIO * srcFps) totals.minutesBehind += 1; }
          minMs = 0; minFramesMs = 0; minFrames = 0;
        }
      }
      qHave = true; qNow = now; qP = presented; qT = tot; qX = drp;

      // The page shows far fewer pictures a second than the file seems to hold (the estimate), for a while. A file that
      // really holds few frames, or a browser that skips frames without counting them, reads as a low estimate and does
      // not fire this: the page cannot tell those apart, and does not guess.
      if (curPres !== null && srcFps && curPres < C.LOWFPS_RATIO * srcFps) {
        if (!lowSince) lowSince = now;
        if (!lowfpsFired && now - lowSince >= C.LOWFPS_MS) {
          lowfpsFired = true; totals.lowfps += 1;
          emit({ type: 'lowfps', presentedFps: r1(curPres), sourceFps: srcFps, at: now });
          note({ at: now, did: 'lowfps', fps: r1(curPres), src: srcFps });
        }
      } else lowSince = 0;
      // The browser drops a large share of its frames, for a while: it is falling behind.
      if (curDrop !== null && curDrop > C.DECODELAG_SHARE) {
        if (!decSince) decSince = now;
        if (!decodeFired && now - decSince >= C.DECODELAG_MS) {
          decodeFired = true; totals.decodelags += 1;
          emit({ type: 'decodelag', decodedFps: r1(curDec), droppedShare: r3(curDrop), presentedFps: r1(curPres), sourceFps: srcFps, at: now });
          note({ at: now, did: 'decodelag', dropped: r3(curDrop), fps: r1(curDec) });
        }
      } else decSince = 0;
    }

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
      clockNow = now; log.length = 0; t0 = now; // diagnostics describe the current episode only
      for (const k of Object.keys(totals)) totals[k] = k === 'startupMs' ? null : 0;
      totals.startupMs = null;
      resetQuality();
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

    // The host lets go of the episode (Live TV's breaks): nothing plays and nothing is watched until the next load().
    function stop(now) { sources = []; pending = null; want = false; chainOff(); unsteady(); setState('idle', now); }

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
      const now = s.now; clockNow = now;
      const dt = lastSampleAt ? Math.min(1000, now - lastSampleAt) : 0;
      lastSampleAt = now;
      if (state === 'failed' || state === 'idle') { unsteady(); return; }
      if (s.ended) { chainOff(); unsteady(); if (state !== 'ended') { setState('ended', now); emit({ type: 'ended', at: now }); } return; }
      if (s.paused) {
        chainOff(); unsteady();
        // Waiting for an autoplay to start is "loading"; an episode nobody asked to play yet is simply paused
        // (so the page shows a play button, not an endless spinner).
        if (state !== 'recovering' && !(state === 'loading' && want)) setState('paused', now);
        lastProgressAt = now; lastFrameAt = now; bufferingSince = 0; pauseSince = 0; driftRun = 0; resetBuf(now);
        return;
      }
      if (s.seeking) { chainOff(); unsteady(); lastProgressAt = now; lastFrameAt = now; resetBuf(now); return; }
      if (s.docHidden === true || s.offscreen === true || s.pip === true) lastAwayAt = now; // the page is off screen: no frames is not throttling
      if (s.raf === false) lastRafOffAt = now;                                              // the page's own drawing (requestAnimationFrame) is stopped
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
      trackQuality(s, now, moved);
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

    // A frame arrives after the browser stopped calling for frames for over THROTTLE_MS. If the sound ran meanwhile and
    // the page stayed on screen, that was throttling: logged, with whether the page's own drawing stopped too (a
    // page-wide throttle: efficiency mode, power throttling) or only the video's frames did. The windows start again, so
    // none of it reaches the hitch, lag or dropped-frame figures.
    function noteThrottle(t, now, rafAt) {
      const gap = now - lastCbAt;
      if (!(t - lastCbT > gap / 2000) || lastAwayAt >= lastCbAt) return;
      logThrottle(gap, now, t, rafAt);
    }
    function logThrottle(gap, now, t, rafAt) {
      if (lastAwayAt >= lastCbAt) return;
      const wide = lastRafOffAt >= lastCbAt || (typeof rafAt === 'number' && rafAt > 0 && now - rafAt > C.THROTTLE_MS / 2);
      totals.throttles += 1; totals.throttledMs += Math.round(gap); if (wide) totals.throttlesPageWide += 1;
      const k = thrW * 3; thrR[k] = now; thrR[k + 1] = gap; thrR[k + 2] = wide ? 1 : 0; thrW = (thrW + 1) % THR; if (thrN < THR) thrN += 1;
      unsteady();
      if (thrEmitted < C.THROTTLE_EMIT_MAX) { thrEmitted += 1; emit({ type: 'throttle', ms: Math.round(gap), raf: wide ? 'paused' : 'alive', t, at: now }); }
    }

    // Called for each presented video frame (requestVideoFrameCallback) with the frame's media time, the playhead
    // time read at that moment, the clock (performance.now), when the browser gives it the frame's
    // expectedDisplayTime, and the time of the page's last requestAnimationFrame beat. It allocates nothing: it moves counters and writes into the rings made in create().
    function frame(mediaTime, t, now, expected, rafAt) {
      lastFrameAt = now; framesKnown = true; rvfcSeen = true; presented += 1;
      if (lastCbT >= 0 && now - lastCbAt > C.THROTTLE_MS) noteThrottle(t, now, rafAt);
      lastCbAt = now; lastCbT = t;
      noteStep(mediaTime);
      if (state === 'failed' || state === 'ended' || now < settleUntil) { driftRun = 0; avRun = 0; prevFrameAt = 0; return; }
      const lag = t - mediaTime;
      driftRun = Math.abs(lag) > C.DRIFT_S ? driftRun + 1 : 0;
      if (driftRun >= C.DRIFT_FRAMES) {
        totals.drifts += 1;
        emit({ type: 'drift', lag: Math.round(lag * 1000) / 1000, t, at: now });
        note({ at: now, did: 'drift', t: Math.round(t), lag: Math.round(lag * 1000) / 1000 });
        driftRun = 0;
        escalate('drift', now);
        return;
      }
      // From here on: report only, and only while the picture plays steadily.
      if (state !== 'playing' || now >= steadyUntil) { avRun = 0; prevFrameAt = 0; return; }
      avFrames += 1;
      // Sound minus picture, as it will be when this frame is on the screen: the playhead is read now, the frame is
      // shown at expectedDisplayTime, so the normal one-frame offset (more on a slow machine) is not lag.
      let g = lag;
      if (typeof expected === 'number') { const ahead = expected - now; if (ahead >= -100 && ahead <= 500) g += ahead / 1000; }
      const ag = g < 0 ? -g : g;
      if (ag * 1000 > totals.maxAvGapMs) totals.maxAvGapMs = Math.round(ag * 1000);
      if (now - lastGapAt >= C.GAP_SAMPLE_MS) { lastGapAt = now; gapR[gapW] = g; gapW = (gapW + 1) % GAPS; if (gapN < GAPS) gapN += 1; }
      if (ag > C.AVLAG_S) {
        if (!avRun) avRun = now;
        else if (now - avRun >= C.AVLAG_HOLD_MS && now - lastAvlagAt >= C.AVLAG_EVERY_MS) {
          lastAvlagAt = now; totals.avlags += 1;
          emit({ type: 'avlag', gap: Math.round(g * 1000) / 1000, t, at: now });
          note({ at: now, did: 'avlag', t: Math.round(t), lag: Math.round(g * 1000) / 1000 });
        }
      } else avRun = 0;
      // A shown frame that came late while the sound ran on: the picture stood still for a moment and caught up.
      if (prevFrameAt) {
        const ms = now - prevFrameAt;
        if (srcFps && ms > C.HITCH_MS && ms < C.FREEZE_MS && t - prevT > ms / 2000 && ms > C.HITCH_SRC_FRAMES * 1000 / srcFps) {
          totals.hitches += 1;
          if (ms > totals.longestHitchMs) totals.longestHitchMs = Math.round(ms);
          const k = hitW * 3; hitR[k] = t; hitR[k + 1] = ms; hitR[k + 2] = now; hitW = (hitW + 1) % HITS; if (hitN < HITS) hitN += 1;
          if (hitchEmitted < C.HITCH_EMIT_MAX && now - lastHitchEmitAt >= C.HITCH_EMIT_MS) { hitchEmitted += 1; lastHitchEmitAt = now; emit({ type: 'hitch', ms: Math.round(ms), t, at: now }); }
        }
      }
      prevFrameAt = now; prevT = t;
    }

    // Media element events the DOM layer forwards: error (with code), playing, pause/play by the viewer,
    // seeked by the viewer.
    function event(name, now, info) {
      clockNow = now;
      if (name === 'away') { lastAwayAt = now; return; } // the page went off screen, hidden, into picture-in-picture or back
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
      if (name === 'user-avsync') { totals.outOfSyncPresses += 1; note({ at: now, did: 'user-avsync', t: Math.round(goodT) }); return; }
      if (name === 'user-seek') { chainOff(); unsteady(); settleUntil = now + C.SETTLE_MS; driftRun = 0; bufferingSince = 0; pauseSince = 0; resetBuf(now); lastProgressAt = now; lastFrameAt = now; if (info && typeof info.t === 'number') goodT = info.t; return; }
      if (name === 'retry') { // the viewer pressed Retry on the failure card: start over from the best source
        history = []; pending = null; starveSwitches = 0; reloaded.clear(); lastErrCode = null; pauseSince = 0; lastHopAt = 0; resetBuf(now); // a fresh start gets the full allowance again
        si = -1; setState('recovering', now);
        return nextSource('viewer-retry', now);
      }
    }

    // The page found out the servers of the copy the core has just moved to (it looks them up on the first switch to
    // a copy, not when the episode opens). The new entries go in front of the copy's Archive link, which keeps its
    // place after them, and the core moves onto the first of them: the same order as if they had been known from
    // the start (primary, backup, then the link). Only the current source is expanded, and only with entries of its
    // own copy; nothing else changes (no event, no settle time, no counters), so it cannot cause a loop. Returns the
    // source now in use.
    function expand(entries) {
      const cur = src();
      const add = (entries || []).filter((e) => e && e.url && cur && e.fileKey === cur.fileKey);
      if (!cur || !add.length) return cur;
      const moved = new Map();
      reloaded.forEach((n, k) => moved.set(k >= si ? k + add.length : k, n)); // indexes after the insertion point shift
      reloaded.clear(); moved.forEach((n, k) => reloaded.set(k, n));
      sources.splice(si, 0, ...add);
      note({ at: lastSampleAt || t0, did: 'servers', to: add.map((e) => e.label).join(',') });
      return src();
    }

    // The pictures-a-second figures and the sync readings, for diagnostics and the viewer's Out of sync? stamp.
    // file = the file's own rate (from the media-time steps), decoded = frames the browser made per second, shown =
    // frames the page presented per second, droppedShare = the share of the made frames the browser dropped. All but
    // the file's rate are over the last 10 s of steady playing; a figure holds its last value when playing is not steady.
    function timing() {
      const pf = rvfcSeen || rvfcKnown, gaps = [], hits = [];
      for (let i = 0; i < gapN; i++) gaps.push(r3(gapR[(gapW - gapN + i + GAPS * 2) % GAPS]));
      const thr = [];
      for (let i = 0; i < thrN; i++) { const k = ((thrW - thrN + i + THR * 2) % THR) * 3; thr.push({ ms: Math.round(thrR[k + 1]), raf: thrR[k + 2] ? 'paused' : 'alive', sec: Math.round((thrR[k] - t0) / 100) / 10 }); }
      for (let i = 0; i < hitN; i++) { const k = ((hitW - hitN + i + HITS * 2) % HITS) * 3; hits.push({ t: r1(hitR[k]), ms: Math.round(hitR[k + 1]), sec: Math.round((hitR[k + 2] - t0) / 100) / 10 }); }
      return {
        measure: pf ? 'per-frame' : 'unavailable', steady: steadyUntil > 0, live: curPres !== null || curDec !== null, throttled: thrNow,
        presentedFps: pf ? r1(heldPres) : null, sourceFps: srcFps, sourceFpsBasis: 'estimate from the frames shown', fpsRatio: pf && heldPres != null && srcFps ? Math.round(heldPres / srcFps * 100) / 100 : null,
        decodedFps: r1(heldDec), droppedShare: r3(heldDrop), gaps, hitches: hits, throttles: thr,
      };
    }

    function summary() {
      const watch = totals.watchMs || 0, tm = timing(), pf = tm.measure === 'per-frame';
      return Object.assign({}, totals, {
        rebufferRatio: watch ? Math.round(totals.stallMs * 1000 / (watch + totals.stallMs)) / 1000 : 0, source: src() && src().label, sourceIndex: si, sources: sources.length, state,
        // No per-frame timing in this browser: the sync and hitch figures are null ("no measure"), never a zero that reads as "no lag".
        avMeasure: tm.measure, throttles: pf ? totals.throttles : null, throttledMs: pf ? totals.throttledMs : null, throttlesPageWide: pf ? totals.throttlesPageWide : null, avlags: pf ? totals.avlags : null, hitches: pf ? totals.hitches : null, longestHitchMs: pf ? totals.longestHitchMs : null,
        maxAvGapMs: pf && avFrames ? totals.maxAvGapMs : null,
        presentedFps: tm.presentedFps, sourceFps: tm.sourceFps, sourceFpsBasis: tm.sourceFpsBasis, fpsRatio: tm.fpsRatio, decodedFps: tm.decodedFps, droppedShare: tm.droppedShare,
        meanPresentedFps: pf && mMs ? r1(mPres * 1000 / mMs) : null, meanDecodedFps: mDecMs ? r1(mDec * 1000 / mDecMs) : null,
        meanDroppedShare: mDec >= C.RATE_MIN_FRAMES ? r3(mDrop / mDec) : null, steadyMs: Math.round(mMs),
      });
    }

    return { load, stop, sample, frame, event, expand, summary, timing, get state() { return state; }, get sourceIndex() { return si; }, get source() { return src(); }, get log() { return log.slice(); }, config: C };
  }

  return { create, DEFAULTS };
});
