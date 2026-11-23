// VoidTV cards: what moves on the big-screen table after a change, and how. Licence: GPL-2.0-or-later (play/LICENSE).
// Bryan, 23 Nov 2026: "we can better the animation and extend it to more areas of these card games". Before this, a card
// laid face up only grew in from its player's plate and nothing else moved.
// The table knows what happened only from the events of a change (the public ones, see cards/README.md), so the motion is
// made from those alone: a card that was dealt, drawn, played, laid down, given or taken flies from where it was to where
// it went. A card whose face the event does not carry flies face down, so no hidden card is ever shown.
// Two parts. plan() is pure and tested in Node (cards/test/motion.test.js). The page part finds each place on the page and
// moves the cards with CSS transitions: decision B9, CSS motion, nothing that flashes, and nothing moves at all on a
// device that asks for reduced motion.
(function (root) {
  'use strict';

  const STEP = 260;       // ms from one move of a change to the next, so each can be followed
  const FAN = 70;         // ms between the cards of one move (a set of three laid down fans out)
  const FLY = 420;        // ms a card is in the air
  const DEAL_MAX = 1700;  // ms for the whole deal, however many cards
  const DEAL_GAP = 70;    // ms between dealt cards when there are few
  const ALL_MAX = 4200;   // ms for everything one change shows; a longer story is played faster
  const MANY = 3;         // face-down cards shown for one move of many (a gift of three in Go Fish shows three)

  // ---------- the pure part ----------

  // A place a card flies from or to: the zone it names, the player whose zone it is ('hand:2' is player 2's), and the card
  // when its face is known. The page looks the place up in that order of use (see find below).
  function place(zone, card) {
    const m = /:(\d+)$/.exec(String(zone)), out = { zone: String(zone) };
    if (m) out.seat = Number(m[1]);
    if (card) out.card = card;
    return out;
  }

  // The flights for one change, from its events, in the order things happened: [{ face, from, to, at, flip }]. face is the
  // card when everyone may see it, else null (face down). at is when it leaves, in ms from now. flip: it was turned face up
  // off the pack. n is the number of players. A trick that has just been taken is left out: the table holds it a moment
  // and then sweeps it to its taker.
  function plan(events, n) {
    const list = Array.isArray(events) ? events.filter((e) => e && typeof e === 'object') : [], out = [];
    const taken = list.some((e) => e.ev === 'trick');
    let t = 0;
    for (const e of list) {
      if (e.ev === 'deal' && n > 0 && e.n > 0) {
        const total = e.n * n, gap = Math.min(DEAL_GAP, DEAL_MAX / total);
        for (let i = 0; i < total; i++) out.push({ face: null, from: place(e.from || 'draw'), to: { zone: String(e.to || 'hand') + ':' + (i % n), seat: i % n }, at: Math.round(t + i * gap), flip: false });
        t += total * gap + STEP;
        continue;
      }
      if (e.ev !== 'move' || typeof e.from !== 'string' || typeof e.to !== 'string') continue;
      if (taken && e.from === 'trick') continue;
      const cards = Array.isArray(e.cards) && e.cards.length ? e.cards : null;
      const k = cards ? cards.length : Math.min(MANY, Math.max(1, Number(e.n) || 1));
      const from0 = place(e.from), to0 = place(e.to);
      // A card that goes from a player's hand to a place of theirs nobody sees (Hearts' three to pass) does not move on the table.
      if (!cards && from0.seat !== undefined && from0.seat === to0.seat) continue;
      for (let i = 0; i < k; i++) {
        const c = cards ? cards[i] : null;
        out.push({ face: c, from: place(e.from, c), to: place(e.to, c), at: Math.round(t + i * FAN), flip: !!(c && e.from === 'draw') });
      }
      t += STEP + (k - 1) * FAN;
    }
    const end = out.reduce((a, f) => Math.max(a, f.at), 0);
    if (end > ALL_MAX) for (const f of out) f.at = Math.round((f.at * ALL_MAX) / end);
    return out;
  }

  const api = { plan, place, FLY };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VoidMotion = api;

  // ---------- the page part ----------

  if (typeof document === 'undefined') return;

  const still = () => { try { return root.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  const later = (ms, fn) => setTimeout(fn, Math.max(0, ms));
  const EASE = 'cubic-bezier(.2,.75,.25,1)';
  function box(el) { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; }
  function cardEl(app, id) {
    for (const e of app.querySelectorAll('[data-card]')) if (e.dataset.card === id) return e;
    return null;
  }

  // Where everything is on the page now: each face-up card by its id, each place in the middle by its zone (the pack is
  // 'draw'), each plate by its seat, and the stage. Taken just before the page is drawn again.
  function snap(app) {
    const s = { cards: {}, zones: {}, seats: {}, stage: null };
    for (const e of app.querySelectorAll('[data-card]')) s.cards[e.dataset.card] = box(e);
    for (const e of app.querySelectorAll('[data-zone]')) s.zones[e.dataset.zone] = box(e);
    for (const e of app.querySelectorAll('.plate[data-seat]')) s.seats[e.dataset.seat] = box(e);
    const st = app.querySelector('.stage');
    if (st) s.stage = box(st);
    return s;
  }

  // A card at a player's plate is the size of a card held in the hand, and it is "at the plate": it fades into it.
  function atPlate(b, unit) { return { x: b.x, y: b.y, w: 3.2 * unit, h: 4.48 * unit, plate: true }; }
  function middle(s, unit) { return s.stage ? { x: s.stage.x, y: s.stage.y, w: 4 * unit, h: 5.6 * unit } : null; }
  // Where a card leaves from: where it lay (if it was face up), else the place it was in, else its player's plate, else
  // the middle of the table.
  function whereFrom(p, a, b, unit) {
    if (p.card && a.cards[p.card]) return a.cards[p.card];
    if (a.zones[p.zone]) return a.zones[p.zone];
    if (p.seat !== undefined && b.seats[p.seat]) return atPlate(b.seats[p.seat], unit);
    if (b.zones[p.zone]) return b.zones[p.zone];
    return middle(b, unit);
  }
  // Where a card goes when it is not on the page face up: its player's plate, else the place it went to, else the middle.
  function whereTo(p, a, b, unit) {
    if (p.seat !== undefined && b.seats[p.seat]) return atPlate(b.seats[p.seat], unit);
    if (b.zones[p.zone]) return b.zones[p.zone];
    if (a.zones[p.zone]) return a.zones[p.zone];
    return middle(b, unit);
  }

  // Fly the card element that now lies at its new place from where it came from. It is hidden until it leaves.
  function flyReal(el, src, dst, f) {
    const k = src.w / Math.max(1, dst.w), dx = src.x - dst.x, dy = src.y - dst.y;
    el.style.opacity = '0';
    later(f.at, () => {
      el.style.transition = 'none';
      el.style.transform = 'translate(' + dx + 'px,' + dy + 'px) ' + (f.flip ? 'scale(.04,' + k + ')' : 'scale(' + k + ')') + (src.plate ? ' rotate(-8deg)' : '');
      el.style.opacity = '1';
      void el.offsetWidth;
      el.style.transition = 'transform ' + FLY + 'ms ' + EASE;
      el.style.transform = '';
      later(FLY + 40, () => { el.style.transition = ''; });
    });
  }
  // A card in the air that lies nowhere on the page after: face down, or a face-up card going into a hand or a pile.
  let sky = null;
  function ghost(face, src, dst, at, ms) {
    if (!sky || !sky.isConnected) { sky = document.createElement('div'); sky.className = 'flights'; sky.setAttribute('aria-hidden', 'true'); document.body.append(sky); }
    const F = root.VoidFace, w = dst.w, h = dst.h, g = document.createElement('div');
    g.className = 'flight';
    g.style.left = (dst.x - w / 2) + 'px'; g.style.top = (dst.y - h / 2) + 'px'; g.style.fontSize = (w / 5) + 'px';
    g.style.opacity = '0';
    g.append(face ? F.card(face) : F.back());
    sky.append(g);
    later(at, () => {
      g.style.transform = 'translate(' + (src.x - dst.x) + 'px,' + (src.y - dst.y) + 'px) scale(' + (src.w / Math.max(1, w)) + ')' + (src.plate ? ' rotate(-8deg)' : '');
      g.style.opacity = '1';
      void g.offsetWidth;
      g.style.transition = 'transform ' + ms + 'ms ' + EASE + ', opacity 150ms linear ' + (ms - 150) + 'ms';
      g.style.transform = dst.plate ? 'rotate(6deg)' : '';
      g.style.opacity = '0';
      later(ms + 60, () => g.remove());
    });
  }
  // A card that stayed on the table but moved (a set laid before it, smaller cards for a full table) slides to its new spot.
  function slide(el, a, b) {
    el.style.transition = 'none';
    el.style.transform = 'translate(' + (a.x - b.x) + 'px,' + (a.y - b.y) + 'px) scale(' + (a.w / Math.max(1, b.w)) + ')';
    void el.offsetWidth;
    el.style.transition = 'transform 320ms ' + EASE;
    el.style.transform = '';
    later(360, () => { el.style.transition = ''; });
  }

  // Play a change: before is snap() from just before the page was drawn again, flights is plan() of the change's events.
  function run(flights, before, app) {
    if (still() || !before) return;
    const now = snap(app), unit = now.stage ? now.stage.w / 100 : 12, moved = new Set();
    for (const f of flights) {
      const el = f.face ? cardEl(app, f.face) : null;
      const src = whereFrom(f.from, before, now, unit);
      if (!src) continue;
      if (el) { moved.add(f.face); flyReal(el, src, box(el), f); continue; }
      const dst = whereTo(f.to, before, now, unit);
      if (dst) ghost(f.face, src, dst, f.at, FLY);
    }
    for (const id of Object.keys(now.cards)) {
      const a = before.cards[id], b = now.cards[id];
      if (moved.has(id) || !a) continue;
      if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) > 3 || Math.abs(a.w - b.w) > 2) { const el = cardEl(app, id); if (el) slide(el, a, b); }
    }
  }

  // The trick that was held on the table goes to the player who took it, one card after another.
  function sweep(app, seat) {
    if (still()) return;
    const plate = app.querySelector('.plate[data-seat="' + seat + '"]'), st = app.querySelector('.stage');
    if (!plate || !st) return;
    const unit = box(st).w / 100, to = atPlate(box(plate), unit);
    app.querySelectorAll('.cardbox.trick .vc').forEach((c, i) => ghost(c.dataset.card, box(c), to, i * 60, 520));
  }

  Object.assign(api, { snap, run, sweep, still });
})(typeof self !== 'undefined' ? self : this);
