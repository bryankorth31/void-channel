// HQ: B's control room for VOIDtv. Runs on this PC only (binds 127.0.0.1), no login, no dependencies.
//   node scripts/hq.js            -> http://localhost:8780
// What it does (docs/HQ.md): shows and their episode grids with accept / reject / alias / exclude /
// id overrides written to catalog/overrides.json; jobs (hunt, match, art, people, publish...) started
// and watched with their logs; the show list and the home order edited; analytics read from
// Cloudflare (scripts/lib/cfa.js). The builder scripts are unchanged: HQ is a front for them.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const cfa = require('./lib/cfa');

const ROOT = path.join(__dirname, '..');
const PROFILE = require('./lib/profile');
const PORT = +(process.argv[process.argv.indexOf('--port') + 1] || 0) || PROFILE.port;
const { createTasks } = require('./lib/tasks');
// Jobs run under plain node. Inside the desktop app process.execPath is the app itself, so find node.
function nodeBin() {
  if (!process.versions.electron) return { bin: process.execPath, env: process.env };
  try { const w = execSync('where node', { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).toString().split(/\r?\n/).find((l) => /node\.exe$/i.test(l.trim())); if (w) return { bin: w.trim(), env: process.env }; } catch (e) { /* fall through */ }
  return { bin: process.execPath, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } };
}
const CACHE = path.join(PROFILE.catalogDir, 'cache');
const promos = require('./lib/promos'); // the Motion and Promos tabs: motion editor, site placements, share copies
promos.init({ nodeBin, cache: CACHE });
const FILES = {
  list: PROFILE.listFile,
  overrides: path.join(PROFILE.catalogDir, 'overrides.json'),
  order: path.join(PROFILE.catalogDir, 'home-order.json'),
  qr: path.join(PROFILE.catalogDir, 'qr.json'),
  art: path.join(PROFILE.catalogDir, 'art.json'),
  shows: path.join(PROFILE.catalogDir, 'shows'),
  candidates: path.join(PROFILE.catalogDir, 'candidates'),
};
const readJson = (p, fb) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fb; } };
const writeJson = (p, v) => { const tmp = p + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(v, null, 2) + '\n'); fs.renameSync(tmp, p); };
const slugify = (s) => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/['\u2019]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/ /g, '-').replace(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/, '$1-show'); // identical to match.js slug(): apostrophes vanish, & becomes and
const tail = (p, lines) => { try { return fs.readFileSync(p, 'utf8').trim().split('\n').slice(-lines).join('\n'); } catch (e) { return ''; } };

// ---- catalog views ----------------------------------------------------------------------------
let gridCache = { at: 0, map: new Map() };
function grids() {
  const now = Date.now();
  if (now - gridCache.at < 20000) return gridCache.map;
  const map = new Map();
  for (const f of fs.existsSync(FILES.shows) ? fs.readdirSync(FILES.shows) : []) {
    if (!f.endsWith('.json')) continue;
    const g = readJson(path.join(FILES.shows, f), null);
    if (g && g.slug) map.set(g.slug, g);
  }
  gridCache = { at: now, map };
  return map;
}
const gridStats = (g) => {
  let live = 0, review = 0, missing = 0, playing = 0, unplayable = 0;
  for (const se of g.seasons || []) for (const e of se.episodes || []) {
    if (e.state === 'LIVE') live++; else if (e.state === 'REVIEW') review++; else missing++;
    if (e.file && e.file.playable && !e.file.langRisk) playing++;
    if (e.file && !e.file.playable) unplayable++;
  }
  return { live, review, missing, playing, unplayable, total: live + review + missing };
};

function showRows() {
  const LIST = readJson(FILES.list, { types: [], shows: [] });
  const OV = readJson(FILES.overrides, {});
  const ART = readJson(FILES.art, {});
  const G = grids();
  return LIST.shows.map((s) => {
    const slug = slugify(s.name);
    const g = G.get(slug);
    const st = g ? gridStats(g) : null;
    const ov = OV[slug] || {};
    return {
      name: s.name, slug, type: s.type, network: s.network || (g && g.network) || '', tags: s.tags || [], added: s.added || null, source: s.source || null,
      hunted: fs.existsSync(path.join(FILES.candidates, slug + '.json')) || !!g, matched: !!g, matchedAt: g ? g.matchedAt : null,
      selfListed: !!(g && g.selfListed), noTvmaze: !!(g && g.noTvmaze),
      stats: st, hidden: !!ov.hidden, edited: Object.keys(ov).filter((k) => k !== 'note').length > 0,
      poster: ART[slug] && ART[slug].poster || null, year: ART[slug] && ART[slug].year || null,
    };
  });
}

function overview() {
  const rows = showRows();
  const by = (key) => {
    const m = {};
    for (const r of rows) for (const k of key === 'tags' ? r.tags : [r.type]) {
      const o = (m[k] = m[k] || { listed: 0, hunted: 0, playing: 0, review: 0 });
      o.listed++; if (r.hunted) o.hunted++; if (r.stats && r.stats.playing) o.playing++; if (r.stats && r.stats.review && !r.stats.playing) o.review++;
    }
    return m;
  };
  const tot = { listed: rows.length, hunted: 0, matched: 0, playing: 0, episodesLive: 0, episodesReview: 0, episodesPlaying: 0, hidden: 0 };
  for (const r of rows) { if (r.hunted) tot.hunted++; if (r.matched) tot.matched++; if (r.hidden) tot.hidden++; if (r.stats) { if (r.stats.playing) tot.playing++; tot.episodesLive += r.stats.live; tot.episodesReview += r.stats.review; tot.episodesPlaying += r.stats.playing; } }
  return {
    totals: tot, byType: by('type'), byTag: by('tags'),
    jobs: jobList(), processes: nodeProcesses(),
    publishLog: tail(path.join(CACHE, 'publish.log'), 4), nightlyLog: tail(path.join(CACHE, 'nightly.log'), 8),
    tasks: scheduledTasks(), git: gitState(), analytics: cfa.configured(), profile: PROFILE.name, siteName: PROFILE.siteName,
  };
}

function gitState() {
  try {
    const run = (c) => execSync(c, { cwd: ROOT, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return { head: run('git log -1 "--format=%h %s"'), dirty: run('git status --porcelain -- catalog docs scripts/show-list.json').split('\n').filter(Boolean).length, ahead: run('git rev-list --count origin/master..master') };
  } catch (e) { return { head: '?', dirty: 0, ahead: '?' }; }
}

function scheduledTasks() {
  try {
    const one = (n) => { try { return execSync('schtasks /Query /FO CSV /V /TN "' + n + '"', { stdio: ['ignore', 'pipe', 'ignore'] }).toString(); } catch (e) { return ''; } };
    const out = one(PROFILE.taskPrefix + ' Publish') + '\n' + one(PROFILE.taskPrefix + ' Nightly'); if (false) execSync('', { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    const lines = out.split('\n').filter((l) => l.startsWith('"') && !l.startsWith('"HostName"'));
    return lines.map((l) => { const c = l.split('","').map((x) => x.replace(/^"|"\r?$/g, '')); return { name: c[1].replace(/^\\/, ''), next: c[2], status: c[3], last: c[5], result: c[6] }; });
  } catch (e) { return []; }
}

function nodeProcesses() {
  try {
    const out = execSync('powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name=\'node.exe\'\\" | Select-Object ProcessId,CreationDate,CommandLine | ConvertTo-Json -Compress"', { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    let arr = out ? JSON.parse(out) : [];
    if (!Array.isArray(arr)) arr = [arr];
    return arr.filter((p) => /scripts[\\/](hunt|hunt-movies|match|art|people|db|publish|scout|networks|nightly|site|candidates|tvmovies)\.js/.test(p.CommandLine || ''))
      .map((p) => ({ pid: p.ProcessId, cmd: (p.CommandLine || '').replace(/^.*?node(\.exe)?"?\s+/i, '').replace(ROOT.replace(/\\/g, '\\\\'), '').trim(), started: (() => { const m = /\/Date\((\d+)\)/.exec(String(p.CreationDate)); return m ? new Date(+m[1]).toISOString() : String(p.CreationDate || ''); })() }));
  } catch (e) { return []; }
}

// ---- jobs -------------------------------------------------------------------------------------
const JOBS_FILE = path.join(CACHE, 'hq-jobs.json');
const JOBS = (() => { try { return JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8')).slice(0, 60); } catch (e) { return []; } })(); // survive an HQ restart
const saveJobs = () => { try { fs.mkdirSync(CACHE, { recursive: true }); fs.writeFileSync(JOBS_FILE, JSON.stringify(JOBS.slice(0, 60))); } catch (e) { /* best effort */ } };
const SCRIPTS = new Set(['hunt', 'hunt-movies', 'match', 'art', 'people', 'db', 'publish', 'scout', 'networks', 'site', 'nightly', 'candidates', 'tvmovies', 'show-probe', 'doctor', 'linkcheck', 'retvmaze']);
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return false; } };
function startJob(name, args) {
  if (!SCRIPTS.has(name)) throw new Error('unknown script ' + name);
  args = (args || []).map(String).slice(0, 20);
  const bad = args.find((a) => !/^[\w .,'&:()+\-"!?\/\u00C0-\u024F]*$/.test(a));
  if (bad) throw new Error('argument not allowed: ' + bad); // never silently drop an argument: a dropped show name turns a one-show job into a full run
  fs.mkdirSync(CACHE, { recursive: true });
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const log = path.join(CACHE, `hq-${name}-${id}.log`);
  const fd = fs.openSync(log, 'a');
  const nb = nodeBin();
  const child = spawn(nb.bin, [path.join(ROOT, 'scripts', name + '.js'), ...args], { cwd: ROOT, env: nb.env, detached: true, stdio: ['ignore', fd, fd], windowsHide: true });
  child.unref();
  const job = { id, name, args, pid: child.pid, started: new Date().toISOString(), log, done: null, code: null };
  child.on('exit', (code) => { job.done = new Date().toISOString(); job.code = code; saveJobs(); });
  JOBS.unshift(job); saveJobs();
  return job;
}
const jobList = () => JOBS.map((j) => { const running = j.done ? false : alive(j.pid); if (!running && !j.done) { j.done = new Date().toISOString(); j.code = j.code == null ? -1 : j.code; saveJobs(); } return { ...j, running, tail: tail(j.log, 3) }; });
function stopJob(pid) { try { execSync(`taskkill /PID ${+pid} /T /F`, { windowsHide: true, stdio: 'ignore' }); } catch (e) { /* gone */ } }

// ---- overrides --------------------------------------------------------------------------------
function patchOverride(slug, body) {
  const OV = readJson(FILES.overrides, {});
  const ov = OV[slug] || {};
  for (const [k, v] of Object.entries(body.set || {})) {
    if (v === null || v === '' || v === false || (typeof v === 'number' && !Number.isFinite(v))) { delete ov[k]; continue; }
    if (k === 'tvmazeId' || k === 'tmdbId') { const n = parseInt((String(v).match(/\d+/) || [])[0], 10); if (n > 0) ov[k] = n; else delete ov[k]; continue; } // a pasted URL still yields the id
    ov[k] = v;
  }
  for (const [k, vals] of Object.entries(body.push || {})) { const cur = new Set(Array.isArray(ov[k]) ? ov[k] : []); for (const v of [].concat(vals)) cur.add(v); ov[k] = [...cur]; }
  for (const [k, vals] of Object.entries(body.pull || {})) { if (!ov[k]) continue; const rm = new Set([].concat(vals)); ov[k] = ov[k].filter((v) => !rm.has(v)); if (!ov[k].length) delete ov[k]; }
  if (Object.keys(ov).length) OV[slug] = ov; else delete OV[slug];
  writeJson(FILES.overrides, OV);
  return ov;
}

// ---- show list --------------------------------------------------------------------------------
function patchList(body) {
  const LIST = readJson(FILES.list, { types: [], shows: [] });
  const have = new Set(LIST.shows.map((s) => slugify(s.name)));
  const added = [], skipped = [];
  for (const s of body.add || []) {
    const name = String(s.name || '').trim(); if (!name) continue;
    if (have.has(slugify(name))) { skipped.push(name); continue; }
    const typeOf = (t) => LIST.types.find((x) => x.toLowerCase() === String(t || '').trim().toLowerCase());
    const type = typeOf(s.type) || typeOf(body.defaultType);
    if (!type) { skipped.push(name + ' (unknown row: ' + (s.type || body.defaultType || '?') + ')'); continue; }
    const e = { name, type, network: String(s.network || '').trim() || undefined };
    const tags = [].concat(s.tags || []).map((t) => String(t).trim()).filter(Boolean); if (tags.length) e.tags = tags;
    if (s.tvmazeId || s.tmdbId) { const OV = readJson(FILES.overrides, {}); OV[slugify(name)] = { ...(OV[slugify(name)] || {}), ...(s.tvmazeId ? { tvmazeId: +s.tvmazeId } : {}), ...(s.tmdbId ? { tmdbId: +s.tmdbId } : {}) }; writeJson(FILES.overrides, OV); }
    LIST.shows.push(e); have.add(slugify(name)); added.push(name);
  }
  for (const name of body.remove || []) { const i = LIST.shows.findIndex((s) => s.name === name); if (i >= 0) LIST.shows.splice(i, 1); }
  for (const [name, patch] of Object.entries(body.update || {})) {
    const s = LIST.shows.find((x) => x.name === name); if (!s) continue;
    if (patch.type && LIST.types.includes(patch.type)) s.type = patch.type;
    if ('network' in patch) { if (patch.network) s.network = patch.network; else delete s.network; }
    if (patch.tags) { const t = [].concat(patch.tags).filter(Boolean); if (t.length) s.tags = t; else delete s.tags; }
  }
  if (body.types) LIST.types = body.types.filter(Boolean);
  writeJson(FILES.list, LIST);
  return { added, skipped, total: LIST.shows.length };
}

async function lookup(q) {
  const out = { tvmaze: [], tmdb: [] };
  try { const r = await fetch('https://api.tvmaze.com/search/shows?q=' + encodeURIComponent(q)); const j = await r.json(); out.tvmaze = j.slice(0, 8).map((x) => ({ id: x.show.id, name: x.show.name, premiered: x.show.premiered, network: (x.show.network || x.show.webChannel || {}).name || '', genres: x.show.genres, type: x.show.type, image: x.show.image && x.show.image.medium })); } catch (e) { out.tvmazeError = e.message; }
  try {
    const env = (() => { try { return fs.readFileSync(path.join(ROOT, 'backend', '.env'), 'utf8'); } catch (e) { return ''; } })();
    const tok = (process.env.TMDB_READ_TOKEN || (env.match(/^TMDB_READ_TOKEN=(.+)$/m) || [])[1] || '').trim();
    if (tok) { const r = await fetch('https://api.themoviedb.org/3/search/tv?query=' + encodeURIComponent(q), { headers: { Authorization: 'Bearer ' + tok } }); const j = await r.json(); out.tmdb = (j.results || []).slice(0, 8).map((x) => ({ id: x.id, name: x.name, year: (x.first_air_date || '').slice(0, 4), votes: x.vote_count, rating: x.vote_average, poster: x.poster_path ? 'https://image.tmdb.org/t/p/w92' + x.poster_path : null, overview: (x.overview || '').slice(0, 160) })); }
  } catch (e) { out.tmdbError = e.message; }
  return out;
}

// ---- home order -------------------------------------------------------------------------------
function homeOrder() {
  const file = readJson(FILES.order, null);
  if (Array.isArray(file) && file.length) return { order: file, source: 'catalog/home-order.json' };
  const { assemble } = require('./lib/app');
  return { order: assemble().homeOrder, source: 'built-in default' };
}

// ---- http -------------------------------------------------------------------------------------
const MIME = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.js': 'text/javascript', '.css': 'text/css' };
const send = (res, code, body, type) => { res.writeHead(code, { 'content-type': type || 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(type ? body : JSON.stringify(body)); };
const body = (req) => new Promise((ok, no) => { let d = ''; req.on('data', (c) => { d += c; if (d.length > 2e6) no(new Error('too big')); }); req.on('end', () => { try { ok(d ? JSON.parse(d) : {}); } catch (e) { no(e); } }); });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  // Local only: a web page in the owner's browser must not be able to drive HQ (publish, taskkill, overrides).
  const host = req.headers.host || '', origin = req.headers.origin || '';
  const local = (h) => /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(h);
  if (!local(host)) return send(res, 403, { error: 'HQ answers localhost only' });
  if (origin && !local(origin.replace(/^https?:\/\//, ''))) return send(res, 403, { error: 'cross-origin request refused' });
  if (req.method === 'POST' && p !== '/api/probe' && !/application\/json/i.test(req.headers['content-type'] || '')) return send(res, 415, { error: 'JSON only' });
  const SLUG_OK = /^[a-z0-9][a-z0-9-]*$/;
  try {
    if (p === '/' || p === '/index.html') return send(res, 200, fs.readFileSync(path.join(__dirname, 'hq', 'index.html')), MIME['.html']);
    if (p.startsWith('/brand/')) { const f = path.join(ROOT, 'assets', 'brand', p.slice(7)); if (!f.startsWith(path.join(ROOT, 'assets', 'brand')) || !fs.existsSync(f)) return send(res, 404, 'no', 'text/plain'); return send(res, 200, fs.readFileSync(f), MIME[path.extname(f)] || 'application/octet-stream'); }
    if (p === '/api/overview') return send(res, 200, overview());
    if (p === '/api/health') return send(res, 200, readJson(path.join(CACHE, 'health.json'), { level: 'none', checks: [] }));
    if (p === '/api/tasks/recreate' && req.method === 'POST') { try { return send(res, 200, { made: createTasks(nodeBin().bin) }); } catch (e) { return send(res, 500, { error: (e.stderr ? e.stderr.toString() : e.message).slice(0, 200) }); } }
    if (p === '/api/shows') return send(res, 200, { types: readJson(FILES.list, { types: [] }).types, rows: showRows() });
    if (p.startsWith('/api/show/')) {
      const slug = decodeURIComponent(p.slice(10));
      if (!SLUG_OK.test(slug)) return send(res, 400, { error: 'bad slug' });
      const LIST = readJson(FILES.list, { shows: [] });
      const entry = LIST.shows.find((s) => slugify(s.name) === slug) || null;
      const grid = readJson(path.join(FILES.shows, slug + '.json'), null);
      const cand = readJson(path.join(FILES.candidates, slug + '.json'), null);
      return send(res, 200, { entry, grid, overrides: readJson(FILES.overrides, {})[slug] || {}, art: readJson(FILES.art, {})[slug] || null, candidates: cand ? { items: (cand.items || []).length, files: (cand.items || []).reduce((n, it) => n + (it.files || []).length, 0), at: cand.at || cand.huntedAt || null } : null });
    }
    if (p.startsWith('/api/override/') && req.method === 'POST') { const slug = decodeURIComponent(p.slice(14)); if (!SLUG_OK.test(slug)) return send(res, 400, { error: 'bad slug' }); const b = await body(req); const ov = patchOverride(slug, b); let job = null; if (b.rematch !== false) job = startJob('match', ['--slug', slug]); return send(res, 200, { overrides: ov, job }); }
    if (p === '/api/list' && req.method === 'POST') return send(res, 200, patchList(await body(req)));
    if (p === '/api/lookup') return send(res, 200, await lookup(url.searchParams.get('q') || ''));
    if (p === '/api/qr' && req.method === 'GET') return send(res, 200, { codes: readJson(FILES.qr, {}), base: PROFILE.domain + '/q/' });
    if (p === '/api/qr' && req.method === 'POST') { const b = await body(req); const all = readJson(FILES.qr, {}); const code = String(b.code || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40); if (!code) throw new Error('code needed: letters, digits, dashes'); if (b.remove) { delete all[code]; } else { if (!/^https?:\/\//.test(String(b.url || ''))) throw new Error('target must start with http(s)://'); all[code] = { url: String(b.url).slice(0, 500), label: String(b.label || '').slice(0, 120), created: (all[code] && all[code].created) || new Date().toISOString().slice(0, 10) }; } writeJson(FILES.qr, all); return send(res, 200, { codes: all }); }
    if (p === '/api/order' && req.method === 'GET') { const rows = showRows(); const tags = [...new Set(rows.flatMap((r) => r.tags))].sort(); return send(res, 200, { ...homeOrder(), types: [...readJson(FILES.list, { types: [] }).types, 'TV Movies', 'Specials'], tags }); }
    if (p === '/api/order' && req.method === 'POST') { const b = await body(req); if (!Array.isArray(b.order)) throw new Error('order must be an array'); writeJson(FILES.order, b.order.filter((x) => Array.isArray(x) && x.length === 2)); return send(res, 200, { ok: true }); }
    if (p === '/api/jobs' && req.method === 'GET') return send(res, 200, { jobs: jobList(), processes: nodeProcesses() });
    if (p === '/api/jobs' && req.method === 'POST') { const b = await body(req); return send(res, 200, startJob(b.name, b.args)); }
    if (p.startsWith('/api/jobs/') && p.endsWith('/log')) { const id = p.split('/')[3]; const j = JOBS.find((x) => x.id === id); if (!j) return send(res, 404, { error: 'no job' }); return send(res, 200, { log: tail(j.log, +url.searchParams.get('tail') || 200), running: j.done ? false : alive(j.pid) }); }
    if (p.startsWith('/api/jobs/') && p.endsWith('/stop') && req.method === 'POST') { const id = p.split('/')[3]; const j = JOBS.find((x) => x.id === id); if (j) stopJob(j.pid); return send(res, 200, { ok: true }); }
    if (p === '/api/processes/stop' && req.method === 'POST') { const b = await body(req); stopJob(b.pid); return send(res, 200, { ok: true }); }
    if (p === '/api/log') { const name = (url.searchParams.get('name') || '').replace(/[^\w.-]/g, ''); return send(res, 200, { log: tail(path.join(CACHE, name), +url.searchParams.get('tail') || 100) }); }
    if (p === '/api/probe') { // playback probes from a test page on this PC (cross-origin from the local site server)
      res.setHeader('access-control-allow-origin', '*'); res.setHeader('access-control-allow-headers', 'content-type');
      if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
      if (req.method === 'POST') { const b = await body(req); fs.mkdirSync(CACHE, { recursive: true }); fs.appendFileSync(path.join(CACHE, 'probe.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...b }) + '\n'); return send(res, 200, { ok: true }); }
      return send(res, 200, { lines: tail(path.join(CACHE, 'probe.jsonl'), 50).split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean) });
    }
    // ---- motion and promos (scripts/lib/promos.js) ----
    if (p === '/api/motion') return send(res, 200, await promos.motionStatus());
    if (p === '/api/motion/start' && req.method === 'POST') { const b = await body(req); return send(res, 200, await promos.motionStart({ restart: !!b.restart })); }
    if (p === '/api/promos') return send(res, 200, { ...promos.overview(), motion: await promos.motionStatus() });
    if (p.startsWith('/api/promos/task/')) return send(res, 200, promos.task(p.slice(17)) || { state: 'unknown' });
    if (p.startsWith('/api/promos/') && req.method === 'POST') {
      const b = await body(req); const act = p.slice(12);
      const ACTS = { send: promos.send, place: promos.place, unplace: promos.unplace, move: promos.move, rename: promos.rename, remove: promos.remove, share: promos.share, 'open-share': promos.openShare, 'go-live': promos.goLive };
      if (!ACTS[act]) return send(res, 404, { error: 'unknown action' });
      return send(res, 200, await ACTS[act](b));
    }
    if (p === '/api/promos/live') return send(res, 200, promos.liveStatus());
    if (p === '/media') { // HQ's own previews of renders and site copies; Range so long videos seek
      const f = promos.mediaPath(url.searchParams.get('f')); const size = fs.statSync(f).size;
      const type = /\.jpg$/i.test(f) ? 'image/jpeg' : /\.webm$/i.test(f) ? 'video/webm' : 'video/mp4';
      const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
      if (!m) { res.writeHead(200, { 'content-type': type, 'content-length': size, 'accept-ranges': 'bytes', 'cache-control': 'no-store' }); return fs.createReadStream(f).pipe(res); }
      const a = m[1] ? +m[1] : Math.max(0, size - +m[2]), z = m[1] && m[2] ? Math.min(+m[2], size - 1) : size - 1;
      if (a >= size || a > z) { res.writeHead(416, { 'content-range': `bytes */${size}` }); return res.end(); }
      res.writeHead(206, { 'content-type': type, 'content-length': z - a + 1, 'content-range': `bytes ${a}-${z}/${size}`, 'accept-ranges': 'bytes', 'cache-control': 'no-store' });
      return fs.createReadStream(f, { start: a, end: z }).pipe(res);
    }
    if (p.startsWith('/api/analytics/')) { const name = p.slice(15); if (!cfa.configured()) return send(res, 200, { unconfigured: true, rows: [] }); return send(res, 200, { rows: await cfa.report(name, url.searchParams.get('days') || 7) }); }
    return send(res, 404, { error: 'not found' });
  } catch (e) { return send(res, 500, { error: e.message }); }
});

function start(opts = {}) {
  const port = opts.port || PORT;
  return new Promise((ok, no) => {
    server.once('error', no);
    server.listen(port, '127.0.0.1', () => {
      console.log(`VOIDtv HQ at http://localhost:${port}  (Ctrl+C to stop)`);
      if (opts.open || process.argv.includes('--open')) { try { execSync(`start http://localhost:${port}`, { windowsHide: true, stdio: 'ignore', shell: true }); } catch (e) { /* fine */ } }
      ok({ port, server });
    });
  });
}
module.exports = { start, PORT, ROOT };
if (require.main === module) start().catch((e) => { console.error(e.message); process.exit(1); });
