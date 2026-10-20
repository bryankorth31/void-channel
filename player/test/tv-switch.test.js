// Live TV on the site: changing channel keeps the player, so fullscreen survives (batch B, 19 Oct 2026; Bryan: "The channel controls need
// to be on the bar the appears even during full screen to allow switching from full screen"). Run: node --test player/test/tv-switch.test.js
// The REAL Live TV text of scripts/lib/app.js (chanNow, tune, tuneHere, surf, osd, tvPlay, guideRows) runs in a bare vm on made-up channels,
// with a stand-in for the player (it records what it is asked) and for the page. No network, no browser, no video.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const APP = fs.readFileSync(path.join(__dirname, '..', '..', 'scripts', 'lib', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const a = APP.indexOf('const TV_EPOCH=');
const b = APP.indexOf('async function tvPage(){');
assert.ok(a > 0 && b > a, 'the Live TV functions are where this test expects them');
// app.js holds the page script inside a template literal, so \\ in the file is one backslash in the page.
const TV_TEXT = APP.slice(a, b).split('\\\\').join('\\');

class FDate extends Date { static now() { return Date.UTC(2026, 9, 19, 12, 7, 30); } } // the clock stands still, so "what is on now" is the same for the test and the page

function page(opts) {
  opts = opts || {};
  const log = { render: 0, mk: [], loads: [], flashes: [], replaced: [], tracked: [], scrolled: 0, osd: [] };
  const mkShow = (slug, n) => ({ slug, show: 'Show ' + slug, poster: '', seasons: [{ season: 1, episodes: Array.from({ length: 6 }, (_, i) => ({ n: i + 1, name: slug + ' ep ' + (i + 1), item: slug + (i + 1), p: 'f.mp4' })) }] });
  const SHOWS = ['a', 'b', 'c', 'd'].map((s) => mkShow(s));
  const TV = ['one', 'two', 'three', 'four'].map((id, i) => ({ id, name: 'Channel ' + id, kind: 'all', shows: 2, eps: 12, items: [[i % 4, 1, 1, 30], [(i + 1) % 4, 1, 2, 30]] }));
  const guide = { innerHTML: '' }, osd = { innerHTML: '', insertAdjacentHTML() {} };
  let player = null;
  const host = { contains: (el) => !!player && el === player.root };
  const mkPlayer = (h, o) => {
    const p = { root: { id: 'root' + log.mk.length }, v: {}, o, load(ep, lo) { log.loads.push({ id: ep.id, startAt: lo.startAt, autoplay: lo.autoplay }); }, flashChannel(n) { log.flashes.push(n); } };
    log.mk.push(o); player = p; return p;
  };
  const state = Object.assign({ view: 'tv', chan: 'one', tvOn: true, tvFails: 0 }, opts.state);
  const sandbox = {
    setTimeout, state, SHOWS, ME: { adult: false }, SITE: 'voidtv.net', Date: FDate, Math, mkPlayer, vpEvent() {}, filesFor: () => [{ url: 'u' }], esc: (s) => String(s == null ? '' : s),
    ensure: async () => {}, track: (k, d) => log.tracked.push([k, d && d.slug]), urlFor: (s) => '/' + s, render: () => { log.render++; },
    history: { replaceState: (x, y, url) => log.replaced.push(url) }, window: { scrollTo: () => { log.scrolled++; } },
    document: { title: '', querySelector: (sel) => (sel === '.guide' ? (opts.noGuide ? null : guide) : sel === '.osd' ? osd : null) },
    $: (id) => (id === 'vph' && !opts.noHost ? host : null), BASE: '/',
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext('let TV=null,VP=null,TVCUR=null;\n' + TV_TEXT + '\nthis.h={tune,surf,tuneHere,tvPlay,chanNow,get VP(){return VP},set VP(v){VP=v},set TV(v){TV=v},get TVCUR(){return TVCUR}};', ctx);
  ctx.h.TV = TV;
  return { h: ctx.h, log, state, guide, osd, TV, sandbox, getPlayer: () => player, setPlayer: (p) => { player = p; ctx.h.VP = p; } };
}
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };

// The page the viewer is on: Live TV turned on, one channel playing in the one player (what tvPage and tvPlay leave behind).
async function playing() {
  const p = page();
  await p.h.tvPlay(p.TV[0], 0, 0); await settle();
  assert.equal(p.log.mk.length, 1, 'the first channel made the player');
  return p;
}

test('Live TV: ten channel changes with the player on the page never call render() and never make a second player', async () => {
  const p = await playing(); const first = p.getPlayer();
  for (let i = 0; i < 10; i++) { p.h.surf(1); await settle(); }
  assert.equal(p.log.render, 0, 'render() rebuilds the host and drops fullscreen: it must not run');
  assert.equal(p.log.mk.length, 1, 'one player, made once');
  assert.equal(p.getPlayer(), first); assert.equal(p.h.VP, first, 'the same player is still the page\'s player');
  assert.equal(p.log.loads.length, 11, 'eleven items, all loaded into that one player');
  assert.equal(p.log.flashes.length, 10, 'each change flashes the new channel name');
  assert.deepEqual(p.log.flashes.slice(0, 5), ['Channel two', 'Channel three', 'Channel four', 'Channel one', 'Channel two']);
  assert.equal(p.state.chan, 'three', 'ten steps on from the first of four channels');
});

test('Live TV: a change updates the address, the title, the guide and the bar under the video in place, and still counts the tune', async () => {
  const p = await playing();
  p.h.tune('three'); await settle();
  assert.deepEqual(p.log.tracked.filter((t) => t[0] === 'tune'), [['tune', 'three']], 'tune() keeps its tracking');
  assert.deepEqual(p.log.replaced, ['/tv/three']);
  assert.equal(p.state.chan, 'three'); assert.equal(p.state.tvOn, true);
  assert.equal(p.sandbox.document.title, 'Channel three · voidtv.net');
  assert.ok(/class="ch on" onclick="tune\('three'\)"/.test(p.guide.innerHTML), 'the guide marks the new channel: ' + p.guide.innerHTML.slice(0, 120));
  assert.equal((p.guide.innerHTML.match(/class="ch on"/g) || []).length, 1, 'and only that one');
  assert.equal((p.guide.innerHTML.match(/class="ch"/g) || []).length, 3, 'the other three rows are redrawn');
  assert.ok(p.osd.innerHTML.includes('<b>Channel three</b>'), 'the bar under the video names the new channel (tvPlay then adds the episode)');
  assert.equal(p.log.render, 0);
  assert.equal(p.log.scrolled, 1, 'the page still scrolls back to the picture, as before');
});

test('Live TV: what plays and when is tvPlay\'s, unchanged: the clock decides the item, the new item loads into the player with autoplay', async () => {
  const p = await playing();
  p.h.tune('four'); await settle();
  const c = p.TV[3], now = p.h.chanNow(c), it = c.items[now.i];
  assert.equal(p.log.loads[1].id, 'four/' + p.sandbox.SHOWS[it[0]].slug + '/1x' + it[2]);
  assert.equal(p.log.loads[1].autoplay, true);
  assert.equal(p.log.loads[1].startAt, now.offset > 5 ? now.offset : 0);
});

test('Live TV: the player is made with the two channel buttons wired to surf (next channel, previous channel)', async () => {
  const p = await playing(); const cb = p.log.mk[0].channelButtons;
  assert.ok(cb && typeof cb.onNext === 'function' && typeof cb.onPrev === 'function');
  cb.onNext(); await settle(); assert.equal(p.state.chan, 'two');
  cb.onPrev(); cb.onPrev(); await settle(); assert.equal(p.state.chan, 'four', 'previous wraps round to the last channel');
  assert.equal(p.log.render, 0);
});

test('Live TV: with no player on the page (not turned on yet, or another page) tune falls back to render(), as before', async () => {
  const off = page({ state: { tvOn: false } });
  off.h.tune('two');
  assert.equal(off.log.render, 1); assert.equal(off.state.tvOn, true, 'tune turns the TV on');
  assert.equal(off.log.flashes.length, 0);
  const other = await playing(); other.state.view = 'about'; other.h.tune('two');
  assert.equal(other.log.render, 1, 'on another page the player is not switched');
  const missing = await playing(); missing.h.tune('no-such-channel');
  assert.equal(missing.log.render, 1, 'an unknown channel goes through render, whose own fallback picks the first channel');
  const nohost = page({ noHost: true }); nohost.h.tune('two'); assert.equal(nohost.log.render, 1);
});

// Review of c71cf4bf0, fix 2: the 1.5 s "no signal" retry. The player is now reused across channel changes, so the retry has to notice
// that the viewer has moved to another channel since the failure (TV_TOKEN is bumped by every tvPlay).
test('Live TV: a failure retry scheduled on one channel does not move the channel the viewer has since tuned to', async () => {
  const p = await playing(); const p0 = p.getPlayer();
  p0.o.onEvent({ type: 'failed' }, p0); // the item failed: the page schedules a retry in 1500 ms
  p.h.surf(1); await settle(); // the viewer presses Next channel at once
  const loads = p.log.loads.length;
  await new Promise((r) => setTimeout(r, 1800));
  assert.equal(p.log.loads.length, loads, 'the old channel\'s retry must not load another item into the new channel');
  assert.equal(p.h.TVCUR.c.id, 'two');
});

test('Live TV: a failure retry with no channel change in between still runs, as before: the next item on the same channel', async () => {
  const p = await playing(); const p0 = p.getPlayer();
  const loads = p.log.loads.length;
  p0.o.onEvent({ type: 'failed' }, p0);
  await new Promise((r) => setTimeout(r, 1800)); await settle();
  assert.equal(p.log.loads.length, loads + 1, 'the retry loaded the next item');
  assert.equal(p.h.TVCUR.c.id, 'one', 'on the same channel');
  assert.equal(p.log.render, 0);
});

// Review of c71cf4bf0, fix 1: the fullscreen button was cut off the bar on Live TV players about 430 to 470 px and 561 to 700 px wide.
// The page-side harness has no layout engine, so this checks the CSS text; the proof is the browser measurement in the review.
test('Live TV: the style sheet makes the channel buttons compact and hides the elapsed time for every player up to 720 px wide (and in the old-browser fallback)', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'player.css'), 'utf8').replace(/\r\n/g, '\n');
  const block = /@container \(max-width:720px\)\{([^}]*\}[^}]*)\}/.exec(css);
  assert.ok(block, 'a container rule up to 720 px');
  assert.ok(/\.vpx-row button\.vpx-ch\{min-width:52px;height:48px;padding:0 8px;margin-left:2px;font-size:14px\}/.test(block[1]), 'the compact buttons, still bigger than the other controls (40 to 44 px)');
  assert.ok(/\.vpx-tv \.vpx-time\{display:none/.test(block[1]), 'the elapsed time gives way');
  assert.ok(/@supports not \(container-type:inline-size\)\{@media \(max-width:760px\)\{[^}]*\}[^}]*\.vpx-tv \.vpx-time\{display:none\}/.test(css), 'the fallback for browsers without container queries covers the same widths');
  assert.ok(!/max-width:420px\)\{\.vpx-tv/.test(css), 'the old 420 px rule is gone');
  assert.ok(css.indexOf('@container (max-width:720px)') > css.indexOf('(min-width:1900px)'), 'it comes after the 10-foot sizes, so a narrow player on a big screen is still compact');
});

// Bryan, 20 Oct 2026 (Adult Swim, The Venture Bros. failing): the failed episode was skipped, but when the next, shorter item ended
// the clock still pointed at the failed slot, so Live TV went back to it, it failed again, and the channel looped.
test('Live TV: a failed episode is skipped and never played again when the next, shorter item ends while the clock is still in its slot', async () => {
  const p = page();
  const c = { id: 'as', name: 'Adult Swim', kind: 'all', items: [[0, 1, 1, 22], [1, 1, 1, 11], [2, 1, 1, 11], [3, 1, 1, 11]] };
  const n = p.h.chanNow(c); const f = n.i; const L = c.items.length;
  await p.h.tvPlay(c, f, n.offset); await settle();
  const p0 = p.getPlayer();
  assert.equal(p.h.TVCUR.i, f, 'the clock item plays first');
  p0.o.onEvent({ type: 'failed' }, p0);
  await new Promise((r) => setTimeout(r, 1800)); await settle();
  assert.equal(p.h.TVCUR.i, (f + 1) % L, 'the failure skipped to the next item');
  const seen = [];
  for (let k = 0; k < 4; k++) { p0.o.onEnded(); await settle(); seen.push(p.h.TVCUR.i); }
  assert.ok(!seen.includes(f), 'the failed item never comes back while the clock is still in its slot: ' + seen.join(','));
  assert.equal(seen[0], (f + 2) % L, 'the channel goes forward, not back to the clock');
});
