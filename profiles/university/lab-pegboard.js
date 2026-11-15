// Void University lab bench: the pegboard (15 Nov 2026). Balls fall through rows of pegs into bins. Real movement
// from Planck.js (Box2D in JavaScript, MIT, vendor/), run in fixed steps with a seeded start, so the same run always
// gives the same pile. Works in node (test-lab.js) and in the page (lab.js mounts it).
//
// Knobs this bench understands: n (how many balls), tilt (degrees the board leans to the right).
// Units: the board is 12 wide and about 14 tall, y pointing up. Pegs sit one unit apart, each row shifted half a unit.
(function (root) {
  const G = 14, STEP = 1 / 60, ROWS = 8, WID = 12, BINS = 13, MID = 6, TOP = 12, LINE = 4, PEG = 0.13, BALL = 0.2;
  const PEGS = [];
  for (let k = 0; k < ROWS; k++) for (let x = k % 2 ? 0.5 : 0; x <= WID + 0.001; x += 1) PEGS.push([x, TOP - k]);

  // A small seeded random number maker (mulberry32): the same seed gives the same drops.
  function rng(seed) { let a = (seed >>> 0) + 0x9e3779b9; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  function make(pl, knobs, seed) {
    const V = pl.Vec2, th = (knobs.tilt || 0) * Math.PI / 180, n = knobs.n || 10;
    const world = new pl.World({ gravity: V(G * Math.sin(th), -G * Math.cos(th)) });
    const board = world.createBody();
    const hard = { friction: 0.05, restitution: 0.4 };
    for (const [x, y] of PEGS) board.createFixture(pl.Circle(V(x, y), PEG), hard);
    board.createFixture(pl.Edge(V(-0.45, 0), V(-0.45, 15)), hard);
    board.createFixture(pl.Edge(V(WID + 0.45, 0), V(WID + 0.45, 15)), hard);
    const R = rng(seed), every = n <= 10 ? 18 : n <= 60 ? 6 : 1;
    const s = { bins: new Array(BINS).fill(0), balls: [], released: 0, landed: 0, steps: 0, done: false, n, speed: n <= 10 ? 1 : n <= 60 ? 2 : 4 };
    const land = (i) => { const p = s.balls[i].getPosition(); s.bins[Math.max(0, Math.min(BINS - 1, Math.round(p.x)))]++; s.landed++; world.destroyBody(s.balls[i]); s.balls.splice(i, 1); };
    s.step = function () {
      if (s.done) return;
      if (s.released < n && s.steps % every === 0) {
        const b = world.createBody({ type: 'dynamic', position: V(MID + (R() - 0.5) * 0.3, 13.6) });
        b.createFixture(pl.Circle(BALL), { density: 1, friction: 0.05, restitution: 0.4, filterGroupIndex: -1 }); // balls pass through each other: each one is its own count
        s.balls.push(b); s.released++;
      }
      world.step(STEP, 6, 2); s.steps++;
      for (let i = s.balls.length - 1; i >= 0; i--) if (s.balls[i].getPosition().y < LINE) land(i);
      if (s.steps > 60 * 45) while (s.balls.length) land(0); // anything still perched on a peg after 45 seconds is counted where it sits
      if (s.landed >= n) s.done = true;
    };
    return s;
  }

  // What happened, as a plain result the lab core can show, compare and keep as a try.
  function result(s) {
    let peak = 0, sum = 0; s.bins.forEach((c, i) => { if (c > s.bins[peak]) peak = i; sum += c * i; });
    const mean = sum / (s.n || 1), off = peak - MID;
    const where = off === 0 ? 'right on the middle' : Math.abs(off) + (Math.abs(off) === 1 ? ' bin' : ' bins') + ' to the ' + (off > 0 ? 'right' : 'left') + ' of the middle';
    return { bars: s.bins.slice(), mid: MID, n: s.n, peak, mean: +mean.toFixed(3), say: s.n + ' dropped. The tallest pile is ' + where + '.' };
  }

  function run(pl, knobs, seed) { const s = make(pl, knobs, seed); while (!s.done) s.step(); return result(s); }

  // Draw the board. The canvas is turned by the tilt, so down on the screen is always down.
  function draw(ctx, W, H, s, knobs, guess) {
    const sc = Math.min(W / 14.6, H / 15.6), th = ((knobs && knobs.tilt) || 0) * Math.PI / 180;
    ctx.clearRect(0, 0, W, H);
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(th); ctx.scale(sc, -sc); ctx.translate(-WID / 2, -7.1);
    ctx.lineWidth = 0.05; ctx.strokeStyle = '#2c3b5c'; ctx.fillStyle = 'rgba(17,26,44,.75)';
    ctx.beginPath(); ctx.rect(-0.45, 0, WID + 0.9, 14.2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); for (let x = -0.5; x <= WID + 0.5; x += 1) { if (x < -0.4 || x > WID + 0.4) continue; ctx.moveTo(x, 0); ctx.lineTo(x, LINE); } ctx.stroke();
    ctx.strokeStyle = 'rgba(212,176,106,.5)'; ctx.setLineDash([0.18, 0.18]); ctx.beginPath(); ctx.moveTo(MID, 0); ctx.lineTo(MID, 14.2); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#d4b06a'; for (const [x, y] of PEGS) { ctx.beginPath(); ctx.arc(x, y, PEG, 0, 6.2832); ctx.fill(); }
    if (guess != null) { // the learner's guess: a marked bin with a small flag over it
      ctx.fillStyle = 'rgba(224,138,143,.16)'; ctx.fillRect(guess - 0.5, 0, 1, LINE);
      ctx.strokeStyle = '#e08a8f'; ctx.lineWidth = 0.07; ctx.strokeRect(guess - 0.5, 0, 1, LINE);
      ctx.fillStyle = '#e08a8f'; ctx.beginPath(); ctx.moveTo(guess - 0.3, LINE + 0.55); ctx.lineTo(guess + 0.3, LINE + 0.55); ctx.lineTo(guess, LINE + 0.1); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#d4b06a'; ctx.beginPath(); ctx.moveTo(MID - 0.9, 14.2); ctx.lineTo(MID - 0.3, 13.2); ctx.lineTo(MID + 0.3, 13.2); ctx.lineTo(MID + 0.9, 14.2); ctx.closePath(); ctx.globalAlpha = 0.35; ctx.fill(); ctx.globalAlpha = 1;
    if (s) {
      const top = Math.max.apply(null, s.bins), unit = Math.min(0.4, (LINE - 0.25) / Math.max(1, top));
      for (let i = 0; i < BINS; i++) {
        const c = s.bins[i]; if (!c) continue;
        if (unit >= 0.3) { ctx.fillStyle = '#efe9dc'; for (let k = 0; k < c; k++) { ctx.beginPath(); ctx.arc(i, 0.2 + k * 0.4, 0.19, 0, 6.2832); ctx.fill(); } }
        else { ctx.fillStyle = '#efe9dc'; ctx.fillRect(i - 0.38, 0, 0.76, c * unit); }
      }
      ctx.fillStyle = '#fff7e2'; for (const b of s.balls) { const p = b.getPosition(); ctx.beginPath(); ctx.arc(p.x, p.y, BALL, 0, 6.2832); ctx.fill(); }
    }
    ctx.restore();
  }

  // Guess first: a tap on the board picks the bin under it (the tap is turned back by the tilt, the way the board is drawn).
  const guess = {
    pick(px, py, W, H, knobs) {
      const sc = Math.min(W / 14.6, H / 15.6), th = ((knobs && knobs.tilt) || 0) * Math.PI / 180, dx = px - W / 2, dy = py - H / 2;
      const bx = (dx * Math.cos(th) + dy * Math.sin(th)) / sc + WID / 2;
      return bx < -0.7 || bx > WID + 0.7 ? null : Math.max(0, Math.min(BINS - 1, Math.round(bx)));
    },
    gap(g, r) { const d = Math.abs(r.peak - g); return d === 0 ? 'That is the bin you guessed.' : 'You guessed ' + d + (d === 1 ? ' bin' : ' bins') + ' away from it.'; },
    bar(g) { return g; },
  };
  const bench = { make, result, run, draw, guess, STEP, BINS, MID };
  if (typeof module !== 'undefined' && module.exports) module.exports = bench;
  if (root && root.VULab) root.VULab.bench('pegboard', bench);
})(typeof window !== 'undefined' ? window : null);
