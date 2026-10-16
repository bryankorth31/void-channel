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
  const w = { core, events, actions, now: 1000, t: 0, frames: 0, paused: false, seeking: false, ended: false, hidden: false, hasVideo: true, useFrames: opts.useFrames !== false, rvfc: !!opts.rvfc };
  w.load = (srcs = SOURCES, at = 0) => { core.load(srcs, at, w.now, true); };
  // Advance time. mode: 'play' (picture and sound move), 'freeze' (sound moves, no frames), 'stall' (nothing moves),
  // 'drift' (frames arrive but lag the sound by `lag` seconds; needs rvfc).
  w.run = (ms, mode = 'play', lag = 0) => {
    for (let x = 0; x < ms; x += 250) {
      w.now += 250;
      if (!w.paused && !w.seeking && mode !== 'stall') w.t += 0.25;
      if (!w.paused && !w.seeking && (mode === 'play' || mode === 'drift')) {
        w.frames += 6;
        if (w.rvfc) for (let k = 0; k < 6; k++) core.frame(w.t - lag - 0.03, w.t, w.now);
      }
      core.sample({ now: w.now, t: w.t, paused: w.paused, seeking: w.seeking, ended: w.ended, ready: 4, hidden: w.hidden, hasVideo: w.hasVideo, frames: w.useFrames ? w.frames : undefined, dropped: 0, totalFrames: w.frames, ahead: 20 });
    }
  };
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
