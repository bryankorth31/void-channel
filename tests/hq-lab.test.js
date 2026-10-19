// The player lab inside the HQ desktop app (Bryan, 19 Oct 2026). Run: node --test tests/hq-lab.test.js
// hq-app/lab.js serves the repo's player/ folder on 127.0.0.1:8792 for the lab window. These tests check the two things
// that matter in a server living inside HQ's main process: it never hands out a file outside player/, and it answers the
// lab's own pages with the right types. The server under test listens on a random port; 8792 is left alone (a soak may
// be using it). No browser, no network beyond 127.0.0.1, nothing is played.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const path = require('path');
const lab = require('../hq-app/lab');

const ROOT = path.join(__dirname, '..', 'player');

test('resolveInside keeps every request inside player/', () => {
  const bad = [
    '/../package.json', '/lab/../../scripts/hq.js', '/%2e%2e/scripts/hq.js', '/lab/%2e%2e/%2e%2e/backend/.env',
    '/lab/..%5C..%5Cbackend%5C.env', '/lab\\..\\..\\backend\\.env', '/C:/Windows/win.ini', '/lab/index.html::$DATA',
    '/lab/%00index.html', '/lab/index.html%0d%0aSet-Cookie:%20x=1', '/.git/config', '/lab/.hidden', '/%E0%A4%A',
    'lab/index.html', 'http://evil.example/lab/',
  ];
  for (const u of bad) assert.equal(lab.resolveInside(ROOT, u), null, u);
  const ok = lab.resolveInside(ROOT, '/lab/');
  assert.equal(ok.full, path.join(ROOT, 'lab'));
  assert.equal(ok.dir, true);
  assert.equal(lab.resolveInside(ROOT, '/src/core.js?v=3#x').full, path.join(ROOT, 'src', 'core.js'));
  assert.equal(lab.resolveInside(ROOT, '/lab/./states.html').full, path.join(ROOT, 'lab', 'states.html'));
});

function get(port, p, method = 'GET', headers = {}) {
  return new Promise((ok, fail) => {
    const q = http.request({ host: '127.0.0.1', port, path: p, method, headers }, (r) => {
      const parts = []; r.on('data', (c) => parts.push(c)); r.on('end', () => ok({ status: r.statusCode, headers: r.headers, body: Buffer.concat(parts).toString('utf8') }));
    });
    q.on('error', fail); q.end();
  });
}

test('the lab server answers the lab pages and refuses the rest', async () => {
  const s = http.createServer(lab.handler(ROOT));
  await new Promise((ok) => s.listen(0, '127.0.0.1', ok));
  const port = s.address().port;
  try {
    const page = await get(port, '/lab/');
    assert.equal(page.status, 200);
    assert.match(page.headers['content-type'], /^text\/html/);
    assert.equal(page.headers['cache-control'], 'no-store');
    assert.match(page.body, /\.\.\/src\/player\.js/);

    const js = await get(port, '/src/core.js');
    assert.equal(js.status, 200);
    assert.match(js.headers['content-type'], /^text\/javascript/);
    assert.equal(js.headers['x-content-type-options'], 'nosniff');

    for (const p of ['/lab/states.html', '/lab/hop.html', '/src/player.css', '/lab/episodes.json']) assert.equal((await get(port, p)).status, 200, p);

    const slashless = await get(port, '/lab');
    assert.equal(slashless.status, 301);
    assert.equal(slashless.headers.location, '/lab/');
    const root = await get(port, '/');
    assert.equal(root.status, 302);
    assert.equal(root.headers.location, '/lab/');

    for (const p of ['/../package.json', '/%2e%2e/scripts/hq.js', '/lab/..%5C..%5Cpackage.json', '/nothing-here.js', '/lab/index.html%0d%0aX:%201'])
      assert.equal((await get(port, p)).status, 404, p);
    assert.equal((await get(port, '/lab/', 'POST')).status, 405);
    const head = await get(port, '/lab/', 'HEAD');
    assert.equal(head.status, 200);
    assert.equal(head.body, '');

    // A file asked for as a folder is not served.
    assert.equal((await get(port, '/lab/index.html/')).status, 404);
    // Only this PC's own names are answered (DNS rebinding gets 403), as HQ does on 8780.
    assert.equal((await get(port, '/lab/', 'GET', { Host: 'attacker.example:' + port })).status, 403);
    assert.equal((await get(port, '/lab/', 'GET', { Host: '127.0.0.1' })).status, 403);
    assert.equal((await get(port, '/lab/', 'GET', { Host: 'localhost:' + port })).status, 200);
  } finally {
    await new Promise((ok) => s.close(ok));
  }
});

test('the HQ app ships lab.js and routes lab links to the lab window', () => {
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'hq-app', 'package.json'), 'utf8'));
  assert.ok(pkg.build.files.includes('lab.js'), 'electron-builder must pack lab.js, or the installed app cannot start');
  const main = fs.readFileSync(path.join(__dirname, '..', 'hq-app', 'main.js'), 'utf8');
  assert.match(main, /require\('\.\/lab'\)/);
  assert.match(main, /label: 'Open player lab'/);
  assert.match(main, /backgroundThrottling: false/);
  // Both windows use the .ico on Windows, not the 512 px PNG.
  assert.equal((main.match(/icon: windowIcon\(\)/g) || []).length, 2);
  // The Player lab button and the tray only bring an open lab forward; only a link to another lab page moves it.
  assert.match(main, /const deep = isLab\(url\) && url !== lab\.LAB_URL \? url : null;/);
  // A live lab page (a running soak) is never reloaded by HQ: only a page whose load failed is loaded again.
  assert.doesNotMatch(main, /webContents\.reload\(\)/);
  assert.match(main, /else if \(labFailedUrl\) load\(labWin, labFailedUrl\);/);
  // Electron 44 fires did-finish-load after a failed load too, so the failure mark may only be cleared by did-navigate.
  assert.match(main, /on\('did-navigate', \(\) => \{ if \(labWin === w\) labFailedUrl = null; \}\)/);
  assert.doesNotMatch(main, /on\('did-finish-load'[^\n]*labFailedUrl = null/);
  // The app icon carries every size Windows asks for (title bar, taskbar, tray, desktop, Explorer).
  const ico = fs.readFileSync(path.join(__dirname, '..', 'hq-app', 'build', 'icon.ico'));
  assert.equal(ico.readUInt16LE(2), 1, 'an icon file');
  const sizes = Array.from({ length: ico.readUInt16LE(4) }, (_, i) => ico[6 + i * 16] || 256).sort((a, b) => a - b);
  assert.deepEqual(sizes, [16, 24, 32, 48, 64, 128, 256]);
  const page = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'hq', 'index.html'), 'utf8');
  assert.ok(page.includes('href="' + lab.LAB_URL + '"'), 'the HQ header links the lab');
});
