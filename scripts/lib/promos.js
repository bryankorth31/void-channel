// PROMOS: the bridge from the motion kit (motion/) and the stings (videos/*) to voidtv.net, for HQ.
//   library()       every finished render: motion/pack/renders and videos/<name>/renders (also .../vertical/renders)
//   send()          encode a small web copy into assets/brand/promos/ and put it in a place on the site
//   placements      assets/brand/promos/promos.json, fetched by the site at runtime (no code regeneration)
//   share()         a full-quality copy, ready to post, in the user's Videos\voidtv.net folder
//   goLive()        commit and push assets/brand/promos/ only, when B clicks; publish.js never touches it
// Slots: gate (silent loop behind the password box), home (tap-to-play banner), promos (the /promos page).
// "ident" and "bumper" are reserved for the as-aired player work and are not wired into the player yet.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn, execFileSync, execSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const MOTION = path.join(ROOT, 'motion');
const OUT = path.join(ROOT, 'assets', 'brand', 'promos');
const PLACE = path.join(OUT, 'promos.json');
const SHARE = path.join(os.homedir(), 'Videos', 'voidtv.net');
const KIT = (() => { try { return JSON.parse(fs.readFileSync(path.join(MOTION, 'kit.json'), 'utf8')); } catch (e) { return { slug: 'voidtv-net', port: 8221 }; } })();
const MOTION_PORT = KIT.port || 8221;
// Nothing HQ starts reports usage anywhere (HyperFrames has telemetry on by default).
const NO_TRACK = { HYPERFRAMES_NO_TELEMETRY: '1', DO_NOT_TRACK: '1' };
const PAGES_MAX = 24 * 1024 * 1024; // Cloudflare Pages refuses files over 25 MiB
const GATE_MAX = 1.4 * 1024 * 1024; // the gate loop must stay under 1.5 MB
const SLOTS = {
  gate: { label: 'Password gate', note: 'Silent loop behind the password box. Best with a short wordless loop (tvwall, tunein). Kept under 1.5 MB; phones that ask for less motion keep the still.' },
  home: { label: 'Home banner', note: 'One promo on the browse page as a poster; it plays only when tapped.' },
  promos: { label: 'Promos page', note: 'voidtv.net/promos: watch and download, every shape that was sent.' },
  ident: { label: 'Ident (reserved)', note: 'Between episodes, for the as-aired work. Not wired into the player yet.', reserved: true },
  bumper: { label: 'Bumper (reserved)', note: 'As-aired bumpers. Not wired into the player yet.', reserved: true },
};

let deps = { nodeBin: () => ({ bin: process.execPath, env: process.env }), cache: path.join(ROOT, 'catalog', 'cache') };
const init = (d) => { deps = { ...deps, ...d }; };

const readJson = (p, fb) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fb; } };
const writeJson = (p, v) => { fs.mkdirSync(path.dirname(p), { recursive: true }); const tmp = p + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(v, null, 2) + '\n'); fs.renameSync(tmp, p); };
const blank = () => ({ v: 1, updated: null, items: {}, slots: { gate: null, home: null, promos: [], ident: null, bumper: null } });
const placements = () => { const p = readJson(PLACE, null) || blank(); p.items = p.items || {}; p.slots = { ...blank().slots, ...(p.slots || {}) }; if (!Array.isArray(p.slots.promos)) p.slots.promos = []; return p; };
const savePlacements = (p) => { p.updated = new Date().toISOString(); writeJson(PLACE, p); };
const KEY_OK = /^[a-z0-9][a-z0-9-]{0,80}$/;

// ---- the library ------------------------------------------------------------------------------
const shapeOf = (w, h) => { const r = w / h; return r > 1.2 ? 'wide' : r >= 0.95 ? 'square' : r >= 0.75 ? 'feed' : 'tall'; };
const SHAPE_NAME = { wide: '16:9', square: '1:1', feed: '4:5', tall: '9:16' };
const probeCache = new Map();
function probe(file) {
  const st = fs.statSync(file); const k = file + '|' + st.mtimeMs;
  if (probeCache.has(k)) return probeCache.get(k);
  let info = null;
  try {
    const j = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height:format=duration', '-of', 'json', file], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).toString());
    const v = (j.streams || []).find((s) => s.codec_type === 'video') || {};
    info = { w: v.width || 0, h: v.height || 0, dur: Math.round((+((j.format || {}).duration) || 0) * 100) / 100, audio: (j.streams || []).some((s) => s.codec_type === 'audio'), bytes: st.size, mtime: st.mtimeMs };
  } catch (e) { info = null; }
  probeCache.set(k, info);
  return info;
}
const listDir = (d) => { try { return fs.readdirSync(d); } catch (e) { return []; } };
function library() {
  const out = [];
  const add = (file, source, id, base) => { const i = probe(file); if (!i || !i.w) return; out.push({ file: path.relative(ROOT, file).replace(/\\/g, '/'), source, id, base, shape: shapeOf(i.w, i.h), ...i }); };
  const pr = path.join(MOTION, 'pack', 'renders');
  for (const f of listDir(pr)) {
    if (!/\.(mp4|webm)$/i.test(f)) continue;
    const m = f.replace(/\.[^.]+$/, '').match(new RegExp('^' + (KIT.slug || 'voidtv-net') + '-(.+)-(\\d{8}-\\d{6})$'));
    if (!m) continue;
    add(path.join(pr, f), 'motion', m[1], m[1].replace(/-(vertical|feed|square)$/, ''));
  }
  const vids = path.join(ROOT, 'videos');
  for (const name of listDir(vids)) {
    for (const sub of ['renders', path.join('vertical', 'renders')]) {
      const d = path.join(vids, name, sub);
      for (const f of listDir(d)) if (/\.mp4$/i.test(f)) add(path.join(d, f), 'sting', name + '/' + f.replace(/\.mp4$/i, ''), name);
    }
  }
  // newest first, and only the newest render of each motion piece (older ones stay on disk)
  out.sort((a, b) => b.mtime - a.mtime);
  const seen = new Set();
  return out.filter((r) => { if (r.source !== 'motion') return true; if (seen.has(r.id)) return false; seen.add(r.id); return true; });
}
// Resolve a library path from the UI back to a file, refusing anything outside the render folders.
function resolveRender(rel) {
  const f = path.resolve(ROOT, String(rel || ''));
  const okRoots = [path.join(MOTION, 'pack', 'renders'), path.join(ROOT, 'videos')];
  if (!okRoots.some((r) => f.startsWith(r + path.sep)) || !/\.(mp4|webm)$/i.test(f) || !fs.existsSync(f)) throw new Error('not a render: ' + rel);
  if (f.startsWith(path.join(ROOT, 'videos') + path.sep) && !/[\\/]renders[\\/][^\\/]+$/.test(f)) throw new Error('not a render: ' + rel);
  return f;
}
// Files HQ may stream to its own preview players.
function mediaPath(rel) {
  const f = path.resolve(ROOT, String(rel || ''));
  if (f.startsWith(OUT + path.sep) && /\.(mp4|jpg)$/i.test(f) && fs.existsSync(f)) return f;
  return resolveRender(rel);
}

// ---- encoding (one at a time, so HQ never starts a pile of ffmpegs) ------------------------------
const TASKS = new Map(); let queue = Promise.resolve(); let seq = 0;
function task(label, fn) {
  const t = { id: (++seq).toString(36) + Date.now().toString(36).slice(-4), label, state: 'queued', log: [], started: Date.now() };
  TASKS.set(t.id, t);
  queue = queue.then(async () => { t.state = 'running'; try { t.result = await fn(t); t.state = 'done'; } catch (e) { t.state = 'failed'; t.error = e.message; } t.seconds = Math.round((Date.now() - t.started) / 1000); });
  for (const [id, x] of TASKS) if (TASKS.size > 60 && x.state !== 'running' && x.state !== 'queued') TASKS.delete(id);
  return t;
}
const ff = (t, args) => new Promise((ok, no) => {
  const c = spawn('ffmpeg', ['-hide_banner', '-nostdin', '-y', ...args], { windowsHide: true });
  let err = '';
  c.stderr.on('data', (d) => { err = (err + d).slice(-4000); });
  c.on('error', no);
  c.on('close', (code) => { if (code === 0) ok(); else { t.log.push(err.split(/\r?\n/).filter(Boolean).slice(-4).join(' | ')); no(new Error('ffmpeg failed (' + code + ')')); } });
});
const even = (n) => Math.max(2, Math.round(n / 2) * 2);
const fit = (w, h, long) => (Math.max(w, h) <= long ? [even(w), even(h)] : w >= h ? [even(long), even(h * long / w)] : [even(w * long / h), even(long)]);

// Web copy for the home banner and the promos page: H.264 + faststart, at most 1080 on the short side.
async function encodeWeb(t, src, info, dst) {
  const [w, h] = fit(info.w, info.h, 1920);
  const audio = info.audio ? ['-c:a', 'aac', '-b:a', '128k', '-ac', '2'] : ['-an'];
  let rate = 3500;
  for (let i = 0; i < 3; i++) {
    await ff(t, ['-i', src, '-vf', `scale=${w}:${h}:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-maxrate', rate + 'k', '-bufsize', rate * 2 + 'k', '-profile:v', 'high', ...audio, '-movflags', '+faststart', dst]);
    if (fs.statSync(dst).size <= PAGES_MAX) return;
    rate = Math.floor(rate * 0.6); t.log.push('over the 24 MB site limit, re-encoding at ' + rate + ' kbps');
  }
  throw new Error('could not get it under the 24 MB site limit');
}
// Gate loop: silent, 720 on the short side at most, two passes aimed under 1.4 MB.
async function encodeGate(t, src, info, dst) {
  if (!info.dur) throw new Error('unknown length');
  const kbps = Math.floor((GATE_MAX * 8 / info.dur / 1000) * 0.92);
  if (kbps < 450) throw new Error(`too long for the gate (${info.dur}s): 1.5 MB only stays sharp for about 20 seconds; pick a short loop`);
  const [w, h] = fit(info.w, info.h, 1280);
  const log = path.join(os.tmpdir(), 'voidtv-gate-' + t.id);
  const common = ['-i', src, '-vf', `scale=${w}:${h}:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-b:v', kbps + 'k', '-maxrate', Math.round(kbps * 1.4) + 'k', '-bufsize', kbps * 2 + 'k', '-an', '-passlogfile', log];
  await ff(t, [...common, '-pass', '1', '-f', 'mp4', process.platform === 'win32' ? 'NUL' : '/dev/null']);
  await ff(t, [...common, '-pass', '2', '-movflags', '+faststart', dst]);
  for (const f of listDir(os.tmpdir())) if (f.startsWith('voidtv-gate-' + t.id)) try { fs.unlinkSync(path.join(os.tmpdir(), f)); } catch (e) { /* fine */ }
  if (fs.statSync(dst).size > 1.5 * 1024 * 1024) throw new Error('gate copy came out over 1.5 MB');
}
// Poster: a frame near the end, where the ads land on the neon sign.
const poster = (t, src, info, dst, long) => { const [w, h] = fit(info.w, info.h, long); return ff(t, ['-ss', String(Math.max(0, info.dur * 0.85).toFixed(2)), '-i', src, '-frames:v', '1', '-vf', `scale=${w}:${h}:flags=lanczos`, '-q:v', '4', dst]); };
const rec = (file, info) => { const st = fs.statSync(path.join(OUT, file)); return { src: file, bytes: st.size, w: info.w, h: info.h, dur: info.dur }; };

function send({ file, slots, title }) {
  const src = resolveRender(file); const info = probe(src);
  if (!info || !info.w) throw new Error('cannot read ' + file);
  slots = [...new Set((slots || []).filter((s) => ['gate', 'home', 'promos'].includes(s)))];
  if (!slots.length) throw new Error('pick at least one place');
  const lib = library().find((r) => r.file === path.relative(ROOT, src).replace(/\\/g, '/'));
  const base = (lib ? lib.base : path.basename(src).replace(/\.[^.]+$/, '')).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!KEY_OK.test(base)) throw new Error('bad name ' + base);
  const shape = shapeOf(info.w, info.h);
  return task(`Send ${base} (${SHAPE_NAME[shape]}) to ${slots.join(', ')}`, async (t) => {
    fs.mkdirSync(OUT, { recursive: true });
    const done = [];
    if (slots.includes('home') || slots.includes('promos')) {
      const mp4 = `${base}-${shape}.mp4`, jpg = `${base}-${shape}.jpg`;
      await encodeWeb(t, src, info, path.join(OUT, mp4)); await poster(t, src, info, path.join(OUT, jpg), 1280);
      const p = placements();
      const item = p.items[base] || (p.items[base] = { title: title || base, shapes: {} });
      if (title) item.title = title;
      item.shapes[shape] = { ...rec(mp4, info), poster: jpg };
      if (slots.includes('promos') && !p.slots.promos.includes(base)) p.slots.promos.unshift(base);
      if (slots.includes('home')) p.slots.home = base;
      savePlacements(p); done.push(mp4);
    }
    if (slots.includes('gate')) {
      const gshape = shape === 'wide' || shape === 'square' ? 'wide' : 'tall';
      const mp4 = `gate-${gshape}.mp4`, jpg = `gate-${gshape}.jpg`;
      await encodeGate(t, src, info, path.join(OUT, mp4)); await poster(t, src, info, path.join(OUT, jpg), 1280);
      const p = placements();
      p.slots.gate = p.slots.gate || { shapes: {} };
      const [gw, gh] = fit(info.w, info.h, 1280);
      p.slots.gate.shapes[gshape] = { ...rec(mp4, { ...info, w: gw, h: gh }), poster: jpg, from: base };
      savePlacements(p); done.push(mp4);
    }
    return { base, shape, files: done };
  });
}

// Take a promo out of a place. The files stay until delete(), so putting it back is instant.
function unplace({ slot, base, shape }) {
  const p = placements();
  if (slot === 'promos') p.slots.promos = p.slots.promos.filter((b) => b !== base);
  else if (slot === 'home') p.slots.home = null;
  else if (slot === 'gate') {
    for (const [s, g] of Object.entries((p.slots.gate || {}).shapes || {})) if (!shape || s === shape) { rm(g.src); rm(g.poster); delete p.slots.gate.shapes[s]; }
    if (!p.slots.gate || !Object.keys(p.slots.gate.shapes).length) p.slots.gate = null;
  } else throw new Error('unknown place ' + slot);
  savePlacements(p); return p;
}
function place({ slot, base }) {
  const p = placements();
  if (!p.items[base]) throw new Error('send it to the site first');
  if (slot === 'promos') { if (!p.slots.promos.includes(base)) p.slots.promos.unshift(base); } else if (slot === 'home') p.slots.home = base; else throw new Error('unknown place ' + slot);
  savePlacements(p); return p;
}
function move({ base, dir }) { const p = placements(); const a = p.slots.promos, i = a.indexOf(base), j = i + (dir < 0 ? -1 : 1); if (i >= 0 && j >= 0 && j < a.length) [a[i], a[j]] = [a[j], a[i]]; savePlacements(p); return p; }
function rename({ base, title }) { const p = placements(); if (!p.items[base]) throw new Error('unknown promo'); p.items[base].title = String(title || '').slice(0, 80) || base; savePlacements(p); return p; }
const rm = (f) => { if (f && /^[\w.-]+$/.test(f)) try { fs.unlinkSync(path.join(OUT, f)); } catch (e) { /* gone */ } };
function remove({ base, shape }) {
  const p = placements(); const item = p.items[base]; if (!item) return p;
  for (const [s, x] of Object.entries(item.shapes)) if (!shape || s === shape) { rm(x.src); rm(x.poster); delete item.shapes[s]; }
  if (!Object.keys(item.shapes).length) { delete p.items[base]; p.slots.promos = p.slots.promos.filter((b) => b !== base); if (p.slots.home === base) p.slots.home = null; }
  savePlacements(p); return p;
}

// ---- share copies -------------------------------------------------------------------------------
const nice = (s) => String(s).replace(/[<>:"/\\|?*\x00-\x1f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90);
function share({ file, title }) {
  const src = resolveRender(file); const info = probe(src);
  const name = nice(`voidtv.net - ${title || path.basename(src).replace(/\.[^.]+$/, '')} (${SHAPE_NAME[shapeOf(info.w, info.h)].replace(":", "x")}).mp4`);
  return task('Share copy: ' + name, async (t) => {
    fs.mkdirSync(SHARE, { recursive: true });
    const dst = path.join(SHARE, name);
    if (/\.mp4$/i.test(src)) await ff(t, ['-i', src, '-map', '0', '-c', 'copy', '-movflags', '+faststart', dst]); // full quality, just moved to the front for quick upload previews
    else await ff(t, ['-i', src, '-c:v', 'libx264', '-crf', '18', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', dst]);
    return { path: dst, bytes: fs.statSync(dst).size };
  });
}
function openShare() { fs.mkdirSync(SHARE, { recursive: true }); spawn('explorer.exe', [SHARE], { detached: true, stdio: 'ignore', windowsHide: false }).unref(); return { path: SHARE }; }

// ---- going live (B's click; never part of the scheduled publish) -------------------------------
const git = (args) => execFileSync('git', args, { cwd: ROOT, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
function liveStatus() {
  const rel = path.relative(ROOT, OUT).replace(/\\/g, '/');
  let branch = '', changed = [], ahead = [], err = null;
  try {
    branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
    changed = git(['status', '--porcelain', '--untracked-files=all', '--', rel]).split('\n').filter(Boolean).map((l) => l.slice(3));
    ahead = git(['log', '--oneline', 'origin/master..HEAD']).split('\n').filter(Boolean);
  } catch (e) { err = e.message; }
  const big = listDir(OUT).filter((f) => fs.statSync(path.join(OUT, f)).size > PAGES_MAX);
  const bytes = listDir(OUT).reduce((n, f) => n + fs.statSync(path.join(OUT, f)).size, 0);
  return { branch, changed, ahead, big, bytes, error: err, folder: rel };
}
function goLive({ message } = {}) {
  const s = liveStatus();
  if (s.error) throw new Error(s.error);
  if (s.branch !== 'master') throw new Error('the repo is on ' + s.branch + ', not master; going live is only from master');
  if (s.big.length) throw new Error('over the 25 MB site limit: ' + s.big.join(', '));
  if (!s.changed.length) return { pushed: false, note: 'nothing new in ' + s.folder };
  const p = placements();
  const msg = String(message || '').replace(/["\r\n]/g, ' ').slice(0, 120) || `Promos: ${p.slots.promos.length} on the promos page, home ${p.slots.home || 'none'}, gate ${p.slots.gate ? 'on' : 'off'}`;
  git(['add', '-A', '--', s.folder]);
  git(['commit', '-q', '-m', msg, '--', s.folder]); // only this folder, whatever else is staged
  git(['push', '-q', 'origin', 'master']);
  return { pushed: true, commit: git(['rev-parse', '--short', 'HEAD']), message: msg, alsoPushed: s.ahead };
}

// ---- the motion editor (motion/hq/server.mjs) -------------------------------------------------------
const pingMotion = () => new Promise((ok) => { const q = http.get({ host: '127.0.0.1', port: MOTION_PORT, path: '/api/spec', timeout: 1500 }, (r) => { let d = ''; r.on('data', (c) => { d += c; }); r.on('end', () => { try { ok(r.statusCode === 200 ? JSON.parse(d) : null); } catch (e) { ok(null); } }); }); q.on('error', () => ok(null)); q.on('timeout', () => { q.destroy(); ok(null); }); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function motionStatus() { const spec = await pingMotion(); return { up: !!spec, port: MOTION_PORT, url: `http://127.0.0.1:${MOTION_PORT}/`, brand: KIT.brand, pieces: spec ? Object.keys(spec.pieces || {}).length : 0, titles: spec ? Object.fromEntries(Object.entries(spec.pieces || {}).map(([k, v]) => [k, v.title])) : {} }; }
function motionPid() {
  try { const line = execSync('netstat -ano -p tcp', { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).toString().split(/\r?\n/).find((l) => new RegExp(`127\\.0\\.0\\.1:${MOTION_PORT}\\s.*LISTENING`).test(l)); return line ? +line.trim().split(/\s+/).pop() : null; } catch (e) { return null; }
}
async function motionStart({ restart } = {}) {
  if (!fs.existsSync(path.join(MOTION, 'hq', 'server.mjs'))) throw new Error('motion/hq/server.mjs is missing');
  if (await pingMotion()) { if (!restart) return motionStatus(); const pid = motionPid(); if (pid) try { execSync(`taskkill /PID ${pid} /T /F`, { windowsHide: true, stdio: 'ignore' }); } catch (e) { /* gone */ } for (let i = 0; i < 20 && (await pingMotion()); i++) await sleep(250); }
  fs.mkdirSync(deps.cache, { recursive: true });
  const fd = fs.openSync(path.join(deps.cache, 'motion-server.log'), 'a');
  const nb = deps.nodeBin();
  const child = spawn(nb.bin, [path.join(MOTION, 'hq', 'server.mjs')], { cwd: MOTION, env: { ...nb.env, ...NO_TRACK }, detached: true, stdio: ['ignore', fd, fd], windowsHide: true });
  child.unref();
  for (let i = 0; i < 40; i++) { await sleep(250); if (await pingMotion()) return motionStatus(); }
  throw new Error('the motion editor did not start; see catalog/cache/motion-server.log');
}

function overview() {
  return { slots: SLOTS, shapes: SHAPE_NAME, placements: placements(), library: library(), live: liveStatus(), share: SHARE, tasks: [...TASKS.values()].slice(-12).reverse() };
}
module.exports = { init, overview, library, placements, send, place, unplace, move, rename, remove, share, openShare, liveStatus, goLive, motionStatus, motionStart, mediaPath, task: (id) => TASKS.get(id) || null, SLOTS };
