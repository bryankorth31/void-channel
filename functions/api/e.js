// Analytics intake (Cloudflare Pages Function at /api/e). The page posts a small batch of anonymous
// events; this stamps each with what the request already carries (country, region, city, device,
// browser, OS) and writes it to the Workers Analytics Engine dataset bound as VOIDTV_EVENTS.
// No cookies are read or set, no IP is stored. Without the binding it accepts and drops (204), so the
// site never depends on it. docs/HQ.md has the event list and the one-time dashboard step.
const str = (v, n = 200) => (v == null ? '' : String(v)).slice(0, n);

function agent(ua) {
  const device = /iPad|Tablet|PlayBook|Silk/i.test(ua) ? 'tablet'
    : /Mobi|iPhone|Android.*Mobile|Windows Phone/i.test(ua) ? 'phone'
    : /SmartTV|SMART-TV|HbbTV|CrKey|Roku|AFT[A-Z]|BRAVIA|Tizen|Web0S|AppleTV|Xbox|PlayStation/i.test(ua) ? 'tv'
    : 'desktop';
  const browser = /Edg\//.test(ua) ? 'edge' : /OPR\/|Opera/.test(ua) ? 'opera' : /SamsungBrowser/.test(ua) ? 'samsung'
    : /Firefox\//.test(ua) ? 'firefox' : /CriOS/.test(ua) ? 'chrome' : /Chrome\//.test(ua) ? 'chrome'
    : /Safari\//.test(ua) ? 'safari' : 'other';
  const os = /Windows/.test(ua) ? 'windows' : /Android/.test(ua) ? 'android' : /iPhone|iPad|iPod/.test(ua) ? 'ios'
    : /Mac OS/.test(ua) ? 'mac' : /CrOS/.test(ua) ? 'chromeos' : /Linux/.test(ua) ? 'linux' : 'other';
  return { device, browser, os };
}

const TYPES = new Set(['view', 'play', 'tick', 'end', 'error', 'tune', 'tvplay', 'search', 'act', 'report']);
export async function onRequestPost({ request, env }) {
  const len = +(request.headers.get('content-length') || 0);
  if (!len || len > 16384) return new Response(null, { status: 413 }); // a batch is a few hundred bytes; never buffer a flood
  const sfs = request.headers.get('sec-fetch-site');
  if (sfs && !['same-origin', 'same-site', 'none'].includes(sfs)) return new Response(null, { status: 403 });
  let events;
  try { events = await request.json(); } catch (e) { return new Response(null, { status: 400 }); }
  if (!Array.isArray(events)) events = [events];
  const ds = env.VOIDTV_EVENTS;
  if (!ds) return new Response(null, { status: 204 });
  const cf = request.cf || {};
  const { device, browser, os } = agent(request.headers.get('user-agent') || '');
  for (const e of events.slice(0, 25)) {
    if (!e || typeof e !== 'object' || !TYPES.has(e.t)) continue;
    const sid = str(e.sid, 32) || 'anon';
    ds.writeDataPoint({
      indexes: [sid],
      blobs: [
        str(e.t, 16),          // 1 type: view play tick end error tune tvplay search act report
        str(e.slug, 80),       // 2 show slug (or channel id)
        str(e.ep, 16),         // 3 season x episode
        str(e.page, 24),       // 4 view: home grid show tv me person about
        str(cf.country, 2),    // 5
        str(cf.region, 64),    // 6
        str(cf.city, 64),      // 7
        device,                // 8
        browser,               // 9
        os,                    // 10
        str(e.ref, 80),        // 11 referrer host (external only)
        str(e.q, 80),          // 12 search query
        sid,                   // 13 anonymous session id (rotates monthly, lives in the visitor's browser)
        str(e.x, 200),         // 14 extra: file / item / action
        str(cf.colo, 8),       // 15
        str(cf.timezone, 40),  // 16
      ],
      doubles: [Number(e.pos) || 0, Number(e.dur) || 0, Number(e.n) || 0],
    });
  }
  return new Response(null, { status: 204 });
}

export function onRequestGet() {
  return new Response('voidtv analytics intake: POST a JSON array of events', { headers: { 'content-type': 'text/plain' } });
}
