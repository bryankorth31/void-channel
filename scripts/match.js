// THE MATCH (builder stage 2): turn hunt candidates into an episode grid.
// For each show, every episode-shaped file from catalog/candidates/<slug>.json is scored
// against the show's TVmaze episode list: parsed S01E02 numbers, filename-vs-episode-title
// similarity, show name present, runtime band, and a penalty when the file or its item
// clearly belongs to a DIFFERENT show on our list ("right length, wrong show").
// The best file wins each (season, episode). Confidence sets the state:
//   >= 0.85 LIVE  |  >= 0.50 REVIEW  |  below: left out (kept in the candidates file).
// Writes catalog/shows/<slug>.json (the grid the site will read) and docs/COVERAGE.md.
// No network. Usage: node scripts/match.js [name substring]
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LIST = JSON.parse(fs.readFileSync(path.join(__dirname, 'show-list.json'), 'utf8'));
const CAND_DIR = path.join(ROOT, 'catalog', 'candidates');
const CACHE_DIR = path.join(ROOT, 'catalog', 'cache');
const OUT_DIR = path.join(ROOT, 'catalog', 'shows');
const OUT_MD = path.join(ROOT, 'docs', 'COVERAGE.md');
const LIVE = 0.85, REVIEW = 0.5;

function norm(s) {
  return String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}
function slug(s) { return norm(s).replace(/ /g, '-'); }
const STOP = new Set(['the', 'a', 'an', 'and', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'is', 'it', 'part']);
const QUALITY_RE = /\b(\d{3,4}p|x26[45]|h ?26[45]|hevc|aac|ac3|dvdrip|webrip|web dl|hdtv|bluray|bdrip|xvid|divx|mp4|mkv|avi|proper|repack|internal|uncut|uncensored|dual audio|multi|eng|english|sub(bed|s)?|dub(bed)?|fine cut|rough cut|complete|season|episode|ep|disc|dvd|vhs|rip|hq|lq|remaster(ed)?)\b/g;

function bigrams(s) { const out = new Set(); for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2)); return out; }
function dice(a, b) {
  if (!a || !b) return 0;
  const A = bigrams(a), B = bigrams(b); let hit = 0;
  for (const g of A) if (B.has(g)) hit++;
  return (2 * hit) / (A.size + B.size);
}
// Strip the show name, S/E tokens, quality tags and numbers from a filename stem to leave the
// part that might be an episode title.
function titlePart(stem, showWords) {
  let t = norm(stem.split('/').pop());
  for (const w of showWords) t = t.replace(new RegExp(`\\b${w}\\b`, 'g'), ' ');
  t = t.replace(/\bs\d{1,2}\s?e\d{1,3}\b|\b\d{1,2}x\d{1,3}\b|\b\d{3,4}\b/g, ' ').replace(QUALITY_RE, ' ');
  return t.replace(/\s+/g, ' ').trim();
}
function tokens(s) { return norm(s).split(' ').filter((w) => w && !STOP.has(w)); }

// Episode-title similarity: Dice on the cleaned strings, boosted by whole-token overlap.
function titleSim(filePart, epName) {
  const e = norm(epName);
  if (!filePart || !e) return 0;
  const d = dice(filePart.replace(/ /g, ''), e.replace(/ /g, ''));
  const ft = new Set(tokens(filePart)), et = tokens(e);
  const overlap = et.length ? et.filter((w) => ft.has(w)).length / et.length : 0;
  return Math.max(d, overlap * 0.95);
}

// Browser playability from the filename: browsers decode H.264/AAC in mp4/webm; they do not
// decode Dolby Digital / DTS audio (silent picture) and often not HEVC/x265 video. The Archive's
// metadata rarely says the codec, but release names almost always do.
const AUDIO_RISK = /\b(dd ?5[. ]?1|dd ?2[. ]?0|ddp?\d|dd\+|e-?ac-?3|ac-?3|dts(-hd)?(-ma)?|truehd|atmos|flac)\b/i;
const VIDEO_RISK = /\b(x ?265|hevc|h[. ]?265|10 ?bit|av1|xvid|divx)\b/i;
// Dual-audio and foreign-dub rips: the browser plays whichever track comes first, often not English.
const LANG_RISK = /\b(dual[ .-]?audio|multi[ .-]?audio|multi|hindi|tamil|telugu|urdu|vegamovies|filmyzilla|filmywap|moviesflix|dubbed|dublado|latino|castellano|vf|vff|vfq|truefrench|french|vostfr|ita[ .-]eng|rus[ .-]eng|deutsch|german|espa[nñ]ol|italiano|portugu[eê]s)\b/i;
// Release names use . _ - as separators; underscores are word characters, so normalize before testing.
const tagText = (s) => String(s || '').replace(/[._\-\[\]()]+/g, ' ');
const langRisk = (s) => LANG_RISK.test(tagText(s));
function codecRisk(name, format, playable) {
  const t = tagText(name);
  if (!playable) return 'container (' + format + ')';
  if (AUDIO_RISK.test(t)) return 'audio (' + t.match(AUDIO_RISK)[0] + ')';
  if (VIDEO_RISK.test(t)) return 'video (' + t.match(VIDEO_RISK)[0] + ')';
  return null;
}

function loadTv(show) {
  const f = path.join(CACHE_DIR, 'tvmaze-' + slug(show) + '.json');
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
}

// Does this text name a DIFFERENT show from our list? (right length, wrong show guard)
const OTHER_SHOWS = LIST.shows.map((s) => ({ name: s.name, core: norm(s.name).replace(/^the /, '') })).filter((s) => s.core.split(' ').length >= 2 || s.core.length >= 6);
function namesOtherShow(text, show) {
  const t = norm(text), me = norm(show).replace(/^the /, '');
  return OTHER_SHOWS.some((o) => o.core !== me && !me.includes(o.core) && !o.core.includes(me) && t.includes(o.core));
}

const OVERRIDES = fs.existsSync(path.join(ROOT, 'catalog', 'overrides.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT, 'catalog', 'overrides.json'), 'utf8')) : {};
function matchShow(entry) {
  const show = entry.name;
  const cf = path.join(CAND_DIR, slug(show) + '.json');
  if (!fs.existsSync(cf)) return null;
  const cand = JSON.parse(fs.readFileSync(cf, 'utf8'));
  const ov = OVERRIDES[slug(show)] || {};
  if (ov.excludeItems) cand.items = cand.items.filter((it) => !ov.excludeItems.includes(it.id));
  const tv = loadTv(show);
  if (!tv || !tv.episodes.length) return { show, type: entry.type, network: entry.network, noTvmaze: true };
  const showWords = norm(show).split(' ').filter((w) => !STOP.has(w));
  const core = norm(show).replace(/^the /, '');
  const byKey = new Map(tv.episodes.map((e) => [`${e.season}x${e.number}`, e]));
  const ordered = [...tv.episodes].sort((a, b) => (a.airdate || '').localeCompare(b.airdate || '') || a.season - b.season || a.number - b.number);

  const assignments = new Map(); // key -> [{conf, file, item, reasons}]
  const push = (ep, entry) => { const key = `${ep.season}x${ep.number}`; const list = assignments.get(key) || []; assignments.set(key, list); list.push(entry); };
  for (const item of cand.items) {
    const itemText = `${item.title || ''} ${item.description || ''} ${item.id}`;
    const itemNamesMe = norm(itemText).includes(core) || norm(item.id).includes(core.replace(/ /g, ''));
    const itemNamesOther = namesOtherShow(item.title || '', show);
    const unmatched = []; // episode-band files this item could not place by number or title
    for (const f of item.files) {
      if (!(f.band === 'episode' || f.band === 'double')) continue;
      const fileNamesOther = namesOtherShow(f.name, show);
      const fp = titlePart(f.name, showWords);
      let candidates = [];
      // 1. S/E in the filename
      if (f.ep && f.ep.season != null && byKey.has(`${f.ep.season}x${f.ep.episode}`)) {
        candidates.push({ ep: byKey.get(`${f.ep.season}x${f.ep.episode}`), base: 0.6, why: 'S/E in filename' });
      } else if (f.ep && f.ep.season == null && f.ep.episode >= 1 && f.ep.episode <= ordered.length) {
        candidates.push({ ep: ordered[f.ep.episode - 1], base: 0.4, why: 'absolute episode number' });
      }
      // 2. Title similarity (best episode by name)
      let best = null, bestSim = 0;
      for (const e of tv.episodes) { const s = titleSim(fp, e.name); if (s > bestSim) { bestSim = s; best = e; } }
      if (best && bestSim >= 0.6) {
        const existing = candidates.find((c) => c.ep === best);
        if (existing) { existing.base += bestSim >= 0.8 ? 0.3 : 0.15; existing.why += ' + title match'; }
        else candidates.push({ ep: best, base: bestSim >= 0.8 ? 0.5 : 0.3, why: `title ~ "${best.name}" (${bestSim.toFixed(2)})` });
      }
      if (!candidates.length) { if (f.band === 'episode' && !fileNamesOther) unmatched.push(f); continue; }
      for (const c of candidates) {
        let conf = c.base;
        if (f.nameHit) conf += 0.15; else if (itemNamesMe) conf += 0.1;
        conf += f.band === 'episode' ? 0.15 : 0.05;
        if (fileNamesOther) conf -= 0.6; else if (itemNamesOther && !f.nameHit) conf -= 0.4;
        else if (!norm(f.name).includes(core) && !norm(item.title || '').includes(core) && bestSim < 0.3 && /[a-z]{4,}/.test(fp)) conf -= 0.45; // foreign title: words that are neither the show nor an episode
        const foreign = !!(langRisk(f.name) || langRisk(item.title));
        if (foreign) conf -= 0.35; // REVIEW, never LIVE, and the site hides it (a French dub is not the show)
        if (!f.playable) conf -= 0.1;
        conf = Math.max(0, Math.min(1, conf));
        if (conf < REVIEW) continue;
        const risk = codecRisk(f.name, f.format, f.playable);
        push(c.ep, { conf: +conf.toFixed(2), why: c.why, item: item.id, itemTitle: item.title, file: f.file, name: f.name, url: f.url, seconds: f.seconds, format: f.format, playable: !risk, codecRisk: risk || undefined, langRisk: foreign || undefined, sizeMB: f.sizeMB });
      }
    }
    // Sequence fallback: a DVD/season rip whose files carry no names ("Disc 1 10", "VTS_03_1").
    // If the ITEM names the show, holds 5+ unplaced episode-length files and no other show, offer
    // them in natural order as consecutive episodes of the season the item title suggests
    // (volume/season N, else 1) at REVIEW confidence. A human confirms with a glance.
    const titleNamesMe = norm(item.title || '').includes(core);
    if (titleNamesMe && !itemNamesOther && unmatched.length >= 5) {
      const m = /\b(?:season|series|volume|vol\.?)\s*(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\b/i.exec(item.title || '');
      const words = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
      const season = m ? (words[m[1].toLowerCase()] || +m[1]) : 1;
      const eps = tv.episodes.filter((e) => e.season === season).sort((a, b) => a.number - b.number);
      const sorted = [...unmatched].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      sorted.forEach((f, i) => {
        if (!eps[i]) return;
        const risk = codecRisk(f.name, f.format, f.playable);
        push(eps[i], { conf: 0.55, why: `sequence guess: file ${i + 1} of ${sorted.length} in "${String(item.title).slice(0, 40)}"`, item: item.id, itemTitle: item.title, file: f.file, name: f.name, url: f.url, seconds: f.seconds, format: f.format, playable: !risk, codecRisk: risk || undefined, sizeMB: f.sizeMB });
      });
    }
  }

  const seasons = [];
  let live = 0, review = 0;
  for (const s of [...new Set(tv.episodes.map((e) => e.season))].sort((a, b) => a - b)) {
    const eps = tv.episodes.filter((e) => e.season === s).sort((a, b) => a.number - b.number).map((e) => {
      // A file that plays in a browser beats a cleaner-named one that will not; then confidence.
      const opts = (assignments.get(`${e.season}x${e.number}`) || []).sort((a, b) => (b.playable - a.playable) || b.conf - a.conf || b.sizeMB - a.sizeMB);
      const pick = opts[0] || null;
      const state = !pick ? 'MISSING' : (pick.conf >= LIVE && pick.playable) ? 'LIVE' : 'REVIEW';
      if (pick && !pick.playable) pick.why += ` | not browser-playable: ${pick.codecRisk}`;
      if (state === 'LIVE') live++; else if (state === 'REVIEW') review++;
      return { number: e.number, name: e.name, airdate: e.airdate, state, file: pick, alternates: opts.slice(1, 4) };
    });
    seasons.push({ season: s, episodes: eps });
  }
  const total = tv.episodes.length;
  const out = {
    show, slug: slug(show), type: entry.type, network: entry.network, matchedAt: new Date().toISOString(),
    tvmaze: { id: tv.id, name: tv.name, runtime: tv.runtime, premiered: tv.premiered, network: tv.network },
    coverage: { total, live, review, missing: total - live - review, pct: Math.round(((live + review) / total) * 100) },
    seasons,
  };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, out.slug + '.json'), JSON.stringify(out, null, 2));
  return out;
}

function writeCoverage(rows) {
  const have = rows.filter((r) => r && !r.noTvmaze).sort((a, b) => b.coverage.pct - a.coverage.pct || a.show.localeCompare(b.show));
  const lines = ['# Coverage', '', `${have.length} shows matched to TVmaze episode lists. LIVE = confident file for that episode; REVIEW = a file that needs a look; MISSING = no file found yet.`, '',
    '| Show | Row | Episodes | Live | Review | Missing | Covered |', '|---|---|---|---|---|---|---|'];
  for (const r of have) lines.push(`| ${r.show} | ${r.type} | ${r.coverage.total} | ${r.coverage.live} | ${r.coverage.review} | ${r.coverage.missing} | ${r.coverage.pct}% |`);
  const none = rows.filter((r) => r && r.noTvmaze);
  if (none.length) lines.push('', 'No TVmaze match (needs a manual episode list): ' + none.map((r) => r.show).join(', '));
  fs.writeFileSync(OUT_MD, lines.join('\n') + '\n');
}

function main() {
  const filter = (process.argv[2] || '').toLowerCase();
  const rows = [];
  for (const entry of LIST.shows) {
    if (filter && !entry.name.toLowerCase().includes(filter)) continue;
    const r = matchShow(entry);
    if (!r) continue;
    rows.push(r);
    if (r.noTvmaze) console.log(`${entry.name}: no TVmaze episode list`);
    else console.log(`${entry.name}: ${r.coverage.live} live, ${r.coverage.review} review, ${r.coverage.missing} missing of ${r.coverage.total} (${r.coverage.pct}%)`);
  }
  writeCoverage(rows);
  console.log(`\nWrote ${rows.length} grids to catalog/shows/ and docs/COVERAGE.md`);
}
main();
