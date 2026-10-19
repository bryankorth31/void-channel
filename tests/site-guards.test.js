// Tests for scripts/lib/siteguards.js: the one switch, the output limits, the shrink rule, version.txt and the doctor lights built from them
// (audit fix batch B, B3). Run: node --test tests/site-guards.test.js
// Pure rules plus two temporary folders; the live-site function is handed a fake fetch. Nothing here reaches the network or the real site folder.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const G = require('../scripts/lib/siteguards');
const MiB = 1024 * 1024;

test('the switch: SITE_PASSWORD (or the spare GATE=on) turns the gate on, nothing else does', () => {
  assert.equal(G.isGated({}), false);
  assert.equal(G.isGated({ SITE_PASSWORD: '' }), false);
  assert.equal(G.isGated({ SITE_PASSWORD: 'x' }), true);
  assert.equal(G.isGated({ GATE: 'on' }), true);
  assert.equal(G.isGated({ GATE: 'ON ' }), true);
  assert.equal(G.isGated({ GATE: 'off' }), false);
  assert.equal(G.isGated({ GATE: '1' }), false);
  assert.deepEqual(G.routesFor(true), { version: 1, include: ['/*'], exclude: ['/assets/*'] });
  assert.deepEqual(G.routesFor(false), { version: 1, include: ['/api/*', '/q/*'], exclude: [] });
});

test('version.txt: line one is what it always was, line two carries gate and the counts, and it reads back', () => {
  const text = G.versionText({ sha: 'a'.repeat(40), at: '2026-10-18T12:00:00.000Z', gate: true, files: 15454, largest: 10237790, largestFile: 'data/graph.json', shows: 4774, episodes: 52622 });
  assert.equal(text.split('\n')[0], 'a'.repeat(40) + ' 2026-10-18T12:00:00.000Z');
  assert.ok(text.startsWith('a'.repeat(40)), 'older readers compare the start of the file with a commit');
  assert.match(text, /\ngate=on files=15454 largest=10237790 shows=4774 episodes=52622 largestFile=data\/graph\.json\n$/);
  const v = G.parseVersion(text);
  assert.deepEqual(v, { sha: 'a'.repeat(40), at: '2026-10-18T12:00:00.000Z', gate: 'on', files: 15454, largest: 10237790, shows: 4774, episodes: 52622, largestFile: 'data/graph.json' });
  assert.equal(G.parseVersion(G.versionText({ sha: 'b', at: 't', gate: false, files: 1, largest: 1, shows: 1, episodes: 1 })).gate, 'off');
  const old = G.parseVersion('fbb5e586c8fedf85d2709a0f2d77f122dc175a0 2026-10-18T17:57:09.906Z\n'); // a build from before this change
  assert.equal(old.gate, null); assert.equal(old.files, null); assert.equal(old.sha, 'fbb5e586c8fedf85d2709a0f2d77f122dc175a0');
  assert.equal(G.parseVersion('').sha, '');
  assert.equal(G.parseVersion('x t gate=maybe files=abc').gate, null);
  assert.equal(G.parseVersion('x t gate=maybe files=abc').files, null);
});

test('output limits: warn at 18,000 files, refuse at 19,500, refuse a file over 24 MiB', () => {
  const r = (files, largest) => G.checkOutput({ files, largest, largestFile: 'data/x.json' }).level;
  assert.equal(r(15454, 10 * MiB), 'ok');
  assert.equal(r(17999, 1), 'ok');
  assert.equal(r(18000, 1), 'warn');
  assert.equal(r(19499, 1), 'warn');
  assert.equal(r(19500, 1), 'refuse');
  assert.equal(r(20001, 1), 'refuse');
  assert.equal(r(100, 24 * MiB), 'ok');
  assert.equal(r(100, 24 * MiB + 1), 'refuse');
  const both = G.checkOutput({ files: 19600, largest: 25 * MiB, largestFile: 'data/big.json' });
  assert.equal(both.level, 'refuse'); assert.equal(both.why.length, 2);
  assert.match(both.why.join(' '), /data\/big\.json/);
  assert.equal(G.LIMITS.fileBytesMax, 24 * MiB);
});

test('shrink rule: more than 10 percent down in shows or episodes, the same rule publish.js uses', () => {
  const v = (now, before) => G.shrinkVerdict(now, before);
  assert.equal(v({ shows: 90, episodes: 900 }, { shows: 100, episodes: 1000 }).fell, false); // exactly 10 percent is allowed
  assert.equal(v({ shows: 89, episodes: 900 }, { shows: 100, episodes: 1000 }).fell, true);
  assert.equal(v({ shows: 100, episodes: 899 }, { shows: 100, episodes: 1000 }).fell, true);
  assert.equal(v({ shows: 150, episodes: 1500 }, { shows: 100, episodes: 1000 }).fell, false);
  assert.equal(v({ shows: 5, episodes: 5 }, null).fell, false);
  assert.match(v({ shows: 150, episodes: 100 }, { shows: 4774, episodes: 100 }).parts[0], /shows 4774 -> 150/);
});

test('last published counts on this PC come from publish-state.json (the numbers publish.js itself uses), and a missing or broken file is not an error', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-guards-'));
  try {
    assert.equal(G.readLastCounts(dir), null);
    fs.mkdirSync(path.join(dir, 'cache'));
    fs.writeFileSync(path.join(dir, 'cache', 'publish-state.json'), JSON.stringify({ shows: 50, episodes: 500, at: 'x', commit: 'abc' }));
    assert.deepEqual(G.readLastCounts(dir), { shows: 50, episodes: 500, source: 'catalog/cache/publish-state.json' });
    fs.writeFileSync(path.join(dir, 'cache', 'publish-state.json'), '{not json');
    assert.equal(G.readLastCounts(dir), null);
    fs.writeFileSync(path.join(dir, 'cache', 'publish-state.json'), JSON.stringify({ shows: 'many' }));
    assert.equal(G.readLastCounts(dir), null);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('last counts on a Cloudflare build come from the live version.txt; every kind of trouble gives null, never an exception', () => {
  assert.deepEqual(G.countsFromVersion('abc 2026-10-18T00:00:00Z\ngate=on files=1 largest=1 shows=4774 episodes=52622\n'), { shows: 4774, episodes: 52622 });
  assert.equal(G.countsFromVersion('abc 2026-10-18T00:00:00Z\n'), null);            // a version.txt from before this change
  assert.equal(G.countsFromVersion(''), null);
  const url = 'https://voidtv.net/version.txt';
  const spawn = (stdout) => (cmd, args, opts) => { assert.equal(args[args.length - 1], url); assert.ok(opts.timeout <= 20000, 'a time limit'); return { stdout }; };
  assert.deepEqual(G.liveCountsSync(url, spawn('abc t\ngate=off files=2 largest=1 shows=100 episodes=900\n')), { shows: 100, episodes: 900, source: url });
  assert.equal(G.liveCountsSync(url, spawn('')), null);                              // fetch failed or answered an error
  assert.equal(G.liveCountsSync(url, spawn('<html>error</html>')), null);
  assert.equal(G.liveCountsSync(url, () => { throw new Error('no node'); }), null);
  assert.equal(G.liveCountsSync('file:///etc/passwd', spawn('abc t\nshows=1 episodes=1')), null, 'only http and https');
  assert.equal(G.liveCountsSync(url, () => ({})), null);
});

test('grid files that do not parse are named', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-guards-'));
  try {
    fs.writeFileSync(path.join(dir, 'a.json'), '{"slug":"a","seasons":[]}');
    fs.writeFileSync(path.join(dir, 'b.json'), '{"slug":"b","seasons":[');       // cut off mid-write
    fs.writeFileSync(path.join(dir, 'c.json'), '');
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'not a grid');
    assert.deepEqual(G.unreadableGrids(dir).sort(), ['b.json', 'c.json']);
    assert.deepEqual(G.unreadableGrids(path.join(dir, 'nope')), []);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('security headers: the file names every header, the policy is report-only and lists what the page loads', () => {
  const file = G.headersFile();
  for (const [k, v] of G.SECURITY_HEADERS) assert.ok(file.includes(`  ${k}: ${v}\n`), k);
  assert.ok(!/\n\s*Content-Security-Policy:/.test('\n' + file), 'the enforcing header must not be set yet');
  assert.ok(/Content-Security-Policy-Report-Only: /.test(file));
  assert.ok(file.startsWith('/*\n'));
  assert.ok(file.includes('/data/*\n  Cache-Control: public, max-age=300\n/show/*\n  Cache-Control: public, max-age=300\n/assets/*\n  Cache-Control: public, max-age=86400\n'), 'the caching lines are unchanged');
  for (const bit of ["frame-ancestors 'none'", 'js.sentry-cdn.com', 'browser.sentry-cdn.com', 'image.tmdb.org', 'https://*.archive.org', 'blob:', "object-src 'none'", "base-uri 'self'", '*.ingest.sentry.io']) assert.ok(G.CSP.includes(bit), bit);
  assert.ok(G.SECURITY_HEADERS.some(([k, v]) => k === 'Strict-Transport-Security' && v === 'max-age=31536000'));
  assert.ok(G.SECURITY_HEADERS.some(([k, v]) => k === 'X-Frame-Options' && v === 'DENY'));
  assert.ok(G.SECURITY_HEADERS.some(([k, v]) => k === 'Permissions-Policy' && v === 'camera=(), microphone=(), geolocation=()'));
  assert.ok(file.length < 2000 * 4, 'well inside the Pages _headers limits');
  for (const line of file.split('\n')) assert.ok(line.length <= 2000, 'Pages allows 2,000 characters a line');
});

test('header check on a fake response: HSTS, X-Frame-Options and nosniff must all be there', () => {
  const miss = (h) => G.missingSecurityHeaders((n) => new Headers(h).get(n));
  const good = { 'strict-transport-security': 'max-age=31536000', 'x-frame-options': 'DENY', 'x-content-type-options': 'nosniff' };
  assert.deepEqual(miss(good), []);
  assert.deepEqual(miss({ ...good, 'x-content-type-options': 'nosniff, nosniff' }), []); // Pages adds it too
  assert.deepEqual(miss({ ...good, 'strict-transport-security': 'max-age=31536000; includeSubDomains' }), []);
  assert.deepEqual(miss({}), ['Strict-Transport-Security', 'X-Frame-Options', 'X-Content-Type-Options']);
  assert.deepEqual(miss({ ...good, 'strict-transport-security': 'max-age=0' }), ['Strict-Transport-Security']);
  assert.deepEqual(miss({ ...good, 'x-frame-options': 'ALLOWALL' }), ['X-Frame-Options']);
  // the lights built from it
  const ok = [{ url: '/', status: 401, missing: [] }, { url: '/version.txt', status: 200, missing: [] }];
  assert.equal(G.headersLight(ok).level, 'green');
  assert.equal(G.headersLight([{ url: '/', status: 401, missing: ['Strict-Transport-Security'] }, ok[1]]).level, 'yellow');
  assert.match(G.headersLight([{ url: '/', status: 401, missing: ['Strict-Transport-Security'] }, ok[1]]).fix, /Edge Certificates/);
  assert.equal(G.headersLight([{ url: '/', status: 401, missing: ['X-Frame-Options'] }, ok[1]]).level, 'red');
  assert.equal(G.headersLight([{ url: '/', status: null, missing: [] }, { url: '/version.txt', status: null, missing: [] }]).level, 'yellow');
  assert.equal(G.headersLight(ok).fix, undefined);
});

test('gate light: gate=on wants 401, gate=off wants 200 and an open /api/e, anything else is red', () => {
  const l = (o) => G.gateLight(o);
  assert.equal(l({ gate: 'on', rootStatus: 401 }).level, 'green');
  assert.equal(l({ gate: 'on', rootStatus: 200 }).level, 'red');
  assert.equal(l({ gate: 'off', rootStatus: 200, apiStatus: 200 }).level, 'green');
  assert.match(l({ gate: 'off', rootStatus: 200, apiStatus: 200 }).msg, /OPEN/);
  assert.equal(l({ gate: 'off', rootStatus: 401, apiStatus: 401 }).level, 'red');
  assert.equal(l({ gate: 'off', rootStatus: 200, apiStatus: 401 }).level, 'red'); // a secret the build cannot see still guards /api/e
  assert.match(l({ gate: 'off', rootStatus: 200, apiStatus: 401 }).fix, /GATE/);
  assert.equal(l({ gate: 'off', rootStatus: 200, apiStatus: 500 }).level, 'yellow');
  assert.equal(l({ gate: null, rootStatus: 401 }).level, 'yellow');   // an older build with no gate= word
  assert.equal(l({ gate: 'on', rootStatus: null }).level, 'yellow');
  assert.equal(l({ gate: 'on', rootStatus: 401 }).fix, undefined);
});

test('files light: yellow at 18,000, red at 19,500 or over 24 MiB, yellow when version.txt has no count yet', () => {
  const l = (files, largest) => G.filesLight({ files, largest, largestFile: 'data/graph.json' });
  assert.equal(l(15454, 10e6).level, 'green');
  assert.equal(l(17999, 10e6).level, 'green');
  assert.equal(l(18000, 10e6).level, 'yellow');
  assert.equal(l(19499, 10e6).level, 'yellow');
  assert.equal(l(19500, 10e6).level, 'red');
  assert.equal(l(100, 24 * MiB + 1).level, 'red');
  assert.equal(G.filesLight({ files: null }).level, 'yellow');
  assert.match(l(15454, 10237790).msg, /15,454 files of 20,000 allowed, largest file 10\.2 MB \(data\/graph\.json\)/);
});

test('www light: only a 301 to https://voidtv.net/ is green', () => {
  assert.equal(G.wwwLight({ status: 301, location: 'https://voidtv.net/' }).level, 'green');
  assert.equal(G.wwwLight({ status: 301, location: '/' }).level, 'yellow'); // relative to www is still www
  assert.equal(G.wwwLight({ status: 302, location: 'https://voidtv.net/' }).level, 'yellow');
  assert.equal(G.wwwLight({ status: 401 }).level, 'yellow');
  assert.equal(G.wwwLight({ status: 200 }).level, 'yellow');
  assert.equal(G.wwwLight({ status: null }).level, 'yellow');
  assert.match(G.wwwLight({ status: 200 }).fix, /Redirect Rules/);
});

test('live version against origin/master: yellow only when that commit is over 10 minutes old', () => {
  const now = Date.now(), sha = 'b'.repeat(40), old = 'a'.repeat(40);
  const l = (liveSha, remote) => G.liveVersionLight({ liveSha, remote, nowMs: now });
  assert.equal(l(sha, null), null);
  assert.equal(l(sha, { sha, atMs: now - 3600e3 }).level, 'green');
  assert.equal(l(sha.slice(0, 12), { sha, atMs: now - 3600e3 }).level, 'green');
  assert.equal(l(old, { sha, atMs: now - 2 * 60e3 }).level, 'green');
  assert.match(l(old, { sha, atMs: now - 2 * 60e3 }).msg, /still building/);
  assert.equal(l(old, { sha, atMs: now - 10 * 60e3 }).level, 'green');   // the edge: ten minutes is still allowed
  assert.equal(l(old, { sha, atMs: now - 11 * 60e3 }).level, 'yellow');
  assert.equal(l(old, { sha, atMs: now - 11 * 60e3, liveIsNewer: true }).level, 'green'); // this PC simply has not fetched
  assert.equal(l('unknown', { sha, atMs: now }).level, 'yellow');
  assert.equal(l('', { sha, atMs: now }).level, 'yellow');
  assert.match(l(old, { sha, atMs: now - 30 * 60e3 }).msg, /made 30 min ago/);
});

test('shrink light: red when the show count is down more than 10 percent against the last publish', () => {
  const before = { shows: 4774, episodes: 52622, source: 'catalog/count.json' };
  assert.equal(G.shrinkLight({ shows: 4774, episodes: 52622 }, before).level, 'green');
  assert.equal(G.shrinkLight({ shows: 4800, episodes: 53000 }, before).level, 'green');
  assert.equal(G.shrinkLight({ shows: 4400, episodes: 52000 }, before).level, 'green');
  assert.equal(G.shrinkLight({ shows: 4296, episodes: 52622 }, before).level, 'red');
  assert.equal(G.shrinkLight({ shows: 150, episodes: 900 }, before).level, 'red');
  assert.match(G.shrinkLight({ shows: 150, episodes: 900 }, before).msg, /shows 4774 -> 150/);
  assert.match(G.shrinkLight({ shows: 150, episodes: 900 }, before).fix, /--allow-shrink/);
  assert.equal(G.shrinkLight({ shows: 150, episodes: 900 }, null).level, 'yellow');
});

test('backup light: green under 7 days, yellow older or with failures, red when there is no stamp', () => {
  const now = Date.parse('2026-10-18T12:00:00Z'), day = 864e5;
  const stamp = (daysAgo, more) => ({ at: new Date(now - daysAgo * day).toISOString(), files: 86661, bytes: 2374e6, failed: 0, ...more });
  assert.equal(G.backupLight(null, now).level, 'red');
  assert.equal(G.backupLight({}, now).level, 'red');
  assert.match(G.backupLight(null, now).fix, /backup-cache\.js --to/);
  assert.equal(G.backupLight(stamp(0.1), now).level, 'green');
  assert.match(G.backupLight(stamp(0.1), now).msg, /today/);
  assert.equal(G.backupLight(stamp(6.9), now).level, 'green');
  assert.equal(G.backupLight(stamp(7), now).level, 'green');
  assert.equal(G.backupLight(stamp(7.1), now).level, 'yellow');
  assert.equal(G.backupLight(stamp(30), now).level, 'yellow');
  assert.equal(G.backupLight(stamp(1, { failed: 3 }), now).level, 'yellow');
  assert.match(G.backupLight(stamp(2), now).msg, /2 days ago: 86,661 files, 2374\.0 MB/);
});

// A fake fetch: a table of "METHOD url" -> { status, headers }. Anything not in the table fails like a dead network.
const fakeFetch = (table) => async (url, init) => {
  const hit = table[`${(init && init.method) || 'GET'} ${url}`];
  if (!hit) throw new Error('no route ' + url);
  return { status: hit.status, headers: new Headers(hit.headers || {}), body: null };
};
const SEC = { 'strict-transport-security': 'max-age=31536000', 'x-frame-options': 'DENY', 'x-content-type-options': 'nosniff' };

test('live lights with a fake fetch: a healthy gated site is green all the way down', async () => {
  const sha = 'c'.repeat(40);
  const body = G.versionText({ sha, at: 'now', gate: true, files: 15454, largest: 10e6, largestFile: 'data/graph.json', shows: 4774, episodes: 1 });
  const ls = await G.liveLights({
    base: 'https://voidtv.net', versionTextBody: body, nowMs: Date.now(), remote: { sha, atMs: Date.now() - 36e5 },
    doFetch: fakeFetch({
      'HEAD https://voidtv.net/': { status: 401, headers: SEC },
      'HEAD https://voidtv.net/version.txt': { status: 200, headers: SEC },
      'HEAD https://www.voidtv.net/': { status: 301, headers: { location: 'https://voidtv.net/' } },
    }),
  });
  const by = Object.fromEntries(ls.map((x) => [x.id, x]));
  assert.deepEqual(Object.keys(by).sort(), ['files', 'gate', 'headers', 'live:version', 'www']);
  for (const x of ls) assert.equal(x.level, 'green', x.id + ': ' + x.msg);
});

test('live lights with a fake fetch: an open site with the old password still guarding /api/e, no www rule, no headers', async () => {
  const sha = 'c'.repeat(40);
  const body = G.versionText({ sha, at: 'now', gate: false, files: 18500, largest: 10e6, largestFile: 'data/graph.json', shows: 4774, episodes: 1 });
  const ls = await G.liveLights({
    base: 'https://voidtv.net', versionTextBody: body, nowMs: Date.now(), remote: { sha: 'd'.repeat(40), atMs: Date.now() - 3 * 36e5 },
    doFetch: fakeFetch({
      'HEAD https://voidtv.net/': { status: 200 },
      'GET https://voidtv.net/api/e': { status: 401 },
      'HEAD https://voidtv.net/version.txt': { status: 200 },
      'HEAD https://www.voidtv.net/': { status: 200 },
    }),
  });
  const by = Object.fromEntries(ls.map((x) => [x.id, x.level]));
  assert.deepEqual(by, { 'live:version': 'yellow', gate: 'red', files: 'yellow', www: 'yellow', headers: 'red' });
});

test('live lights with a dead network never throw and never claim green', async () => {
  const body = G.versionText({ sha: 'e'.repeat(40), at: 'now', gate: true, files: 1, largest: 1, shows: 1, episodes: 1 });
  const ls = await G.liveLights({ base: 'https://voidtv.net', versionTextBody: body, nowMs: Date.now(), remote: null, doFetch: fakeFetch({}) });
  const by = Object.fromEntries(ls.map((x) => [x.id, x.level]));
  assert.equal(by.gate, 'yellow'); assert.equal(by.www, 'yellow'); assert.equal(by.headers, 'yellow'); assert.equal(by.files, 'green');
  assert.ok(!('live:version' in by), 'no origin/master known here, so no commit comparison');
});

test('another domain gets no www light (only voidtv.net is checked for www)', async () => {
  const body = G.versionText({ sha: 'e'.repeat(40), at: 'now', gate: true, files: 1, largest: 1, shows: 1, episodes: 1 });
  const ls = await G.liveLights({ base: 'https://example.test', versionTextBody: body, nowMs: Date.now(), remote: null, doFetch: fakeFetch({ 'HEAD https://example.test/': { status: 401, headers: SEC }, 'HEAD https://example.test/version.txt': { status: 200, headers: SEC } }) });
  assert.ok(!ls.some((x) => x.id === 'www'));
});

test('no em dash in the files this batch wrote', () => {
  for (const f of ['scripts/lib/siteguards.js', 'scripts/backup-cache.js', 'scripts/site.js', 'functions/_middleware.js', 'functions/api/e.js']) {
    const text = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    assert.ok(!text.includes('—'), f + ' has an em dash');
  }
});
