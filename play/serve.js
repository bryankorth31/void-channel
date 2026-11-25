// Serves VoidTV PLAY on http://127.0.0.1:8789/play/ (this computer only). Set PORT to use another port.
//   node play/serve.js
// The engine runs the PC on its own thread, which browsers allow only on a page that is "cross-origin isolated", so
// the player and its files carry the two headers that turn that on. The shelf (/play/ itself) does not: it shows box
// art straight from the Internet Archive, which an isolated page may not load. The site sends the same split.
// /assets/ is served from the repo's assets folder, as on voidtv.net. /api/piece runs the site's own pass-through Function
// (functions/api/piece.js, plan T21) against the real Internet Archive. A port can also be given: node play/serve.js 8790
const http = require('http');
const fs = require('fs');
const path = require('path');
const PORT = +process.argv[2] || +process.env.PORT || 8789;
const { pathToFileURL } = require('url');
const PLAY = __dirname, ASSETS = path.join(__dirname, '..', 'assets'), TRIVIA = path.join(__dirname, '..', 'trivia');
// The phone remote's scripts (remote/README.md): PLAY's and Trivia's pages load /remote/src/follow.js.
const REMOTE = path.join(__dirname, '..', 'remote');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const PLAIN = { 'cache-control': 'no-store' };
const ISOLATE = { 'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'require-corp', 'cache-control': 'no-store' };
// Rooms for phone controllers and Trivia Nights (play/rooms/), the same addresses as voidtv.net's.
const rooms = require('./rooms/local.js').createRooms();
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/api/room' || p === '/api/room/') return rooms.status(req, res);   // are phone rooms on?
  const room = /^\/api\/room\/([^/]+)$/.exec(p);
  if (room && room[1] !== 'open') return rooms.lookup(req, res, room[1]);
  if (p === '/join') p = '/play/join.html';
  // Trivia Nights (its own chat owns trivia/): the host screen at /trivia/, the phone page at /trivia/phone, plain files.
  if (p === '/trivia' || p === '/trivia/phone') p = p === '/trivia' ? '/trivia/' : '/trivia/phone.html';
  if (p === '/api/piece') return piece(req, res);
  if (p === '/api/drafts') return drafts(req, res);
  if (p === '/api/layout') return layout(req, res);
  if (p === '/' || p === '/play') { res.writeHead(302, { location: '/play/' }); return res.end(); }
  let root = null;
  if (p.startsWith('/play/')) { root = PLAY; p = p.slice(5); } else if (p.startsWith('/assets/')) { root = ASSETS; p = p.slice(7); }
  else if (p.startsWith('/trivia/')) { root = TRIVIA; p = p.slice(7); }
  else if (p.startsWith('/remote/')) { root = REMOTE; p = p.slice(7); }
  if (!root) { res.writeHead(404, ISOLATE); return res.end('not found'); }
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, path.normalize(p).replace(/^([/\\])+/, ''));
  if (!f.startsWith(root)) { res.writeHead(403, ISOLATE); return res.end(); }
  fs.readFile(f, (e, b) => {
    if (e) { res.writeHead(404, ISOLATE); return res.end('not found'); }
    // Not isolated: the shelf and the approve page show Archive pictures, which an isolated page may not load.
    const shelf = root === TRIVIA || (root === PLAY && (f === path.join(PLAY, 'index.html') || f === path.join(PLAY, 'tools', 'approve.html')));
    res.writeHead(200, Object.assign({ 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }, shelf ? PLAIN : ISOLATE));
    res.end(b);
  });
}).on('upgrade', rooms.upgrade).listen(PORT, '127.0.0.1', () => console.log('VoidTV PLAY: http://127.0.0.1:' + PORT + '/play/'));

// The pass-through, as voidtv.net runs it: the Function module and its list of streamed games, read fresh each time.
async function piece(req, res) {
  try {
    const fn = await import(pathToFileURL(path.join(__dirname, '..', 'functions', 'api', 'piece.js')).href);
    const list = (await import(pathToFileURL(path.join(PLAY, 'shelf', 'stream.js')).href + '?t=' + Date.now())).default;
    const headers = { 'sec-fetch-site': req.headers['sec-fetch-site'] || '' };
    const r = await fn.handle(new Request('http://127.0.0.1' + req.url, { headers }), list, fetch);
    res.writeHead(r.status, Object.fromEntries(r.headers));
    if (!r.body) return res.end();
    for await (const chunk of r.body) res.write(chunk);
    res.end();
  } catch (e) { res.writeHead(500, PLAIN); res.end(String(e.message || e)); }
}

// Plan G4: the approve page (play/tools/approve.html, on this PC only; the site never copies play/tools or play/drafts).
// GET lists every draft; POST { collection, id, decision: 'shelf' | 'kids' | 'skip' } decides one. Approving moves the
// draft into play/cards (marked kids: true for the Kids learning list), looks up its facts and rebuilds the shelf list.
// Only a page from this same server may decide (Sec-Fetch-Site), so no other page in the browser can approve a game.
const { execFile } = require('child_process');
const DRAFTS = path.join(PLAY, 'drafts');
const send = (res, code, obj) => { res.writeHead(code, Object.assign({ 'content-type': 'application/json' }, PLAIN)); res.end(JSON.stringify(obj)); };
const safeName = (x) => typeof x === 'string' && /^[A-Za-z0-9._-]{1,120}$/.test(x);
// The controller layout editor (play/tools/layout.html, on this PC only) saves here: POST { pad, way, set } puts one
// layout into play/layouts.json, the file the real pads place their parts from (src/padlayout.js); set null takes it
// out, and that pad goes back to its built-in layout. Only what a layouts file may hold is written (PadLayout.clean).
// Nothing reaches voidtv.net until the next push.
const PadLayout = require('./src/padlayout.js');
const LAYOUTS = process.env.PLAY_LAYOUTS || path.join(PLAY, 'layouts.json');   // the tests write to a file of their own
function layout(req, res) {
  if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host || '')) return send(res, 403, { error: 'This computer only' });
  if (req.method !== 'POST' || req.headers['sec-fetch-site'] !== 'same-origin') return send(res, 403, { error: 'Only the layout page on this PC may save' });
  let body = '';
  req.on('data', (c) => { body += c; if (body.length > 20000) req.destroy(); });
  req.on('end', () => {
    let d; try { d = JSON.parse(body); } catch (e) { return send(res, 400, { error: 'Not JSON' }); }
    if (!d || !PadLayout.PADS.includes(d.pad) || !PadLayout.WAYS.includes(d.way)) return send(res, 400, { error: 'Which pad, and held which way?' });
    let file = {}; try { file = JSON.parse(fs.readFileSync(LAYOUTS, 'utf8')); } catch (e) { /* none yet */ }
    file = PadLayout.clean(file);
    if (d.set === null) { if (file[d.pad]) { delete file[d.pad][d.way]; if (!Object.keys(file[d.pad]).length) delete file[d.pad]; } }
    else {
      const one = PadLayout.clean({ [d.pad]: { [d.way]: d.set } });
      if (!one[d.pad]) return send(res, 400, { error: 'That layout has no part the pads know' });
      file[d.pad] = Object.assign(file[d.pad] || {}, one[d.pad]);
    }
    fs.writeFileSync(LAYOUTS, JSON.stringify(file, null, 2) + '\n');
    send(res, 200, { ok: true, file });
  });
}
function drafts(req, res) {
  // Audit D-1: this computer's own address only, so a web page that points a borrowed name at 127.0.0.1 gets nothing.
  if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host || '')) return send(res, 403, { error: 'This computer only' });
  if (req.method === 'GET') {
    const out = [];
    for (const col of fs.existsSync(DRAFTS) ? fs.readdirSync(DRAFTS).filter((d) => fs.statSync(path.join(DRAFTS, d)).isDirectory()) : []) {
      for (const f of fs.readdirSync(path.join(DRAFTS, col)).filter((x) => x.endsWith('.json'))) {
        try { out.push(Object.assign({ collection: col }, JSON.parse(fs.readFileSync(path.join(DRAFTS, col, f), 'utf8')))); } catch (e) { /* a broken draft is left out */ }
      }
    }
    // The auditor's boot checks (audit/play-mode/drafts-boot/<collection>.json, on this PC only), when there are any.
    const boot = {};
    for (const col of new Set(out.map((x) => x.collection))) {
      try { boot[col] = JSON.parse(fs.readFileSync(path.join(PLAY, '..', 'audit', 'play-mode', 'drafts-boot', col + '.json'), 'utf8')); } catch (e) { /* none yet */ }
    }
    return send(res, 200, { drafts: out, boot });
  }
  if (req.method !== 'POST' || req.headers['sec-fetch-site'] !== 'same-origin') return send(res, 403, { error: 'Only the approve page on this PC may decide' });
  let body = '';
  req.on('data', (c) => { body += c; if (body.length > 10000) req.destroy(); });
  req.on('end', () => {
    let d; try { d = JSON.parse(body); } catch (e) { return send(res, 400, { error: 'Not JSON' }); }
    if (!safeName(d.collection) || !safeName(d.id) || !['shelf', 'kids', 'skip'].includes(d.decision)) return send(res, 400, { error: 'Bad request' });
    const from = path.join(DRAFTS, d.collection, d.id + '.json');
    if (!fs.existsSync(from)) return send(res, 404, { error: 'No such draft' });
    const card = JSON.parse(fs.readFileSync(from, 'utf8'));
    if (d.decision === 'skip') {
      fs.mkdirSync(path.join(DRAFTS, d.collection, 'skipped'), { recursive: true });
      fs.renameSync(from, path.join(DRAFTS, d.collection, 'skipped', d.id + '.json'));
      return send(res, 200, { ok: true, decided: 'skip' });
    }
    const to = path.join(PLAY, 'cards', d.id + '.json');
    if (fs.existsSync(to)) return send(res, 409, { error: 'A card with that id is already on the shelf' });
    delete card.draft;
    if (d.decision === 'kids') card.kids = true;
    fs.writeFileSync(to, JSON.stringify(card, null, 2) + '\n');
    fs.unlinkSync(from);
    // Facts, then the shelf list; the card is on the shelf once both have run.
    execFile(process.execPath, [path.join(PLAY, 'tools', 'facts.js')], () => {
      execFile(process.execPath, [path.join(PLAY, 'tools', 'shelf.js')], (e) => send(res, e ? 500 : 200, e ? { error: 'The shelf list did not rebuild: ' + e.message } : { ok: true, decided: d.decision }));
    });
  });
}
