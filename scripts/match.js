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
const PROFILE = require('./lib/profile');
const { writeIfChanged } = require('./lib/writeIfChanged');
const LIST = JSON.parse(fs.readFileSync(PROFILE.listFile, 'utf8'));
const CAND_DIR = path.join(PROFILE.catalogDir, 'candidates');
const CACHE_DIR = path.join(PROFILE.catalogDir, 'cache');
const OUT_DIR = path.join(PROFILE.catalogDir, 'shows');
const OUT_MD = path.join(PROFILE.docsDir, 'COVERAGE.md');
const LIVE = 0.85, REVIEW = 0.5;
const REACT = /\b(reaction|reacts?|reacting|review|recap|commentary|breakdown|watch ?along|first time watching|normies|mark watches|group reaction|walkthrough|playthrough|gameplay|let'?s play|longplay|speedrun)\b/i;

function norm(s) {
  return String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}
// A date in a file name ("2008.08.08", "2011-03-10", "03.10.2011") is the surest key a talk or daily show offers.
function fileDate(t) {
  let m = /(?:^|\D)((?:19|20)\d{2})[.\-_ ](\d{1,2})[.\-_ ](\d{1,2})(?:\D|$)/.exec(t || '');
  if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
  m = /(?:^|\D)(\d{1,2})[.\-_ ](\d{1,2})[.\-_ ]((?:19|20)\d{2})(?:\D|$)/.exec(t || '');
  if (m) return m[3] + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0');
  return null;
}
function slug(s) { return norm(s).replace(/ /g, '-').replace(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/, '$1-show'); }
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
// "Show.mp4" and "Show_512kb.mp4" are one episode in two formats: strip the format tags from normalised text and count them once.
const FORMAT_TAGS = /\b(512kb|64kb|h264|h 264|mp4|mpeg4|hd|sd|720p|1080p|480p|ia)\b/g;
const variantKey = (name) => norm(name).replace(FORMAT_TAGS, ' ').replace(/\s+/g, ' ').trim();

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
// Only list titles of two or more words and six or more letters count. A one-word title ("Season", "Family", "Collection",
// "Extras") is also an ordinary word in file names, and a show called "The Season" had turned every "Season 2" into a wrong show.
// Matching is by whole words on normalised text, after "Season N", SxxEyy and quality tags are taken out of the text, and a
// title that holds one of those words could never match, so it is not listed.
const NOISE_RE = /\bseasons? \d{1,2}\b|\bs\d{1,2} ?e\d{1,3}\b|\b\d{1,2}x\d{1,3}\b/g;
const forOtherShow = (text) => ' ' + norm(text).replace(NOISE_RE, ' ').replace(QUALITY_RE, ' ').replace(/\s+/g, ' ').trim() + ' ';
function makeOtherShows(shows) {
  const seen = new Set();
  return shows.map((s) => ({ name: s.name, core: norm(s.name).replace(/^the /, '') }))
    .filter((o) => o.core.split(' ').length >= 2 && o.core.replace(/[^a-z]/g, '').length >= 6 && forOtherShow(o.core) === ' ' + o.core + ' ' && !seen.has(o.core) && seen.add(o.core))
    .map((o) => ({ ...o, needle: ' ' + o.core + ' ' }));
}
const OTHER_SHOWS = makeOtherShows(LIST.shows);
// One is the other, or contains it as whole words ("star trek" and "star trek enterprise" are one family, not a wrong show).
const sameWords = (a, b) => a === b || (' ' + a + ' ').includes(' ' + b + ' ') || (' ' + b + ' ').includes(' ' + a + ' ');
// The titles of other shows (not this one, not its aliases, not its family) that the text names. `aliases` are normalised;
// `list` is the detector's list of titles (makeOtherShows), the whole show list unless a test or self-test passes its own.
function otherShowCores(text, show, aliases = [], list = OTHER_SHOWS) {
  const t = forOtherShow(text), mine = [norm(show).replace(/^the /, ''), ...aliases];
  return list.filter((o) => t.includes(o.needle) && !mine.some((m) => sameWords(o.core, m))).map((o) => o.core);
}
function namesOtherShow(text, show, aliases = [], list = OTHER_SHOWS) { return otherShowCores(text, show, aliases, list).length > 0; }
// Other names a show goes by, for the matcher's own tests. catalog/overrides.json aliases (set from HQ) add to these.
const BUILTIN_ALIASES = { 'forensic-files': ['Medical Detectives'] }; // Forensic Files began as Medical Detectives; both are on the list

const OVERRIDES = fs.existsSync(path.join(PROFILE.catalogDir, 'overrides.json')) ? JSON.parse(fs.readFileSync(path.join(PROFILE.catalogDir, 'overrides.json'), 'utf8')) : {};
// Re-read per show: HQ rewrites the file while long matches run, and a decision made mid-run should count.
const DEAD_FILE = path.join(PROFILE.catalogDir, 'dead-files.json');
function readDead() { try { return JSON.parse(fs.readFileSync(DEAD_FILE, 'utf8')); } catch (e) { return {}; } } // linkcheck.js retires files the Archive no longer serves
function readOverrides() { try { return JSON.parse(fs.readFileSync(path.join(PROFILE.catalogDir, 'overrides.json'), 'utf8')); } catch (e) { return OVERRIDES; } }
// ---- The self-list fallback: what it may take, and why the strict pass turned files away ----
// Every episode-band file the strict loop sees gets one tag:
//   placed          the strict pass placed it (an option for some episode at REVIEW or better)
//   no-match        episode-shaped, but no S/E, airdate or title in it fits the TVmaze list
//   other-show      it, or its item, names a different show on our list
//   reaction        a reaction, review, recap or walkthrough
//   foreign         a dub or another language
//   not-named       neither the file nor its item title names the show
//   before-premiere dated before the show existed
//   wrong-length    outside the episode and double-episode bands
// The fallback may use only 'placed' and 'no-match' files: the other tags are reasons that still hold when a looser matcher looks again.
// 'wrong-length' is the exception: the strict pass skipped those files before reading their names, and its bands are only a guess when TVmaze
// gives no runtime (a 3-minute web episode is a 'clip'), so the fallback judges them again, by the runtime band when there is one and by name.
function rejectionTag(why) { return why.other ? 'other-show' : why.react ? 'reaction' : why.foreign ? 'foreign' : why.notNamed ? 'not-named' : 'no-match'; }

// Words that make an upload something other than an episode. Always tested on norm()ed text: Archive names join words with
// underscores, and an underscore is a word character, so a boundary never shows up in the raw name. The show's own name is
// taken out first, so a show called "Best of the Worst" or "Radio Free Roscoe" does not reject itself.
const JUNK_ITEM = /\b(compilation|meme|mix|tribute|reaction|reacts?|review|best of|top \d+|mashup|trailer|promo|commercial|ad|podcast|radio|audiobook|walkthrough|playthrough|gameplay|longplay|speedrun|recap|commentary|normies|extras?|bonus disc|behind the scenes|deleted scenes?|featurettes?|bloopers?|gag reel|outtakes?|making of)\b/i;
const JUNK_FILE = /\b(podcast|audiobook|walkthrough|playthrough|gameplay|longplay|speedrun|recap|commentary|normies|extras?|bonus disc|behind the scenes|deleted scenes?|featurettes?|bloopers?|gag reel|outtakes?|making of)\b/i;
const EXTRAS = /\b(extras?|bonus|behind the scenes|deleted scenes?|featurettes?|bloopers?|gag reel|promos?|trailers?|interviews?|outtakes?|making of|commentary)\b/i;
function stripShow(text, cores) { let t = ' ' + norm(text) + ' '; for (const c of cores || []) if (c) t = t.split(' ' + c + ' ').join('  '); return t.replace(/\s+/g, ' ').trim(); }
const isJunkItem = (text, cores) => JUNK_ITEM.test(stripShow(text, cores));
const isJunkFile = (name, cores) => JUNK_FILE.test(stripShow(name, cores));
const isExtras = (text, cores) => EXTRAS.test(stripShow(text, cores));
// Inside the TVmaze runtime band: the same single-episode and double-episode bands the strict pass cuts files into.
function inRuntimeBand(seconds, runtimeMin) {
  if (!(seconds > 0) || !(runtimeMin > 0)) return false;
  const m = seconds / 60;
  return (m >= runtimeMin * 0.7 && m <= runtimeMin * 1.35) || (m >= runtimeMin * 1.7 && m <= runtimeMin * 2.5);
}
// The small number in a file name once the show name, S/E, years and quality tags are taken out ("Parker's Puzzle (7)" gives 7).
function episodeNumberOf(name, cores) {
  const t = stripShow(name, cores).replace(/\bs\d{1,2}\s?e\d{1,3}\b|\b\d{1,2}x\d{1,3}\b|\b(?:19|20)\d{2}\b/g, ' ').replace(QUALITY_RE, ' ');
  const m = /\b(\d{1,3})\b/.exec(t);
  return m ? +m[1] : null;
}
const hasSeasonEpisode = (f) => !!(f.ep && f.ep.season != null && f.ep.episode != null);
// The files the fallback may list for a show TVmaze knows: items whose TITLE names the show, files the strict pass placed or
// found no match for, inside the runtime band, and with positive episode evidence (S/E, an airdate, or one of 5+ numbered files
// in the same item). Files the strict pass placed need no further evidence. ctx.whyNot(file, item) gives the reason a skipped-for-length file would have been turned away.
function fallbackCand(cand, tags, ctx) {
  const { tv, cores } = ctx;
  const tagOf = (f, it) => { const t = tags.get(f); return t === 'wrong-length' && ctx.whyNot ? ctx.whyNot(f, it) : t; };
  const items = [];
  for (const it of cand.items) {
    if (!ctx.namesShow(it.title || '')) continue; // an identifier or a description is free text; only the title counts
    if (isExtras(it.title, cores) || isExtras(it.id, cores)) continue;
    let files = it.files.filter((f) => { const t = tagOf(f, it); return (t === 'no-match' || t === 'placed') && !isExtras(f.name, cores) && (!tv.runtime || inRuntimeBand(f.seconds, tv.runtime)); });
    const run = new Set(files.map((f) => episodeNumberOf(f.name, cores)).filter((n) => n != null));
    files = files.filter((f) => tags.get(f) === 'placed' || hasSeasonEpisode(f) || fileDate(f.name) || (run.size >= 5 && episodeNumberOf(f.name, cores) != null));
    if (files.length) items.push({ ...it, files });
  }
  return { ...cand, items };
}

// Read one show's inputs, decide its grid (gridFor), and write the grid only when it is the one that ships.
function matchShow(entry) {
  const show = entry.name;
  const cf = path.join(CAND_DIR, slug(show) + '.json');
  if (!fs.existsSync(cf)) return null;
  const cand = JSON.parse(fs.readFileSync(cf, 'utf8'));
  const r = gridFor(entry, cand, loadTv(show), { ov: readOverrides()[slug(show)] || {}, readDead, firstAdded });
  if (r.noTvmaze) { try { fs.unlinkSync(path.join(OUT_DIR, slug(show) + '.json')); } catch (_) {} /* a stale grid must not outlive the rule that rejected it */ return r; }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  writeIfChanged(path.join(OUT_DIR, r.slug + '.json'), r); // untouched when only matchedAt differs, so a re-match of an unchanged show leaves the file and its old stamp alone
  return r;
}

// The decision for one show, with no disk access of its own: its grid, or { noTvmaze: true } when there is nothing to list.
// ctx: ov (this show's overrides), readDead, firstAdded, and tags (a Map the caller may pass in to see why each file was placed or turned away).
function gridFor(entry, cand, tv, ctx = {}) {
  const show = entry.name;
  const ov = ctx.ov || {};
  const tags = ctx.tags || new Map();
  if (ov.excludeItems) cand.items = cand.items.filter((it) => !ov.excludeItems.includes(it.id));
  const aliases = [...(ov.aliases || []), ...(BUILTIN_ALIASES[slug(show)] || [])].map(norm).filter(Boolean);
  if (!tv || !tv.episodes.length) { const sg = selfGrid(entry, cand, aliases); return sg || { show, type: entry.type, network: entry.network, noTvmaze: true }; }
  const showWords = norm(show).split(' ').filter((w) => !STOP.has(w));
  const core = norm(show).replace(/^the /, '');
  const namesShow = (txt) => { const t = norm(txt); return t.includes(core) || aliases.some((a) => t.includes(a)); };
  const idNamesShow = (id) => { const t = norm(id).replace(/ /g, ''); return t.includes(core.replace(/ /g, '')) || aliases.some((a) => t.includes(a.replace(/ /g, ''))); };
  const DEAD = (ctx.readDead || (() => ({})))();
  const byKey = new Map(tv.episodes.map((e) => [`${e.season}x${e.number}`, e]));
  const byDate = new Map(tv.episodes.filter((e) => e.airdate).map((e) => [e.airdate, e]));
  const firstYear = tv.premiered ? +tv.premiered.slice(0, 4) : 0;
  let dateRejected = 0;
  const ordered = [...tv.episodes].sort((a, b) => (a.airdate || '').localeCompare(b.airdate || '') || a.season - b.season || a.number - b.number);

  const assignments = new Map(); // key -> [{conf, file, item, reasons}]
  const push = (ep, entry) => { const key = `${ep.season}x${ep.number}`; const list = assignments.get(key) || []; assignments.set(key, list); list.push(entry); };
  for (const item of cand.items) {
    const itemText = `${item.title || ''} ${item.description || ''} ${item.id}`;
    const itemNamesMe = norm(itemText).includes(core) || norm(item.id).includes(core.replace(/ /g, ''));
    const itemNamesOther = namesOtherShow(item.title || '', show, aliases);
    const itemTitled = namesShow(item.title || '') || idNamesShow(item.id); // the upload itself says it is this show
    const unmatched = []; // episode-band files this item could not place by number or title
    for (const f of item.files) {
      // Files hunted before the show had a TVmaze runtime carry generic bands (half-hour, hour); re-band them now that we know the runtime.
      if (!tv.runtime && (f.band === 'half-hour' || f.band === 'hour' || f.band === 'short')) f.band = 'episode';
      if (tv.runtime && f.seconds && !(f.band === 'episode' || f.band === 'double')) { const m = f.seconds / 60, rt = tv.runtime; f.band = m < 4 ? 'clip' : (m >= rt * 0.7 && m <= rt * 1.35) ? 'episode' : (m >= rt * 1.7 && m <= rt * 2.5) ? 'double' : m > rt * 4 ? 'block' : 'odd'; }
      if (!(f.band === 'episode' || f.band === 'double')) { tags.set(f, 'wrong-length'); continue; }
      const fileNamesOther = namesOtherShow(f.name, show, aliases);
      const fp = titlePart(f.name, showWords);
      let candidates = [];
      // 0. A date in the name: an exact airdate places the file; a date from before the show existed means it is another show's file (Late Night with Conan O'Brien under Conan).
      const fd = fileDate(f.name) || fileDate(item.title || '');
      let dateHit = false;
      if (fd && byDate.has(fd)) { candidates.push({ ep: byDate.get(fd), base: 0.75, why: 'airdate in filename' }); dateHit = true; }
      else if (fd && firstYear && +fd.slice(0, 4) < firstYear) { dateRejected++; tags.set(f, 'before-premiere'); continue; }
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
      if (!dateHit && best && bestSim >= 0.6 && (!titleAlone || strongTitle)) {
        const existing = candidates.find((c) => c.ep === best);
        if (existing) { existing.base += bestSim >= 0.8 ? 0.3 : 0.15; existing.why += ' + title match'; }
        else candidates.push({ ep: best, base: bestSim >= 0.8 ? 0.5 : 0.3, why: `title ~ "${best.name}" (${bestSim.toFixed(2)})` });
      }
      // Why a file that is not placed was turned away. The scores below stay as they were; the tag only decides what the fallback may reuse.
      const pen = { other: false, notNamed: false }; let placedAny = false;
      const tagWhy = () => ({ other: pen.other, react: REACT.test(tagText(f.name)) || REACT.test(tagText(item.title || '')), foreign: langRisk(f.name) || langRisk(item.title), notNamed: pen.notNamed });
      if (!candidates.length) {
        if (f.band === 'episode' && !fileNamesOther) unmatched.push(f);
        pen.other = fileNamesOther || (itemNamesOther && !namesShow(f.name)); pen.notNamed = !namesShow(f.name) && !itemTitled;
        tags.set(f, rejectionTag(tagWhy())); continue;
      }
      for (const c of candidates) {
        let conf = c.base;
        if (f.nameHit) conf += 0.15; else if (itemNamesMe) conf += 0.1;
        conf += f.band === 'episode' ? 0.15 : 0.05;
        if (!namesShow(f.name) && !itemTitled) { conf -= 0.5; pen.notNamed = true; } // only the description mentioned us: a spin-off, a same-cast show, a dump
        // Reaction and review channels upload "S01E01 - Title - Group Reaction": the right name, the wrong video (B caught Sunny and FMA, 2026-10-14).
        if (REACT.test(f.name) || REACT.test(item.title || '')) conf -= 0.7;
        // An episode title that happens to be another show's name ("Blind Date", "Succession") is not a foreign file when the file also names our show.
        const fileOther = fileNamesOther && !(namesShow(f.name) && otherShowCores(f.name, show, aliases).every((core) => forOtherShow(c.ep.name).includes(' ' + core + ' ')));
        if (fileOther) { conf -= 0.6; pen.other = true; } else if (itemNamesOther && !namesShow(f.name)) { conf -= 0.4; pen.other = true; } // "Star Trek" in the file is not "Star Trek: Enterprise"
        else if (!norm(f.name).includes(core) && !norm(item.title || '').includes(core) && bestSim < 0.3 && /[a-z]{4,}/.test(fp)) { conf -= 0.45; pen.notNamed = true; } // foreign title: words that are neither the show nor an episode
        const foreign = !!(langRisk(f.name) || langRisk(item.title));
        if (foreign) conf -= 0.35; // REVIEW, never LIVE, and the site hides it (a French dub is not the show)
        if (!f.playable) conf -= 0.1;
        conf = Math.max(0, Math.min(1, conf));
        if (process.env.MATCH_DEBUG) console.log(`  [debug] ${f.name.slice(0, 60)} -> ${c.ep.season}x${c.ep.number} conf ${conf.toFixed(2)} (${c.why}; band ${f.band}; names ${namesShow(f.name)}/${itemTitled}; other ${fileNamesOther}/${itemNamesOther})`);
        if (conf < REVIEW && !(ov.acceptFiles || []).includes(item.id + '|' + f.name)) continue; // an accepted file is kept whatever the judges say
        const risk = codecRisk(f.name, f.format, f.playable);
        placedAny = true;
        push(c.ep, { conf: +conf.toFixed(2), why: c.why, item: item.id, itemTitle: item.title, file: f.file, name: f.name, url: f.url, seconds: f.seconds, format: f.format, playable: f.playable, codecRisk: risk || undefined, langRisk: foreign || undefined, sizeMB: f.sizeMB });
      }
      tags.set(f, placedAny ? 'placed' : rejectionTag(tagWhy()));
    }
    // Sequence fallback: a DVD/season rip whose files carry no names ("Disc 1 10", "VTS_03_1").
    // If the ITEM names the show, holds 5+ unplaced episode-length files and no other show, offer
    // them in natural order as consecutive episodes of the season the item title suggests
    // (volume/season N, else 1) at REVIEW confidence. A human confirms with a glance.
    const titleNamesMe = itemTitled;
    if (titleNamesMe && !itemNamesOther && unmatched.length >= 5 && !REACT.test(item.title || '') && !langRisk(item.title)) {
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
      const rejected = new Set([...(ov.rejectFiles || []), ...Object.keys(DEAD)]), accepted = new Set(ov.acceptFiles || []);
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
  // When the TVmaze list and the uploads do not speak the same language (web series on DVD, toon collections),
  // self-listing places far more files and says so. Not when the files were turned away for being too old: those belong elsewhere.
  // It may use only files the strict pass could not place for lack of a match (see fallbackCand), and nothing is written here:
  // the grid reaches disk only if it is the one returned.
  const placed = live + review;
  const pool = cand.items.reduce((n, it) => n + it.files.filter((f) => f.band !== 'block' && f.band !== 'odd').length, 0);
  if (placed * 6 < pool && pool >= 20 && dateRejected < pool / 2) {
    const whyNot = (f, item) => rejectionTag({ other: namesOtherShow(f.name, show, aliases) || (!namesShow(f.name) && namesOtherShow(item.title || '', show, aliases)), react: REACT.test(tagText(f.name)) || REACT.test(tagText(item.title || '')), foreign: langRisk(f.name) || langRisk(item.title), notNamed: !namesShow(f.name) && !(namesShow(item.title || '') || idNamesShow(item.id)) });
    const sg = selfGrid(entry, fallbackCand(cand, tags, { tv, namesShow, cores: [core, ...aliases], whyNot }), aliases);
    const sgPlaced = sg ? sg.seasons.reduce((n, se) => n + se.episodes.length, 0) : 0;
    if (sgPlaced >= Math.max(20, placed * 3)) { sg.tvmazeWeak = { id: tv.id, name: tv.name, placed }; return sg; }
  }
  const total = tv.episodes.length;
  const out = {
    show, slug: slug(show), type: entry.type, network: entry.network, matchedAt: new Date().toISOString(), addedAt: (ctx.firstAdded || (() => undefined))(slug(show), live + review > 0),
    tvmaze: { id: tv.id, name: tv.name, runtime: tv.runtime, premiered: tv.premiered, network: tv.network },
    coverage: { total, live, review, missing: total - live - review, pct: Math.round(((live + review) / total) * 100) },
    seasons,
  };
  return out;
}

// No TVmaze entry (web series, one-off documentaries, local shows): list the show from its own files.
// Only uploads that NAME the show count; S/E in filenames sets the order, the rest follow in name
// order as season 1. Everything is REVIEW: honest about where the order came from.
function selfGrid(entry, cand, aliases) {
  const show = entry.name;
  const core = norm(show).replace(/^the /, '').replace(/\(.*?\)/g, '').trim();
  if (core.length < 5 && core.split(' ').length < 2 && !aliases.length) return null; // 'Bu', 'Oz': too short a name to trust inside other titles
  const names = (t) => { const x = norm(t); return x.includes(core) || aliases.some((a) => x.includes(a)); };
  const showWords = norm(show).split(' ').filter((w) => !STOP.has(w));
  const cores = [core, ...aliases];
  const items = cand.items.map((item) => {
    const t = norm(item.title || ''), idn = norm(item.id).replace(/ /g, '');
    // What an upload is comes from its TITLE. An Archive identifier is free text the uploader chose ("parkers-puzzle-cooking-kids-27-and-exercise"),
    // so it counts only when at least half of the video file names also name the show.
    const starts = t.startsWith(core) || t.startsWith('the ' + core);
    const vids = item.files.filter((f) => f.seconds >= 90 && f.seconds <= 3 * 3600 && !langRisk(f.name) && !isJunkFile(f.name, cores));
    const idHit = idn.includes(core.replace(/ /g, '')) || aliases.some((a) => idn.includes(a.replace(/ /g, '')));
    const named = names(item.title || '') || (idHit && vids.length > 0 && vids.filter((f) => names(f.name)).length / vids.length >= 0.5);
    const distinct = new Set(vids.map((f) => variantKey(f.name))).size; // format variants count once
    const med = vids.length ? vids.map((f) => f.seconds).sort((a, b) => a - b)[vids.length >> 1] : 0;
    const net = norm(entry.network || '').replace(/ /g, '');
    const mentionsNet = !!net && net.length > 2 && (norm((item.title || '') + ' ' + item.id + ' ' + (Array.isArray(item.collection) ? item.collection.join(' ') : item.collection || '')).replace(/ /g, '').includes(net));
    return { item, starts, named, vids, distinct, med, mentionsNet };
  }).filter((x) => x.named && !langRisk(x.item.title) && !/[぀-ヿ㐀-鿿가-힯Ѐ-ӿ؀-ۿ]/.test(x.item.title || '') && !isJunkItem((x.item.title || '') + ' ' + x.item.id, cores) && (x.starts || x.distinct >= 5)); // strict: the upload is titled as the show, or it is plainly a season of it
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
  for (const f of loose) { const key = variantKey(f.name); if (seen.has(key)) continue; seen.add(key); next++; const nm = titlePart(f.name, showWords); (seasons[1] = seasons[1] || []).push({ number: next, name: nm && /[a-z]{3,}/.test(nm) ? nm : ('Episode ' + next), state: 'REVIEW', file: f, alternates: [] }); }
  const list = Object.keys(seasons).map(Number).sort((a, b) => a - b).map((se) => ({ season: se, episodes: seasons[se].sort((a, b) => a.number - b.number) }));
  const total = list.reduce((m, se) => m + se.episodes.length, 0);
  const out = { show, slug: slug(show), type: entry.type, network: entry.network, matchedAt: new Date().toISOString(), selfListed: true,
    tvmaze: { id: null, name: show, runtime: null, premiered: null, network: entry.network },
    coverage: { total, live: 0, review: total, missing: 0, pct: 100 }, seasons: list };
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

// The date a show first had a playable file; matchedAt is overwritten on every run, so Recently added needs this.
function firstAdded(sl, hasNow) { try { const old = JSON.parse(fs.readFileSync(path.join(OUT_DIR, sl + '.json'), 'utf8')); if (old.addedAt) return old.addedAt; if (old.seasons && old.seasons.some((se) => se.episodes.some((e) => e.file))) return old.matchedAt; } catch (e) { /* new */ } return hasNow ? new Date().toISOString() : undefined; }
function main() {
  const argv = process.argv.slice(2);
  const slugAt = argv.indexOf('--slug');
  const slugFilter = slugAt >= 0 ? argv[slugAt + 1] : null; // HQ passes the exact slug; a name substring would sweep in every title containing it
  const filter = slugFilter ? '' : (argv.find((a) => !a.startsWith('--')) || '').toLowerCase();
  const partial = !!(filter || slugFilter);
  const rows = [];
  for (const entry of LIST.shows) {
    if (slugFilter && slug(entry.name) !== slugFilter) continue;
    if (filter && !entry.name.toLowerCase().includes(filter)) continue;
    let r;
    try { r = matchShow(entry); } catch (e) { console.log(`${entry.name}: FAILED ${e.message}`); continue; } // one bad file must not abort the run
    if (!r) continue;
    rows.push(r);
    if (r.noTvmaze) console.log(`${entry.name}: no TVmaze episode list`);
    else console.log(`${entry.name}: ${r.coverage.live} live, ${r.coverage.review} review, ${r.coverage.missing} missing of ${r.coverage.total} (${r.coverage.pct}%)`);
  }
  if (!partial) writeCoverage(rows); // a filtered run leaves the full report alone
  console.log(`\nWrote ${rows.length} grids to catalog/shows/ and docs/COVERAGE.md`);
}
if (require.main === module) main();
module.exports = { norm, tagText, slug, REACT, QUALITY_RE, OTHER_SHOWS, BUILTIN_ALIASES, makeOtherShows, forOtherShow, otherShowCores, namesOtherShow, variantKey, rejectionTag, stripShow, isJunkItem, isJunkFile, isExtras, inRuntimeBand, episodeNumberOf,
  fallbackCand, gridFor, selfGrid, matchShow, fileDate };
