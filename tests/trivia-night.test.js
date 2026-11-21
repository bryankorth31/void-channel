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
