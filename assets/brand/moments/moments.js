// Moments: voidtv.net reorganizing around what is in the news (Bryan, 22 Nov 2026: "a way to capitalize off current events and
// allow reorganizing around them ie gta ... for movies and tv and all things. we have the archive of history to use to
// build relevant rows or pages, ads"). One engine for every area, like the area menu (assets/brand/areas/areas.js).
//
// A moment is data (catalog/moments.json, kept in HQ > Moments): a name, its dates (start, peak, end), why it matters,
// and for each area a rule that picks from that area's own catalogue, the row's title, and an ad line. The engine only
// reads: it says which moments are on today and which of an area's items each one picks. Each area draws the rows its
// own way. Nothing here knows a game, a show or a film; an area hands its items in one shape:
//   { id, item, title, year, wikidata, genres: [], people: [], series, system, plays }
//
// The rules (tested in tests/moments.test.js):
// - A moment shows when it is on, approved, and today (the visitor's own date) is from its start to its end, so it turns
//   on and off by itself with no new build. Kids pages ask with kids: true and see only moments marked kids.
// - An item is picked when it matches ANY of: items (its id or Archive item), wikidata, titles (whole words), people,
//   series. Then it must pass ALL of: years [from, to], genres, systems. `not` takes items out.
// - Order: the rule's `order` first, as written; then `sort`: year (oldest first, the default), plays, or title.
// - A row shows only with at least `min` items (2 unless set), so a moment never shows one lonely box.
// - At most `max` moments a page (2 unless set), the nearest peak first.
(function (root) {
  'use strict';
  const AREAS = ['play', 'shows', 'movies', 'live', 'trivia', 'uni'];
  const DAY = /^\d{4}-\d{2}-\d{2}$/;

  // The visitor's own date as YYYY-MM-DD (a moment's dates are whole days where the visitor is).
  function today(now) {
    const d = now instanceof Date ? now : new Date(now == null ? Date.now() : now);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  const dayNum = (s) => Math.floor(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 864e5);

  // Words for matching: lower case, letters and digits only, one space between (so "Grand Theft Auto: Advance" has
  // "grand theft auto" in it, and "Autobahn" does not have "auto").
  const words = (s) => ' ' + String(s == null ? '' : s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
  const list = (x) => (Array.isArray(x) ? x : x == null || x === '' ? [] : [x]).map((v) => String(v)).filter(Boolean);
  const lower = (x) => list(x).map((v) => v.toLowerCase());

  // Is this moment showing today? (pure)
  function isOn(m, day, opts) {
    if (!m || m.on !== true || !m.approved) return false;
    if (!DAY.test(String(m.start || '')) || !DAY.test(String(m.end || ''))) return false;
    if (opts && opts.kids && m.kids !== true) return false;
    return m.start <= day && day <= m.end;
  }
  // The moments showing today, the nearest peak first (a moment without a peak counts its start). (pure)
  function active(moments, opts) {
    const o = opts || {}, day = today(o.now);
    const near = (m) => Math.abs(dayNum(day) - dayNum(DAY.test(String(m.peak || '')) ? m.peak : m.start));
    return (Array.isArray(moments) ? moments : []).filter((m) => isOn(m, day, o))
      .sort((a, b) => near(a) - near(b) || String(a.start).localeCompare(String(b.start)) || String(a.id).localeCompare(String(b.id)));
  }

  // The items one rule picks from an area's catalogue, in order (pure).
  function pick(rule, items) {
    const r = rule || {}, m = r.match || {};
    const ids = new Set(lower(m.items)), wd = new Set(list(m.wikidata).map((q) => q.toUpperCase()));
    const titles = list(m.titles).map(words).filter((t) => t.trim()), people = list(m.people).map(words).filter((t) => t.trim());
    const series = new Set(lower(m.series)), genres = new Set(lower(m.genres)), systems = new Set(lower(m.systems)), not = new Set(lower(m.not));
    const years = Array.isArray(m.years) ? m.years.map((y) => (y == null || y === '' ? null : +y)) : [];
    const [from, to] = [years[0] == null || isNaN(years[0]) ? null : years[0], years[1] == null || isNaN(years[1]) ? null : years[1]];
    const keys = (g) => [g.id, g.item].filter((k) => k != null).map((k) => String(k).toLowerCase());
    const any = (g) => keys(g).some((k) => ids.has(k))
      || list(g.wikidata).some((q) => wd.has(q.toUpperCase()))
      || (titles.length && titles.some((t) => words(g.title).includes(t)))
      || (people.length && list(g.people).some((p) => people.some((t) => words(p).includes(t))))
      || (series.size && series.has(String(g.series || '').toLowerCase()));
    const all = (g) => (from == null || (g.year && g.year >= from)) && (to == null || (g.year && g.year <= to))
      && (!genres.size || lower(g.genres).some((x) => genres.has(x)))
      && (!systems.size || systems.has(String(g.system || '').toLowerCase()));
    const out = (Array.isArray(items) ? items : []).filter((g) => g && !keys(g).some((k) => not.has(k)) && any(g) && all(g));
    const order = lower(r.order), at = (g) => Math.min(Infinity, ...keys(g).map((k) => { const j = order.indexOf(k); return j < 0 ? Infinity : j; }));
    const by = r.sort === 'plays' ? (a, b) => (b.plays || 0) - (a.plays || 0)
      : r.sort === 'title' ? (a, b) => String(a.title).localeCompare(String(b.title))
        : (a, b) => (a.year || 9999) - (b.year || 9999);
    return out.sort((a, b) => at(a) - at(b) || by(a, b) || String(a.title).localeCompare(String(b.title)));
  }

  // An area's moment rows today: [{ id, name, title, about, ad, items }], at most opts.max (2), each with at least its
  // rule's min (2) items. The ad is the moment's own line when its ad belongs to this area (or names none). (pure)
  function rows(moments, area, items, opts) {
    const o = opts || {}, max = o.max == null ? 2 : o.max, out = [];
    for (const m of active(moments, o)) {
      const rule = m.areas && m.areas[area];
      if (!rule) continue;
      const got = pick(rule, items), min = rule.min == null ? 2 : Math.max(1, +rule.min || 1);
      if (got.length < min) continue;
      const ad = m.ad && m.ad.line && (!m.ad.area || m.ad.area === area) ? { line: String(m.ad.line), go: String(m.ad.go || '') } : null;
      out.push({ id: m.id, name: m.name, title: String(rule.title || m.name || ''), about: String(rule.about || ''), ad, items: got });
      if (out.length >= max) break;
    }
    return out;
  }

  // A moment record's problems, in plain words (HQ refuses to save one that has any). [] when it is fine. (pure)
  function problems(m) {
    const p = [];
    if (!m || typeof m !== 'object') return ['A moment must be a record.'];
    if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(String(m.id || ''))) p.push('Its id must be short: small letters, digits and dashes.');
    if (!String(m.name || '').trim()) p.push('It needs a name.');
    for (const k of ['start', 'end']) if (!DAY.test(String(m[k] || ''))) p.push('Its ' + k + ' must be a date like 2026-11-22.');
    if (m.peak && !DAY.test(String(m.peak))) p.push('Its peak must be a date like 2026-12-05, or empty.');
    if (DAY.test(String(m.start)) && DAY.test(String(m.end)) && m.start > m.end) p.push('It ends before it starts.');
    if (m.peak && DAY.test(String(m.peak)) && (m.peak < m.start || m.peak > m.end)) p.push('Its peak must fall between its start and its end.');
    const text = JSON.stringify(m);
    if (/[\u2014\u2013]/.test(text)) p.push('It has a long dash in it; use a comma, a colon or "to" instead.');
    const areas = m.areas && typeof m.areas === 'object' ? Object.keys(m.areas) : [];
    if (!areas.length) p.push('It needs at least one area with a rule.');
    for (const a of areas) {
      if (!AREAS.includes(a)) { p.push('"' + a + '" is not an area (' + AREAS.join(', ') + ').'); continue; }
      const r = m.areas[a] || {}, mm = r.match || {};
      if (!String(r.title || '').trim()) p.push('The ' + a + ' row needs a title.');
      if (!['items', 'wikidata', 'titles', 'people', 'series'].some((k) => list(mm[k]).length)) p.push('The ' + a + ' rule picks nothing: give it Archive items, title words, Wikidata ids, people or a series.');
      if (list(mm.wikidata).some((q) => !/^Q\d+$/i.test(q))) p.push('The ' + a + ' rule has a Wikidata id that is not like Q94501.');
    }
    if (m.ad && m.ad.area && !AREAS.includes(m.ad.area)) p.push('The ad names an area that does not exist.');
    if (m.ad && String(m.ad.line || '').length > 120) p.push('The ad line is over 120 letters.');
    return p;
  }

  const api = { AREAS, today, words, isOn, active, pick, rows, problems };
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }
  // In a page: the approved moments sit beside this file (the site build writes moments.json there, with the same ?v= as
  // this script, so a change in HQ reaches visitors at once). VoidMoments.ready gives the list; [] when there is none.
  let v = '';
  try { const s = document.currentScript && document.currentScript.src; v = s ? new URL(s).search : ''; } catch (e) { /* no version */ }
  const base = (function () { try { return new URL('.', document.currentScript.src).href; } catch (e) { return '/assets/brand/moments/'; } })();
  api.ready = fetch(base + 'moments.json' + v).then((r) => (r.ok ? r.json() : { moments: [] })).then((d) => (d && Array.isArray(d.moments) ? d.moments : [])).catch(() => []);
  api.rowsFor = (area, items, opts) => api.ready.then((ms) => rows(ms, area, items, opts));
  root.VoidMoments = api;
})(typeof self !== 'undefined' ? self : this);
