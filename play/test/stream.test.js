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
  assert.equal((await handle(ask('game=big-dos&piece=0', null), GAMES, a.fetchImpl)).status, 403, 'audit P21a: no header, no piece');
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

// A small zip built here: each file stored or deflated, with its local header, the table and the end record.
function makeZip(files) {
  const zlib = require('zlib');
  const parts = [], central = [];
  let at = 0;
  for (const f of files) {
    const name = Buffer.from(f.name), body = f.deflate ? zlib.deflateRawSync(f.data) : f.data;
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(f.deflate ? 8 : 0, 8);
    h.writeUInt32LE(body.length, 18); h.writeUInt32LE(f.data.length, 22); h.writeUInt16LE(name.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(f.deflate ? 8 : 0, 10);
    c.writeUInt32LE(body.length, 20); c.writeUInt32LE(f.data.length, 24); c.writeUInt16LE(name.length, 28); c.writeUInt32LE(at, 42);
    parts.push(h, name, body); central.push(c, name);
    at += 30 + name.length + body.length;
  }
  const cd = Buffer.concat(central), e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(files.length, 8); e.writeUInt16LE(files.length, 10);
  e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(at, 16);
  return new Uint8Array(Buffer.concat([...parts, cd, e]));
}

test('T21 player half: the synchronous decoder matches zlib and stops a file that grows past its stated size', () => {
  const zlib = require('zlib'), crypto = require('crypto');
  const { inflateRaw } = require('../src/inflate.js');
  for (const data of [Buffer.alloc(0), Buffer.from('abc'.repeat(100000)), crypto.randomBytes(300000)]) {
    for (const level of [0, 1, 9]) assert.deepEqual(Buffer.from(inflateRaw(zlib.deflateRawSync(data, { level }), data.length)), data);
  }
  assert.throws(() => inflateRaw(zlib.deflateRawSync(Buffer.alloc(5000)), 100), /bigger than it says/);
});

test('T21 player half: a streamed zip reads its table from the end and fetches a file only when the game opens it', () => {
  const Lazy = require('../src/lazyzip.js'), Unzip = require('../src/unzip.js'), { inflateRaw } = require('../src/inflate.js');
  const crypto = require('crypto');
  const big = crypto.randomBytes(9 * MB);                       // stored, so it spans two pieces
  const zip = makeZip([{ name: 'GAME/RUN.BAT', data: Buffer.from('ORION2.EXE\r\n') },
    { name: 'GAME/ORION2.EXE', data: Buffer.from('MZ'.repeat(50000)), deflate: true },
    { name: 'GAME/INTRO.LBX', data: big }, { name: '../evil.txt', data: Buffer.from('x') }]);
  const asked = [];
  const getPiece = (n) => { asked.push(n); return zip.subarray(n * Lazy.PIECE, Math.min(zip.length, (n + 1) * Lazy.PIECE)); };
  const deps = { entries: Unzip.entries, safe: Unzip.safe, inflateRaw };
  const z = Lazy.open(zip.length, getPiece, deps);
  assert.deepEqual(z.entries.map((e) => e.name), ['GAME/RUN.BAT', 'GAME/ORION2.EXE', 'GAME/INTRO.LBX', '../evil.txt']);
  assert.deepEqual(asked, [1], 'only the last piece, for the table');
  const made = {};
  const FS = { mkdirTree() {}, createFile(parent, name) { return (made[parent + '/' + name] = {}); } };
  const loaded = [];
  Lazy.mount(FS, z, '/game/disk', deps, (rel, n) => loaded.push(rel + ' ' + n));
  assert.deepEqual(Object.keys(made), ['/game/disk/GAME/RUN.BAT', '/game/disk/GAME/ORION2.EXE', '/game/disk/GAME/INTRO.LBX'], 'no path climbs out');
  assert.equal(made['/game/disk/GAME/INTRO.LBX'].usedBytes, 9 * MB, 'its size is known before a byte arrives');
  assert.equal(loaded.length, 0);
  assert.equal(Buffer.from(made['/game/disk/GAME/ORION2.EXE'].contents).toString(), 'MZ'.repeat(50000));
  assert.deepEqual(Buffer.from(made['/game/disk/GAME/INTRO.LBX'].contents), big);
  assert.deepEqual(loaded, ['GAME/ORION2.EXE 100000', 'GAME/INTRO.LBX ' + 9 * MB]);
  made['/game/disk/GAME/RUN.BAT'].contents = new Uint8Array([65]); made['/game/disk/GAME/RUN.BAT'].usedBytes = 1;
  assert.equal(made['/game/disk/GAME/RUN.BAT'].usedBytes, 1, 'a file the game writes behaves as usual');
});

test('T21 player half: the worker streams only a card marked to stream, by game id, and the local server runs the same Function', () => {
  const fs = require('fs');
  const w = fs.readFileSync(path.join(__dirname, '..', 'src', 'core-worker.js'), 'utf8');
  for (const bit of ["importScripts('keys.js', 'unzip.js', 'inflate.js', 'lazyzip.js');", 'if (msg.stream && msg.start) {', "x.open('GET', url + '&piece=' + n, false);"]) assert.ok(w.includes(bit), bit);
  assert.ok(fs.readFileSync(path.join(__dirname, '..', 'src', 'runner.js'), 'utf8').includes("stream: card.archive.stream ? { url: new URL('/api/piece?game=' + encodeURIComponent(card.id), location.href).href, size: card.archive.size } : null,"));
  assert.ok(fs.readFileSync(path.join(__dirname, '..', 'serve.js'), 'utf8').includes("if (p === '/api/piece') return piece(req, res);"));
});
