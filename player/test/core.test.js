// Tests for the VOID player core. Run:  node --test "player/test/*.test.js"
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

// SP-026: a later copy's servers are looked up by the page when the core first moves onto it, and handed to the core.
const TWO_COPIES = [{ url: 'https://archive.org/download/x/a.mp4', label: 'copy1@archive', fileKey: 0 }, { url: 'https://archive.org/download/y/b.mp4', label: 'copy2@archive', fileKey: 1, lazy: true }];
const COPY2_SERVERS = [{ url: 'https://ia9/y/b.mp4', label: 'copy2@primary', fileKey: 1 }, { url: 'https://ia8/y/b.mp4', label: 'copy2@backup', fileKey: 1 }];

test('SP-026: servers found for the copy the core just moved onto go in front of its Archive link, and the core moves onto the first', () => {
  const w = world(); w.load(TWO_COPIES); w.run(3000);
  w.core.event('error', w.now, { code: 3 }); // copy 1 cannot be decoded: on to copy 2 (its servers unknown)
  assert.strictEqual(w.core.source.label, 'copy2@archive');
  const cur = w.core.expand(COPY2_SERVERS);
  assert.strictEqual(cur.label, 'copy2@primary');
  assert.strictEqual(w.core.source.label, 'copy2@primary');
  assert.strictEqual(w.core.sourceIndex, 1);
  assert.strictEqual(w.core.summary().sources, 4, 'copy 1, primary, backup, the Archive link');
  assert.strictEqual(w.kinds('switch').length, 1, 'expanding is not a switch');
});

test('SP-026: an expanded copy cycles its servers when it starves, instead of reloading a lone link and failing', () => {
  const w = world(); w.load(TWO_COPIES); w.run(3000);
  w.core.event('error', w.now, { code: 3 }); w.core.expand(COPY2_SERVERS); w.run(10000);
  w.ahead = 0; w.run(4000, 'stall');
  assert.strictEqual(w.kinds('switch').pop().to, 'copy2@backup');
  assert.strictEqual(w.acts('reload').length, 0);
  assert.strictEqual(w.kinds('failed').length, 0);
  w.run(8000, 'stall');
  assert.strictEqual(w.kinds('switch').pop().to, 'copy2@archive', 'then the copy\'s Archive link, the old order');
});

test('SP-026: entries of another copy, or none, change nothing', () => {
  const w = world(); w.load(TWO_COPIES); w.run(3000);
  assert.strictEqual(w.core.expand(COPY2_SERVERS).label, 'copy1@archive', 'still on copy 1: entries of copy 2 are not its servers');
  assert.strictEqual(w.core.summary().sources, 2);
  assert.strictEqual(w.core.expand([]).label, 'copy1@archive');
  assert.strictEqual(w.core.expand(null).label, 'copy1@archive');
  assert.strictEqual(w.core.summary().sources, 2);
});

test('SP-022: a hop after a stopped picture still counts the pause from where it stopped (it used to be lost)', () => {
  const w = world(); w.load(); w.run(20000); w.ahead = 0; w.run(4000, 'stall'); w.ahead = 20; w.run(1000, 'stall'); w.run(12000);
  const s = w.core.summary();
  assert.ok(s.stallMs >= 4500 && s.stallMs <= 5500, 'stall time ' + s.stallMs);
  assert.strictEqual(s.longestPauseMs, s.stallMs);
});

// ---------- Picture rate and sync (audit ask A-022): measured and reported only ----------
// A film is a playback model with real frames. The file has a frame every `d` seconds of media time. The page is
// called for each one `queue` ms before it is shown, plus `lag` seconds when the picture runs behind the sound. For each
// frame pick(k, atMs) says 'show' (shown), 'drop' (made by the browser but not shown: counted as dropped) or 'skip'
// (never made). Samples every 250 ms, with the frame callbacks that fall inside each step. Switches on the world:
// docHidden, offscreen, pip, rafAlive (the page's drawing), ready, rate, stalled, cbOff(atMs) (no callbacks at all).
function lcg(seed) { let x = seed; return () => { x = (x * 1664525 + 1013904223) % 4294967296; return x / 4294967296; }; }
const near = (a, b, tol, msg) => assert.ok(typeof a === 'number' && Math.abs(a - b) <= tol, (msg || 'value') + ': ' + a + ' is not within ' + tol + ' of ' + b);
function film(opts = {}) {
  const w = world({ config: opts.config });
  Object.assign(w, { d: opts.d || 1 / 24, k: 0, made: 0, lost: 0, shown: 0, lag: opts.lag || 0, queue: opts.queue == null ? 16 : opts.queue, pick: opts.pick || (() => 'show'),
    expected: opts.expected !== false, rafAlive: true, docHidden: false, offscreen: false, pip: false, ready: 4, rate: undefined, stalled: false, cbOff: null, rvfcFlag: opts.rvfcFlag !== false, rafAt: (at) => at - 8 });
  w.play = (ms) => {
    for (let x = 0; x < ms; x += 250) {
      const t0 = w.t, w0 = w.now;
      w.now += 250;
      if (!w.paused && !w.seeking && !w.stalled) {
        w.t = t0 + 0.25;
        while ((w.k + 1) * w.d - w.queue / 1000 + w.lag <= w.t + 1e-9) {
          w.k += 1;
          const pts = w.k * w.d, tc = pts - w.queue / 1000 + w.lag, at = Math.max(w0, w0 + (tc - t0) * 1000), v = w.pick(w.k, at);
          if (v === 'skip') continue;
          w.made += 1;
          if (v === 'drop') { w.lost += 1; continue; }
          if (w.cbOff && w.cbOff(at)) continue;
          w.shown += 1;
          w.core.frame(pts, Math.max(t0, tc), at, w.expected ? at + w.queue : undefined, w.rafAt(at));
        }
      }
      w.core.sample({ now: w.now, t: w.t, paused: w.paused, seeking: w.seeking, ended: w.ended, ready: w.ready, rate: w.rate, hasVideo: true, ahead: 20,
        hidden: w.hidden || w.docHidden || w.offscreen || w.pip || !w.rafAlive, docHidden: w.docHidden, offscreen: w.offscreen, pip: w.pip, raf: w.rafAlive,
        frames: w.shown, dropped: w.lost, totalFrames: w.made, rvfc: w.rvfcFlag });
    }
  };
  w.seekTo = (sec) => { w.seeking = true; w.core.event('user-seek', w.now, { t: sec }); w.play(500); w.seeking = false; w.t = sec; w.k = Math.floor(sec / w.d); };
  return w;
}
const none = (w, ...types) => types.forEach((ty) => assert.strictEqual(w.kinds(ty).length, 0, 'no ' + ty + ' event'));
const onlyStart = (w) => assert.deepStrictEqual(w.actions.map((a) => a.type), ['set-source'], 'report only: the core did nothing but start the source');

test('A-022 rate: a healthy 24 a second film reads 24 file / 24 decoded / 24 shown, nothing dropped, and nothing is said', () => {
  const w = film(); w.load(); w.play(40000);
  const s = w.core.summary();
  assert.strictEqual(s.avMeasure, 'per-frame');
  near(s.sourceFps, 24, 0.1, 'file rate'); near(s.presentedFps, 24, 0.6, 'shown'); near(s.decodedFps, 24, 0.6, 'decoded'); near(s.fpsRatio, 1, 0.03, 'ratio');
  assert.strictEqual(s.droppedShare, 0);
  near(s.meanPresentedFps, 24, 0.6, 'episode average shown'); near(s.meanDecodedFps, 24, 0.6, 'episode average decoded'); assert.strictEqual(s.meanDroppedShare, 0);
  assert.deepStrictEqual([s.hitches, s.avlags, s.longestHitchMs, s.lowfps, s.decodelags, s.throttles], [0, 0, 0, 0, 0, 0]);
  assert.strictEqual(s.sourceFpsBasis, 'estimate from the frames shown', 'the file rate says what it is'); assert.ok(!('lowsourcefps' in s), 'there is no claim about the file');
  assert.ok(s.maxAvGapMs < 60, 'a normal stream shows a small gap: ' + s.maxAvGapMs);
  none(w, 'lowfps', 'decodelag', 'hitch', 'avlag', 'throttle'); onlyStart(w);
});

test('A-022 rate: steps of 50/1199 s with two of every three frames missing still read the file at 23.98', () => {
  const rnd = lcg(11), w = film({ d: 50 / 1199, pick: () => (rnd() < 1 / 3 ? 'show' : 'skip') }); w.load(); w.play(60000);
  near(w.core.summary().sourceFps, 23.98, 0.1, 'file rate with 2 of 3 frames missing'); near(w.core.timing().sourceFps, 23.98, 0.1, 'in timing()');
  near(w.core.summary().presentedFps, 8, 1.5, 'shown');
  assert.strictEqual(w.core.timing().sourceFpsBasis, 'estimate from the frames shown'); // an estimate, never a statement about the file
});

test('A-022 rate: the file rate is not reported before enough steps, and starts afresh for a different copy', () => {
  const w = film(); w.load(); w.play(500);
  assert.strictEqual(w.core.timing().sourceFps, null, 'a handful of frames is not enough to say');
  w.play(20000); near(w.core.timing().sourceFps, 24, 0.1);
  w.core.event('error', w.now, { code: 3 }); // a decode error: on to the other copy
  assert.strictEqual(w.core.timing().sourceFps, null, 'a new copy is measured afresh');
  const other = film({ d: 1 / 30 }); other.load(); other.play(20000); near(other.core.timing().sourceFps, 30, 0.1);
});

test('A-022 lowfps: shown frames under 60 percent of the file rate for 10 s of steady play say so once, with both figures', () => {
  const rnd = lcg(5), w = film({ pick: () => (rnd() < 0.4 ? 'show' : 'skip') }); w.load(); w.play(60000);
  const e = w.kinds('lowfps');
  assert.strictEqual(e.length, 1, 'once, however long it lasts');
  near(e[0].sourceFps, 24, 0.2, 'file'); near(e[0].presentedFps, 9.6, 1.5, 'shown');
  assert.strictEqual(w.core.summary().lowfps, 1); onlyStart(w);
  const t = e[0].at - w.kinds('started')[0].at; assert.ok(t >= 10000, 'not before 10 s of steady play: ' + t);
});

test('A-022 lowfps: a film shown at 80 percent of its rate is left alone, and so is one that is slow only for 6 s', () => {
  const rnd = lcg(9), a = film({ pick: () => (rnd() < 0.8 ? 'show' : 'skip') }); a.load(); a.play(60000); none(a, 'lowfps'); near(a.core.summary().fpsRatio, 0.8, 0.08, 'shown over file');
  const b = film({ pick: (k, at) => (at > 21000 && at < 27000 && k % 3 ? 'skip' : 'show') }); b.load(); b.play(60000); none(b, 'lowfps');
});

test('A-022 estimate: a film that seems to hold 7.5 frames a second reads 7.5 as an estimate, and the page claims nothing about the file', () => {
  const w = film({ d: 1 / 7.5 }); w.load(); w.play(40000);
  near(w.core.summary().sourceFps, 7.5, 0.1, 'the estimate'); assert.strictEqual(w.core.summary().sourceFpsBasis, 'estimate from the frames shown');
  near(w.core.summary().presentedFps, 7.5, 0.4); near(w.core.summary().decodedFps, 7.5, 0.4); near(w.core.summary().fpsRatio, 1, 0.05);
  assert.ok(!w.events.some((e) => e.type === 'lowsourcefps'), 'no event blames the file: the page cannot tell a file with few frames from a browser that skipped them');
  assert.ok(!('LOWSRC_FPS' in VoidCore.DEFAULTS), 'and there is no setting for it');
  none(w, 'lowfps', 'decodelag', 'hitch', 'avlag'); assert.strictEqual(w.core.summary().hitches, 0, 'a slow film is not 7 hitches a second'); onlyStart(w);
});

test('A-022 estimate: a browser that drops or silently skips frames reads a low estimate, and the page does not blame the file', () => {
  const a = film({ pick: (k) => (k % 3 ? 'drop' : 'show') }); a.load(); a.play(60000); // every third frame shown, the rest counted as dropped
  near(a.core.summary().sourceFps, 8, 0.1, 'all the steps can show is 8 a second: the limit of reading the rate from the steps');
  assert.strictEqual(a.kinds('decodelag').length, 1, 'the dropped share says the browser fell behind'); assert.ok(!a.events.some((e) => e.type === 'lowsourcefps'));
  const b = film({ pick: (k) => (k % 3 ? 'skip' : 'show') }); b.load(); b.play(60000); // the same, but the missing frames are not counted anywhere (the Marco Polo case)
  near(b.core.summary().sourceFps, 8, 0.1); near(b.core.summary().decodedFps, 8, 0.4); assert.strictEqual(b.core.summary().droppedShare, 0);
  assert.ok(!b.events.some((e) => e.type === 'lowsourcefps' || e.type === 'lowfps' || e.type === 'decodelag'), 'nothing in the page can tell this from a file that really holds 8: it says nothing about the file');
  const c = film({ pick: () => 'skip' }); c.load(); c.play(30000); none(c, 'lowfps', 'decodelag'); // nothing shown at all: nothing to say
});

test('A-022 decodelag: a window with 34 percent of its frames dropped for 10 s fires once, with the four figures, and does nothing else', () => {
  const w = film({ pick: (k) => (k % 3 === 0 ? 'drop' : 'show') }); w.load(); w.play(8000);
  none(w, 'decodelag'); w.play(40000);
  const e = w.kinds('decodelag');
  assert.strictEqual(e.length, 1, 'once');
  near(e[0].droppedShare, 0.333, 0.04, 'dropped share'); near(e[0].decodedFps, 24, 1, 'decoded'); near(e[0].presentedFps, 16, 1.5, 'shown'); near(e[0].sourceFps, 24, 0.2, 'file');
  none(w, 'lowfps'); // 16 of 24 is above 60 percent
  assert.strictEqual(w.core.summary().decodelags, 1); onlyStart(w);
});

test('A-022 decodelag: a steady 0.8 percent dropped, however long, says nothing', () => {
  const w = film({ pick: (k) => (k % 125 === 0 ? 'drop' : 'show') }); w.load(); w.play(120000);
  none(w, 'decodelag'); near(w.core.summary().droppedShare, 0.008, 0.004);
});

test('A-022 decodelag: the soak shape (a third of the frames dropped, a quarter of the file made, a sixth shown) reads as the browser falling behind', () => {
  // two frames shown, one dropped, the rest never made, every 12 frames: file 24, made 6, shown 4, dropped a third of the made
  const w = film({ pick: (k) => (k % 12 < 2 ? 'show' : k % 12 === 6 ? 'drop' : 'skip') }); w.load(); w.play(120000);
  const e = w.kinds('decodelag'); assert.strictEqual(e.length, 1);
  near(e[0].decodedFps, 6, 1, 'decoded'); near(e[0].droppedShare, 0.333, 0.05, 'dropped'); near(e[0].presentedFps, 4, 0.8, 'shown'); near(e[0].sourceFps, 24, 0.5, 'file');
  assert.strictEqual(w.kinds('lowfps').length, 1, 'shown is far under the file rate too');
  near(w.core.summary().sourceFps, 24, 0.5, 'and the estimate still reads 24 from the steps that were shown');
  assert.ok(w.core.summary().minutesBehind >= 1, 'every minute decoded far under the file rate'); onlyStart(w);
});

// What counts as steady playing. Each case plays a bad stretch while the condition holds and a clean stretch after: the
// bad stretch must leave no mark. The control (the same bad stretch with the condition off) must fire, so the case proves
// the exclusion, not that the measure is dead. A short hold time makes a brief stretch enough to fire.
const FAST = { DECODELAG_MS: 1500, RATE_MIN_MS: 1500, AVLAG_HOLD_MS: 600 };
const NOT_STEADY = {
  hidden: (w, on) => { w.docHidden = on; }, 'off screen': (w, on) => { w.offscreen = on; }, 'picture in picture': (w, on) => { w.pip = on; },
  'page not drawing': (w, on) => { w.rafAlive = !on; }, waiting: (w, on) => { w.ready = on ? 2 : 4; }, 'speed 1.5': (w, on) => { w.rate = on ? 1.5 : undefined; },
};
function stretch(cond) { // the bad stretch is 6 s of dropped frames with the picture 0.4 s behind; the clean one 20 s
  const w = film({ config: FAST, pick: (k) => (w.bad && k % 2 ? 'drop' : 'show') });
  w.bad = false; w.load(); w.play(9000);
  if (cond) cond(w, true);
  w.bad = true; w.lag = 0.4; w.play(6000); w.bad = false; w.lag = 0;
  if (cond) cond(w, false);
  w.play(20000);
  return w;
}
test('A-022 steady only: with no excuse the bad stretch is caught (the control for the cases below)', () => {
  const w = stretch(null);
  assert.ok(w.kinds('decodelag').length >= 1 && w.kinds('avlag').length >= 1, 'both fire');
});
for (const [name, fn] of Object.entries(NOT_STEADY)) {
  test('A-022 steady only: not while ' + name + ': no lag, hitch or dropped-frame mark is made', () => {
    const w = stretch(fn);
    none(w, 'decodelag', 'avlag', 'hitch'); onlyStart(w);
    const s = w.core.summary(); assert.strictEqual(s.avlags, 0); assert.strictEqual(s.decodelags, 0);
  });
}
test('A-022 steady only: not in the first seconds after the start, after a seek, or after a resume', () => {
  const quick = (w) => { w.lag = 0.4; };
  const a = film({ config: FAST, lag: 0.4 }); a.load(); a.play(4400); none(a, 'avlag'); // settle 2.5 s then 2 s of steady before anything counts
  a.play(4000); assert.ok(a.kinds('avlag').length >= 1, 'then it does');
  const b = film({ config: FAST }); b.load(); b.play(10000); b.seekTo(600); quick(b); b.play(3000); none(b, 'avlag'); b.play(5000); assert.ok(b.kinds('avlag').length >= 1);
  const c = film({ config: FAST }); c.load(); c.play(10000); c.paused = true; c.core.event('user-pause', c.now); c.play(3000); c.paused = false; c.core.event('user-play', c.now); quick(c); c.play(2400); none(c, 'avlag'); c.play(4000); assert.ok(c.kinds('avlag').length >= 1);
});

test('A-022 avlag: the picture 0.4 s behind the sound for a second is counted with its gap, and nothing is done about it', () => {
  const w = film({ lag: 0.4 }); w.load(); w.play(30000);
  const e = w.kinds('avlag');
  assert.ok(e.length >= 1 && e.length <= 3, 'once, then again at most every 10 s: ' + e.length);
  near(e[0].gap, 0.4, 0.03, 'gap in the event'); near(w.core.summary().maxAvGapMs, 400, 30, 'largest gap');
  assert.strictEqual(w.core.summary().avlags, e.length);
  assert.strictEqual(w.core.summary().drifts, 0, 'under the 0.45 s level that acts'); none(w, 'freeze'); onlyStart(w);
  const g = w.core.timing().gaps; assert.strictEqual(g.length, 30, 'the last 30 readings, for the viewer stamp'); near(g[29], 0.4, 0.03);
});

test('A-022 avlag: 0.2 s behind is left alone; a 0.6 s burst is not held long enough; the picture ahead of the sound counts', () => {
  const a = film({ lag: 0.2 }); a.load(); a.play(30000); none(a, 'avlag');
  const b = film(); b.load(); b.play(10000); b.lag = 0.4; b.play(600); b.lag = 0; b.play(10000); none(b, 'avlag');
  const c = film({ lag: -0.4 }); c.load(); c.play(30000); assert.ok(c.kinds('avlag').length >= 1); near(c.kinds('avlag')[0].gap, -0.4, 0.03);
});

test('A-022 avlag: the display delay is allowed for (a deep queue is not lag); without it the same stream would read 0.3 s', () => {
  const a = film({ queue: 300 }); a.load(); a.play(30000); none(a, 'avlag'); assert.ok(a.core.summary().maxAvGapMs < 60);
  const b = film({ queue: 300, expected: false }); b.load(); b.play(30000); assert.ok(b.kinds('avlag').length >= 1, 'with no expectedDisplayTime the old reading is all there is');
});

test('A-022 hitch: a frame 400 ms late while the sound ran is counted and reported once; it is not a freeze and nothing is done', () => {
  const w = film({ pick: (k, at) => (at >= 21000 && at < 21400 ? 'skip' : 'show') }); w.load(); w.play(40000);
  const s = w.core.summary(), e = w.kinds('hitch');
  assert.strictEqual(s.hitches, 1); assert.strictEqual(e.length, 1); near(s.longestHitchMs, 440, 40); near(e[0].ms, 440, 40);
  assert.strictEqual(s.freezes, 0); onlyStart(w); near(w.core.timing().hitches[0].ms, 440, 40);
});

test('A-022 hitch: not counted when the clock did not move, nor when it is a freeze or a throttle (over 1 s)', () => {
  const a = film(); a.load(); a.play(20000); a.stalled = true; a.play(500); a.stalled = false; a.play(10000);
  assert.strictEqual(a.core.summary().hitches, 0, 'the sound stood still too: a stall, not a hitch');
  const b = film({ pick: (k, at) => (at >= 21000 && at < 22800 ? 'skip' : 'show') }); b.load(); b.play(40000);
  assert.strictEqual(b.core.summary().hitches, 0); assert.strictEqual(b.kinds('freeze').length, 1, 'the old freeze check takes it');
});

test('A-022 hitch: a slow file (3 a second) is not all hitches; events are limited, every hitch is still counted', () => {
  const a = film({ d: 1 / 3 }); a.load(); a.play(40000); assert.strictEqual(a.core.summary().hitches, 0);
  const gap = (k, at) => (at % 4000 < 1000 && at > 20000 && at % 4000 >= 600 ? 'skip' : 'show');
  const b = film({ config: { HITCH_EMIT_MS: 60000 }, pick: gap }); b.load(); b.play(60000);
  assert.ok(b.core.summary().hitches >= 3, 'counted: ' + b.core.summary().hitches); assert.strictEqual(b.kinds('hitch').length, 1, 'one event in the limit');
  const c = film({ pick: gap }); c.load(); c.play(60000); assert.strictEqual(c.kinds('hitch').length, c.core.summary().hitches, 'by default one a second at most, which these are');
});

test('A-022 no measure: a browser with no per-frame timing reports the sync and hitch figures as unavailable, never zero', () => {
  const w = world(); w.load(); w.run(40000); // the old way: samples only, no frame callbacks, no rvfc flag
  const s = w.core.summary();
  assert.strictEqual(s.avMeasure, 'unavailable');
  for (const k of ['avlags', 'maxAvGapMs', 'hitches', 'longestHitchMs', 'presentedFps', 'fpsRatio', 'meanPresentedFps', 'throttles', 'throttledMs']) assert.strictEqual(s[k], null, k + ' is null, not 0');
  near(s.decodedFps, 24, 1, 'the decoder count still works without frame timing'); assert.strictEqual(s.droppedShare, 0);
  none(w, 'lowfps', 'hitch', 'avlag', 'throttle');
  const f = film({ rvfcFlag: true }); f.load(); f.play(500); assert.strictEqual(f.core.summary().avMeasure, 'per-frame'); assert.strictEqual(f.core.summary().avlags, 0, 'with the feed, zero means zero');
});

test('A-022 minutes: a steady minute with decoded frames under 90 percent of the file rate counts as behind, a healthy one does not', () => {
  const rnd = lcg(21), a = film({ pick: () => (rnd() < 0.6 ? 'show' : 'skip') }); a.load(); a.play(240000);
  const s = a.core.summary(); assert.ok(s.minutesMeasured >= 3, 'measured ' + s.minutesMeasured); assert.strictEqual(s.minutesBehind, s.minutesMeasured);
  const h = film(); h.load(); h.play(240000); assert.ok(h.core.summary().minutesMeasured >= 3); assert.strictEqual(h.core.summary().minutesBehind, 0);
});

test('A-022 user press: Out of sync? is counted in the summary and the decisions', () => {
  const w = film(); w.load(); w.play(5000); w.core.event('user-avsync', w.now); w.core.event('user-avsync', w.now + 20000);
  assert.strictEqual(w.core.summary().outOfSyncPresses, 2); assert.ok(w.core.log.some((e) => e.did === 'user-avsync'));
  w.load(); assert.strictEqual(w.core.summary().outOfSyncPresses, 0, 'a new episode starts from zero');
});

// ---------- Throttled stretches: the browser stopped calling for frames while the sound ran on a visible page ----------
function throttled(setup, ms = 2000) { // 20 s of play, then `ms` with no frame callbacks (the sound runs on), then 20 s more
  const w = film(); setup && setup(w); w.load(); w.play(20000); w.cbOff = () => true; if (w._during) w._during(w, true); w.play(ms); w.cbOff = null; if (w._during) w._during(w, false); w.play(20000); return w;
}
test('A-022 throttle: no frame callbacks for 2 s while the sound ran on a visible page is logged, with the page drawing or not', () => {
  const a = throttled(); const e = a.kinds('throttle'); assert.strictEqual(e.length, 1);
  near(e[0].ms, 2000, 300); assert.strictEqual(e[0].raf, 'alive', 'the page kept drawing: only the video was held back');
  assert.strictEqual(a.core.summary().throttles, 1); near(a.core.summary().throttledMs, 2000, 300); assert.strictEqual(a.core.summary().throttlesPageWide, 0);
  assert.strictEqual(a.core.timing().throttles.length, 1);
  const b = throttled((w) => { w._during = (x, on) => { x.rafAlive = !on; }; });
  assert.strictEqual(b.kinds('throttle').length, 1); assert.strictEqual(b.kinds('throttle')[0].raf, 'paused', 'drawing stopped too: the whole page was throttled'); assert.strictEqual(b.core.summary().throttlesPageWide, 1);
  const c = throttled((w) => { w.rafAt = (at) => (at > 21000 && at < 23500 ? 20500 : at - 8); }, 1250); // no sample saw it, but the drawing beat was stale when the frames came back
  assert.strictEqual(c.kinds('throttle').length, 1); assert.strictEqual(c.kinds('throttle')[0].raf, 'paused');
  const d = throttled(null, 1250); assert.strictEqual(d.kinds('throttle')[0].raf, 'alive', 'the same gap with the drawing beat fresh');
  assert.strictEqual(d.core.summary().freezes, 0, 'under the freeze time, so only the log sees it');
});

test('A-022 throttle: while it happens the timing says throttled, and its time reaches no hitch, lag or dropped-frame figure', () => {
  const w = film(); w.load(); w.play(20000); w.cbOff = () => true; w.play(1500);
  assert.strictEqual(w.core.timing().throttled, true, 'throttled right now'); assert.strictEqual(w.core.timing().steady, false);
  w.cbOff = null; w.play(500);
  assert.strictEqual(w.core.timing().throttled, false); assert.strictEqual(w.core.timing().steady, false, 'the windows start again after it');
  w.play(3000); assert.strictEqual(w.core.timing().steady, true, 'and steady play is measured again a little later');
  const hid = film(); hid.load(); hid.play(20000); hid.docHidden = true; hid.cbOff = () => true; hid.play(1500);
  assert.strictEqual(hid.core.timing().throttled, false, 'a hidden page is not throttled, it is hidden');
  const t = throttled(); assert.strictEqual(t.core.summary().hitches, 0, 'a 2 s gap is not also a hitch'); assert.strictEqual(t.core.summary().avlags, 0);
  const g = film({ config: FAST, pick: (k, at) => (at >= 21000 && at < 27000 && k % 2 ? 'drop' : 'show') }); g.load(); g.play(60000); // half the frames dropped for 6 s, the other half still shown: no gap, so it counts
  assert.strictEqual(g.kinds('throttle').length, 0); assert.strictEqual(g.kinds('decodelag').length, 1);
});

test('A-022 throttle: not when the page was hidden, off screen or in picture-in-picture, when the clock stood still, or without frame timing', () => {
  for (const [name, on] of [['hidden', (w, v) => { w.docHidden = v; }], ['off screen', (w, v) => { w.offscreen = v; }], ['picture in picture', (w, v) => { w.pip = v; }]]) {
    const w = throttled((x) => { x._during = on; }); assert.strictEqual(w.kinds('throttle').length, 0, name); assert.strictEqual(w.core.summary().throttles, 0, name);
  }
  const s = film(); s.load(); s.play(20000); s.stalled = true; s.play(2000); s.stalled = false; s.play(5000); assert.strictEqual(s.kinds('throttle').length, 0, 'sound and picture both stopped: a stall');
  const h = film(); h.load(); h.play(20000); h.core.event('away', h.now); h.play(1000); h.cbOff = () => true; h.play(2000); h.cbOff = null; h.play(5000); // an off-screen blip the page told the core about, then frames, then the gap
  assert.strictEqual(h.kinds('throttle').length, 1, 'an away mark from before the gap does not hide it');
  const i = film(); i.load(); i.play(20000); i.cbOff = () => true; i.play(1000); i.core.event('away', i.now); i.play(1000); i.cbOff = null; i.play(5000);
  assert.strictEqual(i.kinds('throttle').length, 0, 'an away mark inside the gap does');
  const n = world(); n.load(); n.run(30000); none(n, 'throttle');
});

test('A-022 counters: a video element that starts its frame counts again mid-play does not corrupt the averages', () => {
  const w = film(); w.load(); w.play(30000); w.made = 0; w.lost = 0; w.play(30000);
  const s = w.core.summary();
  near(s.meanDecodedFps, 24, 1.5, 'average decoded'); assert.ok(s.meanDroppedShare >= 0 && s.meanDroppedShare < 0.05, 'dropped share ' + s.meanDroppedShare); near(s.decodedFps, 24, 1, 'window');
});

test('A-022 throttle: a gap just over a second that no sample saw is still logged, and the windows start again after it', () => {
  const w = film({ pick: () => 'show' }); w.cbOff = (at) => at >= 21030 && at < 22130; w.load(); w.play(21500);
  assert.strictEqual(w.core.summary().throttles, 1, 'logged when the frames came back: ' + JSON.stringify(w.events.filter((e) => e.type === 'throttle')));
  assert.strictEqual(w.core.timing().steady, false, 'and the windows began again');
  assert.strictEqual(w.core.summary().hitches, 0, 'it is not also a hitch');
});
