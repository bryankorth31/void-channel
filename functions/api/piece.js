// PLAY pass-through for big games (plan T21; Bryan, 20 Nov 2026: "Pass through voidtv"). Licence: GPL-2.0-or-later.
// The Internet Archive's /cors/ address lets voidtv.net read a game file but ignores Range, and its data servers answer
// Range but forbid cross-site reads. So the player asks here for one piece of a big game at a time, and this Function
// asks the Archive for those bytes and hands them on as they come. Guards, from his ruling:
//   * Only games on our own shelf that the card marks "stream": the request names a game id, never an address, so this
//     is no open proxy. The list (play/shelf/stream.js) is written by play/tools/shelf.js from the cards and drops a game
//     the nightly check found gone.
//   * Fixed 8 MB pieces, so a 400 MB game is 50 calls; this path cannot be used for a flood of small reads.
//   * Same site only (Sec-Fetch-Site), like /api/e; another site's page cannot spend our calls.
//   * Bytes only: nothing is stored, and Cloudflare is told not to cache the Archive's answer or ours.
//   * The same file, not just a file: the Archive's total length must match the card's recorded size.
// Redirects are followed by hand, to archive.org and its data servers only.
import STREAM from '../../play/shelf/stream.js';

export const PIECE = 8 * 1024 * 1024;
const NO_CACHE = { cacheTtlByStatus: { '100-599': -1 } };

const say = (status, text) => new Response(text + '\n', { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
const archiveHost = (u) => u.protocol === 'https:' && (u.hostname === 'archive.org' || u.hostname.endsWith('.archive.org'));
const fileUrl = (g) => 'https://archive.org/download/' + encodeURIComponent(g.item) + '/' + g.file.split('/').map(encodeURIComponent).join('/');

export async function handle(request, games, fetchImpl) {
  const url = new URL(request.url);
  const g = Object.prototype.hasOwnProperty.call(games, url.searchParams.get('game') || '') ? games[url.searchParams.get('game')] : null;
  if (!g) return say(404, 'Not a streamed game on this shelf');
  // Audit P21a: the header must be there and say same-origin. Browsers always send it; a script or curl without it is
  // refused too, so the pass-through answers only voidtv.net's own player.
  if (request.headers.get('sec-fetch-site') !== 'same-origin') return say(403, 'Only voidtv.net pages may ask for pieces');
  const p = url.searchParams.get('piece') || '';
  if (!/^\d{1,6}$/.test(p)) return say(400, 'piece must be a whole number');
  const start = +p * PIECE;
  if (start >= g.size) return say(416, 'Past the end of the file');
  const end = Math.min(g.size, start + PIECE) - 1;

  let target = fileUrl(g), up = null;
  for (let hop = 0; hop < 4; hop++) {
    up = await fetchImpl(target, { headers: { Range: 'bytes=' + start + '-' + end, 'Accept-Encoding': 'identity' }, redirect: 'manual', cf: NO_CACHE });
    if (up.status < 300 || up.status >= 400) break;
    const next = new URL(up.headers.get('location') || '', target);
    if (!archiveHost(next)) return say(502, 'The Archive sent us somewhere else');
    target = next.href; up = null;
  }
  if (!up) return say(502, 'The Archive kept redirecting');
  if (up.status === 404 || up.status === 410 || up.status === 403) return say(404, "This game's file is no longer on the Internet Archive");
  if (up.status !== 206) return say(502, 'The Archive answered ' + up.status);
  const total = +((/\/(\d+)\s*$/.exec(up.headers.get('content-range') || '') || [])[1] || 0);
  if (total !== g.size) return say(409, 'The Archive file has changed since this game was added');
  return new Response(up.body, { status: 200, headers: {
    'Content-Type': 'application/octet-stream', 'Content-Length': String(end - start + 1), 'Cache-Control': 'no-store',
    'Cross-Origin-Resource-Policy': 'same-origin', 'X-Piece-Of': String(g.size) } });
}

export const onRequestGet = ({ request }) => handle(request, STREAM, fetch);
