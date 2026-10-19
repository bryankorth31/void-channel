// Tests for the page side of the VOID player (player.js): what load() does around the Archive server lookup, and
// when the end-of-play summary is sent. Run:  node --test "player/test/*.test.js"
// The real core.js and player.js run in a bare vm with a fake page (a proxy that answers every DOM call, plus a
// recording <video>) and a fetch that the test answers when it says so. No network, no browser, nothing is played.
const { test, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8').replace(/\r\n/g, '\n');
const BUNDLE = ['core.js', 'icons.js', 'player.js'].map(read).join('\n;\n');

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

const file = (n, tag) => ({ url: 'https://archive.org/download/item' + (tag || '') + n + '/f' + n + '.mp4', item: 'item' + (tag || '') + n, path: 'f' + n + '.mp4', format: 'MPEG4' });
const episode = (id, n, tag) => ({ id, title: id, show: 'Show', files: Array.from({ length: n || 1 }, (_, i) => file(i + 1, tag)) }); // a tag gives the episode items of its own, so its lookup is not answered from the cache

// The real player in a fake page. `cached` maps an item to server info already in the session cache.
function open(opts) {
  opts = opts || {};
  const seen = { src: [], play: 0, removed: 0 }, events = [], asked = [], pending = [];
  const video = fakeNode({
    paused: true, ended: false, readyState: 0, networkState: 0, volume: 1, muted: false, currentTime: 0, duration: NaN, buffered: { length: 0 }, playbackRate: 1,
    seeking: false, videoWidth: 0, textTracks: [], getVideoPlaybackQuality: undefined, requestVideoFrameCallback: undefined,
    play() { seen.play++; return Promise.resolve(); }, pause() {}, load() {},
    getAttribute(k) { return k === 'src' && seen.src.length ? seen.src[seen.src.length - 1] : null; },
    removeAttribute(k) { if (k === 'src') seen.removed++; }, canPlayType() { return 'maybe'; }, addEventListener() {}, removeEventListener() {}, querySelectorAll() { return []; },
  }, (k, v) => { if (k === 'src') seen.src.push(v); });
  const rootNode = fakeNode({ querySelector: (sel) => (sel === 'video' ? video : fakeNode()), querySelectorAll: () => [], remove() {} });
  const ctx = {
    document: { createElement: () => rootNode, activeElement: null, fullscreenElement: null, hidden: false, addEventListener() {}, removeEventListener() {} },
    navigator: { userAgent: 'test', hardwareConcurrency: 4 }, screen: { width: 1, height: 1 }, performance,
    localStorage: { getItem: () => null, setItem() {} },
    sessionStorage: { getItem: (k) => (opts.cached && opts.cached[k.replace('voidplayer:srv:', '')]) ? JSON.stringify(Object.assign({ at: Date.now() }, opts.cached[k.replace('voidplayer:srv:', '')])) : null, setItem() {} },
    setTimeout, clearTimeout, setInterval, clearInterval, AbortController, requestAnimationFrame: () => 1, cancelAnimationFrame() {}, addEventListener() {}, removeEventListener() {}, devicePixelRatio: 1,
    // The Archive's metadata API: item2 lives on another host than the rest, so a test can tell whose servers were used.
    // A lookup that is aborted (the player's time limit) rejects, as a real fetch does.
    fetch: (url, init) => new Promise((resolve, reject) => {
      asked.push(url);
      if (init && init.signal) init.signal.addEventListener('abort', () => reject(new Error('aborted')));
      const item = (/metadata\/([^/]+)\//.exec(url) || [])[1] || 'x', host = item === 'item2' ? 'ia800002.us.archive.org' : 'ia800000.us.archive.org';
      pending.push((ok) => resolve(ok ? { ok: true, json: async () => (/dir$/.test(url) ? { result: '/1/items/' + item } : { result: [host] }) } : { ok: false, json: async () => null }));
    }),
  };
  ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(BUNDLE, ctx);
  const player = ctx.VoidPlayer.create(fakeNode(), { resolveServers: true, metadataTimeoutMs: opts.timeout || 5000, onEvent: (e) => events.push(e) });
  const settle = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r)); };
  const answer = async (ok) => { pending.splice(0).forEach((f) => f(ok !== false)); await settle(); };
  const x = { player, seen, events, asked, answer, settle, kinds: (t) => events.filter((e) => e.type === t) };
  opened.push(x);
  return x;
}
const opened = [];
afterEach(() => { for (const x of opened.splice(0)) { try { x.player.destroy(); } catch (e) { /* already destroyed */ } } }); // a failed test must not leave the player's timer running
const J = (v) => JSON.parse(JSON.stringify(v)); // arrays made inside the vm are not the same realm as the test's
// Give the core some play time (as if it had been watched), so a summary carries figures that tell episodes apart.
function watch(player, seconds) {
  const t0 = performance.now(); let t = 0;
  for (let i = 0; i <= seconds * 4; i++) { t += 0.25; player.core.sample({ now: t0 + i * 250, t, paused: false, seeking: false, ended: false, ready: 4, hidden: false, hasVideo: true, frames: i * 6, dropped: 0, totalFrames: i * 6, ahead: 20 }); }
}

test('SP-026: the first source starts when the first copy\'s lookup answers; only that lookup is asked', async () => {
  const x = open(); x.player._ctx = { slug: 'a' };
  x.player.load(episode('a/1x1', 3), { autoplay: true });
  await x.settle();
  assert.strictEqual(x.asked.length, 2, 'workable_servers and dir for the first copy only (not for copies 2 and 3)');
  assert.ok(x.asked.every((u) => u.includes('item1')));
  assert.strictEqual(x.seen.src.length, 0, 'nothing starts before the answer');
  await x.answer(true);
  assert.strictEqual(x.seen.src.length, 1);
  assert.ok(x.seen.src[0].includes('ia800000.us.archive.org'), 'the first source is the first copy on its primary server');
  assert.deepStrictEqual(J(x.kinds('load')[0].sources), ['copy1@primary', 'copy1@archive', 'copy2@archive', 'copy3@archive'], 'later copies get the Archive link only');
  x.player.destroy();
});

test('SP-026: a later copy whose servers are already in the session cache keeps them (no network)', async () => {
  const x = open({ cached: { item2: { hosts: ['ia800001.us.archive.org'], dir: '/2/items/item2' } } });
  x.player.load(episode('a/1x1', 2), { autoplay: true });
  await x.settle(); await x.answer(true);
  assert.deepStrictEqual(J(x.kinds('load')[0].sources), ['copy1@primary', 'copy1@archive', 'copy2@primary', 'copy2@archive']);
  assert.strictEqual(x.asked.length, 2, 'still only the first copy was looked up');
  x.player.destroy();
});

test('SP-026: when the first lookup fails the player says so once and starts on the Archive link', async () => {
  const x = open(); x.player.load(episode('a/1x1', 1), { autoplay: true });
  await x.settle(); await x.answer(false);
  assert.strictEqual(x.kinds('lookup-failed').length, 1);
  assert.strictEqual(x.kinds('lookup-failed')[0].item, 'item1');
  assert.strictEqual(x.seen.src.length, 1);
  assert.ok(x.seen.src[0].startsWith('https://archive.org/download/item1/'));
  x.player.destroy();
});

test('SP-026: a player destroyed during the lookup never gets a source, never plays, and says nothing', async () => {
  const x = open(); x.player.load(episode('a/1x1', 1), { autoplay: true });
  await x.settle();
  x.player.destroy();
  await x.answer(false); // the Archive answers late (and badly)
  assert.deepStrictEqual(J(x.seen.src), []);
  assert.strictEqual(x.seen.play, 0);
  assert.strictEqual(x.kinds('lookup-failed').length, 0, 'a destroyed player reports no lookup');
  assert.strictEqual(x.kinds('load').length, 0);
  assert.strictEqual(x.kinds('summary').length, 0, 'nothing played, so no end-of-play figures either (the core never held this episode)');
});

test('SP-026: a load that a newer load replaced stays silent and the newer one starts', async () => {
  const x = open(); x.player.load(episode('a/1x1', 1), { autoplay: true }); await x.settle();
  x.player.load(episode('b/1x1', 1), { autoplay: true }); await x.settle();
  await x.answer(false); // both lookups fail
  assert.strictEqual(x.kinds('lookup-failed').length, 1, 'only the load that is still current says its lookup failed');
  assert.deepStrictEqual(J(x.kinds('load').map((e) => e.id)), ['b/1x1']);
  assert.strictEqual(x.seen.src.length, 1);
  x.player.destroy();
});

test('SP-020: loading an episode ends an unfinished "Up next" countdown (it would skip the new one 10 s later)', async () => {
  const x = open(); x.player.load(episode('a/1x1', 1), { autoplay: true }); await x.settle(); await x.answer(true);
  const next = x.player.upNext('The next one', 10);
  x.player.load(episode('b/1x1', 1), { autoplay: true });
  assert.strictEqual(await next, false, 'the countdown ended without playing the next episode');
  x.player.destroy();
});

// ---------- the end-of-play summary on a reused player (SP-022) ----------
test('SP-022: a reused player sends the replaced episode\'s summary once, under that episode, with its own figures', async () => {
  const x = open();
  x.player._ctx = { slug: 'a', ep: '1x1' }; x.player.load(episode('a/1x1', 1), { autoplay: true }); await x.settle(); await x.answer(true);
  watch(x.player, 20); // A is watched for 20 s
  x.player._ctx = { slug: 'b', ep: '2x2' }; x.player.load(episode('b/2x2', 1), { autoplay: true }); // the host names the next item first, as Live TV does
  const sums = x.kinds('summary');
  assert.strictEqual(sums.length, 1, 'sent as the next episode loads');
  assert.strictEqual(sums[0].episode, 'a/1x1');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(sums[0].ctx)), { slug: 'a', ep: '1x1' }, 'the ctx the host had put on for A, not the one for B');
  assert.ok(sums[0].summary.watchMs >= 19000, 'figures are the ones from the item that played: ' + sums[0].summary.watchMs);
  await x.settle(); await x.answer(true);
  x.player.destroy();
  const all = x.kinds('summary');
  assert.strictEqual(all.length, 2);
  assert.strictEqual(all[1].episode, 'b/2x2');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(all[1].ctx)), { slug: 'b', ep: '2x2' });
  assert.strictEqual(all[1].summary.watchMs, 0, 'B starts from zero, A\'s figures are not repeated under B');
});

test('SP-022: loads that are replaced during the lookup never send a summary of their own, and never repeat the last one', async () => {
  const x = open();
  x.player._ctx = { slug: 'a' }; x.player.load(episode('a/1x1', 1), { autoplay: true }); await x.settle(); await x.answer(true);
  watch(x.player, 10);
  x.player._ctx = { slug: 'b' }; x.player.load(episode('b/1x1', 1, 'b'), { autoplay: true }); await x.settle(); // lookup pending
  x.player._ctx = { slug: 'c' }; x.player.load(episode('c/1x1', 1, 'c'), { autoplay: true }); await x.settle(); // replaced before it answered
  assert.deepStrictEqual(J(x.kinds('summary').map((e) => e.episode)), ['a/1x1'], 'only A, once: B never played, the core still held A\'s figures');
  x.player.destroy(); // destroyed while C is still waiting for its lookup
  assert.deepStrictEqual(J(x.kinds('summary').map((e) => e.episode)), ['a/1x1'], 'nothing more for C either');
});

test('SP-022: pagehide, ended and destroy together send one summary per episode', async () => {
  const x = open();
  x.player.load(episode('a/1x1', 1), { autoplay: true }); await x.settle(); await x.answer(true); watch(x.player, 5);
  x.player._emitSummary(); x.player._emitSummary(); x.player.destroy();
  assert.strictEqual(x.kinds('summary').length, 1);
});

test('SP-022: loading the same episode object again reports the first play once, then the second under its own figures', async () => {
  const x = open(); const ep = episode('a/1x1', 1);
  x.player.load(ep, { autoplay: true }); await x.settle(); await x.answer(true); watch(x.player, 8);
  x.player.load(ep, { autoplay: true }); await x.settle(); // its lookup is already cached, so the core is reloaded at once
  assert.strictEqual(x.kinds('summary').length, 1);
  assert.ok(x.kinds('summary')[0].summary.watchMs >= 7000);
  x.player.destroy();
  assert.strictEqual(x.kinds('summary').length, 2);
  assert.strictEqual(x.kinds('summary')[1].summary.watchMs, 0, 'the first play is not reported twice');
});

test('SP-022: the same episode object loaded again while its lookup is pending reports nothing extra', async () => {
  const x = open(); const ep = episode('a/1x1', 1, 'z'); // an item of its own: nothing is cached yet
  x.player.load(ep, { autoplay: true }); await x.settle(); await x.answer(true); watch(x.player, 8);
  const ep2 = Object.assign({}, ep, { files: [file(1, 'y')] }); // a new item, so the lookup is pending
  x.player.load(ep2, { autoplay: true }); await x.settle();
  x.player.destroy(); // destroyed while waiting
  assert.strictEqual(x.kinds('summary').length, 1, 'only the play that happened');
});

test('SP-022: a player that never started a load sends no summary', () => {
  const x = open(); x.player.destroy();
  assert.strictEqual(x.kinds('summary').length, 0);
});

// ---------- SP-026: the other copies' servers are looked up the first time the core moves onto the copy ----------
// An episode with two copies. The first press looks up copy 1 only. A decode error on copy 1 makes the core move to
// copy 2, whose servers are then unknown: the player looks them up at that moment.
async function toCopy2(opts) {
  const x = open(opts);
  x.player.load(episode('a/1x1', 2), { autoplay: true });
  await x.settle(); await x.answer(true); // copy 1's lookup answers, copy 1 starts
  assert.strictEqual(x.seen.src.length, 1);
  x.removedBeforeHop = x.seen.removed;
  x.player.core.event('error', performance.now(), { code: 3 }); // copy 1 cannot be decoded: on to copy 2
  await x.settle();
  return x;
}
const lookups = (x, item) => x.asked.filter((u) => u.includes('/' + item + '/')).length;

test('SP-026: a hop to copy 2 looks its servers up then (fast answer): it starts on copy 2\'s primary server', async () => {
  const x = await toCopy2();
  assert.strictEqual(lookups(x, 'item2'), 2, 'copy 2 was looked up when the core moved onto it, not before');
  assert.strictEqual(x.seen.src.length, 1, 'nothing starts until the lookup answers');
  assert.ok(x.seen.removed > x.removedBeforeHop, 'the source being left is dropped at once, not 2.5 s later');
  await x.answer(true);
  assert.strictEqual(x.seen.src.length, 2);
  assert.ok(x.seen.src[1].includes('ia800002.us.archive.org'), 'copy 2 on its own primary server: ' + x.seen.src[1]);
  assert.strictEqual(x.player.core.source.label, 'copy2@primary');
  assert.ok(x.player.core.log.some((e) => e.did === 'servers' && /copy2@primary/.test(e.to)), 'the core was told');
  assert.strictEqual(x.kinds('lookup-failed').length, 0);
});

test('SP-026: while copy 2 is being looked up the core is told the page is between sources, not paused', async () => {
  const x = await toCopy2();
  const told = []; const real = x.player.core.sample;
  x.player.core.sample = (s) => { told.push(s.paused); return real(s); };
  x.player._sample();
  assert.deepStrictEqual(J(told), [false], 'not paused: a pause would wipe the pause measurement and look like the viewer');
  await x.answer(true);
  x.player._sample();
  assert.strictEqual(told[told.length - 1], true, 'once the source is set the video reports as it is');
});

test('SP-026: a slow lookup is given up at the time limit: copy 2 starts on its Archive link and lookup-failed is sent', async () => {
  const x = await toCopy2({ timeout: 60 });
  assert.strictEqual(x.seen.src.length, 1);
  await new Promise((r) => setTimeout(r, 200)); // nobody answers: the player's own limit aborts the lookup
  await x.settle();
  assert.strictEqual(x.seen.src.length, 2, 'the hop was not held back longer than the limit');
  assert.strictEqual(x.seen.src[1], 'https://archive.org/download/item2/f2.mp4');
  assert.strictEqual(x.player.core.source.label, 'copy2@archive');
  assert.deepStrictEqual(J(x.kinds('lookup-failed').map((e) => e.item)), ['item2']);
});

test('SP-026: a failed lookup keeps the Archive link, says so once, and is never asked again (no loop)', async () => {
  const x = await toCopy2();
  await x.answer(false);
  assert.strictEqual(x.seen.src[1], 'https://archive.org/download/item2/f2.mp4');
  assert.strictEqual(x.kinds('lookup-failed').length, 1);
  const asked = x.asked.length;
  x.player.core.event('error', performance.now(), { code: 3 }); // copy 2 fails too: nothing left, the card
  await x.settle(); await x.answer(true);
  assert.strictEqual(x.asked.length, asked, 'no second lookup for copy 2');
  assert.strictEqual(x.kinds('lookup-failed').length, 1);
  assert.strictEqual(x.kinds('failed').length, 1);
  // the viewer presses Try again and copy 1 fails again: copy 2 is entered a second time, and still not looked up again
  x.player.core.event('retry', performance.now()); await x.settle();
  x.player.core.event('error', performance.now(), { code: 3 }); await x.settle(); await x.answer(true);
  assert.strictEqual(x.player.core.source.label, 'copy2@archive');
  assert.strictEqual(x.asked.length, asked, 'the copy is marked done: never looked up twice');
});

test('SP-026: if the core moves on while copy 2 is being looked up (Try again), the late answer starts nothing', async () => {
  const x = await toCopy2();
  x.player.core.event('retry', performance.now()); // back to copy 1, which starts again
  await x.settle();
  const started = x.seen.src.length;
  await x.answer(true); // copy 2's lookup answers late
  assert.strictEqual(x.seen.src.length, started, 'nothing started on top of the source the core is now using');
  assert.strictEqual(x.player.core.source.label, 'copy1@primary');
});

test('SP-026: a player destroyed during the lazy lookup starts nothing, plays nothing, and says nothing', async () => {
  const x = await toCopy2();
  x.player.destroy();
  await x.answer(true);
  assert.strictEqual(x.seen.src.length, 1, 'no source for copy 2 on the detached video');
  assert.strictEqual(x.seen.play, 1, 'only the first copy ever played');
  assert.strictEqual(x.kinds('lookup-failed').length, 0);
  assert.ok(!x.player.core.log.some((e) => e.did === 'servers'), 'the core was not changed either');
});

test('SP-026: a load that replaces the episode during the lazy lookup wins; the old lookup starts nothing', async () => {
  const x = await toCopy2();
  x.player.load(episode('b/1x1', 1, 'b'), { autoplay: true });
  await x.settle(); await x.answer(true);
  assert.strictEqual(x.seen.src.length, 2, 'copy 1 of the old episode, then the new episode; never copy 2 of the old one');
  assert.ok(!x.seen.src.some((u) => u.includes('ia800002')));
  assert.ok(x.seen.src[1].includes('/1/items/itemb1/'), 'the new episode started: ' + x.seen.src[1]);
});

test('SP-026: a later copy that is already in the session cache needs no lookup when the core moves onto it', async () => {
  const x = await toCopy2({ cached: { item2: { hosts: ['ia800002.us.archive.org'], dir: '/2/items/item2' } } });
  assert.strictEqual(lookups(x, 'item2'), 0);
  assert.strictEqual(x.seen.src.length, 2, 'started at once');
  assert.ok(x.seen.src[1].includes('ia800002.us.archive.org'));
});
