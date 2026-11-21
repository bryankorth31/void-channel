// Make it (PLAN-kids-make-it T3): the machine is fair to a child only if the same build always does the same thing.
// Run: node --test scripts/test/make.test.js
const test = require('node:test');
const assert = require('node:assert');
const sim = require('../lib/play/make/sim');
const { JOBS } = require('../lib/play/make/jobs');

test('every job has a proven working build that uses only what is in its tray', () => {
  for (const j of JOBS) {
    const tray = j.tray.slice();
    for (const p of j.works) { const i = tray.indexOf(p.thing); assert.ok(i >= 0, j.id + ' works with ' + p.thing + ' not in the tray'); tray.splice(i, 1); }
    const r = sim.run(j, j.works);
    assert.strictEqual(r.outcome, 'done', j.id + ': ' + r.say);
    assert.strictEqual(r.say, j.say.done);
  }
});

test('the same build gives the same result 100 times out of 100', () => {
  for (const j of JOBS) for (const build of [j.works, [], j.works.slice(0, 1)]) {
    const first = sim.fingerprint(sim.run(j, build));
    for (let i = 1; i < 100; i++) assert.strictEqual(sim.fingerprint(sim.run(j, build)), first, j.id + ' run ' + i + ' differs');
  }
});

test('a build that does not work says what happened, in plain words, never a verdict', () => {
  for (const j of JOBS) {
    const r = sim.run(j, []);
    assert.notStrictEqual(r.outcome, 'done');
    assert.ok(r.say && r.say.length < 140, r.say);
    for (const bad of ['wrong', 'fail', 'failed', 'lose', 'lost', 'bad', 'oops']) assert.ok(!new RegExp('\\b' + bad + '\\b').test(r.say.toLowerCase()), j.id + ': ' + r.say);
  }
  const ramp = JOBS.find((j) => j.id === 'marble-cup');
  assert.match(sim.run(ramp, []).say, /fell to the floor before it reached the cup/);
  const dom = JOBS.find((j) => j.id === 'domino-ball');
  assert.match(sim.run(dom, dom.works.slice(0, 3)).say, /never moved/);
});

test('a small change makes a different machine, and it too repeats exactly', () => {
  const j = JOBS[0], moved = j.works.map((p, i) => i ? { ...p, angle: p.angle + 6 } : p);
  const a = sim.fingerprint(sim.run(j, moved));
  assert.notStrictEqual(a, sim.fingerprint(sim.run(j, j.works)));
  assert.strictEqual(a, sim.fingerprint(sim.run(j, moved)));
});

test('a bridge clicks together: books placed near the right spot snap level and end to end, and then it works', () => {
  const j = JOBS.find((x) => x.id === 'bridge'); let ok = 0, n = 0;
  for (let a = 5.0; a <= 6.0; a += 0.5) for (let b = 8.0; b <= 9.0; b += 0.5) for (const y of [3.7, 4.0, 4.3]) {
    const A = sim.snapFlat(j, [], 'book', a, y, 0), B = sim.snapFlat(j, [{ thing: 'book', ...A, angle: 0 }], 'book', b, y, 0);
    n++; if (sim.run(j, [{ thing: 'book', ...A, angle: 0 }, { thing: 'book', ...B, angle: 0 }]).outcome === 'done') ok++;
  }
  assert.strictEqual(ok, n);
  assert.notStrictEqual(sim.run(j, [{ thing: 'book', x: 5.5, y: 4, angle: 0 }]).outcome, 'done', 'one book is too short: the bridge must reach all the way');
});

test('what happened knows which way things roll: a marble rolling left that drops early fell before the cup', () => {
  const z = JOBS.find((x) => x.id === 'zigzag');
  assert.match(sim.run(z, []).say, /before it reached the cup/);
});
