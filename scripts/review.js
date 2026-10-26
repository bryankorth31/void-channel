// THE SHOW REVIEW, step 2: score every Live TV series and write catalog/cache/review/review.json (B, 26 Oct 2026; plan:
// chief-of-staff/plans/PLAN-voidtv-show-review.md). Reads what scripts/review-fetch.js gathered (catalog/cache/review/),
// voidtv.net's own viewers from the analytics store (90 days, cached in catalog/cache/review/viewers.json), the show files,
// catalog/review-settings.json (weights and lines B can change) and catalog/review-calls.json (B's own Keep and Go, which
// always win). The rules are in scripts/lib/review.js.
// Usage: node scripts/review.js              (scores; viewers from the cache when under a day old)
//        node scripts/review.js --viewers    (ask the analytics store again first)
//        node scripts/review.js --page <file>   (also write the review page there)
//        node scripts/review.js --apply [--dry]   (B's calls into catalog/live-tv-off.json; --dry only reports)
const fs = require('fs');
const path = require('path');
const PROFILE = require('./lib/profile');
const R = require('./lib/review');

const CAT = PROFILE.catalogDir, DIR = path.join(CAT, 'cache', 'review');
const readJson = (f, fb) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return fb; } };
const argOf = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] || '' : null; };

// voidtv.net's own viewers per show, 90 days: minutes watched (one tick a minute) and how many people watched.
async function viewers() {
  const f = path.join(DIR, 'viewers.json'), old = readJson(f, null);
  if (old && !process.argv.includes('--viewers') && Date.now() - Date.parse(old.at) < 864e5) return old.shows;
  const cfa = require('./lib/cfa');
  if (!cfa.configured()) { console.log('viewers: analytics not configured, none counted'); return (old && old.shows) || {}; }
  const rows = await cfa.sql("SELECT blob2 AS slug, blob1 AS type, SUM(_sample_interval) AS n, COUNT(DISTINCT blob13) AS s FROM voidtv_events WHERE timestamp > NOW() - INTERVAL '90' DAY AND blob1 IN ('play', 'tick') AND blob2 != '' GROUP BY slug, type LIMIT 20000");
  const shows = {};
  for (const r of rows) { const o = (shows[r.slug] = shows[r.slug] || { minutes: 0, watchers: 0 }); if (r.type === 'tick') o.minutes += +r.n; else o.watchers = Math.max(o.watchers, +r.s); }
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(f, JSON.stringify({ at: new Date().toISOString(), days: 90, shows }));
  return shows;
}

// The Live TV series and the channels each one is on, as the site builds them. The review lists a show B sent off (so he
// can change his mind); with everywhere set, the channels are counted as the site will build them.
function live(everywhere) {
  const app = require('./lib/app');
  const A = app.assemble();
  const L = readJson(PROFILE.listFile, { shows: [] });
  const lang = Object.fromEntries(L.shows.map((s) => [s.name, s.language]));
  const foreign = new Set(A.shows.filter((s) => lang[s.show] && lang[s.show] !== 'en').map((s) => s.slug));
  const OFF = readJson(path.join(CAT, 'live-tv-off.json'), { shows: {} }).shows || {};
  const off = new Set(Object.keys(OFF).filter((k) => !OFF[k].everywhere || everywhere));
  const offAll = everywhere ? new Set(Object.keys(OFF).filter((k) => OFF[k].everywhere)) : null;
  const { lists } = app.channelLists(A.shows, A.types, off, foreign, offAll);
  const bySlug = new Map(A.shows.map((s) => [s.slug, s]));
  const out = new Map();
  for (const c of lists) for (const s of c.list) {
    if (s.slug.startsWith('movie-')) continue;
    if (!out.has(s.slug)) out.set(s.slug, { site: bySlug.get(s.slug), channels: [] });
    out.get(s.slug).channels.push(c.name);
  }
  return { shows: out, channels: lists.map((c) => ({ name: c.name, kind: c.kind, n: c.list.length })) };
}

// B's calls to Live TV: each Go joins catalog/live-tv-off.json marked everywhere (off every channel, network ones too; it
// stays on demand); a show B now keeps leaves the list again if the review put it there. Prints the channels that would
// disappear or be left with under 5 shows, so they are named before anything is published. Writes nothing with --dry.
function apply() {
  const calls = readJson(path.join(CAT, 'review-calls.json'), {});
  const file = path.join(CAT, 'live-tv-off.json'), OFF = readJson(file, { shows: {} });
  const before = live(true).channels;
  const names = Object.fromEntries(require('./lib/app').assemble().shows.map((s) => [s.slug, s.show]));
  let added = 0, removed = 0;
  for (const [slug, c] of Object.entries(calls)) {
    const cur = OFF.shows[slug];
    if (c.call === 'go' && !(cur && cur.everywhere)) { OFF.shows[slug] = { show: names[slug] || slug, note: 'show review: Go (B, ' + String(c.at || '').slice(0, 10) + ')', everywhere: true }; added++; }
    if (c.call === 'keep' && cur && cur.everywhere && /^show review/.test(cur.note || '')) { delete OFF.shows[slug]; removed++; }
  }
  const dry = process.argv.includes('--dry');
  const old = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, JSON.stringify(OFF, null, 2) + '\n');
  const after = live(true).channels;
  if (dry) fs.writeFileSync(file, old);
  const by = Object.fromEntries(after.map((c) => [c.name, c.n]));
  const thin = before.filter((c) => !(c.name in by) || by[c.name] < 5).map((c) => c.name + ': ' + c.n + ' shows -> ' + (by[c.name] || 'gone'));
  console.log((dry ? 'would add ' : 'added ') + added + ' Go, ' + (dry ? 'would remove ' : 'removed ') + removed + '; channels ' + before.length + ' -> ' + after.length);
  if (thin.length) console.log('thin or gone:\n  ' + thin.join('\n  '));
}

async function main() {
  if (process.argv.includes('--apply')) return apply();
  const { shows, channels } = live();
  const own = await viewers();
  const tm = readJson(path.join(DIR, 'tmdb.json'), {}), tv = readJson(path.join(DIR, 'tvmaze.json'), {});
  const wd = readJson(path.join(DIR, 'wikidata.json'), {}), vw = readJson(path.join(DIR, 'views.json'), {});
  const settings = readJson(path.join(CAT, 'review-settings.json'), {}), calls = readJson(path.join(CAT, 'review-calls.json'), {});
  const input = [...shows.keys()].map((slug) => {
    const grid = readJson(path.join(CAT, 'shows', slug + '.json'), null);
    const site = shows.get(slug).site;
    return { slug, type: site.type || '', network: site.network || '', tmdb: tm[slug], tvmaze: tv[slug], wiki: wd[slug], views: vw[slug], ours: own[slug], files: R.fileFacts(shows.get(slug).site, grid) };
  });
  const scored = R.score(input, settings, calls);
  const rows = scored.map((r) => {
    const s = shows.get(r.slug).site;
    return { slug: r.slug, show: s.show, year: s.year || '', type: s.type || '', network: s.network || '', eps: s.eps, channels: shows.get(r.slug).channels,
      scores: r.scores, call: r.call, auto: r.auto, byB: r.byB, reason: r.reason, facts: r.facts };
  }).sort((a, b) => (b.scores.blend == null ? -1 : b.scores.blend) - (a.scores.blend == null ? -1 : a.scores.blend));
  const count = (k) => rows.filter((r) => r.call === k).length;
  const out = { builtAt: new Date().toISOString(), settings: Object.assign({}, R.DEFAULTS, settings), counts: { keep: count('keep'), look: count('look'), go: count('go') }, channels, shows: rows };
  fs.writeFileSync(path.join(DIR, 'review.json'), JSON.stringify(out));
  console.log(rows.length, 'series scored: keep', out.counts.keep, ', look', out.counts.look, ', go', out.counts.go, '-> catalog/cache/review/review.json');
  const page = argOf('--page');
  if (page) {
    const tpl = fs.readFileSync(path.join(__dirname, 'review-page.html'), 'utf8');
    fs.writeFileSync(page, tpl.replace('/*DATA*/', 'const REVIEW=' + JSON.stringify(out).replace(/</g, '\\u003c') + ';'));
    console.log('page ->', page);
  }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
