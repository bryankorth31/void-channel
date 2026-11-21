// STRICT: the file checks behind VOIDtv Kids' strict matching (docs/KIDS.md 3a and 3). Pure functions, no I/O:
// scripts/match.js reads profiles/<name>/rules.json and, for a strict profile, asks about every file before it is
// scored whether it may be an episode at all. A file must pass every check:
//   words       junk that labels itself (YouTube Poop, compilation, sped up, VHS opening...), adult terms, profanity
//               and slurs (an uploader with those is listed for a look) in the item title,
//               subject, description, collection, identifier or the file name. A deny word inside one of the
//               show's own episode titles does not count ("Cow's Toys", "Chemical Reactions").
//   collection  Archive collections that hold no episodes (YouTube mirrors, VHS openings, commercials)
//   uploader    uploaders denied by hand (rules.json denyUploaders)
//   reputation  an uploader with 3+ word-flagged items for this show loses all their items for the show
//   runtime     length against the show's own TVmaze runtime: 0.6x-1.7x; up to 2.2x when the name carries two
//               episode numbers; shows flagged "shorts" (6-8 minute theatrical cartoons) from 4 minutes
//   series      a year right after the show's name that is outside its TVmaze run: "Teenage Mutant Ninja Turtles
//               (2003)" is not the 1987 series, whatever its S01E01 says (kids shows are full of same-name reboots)
// Use:  const ctx = forShow(compile(rules), entry, tv), bad = reputation(ctx, items);
//       checkFile(ctx, item, file, bad) -> { ok, reasons: ['words: compilation (title)', ...], band }
// judge() wraps these for one show's match run and keeps the counts for catalog/strict-report.json.

// Text as lower-case words: tags dropped, & -> and, apostrophes gone, everything else a single space. "18+" becomes
// the word 18plus so rules can name it (not after a dash: "2000-10-18 +++++" is a date).
const words = (s) => String(Array.isArray(s) ? s.join(' ') : s == null ? '' : s).replace(/<[^>]*>/g, ' ').toLowerCase()
  .replace(/&/g, ' and ').replace(/(^|[\s([{])18 ?\+(?!\+)/g, '$1 18plus ').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const phrase = (src, g) => new RegExp('(?:^| )(?:' + src + ')(?= |$)', g ? 'g' : ''); // whole words only
const lower = (s) => String(s || '').trim().toLowerCase();
// Archive uploaders are usually e-mail addresses: third-party personal data. hunt.js keeps only uploaderHash (the first
// 12 hex of the sha1 of the trimmed, lower-cased address), so strict keys every uploader by that hash. An older
// candidates file that still carries the raw uploader is hashed the same way here; rules.json denyUploaders takes a hash
// or an address (hashed on load). A hash is not personal data, so reports show it as it is.
const HASH12 = /^[0-9a-f]{12}$/;
const hashOf = (s) => require('crypto').createHash('sha1').update(String(s).trim().toLowerCase()).digest('hex').slice(0, 12);
const uploaderKey = (it) => (it && it.uploaderHash ? lower(it.uploaderHash) : it && it.uploader ? hashOf(it.uploader) : '');
const denyKey = (s) => (HASH12.test(lower(s)) ? lower(s) : hashOf(s));
const mask = (u) => { const s = String(u || ''); if (HASH12.test(s)) return s; const at = s.lastIndexOf('@'); return at > 0 ? s.slice(0, Math.min(3, at)) + '…@' + s.slice(at + 1) : s.slice(0, 3) + '…'; };

function compile(raw) {
  const list = (k) => (raw[k] || []).filter((s) => typeof s === 'string' && s.trim());
  const deny = (k) => list(k).map((src) => ({ src, re: phrase(src) }));
  const anchored = (k) => list(k).map((src) => ({ src, re: new RegExp('^(?:' + src + ')$') }));
  return {
    words: deny('denyWords'), adult: deny('denyAdult'), names: deny('denyNames'), unlessNamed: deny('denyUnlessNamed'), files: deny('denyFiles'),
    whole: anchored('denyWhole'), folders: anchored('denyFiles'),
    ignore: new RegExp('^(?:' + (raw.wholeIgnore || '\\d+') + ')$'),
    allow: list('allowPhrases'),
    collections: new Set(list('denyCollections').map(lower)),
    uploaders: new Set(list('denyUploaders').map(denyKey)),
    spinoffs: raw.spinoffs || {}, productionNumbers: raw.productionNumbers || {},
    runtime: { min: 0.6, max: 1.7, multiMax: 2.2, pairMax: 2.5, shortsMinMinutes: 4, shortsMaxMinutes: 15, ...(raw.runtime || {}) },
    reputation: { flaggedItems: 3, ...(raw.reputation || {}) },
  };
}

// The show's runtimes from its own TVmaze data: the show runtime, and the median episode runtime when most episodes
// carry one and it differs (2 Stupid Dogs: 7 for the show, i.e. its segments, and 30 for every episode). A file
// passes if it fits either.
function showRuntimes(tv) {
  const eps = (tv && tv.episodes) || [];
  const rts = eps.map((e) => e.runtime).filter((m) => m > 0).sort((a, b) => a - b);
  const med = rts.length && rts.length >= eps.length / 2 ? rts[rts.length >> 1] : 0;
  return [...new Set([(tv && (tv.runtime || tv.averageRuntime)) || 0, med])].filter((m) => m > 0);
}

const firstHit = (list, t) => { for (const d of list) { const m = d.re.exec(t); if (m) return m[0].trim(); } return null; };

function forShow(rules, entry, tv) {
  const core = words(entry.name).replace(/^the /, '');
  const deny = [...rules.words, ...rules.names, ...rules.unlessNamed, ...rules.files];
  // the show's own episode titles (and name) that happen to hold a deny word are not junk; longest first
  const own = [...new Set([entry.name, ...((tv && tv.episodes) || []).map((e) => e.name)].map(words))]
    .filter((t) => t && firstHit(deny, t)).sort((a, b) => b.length - a.length);
  return {
    rules, name: entry.name, core, own,
    allow: rules.allow.map((src) => phrase(src.split('{show}').join(esc(core)), true)),
    showWords: new Set(words(entry.name).split(' ')),
    shorts: (entry.flags || []).includes('shorts'),
    runtimes: showRuntimes(tv),
    run: showYears(tv),
    spin: [].concat(rules.spinoffs[words(entry.name).replace(/ /g, '-')] || []).map((src) => ({ src, re: phrase(src) })),
    yearAfterName: new RegExp('(?:^| )' + esc(core) + ' ((?:19|20)\\d{2})(?= |$)'),
    production: productionIndex(rules, entry, tv),
    titles: titleIndex(tv),
    memo: new WeakMap(),
  };
}

// ---- production numbers (Sesame Street "Episode 4133", Mister Rogers "Show 1051" / 1461-1765) -----------------
// TVmaze names many episodes by production number alone ("Episode 2594", "Show 1051", "Repeat of 676 (976)"); a
// show in rules.json productionNumbers also numbers the episodes from a date on, in airdate order (Mister Rogers
// 1461-1765 from 1979, checked 18 Oct against the 50th-anniversary set: every theme and part lines up).
const PROD_NAME = [/^(?:episode|show|program)\s+(?:no\.?\s*)?#?\s*(\d{1,4})$/i, /^repeat of \d{1,4} \((\d{1,4})\)$/i];
function productionIndex(rules, entry, tv) {
  const idx = new Map(), eps = (tv && tv.episodes) || [], named = new Set();
  for (const e of eps) for (const re of PROD_NAME) { const m = re.exec(String(e.name || '').trim()); if (m && !idx.has(+m[1])) { idx.set(+m[1], e); named.add(e); } }
  for (const r of [].concat((rules.productionNumbers || {})[words(entry.name).replace(/ /g, '-')] || [])) { // an episode named by its number keeps it
    const run = eps.filter((e) => !named.has(e) && e.airdate && e.airdate >= r.from && (!r.until || e.airdate <= r.until)).sort((a, b) => a.airdate.localeCompare(b.airdate) || a.season - b.season || a.number - b.number);
    run.forEach((e, i) => { if (!idx.has(r.first + i)) idx.set(r.first + i, e); });
  }
  return idx;
}
// The production number a file name (or a one-file item's title) carries: a number right after episode / ep / show /
// no. / #, or the only number in the name. A year (1950-2029) counts only after such a word: "Sesame Street (1987)" is
// a year, "Sesame Street (2594)" and "Episode 1987" are episodes. A number right after disc, dvd, vol, part, track,
// tape, season... never is ("Disc 110", "Season 1979"), and folder names are never read, only the file's own name.
const PROD_CONTEXT = /(?:^|[^a-z0-9])(?:episode|episodio|ep|eps|show|program|no|nr|number)\.?\s*(?:no\.?\s*|#\s*)?(\d{1,4})(?![\da-z])|#\s*(\d{1,4})(?![\da-z])/g;
const NOT_PROD = /(?:^|[^a-z0-9])(?:disc|disk|dvd|vol|volume|part|pt|cd|track|tape|reel|season)[\s.#:-]*(?:(?:no|nr|number)[\s.#:-]*)?\d+/g;
const standalone = (t) => t.match(/(?<![a-z\d])\d+(?![a-z\d])/g) || []; // not 720p, x264, 60fps, s01e05
function productionNumber(text) {
  const raw = String(text || '').toLowerCase().replace(/_/g, ' '), t = raw.replace(NOT_PROD, ' ');
  const ctx = new Set([...t.matchAll(PROD_CONTEXT)].map((m) => +(m[1] || m[2])));
  if (ctx.size) return ctx.size === 1 ? [...ctx][0] : null;
  const nums = standalone(t);
  if (standalone(raw).length !== 1 || nums.length !== 1 || nums[0].length < 3 || nums[0].length > 4) return null; // the ONLY number, and not a disc's
  const n = +nums[0];
  return n >= 1950 && n <= 2029 ? null : n;
}
function productionMatch(ctx, item, file) {
  if (!ctx.production.size) return null;
  const n = productionNumber(String(file.name || '').split('/').pop()) || ((item.files || []).length === 1 ? productionNumber(item.title) : null); // own name only, never a folder's
  const ep = n != null && ctx.production.get(n);
  return ep ? { n, ep } : null;
}
// The years the show aired, from its premiere and episode airdates (null when TVmaze gives none).
function showYears(tv) {
  const ys = [tv && tv.premiered, ...((tv && tv.episodes) || []).map((e) => e.airdate)].map((d) => parseInt(String(d || '').slice(0, 4), 10)).filter((y) => y > 1900);
  return ys.length ? { from: Math.min(...ys), to: Math.max(...ys) } : null;
}
// "<show> (2003)" in a title or file name, a year more than a year outside the run: another series of that name.
// Or a known spin-off of the show (rules.json spinoffs): "Ninja Turtles - Next Mutation S01E01".
function otherSeries(ctx, s) {
  if (!s) return null;
  const t = words(s), sp = firstHit(ctx.spin, t);
  if (sp) return 'spin-off ' + sp;
  const m = ctx.run && ctx.yearAfterName.exec(t), y = m && +m[1];
  return y && (y < ctx.run.from - 1 || y > ctx.run.to + 1) ? `${y} (the show ran ${ctx.run.from}-${ctx.run.to})` : null;
}

// Text ready for the deny lists: the show's own episode titles and the allowed phrases taken out.
function clean(ctx, s) {
  let t = ' ' + words(s) + ' ';
  for (const p of ctx.own) t = t.split(' ' + p + ' ').join('  ');
  for (const re of ctx.allow) t = t.replace(re, ' ');
  return t.replace(/\s+/g, ' ').trim();
}
// The whole title/name is just an intro, a theme song, credits... once the show's name and filler are set aside.
function wholeHit(ctx, s, list) {
  const rest = words(s).split(' ').filter((w) => w && !ctx.showWords.has(w) && !ctx.rules.ignore.test(w)).join(' ');
  return rest ? firstHit(list || ctx.rules.whole, rest) : null;
}
// Names (title, subject, id, file): denyNames, and denyUnlessNamed when the text does not name the show itself.
// Adult terms, profanity and slurs (rules.json denyAdult): any field; apostrophes split words ("Who're" is not a
// slur) and the show's own episode titles excuse nothing (Popeye's "Scrap the Japs").
const plain = (s) => words(String(Array.isArray(s) ? s.join(' ') : s == null ? '' : s).replace(/['’]/g, ' '));
const adultHit = (ctx, s) => firstHit(ctx.rules.adult, plain(s));
const nameHit = (ctx, t) => firstHit(ctx.rules.names, t) || (!(' ' + t + ' ').includes(' ' + ctx.core + ' ') && firstHit(ctx.rules.unlessNamed, t));
// Deny-word hits for one field: 'compilation (title)'. Prose and keyword fields (description, collection, subject) use
// denyWords only: subject tags are keyword soup ('parody' on Phineas and Ferb, 'Bluebird Toys' on Mighty Max).
function fieldHits(ctx, field, s, prose) {
  if (s == null || s === '') return [];
  const t = clean(ctx, s), out = [];
  const w = adultHit(ctx, s) || firstHit(ctx.rules.words, t) || (!prose && nameHit(ctx, t));
  if (w) out.push(w + ' (' + field + ')');
  else if (field === 'title') { const h = wholeHit(ctx, s); if (h) out.push('whole ' + h + ' (' + field + ')'); }
  return out;
}
function itemWords(ctx, item) {
  if (ctx.memo.has(item)) return ctx.memo.get(item);
  const out = [...fieldHits(ctx, 'title', item.title), ...fieldHits(ctx, 'subject', item.subject, true), ...fieldHits(ctx, 'description', item.description, true),
    ...fieldHits(ctx, 'collection', item.collection, true), ...fieldHits(ctx, 'id', item.id)];
  ctx.memo.set(item, out);
  return out;
}
// The file name with its folders ("Season 1/Extras/Toy Commercial"). denyFiles words count in the file's own name
// or as a whole folder ("Extras/"); the whole-name test looks at the file's own name.
function fileWords(ctx, file) {
  const parts = String(file.name || '').split('/'), own = parts.pop();
  const t = clean(ctx, parts.concat(own).join(' / ')), w = adultHit(ctx, file.name) || firstHit(ctx.rules.words, t) || nameHit(ctx, t) || firstHit(ctx.rules.files, clean(ctx, own));
  if (w) return [w + ' (file)'];
  for (const dir of parts) { const d = wholeHit(ctx, clean(ctx, dir), ctx.rules.folders); if (d) return [d + ' (folder)']; }
  const h = wholeHit(ctx, own);
  return h ? ['whole ' + h + ' (file)'] : [];
}

// Two consecutive episode numbers in the name: S01E01-E02, S01E01E02, S01E01-02, 1x01-1x02, 101-102, Episodes 1 & 2.
// Separators matter here ("S01E01 - 2 Stupid Dogs" is one episode), so only dots and underscores become spaces.
// A bare second number needs a tight separator ("S01E01-02", "1x01&02"), or a spaced one only after "episodes".
const TWO = [/\bs\d{1,2} ?e(\d{1,3}) ?(?:-|&|\+|,|and|to)? ?(?:s\d{1,2} ?)?e(\d{1,3})(?!\d)/, /\bs\d{1,2} ?e(\d{1,3})(?:-|&|\+| & | \+ )(\d{1,3})(?![\dp])/,
  /\b\d{1,2}x(\d{1,3}) ?(?:-|&|\+) ?\d{1,2}x(\d{1,3})(?!\d)/, /\b\d{1,2}x(\d{1,3})(?:-|&|\+| & | \+ )(\d{1,3})(?![\dp])/,
  /\b(?:episodes|eps) ?(\d{1,3}) ?(?:-|&|\+|and|to) ?(\d{1,3})(?![\dp])/, /\bep(?:isode)? ?(\d{1,3})(?:-|&|\+)(\d{1,3})(?![\dp])/,
  /(?:^|[^\d])[1-9](\d{2}) ?(?:-|&|\+) ?[1-9](\d{2})(?![\dp])/];
// ---- two stories in one file (WordGirl, B 15 Nov 2026) --------------------------------------------------------
// Some guides list each story of a half hour as its own episode (TVmaze: WordGirl, 12 minutes each), while the uploads
// are the half hours, named after both stories ("Tobey's Masterpiece + Chuck the Nice Pencil-Selling Guy") and numbered
// by half hour, so their S/E numbers point at the wrong story. A file whose name carries the titles of two stories that
// sit next to each other in the guide (same season, numbers n and n+1, in that order) is that pair: it may run up to
// runtime.pairMax (2.5x: two 12-minute stories fill a half-hour slot, 26 to 28 minutes with the credits), and match.js places it on the first story by those titles, not by its number. Titles shorter than
// 8 letters or of one word are not used ("Pizza" could be anywhere); a name that fits more than one pair is not used.
function titleIndex(tv) {
  return ((tv && tv.episodes) || []).map((e) => ({ ep: e, key: words(e.name) }))
    .filter((x) => x.key.replace(/ /g, '').length >= 8 && x.key.includes(' '));
}
function pairOf(ctx, name) {
  const t = ' ' + words(name) + ' ';
  const at = new Map();
  for (const x of ctx.titles || []) { const i = t.indexOf(' ' + x.key + ' '); if (i >= 0) at.set(x.ep, i); }
  if (at.size < 2) return null;
  const pairs = [];
  for (const [a, ia] of at) for (const [b, ib] of at) if (a.season === b.season && b.number === a.number + 1 && ib > ia) pairs.push({ a, b });
  return pairs.length === 1 ? pairs[0] : null;
}
function twoEpisodes(name) {
  const t = String(name || '').toLowerCase().replace(/[._]+/g, ' ');
  return TWO.some((re) => { const m = re.exec(t); return !!m && +m[2] > +m[1] && +m[2] - +m[1] <= 3; });
}
function runtimeCheck(ctx, file) {
  const R = ctx.rules.runtime, min = (+file.seconds || 0) / 60;
  if (!ctx.runtimes.length) return { why: 'show runtime unknown' };
  if (!min) return { why: 'file length unknown' };
  const pair = !!pairOf(ctx, file.name), multi = pair || twoEpisodes(file.name), bands = [];
  for (const rt of ctx.runtimes) {
    const lo = ctx.shorts ? R.shortsMinMinutes : rt * R.min, hi = Math.min(rt * (pair ? R.pairMax : multi ? R.multiMax : R.max), ctx.shorts ? R.shortsMaxMinutes : Infinity); // shorts: 4-15 minutes whatever TVmaze says
    if (min >= lo && min <= hi) return { band: multi && min > rt * 1.35 ? 'double' : 'episode' }; // match.js's band names; 1.35x is its episode ceiling
    bands.push(lo.toFixed(1) + '-' + hi.toFixed(1));
  }
  return { why: `${min.toFixed(1)} min outside ${bands.join(' and ')}` };
}

// Uploaders with flaggedItems+ word-flagged items for this show (title, description... or any of their files).
// Uploaders with any item carrying an adult term, profanity or a slur (title, subject, description... or a file): listed
// in STRICT.md for a person to decide, never denied automatically. -> [{ uploader, items, example }]
function lookAtUploaders(ctx, items) {
  const by = new Map();
  for (const it of items || []) {
    const u = uploaderKey(it); if (!u) continue;
    const w = adultHit(ctx, it.title) || adultHit(ctx, it.subject) || adultHit(ctx, it.description) || adultHit(ctx, it.id) || (it.files || []).map((f) => adultHit(ctx, f.name)).find(Boolean);
    if (!w) continue;
    const e = by.get(u) || { uploader: u, items: 0, example: w + ': ' + String(it.title || it.id).slice(0, 80) }; e.items++; by.set(u, e);
  }
  return [...by.values()];
}
function reputation(ctx, items) {
  const n = new Map();
  for (const it of items || []) {
    const u = uploaderKey(it);
    if (u && (itemWords(ctx, it).length || (it.files || []).some((f) => fileWords(ctx, f).length))) n.set(u, (n.get(u) || 0) + 1);
  }
  return new Set([...n].filter(([, c]) => c >= ctx.rules.reputation.flaggedItems).map(([u]) => u));
}

function checkFile(ctx, item, file, denied) {
  const reasons = [...itemWords(ctx, item), ...fileWords(ctx, file)].map((w) => 'words: ' + w);
  const colls = [].concat(item.collection || []).map(lower).filter((c) => ctx.rules.collections.has(c));
  if (colls.length) reasons.push('collection: ' + colls.join(', '));
  const other = otherSeries(ctx, item.title) || otherSeries(ctx, item.id) || otherSeries(ctx, file.name);
  if (other) reasons.push('series: ' + other);
  const u = uploaderKey(item);
  if (u && ctx.rules.uploaders.has(u)) reasons.push('uploader: ' + mask(u));
  else if (u && denied && denied.has(u)) reasons.push('reputation: ' + mask(u));
  const rt = runtimeCheck(ctx, file);
  if (rt.why) reasons.push('runtime: ' + rt.why);
  return { ok: !reasons.length, reasons, band: rt.band };
}

// ---- one show's run: the checks plus the counts for the strict report ----------------------------------------
const EXAMPLES = 5;
function emptyReport(notes) { return { kept: 0, files: 0, passed: 0, rejected: {}, examples: {}, words: {}, uploadersDenied: [], uploadersToLookAt: [], perFilePending: 0, subjectUnknown: { items: 0, keptEpisodes: 0, ids: [] }, notes: [].concat(notes || []) }; }
// An item whose subject tags were never seen (no cached metadata when profiles/kids/backfill-subject.js ran, or an old
// candidates file): the word check could not read them. Not a rejection by itself; the report lists such items.
const subjectUnknown = (it) => !!it.subjectUnknown || !Array.isArray(it.subject);
function judge(rules, entry, tv, items, acceptFiles) {
  const ctx = forShow(rules, entry, tv), denied = reputation(ctx, items), unknown = new Set((items || []).filter(subjectUnknown).map((it) => it.id));
  const perFile = (entry.flags || []).includes('perFile'), accepted = new Set(acceptFiles || []);
  const rep = emptyReport(), passed = new Map(), placed = new Set();
  const lookAt = lookAtUploaders(ctx, items).filter((x) => !denied.has(x.uploader));
  rep.uploadersDenied = [...denied].map(mask);
  rep.uploadersToLookAt = lookAt.map((x) => ({ ...x, uploader: mask(x.uploader) }));
  const reject = (kind, name, why) => {
    rep.rejected[kind] = (rep.rejected[kind] || 0) + 1;
    const ex = rep.examples[kind] = rep.examples[kind] || [];
    if (ex.length < EXAMPLES && !ex.some((e) => e === name || e.startsWith(name + ' ['))) ex.push(name + (why ? ' [' + why + ']' : ''));
  };
  return {
    ctx, denied,
    uploaders: { denied: [...denied], toLookAt: lookAt }, // uploader hashes, for <catalog>/cache only
    // false = leave the file out (counted under its first reason); true = score it, with f.band set from the show's runtime
    pass(item, f) {
      rep.files++;
      const key = item.id + '|' + f.name, v = checkFile(ctx, item, f, denied);
      if (!v.ok) {
        const [kind, ...rest] = v.reasons[0].split(': ');
        for (const w of new Set(v.reasons.filter((r) => r.startsWith('words: ')).map((r) => r.slice(7).replace(/ \(\w+\)$/, '')))) rep.words[w] = (rep.words[w] || 0) + 1;
        reject(kind, f.name, rest.join(': '));
        return false;
      }
      if (perFile && !accepted.has(key)) { rep.perFilePending++; reject('perFile', f.name); return false; } // every file needs a person (KIDS.md 3a.5)
      if (!f.playable && !accepted.has(key)) { reject('unplayable', f.name, f.format); return false; } // would be REVIEW, which strict never shows
      f.band = v.band; rep.passed++; passed.set(key, f.name);
      return true;
    },
    placed(item, f) { placed.add(item.id + '|' + f.name); }, // reached LIVE confidence for some episode
    ok(item, f) { return passed.has(item.id + '|' + f.name); }, // passed every check (after pass())
    number(item, f) { return productionNumber(String(f.name || '').split('/').pop()) || ((item.files || []).length === 1 ? productionNumber(item.title) : null); }, // the episode number the file names, or null
    pair(item, f) { const p = pairOf(ctx, f.name); if (p) rep.storyPairs = (rep.storyPairs || 0) + 1; return p; }, // { a, b } episodes, or null
    production(item, f) { const p = productionMatch(ctx, item, f); if (p) rep.productionNumbers = (rep.productionNumbers || 0) + 1; return p; }, // { n, ep } or null
    finish(live, seasons) { // seasons: the grid, to count kept episodes from items whose subject was never seen
      rep.subjectUnknown = { items: unknown.size, keptEpisodes: (seasons || []).reduce((n, s) => n + s.episodes.filter((e) => e.state === 'LIVE' && e.file && unknown.has(e.file.item)).length, 0), ids: [...unknown].slice(0, 50) };
      for (const [key, name] of passed) if (!placed.has(key)) reject('noLiveMatch', name);
      rep.kept = live;
      if (perFile) rep.notes.push(accepted.size ? `per-file approval: ${accepted.size} approved in HQ, ${rep.perFilePending} waiting` : 'waiting for per-file approval');
      if (!ctx.runtimes.length) rep.notes.push('no runtime on TVmaze: every file fails the runtime check');
      if (denied.size) rep.notes.push('uploaders denied for junk: ' + rep.uploadersDenied.join(', '));
      if (rep.productionNumbers) rep.notes.push(rep.productionNumbers + ' files carry a production number TVmaze knows');
      return rep;
    },
  };
}

// ---- the readable summary (docs/STRICT.md for the profile) ---------------------------------------------------
const KINDS = ['words', 'collection', 'series', 'uploader', 'reputation', 'runtime', 'perFile', 'unplayable', 'noLiveMatch'];
function totals(shows) {
  const t = { shows: 0, showsWithEpisodes: 0, kept: 0, files: 0, passed: 0, rejected: {}, subjectUnknownItems: 0 };
  for (const r of Object.values(shows)) {
    t.shows++; if (r.kept > 0) t.showsWithEpisodes++;
    t.kept += r.kept; t.files += r.files; t.passed += r.passed; t.subjectUnknownItems += (r.subjectUnknown && r.subjectUnknown.items) || 0;
    for (const [k, n] of Object.entries(r.rejected)) t.rejected[k] = (t.rejected[k] || 0) + n;
  }
  return t;
}
function markdown(report, siteName) {
  const shows = report.shows || {}, t = report.totals || totals(shows);
  const cell = (r, k) => r.rejected[k] || '';
  const lines = [`# Strict matching${siteName ? ' (' + siteName + ')' : ''}`, '',
    `Every file passes scripts/lib/strict.js before it is scored (docs/KIDS.md 3a): deny words, denied collections and uploaders, another series of the same name, uploader reputation, runtime against the show's own TVmaze runtime, per-file approval where flagged. Then only LIVE matches (confidence 0.85+) are kept: no REVIEW, no self-listing, no guessed order. Rules: profiles/<profile>/rules.json. Full detail with example file names: strict-report.json in the catalog.`, '',
    `**${t.showsWithEpisodes} of ${t.shows} shows have episodes; ${t.kept} episodes kept.** ${t.files} files judged, ${t.passed} passed the checks. Rejected: ${KINDS.filter((k) => t.rejected[k]).map((k) => k + ' ' + t.rejected[k]).join(', ') || 'none'}.`, '',
    'Columns count files by their first failed check. noLiveMatch = passed the checks but matched no episode at LIVE confidence.', '',
    '| Show | Kept episodes | Words | Collection | Other series | Uploader | Reputation | Runtime | Per-file | Unplayable | No LIVE match | Notes |', '|---|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const [name, r] of Object.entries(shows).sort((a, b) => b[1].kept - a[1].kept || a[0].localeCompare(b[0]))) {
    const top = Object.entries(r.words).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([w, n]) => w + ' ' + n).join(', ');
    lines.push(`| ${name} | ${r.kept} | ${cell(r, 'words')}${top ? ' (' + top + ')' : ''} | ${cell(r, 'collection')} | ${cell(r, 'series')} | ${cell(r, 'uploader')} | ${cell(r, 'reputation')} | ${cell(r, 'runtime')} | ${cell(r, 'perFile')} | ${cell(r, 'unplayable')} | ${cell(r, 'noLiveMatch')} | ${r.notes.join('; ').replace(/\|/g, '/')} |`);
  }
  const look = Object.entries(shows).filter(([, r]) => (r.uploadersToLookAt || []).length);
  lines.push('', '## Uploaders to look at', '', look.length
    ? 'Uploaders with an item carrying an adult term, profanity or a slur (in its title, subject tags, description or a file name). Those items are rejected; the uploader is NOT denied automatically. Add them to rules.json denyUploaders if their other uploads should go too. Uploaders show as the code hunt.js keeps for them (uploaderHash), never an address; the same codes are in catalog/cache/uploaders-to-look-at.json, which is never committed. To deny one, add its code to rules.json denyUploaders.'
    : 'None.');
  for (const [name, r] of look) for (const x of r.uploadersToLookAt) lines.push(`- **${name}**: ${x.uploader}, ${x.items} item${x.items === 1 ? '' : 's'} (${x.example.replace(/\|/g, '/')})`);
  const unk = Object.entries(shows).filter(([, r]) => r.subjectUnknown && r.subjectUnknown.items);
  lines.push('', '## Items whose subject tags were never checked', '', unk.length
    ? 'No cached Archive metadata, so the word check could not read their subject tags. Not rejected for that alone; worth a look before approval.'
    : 'None: every item\'s subject tags were checked.');
  for (const [name, r] of unk) lines.push(`- **${name}**: ${r.subjectUnknown.items} items, ${r.subjectUnknown.keptEpisodes} kept episodes from them: ${r.subjectUnknown.ids.join(', ')}${r.subjectUnknown.items > r.subjectUnknown.ids.length ? ' and more (strict-report.json)' : ''}`);
  if ((report.noCandidates || []).length) lines.push('', `Not hunted yet (no candidates): ${report.noCandidates.length} shows: ${report.noCandidates.join(', ')}.`);
  return lines.join('\n') + '\n';
}

module.exports = { words, mask, uploaderKey, titleIndex, pairOf, lookAtUploaders, compile, showRuntimes, forShow, productionIndex, productionNumber, productionMatch, itemWords, fileWords, twoEpisodes, runtimeCheck, reputation, checkFile, judge, emptyReport, totals, markdown, KINDS };
