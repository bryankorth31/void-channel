// DOCTOR: the health checks that keep VOIDtv running without anyone watching it. Writes
// catalog/cache/health.json (HQ shows it on the Overview), prunes stale caches, exits 1 when anything
// is red. Runs at the end of the nightly pass and on demand from HQ. docs/RUNBOOK.md says what to do
// about each light.
//   node scripts/doctor.js [--quick]     (--quick skips the network checks)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CACHE = path.join(ROOT, 'catalog', 'cache');
const QUICK = process.argv.includes('--quick');
const checks = [];
const add = (id, level, msg, fix) => checks.push({ id, level, msg, fix: fix || undefined }); // level: green | yellow | red
const run = (c) => execSync(c, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
const tailLines = (p, n) => { try { return fs.readFileSync(p, 'utf8').trim().split('\n').slice(-n); } catch (e) { return []; } };
const hours = (iso) => (Date.now() - new Date(iso).getTime()) / 36e5;

async function main() {
  // 1. publish freshness
  const pub = tailLines(path.join(CACHE, 'publish.log'), 60).filter((l) => /pushed|FAILED|nothing new/.test(l));
  const lastPush = [...pub].reverse().find((l) => /pushed/.test(l));
  const lastAny = pub[pub.length - 1] || '';
  if (!lastAny) add('publish', 'yellow', 'no publish has run yet');
  else if (/FAILED/.test(lastAny)) add('publish', 'red', 'the last publish failed: ' + lastAny.slice(25, 160), 'Open HQ > Jobs > publish.log; the error is at the end. A file git cannot add (odd name, locked) is the usual cause.');
  else if (lastPush && hours(lastPush.slice(0, 24)) > 6) add('publish', 'yellow', 'last successful push was ' + Math.round(hours(lastPush.slice(0, 24))) + ' h ago', 'Check the VoidTV Publish task exists and the PC was on.');
  else add('publish', 'green', (lastPush || lastAny).slice(25, 120));

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
  for (const name of ['VoidTV Publish', 'VoidTV Nightly']) {
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
    const hunts = (out.match(/hunt(-movies)?\.js|scout\.js/g) || []).length;
    add('jobs', hunts > 2 ? 'red' : 'green', hunts + ' Archive-facing job(s) running (ceiling 2)', hunts > 2 ? 'Stop one from HQ > Jobs; three at once gets this address throttled.' : undefined);
  } catch (e) { add('jobs', 'yellow', 'could not list processes'); }

  // 5. catalog integrity (cheap: parse every grid, look for reserved names and empty essentials)
  const showsDir = path.join(ROOT, 'catalog', 'shows');
  let bad = 0, n = 0, reserved = 0;
  for (const f of fs.existsSync(showsDir) ? fs.readdirSync(showsDir) : []) {
    if (!f.endsWith('.json')) continue; n++;
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])\.json$/i.test(f)) reserved++;
    try { const g = JSON.parse(fs.readFileSync(path.join(showsDir, f), 'utf8')); if (!g.slug || !Array.isArray(g.seasons)) bad++; } catch (e) { bad++; }
  }
  const list = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'show-list.json'), 'utf8')); } catch (e) { return null; } })();
  if (!list || !list.shows || list.shows.length < 100) add('catalog', 'red', 'scripts/show-list.json is missing or tiny', 'Restore it from git: git checkout -- scripts/show-list.json');
  else if (bad || reserved) add('catalog', 'red', `${bad} unreadable grid(s), ${reserved} reserved-name file(s) of ${n}`, 'Delete or re-match the bad grids (HQ > Shows > Re-match now). A reserved-name file needs the \\\\?\\ path to delete.');
  else add('catalog', 'green', `${n} grids readable, list has ${list.shows.length} shows`);
  try {
    const { assemble } = require('./lib/app');
    const data = assemble();
    const nulls = data.channels.reduce((k, c) => k + c.items.filter((it) => it[0] == null || !data.shows[it[0]]).length, 0);
    if (data.shows.length < 300) add('build', 'red', 'the site would ship with only ' + data.shows.length + ' titles', 'Something emptied the catalog; check git status in catalog/.');
    else if (nulls) add('build', 'red', nulls + ' TV channel items point at no show', 'buildChannels index drift; re-run node scripts/site.js and look at the error.');
    else add('build', 'green', `${data.shows.length} titles, ${data.channels.length} channels, home order ${data.homeOrder.length} shelves`);
  } catch (e) { add('build', 'red', 'assemble() threw: ' + e.message.slice(0, 120), 'The page cannot be built; the last error line names the file.'); }

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
    let head = ''; try { head = run('git rev-parse --short HEAD'); } catch (e) { /* no git */ }
    await ping('live', 'https://voidtv.net/version.txt', {}, async (r) => { if (!r.ok) return false; const v = (await r.text()).trim(); if (head && !v.startsWith(head)) { add('live:version', 'yellow', `voidtv.net serves ${v.slice(0, 12)}, this PC is at ${head}`, 'Cloudflare has not built the latest push yet, or the build failed: dash.cloudflare.com > voidtvsite > Deployments.'); } return true; }, 'voidtv.net did not answer; check Cloudflare Pages.');
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

  const worst = checks.some((c) => c.level === 'red') ? 'red' : checks.some((c) => c.level === 'yellow') ? 'yellow' : 'green';
  const out = { at: new Date().toISOString(), level: worst, checks };
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(path.join(CACHE, 'health.json'), JSON.stringify(out, null, 1));
  for (const c of checks) console.log(`${c.level.padEnd(6)} ${c.id.padEnd(22)} ${c.msg}${c.fix ? '\n       -> ' + c.fix : ''}`);
  console.log(`\nOverall: ${worst}`);
  process.exit(worst === 'red' ? 1 : 0);
}
main();
