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
// (an elastic chain) with hard anchors at the start of each daypart, so the day lands within minutes of every anchor. Each
// airing is as long as its own episode (its file, rounded up to the whole minute), so a show never starts before its time
// and never runs into the next one (B, 21 Oct 2026). Everyone in a time zone computes the same schedule from the clock, so
// the guide and what plays always agree.
function tvgridFactory() {
  const MIN = 60000, DAYMS = 86400000;
  const DAY0 = 360, DAYEND = 1800;
  const DP = [
    { k: 'm', a: 360, b: 540 }, { k: 'd', a: 540, b: 1020 }, { k: 'e', a: 1020, b: 1200 },
    { k: 'p', a: 1200, b: 1380 }, { k: 'l', a: 1380, b: 1560 }, { k: 'o', a: 1560, b: 1800 },
  ];
  const DPNAME = { m: 'Morning', d: 'Daytime', e: 'Early evening', p: 'Prime time', l: 'Late night', o: 'Overnight', v: 'Movie night' };
  const LOOK = 6, TOL1 = 8, GAP = 14, TOL2 = 30, SLOT = 30, SHORT = 15, SPARE = ['d', 'e', 'p', 'm', 'o', 'l'];
  let OFF = (ms) => -new Date(ms).getTimezoneOffset() * MIN;
  const WK = new WeakMap(), FG = new WeakMap(), SH = new WeakMap();
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
  // The week turns on Monday at 6:00 am (B, 25 Oct 2026: new shows join Live TV once a week, on Monday). dayIn: Monday 0 to Sunday 6.
  const weekOfDay = (bd) => Math.floor((bd + 3) / 7);
  const dayIn = (bd) => mod(bd + 3, 7);
  // A show's own number for the episode rotation: from its name (lib.key, set by adopt), so a show added or removed elsewhere in the
  // list never moves another show's episodes. A plan without names (an old tv.json) falls back to the show's place.
  const keyOf = (lib, s) => (lib.key ? lib.key[s] >>> 0 : Math.imul(s + 1, 2654435761) >>> 0);
  // Two weeks in one plan: from week lib.nw on, a channel plays its next-week plan (ch.nx with lib.nx), so every viewer turns to the
  // new lineup at 6:00 am on their own Monday. A channel with no next-week plan keeps this one.
  function forWeek(ch, lib, w) { return lib.nx && lib.nw != null && w >= lib.nw && ch.nx ? [ch.nx, lib.nx] : [ch, lib]; }

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
  // THE FILLER LIBRARY (B, 20 Oct): what airs in a gap before the next daypart. lib.sp is [[show, flags, tier]]: tier 0 is
  // one of B's originals (from catalog/fillers.json, added in HQ; a channel takes only the originals listed in its ch.fo),
  // no tier is a TV special. Flags: k kids, r after dark only (the late night and overnight dayparts, 11 pm to 6 am),
  // h t x v e a holiday, aired only in season. Order: B's originals, then the channel's own network's specials, then a
  // holiday special in season, then any special. Kids mornings and kids channels take kids items only, and kids items air
  // nowhere else; Late Night takes no
  // specials (only originals listed for it); an item airs once a day per channel.
  // mode 'insert': an item that fits inside the gap (room = the gap). mode 'swap': an item to take the place of the
  // daypart's last show, filling its slot plus the gap (room = both, minDu = the show's length). len(s): the minutes of
  // the item's next airing (its typical minutes when not given). gs: which of the four groups to look in, in order (all of
  // them when not given; the breaks ask for the originals and the specials apart). Returns a show, or -1.
  function pickFill(ch, lib, bd, k, di, room, minDu, cnt, mode, len, gs) {
    const sp = lib.sp;
    if (!sp || !sp.length) return -1;
    const kidsOnly = !!(ch.kc || (k === 'm' && ch.km));
    const net = ch.spn || [], mine = ch.fo || [];
    const ok = (e) => {
      const f = e[1] || '';
      if (cnt[e[0]]) return false;
      if (e[2] === 0 ? mine.indexOf(e[0]) < 0 : ch.adult) return false;
      // Kids items only there, and only there (B, 20 Oct; audit P3A-01).
      if (kidsOnly !== (f.indexOf('k') >= 0)) return false;
      if (f.indexOf('r') >= 0 && k !== 'l' && k !== 'o') return false;
      for (const c of 'htxve') if (f.indexOf(c) >= 0 && !inSeason(c, bd)) return false;
      return true;
    };
    const special = (e) => e[2] !== 0;
    const holiday = (e) => special(e) && /[htxve]/.test(e[1] || '');
    let fg = FG.get(ch);
    if (!fg || fg.sp !== sp) {
      fg = { sp: sp, g: [sp.filter((e) => e[2] === 0), sp.filter((e) => special(e) && net.indexOf(e[0]) >= 0), sp.filter(holiday), sp.filter(special)] };
      FG.set(ch, fg);
    }
    const groups = (gs || [0, 1, 2, 3]).map((x) => fg.g[x]);
    const r = len || ((s) => lib.rt[s] || 0);
    const turn = idHash(ch.id) + bd * 31 + di * 7;
    const longest = (fit) => { let best = fit[0]; for (const e of fit) if (r(e[0]) > r(best[0])) best = e; return best[0]; };
    if (mode === 'insert') {
      for (const g of groups) {
        const fit = g.filter((e) => ok(e) && r(e[0]) > 0 && r(e[0]) <= room);
        if (!fit.length) continue;
        const top = r(longest(fit)), same = fit.filter((e) => r(e[0]) === top);
        return same[turn % same.length][0];
      }
      return -1;
    }
    for (let pass = 0; pass < 2; pass++) {
      for (const g of groups) {
        const fit = g.filter((e) => ok(e) && r(e[0]) <= room && (pass === 0 ? r(e[0]) >= room - 3 : r(e[0]) > minDu));
        if (!fit.length) continue;
        return pass === 0 ? fit[turn % fit.length][0] : longest(fit);
      }
    }
    return -1;
  }

  // THE GRID (B, 21 Oct 2026: a 30-minute grid like real TV): every show starts on the hour or the half hour and takes as many
  // half hours as its episode needs. A show whose episode is 15 minutes or less packs as many of its episodes as fit into one
  // half hour (one block). What is left of a block after its last episode is the break (see breakOf).
  // One broadcast day of one channel as plain minutes: [{ s: show index, st: minute of the day (360 = 6:00 am), du: the
  // episode's minutes, j: how many of this show's episodes aired before it today, k: daypart letter, b: the minute its block
  // starts (packed episodes share it) }]. len(s, j): the minutes of show s's episode number j of the day; without it every
  // episode takes the show's typical minutes (the first pass of weekOf, and the builder's probe).
  function planDay(ch, lib, bd, len) {
    const dow = dowOf(bd), w = weekOfDay(bd);
    const P = ch.p || {};
    const cap0 = ch.cap || 2;
    const cnt = {}, use = {};
    const out = [];
    const em = len ? (s) => len(s, cnt[s] || 0) : (s) => lib.rt[s] || 30;
    const packs = (s) => em(s) <= SHORT && epTotal(lib, s) > 1;
    // rt(s): the minutes the show's next block takes, always whole half hours.
    const rt = (s) => (packs(s) ? SLOT : Math.ceil(em(s) / SLOT) * SLOT);
    let t = DAY0;
    const put = (s, k) => {
      const b = t, end = t + rt(s), pack = packs(s), E = epTotal(lib, s) || 1;
      for (let n = 0; n < E && (n === 0 || (pack && t + em(s) <= end)); n++) {
        const du = em(s);
        out.push({ s: s, st: t, du: du, j: cnt[s] || 0, k: k, b: b });
        cnt[s] = (cnt[s] || 0) + 1;
        t += du;
      }
      t = end;
      use[s] = (use[s] || 0) + 1;
    };
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
          if ((use[s] || 0) < cap0 && t + rt(s) <= win.b + TOL2) { put(s, 'v'); break; }
        }
      }
      // A daypart left with no pool (self-pruning removed every show in it) borrows the nearest one, so the day still runs 6 am to
      // 6 am with no hole; a hole left the page holding on an airing that was already over (audit 21 Oct 2026, H1).
      const pool = P[win.k] && P[win.k].length ? P[win.k] : SPARE.map((x) => P[x]).find((x) => x && x.length);
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
            if (rt(s) > room || (use[s] || 0) >= cap) continue;
            seen++;
            if (t + rt(s) <= win.b + tol) { pick = idx; break; }
          }
          if (pick < 0 && seen > 0) {
            for (let k = 0; k < n; k++) {
              const idx = (pos + k) % n;
              if (taken[idx]) continue;
              const s = pool[idx];
              if (rt(s) > room || (use[s] || 0) >= cap) continue;
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
      // The day's last daypart may not run past 6:00 am: the next broadcast day starts on the clock, so a show that ran over
      // would be cut short in the guide and the morning's first show would start late.
      const dayEnd = di === wins.length - 1;
      fill(dayEnd ? 0 : TOL1);
      if (!dayEnd && win.b - t > GAP) fill(TOL2);
      // Half hours before the next daypart that no show of the pool fits: first whatever from the filler library fits inside
      // them (B's originals first), one after another; then, if any are still empty, the last show gives its place to an item
      // that fills its block and the gap.
      if (lib.sp) {
        const mark = (from) => { for (let u = from; u < out.length; u++) out[u].sp = 1; };
        for (let g = 0; g < 20 && win.b - t >= 1; g++) {
          const s = pickFill(ch, lib, bd, win.k, di, win.b - t, 0, cnt, 'insert', rt);
          if (s < 0) break;
          const from = out.length;
          put(s, win.k); mark(from);
        }
        const last = out[out.length - 1];
        if (last && last.k === win.k && !last.sp && win.b - t >= 3) {
          const s = pickFill(ch, lib, bd, win.k, di, win.b - last.b, t - last.b, cnt, 'swap', rt);
          if (s >= 0) {
            while (out.length && out[out.length - 1].b === last.b) cnt[out.pop().s] -= 1;
            use[last.s] -= 1; t = last.b;
            const from = out.length;
            put(s, win.k); mark(from);
          }
        }
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
    const off = keyOf(lib, s) % E;
    return mod(w * perWeek + before + j + off, E);
  }
  // The minutes of episode number i of a show. lib.ln[s] holds one character per episode, in the order of the runs: its
  // code less 35 is the minutes (the file rounded up). A show with no ln, or an episode without a length, takes the show's typical minutes.
  function epLen(lib, s, i) {
    const L = lib.ln && lib.ln[s], m = L ? L.charCodeAt(i) - 35 : 0;
    return m > 0 ? m : lib.rt[s] || 30;
  }

  // The seven days of a week (Monday first) for one channel, planned once and kept: airings with real instants.
  // Two passes when the library has episode lengths: the first plans the week on typical minutes, which settles how many
  // times each show airs this week (the step from one week's episodes to the next); the second plans it again with each
  // airing as long as the very episode it will play, so the day is laid out in the real lengths.
  function weekOf(ch, lib, w) {
    const q = forWeek(ch, lib, w);
    ch = q[0]; lib = q[1];
    let m = WK.get(ch);
    if (!m) { m = new Map(); WK.set(ch, m); }
    let r = m.get(w);
    if (r) return r;
    const plan = (len) => {
      const days = [], per = {}, base = [];
      for (let d = 0; d < 7; d++) {
        const b = Object.assign({}, per);
        const day = planDay(ch, lib, w * 7 - 3 + d, len && ((s, j) => len(s, j, b)));
        days.push(day);
        base.push(b);
        for (let u = 0; u < day.length; u++) per[day[u].s] = (per[day[u].s] || 0) + 1;
      }
      return { days: days, per: per, base: base };
    };
    const first = plan(null);
    const perWeek = (s) => first.per[s] || 1;
    const P = lib.ln ? plan((s, j, b) => epLen(lib, s, epPick(lib, s, w, perWeek(s), b[s] || 0, j))) : first;
    const days = P.days, base = P.base;
    // An airing: show s, episode i (season se, number n), on the air from st to en (instants). du: the episode's minutes; the
    // rest of [st, en) is the break. g0, g1: the block it belongs to (packed episodes of one show share one block in the guide).
    const air = days.map((day, d) => {
      const bd = w * 7 - 3 + d, C = dayClock(bd);
      const list = day.map((x, u) => {
        const i = epPick(lib, x.s, w, perWeek(x.s), base[d][x.s] || 0, x.j);
        const c = epCode(lib, x.s, i);
        const st = C.S + (x.st - DAY0) * MIN;
        const en = C.S + ((u + 1 < day.length ? day[u + 1].st : C.end) - DAY0) * MIN;
        return { s: x.s, i: i, se: c[0], n: c[1], st: st, en: en, du: x.du, k: x.k, g0: C.S + (x.b - DAY0) * MIN, g1: en };
      });
      for (let u = list.length - 2; u >= 0; u--) if (day[u + 1].b === day[u].b) list[u].g1 = list[u + 1].g1;
      return list;
    });
    r = { air: air };
    m.set(w, r);
    if (m.size > 6) m.delete(m.keys().next().value);
    return r;
  }
  function dayAirings(ch, lib, bd) { return weekOf(ch, lib, weekOfDay(bd)).air[dayIn(bd)]; }

  // THE BREAKS (B, 21 Oct 2026): what fills the rest of a block after its show's last episode, the same for everyone. In order:
  // B's originals, then short episodes (15 minutes or less) of the other shows in the same daypart's pool on this channel, then
  // TV specials; the player covers what is left, and the seconds a file ends inside its last minute, with the chained cards.
  // Same audience, after-dark and season rules as the gap specials (pickFill). A special or an original airs once a day per
  // channel (an original series plays the day's episode); a short episode airs once a day.
  // An airing with a break of a minute or more gets br: { at, fill: [{ s, i, se, n, st, en, du }], end }: the fill plays back
  // to back from at, and the cards run from the last one to end (the next block).
  function shortsOf(ch, lib, k) {
    let m = SH.get(ch);
    if (!m || m.lib !== lib) { m = { lib: lib }; SH.set(ch, m); }
    if (!m[k]) m[k] = ((ch.p || {})[k] || []).filter((s) => (lib.rt[s] || 30) <= SHORT && epTotal(lib, s) > 1 && !(lib.gh && lib.gh[s]));
    return m[k];
  }
  function dayBreaks(ch, lib, bd) {
    const fw = forWeek(ch, lib, weekOfDay(bd));
    ch = fw[0]; lib = fw[1];
    const wk = weekOf(ch, lib, weekOfDay(bd)), d = dayIn(bd), air = wk.air[d];
    if (!wk.br) wk.br = [];
    if (wk.br[d]) return air;
    wk.br[d] = 1;
    const cnt = {}, used = {};
    for (const a of air) cnt[a.s] = 1;
    const one = (s) => mod(idHash(ch.id) + bd, epTotal(lib, s) || 1);
    const fl = (s) => epLen(lib, s, one(s));
    for (let u = 0; u < air.length; u++) {
      const a = air[u], end = a.en, k = a.k === 'v' ? 'p' : a.k;
      // A show that left the site during a frozen week (lib.gh, see adopt) keeps its slot: the whole slot is break, filled from its start.
      let t = a.st + (lib.gh && lib.gh[a.s] ? 0 : a.du * MIN);
      if (end - t < MIN) continue;
      const fill = [];
      const add = (s, i) => { const c = epCode(lib, s, i), du = epLen(lib, s, i); fill.push({ s: s, i: i, se: c[0], n: c[1], st: t, en: t + du * MIN, du: du }); t += du * MIN; };
      const shorts = shortsOf(ch, lib, k), turn = idHash(ch.id) + bd * 31 + u * 7;
      for (let g = 0; g < 12 && end - t >= MIN; g++) {
        const room = (end - t) / MIN;
        let s = pickFill(ch, lib, bd, k, u, room, 0, cnt, 'insert', fl, [0]);
        if (s >= 0) { cnt[s] = 1; add(s, one(s)); continue; }
        // A short show steps through its episodes from where today starts (a different place each day), skipping any that
        // do not fit the room left; used[c] counts how far it has gone today.
        let hit = -1, hi = 0;
        for (let q = 0; q < Math.min(shorts.length, 4 * LOOK) && hit < 0; q++) {
          const c = shorts[(turn + q) % shorts.length], E = epTotal(lib, c), from = keyOf(lib, c) + bd * 7;
          if (c === a.s) continue;
          for (let y = used[c] || 0; y < Math.min(E, (used[c] || 0) + LOOK); y++) {
            const i = mod(from + y, E);
            if (epLen(lib, c, i) <= room) { hit = c; hi = i; used[c] = y + 1; break; }
          }
        }
        if (hit >= 0) { add(hit, hi); continue; }
        s = pickFill(ch, lib, bd, k, u, room, 0, cnt, 'insert', fl, [1, 2, 3]);
        if (s >= 0) { cnt[s] = 1; add(s, one(s)); continue; }
        break;
      }
      a.br = { at: lib.gh && lib.gh[a.s] ? a.st : a.st + a.du * MIN, fill: fill, end: end };
    }
    return air;
  }
  // The break after an airing (see dayBreaks), or null when its episode runs into the next airing (a packed episode).
  function breakOf(ch, lib, a) {
    const list = dayBreaks(ch, lib, dayOf(a.st));
    for (let u = 0; u < list.length; u++) if (list[u].st === a.st) return list[u].br || null;
    return null;
  }

  // SELF-PRUNING (B, 21 Oct 2026: a removed show must never break the TV). data/tv.json names every show it uses (tv.sl, the
  // slugs by place), and the page's show list (data/index.js) may come from another build, since each file is cached on its
  // own. adopt() lays the plan onto the list the page has, by name: a show the page does not have drops out of every pool and
  // the filler list, and a channel left with no shows drops out. Returns { rt, lib, ln, sp, key, gh, channels } in the page's places.
  // A FROZEN week (tv.fz, B 25 Oct 2026: a publish never moves a show mid-week) keeps a show the page no longer has as a stand-in at
  // a place after the page's list (gh marks it): its slots keep their times and play as breaks (originals, shorts, specials, then the
  // cards), so no other show moves up. It is never used as a filler. A channel whose shows have all gone still drops out.
  // tv.nx (next week's plan, from week tv.nx.w on) is laid on the same way: each channel carries its next-week self as nx, and the
  // result carries nx (the next week's library) and nw (the week it starts), which weekOf and dayBreaks switch to.
  function adopt(tv, slugs) {
    const one = (t) => {
      const sl = t.sl, n0 = slugs.length;
      if (!sl || (sl.length === n0 && sl.every((x, i) => !x || x === slugs[i]))) {
        return { rt: t.rt, lib: t.lib, ln: t.ln || [], sp: t.sp || [], key: sl ? sl.map((x, i) => idHash(x || slugs[i])) : null, gh: null, channels: t.channels };
      }
      const at = {};
      for (let i = 0; i < n0; i++) at[slugs[i]] = i;
      let extra = n0;
      const to = sl.map((x) => (!x ? -1 : at[x] != null ? at[x] : t.fz ? extra++ : -1));
      const rt = [], lib = [], ln = [], key = [], gh = [];
      for (let j = 0; j < extra; j++) { rt.push(0); lib.push(0); ln.push(0); key.push(j < n0 ? idHash(slugs[j]) : 0); gh.push(j < n0 ? 0 : 1); }
      to.forEach((j, i) => { if (j >= 0) { rt[j] = t.rt[i]; lib[j] = t.lib[i]; ln[j] = (t.ln || [])[i] || 0; key[j] = idHash(sl[i]); } });
      const map = (list) => (list || []).map((i) => to[i]).filter((j) => j >= 0 && rt[j] > 0);
      const real = (list) => map(list).filter((j) => !gh[j]);
      const sp = (t.sp || []).map((e) => [to[e[0]]].concat(e.slice(1))).filter((e) => e[0] >= 0 && rt[e[0]] > 0 && !gh[e[0]]);
      const channels = [];
      for (const c of t.channels) {
        const p = {};
        let n = 0;
        for (const k in c.p || {}) { const v = map(c.p[k]); if (v.length) { p[k] = v; for (const j of v) if (!gh[j]) n++; } }
        if (!n) continue;
        const x = Object.assign({}, c, { p: p });
        if (c.fo) x.fo = real(c.fo);
        if (c.spn) x.spn = real(c.spn);
        channels.push(x);
      }
      return { rt: rt, lib: lib, ln: ln, sp: sp, key: key, gh: gh, channels: channels };
    };
    const A = one(tv);
    if (tv.nx && tv.nx.channels) {
      const B = one(tv.nx), by = {};
      for (const c of B.channels) by[c.id] = c;
      A.channels = A.channels.map((c) => (by[c.id] ? Object.assign({}, c, { nx: by[c.id] }) : c));
      A.nx = { rt: B.rt, lib: B.lib, ln: B.ln, sp: B.sp, key: B.key, gh: B.gh };
      A.nw = tv.nx.w;
      A.nxn = B.channels.length;
    }
    return A;
  }

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
  // Where an airing's block sits on the time axis (pixels from the left edge of the time area) and how wide it is. Packed
  // episodes share one block: g0 to g1.
  const g0 = (a) => (a.g0 != null ? a.g0 : a.st), g1 = (a) => (a.g1 != null ? a.g1 : a.en);
  function blockBox(a, t0, ppm) { return { left: Math.round(xOf(g0(a), t0, ppm) * 100) / 100, width: Math.round(((g1(a) - g0(a)) / MIN) * ppm * 100) / 100 }; }
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
  // block on the channel, Up and Down to the channel above and below at the same time, PageUp and PageDown three hours, Home to now.
  function focusMove(fo, key, list, lib, lo, hi, now) {
    const c = list[fo.ci];
    if (!c) return fo;
    const cur = airingAt(c, lib, fo.t);
    let ci = fo.ci, t = fo.t;
    if (key === 'ArrowLeft') t = g0(airingAt(c, lib, g0(cur) - 1));
    else if (key === 'ArrowRight') t = g1(cur);
    else if (key === 'ArrowUp') ci = Math.max(0, ci - 1);
    else if (key === 'ArrowDown') ci = Math.min(list.length - 1, ci + 1);
    else if (key === 'PageUp') t = fo.t - 180 * MIN;
    else if (key === 'PageDown') t = fo.t + 180 * MIN;
    else if (key === 'Home') t = now;
    else return fo;
    return { ci: ci, t: Math.max(lo, Math.min(hi, t)) };
  }

  return { MIN, DAYMS, DPNAME, SLOT, setOff, dayOf, toAbs, dowOf, weekOfDay, planDay, weekOf, dayAirings, airingAt, chanNow, nextAiring, airingsBetween, daypartOf, epTotal, epCode, epPick, epLen, breakOf, adopt,
    localAt, xOf, tOf, blockBox, rowSpan, halfHours, chanGroup, filterChannels, blockHit, focusMove };
}

// ---- Node only: the builder ----------------------------------------------------------------------------------------------
const G = tvgridFactory();
const source = '(' + tvgridFactory.toString().replace(/\r\n/g, '\n') + ')()';

const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
const isMovieSlug = (slug) => String(slug).startsWith('movie-');

// What the schedule needs to know about one assembled show: its typical length, its episodes as runs of
// [season, first number, count], each episode's own length (ln, see epLen), and the flags that decide which dayparts it can fill.
// An episode's slot is its file rounded up to the whole minute (e.sec, the exact seconds, rides along from app.js), so the
// file always ends inside its slot; without e.sec it is e.min.
const slotMin = (e) => (e.sec > 0 ? Math.ceil(e.sec / 60) : e.min > 0 ? e.min : 0);
function showInfo(s) {
  const mins = [], runs = [], each = [];
  let eps = 0;
  for (const se of s.seasons || []) {
    let last = null;
    for (const e of se.episodes || []) {
      eps++;
      const m = slotMin(e);
      if (m > 0) mins.push(m);
      each.push(m);
      if (last && last[0] === se.season && e.n === last[1] + last[2]) last[2]++;
      else { last = [se.season, e.n, 1]; runs.push(last); }
    }
  }
  const movie = isMovieSlug(s.slug);
  const rt = Math.max(5, Math.min(300, median(mins) || s.runtime || (movie ? 90 : 30)));
  // One character per episode (code = 35 + minutes, at most 600); '' when every episode is the typical length.
  const ln = each.every((m) => m === rt) ? '' : each.map((m) => String.fromCharCode(35 + Math.min(600, m))).join('');
  const genres = s.genres || [], tags = s.tags || [];
  const has = (g) => genres.indexOf(g) >= 0;
  const late = ['Adult Swim', 'MTV', 'Sketch and Comedy'].indexOf(s.type) >= 0 || tags.some((t) => ['Late Night Classics', 'Variety & Talk', 'Awkward & Absurd'].indexOf(t) >= 0) || has('Talk');
  const edgy = s.type === 'Adult Swim' || s.type === 'MTV' || late;
  const kids = !movie && !edgy && (has('Kids') || (has('Animation') && (has('Family') || has('Action & Adventure') || has('Sci-Fi & Fantasy'))));
  const score = (s.rating || 6) + 0.5 * Math.log10(eps + 1);
  return { rt, runs: [].concat(...runs), ln, eps, movie, kids, late, score };
}

// Per-daypart sizes (weekday minutes), used to see how many shows a pool should hold.
const WIN = { m: 180, d: 480, e: 180, p: 180, l: 180, o: 240 };

// One channel's plan from its shows. recs: [{ i, rt, eps, movie, kids, late, score }] (i = the show's place in the full list).
// Returns the channel as stored in tv.json. Pure and deterministic: ties break on the show's name (sl, its slug; B 25 Oct 2026: a show
// added elsewhere in the list must not reorder a pool), then its place.
function planChannel(meta, recs, rt) {
  const byScore = (a, b) => b.score - a.score || (a.sl && b.sl && a.sl !== b.sl ? (a.sl < b.sl ? -1 : 1) : a.i - b.i);
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
  // At least 3 kids shows, as for km: one show tagged Kids made the two-show CollegeHumor channel a kids channel (audit A25-030).
  if (kidsN >= 3 && kidsN / series.length >= 0.5) ch.kc = 1;
  if (meta.kind === 'network' && KIDS_NETWORK.test(meta.name)) ch.kc = 1; // by name, whatever their shows' genres say (audit P3A-02)
  // How many airings each daypart holds on a weekday: the step the weekly (or daily) rotation takes through the pool.
  const REF_BD = 20299;
  const probe = Object.assign({}, ch, { sn: {} });
  const seen = {};
  for (const a of G.planDay(probe, { rt }, REF_BD)) if (a.st === a.b) seen[a.k] = (seen[a.k] || 0) + 1;
  for (const k of Object.keys(seen)) if (k !== 'v') ch.sn[k] = Math.max(1, seen[k]);
  return ch;
}

// TV specials that can fill a gap (B, 20 Oct): 60 minutes or less. The catalog has no genres for them, so kids comes from the
// studio or a known kids title, and the holiday from the title. Returns '' (any audience, any time of year) or flags.
// The kids networks (B, 26 Oct: Nickelodeon and Disney are kids channels): kids specials only, and no spots. Disney+ is not one:
// most of its shows here are Marvel, Star Wars and grown-up dramas.
const KIDS_NETWORK = /^(?:nickelodeon|nick jr\.?|nicktoons|disney channel|disney junior|disney xd|cartoon network|boomerang|pbs kids)$/i;
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
// B's originals for the filler library (catalog/fillers.json, written by HQ). Each entry names a show in the catalog by slug
// (so it plays like any show; a series of skits rotates through its episodes) with audience (everyone, kids, after-dark),
// season (halloween, thanksgiving, christmas, valentines, easter, or none) and where it may air: channels (ids) and kinds
// (all, row, collection, network). No channels and no kinds means every channel except Late Night.
// Returns { items: [[show, flags, 0]], scope(channel) -> the show indices a channel may take }.
const SEASON_CODE = { halloween: 'h', thanksgiving: 't', christmas: 'x', valentines: 'v', easter: 'e' };
function buildOriginals(shows, cfg) {
  const at = new Map(shows.map((s, i) => [s.slug, i]));
  const list = [];
  for (const [slug, o] of Object.entries((cfg && cfg.originals) || {})) {
    if (!at.has(slug) || !o || typeof o !== 'object') continue;
    let f = '';
    if (o.audience === 'kids') f += 'k';
    if (o.audience === 'after-dark') f += 'r';
    if (SEASON_CODE[o.season]) f += SEASON_CODE[o.season];
    list.push({ i: at.get(slug), f, channels: Array.isArray(o.channels) ? o.channels : [], kinds: Array.isArray(o.kinds) ? o.kinds : [] });
  }
  const scope = (ch) => list.filter((x) => (!x.channels.length && !x.kinds.length ? !ch.adult : x.channels.indexOf(ch.id) >= 0 || x.kinds.indexOf(ch.kind) >= 0)).map((x) => x.i);
  return { items: list.map((x) => [x.i, x.f, 0]), scope };
}

// The shared library for the whole page: typical minutes, episode runs and episode lengths by place in the full show list (0 where unused).
function buildLib(shows) {
  const infos = shows.map((s) => showInfo(s));
  return { infos, rt: infos.map((x) => x.rt), runs: infos.map((x) => x.runs), ln: infos.map((x) => x.ln) };
}
// Only the shows that sit on some channel are kept in the file; everything else is 0.
function trimLib(lib, used) {
  return { rt: lib.rt.map((v, i) => (used.has(i) ? v : 0)), lib: lib.runs.map((v, i) => (used.has(i) ? v : 0)), ln: lib.ln.map((v, i) => (used.has(i) && v ? v : 0)) };
}

// THE HQ CHECK (B: every check also runs by hand in HQ, with no AI): the doctor's tv:schedule light. For one day from at, on every
// channel: the airings tile, every block starts on the hour or the half hour, no episode runs past its airing, and every show the plan
// names (tv.sl, what the page's self-pruning reads) is in the build; plus how much of the breaks the cards still cover (yellow when a
// channel shows more than 20 minutes of cards an hour: more originals or shorts would help there). A FROZEN week (tv.fz, or tv.nx.fz)
// may name shows that left the site since its Monday: their slots hold as breaks (adopt), which is by design, so they are counted in
// the message, not as a fault. A fresh plan that names a missing show is a fault (red), as before.
function checkTv(tv, slugs, at) {
  const T = tvgridFactory(), A = T.adopt(tv, slugs), lib = A;
  const have = new Set(slugs), plans = [tv].concat(tv.nx && tv.nx.channels ? [tv.nx] : []);
  const miss = new Set();
  let held = 0, dropped = 0;
  for (const p of plans) {
    const gone = (p.sl || []).filter((x) => x && !have.has(x));
    const left = p === tv ? A.channels.length : A.nxn || 0;
    if (p.fz) held = Math.max(held, gone.length); else { for (const x of gone) miss.add(x); dropped = Math.max(dropped, p.channels.length - left); }
  }
  const missing = miss.size;
  let bad = 0, cards = 0, worst = 0, worstName = '';
  for (const ch of A.channels) {
    const air = T.airingsBetween(ch, lib, at, at + 86400000);
    let c = 0;
    for (let u = 0; u < air.length; u++) {
      const a = air[u], d = new Date(a.g0);
      if (a.st + a.du * 60000 > a.en || (u + 1 < air.length && a.en !== air[u + 1].st) || d.getMinutes() % 30 || d.getSeconds()) bad++;
      const br = T.breakOf(ch, lib, a);
      c += (a.en - a.st) / 60000 - a.du - (br ? br.fill.reduce((n, x) => n + x.du, 0) : 0);
    }
    cards += c;
    if (c / 24 > worst) { worst = c / 24; worstName = ch.name; }
  }
  const avg = cards / Math.max(1, A.channels.length) / 24;
  const fix = 'Re-run node scripts/site.js. If this stays red, node --test tests/tvgrid.test.js shows where the schedule breaks.';
  if (missing || dropped) return { level: 'red', detail: missing + ' shows the TV plan names are not in the build; ' + dropped + ' channels would be left with no shows', fix };
  if (bad) return { level: 'red', detail: bad + ' airings off the grid, overlapping, or running past their time', fix };
  const detail = A.channels.length + ' channels fill the day on the 30-minute grid; holding cards ' + avg.toFixed(1) + ' min an hour on average, most ' + worst.toFixed(1) + ' on ' + worstName
    + (held ? '; ' + held + ' show' + (held === 1 ? '' : 's') + ' left the site since the lineup was frozen, their slots hold as breaks until Monday' : '');
  if (worst > 20) return { level: 'yellow', detail, fix: 'More of your originals (catalog/fillers.json, in HQ) or short episodes on that channel would fill its breaks.' };
  return { level: 'green', detail };
}

module.exports = { tvgridFactory, source, showInfo, planChannel, buildLib, trimLib, isMovieSlug, specialFlags, buildSpecials, buildOriginals, checkTv, G };
