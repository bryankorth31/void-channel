// HINDI HQ: the Hindi area of voidtv.net HQ (B, 20 Nov 2026: "this needs area inside voidtv hq please , a tab", then "HQ tab first").
// hindi.voidtv.net is built on the local branch hindi in its own folder (C:\Users\bryan\void-hindi, beside this checkout), so this module
// reads that folder and runs the Hindi jobs there, the way the Kids area works with void-kids (B, 18 Nov 2026: "Void TV should hold all
// of it in just different tabs"). No Hindi site code is on master, and voidtv.net is unchanged.
// B runs the Hindi site and does not read Hindi, so everything here is in English, with each title's Hindi name beside it (decision HI1).
//
// Reads, in <hindi folder>/profiles/hindi: list.json, catalog/shows, catalog/movies, catalog/tvmovies-list.json, catalog/overrides.json,
// catalog/cache/shelf/shelf.json, docs/, reviews/ (the friends' files, git-ignored there).
// Writes: catalog/overrides.json (Keep or Drop a title, with a dated backup before the first change of a day), reviews/picks-<id>.json
// (a friend's file), and this checkout's catalog/cache/hq-hindi-jobs.json plus one log per job.
// Keep and Drop use the switches voidtv.net already reads: a show is dropped with "hidden": true; a film is kept with "approved": true
// (it then plays even when the matcher was unsure) and dropped with "rejected": true. Every action has its by-hand command in Help.
const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
// HQ's own state folder, the same rule as scripts/hq.js (HQ_STATE_DIR, which the tests use, else catalog/cache).
const STATE = () => (process.env.HQ_STATE_DIR ? path.resolve(process.env.HQ_STATE_DIR) : path.join(ROOT, 'catalog', 'cache'));
// Read on every call, so a test (or B) can point HQ at another copy with HINDI_ROOT.
const HROOT = () => (process.env.HINDI_ROOT ? path.resolve(process.env.HINDI_ROOT) : path.join(ROOT, '..', 'void-hindi'));
const HDIR = () => path.join(HROOT(), 'profiles', 'hindi');
const P = (...a) => path.join(HDIR(), ...a);
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const norm = (s) => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const slug = (s) => norm(s).replace(/ /g, '-').replace(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/, '$1-show'); // as hunt.js and match.js
const today = () => new Date().toISOString().slice(0, 10);
const plays = (f) => !!f && f.playable && !f.langRisk;
const LANG = { hi: 'Hindi', te: 'Telugu', ta: 'Tamil', kn: 'Kannada', ml: 'Malayalam', ja: 'Japanese', en: 'English', ur: 'Urdu' };

// ---- the friends' picks (the same rules as profiles/hindi/tally.js) ----
const PICK_ID = /^[a-z0-9]{4,12}$/;
const pickFiles = () => { try { return fs.readdirSync(P('reviews')).filter((f) => /^picks-[a-z0-9]+\.json$/.test(f)).map((f) => readJson(P('reviews', f), null)).filter(Boolean); } catch (e) { return []; } };
function tally() {
  const t = {}, more = [];
  for (const j of pickFiles()) {
    for (const [k, v] of Object.entries(j.decisions || {})) {
      const r = t[k] || (t[k] = { keep: 0, drop: 0, unsure: 0, notes: [] });
      if (['keep', 'drop', 'unsure'].includes(v && v.d)) r[v.d]++;
      if (v && v.note && String(v.note).trim()) r.notes.push(String(v.note).trim().slice(0, 300));
    }
    if (j.more && String(j.more).trim()) more.push(String(j.more).trim().slice(0, 3000));
  }
  return { files: pickFiles().length, byTitle: t, more };
}
// A file a friend sent back from the review sheet. Counted once: a file already added is left alone.
function addPicks(j) {
  if (!j || j.kind !== 'voidtv-hindi-picks' || !j.decisions || typeof j.decisions !== 'object' || !PICK_ID.test(String(j.id))) throw new Error('That is not a picks file from the Hindi review sheet.');
  if (!fs.existsSync(HDIR())) throw new Error('The Hindi folder is not on this PC: ' + HDIR());
  fs.mkdirSync(P('reviews'), { recursive: true });
  const to = P('reviews', 'picks-' + j.id + '.json');
  if (fs.existsSync(to)) return { added: false, files: pickFiles().length, note: 'That file was already counted.' };
  const keep = { kind: j.kind, v: j.v, id: String(j.id), at: String(j.at || ''), decisions: {}, more: String(j.more || '').slice(0, 3000) };
  for (const [k, v] of Object.entries(j.decisions)) if (/^(show|film):[a-z0-9-]{1,120}$/.test(k) && v && typeof v === 'object') keep.decisions[k] = { d: ['keep', 'drop', 'unsure'].includes(v.d) ? v.d : undefined, note: v.note ? String(v.note).slice(0, 300) : undefined };
  fs.writeFileSync(to, JSON.stringify(keep, null, 1));
  return { added: true, files: pickFiles().length };
}

// ---- every show and film on the Hindi list, with what plays and who decided what ----
function titles() {
  const list = readJson(P('list.json'), { shows: [] }), films = readJson(P('catalog', 'tvmovies-list.json'), { items: [] }).items || [];
  const ov = readJson(P('catalog', 'overrides.json'), {}), tl = tally().byTitle;
  const rows = [];
  for (const s of list.shows || []) {
    const sl = slug(s.name), g = readJson(P('catalog', 'shows', sl + '.json'), null);
    const eps = g ? (g.seasons || []).flatMap((se) => se.episodes || []) : [];
    const sure = eps.filter((e) => e.state === 'LIVE' && plays(e.file)).length, check = eps.filter((e) => e.state === 'REVIEW' && plays(e.file)).length;
    const sample = (eps.find((e) => e.state === 'LIVE' && plays(e.file)) || eps.find((e) => plays(e.file)) || {}).file;
    const o = ov[sl] || {};
    rows.push({ key: 'show:' + sl, kind: 'show', name: s.name, hindi: s.hindi || '', language: s.language, made: LANG[s.language] || s.language, year: s.year, row: s.type,
      plays: sure + check, sure, toCheck: check, state: !g ? 'not hunted' : sure + check ? 'plays' : 'nothing found',
      sample: sample ? sample.item : null, sampleTitle: sample ? sample.itemTitle : null, decision: o.hidden ? 'drop' : o.kept ? 'keep' : null, friends: tl['show:' + sl] || null });
  }
  for (const m of films) {
    const r = readJson(P('catalog', 'movies', slug(m.title) + '-' + (m.year || 'x') + '.json'), null), f = r && r.file, o = ov['movie-' + m.tmdbId] || {};
    rows.push({ key: 'film:' + m.tmdbId, kind: 'film', name: m.title, hindi: m.hindi || '', language: m.language, made: LANG[m.language] || m.language, year: m.year, row: 'Films',
      plays: r && plays(f) && (r.state === 'LIVE' || o.approved === true) && !o.rejected ? 1 : 0, sure: r && r.state === 'LIVE' && plays(f) ? 1 : 0, toCheck: r && r.state === 'REVIEW' && plays(f) ? 1 : 0,
      state: !r ? 'not hunted' : r.state === 'LIVE' ? 'plays' : r.state === 'REVIEW' ? 'needs a listen' : 'not found',
      sample: plays(f) ? f.item : null, sampleTitle: plays(f) ? f.itemTitle : null, decision: o.rejected ? 'drop' : o.approved ? 'keep' : null, friends: tl['film:' + m.tmdbId] || null });
  }
  return rows;
}

// Keep, Drop or Clear one title. Writes the Hindi catalog/overrides.json, with a backup of the day's first version.
function decide(key, d) {
  if (!['keep', 'drop', 'clear'].includes(d)) throw new Error('Keep, Drop or Clear only');
  const m = /^(show|film):([a-z0-9-]{1,120})$/.exec(String(key || ''));
  if (!m) throw new Error('bad title key');
  const row = titles().find((r) => r.key === key);
  if (!row) throw new Error('That title is not on the Hindi list.');
  const f = P('catalog', 'overrides.json'), ov = readJson(f, {});
  const bak = P('catalog', 'overrides.before-hq-' + today() + '.json');
  if (fs.existsSync(f) && !fs.existsSync(bak)) fs.copyFileSync(f, bak);
  const k = m[1] === 'show' ? m[2] : 'movie-' + m[2], o = { ...(ov[k] || {}) };
  if (m[1] === 'show') { delete o.hidden; delete o.kept; if (d === 'drop') o.hidden = true; if (d === 'keep') o.kept = true; }
  else { delete o.approved; delete o.rejected; if (d === 'keep') o.approved = true; if (d === 'drop') o.rejected = true; }
  if (Object.keys(o).length) ov[k] = o; else delete ov[k];
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(ov, null, 2).replace(/\n/g, '\r\n') + '\r\n');
  return { key, name: row.name, d };
}

// ---- the overview ----
function overview() {
  const found = fs.existsSync(HDIR());
  if (!found) return { found, folder: HDIR() };
  const rows = titles(), shows = rows.filter((r) => r.kind === 'show'), films = rows.filter((r) => r.kind === 'film');
  const shelf = readJson(P('catalog', 'cache', 'shelf', 'shelf.json'), null);
  const kinds = {}; if (shelf) for (const s of shelf) kinds[s.kind] = (kinds[s.kind] || 0) + 1;
  // counted with the shelf scout's own key (profiles/hindi/shelf.js), so HQ and docs/SHELF.md give the same numbers
  const key = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9ऀ-ॿ]+/g, ' ').trim();
  const names = (kind) => shelf ? new Set(shelf.filter((s) => s.kind === kind && key(s.name)).map((s) => key(s.name) + (kind === 'film' && s.year ? ' ' + s.year : ''))).size : 0;
  const mtime = (f) => { try { return fs.statSync(f).mtime.toISOString(); } catch (e) { return null; } };
  const t = tally();
  return {
    found, folder: HDIR(), review: P('docs', 'REVIEW.html'), reviewAt: mtime(P('docs', 'REVIEW.html')), huntAt: mtime(P('docs', 'MOVIES.md')), shelfAt: mtime(P('docs', 'SHELF.md')),
    shows: { total: shows.length, playing: shows.filter((r) => r.plays).length, episodes: shows.reduce((n, r) => n + r.plays, 0), sure: shows.reduce((n, r) => n + r.sure, 0), dropped: shows.filter((r) => r.decision === 'drop').length },
    films: { total: films.length, playing: films.filter((r) => r.plays).length, listen: films.filter((r) => r.state === 'needs a listen').length, missing: films.filter((r) => r.state === 'not found').length, dropped: films.filter((r) => r.decision === 'drop').length },
    shelf: shelf ? { uploads: shelf.length, kinds, filmNames: names('film'), showNames: names('show episode') } : null,
    picks: { files: t.files, more: t.more.length },
  };
}

// ---- jobs, run inside the Hindi folder (one at a time) ----
const JOBS_DEF = {
  list: { script: 'profiles/hindi/make-list.js', what: 'Rebuild the list from its lineup (TVmaze and TMDB, no Archive calls)' },
  shelf: { script: 'profiles/hindi/shelf.js', what: 'Read the Archive\'s Hindi shelf again (a few Archive calls)' },
  hunt: { script: 'profiles/hindi/hindi-hunt.js', what: 'Hunt the list\'s shows and films, then match (one polite Archive job, can take an hour)' },
  review: { script: 'profiles/hindi/review.js', what: 'Rebuild the friends\' review sheet and the what-plays report' },
};
const JOBS_FILE = () => path.join(STATE(), 'hq-hindi-jobs.json');
const loadJobs = () => readJson(JOBS_FILE(), []);
const saveJobs = (j) => { try { fs.mkdirSync(STATE(), { recursive: true }); fs.writeFileSync(JOBS_FILE(), JSON.stringify(j.slice(0, 40))); } catch (e) { /* best effort */ } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return false; } };
const tail = (f, n = 30) => { try { return fs.readFileSync(f, 'utf8').split(/\r?\n/).slice(-n).join('\n'); } catch (e) { return ''; } };
// The created time and command line of a live process (one PowerShell call), so Stop never kills a different program given the same number.
const infoScript = (pid) => `$p = Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}'; if ($p) { @{ created = $p.CreationDate.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ', [Globalization.CultureInfo]::InvariantCulture); cmd = $p.CommandLine } | ConvertTo-Json -Compress }`;
const processInfo = (pid) => new Promise((ok) => {
  if (!Number.isInteger(pid) || pid <= 0) return ok(null);
  execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', infoScript(pid)], { windowsHide: true, timeout: 15000 }, (err, out) => { try { ok(err || !String(out).trim() ? null : JSON.parse(String(out).trim())); } catch (e) { ok(null); } });
});
const scriptIn = (cmd, script) => String(cmd || '').replace(/\//g, '\\').toLowerCase().includes(script.replace(/\//g, '\\').toLowerCase());

function jobs() {
  const list = loadJobs();
  let changed = false;
  for (const j of list) if (!j.done && !alive(j.pid)) { j.done = new Date().toISOString(); j.code = j.code == null ? -1 : j.code; changed = true; }
  if (changed) saveJobs(list);
  return { defs: Object.entries(JOBS_DEF).map(([name, d]) => ({ name, what: d.what, script: d.script })), jobs: list.map((j) => ({ ...j, running: !j.done, tail: tail(j.log) })) };
}
function run(name, nb) {
  const def = JOBS_DEF[name];
  if (!def) throw new Error('unknown Hindi job ' + name);
  if (!fs.existsSync(path.join(HROOT(), def.script))) throw new Error('The Hindi folder is not on this PC, or has no ' + def.script);
  const list = loadJobs();
  const busy = list.find((j) => !j.done && alive(j.pid));
  if (busy) throw new Error('A Hindi job is already running (' + busy.name + '). Wait for it, or Stop it.');
  fs.mkdirSync(STATE(), { recursive: true });
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const log = path.join(STATE(), `hq-hindi-${name}-${id}.log`);
  const fd = fs.openSync(log, 'a');
  const env = { ...((nb && nb.env) || process.env), VOID_PROFILE: 'hindi', VOID_ENV: path.join(ROOT, 'backend', '.env') };
  let child;
  try { child = spawn((nb && nb.bin) || process.execPath, [path.join(HROOT(), def.script)], { cwd: HROOT(), env, detached: true, stdio: ['ignore', fd, fd], windowsHide: true }); }
  finally { fs.closeSync(fd); } // the job has its own handle on the log now; HQ keeps none, so the log is never held open
  child.unref();
  const job = { id, name, script: def.script, pid: child.pid, started: new Date().toISOString(), pstart: null, log, done: null, code: null };
  list.unshift(job); saveJobs(list);
  child.on('exit', (code) => { const l = loadJobs(), j = l.find((x) => x.id === id); if (j) { j.done = new Date().toISOString(); j.code = code; saveJobs(l); } });
  processInfo(child.pid).then((info) => { if (info && scriptIn(info.cmd, def.script)) { const l = loadJobs(), j = l.find((x) => x.id === id); if (j && !j.done) { j.pstart = info.created; saveJobs(l); } } });
  return job;
}
// Stop one Hindi job HQ started: only if the live process is still that job (its script in the command line, the same creation time).
// The whole process tree goes (the hunt queue runs the hunt as a child).
async function stop(id, read = processInfo) {
  const list = loadJobs(), j = list.find((x) => x.id === id);
  if (!j) return { status: 404, body: { error: 'no such Hindi job' } };
  if (j.done) return { status: 200, body: { ok: true, stopped: false, note: 'That job already finished.' } };
  const live = await read(j.pid);
  const same = live && scriptIn(live.cmd, j.script) && (!j.pstart || Date.parse(j.pstart) === Date.parse(live.created));
  if (!same) { j.done = new Date().toISOString(); j.code = j.code == null ? -1 : j.code; saveJobs(list); return { status: 409, body: { error: 'That process is no longer this job, so nothing was stopped.' } }; }
  await new Promise((ok) => execFile('taskkill', ['/PID', String(j.pid), '/T', '/F'], { windowsHide: true, timeout: 15000 }, () => ok()));
  j.done = new Date().toISOString(); j.code = 'stopped'; saveJobs(list);
  return { status: 200, body: { ok: true, stopped: true } };
}

module.exports = { HROOT, HDIR, overview, titles, decide, tally, addPicks, jobs, run, stop, JOBS_DEF };
