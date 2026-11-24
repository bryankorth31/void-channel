// TRIVIA NIGHTS: the night jobs. This PC digests the Internet Archive into the trivia machine while Bryan sleeps, with no
// Claude usage (Bryan, 20 Nov 2026: "create jobs for my local machine to do in pursuit of digesting the internet archive
// and creating a trivia machine from it"). One job after another, each with a time limit, the way scripts/nightly.js runs
// the catalog; a failing job is logged and the night goes on. The question bank stands on its own checker (scripts/trivia/
// check.js, every question against the day's catalog): it reads no transcript and no moment, so their checks do not hold it
// back (24 Nov 2026: five stale transcripts held the bank on Bryan's first morning; "Yes, fix it").
//
//   1. fame         node scripts/trivia/fame.js        the fame list: who people know best (Wikidata, Wikipedia views); weekly
//   2. pool         node scripts/trivia/pool.js        TMDB ratings and votes for what plays (its own cache keeps a month); weekly
//   3. queue        node scripts/trivia/transcripts.js queue --shows N --eps M
//                                                      the next episodes down the fame list; the Archive's own subtitle files
//                                                      where they fit; the rest go into the Whisper queue
//   4. whisper      python -I scripts/trivia/whisper_lines.py <queue>
//                                                      Whisper on the graphics card, inside a time budget; only when the card is
//                                                      free: it is claimed with hardware-lab/gpu_modes.py and released after,
//                                                      and skipped when another job holds it or another Whisper is running
//   5. transcripts  node scripts/trivia/transcripts.js check
//   6. moments      node scripts/trivia/moments.js     every saved moment still plays from the Archive where it says
//   7. timed        node scripts/trivia/timed.js       the clip chat's scene-timed questions for Live TV's strip (trivia/timed/),
//                                                      from lines a person approved; skipped until that tool exists
//   8. bank         node scripts/trivia/bank.js        rebuild the questions; its checker must pass every one
//   then a morning line: catalog/cache/trivia/night.json and a line in catalog/cache/trivia/night.log
//
// Two parts (Bryan, 24 Nov 2026: "Night job order", "By itself each morning"). The night part (steps 1 to 4) runs at 11:30 PM:
// the long work, Whisper on the card while he sleeps. The morning part (steps 5 to 8) runs at 4:30 AM from
// scripts/trivia/morning.js, after VoidTV Nightly (3:30 AM) has rebuilt the catalog, so the bank is made from and checked
// against the catalog the site uses that day; it waits while the catalog night or a trivia night is still running. The bank
// only changes when every question passes and something is new, and the hourly publish (scripts/publish.js) takes it live.
//
// The fame list, transcripts, Whisper and moments tools are the clip chat's; this file only runs them, as they are.
// Usage: node scripts/trivia/night.js                 the night part (11:30 PM)
//        node scripts/trivia/night.js --morning       the morning part (4:30 AM; scripts/trivia/morning.js runs this)
//        node scripts/trivia/night.js --dry           say what tonight would run, run nothing
//        node scripts/trivia/night.js --only bank,moments    just those jobs
//        options: --shows 10  --eps 3  --whisper-minutes 180  --force (weekly jobs run tonight anyway)
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync, execSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'catalog', 'cache', 'trivia');
const LOG = path.join(OUT, 'night.log');
const LOCK = path.join(OUT, 'night.lock');
const REPORT = path.join(OUT, 'night.json');
const PYTHON = 'C:/Users/bryan/hardware-lab/Scripts/python.exe';
const GPU_MODES = 'C:/Users/bryan/hardware-lab/gpu_modes.py';
const GPU_MODE_JSON = 'C:/Users/bryan/hardware-lab/gpu_mode.json';
const QUEUE = path.join(ROOT, 'trivia', 'transcripts', 'queue.json');
const TAG = 'trivia-night';
const WEEK = 7 * 864e5;

const JOBS = ['fame', 'pool', 'queue', 'whisper', 'transcripts', 'moments', 'timed', 'bank'];
const NIGHT = ['fame', 'pool', 'queue', 'whisper'];
const MORNING = ['transcripts', 'moments', 'timed', 'bank'];
const CATALOG_LOG = path.join(ROOT, 'catalog', 'cache', 'nightly.log');
const WAIT_MINUTES = 90;

// ---------- pure parts (tested in tests/trivia-night.test.js) ----------

function options(argv) {
  const get = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
  const only = get('--only', null);
  return {
    dry: argv.includes('--dry'), force: argv.includes('--force'), morning: argv.includes('--morning'),
    only: only ? only.split(',').map((s) => s.trim()).filter((s) => JOBS.includes(s)) : null,
    shows: Math.max(1, Number(get('--shows', 10)) || 10), eps: Math.max(1, Number(get('--eps', 3)) || 3),
    whisperMinutes: Math.max(10, Number(get('--whisper-minutes', 180)) || 180),
  };
}

// A weekly job is due when what it writes is a week old (or missing), or the night is forced.
function due(file, now, force) {
  if (force) return true;
  try { return now - fs.statSync(file).mtimeMs > WEEK; } catch (e) { return true; }
}

// May the night take the graphics card? Not when another job holds it in studio mode and its time is not up.
function cardFree(mode, now) {
  if (!mode || mode.mode !== 'studio') return true;
  if (mode.by === TAG) return true;
  return !(mode.until && mode.until * 1000 > now);
}

// Which jobs a run does: the ones --only names, else the morning part or the night part.
function jobsFor(o) { return o.only || (o.morning ? MORNING : NIGHT); }

// Is the catalog night still running? Its log says "==== nightly start" and, when it ends, "==== nightly done". A start with no
// end after it, less than six hours old, means it is running (an older one died without its last line).
function catalogBusy(logText, now) {
  const lines = String(logText || '').trim().split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes('==== nightly done')) return false;
    if (lines[i].includes('==== nightly start')) { const t = Date.parse(lines[i].slice(0, 24)); return !!t && now - t < 6 * 3600e3; }
  }
  return false;
}

// Why the publish gate stays shut after a run, or '' when it may open: the bank must have run and passed, and the timed
// questions (which ride the same gate, so the site never gets a bank its timed files do not fit) must not have failed.
function gateWhy(results) {
  const b = results.bank;
  if (!b || b.status !== 'ok') return 'the bank ' + (b ? (b.status === 'skipped' ? 'was skipped (' + b.why + ')' : 'did not pass') : 'did not run');
  if (results.timed && results.timed.status !== 'ok' && results.timed.status !== 'skipped') return 'the timed questions did not pass';
  return '';
}


// ---------- running ----------

function log(m) {
  const line = new Date().toISOString() + ' ' + m;
  console.log(line);
  try { fs.mkdirSync(OUT, { recursive: true }); fs.appendFileSync(LOG, line + '\n'); } catch (e) { /* the log is a convenience */ }
}

// okCodes: the exit codes that mean done (fame.js answers 3 when some titles still wait for page views; a rerun fills them).
function run(name, cmd, args, minutes, okCodes) {
  const t0 = Date.now();
  log('-- ' + name + ': ' + path.basename(cmd) + ' ' + args.map((a) => path.relative(ROOT, a) || a).join(' '));
  const r = spawnSync(cmd, args, { cwd: ROOT, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], timeout: minutes * 60000, maxBuffer: 64 * 1024 * 1024 });
  const tail = String(r.stdout || '').trim().split('\n').filter(Boolean).slice(-3).join(' | ');
  const err = String(r.stderr || '').trim().split('\n').filter((l) => l && !/ExperimentalWarning|--trace-warnings/.test(l)).slice(-2).join(' | ');
  const timedOut = r.error && r.error.code === 'ETIMEDOUT';
  const ok = (okCodes || [0]).includes(r.status);
  const mins = Math.round((Date.now() - t0) / 60000);
  log('   ' + name + ' ' + (ok ? 'ok' : timedOut ? 'stopped at its ' + minutes + ' minute limit' : 'FAILED (' + (r.error ? r.error.message : 'exit ' + r.status) + ')') + ' in ' + mins + ' min' + (tail ? ' :: ' + tail : '') + (err && !ok ? ' !! ' + err : ''));
  return { status: ok ? 'ok' : timedOut ? 'time' : 'failed', minutes: mins, said: tail };
}

function readJson(f, fb) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return fb; } }

function pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

// Another Whisper (a run started by hand, or the clip chat's) means tonight's Whisper waits for another night.
function whisperRunning() {
  try {
    const out = execSync('powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name=\'python.exe\'\\" | Select-Object -ExpandProperty CommandLine"', { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    return /whisper_lines\.py/.test(out);
  } catch (e) { return false; }
}

function counts() {
  const tDir = path.join(ROOT, 'trivia', 'transcripts'), mDir = path.join(ROOT, 'trivia', 'moments');
  let transcripts = 0, moments = 0;
  try { for (const d of fs.readdirSync(tDir, { withFileTypes: true })) if (d.isDirectory()) transcripts += fs.readdirSync(path.join(tDir, d.name)).filter((f) => f.endsWith('.json')).length; } catch (e) { /* none yet */ }
  try { for (const f of fs.readdirSync(mDir).filter((x) => x.endsWith('.json'))) moments += (readJson(path.join(mDir, f), []) || []).length || 0; } catch (e) { /* none yet */ }
  const idx = readJson(path.join(ROOT, 'trivia', 'bank', 'index.json'), {});
  const q = readJson(QUEUE, { todo: [] });
  return { transcripts, moments, questions: idx.total || 0, whisperQueue: (q.todo || []).length };
}

function main() {
  const o = options(process.argv.slice(2));
  const now = Date.now();
  const want = (k) => jobsFor(o).includes(k);
  const plan = [];
  if (want('fame')) plan.push(['fame', due(path.join(ROOT, 'catalog', 'trivia-fame.json'), now, o.force || !!o.only) ? 'run' : 'skip: the fame list is under a week old']);
  if (want('pool')) plan.push(['pool', due(path.join(ROOT, 'catalog', 'trivia-pool.json'), now, o.force || !!o.only) ? 'run' : 'skip: the pool is under a week old']);
  if (want('queue')) plan.push(['queue', 'run: the next ' + o.shows + ' shows, ' + o.eps + ' episodes each']);
  if (want('whisper')) plan.push(['whisper', 'run if the card is free and the queue has episodes, at most ' + o.whisperMinutes + ' minutes']);
  for (const k of ['transcripts', 'moments']) if (want(k)) plan.push([k, 'run']);
  if (want('timed')) plan.push(['timed', fs.existsSync(path.join(ROOT, 'scripts', 'trivia', 'timed.js')) ? 'run' : 'skip: scripts/trivia/timed.js is not there yet']);
  if (want('bank')) plan.push(['bank', 'run']);

  if (o.dry) { for (const [k, v] of plan) console.log(k.padEnd(12) + v); return; }

  fs.mkdirSync(OUT, { recursive: true });
  // The morning part waits for the catalog night and for a trivia night still running, at most WAIT_MINUTES, then goes on.
  if (o.morning) {
    const busy = () => { const h = readJson(LOCK, null); if (h && h.pid && pidAlive(h.pid)) return 'a trivia night (pid ' + h.pid + ')';
      let t = ''; try { t = fs.readFileSync(CATALOG_LOG, 'utf8').slice(-20000); } catch (e) { /* no catalog log */ } return catalogBusy(t, Date.now()) ? 'the catalog night' : ''; };
    const until = Date.now() + WAIT_MINUTES * 60000;
    let what = busy();
    if (what) log('trivia morning waits: ' + what + ' is still running');
    while (what && Date.now() < until) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 60000); what = busy(); }
    if (what) { log('trivia morning stops: ' + what + ' still running after ' + WAIT_MINUTES + ' minutes; yesterday\'s questions stay'); return; }
  }
  const held = readJson(LOCK, null);
  if (held && held.pid && pidAlive(held.pid)) { log('another trivia night is running (pid ' + held.pid + '); this one stops'); return; }
  fs.writeFileSync(LOCK, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
  const results = {};
  try {
    log('==== trivia ' + (o.morning ? 'morning' : 'night') + ' start');
    for (const [k, v] of plan) {
      if (v.startsWith('skip')) { results[k] = { status: 'skipped', why: v.slice(6) }; log('-- ' + k + ': ' + v); continue; }
      if (k === 'fame') results.fame = run('fame', process.execPath, [path.join(ROOT, 'scripts/trivia/fame.js')], 120, [0, 3]);
      else if (k === 'pool') results.pool = run('pool', process.execPath, [path.join(ROOT, 'scripts/trivia/pool.js')], 60);
      else if (k === 'queue') results.queue = run('queue', process.execPath, [path.join(ROOT, 'scripts/trivia/transcripts.js'), 'queue', '--shows', String(o.shows), '--eps', String(o.eps)], 90);
      else if (k === 'whisper') {
        const left = (readJson(QUEUE, { todo: [] }).todo || []).length;
        const mode = readJson(GPU_MODE_JSON, null);
        if (!left) { results.whisper = { status: 'skipped', why: 'nothing in the Whisper queue' }; log('-- whisper: skipped, nothing in the queue'); continue; }
        if (whisperRunning()) { results.whisper = { status: 'skipped', why: 'another Whisper is running' }; log('-- whisper: skipped, another Whisper is running'); continue; }
        if (!cardFree(mode, Date.now())) { results.whisper = { status: 'skipped', why: 'the card is held by ' + mode.by }; log('-- whisper: skipped, the card is held by ' + mode.by); continue; }
        log('   claim: ' + spawnSync(PYTHON, [GPU_MODES, '--set', 'studio', '--by', TAG, '--minutes', String(o.whisperMinutes + 15)], { windowsHide: true }).stdout.toString().trim());
        try { results.whisper = run('whisper', PYTHON, ['-I', path.join(ROOT, 'scripts/trivia/whisper_lines.py'), QUEUE], o.whisperMinutes); }
        finally { log('   release: ' + spawnSync(PYTHON, [GPU_MODES, '--release', '--by', TAG], { windowsHide: true }).stdout.toString().trim()); }
        // Stopped at its time limit is a normal night: the next night carries on where this one stopped.
        if (results.whisper.status === 'time') results.whisper.status = 'ok';
      }
      else if (k === 'transcripts') results.transcripts = run('transcripts', process.execPath, [path.join(ROOT, 'scripts/trivia/transcripts.js'), 'check'], 20);
      else if (k === 'moments') results.moments = run('moments', process.execPath, [path.join(ROOT, 'scripts/trivia/moments.js')], 20);
      // The timed questions stand apart from the bank: a timed question that fails its check is logged, and the bank still rebuilds.
      else if (k === 'timed') results.timed = run('timed', process.execPath, [path.join(ROOT, 'scripts/trivia/timed.js')], 20);
      else if (k === 'bank') {
        results.bank = run('bank', process.execPath, [path.join(ROOT, 'scripts/trivia/bank.js')], 30);
      }
    }
    // The gate for the hourly publish (scripts/trivia/gate.js): open only when the bank passed and the timed questions did not fail.
    if (want('bank')) {
      const why = gateWhy(results);
      const g = require('./gate').write(ROOT, Date.now(), !why, why);
      log('-- gate: ' + (g.passed ? 'open for ' + g.day + ', ' + g.questions + ' questions, ' + Object.keys(g.files).length + ' files' : 'shut for ' + g.day + ': ' + g.why));
    }
  } finally {
    const report = { at: new Date().toISOString(), part: o.only ? 'only' : o.morning ? 'morning' : 'night', results, counts: counts() };
    fs.writeFileSync(REPORT, JSON.stringify(report, null, 1));
    const c = report.counts;
    log('==== trivia ' + (o.morning ? 'morning' : 'night') + ' done: ' + Object.entries(results).map(([k, r]) => k + ' ' + r.status).join(', ') + '; ' + c.transcripts + ' transcripts, ' + c.moments + ' moments, ' + c.questions + ' questions, ' + c.whisperQueue + ' episodes still queued for Whisper');
    try { fs.unlinkSync(LOCK); } catch (e) { /* gone */ }
  }
}

if (require.main === module) main();
module.exports = { options, due, cardFree, gateWhy, jobsFor, catalogBusy, main, JOBS, NIGHT, MORNING, TAG };
