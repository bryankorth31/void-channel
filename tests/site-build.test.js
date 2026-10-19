// Tests for scripts/site.js in a throwaway copy of the build (audit fix batch B, B3: CF-002 CF-003 SP-016 F-004 F-005 CF-008 CF-012 CF-018).
// Run: node --test tests/site-build.test.js
// Each test copies only the files the build needs into a temporary folder with a tiny made-up catalog, runs that copy's scripts/site.js
// and reads what it wrote. The real site/ folder, the real catalog and the network are never touched.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const REPO = path.join(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'site-build-test-'));
test.after(() => { fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); });

const write = (root, rel, text) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
const read = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8');
function grid(i, eps = 5) {
  return {
    show: `Test Show ${i}`, slug: `test-show-${i}`, type: 'Drama', network: 'TestNet', matchedAt: '2026-01-01T00:00:00.000Z',
    tvmaze: { id: i, runtime: 30, premiered: '2000-01-01' },
    seasons: [{ season: 1, episodes: Array.from({ length: eps }, (_, k) => ({
      number: k + 1, name: `Episode ${k + 1}`, airdate: '2000-01-01', state: 'LIVE', alternates: [],
      file: { name: `e${k + 1}`, file: `e${k + 1}.mp4`, item: `item-${i}`, url: `https://archive.org/download/item-${i}/e${k + 1}.mp4`, format: 'h.264', playable: true, seconds: 1800, sizeMB: 90, conf: 0.9 },
    })) }],
  };
}
let n = 0;
// A copy of the build with `shows` grids. profile 'tiny' (any size) or the default voidtv profile (refuses under 100 shows).
function tree({ shows = 12, profile = 'tiny' } = {}) {
  const root = path.join(TMP, 'case' + (++n));
  for (const f of ['scripts/site.js', 'scripts/lib/app.js', 'scripts/lib/profile.js', 'scripts/lib/siteguards.js', 'player/tools/rank-sources.js', 'player/src/core.js', 'player/src/icons.js', 'player/src/player.js', 'player/src/player.css']) write(root, f, fs.readFileSync(path.join(REPO, f), 'utf8'));
  fs.cpSync(path.join(REPO, 'functions'), path.join(root, 'functions'), { recursive: true });
  write(root, 'scripts/show-list.json', JSON.stringify({ types: ['Drama'], shows: [] }));
  if (profile !== 'voidtv') write(root, `profiles/${profile}/profile.json`, JSON.stringify({ siteName: 'Tiny', domain: 'https://tiny.test' }));
  for (let i = 0; i < shows; i++) write(root, `catalog/shows/test-show-${i}.json`, JSON.stringify(grid(i)));
  return root;
}
function build(root, { env = {}, args = ['--base', 'https://voidtv.net'], profile = 'tiny' } = {}) {
  const e = { ...process.env, CF_PAGES_COMMIT_SHA: 'f'.repeat(40) }; delete e.SITE_PASSWORD; delete e.GATE; delete e.SITE_ALLOW_SHRINK; delete e.CF_PAGES; delete e.VOID_PROFILE;
  if (profile !== 'voidtv') e.VOID_PROFILE = profile;
  const r = spawnSync(process.execPath, [path.join(root, 'scripts', 'site.js'), ...args], { cwd: TMP, encoding: 'utf8', env: { ...e, ...env } });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

test('SITE_PASSWORD set: every page runs through the gate, version.txt says gate=on', () => {
  const root = tree();
  const r = build(root, { env: { SITE_PASSWORD: 'x' } });
  assert.equal(r.status, 0, r.out);
  assert.deepEqual(JSON.parse(read(root, 'site/_routes.json')), { version: 1, include: ['/*'], exclude: ['/assets/*'] });
  const v = read(root, 'site/version.txt');
  assert.ok(v.startsWith('f'.repeat(40) + ' '));
  assert.match(v, /\ngate=on files=\d+ largest=\d+ shows=12 episodes=60 largestFile=\S+\n$/);
  assert.match(r.out, /GATE: on/);
});

test('SITE_PASSWORD not set: only /api and /q run as Functions, version.txt says gate=off, and nothing else differs from the gated build', () => {
  const a = tree(), b = tree();
  assert.equal(build(a, { env: { SITE_PASSWORD: 'x' } }).status, 0);
  const r = build(b);
  assert.equal(r.status, 0, r.out);
  assert.deepEqual(JSON.parse(read(b, 'site/_routes.json')), { version: 1, include: ['/api/*', '/q/*'], exclude: [] });
  assert.match(read(b, 'site/version.txt'), /\ngate=off files=/);
  assert.match(r.out, /GATE: off/);
  const files = (root) => { const out = []; const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p) : out.push(path.relative(path.join(root, 'site'), p).split(path.sep).join('/')); } }; walk(path.join(root, 'site')); return out.sort(); };
  assert.deepEqual(files(a), files(b));
  const differ = files(a).filter((f) => read(a, 'site/' + f) !== read(b, 'site/' + f));
  assert.deepEqual(differ.sort(), ['_routes.json', 'version.txt']);
});

test('the spare GATE=on variable switches the gate on for a build that cannot see an encrypted SITE_PASSWORD', () => {
  const root = tree();
  assert.equal(build(root, { env: { GATE: 'on' } }).status, 0);
  assert.deepEqual(JSON.parse(read(root, 'site/_routes.json')).include, ['/*']);
  assert.match(read(root, 'site/version.txt'), /gate=on/);
});

test('--open is refused before anything is touched, and the build still works without it', () => {
  const root = tree();
  assert.equal(build(root).status, 0);
  const before = read(root, 'site/version.txt');
  const r = build(root, { args: ['--base', 'https://voidtv.net', '--open'], env: { SITE_PASSWORD: 'x' } });
  assert.equal(r.status, 2);
  assert.match(r.out, /--open no longer exists/);
  assert.equal(read(root, 'site/version.txt'), before, 'the earlier output was not deleted');
});

test('what the build writes: headers, robots, an empty redirects file, the gate and promos functions copied', () => {
  const root = tree();
  assert.equal(build(root, { env: { SITE_PASSWORD: 'x' } }).status, 0);
  const G = require('../scripts/lib/siteguards');
  assert.equal(read(root, 'site/_headers'), G.headersFile());
  assert.equal(read(root, 'site/robots.txt'), 'User-agent: *\nAllow: /\nDisallow: /data/\n');
  const red = read(root, 'site/_redirects');
  assert.ok(!/https?:\/\//.test(red), 'Pages rejects an absolute address in _redirects');
  assert.ok(red.split('\n').filter(Boolean).every((l) => l.startsWith('#')), 'comments only: there are no rules');
  for (const f of ['_middleware.js', 'api/e.js', 'q/[code].js']) assert.equal(read(root, 'site/functions/' + f), fs.readFileSync(path.join(REPO, 'functions', f), 'utf8'));
  assert.ok(fs.existsSync(path.join(root, 'site', 'show', 'test-show-3', 'index.html')));
});

test('still refuses to build under 100 shows (the VOIDtv profile)', () => {
  const root = tree({ shows: 10, profile: 'voidtv' });
  const r = build(root, { profile: 'voidtv' });
  assert.equal(r.status, 1);
  assert.match(r.out, /SITE WOULD SHIP WITH 10 SHOWS/);
});

test('shrink check on this PC: a catalog more than 10 percent smaller than publish-state.json is refused, equal or bigger builds, the override works', () => {
  const root = tree({ shows: 12 });
  const state = (shows, episodes) => write(root, 'catalog/cache/publish-state.json', JSON.stringify({ shows, episodes, at: 'x', commit: 'abc' }));
  state(12, 60);
  assert.equal(build(root).status, 0, 'same size');
  state(11, 55);
  assert.equal(build(root).status, 0, 'growing');
  state(13, 65);
  assert.equal(build(root).status, 0, '12 against 13 is under 10 percent down');
  state(4774, 52622);
  const r = build(root);
  assert.equal(r.status, 1);
  assert.match(r.out, /CATALOG SHRANK: shows 4774 -> 12, episodes 52622 -> 60 against catalog\/cache\/publish-state\.json/);
  assert.ok(!fs.existsSync(path.join(root, 'site', 'index.html')), 'nothing deployable is left behind');
  const ok = build(root, { env: { SITE_ALLOW_SHRINK: '1' } });
  assert.equal(ok.status, 0, ok.out);
  assert.match(ok.out, /SITE_ALLOW_SHRINK=1 is set/);
  fs.rmSync(path.join(root, 'catalog', 'cache', 'publish-state.json'));
  const none = build(root);
  assert.equal(none.status, 0); assert.match(none.out, /no earlier published count/);
});

// A stand-in for the live site: a separate process that answers every request with the given text (the build waits on its child, so the
// server must not share this process).
function fakeLive(body) {
  return new Promise((resolve, reject) => {
    const code = "const s=require('http').createServer((q,r)=>r.end(process.argv[1]));s.listen(0,'127.0.0.1',()=>console.log(s.address().port))";
    const child = spawn(process.execPath, ['-e', code, body], { stdio: ['ignore', 'pipe', 'ignore'] });
    child.stdout.once('data', (d) => resolve({ port: +String(d).trim(), stop: () => child.kill() }));
    child.once('error', reject);
  });
}
const CF = { CF_PAGES: '1' };

test('shrink check on a Cloudflare build (CF_PAGES=1): the counts come from the live /version.txt, and trouble reaching it only skips the check', async () => {
  const root = tree({ shows: 12 });
  const live = await fakeLive('0123abc 2026-10-18T00:00:00Z\ngate=on files=100 largest=1 shows=4774 episodes=52622\n');
  try {
    const base = ['--base', `http://127.0.0.1:${live.port}`];
    const r = build(root, { env: CF, args: base });
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, new RegExp(`CATALOG SHRANK: shows 4774 -> 12, episodes 52622 -> 60 against http://127.0.0.1:${live.port}/version\\.txt`));
    assert.match(r.out, /SITE_ALLOW_SHRINK = 1/);
    assert.equal(build(root, { env: { ...CF, SITE_ALLOW_SHRINK: '1' }, args: base }).status, 0, 'the override');
    assert.equal(build(root, { args: base }).status, 0, 'off Cloudflare (CF_PAGES not set) the live site is never asked');
  } finally { live.stop(); }
  const same = await fakeLive('0123abc t\ngate=on files=100 largest=1 shows=12 episodes=60\n');
  try { assert.equal(build(root, { env: CF, args: ['--base', `http://127.0.0.1:${same.port}`] }).status, 0, 'same size as the live site'); } finally { same.stop(); }
  const old = await fakeLive('0123abc 2026-10-18T00:00:00Z\n');
  try {
    const r = build(root, { env: CF, args: ['--base', `http://127.0.0.1:${old.port}`] });
    assert.equal(r.status, 0, r.out); assert.match(r.out, /no earlier published count/);          // a live version.txt from before this change has no counts
  } finally { old.stop(); }
  const dead = await fakeLive('x'); dead.stop(); await new Promise((r) => setTimeout(r, 300));
  const r = build(root, { env: CF, args: ['--base', `http://127.0.0.1:${dead.port}`] });
  assert.equal(r.status, 0, r.out); assert.match(r.out, /no earlier published count/);              // nothing answers: the build goes on
});

test('a grid file that does not parse is warned about by name, and the build carries on', () => {
  const root = tree({ shows: 12 });
  write(root, 'catalog/shows/broken-one.json', '{"slug":"broken-one","seasons":[');
  const r = build(root);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /WARNING: 1 show grid file did not parse and is missing from the site: broken-one\.json/);
});

test('a file over 24 MiB is refused and the output is removed so nothing half-built is left to deploy', () => {
  const root = tree();
  write(root, 'assets/brand/huge.bin', 'x'.repeat(25 * 1024 * 1024));
  const r = build(root);
  assert.equal(r.status, 1);
  assert.match(r.out, /SITE TOO BIG FOR PAGES: assets\/brand\/huge\.bin is 25\.0 MiB/);
  assert.ok(!fs.existsSync(path.join(root, 'site')), 'the whole output folder is gone');
  fs.rmSync(path.join(root, 'assets', 'brand', 'huge.bin'));
  write(root, 'assets/brand/big.bin', 'x'.repeat(23 * 1024 * 1024));
  assert.equal(build(root).status, 0, 'under the line it builds');
  assert.match(read(root, 'site/version.txt'), /largest=24117248 shows=12 episodes=60 largestFile=assets\/brand\/big\.bin/);
});
