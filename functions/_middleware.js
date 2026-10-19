// Password gate for the test deployment (Cloudflare Pages Functions). Active only when the Pages
// project has a SITE_PASSWORD environment variable; otherwise every request passes straight through.
// The right password sets a cookie for 30 days. Remove the variable to open the site.
// Three things wrap that gate (audit fix batch B, B3):
//   * www.voidtv.net is sent to voidtv.net with a 301 (same path and query) before anything else, gate on or off (F-004, CF-025).
//     Once the gate is off, scripts/site.js narrows _routes.json to /api/* and /q/*, so this Function only sees those paths
//     and a Cloudflare Redirect Rule on the zone has to do the www redirect for pages (docs/DEPLOY.md, opening day).
//   * Every answer, the gate page included, carries the security headers below (CF-012). The 401 page also gets Cache-Control: no-store.
//   * The gate itself is unchanged and still follows only the SITE_PASSWORD variable; the build reads the same variable to
//     choose the routes (scripts/site.js), so the two cannot disagree (CF-003).
const COOKIE = 'voidtv_gate';
// Keep in step with SECURITY_HEADERS in scripts/lib/siteguards.js (a Function cannot import from scripts/);
// tests/site-middleware.test.js fails when the two differ. The Content-Security-Policy is report-only: it blocks nothing.
const SECURITY = [
  ['Strict-Transport-Security', 'max-age=31536000'],
  ['X-Frame-Options', 'DENY'],
  ['X-Content-Type-Options', 'nosniff'],
  ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  ['Permissions-Policy', 'camera=(), microphone=(), geolocation=()'],
  ['Content-Security-Policy-Report-Only', "default-src 'self'; script-src 'self' 'unsafe-inline' https://js.sentry-cdn.com https://browser.sentry-cdn.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://image.tmdb.org https://archive.org https://*.archive.org; media-src 'self' blob: https://archive.org https://*.archive.org; connect-src 'self' https://archive.org https://*.archive.org https://*.ingest.sentry.io https://*.ingest.us.sentry.io; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'"],
];
// A response from next() is normally mutable; one that is not (a redirect or a cached asset) is copied first.
function withSecurity(res) {
  let out = res;
  try { for (const [k, v] of SECURITY) out.headers.set(k, v); } catch (e) { out = new Response(res.body, res); for (const [k, v] of SECURITY) out.headers.set(k, v); }
  if (out.status === 401) out.headers.set('Cache-Control', 'no-store'); // the password page is never cached
  return out;
}

async function token(secret, key) {
  if (key) { // a GATE_KEY variable on the Pages project makes the cookie an HMAC that can be rotated without changing the password
    const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode('voidtv:' + secret));
    return [...new Uint8Array(sig)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('voidtv:' + secret));
  return [...new Uint8Array(buf)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const PAGE = (wrong) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>VOIDtv</title><style>
html{height:100%;overflow:hidden}body{margin:0;height:100%;height:100svh;display:grid;place-items:end center;padding-bottom:max(9svh,28px);box-sizing:border-box;background:#07080c url(/assets/brand/bg/sign-pink.jpg) center/cover no-repeat;color:#e8e8ee;font:16px system-ui,Segoe UI,Roboto,sans-serif}
form{text-align:center;padding:0 16px}p{color:#d9dbe6;margin:0 0 14px;font-size:17px;text-shadow:0 2px 12px rgba(0,0,0,.9)}
input{background:rgba(7,8,12,.78);border:1px solid rgba(255,255,255,.14);color:#e8e8ee;padding:12px 16px;border-radius:10px;font:inherit;width:min(260px,62vw)}
button{background:#5fd4ff;border:0;color:#07080c;padding:12px 18px;border-radius:10px;font:inherit;font-weight:600;margin-left:6px;cursor:pointer}
.w{color:#f3c969;font-size:13px;margin-top:10px;text-shadow:0 1px 6px rgba(0,0,0,.9)}
@media(max-width:600px){body{background-image:url(/assets/brand/bg/sign-pink-m.jpg)}}
#gv{position:fixed;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;opacity:0;transition:opacity .8s;pointer-events:none}#gv.on{opacity:1}form{position:relative;z-index:1}
</style></head><body><video id="gv" muted loop playsinline aria-hidden="true"></video><form method="post"><p>before AI slop, there was human creativity</p>
<input type="password" name="p" placeholder="password" autocomplete="current-password" autocapitalize="none" autocorrect="off" spellcheck="false" autofocus><button>enter</button>${wrong ? '<div class="w">not it. capitals and spaces do not matter, so check the spelling</div>' : ''}</form>
<script>/* HQ's Promos tab can set a silent loop (assets/brand/promos/promos.json, slot "gate"). It starts after the page has
loaded so it never slows the gate, and is skipped for reduced motion and data saver; the still picture stays underneath. */
addEventListener('load',function(){var v=document.getElementById('gv');if(!v||!window.fetch||matchMedia('(prefers-reduced-motion: reduce)').matches)return;var c=navigator.connection;if(c&&(c.saveData||/2g/.test(c.effectiveType||'')))return;
fetch('/assets/brand/promos/promos.json',{cache:'no-cache'}).then(function(r){return r.ok?r.json():null}).then(function(j){var g=j&&j.slots&&j.slots.gate;if(!g||!g.shapes)return;var s=innerHeight>innerWidth?(g.shapes.tall||g.shapes.wide):(g.shapes.wide||g.shapes.tall);if(!s)return;
v.src='/assets/brand/promos/'+encodeURIComponent(s.src);v.addEventListener('playing',function(){v.className='on'},{once:true});var p=v.play();if(p&&p.catch)p.catch(function(){})}).catch(function(){})});
</script></body></html>`;

// After the password: back to the page they asked for, never to //evil.example/… (a protocol-relative open redirect).
const safePath = (u) => { const x = new URL(u); const p = x.pathname.replace(/^\/+/, '/'); return (/^\/[^\\]*$/.test(p) ? p : '/') + x.search; };
export async function onRequest(ctx) {
  const url = new URL(ctx.request.url);
  if (url.hostname === 'www.voidtv.net') return withSecurity(new Response(null, { status: 301, headers: { Location: 'https://voidtv.net' + url.pathname + url.search, 'Cache-Control': 'public, max-age=3600' } }));
  return withSecurity(await gate(ctx));
}

async function gate({ request, env, next }) {
  const secret = env.SITE_PASSWORD;
  if (!secret) return next();
  const pathname = new URL(request.url).pathname;
  if (pathname.startsWith('/assets/brand/') || pathname === '/version.txt' || pathname === '/qr.json' || pathname.startsWith('/q/')) return next(); // scans from a shirt must land somewhere even while the gate is on // the gate page's own background and icons
  const want = await token(secret, env.GATE_KEY);
  const cookies = request.headers.get('cookie') || '';
  if (cookies.split(';').some((c) => c.trim() === `${COOKIE}=${want}`)) return next();
  if (request.method === 'POST') {
    const form = await request.formData().catch(() => null);
    const norm = (v) => String(v || '').normalize('NFKC').replace(/[\s​-‍﻿]+/g, '').toLowerCase(); // phones add capitals, trailing spaces and invisible characters when a password is pasted from a text
    if (form && norm(form.get('p')) === norm(secret)) {
      const host = new URL(request.url).hostname;
      const domain = /(^|\.)voidtv\.net$/.test(host) ? '; Domain=voidtv.net' : ''; // one password for www and the bare domain
      return new Response(null, { status: 303, headers: { Location: safePath(request.url), 'Set-Cookie': `${COOKIE}=${want}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax${domain}` } });
    }
    return new Response(PAGE(true), { status: 401, headers: { 'content-type': 'text/html; charset=utf-8' } });
  }
  return new Response(PAGE(false), { status: 401, headers: { 'content-type': 'text/html; charset=utf-8' } });
}
