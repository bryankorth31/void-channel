// Watch and Talk (profiles/kids/docs/PLAN-kids-watch-and-talk.md, T5): kids.voidtv.net's own door to the phone rooms.
// Bryan, 20 and 21 Nov 2026: a grown-up's phone gets the talk-about-it questions while the child watches ("Watch and
// Talk", "Start now"). The rooms are PLAY's: one Durable Object a room in the voidtv-rooms Worker (play/rooms in
// void-channel), bound here as ROOMS by script name, running the same room core as voidtv.net. So phones and the tablet
// talk only to kids.voidtv.net (K4: nothing else is asked), and nothing about anyone is kept: the room passes small
// messages and is gone when the show closes.
//
// Kids rules on top of voidtv.net's door (functions/api/room/[[path]].js in void-channel):
// - only rooms of kind "talk" open, are looked up or are joined here; a kids page can reach no game-pad, trivia or other room;
// - only a page of this same site may open or join.
//   WebSocket /api/room/open?kind=talk   the tablet opens a room with a fresh code
//   WebSocket /api/room/CODE/join?t=...  a grown-up's phone joins it
//   GET       /api/room/CODE             { kind: "talk" } or 404
// The code alphabet is the relay's own (play/rooms/room.js); tests/kids-rooms.test.js checks the two still agree.

export const ALPHABET = '23456789ACDEFGHJKMNPQRTUVWXY';
export const KIND = 'talk';

const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const normCode = (s) => { const c = String(s || '').trim().toUpperCase(); return c.length === 4 && [...c].every((x) => ALPHABET.includes(x)) ? c : null; };
const makeCode = () => Array.from(crypto.getRandomValues(new Uint32Array(4)), (n) => ALPHABET[Math.floor((n / 4294967296) * ALPHABET.length)]).join('');
const sameSite = (request) => { try { return new URL(request.headers.get('origin')).host === new URL(request.url).host; } catch (e) { return false; } };

// The room's kind, or null when there is no open room by that code.
async function kindOf(stub) {
  const r = await stub.fetch('https://room/lookup');
  if (r.status !== 200) return null;
  try { return (await r.json()).kind || null; } catch (e) { return null; }
}

export async function rooms(request, env) {
  const url = new URL(request.url);
  const parts = url.pathname.replace(/^\/api\/room\/?/, '').split('/').filter(Boolean);
  if (!env || !env.ROOMS) return json(503, { error: 'Talk along is not set up yet' });
  const stub = (code) => env.ROOMS.get(env.ROOMS.idFromName(code));
  const upgrade = request.headers.get('Upgrade') === 'websocket';

  // The phone page asks whether a code is a talk room before it joins.
  if (parts.length === 1 && parts[0] !== 'open' && request.method === 'GET' && !upgrade) {
    const code = normCode(parts[0]);
    if (!code || (await kindOf(stub(code))) !== KIND) return json(404, { error: 'No room by that code' });
    return json(200, { kind: KIND });
  }
  if (!upgrade) return json(426, { error: 'A room speaks WebSocket' });
  if (!sameSite(request)) return json(403, { error: 'Only kids.voidtv.net pages may use these rooms' });

  if (parts.length === 1 && parts[0] === 'open') {
    if (url.searchParams.get('kind') !== KIND) return json(400, { error: 'Only talk rooms open here' });
    // The same tablet's next page takes its waiting room back with the room's code and key (the relay holds it 45 seconds).
    const back = normCode(url.searchParams.get('code')), key = url.searchParams.get('key') || '';
    if (back && /^[A-Za-z0-9_-]{20,64}$/.test(key)) {
      if ((await kindOf(stub(back))) !== KIND) return json(404, { error: 'No room by that code' });
      return stub(back).fetch(new Request('https://room/open?code=' + back + '&kind=' + KIND + '&key=' + key, request));
    }
    // A fresh code with no open room behind it (a clash is rare; a few tries settle it).
    for (let i = 0; i < 6; i++) {
      const code = makeCode();
      const r = await stub(code).fetch('https://room/lookup');
      if (r.status !== 404) continue;
      return stub(code).fetch(new Request('https://room/open?code=' + code + '&kind=' + KIND + '&origin=' + encodeURIComponent(url.origin), request));
    }
    return json(503, { error: 'No free room code right now. Try again.' });
  }
  if (parts.length === 2 && parts[1] === 'join') {
    const code = normCode(parts[0]);
    if (!code || (await kindOf(stub(code))) !== KIND) return json(404, { error: 'No room by that code' });
    const t = (url.searchParams.get('t') || '').slice(0, 64);
    return stub(code).fetch(new Request('https://room/join?t=' + encodeURIComponent(t), request));
  }
  return json(404, { error: 'Not found' });
}
