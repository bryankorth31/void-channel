// Live TV as a schedule (scripts/lib/tvgrid.js; design in audit/drafts/tv-grid-design.md): the builder and the pure schedule.
// Run: node --test tests/tvgrid.test.js
// Made-up shows only. The schedule is tested in a fixed zone (UTC minus 6 hours, no daylight saving) so the answers do not
// depend on the machine, plus one run through a fake daylight saving switch.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const T = require('../scripts/lib/tvgrid');

const H = 3600e3;
const OFF6 = () => -6 * H;
// A local wall-clock moment (UTC minus 6) as an instant.
const at = (y, mo, d, h, mi) => Date.UTC(y, mo - 1, d, h + 6, mi || 0);
const sched = () => { const G = T.tvgridFactory(); G.setOff(OFF6); return G; };
const MON = [2026, 10, 19], SAT = [2026, 10, 24]; // 19 Oct 2026 is a Monday

let n = 0;
// An assembled show, as scripts/lib/app.js hands it to the builder.
function mk(over) {
  n++;
  const o = Object.assign({ slug: 'show-' + n, type: 'Drama', tags: [], genres: ['Comedy'], rating: 7, runtime: 30, eps: 20, min: 22, seasons: 2 }, over);
  const per = Math.ceil(o.eps / o.seasons);
  const seasons = [];
  for (let se = 1, left = o.eps; left > 0; se++) { const k = Math.min(per, left); seasons.push({ season: se, episodes: Array.from({ length: k }, (_, i) => ({ n: i + 1, min: o.min })) }); left -= k; }
  return Object.assign({}, o, { seasons });
}
// A channel built the way scripts/lib/app.js builds one: shows, then the plan. Returns the channel and the library.
function chan(shows, meta) {
  const infos = shows.map((s) => T.showInfo(s));
  const lib = { rt: infos.map((x) => x.rt), lib: infos.map((x) => x.runs) };
  const recs = shows.map((s, i) => Object.assign({ i }, infos[i]));
  const ch = T.planChannel(Object.assign({ id: 'test', name: 'Test', kind: 'all' }, meta), recs, lib.rt);
  return { ch, lib, shows };
}
// A normal channel: 60 sitcoms (22 minutes), 6 kids shows, 8 late shows, with ratings that differ.
function big() {
  const shows = [];
  for (let i = 0; i < 60; i++) shows.push(mk({ rating: 5 + (i % 40) / 10, eps: 24 + (i % 5) * 20, min: 22 + (i % 3) }));
  for (let i = 0; i < 8; i++) shows.push(mk({ kids: 1, genres: ['Animation', 'Kids'], rating: 6, eps: 40, min: 22 }));
  for (let i = 0; i < 8; i++) shows.push(mk({ type: 'Adult Swim', genres: ['Animation', 'Comedy'], rating: 7, eps: 30, min: 11 }));
  return chan(shows);
}

test('showInfo: typical minutes are the median of the episode lengths, runs are [season, first number, count], flags follow the genres', () => {
  const s = mk({ eps: 5, seasons: 1, min: 22 });
  s.seasons[0].episodes[2].min = 40; s.seasons[0].episodes[3].n = 9; s.seasons[0].episodes[4].n = 10;
  const i = T.showInfo(s);
  assert.equal(i.rt, 22); assert.equal(i.eps, 5);
  assert.deepEqual(i.runs, [1, 1, 3, 1, 9, 2], 'episodes 1 to 3, then 9 and 10');
  assert.equal(T.showInfo(mk({ genres: ['Animation', 'Kids'] })).kids, true);
  assert.equal(T.showInfo(mk({ genres: ['Animation', 'Action & Adventure'] })).kids, true, 'an action cartoon is a Saturday morning cartoon');
  assert.equal(T.showInfo(mk({ genres: ['Animation', 'Comedy'] })).kids, false, 'adult animation is not');
  assert.equal(T.showInfo(mk({ type: 'Adult Swim', genres: ['Animation', 'Kids'] })).kids, false, 'and neither is anything Adult Swim');
  assert.equal(T.showInfo(mk({ type: 'Adult Swim' })).late, true);
  assert.equal(T.showInfo(mk({ tags: ['Late Night Classics'] })).late, true);
  assert.equal(T.showInfo(mk({ slug: 'movie-12', eps: 1, min: 95 })).movie, true);
  assert.equal(T.showInfo(mk({ slug: 'movie-12', eps: 1, min: 95 })).rt, 95);
  assert.equal(T.showInfo(mk({ min: 0, runtime: 0, eps: 3 })).rt, 30, 'no lengths at all: a half hour');
});

test('planChannel: kids feed Morning, late shows feed Late night, the strongest shows lead Prime time, pools are never empty on a channel with shows', () => {
  const { ch, lib } = big();
  assert.equal(ch.shows, 76);
  assert.ok(ch.p.m.slice(0, 8).every((i) => i >= 60 && i < 68), 'the 8 kids shows lead the morning pool');
  assert.ok(ch.p.l.slice(0, 8).every((i) => i >= 68), 'the 8 late shows lead the late pool');
  const rating = (i) => 5 + (i % 40) / 10;
  const topP = ch.p.p.slice(0, 5).map(rating);
  const topD = ch.p.d.slice(0, 5).map(rating);
  assert.ok(Math.min(...topP) >= Math.max(...topD), 'prime time holds the best rated of the rest, daytime what is below them');
  for (const k of ['m', 'd', 'e', 'p', 'l', 'o']) assert.ok(ch.p[k] && ch.p[k].length >= 6, 'pool ' + k + ' has ' + (ch.p[k] || []).length);
  assert.ok(ch.cap >= 2 && ch.cap <= 3);
  assert.equal(ch.rd, '', 'series pools rotate weekly');
  assert.ok(lib.rt.every((x) => x >= 5));
});

test('planChannel: a channel with movies gets a movie pool that rotates daily; a channel of only movies is all daily', () => {
  const shows = [];
  for (let i = 0; i < 20; i++) shows.push(mk({ rating: 6 + (i % 4) }));
  for (let i = 0; i < 9; i++) shows.push(mk({ slug: 'movie-' + (100 + i), eps: 1, seasons: 1, min: 90 + i, rating: 5 + i / 2 }));
  const { ch } = chan(shows);
  assert.equal(ch.p.v.length, 9);
  assert.ok(ch.rd.includes('v'));
  assert.ok(ch.mv >= 25 && ch.mv <= 35, 'mv is the share of movies: ' + ch.mv);
  assert.ok(!ch.p.p.some((i) => i >= 20), 'the movies are not also in the series pools');
  const only = chan(shows.slice(20).concat(Array.from({ length: 30 }, (_, i) => mk({ slug: 'movie-' + (200 + i), eps: 1, seasons: 1, min: 85 + (i % 20), rating: 5 + (i % 10) / 3 }))));
  assert.ok(only.ch.rd.includes('p') && only.ch.rd.includes('d') && only.ch.rd.includes('v'));
});

test('planChannel and the schedule are deterministic: the same shows give the same plan, the same plan gives the same day', () => {
  const a = big(), b = big();
  assert.equal(JSON.stringify(a.ch).replace(/"slug":"[^"]*"/g, ''), JSON.stringify(b.ch).replace(/"slug":"[^"]*"/g, ''));
  const G1 = sched(), G2 = sched();
  const bd = G1.dayOf(at(...MON, 12, 0));
  const x = G1.dayAirings(a.ch, a.lib, bd).map((q) => [q.s, q.i, q.st, q.en]);
  const y = G2.dayAirings(b.ch, b.lib, bd).map((q) => [q.s, q.i, q.st, q.en]);
  assert.deepEqual(x, y);
  assert.deepEqual(G1.dayAirings(a.ch, a.lib, bd).map((q) => [q.s, q.i, q.st, q.en]), x, 'asked twice, the same');
});

test('the airings of a day tile it: first at 6:00 am local, each ends where the next starts, the last at 6:00 am next day, at least 20 of them', () => {
  const G = sched(); const { ch, lib } = big();
  for (let d = 0; d < 7; d++) {
    const t = at(2026, 10, 19 + d, 12, 0), bd = G.dayOf(t);
    const list = G.dayAirings(ch, lib, bd);
    assert.ok(list.length >= 20, 'airings on day ' + d + ': ' + list.length);
    assert.equal(list[0].st, at(2026, 10, 19 + d, 6, 0));
    for (let k = 0; k + 1 < list.length; k++) { assert.equal(list[k].en, list[k + 1].st); assert.ok(list[k].en > list[k].st); }
    assert.equal(list[list.length - 1].en, at(2026, 10, 20 + d, 6, 0));
  }
});

test('dayparts: each daypart starts at its anchor or a little after, prime time starts at 8 pm within 30 minutes', () => {
  const G = sched(); const { ch, lib } = big();
  const anchors = { m: 6, d: 9, e: 17, p: 20, l: 23, o: 26 };
  for (let d = 0; d < 7; d++) {
    const base = at(2026, 10, 19 + d, 0, 0);
    const list = G.dayAirings(ch, lib, G.dayOf(at(2026, 10, 19 + d, 12, 0)));
    const sat = d === 5;
    for (const [k, h] of Object.entries(anchors)) {
      if (sat && (k === 'd')) continue;
      const first = list.find((a) => a.k === k);
      assert.ok(first, 'a ' + k + ' airing on day ' + d);
      const late = (first.st - (base + h * H)) / 60000;
      assert.ok(late >= 0 && late <= 30, k + ' starts ' + late + ' minutes after its anchor on day ' + d);
    }
  }
});

test('Saturday morning: on Saturday the morning block runs to noon and is the kids pool', () => {
  const G = sched(); const { ch, lib } = big();
  const list = G.dayAirings(ch, lib, G.dayOf(at(...SAT, 12, 0)));
  const morning = list.filter((a) => a.st < at(...SAT, 12, 0));
  assert.ok(morning.length >= 12, 'six hours of cartoons: ' + morning.length);
  assert.ok(morning.every((a) => a.k === 'm'));
  const kidsShare = morning.filter((a) => a.s >= 60 && a.s < 68).length / morning.length;
  assert.ok(kidsShare >= 0.9, 'kids share ' + kidsShare);
  const weekday = G.dayAirings(ch, lib, G.dayOf(at(...MON, 12, 0)));
  assert.ok(weekday.filter((a) => a.st < at(...MON, 12, 0)).some((a) => a.k === 'd'), 'on a weekday daytime starts at 9');
});

test('strips: Monday to Friday hold the same shows at the same times; each airs one episode more per day and wraps at the end of the show', () => {
  const G = sched(); const { ch, lib } = big();
  const days = [0, 1, 2, 3, 4].map((d) => G.dayAirings(ch, lib, G.dayOf(at(2026, 10, 19 + d, 12, 0))));
  for (let d = 1; d < 5; d++) {
    assert.deepEqual(days[d].map((a) => a.s), days[0].map((a) => a.s), 'same shows in the same order, day ' + d);
    assert.deepEqual(days[d].map((a) => a.en - a.st), days[0].map((a) => a.en - a.st));
  }
  // a show that airs once a day moves one episode a day (mod its length)
  const once = {}; for (const a of days[0]) once[a.s] = (once[a.s] || 0) + 1;
  let checked = 0;
  days[0].forEach((a, u) => {
    if (once[a.s] !== 1) return;
    const E = G.epTotal(lib, a.s);
    for (let d = 1; d < 5; d++) assert.equal(days[d][u].i, (days[0][u].i + d) % E, 'show ' + a.s + ' day ' + d);
    checked++;
  });
  assert.ok(checked > 15, 'strips checked: ' + checked);
  // wrapping: a 5 episode show comes back to its first episode after 5 airings
  const small = chan([mk({ eps: 5, seasons: 1 })]);
  const seen = []; for (let d = 0; d < 7; d++) seen.push(G.dayAirings(small.ch, small.lib, G.dayOf(at(2026, 10, 19 + d, 12, 0)))[0].i);
  assert.ok(seen.every((v) => v >= 0 && v < 5));
  assert.equal(seen[0] + 0, seen[0]);
  const lst = G.dayAirings(small.ch, small.lib, G.dayOf(at(...MON, 12, 0)));
  for (let k = 5; k < lst.length; k++) assert.equal(lst[k].i, lst[k - 5].i, 'a 5 episode show repeats every 5 airings in a day');
});

test('rotation: the next week brings other shows into the places, and the weekend is not the weekday', () => {
  const G = sched();
  // 76 shows cannot rotate much (a day needs about 55), so the places are compared on that channel and the shows on a channel of 400
  const { ch, lib } = big();
  const day = (c, l, y, m, d) => G.dayAirings(c, l, G.dayOf(at(y, m, d, 12, 0))).map((a) => a.s);
  const samePlace = (a, b) => a.filter((x, u) => x === b[u]).length / Math.max(a.length, b.length);
  const mon = day(ch, lib, 2026, 10, 19), nextMon = day(ch, lib, 2026, 10, 26), sat = day(ch, lib, 2026, 10, 24), sun = day(ch, lib, 2026, 10, 25);
  assert.ok(samePlace(mon, nextMon) < 0.3, 'places that kept their show next Monday: ' + samePlace(mon, nextMon));
  assert.ok(samePlace(mon, sat) < 0.3, 'places that kept their show on Saturday: ' + samePlace(mon, sat));
  assert.notDeepEqual(sat, sun);
  const shows = [];
  for (let i = 0; i < 400; i++) shows.push(mk({ rating: 5 + (i % 40) / 10, eps: 30 + (i % 7) * 10, min: 22 + (i % 3) }));
  const bigger = chan(shows);
  const a = day(bigger.ch, bigger.lib, 2026, 10, 19), b = day(bigger.ch, bigger.lib, 2026, 10, 26), c = day(bigger.ch, bigger.lib, 2026, 11, 2);
  const overlap = (x, y) => x.filter((v) => y.includes(v)).length / x.length;
  assert.ok(overlap(a, b) < 0.4, 'shows that stayed on next Monday: ' + overlap(a, b));
  assert.ok(overlap(a, c) < 0.4 && overlap(b, c) < 0.4);
});

test('variety: no show airs more than the channel cap in a day, and a normal channel puts many different shows on', () => {
  const G = sched(); const { ch, lib } = big();
  for (let d = 0; d < 14; d++) {
    const list = G.dayAirings(ch, lib, G.dayOf(at(2026, 10, 19 + d, 12, 0)));
    const per = {}; for (const a of list) per[a.s] = (per[a.s] || 0) + 1;
    assert.ok(Math.max(...Object.values(per)) <= ch.cap, 'day ' + d + ' max ' + Math.max(...Object.values(per)) + ' cap ' + ch.cap);
    assert.ok(Object.keys(per).length >= 30, 'distinct shows ' + Object.keys(per).length);
  }
});

test('movie night: a channel with movies airs one movie at 8 pm, a different one each night', () => {
  const G = sched();
  const shows = [];
  for (let i = 0; i < 24; i++) shows.push(mk({ rating: 6 + (i % 4) }));
  for (let i = 0; i < 10; i++) shows.push(mk({ slug: 'movie-' + (300 + i), eps: 1, seasons: 1, min: 100, rating: 7 }));
  const { ch, lib } = chan(shows);
  const names = [];
  for (let d = 0; d < 10; d++) {
    const list = G.dayAirings(ch, lib, G.dayOf(at(2026, 10, 19 + d, 12, 0)));
    const mv = list.filter((a) => a.k === 'v');
    assert.equal(mv.length, 1, 'one movie on day ' + d);
    assert.equal(list.find((a) => a.k === 'p' || a.k === 'v').k, 'v', 'the movie opens prime time');
    assert.ok(Math.abs(mv[0].st - at(2026, 10, 19 + d, 20, 0)) <= 8 * 60000, 'at 8 pm');
    names.push(mv[0].s);
  }
  assert.equal(new Set(names).size, 10, 'ten nights, ten different movies');
});

test('small channels: two shows of 5 minutes fill the whole day with no hole and the plan ends', () => {
  const G = sched();
  const { ch, lib } = chan([mk({ eps: 14, seasons: 1, min: 5, runtime: 5 }), mk({ eps: 8, seasons: 1, min: 7, runtime: 7 })]);
  const list = G.dayAirings(ch, lib, G.dayOf(at(...MON, 12, 0)));
  assert.ok(list.length > 100);
  const gaps = list.map((a) => (a.en - a.st - a.du * 60000) / 60000).filter((g) => g > 15);
  assert.equal(gaps.length, 0, 'no stretch of more than 15 minutes without an airing');
  const one = chan([mk({ eps: 3, seasons: 1, min: 20 })]);
  assert.ok(G.dayAirings(one.ch, one.lib, G.dayOf(at(...MON, 12, 0))).length > 40, 'a one show channel repeats it all day');
});

test('what is on now: chanNow finds the airing, seconds into it and seconds left, and it is the one the guide lists', () => {
  const G = sched(); const { ch, lib } = big();
  let probes = 0;
  for (let d = 0; d < 3; d++) for (let mi = 0; mi < 1440; mi += 7) {
    const t = at(2026, 10, 19 + d, 0, mi) + 13 * 1000;
    const n = G.chanNow(ch, lib, t);
    assert.ok(n.a.st <= t && t < n.a.en, 'inside its airing');
    assert.ok(Math.abs(n.offset + n.remain - (n.a.en - n.a.st) / 1000) < 0.001);
    const listed = G.airingsBetween(ch, lib, t, t + 1).map((a) => a.st);
    assert.deepEqual(listed, [n.a.st], 'the guide lists exactly this airing at this moment');
    probes++;
  }
  assert.ok(probes > 400);
  const six = at(...MON, 6, 0);
  assert.equal(G.chanNow(ch, lib, six - 1000).a.en, six, 'one second before 6:00 am is the last airing of the day before');
  assert.equal(G.chanNow(ch, lib, six).offset, 0, 'at 6:00 am the new day starts at zero');
});

test('nextAiring walks the schedule forward across midnight and across the 6 am day change without a skip or a repeat', () => {
  const G = sched(); const { ch, lib } = big();
  let a = G.chanNow(ch, lib, at(...MON, 21, 0)).a;
  const t1 = at(2026, 10, 21, 9, 0);
  let count = 0;
  while (a.st < t1) { const nx = G.nextAiring(ch, lib, a); assert.equal(nx.st, a.en); assert.ok(nx.st > a.st); a = nx; count++; assert.ok(count < 400); }
  assert.ok(count > 50);
});

test('airingsBetween lists a stretch of time in order, without overlap, from block to block', () => {
  const G = sched(); const { ch, lib } = big();
  const list = G.airingsBetween(ch, lib, at(...MON, 18, 0), at(2026, 10, 22, 4, 0));
  for (let k = 0; k + 1 < list.length; k++) assert.equal(list[k].en, list[k + 1].st);
  assert.ok(list[0].st <= at(...MON, 18, 0) && list[0].en > at(...MON, 18, 0));
  assert.ok(list[list.length - 1].en >= at(2026, 10, 22, 4, 0));
});

test('time zones: the schedule is a function of local time, so the same local time gives the same airings in any zone', () => {
  const { ch, lib } = big();
  const A = T.tvgridFactory(), B = T.tvgridFactory();
  A.setOff(() => -6 * H); B.setOff(() => -8 * H);
  const la = (G, off, h) => { const t = Date.UTC(2026, 9, 21, h, 0) - off; const n = G.chanNow(ch, lib, t); return [n.a.s, n.a.i, n.offset]; };
  for (const h of [3, 9, 15, 20, 23]) assert.deepEqual(la(A, -6 * H, h), la(B, -8 * H, h), 'local ' + h + ':00');
  const same = (h) => JSON.stringify(A.chanNow(ch, lib, Date.UTC(2026, 9, 21, h, 0)).a.s) === JSON.stringify(B.chanNow(ch, lib, Date.UTC(2026, 9, 21, h, 0)).a.s);
  assert.ok([4, 10, 16, 22].some((h) => !same(h)), 'at the same instant the two zones see different things');
});

test('daylight saving: across a clock change the airings still tile time, and what is on now is always one airing', () => {
  const G = T.tvgridFactory();
  const SW = Date.UTC(2026, 10, 1, 7, 0); // 2 am local (UTC-5) on 1 Nov 2026: back to UTC-6
  G.setOff((ms) => (ms < SW ? -5 * H : -6 * H));
  const { ch, lib } = big();
  const t0 = Date.UTC(2026, 9, 31, 20, 0), t1 = Date.UTC(2026, 10, 1, 20, 0);
  const list = G.airingsBetween(ch, lib, t0, t1);
  for (let k = 0; k + 1 < list.length; k++) assert.equal(list[k].en, list[k + 1].st, 'no hole at ' + new Date(list[k].en).toISOString());
  for (let t = t0; t < t1; t += 9 * 60000) { const n = G.chanNow(ch, lib, t); assert.ok(n.a.st <= t && t < n.a.en); }
});

test('daylight saving: on both switch nights every show keeps its real length, and the day is 25 or 23 hours long', () => {
  const nights = [
    { name: 'clocks back, 1 Nov 2026', SW: Date.UTC(2026, 10, 1, 7, 0), before: -5 * H, after: -6 * H, hours: 25 },
    { name: 'clocks forward, 8 Mar 2026', SW: Date.UTC(2026, 2, 8, 8, 0), before: -6 * H, after: -5 * H, hours: 23 },
  ];
  for (const z of nights) {
    const G = T.tvgridFactory();
    G.setOff((ms) => (ms < z.SW ? z.before : z.after));
    const { ch, lib } = big();
    const bd = G.dayOf(z.SW - H);
    const day = G.planDay(ch, lib, bd), air = G.dayAirings(ch, lib, bd), next = G.dayAirings(ch, lib, bd + 1);
    assert.equal(air.length, day.length, z.name);
    for (let u = 0; u < air.length; u++) {
      assert.ok(air[u].en > air[u].st, z.name + ': airing ' + u + ' has a length');
      if (u + 1 < day.length && day[u + 1].st === day[u].st + day[u].du) assert.equal(air[u].en - air[u].st, day[u].du * 60000, z.name + ': airing ' + u + ' runs its real length');
    }
    assert.equal(air[air.length - 1].en, next[0].st, z.name + ': the day hands over to the next with no hole');
    assert.equal(next[0].st - air[0].st, z.hours * H, z.name + ': 6 am to 6 am is ' + z.hours + ' hours');
    const wall = (t) => { const d = new Date(t + (t < z.SW ? z.before : z.after)); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
    assert.equal(wall(air[0].st), 360, z.name + ': the day starts at 6:00 am on the wall clock');
    assert.equal(wall(next[0].st), 360, z.name + ': and the next day too');
  }
});

test('epCode and epTotal read the runs: the whole show, season by season, and a gap in the numbers', () => {
  const G = sched();
  const lib = { rt: [22], lib: [[1, 1, 3, 2, 5, 2, 3, 1, 1]] };
  assert.equal(G.epTotal(lib, 0), 6);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((i) => G.epCode(lib, 0, i)), [[1, 1], [1, 2], [1, 3], [2, 5], [2, 6], [3, 1]]);
});

test('the page gets the same text: the inlined source behaves exactly like the module (this is what the page runs)', () => {
  const vm = require('node:vm');
  const { ch, lib } = big();
  const inl = vm.runInNewContext(T.source, { Date, Math, Map, WeakMap, Object, Array });
  inl.setOff(OFF6);
  const G = sched();
  for (const t of [at(...MON, 3, 14), at(...MON, 20, 0), at(...SAT, 8, 30), at(2026, 10, 25, 23, 59)]) {
    const a = G.chanNow(ch, lib, t), b = inl.chanNow(ch, lib, t);
    assert.deepEqual([a.a.s, a.a.i, a.a.st, a.a.en, a.offset, a.remain], [b.a.s, b.a.i, b.a.st, b.a.en, b.offset, b.remain]);
  }
  assert.ok(!/[`\\]/.test(T.source.replace(/\\\\/g, '')), 'no backticks or backslashes: the page script is a template literal');
  const lines = T.source.split('\n').map((l) => l.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, ''));
  assert.ok(lines.every((l) => /^\s*\/\//.test(l) || !/[^:]\/\//.test(l)), 'no line comment after code (scripts/site.js refuses those)');
});

test('guide maths: the filter keeps the right channels (kind, name, a show a channel carries, on now, adult only when allowed)', () => {
  const G = sched();
  const mkc = (id, name, kind, p, extra) => Object.assign({ id, name, kind, shows: 1, eps: 1, cap: 2, p: { d: p }, sn: {}, rd: '' }, extra);
  const chans = [mkc('void', 'The Void', 'all', [0, 1, 2]), mkc('row-a', 'Sitcoms', 'row', [0, 1]), mkc('tag-b', 'Cartoons', 'collection', [2]), mkc('net-c', 'PBS', 'network', [3]), mkc('movies', 'TV Movies', 'row', [4], { mv: 100 }), mkc('row-late', 'Late Night', 'row', [5], { adult: true })];
  const names = ['seinfeld', 'frasier', 'batman', 'nova', 'big fish', 'taboo'];
  const lib = { rt: [22, 22, 22, 22, 90, 22], lib: [[1, 1, 9], [1, 1, 9], [1, 1, 9], [1, 1, 9], [1, 1, 1], [1, 1, 9]] };
  const x = { adult: false, count: names.length, name: (i) => names[i], lib, at: at(...MON, 12, 0) };
  const ids = (f, xx) => G.filterChannels(chans, f, xx || x).map((c) => c.id);
  assert.deepEqual(ids({ kind: 'all', q: '', now: false }), ['void', 'row-a', 'tag-b', 'net-c', 'movies'], 'the adult channel stays out');
  assert.deepEqual(ids({ kind: 'all', q: '', now: false }, Object.assign({}, x, { adult: true })).slice(-1), ['row-late']);
  assert.deepEqual(ids({ kind: 'row' }), ['row-a'], 'rows without the movies row');
  assert.deepEqual(ids({ kind: 'collection' }), ['tag-b']); assert.deepEqual(ids({ kind: 'network' }), ['net-c']); assert.deepEqual(ids({ kind: 'movies' }), ['movies']);
  assert.deepEqual(ids({ q: 'pbs' }), ['net-c'], 'a channel name');
  assert.deepEqual(ids({ q: 'FRASIER' }), ['void', 'row-a'], 'channels that carry the show');
  assert.deepEqual(ids({ q: 'frasier', kind: 'row' }), ['row-a'], 'text and kind together');
  assert.deepEqual(ids({ q: 'taboo' }), [], 'a hidden channel is not found by its show');
  const onNow = (q) => ids({ q, now: true });
  const nowShow = (c) => names[G.chanNow(c, lib, x.at).a.s];
  for (const c of chans.slice(0, 5)) { const s = nowShow(c); assert.ok(onNow(s).includes(c.id), 'on now finds ' + s + ' on ' + c.id); }
  assert.ok(onNow('pbs').includes('net-c'), 'a channel name still matches');
  assert.deepEqual(ids({ q: '', now: true }), ids({ q: '' }), 'on now with no text changes nothing');
  assert.equal(G.blockHit({ s: 1 }, 'frasier', (i) => names[i]), true); assert.equal(G.blockHit({ s: 0 }, 'frasier', (i) => names[i]), false); assert.equal(G.blockHit({ s: 0 }, '', (i) => names[i]), false);
});

test('guide maths: focusMove on real airings, and the block box tiles with the schedule', () => {
  const G = sched(); const { ch, lib } = big();
  const lo = at(...MON, 0, 0), hi = lo + 8 * 86400000 - 1, now = at(...MON, 12, 0);
  const list = [ch, ch];
  let fo = { ci: 0, t: now };
  const cur = G.airingAt(ch, lib, now);
  fo = G.focusMove(fo, 'ArrowRight', list, lib, lo, hi, now); assert.equal(fo.t, cur.en);
  fo = G.focusMove(fo, 'ArrowLeft', list, lib, lo, hi, now); assert.equal(fo.t, cur.st);
  assert.equal(G.focusMove(fo, 'ArrowDown', list, lib, lo, hi, now).ci, 1); assert.equal(G.focusMove({ ci: 1, t: now }, 'ArrowDown', list, lib, lo, hi, now).ci, 1);
  assert.equal(G.focusMove({ ci: 0, t: lo }, 'ArrowLeft', list, lib, lo, hi, now).t, lo, 'the start holds');
  assert.equal(G.focusMove({ ci: 0, t: hi }, 'PageDown', list, lib, lo, hi, now).t, hi, 'the end holds');
  const a = G.airingsBetween(ch, lib, lo, lo + 86400000);
  for (let k = 0; k + 1 < a.length; k++) { const b1 = G.blockBox(a[k], lo, 5), b2 = G.blockBox(a[k + 1], lo, 5); assert.ok(Math.abs(b1.left + b1.width - b2.left) < 0.02, 'blocks tile'); }
  const x = G.xOf(now, lo, 5); const bb = G.blockBox(cur, lo, 5); assert.ok(bb.left <= x && x < bb.left + bb.width);
  assert.ok(Math.abs(G.tOf(G.xOf(now, lo, 5), lo, 5) - now) < 1e-6);
});

// Gap specials (B, 20 Oct): a daypart's last show that would leave a gap gives its place to a TV special that fills it.
function spFixture() {
  const lib = { rt: [22, 25, 26, 25, 25, 24], lib: [[1, 1, 60], [1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1]], sp: [[1, ''], [2, 'x'], [3, 'k'], [4, 'h'], [5, 'kx']] };
  const ch = { id: 'sp-test', p: { m: [0], d: [0], e: [0], p: [0], l: [0], o: [0] }, cap: 99, sn: {}, rd: '' };
  return { lib, ch };
}
const spIn = (day) => day.filter((a) => a.sp).map((a) => a.s);
const bdOn = (y, mo, d) => sched().dayOf(at(y, mo, d, 12, 0));

test('gap specials: the last show of a daypart gives way to a special that fills its slot and the gap', () => {
  const G = sched(), { lib, ch } = spFixture();
  const day = G.planDay(ch, lib, bdOn(2026, 10, 21));
  assert.ok(spIn(day).length > 0, 'some specials air');
  const plain = G.planDay(ch, { rt: lib.rt, lib: lib.lib }, bdOn(2026, 10, 21));
  assert.equal(spIn(plain).length, 0, 'with no specials list the plan is as before');
  const gaps = (d) => d.reduce((n, a, u) => n + Math.max(0, (u + 1 < d.length ? d[u + 1].st : 1800) - a.st - a.du), 0);
  assert.ok(gaps(day) < gaps(plain), 'less gap time than without specials');
  for (let u = 0; u + 1 < day.length; u++) assert.ok(day[u].st + day[u].du <= day[u + 1].st + 30, 'a special never runs far over the next start');
});

test('gap specials: holidays only in season, kids channels take kids specials only, Late Night takes none, no repeat in a day', () => {
  const G = sched(), { lib, ch } = spFixture();
  const oct = spIn(G.planDay(ch, lib, bdOn(2026, 10, 21))), dec = [];
  for (let d = 1; d <= 20; d++) dec.push(...spIn(G.planDay(ch, lib, bdOn(2026, 12, d))));
  assert.ok(!oct.includes(2) && !oct.includes(5), 'no Christmas special in October');
  assert.ok(dec.includes(2) || dec.includes(5), 'Christmas specials air in December');
  for (let d = 1; d <= 28; d++) assert.ok(!spIn(G.planDay(ch, lib, bdOn(2026, 7, d))).includes(4), 'no Halloween special in July');
  const kids = Object.assign({}, ch, { id: 'sp-kids', kc: 1 });
  for (let d = 1; d <= 20; d++) for (const s of spIn(G.planDay(kids, lib, bdOn(2026, 12, d)))) assert.ok(s === 3 || s === 5, 'kids channel: kids specials only');
  const late = Object.assign({}, ch, { id: 'sp-late', adult: true });
  assert.equal(spIn(G.planDay(late, lib, bdOn(2026, 10, 21))).length, 0, 'Late Night takes no specials');
  for (let d = 1; d <= 20; d++) { const s = spIn(G.planDay(ch, lib, bdOn(2026, 12, d))); assert.equal(new Set(s).size, s.length, 'no special twice in a day'); }
});

test('gap specials: the page runs the same plan (the inlined source agrees with the module)', () => {
  const vm = require('node:vm');
  const inl = vm.runInNewContext(T.source, { Date, Math, Map, WeakMap, Object, Array });
  inl.setOff(OFF6);
  const G = sched(), { lib, ch } = spFixture();
  for (const t of [at(2026, 10, 21, 8, 50), at(2026, 12, 10, 16, 55), at(2026, 12, 10, 22, 59)]) {
    const a = G.chanNow(ch, lib, t), b = inl.chanNow(Object.assign({}, ch), lib, t);
    assert.deepEqual([a.a.s, a.a.st, a.a.en], [b.a.s, b.a.st, b.a.en]);
  }
});

test('specialFlags: kids from the studio or a known kids title, holidays from the title', () => {
  assert.equal(T.specialFlags({ show: 'A Charlie Brown Christmas', network: 'Lee Mendelson Film Productions' }), 'kx');
  assert.equal(T.specialFlags({ show: 'The David S. Pumpkins Halloween Special', network: 'NBC' }), 'h');
  assert.equal(T.specialFlags({ show: 'Frozen Planet: The Epic Journey', network: 'BBC' }), '');
  assert.equal(T.specialFlags({ show: 'Dexter: Early Cuts', network: 'Showtime' }), '');
});
