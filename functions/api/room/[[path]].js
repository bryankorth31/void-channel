// /api/room/*: the door to the phone relay's rooms (PLAY phone controllers and Trivia Nights). Licence: GPL-2.0-or-later.
// Bryan, 20 Nov 2026: "Yes, phone controllers". Each room is a Durable Object in the voidtv-rooms Worker (play/rooms/worker/),
// bound here as ROOMS. Same addresses as the local server (play/rooms/local.js); contract in the shared notes.
//   WebSocket /api/room/open?kind=pad|trivia   a big screen opens a room with a fresh code
//   WebSocket /api/room/CODE/join              a phone joins it
//   GET       /api/room/CODE                   { kind } or 404, for the join page
// Only a page from this same site may open or join, so no other web page can use the relay. Named guests (GUESTS, matched on
// the exact origin, no wildcard) may use only the kinds listed for them: University's lesson rooms (Bryan, 21 Nov 2026: "we
// need to corect the relay door to allow university"). kids.voidtv.net reaches the rooms by its own Worker's binding, not here.
import R from '../../../play/rooms/room.js';

const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const randomCode = () => R.makeCode(() => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296);
const sameSite = (request) => { try { return new URL(request.headers.get('origin')).host === new URL(request.url).host; } catch (e) { return false; } };
const GUESTS = { 'https://university.voidtv.net': ['lesson'] };
// The kinds this request's page may use: every kind for this site's own pages, the listed ones for a named guest, none else.
const kindsFor = (request) => sameSite(request) ? R.KINDS
  : Object.prototype.hasOwnProperty.call(GUESTS, request.headers.get('origin') || '') ? GUESTS[request.headers.get('origin')] : [];

export async function onRequest({ request, env, params }) {
  const parts = [].concat(params.path || []);
  if (!env.ROOMS) return json(503, { error: 'Phone rooms are not set up on this site yet' });
  const stub = (code) => env.ROOMS.get(env.ROOMS.idFromName(code));
  const upgrade = request.headers.get('Upgrade') === 'websocket';

  if (parts.length === 1 && parts[0] !== 'open' && request.method === 'GET' && !upgrade) {
    const code = R.normCode(parts[0]);
    if (!code) return json(404, { error: 'No room by that code' });
    const r = await stub(code).fetch('https://room/lookup');
    // A named guest's join page may read the answer (CORS), for its own kinds only.
    const o = request.headers.get('origin') || '';
    if (!sameSite(request) && Object.prototype.hasOwnProperty.call(GUESTS, o)) {
      const body = await r.text(); let kind = ''; try { kind = JSON.parse(body).kind || ''; } catch (e) { kind = ''; }
      if (r.status === 200 && !GUESTS[o].includes(kind)) return json(404, { error: 'No room by that code' });
      return new Response(body, { status: r.status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': o, vary: 'Origin' } });
    }
    return r;
  }
  if (!upgrade) return json(426, { error: 'A room speaks WebSocket' });
  const may = kindsFor(request);
  if (!may.length) return json(403, { error: 'Only voidtv.net pages may use rooms' });

  if (parts.length === 1 && parts[0] === 'open') {
    const kind = new URL(request.url).searchParams.get('kind');
    if (!R.KINDS.includes(kind)) return json(400, { error: 'Unknown kind' });
    if (!may.includes(kind)) return json(403, { error: 'This page may not open that kind of room' });
    // The same screen's next page takes its waiting room back: its code and the room's key (Bryan, 20 Nov 2026: the phone
    // connected on the shelf stays connected in the game).
    const back = R.normCode(new URL(request.url).searchParams.get('code')), key = new URL(request.url).searchParams.get('key') || '';
    if (back && /^[A-Za-z0-9_-]{20,64}$/.test(key)) {
      const u = 'https://room/open?code=' + back + '&kind=' + kind + '&key=' + key;
      return stub(back).fetch(new Request(u, request));
    }
    // A fresh code: one that has no open room now (a clash is rare; a few tries settle it).
    for (let i = 0; i < 6; i++) {
      const code = randomCode();
      const r = await stub(code).fetch('https://room/lookup');
      if (r.status !== 404) continue;
      const u = 'https://room/open?code=' + code + '&kind=' + kind + '&origin=' + encodeURIComponent(sameSite(request) ? new URL(request.url).origin : request.headers.get('origin'));
      return stub(code).fetch(new Request(u, request));
    }
    return json(503, { error: 'No free room code right now. Try again.' });
  }
  if (parts.length === 2 && parts[1] === 'join') {
    const code = R.normCode(parts[0]);
    if (!code) return json(404, { error: 'No room by that code' });
    // A guest joins only a room of its own kinds: the room is looked up first.
    if (may !== R.KINDS) {
      const r = await stub(code).fetch('https://room/lookup');
      let kind = ''; try { kind = r.status === 200 ? (await r.json()).kind || '' : ''; } catch (e) { kind = ''; }
      if (!may.includes(kind)) return json(403, { error: 'This page may not join that room' });
    }
    const t = new URL(request.url).searchParams.get('t') || '';
    return stub(code).fetch(new Request('https://room/join?t=' + encodeURIComponent(t.slice(0, 64)), request));
  }
  return json(404, { error: 'Not found' });
}
