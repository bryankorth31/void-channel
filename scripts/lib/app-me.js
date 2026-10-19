// "Mine" (list, likes, history, reports): the pure parts of saving and importing it (audit SP-012).
//
// The page keeps one blob in localStorage ('voidtv:me'). Before this file existed every save wrote the whole
// in-memory blob, so a tab that was only playing a video rewrote (and erased) whatever another tab had saved
// since it loaded, and an import replaced values per key whatever their age and threw away every reported file.
//
// The rule now: a save does not write what the tab holds, it writes what the tab CHANGED.
//   meDiff(base, mine)            what this tab changed since it last looked at the stored blob (adds, edits, deletes)
//   meApply(stored, ops, ctx)     those changes laid onto the blob as it is stored right now, newest `at` winning a clash
//   meImportMerge(me, m)          the same idea for an exported file: checked entry by entry, newest `at` wins
// Deletes are real deletes (no tombstones): a removal only goes through when nobody changed that key meanwhile.
//
// app.js inlines meSource into the page (like app-fetch.js), so the browser and tests/app-me.test.js run the same
// code. Every function here must be self-contained (only each other and standard globals) and must carry no line
// comment after code (scripts/site.js refuses a page script that does).
function meCopy(x) { return JSON.parse(JSON.stringify(x)); }
function meSame(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function meHas(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

function meClean(m) {
  const out = { v: 1, list: {}, likes: {}, history: {}, reports: {} };
  if (!m || typeof m !== 'object' || m.v !== 1) return out;
  for (const k of Object.keys(m)) out[k] = m[k];
  for (const s of ['list', 'likes', 'history', 'reports']) if (!out[s] || typeof out[s] !== 'object' || Array.isArray(out[s])) out[s] = {};
  return out;
}

function meDiff(base, mine) {
  const ops = [];
  const A = base || {}, B = mine || {};
  for (const s of ['list', 'likes', 'history', 'reports']) {
    const a = A[s] || {}, b = B[s] || {};
    for (const k of Object.keys(b)) {
      if (b[k] === undefined) continue;
      if (!meHas(a, k) || !meSame(a[k], b[k])) ops.push({ s: s, k: k, set: b[k], was: meHas(a, k) ? a[k] : undefined });
    }
    for (const k of Object.keys(a)) if (!meHas(b, k) || b[k] === undefined) ops.push({ s: s, k: k, del: true, was: a[k] });
  }
  const own = new Set(['v', 'list', 'likes', 'history', 'reports']);
  for (const k of new Set(Object.keys(A).concat(Object.keys(B)))) {
    if (own.has(k)) continue;
    if (!meHas(B, k) || B[k] === undefined) ops.push({ s: '', k: k, del: true, was: A[k] });
    else if (!meHas(A, k) || !meSame(A[k], B[k])) ops.push({ s: '', k: k, set: B[k], was: A[k] });
  }
  return ops;
}

function meApply(stored, ops, ctx) {
  const out = meClean(meCopy(stored));
  const now = ctx && ctx.now != null ? ctx.now : Date.now();
  for (const op of ops) {
    const box = op.s ? out[op.s] : out;
    const cur = meHas(box, op.k) ? box[op.k] : undefined;
    const untouched = cur === undefined || meSame(cur, op.was);
    if (op.del) { if (untouched) delete box[op.k]; continue; }
    let val = op.set;
    if (!untouched) {
      if (op.s === 'history') {
        const live = cur && cur.tab && ctx && cur.tab !== ctx.tab && now - (cur.at || 0) < 15000 && cur.se === val.se && cur.e === val.e && !(ctx.playing && ctx.playing(op.k, val.se, val.e));
        if (live || (cur && (cur.at || 0) > (val.at || 0))) val = cur;
      } else if (op.s === 'reports') {
        if (cur && (cur.at || 0) > (val.at || 0)) val = cur;
      } else if (op.s === 'list') {
        if (typeof cur === 'number' && typeof val === 'number' && cur > val) val = cur;
      }
    }
    if (op.s === 'history' && val === op.set && ctx && ctx.tab) val = Object.assign({}, val, { tab: ctx.tab });
    box[op.k] = meCopy(val);
  }
  return out;
}

function meImportMerge(me, m) {
  if (!m || typeof m !== 'object' || m.v !== 1) throw new Error('not a VOIDtv export');
  const n = { list: 0, likes: 0, history: 0, reports: 0, skipped: 0 };
  const num = (x) => typeof x === 'number' && isFinite(x);
  const int = (x, hi) => num(x) && Math.floor(x) === x && x >= 0 && x <= hi;
  const str = (x, len) => (typeof x === 'string' ? x.slice(0, len) : '');
  const obj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
  const slugOk = (k) => /^[a-z0-9-]{1,120}$/.test(k);
  const repOk = (k) => /^[a-z0-9-]{1,120}\/\d{1,4}\/\d{1,5}$/.test(k);
  const newer = (a, b) => (a || 0) > (b || 0);
  for (const sec of ['list', 'likes', 'history', 'reports']) {
    const src = m[sec];
    if (!obj(src)) continue;
    if (!obj(me[sec])) me[sec] = {};
    for (const key of Object.keys(src)) {
      const val = src[key];
      if (sec === 'reports' ? !repOk(key) : !slugOk(key)) { n.skipped++; continue; }
      if (sec === 'list') {
        if (!num(val) || val <= 0) { n.skipped++; continue; }
        if (!meHas(me.list, key) || val > me.list[key]) { me.list[key] = val; n.list++; }
      } else if (sec === 'likes') {
        if (val !== 1 && val !== -1 && val !== 0) { n.skipped++; continue; }
        if (!meHas(me.likes, key)) { me.likes[key] = val; n.likes++; }
      } else if (sec === 'history') {
        if (!obj(val) || !int(val.se, 999) || !int(val.e, 99999) || !num(val.at) || val.at < 0) { n.skipped++; continue; }
        const rec = { se: val.se, e: val.e, at: val.at, pos: num(val.pos) && val.pos > 0 ? Math.floor(val.pos) : 0 };
        if (!meHas(me.history, key) || newer(rec.at, me.history[key] && me.history[key].at)) { me.history[key] = rec; n.history++; }
      } else {
        const parts = key.split('/');
        if (!obj(val) || !int(val.season, 9999) || !int(val.ep, 99999) || !num(val.at) || val.at < 0 || parts[0] + '/' + val.season + '/' + val.ep !== key) { n.skipped++; continue; }
        const rec = { show: str(val.show, 200), season: val.season, ep: val.ep, name: str(val.name, 200), item: str(val.item, 200), url: str(val.url, 500), at: val.at };
        if (!meHas(me.reports, key) || newer(rec.at, me.reports[key] && me.reports[key].at)) { me.reports[key] = rec; n.reports++; }
      }
    }
  }
  return n;
}

const meFns = [meCopy, meSame, meHas, meClean, meDiff, meApply, meImportMerge];
module.exports = { meCopy, meSame, meHas, meClean, meDiff, meApply, meImportMerge, meSource: meFns.map((f) => f.toString()).join('\n').replace(/\r\n/g, '\n') };
