// VoidTV rooms: the core of the phone relay (PLAY phone controllers and Trivia Nights). Licence: GPL-2.0-or-later (play/LICENSE).
// Bryan, 20 Nov 2026: "Yes, phone controllers". A big screen opens a room; phones scan its code and join; the room passes
// small JSON messages between them and keeps nothing. The same core runs in the Cloudflare Durable Object (play/rooms/worker.js)
// and in the local server (play/serve.js), so both behave the same. Contract: the shared notes, ROOMS-relay-contract-2026-11-20.md.
//
// A socket here is anything with an id; the caller gives send(sock, text) and close(sock, code, why).
(function (root) {
  'use strict';
  const ALPHABET = '23456789ACDEFGHJKMNPQRTUVWXY';   // no 0, O, 1, I, L, B, S or Z: easy to read off a projector
  const KINDS = ['pad', 'trivia', 'lesson', 'remote', 'talk'];   // lesson: Void University, a phone as the note pad during a lecture (Bryan, 20 Nov 2026)
  // talk: Void TV Kids' Watch and Talk (Bryan, 21 Nov 2026: "Start now"; profiles/kids/docs/PLAN-kids-watch-and-talk.md). While a
  // child watches, a grown-up's own phone gets the talk-about-it questions; the phone sends back only pause and play. One or two
  // grown-ups' phones; the kids tablet locks the room once a phone is in. Opened only from kids.voidtv.net (workers/kids/rooms.js
  // in void-kids), which reaches this same room core through the voidtv-rooms Durable Object.
  // remote: a phone as the TV remote across voidtv.net (Bryan, 20 Nov 2026: "a channel switcher, save to phone, info on the phone
  // about the show"); remote/README.md. A few phones in a living room, a tap now and then; the room waits for its screen's next
  // page as a game pad's does, and lasts an evening of TV (12 hours) instead of 4, since nobody taps a remote during a film.
  // Per kind. A gamepad (Bryan, 20 Nov 2026, on a phone as the pad: "it seems to just be playing on its own"): 30 a second
  // was measured too low. A thumb rolling the d-pad while another taps passes it, and a message past the limit is dropped
  // in silence, so a dropped release left the key held on the screen. The phone now sends at most 50 a second and says
  // its whole state again on a beat (src/phonepad.js), so 60 is never reached by an honest phone and a lost message heals.
  // Trivia sends an answer now and then, but a movie night can bring 200 phones.
  const LIMITS = { bytes: 1024, idleMs: 30 * 60 * 1000, lifeMs: 4 * 60 * 60 * 1000, holdMs: 60 * 1000,
    pad: { phones: 16, perSecond: 60, screenHoldMs: 45 * 1000 }, trivia: { phones: 200, perSecond: 5, screenHoldMs: 0 },
    lesson: { phones: 40, perSecond: 10, screenHoldMs: 0 },   // a teacher's phone or a class's; notes, not button presses
    remote: { phones: 16, perSecond: 10, screenHoldMs: 45 * 1000, lifeMs: 12 * 60 * 60 * 1000 },
    talk: { phones: 2, perSecond: 5, screenHoldMs: 45 * 1000 } };   // a pause or play now and then; the kids page may change, so it waits 45 s
  const CLOSE = { noRoom: 4404, full: 4409, hostGone: 4410, tooBig: 4413, ended: 4408, locked: 4423, removed: 4403, replaced: 4411 };
  // A phone's own seat token: random, kept in that phone's tab only, so a phone that drops gets its seat back.
  const goodToken = (t) => typeof t === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(t);
  const goodKey = (k) => typeof k === 'string' && /^[A-Za-z0-9_-]{20,64}$/.test(k);

  // A room code from a random source (rand() gives 0 <= x < 1). Four characters is about 600,000 codes.
  const makeCode = (rand) => Array.from({ length: 4 }, () => ALPHABET[Math.floor(rand() * ALPHABET.length)]).join('');
  // What a person typed or a QR carried: upper case, and only a real code passes.
  const normCode = (s) => { const c = String(s || '').trim().toUpperCase(); return c.length === 4 && [...c].every((x) => ALPHABET.includes(x)) ? c : null; };

  // key: the screen's own secret for this room (Bryan, 20 Nov 2026: "i want to able to connect the phone as the controller
  // prior to being in a game"). When the screen's page closes (the shelf opening a game), a game-pad room waits a little
  // for it; the next page that brings the key takes the room back, with its phones still in their seats.
  function createRoom({ code, kind, send, close, key, now = () => Date.now() }) {
    if (!KINDS.includes(kind)) throw new Error('kind');
    let host = null, locked = false, away = 0, joinAt = '';   // away: until when the room waits for its screen
    const hostKey = goodKey(key) ? key : null;
    const lim = LIMITS[kind];
    const phones = new Map();   // sock -> { seat, token, window, count }
    const held = new Map();     // token -> { seat, until }: a dropped phone's seat, kept a minute
    const born = now();
    let last = born;
    const json = (sock, obj) => send(sock, JSON.stringify(obj));
    const seatOf = (sock) => (phones.get(sock) || {}).seat;
    const freeSeat = () => {
      const t = now();
      for (const [k, h] of held) if (h.until < t) held.delete(k);
      const used = new Set([...phones.values()].map((p) => p.seat).concat([...held.values()].map((h) => h.seat)));
      for (let n = 1; ; n++) if (!used.has(n)) return n;
    };

    return {
      code, kind,
      get open() { return !!host || (away > 0 && away >= now()); },
      get waiting() { return !host && away > 0; },
      get phones() { return phones.size; },
      addHost(sock, joinBase) {
        if (host) { close(sock, CLOSE.full, 'This room already has a screen'); return false; }
        host = sock; last = now(); joinAt = (joinBase || '') + '/join?r=' + code;
        json(sock, hostKey ? { type: 'room', code, kind, join: joinAt, key: hostKey } : { type: 'room', code, kind, join: joinAt });
        return true;
      },
      // The next page of the same screen, with the room's key, while the room waits: the room is its again, and it hears
      // of every phone still in it; the phones hear the screen is back.
      reclaim(sock, k) {
        if (host || !hostKey || k !== hostKey || !(away >= now())) { close(sock, CLOSE.noRoom, 'No room by that code'); return false; }
        host = sock; away = 0; last = now();
        json(sock, { type: 'room', code, kind, join: joinAt, key: hostKey, back: true });
        if (locked) json(sock, { type: 'locked', on: true });
        for (const [p, info] of phones) { json(sock, { type: 'join', from: info.seat, back: true }); json(p, { type: 'host-back' }); }
        return true;
      },
      addPhone(sock, token) {
        if (!this.open) { close(sock, CLOSE.noRoom, 'No room by that code'); return null; }
        const tok = goodToken(token) ? token : null;
        // The same phone on a new socket while its old one still looks open (its Wi-Fi dropped and no close ever came):
        // the new socket takes the seat and the old one is closed. Before, the dead socket kept its seat and whatever
        // it last held, and the phone came back as one more player beside its own ghost.
        if (tok) for (const [old, info] of phones) if (info.token === tok && old !== sock) {
          phones.delete(old); close(old, CLOSE.replaced, 'This phone joined again');
          phones.set(sock, { seat: info.seat, token: tok, window: 0, count: 0 });
          last = now();
          json(sock, { type: 'hello', seat: info.seat, kind });
          if (host) json(host, { type: 'join', from: info.seat, back: true });
          else json(sock, { type: 'host-away' });
          return info.seat;
        }
        const back = tok && held.get(tok);
        if (back && back.until >= now()) held.delete(tok);
        else if (locked) { close(sock, CLOSE.locked, 'The screen has locked this room'); return null; }
        if (phones.size >= lim.phones) { close(sock, CLOSE.full, 'This room is full'); return null; }
        const seat = back && back.until >= now() ? back.seat : freeSeat();
        phones.set(sock, { seat, token: tok, window: 0, count: 0 });
        last = now();
        json(sock, { type: 'hello', seat, kind });
        if (host) json(host, back ? { type: 'join', from: seat, back: true } : { type: 'join', from: seat });
        else json(sock, { type: 'host-away' });
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
          // The screen's own say over its room: remove a phone, or lock the room so no new phone joins.
          if (m.relay === 'remove') { for (const [p, info] of phones) if (info.seat === m.seat) { phones.delete(p); json(host, { type: 'leave', from: info.seat }); close(p, CLOSE.removed, 'The screen removed this phone'); } return; }
          if (m.relay === 'lock') { locked = !!m.on; json(host, { type: 'locked', on: locked }); return; }
          // The screen is done (End remote): the room ends now, its phones told so, instead of waiting for a next page.
          if (m.relay === 'end') { const h = host; this.end(); close(h, CLOSE.ended, 'The screen ended the room'); return; }
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
        if (++p.count > lim.perSecond) return;   // past the rate a hand can press: dropped, not answered
        if (host) json(host, { from: p.seat, msg: m });   // while the screen changes pages, presses go nowhere
      },
      drop(sock) {
        if (sock === host) {
          host = null;
          // A game-pad room with a key waits for its screen's next page; the phones stay, told the screen is changing.
          if (hostKey && lim.screenHoldMs && !this.ending) {
            away = now() + lim.screenHoldMs;
            for (const p of phones.keys()) json(p, { type: 'host-away' });
            return 'away';
          }
          return this.end();
        }
        const p = phones.get(sock);
        if (!p) return null;
        phones.delete(sock);
        if (p.token) held.set(p.token, { seat: p.seat, until: now() + LIMITS.holdMs });
        if (host) json(host, { type: 'leave', from: p.seat });
        return 'left';
      },
      // The room ends: every phone is told and let go.
      end() {
        host = null; away = 0;
        for (const p of phones.keys()) { json(p, { type: 'host-gone' }); close(p, CLOSE.hostGone, 'The screen left'); }
        phones.clear();
        return 'ended';
      },
      // Called now and then: a room left idle, or open too long, ends; so does one whose screen did not come back.
      tick() {
        const t = now();
        if (!host && away && away < t) return this.end();
        if (host && (t - last > LIMITS.idleMs || t - born > (lim.lifeMs || LIMITS.lifeMs))) { const h = host; this.ending = true; this.drop(h); close(h, CLOSE.ended, 'The room timed out'); return 'ended'; }
        return null;
      },
    };
  }

  const api = { ALPHABET, KINDS, LIMITS, CLOSE, makeCode, normCode, createRoom };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlayRooms = api;
})(typeof self !== 'undefined' ? self : this);
