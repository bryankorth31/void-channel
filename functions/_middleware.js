// Password gate for the test deployment (Cloudflare Pages Functions). Active only when the Pages
// project has a SITE_PASSWORD environment variable; otherwise every request passes straight through.
// The right password sets a cookie for 30 days. Remove the variable to open the site.
const COOKIE = 'voidtv_gate';

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
</style></head><body><form method="post"><p>before AI slop, there was human creativity</p>
<input type="password" name="p" placeholder="password" autofocus><button>enter</button>${wrong ? '<div class="w">not it</div>' : ''}</form></body></html>`;

// After the password: back to the page they asked for, never to //evil.example/… (a protocol-relative open redirect).
const safePath = (u) => { const x = new URL(u); const p = x.pathname.replace(/^\/+/, '/'); return (/^\/[^\\]*$/.test(p) ? p : '/') + x.search; };
export async function onRequest({ request, env, next }) {
  const secret = env.SITE_PASSWORD;
  if (!secret) return next();
  const pathname = new URL(request.url).pathname;
  if (pathname.startsWith('/assets/brand/') || pathname === '/version.txt') return next(); // the gate page's own background and icons
  const want = await token(secret, env.GATE_KEY);
  const cookies = request.headers.get('cookie') || '';
  if (cookies.split(';').some((c) => c.trim() === `${COOKIE}=${want}`)) return next();
  if (request.method === 'POST') {
    const form = await request.formData().catch(() => null);
    if (form && form.get('p') === secret) {
      const host = new URL(request.url).hostname;
      const domain = /(^|\.)voidtv\.net$/.test(host) ? '; Domain=voidtv.net' : ''; // one password for www and the bare domain
      return new Response(null, { status: 303, headers: { Location: safePath(request.url), 'Set-Cookie': `${COOKIE}=${want}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax${domain}` } });
    }
    return new Response(PAGE(true), { status: 401, headers: { 'content-type': 'text/html; charset=utf-8' } });
  }
  return new Response(PAGE(false), { status: 401, headers: { 'content-type': 'text/html; charset=utf-8' } });
}
