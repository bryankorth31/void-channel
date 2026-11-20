// TRIVIA NIGHTS: the marking page's server (plan C0). Runs on this PC only (127.0.0.1); the page is never on the live
// site (scripts/site.js copies only trivia/index.html, phone.html, trivia.css, src and bank). A person picks a show
// or film that plays, scrubs an episode from archive.org, marks the stretch that says the show, and saves it with their
// name. Every save is checked against the catalog (scripts/trivia/moments.js) before it is written.
// Usage: node scripts/trivia/mark.js [port]     then open http://127.0.0.1:8813/
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const M = require('./moments');

const ROOT = path.join(__dirname, '..', '..');
const PAGE = path.join(ROOT, 'trivia', 'mark');
const PORT = +process.argv[2] || +process.env.PORT || 8813;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

// Every show and film clip rounds may use, best known first where the fame list ranks it (catalog/trivia-fame.json).
function titles(db) {
  let fame = {};
  try { fame = JSON.parse(fs.readFileSync(path.join(ROOT, 'catalog', 'trivia-fame.json'), 'utf8')); } catch { /* no list yet */ }
  const rankOf = (cat, tmdb) => { const t = (fame[cat] || []).find((x) => x.tmdb === tmdb); return t ? { rank: t.rank, views: t.views } : {}; };
  const counts = {};
  for (const key of M.allKeys()) counts[key] = M.load(key).length;
  const out = [];
  for (const r of db.prepare(`select s.slug, s.name, s.tmdb_id as tmdb, substr(s.premiered, 1, 4) as year, count(*) as eps
      from shows s join (select show_slug from episodes where ${M.CLIP_OK} and seconds >= 300) e on e.show_slug = s.slug
      group by s.slug`).iterate()) {
    out.push({ key: r.slug, kind: 'show', name: r.name, year: r.year ? Number(r.year) : null, eps: r.eps, moments: counts[r.slug] || 0, ...rankOf('tv', r.tmdb) });
  }
  for (const r of db.prepare(`select tmdb_id as tmdb, title, year from movies where ${M.CLIP_OK} and seconds >= 600`).iterate()) {
    const key = 'film-' + r.tmdb;
    out.push({ key, kind: 'film', name: r.title, year: r.year || null, eps: 1, moments: counts[key] || 0, ...rankOf('film', r.tmdb) });
  }
  return out.sort((a, b) => (a.rank || 1e9) - (b.rank || 1e9) || a.name.localeCompare(b.name));
}

// The files of one title: a show's clip episodes, or the one film file.
function filesOf(db, key) {
  const film = /^film-(\d+)$/.exec(key);
  if (film) { const f = M.filmOf(db, Number(film[1])); return f ? [{ label: f.title + (f.year ? ' (' + f.year + ')' : ''), item: f.item, url: f.url, seconds: f.seconds }] : []; }
  return M.episodesOf(db, key).map((e) => ({ season: e.season, number: e.number, label: `S${e.season} E${e.number}` + (e.name ? ' ' + e.name : ''), item: e.item, url: e.url, seconds: e.seconds }));
}

function send(res, code, body, type) {
  res.writeHead(code, { 'Content-Type': type || 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', (c) => { s += c; if (s.length > 20000) { reject(new Error('too big')); req.destroy(); } });
    req.on('end', () => { try { resolve(JSON.parse(s)); } catch { reject(new Error('not JSON')); } });
  });
}

// A moment from what the page sent, with only the fields a moment has, and the catalog's own file for it.
function fromPage(b, db) {
  const film = /^film-(\d+)$/.exec(String(b.key || ''));
  const base = film ? { film: Number(film[1]) } : { show: String(b.key || ''), season: Number(b.season), number: Number(b.number) };
  const file = M.fileFor(db, base);
  const at = new Date().toISOString();
  const by = String(b.by || '').trim();
  const start = Math.round(Number(b.start) * 10) / 10;
  const m = {
    ...base, kind: String(b.kind || ''), item: file ? file.item : null, url: file ? file.url : null,
    start, end: b.kind === 'still' ? start : Math.round(Number(b.end) * 10) / 10,
    ...(b.line && String(b.line).trim() ? { line: String(b.line).trim() } : {}),
    ...(b.note && String(b.note).trim() ? { note: String(b.note).trim() } : {}),
    by, at, approved: { by, at },
  };
  return { m: { id: M.momentId(m), ...m }, file };
}

function server() {
  const db = M.openDb();
  return http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1');
    try {
      if (u.pathname === '/') { res.writeHead(302, { Location: '/trivia/mark/' }); return res.end(); }
      if (u.pathname === '/api/titles') return send(res, 200, titles(db));
      if (u.pathname === '/api/files') return send(res, 200, filesOf(db, u.searchParams.get('key') || ''));
      if (u.pathname === '/api/moments' && req.method === 'GET') return send(res, 200, M.load(u.searchParams.get('key') || ''));
      if (u.pathname === '/api/moments' && req.method === 'POST') {
        const { m, file } = fromPage(await readBody(req), db);
        const p = M.problems(m, file);
        if (p.length) return send(res, 400, { error: p.join('; ') });
        const key = M.keyOf(m);
        const list = M.load(key).filter((x) => x.id !== m.id);
        M.save(key, list.concat([m]));
        return send(res, 200, m);
      }
      if (u.pathname === '/api/moments' && req.method === 'DELETE') {
        const key = u.searchParams.get('key') || '', id = u.searchParams.get('id') || '';
        const list = M.load(key);
        if (!list.some((x) => x.id === id)) return send(res, 404, { error: 'No moment by that id' });
        M.save(key, list.filter((x) => x.id !== id));
        return send(res, 200, { removed: id });
      }
      if (u.pathname.startsWith('/trivia/mark/')) {
        const rel = u.pathname.slice('/trivia/mark/'.length) || 'index.html';
        const f = path.join(PAGE, rel);
        if (!f.startsWith(PAGE + path.sep) || !fs.existsSync(f)) return send(res, 404, 'Not found', 'text/plain');
        return send(res, 200, fs.readFileSync(f), TYPES[path.extname(f)] || 'application/octet-stream');
      }
      return send(res, 404, 'Not found', 'text/plain');
    } catch (e) { return send(res, 400, { error: e.message }); }
  });
}

if (require.main === module) server().listen(PORT, '127.0.0.1', () => console.log('Trivia marking page: http://127.0.0.1:' + PORT + '/trivia/mark/'));
module.exports = { server, titles, filesOf, fromPage };
