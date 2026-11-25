// HQ starts Void Cast by itself (Bryan, 24 Nov 2026: "i ned this remedied and changed so i donyt have to hunt fpor the app on my
// desktop[ to turn thi son]"). Run: node --test tests/hq-cast.test.js
// HQ's Void Cast area used to say "Void Cast is not running. Double-click Void Cast on the desktop". Now the area asks HQ's server
// to start it (scripts/lib/casthq.js), the way the desktop icon does, and shows it. The real void-cast folder is never touched here:
// the tests start a small stand-in that answers the same ping, in a temp folder, on a free port, and stop it again.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const http = require('http');

const REPO = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8').replace(/\r\n/g, '\n');
const freePort = () => new Promise((ok) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
const get = (port, p) => new Promise((ok) => { const q = http.get({ host: '127.0.0.1', port, path: p, timeout: 2000 }, (r) => { r.resume(); r.on('end', () => ok(r.statusCode)); }); q.on('error', () => ok(0)); q.on('timeout', () => { q.destroy(); ok(0); }); });

// A stand-in for void-cast\server.js: the same ping, on the port HQ hands it, and it leaves when asked (so the test can clean up).
const STAND_IN = `const http = require('http');
const app = process.env.STAND_IN_APP || 'void-cast';
http.createServer((q, s) => {
  if (q.url === '/api/ping') { s.writeHead(200, { 'content-type': 'application/json' }); return s.end(JSON.stringify({ ok: true, app })); }
  if (q.url === '/quit') { s.end('bye'); return setTimeout(() => process.exit(0), 20); }
  s.writeHead(404); s.end();
}).listen(+process.env.VOID_CAST_PORT, '127.0.0.1');
`;

function fresh() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hq-cast-'));
  delete require.cache[require.resolve('../scripts/lib/casthq')];
  return { dir, C: require('../scripts/lib/casthq') };
}

test('not running: HQ starts it, waits until it answers, and a second start leaves the running one alone', async () => {
  const { dir, C } = fresh();
  const cast = path.join(dir, 'void-cast'); fs.mkdirSync(cast); fs.writeFileSync(path.join(cast, 'server.js'), STAND_IN);
  const port = await freePort();
  C.init({ nodeBin: () => ({ bin: process.execPath, env: process.env }), cache: path.join(dir, 'cache'), dir: cast, port });
  try {
    assert.deepEqual(await C.status(), { up: false, port, here: true });
    assert.deepEqual(await C.start(), { up: true, port, here: true });
    assert.ok(fs.existsSync(path.join(dir, 'cache', 'void-cast-server.log')), 'what it says while starting is kept in HQ\'s cache folder');
    assert.deepEqual(await C.start(), { up: true, port, here: true }, 'already running: nothing more is started');
  } finally { await get(port, '/quit'); }
});

test('Void Cast is not on this PC: a plain reason, and nothing is started', async () => {
  const { dir, C } = fresh();
  const port = await freePort();
  C.init({ nodeBin: () => ({ bin: process.execPath, env: process.env }), cache: path.join(dir, 'cache'), dir: path.join(dir, 'no-such-folder'), port });
  assert.deepEqual(await C.status(), { up: false, port, here: false });
  await assert.rejects(() => C.start(), /Void Cast is not where HQ looks for it on this PC/);
  assert.ok(!fs.existsSync(path.join(dir, 'cache')), 'not even a log file');
});

test('another program on the port is not taken for Void Cast', async () => {
  const { dir, C } = fresh();
  const port = await freePort();
  const other = http.createServer((q, s) => { s.writeHead(200, { 'content-type': 'application/json' }); s.end(JSON.stringify({ ok: true, app: 'something-else' })); });
  await new Promise((r) => other.listen(port, '127.0.0.1', r));
  try {
    C.init({ nodeBin: () => ({ bin: process.execPath, env: process.env }), cache: path.join(dir, 'cache'), dir: path.join(dir, 'x'), port });
    assert.equal((await C.status()).up, false, 'its ping must say app: void-cast');
  } finally { await new Promise((r) => other.close(r)); }
});

test('HQ is wired to it: the server has the two addresses, and the area starts Void Cast instead of sending Bryan to the desktop', () => {
  const HQ = read('scripts/hq.js'), PAGE = read('scripts/hq/index.html');
  assert.match(HQ, /casthq\.init\(\{ nodeBin, cache: CACHE \}\);/);
  assert.match(HQ, /if \(p === '\/api\/cast'\) return send\(res, 200, await casthq\.status\(\)\);/);
  assert.match(HQ, /if \(p === '\/api\/cast\/start' && req\.method === 'POST'\)/, 'starting is a POST, like every HQ action');
  assert.match(PAGE, /await api\('\/api\/cast\/start',\{\}\)/);
  assert.doesNotMatch(PAGE, /Double-click <b>Void Cast<\/b> on the desktop/, 'the old instruction is gone');
  assert.match(PAGE, /Void Cast would not start/, 'a failure says so, with the reason and Try again');
  const C = read('scripts/lib/casthq.js');
  assert.match(C, /detached: true/); assert.match(C, /windowsHide: true/, 'no window, and it outlives HQ, as the desktop icon\'s start does');
  assert.doesNotMatch(C, /writeFileSync|unlinkSync|rmSync/, 'it changes nothing in the void-cast folder');
});
