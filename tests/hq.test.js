// HQ guard tests (audit findings CF-004 and CF-021). Run: node --test tests/hq.test.js
// Starts this checkout's scripts/hq.js as a child process on a free port in 8790-8799 (never 8780), talks to it over
// 127.0.0.1 only, and ends it by its own handle. Nothing here starts a job, opens a browser, touches a scheduled task,
// or reaches the network. The only processes ever stopped are the harmless sleepers these tests start themselves.
// HQ's state (jobs list, job logs, probe lines) goes to a temporary folder through HQ_STATE_DIR, made with fs.mkdtempSync and
// removed at the end, so running this file never touches catalog/cache. The first jobs-list entries are seeded there, as if
// an earlier HQ run had left them, to test Stop on jobs "reloaded after a restart" without starting a real job.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const HQ_FILE = path.join(ROOT, 'scripts', 'hq.js');
const WIN = process.platform === 'win32';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return false; } };

// Set before hq.js is ever required in this process, and inherited by the HQ child: HQ keeps its state here.
const STATE = fs.mkdtempSync(path.join(os.tmpdir(), 'hq-test-state-'));
process.env.HQ_STATE_DIR = STATE;
const REAL_CACHE = path.join(ROOT, 'catalog', 'cache');
const readOrNull = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch (e) { return null; } };
const realBefore = { existed: fs.existsSync(REAL_CACHE), probe: readOrNull(path.join(REAL_CACHE, 'probe.jsonl')) };

// Job launches are stubbed in THIS process, before hq.js is first required here: hq.js takes `spawn` from child_process when it
// loads, so it gets this wrapper. A call that launches a builder script (detached, scripts/<name>.js) is recorded and answered
// with a fake child that never runs; every other call goes to the real spawn. The HQ child process started further down is a
// separate process and is not affected. Used by the publish-flag test, which needs a real POST /api/jobs but must not run a job.
const cp = require('node:child_process');
const realSpawn = cp.spawn;
const jobLaunches = [];
cp.spawn = function (cmd, args, opts) {
  if (Array.isArray(args) && opts && opts.detached && /[\\/]scripts[\\/][\w-]+\.js$/.test(String(args[0]))) {
    jobLaunches.push({ cmd, script: args[0], args: args.slice(1) });
    if (Array.isArray(opts.stdio) && Number.isInteger(opts.stdio[1])) fs.closeSync(opts.stdio[1]); // the log handle HQ opened for the child
    const fake = new (require('node:events'))();
    fake.pid = 999997; // not a number any process can hold (Windows process numbers are multiples of 4)
    fake.unref = () => {};
    return fake;
  }
  return realSpawn.apply(this, arguments);
};

// A harmless node process whose command line names a builder script (as the nightly's children do) but which only sleeps.
// The script is art.js on purpose: HQ lists and stops it, but scripts/doctor.js (jobs light) and scripts/nightly.js (two Archive
// jobs at once) count only hunt.js, hunt-movies.js and scout.js, so a sleeper left running during a real doctor or nightly pass
// can never look like an Archive job.
const kids = [];
const fixture = (script = 'C:\\fake\\scripts\\art.js') => { const k = spawn(process.execPath, ['-e', 'setTimeout(()=>{},60000)', ...(script ? [script] : [])], { stdio: 'ignore', windowsHide: true }); kids.push(k); return k; };

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

let hq = null, port = 0, token = '', hqOut = '';
let seed = {}; // the sleepers behind the seeded jobs: good1, good2, stale, and dead (a pid that has already exited)

// A POST to /api/ping (does nothing) with whatever headers a case needs; defaults are a good call from HQ's own page.
const ping = (headers) => call(port, 'POST', '/api/ping', { body: {}, headers: { 'content-type': 'application/json', origin: `http://127.0.0.1:${port}`, 'x-hq-token': token, ...headers } });

before(async () => {
  port = await freePort();
  // Seed the jobs file HQ will load, as an earlier HQ run would have left it.
  const { processInfo } = require(HQ_FILE).stop;
  seed = { good1: fixture(), good2: fixture(), stale: fixture() };
  await wait(600);
  const dead = spawn(process.execPath, ['-e', '0', 'C:\\fake\\scripts\\art.js'], { stdio: 'ignore', windowsHide: true });
  await new Promise((r) => dead.once('exit', r));
  seed.dead = dead;
  const rec = (id, pid, pstart) => ({ id, name: 'art', args: [], pid, started: new Date().toISOString(), pstart, log: path.join(STATE, id + '.log'), done: null, code: null });
  fs.writeFileSync(path.join(STATE, 'hq-jobs.json'), JSON.stringify([
    rec('seedgood1', seed.good1.pid, processInfo(seed.good1.pid).created),
    rec('seedgood2', seed.good2.pid, processInfo(seed.good2.pid).created),
    rec('seedstale', seed.stale.pid, '2020-01-01T00:00:00.000Z'), // a recycled number: the stored start time is not this process's
    rec('seeddead', dead.pid, '2020-01-01T00:00:00.000Z'),        // its process is gone
  ]));
  hq = spawn(process.execPath, [HQ_FILE, '--port', String(port)], { cwd: ROOT, env: { ...process.env, HQ_STATE_DIR: STATE }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  hq.stdout.on('data', (c) => { hqOut += c; });
  hq.stderr.on('data', (c) => { hqOut += c; });
  for (let i = 0; i < 100 && !/VOIDtv HQ at/.test(hqOut); i++) { if (hq.exitCode !== null) break; await wait(100); }
  assert.match(hqOut, /VOIDtv HQ at/, 'HQ test instance did not start: ' + hqOut.slice(0, 200));
  const page = await call(port, 'GET', '/');
  const m = /<meta name="hq-token" content="([0-9a-f]{64})">/.exec(page.text);
  assert.ok(m, 'the served page carries a 64 character hex token');
  token = m[1];
});

after(async () => {
  if (hq && hq.exitCode === null) { const gone = new Promise((r) => hq.once('exit', r)); hq.kill(); await gone; }
  for (const k of kids) if (k.exitCode === null) k.kill(); // only the sleepers this file started, by their own handles
  fs.rmSync(STATE, { recursive: true, force: true });
});

// A POST to one of the stop routes, as the HQ page sends it.
const stopCall = (urlPath, body) => call(port, 'POST', urlPath, { body, headers: { 'content-type': 'application/json', origin: `http://127.0.0.1:${port}`, 'x-hq-token': token } });
const listed = async () => (await call(port, 'GET', '/api/jobs')).json;

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

// A request written by hand on a socket, so the request line can be anything (http.request would refuse "//").
function raw(requestLine, host) {
  return new Promise((ok) => {
    const s = net.connect(port, '127.0.0.1');
    let text = '';
    s.setTimeout(5000, () => { s.destroy(); ok({ status: 0, text, error: 'timed out' }); });
    s.on('data', (c) => { text += c; });
    s.on('error', (e) => ok({ status: 0, text, error: e.code || e.message }));
    s.on('close', () => ok({ status: +(/^HTTP\/1\.1 (\d{3})/.exec(text) || [])[1] || 0, text }));
    s.write(`${requestLine} HTTP/1.1\r\nHost: ${host === undefined ? '127.0.0.1:' + port : host}\r\nConnection: close\r\n\r\n`);
  });
}

test('a request for "//" (and other addresses new URL cannot parse) gets a 400, not a crash; HQ answers the next request', async () => {
  for (const target of ['GET //', 'GET ///', 'POST //', 'GET //\\']) {
    const r = await raw(target);
    // a POST without JSON or token is refused by the guards first (415); either way HQ answers and stays up
    assert.ok(r.status >= 400 && r.status < 500, `${target}: got ${r.status} ${r.error || ''}`);
    assert.equal(hq.exitCode, null, `${target}: HQ is still running`);
  }
  assert.equal((await raw('GET //')).status, 400, 'GET // is a 400 bad address');
  assert.equal((await raw('GET //', 'evil.example')).status, 403, 'the Host check runs before the address is parsed');
  assert.equal((await raw('GET /api/show/%zz')).status, 500, 'a bad percent escape inside a route is an error answer, not a crash');
  const after = await call(port, 'GET', '/api/jobs');
  assert.equal(after.status, 200, 'and the next ordinary request works');
  assert.equal(hq.exitCode, null);
});

test('GET /api/jobs still returns the job list shape (the four seeded jobs, no new one)', async () => {
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
  assert.deepEqual(r.json.jobs.map((j) => j.id).sort(), ['seeddead', 'seedgood1', 'seedgood2', 'seedstale']);
  assert.equal(r.json.jobs.find((j) => j.id === 'seedgood1').running, true);
  for (const p of r.json.processes) assert.ok('pid' in p && 'cmd' in p && 'started' in p);
  assert.match(r.json.processes[0].started, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
});

test('"Running now" lists node jobs by their builder script, and nothing else', async () => {
  const other = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Start-Sleep -Seconds 60 # C:\\fake\\scripts\\art.js'], { stdio: 'ignore', windowsHide: true });
  kids.push(other);
  const plain = fixture(null); // node, no script in its command line
  await wait(1200);
  const { processes } = await listed();
  const pids = processes.map((p) => p.pid);
  assert.ok(pids.includes(seed.good1.pid) && pids.includes(seed.stale.pid), 'node jobs naming scripts\\art.js are listed');
  assert.ok(!pids.includes(other.pid), 'a program that is not node.exe is not listed even if its command line names the script');
  assert.ok(!pids.includes(plain.pid), 'a node process with no builder script is not listed');
  const { builderScript, processInfo } = require(HQ_FILE).stop;
  assert.equal(builderScript('node.exe C:\\x\\scripts\\hunt-movies.js'), 'hunt-movies');
  assert.equal(builderScript('node.exe C:\\x\\scripts\\hq.js --port 1'), null);
  assert.equal(builderScript('node.exe C:\\fake\\scripts\\art.js'), 'art', 'the sleepers use a name that is on HQ\'s allowlist');
  for (const k of [seed.good1, seed.stale]) { // and not one the doctor or the nightly counts as an Archive job
    assert.ok(!/scripts[\\/](hunt|hunt-movies|scout)\.js/.test(processInfo(k.pid).cmd), 'a test sleeper must not look like a hunt, a TV-movie hunt or a scout');
  }
});

test('HQ keeps its state in HQ_STATE_DIR: the seeded dead job was marked finished in the temporary jobs file', async () => {
  await listed();
  const saved = JSON.parse(fs.readFileSync(path.join(STATE, 'hq-jobs.json'), 'utf8'));
  const dead = saved.find((j) => j.id === 'seeddead');
  assert.ok(dead.done, 'the finished time was written to the temp file');
  assert.equal(dead.code, -1);
  assert.ok(!saved.find((j) => j.id === 'seedgood1').done);
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

// ---- Stop over HTTP ------------------------------------------------------------------------------------------

test('POST /api/processes/stop with a bare number (no start time) is refused (409) and nothing is killed', { skip: !WIN && 'Windows only' }, async () => {
  const foreign = fixture();
  await wait(400);
  for (const pid of [foreign.pid, hq.pid, process.pid, 4, 0, -1, String(foreign.pid), null, undefined]) {
    const r = await stopCall('/api/processes/stop', pid === undefined ? {} : { pid });
    assert.equal(r.status, 409, 'pid ' + JSON.stringify(pid));
    assert.match(r.json.error, /process number|start time/);
  }
  assert.ok(alive(foreign.pid), 'the listed node process was not killed');
  assert.ok(alive(hq.pid), 'HQ itself was not killed');
  assert.ok(alive(process.pid));
});

test('a listed node process with the wrong started time is refused (409) and nothing is killed; the matching one is stopped', { skip: !WIN && 'Windows only' }, async () => {
  const target = fixture();
  await wait(500);
  const bystander = fixture(); // another listed process, created later: its start time must not work for the first one's number
  await wait(1000);
  const { processes } = await listed();
  const shown = processes.find((p) => p.pid === target.pid), other = processes.find((p) => p.pid === bystander.pid);
  assert.ok(shown && other, 'both are in the "Running now" list the page shows');
  const plus = (iso, ms) => new Date(Date.parse(iso) + ms).toISOString();
  for (const [why, started] of [
    ['an old time', '2020-01-01T00:00:00.000Z'],
    ['one second later', plus(shown.started, 1000)],
    ['ten milliseconds earlier', plus(shown.started, -10)],
    ['another process\'s time (what a recycled number would look like)', other.started],
    ['not a time', 'soon'],
    ['a number', 12345],
    ['nothing', undefined],
  ]) {
    const r = await stopCall('/api/processes/stop', started === undefined ? { pid: target.pid } : { pid: target.pid, started });
    assert.equal(r.status, 409, why);
    assert.ok(alive(target.pid), why + ': nothing was killed');
  }
  const ok = await stopCall('/api/processes/stop', { pid: target.pid, started: shown.started });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.stopped, true);
  await wait(500);
  assert.ok(!alive(target.pid), 'the matching one was stopped');
  assert.ok(alive(bystander.pid), 'the other listed process was not touched');
  assert.equal((await stopCall('/api/processes/stop', { pid: target.pid, started: shown.started })).json.stopped, false, 'stopping it again finds nothing to stop');
});

test('Stop refuses what is not a node builder job even when the start time is right', { skip: !WIN && 'Windows only' }, async () => {
  const { processInfo } = require(HQ_FILE).stop;
  const plain = fixture(null);
  const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Start-Sleep -Seconds 60 # C:\\fake\\scripts\\art.js'], { stdio: 'ignore', windowsHide: true });
  kids.push(ps);
  await wait(1500);
  for (const [why, pid] of [['HQ itself', hq.pid], ['a node process with no builder script', plain.pid], ['powershell whose command line names scripts\\art.js', ps.pid]]) {
    const r = await stopCall('/api/processes/stop', { pid, started: processInfo(pid).created });
    assert.equal(r.status, 409, why);
    assert.ok(alive(pid), why + ': still running');
  }
});

test('a job HQ started itself (here: reloaded from the jobs file) is stopped from its stored start time, by id or by number', { skip: !WIN && 'Windows only' }, async () => {
  const byId = await stopCall('/api/jobs/seedgood1/stop', {});
  assert.equal(byId.status, 200);
  assert.equal(byId.json.stopped, true);
  const byPid = await stopCall('/api/processes/stop', { pid: seed.good2.pid }); // no start time needed: HQ has it
  assert.equal(byPid.status, 200);
  assert.equal(byPid.json.stopped, true);
  await wait(500);
  assert.ok(!alive(seed.good1.pid) && !alive(seed.good2.pid), 'both were stopped');
  assert.ok(alive(seed.stale.pid), 'the one whose number is held by a different process was not');
});

test('a reloaded job whose stored start time does not match the live process is refused (409), left running, and marked finished', { skip: !WIN && 'Windows only' }, async () => {
  const r = await stopCall('/api/jobs/seedstale/stop', {});
  assert.equal(r.status, 409);
  assert.match(r.json.error, /no longer that job/);
  assert.ok(alive(seed.stale.pid), 'nothing was killed');
  const job = (await listed()).jobs.find((j) => j.id === 'seedstale');
  assert.equal(job.running, false, 'it no longer shows as running');
  const saved = JSON.parse(fs.readFileSync(path.join(STATE, 'hq-jobs.json'), 'utf8')).find((j) => j.id === 'seedstale');
  assert.ok(saved.done, 'and that is saved');
  // the same number, now seen as a listed node process, can still be stopped with the start time the page shows
  const shown = (await listed()).processes.find((p) => p.pid === seed.stale.pid);
  const again = await stopCall('/api/processes/stop', { pid: seed.stale.pid, started: shown.started });
  assert.equal(again.status, 200);
  assert.equal(again.json.stopped, true);
});

// ---- publish with a flag (the HQ buttons "Publish anyway (shrink)" and "Push with other commits") -------------------

test('POST /api/jobs with name publish and args ["--allow-shrink"] (and "--allow-other-commits") passes the argument check; the launch is stubbed so nothing runs', async () => {
  // A second HQ server, inside this process, so that the stubbed spawn above is the one it uses. It has its own page and token.
  // (It shares the temp state folder with the child HQ, and saves its job list there; the tests after this one do not read that file.)
  const { start } = require(HQ_FILE);
  const p = await freePort([port]);
  const srv = await start({ port: p });
  try {
    const tok = /<meta name="hq-token" content="([0-9a-f]{64})">/.exec((await call(p, 'GET', '/')).text)[1];
    const post = (body) => call(p, 'POST', '/api/jobs', { body, headers: { 'content-type': 'application/json', origin: `http://127.0.0.1:${p}`, 'x-hq-token': tok } });
    const before = jobLaunches.length;
    for (const flag of ['--allow-shrink', '--allow-other-commits']) {
      const r = await post({ name: 'publish', args: [flag] });
      assert.equal(r.status, 200, flag);
      assert.equal(r.json.name, 'publish');
      assert.deepEqual(r.json.args, [flag]);
    }
    assert.equal((await post({ name: 'publish', args: [] })).status, 200, 'and the plain publish button still works');
    assert.equal(jobLaunches.length - before, 3, 'HQ asked to launch exactly three jobs');
    const [shrink, other, plain] = jobLaunches.slice(before);
    assert.match(shrink.script, /scripts[\\/]publish\.js$/);
    assert.deepEqual(shrink.args, ['--allow-shrink']);
    assert.deepEqual(other.args, ['--allow-other-commits']);
    assert.deepEqual(plain.args, []);
    // the argument check still refuses what it should, and refused calls launch nothing
    for (const bad of [['--allow-shrink; calc'], ['$(whoami)'], ['a|b'], ['`x`']]) {
      const r = await post({ name: 'publish', args: bad });
      assert.equal(r.status, 500, JSON.stringify(bad));
      assert.match(r.json.error, /argument not allowed/);
    }
    assert.equal((await post({ name: 'notascript', args: ['--allow-shrink'] })).status, 500);
    assert.equal(jobLaunches.length - before, 3, 'refused calls launched nothing');
  } finally {
    await new Promise((ok) => srv.server.close(ok));
  }
});

test('the HQ page has the two publish buttons, their confirm texts, and the new help rows', async () => {
  const page = (await call(port, 'GET', '/')).text;
  assert.ok(page.includes(`onclick="publish()">Publish now</button>`));
  assert.ok(page.includes(`onclick="publish('--allow-shrink')"`) && page.includes('>Publish anyway (shrink)</button>'));
  assert.ok(page.includes(`onclick="publish('--allow-other-commits')"`) && page.includes('>Push with other commits</button>'));
  for (const ask of [
    'Commit the catalog and docs and push to GitHub? Cloudflare rebuilds the site in about a minute.',
    'The catalog is more than 10% smaller than the last published one. Publish it anyway?',
    'Other commits are waiting on this PC. Push them together with the catalog?',
  ]) assert.ok(page.includes(ask), ask);
  assert.ok(/async function publish\(flag\)\{[^]*?api\('\/api\/jobs',\{name:'publish',args:flag\?\[flag\]:\[\]\}\)/.test(page), 'publish() goes through api(), the helper that sends the token');
  for (const word of ['<b>unpushed</b> yellow', '<b>unpushed</b> red', '<b>addresses</b> red', '<b>refused</b>', '<b>held</b>']) assert.ok(page.includes(word), word);
});

// ---- the stop logic itself, against sleepers this test starts and ends -----------------------------------------

test('stop: a job whose process is still the one HQ launched is stopped, and only that process', { skip: !WIN && 'Windows only' }, async () => {
  const { stopHqJob, processInfo } = require(HQ_FILE).stop;
  const target = spawn(process.execPath, ['-e', 'setTimeout(()=>{},60000)', 'C:\\fake\\scripts\\art.js'], { stdio: 'ignore', windowsHide: true });
  const bystander = spawn(process.execPath, ['-e', 'setTimeout(()=>{},60000)', 'C:\\fake\\scripts\\art.js'], { stdio: 'ignore', windowsHide: true });
  try {
    await wait(500);
    const info = processInfo(target.pid);
    assert.ok(info && /scripts[\\/]art\.js/.test(info.cmd), 'the live command line is readable');
    assert.match(info.created, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
    assert.match(info.name, /^node(\.exe)?$/i);
    const job = { id: 't1', name: 'art', args: [], pid: target.pid, started: new Date().toISOString(), pstart: info.created, done: null, code: null };
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
  const sleeper = spawn(process.execPath, ['-e', 'setTimeout(()=>{},60000)', 'C:\\fake\\scripts\\art.js'], { stdio: 'ignore', windowsHide: true });
  const realLog = console.log; const lines = [];
  try {
    await wait(500);
    const info = processInfo(sleeper.pid);
    const base = { id: 't2', name: 'art', args: [], pid: sleeper.pid, started: new Date().toISOString(), pstart: info.created, done: null, code: null };
    console.log = (...a) => lines.push(a.join(' '));
    const cases = [
      ['start time differs (a recycled number)', { ...base, pstart: '2020-01-01T00:00:00.000Z' }],
      ['another script name (art.js is not match.js)', { ...base, name: 'match' }],
      ['a longer name that starts the same (art is not art-x)', { ...base, name: 'art-x' }],
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
  const sleeper = spawn(process.execPath, ['-e', 'setTimeout(()=>{},60000)', 'C:\\fake\\scripts\\art.js'], { stdio: 'ignore', windowsHide: true });
  try {
    await wait(500);
    const info = processInfo(sleeper.pid);
    const job = { id: 't3', name: 'art', args: [], pid: sleeper.pid, started: new Date(Date.parse(info.created) + 900).toISOString(), pstart: null, done: null, code: null };
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
  const quick = spawn(process.execPath, ['-e', '0', 'C:\\fake\\scripts\\art.js'], { stdio: 'ignore', windowsHide: true });
  await new Promise((r) => quick.once('exit', r));
  await wait(200);
  const job = { id: 't4', name: 'art', args: [], pid: quick.pid, started: new Date().toISOString(), pstart: '2026-01-01T00:00:00.000Z', done: null, code: null };
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
    const job = { id: 't5', name: 'art', args: [], pid: 999999, started: new Date().toISOString(), pstart: null, done: null, code: null };
    const r = stopHqJob(job, () => { throw new Error('powershell is not available'); });
    assert.equal(r.status, 409);
    assert.equal(job.done, null, 'a job that could not be checked is left as it was');
  } finally {
    console.log = realLog;
  }
});

test('stopListedProcess: every refusal happens before anything is killed (the read is replaced and the number cannot exist)', () => {
  const { stopListedProcess } = require(HQ_FILE).stop;
  const realLog = console.log; const lines = [];
  console.log = (...a) => lines.push(a.join(' '));
  try {
    const t0 = '2026-10-18T12:00:00.000Z';
    const live = (extra) => () => ({ created: t0, cmd: '"C:\\node\\node.exe" C:\\v\\scripts\\nightly.js', name: 'node.exe', ...extra });
    const cases = [
      ['no start time', 999999, undefined, live()],
      ['a start time that is not a time', 999999, 'soon', live()],
      ['a number that is not an integer', 1.5, t0, live()],
      ['a negative number', -4, t0, live()],
      ['HQ itself', process.pid, t0, live()],
      ['a process that cannot be read', 999999, t0, () => { throw new Error('no powershell'); }],
      ['not node.exe', 999999, t0, live({ name: 'powershell.exe' })],
      ['no builder script in the command line', 999999, t0, live({ cmd: 'node.exe C:\\v\\scripts\\hq.js --port 1' })],
      ['a start time half a second off', 999999, '2026-10-18T12:00:00.500Z', live()],
    ];
    for (const [why, pid, started, read] of cases) assert.equal(stopListedProcess(pid, started, read).status, 409, why);
    assert.equal(lines.length, cases.length, 'one console line per refusal');
    assert.equal(stopListedProcess(999999, t0, () => null).body.stopped, false, 'a number nobody holds is "already ended"');
    assert.equal(stopListedProcess(999999, '2026-10-18T12:00:00.002Z', live()).status, 200, '2 ms apart still counts as the same start time (the kill then finds no such process)');
    assert.equal(lines.length, cases.length, 'and those two refused nothing');
  } finally {
    console.log = realLog;
  }
});

test('stopListedProcess: a creation time that is null, missing or not a date is refused (409) and a real listed process is not killed', { skip: !WIN && 'Windows only' }, async () => {
  const { stopListedProcess, sameProcess, processInfo } = require(HQ_FILE).stop;
  const victim = fixture();
  await wait(500);
  const real = processInfo(victim.pid);
  const realLog = console.log; const lines = [];
  console.log = (...a) => lines.push(a.join(' '));
  try {
    for (const created of [null, undefined, '', 'garbage', 'NaN', 0 / 0]) {
      // the read is replaced by one that returns the real node.exe and its real command line, but a creation time that cannot be read
      const r = stopListedProcess(victim.pid, real.created, () => ({ ...real, created }));
      assert.equal(r.status, 409, JSON.stringify(created));
      assert.match(r.body.error, /could not read when that process started/);
      assert.ok(alive(victim.pid), JSON.stringify(created) + ': the process was not killed');
    }
    assert.equal(lines.length, 6, 'one console line per refusal');
    // the same rule on the path for jobs HQ started: an unreadable time never counts as a match
    const cmd = real.cmd;
    for (const created of [null, undefined, 'garbage']) {
      assert.equal(sameProcess({ name: 'art', pstart: real.created, started: real.created }, { cmd, created }).ok, false, 'stored start time, live time ' + created);
      assert.equal(sameProcess({ name: 'art', pstart: null, started: real.created }, { cmd, created }).ok, false, 'no stored start time, live time ' + created);
    }
  } finally {
    console.log = realLog;
  }
  // and with a readable time it is stopped, so the refusals above were about the time and nothing else
  const ok = stopListedProcess(victim.pid, real.created, () => real);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.stopped, true);
  await wait(500);
  assert.ok(!alive(victim.pid));
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

// ---- last: nothing above touched the tree's catalog/cache ----------------------------------------------------

test('running this file left catalog/cache alone: not created if it was not there, probe.jsonl unchanged, state went to the temp folder', () => {
  if (!realBefore.existed) assert.ok(!fs.existsSync(REAL_CACHE), 'catalog/cache was not there before and still is not');
  assert.equal(readOrNull(path.join(REAL_CACHE, 'probe.jsonl')), realBefore.probe);
  assert.ok(fs.existsSync(path.join(STATE, 'hq-jobs.json')), 'HQ wrote its jobs file into the temp state folder instead');
});
