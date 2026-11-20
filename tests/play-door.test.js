// The voidtv.net door to PLAY (play/, plan T19): a Games link in the site header opens /play/, the site build copies only what a
// browser loads, and only the game player (not the shelf) is cross-origin isolated. Run: node --test tests/play-door.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const guards = require('../scripts/lib/siteguards');

const REPO = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8').replace(/\r\n/g, '\n');

test('the site header has a Games link to /play/', () => {
  assert.match(read('scripts/lib/app.js'), /<a class="mine-link" href="\$\{base\}play\/" title="Old games from the Internet Archive, free to play"><i class="ico play"><\/i> Games<\/a>/);
});

test('the player and its files are isolated, the shelf is not', () => {
  const h = guards.headersFile();
  const block = (p) => { const i = h.indexOf('\n' + p + '\n'); if (i < 0) return null; const rest = h.slice(i + p.length + 2); const end = rest.search(/\n\//); return end < 0 ? rest : rest.slice(0, end); };
  for (const p of ['/play/game.html', '/play/game', '/play/src/*', '/play/engine/*', '/play/cards/*']) {
    const b = block(p);
    assert.ok(b, p);
    assert.match(b, /Cross-Origin-Opener-Policy: same-origin/, p);
    assert.match(b, /Cross-Origin-Embedder-Policy: require-corp/, p);
  }
  assert.equal(block('/play/*'), null);
  assert.equal(block('/play/'), null);
  assert.ok(!/\n\/\*\n[^/]*Cross-Origin-Embedder-Policy/.test(h), 'the whole site must not be isolated');
});

test('the site build copies the PLAY pages, scripts, cards, shelf list and engines, and no build tools, tests or sources', () => {
  const src = read('scripts/site.js');
  assert.match(src, /for \(const f of \['index\.html', 'game\.html', 'play\.css', 'shelf\.css'\]\)/);
  assert.match(src, /for \(const d of \['src', 'cards', 'engine'\]\)/);
  assert.match(src, /path\.join\(P, 'shelf', 'index\.json'\)/);
  for (const never of ["'test'", "'tools'", "'core'", "'serve.js'"]) assert.ok(!src.includes('fs.cpSync(path.join(P, ' + never), never);
});

test('every engine file fits the Pages per-file cap with room to spare', () => {
  const dir = path.join(REPO, 'play', 'engine');
  for (const f of fs.readdirSync(dir)) assert.ok(fs.statSync(path.join(dir, f)).size < 8 * 1024 * 1024, f);
});
