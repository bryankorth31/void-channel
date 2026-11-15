// Void University lab bench: the boundary (15 Nov 2026). A model of Bryan's boundary, predict, act, aware loop, as he
// states it in the Mind Atlas: "A self starts as an edge between inside and outside, and keeping that edge costs
// energy"; "the boundaries increasing or shrinking or maintaining ... based on energy allowances"; "the gap between
// prediction and reality is what gets noticed, felt, learned". The reach drawn around the self is in the spirit of
// Michael Levin's cognitive light cone: how far out a self can sense and care.
//
// The rules, kept simple and run in fixed steps with a seeded start (movement and bouncing from Planck.js, MIT):
//   BOUNDARY  the self senses a thing only once it is inside its reach; holding a wider reach costs more energy.
//   PREDICT   on sensing a thing, it predicts where the thing will touch its body (the dashed line).
//   ACT       it turns its one gate toward that spot: food met at the gate is eaten, harm met at the gate bounces off;
//             food that lands elsewhere is lost and harm that lands elsewhere costs energy. Turning costs a little.
//   AWARE     if a sensed thing swerves, prediction and world collide: that gap flashes, costs energy, and the
//             prediction is made again. A thing that swerved before it was sensed costs nothing: it was never predicted.
//   ENERGY    the reach follows the energy it holds: more energy, a wider edge; less, and it pulls in toward the body.
// Knobs: give = 'plenty' | 'little' (how often things come), world = 'steady' | 'surprise' (how often they swerve).
// Units: the body has radius 1.2 at the centre of a view 22 wide, y pointing up.
(function (root) {
  const STEP = 1 / 60, B = 1.2, R0 = 4.8, RMIN = 1.4, RMAX = 9, SECS = 60, FAR = 11, SPEED = 3, GATE = 0.55, TURN = 2.2;
  const E0 = 45, EDGE = 0.048, FOOD = 6, HARM = 6, GAP = 3, SENSE = 0.3, MOVE = 0.4;

  function rng(seed) { let a = (seed >>> 0) + 0x9e3779b9; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const dAng = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
  // Where a thing at p moving along v will touch the body; null if it will pass by.
  function hitAngle(px, py, vx, vy) {
    const a = vx * vx + vy * vy, b = 2 * (px * vx + py * vy), c = px * px + py * py - B * B, d = b * b - 4 * a * c;
    if (d < 0 || !a) return null; const t = (-b - Math.sqrt(d)) / (2 * a); return t < 0 ? null : Math.atan2(py + vy * t, px + vx * t);
  }

  function make(pl, knobs, seed) {
    const V = pl.Vec2, R = rng(seed), world = new pl.World({ gravity: V(0, 0) });
    const self = world.createBody(); self.createFixture(pl.Circle(B), { restitution: 0.9, friction: 0 });
    const every = knobs.give === 'little' ? 280 : 70, pSwerve = knobs.world === 'surprise' ? 0.8 : 0.05;
    const s = { things: [], reach: R0, energy: E0, gate: Math.PI / 2, steps: 0, done: false, speed: 3, bars: [], flashes: [],
      food: 0, caught: 0, harm: 0, hits: 0, gaps: 0, say: 'Watch what its edge does.' };
    const touched = [];
    // Send a thing toward the body, a little to one side of dead centre.
    function aim(b, off) { const p = b.getPosition(), d = Math.hypot(p.x, p.y), tx = p.y / d * off - p.x, ty = -p.x / d * off - p.y, L = Math.hypot(tx, ty); b.setLinearVelocity(V(tx / L * SPEED, ty / L * SPEED)); }
    function spawn() {
      const ang = R() * 6.2832, b = world.createBody({ type: 'dynamic', position: V(FAR * Math.cos(ang), FAR * Math.sin(ang)), bullet: true });
      b.createFixture(pl.Circle(0.28), { density: 1, restitution: 0.9, friction: 0, filterGroupIndex: -1 });
      const u = { kind: R() < 0.7 ? 'food' : 'harm', sensed: false, pred: null, done: false, swerveAt: 0, off2: 0 };
      const off = (R() - 0.5) * 1.3 * B, sw = R() < pSwerve, at = 1.8 + R() * 4.5, side = (R() < 0.5 ? -1 : 1) * (0.45 + R() * 0.45) * B;
      if (sw) { u.swerveAt = at; u.off2 = side; }
      b.setUserData(u); aim(b, off); s.things.push(b);
    }
    function drop(b) { const i = s.things.indexOf(b); if (i >= 0) s.things.splice(i, 1); world.destroyBody(b); }
    world.on('begin-contact', (c) => {
      const A = c.getFixtureA().getBody(), Z = c.getFixtureB().getBody(), b = A === self ? Z : Z === self ? A : null;
      if (b && !b.getUserData().done) touched.push(b);
    });

    s.step = function () {
      if (s.done) return;
      if (s.steps % every === 10) spawn();
      let next = null, nextD = 1e9;
      for (let i = s.things.length - 1; i >= 0; i--) {
        const b = s.things[i], u = b.getUserData(), p = b.getPosition(), v = b.getLinearVelocity(), d = Math.hypot(p.x, p.y);
        if (d > FAR + 2) { drop(b); continue; }
        if (u.done) continue;
        if (u.swerveAt && d < u.swerveAt) { u.swerveAt = 0; aim(b, u.off2); }
        const h = hitAngle(p.x, p.y, b.getLinearVelocity().x, b.getLinearVelocity().y);
        if (!u.sensed && d < s.reach) { u.sensed = true; u.pred = h; s.energy -= SENSE; }
        else if (u.sensed && h != null && (u.pred == null || Math.abs(dAng(h, u.pred)) > 0.2)) {
          if (u.pred != null) { s.gaps++; s.energy -= GAP; s.flashes.push({ x: p.x, y: p.y, t: 36, kind: 'gap' }); } // prediction and world collide
          u.pred = h;
        }
        if (u.sensed && u.pred != null && d < nextD) { next = u; nextD = d; }
      }
      if (next) { const want = dAng(next.pred, s.gate), turn = Math.max(-TURN * STEP, Math.min(TURN * STEP, want)); s.gate += turn; s.energy -= MOVE * Math.abs(turn); }
      world.step(STEP, 6, 2);
      while (touched.length) {
        const b = touched.pop(), u = b.getUserData(); if (u.done) continue; u.done = true;
        const p = b.getPosition(), met = Math.abs(dAng(Math.atan2(p.y, p.x), s.gate)) < GATE;
        if (u.kind === 'food') { s.food++; if (met) { s.caught++; s.energy += FOOD; s.flashes.push({ x: p.x, y: p.y, t: 30, kind: 'eat' }); drop(b); } }
        else { s.harm++; if (!met) { s.hits++; s.energy -= HARM; s.flashes.push({ x: p.x, y: p.y, t: 30, kind: 'hit' }); drop(b); } }
      }
      s.energy -= EDGE * s.reach * s.reach * STEP; // the edge is paid for, every moment
      s.energy = Math.max(0, Math.min(100, s.energy));
      const want = RMIN + (RMAX - RMIN) * s.energy / 100; // the reach it can afford: more energy, a wider edge
      s.reach += Math.max(-0.35 * STEP, Math.min(0.35 * STEP, want - s.reach));
      for (let i = s.flashes.length - 1; i >= 0; i--) if (--s.flashes[i].t <= 0) s.flashes.splice(i, 1);
      s.steps++;
      if (s.steps % 150 === 0) s.bars.push(+s.reach.toFixed(2));
      if (s.steps >= SECS * 60) s.done = true;
    };
    return s;
  }

  function result(s) {
    const n = s.bars.length, end = n ? (s.bars[n - 1] + s.bars[Math.max(0, n - 2)] + s.bars[Math.max(0, n - 3)]) / 3 : s.reach;
    const trend = end > R0 + 0.6 ? 'grow' : end < R0 - 0.6 ? 'shrink' : 'hold';
    const did = trend === 'grow' ? 'Its reach grew.' : trend === 'shrink' ? (end < RMIN + 0.6 ? 'Its reach fell back almost to its body.' : 'Its reach pulled in.') : 'Its reach held about where it began.';
    return { bars: s.bars.slice(), barTop: RMAX, mid: null, trend, end: +end.toFixed(2), food: s.food, caught: s.caught, hits: s.hits, gaps: s.gaps,
      tag: trend === 'grow' ? 'grew' : trend === 'shrink' ? 'pulled in' : 'held',
      say: did + ' It ate ' + s.caught + ' of ' + s.food + ', took ' + s.hits + (s.hits === 1 ? ' hit' : ' hits') + ', and its predictions were caught out ' + s.gaps + (s.gaps === 1 ? ' time.' : ' times.') };
  }
  function run(pl, knobs, seed) { const s = make(pl, knobs, seed); while (!s.done) s.step(); return result(s); }

  function draw(ctx, W, H, s) {
    const sc = Math.min(W, H) / 22, reach = s ? s.reach : R0, energy = s ? s.energy : E0, gate = s ? s.gate : Math.PI / 2;
    ctx.clearRect(0, 0, W, H);
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(sc, -sc); ctx.lineCap = 'round';
    // the reach: how far out it senses
    ctx.fillStyle = 'rgba(212,176,106,.07)'; ctx.beginPath(); ctx.arc(0, 0, reach, 0, 6.2832); ctx.fill();
    ctx.strokeStyle = 'rgba(212,176,106,.7)'; ctx.lineWidth = 0.07; ctx.setLineDash([0.3, 0.25]); ctx.beginPath(); ctx.arc(0, 0, reach, 0, 6.2832); ctx.stroke(); ctx.setLineDash([]);
    if (s) for (const b of s.things) {
      const u = b.getUserData(), p = b.getPosition();
      if (u.sensed && !u.done && u.pred != null) { // its prediction: where it expects this thing to touch
        ctx.strokeStyle = 'rgba(239,233,220,.45)'; ctx.lineWidth = 0.05; ctx.setLineDash([0.18, 0.18]); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(B * Math.cos(u.pred), B * Math.sin(u.pred)); ctx.stroke(); ctx.setLineDash([]);
      }
      const dim = u.sensed || u.done ? 1 : 0.4; // unsensed things are faint: to the self they are not there yet
      if (u.kind === 'food') { ctx.fillStyle = 'rgba(212,176,106,' + dim + ')'; ctx.beginPath(); ctx.arc(p.x, p.y, 0.28, 0, 6.2832); ctx.fill(); }
      else { ctx.fillStyle = 'rgba(224,138,143,' + dim + ')'; ctx.beginPath(); ctx.moveTo(p.x, p.y + 0.38); ctx.lineTo(p.x + 0.3, p.y); ctx.lineTo(p.x, p.y - 0.38); ctx.lineTo(p.x - 0.3, p.y); ctx.closePath(); ctx.fill(); }
    }
    // the body, filled as high as its energy
    ctx.fillStyle = '#17223a'; ctx.beginPath(); ctx.arc(0, 0, B, 0, 6.2832); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(0, 0, B, 0, 6.2832); ctx.clip(); ctx.fillStyle = 'rgba(212,176,106,.55)'; ctx.fillRect(-B, -B, 2 * B, 2 * B * energy / 100); ctx.restore();
    ctx.strokeStyle = '#d4b06a'; ctx.lineWidth = 0.08; ctx.beginPath(); ctx.arc(0, 0, B, 0, 6.2832); ctx.stroke();
    // the gate: the one place it can meet what comes
    ctx.strokeStyle = '#efe9dc'; ctx.lineWidth = 0.3; ctx.beginPath(); ctx.arc(0, 0, B + 0.12, gate - GATE, gate + GATE); ctx.stroke();
    if (s) for (const f of s.flashes) {
      const k = f.t / 36, col = f.kind === 'gap' ? '255,255,255' : f.kind === 'eat' ? '212,176,106' : '224,138,143';
      ctx.strokeStyle = 'rgba(' + col + ',' + k + ')'; ctx.lineWidth = f.kind === 'gap' ? 0.12 : 0.09; ctx.beginPath(); ctx.arc(f.x, f.y, 0.4 + (1 - k) * (f.kind === 'gap' ? 1.6 : 0.9), 0, 6.2832); ctx.stroke();
    }
    ctx.restore();
  }

  // Guess first: what will its edge do in this world?
  const OPTS = [{ v: 'grow', label: 'Grow' }, { v: 'hold', label: 'Hold' }, { v: 'shrink', label: 'Pull in' }];
  const guess = {
    options() { return OPTS; },
    gap(g, r) { return g === r.trend ? 'That is what you guessed.' : 'You guessed it would ' + (g === 'shrink' ? 'pull in' : g) + '.'; },
    bar() { return null; },
  };

  const bench = { make, result, run, draw, guess, hitAngle, STEP, R0, RMIN, RMAX };
  if (typeof module !== 'undefined' && module.exports) module.exports = bench;
  if (root && root.VULab) root.VULab.bench('boundary', bench);
})(typeof window !== 'undefined' ? window : null);
