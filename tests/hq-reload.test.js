// HQ loads its new code by itself (Bryan, 24 Nov 2026: "Yes, build it"). Run: node --test tests/hq-reload.test.js
// HQ is a page and a server program. The page is read from disk each time it is opened; the server kept the code it started with.
// After a chat pushed a change to HQ the page was new and the server old: the Void Cast area asked the server to start Void Cast
// and the old server answered "not found". Now a running HQ sees that the code it loaded is no longer the code on disk and hands
// over to a fresh copy of itself when its page is opened (scripts/lib/hqreload.js).
// Nothing here touches the real HQ: the unit tests use temp folders, and the hand-over test runs a small stand-in server that
// uses the same file, on a free port, and stops it again.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const http = require('http');
const { spawn } = require('child_process');
const R = require('../scripts/lib/hqreload');

const REPO = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8').replace(/\r\n/g, '\n');
const nodeBin = () => ({ bin: process.execPath, env: process.env });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((ok) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
const get = (port, p) => new Promise((ok) => { const q = http.get({ host: '127.0.0.1', port, path: p, timeout: 2000 }, (r) => { let d = ''; r.on('data', (c) => { d += c; }); r.on('end', () => ok(d)); }); q.on('error', () => ok(null)); q.on('timeout', () => { q.destroy(); ok(null); }); });

function tree() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hq-reload-'));
  fs.mkdirSync(path.join(root, 'scripts', 'lib'), { recursive: true });
  const a = path.join(root, 'scripts', 'entry.js'), b = path.join(root, 'scripts', 'lib', 'part.js');
  fs.writeFileSync(a, 'module.exports = 1;\n'); fs.writeFileSync(b, 'module.exports = "one";\n');
  return { root, a, b };
}
const later = (f) => { const t = new Date(Date.now() + 5000); fs.utimesSync(f, t, t); };

test('new code is a file whose bytes changed; a file that was only touched is not new code', () => {
  const { root, a, b } = tree();
  const r = R.create({ root, entry: a, nodeBin, loaded: () => [a, b] });
  assert.deepEqual(r.check(1), { stale: false, files: [] });
  later(b); // same content, a newer time: a checkout or a copy can do this
  assert.deepEqual(r.check(10000), { stale: false, files: [] });
  fs.writeFileSync(b, 'module.exports = "two";\n');
  assert.deepEqual(r.check(20000), { stale: true, files: ['scripts/lib/part.js'] });
  assert.deepEqual(r.check(20500), { stale: true, files: ['scripts/lib/part.js'] }, 'asked again within two seconds: the same answer, without reading the disk');
  fs.writeFileSync(b, 'module.exports = "one";\n');
  assert.deepEqual(r.check(30000), { stale: false, files: [] }, 'put back as it was: no longer new');
});

test('a hand-over waits for a running job, refuses code that does not load, and is not done inside the desktop app', () => {
  const { root, a, b } = tree();
  let busy = true;
  const r = R.create({ root, entry: a, nodeBin, loaded: () => [a, b], busy: () => busy });
  fs.writeFileSync(b, 'module.exports = "two";\n');
  assert.match(r.canReload().why, /a job HQ started is still running/);
  assert.deepEqual({ stale: r.state().stale, can: r.state().canReload }, { stale: true, can: false });
  busy = false;
  assert.deepEqual(r.canReload(), { ok: true });
  fs.writeFileSync(a, 'module.exports = (;\n'); // a change that breaks HQ
  const broken = r.canReload();
  assert.equal(broken.ok, false); assert.equal(broken.broken, true);
  assert.match(broken.why, /the new code does not load, so HQ keeps running the old code \(.*SyntaxError/);
  const app = R.create({ root, entry: b, nodeBin, loaded: () => [b], inApp: true });
  assert.match(app.canReload().why, /inside the VOIDtv HQ app/);
});

// The real thing, small: a server that uses hqreload the way hq.js does. Its code changes on disk, its page is opened, and the
// same address answers with the new code a moment later, from a new process started with the same arguments.
const MINI = `const http = require('http'), path = require('path');
const R = require(${JSON.stringify(path.join(REPO, 'scripts', 'lib', 'hqreload.js'))});
const ver = require('./lib/ver');
const port = +process.argv[process.argv.indexOf('--port') + 1];
const server = http.createServer((q, s) => {
  if (q.url === '/quit') { s.end('bye'); return setTimeout(() => process.exit(0), 20); }
  if (q.url === '/api/reload') { s.writeHead(200, { 'content-type': 'application/json' }); return s.end(JSON.stringify(reload.state())); }
  if (reload.check().stale && reload.canReload().ok) { s.on('finish', () => reload.reload(server)); return s.end('WAIT'); }
  s.end('version ' + ver + ' pid ' + process.pid + ' args ' + process.argv.slice(2).join(' '));
});
const reload = R.create({ root: path.join(__dirname, '..'), entry: __filename, args: process.argv.slice(2), nodeBin: () => ({ bin: process.execPath, env: process.env }), log: path.join(__dirname, '..', 'reload.log') });
let waits = process.env.HQ_RELOADED ? 20 : 0;
const listen = () => { server.once('error', (e) => { if (e.code === 'EADDRINUSE' && waits-- > 0) return setTimeout(listen, 250); process.exit(1); }); server.listen(port, '127.0.0.1'); };
if (require.main === module) listen(); // like hq.js: loading the file does not start it, so the "does the new code load" check can load it
`;

test('the hand-over itself: the code changes, the page is opened, and the same address answers with the new code from a new process', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hq-reload-live-'));
  fs.mkdirSync(path.join(root, 'scripts', 'lib'), { recursive: true });
  fs.writeFileSync(path.join(root, 'scripts', 'mini.js'), MINI);
  fs.writeFileSync(path.join(root, 'scripts', 'lib', 'ver.js'), 'module.exports = 1;\n');
  const port = await freePort();
  const first = spawn(process.execPath, [path.join(root, 'scripts', 'mini.js'), '--port', String(port), '--kept'], { cwd: root, stdio: 'ignore', windowsHide: true });
  try {
    let a = null; for (let i = 0; i < 40 && !a; i++) { await sleep(150); a = await get(port, '/'); }
    assert.match(a, /^version 1 pid \d+ args --port \d+ --kept$/);
    const pid1 = +/pid (\d+)/.exec(a)[1];
    assert.equal(JSON.parse(await get(port, '/api/reload')).stale, false);
    fs.writeFileSync(path.join(root, 'scripts', 'lib', 'ver.js'), 'module.exports = 2;\n');
    await sleep(2100); // the check is asked at most every two seconds
    assert.equal(await get(port, '/'), 'WAIT', 'the page opened on old code gets the wait page');
    let b = null; for (let i = 0; i < 60; i++) { await sleep(200); b = await get(port, '/'); if (b && /^version 2/.test(b)) break; }
    assert.match(b || '', /^version 2 pid \d+ args --port \d+ --kept$/, 'the same address, the new code, the same arguments');
    assert.notEqual(+/pid (\d+)/.exec(b)[1], pid1, 'a new process');
    assert.equal(JSON.parse(await get(port, '/api/reload')).stale, false, 'and it does not hand over again');
  } finally { await get(port, '/quit'); try { first.kill(); } catch (e) { /* already gone */ } }
});

test('HQ is wired to it: the page hands over when opened, a taken port is waited for only after a hand-over, the page asks when it comes back into view', () => {
  const HQ = read('scripts/hq.js'), PAGE = read('scripts/hq/index.html');
  assert.match(HQ, /if \(RELOAD\.check\(\)\.stale && RELOAD\.canReload\(\)\.ok\) \{ res\.on\('finish', \(\) => RELOAD\.reload\(server\)\); return send\(res, 200, WAIT_PAGE, MIME\['\.html'\]\); \}/);
  assert.match(HQ, /if \(p === '\/api\/reload' && req\.method === 'GET'\) return send\(res, 200, RELOAD\.state\(\)\);/);
  assert.match(HQ, /let waits = process\.env\.HQ_RELOADED \? 20 : 0;/, 'any other start still fails at once on a taken port');
  assert.match(HQ, /busy: \(\) => LISTENING\.size > 0, inApp: require\.main !== module \|\| !!process\.versions\.electron/, 'never while a job runs, never inside the app or a test');
  assert.match(HQ, /args: process\.argv\.slice\(2\)\.filter\(\(a\) => a !== '--open'\)/, 'the fresh copy does not open a second browser window');
  assert.match(PAGE, /document\.addEventListener\('visibilitychange',\(\)=>\{if\(!document\.hidden\)newCodeCheck\(\)\}\)/);
  assert.match(PAGE, /if\(a&&\/\^\(INPUT\|TEXTAREA\|SELECT\)\$\/\.test\(a\.tagName\)\)return;location\.reload\(\)/, 'never while something is being typed');
  assert.match(R.WAIT_PAGE, /HQ is loading its new code/);
  assert.doesNotMatch(R.WAIT_PAGE, /https?:\/\//, 'the wait page talks to HQ only');
});
