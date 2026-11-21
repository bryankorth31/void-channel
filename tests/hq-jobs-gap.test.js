// HQ: a Publish that ended well is never shown as failed (Bryan, 21 Nov 2026: "fix the HQ publish timing slip").
// Run: node --test tests/hq-jobs-gap.test.js
// On a busy PC a job's process can be gone a moment before HQ runs its exit event. A look at the jobs in that gap used to
// mark the job finished with -1 (failed), so a good Publish read as a failed one. The same slip was fixed in the Hindi HQ
// (e84032944). Here a launched job's process is a stand-in that is never alive and exits only when the test says, which
// holds the gap open. No real job runs; HQ's state goes to a temporary folder.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const STATE = fs.mkdtempSync(path.join(os.tmpdir(), 'hq-gap-state-'));
process.env.HQ_STATE_DIR = STATE;

// Job launches are stubbed before hq.js loads (it takes spawn from child_process then): a detached scripts/<name>.js
// launch gets a stand-in child that never runs. Its number is one no process can hold (Windows uses multiples of 4).
const cp = require('node:child_process');
const realSpawn = cp.spawn;
const children = [];
cp.spawn = function (cmd, args, opts) {
  if (Array.isArray(args) && opts && opts.detached && /[\\/]scripts[\\/][\w-]+\.js$/.test(String(args[0]))) {
    if (Array.isArray(opts.stdio) && Number.isInteger(opts.stdio[1])) fs.closeSync(opts.stdio[1]);
    const child = new EventEmitter();
    child.pid = 999997;
    child.unref = () => {};
    children.push(child);
    return child;
  }
  return realSpawn.apply(this, arguments);
};
const HQ = require('../scripts/hq.js');
const { startJob, jobList } = HQ.jobs;
const { stopHqJob } = HQ.stop;
const find = (id) => jobList().find((x) => x.id === id);

test('a job whose process is gone but whose exit has not run yet is still running, not failed', () => {
  const job = startJob('publish', []);
  const child = children[children.length - 1];
  const gap = find(job.id);                       // the process is not alive, and its exit event has not run
  assert.equal(gap.running, true, 'still running');
  assert.equal(gap.code, null, 'not marked failed');
  child.emit('exit', 0);                          // now its own exit says how it ended
  const done = find(job.id);
  assert.equal(done.running, false);
  assert.equal(done.code, 0, 'a good publish ends with its real code 0');
});

test('Stop in the gap leaves the job to its own exit', () => {
  const job = startJob('publish', []);
  const child = children[children.length - 1];
  const r = stopHqJob(job, () => null);           // the process is already gone
  assert.equal(r.status, 200);
  assert.equal(r.body.stopped, false);
  assert.equal(job.done, null, 'not marked finished by Stop');
  child.emit('exit', 0);
  assert.equal(find(job.id).code, 0);
});

test('a job left from before an HQ restart is still marked finished (-1) once its process is gone', () => {
  const job = startJob('publish', []);
  const child = children[children.length - 1];
  child.emit('exit', 0);                          // HQ heard it: done with 0
  // A job record with no listener in this HQ (as after a restart) and a gone process: its code is unknown.
  const old = { ...job, id: 'old1', done: null, code: null };
  const list = jobList();
  assert.ok(list.length >= 1);
  assert.equal(HQ.jobs.jobOver(old), true, 'nobody is listening to it and its process is gone');
});

test('a start that fails finishes the job once, as failed', () => {
  const job = startJob('publish', []);
  const child = children[children.length - 1];
  child.emit('error', new Error('spawn failed'));
  child.emit('exit', 0);                          // a late exit after the error changes nothing
  assert.equal(find(job.id).code, -1);
});

test.after(() => {
  try { fs.rmSync(STATE, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); }
  catch (e) { if (e.code !== 'EPERM' && e.code !== 'EBUSY') throw e; }
});
