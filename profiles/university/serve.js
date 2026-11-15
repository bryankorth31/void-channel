// Serves the Void University preview on http://127.0.0.1:8783 (this computer only). Set PORT to use another port.
//   node profiles/university/serve.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const PORT = +process.env.PORT || 8783;
const ROOT = path.join(__dirname, 'site-preview');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, path.normalize(p).replace(/^([/\\])+/, ''));
  if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (e, b) => {
    if (e) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
    res.end(b);
  });
}).listen(PORT, '127.0.0.1', () => console.log('Void University preview: http://127.0.0.1:' + PORT + '/'));
