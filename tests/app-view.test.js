// Leaving a show page while the Archive lookup runs (review of fix batch B, finding 1). Run: node --test tests/app-view.test.js
// Pressing Play on a show page now starts with a server lookup (Player.load() awaits it), so a viewer can leave the page in that
// gap. killPlayer() in scripts/lib/app.js must make the pending load() give up, otherwise the destroyed player's detached <video>
// still gets a source and one play() call (a ghost that plays on its own). This test runs the REAL player.js and core.js in a bare
// vm with a fake page (a proxy that answers every DOM call, plus a recording <video>) and a fetch that answers when the test says so,
// and the REAL killPlayer text cut out of app.js. No network, no browser, nothing is played.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');
const APP = read('scripts/lib/app.js');
const BUNDLE = ['player/src/core.js', 'player/src/icons.js', 'player/src/player.js'].map(read).join('\n;\n');

const k0 = APP.indexOf('function killPlayer(){');
assert.ok(k0 > 0, 'killPlayer is where this test expects it');
const KILL = APP.slice(k0, APP.indexOf('\n', k0));

// A stand-in for any DOM node: every property is the same stub, every call returns it, a few names are overridden.
function fakeNode(own, onSet) {
  const store = Object.assign({}, own);
  const node = new Proxy(function () {}, {
    get(t, k) {
      if (Object.prototype.hasOwnProperty.call(store, k)) return store[k];
      if (k === Symbol.toPrimitive) return () => 0;
      if (k === 'then') return undefined;
      if (k === 'length') return 0;
      return node;
    },
    set(t, k, v) { store[k] = v; if (onSet) onSet(k, v); return true; },
    apply() { return node; },
  });
  return node;
}

// The real player in a fake page. Returns the player, what its <video> was asked to do, and a way to answer the lookups.
function openPlayer() {
  const seen = { src: [], play: 0, load: 0 };
  const video = fakeNode({
    paused: true, ended: false, readyState: 0, networkState: 0, volume: 1, muted: false, currentTime: 0, duration: NaN, buffered: { length: 0 }, playbackRate: 1,
    seeking: false, videoWidth: 0, textTracks: [], getVideoPlaybackQuality: undefined, requestVideoFrameCallback: undefined,
    play() { seen.play++; return Promise.resolve(); }, pause() {}, load() { seen.load++; },
    getAttribute(k) { return k === 'src' && seen.src.length ? seen.src[seen.src.length - 1] : null; },
    removeAttribute() {}, canPlayType() { return 'maybe'; }, addEventListener() {}, removeEventListener() {}, querySelectorAll() { return []; },
  }, (k, v) => { if (k === 'src') seen.src.push(v); });
  const rootNode = fakeNode({ querySelector: (sel) => (sel === 'video' ? video : fakeNode()), querySelectorAll: () => [], remove() {} });
  const pending = [];
  const ctx = {
    document: { createElement: () => rootNode, activeElement: null, fullscreenElement: null, hidden: false, addEventListener() {}, removeEventListener() {} },
    navigator: { userAgent: 'test', hardwareConcurrency: 4 }, screen: { width: 1, height: 1 }, performance, localStorage: { getItem: () => null, setItem() {} }, sessionStorage: { getItem: () => null, setItem() {} },
    setTimeout, clearTimeout, setInterval, clearInterval, AbortController, requestAnimationFrame: () => 1, cancelAnimationFrame() {}, addEventListener() {}, removeEventListener() {}, devicePixelRatio: 1,
    fetch: (url) => new Promise((resolve) => pending.push(() => resolve({ ok: true, json: async () => (/dir$/.test(url) ? { result: '/1/items/x' } : { result: ['ia800000.us.archive.org'] }) }))),
  };
  ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(BUNDLE, ctx);
  const player = ctx.VoidPlayer.create(fakeNode(), { resolveServers: true, metadataTimeoutMs: 5000 });
  const episode = { id: 'show/1x1', title: 'S01E01', show: 'Show', files: [{ url: 'https://archive.org/download/x/a.mp4', item: 'x', path: 'a.mp4', format: 'MPEG4' }] };
  return { player, seen, pending, episode };
}

// What the page does: killPlayer() from app.js, run against a variable VP that holds the player.
function runKill(killText, player) {
  const ctx = vm.createContext({});
  vm.runInContext('let VP = null;\n' + killText + '\nthis.run = (p) => { VP = p; killPlayer(); return VP; };', ctx);
  return ctx.run(player);
}
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r)); };

async function leaveDuringLookup(killText) {
  const { player, seen, pending, episode } = openPlayer();
  player.load(episode, { startAt: 0, autoplay: true });      // the first press of Play: the lookup is now pending
  await settle();
  assert.ok(pending.length > 0, 'the lookup is waiting for the Archive');
  const left = killText ? runKill(killText, player) : player.destroy();   // the viewer leaves the page now
  pending.splice(0).forEach((answer) => answer());              // the Archive answers late
  await settle();
  return { left, seen };
}

test('leaving the show page during the lookup: the destroyed player never gets a source and never plays', async () => {
  const { left, seen } = await leaveDuringLookup(KILL);
  assert.equal(left, null, 'killPlayer empties the page variable');
  assert.deepEqual(seen.src, [], 'no source was set on the detached video');
  assert.equal(seen.play, 0, 'play() was never called');
});

test('the guard is what stops it: with the player as it is now a plain destroy() leaves a ghost, killPlayer without its guard line would too, with it there is none', async (t) => {
  const guard = /p\._token=\(p\._token\|\|0\)\+1;/;
  assert.ok(guard.test(KILL), 'the guard line is in killPlayer');
  const ghost = (r) => r.seen.src.length > 0 || r.seen.play > 0;
  const plain = ghost(await leaveDuringLookup(null));
  const bare = ghost(await leaveDuringLookup(KILL.replace(guard, '')));
  const guarded = ghost(await leaveDuringLookup(KILL));
  t.diagnostic('plain destroy() ghost: ' + plain + ', killPlayer without the guard: ' + bare + ', with it: ' + guarded);
  assert.equal(guarded, false);
  assert.equal(bare, plain, 'without its guard killPlayer is just destroy()');
  // While player.js lets destroy() leave the load alive (true until the player patch is applied) the guard is the only thing that stops the ghost.
  if (plain) assert.equal(bare, true);
});

test('killPlayer with no player does nothing and a destroy that throws is swallowed', () => {
  const ctx = vm.createContext({});
  vm.runInContext('let VP = null;\n' + KILL + '\nthis.none = () => { killPlayer(); return VP; }; this.thrower = () => { VP = { destroy() { throw new Error("x"); } }; killPlayer(); return VP; };', ctx);
  assert.equal(ctx.none(), null);
  assert.equal(ctx.thrower(), null);
});
