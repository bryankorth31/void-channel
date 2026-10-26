// Live TV on the site: changing channel keeps the player, so fullscreen survives (batch B, 19 Oct 2026; Bryan: "The channel controls need
// to be on the bar the appears even during full screen to allow switching from full screen"). Run: node --test player/test/tv-switch.test.js
// The REAL Live TV text of scripts/lib/app.js (the schedule from scripts/lib/tvgrid.js, chanNow, tune, tuneHere, surf, osd, tvPlay, guideRows)
// runs in a bare vm on made-up channels, with a stand-in for the player (it records what it is asked) and for the page. No network, no
// browser, no video. The clock is a variable the tests move; the zone is fixed so the answers do not depend on the machine.
// 21 Oct 2026: the channels are plans (pools per daypart) and what is on comes from the schedule, not from a list of items.
// 21 Oct 2026, later (B): full hold on a 30-minute grid. Nothing starts before its time; a break is filled and then held by the cards; a
// dead episode gives its place to another episode of the same show; a show that is gone never stops a channel. Every load is checked
// against the clock (log.early), so a show that starts early fails whichever test it happens in.
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
  // early: every load of an airing, or of an item in its break, whose start the clock has not reached. Full hold: always empty.
  const log = { render: 0, mk: [], loads: [], flashes: [], replaced: [], tracked: [], scrolled: 0, osd: [], idle: 0, early: [], go: [], play: [] };
  const mkShow = (slug) => ({ slug, show: 'Show ' + slug, poster: '', seasons: [{ season: 1, episodes: Array.from({ length: 6 }, (_, i) => ({ n: i + 1, name: slug + ' ep ' + (i + 1), min: 22, item: slug + (i + 1), p: 'f.mp4' })) }] });
  const SHOWS = ['a', 'b', 'c', 'd'].map((s) => mkShow(s));
  const rt = opts.rt || [22, 22, 22, 22];
  const TVLIB = { rt, lib: [[1, 1, 6], [1, 1, 6], [1, 1, 6], [1, 1, 6]] };
  const rot = (k) => [0, 1, 2, 3].map((x) => (x + k) % 4);
  const TV = ['one', 'two', 'three', 'four'].map((id, i) => ({ id, name: 'Channel ' + id, kind: 'all', shows: 4, eps: 24, cap: 2, p: { m: rot(i), d: rot(i), e: rot(i), p: rot(i), l: rot(i), o: rot(i) }, sn: {}, rd: '' }));
  const guide = { innerHTML: '' }, osd = { innerHTML: '', insertAdjacentHTML() {} };
  let player = null, ctx = null;
  const host = { contains: (el) => !!player && el === player.root };
  const mkPlayer = (h, o) => {
    const p = { root: { id: 'root' + log.mk.length }, v: {}, o, flashChannel(n) { log.flashes.push(n); }, idle() { log.idle++; },
      load(ep, lo) {
        const cur = ctx.h.TVCUR;
        log.loads.push({ id: ep.id, startAt: lo.startAt, autoplay: lo.autoplay, at: CLOCK.t, k: cur && cur.x && cur.x.k });
        if (cur && (cur.a.st > CLOCK.t || (cur.x && cur.x.it && cur.x.it.st > CLOCK.t))) log.early.push(ep.id);
      } };
    log.mk.push(o); player = p; return p;
  };
  const state = Object.assign({ view: 'tv', chan: 'one', tvOn: true, tvFails: 0 }, opts.state);
  const unref = (f) => (fn, ms) => { const t = f(fn, ms); if (t && t.unref) t.unref(); return t; }; // the cards' timers must not keep the test run alive
  const sandbox = {
    setTimeout, setInterval: unref(setInterval), clearInterval, clearTimeout, state, SHOWS, CG: [], SPOTS: opts.spots, ME: { adult: false }, SITE: 'voidtv.net', Date: FDate, Math, Map, WeakMap, Object, Array, mkPlayer, vpEvent() {}, filesFor: () => [{ url: 'u' }], esc: (s) => String(s == null ? '' : s),
    ensure: async (s) => { if (opts.missing && s.slug === opts.missing) throw new Error('the show file is gone (404)'); },
    track: (k, d) => log.tracked.push([k, d && d.slug]), urlFor: (s) => '/' + s, render: () => { log.render++; },
    go: async (slug) => { log.go.push(slug); state.view = 'show'; state.show = SHOWS.find((s) => s.slug === slug); }, play: (se, e) => log.play.push([se, e]),
    fetch: async () => ({ json: async () => opts.tvJson }),
    history: { replaceState: (x, y, url) => log.replaced.push(url) }, window: { scrollTo: () => { log.scrolled++; } },
    document: { title: '', body: opts.home ? { dataset: { view: 'home' } } : undefined, querySelector: (sel) => (sel === '.guide' ? (opts.noGuide ? null : guide) : sel === '.osd' ? osd : null) },
    $: (id) => (id === 'vph' && !opts.noHost ? host : null), BASE: '/',
  };
  ctx = vm.createContext(sandbox);
  vm.runInContext('let TV=null,VP=null,TVCUR=null,TVLIB=null;\n' + (opts.text || TV_TEXT) + '\nthis.h={tune,surf,tuneHere,tvPlay,tvAt,tvCard,tvNext,tvNow,ensureTV,chanNow,tvKey,tvDead,TVG,GD,TVC_LINES,TVC_LOOKS,TVC_MS,get TV_DEAD(){return TV_DEAD},get TVC_NOW(){return TVC_NOW},get TV_TOKEN(){return TV_TOKEN},get VP(){return VP},set VP(v){VP=v},set TV(v){TV=v},get TV(){return TV},set TVLIB(v){TVLIB=v},get TVLIB(){return TVLIB},get TVCUR(){return TVCUR}};', ctx);
  ctx.h.TV = TV; ctx.h.TVLIB = TVLIB;
  const idOf = (c, x) => c.id + '/' + SHOWS[x.s].slug + '/' + x.se + 'x' + x.n;
  return { h: ctx.h, log, state, guide, osd, TV, TVLIB, SHOWS, sandbox, idOf, getPlayer: () => player, setPlayer: (p) => { player = p; ctx.h.VP = p; } };
}
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// The page the viewer is on: Live TV turned on, one channel playing in the one player (what tvPage and tvPlay leave behind).
async function playing() {
  const p = page();
  await p.h.tvPlay(p.TV[0]); await settle();
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
  assert.equal(p.h.GD.cur, 'three', 'the guide marks the new channel (it is marked in place: the grid is not rebuilt)');
  assert.equal(p.guide.innerHTML, '', 'and the guide element itself is left alone');
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

test('Live TV: the bar under the video says what is on with the time left, and what is next with its start time', async () => {
  const p = await playing();
  p.h.tune('two'); await settle();
  const c = p.TV[1], n = p.h.chanNow(c), nx = p.h.TVG.nextAiring(c, p.TVLIB, n.a);
  assert.ok(p.osd.innerHTML.includes('Show ' + p.SHOWS[n.a.s].slug), 'what is on now');
  assert.ok(/next: [^<]* Show [a-d]</.test(p.osd.innerHTML), 'what is next: ' + p.osd.innerHTML.slice(0, 300));
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

// Review of c71cf4bf0, fix 1: the fullscreen button was cut off the bar on Live TV players about 430 to 470 px and 561 to 700 px wide.
// The page-side harness has no layout engine, so this checks the CSS text; the proof is the browser measurement in the review.
test('Live TV: the style sheet makes the channel buttons compact and hides the elapsed time for every player up to 720 px wide (and in the old-browser fallback)', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'player.css'), 'utf8').replace(/\r\n/g, '\n');
  const block = /@container \(max-width:720px\)\{([^}]*\}[^}]*)\}/.exec(css);
  assert.ok(block, 'a container rule up to 720 px');
  assert.ok(/\.vpx-row button\.vpx-ch\{min-width:54px;height:52px;padding:0 6px;margin-left:2px;font-size:15px\}/.test(block[1]), 'the compact buttons, still bigger than the other controls (40 to 44 px)');
  // Bryan, 25 Oct 2026: bright, solid pink and bigger on phones. Measured in a browser from 280 to 1000 px: the fullscreen button always fits,
  // thanks to the two narrower rules below (the smallest phones drop the mute button; 540 to 600 px is where the speed control joins the row).
  assert.ok(/@container \(max-width:359px\)\{\.vpx-tv \.vpx-row \[data-a=mute\]\{display:none\}/.test(css), 'the smallest phones drop the mute button');
  assert.ok(/@container \(min-width:540px\) and \(max-width:600px\)\{\.vpx-row button\.vpx-ch\{min-width:50px;padding:0 4px\}\}/.test(css), 'the band where the speed control joins the row');
  assert.ok(/\.vpx-row button\.vpx-ch\{[^}]*background:#ff4fc8;/.test(css), 'solid brand pink');
  assert.ok(/\.vpx-tv \.vpx-time\{display:none/.test(block[1]), 'the elapsed time gives way');
  assert.ok(/@supports not \(container-type:inline-size\)\{@media \(max-width:760px\)\{[^}]*\}[^}]*\.vpx-tv \.vpx-time\{display:none\}/.test(css), 'the fallback for browsers without container queries covers the same widths');
  assert.ok(!/max-width:420px\)\{\.vpx-tv/.test(css), 'the old 420 px rule is gone');
  assert.ok(css.indexOf('@container (max-width:720px)') > css.indexOf('(min-width:1900px)'), 'it comes after the 10-foot sizes, so a narrow player on a big screen is still compact');
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


test('Full hold: a file that ends before the next airing\'s start never starts it early: the cards hold, and the next airing plays at its start, from its beginning', async () => {
  const p = await playing(); const p0 = p.getPlayer();
  const c = p.TV[0], cur = p.h.TVCUR.a, nx = p.h.TVG.nextAiring(c, p.TVLIB, cur);
  assert.equal((nx.st - cur.st) / 60000, 30, 'a 22 minute show holds a half hour'); assert.equal(cur.du, 22);
  const n = p.log.loads.length;
  CLOCK.t = cur.st + 21 * 60000 + 50000; // the file ends ten seconds inside its last minute
  p0.o.onEnded(); await settle();
  assert.equal(p.log.loads.length, n, 'nothing loads early');
  assert.equal(p.log.idle, 1, 'the player lets go of the file under the cards');
  const card = p.h.TVC_NOW;
  assert.ok(card, 'the holding cards are up');
  assert.equal(card.show, 'Show ' + p.SHOWS[nx.s].slug, 'they name the next show');
  assert.ok(Math.abs(card.left - (nx.st - CLOCK.t) / 1000) < 0.01, 'and count down to its start');
  CLOCK.t = nx.st - 1000; await wait(300); await settle();
  assert.equal(p.log.loads.length, n, 'one second before the start: still the cards');
  CLOCK.t = nx.st; await wait(300); await settle();
  assert.equal(p.log.loads.length, n + 1, 'at the start the next airing loads');
  assert.equal(p.log.loads[n].id, p.idOf(c, nx)); assert.equal(p.log.loads[n].startAt, 0);
  assert.equal(p.h.TVC_NOW, null, 'the cards are gone');
  assert.deepEqual(p.log.early, [], 'nothing started before its time');
});

test('Full hold: tuning in during a break lands on the cards with the right countdown; five minutes into an episode it is joined at five minutes', async () => {
  const p = page(); const c = p.TV[0];
  const a0 = p.h.chanNow(c).a, nx = p.h.TVG.nextAiring(c, p.TVLIB, a0);
  CLOCK.t = a0.st + 25 * 60000;
  await p.h.tvPlay(c); await settle();
  assert.equal(p.log.loads.length, 0, 'no episode loads in a break');
  assert.equal(p.log.mk.length, 1, 'the player is made, so the channel buttons and fullscreen are there');
  assert.equal(p.h.TVC_NOW.show, 'Show ' + p.SHOWS[nx.s].slug);
  assert.equal(p.h.TVC_NOW.left, 300, 'five minutes to the next show');
  const q = page(); const c2 = q.TV[0], a2 = q.h.chanNow(c2).a;
  CLOCK.t = a2.st + 5 * 60000;
  await q.h.tvPlay(c2); await settle();
  assert.equal(q.log.loads[0].id, q.idOf(c2, a2)); assert.equal(q.log.loads[0].startAt, 300);
  assert.deepEqual(p.log.early.concat(q.log.early), []);
});

test('The holding cards: 36 lines in 4 looks; the next card never repeats the line or the look; every card names the next show and its time; everyone sees the same card', () => {
  const p = page(); const c = p.TV[0], a0 = p.h.chanNow(c).a, nx = p.h.TVG.nextAiring(c, p.TVLIB, a0);
  assert.equal(p.h.TVC_LINES.length, 36, '36: the line steps by 7, which reaches every line only while the count shares no factor with 7'); assert.equal(p.h.TVC_LOOKS.length, 4); assert.equal(p.h.TVC_MS, 9000);
  assert.ok(p.h.TVC_LINES.every((l) => !l.includes('—')), 'no em dashes');
  assert.ok(!p.h.TVC_LINES.some((l) => /donat/i.test(l)), 'no donation line in the rotation: the donation spot (once an hour, with its button) replaced it');
  const other = page(), until = nx.st, seen = new Set();
  let prev = null;
  for (let t = a0.st + 22 * 60000; t < until; t += 1000) {
    const d = p.h.tvCard(c, a0, until, t);
    assert.equal(d.show, 'Show ' + p.SHOWS[nx.s].slug); assert.ok(d.at.length > 0); assert.ok(!/[{}]/.test(d.line), 'every placeholder filled: ' + d.line);
    if (prev && d.k !== prev.k) { assert.equal(prev.k - d.k, 1); assert.notEqual(d.line, prev.line, 'never the same line twice in a row'); assert.notEqual(d.look, prev.look, 'nor the same look'); }
    assert.deepEqual(JSON.parse(JSON.stringify(other.h.tvCard(other.TV[0], a0, until, t))), JSON.parse(JSON.stringify(d)), 'the same card for everyone at the same moment');
    seen.add(d.line); prev = d;
  }
  assert.equal(prev.k, 0, 'the run ends on its last card, which stretches to the start');
  assert.equal(seen.size, 36, 'an 8 minute break goes through every line');
});

test('Full hold: changing channel during a hold stops that channel\'s cards and plays the new channel by its clock', async () => {
  const p = page(); const c = p.TV[0], a0 = p.h.chanNow(c).a;
  CLOCK.t = a0.st + 25 * 60000;
  await p.h.tvPlay(c); await settle();
  const tok = p.h.TV_TOKEN; assert.ok(p.h.TVC_NOW);
  p.h.tune('two'); await settle();
  assert.ok(p.h.TV_TOKEN > tok, 'the old channel\'s timer is retired');
  assert.equal(p.h.TVCUR.c.id, 'two');
  const c2 = p.TV[1], nx2 = p.h.TVG.nextAiring(c2, p.TVLIB, p.h.chanNow(c2).a);
  assert.equal(p.h.TVC_NOW.show, 'Show ' + p.SHOWS[nx2.s].slug, 'the cards now name channel two\'s next show');
  CLOCK.t = a0.st + 32 * 60000; p.h.tune('three'); await settle();
  assert.equal(p.log.loads.length, 1, 'a channel that is two minutes into an episode plays at once');
  assert.equal(p.log.loads[0].startAt, 120); assert.equal(p.h.TVC_NOW, null);
  assert.equal(p.log.render, 0); assert.deepEqual(p.log.early, []);
});

test('Next during a break plays the coming show now, On Demand, in the show player; outside a break Next changes channel', async () => {
  const p = page(); const c = p.TV[0], a0 = p.h.chanNow(c).a, nx = p.h.TVG.nextAiring(c, p.TVLIB, a0);
  CLOCK.t = a0.st + 25 * 60000;
  await p.h.tvPlay(c); await settle();
  p.getPlayer().o.onNext(); await settle();
  assert.deepEqual(p.log.go, [p.SHOWS[nx.s].slug], 'the coming show opens');
  assert.deepEqual(p.log.play, [[0, nx.n - 1]], 'at the episode the schedule has next');
  assert.equal(p.h.TVC_NOW, null, 'the cards are gone');
  assert.ok(p.log.tracked.some((t) => t[0] === 'ondemand'));
  const q = await playing(); q.getPlayer().o.onNext(); await settle();
  assert.equal(q.state.chan, 'two', 'during a show Next is the next channel, as before'); assert.deepEqual(q.log.go, []);
});

test('Full hold: a dead episode gives its place to another episode of the same show at the same minute; when every one has failed the cards hold to the next airing', async () => {
  const p = await playing(); const p0 = p.getPlayer();
  const a0 = p.h.TVCUR.a, slug = p.SHOWS[a0.s].slug, off = (CLOCK.t - a0.st) / 1000;
  const tried = new Set([a0.n]);
  for (let k = 0; k < 5; k++) {
    const n = p.log.loads.length;
    p0.o.onEvent({ type: 'failed' }, p0);
    await wait(1700); await settle();
    assert.equal(p.log.loads.length, n + 1, 'swap ' + (k + 1) + ' loaded');
    const id = p.log.loads[n].id; assert.ok(id.startsWith('one/' + slug + '/1x'), 'the same show: ' + id);
    const ep = +id.split('x')[1]; assert.ok(!tried.has(ep), 'another episode each time: ' + id); tried.add(ep);
    assert.equal(p.log.loads[n].startAt, off, 'joined at the same minute');
    assert.equal(p.h.TVCUR.a.st, a0.st, 'in the same airing');
  }
  const n = p.log.loads.length;
  p0.o.onEvent({ type: 'failed' }, p0); // all six episodes of the show have failed now
  await wait(1700); await settle();
  assert.equal(p.log.loads.length, n, 'nothing left to try in this airing');
  assert.ok(p.h.TVC_NOW, 'the cards keep the channel alive');
  assert.deepEqual(p.log.early, []);
});

test('Self-pruning: a show whose file is gone (removed since the page was built) never stops the channel: the cards hold until the next airing plays', async () => {
  const p0 = page(); const c0 = p0.TV[0], a0 = p0.h.chanNow(c0).a, nx0 = p0.h.TVG.nextAiring(c0, p0.TVLIB, a0);
  assert.notEqual(nx0.s, a0.s, 'the next airing is another show (the test needs that)');
  const p = page({ missing: p0.SHOWS[a0.s].slug }); const c = p.TV[0];
  await p.h.tvPlay(c); await settle();
  assert.equal(p.log.loads.length, 0); assert.ok(p.h.TVC_NOW, 'the cards, not a dead screen');
  const nx = p.h.TVG.nextAiring(c, p.TVLIB, a0);
  CLOCK.t = nx.st; await wait(300); await settle();
  assert.equal(p.log.loads.length, 1, 'the next airing plays at its start'); assert.equal(p.log.loads[0].id, p.idOf(c, nx));
  assert.deepEqual(p.log.early, []);
});

test('Self-pruning: the TV data is laid onto the page\'s own show list by name, so a show removed since it was built drops out and nothing points at the wrong show', async () => {
  const tvJson = { v: 2, rt: [22, 22, 22, 22, 22], lib: [[1, 1, 6], [1, 1, 6], [1, 1, 6], [1, 1, 6], [1, 1, 6]], sl: ['gone', 'd', 'c', 'b', 'a'], sp: [],
    channels: [{ id: 'one', name: 'Channel one', kind: 'all', shows: 5, eps: 30, cap: 2, p: { m: [0, 1, 2], d: [0, 3, 4], e: [1], p: [2], l: [3], o: [4] }, sn: {}, rd: '' },
      { id: 'lost', name: 'Lost', kind: 'row', shows: 1, eps: 6, cap: 2, p: { d: [0] }, sn: {}, rd: '' }] };
  const p = page({ tvJson }); p.h.TV = null; p.h.TVLIB = null;
  const TV = await p.h.ensureTV();
  const plain = (x) => JSON.parse(JSON.stringify(x)); // arrays made inside the page's vm have that realm's Array
  assert.deepEqual(plain(TV.map((c) => c.id)), ['one'], 'the channel whose only show is gone drops out');
  const name = (i) => p.SHOWS[i].slug;
  assert.deepEqual(plain(TV[0].p.m.map(name)), ['d', 'c']); assert.deepEqual(plain(TV[0].p.d.map(name)), ['b', 'a']);
  const n = p.h.chanNow(TV[0]); assert.ok(p.SHOWS[n.a.s], 'what is on is a show the page has');
});

test('Deliberate bug: a page that starts the next airing as soon as a file ends is caught by the clock check', async () => {
  const text = TV_TEXT.replace("return{k:'card',a,until:a.en}}", "{const nx=TVG.nextAiring(c,TVLIB,a);return{k:'ep',a:nx,off:0}}}");
  assert.notEqual(text, TV_TEXT, 'the bug went in');
  const p = page({ text }); await p.h.tvPlay(p.TV[0]); await settle();
  CLOCK.t = p.h.TVCUR.a.st + 23 * 60000; p.getPlayer().o.onEnded(); await settle();
  assert.ok(p.log.early.length > 0, 'the early start is seen');
});

test('Live TV: the page text carries no list of items any more: no TV_EPOCH, no c.items', () => {
  assert.ok(!/TV_EPOCH|c\.items|\.items\.length/.test(TV_TEXT.replace(T.source, '')), 'the schedule replaced the item lists');
});


// Audit 21 Oct 2026 (H1): a channel whose morning pool self-pruning emptied. The old code held the cards "until" an airing that was
// already over, and the cards called tvPlay inside their own tick until the page ran out of stack (1,837 nested calls, nothing played).
test('Self-pruning: a channel that lost its morning pool plays at 7 am, and a day with a hole holds the cards for a minute instead of looping', async () => {
  const p = page(); const one = Object.assign({}, p.TV[0], { p: Object.assign({}, p.TV[0].p) }); delete one.p.m;
  p.h.TV = [one];
  await p.h.tvPlay(one); await settle();
  assert.equal(p.log.loads.length, 1, 'an episode plays at 7 am'); assert.deepEqual(p.log.early, []);
  const q = page(); const v = Object.assign({}, q.TV[0], { id: 'only-v', p: { v: [0] } }); // one movie at 8 pm, nothing else all day
  q.h.TV = [v];
  await q.h.tvPlay(v); await settle();
  assert.equal(q.log.loads.length, 0); assert.ok(q.log.idle <= 2, 'cards started ' + q.log.idle + ' times'); assert.ok(q.h.TVC_NOW, 'the cards are up');
});

test('Home page Live TV (B, 25 Oct 2026): the player starts muted, channel changes stay on the home page (no address change, no render, the same player)', async () => {
  const p = page({ home: true, noGuide: true });
  await p.h.tvPlay(p.TV[0]); await settle();
  const first = p.getPlayer();
  assert.equal(first.v.muted, true, 'muted until a tap: browsers allow sound only after one');
  for (let i = 0; i < 3; i++) { p.h.surf(1); await settle(); }
  assert.equal(p.log.render, 0);
  assert.deepEqual(p.log.replaced, [], 'the address stays the home page');
  assert.equal(p.getPlayer(), first);
  assert.equal(p.log.mk.length, 1);
  assert.equal(p.state.chan, 'four');
});

test('Live TV page: the player is not muted there', async () => {
  const p = await playing();
  assert.notEqual(p.getPlayer().v.muted, true);
});

// ---- the spots in the breaks (B, 25 Oct 2026; step 4) -----------------------------------------------------------------------------------
const SPOTS = { donate: { line: 'No ads sold, ever. voidtv.net runs on donations. $5 when you can.', credit: 'Every donation goes to CASH (cashvalues.org).', button: 'Donate' }, tips: ['A tip'], know: ['Good to know'], trivia: ['A trivia line'] };
// Every card of each break on channel c for a day, by its place in the stretch (0 is the first card).
function breaks(p, c) {
  const G = p.h.TVG, lib = p.TVLIB, out = [];
  for (const a of G.airingsBetween(c, lib, CLOCK.t, CLOCK.t + 864e5)) {
    const br = G.breakOf(c, lib, a); if (!br) continue;
    const s0 = br.fill.length ? br.fill[br.fill.length - 1].en : br.at, K0 = Math.floor((a.en - s0) / 9000);
    const cards = []; for (let k = K0; k >= 0; k--) cards.push(p.h.tvCard(c, a, a.en, a.en - (k + 0.5) * 9000));
    out.push({ a, s0, K0, cards });
  }
  return out;
}
test('Spots: the donation spot holds cards 2 and 3 of the first break of each clock hour, at most once an hour per channel; card 5 is a trivia, tip or good-to-know spot; never two spots in a row', () => {
  const p = page({ spots: SPOTS }), c = p.TV[0], B = breaks(p, c);
  const withDonate = B.filter((b) => b.cards.some((d) => d.spot && d.spot.kind === 'donate'));
  assert.ok(withDonate.length > 0, 'the donation spot airs');
  for (const b of withDonate) {
    assert.deepEqual(b.cards.map((d, i) => (d.spot && d.spot.kind === 'donate' ? i : -1)).filter((i) => i >= 0), [1, 2]);
    assert.equal(b.cards[1].spot.id, b.cards[2].spot.id, 'one spot over two card slots');
  }
  const hours = withDonate.map((b) => { const h = new Date(b.s0); h.setMinutes(0, 0, 0); return +h; });
  assert.equal(new Set(hours).size, hours.length, 'at most one donation spot an hour on a channel');
  for (const b of B) {
    if (b.K0 >= 6) { const f = b.cards[4].spot; assert.ok(f && f.kind === 'fact' && /^(Did you know\?|Tip|Good to know)$/.test(f.kick) && f.text, 'card 5 is a fact spot'); }
    for (let i = 1; i < b.cards.length; i++) { const x = b.cards[i - 1].spot, y = b.cards[i].spot; assert.ok(!(x && y && x.id !== y.id), 'never two spots in a row'); }
  }
});
test('Spots: everyone on a channel sees the same spot at the same moment, and a kids channel gets none', () => {
  const p = page({ spots: SPOTS }), q = page({ spots: SPOTS }), c = p.TV[0];
  const B = breaks(p, c), Q = breaks(q, q.TV[0]);
  assert.deepEqual(JSON.parse(JSON.stringify(Q.map((b) => b.cards))), JSON.parse(JSON.stringify(B.map((b) => b.cards))));
  const kids = breaks(p, Object.assign({}, c, { kc: 1 }));
  assert.ok(kids.length > 0 && kids.every((b) => b.cards.every((d) => !d.spot)), 'no spots on a kids channel');
});
// The page's promo helpers (they sit after the Live TV functions in app.js), run with a promos.json the test makes.
const PROMO_TEXT = (() => { const s = APP.indexOf('function promoUrl('), e = APP.indexOf('\n', APP.indexOf('const id=ids[seed%ids.length]')); assert.ok(s > 0 && e > s, 'the promo helpers are where this test expects them'); return APP.slice(s, e); })();
const withPromos = (items, order) => TV_TEXT + '\nlet PROMOS=' + JSON.stringify({ items, slots: { promos: order } }) + ';\n' + PROMO_TEXT;
const promo = (dur) => ({ title: 'P', shapes: { wide: { src: 'p' + dur + '.mp4', poster: 'p.jpg', w: 1920, h: 1080, dur } } });
test('Spots: a video spot holds only as many cards as the promo runs, one promo for the whole spot; a promo too long for its cards never plays (audit P3A-03)', () => {
  const p = page({ spots: SPOTS, text: withPromos({ long: promo(60), short: promo(20), none: { title: 'N', shapes: { wide: { src: 'n.mp4' } } } }, ['long', 'none', 'short']) });
  const B = breaks(p, p.TV[0]).filter((b) => b.K0 >= 12);
  assert.ok(B.length > 0, 'long breaks to test');
  for (const b of B) {
    const at = b.cards.map((d, i) => (d.spot && d.spot.kind === 'video' ? i : -1)).filter((i) => i >= 0);
    assert.deepEqual(at, [7, 8, 9], 'a 20 second promo takes three 9 second cards, from card 8');
    for (const i of at) assert.equal(b.cards[i].spot.src, '/assets/brand/promos/p20.mp4', 'only the promo that fits, and the same one on every card');
  }
  const q = page({ spots: SPOTS, text: withPromos({ long: promo(60) }, ['long']) });
  assert.ok(breaks(q, q.TV[0]).every((b) => b.cards.every((d) => !(d.spot && d.spot.kind === 'video'))), 'a 60 second promo is never cut into a 36 second spot');
});
test('Spots: without catalog/spots.json the cards are as before (no spots)', () => {
  const p = page(), B = breaks(p, p.TV[0]);
  assert.ok(B.every((b) => b.cards.every((d) => !d.spot)));
});

test('Flipping (B, 26 Oct 2026): CH skips a channel that is on its holding cards and lands on one with a picture; picking it directly still shows it; with every channel on cards CH moves one', async () => {
  // Channel two is made to sit on its cards (a stand-in, the way other tests here adjust the page text); the others play.
  const text = TV_TEXT.replace('function tvAt(c,t){', "function tvAt(c,t){if(c.id==='two'){const n0=chanNow(c,t);return n0?{k:'card',a:n0.a,until:t+60000}:null}");
  assert.notEqual(text, TV_TEXT, 'the text this test adjusts is still in app.js');
  const p = page({ text }), base = Date.UTC(2026, 9, 19, 12, 7, 30);
  let t = base; for (let m = 0; m < 1440; m += 5) { const x = p.h.tvAt(p.TV[0], base + m * 60000); if (x && x.k === 'ep') { t = base + m * 60000; break; } }
  CLOCK.t = t; p.state.chan = 'one';
  p.h.surf(1); await settle();
  assert.equal(p.state.chan, 'three', 'two (on cards) was skipped');
  p.h.surf(-1); await settle();
  assert.equal(p.state.chan, 'one', 'and skipped going back too');
  p.h.tune('two'); await settle();
  assert.equal(p.state.chan, 'two', 'tuned directly, it plays as it is');
  const q = page(); let tc = null; for (let m = 0; m < 1440 && !tc; m += 5) { const x = q.h.tvAt(q.TV[0], base + m * 60000); if (x && x.k === 'card') tc = base + m * 60000; }
  assert.ok(tc, 'a moment when every channel is on cards');
  CLOCK.t = tc; q.state.chan = 'one'; q.h.surf(1); await settle();
  assert.equal(q.state.chan, 'two', 'every channel on cards: CH still moves one');
});
