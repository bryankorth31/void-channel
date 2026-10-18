// NIGHTLY: the builder's full pass, one step after another, then publish. Scheduled by Windows Task
// Scheduler ("VoidTV Nightly", 3:30 AM); safe to run by hand any time.
//   1. hunt.js --priority          new shows on the list (skipped while a hunt is already running)
//   2. hunt-movies.js              new TV movies (same rule)
//   3. art.js                      posters for shows without art
//   4. people.js --episodes --bios cast, episode credits, bios, the graph
//   5. db.js                       the SQLite mirror
//   6. publish.js                  commit + push -> Cloudflare rebuilds
// Each step gets a time limit; a failing step is logged and the pass continues, because a stale
// poster is not a reason to skip the publish. Log: catalog/cache/nightly.log
const path = require('path');
const fs = require('fs');
const { spawnSync, execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PROFILE = require('./lib/profile');
const LOG = path.join(PROFILE.catalogDir, 'cache', 'nightly.log');
const log = (m) => { const line = `${new Date().toISOString()} ${m}`; console.log(line); try { fs.mkdirSync(path.dirname(LOG), { recursive: true }); fs.appendFileSync(LOG, line + '\n'); } catch (_) {} };

// Another hunt (the long foreground ones B runs) must not be doubled: two Archive jobs is the ceiling.
function huntsRunning() {
  try {
    const out = execSync('powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name=\'node.exe\'\\" | Select-Object -ExpandProperty CommandLine"', { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    // Only the scripts that talk to the Archive count; a wrapper that spawns scripts/hunt.js is not a second job.
    return (out.match(/(?:^|[\s"'\\/])scripts[\\/](hunt|hunt-movies|scout)\.js(?=[\s"']|$)/gm) || []).length;
  } catch (_) { return 0; }
}

function step(name, args, minutes) {
  const t0 = Date.now();
  log(`-- ${name}: node ${args.join(' ')}`);
  const r = spawnSync(process.execPath, args.map((a) => a.startsWith('scripts/') ? path.join(ROOT, a) : a), { cwd: ROOT, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], timeout: minutes * 60 * 1000, maxBuffer: 64 * 1024 * 1024 });
  const tail = (r.stdout || '').toString().trim().split('\n').slice(-3).join(' | ');
  const err = (r.stderr || '').toString().trim().split('\n').slice(-2).join(' | ');
  log(`   ${name} ${r.status === 0 ? 'ok' : 'FAILED (' + (r.error ? r.error.message : 'exit ' + r.status) + ')'} in ${Math.round((Date.now() - t0) / 60000)} min${tail ? ' :: ' + tail : ''}${err && r.status !== 0 ? ' :: ' + err : ''}`);
  return r.status === 0;
}

log('==== nightly start');
const running = huntsRunning();
if (running) log(`   ${running} hunt process(es) already running; skipping the hunt steps tonight`);
else {
  step('hunt', ['scripts/hunt.js', '--priority', '--open', '8', '--pause', '2500', '--budget', '6000', '--refresh'], 240);
  step('movies', ['scripts/hunt-movies.js', '--min-votes', '20', '--budget', '4000', '--pause', '2500', '--open', '6'], 150);
  step('scout', ['scripts/scout.js', '--budget', '500', '--pause', '4000', '--open', '60'], 90); // leads for new shows and categories -> docs/SCOUT.md
}
step('networks', ['scripts/networks.js'], 30); // TMDB network sweeps -> docs/NETWORKS.md (no Archive calls)
step('art', ['scripts/art.js'], 30);
step('people', ['scripts/people.js', '--episodes', '--bios', '4000'], 120);
step('linkcheck', ['scripts/linkcheck.js', '--sample', '150'], 15); // link rot: retire files the Archive dropped
step('db', ['scripts/db.js'], 20);
step('publish', ['scripts/publish.js'], 20);
step('doctor', ['scripts/doctor.js'], 10); // the lights HQ shows; red exits 1 and is logged here
log('==== nightly done');
