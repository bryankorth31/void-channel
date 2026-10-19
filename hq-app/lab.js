// The player lab inside VOIDtv HQ (Bryan, 19 Oct 2026: the lab belongs in the desktop app).
// HQ serves the repo's player/ folder on 127.0.0.1:8792, the same address player/LAB.cmd uses, and shows /lab/ in its
// own window. When LAB.cmd's server (or an earlier HQ) already answers on that port, HQ uses it and starts nothing.
// The server is read-only: GET and HEAD, files inside player/ only, no listings, no dot files, never cached.
const http = require('http');
const fs = require('fs');
const path = require('path');

const LAB_PORT = 8792;
const LAB_ORIGIN = `http://127.0.0.1:${LAB_PORT}`;
const LAB_URL = `${LAB_ORIGIN}/lab/`;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.vtt': 'text/vtt; charset=utf-8',
  '.srt': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

// Map a request path to a file inside root, or null. Backslashes, colons and control characters (NUL, CR, LF) are
// refused before any path arithmetic, so a Windows path trick cannot step outside player/ and no header can be split.
function resolveInside(root, rawPath) {
  let p;
  try { p = decodeURIComponent(String(rawPath).split('?')[0].split('#')[0]); } catch (e) { return null; }
  if (!p.startsWith('/') || /[\\:\x00-\x1f\x7f]/.test(p)) return null;
  if (p.split('/').includes('..')) return null;
  const clean = path.posix.normalize(p);
  if (clean.split('/').some((seg) => seg.startsWith('.') && seg !== '')) return null;
  const full = path.resolve(root, '.' + clean);
  const base = path.resolve(root);
  if (full !== base && !full.startsWith(base + path.sep)) return null;
  return { full, clean, dir: clean.endsWith('/') };
}

// Only this PC's own names for the server are answered, like HQ's Host check (CF-004): a web page that points its own
// domain name at 127.0.0.1 (DNS rebinding) gets 403, not the lab files.
const localHost = (req) => {
  const port = req.socket && req.socket.localPort;
  return [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`].includes(String(req.headers.host || '').toLowerCase());
};

// The real (symlink and junction resolved) path must also be inside player/.
const realInside = (realRoot, file) => {
  try { const real = fs.realpathSync(file); return real === realRoot || real.startsWith(realRoot + path.sep); } catch (e) { return false; }
};

// This runs inside HQ's main process, so nothing in a request may throw out of the handler.
function handler(root) {
  let realRoot = null;
  try { realRoot = fs.realpathSync(root); } catch (e) { realRoot = path.resolve(root); }
  return (req, res) => {
    const head = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    const done = (code, body, type, extra) => {
      try { res.writeHead(code, { ...head, 'Content-Type': type || 'text/plain; charset=utf-8', ...(extra || {}) }); res.end(req.method === 'HEAD' ? undefined : body); } catch (e) { try { res.destroy(); } catch (e2) { /* gone */ } }
    };
    try {
      if (!localHost(req)) return done(403, 'local only');
      if (req.method !== 'GET' && req.method !== 'HEAD') return done(405, 'GET only', null, { Allow: 'GET, HEAD' });
      if (req.url === '/' || req.url === '') return done(302, '', null, { Location: '/lab/' });
      const hit = resolveInside(root, req.url);
      if (!hit) return done(404, 'not found');
      let file = hit.full;
      let st;
      try { st = fs.statSync(file); } catch (e) { return done(404, 'not found'); }
      if (st.isFile() && hit.dir) return done(404, 'not found');
      if (st.isDirectory()) {
        if (!hit.dir) return done(301, '', null, { Location: encodeURI(hit.clean + '/') });
        file = path.join(file, 'index.html');
        try { st = fs.statSync(file); } catch (e) { return done(404, 'not found'); }
      }
      if (!st.isFile() || !realInside(realRoot, file)) return done(404, 'not found');
      fs.readFile(file, (err, buf) => {
        if (err) return done(500, 'could not read the file');
        done(200, buf, TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', { 'Content-Length': buf.length });
      });
    } catch (e) { done(500, 'lab server error'); }
  };
}

// Is a lab already answering on the port (LAB.cmd's Python server, or this module's own)?
const ping = () => new Promise((ok) => {
  const q = http.get({ host: '127.0.0.1', port: LAB_PORT, path: '/lab/', timeout: 1500 }, (r) => { ok(r.statusCode === 200); r.resume(); });
  q.on('error', () => ok(false)); q.on('timeout', () => { q.destroy(); ok(false); });
});

// Returns 'running' (this module's server is up), 'already running' (another lab server answers, LAB.cmd's) or
// 'started' (nothing answered, so this module started its server just now).
let server = null;
async function ensureServer(repo) {
  if (server) return 'running';
  if (await ping()) return 'already running';
  const root = path.join(repo, 'player');
  if (!fs.existsSync(path.join(root, 'lab', 'index.html'))) throw new Error('player/lab/index.html is missing from ' + repo);
  const s = http.createServer(handler(root));
  await new Promise((ok, fail) => { s.once('error', fail); s.listen(LAB_PORT, '127.0.0.1', ok); }).catch((e) => {
    if (e.code === 'EADDRINUSE') throw new Error(`Port ${LAB_PORT} is taken by something that is not the player lab. Close it and try again.`);
    throw e;
  });
  server = s;
  return 'started';
}

module.exports = { LAB_PORT, LAB_ORIGIN, LAB_URL, resolveInside, handler, ensureServer, ping };
