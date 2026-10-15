// QR and short-link tracking: https://voidtv.net/q/<code> logs the scan (code, country, region, city,
// device, browser) to the analytics dataset and forwards to the code's target. Codes live in
// catalog/qr.json (HQ > QR codes edits it; site.js publishes it as /qr.json). No cookies, no IPs.
// The password gate lets /q/ through so a stranger's scan still lands somewhere sensible.
const str = (v, n = 200) => (v == null ? '' : String(v)).slice(0, n);
export async function onRequestGet({ request, env, params }) {
  const code = String(params.code || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
  let map = {};
  try { const r = await env.ASSETS.fetch(new URL('/qr.json', request.url)); if (r.ok) map = await r.json(); } catch (e) { /* no map: fall through to home */ }
  const entry = map[code];
  const target = entry && entry.url ? entry.url : new URL('/', request.url).toString();
  const ua = request.headers.get('user-agent') || '';
  const device = /iPad|Tablet/i.test(ua) ? 'tablet' : /Mobi|iPhone|Android.*Mobile/i.test(ua) ? 'phone' : 'desktop';
  const browser = /Edg\//.test(ua) ? 'edge' : /Firefox\//.test(ua) ? 'firefox' : /CriOS|Chrome\//.test(ua) ? 'chrome' : /Safari\//.test(ua) ? 'safari' : 'other';
  const cf = request.cf || {};
  if (env.VOIDTV_EVENTS) {
    try {
      env.VOIDTV_EVENTS.writeDataPoint({
        indexes: ['qr'],
        blobs: ['qr', code, entry ? 'known' : 'unknown', 'qr', str(cf.country, 2), str(cf.region, 64), str(cf.city, 64), device, browser, '', str(request.headers.get('referer') || '', 80), '', 'qr', str(entry && entry.label, 80), str(cf.colo, 8), str(cf.timezone, 40)],
        doubles: [0, 0, 1],
      });
    } catch (e) { /* analytics is never allowed to break the redirect */ }
  }
  const u = new URL(target, request.url);
  if (!u.searchParams.has('via')) u.searchParams.set('via', code || 'unknown');
  return new Response(null, { status: 302, headers: { Location: u.toString(), 'cache-control': 'no-store' } });
}
