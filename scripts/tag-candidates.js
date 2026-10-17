// Tag candidates from data, for a person to confirm (HQ or by hand); changes nothing.
//   node scripts/tag-candidates.js            prints candidates for each proposed tag
// Uses TMDB keywords cached in catalog/cache/tmdb-keywords.json (fetched 17 Oct 2026 for 12,701 shows) plus
// title patterns and a hand-picked list. Proposed tags: "420 & Stoner Comedy", "Satire",
// "Conspiracies & the Unexplained" (the last also means: NOT counted as History / Discovery / Science).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const K = JSON.parse(fs.readFileSync(path.join(ROOT, 'catalog', 'cache', 'tmdb-keywords.json'), 'utf8'));
const L = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'show-list.json'), 'utf8'));
const slug = (s) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const playing = (sl) => { try { const g = JSON.parse(fs.readFileSync(path.join(ROOT, 'catalog', 'shows', sl + '.json'), 'utf8')); let n = 0; for (const se of g.seasons || []) for (const e of se.episodes || []) if (e.file && e.file.playable) n++; return n; } catch (e) { return 0; } };

const STONER_LIST = ['Trailer Park Boys', "That '70s Show", 'Workaholics', 'Broad City', 'High Maintenance', 'Disjointed', 'Weeds', 'Bong Appétit', 'Cooking on High', 'Squidbillies', 'Tim and Eric Awesome Show, Great Job!', 'Xavier: Renegade Angel', 'Aqua Teen Hunger Force', 'Off the Air', 'The Big Lez Show', "Grandma's House", 'Weediquette', 'Hempsters', 'The Eric Andre Show', 'Mr. Show with Bob and David'];
const STONER_KW = /\b(marijuana|cannabis|stoner|weed|pot smoking|smoking pot|420|getting high|hemp)\b/i;
const SATIRE_KW = /\b(satire|political satire|satirical|news parody|mockumentary|spoof|social satire)\b/i;
const CONSP_KW = /\b(conspiracy|ancient aliens?|ancient astronaut|extraterrestrial|ufo|alien abduction|paranormal|ghost hunting|ghost hunter|haunting|cryptid|cryptozoology|bigfoot|sasquatch|pseudoscience|pseudohistory|psychic|unexplained|area 51|illuminati|nostradamus|lost civilization|atlantis)\b/i;
const CONSP_TITLE = /\b(aliens?|ufos?|ghosts?|haunted|haunting|paranormal|bigfoot|sasquatch|monsterquest|cryptid|unexplained|unxplained|conspirac(y|ies)|psychic|in search of|oak island|skinwalker|hangar 1|area 51|nostradamus|lost tapes|bermuda)\b/i;
const nonfiction = (s) => /Documentary|Reality/.test(s.type) || (s.tags || []).some((t) => /History|Discovery|TLC|Nature|Science/.test(t));

const row = (s, why) => ({ show: s.name, type: s.type, tags: (s.tags || []).join(' / '), playing: playing(slug(s.name)), why });
const out = { stoner: [], satire: [], conspiracy: [] };
for (const s of L.shows) {
  const kw = K[slug(s.name)] || [];
  const k = (re) => kw.filter((x) => re.test(x)).slice(0, 3).join(', ');
  if (STONER_LIST.some((n) => n.toLowerCase() === s.name.toLowerCase()) || k(STONER_KW)) out.stoner.push(row(s, k(STONER_KW) || 'hand-picked'));
  if (k(SATIRE_KW)) out.satire.push(row(s, k(SATIRE_KW)));
  if (nonfiction(s) && (k(CONSP_KW) || CONSP_TITLE.test(s.name))) out.conspiracy.push(row(s, k(CONSP_KW) || 'title only: check it is not real history'));
}
for (const [tag, rows] of Object.entries(out)) {
  rows.sort((a, b) => b.playing - a.playing);
  console.log('\n== ' + tag + ': ' + rows.length + ' candidates, ' + rows.filter((r) => r.playing).length + ' playing');
  for (const r of rows) console.log('  ' + String(r.playing).padStart(4) + '  ' + r.show + '  [' + (r.tags || r.type) + ']  ' + r.why);
}
