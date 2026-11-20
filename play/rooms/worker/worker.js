// VoidTV rooms on Cloudflare: one Durable Object per room, named by its code. Licence: GPL-2.0-or-later (play/LICENSE).
// Bryan, 20 Nov 2026: "Yes, phone controllers". The site's Function (functions/api/room/[[path]].js) hands each socket here;
// the room core (play/rooms/room.js, the same one the local server runs and the tests check) does the rest. Nothing is
// written to storage: a room lives in memory and is gone when its screen leaves or it times out.
// Deploy (Bryan's own terminal, once): cd play/rooms/worker && npx wrangler deploy. Then bind it to the Pages project as ROOMS.
import R from '../room.js';

export class Room {
  constructor(state) { this.state = state; this.room = null; }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/lookup') {
      const open = this.room && this.room.open;
      return new Response(JSON.stringify(open ? { kind: this.room.kind } : { error: 'No room by that code' }),
        { status: open ? 200 : 404, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
    }
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('A room speaks WebSocket', { status: 426 });
    const pair = new WebSocketPair(), client = pair[0], server = pair[1];
    server.accept();
    const send = (s, t) => { try { s.send(t); } catch (e) { /* gone */ } };
    const close = (s, code, why) => { try { s.close(code, why); } catch (e) { /* gone */ } };
    if (url.pathname === '/open') {
      if (this.room && this.room.open) { close(server, R.CLOSE.full, 'This room already has a screen'); return new Response(null, { status: 101, webSocket: client }); }
      const room = R.createRoom({ code: url.searchParams.get('code'), kind: url.searchParams.get('kind'), send, close });
      this.room = room;
      room.addHost(server, url.searchParams.get('origin') || '');
      server.addEventListener('message', (e) => room.message(server, typeof e.data === 'string' ? e.data : ''));
      server.addEventListener('close', () => { room.drop(server); });
      server.addEventListener('error', () => { room.drop(server); });
      await this.state.storage.setAlarm(Date.now() + 60 * 1000);
    } else if (url.pathname === '/join') {
      const room = this.room;
      if (!room || !room.open) { close(server, R.CLOSE.noRoom, 'No room by that code'); return new Response(null, { status: 101, webSocket: client }); }
      if (room.addPhone(server) !== null) {
        server.addEventListener('message', (e) => room.message(server, typeof e.data === 'string' ? e.data : ''));
        server.addEventListener('close', () => room.drop(server));
        server.addEventListener('error', () => room.drop(server));
      }
    } else close(server, 4400, 'Unknown');
    return new Response(null, { status: 101, webSocket: client });
  }

  // Once a minute while the room is open: end it if it has been idle 30 minutes or open 4 hours.
  async alarm() {
    if (!this.room || !this.room.open) { this.room = null; return; }
    if (this.room.tick() === 'ended') { this.room = null; return; }
    await this.state.storage.setAlarm(Date.now() + 60 * 1000);
  }
}

// The Worker itself answers nothing: rooms are reached only through the site's Function.
export default { fetch: () => new Response('Not found', { status: 404 }) };
