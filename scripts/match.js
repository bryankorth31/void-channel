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
const writeRetry = (file, text) => { for (let a = 0; ; a++) { try { fs.writeFileSync(file, text); return; } catch (e) { if (a >= 4) throw e; const until = Date.now() + 150 * (a + 1); while (Date.now() < until) {} } } };
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LIST = JSON.parse(fs.readFileSync(path.join(__dirname, 'show-list.json'), 'utf8'));
const CAND_DIR = path.join(ROOT, 'catalog', 'candidates');
const CACHE_DIR = path.join(ROOT, 'catalog', 'cache');
const OUT_DIR = path.join(ROOT, 'catalog', 'shows');
const OUT_MD = path.join(ROOT, 'docs', 'COVERAGE.md');
const LIVE = 0.85, REVIEW = 0.5;
const REACT = /\b(reaction|reacts?|reacting|review|recap|commentary|breakdown|watch ?along|first time watching|normies|mark watches|group reaction|walkthrough|playthrough|gameplay|let'?s play|longplay|speedrun)\b/i;

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
const LANG_RISK = /\b(v ?f|s[ée]rie|la serie|dual[ .-]?audio|multi[ .-]?audio|multi|hindi|tamil|telugu|urdu|vegamovies|filmyzilla|filmywap|moviesflix|dubbed|dublado|latino|castellano|vf|vff|vfq|truefrench|french|vostfr|ita[ .-]eng|rus[ .-]eng|deutsch|german|espa[nñ]ol|italiano|portugu[eê]s)\b/i;
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
  const tv = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
  // Daily shows (The Price Is Right) come from TVmaze with no episode numbers: number them per season by air date.
  if (tv && tv.episodes && tv.episodes.some((e) => e.number == null)) {
    const counters = {};
    for (const e of [...tv.episodes].sort((a, b) => (a.airdate || '').localeCompare(b.airdate || ''))) { if (e.number == null) e.number = (counters[e.season] = (counters[e.season] || 0) + 1) + 10000; }
  }
  // ...and TVmaze sometimes repeats a season/number pair (specials, re-airs): later duplicates get unique high numbers
  if (tv && tv.episodes) { const seen = new Set(); let extra = 20000; for (const e of tv.episodes) { const k = e.season + 'x' + e.number; if (seen.has(k)) e.number = ++extra; seen.add(e.season + 'x' + e.number); } }
  return tv;
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
  const aliases = (ov.aliases || []).map(norm).filter(Boolean);
  const tv = loadTv(show);
  if (!tv || !tv.episodes.length) { const sg = selfGrid(entry, cand, ((OVERRIDES[slug(show)] || {}).aliases || []).map(norm).filter(Boolean)); if (sg) return sg; try { fs.unlinkSync(path.join(OUT_DIR, slug(show) + '.json')); } catch (_) {} /* a stale grid must not outlive the rule that rejected it */ return { show, type: entry.type, network: entry.network, noTvmaze: true }; }
  const showWords = norm(show).split(' ').filter((w) => !STOP.has(w));
  const core = norm(show).replace(/^the /, '');
  const namesShow = (txt) => { const t = norm(txt); return t.includes(core) || aliases.some((a) => t.includes(a)); };
  const idNamesShow = (id) => { const t = norm(id).replace(/ /g, ''); return t.includes(core.replace(/ /g, '')) || aliases.some((a) => t.includes(a.replace(/ /g, ''))); };
  const byKey = new Map(tv.episodes.map((e) => [`${e.season}x${e.number}`, e]));
  const ordered = [...tv.episodes].sort((a, b) => (a.airdate || '').localeCompare(b.airdate || '') || a.season - b.season || a.number - b.number);

  const assignments = new Map(); // key -> [{conf, file, item, reasons}]
  const push = (ep, entry) => { const key = `${ep.season}x${ep.number}`; const list = assignments.get(key) || []; assignments.set(key, list); list.push(entry); };
  for (const item of cand.items) {
    const itemText = `${item.title || ''} ${item.description || ''} ${item.id}`;
    const itemNamesMe = norm(itemText).includes(core) || norm(item.id).includes(core.replace(/ /g, ''));
    const itemNamesOther = namesOtherShow(item.title || '', show);
    const itemTitled = namesShow(item.title || '') || idNamesShow(item.id); // the upload itself says it is this show
    const unmatched = []; // episode-band files this item could not place by number or title
    for (const f of item.files) {
      // Files hunted before the show had a TVmaze runtime carry generic bands (half-hour, hour); re-band them now that we know the runtime.
      if (tv.runtime && f.seconds && !(f.band === 'episode' || f.band === 'double')) { const m = f.seconds / 60, rt = tv.runtime; f.band = m < 4 ? 'clip' : (m >= rt * 0.7 && m <= rt * 1.35) ? 'episode' : (m >= rt * 1.7 && m <= rt * 2.5) ? 'double' : m > rt * 4 ? 'block' : 'odd'; }
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
      // A title match alone must be a real title: one common word ("Water", "Food", "Music") in an
      // upload that does not name the show is how Tweenies ended up under Look Around You.
      const titleAlone = !namesShow(f.name) && !itemTitled;
      const strongTitle = best && norm(best.name).split(' ').filter((w) => !STOP.has(w) && w.length > 2).length >= 2;
      if (best && bestSim >= 0.6 && (!titleAlone || strongTitle)) {
        const existing = candidates.find((c) => c.ep === best);
        if (existing) { existing.base += bestSim >= 0.8 ? 0.3 : 0.15; existing.why += ' + title match'; }
        else candidates.push({ ep: best, base: bestSim >= 0.8 ? 0.5 : 0.3, why: `title ~ "${best.name}" (${bestSim.toFixed(2)})` });
      }
      if (!candidates.length) { if (f.band === 'episode' && !fileNamesOther) unmatched.push(f); continue; }
      for (const c of candidates) {
        let conf = c.base;
        if (f.nameHit) conf += 0.15; else if (itemNamesMe) conf += 0.1;
        conf += f.band === 'episode' ? 0.15 : 0.05;
        if (!namesShow(f.name) && !itemTitled) conf -= 0.5; // only the description mentioned us: a spin-off, a same-cast show, a dump
        // Reaction and review channels upload "S01E01 - Title - Group Reaction": the right name, the wrong video (B caught Sunny and FMA, 2026-10-14).
        if (REACT.test(f.name) || REACT.test(item.title || '')) conf -= 0.7;
        if (fileNamesOther) conf -= 0.6; else if (itemNamesOther && !namesShow(f.name)) conf -= 0.4; // "Star Trek" in the file is not "Star Trek: Enterprise"
        else if (!norm(f.name).includes(core) && !norm(item.title || '').includes(core) && bestSim < 0.3 && /[a-z]{4,}/.test(fp)) conf -= 0.45; // foreign title: words that are neither the show nor an episode
        const foreign = !!(langRisk(f.name) || langRisk(item.title));
        if (foreign) conf -= 0.35; // REVIEW, never LIVE, and the site hides it (a French dub is not the show)
        if (!f.playable) conf -= 0.1;
        conf = Math.max(0, Math.min(1, conf));
        if (process.env.MATCH_DEBUG) console.log(`  [debug] ${f.name.slice(0, 60)} -> ${c.ep.season}x${c.ep.number} conf ${conf.toFixed(2)} (${c.why}; band ${f.band}; names ${namesShow(f.name)}/${itemTitled}; other ${fileNamesOther}/${itemNamesOther})`);
        if (conf < REVIEW) continue;
        const risk = codecRisk(f.name, f.format, f.playable);
        push(c.ep, { conf: +conf.toFixed(2), why: c.why, item: item.id, itemTitle: item.title, file: f.file, name: f.name, url: f.url, seconds: f.seconds, format: f.format, playable: f.playable, codecRisk: risk || undefined, langRisk: foreign || undefined, sizeMB: f.sizeMB });
      }
    }
    // Sequence fallback: a DVD/season rip whose files carry no names ("Disc 1 10", "VTS_03_1").
    // If the ITEM names the show, holds 5+ unplaced episode-length files and no other show, offer
    // them in natural order as consecutive episodes of the season the item title suggests
    // (volume/season N, else 1) at REVIEW confidence. A human confirms with a glance.
    const titleNamesMe = itemTitled;
    if (titleNamesMe && !itemNamesOther && unmatched.length >= 5) {
      const m = /\b(?:season|series|volume|vol\.?)\s*(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\b/i.exec(item.title || '');
      const words = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
      const season = m ? (words[m[1].toLowerCase()] || +m[1]) : 1;
      const eps = tv.episodes.filter((e) => e.season === season).sort((a, b) => a.number - b.number);
      const sorted = [...unmatched].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      sorted.forEach((f, i) => {
        if (!eps[i]) return;
        const risk = codecRisk(f.name, f.format, f.playable);
        push(eps[i], { conf: 0.55, why: `sequence guess: file ${i + 1} of ${sorted.length} in "${String(item.title).slice(0, 40)}"`, item: item.id, itemTitle: item.title, file: f.file, name: f.name, url: f.url, seconds: f.seconds, format: f.format, playable: f.playable, codecRisk: risk || undefined, sizeMB: f.sizeMB });
      });
    }
  }

  const seasons = [];
  let live = 0, review = 0;
  for (const s of [...new Set(tv.episodes.map((e) => e.season))].sort((a, b) => a - b)) {
    const eps = tv.episodes.filter((e) => e.season === s).sort((a, b) => a.number - b.number).map((e) => {
      // A file that plays in a browser beats a cleaner-named one that will not; then confidence.
      // B's decisions from HQ (catalog/overrides.json): rejectFiles never show again; acceptFiles win the
      // episode outright at full confidence (he watched it play), even when the codec judge was unsure.
      const fkey = (p) => p.item + '|' + p.name;
      const rejected = new Set(ov.rejectFiles || []), accepted = new Set(ov.acceptFiles || []);
      let opts = (assignments.get(`${e.season}x${e.number}`) || []).filter((o) => !rejected.has(fkey(o))).sort((a, b) => (b.playable - a.playable) || b.conf - a.conf || b.sizeMB - a.sizeMB);
      const acc = opts.find((o) => accepted.has(fkey(o)));
      if (acc) { acc.conf = 1; acc.why = 'accepted in HQ | ' + acc.why; opts = [acc, ...opts.filter((o) => o !== acc)]; }
      const pick = opts[0] || null;
      const state = !pick ? 'MISSING' : (pick.conf >= LIVE && (pick.playable || acc === pick)) ? 'LIVE' : 'REVIEW';
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
  writeRetry(path.join(OUT_DIR, out.slug + '.json'), JSON.stringify(out, null, 2));
  return out;
}

// No TVmaze entry (web series, one-off documentaries, local shows): list the show from its own files.
// Only uploads that NAME the show count; S/E in filenames sets the order, the rest follow in name
// order as season 1. Everything is REVIEW: honest about where the order came from.
function selfGrid(entry, cand, aliases) {
  const show = entry.name;
  const core = norm(show).replace(/^the /, '').replace(/(.*?)/g, '').trim();
  if (core.length < 5 && core.split(' ').length < 2 && !aliases.length) return null; // 'Bu', 'Oz': too short a name to trust inside other titles
  const names = (t) => { const x = norm(t); return x.includes(core) || aliases.some((a) => x.includes(a)); };
  const showWords = norm(show).split(' ').filter((w) => !STOP.has(w));
  const JUNK = /(compilation|meme|mix|tribute|reaction|reacts?|review|best of|top d+|mashup|trailer|promo|commercial|ad|podcast|radio|audiobook|walkthrough|playthrough|gameplay|longplay|speedrun|recap|commentary|normies)/i;
  const items = cand.items.map((item) => {
    const t = norm(item.title || ''), idn = norm(item.id).replace(/ /g, '');
    const starts = t.startsWith(core) || t.startsWith('the ' + core) || idn.startsWith(core.replace(/ /g, ''));
    const named = names(item.title || '') || idn.includes(core.replace(/ /g, ''));
    const vids = item.files.filter((f) => f.seconds >= 90 && f.seconds <= 3 * 3600 && !langRisk(f.name) && !/(podcast|audiobook|walkthrough|playthrough|gameplay|longplay|speedrun|recap|commentary|normies)/i.test(f.name));
    const distinct = new Set(vids.map((f) => norm(f.name).replace(/(512kb|64kb|h264|h 264|mp4|mpeg4|hd|sd|720p|1080p|480p|ia)/g, '').trim())).size; // format variants count once
    const med = vids.length ? vids.map((f) => f.seconds).sort((a, b) => a - b)[vids.length >> 1] : 0;
    const net = norm(entry.network || '').replace(/ /g, '');
    const mentionsNet = !!net && net.length > 2 && (norm((item.title || '') + ' ' + item.id + ' ' + (Array.isArray(item.collection) ? item.collection.join(' ') : item.collection || '')).replace(/ /g, '').includes(net));
    return { item, starts, named, vids, distinct, med, mentionsNet };
  }).filter((x) => x.named && !langRisk(x.item.title) && !/[぀-ヿ㐀-鿿가-힯Ѐ-ӿ؀-ۿ]/.test(x.item.title || '') && !(JUNK.test((x.item.title || '') + ' ' + x.item.id) && !x.starts) && (x.starts || x.distinct >= 5)); // strict: the upload is titled as the show, or it is plainly a season of it
  if (!items.length) return null;
  // when some uploads name the network (channel101-yacht-rock), the ones that do not are someone else's Yacht Rock
  const netItems = items.filter((x) => x.mentionsNet); if (netItems.length) items.splice(0, items.length, ...netItems);
  // the anchor is the upload that looks most like a series; others join only if their episodes are the same shape
  items.sort((a, b) => b.vids.length - a.vids.length || b.starts - a.starts);
  const anchor = items[0];
  const kept = items.filter((x) => x === anchor || (x.med >= anchor.med * 0.5 && x.med <= anchor.med * 2));
  const files = [];
  for (const { item, vids } of kept) {
    for (const f of vids) {
      const risk = codecRisk(f.name, f.format, f.playable);
      files.push({ item: item.id, itemTitle: item.title, file: f.file, name: f.name, url: f.url, seconds: f.seconds, format: f.format, playable: f.playable, codecRisk: risk || undefined, sizeMB: f.sizeMB, ep: f.ep, conf: 0.6, why: 'self-listed: no TVmaze entry; order from the files' });
    }
  }
  if (files.length < 2) return null;
  const bySE = new Map(); const loose = [];
  for (const f of files) { if (f.ep && f.ep.episode) { const k = (f.ep.season || 1) + 'x' + f.ep.episode; const cur = bySE.get(k); if (!cur || (f.playable && !cur.playable) || (f.playable === cur.playable && (f.sizeMB || 0) > (cur.sizeMB || 0))) bySE.set(k, f); } else loose.push(f); }
  const seasons = {};
  for (const [k, f] of bySE) { const [se, ep] = k.split('x').map(Number); const nm = titlePart(f.name, showWords); (seasons[se] = seasons[se] || []).push({ number: ep, name: nm && /[a-z]{3,}/.test(nm) ? nm : ('Episode ' + ep), state: 'REVIEW', file: f, alternates: [] }); }
  loose.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const seen = new Set(); let next = (seasons[1] || []).reduce((m, e) => Math.max(m, e.number), 0);
  for (const f of loose) { const key = norm(f.name).replace(/(512kb|64kb|h264|h 264|mp4|mpeg4|hd|sd|720p|1080p|480p|ia)/g, '').trim(); if (seen.has(key)) continue; seen.add(key); next++; const nm = titlePart(f.name, showWords); (seasons[1] = seasons[1] || []).push({ number: next, name: nm && /[a-z]{3,}/.test(nm) ? nm : ('Episode ' + next), state: 'REVIEW', file: f, alternates: [] }); }
  const list = Object.keys(seasons).map(Number).sort((a, b) => a - b).map((se) => ({ season: se, episodes: seasons[se].sort((a, b) => a.number - b.number) }));
  const total = list.reduce((m, se) => m + se.episodes.length, 0);
  const out = { show, slug: slug(show), type: entry.type, network: entry.network, matchedAt: new Date().toISOString(), selfListed: true,
    tvmaze: { id: null, name: show, runtime: null, premiered: null, network: entry.network },
    coverage: { total, live: 0, review: total, missing: 0, pct: 100 }, seasons: list };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  writeRetry(path.join(OUT_DIR, out.slug + '.json'), JSON.stringify(out, null, 2));
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
  const partial = !!filter;
  const rows = [];
  for (const entry of LIST.shows) {
    if (filter && !entry.name.toLowerCase().includes(filter)) continue;
    const r = matchShow(entry);
    if (!r) continue;
    rows.push(r);
    if (r.noTvmaze) console.log(`${entry.name}: no TVmaze episode list`);
    else console.log(`${entry.name}: ${r.coverage.live} live, ${r.coverage.review} review, ${r.coverage.missing} missing of ${r.coverage.total} (${r.coverage.pct}%)`);
  }
  if (!partial) writeCoverage(rows); // a filtered run leaves the full report alone
  console.log(`\nWrote ${rows.length} grids to catalog/shows/ and docs/COVERAGE.md`);
}
main();
