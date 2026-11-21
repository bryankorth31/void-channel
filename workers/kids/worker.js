// voidtv.net kids at kids.voidtv.net: open, no password (Bryan, 17 Nov 2026). The Worker still runs first on every
// request so the kids rules hold on every answer:
// - every page carries the kids security policy from functions/_middleware.js (no TMDB, no Sentry, no framing);
// - nothing about a child is collected: /api/e keeps only counts (which show and episode, how many times) in the
//   Analytics Engine dataset voidtv_kids_events, apart from Void TV's own;
// - the Pages files copied into the build (functions, _routes.json) and the QR codes are never served;
// - search engines may find it (Bryan, 17 Nov 2026: "Let search engines in"); robots.txt is the build's own (all
//   allowed but /data/).
// A SITE_PASSWORD left on the Worker by mistake is ignored: the open site is this file's choice, not a missing secret.
// - /api/room/* is Watch and Talk's door to the phone rooms (rooms.js): talk rooms only, kids pages only, through PLAY's
//   voidtv-rooms Durable Object bound as ROOMS (Bryan, 21 Nov 2026: "Start now"; profiles/kids/docs/PLAN-kids-watch-and-talk.md).
import { onRequest } from '../../functions/_middleware.js';
import { onRequestPost as countEvents } from '../../functions/api/e.js';
import { rooms } from './rooms.js';

const plain = (body, status) => new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // Doors that answer before the page middleware: a WebSocket answer must reach the browser as the room gave it, and
    // these answers are JSON, never a page. (A later door, such as the CD-ROM games' pieces, goes here the same way.)
    if (url.pathname === '/api/room' || url.pathname.startsWith('/api/room/')) return rooms(request, env);
    const kidsEnv = { ...env, GATE_BRAND: 'kids', SITE_PASSWORD: undefined };
    const next = async () => {
      const p = url.pathname;
      // Counts only (Bryan, 18 Nov 2026: kids needs the analytics HQ has for Void TV). functions/api/e.js keeps a kids
      // host in AGGREGATE mode: the event name and a show/episode key, nothing about the child or the device (COPPA).
      if (p === '/api/e' && request.method === 'POST') return countEvents({ request, env: { ...env, ANALYTICS_MODE: 'aggregate' } });
      if (p.startsWith('/api/')) return new Response(null, { status: 204 });
      if (p.startsWith('/q/') || p === '/qr.json' || p.startsWith('/functions/') || p === '/_routes.json') return plain('Not found', 404);
      return env.ASSETS.fetch(request);
    };
    const res = await onRequest({ request, env: kidsEnv, next });
    return noBeacon(url.pathname.startsWith('/games/') ? gamesHeaders(url.pathname, res) : res);
  },
};

// No Cloudflare page-view beacon on a kids page (the PLAY auditor, 21 Nov 2026: a page contacted
// static.cloudflareinsights.com). The zone's Web Analytics adds that script to HTML at Cloudflare's edge for real
// browsers; Cloudflare does not change a response marked no-transform, so every HTML answer here carries it. Kids keeps
// only its own counts (/api/e, aggregate). If the beacon still shows, Web Analytics must exclude kids.voidtv.net.
function noBeacon(res) {
  if (!/text\/html/i.test(res.headers.get('content-type') || '')) return res;
  const out = new Response(res.body, res);
  const cc = out.headers.get('cache-control');
  if (!/no-transform/i.test(cc || '')) out.headers.set('cache-control', cc ? cc + ', no-transform' : 'no-transform');
  return out;
}

// Computer games (/games/, scripts/lib/games/build.js): PLAY's engine runs the PC on its own thread, which a browser
// allows only on a page that is cross-origin isolated, so every file under /games/ carries the two headers that turn
// that on (same-origin only: the shelf's pictures are our own copies, and the game file comes through archive.org/cors/).
// Its security policy adds what the engine needs (WebAssembly, its worker). A game that is not on kids has no card here,
// and the site's single-page fallback is never served as a card: a missing card is a plain 404.
const GAMES_CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' blob: 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob: https://archive.org https://*.archive.org; connect-src 'self' https://archive.org https://*.archive.org; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; worker-src 'self' blob:";
function gamesHeaders(p, res) {
  if (/\.(json|js|wasm|css|jpg)$/.test(p) && /text\/html/.test(res.headers.get('content-type') || '')) return plain('Not found', 404);
  const out = new Response(res.body, res);
  out.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  out.headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  out.headers.set('Content-Security-Policy-Report-Only', GAMES_CSP);
  return out;
}
