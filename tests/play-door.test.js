// The voidtv.net door to PLAY (play/, plan T19): a Games link in the site header opens /play/, the site build copies only what a
// browser loads, and only the game player (not the shelf) is cross-origin isolated. Run: node --test tests/play-door.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const guards = require('../scripts/lib/siteguards');

const REPO = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8').replace(/\r\n/g, '\n');

// The link's word is the room's own name from the one list of rooms (voidverse join J3; Bryan, 24 Nov 2026: "B, PLAY"). It said
// "Games" until then, while the menu, the room and its title said "PLAY".
test('the site header has a link to /play/ that carries the room\'s own name, PLAY', () => {
  const APP = read('scripts/lib/app.js');
  assert.match(APP, /<a class="mine-link" href="\$\{base\}play\/" title="Old games from the Internet Archive, free to play"><i class="ico play"><\/i> \$\{roomHtml\('play'\)\}<\/a>/);
  assert.match(APP, /\nconst ROOM_NAMES = require\('\.\/areas-v'\)\.names\(\);\n/, 'read from the list at build time');
  assert.equal(require('../scripts/lib/areas-v').names().play, 'PLAY');
  assert.doesNotMatch(APP, /<\/i> Games<\/a>/);
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

test('the site build ships everything a Flash card needs: Ruffle\'s whole folder and the Flash runner (PLAY lead, 20 Nov 2026)', () => {
  const src = read('scripts/site.js');
  // engine/ and src/ are copied whole, folders and all, so Ruffle's hashed WebAssembly and its LICENSE.md go with ruffle.js.
  assert.ok(src.includes("for (const d of ['src', 'cards', 'engine', 'cheats', 'library', 'skin'].filter((x) => fs.existsSync(path.join(P, x)))) fs.cpSync(path.join(P, d), path.join(dst, d), { recursive: true });"));
  const Cards = require('../play/src/cards.js');
  const ruffle = path.join(REPO, 'play', path.dirname(Cards.CORES.ruffle.engine));
  const files = fs.readdirSync(ruffle);
  assert.ok(files.includes('ruffle.js') && files.includes('LICENSE.md') && files.some((f) => /^ruffle_web_bg\.[A-Z0-9]+\.wasm$/.test(f)), files.join(', '));
  // Cloudflare Pages takes at most 25 MiB a file.
  for (const f of files) assert.ok(fs.statSync(path.join(ruffle, f)).size < 25 * 1024 * 1024, f);
  assert.ok(fs.existsSync(path.join(REPO, 'play', 'src', 'flash-runner.js')));
  // The game page loads the runner by a tag the build stamps with its version (?v=), like every other script.
  const page = read('play/game.html');
  assert.ok(page.includes('<script src="src/flash-runner.js"></script>'));
  assert.match('<script src="src/flash-runner.js"></script>'.replace(/(src="src\/[a-z0-9-]+\.js)"/g, '$1?v=abc"'), /flash-runner\.js\?v=abc/);
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
