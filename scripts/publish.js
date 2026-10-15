// PUBLISH: commit whatever the builder has written to catalog/ and docs/ and push it, so the live
// site (Cloudflare Pages builds from master) catches up with the PC. Safe to run any time; does
// nothing when there is nothing new. Scheduled every two hours while hunts run (see docs/DEPLOY.md).
// Usage: node scripts/publish.js
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const run = (c) => execSync(c, { cwd: ROOT, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
const LOG = path.join(ROOT, 'catalog', 'cache', 'publish.log');
const log = (m) => { const line = `${new Date().toISOString()} ${m}`; console.log(line); try { fs.mkdirSync(path.dirname(LOG), { recursive: true }); fs.appendFileSync(LOG, line + '\n'); } catch (_) {} };

try {
  run('git add -A catalog docs scripts/show-list.json'); // the list is edited by HQ and read by the site build
  const changed = run('git diff --cached --name-only').split('\n').filter(Boolean);
  if (!changed.length) { log('nothing new'); process.exit(0); }
  const { assemble } = require('./lib/app');
  const data = assemble();
  const eps = data.shows.reduce((n, s) => n + s.eps, 0);
  const msg = `Catalog: ${data.shows.length} shows, ${eps} episodes (${changed.length} files)`;
  run(`git commit -q -m "${msg}"`);
  run('git push -q origin master');
  log(`pushed ${run('git rev-parse --short HEAD')}: ${msg}`);
} catch (e) {
  log('FAILED: ' + (e.stderr ? e.stderr.toString().trim() : e.message));
  process.exit(1);
}
