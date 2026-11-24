// VoidTV PLAY: where each part of a controller sits, from one file. Licence: GPL-2.0-or-later (play/LICENSE).
// Bryan, 21 Nov 2026: "i want a mock up of the controllers created for me with all parts moveaple ie dpad , button areas
// etc so that i can finetune this layout onece and for all since it is now more janky."
// play/layouts.json holds what he sets in the editor (play/tools/layout.html): for each pad (phone: the phone pad page;
// screen: PLAY's own on-screen touch pad), for each way of holding the phone (side, up), each part's place and size.
// The real pads place their parts from that same file, so what he sets is what players get. A pad or a part with no
// entry keeps its built-in place.
//
// One tuning has to fit every phone, so a part is not stored in pixels. It is stored as: which edges it keeps to
// (ax: l, c or r; ay: t, m or b), its gap from those edges (x, y), and its size (w, h), all in units of the screen's
// short side. A d-pad set 4 units in a hundred from the left and bottom edges sits there on a small phone and a big
// one. A phone squarer than any the layout was checked on (fit, the narrowest long side over short side with nothing
// touching) gets everything a little smaller, so parts never run into each other.
(function (root) {
  'use strict';
  // phone: the phone pad page. screen-...: PLAY's own on-screen pad, one layout for each shape of button area (a
  // machine with two buttons, four in a diamond, three in a line, one), since a place tuned for one breaks another.
  const PADS = ['phone', 'screen-diamond', 'screen-abc', 'screen-pair', 'screen-one'], WAYS = ['side', 'up'];
  const round = (v) => Math.round(v * 10000) / 10000;
  const THUMB = 44;   // no button is drawn less tall than this, in pixels
  const OVER = 0.08;  // how far past an edge a round part's box may go, as a share of its size
  const ROUND = { dpad: true, face: true };

  // Pure (tested): a part's box in pixels inside a W by H area, as an entry.
  function toEntry(box, W, H) {
    const u = Math.min(W, H), cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    // It keeps to whichever is nearest: an edge (by the gap to it) or the middle (by how far its own middle is from it).
    // A big d-pad low on the left keeps to the left and the bottom though its middle is near the screen's.
    const pick = (lo, hi, mid, a, b, c) => (Math.abs(mid) < Math.min(lo, hi) ? b : lo <= hi ? a : c);
    const ax = pick(box.x, W - box.x - box.w, cx - W / 2, 'l', 'c', 'r'), ay = pick(box.y, H - box.y - box.h, cy - H / 2, 't', 'm', 'b');
    const x = ax === 'l' ? box.x : ax === 'r' ? W - box.x - box.w : cx - W / 2;
    const y = ay === 't' ? box.y : ay === 'b' ? H - box.y - box.h : cy - H / 2;
    return { ax, ay, x: round(x / u), y: round(y / u), w: round(box.w / u), h: round(box.h / u) };
  }
  // Pure (tested): an entry as a box in pixels inside a W by H area. k: how much smaller everything is drawn (shrink()).
  function toBox(e, W, H, k) {
    const u = Math.min(W, H) * (k || 1), w = e.w * u, h = e.h * u;
    const x = e.ax === 'l' ? e.x * u : e.ax === 'r' ? W - e.x * u - w : W / 2 + e.x * u - w / 2;
    const y = e.ay === 't' ? e.y * u : e.ay === 'b' ? H - e.y * u - h : H / 2 + e.y * u - h / 2;
    return { x, y, w, h };
  }
  // Pure (tested): on a screen squarer than the layout was checked on, everything is drawn this much smaller.
  function shrink(set, W, H) {
    const shape = Math.max(W, H) / Math.min(W, H);
    return set && set.fit > 1 && shape < set.fit ? shape / set.fit : 1;
  }
  // Pure (tested): every part of a set as boxes, for an area.
  function boxes(set, W, H) {
    const k = shrink(set, W, H), out = {};
    for (const [id, e] of Object.entries((set && set.parts) || {})) {
      const b = toBox(e, W, H, k);
      // On a small phone a pill set by its share of the screen would come out thinner than a thumb can find: it keeps
      // THUMB pixels of height, around its own middle.
      if (!ROUND[id] && id !== 'info' && b.h < THUMB) { b.y -= (THUMB - b.h) / 2; b.h = THUMB; }
      out[id] = b;
    }
    return out;
  }
  // Pure (tested): do two parts run into each other? Round parts (the d-pad, the button area) are judged as circles,
  // so a pill may sit in the empty corner beside one.
  function touch(a, b, idA, idB, slack) {
    const s = slack === undefined ? 3 : slack;   // edges that meet, or cross by a hair, are not in each other's way
    if (ROUND[idA] && ROUND[idB]) return Math.hypot(a.x + a.w / 2 - b.x - b.w / 2, a.y + a.h / 2 - b.y - b.h / 2) < a.w / 2 + b.w / 2 - s;
    const [c, r] = ROUND[idA] ? [a, b] : ROUND[idB] ? [b, a] : [null, null];
    if (c) {   // a circle against a box: the nearest point of the box to the circle's middle
      const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
      return Math.hypot(cx - Math.max(r.x, Math.min(cx, r.x + r.w)), cy - Math.max(r.y, Math.min(cy, r.y + r.h))) < c.w / 2 - s;
    }
    return a.x < b.x + b.w - s && b.x < a.x + a.w - s && a.y < b.y + b.h - s && b.y < a.y + a.h - s;
  }
  // Pure (tested): what is wrong with a set of boxes in an area: parts over each other, parts off the screen.
  // only: the parts that are on the pad just now (a Nintendo game has no L or R to be in anyone's way).
  function problems(bx, W, H, only) {
    const ids = Object.keys(bx).filter((id) => !only || only.includes(id)), out = [];
    // A round part's drawing sits inside its box, so its box may pass an edge by a little (the on-screen d-pad's does by design).
    for (const id of ids) { const b = bx[id], t = ROUND[id] ? b.w * OVER + 1 : 1; if (b.x < -t || b.y < -t || b.x + b.w > W + t || b.y + b.h > H + t) out.push({ kind: 'off', a: id }); }
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) if (touch(bx[ids[i]], bx[ids[j]], ids[i], ids[j])) out.push({ kind: 'over', a: ids[i], b: ids[j] });
    return out;
  }
  // Pure (tested): the squarest screen (long side over short side) these parts fit with nothing touching and nothing
  // off the screen, from the shape they were set on down to a square. The editor stores it as fit: the phone the
  // layout was set on, and every wider one, gets it exactly as set; a squarer one gets it a little smaller.
  function fitOf(parts, shape, tall, only) {
    const at = (s) => { const W = tall ? 1000 : 1000 * s, H = tall ? 1000 * s : 1000; return problems(boxes({ parts }, W, H), W, H, only).length; };
    if (at(shape)) return round(shape);   // something is wrong where it was set: that screen and wider get it as set, squarer ones smaller
    let good = shape;
    for (let s = shape; s >= 1; s -= 0.01) { if (at(s)) break; good = s; }
    return round(good);
  }

  // Pure (tested): only what a layouts file may hold gets through (it is served to every visitor's pad).
  const num = (v, lo, hi) => typeof v === 'number' && isFinite(v) && v >= lo && v <= hi;
  function clean(file) {
    const out = { v: 1 };
    if (!file || typeof file !== 'object') return out;
    for (const pad of PADS) for (const way of WAYS) {
      const set = file[pad] && file[pad][way];
      if (!set || typeof set !== 'object' || !set.parts || typeof set.parts !== 'object') continue;
      const parts = {};
      for (const [id, e] of Object.entries(set.parts)) {
        if (!/^[a-z][a-z0-9]{0,15}$/.test(id) || !e || typeof e !== 'object') continue;
        if (!['l', 'c', 'r'].includes(e.ax) || !['t', 'm', 'b'].includes(e.ay)) continue;
        if (!num(e.x, -3, 3) || !num(e.y, -3, 3) || !num(e.w, 0.02, 3) || !num(e.h, 0.02, 3)) continue;
        parts[id] = { ax: e.ax, ay: e.ay, x: round(e.x), y: round(e.y), w: round(e.w), h: round(e.h) };
      }
      if (!Object.keys(parts).length) continue;
      out[pad] = out[pad] || {};
      out[pad][way] = { parts, fit: num(set.fit, 1, 4) ? round(set.fit) : 1 };
    }
    return out;
  }

  // On a page: put each part that has an entry where the entry says, inside the area (its left, top, width and height
  // in pixels: the screen without the phone's notch and rounded corners). A part with no entry is left to the page's own
  // style. els: { id: element }.
  function apply(area, els, set) {
    const bx = boxes(set, area.w, area.h);
    for (const [id, el] of Object.entries(els)) {
      if (!el) continue;
      const b = bx[id];
      if (b) put(el, { x: area.x + b.x, y: area.y + b.y, w: b.w, h: b.h }); else clear(el);
    }
  }
  // One element put at a box given in the window's own pixels, whatever box the page measures it from (a part may sit
  // inside a row or a layer of its own). size false: only moved, its size left to the page.
  function put(el, r, size) {
    el.classList.add('placed');
    const from = el.offsetParent, o = from ? from.getBoundingClientRect() : { left: 0, top: 0 };
    el.style.left = Math.round(r.x - o.left - (from ? from.clientLeft : 0)) + 'px'; el.style.top = Math.round(r.y - o.top - (from ? from.clientTop : 0)) + 'px';
    if (size === false) return;
    el.style.width = Math.round(r.w) + 'px'; el.style.height = Math.round(r.h) + 'px';
    el.style.setProperty('--pw', Math.round(r.w) + 'px'); el.style.setProperty('--ph', Math.round(r.h) + 'px');
  }
  function clear(el) {
    if (!el.classList.contains('placed')) return;
    el.classList.remove('placed');
    for (const p of ['left', 'top', 'width', 'height', '--pw', '--ph']) el.style.removeProperty(p);
  }
  // A layout kept on this phone alone, set in the pad's own mover (pad.html?move=1; Bryan, 24 Nov 2026: "recreate the
  // layout mover I can operate on this iPhone so I can choose the correct spacing"). A phone cannot write the site's
  // file, so what he sets there is kept in that phone's browser and laid over the file, pad by pad and way by way: it
  // is under his thumbs at once. Every other phone keeps the file's layout until his is put in the file and pushed.
  const OWN = 'voidtv-pad-layout';
  // Pure (tested): the file with a phone's own layouts laid over it. Both go through clean().
  function merge(file, own) {
    const out = clean(file), mine = clean(own);
    for (const pad of PADS) for (const way of WAYS) if (mine[pad] && mine[pad][way]) { out[pad] = out[pad] || {}; out[pad][way] = mine[pad][way]; }
    return out;
  }
  // What this phone keeps (nothing: { v: 1 }). A browser that refuses storage keeps nothing.
  function mine() { try { return clean(JSON.parse(localStorage.getItem(OWN) || 'null')); } catch (e) { return clean(null); } }
  // Keep this as the phone's own (with no pad in it: forget it). Answers whether the phone took it.
  function keep(own) {
    const c = clean(own);
    try { if (PADS.some((p) => c[p])) localStorage.setItem(OWN, JSON.stringify(c)); else localStorage.removeItem(OWN); return true; } catch (e) { return false; }
  }
  // The file itself, read once (v: the build, so a push reaches a phone at once and not after its cache). site: the
  // file alone, as every player has it. load: what this phone's pads place themselves from.
  let got = null;
  function site(url) {
    if (!got) got = fetch(url, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : {})).then(clean).catch(() => clean(null));
    return got;
  }
  const load = (url) => site(url).then((f) => merge(f, mine()));

  const api = { PADS, WAYS, THUMB, OVER, OWN, toEntry, toBox, shrink, boxes, touch, problems, fitOf, clean, merge, mine, keep, apply, put, clear, site, load };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlayPadLayout = api;
})(typeof self !== 'undefined' ? self : this);
