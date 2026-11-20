// A small WebSocket server for the local PLAY server (RFC 6455, text frames only), so rooms run on this PC with no
// outside package. Licence: GPL-2.0-or-later (play/LICENSE). On voidtv.net the Durable Object does this part.
'use strict';
const crypto = require('crypto');
const MAX = 64 * 1024;   // a frame bigger than this is not ours; the room's own limit is 1 KB

// Answer the upgrade and return a connection: { send(text), close(code, why), onmessage, onclose }.
function accept(req, socket) {
  const key = req.headers['sec-websocket-key'];
  if (!key || String(req.headers.upgrade).toLowerCase() !== 'websocket') { socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'); return null; }
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  socket.setNoDelay(true);
  let buf = Buffer.alloc(0), parts = [], closed = false;
  const conn = { onmessage: null, onclose: null };
  const frame = (op, payload) => {
    const n = payload.length;
    const head = n < 126 ? Buffer.from([0x80 | op, n]) : n < 65536 ? Buffer.from([0x80 | op, 126, n >> 8, n & 255])
      : Buffer.concat([Buffer.from([0x80 | op, 127]), (() => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(n)); return b; })()]);
    if (!closed) socket.write(Buffer.concat([head, payload]));
  };
  const end = () => { if (closed) return; closed = true; socket.end(); if (conn.onclose) conn.onclose(); };
  conn.send = (text) => frame(1, Buffer.from(String(text), 'utf8'));
  conn.close = (code = 1000, why = '') => {
    const b = Buffer.concat([Buffer.from([code >> 8, code & 255]), Buffer.from(String(why).slice(0, 100), 'utf8')]);
    frame(8, b); end();
  };
  socket.on('data', (d) => {
    buf = Buffer.concat([buf, d]);
    for (;;) {
      if (buf.length < 2) return;
      const fin = buf[0] & 0x80, op = buf[0] & 0x0f, masked = buf[1] & 0x80;
      let n = buf[1] & 0x7f, at = 2;
      if (n === 126) { if (buf.length < 4) return; n = buf.readUInt16BE(2); at = 4; }
      else if (n === 127) { if (buf.length < 10) return; n = Number(buf.readBigUInt64BE(2)); at = 10; }
      if (n > MAX || !masked) { conn.close(1009, 'Too big'); return; }   // a browser always masks
      if (buf.length < at + 4 + n) return;
      const mask = buf.subarray(at, at + 4), data = Buffer.from(buf.subarray(at + 4, at + 4 + n));
      for (let i = 0; i < n; i++) data[i] ^= mask[i & 3];
      buf = buf.subarray(at + 4 + n);
      if (op === 8) { frame(8, data.subarray(0, 2)); end(); return; }
      if (op === 9) { frame(10, data); continue; }
      if (op === 10) continue;
      if (op === 1 || op === 0) {
        parts.push(data);
        if (Buffer.concat(parts).length > MAX) { conn.close(1009, 'Too big'); return; }
        if (fin) { const text = Buffer.concat(parts).toString('utf8'); parts = []; if (conn.onmessage) conn.onmessage(text); }
      }
    }
  });
  socket.on('close', end);
  socket.on('error', end);
  return conn;
}

module.exports = { accept };
