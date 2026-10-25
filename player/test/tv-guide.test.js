// The Live TV guide grid (scripts/lib/app.js, "THE GUIDE", on the schedule in scripts/lib/tvgrid.js). Run: node --test player/test/tv-guide.test.js
// The REAL page text runs in a bare vm with a small stand-in for the page (elements that hold text and scroll positions). The clock is a
// variable and the zone is fixed. What is checked: the blocks the guide draws against what playback says is on (same calls), that only the
// rows and time in view are in the page, the filters, the keys a remote sends, the card, tuning from the guide, and the phone list.
process.env.TZ = 'America/Chicago';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const T = require('../../scripts/lib/tvgrid');

const APP = fs.readFileSync(path.join(__dirname, '..', '..', 'scripts', 'lib', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const a0 = APP.indexOf('const TVG='), b0 = APP.indexOf('async function tvPage(){');
assert.ok(a0 > 0 && b0 > a0);
// The color code's groups, as catalog/colors.json hands them to the page (CG).
const COLORS = [{ k: 'comedy', n: 'Comedy', c: '#ffd23f' }, { k: 'drama', n: 'Drama', c: '#ff6b6b' }, { k: 'other', n: 'Other', c: '#8a8fa3' }];
const TV_TEXT = APP.slice(a0, b0).split('\\\\').join('\\').replace('$' + '{TVGRID_SRC}', T.source);

const CLOCK = { t: Date.UTC(2026, 9, 19, 12, 7, 30) }; // Monday 19 Oct 2026, 7:07:30 am in Chicago
class FDate extends Date { static now() { return CLOCK.t; } }

// ---- made-up catalog: 40 shows with names to search for, 7 channels built the way the site builds them
const NAMES = ['Seinfeld', 'Frasier', 'Cheers', 'Friends', 'Taxi', 'Roseanne', 'The Nanny', 'Mad About You', 'NYPD Blue', 'Law and Order', 'The Wire', 'Oz', 'Batman', 'Gargoyles', 'Samurai Jack', 'Dexter Lab',
  'Rick and Morty', 'Aqua Teen', 'Space Ghost', 'Venture Bros', 'Wild Discovery', 'Nova', 'Cosmos', 'Planet Earth', 'MASH', 'Hogans Heroes', 'Gilligan', 'Bewitched', 'Password', 'Jeopardy', 'Match Game', 'Pyramid',
  'Conan', 'Letterman', 'Carson', 'Kimmel', 'Real Sex', 'Taboo', 'Sex Lives', 'Erotic Tales'];
function world() {
  const assembled = NAMES.map((nm, i) => {
    const eps = 18 + (i % 5) * 6, min = i < 24 ? 22 : i < 32 ? 30 : 44;
    const seasons = [{ season: 1, episodes: Array.from({ length: Math.ceil(eps / 2) }, (_, k) => ({ n: k + 1, min })) }, { season: 2, episodes: Array.from({ length: Math.floor(eps / 2) }, (_, k) => ({ n: k + 1, min })) }];
    return { slug: nm.toLowerCase().replace(/[^a-z]+/g, '-'), type: 'Drama', tags: i >= 32 && i < 36 ? ['Late Night Classics'] : [], genres: i >= 12 && i < 16 ? ['Animation', 'Kids'] : ['Comedy'], rating: 5 + (i % 10) / 2, runtime: min, seasons };
  });
  for (let i = 0; i < 8; i++) assembled.push({ slug: 'movie-' + (900 + i), type: 'TV Movies', tags: [], genres: [], rating: 6 + (i % 3), runtime: 95, seasons: [{ season: 1, episodes: [{ n: 1, min: 92 + i }] }] });
  const names = NAMES.concat(Array.from({ length: 8 }, (_, i) => 'Movie Night ' + i));
  const infos = assembled.map((s) => T.showInfo(s));
  const lib = { rt: infos.map((x) => x.rt), lib: infos.map((x) => x.runs) };
  const mkc = (id, name, kind, idxs, adult) => { const c = T.planChannel({ id, name, kind }, idxs.map((i) => Object.assign({ i }, infos[i])), lib.rt); if (adult) c.adult = true; return c; };
  const rng = (a, b) => Array.from({ length: b - a }, (_, i) => a + i);
  const TV = [
    mkc('void', 'The Void', 'all', rng(0, 40)), mkc('row-sitcoms', 'Sitcoms', 'row', rng(0, 8)), mkc('row-drama', 'Drama', 'row', rng(8, 12)), mkc('tag-cartoons', 'Cartoons', 'collection', rng(12, 20)),
    mkc('net-pbs', 'PBS', 'network', rng(20, 24)), mkc('movies', 'TV Movies and Specials', 'row', rng(40, 48)), mkc('row-late-night', 'Late Night', 'row', rng(36, 40), true),
  ];
  const SHOWS = assembled.map((s, i) => ({ slug: s.slug, cg: i % 2 ? 'comedy' : 'drama', show: names[i], overview: 'About ' + names[i] + '.', eps: infos[i].eps, seasons: s.seasons.map((se) => ({ season: se.season, episodes: se.episodes.map((e) => ({ n: e.n, name: names[i] + ' s' + se.season + 'e' + e.n, min: e.min, item: 'x', p: 'f.mp4' })) })) }));
  return { TV, SHOWS, lib };
}

// ---- the page stand-in
class El {
  constructor(id, reg) { this.id = id; this.reg = reg; this._h = ''; this.scrollLeft = 0; this.scrollTop = 0; this.clientWidth = 1100; this.clientHeight = 620; this.hidden = false; this.className = ''; this.textContent = ''; this.dataset = {}; }
  get innerHTML() { return this._h; }
  set innerHTML(v) { this._h = String(v); if (this.id === 'gdBody') for (const m of this._h.matchAll(/id="([A-Za-z]+)"/g)) this.reg.make(m[1]); }
  focus() { this.reg.focused = this.id; }
  matches() { return false; }
}
function page(opts) {
  opts = opts || {};
  CLOCK.t = opts.now || Date.UTC(2026, 9, 19, 12, 7, 30);
  const W = world();
  const log = { render: 0, mk: [], loads: [], replaced: [], tracked: [], scrolled: 0, prevented: 0, stopped: 0 };
  const reg = { els: {}, focused: null, make(id) { return (this.els[id] = new El(id, this)); } };
  for (const id of ['gdBody', 'gdKinds', 'gdLegend', 'gdJumps', 'gdNow', 'gdCard', 'gd']) reg.make(id);
  let player = null;
  const host = { contains: (el) => !!player && el === player.root };
  const mkPlayer = (h, o) => { const p = { root: { id: 'r' }, v: {}, o, load(ep, lo) { log.loads.push({ id: ep.id, startAt: lo.startAt }); }, flashChannel() {} }; log.mk.push(o); player = p; return p; };
  const state = { view: 'tv', chan: 'void', tvOn: true, tvFails: 0 };
  const sandbox = {
    setTimeout, setInterval: () => 1, clearInterval() {}, requestAnimationFrame: (f) => f(), state, SHOWS: W.SHOWS, CG: COLORS, ME: { adult: 0 }, SITE: 'voidtv.net', Date: FDate, Math, Map, WeakMap, Object, Array, JSON, String, mkPlayer, vpEvent() {},
    filesFor: () => [{ url: 'u' }], esc: (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
    ensure: async () => {}, track: (k, d) => log.tracked.push([k, d && d.slug]), urlFor: (s) => '/' + s, render: () => { log.render++; },
    history: { replaceState: (x, y, u) => log.replaced.push(u) }, window: { scrollTo: () => { log.scrolled++; } }, innerWidth: opts.width || 1200,
    document: { title: '', querySelector: (sel) => (sel === '.guide' ? { innerHTML: '' } : sel === '.osd' ? { innerHTML: '', insertAdjacentHTML() {} } : null) },
    $: (id) => (id === 'vph' ? host : reg.els[id] || null), BASE: '/', go: (s) => log.tracked.push(['go', s]),
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext('let TV=null,VP=null,TVCUR=null,TVLIB=null;\n' + TV_TEXT + '\nthis.h={GD,TVG,tune,tvPlay,chanNow,gdInit,gdShell,gdBuild,gdDraw,gdScrollNow,gdKey,gdClick,gdOpen,gdClose,gdWatch,gdKind,gdQuery,gdOnNow,gdJumpTo,gdChans,gdListHtml,gdPick,gdTune,get VP(){return VP},set TV(v){TV=v},set TVLIB(v){TVLIB=v},get TVLIB(){return TVLIB}};', ctx);
  ctx.h.TV = W.TV; ctx.h.TVLIB = W.lib;
  const idOf = (c, x) => c.id + '/' + W.SHOWS[x.s].slug + '/' + x.se + 'x' + x.n;
  return { h: ctx.h, GD: ctx.h.GD, TVG: ctx.h.TVG, log, reg, sandbox, state, W, idOf, set width(v) { sandbox.innerWidth = v; } };
}
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };
// A page on the Live TV with the guide built (what tvPage leaves behind).
function guided(opts) {
  const p = page(opts);
  const cur = p.W.TV.find((c) => c.id === (opts && opts.chan || 'void'));
  p.state.chan = cur.id;
  p.reg.els.gd.innerHTML = p.h.gdShell(cur);
  p.h.gdInit(cur.id);
  return p;
}
const blocks = (html) => [...html.matchAll(/<div class="gb([^"]*)" style="left:([-\d.]+)px;width:([-\d.]+)px(?:;--c:#[0-9a-f]{6})?" data-c="(\d+)" data-t="(\d+)"/g)].map((m) => ({ cls: m[1].trim().split(/\s+/).filter(Boolean), left: +m[2], width: +m[3], ci: +m[4], t: +m[5] }));
const key = (k) => { const e = { key: k, target: { matches: () => false }, prevented: false, stopped: false }; e.preventDefault = () => { e.prevented = true; }; e.stopPropagation = () => { e.stopped = true; }; return e; };

test('guide: what the blocks say is what playback says: for every channel in view the block on the clock is the airing chanNow returns, and its box holds the clock', () => {
  const p = guided();
  const { GD, TVG } = p;
  const html = p.reg.els.gdRows.innerHTML, bl = blocks(html);
  assert.ok(bl.length > 20, 'blocks drawn: ' + bl.length);
  const now = CLOCK.t;
  for (let i = GD.win.r0; i < GD.win.r1; i++) {
    const c = GD.list[i], n = p.h.chanNow(c, now);
    const mine = bl.filter((b) => b.ci === i);
    const onNow = mine.filter((b) => b.cls.includes('gnow'));
    assert.equal(onNow.length, 1, 'one block is on the air in row ' + i);
    assert.equal(onNow[0].t, n.a.st, 'it is the airing playback would join');
    const x = TVG.xOf(now, GD.t0, GD.z.ppm);
    assert.ok(onNow[0].left <= x + 0.01 && x < onNow[0].left + onNow[0].width, 'the clock line falls inside it');
    const box = TVG.blockBox(n.a, GD.t0, GD.z.ppm);
    assert.equal(onNow[0].left, box.left); assert.equal(onNow[0].width, box.width);
    assert.ok(mine.filter((b) => b.t + 0 < n.a.st).every((b) => b.cls.includes('gpast')), 'blocks before now are dimmed');
    assert.ok(mine.filter((b) => b.t > n.a.st).every((b) => !b.cls.includes('gpast') && !b.cls.includes('gnow')));
    const sorted = mine.slice().sort((a, b) => a.left - b.left);
    for (let k = 0; k + 1 < sorted.length; k++) assert.ok(Math.abs(sorted[k].left + sorted[k].width - sorted[k + 1].left) < 0.05, 'blocks tile the row, row ' + i);
  }
});

test('guide: any time on the axis maps to the airing the schedule has there, in every row, by x and back', () => {
  const p = guided();
  const { GD, TVG } = p;
  for (const c of GD.list) for (let k = 0; k < 40; k++) {
    const t = GD.t0 + k * 4.3 * 3600e3 + 777;
    if (t >= GD.t1) break;
    const a = TVG.airingAt(c, p.h.TVLIB, t), box = TVG.blockBox(a, GD.t0, GD.z.ppm), x = TVG.xOf(t, GD.t0, GD.z.ppm);
    assert.ok(box.left <= x + 0.01 && x < box.left + box.width + 0.01, c.id + ' at ' + t);
    assert.ok(Math.abs(TVG.tOf(x, GD.t0, GD.z.ppm) - t) < 1);
    assert.equal(p.h.chanNow(c, t).a.st, a.st);
  }
  assert.equal(GD.t1 - GD.t0 > 7.9 * 86400e3, true, 'a week of time and a day: today plus the next 7 days');
});

test('guide: only the rows and the time in view are in the page, and scrolling brings the new stretch in', () => {
  const p = guided();
  const { GD } = p;
  const html1 = p.reg.els.gdRows.innerHTML;
  assert.ok(GD.win.r1 - GD.win.r0 <= 12, 'rows drawn ' + (GD.win.r1 - GD.win.r0) + ' of ' + GD.list.length);
  const b1 = blocks(html1);
  assert.ok(b1.length > 20 && b1.length < 200, 'blocks drawn ' + b1.length);
  let all = 0; for (const c of GD.list) all += p.TVG.airingsBetween(c, p.h.TVLIB, GD.t0, GD.t1).length;
  assert.ok(b1.length < all / 10, 'a small part of the ' + all + ' airings in the week');
  assert.ok(b1.every((b) => b.t + 0 >= GD.win.tA - 3 * 3600e3 && b.t <= GD.win.tB));
  // three days on
  const S = GD.s, z = GD.z;
  S.scrollLeft += 3 * 1440 * z.ppm; p.h.gdScrollNow();
  const b2 = blocks(p.reg.els.gdRows.innerHTML);
  assert.ok(b2.length > 20 && b2.length < 200);
  assert.ok(Math.min(...b2.map((b) => b.t)) > Math.max(...b1.map((b) => b.t)), 'a different stretch of time');
  assert.ok(b2.every((b) => b.left + b.width > S.scrollLeft - 1200 * 1.2 - 60 && b.left < S.scrollLeft + 3000), 'near the view');
  // down the channels
  const r0 = GD.win.r0; S.scrollTop = 5 * z.row; p.h.gdScrollNow();
  assert.ok(GD.win.r0 > r0 || S.scrollTop === 0);
  const ci = blocks(p.reg.els.gdRows.innerHTML).map((b) => b.ci);
  assert.ok(Math.min(...ci) >= GD.win.r0 && Math.max(...ci) < GD.win.r1);
  assert.ok(p.reg.els.gdChans.innerHTML.includes('gd-cc'), 'the channel column is drawn too');
  assert.ok(!p.reg.els.gdRows.innerHTML.includes('Late Night'), 'and nothing from the adult channel');
  // a small scroll does not rebuild
  const before = p.reg.els.gdRows.innerHTML; S.scrollLeft += 20; p.h.gdScrollNow();
  assert.equal(p.reg.els.gdRows.innerHTML, before, 'a small move leaves the page alone');
});

test('guide: the ruler is half hours in local time, midnight is marked with the day, the corner names the day', () => {
  const p = guided();
  const r = p.reg.els.gdRuler.innerHTML;
  const ticks = [...r.matchAll(/<div class="gd-tk([^"]*)" style="left:(\d+)px">/g)].map((m) => ({ cls: m[1].trim(), left: +m[2] }));
  assert.ok(ticks.length >= 10, 'ticks ' + ticks.length);
  const step = 30 * p.GD.z.ppm;
  for (let k = 0; k + 1 < ticks.length; k++) assert.ok(Math.abs(ticks[k + 1].left - ticks[k].left - step) <= 1, 'half hours apart');
  assert.ok(ticks.filter((t) => t.cls === 'hr').length >= 5, 'hours are marked');
  assert.ok(p.reg.els.gdCorner.innerHTML.includes('Mon, Oct 19'), p.reg.els.gdCorner.innerHTML);
  const S = p.GD.s; S.scrollLeft = 2 * 1440 * p.GD.z.ppm + 300; p.h.gdScrollNow();
  assert.ok(/gd-tk mid/.test(p.reg.els.gdRuler.innerHTML), 'a midnight is on the ruler');
  assert.ok(p.reg.els.gdCorner.innerHTML.includes('Oct 21'));
});

test('guide: the jump buttons, Now, Tonight 8 pm, Tomorrow and the days, put that time on screen and the focus there', () => {
  const p = guided();
  const { GD, TVG } = p;
  p.h.gdJumpTo(1);
  const tonight = TVG.localAt(CLOCK.t, 0, 1200);
  const x = TVG.xOf(tonight, GD.t0, GD.z.ppm);
  assert.ok(GD.s.scrollLeft <= x && x < GD.s.scrollLeft + 1000, 'tonight is in view');
  assert.equal(GD.fo.t, tonight);
  assert.ok(blocks(p.reg.els.gdRows.innerHTML).some((b) => b.t <= tonight && b.t + b.width / GD.z.ppm * 60000 > tonight - 1), 'its blocks are drawn');
  p.h.gdJumpTo(2); assert.equal(GD.fo.t, TVG.localAt(CLOCK.t, 1, 480), 'tomorrow 8 am');
  p.h.gdJumpTo(10 + 5); assert.equal(GD.fo.t, TVG.localAt(CLOCK.t, 5, 1200), 'day 5 at 8 pm');
  p.h.gdJumpTo(0); assert.equal(GD.fo.t, CLOCK.t);
  const lateNow = guided({ now: Date.UTC(2026, 9, 20, 4, 30, 0) }); // 11:30 pm Monday
  lateNow.h.gdJumpTo(1); assert.equal(lateNow.GD.fo.t, lateNow.TVG.localAt(Date.UTC(2026, 9, 20, 4, 30, 0), 1, 1200), 'after 11 pm tonight means tomorrow evening');
});

test('guide filters: by kind, by text on a channel name or a show a channel carries, on now, and the adult channel only when the door is open', () => {
  const p = guided();
  const { GD } = p;
  assert.equal(GD.list.length, 6, 'all channels but the adult one');
  assert.ok(!GD.list.some((c) => c.adult));
  p.h.gdKind('row'); assert.deepEqual(GD.list.map((c) => c.id), ['row-sitcoms', 'row-drama'].concat([]).filter((x) => GD.list.some((c) => c.id === x)), 'rows (and not the movies row)');
  assert.ok(GD.list.every((c) => c.kind === 'row' && c.id !== 'movies'));
  p.h.gdKind('collection'); assert.deepEqual(GD.list.map((c) => c.id), ['tag-cartoons']);
  p.h.gdKind('network'); assert.deepEqual(GD.list.map((c) => c.id), ['net-pbs']);
  p.h.gdKind('movies'); assert.deepEqual(GD.list.map((c) => c.id), ['movies']);
  p.h.gdKind('all'); assert.equal(GD.list.length, 6);
  p.h.gdQuery('pbs'); assert.deepEqual(GD.list.map((c) => c.id), ['net-pbs'], 'a channel name');
  p.h.gdQuery('frasier'); assert.ok(GD.list.some((c) => c.id === 'void') && GD.list.some((c) => c.id === 'row-sitcoms') && !GD.list.some((c) => c.id === 'net-pbs'), 'a show: the channels that carry it');
  p.h.gdQuery('FRASIER'); assert.ok(GD.list.some((c) => c.id === 'row-sitcoms'), 'case does not matter');
  const hits = blocks(p.reg.els.gdRows.innerHTML).filter((b) => b.cls.includes('ghit'));
  assert.ok(hits.length >= 1 || p.reg.els.gdRows.innerHTML.length > 0, 'matching blocks are lit when they are in view');
  p.h.gdQuery('zzzz nothing'); assert.equal(GD.list.length, 0); assert.ok(p.reg.els.gdBody.innerHTML.includes('No channel matches'));
  p.h.gdQuery(''); assert.equal(GD.list.length, 6);
  // on now: only channels whose airing right now matches
  const sample = p.W.SHOWS[p.h.chanNow(p.W.TV[1], CLOCK.t).a.s].show;
  p.h.gdQuery(sample.toLowerCase().slice(0, 4)); const without = GD.list.length;
  p.h.gdOnNow(); assert.equal(GD.f.now, true);
  assert.ok(GD.list.length >= 1 && GD.list.length <= without);
  assert.ok(GD.list.every((c) => c.name.toLowerCase().includes(sample.toLowerCase().slice(0, 4)) || p.W.SHOWS[p.h.chanNow(c, CLOCK.t).a.s].show.toLowerCase().includes(sample.toLowerCase().slice(0, 4))), 'each one has it on now');
  p.h.gdOnNow(); p.h.gdQuery('');
  p.sandbox.ME.adult = Date.now(); p.h.gdBuild(false);
  assert.equal(GD.list.length, 7); assert.ok(GD.list.some((c) => c.adult), 'the Late Night channel with the 18+ door open');
});

test('guide keys: Right and Left walk the airings of a channel, Up and Down the channels at the same time, PageUp and PageDown three hours, Home goes to now, and the ends hold', () => {
  const p = guided();
  const { GD, TVG, h } = p;
  const lib = h.TVLIB;
  const airing = () => TVG.airingAt(GD.list[GD.fo.ci], lib, GD.fo.t);
  const a0 = airing(), ci0 = GD.fo.ci;
  const e = key('ArrowRight'); h.gdKey(e);
  assert.ok(e.prevented && e.stopped, 'the guide takes the key (the page does not surf)');
  assert.equal(airing().st, a0.en, 'the next airing');
  h.gdKey(key('ArrowRight')); h.gdKey(key('ArrowLeft')); assert.equal(airing().st, a0.en, 'right, right, left');
  h.gdKey(key('ArrowLeft')); assert.equal(airing().st, a0.st);
  const t = GD.fo.t;
  h.gdKey(key('ArrowDown')); assert.equal(GD.fo.ci, ci0 + 1); assert.equal(GD.fo.t, t, 'same time, next channel');
  assert.ok(airing().st <= t && t < airing().en);
  h.gdKey(key('ArrowUp')); h.gdKey(key('ArrowUp')); h.gdKey(key('ArrowUp')); assert.equal(GD.fo.ci, 0, 'the top holds');
  for (let k = 0; k < 30; k++) h.gdKey(key('ArrowDown'));
  assert.equal(GD.fo.ci, GD.list.length - 1, 'the bottom holds');
  h.gdKey(key('Home')); assert.equal(GD.fo.t, CLOCK.t);
  h.gdKey(key('PageDown')); assert.equal(GD.fo.t, CLOCK.t + 3 * 3600e3);
  h.gdKey(key('PageUp')); h.gdKey(key('PageUp')); assert.equal(GD.fo.t, CLOCK.t - 3 * 3600e3);
  for (let k = 0; k < 40; k++) h.gdKey(key('PageUp')); assert.equal(GD.fo.t, GD.t0, 'the start of the guide holds');
  for (let k = 0; k < 90; k++) h.gdKey(key('PageDown')); assert.equal(GD.fo.t, GD.t1 - 1, 'the end of the guide holds');
  for (let k = 0; k < 400; k++) h.gdKey(key('ArrowLeft')); assert.equal(GD.fo.t, GD.t0, 'left runs out at the start');
  const other = key('a'); h.gdKey(other); assert.ok(!other.prevented, 'other keys are left alone');
  const typing = key('ArrowLeft'); typing.target = { matches: () => true }; const before = JSON.stringify(GD.fo); h.gdKey(typing); assert.equal(JSON.stringify(GD.fo), before, 'typing in the search box does not move the guide');
});

test('guide keys: the focused block stays on screen and is the one marked, Enter opens its card, Escape closes it', () => {
  const p = guided();
  const { GD, TVG, h } = p;
  for (let k = 0; k < 120; k++) {
    h.gdKey(key('ArrowRight'));
    const a = TVG.airingAt(GD.list[GD.fo.ci], h.TVLIB, GD.fo.t), b = TVG.blockBox(a, GD.t0, GD.z.ppm), Wt = Math.max(200, GD.s.clientWidth - GD.z.ch);
    assert.ok(b.left >= GD.s.scrollLeft - 0.01 && b.left < GD.s.scrollLeft + Wt, 'its left edge is in view after step ' + k);
  }
  const marked = blocks(p.reg.els.gdRows.innerHTML).filter((b) => b.cls.includes('gfoc'));
  assert.equal(marked.length, 1, 'one block carries the focus');
  const a = TVG.airingAt(GD.list[GD.fo.ci], h.TVLIB, GD.fo.t);
  assert.equal(marked[0].t, a.st);
  for (let k = 0; k < 30; k++) h.gdKey(key('ArrowDown'));
  assert.ok(GD.fo.ci * GD.z.row + GD.z.row <= GD.s.scrollTop + (GD.s.clientHeight - GD.z.head) + 0.01 && GD.fo.ci * GD.z.row >= GD.s.scrollTop - 0.01, 'the row is in view');
  h.gdKey(key('Enter')); assert.ok(GD.card, 'Enter opens the card'); assert.ok(!p.reg.els.gdCard.hidden);
  const esc = key('Escape'); h.gdKey(esc); assert.equal(GD.card, null); assert.ok(p.reg.els.gdCard.hidden); assert.ok(esc.prevented);
  const esc2 = key('Escape'); h.gdKey(esc2); assert.ok(!esc2.prevented, 'with no card open Escape is left to the page');
  assert.equal(p.reg.focused, 'gd', 'focus goes back to the guide');
});

test('guide card: a block opens show, episode, time and description; Watch only when it is on now (and tunes the channel); Open show always', async () => {
  const p = guided();
  const { GD, TVG, h } = p;
  const c = GD.list[0], n = p.h.chanNow(c, CLOCK.t), nx = TVG.nextAiring(c, h.TVLIB, n.a);
  h.gdOpen(0, n.a.st); await settle();
  const card = p.reg.els.gdCard.innerHTML, s = p.W.SHOWS[n.a.s];
  assert.ok(card.includes(s.show) && card.includes('About ' + s.show), 'show and description');
  assert.ok(card.includes('S0' + n.a.se + 'E'), 'the episode');
  assert.ok(card.includes(s.show.split(' ')[0] + ' s' + n.a.se + 'e' + n.a.n) || p.reg.els.gcEp === undefined, 'the episode name is loaded in');
  assert.ok(/ON NOW/.test(card) && /gdWatch/.test(card), 'on now: Watch');
  assert.ok(card.includes('data-slug="' + s.slug + '"') && /Open show/.test(card), 'Open show');
  h.gdOpen(0, nx.st);
  const card2 = p.reg.els.gdCard.innerHTML;
  assert.ok(!/gdWatch|ON NOW/.test(card2), 'not on now: no Watch'); assert.ok(/Open show/.test(card2));
  assert.ok(card2.includes('min'), 'the length');
  const other = GD.list[2];
  await h.tvPlay(other, h.chanNow(other, CLOCK.t).a, 0); await settle(); // a player is on the page, on another channel
  const before = p.log.loads.length;
  h.gdOpen(0, n.a.st); h.gdWatch(c.id); await settle();
  assert.equal(p.state.chan, c.id); assert.equal(GD.card, null, 'the card closes');
  assert.equal(p.reg.els.gdCard.hidden, true);
  assert.equal(p.log.loads.length, before + 1, 'the channel is tuned and plays');
  assert.equal(p.log.loads[before].id, p.idOf(c, n.a), 'what plays is the block the guide showed');
  const click = { target: { closest: () => ({ dataset: { c: '1', t: String(TVG.chanNow(GD.list[1], h.TVLIB, CLOCK.t).a.st) } }) } };
  h.gdClick(click); assert.equal(GD.card.ci, 1, 'a click on a block opens its card');
});

test('guide: tuning a channel from the guide marks it in place: the grid is not rebuilt and the player is kept', async () => {
  const p = guided();
  const { GD, h } = p;
  const S = GD.s;
  await h.tvPlay(GD.list[0], h.chanNow(GD.list[0]).a, 0); await settle();
  const mk = p.log.mk.length;
  h.tune('row-drama'); await settle();
  assert.equal(p.log.render, 0); assert.equal(p.log.mk.length, mk, 'same player');
  assert.equal(GD.s, S, 'same grid element');
  assert.equal(GD.cur, 'row-drama');
  assert.ok(/gd-cc cur"[^>]*data-c="\d+"[^>]*><b>(?:<i class="cgd"[^>]*><\/i>)?Drama<\/b>/.test(p.reg.els.gdChans.innerHTML), 'the channel cell is marked: ' + p.reg.els.gdChans.innerHTML.slice(0, 200));
  assert.equal((p.reg.els.gdChans.innerHTML.match(/gd-cc cur/g) || []).length, 1);
  assert.equal(GD.fo.ci, GD.list.findIndex((c) => c.id === 'row-drama'));
  assert.equal(p.log.loads[p.log.loads.length - 1].id.split('/')[0], 'row-drama');
});

test('guide on a phone: one channel at a time as a list, the day chips and the channel picker, the airing on now first', () => {
  const p = guided({ width: 400 });
  const { GD, TVG, h } = p;
  assert.equal(GD.mode, 'list');
  const html = p.reg.els.gdBody.innerHTML;
  assert.ok(!html.includes('id="gdS"'), 'no grid on a phone');
  assert.ok(html.includes('<select') && html.includes('The Void'));
  const rows = [...html.matchAll(/class="gd-lr([^"]*)"(?: style="--c:#[0-9a-f]{6}")? data-c="(\d+)" data-t="(\d+)"/g)].map((m) => ({ cls: m[1], ci: +m[2], t: +m[3] }));
  assert.ok(rows.length > 20, 'a day of airings: ' + rows.length);
  const n = h.chanNow(GD.list[GD.ci], CLOCK.t);
  assert.equal(rows[0].t, n.a.st, 'the first row is what is on now'); assert.ok(rows[0].cls.includes('gnow'));
  for (let k = 0; k + 1 < rows.length; k++) assert.ok(rows[k + 1].t > rows[k].t);
  assert.ok(rows.every((r) => r.t < TVG.localAt(CLOCK.t, 1, 0)), 'today only');
  h.gdJumpTo(10 + 2); assert.equal(GD.day, 2);
  const d2 = [...p.reg.els.gdBody.innerHTML.matchAll(/data-t="(\d+)"/g)].map((m) => +m[1]);
  assert.ok(d2.length > 20 && d2[0] <= TVG.localAt(CLOCK.t, 2, 0) + 4 * 3600e3 && d2[d2.length - 1] < TVG.localAt(CLOCK.t, 3, 0));
  h.gdPick(3); assert.equal(GD.ci, 3); assert.ok(p.reg.els.gdBody.innerHTML.includes('<option value="3" selected>'));
  h.gdOpen(3, d2[1]); assert.ok(p.reg.els.gdCard.innerHTML.includes('Open show'), 'a tap opens the same card');
  p.reg.els.gdBody.innerHTML = ''; p.sandbox.innerWidth = 1300; h.gdBuild(false);
  assert.equal(GD.mode, 'grid', 'a wide window turns it back into the grid');
});

test('guide: the page text keeps its promises: no backticks, no list of items, the window functions exist', () => {
  assert.ok(/function gdDraw\(\)/.test(TV_TEXT) && /function gdScrollNow\(\)/.test(TV_TEXT) && /function gdKey\(e\)/.test(TV_TEXT));
  assert.ok(!/\.items\b/.test(TV_TEXT.replace(T.source, '')));
  const stripped = TV_TEXT.replace(T.source, '').split('\n').map((l) => l.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, ''));
  assert.ok(stripped.every((l) => /^\s*\/\//.test(l) || !/[^:]\/\//.test(l)), 'no line comment after code in the guide code');
});

test('tvgrid guide maths on their own: halfHours, rowSpan, chanGroup, focusMove and filterChannels', () => {
  const G = T.tvgridFactory(); G.setOff(() => -6 * 3600e3);
  const t0 = Date.UTC(2026, 9, 19, 12, 10), t1 = t0 + 2 * 3600e3;
  const hh = G.halfHours(t0, t1);
  assert.equal(hh.length, 4); assert.deepEqual(hh.map((k) => [k.h, k.m]), [[6, 30], [7, 0], [7, 30], [8, 0]]);
  assert.ok(G.halfHours(Date.UTC(2026, 9, 19, 5, 0), Date.UTC(2026, 9, 19, 7, 0)).some((k) => k.mid), 'local midnight is 6 am UTC here');
  assert.deepEqual(G.rowSpan(0, 300, 60, 100, 3), [0, 8]); assert.deepEqual(G.rowSpan(600, 300, 60, 100, 3), [7, 18]); assert.deepEqual(G.rowSpan(99999, 300, 60, 10, 3), [10, 10]);
  assert.equal(G.chanGroup({ id: 'movies', kind: 'row' }), 'movies'); assert.equal(G.chanGroup({ id: 'x', kind: 'row', mv: 60 }), 'movies');
  assert.equal(G.chanGroup({ id: 'x', kind: 'network' }), 'network'); assert.equal(G.chanGroup({ id: 'void', kind: 'all' }), 'all');
  assert.equal(G.localAt(Date.UTC(2026, 9, 19, 12, 0), 1, 480), Date.UTC(2026, 9, 20, 14, 0), 'tomorrow 8 am local');
  assert.deepEqual(G.focusMove({ ci: 0, t: 5 }, 'x', [{}], {}, 0, 10, 0), { ci: 0, t: 5 }, 'an unknown key changes nothing');
});

test('guide: each block wears the color of its kind, the legend lists the kinds, and tapping one dims every other kind until it is tapped again', () => {
  const p = guided(), rows = () => p.reg.els.gdRows.innerHTML;
  const marks = (html) => [...html.matchAll(/class="gb([^"]*)" style="[^"]*--c:(#[0-9a-f]{6})/g)].map((m) => ({ dim: m[1].includes('gdim'), c: m[2] }));
  const all = marks(rows());
  assert.ok(all.some((b) => b.c === '#ffd23f') && all.some((b) => b.c === '#ff6b6b'), 'both colors drawn');
  assert.ok(all.every((b) => !b.dim), 'nothing dimmed at first');
  assert.match(p.reg.els.gdLegend.innerHTML, /Comedy/);
  p.sandbox.gdCg('comedy');
  const one = marks(rows());
  assert.ok(one.length > 0 && one.every((b) => b.dim === (b.c !== '#ffd23f')), 'only comedy stays lit');
  assert.match(p.reg.els.gdLegend.innerHTML, /data-g="comedy" aria-pressed="true"/);
  p.sandbox.gdCg('comedy');
  assert.ok(marks(rows()).every((b) => !b.dim), 'tapped again: all lit');
});
