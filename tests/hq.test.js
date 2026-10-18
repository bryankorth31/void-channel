// HQ guard tests (audit findings CF-004 and CF-021). Run: node --test tests/hq.test.js
// Starts this checkout's scripts/hq.js as a child process on a free port in 8790-8799 (never 8780), talks to it over
// 127.0.0.1 only, and ends it by its own handle. Nothing here starts a job, opens a browser, touches a scheduled task,
// or reaches the network. The only processes ever stopped are the harmless sleepers these tests start themselves.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const HQ_FILE = path.join(ROOT, 'scripts', 'hq.js');
const WIN = process.platform === 'win32';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return false; } };

function canBind(port) {
  return new Promise((ok) => {
    const s = net.createServer();
    s.once('error', () => ok(false));
    s.listen(port, '127.0.0.1', () => s.close(() => ok(true)));
  });
}
async function freePort(not = []) {
  for (let p = 8790; p <= 8799; p++) if (!not.includes(p) && await canBind(p)) return p;
  throw new Error('no free port in 8790-8799');
}

function call(port, method, urlPath, { headers = {}, body } = {}) {
  return new Promise((ok, no) => {
    const data = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body);
    const sent = Object.fromEntries(Object.entries(headers).filter(([, v]) => v !== undefined)); // a header set to undefined means "leave it out"
    const req = http.request({ host: '127.0.0.1', port, path: urlPath, method, headers: { ...(data ? { 'content-length': Buffer.byteLength(data) } : {}), ...sent }, timeout: 15000 }, (res) => {
      let text = '';
      res.on('data', (c) => { text += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(text); } catch (e) { /* not json */ } ok({ status: res.statusCode, text, json }); });
    });
    req.on('error', no);
    req.on('timeout', () => req.destroy(new Error('timed out')));
    req.end(data);
  });
}

let hq = null, port = 0, token = '', hqOut = '', jobsAtStart = 0;

// A POST to /api/ping (does nothing) with whatever headers a case needs; defaults are a good call from HQ's own page.
const ping = (headers) => call(port, 'POST', '/api/ping', { body: {}, headers: { 'content-type': 'application/json', origin: `http://127.0.0.1:${port}`, 'x-hq-token': token, ...headers } });

before(async () => {
  port = await freePort();
  hq = spawn(process.execPath, [HQ_FILE, '--port', String(port)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  hq.stdout.on('data', (c) => { hqOut += c; });
  hq.stderr.on('data', (c) => { hqOut += c; });
  for (let i = 0; i < 100 && !/VOIDtv HQ at/.test(hqOut); i++) { if (hq.exitCode !== null) break; await wait(100); }
  assert.match(hqOut, /VOIDtv HQ at/, 'HQ test instance did not start: ' + hqOut.slice(0, 200));
  const page = await call(port, 'GET', '/');
  const m = /<meta name="hq-token" content="([0-9a-f]{64})">/.exec(page.text);
  assert.ok(m, 'the served page carries a 64 character hex token');
  token = m[1];
  jobsAtStart = (await call(port, 'GET', '/api/jobs')).json.jobs.length;
});

after(async () => {
  if (hq && hq.exitCode === null) { const gone = new Promise((r) => hq.once('exit', r)); hq.kill(); await gone; }
});

test('HQ test instance listens on a test port, not 8780', () => {
  assert.ok(port >= 8790 && port <= 8799);
});

test('the page HQ serves carries the token, the placeholder is gone, and the page sends it back', async () => {
  const page = await call(port, 'GET', '/');
  assert.equal(page.status, 200);
  assert.ok(!page.text.includes('__HQ_TOKEN__'));
  assert.ok(page.text.includes(`content="${token}"`));
  assert.ok(page.text.includes("'x-hq-token':HQ_TOKEN"), 'api() sends X-HQ-Token on every POST');
  assert.ok(!hqOut.includes(token), 'the token is not in the server log');
});

test('the token is new each start: it is 64 hex characters and not a fixed string', () => {
  assert.match(token, /^[0-9a-f]{64}$/);
  assert.notEqual(token, '0'.repeat(64));
});

test('403 for an Origin with the wrong port', async () => {
  for (const origin of ['http://127.0.0.1:1', `http://127.0.0.1:${port + 1}`, `http://localhost:${port + 1}`, 'http://127.0.0.1']) {
    const r = await ping({ origin });
    assert.equal(r.status, 403, origin);
  }
});

test('403 for an Origin that only looks local', async () => {
  for (const origin of ['null', 'file://', `https://127.0.0.1:${port}`, `http://127.0.0.1:${port}.evil.example`, `http://evil.example:${port}`, `http://localhost.evil.example:${port}`, '']) {
    const r = await ping({ origin });
    assert.equal(r.status, 403, JSON.stringify(origin));
  }
});

test('200 for HQ\'s own origin in each of its three spellings', async () => {
  for (const origin of [`http://127.0.0.1:${port}`, `http://localhost:${port}`, `http://[::1]:${port}`]) {
    const r = await ping({ origin });
    assert.equal(r.status, 200, origin);
  }
});

test('403 for a Host header that is not HQ\'s own address and port', async () => {
  for (const host of ['evil.example', 'evil.example:' + port, '127.0.0.1:1', '127.0.0.1', 'localhost', '127.0.0.1.evil.example:' + port]) {
    const r = await call(port, 'GET', '/api/jobs', { headers: { host } });
    assert.equal(r.status, 403, host);
  }
});

test('415 for Content-Type text/plain;x=application/json, even with the token', async () => {
  for (const type of ['text/plain;x=application/json', 'text/plain', 'application/jsonx', 'application/x-www-form-urlencoded', 'text/plain; application/json', '']) {
    const r = await ping({ 'content-type': type });
    assert.equal(r.status, 415, JSON.stringify(type));
  }
});

test('application/json with a charset or capital letters is accepted', async () => {
  for (const type of ['application/json; charset=utf-8', 'Application/JSON', ' application/json ;charset=UTF-8']) {
    const r = await ping({ 'content-type': type });
    assert.equal(r.status, 200, JSON.stringify(type));
  }
});

test('401 for a POST without the token, with a wrong token, and with a near miss', async () => {
  const noToken = await ping({ 'x-hq-token': undefined });
  assert.equal(noToken.status, 401);
  assert.match(noToken.json.error, /token/i);
  assert.equal((await ping({ 'x-hq-token': '' })).status, 401);
  assert.equal((await ping({ 'x-hq-token': 'abc' })).status, 401);
  assert.equal((await ping({ 'x-hq-token': token + '0' })).status, 401, 'one character too long');
  assert.equal((await ping({ 'x-hq-token': token.slice(0, -1) })).status, 401, 'one character too short');
  assert.equal((await ping({ 'x-hq-token': token.slice(0, -1) + (token.endsWith('0') ? '1' : '0') })).status, 401, 'last character changed');
});

test('200 for the same POST with the token', async () => {
  const r = await ping({});
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { ok: true });
});

test('the checks run in order: host, then origin, then media type, then token', async () => {
  const bad = { origin: 'http://127.0.0.1:1', 'content-type': 'text/plain', 'x-hq-token': undefined };
  assert.equal((await ping({ ...bad, host: 'evil.example' })).status, 403);
  assert.equal((await ping({ ...bad })).status, 403);
  assert.equal((await ping({ ...bad, origin: `http://127.0.0.1:${port}` })).status, 415);
  assert.equal((await ping({ ...bad, origin: `http://127.0.0.1:${port}`, 'content-type': 'application/json' })).status, 401);
});

test('every other method that changes things needs JSON and the token too', async () => {
  for (const method of ['PUT', 'DELETE', 'PATCH']) {
    assert.equal((await call(port, method, '/api/ping', { body: {}, headers: { 'content-type': 'text/plain' } })).status, 415, method);
    assert.equal((await call(port, method, '/api/ping', { body: {}, headers: { 'content-type': 'application/json' } })).status, 401, method);
  }
  const pre = await call(port, 'OPTIONS', '/api/ping', { headers: { origin: 'http://127.0.0.1:1', 'access-control-request-method': 'POST' } });
  assert.equal(pre.status, 403, 'a cross-origin preflight is refused');
});

test('GET /api/jobs still returns the job list shape', async () => {
  const r = await call(port, 'GET', '/api/jobs');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.json.jobs));
  assert.ok(Array.isArray(r.json.processes));
  for (const j of r.json.jobs) {
    assert.equal(typeof j.id, 'string');
    assert.equal(typeof j.name, 'string');
    assert.equal(typeof j.running, 'boolean');
    assert.ok('pid' in j && 'started' in j && 'log' in j && 'tail' in j);
  }
  for (const p of r.json.processes) assert.ok('pid' in p && 'cmd' in p && 'started' in p && typeof p.ours === 'boolean');
  assert.equal(r.json.jobs.length, jobsAtStart, 'the test instance started no job');
  assert.ok(r.json.processes.every((p) => p.ours === false || r.json.jobs.some((j) => j.pid === p.pid && !j.done)), 'a process is marked as HQ\'s only when it is one of HQ\'s open jobs');
});

test('/api/probe obeys the same rules (no wildcard CORS, token on POST)', async () => {
  const noToken = await call(port, 'POST', '/api/probe', { body: { x: 1 }, headers: { 'content-type': 'application/json', origin: `http://127.0.0.1:${port}` } });
  assert.equal(noToken.status, 401);
  const otherPort = await call(port, 'POST', '/api/probe', { body: { x: 1 }, headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:1', 'x-hq-token': token } });
  assert.equal(otherPort.status, 403);
  const pre = await call(port, 'OPTIONS', '/api/probe', { headers: { origin: 'http://127.0.0.1:1' } });
  assert.ok(!pre.text.includes('access-control'));
});

test('POST /api/jobs/<unknown>/stop is a 404 and starts nothing', async () => {
  const stop = await call(port, 'POST', '/api/jobs/nosuchjob/stop', { body: {}, headers: { 'content-type': 'application/json', origin: `http://127.0.0.1:${port}`, 'x-hq-token': token } });
  assert.equal(stop.status, 404);
});

test('POST /api/processes/stop with a pid HQ did not start is refused (409) and nothing is killed', { skip: !WIN && 'Windows only' }, async () => {
  const sleeper = spawn(process.execPath, ['-e', 'setTimeout(()=>{},60000)', 'C:\\fake\\scripts\\hunt.js'], { stdio: 'ignore', windowsHide: true });
  try {
    await wait(300);
    assert.ok(alive(sleeper.pid));
    const headers = { 'content-type': 'application/json', origin: `http://127.0.0.1:${port}`, 'x-hq-token': token };
    for (const pid of [sleeper.pid, hq.pid, process.pid, 4, 0, -1, String(sleeper.pid), null, undefined]) {
      const r = await call(port, 'POST', '/api/processes/stop', { body: pid === undefined ? {} : { pid }, headers });
      assert.equal(r.status, 409, 'pid ' + JSON.stringify(pid));
      assert.match(r.json.error, /only jobs it started/);
    }
    assert.ok(alive(sleeper.pid), 'the sleeper was not killed');
    assert.ok(alive(hq.pid), 'HQ itself was not killed');
    assert.ok(alive(process.pid));
  } finally {
    sleeper.kill();
  }
});

// ---- the stop logic itself, against sleepers this test starts and ends -----------------------------------------

test('stop: a job whose process is still the one HQ launched is stopped, and only that process', { skip: !WIN && 'Windows only' }, async () => {
  const { stopHqJob, processInfo } = require(HQ_FILE).stop;
  const target = spawn(process.execPath, ['-e', 'setTimeout(()=>{},60000)', 'C:\\fake\\scripts\\hunt.js'], { stdio: 'ignore', windowsHide: true });
  const bystander = spawn(process.execPath, ['-e', 'setTimeout(()=>{},60000)', 'C:\\fake\\scripts\\hunt.js'], { stdio: 'ignore', windowsHide: true });
  try {
    await wait(500);
    const info = processInfo(target.pid);
    assert.ok(info && /scripts[\\/]hunt\.js/.test(info.cmd), 'the live command line is readable');
    assert.match(info.created, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
    const job = { id: 't1', name: 'hunt', args: [], pid: target.pid, started: new Date().toISOString(), pstart: info.created, done: null, code: null };
    const r = stopHqJob(job);
    assert.equal(r.status, 200);
    assert.equal(r.body.stopped, true);
    await wait(400);
    assert.ok(!alive(target.pid), 'the job process is gone');
    assert.ok(alive(bystander.pid), 'the other process with the same script name is untouched');
  } finally {
    target.kill(); bystander.kill();
  }
});

test('stop: refused (409, nothing killed) when the start time, the script or HQ itself does not match', { skip: !WIN && 'Windows only' }, async () => {
  const { stopHqJob, processInfo } = require(HQ_FILE).stop;
  const sleeper = spawn(process.execPath, ['-e', 'setTimeout(()=>{},60000)', 'C:\\fake\\scripts\\hunt.js'], { stdio: 'ignore', windowsHide: true });
  const realLog = console.log; const lines = [];
  try {
    await wait(500);
    const info = processInfo(sleeper.pid);
    const base = { id: 't2', name: 'hunt', args: [], pid: sleeper.pid, started: new Date().toISOString(), pstart: info.created, done: null, code: null };
    console.log = (...a) => lines.push(a.join(' '));
    const cases = [
      ['start time differs (a recycled number)', { ...base, pstart: '2020-01-01T00:00:00.000Z' }],
      ['another script name (hunt.js is not match.js)', { ...base, name: 'match' }],
      ['a name that is only a prefix (hunt is not hunt-movies)', { ...base, name: 'hunt-movies' }],
      ['an older job with no stored time, launched long ago', { ...base, pstart: null, started: '2020-01-01T00:00:00.000Z' }],
      ['a stored time that is not a time', { ...base, pstart: 'soon' }],
    ];
    for (const [why, job] of cases) {
      const r = stopHqJob(job);
      assert.equal(r.status, 409, why);
      assert.equal(job.done !== null, true, why + ': the replaced job is marked finished');
      assert.ok(alive(sleeper.pid), why + ': nothing was killed');
    }
    assert.equal(lines.length, cases.length, 'one console line per refusal');
    for (const l of lines) assert.match(l, /^HQ stop refused: process \d+ is not job t2/);
    const self = stopHqJob({ ...base, pid: process.pid });
    assert.equal(self.status, 409);
    assert.ok(alive(process.pid));
  } finally {
    console.log = realLog;
    sleeper.kill();
  }
});

test('stop: an older job with no stored time still passes when the process was created right after the launch stamp', { skip: !WIN && 'Windows only' }, async () => {
  const { stopHqJob, processInfo } = require(HQ_FILE).stop;
  const sleeper = spawn(process.execPath, ['-e', 'setTimeout(()=>{},60000)', 'C:\\fake\\scripts\\hunt.js'], { stdio: 'ignore', windowsHide: true });
  try {
    await wait(500);
    const info = processInfo(sleeper.pid);
    const job = { id: 't3', name: 'hunt', args: [], pid: sleeper.pid, started: new Date(Date.parse(info.created) + 900).toISOString(), pstart: null, done: null, code: null };
    const r = stopHqJob(job);
    assert.equal(r.status, 200);
    assert.equal(r.body.stopped, true);
    await wait(400);
    assert.ok(!alive(sleeper.pid));
  } finally {
    sleeper.kill();
  }
});

test('stop: a job whose process has already ended is marked finished and nothing is killed', { skip: !WIN && 'Windows only' }, async () => {
  const { stopHqJob } = require(HQ_FILE).stop;
  const quick = spawn(process.execPath, ['-e', '0', 'C:\\fake\\scripts\\hunt.js'], { stdio: 'ignore', windowsHide: true });
  await new Promise((r) => quick.once('exit', r));
  await wait(200);
  const job = { id: 't4', name: 'hunt', args: [], pid: quick.pid, started: new Date().toISOString(), pstart: '2026-01-01T00:00:00.000Z', done: null, code: null };
  const r = stopHqJob(job);
  assert.equal(r.status, 200);
  assert.equal(r.body.stopped, false);
  assert.ok(job.done);
  const again = stopHqJob(job);
  assert.equal(again.body.stopped, false);
  assert.equal(again.changed, undefined);
});

test('stop: a process that cannot be read is not stopped', () => {
  const { stopHqJob } = require(HQ_FILE).stop;
  const realLog = console.log; console.log = () => {};
  try {
    const job = { id: 't5', name: 'hunt', args: [], pid: 999999, started: new Date().toISOString(), pstart: null, done: null, code: null };
    const r = stopHqJob(job, () => { throw new Error('powershell is not available'); });
    assert.equal(r.status, 409);
    assert.equal(job.done, null, 'a job that could not be checked is left as it was');
  } finally {
    console.log = realLog;
  }
});

test('stop: the command line match is exact on the script name', () => {
  const { scriptRe } = require(HQ_FILE).stop;
  assert.ok(scriptRe('hunt').test('"C:\\node\\node.exe" C:\\Users\\bryan\\void-channel\\scripts\\hunt.js --pause 3'));
  assert.ok(scriptRe('hunt').test('node.exe C:/Users/bryan/void-channel/scripts/hunt.js'));
  assert.ok(!scriptRe('hunt').test('node.exe C:\\x\\scripts\\hunt-movies.js'));
  assert.ok(!scriptRe('hunt').test('node.exe C:\\x\\scripts\\myhunt.js'));
  assert.ok(!scriptRe('hunt').test('node.exe C:\\x\\scripts\\hunt.json'));
  assert.ok(!scriptRe('hunt').test('Code.exe C:\\x\\notes\\hunt.js'));
  assert.ok(!scriptRe('match').test('node.exe C:\\x\\scripts\\hunt.js --slug match'));
});

// ---- the doctor's probe (scripts/lib/hqcheck.js) ---------------------------------------------------------------

test('hqcheck.probe passes against this HQ', async () => {
  const { probe } = require('../scripts/lib/hqcheck');
  const r = await probe(port);
  assert.equal(r.ok, true, r.detail);
  assert.match(r.detail, /403.*415.*401/);
});

test('hqcheck.probe reports nothing listening as down, not as a pass', async () => {
  const { probe } = require('../scripts/lib/hqcheck');
  const idle = await freePort([port]);
  const r = await probe(idle);
  assert.equal(r.ok, false);
  assert.equal(r.down, true);
  assert.deepEqual(await probe('abc'), { ok: false, detail: 'not a port: NaN' });
});

test('hqcheck.probe fails against a server that lets a call through (the old HQ checks)', async () => {
  const { probe } = require('../scripts/lib/hqcheck');
  const local = (h) => /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(h);
  const old = http.createServer((req, res) => { // the pre-fix guards: any local port, substring JSON check, no token
    const origin = req.headers.origin || '';
    if (origin && !local(origin.replace(/^https?:\/\//, ''))) { res.writeHead(403); return res.end('{}'); }
    if (req.method === 'POST' && !/application\/json/i.test(req.headers['content-type'] || '')) { res.writeHead(415); return res.end('{}'); }
    res.writeHead(200); res.end('{"ok":true}');
  });
  const p = await freePort([port]);
  await new Promise((ok) => old.listen(p, '127.0.0.1', ok));
  try {
    const r = await probe(p);
    assert.equal(r.ok, false);
    assert.match(r.detail, /another port got 200, wanted 403/);
    assert.match(r.detail, /text\/plain body got 200, wanted 415/);
    assert.match(r.detail, /without the token got 200, wanted 401/);
  } finally {
    await new Promise((ok) => old.close(ok));
  }
});

test('hqcheck.probe fails against an HQ that has no /api/ping (started before the fix)', async () => {
  const { probe } = require('../scripts/lib/hqcheck');
  const notFound = http.createServer((req, res) => { res.writeHead(404); res.end('{}'); });
  const p = await freePort([port]);
  await new Promise((ok) => notFound.listen(p, '127.0.0.1', ok));
  try {
    const r = await probe(p);
    assert.equal(r.ok, false);
    assert.match(r.detail, /got 404/);
  } finally {
    await new Promise((ok) => notFound.close(ok));
  }
});
