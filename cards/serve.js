// Serves the card table on this computer, with the phone relay's rooms held in memory (play/rooms/local.js, as it is).
//   node cards/serve.js            http://127.0.0.1:8791/cards/  (this computer only)
//   node cards/serve.js 8791 8792  the same rooms on more than one port. A browser keeps a player's key per address, so
//                                  two ports let one PC stand in for two phones in a test.
// To try it with real phones on the home network, set HOST to this PC's home-network address for the test, open the
// table at that address (the QR code carries the address the table was opened at), and stop the server after.
// Licence: GPL-2.0-or-later (play/LICENSE).
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2' };
// Pages by their address, as voidtv.net will serve them, and the few files of other areas the card pages load as they
// are: PLAY's join page and QR maker, Trivia's name filter, the brand's pictures.
const PAGES = { '/cards/': 'cards/index.html', '/cards': 'cards/index.html', '/cards/hand': 'cards/hand.html', '/join': 'play/join.html',
  '/play/src/qr.js': 'play/src/qr.js', '/trivia/src/words.js': 'trivia/src/words.js' };
const OPEN = ['/cards/src/', '/cards/games/', '/cards/art/', '/assets/brand/'];

function start(ports, host) {
  const rooms = require('../play/rooms/local.js').createRooms();
  const handler = (req, res) => {
    // The address is tidied before it is matched, so "/cards/src/../serve.js" is judged as "/cards/serve.js" (not served).
    let p;
    try { p = path.posix.normalize(decodeURIComponent(req.url.split('?')[0]).replace(/\\/g, '/')); } catch (e) { res.writeHead(404, { 'cache-control': 'no-store' }); return res.end('not found'); }
    const room = /^\/api\/room\/([^/]+)$/.exec(p);
    if (room && room[1] !== 'open') return rooms.lookup(req, res, room[1]);
    if (p === '/') { res.writeHead(302, { location: '/cards/' }); return res.end(); }
    const rel = PAGES[p] || (/^\/cards\/[a-z-]+\.css$/.test(p) || OPEN.some((d) => p.startsWith(d)) ? p.slice(1) : null);
    const f = rel ? path.join(ROOT, path.normalize(rel)) : null;
    if (!f || !f.startsWith(ROOT + path.sep)) { res.writeHead(404, { 'cache-control': 'no-store' }); return res.end('not found'); }
    fs.readFile(f, (e, b) => {
      if (e) { res.writeHead(404, { 'cache-control': 'no-store' }); return res.end('not found'); }
      res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(b);
    });
  };
  return ports.map((port) => http.createServer(handler).on('upgrade', rooms.upgrade).listen(port, host || '127.0.0.1'));
}

if (require.main === module) {
  const ports = process.argv.slice(2).map(Number).filter(Boolean);
  if (!ports.length) ports.push(+process.env.PORT || 8791);
  const host = process.env.HOST || '127.0.0.1';
  start(ports, host);
  console.log('VoidTV cards: ' + ports.map((p) => 'http://' + host + ':' + p + '/cards/').join('  '));
}
module.exports = { start };
