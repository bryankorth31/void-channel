// MAKE IT (PLAN-kids-make-it T3, T4): the machine room's physics, with no page in it. Planck.js (Box2D in JavaScript,
// MIT, scripts/lib/play/vendor) moves things; this file sets up the room from data, runs it in fixed steps (so the same
// machine always does the same thing), records the path for the page to play back slowly, and says in one sentence
// what happened. Works in node (tests) and in the page (build.js inlines it after planck.min.js).
//
// Units: the room is 16 wide and 10 tall, y pointing up, 0,0 at the bottom left. Angles in degrees, counter-clockwise.
// A thing: { shape: 'box' | 'circle', w, h | r, moves (falls and rolls) or stays put, bounce, grip, heavy }.
// A job: { id, room: [fixed things placed], tray: [things the child may place], goal: { thing, into }, ... }.

const STEP = 1 / 60, VEL_ITERS = 8, POS_ITERS = 3, MAX_STEPS = 60 * 12; // at most 12 seconds of machine
const SAMPLE = 2;                                                         // keep a frame every 2 steps for playback

// The everyday things (T2 will grow this list with B). Sizes in room units.
const THINGS = {
  marble: { shape: 'circle', r: 0.3, moves: true, density: 2.5, bounce: 0.2, grip: 0.3, name: 'the marble' },
  ball: { shape: 'circle', r: 0.45, moves: true, density: 0.6, bounce: 0.55, grip: 0.4, name: 'the ball' },
  car: { shape: 'box', w: 1.1, h: 0.45, moves: true, density: 1.5, bounce: 0.05, grip: 0.02, name: 'the toy car' },
  domino: { shape: 'box', w: 0.22, h: 1.1, moves: true, density: 1.2, bounce: 0, grip: 0.9, name: 'the dominoes' },
  book: { shape: 'box', w: 3, h: 0.3, moves: false, bounce: 0, grip: 0.3, name: 'the book' },
  ruler: { shape: 'box', w: 4, h: 0.15, moves: false, bounce: 0, grip: 0.2, name: 'the ruler' },
  block: { shape: 'box', w: 1, h: 1, moves: false, bounce: 0, grip: 0.5, name: 'the block' },
  pillow: { shape: 'box', w: 2, h: 0.7, moves: false, bounce: 0, grip: 0.9, name: 'the pillow' },
  shelf: { shape: 'box', w: 4, h: 0.3, moves: false, bounce: 0, grip: 0.8, name: 'the shelf' },
  floor: { shape: 'box', w: 16, h: 0.4, moves: false, bounce: 0, grip: 0.6, name: 'the floor' },
  wall: { shape: 'box', w: 0.4, h: 10, moves: false, bounce: 0, grip: 0.3, name: 'the wall' },
  cup: { shape: 'cup', w: 1.4, h: 1.3, moves: false, bounce: 0, grip: 0.6, name: 'the cup' },
};

function planckLib() { if (typeof planck !== 'undefined') return planck; return require('../vendor/planck.min.js'); }

// Build a world from the job's fixed room plus the child's placed things.
function makeWorld(job, placed) {
  const pl = planckLib(), V = pl.Vec2;
  const world = new pl.World({ gravity: V(0, -10) });
  const bodies = [];
  const add = (p, fixed) => {
    const t = THINGS[p.thing]; if (!t) throw new Error('unknown thing ' + p.thing);
    const dyn = t.moves && !p.still;
    const body = world.createBody({ type: dyn ? 'dynamic' : 'static', position: V(p.x, p.y), angle: (p.angle || 0) * Math.PI / 180, bullet: dyn && t.shape === 'circle' });
    const fx = { density: t.density || 1, friction: t.grip, restitution: t.bounce };
    if (t.shape === 'circle') body.createFixture(pl.Circle(t.r), fx);
    else if (t.shape === 'cup') { // a cup: a bottom and two sides, open at the top, and a sensor inside
      const w = t.w / 2, h = t.h / 2, s = 0.09;
      body.createFixture(pl.Box(w, s, V(0, -h + s), 0), fx);
      body.createFixture(pl.Box(s, h, V(-w + s, 0), 0), fx);
      body.createFixture(pl.Box(s, h, V(w - s, 0), 0), fx);
      body.createFixture({ shape: pl.Box(w - 2 * s, h * 0.6, V(0, -h * 0.3), 0), isSensor: true, userData: 'inside' });
    } else body.createFixture(pl.Box(t.w / 2, t.h / 2), fx);
    if (dyn && p.push) body.setLinearVelocity(V(p.push[0], p.push[1]));
    const b = { id: p.id || p.thing, thing: p.thing, fixed, body };
    body.setUserData(b); bodies.push(b);
    return b;
  };
  for (const p of job.room) add(p, true);
  for (const p of placed || []) add(p, false);
  return { world, bodies };
}

// Run the machine. Returns { outcome, say, steps, frames, touched }:
//   outcome  'done' (the goal thing got into the goal), 'floor' (it hit the floor first), 'stopped' (it came to rest
//            somewhere else), 'still' (the machine finished and never moved it), 'away' (it left the room), 'time' (still moving after 12 seconds)
//   frames   positions of every moving thing every SAMPLE steps, for the page to play back slowly
//   touched  the kinds of thing the goal thing touched, in order (for "what happened")
function run(job, placed) {
  const { world, bodies } = makeWorld(job, placed);
  const goal = bodies.find((b) => b.id === job.goal.thing), into = bodies.find((b) => b.id === job.goal.into);
  let inside = false, hitFloor = false; const touched = [];
  world.on('begin-contact', (c) => {
    const A = c.getFixtureA(), B = c.getFixtureB(), a = A.getBody().getUserData(), b = B.getBody().getUserData();
    const other = a === goal ? b : b === goal ? a : null; if (!other) return;
    const sensor = (a === goal ? B : A).getUserData() === 'inside';
    if (other === into && sensor) inside = true;
    if (other.thing === 'floor') hitFloor = true;
    if (!sensor && !touched.includes(other.thing)) touched.push(other.thing);
  });
  const movers = bodies.filter((b) => b.body.isDynamic()), frames = [];
  const snap = () => frames.push(movers.map((b) => { const p = b.body.getPosition(); return [+p.x.toFixed(3), +p.y.toFixed(3), +b.body.getAngle().toFixed(3)]; }));
  snap();
  let s = 0, rest = 0, outcome = 'time', moved = false; const start = goal.body.getPosition().clone();
  for (; s < MAX_STEPS; s++) {
    world.step(STEP, VEL_ITERS, POS_ITERS);
    if ((s + 1) % SAMPLE === 0) snap();
    if (inside) { outcome = 'done'; break; }
    if (hitFloor && !(job.goal.into === 'floor')) { outcome = 'floor'; break; }
    const p = goal.body.getPosition();
    if (p.x < -1 || p.x > 17 || p.y < -2) { outcome = 'away'; break; }
    const q = goal.body.getPosition(); if (Math.hypot(q.x - start.x, q.y - start.y) > 0.15) moved = true;
    rest = movers.every((b) => b.body.getLinearVelocity().length() < 0.03 && Math.abs(b.body.getAngularVelocity()) < 0.05) ? rest + 1 : 0; // the whole machine has gone quiet
    if (rest > 45) { outcome = moved ? 'stopped' : 'still'; break; }
  }
  for (let k = 0; k < 30 && outcome === 'done'; k++) { world.step(STEP, VEL_ITERS, POS_ITERS); if (k % SAMPLE === 0) snap(); } // let it settle in the cup
  const p = goal.body.getPosition(), at = [+p.x.toFixed(2), +p.y.toFixed(2)];
  return { outcome, say: explain(job, outcome, touched, at), steps: s + 1, frames, movers: movers.map((b) => b.id), touched, at };
}

// One sentence a child can hear, about the cause, never a verdict.
function explain(job, outcome, touched, at) {
  const G = THINGS[job.goal.thingKind || job.goal.thing] || {}, name = (G.name || 'it').replace(/^the /, 'The ');
  const last = touched.length ? (THINGS[touched[touched.length - 1]] || {}).name : null;
  if (outcome === 'done') return job.say.done;
  // before or past the cup depends on which way the thing set off (a marble can roll left)
  const start = (job.room.find((p) => p.thing === job.goal.thing) || { x: 0 }).x, dir = job.goalX >= start ? 1 : -1;
  if (outcome === 'floor') return name + ' fell to the floor' + ((at[0] - job.goalX) * dir < 0 ? ' before it reached the cup.' : ' past the cup.') + ' What could catch it, or carry it closer?';
  if (outcome === 'stopped') return name + ' stopped' + (last ? ' on ' + last : '') + '. It needs a slope to keep rolling.';
  if (outcome === 'still') return name + ' never moved. Nothing reached it. What could give it a push?';
  if (outcome === 'away') return name + ' flew out of the room. Too much push!';
  return name + ' kept going and going. Let it finish, or try a change.';
}

// A short fingerprint of a run, to prove the same machine does the same thing every time.
function fingerprint(r) { let h = 2166136261; const s = r.outcome + '|' + r.steps + '|' + JSON.stringify(r.frames); for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0; return h.toString(16); }

// Things that stand (dominoes, blocks) settle on the highest flat surface under them, so a child only has to choose
// where along the shelf, not balance them exactly. Returns the center height for that thing at x.
const RESTS = { domino: true, block: true };
function restY(job, thing, x, y) {
  const t = THINGS[thing], half = (t.h || 2 * t.r) / 2; let top = 0.4; // the floor's top
  for (const p of job.room) { const q = THINGS[p.thing]; if (q.moves || q.shape !== 'box' || p.angle) continue;
    const pt = p.y + q.h / 2; if (Math.abs(x - p.x) <= q.w / 2 && pt <= y + 0.6 && pt > top) top = pt; }
  return +(top + half).toFixed(3);
}

// Flat things (a book or ruler lying level) click into line like toy track: near a shelf top they line up level with
// it, and near the end of a shelf or of another flat piece they butt up end to end. The child only has to get close.
// Returns { x, y }.
function snapFlat(job, placed, thing, x, y, angle) {
  const t = THINGS[thing]; if (angle || t.moves || t.shape !== 'box') return { x, y };
  let nx = x, ny = y;
  for (const p of job.room) { if (p.thing !== 'shelf') continue; const q = THINGS[p.thing], top = p.y + q.h / 2, want = top - t.h / 2;
    if (Math.abs(y - want) <= 0.4 && Math.abs(x - p.x) <= q.w / 2 + t.w + 1.5) { ny = want;
      for (const end of [p.x - q.w / 2 - t.w / 2, p.x + q.w / 2 + t.w / 2]) if (Math.abs(nx - end) <= 0.5) nx = end; } }
  for (const o of placed || []) { const q = THINGS[o.thing]; if (o.angle || q.moves || q.shape !== 'box' || Math.abs(o.y - ny) > 0.05) continue;
    for (const end of [o.x - q.w / 2 - t.w / 2, o.x + q.w / 2 + t.w / 2]) if (Math.abs(nx - end) <= 0.5) nx = end; }
  return { x: +nx.toFixed(3), y: +ny.toFixed(3) };
}
function snapTop(job, thing, x, y, angle) { return snapFlat(job, [], thing, x, y, angle).y; }

// Every sentence explain() can say for a job, so each one can have a voice clip.
function explainLines(job) {
  const out = new Set([job.say.job, job.say.done, job.say.idea]);
  for (const outcome of ['floor', 'still', 'away', 'time']) for (const at of [[0, 0], [99, 0]]) out.add(explain(job, outcome, [], at));
  out.add(explain(job, 'stopped', [], [0, 0]));
  for (const k of Object.keys(THINGS)) out.add(explain(job, 'stopped', [k], [0, 0]));
  return [...out];
}

module.exports = { THINGS, RESTS, makeWorld, run, explain, explainLines, restY, snapFlat, snapTop, fingerprint, STEP, MAX_STEPS };
