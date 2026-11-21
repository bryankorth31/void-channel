// Serves the Void University preview on http://127.0.0.1:8783. Set PORT to use another port.
//   node profiles/university/serve.js
//
// Make questions with a phone (Bryan, 20 Nov 2026: "we can create the lesson in one sitting"). A lecture page in the
// preview opens a lesson room on the phone relay (play/rooms, the PLAY lead's code, required as it is, never copied)
// and shows a QR code; a phone on the same Wi-Fi scans it and becomes the note pad. So the server listens on the home
// network too, with one hard rule: a device that is not this computer is given the phone page and its seat in a room,
// and nothing else. The preview pages, the lecture's words and every write stay on this computer: the phone talks to
// the screen through the room, and the screen (this computer) asks for the words and saves the question.
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const PORT = +process.env.PORT || 8783;
const ROOT = path.join(__dirname, 'site-preview');
const MAKE = path.join(__dirname, 'make');
const QR = path.join(__dirname, '..', '..', 'play', 'src', 'qr.js'); // PLAY's own QR maker, served as it is
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
const NOSTORE = { 'cache-control': 'no-store' };

const isLocal = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
// What a device that is not this computer may ask for: the join address, the phone page, and which room a code is.
const phoneMay = (p) => p === '/join' || p === '/make/phone.html' || (/^\/api\/room\/[A-Za-z0-9]{4}$/.test(p) && p !== '/api/room/open');
const allowed = (p, local) => !!local || phoneMay(p);
// The same page that is asking: a web page from anywhere else, open in a browser on this computer, cannot write here.
const sameSite = (req) => { try { return new URL(req.headers.origin).host === req.headers.host; } catch (e) { return false; } };

// This computer's addresses on the home network, the likeliest first (a Wi-Fi or wired address before a virtual one).
function addresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) for (const a of list || []) {
    if (a.family !== 'IPv4' || a.internal || /^169\.254\./.test(a.address)) continue;
    const virtual = /vEthernet|WSL|Virtual|VMware|Hyper-V|Loopback|Bluetooth|Tailscale|ZeroTier/i.test(name);
    const home = /^192\.168\./.test(a.address) ? 0 : /^10\./.test(a.address) ? 1 : 2;
    out.push({ address: a.address, rank: (virtual ? 10 : 0) + home });
  }
  return out.sort((x, y) => x.rank - y.rank).map((x) => x.address);
}

const json = (res, status, obj) => { res.writeHead(status, { 'content-type': 'application/json', ...NOSTORE }); res.end(JSON.stringify(obj)); };
const sendFile = (res, f, head = {}) => fs.readFile(f, (e, b) => {
  if (e) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', ...head });
  res.end(b);
});
const body = (req) => new Promise((ok, no) => {
  let s = '';
  req.on('data', (d) => { s += d; if (s.length > 8192) { no(new Error('too big')); req.destroy(); } });
  req.on('end', () => { try { ok(JSON.parse(s)); } catch (e) { no(new Error('not JSON')); } });
  req.on('error', no);
});

function create() {
  const uni = require('../../scripts/lib/uni.js');
  const rooms = require('../../play/rooms/local.js').createRooms();
  let building = null; // one rebuild at a time

  async function api(req, res, u, p) {
    try {
      const slug = u.searchParams.get('slug'), n = +u.searchParams.get('n');
      if (req.method === 'GET' && p === '/api/make/info') return json(res, 200, { port: PORT, addresses: addresses(), units: uni.makeUnits(slug) });
      if (req.method === 'GET' && p === '/api/make/lines') return json(res, 200, uni.makeLines(slug, n, +u.searchParams.get('t')));
      if (req.method !== 'POST' || !sameSite(req)) return json(res, 403, { error: 'Only the preview page itself may do this.' });
      if (p === '/api/make/save') {
        const m = await body(req);
        return json(res, 200, uni.addQuestion(m.slug, +m.n, m));
      }
      if (p === '/api/make/rebuild') {
        building = building || new Promise((ok) => execFile(process.execPath, [path.join(__dirname, 'build.js')], { cwd: path.join(__dirname, '..', '..') }, (e) => { building = null; ok(!e); }));
        return json(res, 200, { ok: await building });
      }
      return json(res, 404, { error: 'not found' });
    } catch (e) { return json(res, 400, { error: String(e.message || e) }); }
  }

  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    let p = '';
    try { p = decodeURIComponent(u.pathname); } catch (e) { res.writeHead(400); return res.end(); }
    if (!allowed(p, isLocal(req))) { res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('This page opens on the computer only.'); }
    const room = /^\/api\/room\/([^/]+)$/.exec(p);
    if (room && room[1] !== 'open') return rooms.lookup(req, res, room[1]);
    if (p === '/join') { res.writeHead(302, { location: '/make/phone.html?r=' + encodeURIComponent(u.searchParams.get('r') || ''), ...NOSTORE }); return res.end(); }
    if (p === '/make/qr.js') return sendFile(res, QR, NOSTORE);
    if (p.startsWith('/make/')) return /^\/make\/[a-z-]+\.(html|js)$/.test(p) ? sendFile(res, path.join(MAKE, p.slice(6)), NOSTORE) : (res.writeHead(404), res.end('not found'));
    if (p.startsWith('/api/make/')) return api(req, res, u, p);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(ROOT, path.normalize(p).replace(/^([/\\])+/, ''));
    if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    sendFile(res, f);
  });
  // A room is opened by this computer only, and only a lesson room; a phone may join one.
  server.on('upgrade', (req, socket) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/api/room/open' && (!isLocal(req) || u.searchParams.get('kind') !== 'lesson')) { socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return; }
    rooms.upgrade(req, socket);
  });
  return server;
}

if (require.main === module) create().listen(PORT, '0.0.0.0', () => console.log('Void University preview: http://127.0.0.1:' + PORT + '/  (a phone on the same Wi-Fi may open only the make-questions page)'));
module.exports = { create, allowed, addresses };
