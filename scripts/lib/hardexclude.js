// HARD EXCLUDE (standing rule R-005): politics, government and news are out everywhere. The show list builders already
// keep them off the list; this module is the same rule for the FILES the movie hunt judges (audit CP-023), so a C-SPAN
// recording or a council meeting never plays under a film title.
//
//   const { HARD_EXCLUDE, hardExclude } = require('./lib/hardexclude');
//   hardExclude({ title: itemTitle, stem: fileStem, item: archiveIdentifier, collection: ['tvnews', ...] }, movieTitle)
//     -> null when nothing matches, or { term, field, kind } naming what matched and where.
//
// The text is read the way file names are written: lower case, & as "and", apostrophes gone, every other run of
// punctuation (. _ - and the rest) one space, so "CSPAN2_2020", "C-SPAN" and "c span" are all one thing.
//
// A real film may have one of these words in its OWN title (a film called "Election", "The Committee", "Council of
// Trent"). The movie's title is taken out of the text before the words are tested, so the film's own file name
// ("Election.1999.720p") passes while "House Judiciary Committee Hearing" for a film called "Committee" still fails on
// "hearing". Only the movie's own words are excused, never the rest of the name.
//
// By hand: node -e "console.log(require('./scripts/lib/hardexclude').hardExclude({ stem: 'CSPAN2_20201204_Senate_Hearing' }, 'Crossfire'))"
// prints the match; null means the name is clean.

// What counts, as one pattern over the normalised text. Groups, in order:
//   government   C-SPAN; committee and subcommittee; hearing(s); council; school board, select board, selectmen, planning or zoning board;
//                board of education / supervisors / commissioners / trustees; city, county or town commission or meeting; work session;
//                press conference and press briefing
//   politics     election(s)
//   news         news (evening news, nightly news, eyewitness news, news special), newscast
const HARD_EXCLUDE = new RegExp('(?:^| )(' + [
  'c ?span ?\\d?',
  'sub ?committees?', 'committees?',
  '(?<!hard of )hearings?(?! (?:the|and|impaired|loss|aids?|tests?|voices?|dogs?)(?: |$))',
  'councils?',
  'school boards?', 'select ?boards?', 'selectmen', 'planning (?:board|commission)', 'zoning (?:board|commission)',
  'board of (?:education|supervisors|commissioners|trustees|aldermen|directors|selectmen|regents)',
  '(?:city|county|town|village) (?:commission|commissioners|meeting)',
  'work sessions?',
  '(?:press|news) conferences?', 'press briefings?',
  'elections?',
  'news', 'newscasts?',
].join('|') + ')(?= |$)', 'i');

// The Internet Archive's TV News Archive names every recording CHANNEL_YYYYMMDD_HHMMSS_Title (CSPAN2_20201204_183200_..., CNNW_..., KPIX_...), and
// files them under the collection "tvnews". It is a news archive whatever the channel airs, so the name alone is enough. A phone clip
// ("VID_20230216_131500") has no title after the time and is not this.
const TV_NEWS_ID = /^[A-Z][A-Z0-9]{1,13}_\d{8}_\d{6}_/;
// Archive collections that are news or government by definition (what the Archive itself calls them).
const NEWS_COLLECTION = /^(?:tvnews|tvarchive|newsandpublicaffairs|tv-[a-z0-9]+|cspan[a-z0-9]*|executive_branch_archive|us_senate_archive|us_congress_archive|trumparchive|trumpadministration)$/i;

// HATE AND EXTREMIST MATERIAL (DECISIONS.md M19; the list B approved on 26 Oct 2026, audit/2026-10-25/C2-hate-list-draft.md, groups 1 to 3).
// It names the material, not the topic: slogans and codes, propagandists and their outlets, jihadist media. A history documentary about the
// Nazis, the Klan or ISIS names none of these, so it stays. Never excused by a title (no film or show is entitled to these words).
// Adding one: a phrase here, lower case with single spaces, and a line in tests/match-gates.test.js.
const HATE = new RegExp('(?:^| )(' + [
  'white power', 'white pride world wide', 'white genocide', 'great replacement', 'race war', 'racial holy war', 'rahowa', 'sieg heil', 'heil hitler',
  '14 words', '1488', 'blood and soil', 'day of the rope', 'jews will not replace us',
  'stefan molyneux', 'freedomain', 'david duke', 'william luther pierce', 'national alliance', 'richard spencer', 'american renaissance', 'jared taylor',
  'red ice', 'lana lokteff', 'nick fuentes', 'stormfront', 'daily stormer', 'andrew anglin', 'atomwaffen', 'patriot front', 'vanguard america', 'identity evropa',
  'al hayat media', 'dabiq', 'amaq', 'isis nasheed',
].join('|') + ')(?= |$)');
// Collections that are government by definition. For TV series these refuse a file; the TV News Archive itself does not (B, 26 Oct: series are
// judged by words, so a documentary or a comedy recorded off a news channel stays).
const GOV_COLLECTION = /^(?:cspan[a-z0-9]*|executive_branch_archive|us_senate_archive|us_congress_archive|trumparchive|trumpadministration)$/i;

const KIND = (term) => (/^c ?span|committee|hearing|council|board|selectmen|commission|meeting|session|press|news conference/.test(term) ? 'government' : /election/.test(term) ? 'politics' : 'news');

// lower case, & as "and", apostrophes out, every other run of non-alphanumerics one space, padded with a space each side
const flat = (s) => ' ' + String(s == null ? '' : s).toLowerCase().replace(/&amp;/g, ' and ').replace(/&/g, ' and ').replace(/['’`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim() + ' ';

// Take the movie's own title out of a flattened text, with and without its leading article, so a film called "Election" is not
// punished for its own name. Longer phrase first.
function withoutOwn(text, own) {
  if (!own) return text;
  const full = flat(own);
  let t = text.split(full).join(' ');
  const core = full.replace(/^ (?:the|a|an) /, ' ');
  if (core !== full) t = t.split(core).join(' ');
  return t;
}

// fields: { title, stem, item, collection } (any may be missing); own: the movie's title. Returns null or { term, field, kind }.
function hardExclude(fields, own) {
  const f = fields || {};
  const hate = hateIn(f); if (hate) return hate;
  const colls = [].concat(f.collection == null ? [] : f.collection).map(String);
  for (const c of colls) if (NEWS_COLLECTION.test(c)) return { term: c, field: 'collection', kind: /cspan/i.test(c) ? 'government' : 'news' };
  for (const [field, raw] of [['item', f.item], ['stem', f.stem]]) if (raw && TV_NEWS_ID.test(String(raw))) return { term: String(raw).split('_')[0], field, kind: /^CSPAN/.test(String(raw)) ? 'government' : 'news' };
  for (const [field, raw] of [['title', f.title], ['stem', f.stem], ['item', f.item]]) {
    if (!raw) continue;
    const m = HARD_EXCLUDE.exec(withoutOwn(flat(raw), own));
    if (m) return { term: m[1].trim(), field, kind: KIND(m[1]) };
  }
  return null;
}

function hateIn(f) {
  for (const [field, raw] of [['title', f.title], ['stem', f.stem], ['item', f.item]]) { const m = raw && HATE.exec(flat(raw)); if (m) return { term: m[1], field, kind: 'hate' }; }
  return null;
}

// The same rule for the FILES of a TV series (audit 25 Oct, batch C2), read by words (B, 26 Oct). fields as above; own: the names to set aside
// before the words are tested. A show's name is set aside with and without its article ("The News Room" is not news); an episode's guide name
// only as the whole phrase, so the episode "The Election" passes while "Election Night Coverage" for the same show does not.
//   seriesExclude({ title, stem, item, collection }, { show: ['Zork Show'], episodes: ['The Election'] }) -> null or { term, field, kind }
function seriesExclude(fields, own) {
  const f = fields || {};
  const hate = hateIn(f); if (hate) return hate;
  for (const c of [].concat(f.collection == null ? [] : f.collection).map(String)) if (GOV_COLLECTION.test(c)) return { term: c, field: 'collection', kind: 'government' };
  const shows = (own && own.show) || [], eps = (own && own.episodes) || [];
  for (const [field, raw] of [['title', f.title], ['stem', f.stem]]) {
    if (!raw) continue;
    let t = flat(raw);
    for (const s of shows) t = withoutOwn(t, s);
    for (const e of eps) { const p = flat(e); if (p.trim()) t = t.split(p).join(' '); }
    const m = HARD_EXCLUDE.exec(t);
    if (m) return { term: m[1].trim(), field, kind: KIND(m[1]) };
  }
  return null;
}

module.exports = { HARD_EXCLUDE, HATE, TV_NEWS_ID, NEWS_COLLECTION, GOV_COLLECTION, hardExclude, seriesExclude, flat };
