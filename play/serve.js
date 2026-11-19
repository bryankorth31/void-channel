// Serves VoidTV PLAY on http://127.0.0.1:8789/play/ (this computer only). Set PORT to use another port.
//   node play/serve.js
// The engine runs the PC on its own thread, which browsers allow only on a page that is "cross-origin isolated", so
// every reply carries the two headers that turn that on (the site will send the same ones for /play/).
// /assets/ is served from the repo's assets folder, as on voidtv.net.
const http = require('http');
const fs = require('fs');
const path = require('path');
const PORT = +process.env.PORT || 8789;
const PLAY = __dirname, ASSETS = path.join(__dirname, '..', 'assets');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const ISOLATE = { 'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'require-corp', 'cache-control': 'no-store' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/' || p === '/play') { res.writeHead(302, { location: '/play/' }); return res.end(); }
  let root = null;
  if (p.startsWith('/play/')) { root = PLAY; p = p.slice(5); } else if (p.startsWith('/assets/')) { root = ASSETS; p = p.slice(7); }
  if (!root) { res.writeHead(404, ISOLATE); return res.end('not found'); }
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, path.normalize(p).replace(/^([/\\])+/, ''));
  if (!f.startsWith(root)) { res.writeHead(403, ISOLATE); return res.end(); }
  fs.readFile(f, (e, b) => {
    if (e) { res.writeHead(404, ISOLATE); return res.end('not found'); }
    res.writeHead(200, Object.assign({ 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }, ISOLATE));
    res.end(b);
  });
}).listen(PORT, '127.0.0.1', () => console.log('VoidTV PLAY: http://127.0.0.1:' + PORT + '/play/'));
