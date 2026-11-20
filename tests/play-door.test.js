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
  for (const p of ['/play/game.html', '/play/game', '/play/src/*', '/play/engine/*', '/play/cards/*', '/play/library/*']) {
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
  assert.match(src, /for \(const f of \['index\.html', 'game\.html', 'play\.css', 'shelf\.css', 'pad\.html', 'join\.html'\]\)/);
  assert.ok(src.includes("fs.copyFileSync(path.join(P, 'join.html'), path.join(OUT, 'join.html'));"), 'the join page answers at /join too');
  assert.match(src, /for \(const d of \['src', 'cards', 'engine', 'cheats', 'library', 'skin'\]/);
  // The shelf list and the nightly check's results (an old link to a game off the shelf reads them to say so).
  assert.match(src, /for \(const f of \['index\.json', 'status\.json'\]\) fs\.copyFileSync\(path\.join\(P, 'shelf', f\)/);
  for (const never of ["'test'", "'tools'", "'core'", "'serve.js'"]) assert.ok(!src.includes('fs.cpSync(path.join(P, ' + never), never);
});

test('every engine file fits the Pages per-file cap with room to spare', () => {
  const dir = path.join(REPO, 'play', 'engine');
  for (const f of fs.readdirSync(dir)) assert.ok(fs.statSync(path.join(dir, f)).size < 8 * 1024 * 1024, f);
});

test('with the password gate on, the middleware isolates the same PLAY paths with the same policy as _headers', async () => {
  const src = read('functions/_middleware.js');
  const list = JSON.stringify(guards.PLAY_ISOLATED).replace(/"/g, "'").replace(/,/g, ', ');
  assert.ok(src.includes('const PLAY_ISOLATED = ' + list + ';'), 'PLAY_ISOLATED in _middleware.js must equal siteguards.js');
  assert.ok(src.includes('const PLAY_CSP = ' + JSON.stringify(guards.PLAY_CSP) + ';'), 'PLAY_CSP in _middleware.js must equal siteguards.js');
  assert.ok(src.includes('return withSecurity(strict(await gate(ctx), url.pathname), url.pathname);'));
  // Run the real middleware with no password set: a game page comes back isolated, the shelf does not.
  const mod = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
  const run = async (p) => (await mod.onRequest({ request: new Request('https://voidtv.net' + p), env: {}, next: async () => new Response('ok') })).headers;
  const game = await run('/play/game'), shelf = await run('/play/'), engine = await run('/play/engine/x.wasm');
  assert.equal(game.get('Cross-Origin-Embedder-Policy'), 'require-corp');
  assert.equal(engine.get('Cross-Origin-Opener-Policy'), 'same-origin');
  assert.match(game.get('Content-Security-Policy-Report-Only'), /'wasm-unsafe-eval'/);
  assert.equal(shelf.get('Cross-Origin-Embedder-Policy'), null);
  assert.doesNotMatch(shelf.get('Content-Security-Policy-Report-Only'), /wasm-unsafe-eval/);
});

test('_headers gives the PLAY paths their own report-only policy that allows WebAssembly and the worklet', () => {
  const h = guards.headersFile();
  assert.match(h, /\/play\/game\n[^/]*! Content-Security-Policy-Report-Only\n  Content-Security-Policy-Report-Only: [^\n]*'wasm-unsafe-eval' blob:[^\n]*worker-src 'self' blob:/);
});
