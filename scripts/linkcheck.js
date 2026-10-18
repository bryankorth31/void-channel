// LINKCHECK: link rot watch. Every night it samples episode files across the catalog, asks the
// Archive whether each still exists (HEAD, one request per second), retires the dead ones into
// catalog/dead-files.json (the matcher treats them like rejected files, so alternates get picked)
// and writes a summary to catalog/cache/linkcheck.json for the doctor and HQ.
//   node scripts/linkcheck.js [--sample 150] [--minutes 11]
// Time budget: the nightly gives this step 15 minutes. On this PC a connection can take long to open, and 150
// requests at a 20 s timeout each could run 50 minutes, so the step used to die with ETIMEDOUT and nothing was
// written (18 Oct 2026). Now each request gets 8 s and one retry, and the run stops at the budget and writes
// what it has, marked partial, so the doctor and HQ always see a result.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const PROFILE = require('./lib/profile');
const SHOWS = path.join(PROFILE.catalogDir, 'shows');
const DEAD = path.join(PROFILE.catalogDir, 'dead-files.json');
const OUT = path.join(PROFILE.catalogDir, 'cache', 'linkcheck.json');
const args = process.argv.slice(2);
const SAMPLE = +(args[args.indexOf('--sample') + 1]) || 150;
const BUDGET_MS = (+(args[args.indexOf('--minutes') + 1]) || 11) * 60000;
const REQUEST_MS = 8000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const overBudget = () => Date.now() - t0 > BUDGET_MS;

const dead = fs.existsSync(DEAD) ? JSON.parse(fs.readFileSync(DEAD, 'utf8')) : {};
const files = [];
for (const f of fs.readdirSync(SHOWS)) {
  if (!f.endsWith('.json')) continue;
  let g; try { g = JSON.parse(fs.readFileSync(path.join(SHOWS, f), 'utf8')); } catch (e) { continue; }
  for (const se of g.seasons || []) for (const e of se.episodes || []) if (e.file && e.file.url) files.push({ show: g.show, slug: g.slug, key: e.file.item + '|' + e.file.name, url: e.file.url });
}
// deterministic-ish rotation: a different slice each night, by day number
const day = Math.floor(Date.now() / 864e5);
const start = files.length ? (day * SAMPLE) % files.length : 0;
const picks = files.slice(start, start + SAMPLE).concat(files.slice(0, Math.max(0, start + SAMPLE - files.length)));
// also re-test a few previously dead files so takedowns that come back are forgiven
const retest = Object.keys(dead).slice((day * 10) % Math.max(1, Object.keys(dead).length)).slice(0, 10);

let slow = 0; // requests that needed the retry or timed out twice
async function alive(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(REQUEST_MS) });
      if (r.status === 404 || r.status === 410 || r.status === 403) return false;
      return true; // 200/206/5xx/429 all count as alive: only a definite "gone" retires a file
    } catch (e) {
      slow++;
      if (attempt === 1) return true; // network trouble twice is still not a takedown
    }
  }
  return true;
}

(async () => {
  let checked = 0, newlyDead = [], revived = [], partial = false;
  for (const p of picks) {
    if (overBudget()) { partial = true; break; }
    checked++;
    const ok = await alive(p.url);
    if (!ok && !dead[p.key]) { dead[p.key] = { at: new Date().toISOString().slice(0, 10), show: p.show, slug: p.slug }; newlyDead.push(p.show + ' · ' + p.key.slice(0, 60)); console.log('DEAD ' + p.show + ': ' + p.key.slice(0, 80)); }
    await sleep(1000);
  }
  for (const key of retest) {
    if (overBudget()) { partial = true; break; }
    const d = dead[key]; const url = files.find((f) => f.key === key)?.url;
    if (!url) continue;
    if (await alive(url)) { delete dead[key]; revived.push(key); console.log('BACK ' + key.slice(0, 80)); }
    await sleep(1000);
  }
  fs.writeFileSync(DEAD, JSON.stringify(dead, null, 1));
  const minutes = Math.round((Date.now() - t0) / 6000) / 10;
  const summary = { at: new Date().toISOString(), checked, sample: picks.length, partial, minutes, slow, dead: newlyDead.length, deadTotal: Object.keys(dead).length, newlyDead: newlyDead.slice(0, 50), revived, population: files.length };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(summary, null, 1));
  console.log(`\nchecked ${checked} of ${files.length} files in ${minutes} min${partial ? ' (stopped at the time budget)' : ''}: ${newlyDead.length} newly dead, ${revived.length} back, ${Object.keys(dead).length} retired in all; ${slow} slow request(s)`);
  if (newlyDead.length) console.log('Affected shows will pick alternates on the next match (nightly or HQ > Re-match).');
})();
