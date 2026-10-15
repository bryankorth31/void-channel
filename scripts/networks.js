// NETWORK SWEEPS: for the networks VoidTV cares about, pull TMDB's full list of their series from
// 1990 on (discover by network, every page) and report what is NOT on scripts/show-list.json yet,
// grouped by network with the row it would land in. New categories fall out of the TMDB genres we
// see a lot of and do not have a row for. TMDB only; no Archive calls.
// Usage: node scripts/networks.js            report -> catalog/network-sweep.json, docs/NETWORKS.md
//        node scripts/networks.js --add      add every missing 1990+ show to show-list.json (kids excluded)
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PROFILE = require('./lib/profile');
const LIST_PATH = path.join(__dirname, 'show-list.json');
const LIST = JSON.parse(fs.readFileSync(LIST_PATH, 'utf8'));
const env = fs.existsSync(path.join(ROOT, 'backend', '.env')) ? fs.readFileSync(path.join(ROOT, 'backend', '.env'), 'utf8') : '';
const TOKEN = (process.env.TMDB_READ_TOKEN || (env.match(/^TMDB_READ_TOKEN=(.+)$/m) || [])[1] || '').trim();
if (!TOKEN) { console.error('No TMDB_READ_TOKEN'); process.exit(1); }

// TMDB network id -> [name, default row, cutoff year (Classic TV below it)]
const NETWORKS = {
  49: ['HBO', 'Drama'], 67: ['Showtime', 'Drama'], 88: ['FX', 'Drama'], 174: ['AMC', 'Drama'], 30: ['USA Network', 'Drama'], 41: ['TNT', 'Drama'], 77: ['Syfy', 'Sci-Fi, Fantasy and Horror'],
  359: ['Cinemax', 'Late Night'], 318: ['Starz', 'Drama'], 71: ['The CW', 'Drama'], 21: ['The WB', 'Drama'], 1024: ['Prime Video', 'Streaming Era'], 213: ['Netflix', 'Streaming Era'], 453: ['Hulu', 'Streaming Era'], 2739: ['Disney+', 'Streaming Era'], 3186: ['HBO Max', 'Streaming Era'], 2552: ['Apple TV+', 'Streaming Era'], 3353: ['Peacock', 'Streaming Era'], 4330: ['Paramount+', 'Streaming Era'],
  80: ['Adult Swim', 'Adult Swim'], 56: ['Cartoon Network', 'Animated'], 47: ['Comedy Central', '2000s and Later Sitcoms'], 33: ['MTV', 'MTV'], 158: ['VH1', 'MTV'], 13: ['Nickelodeon', 'Animated'], 44: ['Disney Channel', 'Animated'],
  6: ['NBC', '2000s and Later Sitcoms'], 16: ['CBS', 'Drama'], 2: ['ABC', 'Drama'], 19: ['FOX', '2000s and Later Sitcoms'], 4: ['BBC One', 'British and Beyond'], 332: ['BBC Two', 'British and Beyond'], 26: ['Channel 4', 'British and Beyond'], 9: ['ITV', 'British and Beyond'], 3: ['BBC Three', 'British and Beyond'], 23: ['CBC', 'British and Beyond'], 1101: ['Comedy Network', 'British and Beyond'],
  65: ['History', 'Documentary & Geographic'], 64: ['Discovery', 'Documentary & Geographic'], 84: ['TLC', 'Documentary & Geographic'], 43: ['National Geographic', 'Documentary & Geographic'], 14: ['PBS', 'Documentary & Geographic'], 37: ['Bravo', 'Reality & Talk'], 74: ['Food Network', 'Reality & Talk'], 143: ['Travel Channel', 'Documentary & Geographic'], 384: ['Animal Planet', 'Documentary & Geographic'], 54: ['Spike', 'Reality & Talk'], 32: ['Lifetime', 'Drama'], 1089: ['Hallmark Channel', 'Drama'],
};
const KIDS_GENRE = 10762;
const GENRE_NAMES = { 10759: 'Action & Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime', 99: 'Documentary', 18: 'Drama', 10751: 'Family', 10762: 'Kids', 9648: 'Mystery', 10763: 'News', 10764: 'Reality', 10765: 'Sci-Fi & Fantasy', 10766: 'Soap', 10767: 'Talk', 10768: 'War & Politics', 37: 'Western' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

async function tmdb(p, params = {}) {
  const url = 'https://api.themoviedb.org/3' + p + '?' + new URLSearchParams(params);
  for (let a = 0; a < 5; a++) {
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + TOKEN, accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
    if (r.status === 429) { await sleep(2000 * (a + 1)); continue; }
    if (!r.ok) throw new Error('HTTP ' + r.status);
    await sleep(200);
    return r.json();
  }
  throw new Error('rate limited');
}

// A show's row: the network's default, nudged by genre; pre-1990 goes behind the Classic TV door.
function rowFor(show, netRow) {
  const year = +(show.first_air_date || '').slice(0, 4);
  const g = new Set(show.genre_ids || []);
  if (year && year < 1990) return 'Classic TV';
  if (g.has(16)) return netRow === 'Adult Swim' ? 'Adult Swim' : 'Animated';
  if (g.has(99)) return 'Documentary & Geographic';
  if (g.has(10764) || g.has(10767)) return 'Reality & Talk';
  if (g.has(10765) && netRow !== 'Streaming Era') return 'Sci-Fi, Fantasy and Horror';
  if (g.has(35) && !g.has(18) && netRow === 'Drama') return year >= 2000 ? '2000s and Later Sitcoms' : '90s Sitcoms';
  if (show.origin_country && show.origin_country.length && !show.origin_country.some((c) => ['US'].includes(c)) && show.original_language === 'en' && netRow !== 'Streaming Era') return 'British and Beyond';
  if (show.original_language && show.original_language !== 'en') return show.original_language === 'ja' && g.has(16) ? 'Anime' : 'World TV';
  return netRow;
}

async function main() {
  const add = process.argv.includes('--add');
  const have = new Set(LIST.shows.map((s) => norm(s.name)));
  const found = {}; // tmdbId -> show
  const perNet = {};
  for (const [id, [name, row]] of Object.entries(NETWORKS)) {
    let page = 1, total = 1, n = 0;
    while (page <= total && page <= 25) {
      let r;
      try { r = await tmdb('/discover/tv', { with_networks: id, sort_by: 'popularity.desc', 'first_air_date.gte': '1990-01-01', page, include_null_first_air_dates: 'false' }); } catch (e) { console.log(`${name}: ${e.message}`); break; }
      total = r.total_pages || 1;
      for (const s of r.results || []) {
        if (!s.name || !s.first_air_date) continue;
        if ((s.genre_ids || []).includes(KIDS_GENRE) || (s.genre_ids || []).includes(10763)) continue; // adult app: no kids shows; news is a hard exclude
        if (!found[s.id]) { found[s.id] = { ...s, networks: [name], row: rowFor(s, row) }; n++; } else found[s.id].networks.push(name);
      }
      page++;
    }
    perNet[name] = n;
    process.stdout.write(`${name}: ${n} shows  `);
  }
  console.log();
  const missing = Object.values(found).filter((s) => !have.has(norm(s.name)));
  // Categories we see a lot of but do not have a row or collection for
  const genreTally = {};
  for (const s of missing) for (const g of s.genre_ids || []) genreTally[GENRE_NAMES[g] || g] = (genreTally[GENRE_NAMES[g] || g] || 0) + 1;
  const byNet = {};
  for (const s of missing) (byNet[s.networks[0]] = byNet[s.networks[0]] || []).push(s);

  fs.writeFileSync(path.join(PROFILE.catalogDir, 'network-sweep.json'), JSON.stringify({ sweptAt: new Date().toISOString(), networks: perNet, missing: missing.map((s) => ({ tmdbId: s.id, name: s.name, year: s.first_air_date.slice(0, 4), network: s.networks[0], row: s.row, genres: (s.genre_ids || []).map((g) => GENRE_NAMES[g] || g), votes: s.vote_count, rating: s.vote_average, language: s.original_language, overview: s.overview })) }, null, 1));
  const md = [`# Network sweeps — ${Object.keys(found).length} series on ${Object.keys(NETWORKS).length} networks (TMDB, 1990+, no kids); ${missing.length} not on the list yet`, '', `Swept ${new Date().toISOString().slice(0, 16)}. Run \`node scripts/networks.js --add\` to add them all, or copy names into show-list.json.`, '',
    '## Genres among the missing (candidate categories)', '', ...Object.entries(genreTally).sort((a, b) => b[1] - a[1]).map(([g, n]) => `- ${g}: ${n}`), ''];
  for (const [net, list] of Object.entries(byNet).sort((a, b) => b[1].length - a[1].length)) {
    md.push(`## ${net} — ${list.length} missing`, '', '| Show | Year | Row | Genres | Votes |', '|---|---|---|---|---|');
    for (const s of list.sort((a, b) => b.vote_count - a.vote_count).slice(0, 80)) md.push(`| ${s.name} | ${s.first_air_date.slice(0, 4)} | ${s.row} | ${(s.genre_ids || []).map((g) => GENRE_NAMES[g] || g).join(', ')} | ${s.vote_count} |`);
    if (list.length > 80) md.push(`| … and ${list.length - 80} more | | | | |`);
    md.push('');
  }
  fs.writeFileSync(path.join(ROOT, 'docs', 'NETWORKS.md'), md.join('\n'));
  console.log(`${missing.length} missing of ${Object.keys(found).length} -> docs/NETWORKS.md`);

  if (add) {
    let n = 0;
    for (const s of missing) { if (!LIST.types.includes(s.row)) continue; LIST.shows.push({ name: s.name, type: s.row, network: s.networks[0], language: s.original_language !== 'en' ? s.original_language : undefined, added: new Date().toISOString().slice(0, 10), source: 'network-sweep' }); have.add(norm(s.name)); n++; }
    fs.writeFileSync(LIST_PATH, JSON.stringify(LIST, null, 1));
    console.log(`added ${n} shows to show-list.json (now ${LIST.shows.length})`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
