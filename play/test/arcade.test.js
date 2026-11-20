// VoidTV PLAY: the arcade engines (MAME's own web build). Licence: GPL-2.0-or-later (play/LICENSE).
// Bryan, 20 Nov 2026: arcade on current MAME ("no line . current mame", then "No line": no donation line).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const zlib = require('node:zlib');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'engine', 'mame');
const record = fs.readFileSync(path.join(ROOT, 'core', 'mame.txt'), 'utf8');
const commit = (record.match(/^commit: ([0-9a-f]{40})$/m) || [])[1];
const engines = fs.readdirSync(DIR).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3));
const LIMIT = 25 * 1024 * 1024;    // Cloudflare Pages' largest single file
// Engines are kept gzipped (a 68000 engine is 26 to 31 MiB plain); the arcade runner unpacks them in the browser.

test('the build record names the exact MAME commit, its licence and the build command', () => {
  assert.ok(commit, 'a 40-character commit');
  assert.match(record, /^source: https:\/\/github\.com\/mamedev\/mame$/m);
  assert.match(record, /^licence: GPL-2\.0/m);
  assert.match(record, /^changes to MAME: none$/m);
  assert.match(record, /make -j\d+ .*SOURCES=/);
  assert.match(record, /gzip -9 -n /, 'the step that stores each engine gzipped');
});

test('there is at least one arcade engine, and every one is listed in the record', () => {
  assert.ok(engines.length > 0);
  for (const name of engines) assert.match(record, new RegExp('^' + name + ': SOURCES=src/mame/', 'm'), name);
});

for (const name of engines) {
  test(name + ': its gzipped wasm is there, fits Cloudflare\'s 25 MB limit and unpacks to real wasm', () => {
    const gz = path.join(DIR, name + '.wasm.gz');
    assert.ok(fs.existsSync(gz), name + '.wasm.gz');
    assert.ok(fs.statSync(gz).size < LIMIT, (fs.statSync(gz).size / 1048576).toFixed(1) + ' MB');
    const wasm = zlib.gunzipSync(fs.readFileSync(gz));
    assert.deepEqual([...wasm.subarray(0, 4)], [0, 0x61, 0x73, 0x6d], 'starts \\0asm');
    assert.ok(!fs.existsSync(path.join(DIR, name + '.wasm')), 'no plain .wasm beside it: the repo carries one copy');
  });

  test(name + ': the script opens with its notice: MAME, the licence, the exact source', () => {
    const first = fs.readFileSync(path.join(DIR, name + '.js'), 'utf8').split('\n')[0];
    assert.ok(first.startsWith('/* MAME '), first.slice(0, 60));
    assert.ok(first.includes('Licence: GPL-2.0'));
    assert.ok(first.includes('https://github.com/mamedev/mame/tree/' + commit));
  });
}

test('MAME\'s own licence travels beside the engines, and no game file or BIOS does', () => {
  assert.match(fs.readFileSync(path.join(DIR, 'COPYING'), 'utf8'), /MAME as a whole is made available under the terms of the GNU General\s+Public License/);
  for (const f of fs.readdirSync(DIR)) assert.match(f, /^(COPYING|[a-z0-9-]+\.(js|wasm\.gz))$/, f);
});

test('the papers name MAME, its commit and Bryan\'s no-line ruling', () => {
  const readme = fs.readFileSync(path.join(ROOT, 'core', 'README.md'), 'utf8');
  const sources = fs.readFileSync(path.join(ROOT, 'SOURCES.md'), 'utf8');
  assert.ok(readme.includes(commit), 'core/README.md');
  assert.ok(sources.includes('https://github.com/mamedev/mame'), 'SOURCES.md');
  assert.match(sources, /no CASH donation line/);
});
