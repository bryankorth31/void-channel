// HQ > Moments: Bryan adds, edits and switches moments by hand, with no AI (Bryan, 22 Nov 2026; HQ manual mode).
// A moment lives in catalog/moments.json; Publish now sends it to voidtv.net like any catalog change. The rules a moment is
// read by are the engine's (assets/brand/moments/moments.js); this file only keeps the list and shows what each area's rule
// picks today, from that area's own catalogue.
const fs = require('fs');
const path = require('path');
const M = require('../../assets/brand/moments/moments.js');

const ROOT = path.join(__dirname, '..', '..');

function file(profile) { return path.join((profile || require('./profile')).catalogDir, 'moments.json'); }
function read(f) {
  try { const d = JSON.parse(fs.readFileSync(f, 'utf8')); return { about: d.about || '', moments: Array.isArray(d.moments) ? d.moments : [] }; } catch (e) { return { about: '', moments: [] }; }
}
function write(f, d) { fs.writeFileSync(f, JSON.stringify(d, null, 2) + '\n'); }

// Each area's catalogue in the engine's one shape. An area not wired yet answers null (HQ says so instead of "0 picked").
const CATALOGUES = {
  play: (root) => {
    let s = null;
    try { s = JSON.parse(fs.readFileSync(path.join(root, 'play', 'shelf', 'index.json'), 'utf8')); } catch (e) { return null; }
    return (s && Array.isArray(s.games) ? s.games : []).map((g) => ({ id: g.id, item: g.item, title: g.title, year: g.year, genres: g.genres, system: g.system, plays: g.plays, wikidata: g.wikidata }));
  },
};
function catalogue(area, root) { const c = CATALOGUES[area]; return c ? c(root || ROOT) : null; }

// Where a moment stands today, in words.
function status(m, now) {
  const day = M.today(now);
  if (!m.approved) return 'waiting for your yes';
  if (m.on !== true) return 'switched off';
  if (String(m.end) < day) return 'over';
  if (String(m.start) > day) return 'starts ' + m.start;
  return 'showing';
}

// What each area's rule picks today: the count and the first names, or null where the area is not wired yet.
function picks(m, opts) {
  const o = opts || {}, out = {};
  for (const [area, rule] of Object.entries((m && m.areas) || {})) {
    const items = catalogue(area, o.root);
    if (!items) { out[area] = null; continue; }
    const got = M.pick(rule, items), min = rule.min == null ? 2 : +rule.min || 1;
    out[area] = { count: got.length, min, shows: got.length >= min, first: got.slice(0, 40).map((g) => ({ id: g.id, title: g.title, year: g.year || null, system: g.system || '' })) };
  }
  return out;
}

function list(opts) {
  const o = opts || {}, d = read(file(o.profile));
  return { areas: M.AREAS, wired: Object.keys(CATALOGUES), moments: d.moments.map((m) => ({ ...m, status: status(m, o.now), problems: M.problems(m), picks: picks(m, o) })) };
}

// Save one moment (new, or the one with its id). Refused with every problem in plain words; nothing is half written.
function save(input, opts) {
  const o = opts || {}, f = file(o.profile), d = read(f);
  const m = clean(input);
  const p = M.problems(m);
  if (p.length) { const e = new Error(p.join(' ')); e.status = 400; throw e; }
  const was = typeof input.was === 'string' && input.was ? input.was : m.id;
  if (was !== m.id && d.moments.some((x) => x.id === m.id)) { const e = new Error('Another moment already has the id "' + m.id + '".'); e.status = 400; throw e; }
  const i = d.moments.findIndex((x) => x.id === was);
  if (i < 0 && d.moments.some((x) => x.id === m.id)) { const e = new Error('Another moment already has the id "' + m.id + '".'); e.status = 400; throw e; }
  if (i >= 0) {
    const old = d.moments[i];
    if (m.approved && old.approved) m.approved = old.approved;          // the day of Bryan's first yes stays
    if (!m.source && old.source) m.source = old.source;
    d.moments[i] = m;                                                   // the form is the whole moment: a cleared field is cleared
  } else d.moments.push(m);
  write(f, d);
  return list(o);
}
function setOn(id, on, opts) {
  const o = opts || {}, f = file(o.profile), d = read(f), m = d.moments.find((x) => x.id === id);
  if (!m) { const e = new Error('No moment "' + id + '".'); e.status = 404; throw e; }
  m.on = !!on;
  if (on && !m.approved) m.approved = M.today(o.now);   // switching one on is Bryan's yes
  write(f, d);
  return list(o);
}
function remove(id, opts) {
  const o = opts || {}, f = file(o.profile), d = read(f), n = d.moments.length;
  d.moments = d.moments.filter((x) => x.id !== id);
  if (d.moments.length === n) { const e = new Error('No moment "' + id + '".'); e.status = 404; throw e; }
  write(f, d);
  return list(o);
}

// The form's fields into a moment record: text trimmed, lists from one-a-line text, years as numbers, empty parts left out.
function clean(b) {
  const s = (v, n) => String(v == null ? '' : v).trim().slice(0, n || 300);
  const lines = (v) => (Array.isArray(v) ? v : String(v == null ? '' : v).split(/\r?\n|,/)).map((x) => String(x).trim()).filter(Boolean).slice(0, 400);
  const m = { id: s(b.id, 41).toLowerCase(), name: s(b.name, 120), on: b.on === true, approved: b.approved === true ? M.today() : s(b.approved, 10) || '',
    start: s(b.start, 10), peak: s(b.peak, 10), end: s(b.end, 10), why: s(b.why, 600), kids: b.kids === true, areas: {} };
  if (!m.peak) delete m.peak;
  if (b.ad && s(b.ad.line)) m.ad = { line: s(b.ad.line, 160), go: s(b.ad.go, 60), area: s(b.ad.area, 10) };
  for (const [a, r] of Object.entries((b && b.areas) || {})) {
    if (!r) continue;
    const mm = r.match || {}, match = {};
    for (const k of ['items', 'titles', 'wikidata', 'people', 'series', 'genres', 'systems', 'not']) { const l = lines(mm[k]); if (l.length) match[k] = l; }
    const y = (Array.isArray(mm.years) ? mm.years : []).map((x) => (x === '' || x == null || isNaN(+x) ? null : +x));
    if (y.some((x) => x != null)) match.years = [y[0] == null ? null : y[0], y[1] == null ? null : y[1]];
    const rule = { title: s(r.title, 120), about: s(r.about, 600), match };
    const order = lines(r.order); if (order.length) rule.order = order;
    if (['year', 'plays', 'title'].includes(r.sort)) rule.sort = r.sort;
    if (r.min !== '' && r.min != null && !isNaN(+r.min)) rule.min = Math.max(1, Math.min(50, Math.round(+r.min)));
    m.areas[a] = rule;
  }
  if (s(b.source)) m.source = s(b.source, 400);
  return m;
}

module.exports = { list, save, setOn, remove, picks, status, clean, file };
