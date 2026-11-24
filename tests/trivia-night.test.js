// Trivia Nights: the night jobs on this PC (scripts/trivia/night.js; Bryan, 20 Nov 2026: "create jobs for my local machine to do
// in pursuit of digesting the internet archive and creating a trivia machine from it"). Run: node --test tests/trivia-night.test.js
// The rules that keep a night safe: weekly jobs wait a week, the graphics card is only taken when free, the question bank is only
// rebuilt when the checks before it passed. Nothing is run or fetched here.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const N = require('../scripts/trivia/night');

test('options: defaults, --only keeps known jobs, numbers have floors', () => {
  const o = N.options([]);
  assert.deepEqual([o.dry, o.force, o.only, o.shows, o.eps, o.whisperMinutes], [false, false, null, 10, 3, 180]);
  assert.deepEqual(N.options(['--only', 'bank,nonsense,moments']).only, ['bank', 'moments']);
  assert.equal(N.options(['--whisper-minutes', '2']).whisperMinutes, 10);
  assert.equal(N.options(['--shows', 'x']).shows, 10);
});

test('a weekly job is due when its file is a week old or missing, or the night is forced', () => {
  const f = path.join(os.tmpdir(), 'trivia-night-due-' + process.pid + '.json');
  fs.writeFileSync(f, '{}');
  const now = Date.now();
  assert.equal(N.due(f, now, false), false);
  assert.equal(N.due(f, now + 8 * 864e5, false), true);
  assert.equal(N.due(f, now, true), true);
  assert.equal(N.due(f + '.missing', now, false), true);
  fs.unlinkSync(f);
});

test('the graphics card: free unless another job holds it in studio mode and its time is not up', () => {
  const now = Date.now();
  assert.equal(N.cardFree(null, now), true);
  assert.equal(N.cardFree({ mode: 'quiet' }, now), true);
  assert.equal(N.cardFree({ mode: 'security' }, now), true);
  assert.equal(N.cardFree({ mode: 'studio', by: 'lowcellys-lora', until: now / 1000 + 600 }, now), false);
  assert.equal(N.cardFree({ mode: 'studio', by: 'lowcellys-lora', until: now / 1000 - 600 }, now), true, 'its time ran out');
  assert.equal(N.cardFree({ mode: 'studio', by: N.TAG, until: now / 1000 + 600 }, now), true, 'our own claim');
});

test('the bank is rebuilt only when the transcript and moment checks did not fail', () => {
  assert.equal(N.bankAllowed({ timed: { status: 'failed' } }), true, 'the timed questions stand apart from the bank');
  assert.equal(N.bankAllowed({}), true);
  assert.equal(N.bankAllowed({ transcripts: { status: 'ok' }, moments: { status: 'ok' } }), true);
  assert.equal(N.bankAllowed({ moments: { status: 'failed' } }), false);
  assert.equal(N.bankAllowed({ transcripts: { status: 'failed' } }), false);
  assert.equal(N.bankAllowed({ whisper: { status: 'failed' } }), true, 'a Whisper night that failed leaves the bank to rebuild from what checked out');
});

test('the night runs the tools it names, in order, and claims and releases the card around Whisper', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'trivia', 'night.js'), 'utf8');
  assert.deepEqual(N.JOBS, ['fame', 'pool', 'queue', 'whisper', 'transcripts', 'moments', 'timed', 'bank']);
  // The runner names each tool it runs. It does not need them all in this copy: the transcript tools are the clip chat's and
  // may not be committed yet, and a night with a tool missing logs that job as failed and goes on (a clean copy must still pass).
  for (const f of ['fame.js', 'pool.js', 'transcripts.js', 'whisper_lines.py', 'moments.js', 'timed.js', 'bank.js']) assert.ok(src.includes('scripts/trivia/' + f), f);
  assert.match(src, /'--set', 'studio', '--by', TAG/);
  assert.match(src, /finally \{ log\('   release: '/);
  assert.match(src, /scripts\/trivia\/fame\.js'\)\], 120, \[0, 3\]\)/, 'fame.js exit 3 (some page views still to come) counts as done');
  assert.ok(!/[\u2013\u2014]/.test(src));
});

// Night job order (Bryan, 24 Nov 2026: "Night job order", "By itself each morning"): the long work at night, the bank in the
// morning after the catalog night, so the bank is made from and checked against the catalog the site uses that day.
test('two parts: the night does the long work, the morning makes the bank; --only still picks jobs by name', () => {
  assert.deepEqual(N.jobsFor(N.options([])), ['fame', 'pool', 'queue', 'whisper']);
  assert.deepEqual(N.jobsFor(N.options(['--morning'])), ['transcripts', 'moments', 'timed', 'bank']);
  assert.deepEqual(N.jobsFor(N.options(['--only', 'bank'])), ['bank']);
  assert.deepEqual([...N.NIGHT, ...N.MORNING], N.JOBS, 'every job is in one part, in the old order');
  const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'trivia', 'morning.js'), 'utf8');
  assert.match(src, /process\.argv\.push\('--morning'\)/);
  assert.match(src, /require\('\.\/night'\)\.main\(\)/);
  assert.ok(!/[\u2013\u2014]/.test(src));
});

test('the morning waits while the catalog night is running: a start with no done after it, under six hours old', () => {
  const at = (iso, m) => iso + ' ' + m;
  const now = Date.parse('2026-11-25T09:40:00.000Z');
  const running = [at('2026-11-24T09:09:04.601Z', '==== nightly done'), at('2026-11-25T08:30:01.606Z', '==== nightly start'), at('2026-11-25T08:31:00.000Z', '-- hunt: node x')].join('\n');
  assert.equal(N.catalogBusy(running, now), true);
  assert.equal(N.catalogBusy(running + '\n' + at('2026-11-25T09:09:00.000Z', '==== nightly done'), now), false);
  assert.equal(N.catalogBusy(running, now + 7 * 3600e3), false, 'a start with no end, seven hours old, died; it does not hold the morning');
  assert.equal(N.catalogBusy('', now), false);
  assert.equal(N.catalogBusy(null, now), false);
});

// The gate for the hourly publish (scripts/trivia/gate.js): written by the morning run, read by publish.
test('the gate opens only when the bank passed and the timed questions did not fail', () => {
  assert.equal(N.gateWhy({ bank: { status: 'ok' } }), '');
  assert.equal(N.gateWhy({ bank: { status: 'ok' }, timed: { status: 'ok' } }), '');
  assert.equal(N.gateWhy({ bank: { status: 'ok' }, timed: { status: 'skipped' } }), '');
  assert.match(N.gateWhy({ bank: { status: 'ok' }, timed: { status: 'failed' } }), /timed questions did not pass/);
  assert.match(N.gateWhy({ bank: { status: 'failed' } }), /bank did not pass/);
  assert.match(N.gateWhy({ bank: { status: 'skipped', why: 'a check before it failed' } }), /bank was skipped \(a check before it failed\)/);
  assert.match(N.gateWhy({}), /bank did not run/);
});

test('the gate: today, passed, and every bank and timed file hashing the same, or it stays shut and says why', () => {
  const G = require('../scripts/trivia/gate');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trivia-gate-'));
  const put = (rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };
  put('trivia/bank/index.json', JSON.stringify({ total: 2 }));
  put('trivia/bank/shows/a.json', '[]');
  put('trivia/timed/index.json', '{"shows":{}}');
  const now = Date.now();
  assert.match(G.check(root, now).why, /no trivia gate/);
  const g = G.write(root, now, true);
  assert.deepEqual(Object.keys(g.files).sort(), ['trivia/bank/index.json', 'trivia/bank/shows/a.json', 'trivia/timed/index.json']);
  assert.equal(g.questions, 2);
  assert.deepEqual(G.check(root, now), { open: true, why: '', questions: 2 });
  assert.match(G.check(root, now + 2 * 864e5).why, /not today/);
  put('trivia/bank/shows/a.json', '[1]');
  assert.match(G.check(root, now).why, /trivia\/bank\/shows\/a\.json changed after/);
  G.write(root, now, true);
  put('trivia/bank/shows/b.json', '[]');
  assert.match(G.check(root, now).why, /b\.json was added after/);
  fs.rmSync(path.join(root, 'trivia/bank/shows/b.json'));
  fs.rmSync(path.join(root, 'trivia/timed/index.json'));
  assert.match(G.check(root, now).why, /trivia\/timed\/index\.json is gone/);
  G.write(root, now, false, 'the bank did not pass');
  assert.match(G.check(root, now).why, /did not pass \(the bank did not pass\)/);
  const night = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'trivia', 'night.js'), 'utf8');
  assert.match(night, /require\('\.\/gate'\)\.write\(ROOT, Date\.now\(\), !why, why\)/, 'the morning run writes the gate');
  for (const f of ['gate.js']) assert.ok(!/[–—]/.test(fs.readFileSync(path.join(__dirname, '..', 'scripts', 'trivia', f), 'utf8')));
  const cmd = fs.readFileSync(path.join(__dirname, '..', 'TRIVIA-MORNING.cmd'), 'utf8');
  assert.match(cmd, /node scripts\\trivia\\morning\.js/, 'the morning can be run by hand, without AI');
  fs.rmSync(root, { recursive: true, force: true });
});
