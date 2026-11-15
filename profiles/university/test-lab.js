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
console.log('lab checks passed');
