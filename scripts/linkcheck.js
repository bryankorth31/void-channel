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
const rotation = files.slice(start, start + SAMPLE).concat(files.slice(0, Math.max(0, start + SAMPLE - files.length)));
// Trivia's clip, picture and sound questions play these files on a big screen in front of a room, so they go first: a slice of
// them each night (--trivia, 75 by default; about 1,300 files, so each is asked again within about 18 nights), and the question bank
// (scripts/trivia/bank.js) drops a retired one on its next build. Before this, a file trivia used came up in the rotation once in
// more than a year, and the hand check found a clip whose Archive item had gone dark (plan T5, 21 Nov 2026). voidtv only.
const TRIVIA_SAMPLE = args.includes('--trivia') ? +(args[args.indexOf('--trivia') + 1]) || 0 : 75;
function triviaUrls() {
  const dir = path.join(ROOT, 'trivia', 'bank'); const urls = new Set();
  if (PROFILE.name !== 'voidtv' || !fs.existsSync(dir)) return urls;
  for (const f of fs.readdirSync(dir).filter((x) => /^(tv|movies)-\d+\.json$/.test(x))) {
    let j; try { j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { continue; }
    for (const q of (Array.isArray(j) ? j : j.questions || [])) if (q.media && q.media.url) urls.add(q.media.url.split('#')[0]);
  }
  return urls;
}
const tUrls = triviaUrls();
// Files the shows list does not hold (the TV movie clips) are named the same way, item|file name without its extension.
const known = new Set(files.map((f) => f.url));
const fromUrl = (u) => { const m = u.match(/\/download\/([^/]+)\/(.+)$/); if (!m) return null; const name = decodeURIComponent(m[2]).replace(/\.[^./]+$/, ''); return { show: 'TV movie', slug: '', key: m[1] + '|' + name, url: u }; };
const tFiles = files.filter((f) => tUrls.has(f.url)).concat([...tUrls].filter((u) => !known.has(u)).map(fromUrl).filter(Boolean)).sort((a, b) => a.key.localeCompare(b.key));
const tStart = tFiles.length ? (day * TRIVIA_SAMPLE) % tFiles.length : 0;
const tPicks = TRIVIA_SAMPLE ? tFiles.slice(tStart, tStart + TRIVIA_SAMPLE).concat(tFiles.slice(0, Math.max(0, tStart + TRIVIA_SAMPLE - tFiles.length))) : [];
const picks = [...new Map([...tPicks, ...rotation].map((f) => [f.key, f])).values()];
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

// A whole Archive item taken down (dark): one dead file often means the whole upload is gone, and the matcher and the
// question bank would only swap in another file from the same dead item (trivia's hand check, 21 Nov 2026: a "Dragons: Race
// to the Edge" upload went dark and the bank moved to its other episodes, all 403). So for each item with a dead file the
// Archive is asked once whether the item itself is gone; if it is, every file of it is retired together.
const itemAsked = new Set();
async function itemGone(item) {
  try {
    const r = await fetch('https://archive.org/metadata/' + encodeURIComponent(item), { signal: AbortSignal.timeout(REQUEST_MS) });
    if (!r.ok) return false;
    const j = await r.json();
    return !!(j && (j.is_dark || (j.created && !j.metadata) || (j.metadata === undefined && Object.keys(j).length === 0)));
  } catch (e) { return false; } // trouble asking is not a takedown
}
async function retireItem(item, at, newlyDead) {
  if (itemAsked.has(item)) return; itemAsked.add(item);
  if (!(await itemGone(item))) return;
  let n = 0;
  for (const f of files.concat(tFiles)) {
    if (!f.key.startsWith(item + '|') || dead[f.key]) continue;
    dead[f.key] = { at, show: f.show, slug: f.slug, why: 'the whole item was taken down' }; n++;
  }
  if (n) { newlyDead.push(item + ' · the whole item, ' + n + ' more file(s)'); console.log('DEAD ITEM ' + item + ': ' + n + ' more file(s) retired with it'); }
  await sleep(1000);
}

(async () => {
  let checked = 0, newlyDead = [], revived = [], partial = false;
  const at = new Date().toISOString().slice(0, 10);
  for (const p of picks) {
    if (overBudget()) { partial = true; break; }
    checked++;
    const ok = await alive(p.url);
    if (!ok && !dead[p.key]) { dead[p.key] = { at, show: p.show, slug: p.slug }; newlyDead.push(p.show + ' · ' + p.key.slice(0, 60)); console.log('DEAD ' + p.show + ': ' + p.key.slice(0, 80)); }
    if (!ok) await retireItem(p.key.split('|')[0], at, newlyDead);
    await sleep(1000);
  }
  // The items already on the list are asked too (one request each), so files of a dark item that were never sampled go now.
  for (const key of Object.keys(dead)) {
    if (overBudget()) { partial = true; break; }
    await retireItem(key.split('|')[0], at, newlyDead);
  }
  for (const key of retest) {
    if (overBudget()) { partial = true; break; }
    const d = dead[key]; const url = (files.find((f) => f.key === key) || tFiles.find((f) => f.key === key))?.url;
    if (!url) continue;
    if (await alive(url)) { delete dead[key]; revived.push(key); console.log('BACK ' + key.slice(0, 80)); }
    await sleep(1000);
  }
  fs.writeFileSync(DEAD, JSON.stringify(dead, null, 1));
  const minutes = Math.round((Date.now() - t0) / 6000) / 10;
  const summary = { at: new Date().toISOString(), checked, sample: picks.length, trivia: tPicks.length, triviaFiles: tFiles.length, partial, minutes, slow, dead: newlyDead.length, deadTotal: Object.keys(dead).length, newlyDead: newlyDead.slice(0, 50), revived, population: files.length };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(summary, null, 1));
  console.log(`\nchecked ${checked} of ${files.length} files in ${minutes} min${partial ? ' (stopped at the time budget)' : ''}: ${newlyDead.length} newly dead, ${revived.length} back, ${Object.keys(dead).length} retired in all; ${slow} slow request(s)`);
  if (newlyDead.length) console.log('Affected shows will pick alternates on the next match (nightly or HQ > Re-match).');
})();
