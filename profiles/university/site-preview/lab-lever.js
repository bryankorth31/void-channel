// Void University lab bench: the lever (15 Nov 2026). A machine with a lever. The learner pulls it with their own
// hand; sometimes a coin drops into the tray (real movement from Planck.js). After a while the machine stops paying
// and never says so. What the bench measures is the learner's own behaviour: how many more times they pulled before
// they walked away. That is the lesson of variable reward (Skinner: behaviour paid at random is the slowest to stop).
//
// Knob this bench understands: pay = 'every' (every pull pays), 'third' (every third pull), 'random' (about 2 in 5).
// In every case the last paying pull is a win, so "pulls after it stopped" is counted from the same kind of moment.
// Units: the view is 12 wide and 12 tall, y pointing up.
(function (root) {
  const STEP = 1 / 60, PULL = 24, MAXDRY = 40;

  function rng(seed) { let a = (seed >>> 0) + 0x9e3779b9; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  // Which pulls pay, for the whole paying stretch (9 or 12 pulls long).
  function plan(pay, R) {
    const L = 9 + 3 * Math.floor(R() * 2), out = [];
    let dry = 0;
    for (let i = 1; i <= L; i++) {
      let w = pay === 'every' ? true : pay === 'third' ? i % 3 === 0 : (R() < 0.4 || dry >= 4 || i === L);
      if (pay === 'random' && i === L - 1) w = false; // so the last win is not part of a streak that gives it away
      out.push(w); dry = w ? 0 : dry + 1;
    }
    return out;
  }

  function make(pl, knobs, seed) {
    const V = pl.Vec2, R = rng(seed), wins = plan(knobs.pay || 'every', R), L = wins.length;
    const world = new pl.World({ gravity: V(0, -14) });
    const tray = world.createBody(), hard = { friction: 0.5, restitution: 0.2 };
    tray.createFixture(pl.Edge(V(1.5, 0.4), V(9, 0.4)), hard);
    tray.createFixture(pl.Edge(V(1.5, 0.4), V(1.5, 4)), hard);
    tray.createFixture(pl.Edge(V(9, 0.4), V(9, 4)), hard);
    const s = { coins: [], seq: [], pulls: 0, L, pullT: 0, flash: 0, won: false, done: false, speed: 1, walked: false,
      actions: [{ id: 'pull', label: 'Pull the lever' }, { id: 'walk', label: 'Walk away' }], say: 'Pull the lever.', script: null };
    s.act = function (id) {
      if (s.done) return;
      if (id === 'pull' && !s.pullT) { s.pulls++; s.pullT = PULL; }
      if (id === 'walk' && s.pulls && !s.pullT) { s.walked = true; s.done = true; }
    };
    s.step = function () {
      if (s.done) return;
      if (s.script && !s.pullT) s.act(s.pulls < L + s.script.extra ? 'pull' : 'walk');
      if (s.done) return;
      if (s.pullT) {
        s.pullT--;
        if (s.pullT === PULL / 2) { // the lever is all the way down: the machine answers
          s.won = s.pulls <= L && wins[s.pulls - 1]; s.seq.push(s.won ? 1 : 0); s.flash = 40;
          s.say = s.won ? 'A coin.' : 'Nothing.';
          if (s.won) { const c = world.createBody({ type: 'dynamic', position: V(5 + (R() - 0.5) * 0.6, 4.1), linearVelocity: V((R() - 0.5) * 3, -1) }); c.createFixture(pl.Circle(0.36), { density: 1, friction: 0.4, restitution: 0.25 }); s.coins.push(c); }
        }
        if (!s.pullT && s.pulls >= L + MAXDRY) s.done = true;
      }
      if (s.flash) s.flash--;
      world.step(STEP, 6, 2);
    };
    return s;
  }

  // For checks and hidden pages: pull through the paying stretch, then `extra` more times, then walk away.
  function play(s, opts) { s.script = { extra: Math.max(0, (opts && opts.extra) || 0) }; }

  function result(s) {
    const extra = s.pulls - s.L, stayed = extra > 0;
    const say = !stayed ? 'You walked away while it was still paying. Sit down again and stay a little longer.'
      : 'It stopped paying after pull ' + s.L + '. You pulled ' + extra + ' more ' + (extra === 1 ? 'time' : 'times') + (s.walked ? ' before you walked away.' : '. The machine is empty.');
    return { bars: s.seq.map((w) => (w ? 1 : 0.28)), mid: s.L - 0.5, pulls: s.pulls, paid: s.L, extra: Math.max(0, extra), counts: stayed, tag: stayed ? extra + ' past the line' : 'left early', say };
  }

  function run(pl, knobs, seed, opts) { const s = make(pl, knobs, seed); play(s, opts); while (!s.done) s.step(); return result(s); }

  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath(); }

  function draw(ctx, W, H, s) {
    const sc = Math.min(W / 12.6, H / 12.6);
    ctx.clearRect(0, 0, W, H);
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(sc, -sc); ctx.translate(-5.6, -6);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // the tray
    ctx.strokeStyle = '#3a4a70'; ctx.lineWidth = 0.14; ctx.beginPath(); ctx.moveTo(1.5, 4); ctx.lineTo(1.5, 0.4); ctx.lineTo(9, 0.4); ctx.lineTo(9, 4); ctx.stroke();
    // the lever: up when resting, down at the middle of a pull
    const t = s && s.pullT ? Math.sin(Math.PI * (1 - s.pullT / PULL)) : 0, a = (62 - 100 * t) * Math.PI / 180, kx = 8.3 + 2.5 * Math.cos(a), ky = 7.6 + 2.5 * Math.sin(a);
    ctx.strokeStyle = '#9aa3b5'; ctx.lineWidth = 0.22; ctx.beginPath(); ctx.moveTo(8.3, 7.6); ctx.lineTo(kx, ky); ctx.stroke();
    ctx.fillStyle = '#e08a8f'; ctx.beginPath(); ctx.arc(kx, ky, 0.48, 0, 6.2832); ctx.fill();
    // the machine
    ctx.fillStyle = '#17223a'; ctx.strokeStyle = '#d4b06a'; ctx.lineWidth = 0.1; rr(ctx, 2.2, 4.7, 6.1, 6.9, 0.5); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#0b1220'; rr(ctx, 4.3, 4.2, 1.4, 0.7, 0.12); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#07090f'; rr(ctx, 3.1, 7.4, 4.3, 3.2, 0.3); ctx.fill(); ctx.stroke();
    const lit = s && s.flash ? s.flash / 40 : 0;
    if (lit && s.won) { ctx.fillStyle = 'rgba(212,176,106,' + (0.25 + 0.75 * lit) + ')'; ctx.beginPath(); ctx.arc(5.25, 9, 0.95 + 0.25 * lit, 0, 6.2832); ctx.fill(); ctx.strokeStyle = 'rgba(255,247,226,' + lit + ')'; ctx.lineWidth = 0.1; ctx.beginPath(); ctx.arc(5.25, 9, 0.6, 0, 6.2832); ctx.stroke(); }
    else { ctx.strokeStyle = lit ? 'rgba(154,163,181,' + (0.35 + 0.4 * lit) + ')' : 'rgba(154,163,181,.3)'; ctx.lineWidth = 0.1; ctx.setLineDash([0.25, 0.25]); ctx.beginPath(); ctx.arc(5.25, 9, 0.95, 0, 6.2832); ctx.stroke(); ctx.setLineDash([]); }
    // the coins
    if (s) for (const c of s.coins) { const p = c.getPosition(); ctx.fillStyle = '#d4b06a'; ctx.beginPath(); ctx.arc(p.x, p.y, 0.36, 0, 6.2832); ctx.fill(); ctx.strokeStyle = '#fff7e2'; ctx.lineWidth = 0.05; ctx.beginPath(); ctx.arc(p.x, p.y, 0.22, 0, 6.2832); ctx.stroke(); }
    ctx.restore();
  }

  // Guess first: how many more pulls will your own hand make once it stops paying? The value is the top of the range.
  const OPTS = [{ v: 2, label: '1 or 2' }, { v: 5, label: '3 to 5' }, { v: 10, label: '6 to 10' }, { v: 99, label: 'More than 10' }];
  const guess = {
    options() { return OPTS; },
    gap(g, r) { if (!r.counts) return ''; const o = OPTS.find((x) => x.v === g); return 'You guessed ' + (o ? o.label.toLowerCase() : g) + '. Your hand did ' + r.extra + '.'; },
    bar(g, r) { return g >= 99 ? null : r.paid - 0.5 + g; },
  };
  const bench = { make, play, result, run, draw, plan, rng, guess, STEP };
  if (typeof module !== 'undefined' && module.exports) module.exports = bench;
  if (root && root.VULab) root.VULab.bench('lever', bench);
})(typeof window !== 'undefined' ? window : null);
