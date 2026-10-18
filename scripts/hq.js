// HQ: B's control room for VOIDtv. Runs on this PC only (binds 127.0.0.1), no login, no dependencies.
//   node scripts/hq.js            -> http://localhost:8780
// What it does (docs/HQ.md): shows and their episode grids with accept / reject / alias / exclude /
// id overrides written to catalog/overrides.json; jobs (hunt, match, art, people, publish...) started
// and watched with their logs; the show list and the home order edited; analytics read from
// Cloudflare (scripts/lib/cfa.js). The builder scripts are unchanged: HQ is a front for them.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, execSync, execFile, execFileSync } = require('child_process');
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
// HQ's own state (the jobs list, job logs, probe lines) lives here. HQ_STATE_DIR points it at another folder; the tests use a
// temporary one so that running them never touches catalog/cache.
const CACHE = process.env.HQ_STATE_DIR ? path.resolve(process.env.HQ_STATE_DIR) : path.join(PROFILE.catalogDir, 'cache');
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
    return arr.filter((p) => builderScript(p.CommandLine))
      .map((p) => ({ pid: p.ProcessId, cmd: (p.CommandLine || '').replace(/^.*?node(\.exe)?"?\s+/i, '').replace(ROOT.replace(/\\/g, '\\\\'), '').trim(), started: (() => { const m = /\/Date\((\d+)\)/.exec(String(p.CreationDate)); return m ? new Date(+m[1]).toISOString() : String(p.CreationDate || ''); })() }));
  } catch (e) { return []; }
}

// ---- jobs -------------------------------------------------------------------------------------
const JOBS_FILE = path.join(CACHE, 'hq-jobs.json');
const JOBS = (() => { try { return JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8')).slice(0, 60); } catch (e) { return []; } })(); // survive an HQ restart
const saveJobs = () => { try { fs.mkdirSync(CACHE, { recursive: true }); fs.writeFileSync(JOBS_FILE, JSON.stringify(JOBS.slice(0, 60))); } catch (e) { /* best effort */ } };
const SCRIPTS = new Set(['hunt', 'hunt-movies', 'match', 'art', 'people', 'db', 'publish', 'scout', 'networks', 'site', 'nightly', 'candidates', 'tvmovies', 'show-probe', 'doctor', 'linkcheck', 'retvmaze']);
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return false; } };
// A process number is not an identity: Windows hands a finished program's number to the next program that starts.
// So HQ keeps when each job's process was created (job.pstart) and, before it stops anything, reads the live process
// again. One PowerShell call, about half a second, returns the creation time (UTC, to the millisecond) and command line.
const infoScript = (pid) => `$p = Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}'; if ($p) { @{ created = $p.CreationDate.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ', [Globalization.CultureInfo]::InvariantCulture); cmd = [string]$p.CommandLine; name = [string]$p.Name } | ConvertTo-Json -Compress }`;
const infoArgs = (pid) => ['-NoProfile', '-NonInteractive', '-Command', infoScript(pid)];
function processInfo(pid) { // -> { created, cmd, name }, or null when no such process; throws when it cannot be read
  if (!Number.isInteger(pid) || pid <= 0) return null;
  const out = execFileSync('powershell', infoArgs(pid), { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 }).toString().trim();
  return out ? JSON.parse(out) : null;
}
const processInfoLater = (pid) => new Promise((ok) => { // never rejects: null when it cannot be read
  if (!Number.isInteger(pid) || pid <= 0) return ok(null);
  execFile('powershell', infoArgs(pid), { windowsHide: true, timeout: 15000 }, (err, out) => { try { ok(err || !String(out).trim() ? null : JSON.parse(String(out).trim())); } catch (e) { ok(null); } });
});
// The command line of a job's process must name its own builder script, and nothing else counts: hunt.js is not hunt-movies.js.
const scriptRe = (name) => new RegExp('scripts[\\\\/]' + String(name).replace(/[^\w-]/g, '') + '\\.js(?=[\\s"\']|$)', 'i');
// The builder scripts HQ lists under "Running now" and is willing to stop. One list for both, so a program can only be stopped
// if the page could have shown it.
const LISTED = ['hunt', 'hunt-movies', 'match', 'art', 'people', 'db', 'publish', 'scout', 'networks', 'nightly', 'site', 'candidates', 'tvmovies'];
const builderScript = (cmd) => LISTED.find((n) => scriptRe(n).test(cmd || '')) || null;
// Is this live process the one HQ launched for this job? A job HQ launched this run has its creation time stored.
// A job saved by an older HQ has none: HQ stamped job.started right after the launch, so the process must have been
// created within seconds of that stamp. { ok } or { ok: false, why, gone | replaced }.
function sameProcess(job, live) {
  if (!live) return { ok: false, gone: true, why: 'no such process' };
  if (!scriptRe(job.name).test(live.cmd || '')) return { ok: false, replaced: true, why: 'its command line is not scripts/' + job.name + '.js' };
  const now = Date.parse(live.created || '');
  if (job.pstart) return Date.parse(job.pstart) === now ? { ok: true } : { ok: false, replaced: true, why: 'it was created at a different time than the job HQ launched' };
  return Math.abs(now - Date.parse(job.started || '')) <= 10000 ? { ok: true } : { ok: false, replaced: true, why: 'it was not created when this job was launched' };
}
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
  const job = { id, name, args, pid: child.pid, started: new Date().toISOString(), pstart: null, log, done: null, code: null };
  child.on('exit', (code) => { job.done = new Date().toISOString(); job.code = code; saveJobs(); });
  JOBS.unshift(job); saveJobs();
  // Keep when this process was created, so a later Stop can tell it from another program given the same number.
  processInfoLater(child.pid).then((info) => { if (info && !job.done && scriptRe(name).test(info.cmd || '')) { job.pstart = info.created; saveJobs(); } });
  return job;
}
const jobList = () => JOBS.map((j) => { const running = j.done ? false : alive(j.pid); if (!running && !j.done) { j.done = new Date().toISOString(); j.code = j.code == null ? -1 : j.code; saveJobs(); } return { ...j, running, tail: tail(j.log, 3) }; });
// Stop one job that HQ started, never a bare process number. The job record says which process it was; before anything
// is killed the live process must still be that one (same script in its command line, same creation time). If it is not,
// nothing is killed (409), one line goes to the console, and a job whose number now belongs to another program is
// marked finished so it stops showing as running. Returns { status, body, changed }; the caller saves the jobs file.
function stopHqJob(job, read = processInfo) {
  const refuse = (why, error) => { console.log(`HQ stop refused: process ${job.pid} is not job ${job.id} (${job.name}): ${why}`); return { status: 409, body: { error } }; };
  if (job.done) return { status: 200, body: { ok: true, stopped: false, note: 'That job already finished.' } };
  if (job.pid === process.pid) return refuse('that is HQ itself', 'HQ will not stop itself.');
  let live;
  try { live = read(job.pid); } catch (e) { return refuse('could not read the process (' + String(e.message).slice(0, 60) + ')', 'HQ could not check that process, so it did not stop it.'); }
  const v = sameProcess(job, live);
  const finished = (note) => { job.done = new Date().toISOString(); job.code = job.code == null ? -1 : job.code; return { status: 200, body: { ok: true, stopped: false, note }, changed: true }; };
  if (v.gone) return finished('That job had already ended.');
  if (!v.ok) { const r = refuse(v.why, 'Process ' + job.pid + ' is no longer that job (' + v.why + '), so HQ did not stop it.'); if (v.replaced) { job.done = new Date().toISOString(); job.code = job.code == null ? -1 : job.code; r.changed = true; } return r; }
  try { execFileSync('taskkill', ['/PID', String(job.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); } catch (e) { /* gone between the check and the kill */ }
  return { status: 200, body: { ok: true, stopped: true } };
}
// Stop a node job HQ did not start: the Task Scheduler's nightly or publish, or a script run by hand in a terminal. The page
// sends the process number together with the start time it showed in "Running now". HQ stops it only if the live process is
// node.exe, has one of the builder scripts in its command line, and still has that creation time (to within 2 ms: the list and
// this read format the time with different tools). A bare number, or a number now held by a different program, is refused (409).
function stopListedProcess(pid, started, read = processInfo) {
  const refuse = (why, error) => { console.log(`HQ stop refused: process ${pid} (page showed start ${String(started).slice(0, 30)}): ${why}`); return { status: 409, body: { error } }; };
  if (!Number.isInteger(pid) || pid <= 0) return refuse('not a process number', 'That is not a process number.');
  if (typeof started !== 'string' || Number.isNaN(Date.parse(started))) return refuse('no start time sent', 'HQ needs the start time the page showed along with the process number, so it can tell the program from another one given the same number. Reload the page and try again.');
  if (pid === process.pid) return refuse('that is HQ itself', 'HQ will not stop itself.');
  let live;
  try { live = read(pid); } catch (e) { return refuse('could not read the process (' + String(e.message).slice(0, 60) + ')', 'HQ could not check that process, so it did not stop it.'); }
  if (!live) return { status: 200, body: { ok: true, stopped: false, note: 'That process had already ended.' } };
  if (!/^node(\.exe)?$/i.test(live.name || '')) return refuse('it is not node.exe (' + String(live.name).slice(0, 30) + ')', 'Process ' + pid + ' is not a node job, so HQ did not stop it.');
  if (!builderScript(live.cmd)) return refuse('its command line names no builder script', 'Process ' + pid + ' is not one of the builder scripts, so HQ did not stop it.');
  const apart = Math.abs(Date.parse(live.created) - Date.parse(started)); // NaN when the live time is missing or not a date
  if (!Number.isFinite(apart)) return refuse('its creation time could not be read', 'HQ could not read when that process started, so it did not stop it.');
  if (apart > 2) return refuse('it was created at a different time than the page showed', 'Process ' + pid + ' is not the one the page showed (a different program has that number now), so HQ did not stop it. Reload the page.');
  try { execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); } catch (e) { /* gone between the check and the kill */ }
  return { status: 200, body: { ok: true, stopped: true } };
}

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

// Who may talk to HQ. Only this server's own address on the port it is really listening on: a page served from
// another localhost port, or from another site, is not "local" for this purpose (CF-004).
const selfAddrs = (port) => ['127.0.0.1', 'localhost', '[::1]'].map((h) => h + ':' + port);
const hostAllowed = (host, port) => !!port && selfAddrs(port).includes(String(host || '').toLowerCase());
// No Origin header at all (curl, node, a plain same-origin GET) is fine here. One that is present must be this
// server's own page. "null" (sandboxed frames, local files) is refused: HQ's page is always served over http by HQ itself.
const originAllowed = (origin, port) => origin === undefined || (!!port && selfAddrs(port).some((a) => 'http://' + a === String(origin).toLowerCase()));
// The media type is the part before any ";". "text/plain;x=application/json" is text/plain, not JSON.
const mediaType = (h) => String(h || '').split(';')[0].trim().toLowerCase();
// A new secret every time HQ starts. It is written into the page HQ serves (a meta tag) and nowhere else: not in a URL,
// not in a log. Every call that changes anything must send it back as X-HQ-Token. A page from another origin cannot
// read HQ's page, so it cannot learn it; the desktop app and a browser tab both get it by loading the page from HQ.
const TOKEN = crypto.randomBytes(32).toString('hex');
const tokenOk = (given) => { const a = Buffer.from(String(given || '')), b = Buffer.from(TOKEN); return a.length === b.length && crypto.timingSafeEqual(a, b); };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  // Local only, and only HQ's own page: a web page in the owner's browser, or one served from another local port,
  // must not be able to drive HQ (publish, taskkill, overrides). Order matters: host, origin, media type, token.
  const port = server.address() && server.address().port;
  if (!hostAllowed(req.headers.host, port)) return send(res, 403, { error: 'HQ answers its own address only' });
  if (!originAllowed(req.headers.origin, port)) return send(res, 403, { error: 'cross-origin request refused' });
  const changes = req.method !== 'GET' && req.method !== 'HEAD'; // anything that is not a plain read needs JSON and the token
  if (changes && mediaType(req.headers['content-type']) !== 'application/json') return send(res, 415, { error: 'JSON only' });
  if (changes && !tokenOk(req.headers['x-hq-token'])) return send(res, 401, { error: 'HQ token missing or wrong. Reload this page: HQ was restarted since it was opened.' });
  const SLUG_OK = /^[a-z0-9][a-z0-9-]*$/;
  try {
    if (p === '/' || p === '/index.html') return send(res, 200, fs.readFileSync(path.join(__dirname, 'hq', 'index.html'), 'utf8').replace('__HQ_TOKEN__', TOKEN), MIME['.html']);
    if (p === '/api/ping' && req.method === 'POST') return send(res, 200, { ok: true }); // does nothing; the doctor and the tests use it to see whether the guards above let a call through
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
    if (p.startsWith('/api/jobs/') && p.endsWith('/stop') && req.method === 'POST') { const id = p.split('/')[3]; const j = JOBS.find((x) => x.id === id); if (!j) return send(res, 404, { error: 'no such job' }); const r = stopHqJob(j); if (r.changed) saveJobs(); return send(res, r.status, r.body); }
    if (p === '/api/processes/stop' && req.method === 'POST') { // never a bare number: one of HQ's own jobs (checked against the start time HQ stored) or a listed node job (checked against the start time the page showed)
      const b = await body(req); const pid = typeof b.pid === 'number' ? b.pid : NaN; const j = Number.isInteger(pid) ? JOBS.find((x) => !x.done && x.pid === pid) : null;
      const r = j ? stopHqJob(j) : stopListedProcess(pid, b.started); if (r.changed) saveJobs(); return send(res, r.status, r.body);
    }
    if (p === '/api/log') { const name = (url.searchParams.get('name') || '').replace(/[^\w.-]/g, ''); return send(res, 200, { log: tail(path.join(CACHE, name), +url.searchParams.get('tail') || 100) }); }
    if (p === '/api/probe') { // playback probes (the player work, 14 Oct). Same rules as every other call: no wildcard CORS, no test page on another port.
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
module.exports = { start, PORT, ROOT, guards: { hostAllowed, originAllowed, mediaType }, stop: { stopHqJob, stopListedProcess, sameProcess, processInfo, scriptRe, builderScript } };
if (require.main === module) start().catch((e) => { console.error(e.message); process.exit(1); });
