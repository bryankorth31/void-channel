// Tests for scripts/lib/worklight.js: the doctor lights that ask whether the nightly pass did any work (B, 15 Nov 2026).
// Run: node --test tests/work-lights.test.js. Pure: made-up log text and commit rows, nothing on disk.
const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../scripts/lib/worklight');

const night = (day, hunt, extra = '') => [
  `2026-11-${day}T08:30:01.000Z ==== nightly start`,
  `2026-11-${day}T08:30:02.000Z -- hunt: node scripts/hunt.js --priority`,
  `2026-11-${day}T08:34:11.000Z    hunt ${hunt}`,
  `2026-11-${day}T08:34:12.000Z    movies ok in 0 min :: 0 titles to hunt (min votes 20) |  | Done. 0 Archive calls.`,
  extra,
  `2026-11-${day}T08:44:58.000Z ==== nightly done`,
].filter(Boolean).join('\n');
const IDLE_HUNT = 'ok in 4 min ::    !! Seirei Gensouki: Cannot read properties of null (reading \'title\') |  | Done. 0 Archive calls. Summary in docs/HUNT.md';
const BUSY_HUNT = 'ok in 200 min :: Budget spent; stopping. | Done. 6000 Archive calls.';

test('parseNights splits the log into runs and reads each step line', () => {
  const runs = W.parseNights('junk before\n' + night(13, IDLE_HUNT) + '\n' + night(14, BUSY_HUNT));
  assert.equal(runs.length, 2);
  assert.equal(runs[0].steps.hunt.ok, true);
  assert.match(runs[1].steps.hunt.text, /6000 Archive calls/);
  assert.ok(runs[0].steps.movies);
});

test('work:idle turns yellow after three nights with nothing to hunt, and names both hunts', () => {
  const two = W.parseNights([night(13, IDLE_HUNT), night(14, IDLE_HUNT)].join('\n'));
  assert.equal(W.idleLight(two).level, 'green');
  const three = W.parseNights([night(13, IDLE_HUNT), night(14, IDLE_HUNT), night(15, IDLE_HUNT)].join('\n'));
  const l = W.idleLight(three);
  assert.equal(l.level, 'yellow');
  assert.match(l.msg, /show hunt had nothing to do 3 nights/);
  assert.match(l.msg, /TV-movie hunt/);
  assert.match(l.fix, /HQ > Add shows/);
});

test('work:idle stays green when the latest night did real work, or when the hunts were skipped', () => {
  const busy = W.parseNights([night(12, IDLE_HUNT), night(13, IDLE_HUNT), night(14, IDLE_HUNT), night(15, BUSY_HUNT)].join('\n'));
  assert.ok(!/show hunt/.test(W.idleLight(busy).msg));
  const skipped = W.parseNights([night(12, IDLE_HUNT), night(13, IDLE_HUNT),
    '2026-11-14T08:30:01.000Z ==== nightly start\n2026-11-14T08:30:02.000Z    1 hunt process(es) already running; skipping the hunt steps tonight\n2026-11-14T08:40:00.000Z ==== nightly done'].join('\n'));
  assert.equal(W.idleLight(skipped).level, 'green');
});

test('work:repeat finds one error back on each of the last three nights, whatever the minutes', () => {
  const runs = W.parseNights([night(13, IDLE_HUNT), night(14, IDLE_HUNT.replace('in 4 min', 'in 5 min')), night(15, IDLE_HUNT)].join('\n'));
  const l = W.repeatLight(runs);
  assert.equal(l.level, 'yellow');
  assert.match(l.msg, /Seirei Gensouki/);
  assert.match(l.msg, /for 3 nights/);
  const gone = W.parseNights([night(13, IDLE_HUNT), night(14, IDLE_HUNT), night(15, BUSY_HUNT)].join('\n'));
  assert.equal(W.repeatLight(gone).level, 'green');
});

test('work:repeat also catches a step that FAILED the same way each night', () => {
  const fail = (d) => night(d, BUSY_HUNT, `2026-11-${d}T08:40:00.000Z    art FAILED (exit 1) in 0 min :: TMDB said 401`);
  const l = W.repeatLight(W.parseNights([fail(13), fail(14), fail(15)].join('\n')));
  assert.equal(l.level, 'yellow');
  assert.match(l.msg, /art FAILED/);
});

test('growth turns yellow when the library has kept one size for seven days', () => {
  const day = (d) => Date.parse(`2026-11-${String(d).padStart(2, '0')}T08:44:00Z`);
  const rows = [
    { at: day(1), subject: 'Catalog: 5010 shows, 56866 episodes (311 files)' },
    ...[2, 5, 8, 11, 14].map((d) => ({ at: day(d), subject: 'Catalog: 4245 shows, 71883 episodes (4 files)' })),
  ];
  const l = W.growthLight(rows, day(15));
  assert.equal(l.level, 'yellow');
  assert.match(l.msg, /4245 shows and 71883 episodes for 13 days/);
  assert.match(l.msg, /since 2026-11-02/);
  assert.equal(W.growthLight(rows, day(8)).level, 'green', 'six days is not yet a stall');
  assert.equal(W.growthLight([], day(15)).level, 'green');
  assert.equal(W.growthLight([{ at: day(14), subject: 'Void University: a course' }], day(15)).level, 'green', 'only Catalog commits count');
});
