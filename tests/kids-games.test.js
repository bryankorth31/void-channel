// Tests for the kids Computer games area (scripts/lib/games/build.js, workers/kids/worker.js): PLAY's player on the kids
// site with only kids cards, no donation, no phone pad and no link that leaves the site.
// Run: node --test tests/kids-games.test.js   (the build test needs PLAY: this checkout's play/ or ../void-channel/play)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const G = require('../scripts/lib/games/build');

const ROOT = path.join(__dirname, '..');
const PLAY = G.playDir(ROOT);

test('the kids copy of the game page keeps nothing that leaves the site, and no donation', { skip: !PLAY && 'PLAY not found' }, () => {
  const h = G.kidsGamePage(fs.readFileSync(path.join(PLAY, 'game.html'), 'utf8'), 'abcdef012345');
  assert.match(h, /<html lang="en" data-kids>/);
  assert.match(h, /<meta name="play-build" content="abcdef012345">/);
  assert.doesNotMatch(h, /https?:\/\//, 'no outside address at all');
  assert.doesNotMatch(h, /target="_blank"/);
  assert.doesNotMatch(h, /id="give"|give-card|class="donate"|Donate/i, 'no donation in front of a child');
  assert.doesNotMatch(h, /href="\/takedown"/);
  for (const id of ['from', 'core-name', 'core-licence', 'src-core', 'core-terms', 'core-terms-link', 'cheat-src', 'b-games', 'b-phones', 'cover-phone', 'm-phones']) assert.match(h, new RegExp('id="' + id + '"'), id + ' is still there for PLAY\'s script');
  assert.match(h, /<script src="src\/play\.js\?v=abcdef012345">/, 'PLAY\'s own script, with this build');
  assert.match(fs.readFileSync(path.join(PLAY, 'src', 'play.js'), 'utf8'), /const KIDS = document\.documentElement\.hasAttribute\('data-kids'\);/, 'PLAY knows a kids page');
});

test('a change to play/game.html that the kids copy cannot place stops the build', () => {
  assert.throws(() => G.kidsGamePage('<html lang="en"><head></head><body></body></html>', 'abcdef012345'), /play\/game\.html changed/);
  const sneaky = '<html lang="en"><head><meta name="theme-color" content="#07080c"><meta content="PLAY"><link rel="manifest" href="manifest.webmanifest"><link rel="apple-touch-icon" href="/assets/brand/apple-touch-icon.png"><title>PLAY | voidtv.net</title><link rel="icon" href="/favicon.ico"><link rel="stylesheet" href="play.css"></head><body>'
    + '<a class="mark" href="/">x</a><span class="tag">PLAY</span><button type="button" id="give"></button><div id="give-card"></div><p class="donate"></p><p id="credits" class="credits"></p><p class="cheat-src"></p>'
    + '<a href="https://example.com/">out</a><script src="src/play.js"></script></body></html>';
  assert.throws(() => G.kidsGamePage(sneaky, 'abcdef012345'), /a link out is left/);
});

test('the build carries only kids cards, their engines and our own pictures', { skip: !PLAY && 'PLAY not found' }, () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'kids-games-'));
  const art = fs.mkdtempSync(path.join(os.tmpdir(), 'kids-games-art-'));
  try {
    const kids = G.kidsCards(PLAY, null).map((g) => g.card);
    assert.ok(kids.length > 0, 'PLAY has kids cards');
    for (const c of kids.slice(0, -1)) fs.writeFileSync(path.join(art, c.id + '.jpg'), 'jpg');   // the last one has no picture yet
    const r = G.buildGames(out, ROOT, { artDir: art });
    assert.equal(r.games, kids.length - 1, 'a game with no picture of ours is left out');
    const cards = fs.readdirSync(path.join(out, 'games', 'cards'));
    assert.equal(cards.length, kids.length - 1);
    for (const f of cards) assert.equal(JSON.parse(fs.readFileSync(path.join(out, 'games', 'cards', f), 'utf8')).kids, true, f);
    const all = fs.readdirSync(path.join(PLAY, 'cards')).filter((f) => f.endsWith('.json'));
    assert.ok(all.length > cards.length, 'the rest of PLAY stays off kids');
    for (const f of fs.readdirSync(path.join(out, 'games', 'engine'))) assert.ok(r.engines.some((e) => f.startsWith(e + '.') || e === f + '/'), f + ' is an engine a kids card uses');
    for (const d of ['drafts', 'library', 'cheats', 'tools', 'rooms']) assert.equal(fs.existsSync(path.join(out, 'games', d)), false, d + ' is not copied');
    assert.equal(fs.existsSync(path.join(out, 'games', 'shelf', 'index.json')), false, 'no PLAY shelf list, so no other game can be found');
    assert.equal(fs.readdirSync(path.join(out, 'games', 'art')).length, kids.length - 1, 'our own pictures, where PLAY\'s kids page looks (art/<id>.jpg)');
    const shelf = fs.readFileSync(path.join(out, 'games', 'index.html'), 'utf8');
    assert.doesNotMatch(shelf, /https?:\/\/(?!www\.w3\.org)/, 'the shelf loads and links nothing outside');
    for (const f of cards) assert.match(shelf, new RegExp('game\\.html\\?game=' + f.replace('.json', '') + '"'));
  } finally { fs.rmSync(out, { recursive: true, force: true }); fs.rmSync(art, { recursive: true, force: true }); }
});

test('the worker isolates /games/ for the engine, and a card that is not there is a plain 404', async () => {
  const W = (await import(pathToFileURL(path.join(ROOT, 'workers', 'kids', 'worker.js')).href)).default;
  const have = new Set(['/games/', '/games/game.html', '/games/cards/number-munchers-1990.json']);
  const A = { fetch: async (rq) => { const p = new URL(rq.url).pathname; return have.has(p) ? new Response('file ' + p, { headers: { 'content-type': p.endsWith('.json') ? 'application/json' : 'text/html' } }) : new Response('<!doctype html>home', { headers: { 'content-type': 'text/html' } }); } };
  const get = (p) => W.fetch(new Request('https://kids.voidtv.net' + p), { ASSETS: A });
  for (const p of ['/games/', '/games/game.html', '/games/cards/number-munchers-1990.json']) {
    const res = await get(p);
    assert.equal(res.status, 200, p);
    assert.equal(res.headers.get('cross-origin-opener-policy'), 'same-origin', p);
    assert.equal(res.headers.get('cross-origin-embedder-policy'), 'require-corp', p);
    assert.match(res.headers.get('content-security-policy-report-only'), /'wasm-unsafe-eval'/, p);
    assert.equal(res.headers.get('x-frame-options'), 'DENY', p);
  }
  const doom = await get('/games/cards/doom-1993.json');
  assert.equal(doom.status, 404, 'the site\'s home page is never handed out as a card');
  const home = await get('/');
  assert.equal(home.headers.get('cross-origin-embedder-policy'), null, 'the rest of the site is unchanged');
});
