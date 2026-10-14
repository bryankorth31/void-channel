// PEOPLE AND CONNECTIONS (X-Ray data). TMDB only; no Archive calls.
//   pass 1  every show with a TMDB record: aggregate credits (cast with headshots, characters and
//           episode counts; creators, writers, directors)
//   pass 2  --episodes: for shows that PLAY here, every season's per-episode credits: who directed
//           and wrote each episode and who guest-starred (the Amazon-X-Ray "in this scene" layer)
//   pass 3  --bios N: TMDB person records (biography, born/died, where) for the N best-connected people
// Then the connections graph restricted to OUR library: person -> other VoidTV shows, show -> shows
// that share people (main cast, makers AND guests). Every hop lands on something that plays here.
// Writes catalog/people/<slug>.json (per show), catalog/people-bios/<id>.json, catalog/graph.json.
// Usage: node scripts/people.js [--episodes] [--bios 4000] [--fresh]
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LIST = JSON.parse(fs.readFileSync(path.join(__dirname, 'show-list.json'), 'utf8'));
const ART = JSON.parse(fs.readFileSync(path.join(ROOT, 'catalog', 'art.json'), 'utf8'));
const CACHE_DIR = path.join(ROOT, 'catalog', 'cache');
const OUT_DIR = path.join(ROOT, 'catalog', 'people');
const BIO_DIR = path.join(ROOT, 'catalog', 'people-bios');
const SHOWS_DIR = path.join(ROOT, 'catalog', 'shows');
const GRAPH = path.join(ROOT, 'catalog', 'graph.json');
const IMG = 'https://image.tmdb.org/t/p/w185';
const env = fs.existsSync(path.join(ROOT, 'backend', '.env')) ? fs.readFileSync(path.join(ROOT, 'backend', '.env'), 'utf8') : '';
const TOKEN = (process.env.TMDB_READ_TOKEN || (env.match(/^TMDB_READ_TOKEN=(.+)$/m) || [])[1] || '').trim();
if (!TOKEN) { console.error('No TMDB_READ_TOKEN'); process.exit(1); }

const args = process.argv.slice(2);
const fresh = args.includes('--fresh');
const doEpisodes = args.includes('--episodes');
const bi = args.indexOf('--bios');
const BIOS = bi >= 0 ? (+args[bi + 1] || 3000) : 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slug = (s) => s.toLowerCase().replace(/&/g, ' and ').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/ /g, '-');
const CREW_JOBS = new Set(['Creator', 'Writer', 'Director', 'Executive Producer', 'Showrunner', 'Developed By', 'Original Music Composer', 'Teleplay', 'Story']);
const EP_JOBS = { Director: 'd', Writer: 'w', Teleplay: 'w', Story: 'w' };
const person = (c) => ({ id: c.id, name: c.name, photo: c.profile_path ? IMG + c.profile_path : null });

async function tmdb(p) {
  const url = 'https://api.themoviedb.org/3' + p;
  for (let a = 0; a < 5; a++) {
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + TOKEN, accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
    if (r.status === 429) { await sleep(2000 * (a + 1)); continue; }
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('HTTP ' + r.status);
    await sleep(220);
    return r.json();
  }
  throw new Error('rate limited');
}
async function cached(name, fn) {
  const cf = path.join(CACHE_DIR, name);
  if (fs.existsSync(cf)) return JSON.parse(fs.readFileSync(cf, 'utf8'));
  const v = await fn();
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cf, JSON.stringify(v === undefined ? null : v));
  return v;
}

async function creditsFor(tmdbId) {
  return cached(`tmdb-credits-${tmdbId}.json`, async () => {
    const [agg, det] = [await tmdb(`/tv/${tmdbId}/aggregate_credits`), await tmdb(`/tv/${tmdbId}`)];
    return { agg: agg || { cast: [], crew: [] }, creators: (det && det.created_by) || [] };
  });
}

// Per-episode credits for the seasons we actually have files for. Keyed "season x episode".
async function episodeCreditsFor(tmdbId, seasonNumbers) {
  const det = await cached(`tmdb-tv-${tmdbId}.json`, () => tmdb(`/tv/${tmdbId}`));
  if (!det) return {};
  const have = new Set((det.seasons || []).map((s) => s.season_number));
  const out = {};
  for (const n of seasonNumbers) {
    if (!have.has(n)) continue;
    const se = await cached(`tmdb-season-${tmdbId}-${n}.json`, () => tmdb(`/tv/${tmdbId}/season/${n}`));
    if (!se) continue;
    for (const ep of se.episodes || []) {
      const d = [], w = [], g = [], seen = new Set();
      for (const c of ep.crew || []) { const k = EP_JOBS[c.job]; if (!k || seen.has(k + c.id)) continue; seen.add(k + c.id); (k === 'd' ? d : w).push(person(c)); }
      for (const c of (ep.guest_stars || []).slice(0, 10)) g.push({ ...person(c), as: c.character || '' });
      if (d.length || w.length || g.length) out[`${n}x${ep.episode_number}`] = { d, w, g };
    }
  }
  return out;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const people = {}; // id -> { name, photo, shows: { slug: Set(roles) } }
  const add = (p, s, role) => { const e = people[p.id] = people[p.id] || { name: p.name, photo: p.photo, shows: {} }; (e.shows[s] = e.shows[s] || new Set()).add(role); if (!e.photo && p.photo) e.photo = p.photo; };
  let done = 0, skipped = 0, epShows = 0;
  for (const entry of LIST.shows) {
    const s = slug(entry.name);
    const a = ART[s];
    if (!a || !a.tmdbId) { skipped++; continue; }
    const outFile = path.join(OUT_DIR, s + '.json');
    let rec = (!fresh && fs.existsSync(outFile)) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : null;
    let dirty = false;
    if (!rec) {
      let c;
      try { c = await creditsFor(a.tmdbId); } catch (e) { console.log(`${entry.name}: ${e.message}`); continue; }
      const cast = (c.agg.cast || []).slice(0, 24).map((p) => ({
        ...person(p), character: (p.roles || []).map((r) => r.character).filter(Boolean).slice(0, 3).join(' / '), episodes: p.total_episode_count || 0,
      }));
      const crewMap = new Map();
      for (const p of c.creators) crewMap.set(p.id, { ...person(p), jobs: ['Creator'] });
      for (const p of c.agg.crew || []) {
        const jobs = (p.jobs || []).map((j) => j.job).filter((j) => CREW_JOBS.has(j));
        if (!jobs.length) continue;
        const e = crewMap.get(p.id) || { ...person(p), jobs: [] };
        for (const j of jobs) if (!e.jobs.includes(j)) e.jobs.push(j);
        e.episodes = Math.max(e.episodes || 0, p.total_episode_count || 0);
        crewMap.set(p.id, e);
      }
      const crew = [...crewMap.values()].sort((x, y) => (y.jobs.includes('Creator') - x.jobs.includes('Creator')) || (y.episodes || 0) - (x.episodes || 0)).slice(0, 16);
      rec = { show: entry.name, slug: s, tmdbId: a.tmdbId, cast, crew, fetchedAt: new Date().toISOString() };
      dirty = true; done++;
      if (done % 50 === 0) console.log(`  ${done} shows credited`);
    }
    if (doEpisodes && (!rec.episodes || fresh)) {
      const grid = fs.existsSync(path.join(SHOWS_DIR, s + '.json')) ? JSON.parse(fs.readFileSync(path.join(SHOWS_DIR, s + '.json'), 'utf8')) : null;
      const seasons = grid && grid.seasons ? grid.seasons.filter((se) => se.episodes.some((e) => e.file && e.file.playable)).map((se) => se.season) : [];
      if (seasons.length) {
        try { rec.episodes = await episodeCreditsFor(a.tmdbId, seasons); rec.episodesAt = new Date().toISOString(); dirty = true; epShows++; if (epShows % 25 === 0) console.log(`  ${epShows} shows with episode credits`); }
        catch (e) { console.log(`${entry.name} episodes: ${e.message}`); }
      }
    }
    if (dirty) fs.writeFileSync(outFile, JSON.stringify(rec, null, 1));
    for (const p of rec.cast) add(p, s, p.character || 'Cast');
    for (const p of rec.crew) add(p, s, p.jobs.join(', '));
    for (const ep of Object.values(rec.episodes || {})) {
      for (const p of ep.d) add(p, s, 'Director');
      for (const p of ep.w) add(p, s, 'Writer');
      for (const p of ep.g) add(p, s, 'Guest' + (p.as ? ': ' + p.as : ''));
    }
  }
  // Flatten roles; a guest who is also main cast reads as cast. Keep guests' role lists short.
  for (const p of Object.values(people)) for (const [s, roles] of Object.entries(p.shows)) {
    const r = [...roles]; const main = r.filter((x) => !x.startsWith('Guest'));
    p.shows[s] = (main.length ? main : r.slice(0, 2)).join(' / ');
  }
  // Graph: only people who connect two or more of our shows ride along (guests alone would be 100k+
  // one-show entries); everyone else is reachable from the show file they belong to.
  const connectors = Object.entries(people).filter(([, p]) => Object.keys(p.shows).length >= 2);
  const graphPeople = Object.fromEntries(connectors);
  const showLinks = {};
  for (const [id, p] of connectors) {
    const slugs = Object.keys(p.shows);
    for (const x of slugs) for (const y of slugs) if (x !== y) { (showLinks[x] = showLinks[x] || {}); (showLinks[x][y] = showLinks[x][y] || []).push(+id); }
  }
  fs.writeFileSync(GRAPH, JSON.stringify({ builtAt: new Date().toISOString(), people: graphPeople, showLinks }));
  console.log(`\n${done} shows credited this run, ${epShows} got episode credits (${skipped} without TMDB id). ${Object.keys(people).length} people seen, ${connectors.length} connect 2+ shows, ${Object.keys(showLinks).length} shows have connections. -> catalog/people/, catalog/graph.json`);
  const top = connectors.map(([id, p]) => [p.name, Object.keys(p.shows).length]).sort((a, b) => b[1] - a[1]).slice(0, 12);
  console.log('most connected: ' + top.map(([n, k]) => `${n} (${k})`).join(', '));

  if (BIOS) {
    fs.mkdirSync(BIO_DIR, { recursive: true });
    const want = connectors.sort((a, b) => Object.keys(b[1].shows).length - Object.keys(a[1].shows).length).slice(0, BIOS);
    let n = 0;
    for (const [id, p] of want) {
      const f = path.join(BIO_DIR, id + '.json');
      if (!fresh && fs.existsSync(f)) continue;
      let d;
      try { d = await cached(`tmdb-person-${id}.json`, () => tmdb(`/person/${id}`)); } catch (e) { console.log(`${p.name}: ${e.message}`); continue; }
      if (!d) continue;
      const bio = (d.biography || '').replace(/\s+/g, ' ').trim();
      fs.writeFileSync(f, JSON.stringify({ id: +id, name: d.name, photo: d.profile_path ? IMG + d.profile_path : p.photo, bio: bio.length > 900 ? bio.slice(0, 900).replace(/\s+\S*$/, '') + '…' : bio, born: d.birthday || null, died: d.deathday || null, place: d.place_of_birth || null, dept: d.known_for_department || null }));
      n++; if (n % 200 === 0) console.log(`  ${n} bios`);
    }
    console.log(`${n} bios fetched -> catalog/people-bios/ (${want.length} best-connected people covered)`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
