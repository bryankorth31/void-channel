// Password gate for the test deployment (Cloudflare Pages Functions). Active only when the Pages
// project has a SITE_PASSWORD environment variable; otherwise every request passes straight through.
// The right password sets a cookie for 30 days. Remove the variable to open the site.
const COOKIE = 'voidtv_gate';

async function token(secret) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('voidtv:' + secret));
  return [...new Uint8Array(buf)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const PAGE = (wrong) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>VOIDtv</title><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#07080c url(/assets/brand/bg/sign-pink.jpg) center/cover no-repeat;color:#e8e8ee;font:16px system-ui,Segoe UI,Roboto,sans-serif}
form{text-align:center;background:rgba(7,8,12,.72);padding:28px 32px;border-radius:14px;border:1px solid rgba(255,255,255,.08);backdrop-filter:blur(6px)}b{font-size:34px;letter-spacing:.04em}b span{color:#5fd4ff}p{color:#8a8fa3;margin:8px 0 18px}
input{background:#0f1118;border:1px solid #1d2130;color:#e8e8ee;padding:10px 14px;border-radius:8px;font:inherit;width:220px}
button{background:#5fd4ff;border:0;color:#07080c;padding:10px 16px;border-radius:8px;font:inherit;font-weight:600;margin-left:6px;cursor:pointer}
.w{color:#f3c969;font-size:13px;margin-top:10px}
</style></head><body><form method="post"><b>VOID<span>tv</span></b><p>before AI slop, there was human creativity</p>
<input type="password" name="p" placeholder="password" autofocus><button>enter</button>${wrong ? '<div class="w">not it</div>' : ''}</form></body></html>`;

export async function onRequest({ request, env, next }) {
  const secret = env.SITE_PASSWORD;
  if (!secret) return next();
  if (new URL(request.url).pathname.startsWith('/assets/brand/')) return next(); // the gate page's own background and icons
  const want = await token(secret);
  const cookies = request.headers.get('cookie') || '';
  if (cookies.split(';').some((c) => c.trim() === `${COOKIE}=${want}`)) return next();
  if (request.method === 'POST') {
    const form = await request.formData().catch(() => null);
    if (form && form.get('p') === secret) {
      const host = new URL(request.url).hostname;
      const domain = /(^|\.)voidtv\.net$/.test(host) ? '; Domain=voidtv.net' : ''; // one password for www and the bare domain
      return new Response(null, { status: 303, headers: { Location: new URL(request.url).pathname || '/', 'Set-Cookie': `${COOKIE}=${want}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax${domain}` } });
    }
    return new Response(PAGE(true), { status: 401, headers: { 'content-type': 'text/html; charset=utf-8' } });
  }
  return new Response(PAGE(false), { status: 401, headers: { 'content-type': 'text/html; charset=utf-8' } });
}
