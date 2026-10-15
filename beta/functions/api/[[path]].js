// VOIDtv Beta API. Separate Cloudflare Pages project (voidtv-beta) with its own KV store (binding DB).
// Nothing here reads from or writes to VOIDtv itself.
// KV keys:  t:<code> tester {name, created, active}   r:<ts>-<id> report (metadata = summary)
//           s:<id> screenshot data URL                 note  message shown to testers
//           c:<code>:<yyyy-mm-dd> daily report counter (expires)
// Admin calls need header x-admin equal to the ADMIN_KEY secret.

const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const str = (v, n) => (v == null ? '' : String(v)).slice(0, n);
const rid = (n = 8) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(36).padStart(2, '0').slice(-1)).join('');
const TYPES = ['broken', 'wontplay', 'wrong', 'looks', 'idea', 'love'];
const STATUS = ['new', 'seen', 'fixing', 'fixed', 'wontfix'];
const DAILY_LIMIT = 40;

function same(a, b) {
  a = String(a || ''); b = String(b || '');
  if (!a || !b || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function tester(env, code) {
  code = str(code, 40).replace(/[^a-z0-9]/gi, '');
  if (!code) return null;
  const t = await env.DB.get('t:' + code, 'json');
  return t && t.active !== false ? { ...t, code } : null;
}

async function allReports(env) {
  const out = []; let cursor;
  do {
    const page = await env.DB.list({ prefix: 'r:', cursor });
    for (const k of page.keys) out.push({ key: k.name, ...(k.metadata || {}) });
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return out.sort((a, b) => (b.ts || 0) - (a.ts || 0));
}

const summary = (r) => ({ id: r.id, ts: r.ts, tester: r.tester, name: r.name, type: r.type, status: r.status, show: str(r.show, 80), text: str(r.text, 140), shot: !!r.shot, reply: str(r.reply, 300) });

export async function onRequest({ request, env, params }) {
  if (!env.DB) return json({ error: 'storage not bound' }, 500);
  const parts = [].concat(params.path || []);
  const route = parts.join('/');
  const url = new URL(request.url);
  const method = request.method;
  const body = method === 'POST' ? await request.json().catch(() => ({})) : {};
  const isAdmin = same(request.headers.get('x-admin'), env.ADMIN_KEY);

  // ---------- tester side ----------
  if (route === 'me' && method === 'GET') {
    const t = await tester(env, url.searchParams.get('t'));
    if (!t) return json({ error: 'invite not found' }, 404);
    return json({ name: t.name, note: (await env.DB.get('note')) || '' });
  }

  if (route === 'report' && method === 'POST') {
    const t = await tester(env, body.t);
    if (!t) return json({ error: 'invite not found' }, 404);
    const type = TYPES.includes(body.type) ? body.type : 'broken';
    const text = str(body.text, 4000).trim();
    if (!text && type !== 'love') return json({ error: 'say what happened' }, 400);
    const day = new Date().toISOString().slice(0, 10);
    const ck = `c:${t.code}:${day}`;
    const count = +(await env.DB.get(ck)) || 0;
    if (count >= DAILY_LIMIT) return json({ error: 'that is a lot of reports for one day, thank you. try again tomorrow' }, 429);
    await env.DB.put(ck, String(count + 1), { expirationTtl: 60 * 60 * 36 });
    const ts = Date.now();
    const id = rid(8);
    let shot = false;
    if (typeof body.shot === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(body.shot) && body.shot.length < 3_000_000) {
      await env.DB.put('s:' + id, body.shot); shot = true;
    }
    const cf = request.cf || {};
    const r = {
      id, ts, tester: t.code, name: t.name, type, status: 'new', reply: '', shot,
      show: str(body.show, 200), link: str(body.link, 500), text,
      device: { ua: str(request.headers.get('user-agent'), 300), screen: str(body.screen, 40), tz: str(body.tz, 60), lang: str(body.lang, 20), country: str(cf.country, 4) },
    };
    await env.DB.put(`r:${ts}-${id}`, JSON.stringify(r), { metadata: summary(r) });
    return json({ ok: true, id });
  }

  if (route === 'mine' && method === 'GET') {
    const t = await tester(env, url.searchParams.get('t'));
    if (!t) return json({ error: 'invite not found' }, 404);
    const mine = (await allReports(env)).filter((r) => r.tester === t.code).slice(0, 100);
    return json({ reports: mine.map(({ key, tester: _t, ...r }) => r) });
  }

  if (route.startsWith('shot/') && method === 'GET') {
    const id = str(parts[1], 20).replace(/[^a-z0-9]/g, '');
    if (!env.ADMIN_KEY || !isAdmin) return new Response('no', { status: 403 });
    const d = await env.DB.get('s:' + id);
    if (!d) return new Response('gone', { status: 404 });
    const m = d.match(/^data:(image\/\w+);base64,(.*)$/);
    const bin = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
    return new Response(bin, { headers: { 'content-type': m[1], 'cache-control': 'private, max-age=3600' } });
  }

  // ---------- admin side ----------
  if (!route.startsWith('admin/')) return json({ error: 'not found' }, 404);
  if (!env.ADMIN_KEY || !isAdmin) return json({ error: 'admin key needed' }, 401);
  const sub = parts.slice(1).join('/');

  if (sub === 'check') return json({ ok: true });

  if (sub === 'reports' && method === 'GET') return json({ reports: await allReports(env) });

  if (sub === 'report' && method === 'GET') {
    const r = await env.DB.get(str(url.searchParams.get('key'), 80), 'json');
    return r ? json(r) : json({ error: 'gone' }, 404);
  }

  if (sub === 'report' && method === 'POST') {
    const key = str(body.key, 80);
    if (!key.startsWith('r:')) return json({ error: 'bad key' }, 400);
    if (body.delete) {
      const r = await env.DB.get(key, 'json');
      if (r && r.shot) await env.DB.delete('s:' + r.id);
      await env.DB.delete(key); return json({ ok: true });
    }
    const r = await env.DB.get(key, 'json');
    if (!r) return json({ error: 'gone' }, 404);
    if (STATUS.includes(body.status)) r.status = body.status;
    if (typeof body.reply === 'string') r.reply = str(body.reply, 2000);
    await env.DB.put(key, JSON.stringify(r), { metadata: summary(r) });
    return json({ ok: true, report: r });
  }

  if (sub === 'testers' && method === 'GET') {
    const list = await env.DB.list({ prefix: 't:' });
    const out = [];
    for (const k of list.keys) { const t = await env.DB.get(k.name, 'json'); if (t) out.push({ code: k.name.slice(2), ...t }); }
    return json({ testers: out.sort((a, b) => (a.created || '').localeCompare(b.created || '')) });
  }

  if (sub === 'testers' && method === 'POST') {
    if (body.remove) { await env.DB.delete('t:' + str(body.remove, 40)); return json({ ok: true }); }
    if (body.code && typeof body.active === 'boolean') {
      const t = await env.DB.get('t:' + str(body.code, 40), 'json');
      if (!t) return json({ error: 'gone' }, 404);
      t.active = body.active; await env.DB.put('t:' + str(body.code, 40), JSON.stringify(t)); return json({ ok: true });
    }
    const name = str(body.name, 60).trim();
    if (!name) return json({ error: 'name needed' }, 400);
    const code = rid(10);
    const t = { name, created: new Date().toISOString(), active: true };
    await env.DB.put('t:' + code, JSON.stringify(t));
    return json({ ok: true, code, ...t });
  }

  if (sub === 'note' && method === 'POST') { await env.DB.put('note', str(body.note, 2000)); return json({ ok: true }); }
  if (sub === 'note' && method === 'GET') return json({ note: (await env.DB.get('note')) || '' });

  return json({ error: 'not found' }, 404);
}
