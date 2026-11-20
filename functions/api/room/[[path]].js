// /api/room/*: the door to the phone relay's rooms (PLAY phone controllers and Trivia Nights). Licence: GPL-2.0-or-later.
// Bryan, 20 Nov 2026: "Yes, phone controllers". Each room is a Durable Object in the voidtv-rooms Worker (play/rooms/worker/),
// bound here as ROOMS. Same addresses as the local server (play/rooms/local.js); contract in the shared notes.
//   WebSocket /api/room/open?kind=pad|trivia   a big screen opens a room with a fresh code
//   WebSocket /api/room/CODE/join              a phone joins it
//   GET       /api/room/CODE                   { kind } or 404, for the join page
// Only a page from this same site may open or join, so no other web page can use the relay.
import R from '../../../play/rooms/room.js';

const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const randomCode = () => R.makeCode(() => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296);
const sameSite = (request) => { try { return new URL(request.headers.get('origin')).host === new URL(request.url).host; } catch (e) { return false; } };

export async function onRequest({ request, env, params }) {
  const parts = [].concat(params.path || []);
  if (!env.ROOMS) return json(503, { error: 'Phone rooms are not set up on this site yet' });
  const stub = (code) => env.ROOMS.get(env.ROOMS.idFromName(code));
  const upgrade = request.headers.get('Upgrade') === 'websocket';

  if (parts.length === 1 && parts[0] !== 'open' && request.method === 'GET' && !upgrade) {
    const code = R.normCode(parts[0]);
    if (!code) return json(404, { error: 'No room by that code' });
    return stub(code).fetch('https://room/lookup');
  }
  if (!upgrade) return json(426, { error: 'A room speaks WebSocket' });
  if (!sameSite(request)) return json(403, { error: 'Only voidtv.net pages may use rooms' });

  if (parts.length === 1 && parts[0] === 'open') {
    const kind = new URL(request.url).searchParams.get('kind');
    if (!R.KINDS.includes(kind)) return json(400, { error: 'Unknown kind' });
    // A fresh code: one that has no open room now (a clash is rare; a few tries settle it).
    for (let i = 0; i < 6; i++) {
      const code = randomCode();
      const r = await stub(code).fetch('https://room/lookup');
      if (r.status !== 404) continue;
      const u = 'https://room/open?code=' + code + '&kind=' + kind + '&origin=' + encodeURIComponent(new URL(request.url).origin);
      return stub(code).fetch(new Request(u, request));
    }
    return json(503, { error: 'No free room code right now. Try again.' });
  }
  if (parts.length === 2 && parts[1] === 'join') {
    const code = R.normCode(parts[0]);
    if (!code) return json(404, { error: 'No room by that code' });
    return stub(code).fetch(new Request('https://room/join', request));
  }
  return json(404, { error: 'Not found' });
}
