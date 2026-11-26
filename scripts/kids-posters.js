// KIDS POSTERS: self-hosted artwork for a profile with features.tmdbImages off (voidtv.net kids). A child's device must
// make no third-party requests beyond the video itself (docs/KIDS.md section 3), so each show's TMDB poster is
// downloaded once, here, into <profile>/site-assets/posters/<slug>.jpg; scripts/site.js serves that folder at
// /assets/kids/posters/ and the cards use it (no file: a generated colour tile with the show's name).
// Where the poster comes from: the profile's catalog art.json (scripts/art.js) when it has the show, then VOIDtv's own
// catalog/art.json (the shows that already play there carry no tmdb id in the kids list), otherwise TMDB's
// /tv/<id> for the list entry's "tmdb" id, with TMDB_READ_TOKEN from backend/.env (read, never printed). In a git
// worktree without its own backend/.env, the main checkout's is used.
// Images only, no video; no Archive calls. Shows with a matched grid go first, then the rest of the list.
// Usage: VOID_PROFILE=kids node scripts/kids-posters.js [--limit N] [--force] [name substring]
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const PROFILE = require('./lib/profile');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const li = args.indexOf('--limit');
const LIMIT = li >= 0 ? +args[li + 1] : Infinity;
const FORCE = args.includes('--force');
const FILTER = args.filter((a, i) => !a.startsWith('--') && (li < 0 || i !== li + 1)).join(' ').toLowerCase();
const OUT = path.join(PROFILE.dir, 'site-assets', 'posters');
const IMG = 'https://image.tmdb.org/t/p/w342';

if (PROFILE.features.tmdbImages) { console.error(PROFILE.name + ' loads TMDB images directly (features.tmdbImages is on); nothing to self-host'); process.exit(1); }
const readJson = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return d; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Same slug as scripts/art.js and the match, so the file name lines up with the catalog's shows/<slug>.json.
const slug = (s) => s.toLowerCase().replace(/&/g, ' and ').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/ /g, '-').replace(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/, '$1-show');

function token() {
  if (process.env.TMDB_READ_TOKEN) return process.env.TMDB_READ_TOKEN.trim();
  const places = [path.join(ROOT, 'backend', '.env')];
  try { places.push(path.join(path.dirname(path.resolve(ROOT, execSync('git rev-parse --git-common-dir', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim())), 'backend', '.env')); } catch (e) { /* not a git checkout */ }
  for (const p of places) { if (!fs.existsSync(p)) continue; const m = fs.readFileSync(p, 'utf8').match(/^TMDB_READ_TOKEN=(.+)$/m); if (m) return m[1].trim(); }
  return '';
}

// Retries rate limits and dropped connections (image.tmdb.org drops some from here); gives up after four tries.
async function get(url, headers) {
  let last = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    let r;
    try { r = await fetch(url, { headers, signal: AbortSignal.timeout(20000) }); } catch (e) { last = e; await sleep(1500 * (attempt + 1)); continue; }
    if (r.status === 429) { last = new Error('rate limited'); await sleep(2000 * (attempt + 1)); continue; }
    return r;
  }
  throw last || new Error('no response');
}

(async () => {
  const LIST = readJson(PROFILE.listFile, { shows: [] });
  const ART = { ...readJson(path.join(ROOT, 'catalog', 'art.json'), {}), ...readJson(path.join(PROFILE.catalogDir, 'art.json'), {}) };
  const grids = new Set((fs.existsSync(path.join(PROFILE.catalogDir, 'shows')) ? fs.readdirSync(path.join(PROFILE.catalogDir, 'shows')) : []).map((f) => f.replace(/\.json$/, '')));
  // Approved films (list.json "films", 26 Nov 2026): the poster their own catalog file names (catalog/movies/*.json), as movie-<tmdb>.
  const MOV = path.join(PROFILE.catalogDir, 'movies');
  const filmPoster = {};
  for (const f of (fs.existsSync(MOV) ? fs.readdirSync(MOV) : []).filter((x) => x.endsWith('.json'))) { const m = readJson(path.join(MOV, f), null); if (m && m.tmdbId && m.poster) filmPoster['movie-' + m.tmdbId] = m.poster; }
  for (const f of (LIST.films || []).filter((x) => x && x.approved === true && x.tmdb)) if (filmPoster['movie-' + f.tmdb]) ART['movie-' + f.tmdb] = { poster: filmPoster['movie-' + f.tmdb] };
  const films = (LIST.films || []).filter((x) => x && x.approved === true && x.tmdb).map((x) => ({ e: { name: x.title || 'movie ' + x.tmdb }, slug: 'movie-' + x.tmdb }));
  const todo = LIST.shows.map((e) => ({ e, slug: slug(e.name) })).concat(films)
    .filter((x) => !FILTER || x.e.name.toLowerCase().includes(FILTER))
    .filter((x) => FORCE || !fs.existsSync(path.join(OUT, x.slug + '.jpg')))
    .sort((a, b) => grids.has(b.slug) - grids.has(a.slug))
    .slice(0, LIMIT);
  if (!todo.length) { console.log('Every show already has a poster in ' + path.relative(ROOT, OUT)); return; }
  fs.mkdirSync(OUT, { recursive: true });
  let TOKEN = null; let got = 0; const none = [];
  for (const { e, slug: sl } of todo) {
    try {
      let url = ART[sl] && ART[sl].poster ? ART[sl].poster.replace(/\/t\/p\/[^/]+\//, '/t/p/w342/') : null;
      if (!url) {
        if (!e.tmdb) { none.push(e.name + ' (no tmdb id)'); continue; }
        if (TOKEN === null) { TOKEN = token(); if (!TOKEN) { console.error('No TMDB_READ_TOKEN in backend/.env (or the environment)'); process.exit(1); } }
        const r = await get('https://api.themoviedb.org/3/tv/' + e.tmdb, { Authorization: 'Bearer ' + TOKEN, accept: 'application/json' });
        if (!r.ok) { none.push(e.name + ' (TMDB ' + r.status + ')'); continue; }
        const d = await r.json();
        if (!d.poster_path) { none.push(e.name + ' (no poster on TMDB)'); continue; }
        url = IMG + d.poster_path;
        await sleep(250);
      }
      if (!/^https:\/\/image\.tmdb\.org\//.test(url)) { none.push(e.name + ' (not a TMDB image)'); continue; }
      const r = await get(url, {});
      const type = r.headers.get('content-type') || '';
      const buf = Buffer.from(await r.arrayBuffer());
      if (!r.ok || !/^image\/jpe?g/.test(type) || buf.length < 2000) { none.push(e.name + ' (image ' + r.status + ' ' + type + ')'); continue; }
      fs.writeFileSync(path.join(OUT, sl + '.jpg'), buf);
      got++; console.log(e.name + ' -> posters/' + sl + '.jpg (' + Math.round(buf.length / 1024) + ' KB)');
      await sleep(250);
    } catch (err) { none.push(e.name + ' (' + err.message + ')'); }
  }
  console.log(got + ' poster' + (got === 1 ? '' : 's') + ' saved to ' + path.relative(ROOT, OUT) + (none.length ? '; none for: ' + none.join(', ') : ''));
})();
