// The hunters' Archive search pages are kept gzipped (scripts/lib/cachefile.js); everything else in the cache stays plain JSON.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readCached, writeCached, cachedPath } = require('../scripts/lib/cachefile');

const withDir = (fn) => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-')); try { return fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); } };
const page = { items: [{ identifier: 'x', title: 'Show', description: 'a long description '.repeat(200) }], count: 1 };

test('a search page is written gzipped, read back unchanged, and replaces a plain copy left from before', () => {
  withDir((dir) => {
    for (const key of ['scrape-show-0', 'mscrape-123', 'scout-tv-1']) {
      const f = path.join(dir, key + '.json');
      fs.writeFileSync(f, '{"old":true}');
      assert.equal(writeCached(f, JSON.stringify(page)), f + '.gz');
      assert.equal(fs.existsSync(f), false, key + ': the plain copy is gone');
      assert.ok(fs.statSync(f + '.gz').size < JSON.stringify(page).length / 3, key + ': smaller on disk');
      assert.deepEqual(readCached(f), page);
      assert.equal(fs.existsSync(f + '.gz.tmp'), false);
    }
  });
});

test('other cache files stay plain, a plain search page from before is still read, and a missing page is undefined', () => {
  withDir((dir) => {
    const t = path.join(dir, 'tvmaze-show.json');
    assert.equal(writeCached(t, '{"id":1}'), t);
    assert.deepEqual(JSON.parse(fs.readFileSync(t, 'utf8')), { id: 1 });
    const old = path.join(dir, 'scrape-old-0.json');
    fs.writeFileSync(old, JSON.stringify(page));
    assert.equal(cachedPath(old), old);
    assert.deepEqual(readCached(old), page);
    assert.equal(readCached(path.join(dir, 'scrape-none-0.json')), undefined);
  });
});
