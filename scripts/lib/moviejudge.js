// MOVIE JUDGE: how the TV-movie hunt (scripts/hunt-movies.js) decides whether one Archive file is a given movie.
// Pure: no disk, no network. The hunt, its --rescore mode, the doctor's movie lights and the tests all call the same functions.
//
// The rule that matters (audit CP-022). The movie's TITLE must stand in the file name or in the upload's title as a phrase of
// whole words, with nothing glued in front of it or run on behind it that makes it a longer title. Word overlap alone ("every
// word of the title appears somewhere in the name") is a guess, not a match, so it can reach REVIEW and never LIVE. That is what
// let "Richard II" play "Superman II, The Richard Donner Cut".
//
// What the "phrase" test is, and where it comes from:
//   - to the right of the title it is the series matcher's own rule (match.js closesName): the name must end there, or be followed by a
//     separator (colon, a dash with spaces, a bracket, a comma and a space...), a year, a quality or format word, "complete", "full"...
//     A title that runs straight on into another word is a longer title. Movie additions to that rule: "movie", "film", "TV movie",
//     "special", "documentary", "english", "aka" and a network name may follow a title; a small number or a roman numeral straight
//     after it is a sequel, so it does not.
//   - to the left of the title nothing may be glued on, except "the", "a", "an", a number, a network, a possessive ("Stephen King's")
//     or a real separator: "Wide Open Marriage" is not "Open Marriage", "Muppets Treasure Island" is not "Treasure Island". The series
//     matcher has no left rule; movies need one because a movie title is often the tail of a longer one.
//   - a text that begins with a date (a stream, a recording, a dated upload) is not evidence of a title.
//   - the same words in another order and nothing else in the name ("INSIDE Bo Burnham" for "Bo Burnham: Inside") also count, but such a
//     pick is LIVE only when the year or a runtime within 5% backs it.
//
// LIVE also needs, for a title of two words or fewer, the year in the text (this year or the year either side of it, because a TV movie's
// release year and its production year differ often) or a runtime within 5% of TMDB's. Short titles are the ones other works contain by accident.
const M = require('../match.js');
const { hardExclude } = require('./hardexclude');

const LIVE = 0.85, REVIEW = 0.5;
const norm = M.norm;
const STOP = new Set(['the', 'a', 'an', 'and', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'is', 'it']);
const QUALITY_RE = /\b(\d{3,4}p|x26[45]|h ?26[45]|hevc|aac|ac3|dvdrip|webrip|web dl|hdtv|bluray|bdrip|xvid|divx|mp4|mkv|avi|proper|repack|uncut|full movie|movie|film|tv movie|complete|remaster(ed)?|hd|sd|vhs|dvd|rip|eng|english|subs?)\b/g;
const JUNK_RE = /\btrailer\b|\bteaser\b|\bpromo\b|\breview\b|reaction|\brecap\b|\bclip\b|\bscene\b|behind the scenes|making of|interview|commentary|\bost\b|soundtrack|theme song|\bamv\b|\bytp\b|parody|fan ?made|\bfull movie in (hindi|tamil|telugu)\b|dubbed in|\bhindi dubbed\b|audiobook|\bcommercial\b|\bad\b|\bplaylist\b|walkthrough|playthrough|gameplay|let'?s play|longplay|speedrun|podcast|live ?stream|\bvlog\b/i;
// Dual-audio and foreign-dub rips: the browser plays whichever track comes first, often not English.
const LANG_RISK = /\b(dual[ .-]?audio|multi[ .-]?audio|multi|hindi|tamil|telugu|urdu|vegamovies|filmyzilla|filmywap|moviesflix|dubbed|dublado|latino|castellano|vf|vff|vfq|truefrench|french|vostfr|ita[ .-]eng|rus[ .-]eng|deutsch|german|espa[nñ]ol|italiano|portugu[eê]s)\b/i;
// Release names use . _ - as separators; underscores are word characters, so normalize before testing.
const tagText = (s) => String(s || '').replace(/[._\-\[\]()]+/g, ' ');
const langRisk = (s) => LANG_RISK.test(tagText(s));

// ---- the loose similarity: finds candidates and ranks them. It is NOT what makes a pick LIVE (see judgeFile) ----
function bigrams(s) { const o = new Set(); for (let i = 0; i < s.length - 1; i++) o.add(s.slice(i, i + 2)); return o; }
function dice(a, b) { if (!a || !b) return 0; const A = bigrams(a), B = bigrams(b); let h = 0; for (const g of A) if (B.has(g)) h++; return (2 * h) / (A.size + B.size); }
function cleanTitle(s) { return norm(s).replace(/\b(19|20)\d{2}\b/g, ' ').replace(QUALITY_RE, ' ').replace(/\s+/g, ' ').trim(); }
function titleSim(a, b) {
  const x = cleanTitle(a), y = cleanTitle(b);
  if (!x || !y) return 0;
  const d = dice(x.replace(/ /g, ''), y.replace(/ /g, ''));
  const yt = y.split(' ').filter((w) => !STOP.has(w)), xs = new Set(x.split(' '));
  const overlap = yt.length ? yt.filter((w) => xs.has(w)).length / yt.length : 0;
  return Math.max(d, overlap * 0.95);
}
const words = (title) => norm(title).split(' ').filter((w) => w && !STOP.has(w));

// ---- the phrase test ----
const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const chars = (...codes) => String.fromCharCode(...codes);
const APOS = "'`" + chars(0x2019);
const DASHES = '-' + chars(0x2013, 0x2014); // hyphen, en dash, em dash
// A real separator in the gap between two words (the same set match.js uses to end a show name): colon, pipe, slash, bracket, quote,
// a dash with a space beside it, a star or bullet, a comma, period, semicolon or exclamation mark with a space beside it.
const HARD_GAP = new RegExp('[:|/\\\\()\\[\\]{}"~' + chars(0x201c, 0x201d, 0xff1a, 0xff5c, 0xff0f, 0xff02, 0xff08, 0xff09, 0x300c, 0x300d, 0x3010, 0x3011, 0x2605, 0x2606, 0x2022, 0xb7) + ']|\\s[' + DASHES + ']|[' + DASHES + ']\\s|\\s[,.;!?]|[,.;!?]\\s');
const POSSESSIVE = new RegExp('((?:[a-z0-9]+[\\s_.]+)?[a-z0-9]+)[' + esc(APOS) + ']s[\\s_.' + DASHES + ']*$');
// Networks: one may stand before a title ("Lifetime-Liz & Dick") or after it ("Victim of Love CBS 1991").
const NETWORKS = ['cbs', 'nbc', 'abc', 'fox', 'pbs', 'hbo', 'bbc', 'itv', 'cbc', 'ctv', 'tnt', 'tbs', 'showtime', 'lifetime', 'hallmark', 'freeform', 'cinemax', 'starz', 'mtv', 'vh1', 'bet', 'upn', 'wb', 'syfy', 'oxygen', 'lmn', 'disney', 'nickelodeon', 'harlequin'];
// Words that may stand in front of a title without making it a different one. (An article either way: a name may leave out the title's "The" and may add
// one. Refusing the added one was tried and measured: of the nine LIVE picks it demoted, five were the right film, "The King of Texas" and "The Girl in the Box"
// among them, and only four were another work, "The Descent" for "Descent" among them. So it is allowed, and the year or the runtime has to back a short title.)
const LEFT_OK = new Set(['the', 'a', 'an', ...NETWORKS]);
// What may follow a movie title beside the series rule's end words. Each is a whole-word run; match.js then asks the rest of the name to end too,
// so "Open Marriage Movie Night" is still a longer title.
const MOVIE_AFTER = ['movie', 'the movie', 'a movie', 'tv movie', 'the tv movie', 'full movie', 'film', 'the film', 'full film', 'tv film', 'television movie', 'television film', 'made for tv movie',
  'special', 'tv special', 'the special', 'documentary', 'english', 'tv', 'usa network', 'abc family', 'hallmark channel', 'hallmark movies and mysteries', ...NETWORKS];
// "Title aka Other Title": the same work under two names.
const AKA = /^[^a-z0-9]*(?:aka|a\.k\.a\.?|also known as)(?![a-z0-9])/;
// An episode of a series, not a movie: S01E02, S1 E5, 1x03, "Season 2". Season 0 is how Archive uploaders number specials (S00E07), so it is not counted.
const SERIES_EPISODE = /\bs0*[1-9]\d?[\s._-]?e(?:p\.?)?\s?\d{1,3}\b|\b[1-9]\d?x\d{2}\b|\bseason\s?[1-9]\d?\b/i;
// A date or a recording stamp at the very start of a name: 2011-09-21, 2023.12.10, 20221224, 03_18_1993, 10-1-23.
const STARTS_WITH_DATE = /^\s*(?:(?:19|20)\d{2}[-_. ]\d{1,2}[-_. ]\d{1,2}(?!\d)|(?:19|20)\d{6}(?!\d)|\d{1,2}[-_.]\d{1,2}[-_.](?:\d{2}|\d{4})(?!\d))/;

const coreOf = (title) => norm(title).replace(/^(?:the|a|an) /, '');
// The text the test reads: lower case, & as "and", apostrophes out, punctuation kept (the separators are what the test reads). idx[i] is where
// character i of t came from in s, so the left side can still see a possessive apostrophe that t no longer has.
function flatMap(raw) {
  const s = String(raw == null ? '' : raw).toLowerCase().replace(/&amp;/g, '&');
  let t = ''; const idx = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (APOS.includes(c)) continue;
    if (c === '&') { for (const ch of ' and ') { t += ch; idx.push(i); } continue; }
    t += c; idx.push(i);
  }
  return { s, t, idx };
}
function occurrences(core, t) {
  const re = new RegExp('(?:^|[^a-z0-9])(' + core.split(' ').map(esc).join('[^a-z0-9]+') + ')(?![a-z0-9])', 'g');
  const out = []; let m;
  while ((m = re.exec(t))) { const start = m.index + m[0].length - m[1].length; out.push({ start, end: start + m[1].length }); re.lastIndex = m.index + 1; }
  return out;
}
// "Stephen King's", "Wes Craven's", "Disney's": a possessive that names a person (two words) or a network. "Dogwalker's Christmas Tail" is not "A Christmas Tail".
function possessiveOk(prefix) { const m = POSSESSIVE.exec(prefix); return !!m && (/[\s_.]/.test(m[1]) || NETWORKS.includes(m[1])); }
// What stands before the title at t[pos]: nothing, a real separator, a possessive, or a few harmless words in a row (an article, a network, a track
// number such as 04 or a year). The words are peeled one at a time and what is left must end the same way, so the "the" of "Cry of the Banshee"
// does not make "Banshee" a title: "of" stands before it. A bare one or two digit number ("8 Women") is part of the other title.
function leftOk(t, s, idx, pos) {
  for (let i = 0; i < 4; i++) {
    const m = /([a-z0-9]+)([^a-z0-9]*)$/.exec(t.slice(0, pos));
    if (!m) return true; // only punctuation (or nothing) before it
    if (HARD_GAP.test(m[2].replace(/_/g, ' '))) return true;
    if (possessiveOk(s.slice(0, idx[pos]))) return true;
    if (!(LEFT_OK.has(m[1]) || /^0\d$/.test(m[1]) || /^\d{3,}$/.test(m[1]))) return false;
    pos = m.index;
  }
  return false;
}
function rightOk(rest) {
  if (AKA.test(rest)) return true;
  if (!M.closesName(rest, MOVIE_AFTER)) return false;
  const run = /^[^a-z0-9]*/.exec(rest)[0];
  if (run.length < rest.length && !HARD_GAP.test(run.replace(/_/g, ' '))) { // a plain space between: a small number or a roman numeral next is a sequel
    const tok = rest.slice(run.length).split(/[^a-z0-9]+/)[0];
    if (/^(?:[2-9]|1\d)$/.test(tok) || /^(?:ii|iii|iv|vi|vii|viii|ix|xi|xii)$/.test(tok)) return false;
  }
  return true;
}
// The words of a name with the years, quality tags, networks and filler taken out, sorted: "INSIDE Bo Burnham" and "Bo Burnham: Inside" are one bag.
const NOISE = new Set([...STOP, 'movie', 'film', 'tv', 'television', 'full', 'special', 'documentary', 'version', ...NETWORKS]);
const bagOf = (s) => norm(s).replace(/\b(?:19|20)\d{2}\b/g, ' ').replace(QUALITY_RE, ' ').split(' ').filter((w) => w && !NOISE.has(w) && !/^\d{3,4}p?$/.test(w)).sort().join(' ');

// "Perry Mason: The Case of the Killer Kiss" is often written "A Perry Mason Mystery - The Case of The Killer Kiss": a title with a colon or a spaced
// dash is also named when its parts stand in the name, whole and in order (the first with nothing glued in front, the last with the name ended behind it).
// Only for a title of three significant words or more, and every part must carry a word that is not filler ("The Movie" is not a part).
const PART_SPLIT = new RegExp('\\s*:\\s*|\\s+[' + DASHES + ']\\s+');
function titleParts(title) {
  const parts = String(title).split(PART_SPLIT).map(coreOf).filter(Boolean);
  return parts.length >= 2 && words(title).length >= 3 && parts.every(bagOf) ? parts : null;
}
function partsNamed(parts, t, s, idx) {
  let from = 0;
  for (let i = 0; i < parts.length; i++) {
    const hit = occurrences(parts[i], t).find((o) => o.start >= from && (i > 0 || leftOk(t, s, idx, o.start)) && (i < parts.length - 1 || rightOk(t.slice(o.end))));
    if (!hit) return false;
    from = hit.end;
  }
  return true;
}
// Does the movie's title stand as a phrase in any of the texts (file stem, upload title)?  { kind, in: the text it stands in }
//   names   a phrase with nothing glued in front and nothing run on behind it
//   words   the same words in another order and nothing else
//   longer  the words are there as a phrase but inside a longer title ("Wide Open Marriage", "Snow White On Ice")
//   none    the words are not there as a phrase
// `in` lists every text that carries the phrase (the year has to stand in one of those, see judgeFile).
function titlePhrase(title, texts) {
  const core = coreOf(title);
  if (!core) return { kind: 'none', in: [] };
  let longer = false;
  const named = [], same = [];
  const bag = bagOf(title), parts = titleParts(title);
  for (const raw of texts || []) {
    if (!raw || STARTS_WITH_DATE.test(String(raw))) continue;
    const { s, t, idx } = flatMap(raw);
    let hit = false;
    for (const o of occurrences(core, t)) {
      if (leftOk(t, s, idx, o.start) && rightOk(t.slice(o.end))) hit = true; else longer = true;
    }
    if (!hit && parts && partsNamed(parts, t, s, idx)) hit = true;
    if (hit) named.push(String(raw));
    else if (bag.split(' ').length >= 3 && bagOf(raw) === bag) same.push(String(raw)); // three words or more: two words in the other order are often another title (A Sister's Nightmare, Nightmare Sisters)
  }
  if (named.length) return { kind: 'names', in: named };
  if (same.length) return { kind: 'words', in: same };
  return { kind: longer ? 'longer' : 'none', in: [] };
}

// ---- judging one file ----
const within = (v, target, share) => target > 0 && Math.abs(v - target) <= target * share;
// A four-digit year in the text within a year of TMDB's.
const yearsIn = (text) => String(text).replace(/_/g, ' ').match(/\b(?:19|20)\d{2}\b/g) || []; // an underscore is a word character, so it would hide the year in "Dark_Tower_1943"
const yearNear = (text, year) => !!year && yearsIn(text).some((y) => Math.abs(+y - +year) <= 1);
// The names that carry the title name a year, and not one of them is the movie's (within two years, because uploaders date a VHS release or a
// rerun): it is another film with the same title (Grey Gardens 1975 for the 2009 film). A year inside the movie's own title ("Knight Rider 2000") is no evidence.
const yearConflict = (texts, year, title) => {
  if (!year) return false;
  const own = new Set(yearsIn(title));
  const ys = texts.flatMap(yearsIn).filter((y) => !own.has(y));
  return ys.length > 0 && !ys.some((y) => Math.abs(+y - +year) <= 2);
};
// f: a file of the item { stem, band, playable, seconds, fileSim, item?, collection? }; it: the upload { title, identifier?, collection? }; m: the movie { title, year, runtime }.
// Returns { conf, phrase, why: [short reasons], dropped?: { term, field, kind } }. conf is 0 to 1; LIVE is >= 0.85, REVIEW >= 0.5, below that the pick is not kept.
function judgeFile(f, it, m) {
  const out = { conf: 0, phrase: 'none', why: [] };
  const ex = hardExclude({ title: it.title, stem: f.stem, item: it.identifier || f.item, collection: it.collection || f.collection }, m.title);
  if (ex) { out.dropped = ex; out.why.push('hard exclude: ' + ex.term + ' in the ' + ex.field); return out; }
  const ph = titlePhrase(m.title, [f.stem, it.title]);
  out.phrase = ph.kind;
  const phraseOk = ph.kind === 'names' || ph.kind === 'words';
  const loose = Math.max(titleSim(it.title, m.title), f.fileSim || 0);
  const sim = phraseOk ? Math.max(loose, 0.9) : Math.min(loose, 0.89); // word overlap is a REVIEW-level guess, a phrase is a match
  let conf = 0;
  if (sim >= 0.9) conf += 0.5; else if (sim >= 0.75) conf += 0.35; else if (sim >= 0.6) conf += 0.2; else { out.why.push('title too different'); return out; }
  if (f.band === 'match') conf += 0.35; else if (f.band === 'near') conf += 0.15; else if (f.band === 'feature') conf += 0.2; else if (f.band === 'short') conf += 0.05; else { out.why.push('runtime off'); return out; }
  if (!phraseOk) out.why.push(ph.kind === 'longer' ? 'the title is inside a longer title' : 'the title is not a phrase in the file or upload name (word overlap only)');
  if (f.band !== 'match') out.why.push('runtime not within 15% of the TMDB runtime');
  const text = norm(`${it.title} ${f.stem}`);
  if (m.year && new RegExp(`\\b${m.year}\\b`).test(text)) conf += 0.1;
  if (JUNK_RE.test(f.stem) || JUNK_RE.test(it.title || '')) { conf -= 0.5; out.why.push('junk word'); }
  if (langRisk(f.stem) || langRisk(it.title)) { conf -= 0.35; out.why.push('language risk'); } // lands in REVIEW, never LIVE
  if (!f.playable) { conf -= 0.1; out.why.push('not playable in a browser'); }
  conf = Math.max(0, Math.min(1, conf));
  if (conf >= LIVE) { // the gates a pick must pass to stay LIVE
    const yearIn = ph.in.some((x) => yearNear(x, m.year)); // the year stands in a name that carries the title
    const rt5 = within((f.seconds || 0) / 60, m.runtime, 0.05);
    const n = Math.max(1, words(m.title).length);
    const hold = (why) => { conf = LIVE - 0.01; out.why.push(why); };
    if (!phraseOk) conf = LIVE - 0.01; // (the reason is already in the list)
    else if (!/\bseason\b/i.test(m.title) && !SERIES_EPISODE.test(tagText(m.title)) && (SERIES_EPISODE.test(tagText(f.stem)) || SERIES_EPISODE.test(tagText(it.title)))) hold('the name reads as an episode of a series (S01E02, 1x03, Season 2)');
    else if (yearConflict(ph.in, m.year, m.title)) hold('the name carries a year that is not the movie\'s (' + m.year + ')');
    else if (ph.kind === 'words' && !(yearIn || rt5)) hold('the title words are in another order and nothing backs it: no year in the name, runtime not within 5%');
    else if (n <= 2 && !(yearIn || rt5)) hold('short title: no year in the name and runtime not within 5%');
  }
  out.conf = conf;
  return out;
}
const judge = (f, it, m) => judgeFile(f, it, m).conf;

// itemScore: how promising an upload looks BEFORE its files are opened (decides which uploads cost an Archive call). Loose on purpose.
function itemScore(it, m) {
  const sim = titleSim(it.title, m.title);
  const text = norm(`${it.title} ${Array.isArray(it.description) ? it.description.join(' ') : it.description || ''}`);
  let s = sim;
  if (m.year && new RegExp(`\\b${m.year}\\b`).test(text)) s += 0.15;
  if (m.year && it.year && Math.abs(+it.year - +m.year) <= 1) s += 0.1;
  if (JUNK_RE.test(it.title || '')) s -= 0.5;
  if (/\bcollection\b|\bmarathon\b|\bblock\b|\btape\b/i.test(it.title || '') && sim < 0.9) s -= 0.1;
  return s;
}

module.exports = { LIVE, REVIEW, STOP, JUNK_RE, LANG_RISK, tagText, langRisk, cleanTitle, dice, titleSim, words, titlePhrase, judgeFile, judge, itemScore, STARTS_WITH_DATE, MOVIE_AFTER, yearNear };
