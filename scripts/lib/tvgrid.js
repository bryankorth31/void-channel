// LIVE TV AS A SCHEDULE (design: audit/drafts/tv-grid-design.md).
//
// Two halves in one file:
//   1. tvgridFactory(): the pure schedule logic (clock, dayparts, strips, airings, the guide's maths). It is ONE function
//      that returns an object of functions, so app.js can inline its source into the page (the pattern app-fetch.js and
//      app-me.js use) and the tests run the very same text. It touches nothing but the Date it is asked about: no DOM, no
//      fetch. No backticks, no backslashes and no line comments after code inside it (scripts/site.js refuses a page whose
//      script has those).
//   2. Node-only builder: turns the assembled shows into the small plan the page needs (pools per daypart, typical minutes,
//      episode runs) so data/tv.json stays small.
//
// The model in one paragraph: a broadcast day runs 6:00 am to 6:00 am local time. Dayparts (Morning, Daytime, Early evening,
// Prime time, Late night, Overnight) are filled from per-daypart pools of shows. A show holds a place Monday to Friday and
// moves one episode per airing; the places rotate to the next shows each week (movies rotate daily). Airings run back to back
// (an elastic chain) with hard anchors at the start of each daypart, so the day lands within minutes of every anchor. Everyone
// in a time zone computes the same schedule from the clock, so the guide and what plays always agree.
function tvgridFactory() {
  const MIN = 60000, DAYMS = 86400000;
  const DAY0 = 360, DAYEND = 1800;
  const DP = [
    { k: 'm', a: 360, b: 540 }, { k: 'd', a: 540, b: 1020 }, { k: 'e', a: 1020, b: 1200 },
    { k: 'p', a: 1200, b: 1380 }, { k: 'l', a: 1380, b: 1560 }, { k: 'o', a: 1560, b: 1800 },
  ];
  const DPNAME = { m: 'Morning', d: 'Daytime', e: 'Early evening', p: 'Prime time', l: 'Late night', o: 'Overnight', v: 'Movie night' };
  const LOOK = 6, TOL1 = 8, GAP = 14, TOL2 = 30;
  let OFF = (ms) => -new Date(ms).getTimezoneOffset() * MIN;
  const WK = new WeakMap();
  const mod = (a, n) => ((a % n) + n) % n;

  function setOff(f) { OFF = f; }
  // The broadcast day (a day count since 1970) that an instant belongs to, in the viewer's local time.
  function dayOf(ms) { return Math.floor((ms + OFF(ms) - DAY0 * MIN) / DAYMS); }
  // A local wall-clock moment, written as milliseconds as if local were UTC, back to a real instant.
  function toAbs(lms) { const g = lms - OFF(lms); return lms - OFF(g); }
  const dowOf = (bd) => mod(bd + 4, 7);
  const weekOfDay = (bd) => Math.floor((bd + 4) / 7);

  function windows(dow) {
    if (dow !== 6) return DP;
    return [{ k: 'm', a: 360, b: 720 }, { k: 'd', a: 720, b: 1020 }, DP[2], DP[3], DP[4], DP[5]];
  }
  function rho(ch, k, di, n, bd, w, dow) {
    const sn = (ch.sn && ch.sn[k]) || 1;
    const base = di * 3;
    if (ch.rd && ch.rd.indexOf(k) >= 0) return mod(bd * sn + base, n);
    const shift = dow === 6 ? Math.floor(n / 3) : dow === 0 ? Math.floor((2 * n) / 3) : 0;
    return mod(w * sn + shift + base, n);
  }

  // One broadcast day of one channel as plain minutes: [{ s: show index, st: minute of the day (360 = 6:00 am), du: minutes,
  // j: how many times this show has already aired today, k: daypart letter }]. The same on every Monday to Friday of a week.
  function planDay(ch, lib, bd) {
    const dow = dowOf(bd), w = weekOfDay(bd);
    const P = ch.p || {};
    const cap0 = ch.cap || 2;
    const cnt = {};
    const out = [];
    const rt = (s) => lib.rt[s] || 30;
    let t = DAY0;
    const put = (s, k) => { const du = rt(s); out.push({ s: s, st: t, du: du, j: cnt[s] || 0, k: k }); cnt[s] = (cnt[s] || 0) + 1; t += du; };
    const wins = windows(dow);
    for (let di = 0; di < wins.length; di++) {
      const win = wins[di];
      if (t < win.a) t = win.a;
      if (win.k === 'p' && P.v && P.v.length) {
        const nv = P.v.length;
        for (let i = 0; i < Math.min(nv, LOOK); i++) {
          const s = P.v[mod(bd + i, nv)];
          if ((cnt[s] || 0) < cap0 && t + rt(s) <= win.b + TOL2) { put(s, 'v'); break; }
        }
      }
      const pool = P[win.k];
      if (!pool || !pool.length) continue;
      const n = pool.length;
      const room = win.b - win.a + TOL2;
      let pos = rho(ch, win.k, di, n, bd, w, dow), taken = {}, takenN = 0, cap = cap0, guard = 0;
      const fill = (tol) => {
        while (t < win.b && guard++ < 300) {
          let pick = -1, seen = 0;
          for (let k = 0; k < n && seen < LOOK; k++) {
            const idx = (pos + k) % n;
            if (taken[idx]) continue;
            const s = pool[idx];
            if (rt(s) > room || (cnt[s] || 0) >= cap) continue;
            seen++;
            if (t + rt(s) <= win.b + tol) { pick = idx; break; }
          }
          if (pick < 0 && seen > 0) {
            for (let k = 0; k < n; k++) {
              const idx = (pos + k) % n;
              if (taken[idx]) continue;
              const s = pool[idx];
              if (rt(s) > room || (cnt[s] || 0) >= cap) continue;
              if (t + rt(s) <= win.b + tol) { pick = idx; break; }
            }
            if (pick < 0) return;
          }
          if (pick < 0) {
            if (takenN > 0) { taken = {}; takenN = 0; continue; }
            cap++;
            continue;
          }
          taken[pick] = 1; takenN++;
          put(pool[pick], win.k);
          for (let g = 0; g < n && taken[pos]; g++) pos = (pos + 1) % n;
        }
      };
      fill(TOL1);
      if (win.b - t > GAP) fill(TOL2);
    }
    return out;
  }

  function epTotal(lib, s) {
    const r = lib.lib && lib.lib[s];
    if (!r || !r.length) return 0;
    if (!lib.tot) lib.tot = {};
    if (lib.tot[s] != null) return lib.tot[s];
    let t = 0;
    for (let k = 2; k < r.length; k += 3) t += r[k];
    lib.tot[s] = t;
    return t;
  }
  // Episode number i of a show (counting from 0 through its seasons in order) as [season, episode number].
  function epCode(lib, s, i) {
    const r = lib.lib && lib.lib[s];
    if (!r || !r.length) return [1, i + 1];
    for (let k = 0; k < r.length; k += 3) { if (i < r[k + 2]) return [r[k], r[k + 1] + i]; i -= r[k + 2]; }
    return [r[r.length - 3], r[r.length - 2] + r[r.length - 1] - 1];
  }
  // Which episode a show airs: one more per airing for a show that holds the same place every week.
  function epPick(lib, s, w, perWeek, before, j) {
    const E = epTotal(lib, s) || 1;
    const off = (Math.imul(s + 1, 2654435761) >>> 0) % E;
    return mod(w * perWeek + before + j + off, E);
  }

  // The seven days of a week (Sunday first) for one channel, planned once and kept: airings with real instants.
  function weekOf(ch, lib, w) {
    let m = WK.get(ch);
    if (!m) { m = new Map(); WK.set(ch, m); }
    let r = m.get(w);
    if (r) return r;
    const days = [], per = {}, base = [];
    for (let d = 0; d < 7; d++) {
      const day = planDay(ch, lib, w * 7 - 4 + d);
      days.push(day);
      base.push(Object.assign({}, per));
      for (let u = 0; u < day.length; u++) per[day[u].s] = (per[day[u].s] || 0) + 1;
    }
    const air = days.map((day, d) => {
      const bd = w * 7 - 4 + d;
      return day.map((x, u) => {
        const i = epPick(lib, x.s, w, per[x.s], base[d][x.s] || 0, x.j);
        const c = epCode(lib, x.s, i);
        const st = toAbs(bd * DAYMS + x.st * MIN);
        const en = toAbs(bd * DAYMS + (u + 1 < day.length ? day[u + 1].st : DAYEND) * MIN);
        return { s: x.s, i: i, se: c[0], n: c[1], st: st, en: en, du: x.du, k: x.k };
      });
    });
    r = { air: air };
    m.set(w, r);
    if (m.size > 6) m.delete(m.keys().next().value);
    return r;
  }
  function dayAirings(ch, lib, bd) { return weekOf(ch, lib, weekOfDay(bd)).air[dowOf(bd)]; }

  // The airing on the air at an instant (the airings of a day tile it, so there is always one).
  function airingAt(ch, lib, at) {
    const bd = dayOf(at);
    let list = dayAirings(ch, lib, bd);
    if (!list.length) return null;
    if (at < list[0].st) list = dayAirings(ch, lib, bd - 1);
    if (!list.length) return null;
    let lo = 0, hi = list.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (list[m].st <= at) lo = m; else hi = m - 1; }
    return list[lo];
  }
  // What is on now: the airing, seconds into it, seconds left. Playback and the guide both ask this.
  function chanNow(ch, lib, at) {
    if (at == null) at = Date.now();
    const a = airingAt(ch, lib, at);
    if (!a) return null;
    return { a: a, offset: Math.max(0, (at - a.st) / 1000), remain: Math.max(0, (a.en - at) / 1000) };
  }
  function nextAiring(ch, lib, a) {
    const n = airingAt(ch, lib, a.en);
    return n && n.st > a.st ? n : airingAt(ch, lib, a.en + MIN);
  }
  // Every airing that overlaps [t0, t1), in order.
  function airingsBetween(ch, lib, t0, t1) {
    const out = [];
    for (let d = dayOf(t0), last = dayOf(t1); d <= last; d++) {
      const list = dayAirings(ch, lib, d);
      for (let u = 0; u < list.length; u++) if (list[u].en > t0 && list[u].st < t1) out.push(list[u]);
    }
    return out;
  }
  // The daypart a minute of the broadcast day falls in (for the guide's labels).
  function daypartOf(ms) {
    const bd = dayOf(ms), W = (ms + OFF(ms) - bd * DAYMS) / MIN, wins = windows(dowOf(bd));
    for (let i = 0; i < wins.length; i++) if (W >= wins[i].a && W < wins[i].b) return wins[i].k;
    return 'o';
  }

  return { MIN, DAYMS, DPNAME, setOff, dayOf, toAbs, dowOf, weekOfDay, planDay, weekOf, dayAirings, airingAt, chanNow, nextAiring, airingsBetween, daypartOf, epTotal, epCode, epPick };
}

// ---- Node only: the builder ----------------------------------------------------------------------------------------------
const G = tvgridFactory();
const source = '(' + tvgridFactory.toString().replace(/\r\n/g, '\n') + ')()';

const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
const isMovieSlug = (slug) => String(slug).startsWith('movie-');

// What the schedule needs to know about one assembled show: its typical length, its episodes as runs of
// [season, first number, count], and the flags that decide which dayparts it can fill.
function showInfo(s) {
  const mins = [], runs = [];
  let eps = 0;
  for (const se of s.seasons || []) {
    let last = null;
    for (const e of se.episodes || []) {
      eps++;
      if (e.min > 0) mins.push(e.min);
      if (last && last[0] === se.season && e.n === last[1] + last[2]) last[2]++;
      else { last = [se.season, e.n, 1]; runs.push(last); }
    }
  }
  const movie = isMovieSlug(s.slug);
  const rt = Math.max(5, Math.min(300, median(mins) || s.runtime || (movie ? 90 : 30)));
  const genres = s.genres || [], tags = s.tags || [];
  const has = (g) => genres.indexOf(g) >= 0;
  const late = ['Adult Swim', 'MTV', 'Sketch and Comedy'].indexOf(s.type) >= 0 || tags.some((t) => ['Late Night Classics', 'Variety & Talk', 'Awkward & Absurd'].indexOf(t) >= 0) || has('Talk');
  const edgy = s.type === 'Adult Swim' || s.type === 'MTV' || late;
  const kids = !movie && !edgy && (has('Kids') || (has('Animation') && (has('Family') || has('Action & Adventure') || has('Sci-Fi & Fantasy'))));
  const score = (s.rating || 6) + 0.5 * Math.log10(eps + 1);
  return { rt, runs: [].concat(...runs), eps, movie, kids, late, score };
}

// Per-daypart sizes (weekday minutes), used to see how many shows a pool should hold.
const WIN = { m: 180, d: 480, e: 180, p: 180, l: 180, o: 240 };

// One channel's plan from its shows. recs: [{ i, rt, eps, movie, kids, late, score }] (i = the show's place in the full list).
// Returns the channel as stored in tv.json. Pure and deterministic: ties break on the show's place.
function planChannel(meta, recs, rt) {
  const byScore = (a, b) => b.score - a.score || a.i - b.i;
  const all = recs.slice().sort(byScore);
  const N = all.length;
  const avg = Math.max(15, Math.min(90, all.reduce((n, r) => n + r.rt, 0) / Math.max(1, N)));
  const movies = all.filter((r) => r.movie), series = all.filter((r) => !r.movie);
  const allMovies = series.length === 0;
  const pools = { m: [], d: [], e: [], p: [], l: [], o: [], v: [] };
  const ids = (list) => list.map((r) => r.i);
  const cut = (list, fracs) => { // split an ordered list by fractions, in order
    const out = []; let at = 0;
    fracs.forEach((f, k) => { const n = k === fracs.length - 1 ? list.length - at : Math.round(list.length * f); out.push(list.slice(at, at + n)); at += n; });
    return out;
  };
  let rest;
  if (allMovies) {
    const [v, m, p, e, d, l, o] = cut(all, [0.15, 0.1, 0.2, 0.15, 0.25, 0.1, 0.05]);
    pools.v = ids(v); pools.m = ids(m); pools.p = ids(p); pools.e = ids(e); pools.d = ids(d); pools.l = ids(l); pools.o = ids(o);
    rest = [];
  } else {
    const useMovies = movies.length >= 4;
    if (useMovies) pools.v = ids(movies);
    const kids = series.filter((r) => r.kids);
    const pool = useMovies ? series : all;
    if (kids.length >= 3) pools.m = ids(kids);
    const late = pool.filter((r) => r.late && !(kids.length >= 3 && r.kids));
    pools.l = ids(late);
    const gone = new Set([...pools.m, ...pools.l]);
    rest = pool.filter((r) => !gone.has(r.i));
    const [p, e, d, o] = cut(rest, [0.25, 0.25, 0.35, 0.15]);
    pools.p = ids(p); pools.e = ids(e); pools.d = ids(d); pools.o = ids(o);
  }
  // A pool too small for its window is topped up from the best of the rest (the same shows may then sit in two dayparts).
  // The shows used least so far come first, so repeats spread over the dayparts instead of piling on the best shows.
  const order = ids(allMovies ? all : (movies.length >= 4 ? series : all));
  const used = new Map(order.map((i) => [i, 0]));
  for (const k of Object.keys(WIN)) for (const i of pools[k]) used.set(i, (used.get(i) || 0) + 1);
  for (const k of Object.keys(WIN)) {
    if (k === 'm' && !allMovies && pools.m.length >= 3) continue;
    const need = Math.ceil(1.5 * Math.ceil((k === 'm' ? 360 : WIN[k]) / avg));
    const have = new Set(pools[k]);
    const more = order.filter((i) => !have.has(i)).map((i, q) => ({ i, q })).sort((a, b) => used.get(a.i) - used.get(b.i) || a.q - b.q);
    for (let q = 0; pools[k].length < Math.min(need, order.length) && q < more.length; q++) { pools[k].push(more[q].i); used.set(more[q].i, used.get(more[q].i) + 1); }
  }
  const byI = new Map(recs.map((r) => [r.i, r]));
  const med = (list) => median(list.map((i) => byI.get(i).eps));
  let rd = pools.v.length ? 'v' : '';
  for (const k of Object.keys(WIN)) if (pools[k].length && (allMovies || med(pools[k]) < 3)) rd += k;
  const p = {};
  for (const k of Object.keys(pools)) if (pools[k].length) p[k] = pools[k];
  const meanRt = all.reduce((n, r) => n + r.rt, 0) / Math.max(1, N);
  const ch = { id: meta.id, name: meta.name, kind: meta.kind, shows: N, eps: recs.reduce((n, r) => n + r.eps, 0), cap: Math.max(2, Math.ceil((1.2 * 1440) / meanRt / Math.max(1, N))), p, sn: {}, rd };
  const mv = Math.round((100 * movies.length) / Math.max(1, N));
  if (mv) ch.mv = mv;
  // How many airings each daypart holds on a weekday: the step the weekly (or daily) rotation takes through the pool.
  const REF_BD = 20299;
  const probe = Object.assign({}, ch, { sn: {} });
  const seen = {};
  for (const a of G.planDay(probe, { rt }, REF_BD)) seen[a.k] = (seen[a.k] || 0) + 1;
  for (const k of Object.keys(seen)) if (k !== 'v') ch.sn[k] = Math.max(1, seen[k]);
  return ch;
}

// The shared library for the whole page: typical minutes and episode runs by place in the full show list (0 where unused).
function buildLib(shows) {
  const infos = shows.map((s) => showInfo(s));
  return { infos, rt: infos.map((x) => x.rt), runs: infos.map((x) => x.runs) };
}
// Only the shows that sit on some channel are kept in the file; everything else is 0.
function trimLib(lib, used) {
  return { rt: lib.rt.map((v, i) => (used.has(i) ? v : 0)), lib: lib.runs.map((v, i) => (used.has(i) ? v : 0)) };
}

module.exports = { tvgridFactory, source, showInfo, planChannel, buildLib, trimLib, isMovieSlug, G };
