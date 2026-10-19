// DOCTOR: the health checks that keep VOIDtv running without anyone watching it. Writes
// catalog/cache/health.json (HQ shows it on the Overview), prunes stale caches, exits 1 when anything
// is red. Runs at the end of the nightly pass and on demand from HQ. docs/RUNBOOK.md says what to do
// about each light.
//   node scripts/doctor.js [--quick]     (--quick skips the network checks)
const fs = require('fs');
const path = require('path');
const { execSync, execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PROFILE = require('./lib/profile');
const CACHE = path.join(PROFILE.catalogDir, 'cache');
const QUICK = process.argv.includes('--quick');
const { taskNames } = require('./lib/tasks');
// The rules behind the gate, files, www, headers, shrink, backup and live-version lights live in scripts/lib/siteguards.js (pure, tested in
// tests/site-guards.test.js), the same module scripts/site.js builds with. Loaded softly: a tree that has only some of the scripts (the
// publish test copies a few) still gets every other light, and the missing module is itself a light.
let guards = null; try { guards = require('./lib/siteguards'); } catch (e) { /* reported as the site-guards light below */ }
const checks = [];
const add = (id, level, msg, fix) => checks.push({ id, level, msg, fix: fix || undefined }); // level: green | yellow | red
const run = (c) => execSync(c, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
// The generated reports publish.js stages from the docs folder; a commit that touches anything else under docs/ is not publish's own. Keep in step with DOC_REPORTS in scripts/publish.js.
const DOC_REPORTS = ['CANDIDATES.md', 'COVERAGE.md', 'HUNT.md', 'MOVIES.md', 'NETWORKS.md', 'SCOUT.md', 'SHOW_PROBE.md'];
const gitRaw =(args) => execFileSync('git', ['-c', 'core.quotepath=off', ...args], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true, maxBuffer: 256 * 1024 * 1024 }).toString(); // no shell, so a format string needs no quoting
const gitOut = (args) => gitRaw(args).trim();
const tailLines = (p, n) => { try { return fs.readFileSync(p, 'utf8').trim().split('\n').slice(-n); } catch (e) { return []; } };
const hours = (iso) => (Date.now() - new Date(iso).getTime()) / 36e5;

// Address-shaped text under the catalog folder (not cache, which is never committed). An Archive file name can look like an address
// ("show@720p.mp4", or a stem such as "clip@Sessions.at.West54th.PBS.tv-vhs.XviD") and is the Archive's own public path, so what follows the @
// must end in something that can be a top-level domain: two letters, or one of the common generic ones, and not a media extension. Keep in step
// with scripts/publish.js. A file without an @ byte is skipped without being decoded, so the scan runs close to disk speed (a few seconds).
const ADDR = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const MEDIA_END = new Set(['ts', 'mp4', 'm4v', 'mkv', 'avi', 'webm', 'ogv', 'ogg', 'mpg', 'mpeg', 'mov', 'wmv', 'flv', '3gp', 'divx', 'm2ts', 'vob', 'mp3', 'm4a', 'flac', 'wav']);
const GENERIC_TLD = new Set(['com', 'net', 'org', 'edu', 'gov', 'mil', 'int', 'info', 'biz', 'name', 'pro', 'mobi', 'asia', 'tel', 'travel', 'jobs', 'museum', 'aero', 'coop', 'xyz', 'online', 'site', 'app', 'dev', 'club', 'shop', 'store', 'blog', 'tech', 'live', 'news', 'email', 'cloud', 'world', 'today', 'top', 'vip', 'link', 'space', 'fun']);
const isTld = (s) => { const t = s.toLowerCase(); return !MEDIA_END.has(t) && (/^[a-z]{2}$/.test(t) || GENERIC_TLD.has(t)); };
function scanAddresses(dir) {
  const out = { scanned: 0, files: 0, hits: 0, where: [] };
  const scanFile = (p) => {
    out.scanned++;
    let buf; try { buf = fs.readFileSync(p); } catch (e) { return; } // tracked but missing on disk: nothing to read
    if (buf.indexOf(64) < 0) return;
    const text = buf.toString('utf8'); let n = 0;
    for (const m of text.matchAll(ADDR)) {
      const run = /^[A-Za-z0-9.-]*/.exec(text.slice(m.index + m[0].indexOf('@') + 1))[0].replace(/\.+$/, '');
      if (isTld(run.split('.').pop())) n++;
    }
    if (n) { out.hits += n; out.files++; if (out.where.length < 3) out.where.push(path.relative(ROOT, p).replace(/\\/g, '/')); }
  };
  // What counts is what git tracks (what gets published): the .json files git lists under the catalog folder. Ignored files such as
  // catalog/cache, catalog/voidtv.db or a generated preview are not read. Without git (not a repository) every .json under the folder is read.
  let listed = null;
  try { listed = gitRaw(['ls-files', '-z', '--', path.relative(ROOT, dir).replace(/\\/g, '/')]).split('\0').filter((f) => /\.json$/i.test(f)); } catch (e) { /* no git here */ }
  if (listed) { for (const f of listed) scanFile(path.join(ROOT, f)); return out; }
  const walk = (d, top) => {
    let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!(top && e.name === 'cache')) walk(p, false); continue; }
      if (/\.json$/i.test(e.name)) scanFile(p);
    }
  };
  walk(dir, true);
  return out;
}

async function main() {
  // 1. publish. The light follows the LAST dated outcome line in publish.log, found by reading the whole file from the
  //    end. (It used to read the last 60 lines: one failed publish wrote thousands of git warning lines and pushed the real
  //    outcome out of that window, so a failure read as "no publish has run yet".) publish.js ends every run with exactly one of:
  //    "nothing new", "pushed <hash>: ...", "refused: ...", "FAILED: ...", "held: ...". Lines from a --dry run start "dry:" and never match.
  const OUTCOME = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z) (nothing new|pushed |refused:|FAILED:|held:)/;
  let lastOut = null, lastPush = null;
  try {
    const lines = fs.readFileSync(path.join(CACHE, 'publish.log'), 'utf8').split('\n');
    for (let i = lines.length - 1; i >= 0 && !(lastOut && lastPush); i--) {
      const m = OUTCOME.exec(lines[i]); if (!m) continue;
      const hit = { at: m[1], word: m[2].replace(/[: ]+$/, ''), text: lines[i].replace(/\r$/, '').slice(m[1].length + 1) };
      if (!lastOut) lastOut = hit;
      if (!lastPush && hit.word === 'pushed') lastPush = hit;
    }
  } catch (e) { /* no log yet */ }
  if (!lastOut) add('publish', 'yellow', 'no publish has run yet');
  else if (lastOut.word === 'FAILED') add('publish', 'red', 'the last publish failed: ' + lastOut.text.replace(/^FAILED: /, '').slice(0, 160), 'Open HQ > Jobs > publish.log; the FAILED line says why (a file git cannot add, a push that did not go through, a branch that is not master). The next scheduled run tries again; node scripts/publish.js runs it now.');
  else if (lastOut.word === 'refused') add('publish', 'red', 'the last publish was refused: ' + lastOut.text.replace(/^refused: /, '').slice(0, 160), 'Nothing was committed. publish.log has the reason. A shrink: find out what emptied the catalog first; if it is meant, run node scripts/publish.js --allow-shrink. A file that is not JSON, or an address or token: fix the file it names.');
  else if (lastOut.word === 'held') add('publish', 'yellow', lastOut.text.slice(0, 160), 'The catalog is committed but not pushed: commits that publish did not make are waiting. Push them by hand when you mean to, or run node scripts/publish.js --allow-other-commits.');
  else if (hours(lastOut.at) > 6) add('publish', 'yellow', 'last publish run was ' + Math.round(hours(lastOut.at)) + ' h ago', 'Check the VoidTV Publish task exists and the PC was on.');
  else add('publish', 'green', (lastPush || lastOut).text.slice(0, 120));

  // 1b. unpushed: commits on master that origin/master does not have yet. Local refs only, no fetch (no network in the doctor).
  //     Yellow while a commit that publish did not make waits (publish will not push it); red once a "Catalog:" commit has waited over 30 minutes.
  try {
    // Same rule as publish.js: a commit is publish's own only when its subject starts with "Catalog:" and it touches nothing outside the catalog, docs and list paths.
    const relp = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
    const ownPaths = [relp(PROFILE.catalogDir), relp(PROFILE.listFile), ...DOC_REPORTS.map((n) => relp(PROFILE.docsDir) + '/' + n)];
    const inOwn = (f) => ownPaths.some((p) => f === p || f.startsWith(p + '/'));
    const rows = gitRaw(['log', '--format=%x01%ct%x09%s', '--name-only', 'origin/master..master']).split('\x01').filter((b) => b.trim()).map((b) => {
      const [head, ...files] = b.split('\n'); const i = head.indexOf('\t');
      return { at: +head.slice(0, i) * 1000, subject: head.slice(i + 1).trim(), own: /^Catalog: /.test(head.slice(i + 1)) && files.map((f) => f.trim()).filter(Boolean).every(inOwn) };
    });
    const own = rows.filter((r) => r.own), other = rows.filter((r) => !r.own);
    const waited = own.length ? Math.round((Date.now() - Math.min(...own.map((r) => r.at))) / 60000) : 0;
    const names = other.slice(0, 4).map((r) => r.subject.slice(0, 60)).join(' | ') + (other.length > 4 ? ` | and ${other.length - 4} more` : '');
    if (own.length && waited > 30) add('unpushed', 'red', `${own.length} Catalog commit${own.length === 1 ? '' : 's'} waiting ${waited} min to be pushed` + (other.length ? `, with ${other.length} other commit${other.length === 1 ? '' : 's'}` : ''), 'The push failed or is being held. publish.log has the reason; node scripts/publish.js tries the push again (it pushes waiting commits first).');
    else if (other.length) add('unpushed', 'yellow', `${other.length} commit${other.length === 1 ? '' : 's'} not made by publish waiting to be pushed: ${names}`, 'They stay on this PC until you push them; the scheduled publish will not send them (it logs "held"). node scripts/publish.js --allow-other-commits sends them with the catalog.');
    else if (own.length) add('unpushed', 'green', `${own.length} Catalog commit${own.length === 1 ? '' : 's'} made ${waited} min ago, not pushed yet`);
    else add('unpushed', 'green', 'nothing waiting: master is level with origin/master');
  } catch (e) { add('unpushed', 'yellow', 'could not compare master with origin/master', 'Run git status in the repo folder; origin/master may not exist here yet.'); }

  // 2. nightly
  const nl = tailLines(path.join(CACHE, 'nightly.log'), 80);
  const lastDone = [...nl].reverse().find((l) => /nightly done/.test(l));
  const startIdx = nl.map((l, i) => (/nightly start/.test(l) ? i : -1)).filter((i) => i >= 0).pop();
  const lastRun = startIdx != null ? nl.slice(startIdx) : [];
  const failed = lastRun.filter((l) => /FAILED/.test(l));
  if (!lastDone) add('nightly', 'yellow', 'no nightly pass recorded yet');
  else if (hours(lastDone.slice(0, 24)) > 30) add('nightly', 'red', 'last nightly finished ' + Math.round(hours(lastDone.slice(0, 24))) + ' h ago', 'The VoidTV Nightly task did not run; re-create it from HQ > Overview.');
  else if (failed.length) add('nightly', 'yellow', failed.length + ' step(s) failed last night: ' + failed.map((l) => l.replace(/^\S+\s+/, '').slice(0, 60)).join(' | '), 'HQ > Jobs > nightly.log has the step output.');
  else add('nightly', 'green', 'last pass ' + Math.round(hours(lastDone.slice(0, 24))) + ' h ago, all steps ok');

  // 3. scheduled tasks
  for (const name of taskNames()) {
    try {
      const out = run(`schtasks /Query /FO CSV /V /TN "${name}"`);
      const row = out.split('\n').find((l) => l.startsWith('"') && !l.startsWith('"HostName"'));
      const c = row ? row.split('","').map((x) => x.replace(/^"|"\r?$/g, '')) : [];
      const result = c[6], status = c[3];
      if (status && /disabled/i.test(status)) add('task:' + name, 'red', name + ' is disabled', 'Re-create the tasks from HQ > Overview.');
      else if (result && result !== '0' && result !== '267009' && result !== '267011') add('task:' + name, 'yellow', name + ' last result ' + result, 'HQ > Jobs > the matching log.');
      else add('task:' + name, 'green', name + ' next ' + (c[2] || '?'));
    } catch (e) { add('task:' + name, 'red', name + ' is missing from Task Scheduler', 'Re-create the tasks from HQ > Overview.'); }
  }

  // 4. running jobs
  try {
    const out = run('powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name=\'node.exe\'\\" | Select-Object -ExpandProperty CommandLine"');
    // Count only the scripts that talk to the Archive. A wrapper such as profiles/kids/kids-hunt.js spawns
    // scripts/hunt.js as a child: counting both made two kids queues look like four jobs (red light, nightly hunts skipped).
    const hunts = (out.match(/(?:^|[\s"'\\/])scripts[\\/](hunt|hunt-movies|scout)\.js(?=[\s"']|$)/gm) || []).length;
    add('jobs', hunts > 2 ? 'red' : 'green', hunts + ' Archive-facing job(s) running (ceiling 2)', hunts > 2 ? 'Stop one from HQ > Jobs; three at once gets this address throttled.' : undefined);
  } catch (e) { add('jobs', 'yellow', 'could not list processes'); }

  // 4b. local servers: HQ must turn away a page from another port, a body that is not JSON and a call without its token (CF-004)
  try {
    const r = await require('./lib/hqcheck').probe(PROFILE.port);
    if (r.down) add('local-servers', 'green', 'HQ is not running on port ' + PROFILE.port + ', nothing to probe');
    else add('local-servers', r.ok ? 'green' : 'red', r.detail, r.ok ? undefined : 'Close HQ and the desktop app and start them again from the current scripts/hq.js (HQ.cmd or the desktop app). A copy started before the CF-004 fix still answers any page on this PC.');
  } catch (e) { add('local-servers', 'yellow', 'could not probe HQ: ' + String(e.message).slice(0, 80)); }

  // 4c. motion editor guards (CF-005): a foreign Host, another port, a text/plain body and a bad theme value must all be refused
  try {
    const kitPort = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'motion', 'kit.json'), 'utf8')).port || 8221; } catch (e) { return 8221; } })();
    const m = await require('./lib/motioncheck').probeMotion(kitPort);
    if (m.down) add('local-servers:motion', 'green', 'motion editor is not running on ' + kitPort + ', nothing to probe');
    else add('local-servers:motion', m.ok ? 'green' : 'red', m.detail, m.ok ? undefined : 'Apply audit/proposals/motion-editor-hardening.md, then restart the motion editor (HQ > Motion > Restart). An editor started before the fix still trusts any page.');
  } catch (e) { add('local-servers:motion', 'yellow', 'could not probe the motion editor: ' + String(e.message).slice(0, 80)); }

  // 5. catalog integrity (cheap: parse every grid, look for reserved names and empty essentials)
  const showsDir = path.join(PROFILE.catalogDir, 'shows');
  let bad = 0, n = 0, reserved = 0;
  for (const f of fs.existsSync(showsDir) ? fs.readdirSync(showsDir) : []) {
    if (!f.endsWith('.json')) continue; n++;
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])\.json$/i.test(f)) reserved++;
    try { const g = JSON.parse(fs.readFileSync(path.join(showsDir, f), 'utf8')); if (!g.slug || !Array.isArray(g.seasons)) bad++; } catch (e) { bad++; }
  }
  const list = (() => { try { return JSON.parse(fs.readFileSync(PROFILE.listFile, 'utf8')); } catch (e) { return null; } })();
  if (!list || !list.shows || list.shows.length < 100) add('catalog', 'red', 'scripts/show-list.json is missing or tiny', 'Restore it from git: git checkout -- scripts/show-list.json');
  else if (bad || reserved) add('catalog', 'red', `${bad} unreadable grid(s), ${reserved} reserved-name file(s) of ${n}`, 'Delete or re-match the bad grids (HQ > Shows > Re-match now). A reserved-name file needs the \\\\?\\ path to delete.');
  else add('catalog', 'green', `${n} grids readable, list has ${list.shows.length} shows`);
  // 5b. the matcher: its self-test, the share of S/E-plus-title picks below LIVE, grids restamped on one day, fallback grids an older matcher left (scripts/lib/matchcheck.js)
  const ml = (() => { try { return require('./lib/matchcheck').matcherLight({ showsDir }); } catch (e) { return { level: 'red', detail: 'self-test could not run: ' + e.message.slice(0, 80) }; } })();
  add('matcher', ml.level, ml.detail, ml.fix);
  let built = null; // the counts assemble() gives, for the shrink light
  try {
    const { assemble } = require('./lib/app');
    const data = assemble();
    built = { shows: data.shows.length, episodes: data.shows.reduce((n, s) => n + (s.eps || 0), 0) };
    const nulls = data.channels.reduce((k, c) => k + c.items.filter((it) => it[0] == null || !data.shows[it[0]]).length, 0);
    if (data.shows.length < 300) add('build', 'red', 'the site would ship with only ' + data.shows.length + ' titles', 'Something emptied the catalog; check git status in catalog/.');
    else if (nulls) add('build', 'red', nulls + ' TV channel items point at no show', 'buildChannels index drift; re-run node scripts/site.js and look at the error.');
    else add('build', 'green', `${data.shows.length} titles, ${data.channels.length} channels, home order ${data.homeOrder.length} shelves`);
  } catch (e) { add('build', 'red', 'assemble() threw: ' + e.message.slice(0, 120), 'The page cannot be built; the last error line names the file.'); }

  // 5b. shrink: the show count now against the one the last publish went out with (audit CF-018). Red when down more than 10 percent,
  //     the same rule publish.js and scripts/site.js refuse on. The last count is catalog/cache/publish-state.json, else the committed catalog/count.json.
  // 5c. backup: catalog/cache is not in git and holds the only copy of every TVmaze episode list (audit CP-012). scripts/backup-cache.js writes
  //     catalog/cache/backup-stamp.json; green under 7 days old, yellow older, red when there is none.
  if (!guards) add('site-guards', 'yellow', 'scripts/lib/siteguards.js is missing, so the gate, files, www, headers, shrink, backup and live-version lights cannot run', 'Restore it from git: git checkout -- scripts/lib/siteguards.js');
  else {
    try {
      if (built) { const l = guards.shrinkLight(built, guards.readLastCounts(PROFILE.catalogDir)); add(l.id, l.level, l.msg, l.fix); }
      else add('shrink', 'yellow', 'could not count the shows (the build light says why)', 'Fix the build light first.');
    } catch (e) { add('shrink', 'yellow', 'could not work out the shrink check: ' + String(e.message).slice(0, 80)); }
    try {
      let stamp = null; try { stamp = JSON.parse(fs.readFileSync(path.join(CACHE, 'backup-stamp.json'), 'utf8')); } catch (e) { /* none yet */ }
      const l = guards.backupLight(stamp, Date.now()); add(l.id, l.level, l.msg, l.fix);
    } catch (e) { add('backup', 'yellow', 'could not read the backup stamp: ' + String(e.message).slice(0, 80)); }
  }

  // 6. external services and the live site
  if (!QUICK) {
    const ping = async (id, url, opts, okFn, fix) => {
      try { const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(15000) }); const ok = okFn ? await okFn(r) : r.ok; add(id, ok ? 'green' : 'yellow', `${url.replace(/^https?:\/\//, '').slice(0, 50)} -> ${r.status}`, ok ? undefined : fix); } catch (e) { add(id, 'yellow', `${url.replace(/^https?:\/\//, '').slice(0, 50)} unreachable: ${e.message.slice(0, 60)}`, fix); }
    };
    await ping('tvmaze', 'https://api.tvmaze.com/shows/1', {}, async (r) => r.ok && !!(await r.json()).name, 'TVmaze is down or changed shape; hunts will skip episode lists until it is back.');
    await ping('archive', 'https://archive.org/metadata/wilfred-2007-aus-series-HD/files_count', {}, null, 'The Archive is slow or throttling this address; pause hunts for a few hours.');
    const env = (() => { try { return fs.readFileSync(path.join(ROOT, 'backend', '.env'), 'utf8'); } catch (e) { return ''; } })();
    const tok = (env.match(/^TMDB_READ_TOKEN=(.+)$/m) || [])[1];
    if (tok) await ping('tmdb', 'https://api.themoviedb.org/3/configuration', { headers: { Authorization: 'Bearer ' + tok.trim() } }, null, 'TMDB token rejected or TMDB down; art fetches will fail.');
    else add('tmdb', 'yellow', 'no TMDB_READ_TOKEN in backend/.env', 'Art and people lookups need it.');
    let liveText = null;
    await ping('live', PROFILE.domain + '/version.txt', {}, async (r) => { if (!r.ok) return false; liveText = (await r.text()).trim(); return true; }, PROFILE.domain + ' did not answer; check Cloudflare Pages.');
    // What the live site says about itself (audit batch B, B3): live:version (CF-016) compares version.txt with origin/master as this PC last saw
    // it (no fetch) and only turns yellow once that commit is over 10 minutes old, so a build in progress is not a false alarm; gate (CF-002, CF-003)
    // reads gate=on|off from version.txt and checks / answers 401 or 200 to match; files (F-005) reads the file count and the largest file;
    // www (F-004, CF-025) wants a 301 to https://voidtv.net/; headers (CF-012) wants HSTS, X-Frame-Options and nosniff on / and /version.txt.
    if (liveText !== null && guards) {
      let remote = null;
      try {
        const sha = gitOut(['rev-parse', 'origin/master']), atMs = +gitOut(['log', '-1', '--format=%ct', 'origin/master']) * 1000, liveSha = guards.parseVersion(liveText).sha;
        let liveIsNewer = false; // the live commit is a descendant of origin/master: this PC has simply not fetched yet
        if (/^[0-9a-f]{7,40}$/.test(liveSha) && !sha.startsWith(liveSha)) { try { gitRaw(['merge-base', '--is-ancestor', sha, liveSha]); liveIsNewer = true; } catch (e) { /* not a descendant, or not known here */ } }
        remote = { sha, atMs, liveIsNewer };
      } catch (e) { /* no origin/master on this PC: the commit comparison is skipped */ }
      try { for (const c of await guards.liveLights({ base: PROFILE.domain, versionTextBody: liveText, doFetch: fetch, remote, nowMs: Date.now() })) add(c.id, c.level, c.msg, c.fix); }
      catch (e) { add('live:site', 'yellow', 'could not check the live site: ' + String(e.message).slice(0, 80)); }
    }
    const cfa = (env.match(/^CF_ANALYTICS_TOKEN=(.+)$/m) || [])[1];
    add('analytics', cfa ? 'green' : 'yellow', cfa ? 'analytics token present' : 'analytics not connected (no CF_ANALYTICS_TOKEN)', cfa ? undefined : 'HQ > Reports explains the two Cloudflare steps.');
  }

  // 7. link rot summary (written by linkcheck.js)
  try {
    const lc = JSON.parse(fs.readFileSync(path.join(CACHE, 'linkcheck.json'), 'utf8'));
    const rate = lc.checked ? lc.dead / lc.checked : 0;
    add('links', rate > 0.08 ? 'red' : rate > 0.03 ? 'yellow' : 'green', `${lc.dead} of ${lc.checked} sampled files dead (${Math.round(rate * 100)}%), ${hours(lc.at).toFixed(0)} h ago; ${lc.deadTotal} retired in all`, rate > 0.03 ? 'Archive takedowns; the matcher picks alternates where it has them. A re-hunt of the worst shows finds new copies.' : undefined);
  } catch (e) { add('links', 'yellow', 'no link check has run yet'); }

  // 8. disk and repo
  let cacheFiles = 0, cacheBytes = 0, pruned = 0;
  const cutoff = Date.now() - 45 * 864e5;
  for (const f of fs.existsSync(CACHE) ? fs.readdirSync(CACHE) : []) {
    const p = path.join(CACHE, f); let st; try { st = fs.statSync(p); } catch (e) { continue; }
    if (!st.isFile()) continue;
    if (/^meta-/.test(f) && st.mtimeMs < cutoff) { try { fs.unlinkSync(p); pruned++; continue; } catch (e) { /* locked */ } }
    cacheFiles++; cacheBytes += st.size;
  }
  add('cache', cacheBytes > 8e9 ? 'yellow' : 'green', `${cacheFiles} files, ${(cacheBytes / 1e9).toFixed(1)} GB` + (pruned ? `, pruned ${pruned} stale metadata files` : ''), cacheBytes > 8e9 ? 'Old scrape pages can go: delete catalog/cache/scrape-* older than 60 days.' : undefined);
  try {
    const gitBytes = +run('powershell -NoProfile -Command "(Get-ChildItem -Recurse -Force .git | Measure-Object -Property Length -Sum).Sum"');
    const dirty = run('git status --porcelain -- catalog docs scripts/show-list.json').split('\n').filter(Boolean).length;
    add('repo', gitBytes > 4e9 ? 'yellow' : 'green', `.git ${(gitBytes / 1e9).toFixed(1)} GB, ${dirty} unpublished catalog files`, gitBytes > 4e9 ? 'The catalog history is getting heavy: run git gc, or start a fresh catalog repo (docs/RUNBOOK.md).' : undefined);
  } catch (e) { add('repo', 'yellow', 'git not readable'); }

  // 9. addresses: uploader e-mail addresses are third-party personal data and must not sit in the published catalog (audit CP-025). Should be 0.
  const adr = scanAddresses(PROFILE.catalogDir);
  if (adr.hits) add('addresses', 'red', `${adr.hits} address-shaped string${adr.hits === 1 ? '' : 's'} in ${adr.files} catalog file${adr.files === 1 ? '' : 's'}, e.g. ${adr.where.join(', ')}`, 'In the named files remove the uploader field, or replace the text with [email]. publish.js refuses to add new ones, so a hunter that writes one will stop the publish until it is fixed.');
  else add('addresses', 'green', `no address-shaped text in ${adr.scanned} catalog files`);

  const worst = checks.some((c) => c.level === 'red') ? 'red' : checks.some((c) => c.level === 'yellow') ? 'yellow' : 'green';
  const out = { at: new Date().toISOString(), level: worst, checks };
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(path.join(CACHE, 'health.json'), JSON.stringify(out, null, 1));
  for (const c of checks) console.log(`${c.level.padEnd(6)} ${c.id.padEnd(22)} ${c.msg}${c.fix ? '\n       -> ' + c.fix : ''}`);
  console.log(`\nOverall: ${worst}`);
  process.exit(worst === 'red' ? 1 : 0);
}
main();
