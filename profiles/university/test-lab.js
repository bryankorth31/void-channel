// Checks for the University labs:  node profiles/university/test-lab.js
// The pegboard must give the same pile for the same seed, a hill on the middle when level, and a moved hill when tilted.
const assert = require('assert');
const pl = require('./vendor/planck.min.js');
const peg = require('./lab-pegboard.js');

const a = peg.run(pl, { n: 500, tilt: 0 }, 1), b = peg.run(pl, { n: 500, tilt: 0 }, 1);
assert.deepStrictEqual(a.bars, b.bars, 'same seed, same pile');
assert.strictEqual(a.bars.reduce((x, y) => x + y, 0), 500, 'every ball is counted once');

const level = [1, 2, 3, 4, 5, 6].map((s) => peg.run(pl, { n: 500, tilt: 0 }, s));
for (const r of level) { assert.ok(Math.abs(r.mean - 6) < 0.4, 'level 500: centered, mean ' + r.mean); assert.ok(Math.abs(r.peak - 6) <= 1, 'level 500: peak near the middle, peak ' + r.peak); }

const tilted = [1, 2, 3, 4, 5, 6].map((s) => peg.run(pl, { n: 500, tilt: 8 }, s));
for (const r of tilted) assert.ok(r.mean - 6 > 1, 'tilted 500: the hill moves right, mean ' + r.mean);

const small = [1, 2, 3, 4, 5, 6, 7, 8].map((s) => peg.run(pl, { n: 10, tilt: 0 }, s));
const shapes = new Set(small.map((r) => r.bars.join(',')));
assert.ok(shapes.size >= 7, 'ten balls: the pile changes from run to run (' + shapes.size + ' shapes in 8 runs)');

console.log('level 500 :', level.map((r) => r.mean + '/' + r.peak).join('  '));
console.log('          ', level[0].bars.join(' '));
console.log('tilted 500:', tilted.map((r) => r.mean + '/' + r.peak).join('  '));
console.log('          ', tilted[0].bars.join(' '));
console.log('ten       :', small.map((r) => r.peak).join(' '), ' ', small[0].bars.join(' '));
console.log('tilted ten:', [1, 2, 3, 4, 5, 6, 7, 8].map((s) => peg.run(pl, { n: 10, tilt: 8 }, s).peak).join(' '));

// The lever: each kind of machine pays the way it says, the last paying pull is a win, and the count past the line is right.
const lever = require('./lab-lever.js');
for (let seed = 1; seed <= 40; seed++) {
  for (const pay of ['every', 'third', 'random']) {
    const w = lever.plan(pay, lever.rng(seed)), L = w.length;
    assert.ok(L === 9 || L === 12, 'paying stretch is 9 or 12 pulls');
    assert.ok(w[L - 1], pay + ': the last paying pull is a win');
    if (pay === 'every') assert.ok(w.every(Boolean));
    if (pay === 'third') assert.deepStrictEqual(w, w.map((_, i) => (i + 1) % 3 === 0));
    if (pay === 'random') { let dry = 0, worst = 0; for (const x of w) { dry = x ? 0 : dry + 1; worst = Math.max(worst, dry); } assert.ok(worst <= 5 && worst >= 1 && w.filter(Boolean).length >= 2, 'random: some wins, some dry spells'); }
  }
}
const lv = lever.run(pl, { pay: 'random' }, 3, { extra: 7 }), lv2 = lever.run(pl, { pay: 'random' }, 3, { extra: 7 });
assert.deepStrictEqual(lv.bars, lv2.bars, 'lever: same seed, same run');
assert.strictEqual(lv.extra, 7); assert.strictEqual(lv.counts, true); assert.strictEqual(lv.bars.length, lv.paid + 7);
assert.ok(lv.bars.slice(lv.paid).every((b) => b < 1), 'nothing pays past the line');
assert.strictEqual(lever.run(pl, { pay: 'every' }, 1, { extra: 0 }).counts, false, 'leaving while it still pays does not find a rule');
assert.strictEqual(lever.run(pl, { pay: 'every' }, 1, { extra: 99 }).extra, 40, 'the machine ends the run after 40 empty pulls');
console.log('lever     :', lv.say);

// Guess first: a tap picks the bin under it, level or tilted, and the gap is said as a plain fact.
const W = 560, H = 560, sc = Math.min(W / 14.6, H / 15.6);
for (const tilt of [0, 8]) for (const bin of [0, 3, 6, 9, 12]) {
  const th = tilt * Math.PI / 180, x = (bin - 6) * sc, y = -(1.5 - 7.1) * sc; // a point low in that bin, in board space
  const px = W / 2 + x * Math.cos(th) - y * Math.sin(th), py = H / 2 + x * Math.sin(th) + y * Math.cos(th);
  assert.strictEqual(peg.guess.pick(px, py, W, H, { tilt }), bin, 'tap picks bin ' + bin + ' at tilt ' + tilt);
}
assert.strictEqual(peg.guess.pick(2, 280, W, H, { tilt: 0 }), null, 'a tap off the board picks nothing');
assert.strictEqual(peg.guess.gap(6, { peak: 6 }), 'That is the bin you guessed.');
assert.strictEqual(peg.guess.gap(6, { peak: 4 }), 'You guessed 2 bins away from it.');
assert.strictEqual(lever.guess.gap(2, lv), 'You guessed 1 or 2. Your hand did 7.');
assert.strictEqual(lever.guess.bar(5, lv), lv.paid + 4.5);
assert.strictEqual(lever.guess.gap(2, { counts: false }), '', 'no gap is claimed for a try that left early');

// The boundary: same seed same run, and the four worlds behave the way the lab's rules say, seed after seed.
const bd = require('./lab-boundary.js');
assert.deepStrictEqual(bd.run(pl, { give: 'plenty', world: 'surprise' }, 2).bars, bd.run(pl, { give: 'plenty', world: 'surprise' }, 2).bars, 'boundary: same seed, same run');
assert.strictEqual(bd.hitAngle(5, 0, -1, 0), 0, 'a thing coming straight in from the right touches at angle 0');
assert.strictEqual(bd.hitAngle(5, 3, -1, 0), null, 'a thing passing wide touches nothing');
const ends = {};
for (let seed = 1; seed <= 12; seed++) {
  const ps = bd.run(pl, { give: 'plenty', world: 'steady' }, seed), px = bd.run(pl, { give: 'plenty', world: 'surprise' }, seed);
  const ls = bd.run(pl, { give: 'little', world: 'steady' }, seed), lx = bd.run(pl, { give: 'little', world: 'surprise' }, seed);
  assert.strictEqual(ps.trend, 'grow', 'plenty and steady: the reach grows (seed ' + seed + ', end ' + ps.end + ')');
  assert.strictEqual(ls.trend, 'shrink', 'little: the reach pulls in (seed ' + seed + ', end ' + ls.end + ')');
  assert.strictEqual(lx.trend, 'shrink', 'little and surprises: the reach pulls in (seed ' + seed + ', end ' + lx.end + ')');
  assert.ok(px.end < ps.end - 0.5, 'surprises: the same plenty buys a smaller reach (seed ' + seed + ': ' + px.end + ' against ' + ps.end + ')');
  assert.ok(px.gaps > ps.gaps + 5, 'surprises catch its predictions out far more often');
  assert.strictEqual(ps.bars.length, 24);
}
console.log('boundary  :', bd.run(pl, { give: 'plenty', world: 'steady' }, 1).say);
console.log('lab checks passed');
