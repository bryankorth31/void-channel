// Tests for the VOID player core. Run:  node --test player/test
// Each test drives a simulated playback timeline (250 ms samples, optional per-frame callbacks) and
// checks what the core decides. No browser needed.
const test = require('node:test');
const assert = require('node:assert');
const VoidCore = require('../src/core.js');

const SOURCES = [
  { url: 'https://ia1/a.mp4', label: 'copy1@primary', fileKey: 0 },
  { url: 'https://ia2/a.mp4', label: 'copy1@backup', fileKey: 0 },
  { url: 'https://archive.org/download/x/b.mp4', label: 'copy2@archive', fileKey: 1 },
];

// A tiny world: a playhead, a frame counter, and the core in the middle.
function world(opts = {}) {
  const events = [], actions = [];
  const core = VoidCore.create({ emit: (e) => events.push(e), act: (a) => actions.push(a), config: opts.config });
  const w = { core, events, actions, now: 1000, t: 0, frames: 0, paused: false, seeking: false, ended: false, hidden: false, hasVideo: true, ahead: 20, useFrames: opts.useFrames !== false, rvfc: !!opts.rvfc };
  w.load = (srcs = SOURCES, at = 0) => { core.load(srcs, at, w.now, true); };
  // A modelled buffer for the buffer-watch tests: set w.bufEnd (where the buffered range ends) and w.fill (seconds of
  // video the download adds per second; 0 = the server hangs). Then ahead follows from the playhead, the playhead
  // cannot pass the buffered end, and the core is also told the file's duration and the networkState. Left unset,
  // ahead stays the fixed w.ahead and the buffer watch (which needs a duration) is off, as in the older tests.
  w.bufEnd = null; w.fill = 0; w.duration = undefined; w.networkState = undefined;
  // Advance time. mode: 'play' (picture and sound move), 'freeze' (sound moves, no frames), 'stall' (nothing moves),
  // 'drift' (frames arrive but lag the sound by `lag` seconds; needs rvfc).
  w.run = (ms, mode = 'play', lag = 0) => {
    for (let x = 0; x < ms; x += 250) {
      w.now += 250;
      const buf = w.bufEnd != null;
      if (buf) w.bufEnd += w.fill * 0.25;
      const room = !buf || w.t + 0.25 <= w.bufEnd + 1e-9; // a playhead cannot pass the end of what is buffered
      if (!w.paused && !w.seeking && mode !== 'stall' && room) w.t += 0.25;
      if (!w.paused && !w.seeking && room && (mode === 'play' || mode === 'drift')) {
        w.frames += 6;
        if (w.rvfc) for (let k = 0; k < 6; k++) core.frame(w.t - lag - 0.03, w.t, w.now);
      }
      core.sample({ now: w.now, t: w.t, paused: w.paused, seeking: w.seeking, ended: w.ended, ready: 4, hidden: w.hidden, hasVideo: w.hasVideo, frames: w.useFrames ? w.frames : undefined, dropped: 0, totalFrames: w.frames, ahead: buf ? Math.max(0, w.bufEnd - w.t) : w.ahead, bufEnd: buf ? w.bufEnd : undefined, duration: w.duration, networkState: w.networkState });
    }
  };
  // A buffer that keeps pace with playback, `lead` seconds ahead (the usual healthy state).
  w.healthyBuffer = (lead = 8, duration = 3000) => { w.bufEnd = w.t + lead; w.fill = 1; w.duration = duration; };
  w.kinds = (type) => events.filter((e) => e.type === type);
  w.acts = (type) => actions.filter((a) => a.type === type);
  return w;
}

test('healthy playback: starts, reports startup, takes no action', () => {
  const w = world(); w.load(); w.run(60000);
  assert.strictEqual(w.kinds('started').length, 1);
  assert.strictEqual(w.kinds('action').length, 0);
  assert.strictEqual(w.core.state, 'playing');
  assert.ok(w.core.summary().watchMs > 55000);
});

test('a short buffering pause (3 s) is left alone', () => {
  const w = world(); w.load(); w.run(10000); w.run(3000, 'stall'); w.run(10000);
  assert.strictEqual(w.kinds('stall').length, 1);
  assert.strictEqual(w.kinds('action').length, 0);
  assert.strictEqual(w.core.state, 'playing');
});

test('frozen picture with sound running: nudges to the current time, then reports recovery', () => {
  const w = world(); w.load(); w.run(20000); w.run(2000, 'freeze'); w.run(10000);
  assert.strictEqual(w.kinds('freeze').length, 1);
  const seek = w.acts('seek');
  assert.strictEqual(seek.length, 1);
  assert.ok(seek[0].at >= 21 && seek[0].at <= 22.5, 'nudges to where the sound is, so nothing repeats: ' + seek[0].at);
  assert.strictEqual(w.kinds('recovered').length, 1);
  assert.strictEqual(w.core.state, 'playing');
});

test('freezes that keep coming back on one source escalate: nudge, reload, then the backup server', () => {
  const w = world(); w.load();
  w.run(20000); w.run(2000, 'freeze'); w.run(8000);
  w.run(2000, 'freeze'); w.run(8000);
  w.run(2000, 'freeze'); w.run(8000);
  const steps = w.kinds('action').map((a) => a.step);
  assert.deepStrictEqual(steps, ['nudge', 'reload', 'switch']);
  assert.strictEqual(w.core.sourceIndex, 1);
  const sw = w.acts('set-source').pop();
  assert.strictEqual(sw.source.label, 'copy1@backup');
  assert.ok(sw.at > 30, 'resumes where the viewer was');
});

test('picture drifting behind the sound is caught from frame timing and nudged', () => {
  const w = world({ rvfc: true }); w.load(); w.run(15000); w.run(2000, 'drift', 0.9); w.run(8000);
  assert.ok(w.kinds('drift').length >= 1);
  assert.strictEqual(w.kinds('action')[0].step, 'nudge');
});

test('small natural lag (0.1 s) is not treated as drift', () => {
  const w = world({ rvfc: true }); w.load(); w.run(60000, 'drift', 0.1);
  assert.strictEqual(w.kinds('drift').length, 0);
  assert.strictEqual(w.kinds('action').length, 0);
});

test('a long stall climbs the ladder every 6 s and ends on another source', () => {
  const w = world(); w.load(); w.run(10000); w.run(21000, 'stall');
  const steps = w.kinds('action').map((a) => a.step);
  assert.deepStrictEqual(steps.slice(0, 3), ['nudge', 'reload', 'switch']);
  assert.strictEqual(w.core.sourceIndex, 1);
});

test('network error: one retry on the same source, then switch, then a clear failure', () => {
  const w = world(); w.load(); w.run(5000);
  w.core.event('error', w.now, { code: 2 }); w.run(4000);
  assert.strictEqual(w.kinds('action')[0].step, 'reload');
  assert.ok(w.acts('reload')[0].delayMs > 0);
  w.core.event('error', w.now, { code: 2 }); w.run(4000);
  assert.strictEqual(w.core.sourceIndex, 1);
  w.core.event('error', w.now, { code: 4 }); w.run(1000);
  assert.strictEqual(w.core.sourceIndex, 2);
  w.core.event('error', w.now, { code: 4 }); w.run(1000);
  assert.strictEqual(w.core.state, 'failed');
  assert.strictEqual(w.kinds('failed').length, 1);
  assert.strictEqual(w.acts('show-failure').length, 1);
});

test('decode or format error skips to a different copy (the same file from the backup server cannot help)', () => {
  const w = world(); w.load(); w.run(5000);
  w.core.event('error', w.now, { code: 3 });
  assert.strictEqual(w.kinds('action')[0].step, 'switch');
  assert.strictEqual(w.core.sourceIndex, 2);
  assert.strictEqual(w.core.source.label, 'copy2@archive');
});

test('a copy with no sound switches to a different copy, keeping position', () => {
  const w = world(); w.load(); w.run(8000);
  w.core.event('silent', w.now);
  assert.strictEqual(w.core.sourceIndex, 2);
  assert.ok(w.acts('set-source').pop().at > 6);
});

test('no sound on the last copy keeps playing and shows a notice instead of failing', () => {
  const w = world(); w.load(SOURCES.slice(2)); w.run(8000);
  w.core.event('silent', w.now); w.run(3000);
  assert.strictEqual(w.acts('show-notice').length, 1);
  assert.notStrictEqual(w.core.state, 'failed');
  assert.strictEqual(w.kinds('silent-final').length, 1);
});

test('slow start: nothing plays for 15 s, so the next source is tried', () => {
  const w = world(); w.load(); w.run(16000, 'stall');
  assert.strictEqual(w.kinds('action')[0].kind, 'slow-start');
  assert.strictEqual(w.core.sourceIndex, 1);
  assert.strictEqual(w.kinds('stall').length, 0, 'waiting for the first picture is not a stall');
});

test('a paused viewer is never "recovered"', () => {
  const w = world(); w.load(); w.run(5000); w.paused = true; w.core.event('user-pause', w.now); w.run(120000, 'stall');
  assert.strictEqual(w.kinds('action').length, 0);
  assert.strictEqual(w.core.state, 'paused');
});

test('a hidden tab (no frame callbacks) is not mistaken for a freeze', () => {
  const w = world(); w.load(); w.run(5000); w.hidden = true; w.run(30000, 'freeze'); w.hidden = false; w.run(5000);
  assert.strictEqual(w.kinds('freeze').length, 0);
});

test('a browser that cannot report frames never triggers a false freeze', () => {
  const w = world({ useFrames: false }); w.load(); w.run(60000, 'freeze');
  assert.strictEqual(w.kinds('freeze').length, 0);
  assert.strictEqual(w.kinds('started').length, 1, 'still detects that playback started');
});

test('the viewer seeking is not a stall', () => {
  const w = world(); w.load(); w.run(5000); w.seeking = true; w.core.event('user-seek', w.now, { t: 600 }); w.run(4000, 'stall'); w.seeking = false; w.t = 600; w.run(5000);
  assert.strictEqual(w.kinds('action').length, 0);
});

test('Retry on the failure card starts again from the best source', () => {
  const w = world(); w.load(SOURCES.slice(0, 1)); w.run(3000);
  w.core.event('error', w.now, { code: 4 });
  assert.strictEqual(w.core.state, 'failed');
  w.core.event('retry', w.now);
  assert.strictEqual(w.core.sourceIndex, 0);
  assert.notStrictEqual(w.core.state, 'failed');
});

test('no sources at all fails cleanly instead of hanging on a spinner', () => {
  const w = world(); w.load([]);
  assert.strictEqual(w.core.state, 'failed');
  assert.strictEqual(w.acts('show-failure')[0].reason, 'no-sources');
});

test('summary reports watch time, stall time and rebuffer ratio', () => {
  const w = world(); w.load(); w.run(30000); w.run(4000, 'stall'); w.run(30000);
  const s = w.core.summary();
  assert.ok(s.stallMs >= 3000 && s.stallMs <= 4500, 'stall time ' + s.stallMs);
  assert.ok(s.rebufferRatio > 0 && s.rebufferRatio < 0.2);
  assert.strictEqual(s.stalls, 1);
});

test('an episode opened without autoplay shows as paused, not loading', () => {
  const w = world(); w.core.load(SOURCES, 0, w.now, false); w.paused = true; w.run(3000, 'stall');
  assert.strictEqual(w.core.state, 'paused');
  assert.strictEqual(w.kinds('action').length, 0);
});

test('autoplay blocked by the browser falls back to paused with a play button', () => {
  const w = world(); w.load(); w.paused = true; w.core.event('user-pause', w.now); w.run(20000, 'stall');
  assert.strictEqual(w.core.state, 'paused');
  assert.strictEqual(w.kinds('action').length, 0, 'no slow-start switching for a viewer who has not pressed play');
});

test('starved stall (server stopped sending): after 3 s, hop to the other server at the same moment', () => {
  const w = world(); w.load(); w.run(20000); w.ahead = 0; w.run(4000, 'stall');
  const a = w.kinds('action');
  assert.strictEqual(a.length, 1);
  assert.strictEqual(a[0].kind, 'starved');
  assert.strictEqual(a[0].step, 'switch', 'no pointless nudge on a hung server');
  assert.strictEqual(w.core.source.label, 'copy1@backup');
  assert.ok(w.acts('set-source').pop().at >= 19, "keeps the viewer's place");
});

test('a short starved pause (2 s) is left to the browser', () => {
  const w = world(); w.load(); w.run(10000); w.ahead = 0; w.run(2000, 'stall'); w.ahead = 20; w.run(10000);
  assert.strictEqual(w.kinds('action').length, 0);
});

test('starvation recovers on the other server and is reported as fixed', () => {
  const w = world(); w.load(); w.run(10000); w.ahead = 0; w.run(4000, 'stall'); w.ahead = 20; w.run(12000);
  const r = w.kinds('recovered');
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].kind, 'starved');
  assert.strictEqual(w.core.state, 'playing');
});

test('servers that keep starving are cycled, then the next copy is tried', () => {
  const w = world(); w.load(); w.run(10000); w.ahead = 0; w.run(40000, 'stall');
  const path = w.kinds('switch').map((x) => x.to);
  assert.deepStrictEqual(path.slice(0, 4), ['copy1@backup', 'copy1@primary', 'copy1@backup', 'copy2@archive']);
});

test('a stall with video still buffered keeps the gentle ladder (nudge first)', () => {
  const w = world(); w.load(); w.run(10000); w.ahead = 15; w.run(7000, 'stall');
  assert.strictEqual(w.kinds('action')[0].step, 'nudge');
});

// ---------- Fix batch B (SP-019, SP-021, SP-022): why it failed, the buffer watch, honest pause maths ----------

const LONE = SOURCES.slice(0, 1); // one source only (the server lookup failed or timed out)

// Play, then the Archive stops sending on every server. The picture stops, the core cycles through the servers
// and the next copy, and in the end it fails. It must say "network": the page shows the Archive text only for it.
test('SP-019: every server starving ends in a failure whose cause is network', () => {
  const w = world(); w.load(); w.run(10000); w.ahead = 0; w.run(80000, 'stall');
  const f = w.kinds('failed');
  assert.strictEqual(f.length, 1);
  assert.strictEqual(f[0].reason, 'starved');
  assert.strictEqual(f[0].cause, 'network');
  assert.strictEqual(w.acts('show-failure').length, 1);
  assert.strictEqual(w.acts('show-failure')[0].cause, 'network');
  assert.strictEqual(w.core.state, 'failed');
});

test('SP-019: the finding reproduction, one file on three servers all starving: cycles twice over, then fails as network', () => {
  const three = [{ url: 'https://ia1/a.mp4', label: 'copy1@primary', fileKey: 0 }, { url: 'https://ia2/a.mp4', label: 'copy1@backup', fileKey: 0 }, { url: 'https://archive.org/download/x/a.mp4', label: 'copy1@archive', fileKey: 0 }];
  const w = world(); w.load(three); w.run(10000); w.ahead = 0; const t0 = w.now; w.run(60000, 'stall');
  const f = w.kinds('failed');
  assert.strictEqual(f.length, 1);
  assert.deepStrictEqual([f[0].reason, f[0].cause], ['starved', 'network']);
  assert.deepStrictEqual(w.kinds('switch').map((x) => x.to), ['copy1@backup', 'copy1@archive', 'copy1@primary', 'copy1@backup', 'copy1@archive']);
  assert.strictEqual(w.acts('reload').length, 0, 'a file with several servers cycles; the lone-server reload is not used');
  const took = (f[0].at - t0) / 1000;
  assert.ok(took > 25 && took < 40, 'failed ' + took + ' s after the stall began (the finding measured 33 s)');
});

test('SP-019: one source that starves is reloaded once, then fails with cause network', () => {
  const w = world(); w.load(LONE); w.run(10000); w.ahead = 0; w.run(4000, 'stall');
  const acts = w.kinds('action');
  assert.strictEqual(acts.length, 1);
  assert.strictEqual(acts[0].step, 'retry');
  assert.strictEqual(acts[0].kind, 'starved');
  assert.strictEqual(w.acts('reload').length, 1, 'one reload of the same source');
  assert.strictEqual(w.acts('show-failure').length, 0, 'no card while the retry runs, so no download link can appear because of it');
  assert.strictEqual(w.core.state, 'recovering');
  w.run(30000, 'stall');
  assert.strictEqual(w.acts('reload').length, 1, 'capped at one: no loop');
  assert.strictEqual(w.kinds('failed').length, 1);
  assert.strictEqual(w.kinds('failed')[0].cause, 'network');
  assert.strictEqual(w.acts('show-failure').length, 1);
  assert.strictEqual(w.kinds('switch').length, 0, 'nowhere to hop to');
});

test('SP-019: a lone source that recovers after its reload is reported as fixed', () => {
  const w = world(); w.load(LONE); w.run(10000); w.ahead = 0; w.run(4000, 'stall'); w.ahead = 20; w.run(12000);
  assert.strictEqual(w.kinds('recovered').length, 1);
  assert.strictEqual(w.kinds('failed').length, 0);
  assert.strictEqual(w.core.state, 'playing');
});

test('SP-019: Try again gives a lone source its one reload back', () => {
  const w = world(); w.load(LONE); w.run(10000); w.ahead = 0; w.run(40000, 'stall');
  assert.strictEqual(w.core.state, 'failed');
  w.core.event('retry', w.now);
  assert.strictEqual(w.core.state, 'recovering');
  w.run(8000, 'stall');
  assert.strictEqual(w.acts('reload').length, 2, 'the viewer got a fresh start, with the full allowance');
  w.run(30000, 'stall');
  assert.strictEqual(w.kinds('failed').length, 2);
});

test('SP-019: a lone server that is not the last source moves on at once; only the last one is reloaded', () => {
  const two = [{ url: 'https://archive.org/download/x/a.mp4', label: 'a@archive', fileKey: 0 }, { url: 'https://archive.org/download/y/b.mp4', label: 'b@archive', fileKey: 1 }];
  const w = world(); w.load(two); w.run(10000); w.ahead = 0; w.run(4000, 'stall');
  assert.strictEqual(w.kinds('switch').length, 1);
  assert.strictEqual(w.core.source.label, 'b@archive');
  assert.strictEqual(w.acts('reload').length, 0);
  w.run(30000, 'stall');
  assert.strictEqual(w.acts('reload').length, 1, 'the last source gets its reload');
  assert.strictEqual(w.kinds('failed')[0].cause, 'network');
});

test('SP-019: the cause follows the reason: network errors and slow starts are network, decode and format errors are format, a frozen picture is playback', () => {
  // network error, retried once then out of sources
  let w = world(); w.load(LONE); w.run(3000);
  w.core.event('error', w.now, { code: 2 }); w.run(4000); w.core.event('error', w.now, { code: 2 });
  assert.deepStrictEqual([w.kinds('failed')[0].reason, w.kinds('failed')[0].cause, w.kinds('failed')[0].code], ['error-net', 'network', 2]);
  // decode error and not-supported error
  w = world(); w.load(LONE); w.run(3000); w.core.event('error', w.now, { code: 3 });
  assert.deepStrictEqual([w.kinds('failed')[0].reason, w.kinds('failed')[0].cause, w.kinds('failed')[0].code], ['error-fatal', 'format', 3]);
  assert.deepStrictEqual([w.acts('show-failure')[0].cause, w.acts('show-failure')[0].code], ['format', 3], 'the card is told the same');
  w = world(); w.load(LONE); w.run(3000); w.core.event('error', w.now, { code: 4 });
  assert.deepStrictEqual([w.kinds('failed')[0].cause, w.kinds('failed')[0].code], ['format', 4]);
  // aborted load is neither
  w = world(); w.load(LONE); w.run(3000); w.core.event('error', w.now, { code: 1 });
  assert.strictEqual(w.kinds('failed')[0].cause, 'playback');
  // nothing plays within 15 s
  w = world(); w.load(LONE); w.run(16000, 'stall');
  assert.deepStrictEqual([w.kinds('failed')[0].reason, w.kinds('failed')[0].cause], ['slow-start', 'network']);
  // frozen picture again and again
  w = world(); w.load(LONE); w.run(20000);
  for (let k = 0; k < 3; k++) { w.run(2000, 'freeze'); w.run(8000); }
  assert.deepStrictEqual([w.kinds('failed')[0].reason, w.kinds('failed')[0].cause], ['freeze', 'playback']);
  // no copy this browser can play
  w = world(); w.load([]);
  assert.deepStrictEqual([w.kinds('failed')[0].reason, w.kinds('failed')[0].cause], ['no-sources', 'format']);
  assert.strictEqual(w.acts('show-failure')[0].cause, 'format');
  w.core.event('retry', w.now); // Try again with nothing to try fails the same way
  assert.deepStrictEqual([w.kinds('failed')[1].reason, w.kinds('failed')[1].cause], ['no-sources', 'format']);
});

// A hung download: the buffered end stops growing while the picture still plays. Hop then, not when the picture stops.
function hung(opts) { // play 6 s on the fixed buffer, then 8 s on a modelled one that keeps pace, then the server hangs
  const w = world(opts); w.load(); w.run(6000); w.healthyBuffer(8); w.run(8000);
  w.hangAt = w.now; w.fill = 0;
  return w;
}

test('SP-021: a buffer that stops growing hops after 4 s while the picture is still playing', () => {
  const w = hung(); w.run(4000);
  const sw = w.kinds('switch');
  assert.strictEqual(sw.length, 1);
  assert.strictEqual(sw[0].reason, 'starved');
  assert.strictEqual(w.core.source.label, 'copy1@backup');
  const took = sw[0].at - w.hangAt;
  assert.ok(took >= 4000 && took <= 4500, 'hop ' + took + ' ms after the buffer went flat');
  const st = w.kinds('stall');
  assert.strictEqual(st.length, 1);
  assert.strictEqual(st[0].trigger, 'buffer');
  assert.ok(st[0].ahead > 3 && st[0].ahead < 5, 'ahead is in the stall event, and the picture still had video left: ' + st[0].ahead);
  assert.ok(st[0].flatMs >= 4000, 'how long the buffer was flat is in it too: ' + st[0].flatMs);
  assert.strictEqual(typeof st[0].grewS, 'number');
  assert.ok(w.acts('set-source').pop().at >= w.t - 0.5, 'the hop keeps the viewer place');
  assert.strictEqual(w.kinds('action')[0].kind, 'starved');
});

test('SP-021: the stall event also says how much the buffer grew when the picture stops first', () => {
  const w = world(); w.load(); w.run(20000); w.ahead = 0; w.run(1500, 'stall');
  const st = w.kinds('stall');
  assert.strictEqual(st.length, 1);
  assert.strictEqual(st[0].trigger, 'picture');
  assert.strictEqual(typeof st[0].grewS, 'number');
  assert.strictEqual(typeof st[0].flatMs, 'number');
});

test('SP-021: nothing hops while the viewer has paused', () => {
  const w = hung(); w.paused = true; w.core.event('user-pause', w.now); w.run(60000);
  assert.strictEqual(w.kinds('action').length, 0);
  assert.strictEqual(w.core.state, 'paused');
  // time spent paused does not count towards the 4 s: the clock starts again when playing resumes
  w.paused = false; w.core.event('user-play', w.now); w.run(3000);
  assert.strictEqual(w.kinds('action').length, 0);
});

test('SP-021: nothing hops while the viewer is seeking', () => {
  const w = hung(); w.seeking = true; w.core.event('user-seek', w.now, { t: 600 }); w.run(60000, 'stall');
  assert.strictEqual(w.kinds('action').length, 0);
  w.seeking = false; w.t = 600; w.healthyBuffer(8); w.run(10000);
  assert.strictEqual(w.kinds('action').length, 0, 'a buffer that keeps pace after the seek is fine');
});

test('SP-021: nothing hops once the episode has ended', () => {
  const w = hung(); w.ended = true; w.run(60000);
  assert.strictEqual(w.kinds('action').length, 0);
  assert.strictEqual(w.core.state, 'ended');
});

test('SP-021: a slow line whose buffer still grows is left alone', () => {
  const w = world(); w.load(); w.run(6000); w.healthyBuffer(8); w.fill = 0.9; w.run(60000);
  assert.strictEqual(w.kinds('action').length, 0);
  assert.strictEqual(w.kinds('stall').length, 0);
  assert.strictEqual(w.core.state, 'playing');
});

test('SP-021: plenty buffered (10 s or more) is not a hang, however flat', () => {
  const w = world(); w.load(); w.run(6000); w.healthyBuffer(30); w.run(5000); w.fill = 0; w.run(15000);
  assert.strictEqual(w.kinds('action').length, 0);
});

test('SP-021: a browser that paused its own download (networkState idle) is not a hung server', () => {
  const idle = hung(); idle.networkState = 1; idle.run(6000);
  assert.strictEqual(idle.kinds('action').length, 0);
  const loading = hung(); loading.networkState = 2; loading.run(6000);
  assert.strictEqual(loading.kinds('switch').length, 1, 'the same flat buffer with the network loading does hop');
});

test('SP-021: a buffer that is flat because the whole file is in it never hops', () => {
  const w = world(); w.load(); w.run(6000);
  w.t = 100; w.bufEnd = 120; w.fill = 0; w.duration = 120; w.run(19000);
  assert.strictEqual(w.kinds('action').length, 0);
});

test('SP-021: without the file length the watch stays off (the picture-stop triggers still work)', () => {
  const w = hung(); w.duration = undefined; w.run(7000);
  assert.strictEqual(w.kinds('action').length, 0, 'still playing from the buffer, nothing hopped yet');
  w.run(12000);
  assert.strictEqual(w.kinds('switch').length >= 1, true, 'once the picture stops, the old trigger takes over');
  assert.strictEqual(w.kinds('stall')[0].trigger, 'picture');
});

test('SP-021: a playhead stuck on buffered data is a browser hiccup and keeps the gentle ladder', () => {
  const w = world(); w.load(); w.run(6000); w.healthyBuffer(5); w.run(6000); w.fill = 0; w.run(7000, 'stall');
  const a = w.kinds('action');
  assert.strictEqual(a[0].step, 'nudge');
  assert.strictEqual(a[0].kind, 'stall');
  assert.strictEqual(w.kinds('switch').length, 0);
});

test('SP-021: after a hop the flat-buffer clock starts when the settle time ends, even when the buffer limit is shorter', () => {
  const w = hung({ config: { BUFFER_STALL_MS: 1000 } }); w.run(9000);
  const hops = w.kinds('switch');
  assert.ok(hops.length >= 2, 'hops: ' + hops.length);
  const gap = hops[1].at - hops[0].at;
  assert.ok(gap >= 3500 && gap <= 3750, 'second hop ' + gap + ' ms after the first (settle 2500 plus the 1000 limit)');
});

test('SP-021: a fresh connection gets as long to send its first byte as it does without the watch (5 s is fine)', () => {
  const w = hung(); // the primary hangs; the backup is healthy but its first byte takes 5 s
  let hopped = 0, connectAt = 0;
  for (let i = 0; i < 200; i++) { // 50 s
    if (w.kinds('switch').length > hopped) { hopped = w.kinds('switch').length; w.bufEnd = w.t; w.fill = 0; connectAt = w.now + 5000; } // a new connection starts with nothing buffered
    if (connectAt && w.now >= connectAt) { w.fill = 1.5; connectAt = 0; }
    w.run(250);
  }
  assert.strictEqual(w.kinds('switch').length, 1, 'stayed on the backup');
  assert.strictEqual(w.kinds('failed').length, 0);
  assert.strictEqual(w.core.state, 'playing');
});

// The watch may move (another server, the next copy) but it must never end playback or throw the buffer away for a
// lone-server reload: only the stopped-picture path may do that, because only then has playback really stopped.
// A 15 s browser buffer; each hang heals by itself after 6 s (the server comes back with a refilled buffer).
function hangsThatHeal(srcs, count, everyMs) {
  const w = world(); w.load(srcs); w.run(6000); w.healthyBuffer(15, 100000); w.run(8000);
  for (let k = 0; k < count; k++) { w.fill = 0; w.run(6000); w.bufEnd = w.t + 15; w.fill = 1; w.run(everyMs - 6000); }
  return w;
}

test('SP-021: four separate 6 s hangs on a two-server file end in no failure card, whatever the hop allowance', () => {
  const w = hangsThatHeal(SOURCES.slice(0, 2), 4, 100000);
  assert.strictEqual(w.kinds('failed').length, 0);
  assert.strictEqual(w.acts('show-failure').length, 0);
  assert.strictEqual(w.kinds('switch').length, 3, 'three hops, the fourth hang is left to the buffer (the allowance is spent)');
  assert.strictEqual(w.core.state, 'playing');
});

test('SP-021: two separate 6 s hangs on a single source never reload it and never show a failure card', () => {
  const w = hangsThatHeal(LONE, 2, 200000);
  assert.strictEqual(w.kinds('action').length, 0, 'the watch does not reload a lone server while the picture still plays');
  assert.strictEqual(w.acts('reload').length, 0);
  assert.strictEqual(w.kinds('failed').length, 0);
  assert.strictEqual(w.core.state, 'playing');
});

test('SP-021: a hang that outlasts the buffer fails only after the picture has really stopped', () => {
  const w = world(); w.load(SOURCES.slice(0, 2)); w.run(6000); w.healthyBuffer(15, 100000); w.run(8000); w.fill = 0;
  let aheadAtFail = null;
  for (let i = 0; i < 480 && aheadAtFail === null; i++) { w.run(250); if (w.kinds('failed').length) aheadAtFail = w.bufEnd - w.t; }
  assert.notStrictEqual(aheadAtFail, null, 'it does fail in the end');
  assert.ok(aheadAtFail < 1, 'the picture had stopped when it failed: ' + aheadAtFail + ' s were still buffered');
  assert.strictEqual(w.kinds('failed')[0].cause, 'network');
  assert.ok(w.kinds('stall').filter((e) => e.trigger === 'buffer').length <= 3, 'no stall event repeating while the watch declines');
});

test('SP-021: the hop allowance refills after two minutes of playing, so later hangs still get their hop', () => {
  const w = hangsThatHeal(SOURCES.slice(0, 2), 6, 150000);
  assert.strictEqual(w.kinds('switch').length, 6, 'every hang got its hop, not just the first three');
  assert.strictEqual(w.kinds('failed').length, 0);
});

test('SP-021: a lone-server reload is refilled too, so a second hang long after the first is reloaded again', () => {
  const w = world(); w.load(LONE); w.run(10000); w.ahead = 0; w.run(4000, 'stall'); // the picture stopped: the one reload
  assert.strictEqual(w.acts('reload').length, 1);
  w.ahead = 20; w.run(130000); // plays on for over two minutes
  w.ahead = 0; w.run(4000, 'stall');
  assert.strictEqual(w.acts('reload').length, 2, 'the allowance came back');
  assert.strictEqual(w.kinds('failed').length, 0);
});

test('SP-021: a file length that is Infinity, NaN or 0 keeps the watch off', () => {
  for (const d of [Infinity, NaN, 0]) {
    const w = hung(); w.duration = d; w.run(7000);
    assert.strictEqual(w.kinds('action').length, 0, 'duration ' + d);
  }
});

test('SP-021: a seek the page makes itself (no viewer event) restarts the flat-buffer clock when it completes', () => {
  const w = hung(); w.run(3000); // the buffer has been flat for 3 s
  w.seeking = true; w.run(3000, 'stall'); w.seeking = false; // the page seeks (no user-seek event); 3 more seconds pass
  w.run(3000);
  assert.strictEqual(w.kinds('action').length, 0, 'the 4 s start again after the seek, not 6 s ago');
  w.run(2000);
  assert.strictEqual(w.kinds('switch').length, 1, 'and it still hops once the buffer has been flat for 4 s since');
});

test('SP-021: the pause the viewer saw is counted from the hop to the picture coming back', () => {
  const w = hung(); w.run(4000);
  assert.strictEqual(w.kinds('switch').length, 1);
  w.run(1500, 'stall'); w.healthyBuffer(8); w.run(10000);
  const s = w.core.summary();
  assert.ok(s.stallMs >= 1500 && s.stallMs <= 2000, 'stall time ' + s.stallMs);
  assert.strictEqual(s.longestPauseMs, s.stallMs);
  assert.ok(s.rebufferRatio > 0 && s.rebufferRatio < 0.2);
  assert.strictEqual(s.stalls, 1);
  assert.strictEqual(w.core.state, 'playing');
});

test('SP-022: a hop after a stopped picture still counts the pause from where it stopped (it used to be lost)', () => {
  const w = world(); w.load(); w.run(20000); w.ahead = 0; w.run(4000, 'stall'); w.ahead = 20; w.run(1000, 'stall'); w.run(12000);
  const s = w.core.summary();
  assert.ok(s.stallMs >= 4500 && s.stallMs <= 5500, 'stall time ' + s.stallMs);
  assert.strictEqual(s.longestPauseMs, s.stallMs);
});
