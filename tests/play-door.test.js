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
  assert.match(APP, /\n  const ROOM_NAMES = require\('\.\/areas-v'\)\.names\(\);\n/, 'read from the list when the page is drawn');
  assert.doesNotMatch(APP, /\nconst [A-Z_]+ = require\('\.\/areas-v'\)/, 'never when the file loads: the catalog publish loads app.js from a copy that has no areas-v.js (tests/publish.test.js)');
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
  assert.match(src, /for \(const f of \['index\.html', 'game\.html', 'play\.css', 'shelf\.css', 'pad\.html', 'join\.html', 'manifest\.webmanifest'\]\)/);
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

// Voidverse join J12 (Bryan, 25 Nov 2026: "Yes, your picks"): each room installs under its own name. PLAY's two pages always
// named an install file beside themselves, but the build never copied it, so the address answered with the home page and a
// phone that added PLAY to its home screen got a plain shortcut or the main app. The name follows decision B1: voidtv.net.
test('PLAY installs under its own name: the file its pages name is real, is copied, and opens PLAY', () => {
  for (const page of ['play/index.html', 'play/game.html']) assert.ok(read(page).includes('<link rel="manifest" href="manifest.webmanifest">'), page + ' names the install file beside itself');
  const m = JSON.parse(read('play/manifest.webmanifest'));
  assert.equal(m.name, 'voidtv.net PLAY');
  assert.equal(m.short_name, 'PLAY');
  assert.equal(m.start_url, '/play/');
  assert.equal(m.scope, '/play/', 'its own app, apart from the main one at /');
  assert.ok(m.description && !new RegExp('[' + String.fromCharCode(8211, 8212) + ']').test(JSON.stringify(m)), 'no long dashes');
  const sizes = m.icons.map((i) => i.sizes);
  assert.ok(sizes.includes('192x192') && sizes.includes('512x512'), 'the two sizes a browser asks for before it offers Install');
  assert.equal(m.icons.filter((i) => i.purpose === 'maskable').length, 1);
  for (const i of m.icons) {
    assert.match(i.src, /^\/assets\/brand\/[a-z0-9-]+\.png\?v=\d+$/, i.src);
    assert.ok(fs.existsSync(path.join(REPO, i.src.replace(/\?.*$/, ''))), i.src + ' is a real picture in the repo');
  }
});

// Bryan, 25 Nov 2026: "S2 neon line" (the room marks, picked in the voidverse plan chat), then "Yes, draw it" and "Yes, build
// it" for PLAY's icon. PLAY's mark is a joystick in the wordmark's pink and blue on the main icon's dark ground. The drawings
// are play/tools/icon/*.svg; the pictures in assets/brand are those drawings at 512, 192 and 180 (iPhone) pixels.
test('PLAY installs under its own mark: its own icon in the install file and on an iPhone home screen', () => {
  const m = JSON.parse(read('play/manifest.webmanifest'));
  assert.deepEqual(m.icons.map((i) => i.src.replace(/\?.*$/, '')), ['/assets/brand/play-icon-192.png', '/assets/brand/play-icon-512.png', '/assets/brand/play-icon-512-maskable.png']);
  for (const page of ['play/index.html', 'play/game.html']) assert.ok(read(page).includes('<link rel="apple-touch-icon" href="/assets/brand/play-apple-touch-icon.png?v=1">'), page);
  // A PNG says its own size in bytes 16 to 23.
  const size = (f) => { const b = fs.readFileSync(path.join(REPO, 'assets', 'brand', f)); return b.readUInt32BE(16) + 'x' + b.readUInt32BE(20); };
  assert.equal(size('play-icon-192.png'), '192x192');
  assert.equal(size('play-icon-512.png'), '512x512');
  assert.equal(size('play-icon-512-maskable.png'), '512x512');
  assert.equal(size('play-apple-touch-icon.png'), '180x180');
  for (const f of ['play-icon-512.svg', 'play-icon-512-maskable.svg']) {
    const svg = read('play/tools/icon/' + f);
    const colours = [...new Set(svg.match(/#[0-9a-f]{6}/g))].sort();
    assert.deepEqual(colours, ['#161921', '#5fe3ff', '#ff4fc8'], f + ': the ground, and the wordmark\'s blue and pink, nothing else');
  }
  // The main app keeps its own icon: this is PLAY's alone.
  assert.ok(!read('scripts/lib/app.js').includes('play-icon'));
});

// Voidverse join J6 (Bryan, 25 Nov 2026: "Yes, your picks" in the voidverse plan chat; "Yes, draw it" and "A, neon sign" in the
// PLAY lead chat): a pasted link to PLAY shows PLAY's own title, line and picture, not nothing. The picture is the main neon
// sign with PLAY's mark, name and line beside it, as on the sister sites' cards; its drawing is play/tools/share/card.html.
test('PLAY has its own share card, a shared game link shows it, and the Kids game page gets none', () => {
  const page = read('play/index.html');
  const tag = (k) => (page.match(new RegExp('<meta (?:property|name)="' + k + '" content="([^"]*)">')) || [])[1];
  assert.equal(tag('og:title'), 'PLAY | voidtv.net');
  assert.equal(tag('og:site_name'), 'voidtv.net');
  assert.equal(tag('og:description'), JSON.parse(read('play/manifest.webmanifest')).description);
  assert.equal(tag('og:image'), 'https://voidtv.net/assets/brand/play-og.jpg?v=1');
  assert.equal(tag('og:url'), 'https://voidtv.net/play/');
  assert.equal(tag('twitter:card'), 'summary_large_image');
  // A JPEG says its size in its first frame header (marker C0 or C2): height, then width.
  const b = fs.readFileSync(path.join(REPO, 'assets', 'brand', 'play-og.jpg'));
  let i = 2, size = '';
  while (i < b.length && !size) { const m = b[i + 1], len = b.readUInt16BE(i + 2); if (m === 0xC0 || m === 0xC2) size = b.readUInt16BE(i + 7) + 'x' + b.readUInt16BE(i + 5); i += 2 + len; }
  assert.equal(size, '1200x630');
  assert.ok(b.length < 300 * 1024, 'small enough for a link preview');
  assert.ok(fs.existsSync(path.join(REPO, 'play', 'tools', 'share', 'card.html')), 'the drawing the picture is made from');
  // The game page: the build copies the shelf's tags onto it, all but og:url, so a shared game link keeps its own address.
  const game = read('play/game.html');
  assert.doesNotMatch(game, /og:|twitter:/, 'never in the file itself: the Kids build makes its game page from it, and Kids takes no share card');
  const src = read('scripts/site.js');
  assert.ok(src.includes("(fs.readFileSync(path.join(P, 'index.html'), 'utf8').match(/<meta (?:property=\"og:|name=\"twitter:)[^>]*>/g) || []).filter((t) => !t.includes('og:url'));"));
  assert.ok(src.includes("replace('<link rel=\"icon\" href=\"/favicon.ico\">', tags.join('') + '\\n<link rel=\"icon\" href=\"/favicon.ico\">')"));
  const tags = (page.match(/<meta (?:property="og:|name="twitter:)[^>]*>/g) || []).filter((t) => !t.includes('og:url'));
  assert.equal(tags.length, 8);
  assert.ok(game.includes('<link rel="icon" href="/favicon.ico">'), 'the spot the build puts them at');
});
