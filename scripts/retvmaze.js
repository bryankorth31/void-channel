// RE-TVMAZE: rebuild TVmaze caches for shows whose hunt ran while tvmaze() was broken (2026-10-14: an
// undeclared variable made every uncached lookup return null, so 796 shows were hunted without an
// episode list). API-only (no Archive calls), polite to TVmaze (20 req / 10 s). Then run match.js.
//   node scripts/retvmaze.js [catalog/cache/retvmaze.json]     (a JSON array of slugs; default: all
//   candidates files with tvmaze null and no cache)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const PROFILE = require('./lib/profile');
const CACHE = path.join(PROFILE.catalogDir, 'cache');
const LIST = JSON.parse(fs.readFileSync(PROFILE.listFile, 'utf8'));
const OVERRIDES = JSON.parse(fs.readFileSync(path.join(PROFILE.catalogDir, 'overrides.json'), 'utf8'));
const norm = (s) => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const slug = (s) => norm(s).replace(/ /g, '-');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const bySlug = new Map(LIST.shows.map((s) => [slug(s.name), s]));

let slugs;
const arg = process.argv[2];
if (arg && fs.existsSync(arg)) slugs = JSON.parse(fs.readFileSync(arg, 'utf8'));
else slugs = fs.readdirSync(path.join(PROFILE.catalogDir, 'candidates')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5))
  .filter((s) => { try { return !JSON.parse(fs.readFileSync(path.join(PROFILE.catalogDir, 'candidates', s + '.json'), 'utf8')).tvmaze && !fs.existsSync(path.join(CACHE, 'tvmaze-' + s + '.json')); } catch (e) { return false; } });

async function get(url) { const r = await fetch(url, { signal: AbortSignal.timeout(20000) }); if (r.status === 429) { await sleep(5000); return get(url); } if (!r.ok) return null; return r.json(); }
async function cast(id) {
  const c = (await get(`https://api.tvmaze.com/shows/${id}/cast`)) || [];
  const names = [];
  for (const x of c.slice(0, 4)) { if (x.person && x.person.name) names.push(x.person.name); if (x.character && x.character.name) names.push(x.character.name); }
  return [...new Set(names)].filter((n) => n.split(' ').length >= 2 && !/^(self|himself|herself|various|narrator|host)$/i.test(n));
}
// Same guard as hunt.js: the hit must share most of its words with our title, else a web series gets a stranger's episodes.
function similar(a, b) { const bag = (t) => new Set(norm(t).replace(/^the /, '').split(' ').filter((w) => w.length > 2)); const A = bag(a), B = bag(b); if (!A.size || !B.size) return false; let hit = 0; for (const w of A) if (B.has(w)) hit++; return hit / Math.max(A.size, B.size) >= 0.6; }

(async () => {
  let ok = 0, miss = 0, skip = 0;
  for (const s of slugs) {
    const entry = bySlug.get(s); if (!entry) { skip++; continue; }
    const ov = OVERRIDES[s] || {};
    try {
      let show = ov.tvmazeId ? await get(`https://api.tvmaze.com/shows/${ov.tvmazeId}`) : await get('https://api.tvmaze.com/singlesearch/shows?q=' + encodeURIComponent(entry.name.replace(/[^\w\s'&!.-]/g, ' ').replace(/\s+/g, ' ').trim()));
      await sleep(600);
      if (!show || (!ov.tvmazeId && !similar(entry.name, show.name))) { miss++; console.log(`${entry.name}: no TVmaze match${show ? ' (nearest: ' + show.name + ')' : ''}`); continue; }
      const eps = (await get(`https://api.tvmaze.com/shows/${show.id}/episodes`)) || [];
      await sleep(600);
      const out = { id: show.id, name: show.name, runtime: show.runtime || show.averageRuntime || null, premiered: show.premiered || null, network: ((show.network || show.webChannel || {}).name) || null,
        episodes: eps.map((e) => ({ season: e.season, number: e.number, name: e.name, airdate: e.airdate, runtime: e.runtime })), cast: await cast(show.id) };
      await sleep(600);
      fs.writeFileSync(path.join(CACHE, 'tvmaze-' + s + '.json'), JSON.stringify(out));
      ok++; console.log(`${entry.name}: ${show.name} (${show.premiered || '?'}) ${out.episodes.length} episodes`);
    } catch (e) { miss++; console.log(`${entry.name}: error ${e.message}`); }
  }
  console.log(`\nTVmaze caches written: ${ok}; no match: ${miss}; not on the list: ${skip}. Now run: node scripts/match.js`);
})();
