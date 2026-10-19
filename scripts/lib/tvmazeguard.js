// TVMAZE NAME GUARD (audit CP-034): is the show TVmaze offered for a list entry the same show?
// scripts/hunt.js and scripts/retvmaze.js ask TVmaze for a name and take the top hit. The old check let any hit through whose name
// contained the list name (or the reverse), or shared 60% of its words, so "The Trap" (a German show) was graded against "The Trap Door"
// (a British cartoon) and "I Love the 70s" against "I Love the '90s". This function is the one decision both scripts use.
//
//   const { nearNameGuard } = require('./lib/tvmazeguard');
//   nearNameGuard({ name: 'The Trap', type: 'World TV', language: 'de' }, { name: 'The Trap Door', language: 'English', type: 'Animation', premiered: '1986-10-06' })
//     -> { ok: false, near: true, kind: 'language', reason: 'language differs: the list says de, TVmaze says English' }
//
// entry: a show-list entry { name, type, language? }. A year can come from the name itself: "The Twilight Zone (1985)" (or from entry.year).
// tv: what TVmaze returned { name, premiered?, language?, type?, genres? }. A field that is missing counts as "no objection", so a cached TVmaze
// file (name, premiered and network only) still gets the name and year checks.
//
// The decision:
//   the same name once case, punctuation, a trailing "(...)" on the list name and a leading "The" are set aside   accepted
//   a name the old check would also have refused                                                                    refused (different show)
//   any other name is a NEAR name, and a near name is refused when
//       a known year differs by more than one                                                                       (the year says another show)
//   and otherwise accepted only when
//       the known year agrees (within one), or
//       the shorter name is a whole-word phrase of the longer AND the language and the type agree
//   language disagrees: both sides name a language and they differ
//   type disagrees: TVmaze says Animation (or the Anime genre) and the list row is not Animated, Anime or Adult Swim; or the list row is
//       Animated or Anime and TVmaze says a type that is not Animation
// By hand: node -e "console.log(require('./scripts/lib/tvmazeguard').nearNameGuard({ name: 'The Trap', type: 'World TV', language: 'de' }, { name: 'The Trap Door', language: 'English', type: 'Animation' }))"
const fs = require('fs');
const path = require('path');

// Lower case, accents taken off (Carnivàle = Carnivale, Shōgun = Shogun), & as "and", the multiplication sign as x (Spy×Family), punctuation gone.
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/×/g, ' x ').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
// The name for the "same name" test: a trailing "(...)" on the list name and every article (the, a, an) set aside.
const key = (name) => norm(String(name || '').replace(/\(.*?\)/g, ' ')).split(' ').filter((w) => w && !/^(?:the|a|an)$/.test(w)).join(' ');
// The old rule, kept as the first filter so this guard can only be stricter than it was: containment, or 60% of the longer word list.
function oldCheckAccepts(listName, tvName) {
  const a = norm(String(listName || '').replace(/\(.*?\)/g, '')), b = norm(tvName);
  if (!a || !b) return false;
  const bag = (t) => new Set(t.replace(/^the /, '').split(' ').filter((w) => w.length > 2));
  const A = bag(a), B = bag(b);
  if (!A.size || !B.size) return a.includes(b) || b.includes(a);
  let hit = 0; for (const w of A) if (B.has(w)) hit++;
  return b.includes(a) || a.includes(b) || hit / Math.max(A.size, B.size) >= 0.6;
}
const phraseOf = (shorter, longer) => !!shorter && (' ' + longer + ' ').includes(' ' + shorter + ' ');

// TVmaze names a language in English; the list uses ISO codes. Chinese is written zh and cn in the list.
const LANG = { english: 'en', japanese: 'ja', spanish: 'es', korean: 'ko', german: 'de', turkish: 'tr', french: 'fr', swedish: 'sv', catalan: 'ca', thai: 'th', chinese: 'zh', mandarin: 'zh', cantonese: 'zh', norwegian: 'no', italian: 'it', hebrew: 'he', danish: 'da',
  portuguese: 'pt', russian: 'ru', tagalog: 'tl', filipino: 'tl', hindi: 'hi', polish: 'pl', lithuanian: 'lt', tamil: 'ta', marathi: 'mr', bengali: 'bn', zulu: 'zu', afrikaans: 'af', finnish: 'fi', dutch: 'nl', hungarian: 'hu', kannada: 'kn', galician: 'gl',
  romanian: 'ro', czech: 'cs', malayalam: 'ml', telugu: 'te', arabic: 'ar', greek: 'el', icelandic: 'is', ukrainian: 'uk', persian: 'fa', indonesian: 'id', vietnamese: 'vi', urdu: 'ur', serbian: 'sr', croatian: 'hr', bulgarian: 'bg' };
const langCode = (s) => { if (!s) return null; const t = String(s).trim().toLowerCase(); const c = LANG[t] || (/^[a-z]{2}$/.test(t) ? t : null); return c === 'cn' ? 'zh' : c; };
const ANIMATED_ROWS = new Set(['Animated', 'Anime', 'Adult Swim']);
const listYear = (entry) => { const y = entry.year != null ? +entry.year : (/\((\d{4})\)/.exec(entry.name || '') || [])[1]; return y ? +y : null; };

function nearNameGuard(entry, tv) {
  const e = entry || {}, t = tv || {};
  const a = key(e.name), b = key(t.name);
  if (!a || !b) return { ok: false, near: false, kind: 'name', reason: 'a name is missing' };
  if (a === b) return { ok: true, near: false, kind: 'same', reason: 'same name' };
  if (!oldCheckAccepts(e.name, t.name)) return { ok: false, near: false, kind: 'different', reason: 'a different show: the names share too little' };
  const out = (ok, kind, reason) => ({ ok, near: true, kind, reason });
  const ly = listYear(e), ty = t.premiered ? +String(t.premiered).slice(0, 4) : null;
  if (ly && ty && Math.abs(ly - ty) > 1) return out(false, 'year', `year differs: the list says ${ly}, TVmaze premiered ${ty}`);
  if (ly && ty) return out(true, 'year', `near name, year agrees (${ly} and ${ty})`);
  const lc = langCode(e.language), tc = langCode(t.language);
  if (lc && tc && lc !== tc) return out(false, 'language', `language differs: the list says ${e.language}, TVmaze says ${t.language}`);
  const tvAnimated = t.type === 'Animation' || (Array.isArray(t.genres) && t.genres.includes('Anime'));
  if (tvAnimated && !ANIMATED_ROWS.has(e.type)) return out(false, 'type', `type differs: TVmaze says Animation, the list row is ${e.type || 'unknown'}`);
  if (!tvAnimated && t.type && (e.type === 'Animated' || e.type === 'Anime')) return out(false, 'type', `type differs: the list row is ${e.type}, TVmaze says ${t.type}`);
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (phraseOf(shorter, longer)) return out(true, 'phrase', `near name: "${shorter}" is a whole-word phrase of "${longer}", language and type agree`);
  return out(false, 'name', 'near name: neither a known year nor a whole-word phrase ties the two names together');
}

// The console line both scripts print for a refused near name, and the record HQ reads (catalog/cache/tvmaze-rejected.json, git-ignored).
const rejectLine = (listName, tvName, g) => `   TVmaze offered "${tvName}" for "${listName}": ${g.near ? 'near name refused' : 'not the same show'} (${g.reason}); treating as no match`;
function saveRejected(cacheDir, rec) {
  try {
    const file = path.join(cacheDir, 'tvmaze-rejected.json');
    let list = []; try { list = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { /* first one */ }
    list = list.filter((x) => x.listName !== rec.listName).concat({ ...rec, at: new Date().toISOString() });
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(list, null, 1));
  } catch (e) { /* a log that cannot be written must not stop a hunt */ }
}

module.exports = { nearNameGuard, oldCheckAccepts, langCode, listYear, rejectLine, saveRejected, key };
