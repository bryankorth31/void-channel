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
  // A wall-clock moment to an instant, for the day plan: a repeated hour (clocks back) takes its first pass, a skipped
  // hour (clocks forward) moves on to the moment the clock jumps to, the way a station's schedule does.
  function wallAt(lms) {
    const a = toAbs(lms), H12 = DAYMS / 2;
    const c = [lms - OFF(a - H12), lms - OFF(a), lms - OFF(a + H12)];
    let ok = null, hi = c[0];
    for (let i = 0; i < 3; i++) {
      if (c[i] + OFF(c[i]) === lms && (ok === null || c[i] < ok)) ok = c[i];
      if (c[i] > hi) hi = c[i];
    }
    return ok !== null ? ok : hi;
  }
  // One broadcast day in real minutes: where it starts, how a wall-clock minute of it (360 = 6:00 am) reads as a real
  // minute counted from the same 360, and where it ends (1800 on most days, 1740 or 1860 on the two switch nights).
  function dayClock(bd) {
    const S = wallAt(bd * DAYMS + DAY0 * MIN);
    const R = (m) => DAY0 + Math.round((wallAt(bd * DAYMS + m * MIN) - S) / MIN);
    return { S: S, R: R, end: R(DAYEND) };
  }
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
  // Holiday specials air only in their season (B, 20 Oct): h Halloween in October, t Thanksgiving in November, x Christmas
  // from 25 November to 31 December, v Valentine's 1 to 14 February, e Easter 15 March to 30 April.
  function inSeason(code, bd) {
    const d = new Date(bd * DAYMS), m = d.getUTCMonth() + 1, day = d.getUTCDate();
    if (code === 'h') return m === 10;
    if (code === 't') return m === 11;
    if (code === 'x') return (m === 11 && day >= 25) || m === 12;
    if (code === 'v') return m === 2 && day <= 14;
    if (code === 'e') return (m === 3 && day >= 15) || m === 4;
    return false;
  }
  function idHash(id) { let h = 7; id = String(id || ''); for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; return h; }
  // A TV special to take the place of a daypart's last show when that show leaves a gap before the next daypart: it must fit
  // the show's slot plus the gap. lib.sp is [[show, flags]] (k kids, h t x v e holiday, r racy: after dark only, the
  // late night and overnight dayparts). Order: the channel's own network,
  // then a holiday special in season, then any. Kids mornings and kids channels take kids specials only; Late Night takes none;
  // a special airs once a day per channel. Returns a show, or -1.
  function pickSpecial(ch, lib, bd, k, di, room, minDu, cnt) {
    const sp = lib.sp;
    if (!sp || !sp.length || ch.adult) return -1;
    const kidsOnly = ch.kc || (k === 'm' && ch.km);
    const net = ch.spn || [];
    const ok = (e) => {
      const f = e[1] || '';
      if (cnt[e[0]]) return false;
      if (kidsOnly && f.indexOf('k') < 0) return false;
      if (f.indexOf('r') >= 0 && k !== 'l' && k !== 'o') return false;
      for (const c of 'htxve') if (f.indexOf(c) >= 0 && !inSeason(c, bd)) return false;
      return true;
    };
    const holiday = (e) => /[htxve]/.test(e[1] || '');
    const groups = [sp.filter((e) => net.indexOf(e[0]) >= 0), sp.filter(holiday), sp];
    const r = (s) => lib.rt[s] || 0;
    const turn = idHash(ch.id) + bd * 31 + di * 7;
    for (let pass = 0; pass < 2; pass++) {
      for (const g of groups) {
        const fit = g.filter((e) => ok(e) && r(e[0]) <= room && (pass === 0 ? r(e[0]) >= room - 3 : r(e[0]) > minDu));
        if (!fit.length) continue;
        if (pass === 0) return fit[turn % fit.length][0];
        let best = fit[0];
        for (const e of fit) if (r(e[0]) > r(best[0])) best = e;
        return best[0];
      }
    }
    return -1;
  }

  function planDay(ch, lib, bd) {
    const dow = dowOf(bd), w = weekOfDay(bd);
    const P = ch.p || {};
    const cap0 = ch.cap || 2;
    const cnt = {};
    const out = [];
    const rt = (s) => lib.rt[s] || 30;
    let t = DAY0;
    const put = (s, k) => { const du = rt(s); out.push({ s: s, st: t, du: du, j: cnt[s] || 0, k: k }); cnt[s] = (cnt[s] || 0) + 1; t += du; };
    // Dayparts are wall-clock times; the day is filled in real minutes, so a switch night keeps every show its real length.
    const C = dayClock(bd);
    const wins = windows(dow).map((x) => ({ k: x.k, a: C.R(x.a), b: C.R(x.b) }));
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
      // A gap of 3 minutes or more before the next daypart: swap the last show for a TV special that fills its slot and the gap.
      const last = out[out.length - 1];
      if (lib.sp && last && last.k === win.k && win.b - t >= 3) {
        const s = pickSpecial(ch, lib, bd, win.k, di, last.du + (win.b - t), last.du, cnt);
        if (s >= 0) { out.pop(); cnt[last.s] -= 1; t = last.st; put(s, win.k); out[out.length - 1].sp = 1; }
      }
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
      const bd = w * 7 - 4 + d, C = dayClock(bd);
      return day.map((x, u) => {
        const i = epPick(lib, x.s, w, per[x.s], base[d][x.s] || 0, x.j);
        const c = epCode(lib, x.s, i);
        const st = C.S + (x.st - DAY0) * MIN;
        const en = C.S + ((u + 1 < day.length ? day[u + 1].st : C.end) - DAY0) * MIN;
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

  // ---- the guide's maths: where blocks sit, what is in view, the ruler, the filters and the keys ----
  // A local clock moment: the day of ms plus some days, at some minutes after local midnight, as a real instant.
  function localAt(ms, days, minutes) { return toAbs(Math.floor((ms + OFF(ms)) / DAYMS) * DAYMS + days * DAYMS + minutes * MIN); }
  const xOf = (t, t0, ppm) => ((t - t0) / MIN) * ppm;
  const tOf = (x, t0, ppm) => t0 + (x / ppm) * MIN;
  // Where an airing's block sits on the time axis (pixels from the left edge of the time area) and how wide it is.
  function blockBox(a, t0, ppm) { return { left: Math.round(xOf(a.st, t0, ppm) * 100) / 100, width: Math.round(((a.en - a.st) / MIN) * ppm * 100) / 100 }; }
  // The rows to draw for a scroll position: from, to (not included), with some rows of margin.
  function rowSpan(scrollTop, viewH, rowH, n, pad) {
    const a = Math.min(n, Math.max(0, Math.floor(scrollTop / rowH) - pad)), b = Math.min(n, Math.ceil((scrollTop + viewH) / rowH) + pad);
    return [a, Math.max(a, b)];
  }
  // The half hour marks in [t0, t1): the instant, the local hour and minute, and whether it is local midnight.
  function halfHours(t0, t1) {
    const out = [], step = 30 * MIN;
    let L = Math.ceil((t0 + OFF(t0)) / step) * step;
    for (let k = 0; k < 4000; k++, L += step) {
      const t = toAbs(L);
      if (t >= t1) break;
      const sod = mod(L, DAYMS) / MIN;
      out.push({ t: t, h: Math.floor(sod / 60), m: sod % 60, mid: sod === 0 });
    }
    return out;
  }
  // Which filter a channel answers to: movies (mostly movies), rows and genres, collections, networks, or none (The Void).
  function chanGroup(c) {
    if (c.id === 'movies' || c.mv >= 50) return 'movies';
    return c.kind === 'row' || c.kind === 'collection' || c.kind === 'network' ? c.kind : 'all';
  }
  // The channels that pass the filter { kind, q, now }. x: { adult, count, name(i) lower case, lib, at }.
  // Text matches a channel by its name or by a show it carries; with "on now" only by what is on the air at x.at.
  function filterChannels(chans, f, x) {
    const q = String(f.q || '').trim().toLowerCase();
    let out = chans.filter((c) => (!c.adult || x.adult) && (!f.kind || f.kind === 'all' || chanGroup(c) === f.kind));
    if (!q) return out;
    if (f.now) {
      return out.filter((c) => {
        if (c.name.toLowerCase().indexOf(q) >= 0) return true;
        const n = chanNow(c, x.lib, x.at);
        return !!n && x.name(n.a.s).indexOf(q) >= 0;
      });
    }
    const hit = {};
    for (let i = 0; i < x.count; i++) if (x.name(i).indexOf(q) >= 0) hit[i] = 1;
    return out.filter((c) => {
      if (c.name.toLowerCase().indexOf(q) >= 0) return true;
      for (const k in c.p) for (let u = 0; u < c.p[k].length; u++) if (hit[c.p[k][u]]) return true;
      return false;
    });
  }
  // Whether a block should be lit for the text filter.
  function blockHit(a, q, name) { q = String(q || '').trim().toLowerCase(); return !!q && name(a.s).indexOf(q) >= 0; }
  // The key a remote or keyboard sends, applied to the focus { ci: row, t: time }: Left and Right go to the previous and next
  // airing on the channel, Up and Down to the channel above and below at the same time, PageUp and PageDown three hours, Home to now.
  function focusMove(fo, key, list, lib, lo, hi, now) {
    const c = list[fo.ci];
    if (!c) return fo;
    const cur = airingAt(c, lib, fo.t);
    let ci = fo.ci, t = fo.t;
    if (key === 'ArrowLeft') t = airingAt(c, lib, cur.st - 1).st;
    else if (key === 'ArrowRight') t = cur.en;
    else if (key === 'ArrowUp') ci = Math.max(0, ci - 1);
    else if (key === 'ArrowDown') ci = Math.min(list.length - 1, ci + 1);
    else if (key === 'PageUp') t = fo.t - 180 * MIN;
    else if (key === 'PageDown') t = fo.t + 180 * MIN;
    else if (key === 'Home') t = now;
    else return fo;
    return { ci: ci, t: Math.max(lo, Math.min(hi, t)) };
  }

  return { MIN, DAYMS, DPNAME, setOff, dayOf, toAbs, dowOf, weekOfDay, planDay, weekOf, dayAirings, airingAt, chanNow, nextAiring, airingsBetween, daypartOf, epTotal, epCode, epPick,
    localAt, xOf, tOf, blockBox, rowSpan, halfHours, chanGroup, filterChannels, blockHit, focusMove };
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
  // For the gap specials: km = this channel's mornings are kids shows, kc = most of the channel is kids shows (kids specials only).
  const kidsN = series.filter((r) => r.kids).length;
  if (!allMovies && kidsN >= 3) ch.km = 1;
  if (series.length && kidsN / series.length >= 0.5) ch.kc = 1;
  // How many airings each daypart holds on a weekday: the step the weekly (or daily) rotation takes through the pool.
  const REF_BD = 20299;
  const probe = Object.assign({}, ch, { sn: {} });
  const seen = {};
  for (const a of G.planDay(probe, { rt }, REF_BD)) seen[a.k] = (seen[a.k] || 0) + 1;
  for (const k of Object.keys(seen)) if (k !== 'v') ch.sn[k] = Math.max(1, seen[k]);
  return ch;
}

// TV specials that can fill a gap (B, 20 Oct): 60 minutes or less. The catalog has no genres for them, so kids comes from the
// studio or a known kids title, and the holiday from the title. Returns '' (any audience, any time of year) or flags.
const KIDS_STUDIO = /animation|cartoon|nickelodeon|disney|pixar|dreamworks|hanna-barbera|rankin|mendelson|magic light|pbs kids|sesame|jim henson|nick jr|aardman/i;
const KIDS_TITLE = /charlie brown|peanuts|snoopy|scooby|mickey|minnie|goofy|donald duck|elmo|sesame|muppet|curious george|arthur.s|arthur christmas|chipmunk|alvin|garfield|grinch|rudolph|frosty|winnie the pooh|pooh|shrek|madagascar|kung fu panda|toy story|monsters, inc|gruffalo|room on the broom|stick man|zog|paddington|peppa|bluey|spongebob|looney|bugs bunny|tom and jerry|smurf|care bears|my little pony|club penguin|yogi|boo boo|flintstone|jetsons|powerpuff|billy and mandy|dexter.s laboratory|olaf|frozen fever|wallace|gromit|shaun the sheep|barney|teletubbies|dora|veggietales/i;
function specialFlags(s) {
  const name = String(s.show || ''), net = String(s.network || '');
  let f = '';
  if (KIDS_STUDIO.test(net) || KIDS_TITLE.test(name)) f += 'k';
  if (/halloween|pumpkin|trick or treat/i.test(name)) f += 'h';
  if (/thanksgiving/i.test(name)) f += 't';
  if (/christmas|xmas|santa|noel|nutcracker|grinch|rudolph|frosty|scrooge|christmas carol|12 days|twelve days|yuletide/i.test(name)) f += 'x';
  if (/valentine/i.test(name)) f += 'v';
  // Racy titles air only after dark: the late night and overnight dayparts, 11 pm to 6 am (B, 20 Oct).
  if (/\bsex\b|porn|nude|naked|erotic|playboy|striptease|stripper|uncensored|xxx|shocking moments/i.test(name)) f += 'r';
  if (/easter/i.test(name)) f += 'e';
  return f;
}
function buildSpecials(shows, infos, off) {
  const out = [];
  shows.forEach((s, i) => {
    if (!isMovieSlug(s.slug) || (off && off.has(s.slug)) || s.adult || s.type === 'Late Night') return;
    if (!(infos[i].rt > 0 && infos[i].rt <= 60)) return;
    out.push([i, specialFlags(s)]);
  });
  return out;
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

module.exports = { tvgridFactory, source, showInfo, planChannel, buildLib, trimLib, isMovieSlug, specialFlags, buildSpecials, G };
