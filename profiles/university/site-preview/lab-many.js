// Void University lab bench: many selves (19 Nov 2026). The boundary bench one scale up. Seven small selves sit
// together, each running the same loop as lab-boundary.js with no new rules: its own paid-for reach, its own
// predictions, its own gate, its own energy. Bryan's framework (The Framework, Current State, July 2026): "A mind is a
// boundary that funds its own superposition"; "where the funding stops, mind stops"; Levin's cognitive light cone is
// "the radius dial". Michael Levin's finding this follows: cells joined by gap junctions pass signals and small
// molecules to each other, and so act as one larger self.
//
// The one thing the knob changes is whether neighbours are joined:
//   ALONE   a self knows a thing is coming only once it is inside its own reach, and keeps only what it eats itself.
//   JOINED  what one senses, all know at once (so the one about to be hit starts turning sooner), and energy flows
//           between neighbours from the fuller to the emptier.
// Nothing else is given to the joined group. The middle self is walled in by the other six and can never feed itself.
// A self whose energy reaches nothing stops: no reach, no gate. Joined neighbours can fund it back; alone it stays stopped.
// Knobs: join = 'alone' | 'joined', give = 'plenty' | 'little'. Fixed steps, seeded; movement from Planck.js (MIT).
// Units: each body has radius 0.75; the view is 16 wide, y pointing up.
(function (root) {
  const D = { STEP: 1 / 60, B: 0.75, GAPD: 1.6, R0: 3, RMIN: 0.95, RMAX: 5, SECS: 60, FAR: 11, SPEED: 3, GATE: 0.6, TURN: 2.4,
    E0: 45, BASE: 1, EDGE: 0.05, FOOD: 6, HARM: 6, GAP: 3, SENSE: 0.2, MOVE: 0.3, FLOW: 0.5, PLENTY: 14, LITTLE: 40, SWERVE: 0.25 };
  const N = 7;

  function rng(seed) { let a = (seed >>> 0) + 0x9e3779b9; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const dAng = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

  function make(pl, knobs, seed, over) {
    const C = Object.assign({}, D, over || {}), V = pl.Vec2, R = rng(seed), world = new pl.World({ gravity: V(0, 0) });
    const joined = knobs.join === 'joined', every = knobs.give === 'little' ? C.LITTLE : C.PLENTY;
    const cells = [];
    for (let i = 0; i < N; i++) {
      const a = (i - 1) * Math.PI / 3, x = i ? C.GAPD * Math.cos(a) : 0, y = i ? C.GAPD * Math.sin(a) : 0;
      const body = world.createBody({ position: V(x, y) }); body.createFixture(pl.Circle(C.B), { restitution: 0.9, friction: 0 });
      const c = { i, x, y, body, reach: C.R0, energy: C.E0, gate: i ? a : Math.PI / 2, on: true, ate: 0 }; body.setUserData(c); cells.push(c);
    }
    const links = []; for (let i = 1; i < N; i++) { links.push([0, i]); links.push([i, i % 6 + 1]); }
    const s = { C, cells, links, joined, things: [], steps: 0, done: false, speed: 3, bars: [], flashes: [], pulses: [],
      food: 0, caught: 0, hits: 0, gaps: 0, say: 'Watch which of them stay funded.' };
    const touched = [];
    // The first body a thing will touch, and where on it; null if it will pass them all by.
    function firstHit(p, v) {
      let best = null; const a = v.x * v.x + v.y * v.y; if (!a) return null;
      for (const c of cells) {
        const px = p.x - c.x, py = p.y - c.y, b = 2 * (px * v.x + py * v.y), q = px * px + py * py - C.B * C.B, d = b * b - 4 * a * q;
        if (d < 0) continue; const t = (-b - Math.sqrt(d)) / (2 * a); if (t < 0) continue;
        if (!best || t < best.t) best = { t, j: c.i, ang: Math.atan2(py + v.y * t, px + v.x * t) };
      }
      return best;
    }
    function aim(b, off) { const p = b.getPosition(), d = Math.hypot(p.x, p.y), tx = p.y / d * off - p.x, ty = -p.x / d * off - p.y, L = Math.hypot(tx, ty); b.setLinearVelocity(V(tx / L * C.SPEED, ty / L * C.SPEED)); }
    function spawn() {
      const ang = R() * 6.2832, b = world.createBody({ type: 'dynamic', position: V(C.FAR * Math.cos(ang), C.FAR * Math.sin(ang)), bullet: true });
      b.createFixture(pl.Circle(0.2), { density: 1, restitution: 0.9, friction: 0, filterGroupIndex: -1 });
      const u = { kind: R() < 0.7 ? 'food' : 'harm', seen: new Array(N).fill(false), any: false, pred: null, done: false, swerveAt: 0, off2: 0 };
      const span = C.GAPD + C.B, off = (R() - 0.5) * 2 * span, sw = R() < C.SWERVE, at = 3 + R() * 3.5, side = (R() - 0.5) * 2 * span;
      if (sw) { u.swerveAt = at; u.off2 = side; }
      b.setUserData(u); aim(b, off); s.things.push(b);
    }
    function drop(b) { const i = s.things.indexOf(b); if (i >= 0) s.things.splice(i, 1); world.destroyBody(b); }
    world.on('begin-contact', (ct) => {
      const A = ct.getFixtureA().getBody(), Z = ct.getFixtureB().getBody(), ca = A.getUserData(), cz = Z.getUserData();
      const cell = ca && ca.body ? ca : cz && cz.body ? cz : null, b = cell === ca ? Z : A;
      if (cell && b.getUserData() && !b.getUserData().done) touched.push([b, cell]);
    });

    s.step = function () {
      if (s.done) return;
      if (s.steps % every === 5) spawn();
      const next = new Array(N).fill(null), nextD = new Array(N).fill(1e9);
      for (let k = s.things.length - 1; k >= 0; k--) {
        const b = s.things[k], u = b.getUserData(), p = b.getPosition(), d = Math.hypot(p.x, p.y);
        if (d > C.FAR + 2) { drop(b); continue; }
        if (u.done) continue;
        if (u.swerveAt && d < u.swerveAt) { u.swerveAt = 0; aim(b, u.off2); }
        for (const c of cells) if (c.on && !u.seen[c.i] && Math.hypot(p.x - c.x, p.y - c.y) < c.reach) {
          u.seen[c.i] = true; c.energy -= C.SENSE;
          if (joined && !u.any) s.pulses.push({ from: c.i, t: 24 }); // the news goes round
          u.any = true;
        }
        const h = firstHit(p, b.getLinearVelocity());
        const knows = (j) => cells[j].on && (u.seen[j] || (joined && u.any));
        if (u.pred && (!h || h.j !== u.pred.j || Math.abs(dAng(h.ang, u.pred.ang)) > 0.2)) { // prediction and world collide
          const c = cells[u.pred.j]; s.gaps++; c.energy -= C.GAP; s.flashes.push({ x: p.x, y: p.y, t: 36, kind: 'gap' }); u.pred = null;
        }
        if (!u.pred && h && knows(h.j)) u.pred = { j: h.j, ang: h.ang };
        if (u.pred) { const c = cells[u.pred.j], dd = Math.hypot(p.x - c.x, p.y - c.y); if (dd < nextD[c.i]) { nextD[c.i] = dd; next[c.i] = u.pred; } }
      }
      for (const c of cells) if (c.on && next[c.i]) { const want = dAng(next[c.i].ang, c.gate), turn = Math.max(-C.TURN * C.STEP, Math.min(C.TURN * C.STEP, want)); c.gate += turn; c.energy -= C.MOVE * Math.abs(turn); }
      world.step(C.STEP, 6, 2);
      while (touched.length) {
        const [b, c] = touched.pop(), u = b.getUserData(); if (u.done) continue; u.done = true;
        const p = b.getPosition(), met = c.on && Math.abs(dAng(Math.atan2(p.y - c.y, p.x - c.x), c.gate)) < C.GATE;
        if (u.kind === 'food') { s.food++; if (met) { s.caught++; c.ate++; c.energy += C.FOOD; s.flashes.push({ x: p.x, y: p.y, t: 30, kind: 'eat' }); drop(b); } }
        else if (!met) { s.hits++; c.energy -= C.HARM; s.flashes.push({ x: p.x, y: p.y, t: 30, kind: 'hit' }); drop(b); }
      }
      if (joined) for (const [i, j] of links) { const f = C.FLOW * (cells[i].energy - cells[j].energy) * C.STEP; cells[i].energy -= f; cells[j].energy += f; } // fuller to emptier
      let sum = 0, on = 0;
      for (const c of cells) {
        if (c.on) c.energy -= (C.BASE + C.EDGE * c.reach * c.reach) * C.STEP; // staying alive and holding an edge are paid for, every moment
        c.energy = Math.max(0, Math.min(100, c.energy)); c.on = c.energy > 0.05; // where the funding stops, it stops
        const want = c.on ? C.RMIN + (C.RMAX - C.RMIN) * c.energy / 100 : C.B;
        c.reach += Math.max(-0.5 * C.STEP, Math.min(0.35 * C.STEP, want - c.reach));
        if (c.on) { on++; sum += c.reach; }
      }
      for (const a of [s.flashes, s.pulses]) for (let i = a.length - 1; i >= 0; i--) if (--a[i].t <= 0) a.splice(i, 1);
      s.steps++; s.on = on; s.mean = sum / N;
      if (s.steps % 150 === 0) s.bars.push(on);
      if (s.steps >= C.SECS * 60) s.done = true;
    };
    return s;
  }

  const WORD = ['None', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'All seven'];
  function result(s) {
    const on = s.cells.filter((c) => c.on).length, mid = s.cells[0].on;
    return { bars: s.bars.slice(), barTop: N, mid: null, on, midOn: mid, reach: +(s.mean || 0).toFixed(2), food: s.food, caught: s.caught, hits: s.hits, gaps: s.gaps,
      tag: on + ' of 7 funded',
      say: (on === N ? 'All seven are still funded.' : on === 0 ? 'None of the seven is still funded.' : WORD[on] + ' of the seven ' + (on === 1 ? 'is' : 'are') + ' still funded' + (mid ? ', the middle one among them.' : ', and the middle one is not.')) + ' Together they ate ' + s.caught + ' of ' + s.food + ' and took ' + s.hits + (s.hits === 1 ? ' hit.' : ' hits.') };
  }
  function run(pl, knobs, seed, over) { const s = make(pl, knobs, seed, over); while (!s.done) s.step(); return result(s); }

  function draw(ctx, W, H, s) {
    const C = s ? s.C : D, sc = Math.min(W, H) / 16; // things arrive from beyond the edge of the view
    ctx.clearRect(0, 0, W, H);
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(sc, -sc); ctx.lineCap = 'round';
    const cells = s ? s.cells : Array.from({ length: N }, (_, i) => { const a = (i - 1) * Math.PI / 3; return { i, x: i ? D.GAPD * Math.cos(a) : 0, y: i ? D.GAPD * Math.sin(a) : 0, reach: D.R0, energy: D.E0, gate: i ? a : Math.PI / 2, on: true }; });
    for (const c of cells) if (c.on) { ctx.fillStyle = 'rgba(212,176,106,.045)'; ctx.beginPath(); ctx.arc(c.x, c.y, c.reach, 0, 6.2832); ctx.fill(); }
    ctx.lineWidth = 0.045; ctx.setLineDash([0.22, 0.22]);
    for (const c of cells) if (c.on) { ctx.strokeStyle = 'rgba(212,176,106,.4)'; ctx.beginPath(); ctx.arc(c.x, c.y, c.reach, 0, 6.2832); ctx.stroke(); }
    ctx.setLineDash([]);
    if (s) for (const b of s.things) {
      const u = b.getUserData(), p = b.getPosition();
      if (u.pred && !u.done) { const c = cells[u.pred.j]; ctx.strokeStyle = 'rgba(239,233,220,.4)'; ctx.lineWidth = 0.04; ctx.setLineDash([0.16, 0.16]); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(c.x + C.B * Math.cos(u.pred.ang), c.y + C.B * Math.sin(u.pred.ang)); ctx.stroke(); ctx.setLineDash([]); }
      const dim = u.any || u.done ? 1 : 0.4;
      if (u.kind === 'food') { ctx.fillStyle = 'rgba(212,176,106,' + dim + ')'; ctx.beginPath(); ctx.arc(p.x, p.y, 0.2, 0, 6.2832); ctx.fill(); }
      else { ctx.fillStyle = 'rgba(224,138,143,' + dim + ')'; ctx.beginPath(); ctx.moveTo(p.x, p.y + 0.28); ctx.lineTo(p.x + 0.22, p.y); ctx.lineTo(p.x, p.y - 0.28); ctx.lineTo(p.x - 0.22, p.y); ctx.closePath(); ctx.fill(); }
    }
    if (s && s.joined) { // the joins between neighbours; they light when news goes round
      const lit = s.pulses.length ? Math.max.apply(null, s.pulses.map((q) => q.t)) / 24 : 0;
      ctx.strokeStyle = 'rgba(239,233,220,' + (0.25 + 0.6 * lit) + ')'; ctx.lineWidth = 0.09;
      for (const [i, j] of s.links) { ctx.beginPath(); ctx.moveTo(cells[i].x, cells[i].y); ctx.lineTo(cells[j].x, cells[j].y); ctx.stroke(); }
    }
    for (const c of cells) {
      ctx.fillStyle = c.on ? '#17223a' : '#0d1220'; ctx.beginPath(); ctx.arc(c.x, c.y, C.B, 0, 6.2832); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.arc(c.x, c.y, C.B, 0, 6.2832); ctx.clip(); ctx.fillStyle = 'rgba(212,176,106,.55)'; ctx.fillRect(c.x - C.B, c.y - C.B, 2 * C.B, 2 * C.B * c.energy / 100); ctx.restore();
      ctx.strokeStyle = c.on ? '#d4b06a' : '#3a4256'; ctx.lineWidth = 0.06; ctx.beginPath(); ctx.arc(c.x, c.y, C.B, 0, 6.2832); ctx.stroke();
      if (c.on) { ctx.strokeStyle = '#efe9dc'; ctx.lineWidth = 0.2; ctx.beginPath(); ctx.arc(c.x, c.y, C.B + 0.08, c.gate - C.GATE, c.gate + C.GATE); ctx.stroke(); }
    }
    if (s) for (const f of s.flashes) {
      const k = f.t / 36, col = f.kind === 'gap' ? '255,255,255' : f.kind === 'eat' ? '212,176,106' : '224,138,143';
      ctx.strokeStyle = 'rgba(' + col + ',' + k + ')'; ctx.lineWidth = 0.08; ctx.beginPath(); ctx.arc(f.x, f.y, 0.3 + (1 - k) * (f.kind === 'gap' ? 1.2 : 0.7), 0, 6.2832); ctx.stroke();
    }
    ctx.restore();
  }

  // Guess first: how many of the seven will still be funded at the end?
  const OPTS = [{ v: 7, label: 'All seven' }, { v: 5, label: '4 to 6' }, { v: 2, label: '1 to 3' }, { v: 0, label: 'None' }];
  const band = (n) => (n === 7 ? 7 : n >= 4 ? 5 : n >= 1 ? 2 : 0);
  const guess = {
    options() { return OPTS; },
    gap(g, r) { const o = OPTS.find((x) => x.v === g); return band(r.on) === g ? 'That is what you guessed.' : 'You guessed ' + (o ? o.label.toLowerCase() : g) + '.'; },
    bar() { return null; },
  };

  const bench = { make, result, run, draw, guess, N, D };
  if (typeof module !== 'undefined' && module.exports) module.exports = bench;
  if (root && root.VULab) root.VULab.bench('many', bench);
})(typeof window !== 'undefined' ? window : null);
