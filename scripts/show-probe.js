// Show probe: checks each show in scripts/show-list.json against the Internet Archive and
// sorts it into WORKS / PARTIAL / NOT THERE by counting real episode and season uploads.
// Gentle on purpose: one search at a time, a pause between searches, long backoff when IA
// refuses (it rate-limits hard; see BUILD_PLAN deploy gotchas). Read-only, writes two files:
//   scripts/show-probe-results.json  (full detail, sample titles)
//   docs/SHOW_PROBE.md               (the readable table)
// Usage: node scripts/show-probe.js            (shows not probed yet; earlier results are kept)
//        node scripts/show-probe.js Seinfeld   (only names containing "Seinfeld")
//        node scripts/show-probe.js --fresh    (re-probe everything)
//        node scripts/show-probe.js --missing  (re-probe only shows last marked NOT THERE)
const fs = require('fs');
const path = require('path');
const PROFILE = require('./lib/profile');

const ROOT = path.join(__dirname, '..');
const LIST = JSON.parse(fs.readFileSync(PROFILE.listFile, 'utf8'));
const OUT_JSON = path.join(__dirname, 'show-probe-results.json');
const OUT_MD = path.join(PROFILE.docsDir, 'SHOW_PROBE.md');
const PAUSE_MS = 8000;
const BACKOFF_MS = [60000, 120000, 240000];
const ROWS = 200;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// The name a title must contain: drop a leading "the" and anything after a colon
// ("Batman: The Animated Series" still requires "batman the animated series").
function coreName(show) {
  return norm(show).replace(/^the /, '');
}

const EPISODE_RE = /\bs\s?\d{1,2}\s?e\s?\d{1,3}\b|\b\d{1,2}x\d{1,3}\b|\bepisode\s?\d{1,3}\b|\bep\s?\d{1,3}\b|\bseason \d{1,2} episode \d{1,3}\b/;
const SEASON_RE = /\bseason\s?\d{1,2}\b|\bs\s?\d{1,2}\b|\bcomplete (series|seasons?|collection)\b|\bseasons \d{1,2}\b|\bseries \d{1,2}\b|\bvol(ume)? \d{1,2}\b/;
const BROADCAST_RE = /\bvhs\b|\btv recording\b|\bbroadcast\b|\brecorded\b|\baired\b|\bairing\b/;
const JUNK_RE = /\bytp\b|youtube poop|audiosurf|\bpromo\b|commercial|trailer|interview|blooper|\breview\b|reaction|parody|fan ?made|\bclip\b|\bclips\b|theme song|\bopening\b|\bintro\b|tribute|behind the scenes|reunion|music video|\bamv\b|remix|\bcover\b|gameplay|lets play|\bgame\b|\blego\b|minecraft|roblox|soundtrack|podcast|\bmeme\b|\bsong\b|\bmp3\b|\bscript\b|\bpdf\b/;

function classify(title, core) {
  const t = norm(title);
  if (!t.includes(core)) return 'offtarget';
  if (JUNK_RE.test(t)) return 'junk';
  if (EPISODE_RE.test(t)) return 'episode';
  if (SEASON_RE.test(t)) return 'season';
  if (BROADCAST_RE.test(t)) return 'broadcast';
  return 'other';
}

async function search(show) {
  // Every word must appear in the title. A word with an apostrophe ("Rocko's", "'70s") becomes
  // a prefix wildcard on its first part, since IA indexes the apostrophe forms inconsistently.
  const words = show.toLowerCase().replace(/&/g, ' and ').replace(/’/g, "'")
    .split(/[^a-z0-9']+/).map((w) => w.replace(/^'+|'+$/g, '')).filter(Boolean)
    .map((w) => (w.includes("'") ? w.split("'")[0] + '*' : w)).filter((w) => w !== '*' && !['the', 'and', 'a'].includes(w));
  const q = `mediatype:movies AND title:(${words.join(' AND ')})`;
  const url = 'https://archive.org/advancedsearch.php?' + new URLSearchParams({
    q, 'fl[]': 'identifier', rows: String(ROWS), output: 'json', 'sort[]': 'downloads desc',
  }) + '&fl[]=title&fl[]=year&fl[]=downloads';
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(45000) });
      const text = await res.text();
      if (res.ok && text.trim().startsWith('{')) return JSON.parse(text).response;
      throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      if (attempt >= BACKOFF_MS.length) throw e;
      console.log(`  IA refused (${e.message}); waiting ${BACKOFF_MS[attempt] / 1000}s`);
      await sleep(BACKOFF_MS[attempt]);
    }
  }
}

function verdict(c) {
  if (c.season >= 2 || c.episode >= 10 || c.season + c.episode >= 8) return 'WORKS';
  if (c.season + c.episode >= 1 || c.broadcast >= 3) return 'PARTIAL';
  return 'NOT THERE';
}

async function main() {
  const args = process.argv.slice(2);
  const fresh = args.includes('--fresh');
  const redoMissing = args.includes('--missing');
  const filter = (args.find((a) => !a.startsWith('--')) || '').toLowerCase();
  const prior = !fresh && fs.existsSync(OUT_JSON) ? JSON.parse(fs.readFileSync(OUT_JSON, 'utf8')).results : [];
  // Keep earlier results only for shows still on the list; a removed show drops out of the table.
  const listed = new Set(LIST.shows.map((s) => s.name));
  const keep = (r) => r.verdict !== 'ERROR' && listed.has(r.show) && !(redoMissing && r.verdict === 'NOT THERE');
  const done = new Set(prior.filter(keep).map((r) => r.show));
  const results = prior.filter(keep);
  const jobs = [];
  const seen = new Set();
  for (const entry of LIST.shows) {
    const { name: show, type: group, network } = entry;
    if (seen.has(show)) continue;
    seen.add(show);
    if (filter ? show.toLowerCase().includes(filter) : !done.has(show)) jobs.push({ group, show, network });
  }
  // Earlier results carry no network and may predate a type change; refresh both from the list.
  for (const r of results) {
    const e = LIST.shows.find((s) => s.name === r.show);
    if (e) { r.group = e.type; r.network = e.network; }
  }
  console.log(`${jobs.length} shows to probe (${done.size} already done)`);
  if (filter) for (const j of jobs) { const k = results.findIndex((r) => r.show === j.show); if (k >= 0) results.splice(k, 1); }
  for (const [i, { group, show, network }] of jobs.entries()) {
    const core = coreName(show);
    let row;
    try {
      const r = await search(show);
      const counts = { episode: 0, season: 0, broadcast: 0, other: 0, junk: 0, offtarget: 0 };
      const samples = { episode: [], season: [], broadcast: [], other: [] };
      for (const d of r.docs) {
        const kind = classify(d.title, core);
        counts[kind]++;
        if (samples[kind] && samples[kind].length < 4) samples[kind].push(`${d.title} [${d.identifier}]`);
      }
      row = { group, network, show, found: r.numFound, scanned: r.docs.length, counts, verdict: verdict(counts), samples };
    } catch (e) {
      row = { group, network, show, error: e.message, verdict: 'ERROR' };
    }
    results.push(row);
    const c = row.counts || {};
    console.log(`[${i + 1}/${jobs.length}] ${row.verdict.padEnd(9)} ${show}  (ep ${c.episode ?? '-'}, seasons ${c.season ?? '-'}, broadcast ${c.broadcast ?? '-'}, found ${row.found ?? '-'})`);
    // Save after every show so an interrupted run keeps what it found.
    fs.writeFileSync(OUT_JSON, JSON.stringify({ probedAt: new Date().toISOString(), results }, null, 2));
    if (i < jobs.length - 1) await sleep(PAUSE_MS);
  }

  const order = { WORKS: 0, PARTIAL: 1, 'NOT THERE': 2, ERROR: 3 };
  const tally = results.reduce((a, r) => ((a[r.verdict] = (a[r.verdict] || 0) + 1), a), {});
  const lines = [
    '# Show Probe',
    '',
    `Probed ${new Date().toISOString().slice(0, 10)} against the Internet Archive. ${results.length} shows: ` +
      Object.entries(tally).map(([k, v]) => `${v} ${k}`).join(', ') + '.',
    '',
    'Counts come from the top ' + ROWS + ' title matches per show, sorted by downloads. Episode = a title with S01E02, 1x02 or "episode N". Season = a season or complete-series upload (one item often holds many episodes). Broadcast = taped-off-TV recordings. Junk (clips, promos, remixes) is excluded.',
    '',
    '| Verdict | Show | Type | Network | Episodes | Season packs | Broadcast | Example |',
    '|---|---|---|---|---|---|---|---|',
  ];
  for (const r of [...results].sort((a, b) => order[a.verdict] - order[b.verdict] || a.group.localeCompare(b.group) || a.show.localeCompare(b.show))) {
    const c = r.counts || {};
    const ex = r.samples ? (r.samples.season[0] || r.samples.episode[0] || r.samples.broadcast[0] || '') : r.error;
    lines.push(`| ${r.verdict} | ${r.show} | ${r.group} | ${r.network || ''} | ${c.episode ?? ''} | ${c.season ?? ''} | ${c.broadcast ?? ''} | ${String(ex || '').replace(/\|/g, '/').slice(0, 90)} |`);
  }
  fs.writeFileSync(OUT_MD, lines.join('\n') + '\n');
  console.log(`\nWrote ${path.relative(ROOT, OUT_JSON)} and ${path.relative(ROOT, OUT_MD)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
