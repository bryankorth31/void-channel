// KIDS HQ: the Kids area of Void TV HQ (Bryan, 18 Nov 2026: "Void TV should hold all of it in just different tabs"; plan
// docs/PLAN-hq-areas.md, K1). Kids runs fully from HQ with no AI help by 28 Nov 2026.
// K1, the show list: approve, deny or add a show here instead of REVIEW.html, Export and approve.js (his 17 Nov export
// sat unapplied for a day because applying it needed a typed command).
// Data: profiles/kids (on this PC it is the same folder the kids worktree C:\Users\bryan\void-kids sees, through a junction).
// Writes only profiles/kids/list.json, the same fields approve.js writes, with a dated backup before the first change of a day.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const KIDS = process.env.KIDS_DIR ? path.resolve(process.env.KIDS_DIR) : path.join(ROOT, 'profiles', 'kids');
const LIST = () => path.join(KIDS, 'list.json');
const SHOWS = () => path.join(KIDS, 'catalog', 'shows');
const STRICT = () => path.join(KIDS, 'catalog', 'strict-report.json');

// The same slug the kids scripts use (approve.js, make-list.js, hunt.js, match.js).
const norm = (s) => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const slug = (s) => norm(s).replace(/ /g, '-').replace(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/, '$1-show');
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const today = () => new Date().toISOString().slice(0, 10);

// Why the kids strict match kept no file, in plain words (the counts come from catalog/strict-report.json).
const WHY = {
  noLiveMatch: 'files that could not be matched to a listed episode',
  runtime: 'files too short or too long to be an episode (clips, compilations)',
  words: 'files named as clips, sing-alongs, interviews or remakes',
  reputation: 'uploads from accounts the kids rules do not trust',
  series: 'files of another series',
  unplayable: 'files a browser cannot play',
  collection: 'whole-collection uploads',
  perFile: 'every file needs a person to check it',
};

function reasonFor(show, strict) {
  if (!show.tvmaze) return 'No TVmaze episode list yet, so episodes cannot be placed (set its TVmaze id, then Hunt more).';
  if ((strict.noCandidates || []).includes(show.name)) return 'Nothing found on the Archive yet: Hunt more.';
  const r = (strict.shows || {})[show.name];
  if (!r) return 'Not hunted yet: Hunt more.';
  if (!r.files) return 'Nothing found on the Archive yet: Hunt more.';
  const top = Object.entries(r.rejected || {}).sort((a, b) => b[1] - a[1]).slice(0, 2).filter(([, n]) => n > 0);
  const why = top.map(([k, n]) => `${n} ${WHY[k] || k}`).join('; ');
  return `${r.kept || 0} of ${r.files || 0} Archive files kept${why ? '. Turned away: ' + why : ''}.`;
}

function stateOf(s) { return s.approved ? 'approved' : s.denied ? 'denied' : 'waiting'; }

// Everything the Shows tab needs: the counts, each show with its episodes and, when it plays nothing, why.
function shows() {
  const list = readJson(LIST(), { shows: [] });
  const strict = readJson(STRICT(), {});
  const held = new Set(((list.held || {}).shows) || []);
  const rows = (list.shows || []).map((s) => {
    const g = readJson(path.join(SHOWS(), slug(s.name) + '.json'), null);
    const cov = (g && g.coverage) || null;
    const live = cov ? cov.live : 0;
    const row = { name: s.name, slug: slug(s.name), type: s.type || '', age: s.age || '', year: s.year || '', network: s.network || '', tier: s.tier || '', flags: s.flags || [], rating: s.rating || '', state: stateOf(s), live, total: cov ? cov.total : 0, reviewedAt: s.reviewedAt || '', note: s.reviewNote || '', addedInHq: s.addedInHq || '' };
    if (row.state === 'approved' && !live) row.reason = reasonFor(s, strict);
    return row;
  });
  const counts = { all: rows.length, approved: 0, denied: 0, waiting: 0, approvedEmpty: 0, playing: 0 };
  for (const r of rows) { counts[r.state]++; if (r.state === 'approved') { if (r.live) counts.playing++; else counts.approvedEmpty++; } }
  return { counts, shows: rows, types: list.types || [], held: [...held], heldReason: (list.held || {}).reason || '', strictAt: strict.generatedAt || '' };
}

// list.json holds every approval: write it whole, through a temp file, with one backup a day before the first change.
function writeList(list) {
  const f = LIST();
  const bak = path.join(KIDS, `list.before-hq-${today()}.json`);
  if (!fs.existsSync(bak) && fs.existsSync(f)) fs.copyFileSync(f, bak);
  const t = f + '.tmp';
  fs.writeFileSync(t, JSON.stringify(list, null, 1));
  for (let i = 0; ; i++) {
    try { fs.renameSync(t, f); return; } catch (e) {
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(e.code) || i >= 20) throw new Error('Could not save the kids show list (' + e.code + '); close anything that has it open and try again.');
      const end = Date.now() + 250; while (Date.now() < end) { /* wait a moment */ }
    }
  }
}

// approve | deny | clear (back to waiting). The same fields approve.js writes.
function decide(name, d, note) {
  if (!['approve', 'deny', 'clear'].includes(d)) throw new Error('decision must be approve, deny or clear');
  const list = readJson(LIST(), null);
  if (!list || !Array.isArray(list.shows)) throw new Error('profiles/kids/list.json is missing or not readable');
  const s = list.shows.find((x) => x.name === name || slug(x.name) === slug(name));
  if (!s) throw new Error('No kids show named ' + name);
  if (d === 'clear') { s.approved = false; delete s.denied; }
  else { s.approved = d === 'approve'; if (d === 'deny') s.denied = true; else delete s.denied; }
  if (typeof note === 'string' && note.trim()) s.reviewNote = note.trim().slice(0, 300);
  s.reviewedAt = today();
  writeList(list);
  return { name: s.name, state: stateOf(s), approved: list.shows.filter((x) => x.approved).length };
}

// A show Bryan adds is approved (he chose it) and marked addedInHq, so make-list.js keeps it on a re-run.
function add({ name, type, year, network, tvmaze }) {
  name = String(name || '').replace(/\s+/g, ' ').trim();
  if (!name || name.length > 120) throw new Error('Type the show\'s name (up to 120 letters).');
  const list = readJson(LIST(), null);
  if (!list || !Array.isArray(list.shows)) throw new Error('profiles/kids/list.json is missing or not readable');
  if (list.shows.some((x) => slug(x.name) === slug(name))) throw new Error(name + ' is already on the kids list.');
  const types = list.types || [];
  if (!types.includes(type)) throw new Error('Pick a row: ' + types.join(', '));
  const y = +year || 0;
  if (year && (y < 1900 || y > 2100)) throw new Error('The year should look like 1985.');
  const s = { name, type, network: String(network || '').trim().slice(0, 60), year: y || undefined, tier: 'added', flags: [], approved: true, reviewedAt: today(), addedInHq: today() };
  const tv = +tvmaze || 0; if (tv > 0) s.tvmaze = tv;
  list.shows.push(s);
  writeList(list);
  return { name, slug: slug(name), approved: list.shows.filter((x) => x.approved).length };
}

module.exports = { KIDS, slug, shows, decide, add, reasonFor, WHY };
