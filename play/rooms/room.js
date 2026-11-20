// VoidTV rooms: the core of the phone relay (PLAY phone controllers and Trivia Nights). Licence: GPL-2.0-or-later (play/LICENSE).
// Bryan, 20 Nov 2026: "Yes, phone controllers". A big screen opens a room; phones scan its code and join; the room passes
// small JSON messages between them and keeps nothing. The same core runs in the Cloudflare Durable Object (play/rooms/worker.js)
// and in the local server (play/serve.js), so both behave the same. Contract: the shared notes, ROOMS-relay-contract-2026-11-20.md.
//
// A socket here is anything with an id; the caller gives send(sock, text) and close(sock, code, why).
(function (root) {
  'use strict';
  const ALPHABET = '23456789ACDEFGHJKMNPQRTUVWXY';   // no 0, O, 1, I, L, B, S or Z: easy to read off a projector
  const KINDS = ['pad', 'trivia'];
  const LIMITS = { phones: 16, perSecond: 60, bytes: 1024, idleMs: 30 * 60 * 1000, lifeMs: 4 * 60 * 60 * 1000 };
  const CLOSE = { noRoom: 4404, full: 4409, hostGone: 4410, tooBig: 4413, ended: 4408 };

  // A room code from a random source (rand() gives 0 <= x < 1). Four characters is about 600,000 codes.
  const makeCode = (rand) => Array.from({ length: 4 }, () => ALPHABET[Math.floor(rand() * ALPHABET.length)]).join('');
  // What a person typed or a QR carried: upper case, and only a real code passes.
  const normCode = (s) => { const c = String(s || '').trim().toUpperCase(); return c.length === 4 && [...c].every((x) => ALPHABET.includes(x)) ? c : null; };

  function createRoom({ code, kind, send, close, now = () => Date.now() }) {
    if (!KINDS.includes(kind)) throw new Error('kind');
    let host = null;
    const phones = new Map();   // sock -> { seat, window, count }
    const born = now();
    let last = born;
    const json = (sock, obj) => send(sock, JSON.stringify(obj));
    const seatOf = (sock) => (phones.get(sock) || {}).seat;
    const freeSeat = () => { const used = new Set([...phones.values()].map((p) => p.seat)); for (let n = 1; ; n++) if (!used.has(n)) return n; };

    return {
      code, kind,
      get open() { return !!host; },
      get phones() { return phones.size; },
      addHost(sock, joinBase) {
        if (host) { close(sock, CLOSE.full, 'This room already has a screen'); return false; }
        host = sock; last = now();
        json(sock, { type: 'room', code, kind, join: (joinBase || '') + '/join?r=' + code });
        return true;
      },
      addPhone(sock) {
        if (!host) { close(sock, CLOSE.noRoom, 'No room by that code'); return null; }
        if (phones.size >= LIMITS.phones) { close(sock, CLOSE.full, 'This room is full'); return null; }
        const seat = freeSeat();
        phones.set(sock, { seat, window: 0, count: 0 });
        last = now();
        json(sock, { type: 'hello', seat, kind });
        json(host, { type: 'join', from: seat });
        return seat;
      },
      // A text frame from either side. The relay looks only at the envelope, never inside msg.
      message(sock, text) {
        const t = now();
        if (typeof text !== 'string' || text.length > LIMITS.bytes) { close(sock, CLOSE.tooBig, 'Message too big'); this.drop(sock); return; }
        let m; try { m = JSON.parse(text); } catch (e) { return; }
        if (!m || typeof m !== 'object') return;
        last = t;
        if (sock === host) {
          const to = m.to, msg = m.msg;
          if (!msg || typeof msg !== 'object') return;
          const out = JSON.stringify(msg);
          for (const [p, info] of phones) if (to === 'all' || to === info.seat) send(p, out);
          return;
        }
        const p = phones.get(sock);
        if (!p) return;
        const sec = Math.floor(t / 1000);
        if (p.window !== sec) { p.window = sec; p.count = 0; }
        if (++p.count > LIMITS.perSecond) return;   // past the rate a hand can press: dropped, not answered
        json(host, { from: p.seat, msg: m });
      },
      drop(sock) {
        if (sock === host) {
          host = null;
          for (const p of phones.keys()) { json(p, { type: 'host-gone' }); close(p, CLOSE.hostGone, 'The screen left'); }
          phones.clear();
          return 'ended';
        }
        const p = phones.get(sock);
        if (!p) return null;
        phones.delete(sock);
        if (host) json(host, { type: 'leave', from: p.seat });
        return 'left';
      },
      // Called now and then: a room left idle, or open too long, ends.
      tick() {
        const t = now();
        if (host && (t - last > LIMITS.idleMs || t - born > LIMITS.lifeMs)) { const h = host; this.drop(h); close(h, CLOSE.ended, 'The room timed out'); return 'ended'; }
        return null;
      },
    };
  }

  const api = { ALPHABET, KINDS, LIMITS, CLOSE, makeCode, normCode, createRoom };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlayRooms = api;
})(typeof self !== 'undefined' ? self : this);
