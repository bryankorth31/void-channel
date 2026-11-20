// Serves VoidTV PLAY on http://127.0.0.1:8789/play/ (this computer only). Set PORT to use another port.
//   node play/serve.js
// The engine runs the PC on its own thread, which browsers allow only on a page that is "cross-origin isolated", so
// the player and its files carry the two headers that turn that on. The shelf (/play/ itself) does not: it shows box
// art straight from the Internet Archive, which an isolated page may not load. The site sends the same split.
// /assets/ is served from the repo's assets folder, as on voidtv.net. /api/piece runs the site's own pass-through Function
// (functions/api/piece.js, plan T21) against the real Internet Archive. A port can also be given: node play/serve.js 8790
const http = require('http');
const fs = require('fs');
const path = require('path');
const PORT = +process.argv[2] || +process.env.PORT || 8789;
const { pathToFileURL } = require('url');
const PLAY = __dirname, ASSETS = path.join(__dirname, '..', 'assets');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const PLAIN = { 'cache-control': 'no-store' };
const ISOLATE = { 'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'require-corp', 'cache-control': 'no-store' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/api/piece') return piece(req, res);
  if (p === '/' || p === '/play') { res.writeHead(302, { location: '/play/' }); return res.end(); }
  let root = null;
  if (p.startsWith('/play/')) { root = PLAY; p = p.slice(5); } else if (p.startsWith('/assets/')) { root = ASSETS; p = p.slice(7); }
  if (!root) { res.writeHead(404, ISOLATE); return res.end('not found'); }
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, path.normalize(p).replace(/^([/\\])+/, ''));
  if (!f.startsWith(root)) { res.writeHead(403, ISOLATE); return res.end(); }
  fs.readFile(f, (e, b) => {
    if (e) { res.writeHead(404, ISOLATE); return res.end('not found'); }
    const shelf = root === PLAY && f === path.join(PLAY, 'index.html');
    res.writeHead(200, Object.assign({ 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }, shelf ? PLAIN : ISOLATE));
    res.end(b);
  });
}).listen(PORT, '127.0.0.1', () => console.log('VoidTV PLAY: http://127.0.0.1:' + PORT + '/play/'));

// The pass-through, as voidtv.net runs it: the Function module and its list of streamed games, read fresh each time.
async function piece(req, res) {
  try {
    const fn = await import(pathToFileURL(path.join(__dirname, '..', 'functions', 'api', 'piece.js')).href);
    const list = (await import(pathToFileURL(path.join(PLAY, 'shelf', 'stream.js')).href + '?t=' + Date.now())).default;
    const headers = { 'sec-fetch-site': req.headers['sec-fetch-site'] || '' };
    const r = await fn.handle(new Request('http://127.0.0.1' + req.url, { headers }), list, fetch);
    res.writeHead(r.status, Object.fromEntries(r.headers));
    if (!r.body) return res.end();
    for await (const chunk of r.body) res.write(chunk);
    res.end();
  } catch (e) { res.writeHead(500, PLAIN); res.end(String(e.message || e)); }
}
