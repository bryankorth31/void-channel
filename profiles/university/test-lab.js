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
console.log('lab checks passed');
