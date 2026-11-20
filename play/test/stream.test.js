// PLAY T21: the voidtv.net pass-through for big games (functions/api/piece.js; Bryan, 20 Nov 2026: "Pass through
// voidtv"). Called with hand-made requests and a stand-in Archive; no network. Run: node --test "play/test/*.test.js"
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..', '..');
const load = () => import(pathToFileURL(path.join(ROOT, 'functions', 'api', 'piece.js')).href);
const Tool = require('../tools/shelf.js');
const MB = 1024 * 1024;
const GAMES = { 'big-dos': { item: 'msdos_Big_Game', file: 'Big Game/disc.zip', size: 20 * MB } };

// A stand-in Archive: /download/ redirects to a data server, which answers Range with 206 and the file's total.
function archive(opts = {}) {
  const asked = [];
  const fetchImpl = async (url, init) => {
    asked.push({ url, range: init.headers.Range, redirect: init.redirect, cf: init.cf });
    if (url.startsWith('https://archive.org/download/')) {
      return new Response(null, { status: 302, headers: { location: opts.to || url.replace('https://archive.org/download/', 'https://dn1.ca.archive.org/0/items/') } });
    }
    const [, a, b] = /bytes=(\d+)-(\d+)/.exec(init.headers.Range);
    return new Response(new Uint8Array(b - a + 1), { status: opts.status || 206, headers: { 'content-range': 'bytes ' + a + '-' + b + '/' + (opts.total || 20 * MB) } });
  };
  return { fetchImpl, asked };
}
const ask = (q, site = 'same-origin') => new Request('https://voidtv.net/api/piece?' + q, { headers: site ? { 'sec-fetch-site': site } : {} });

test('a piece of a streamed game comes through in 8 MB pieces, the last one short, nothing cached', async () => {
  const { handle, PIECE } = await load();
  assert.equal(PIECE, 8 * MB);
  const a = archive();
  const r = await handle(ask('game=big-dos&piece=2'), GAMES, a.fetchImpl);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-length'), String(4 * MB));
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal((await r.arrayBuffer()).byteLength, 4 * MB);
  assert.equal(a.asked[0].url, 'https://archive.org/download/msdos_Big_Game/Big%20Game/disc.zip');
  assert.equal(a.asked[1].url, 'https://dn1.ca.archive.org/0/items/msdos_Big_Game/Big%20Game/disc.zip');
  assert.equal(a.asked[1].range, 'bytes=' + 16 * MB + '-' + (20 * MB - 1));
  assert.equal(a.asked[0].redirect, 'manual');
  assert.deepEqual(a.asked[0].cf, { cacheTtlByStatus: { '100-599': -1 } });
});

test('no open proxy: only games on the list, never an address, only from our own pages', async () => {
  const { handle } = await load();
  const a = archive();
  assert.equal((await handle(ask('game=oregon-trail-1990&piece=0'), GAMES, a.fetchImpl)).status, 404);
  assert.equal((await handle(ask('game=__proto__&piece=0'), GAMES, a.fetchImpl)).status, 404);
  assert.equal((await handle(ask('url=https://example.com/x&piece=0'), GAMES, a.fetchImpl)).status, 404);
  assert.equal((await handle(ask('game=big-dos&piece=0', 'cross-site'), GAMES, a.fetchImpl)).status, 403);
  assert.equal((await handle(ask('game=big-dos&piece=-1'), GAMES, a.fetchImpl)).status, 400);
  assert.equal((await handle(ask('game=big-dos&piece=3'), GAMES, a.fetchImpl)).status, 416);
  assert.equal(a.asked.length, 0, 'none of these reached the Archive');
});

test('a redirect away from archive.org is refused, and a replaced file is caught by its size', async () => {
  const { handle } = await load();
  assert.equal((await handle(ask('game=big-dos&piece=0'), GAMES, archive({ to: 'https://evil.example/x' }).fetchImpl)).status, 502);
  assert.equal((await handle(ask('game=big-dos&piece=0'), GAMES, archive({ to: 'https://archive.org.evil.example/x' }).fetchImpl)).status, 502);
  assert.equal((await handle(ask('game=big-dos&piece=0'), GAMES, archive({ total: 19 * MB }).fetchImpl)).status, 409);
  assert.equal((await handle(ask('game=big-dos&piece=0'), GAMES, archive({ status: 200 }).fetchImpl)).status, 502, 'a whole-file answer is not passed on');
});

test('the list holds only cards marked to stream, with a size, and drops a game the nightly check found gone', () => {
  const card = (id, extra) => ({ id, title: id, system: 'dos', core: 'dosbox-pure', controls: { kind: 'dos-keys' }, actions: [],
    archive: Object.assign({ item: 'i' + id, file: 'f.zip', start: 'X.EXE', size: 5 }, extra) });
  const list = Tool.buildStream([card('a', { stream: true }), card('b', {}), card('c', { stream: true }), card('d', { stream: true, size: 0 })],
    { games: { c: { gone: true } } });
  assert.deepEqual(Object.keys(list), ['a']);
  assert.match(Tool.streamModule(list), /^\/\/ Written by play\/tools\/shelf\.js[^\n]*\nexport default \{/);
});
