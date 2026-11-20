// Rooms on the local PLAY server (play/serve.js): the same addresses as voidtv.net's (/api/room/...), held in memory.
// Licence: GPL-2.0-or-later (play/LICENSE). Contract: the shared notes, ROOMS-relay-contract-2026-11-20.md.
'use strict';
const crypto = require('crypto');
const R = require('./room.js');
const WS = require('./ws-server.js');

function createRooms() {
  const rooms = new Map();
  const rand = () => crypto.randomInt(0, 1 << 30) / (1 << 30);
  const fresh = () => { for (;;) { const c = R.makeCode(rand); if (!rooms.has(c)) return c; } };
  setInterval(() => { for (const [c, r] of rooms) if (r.tick() === 'ended' || !r.open) rooms.delete(c); }, 15 * 1000).unref();

  // Only a page from this same site may open or join a room: another web page cannot use it as a free relay.
  const sameSite = (req) => { try { return new URL(req.headers.origin).host === req.headers.host; } catch (e) { return false; } };

  // GET /api/room/CODE -> { kind } or 404 (the join page asks which page a phone should open).
  function lookup(req, res, code) {
    const r = rooms.get(R.normCode(code));
    res.writeHead(r && r.open ? 200 : 404, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(r && r.open ? { kind: r.kind } : { error: 'No room by that code' }));
  }

  function upgrade(req, socket) {
    const u = new URL(req.url, 'http://x');
    const m = /^\/api\/room\/(?:open|([^/]+)\/join)$/.exec(u.pathname);
    if (!m || !sameSite(req)) { socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return; }
    const conn = WS.accept(req, socket);
    if (!conn) return;
    const send = (c, t) => c.send(t), close = (c, code, why) => c.close(code, why);
    if (!m[1]) {
      const kind = u.searchParams.get('kind');
      if (!R.KINDS.includes(kind)) { conn.close(4400, 'Unknown kind'); return; }
      // The same screen's next page takes its waiting room back with the room's key.
      const back = rooms.get(R.normCode(u.searchParams.get('code')));
      if (u.searchParams.get('key')) {
        if (!back || !back.reclaim(conn, u.searchParams.get('key'))) { if (!back) conn.close(R.CLOSE.noRoom, 'No room by that code'); return; }
        conn.onmessage = (t) => back.message(conn, t);
        conn.onclose = () => { if (back.drop(conn) === 'ended') rooms.delete(back.code); };
        return;
      }
      const code = fresh();
      const room = R.createRoom({ code, kind, send, close, key: crypto.randomBytes(24).toString('base64url') });
      rooms.set(code, room);
      room.addHost(conn, req.headers.origin);
      conn.onmessage = (t) => room.message(conn, t);
      conn.onclose = () => { if (room.drop(conn) === 'ended') rooms.delete(code); };
      return;
    }
    const room = rooms.get(R.normCode(m[1]));
    if (!room || !room.open) { conn.close(R.CLOSE.noRoom, 'No room by that code'); return; }
    if (room.addPhone(conn, u.searchParams.get('t')) === null) return;
    conn.onmessage = (t) => room.message(conn, t);
    conn.onclose = () => room.drop(conn);
  }

  return { lookup, upgrade, rooms };
}

module.exports = { createRooms };
