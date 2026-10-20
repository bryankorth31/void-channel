// Live TV on the site: changing channel keeps the player, so fullscreen survives (batch B, 19 Oct 2026; Bryan: "The channel controls need
// to be on the bar the appears even during full screen to allow switching from full screen"). Run: node --test player/test/tv-switch.test.js
// The REAL Live TV text of scripts/lib/app.js (the schedule from scripts/lib/tvgrid.js, chanNow, tune, tuneHere, surf, osd, tvPlay, guideRows)
// runs in a bare vm on made-up channels, with a stand-in for the player (it records what it is asked) and for the page. No network, no
// browser, no video. The clock is a variable the tests move; the zone is fixed so the answers do not depend on the machine.
// 21 Oct 2026: the channels are plans (pools per daypart) and what is on comes from the schedule, not from a list of items.
process.env.TZ = 'America/Chicago';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const T = require('../../scripts/lib/tvgrid');

const APP = fs.readFileSync(path.join(__dirname, '..', '..', 'scripts', 'lib', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const a = APP.indexOf('const TVG=');
const b = APP.indexOf('async function tvPage(){');
assert.ok(a > 0 && b > a, 'the Live TV functions are where this test expects them');
// app.js holds the page script inside a template literal, so \\ in the file is one backslash in the page; the schedule text is put in where app.js interpolates it.
const TV_TEXT = APP.slice(a, b).split('\\\\').join('\\').replace('$' + '{TVGRID_SRC}', T.source);
assert.ok(!TV_TEXT.includes('TVGRID_SRC'), 'the schedule source went in');

const CLOCK = { t: Date.UTC(2026, 9, 19, 12, 7, 30) };
class FDate extends Date { static now() { return CLOCK.t; } } // the clock stands still until a test moves it, so "what is on now" is the same for the test and the page

function page(opts) {
  opts = opts || {};
  CLOCK.t = Date.UTC(2026, 9, 19, 12, 7, 30);
  const log = { render: 0, mk: [], loads: [], flashes: [], replaced: [], tracked: [], scrolled: 0, osd: [] };
  const mkShow = (slug) => ({ slug, show: 'Show ' + slug, poster: '', seasons: [{ season: 1, episodes: Array.from({ length: 6 }, (_, i) => ({ n: i + 1, name: slug + ' ep ' + (i + 1), min: 22, item: slug + (i + 1), p: 'f.mp4' })) }] });
  const SHOWS = ['a', 'b', 'c', 'd'].map((s) => mkShow(s));
  const rt = opts.rt || [22, 22, 22, 22];
  const TVLIB = { rt, lib: [[1, 1, 6], [1, 1, 6], [1, 1, 6], [1, 1, 6]] };
  const rot = (k) => [0, 1, 2, 3].map((x) => (x + k) % 4);
  const TV = ['one', 'two', 'three', 'four'].map((id, i) => ({ id, name: 'Channel ' + id, kind: 'all', shows: 4, eps: 24, cap: 2, p: { m: rot(i), d: rot(i), e: rot(i), p: rot(i), l: rot(i), o: rot(i) }, sn: {}, rd: '' }));
  const guide = { innerHTML: '' }, osd = { innerHTML: '', insertAdjacentHTML() {} };
  let player = null;
  const host = { contains: (el) => !!player && el === player.root };
  const mkPlayer = (h, o) => {
    const p = { root: { id: 'root' + log.mk.length }, v: {}, o, load(ep, lo) { log.loads.push({ id: ep.id, startAt: lo.startAt, autoplay: lo.autoplay }); }, flashChannel(n) { log.flashes.push(n); } };
    log.mk.push(o); player = p; return p;
  };
  const state = Object.assign({ view: 'tv', chan: 'one', tvOn: true, tvFails: 0 }, opts.state);
  const sandbox = {
    setTimeout, state, SHOWS, ME: { adult: false }, SITE: 'voidtv.net', Date: FDate, Math, Map, WeakMap, Object, Array, mkPlayer, vpEvent() {}, filesFor: () => [{ url: 'u' }], esc: (s) => String(s == null ? '' : s),
    ensure: async () => {}, track: (k, d) => log.tracked.push([k, d && d.slug]), urlFor: (s) => '/' + s, render: () => { log.render++; },
    history: { replaceState: (x, y, url) => log.replaced.push(url) }, window: { scrollTo: () => { log.scrolled++; } },
    document: { title: '', querySelector: (sel) => (sel === '.guide' ? (opts.noGuide ? null : guide) : sel === '.osd' ? osd : null) },
    $: (id) => (id === 'vph' && !opts.noHost ? host : null), BASE: '/',
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext('let TV=null,VP=null,TVCUR=null,TVLIB=null;\n' + TV_TEXT + '\nthis.h={tune,surf,tuneHere,tvPlay,chanNow,tvNextGood,tvKey,tvDead,TVG,get TV_DEAD(){return TV_DEAD},get VP(){return VP},set VP(v){VP=v},set TV(v){TV=v},set TVLIB(v){TVLIB=v},get TVLIB(){return TVLIB},get TVCUR(){return TVCUR}};', ctx);
  ctx.h.TV = TV; ctx.h.TVLIB = TVLIB;
  const idOf = (c, x) => c.id + '/' + SHOWS[x.s].slug + '/' + x.se + 'x' + x.n;
  return { h: ctx.h, log, state, guide, osd, TV, TVLIB, SHOWS, sandbox, idOf, getPlayer: () => player, setPlayer: (p) => { player = p; ctx.h.VP = p; } };
}
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };

// The page the viewer is on: Live TV turned on, one channel playing in the one player (what tvPage and tvPlay leave behind).
async function playing() {
  const p = page();
  const n = p.h.chanNow(p.TV[0]);
  await p.h.tvPlay(p.TV[0], n.a, n.offset); await settle();
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

test('Live TV: what plays and when is tvPlay\'s: the clock decides the airing, the new airing loads into the player with autoplay', async () => {
  const p = await playing();
  p.h.tune('four'); await settle();
  const c = p.TV[3], now = p.h.chanNow(c);
  assert.equal(p.log.loads[1].id, p.idOf(c, now.a));
  assert.equal(p.log.loads[1].autoplay, true);
  assert.equal(p.log.loads[1].startAt, now.offset > 5 ? now.offset : 0);
});

test('Live TV: the guide rows say what is on now with the time left, and what is next with its start time', async () => {
  const p = await playing();
  p.h.tune('two'); await settle();
  const c = p.TV[1], n = p.h.chanNow(c), nx = p.h.TVG.nextAiring(c, p.TVLIB, n.a);
  assert.ok(p.guide.innerHTML.includes('Show ' + p.SHOWS[n.a.s].slug), 'what is on now');
  assert.ok(/<small>next [^<]* · Show [a-d]<\/small>/.test(p.guide.innerHTML), 'what is next: ' + p.guide.innerHTML.slice(0, 400));
  assert.ok(nx.st === n.a.en);
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

test('Live TV: a failure retry with no channel change in between still runs, as before: the next airing on the same channel', async () => {
  const p = await playing(); const p0 = p.getPlayer();
  const loads = p.log.loads.length, before = p.h.TVCUR.a;
  p0.o.onEvent({ type: 'failed' }, p0);
  await new Promise((r) => setTimeout(r, 1800)); await settle();
  assert.equal(p.log.loads.length, loads + 1, 'the retry loaded the next item');
  assert.equal(p.h.TVCUR.c.id, 'one', 'on the same channel');
  assert.equal(p.h.TVCUR.a.st, before.en, 'the airing that follows the failed one');
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
// On the schedule the same case is: the airing the clock is in fails, the next one plays (it is shorter, so it ends while the clock is still
// inside the failed airing's time). The end of that airing must go on to the one after, never back.
test('Live TV: a failed episode is skipped and never played again when the next, shorter item ends while the clock is still in its slot', async () => {
  const p = page({ rt: [44, 11, 11, 11] });
  const c = { id: 'as', name: 'Adult Swim', kind: 'all', shows: 4, eps: 24, cap: 4, sn: {}, rd: '', p: { m: [0, 1, 2, 3], d: [0, 1, 2, 3], e: [0, 1, 2, 3], p: [0, 1, 2, 3], l: [0, 1, 2, 3], o: [0, 1, 2, 3] } };
  // a time when the clock is in a 44 minute airing of show a, followed by 11 minute airings
  let t = Date.UTC(2026, 9, 19, 12, 0, 0), n = null;
  for (let k = 0; k < 3000; k += 1) { t += 60000; n = p.h.chanNow(c, t); if (n.a.s === 0 && n.offset >= 1) break; }
  assert.equal(n.a.s, 0, 'found the long airing');
  CLOCK.t = t;
  const f = n.a;
  await p.h.tvPlay(c, f, n.offset); await settle();
  const p0 = p.getPlayer();
  assert.equal(p.h.TVCUR.a.st, f.st, 'the clock airing plays first');
  p0.o.onEvent({ type: 'failed' }, p0);
  await new Promise((r) => setTimeout(r, 1800)); await settle();
  assert.ok(p.h.TVCUR.a.st > f.st, 'the failure skipped to a later airing');
  const seen = [];
  for (let k = 0; k < 4; k++) { p0.o.onEnded(); await settle(); seen.push(p.h.TVCUR.a.st); }
  assert.ok(!seen.includes(f.st), 'the failed airing never comes back while the clock is still in its time: ' + seen.join(','));
  assert.ok(seen.every((s, k) => k === 0 || s > seen[k - 1]), 'the channel goes forward, never back: ' + seen.join(','));
  assert.ok(p.h.tvDead(c, f), 'the failed episode is remembered');
});

test('Live TV: a failure is remembered per channel and episode, so the same episode on another channel still plays', async () => {
  const p = await playing(); const p0 = p.getPlayer();
  const a1 = p.h.TVCUR.a;
  p0.o.onEvent({ type: 'failed' }, p0);
  assert.ok(p.h.tvDead(p.TV[0], a1));
  assert.ok(!p.h.tvDead(p.TV[1], a1), 'another channel does not inherit the failure');
  assert.equal(Object.keys(p.h.TV_DEAD).length, 1);
  assert.ok(/^one:\d+:1x\d+$/.test(Object.keys(p.h.TV_DEAD)[0]), Object.keys(p.h.TV_DEAD)[0]);
});

test('Live TV: tvNextGood walks the schedule forward past episodes that failed in the last hour, and still moves on when all of them did', async () => {
  const p = page();
  const c = p.TV[0], n = p.h.chanNow(c);
  const n1 = p.h.TVG.nextAiring(c, p.TVLIB, n.a), n2 = p.h.TVG.nextAiring(c, p.TVLIB, n1);
  assert.equal(p.h.tvNextGood(c, n.a).st, n1.st, 'nothing dead: the next airing');
  p.h.TV_DEAD[p.h.tvKey(c, n1)] = Date.now();
  assert.equal(p.h.tvNextGood(c, n.a).st, n2.st, 'the next one is dead: the one after');
  let x = n.a;
  for (let k = 0; k < 40; k++) { x = p.h.TVG.nextAiring(c, p.TVLIB, x); p.h.TV_DEAD[p.h.tvKey(c, x)] = Date.now(); }
  assert.ok(p.h.tvNextGood(c, n.a).st > n.a.st, 'when everything near is dead the channel still goes forward');
  p.h.TV_DEAD[p.h.tvKey(c, n1)] = Date.now() - 2 * 36e5;
  assert.equal(p.h.tvNextGood(c, n.a).st, n1.st, 'a failure older than an hour is forgotten');
});

test('Live TV: the end of an item. Clock still inside the airing (file shorter than planned): the next airing starts from its beginning', async () => {
  const p = await playing(); const p0 = p.getPlayer();
  const c = p.TV[0], cur = p.h.TVCUR.a, nx = p.h.TVG.nextAiring(c, p.TVLIB, cur);
  const n = p.log.loads.length;
  p0.o.onEnded(); await settle();
  assert.equal(p.log.loads.length, n + 1);
  assert.equal(p.log.loads[n].id, p.idOf(c, nx));
  assert.equal(p.log.loads[n].startAt, 0, 'early start: from the beginning');
});

test('Live TV: the end of an item. Clock a few minutes into the next airing: the next airing starts from its beginning; further in, it is joined where the clock is', async () => {
  const p = await playing(); const p0 = p.getPlayer();
  const c = p.TV[0], cur = p.h.TVCUR.a, nx = p.h.TVG.nextAiring(c, p.TVLIB, cur);
  let n = p.log.loads.length;
  CLOCK.t = nx.st + 90 * 1000; // an item that ran a little long
  p0.o.onEnded(); await settle();
  assert.equal(p.log.loads[n].id, p.idOf(c, nx)); assert.equal(p.log.loads[n].startAt, 0, 'a minute and a half in: nobody misses the start');
  n = p.log.loads.length;
  const nx2 = p.h.TVG.nextAiring(c, p.TVLIB, nx);
  CLOCK.t = nx2.st + 600 * 1000; // a stall: the player is a whole airing and ten minutes behind the clock
  p0.o.onEnded(); await settle();
  const now = p.h.chanNow(c);
  assert.equal(now.a.st, nx2.st);
  assert.equal(p.log.loads[n].id, p.idOf(c, nx2));
  assert.ok(Math.abs(p.log.loads[n].startAt - 600) < 1, 'joined where the clock is: ' + p.log.loads[n].startAt);
});

test('Live TV: tuning in during the tail of an airing whose file is shorter than planned plays the next airing from its start', async () => {
  const p = page();
  const c = p.TV[0], n = p.h.chanNow(c), nx = p.h.TVG.nextAiring(c, p.TVLIB, n.a);
  await p.h.tvPlay(c, n.a, 22 * 60 + 40); await settle(); // the show's episodes are 22 minutes; the planned airing is longer
  assert.equal(p.log.loads.length, 1);
  assert.equal(p.log.loads[0].id, p.idOf(c, nx), 'the next airing');
  assert.equal(p.log.loads[0].startAt, 0);
  const p2 = page();
  const q = p2.h.chanNow(p2.TV[0]);
  await p2.h.tvPlay(p2.TV[0], q.a, 5 * 60); await settle();
  assert.equal(p2.log.loads[0].id, p2.idOf(p2.TV[0], q.a), 'five minutes in is simply joined');
  assert.equal(p2.log.loads[0].startAt, 300);
});

test('Live TV: the page text carries no list of items any more: no TV_EPOCH, no c.items', () => {
  assert.ok(!/TV_EPOCH|c\.items|\.items\.length/.test(TV_TEXT.replace(T.source, '')), 'the schedule replaced the item lists');
});
