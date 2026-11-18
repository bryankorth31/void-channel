// The Kids area's show list (scripts/lib/kidshq.js; docs/PLAN-hq-areas.md K1). Runs on a copy in a temp folder, never on
// profiles/kids itself.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'kidshq-'));
fs.mkdirSync(path.join(DIR, 'catalog', 'shows'), { recursive: true });
const LIST = {
  types: ['Little Kids', 'Nature'],
  held: { reason: 'waits for Bryan', shows: ['Held Show'] },
  shows: [
    { name: 'Playing Show', type: 'Little Kids', approved: true, tvmaze: 1 },
    { name: 'Empty Show', type: 'Nature', approved: true, tvmaze: 2 },
    { name: 'No Guide Show', type: 'Nature', approved: true },
    { name: 'Waiting Show', type: 'Little Kids', approved: false, tvmaze: 4 },
    { name: 'Denied Show', type: 'Little Kids', approved: false, denied: true, tvmaze: 5 },
  ],
};
fs.writeFileSync(path.join(DIR, 'list.json'), JSON.stringify(LIST));
fs.writeFileSync(path.join(DIR, 'catalog', 'shows', 'playing-show.json'), JSON.stringify({ coverage: { total: 20, live: 12 } }));
fs.writeFileSync(path.join(DIR, 'catalog', 'strict-report.json'), JSON.stringify({ noCandidates: [], shows: { 'Empty Show': { kept: 0, files: 40, rejected: { runtime: 30, words: 10 } } } }));
process.env.KIDS_DIR = DIR;
const K = require('../scripts/lib/kidshq');
const read = () => JSON.parse(fs.readFileSync(path.join(DIR, 'list.json'), 'utf8'));

test('the counts and, for an approved show with no episodes, the reason in plain words', () => {
  const r = K.shows();
  assert.deepEqual(r.counts, { all: 5, approved: 3, denied: 1, waiting: 1, approvedEmpty: 2, playing: 1 });
  const by = Object.fromEntries(r.shows.map((s) => [s.name, s]));
  assert.equal(by['Playing Show'].live, 12);
  assert.equal(by['Playing Show'].reason, undefined);
  assert.match(by['Empty Show'].reason, /0 of 40 Archive files kept.*30 files too short or too long/);
  assert.match(by['No Guide Show'].reason, /No TVmaze episode list/);
});

test('approve, deny and undo write the same fields approve.js writes, after a dated backup', () => {
  K.decide('Waiting Show', 'approve');
  let s = read().shows.find((x) => x.name === 'Waiting Show');
  assert.equal(s.approved, true); assert.equal(s.denied, undefined); assert.match(s.reviewedAt, /^\d{4}-\d\d-\d\d$/);
  assert.ok(fs.readdirSync(DIR).some((f) => /^list\.before-hq-\d{4}-\d\d-\d\d\.json$/.test(f)), 'a backup was kept');
  K.decide('waiting-show', 'deny', 'not for kids');
  s = read().shows.find((x) => x.name === 'Waiting Show');
  assert.equal(s.approved, false); assert.equal(s.denied, true); assert.equal(s.reviewNote, 'not for kids');
  K.decide('Waiting Show', 'clear');
  s = read().shows.find((x) => x.name === 'Waiting Show');
  assert.equal(s.approved, false); assert.equal(s.denied, undefined);
  assert.throws(() => K.decide('Nobody', 'approve'), /No kids show/);
  assert.throws(() => K.decide('Waiting Show', 'delete'), /approve, deny or clear/);
});

test('add puts a show on the list approved and marked addedInHq; a repeat, a bad row or a bad year is refused', () => {
  const r = K.add({ name: "Today's Special", type: 'Little Kids', year: '1981', network: 'TVOntario', tvmaze: '' });
  assert.equal(r.slug, 'todays-special');
  const s = read().shows.find((x) => x.name === "Today's Special");
  assert.equal(s.approved, true); assert.match(s.addedInHq, /^\d{4}/); assert.equal(s.year, 1981); assert.equal(s.tvmaze, undefined);
  assert.throws(() => K.add({ name: 'Todays Special', type: 'Little Kids' }), /already on the kids list/);
  assert.throws(() => K.add({ name: 'New One', type: 'Cartoons' }), /Pick a row/);
  assert.throws(() => K.add({ name: 'New One', type: 'Nature', year: '85' }), /year/);
  assert.throws(() => K.add({ name: '', type: 'Nature' }), /name/);
});
