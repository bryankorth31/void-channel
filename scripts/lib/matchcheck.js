// MATCHER SELF-TEST: the doctor's "matcher" check. It catches the matcher's known failure modes before a bulk match runs, and
// counts the grids an earlier, looser matcher left behind. Reads only; writes nothing.
//   const { ok, detail, warn, fallback } = require('./lib/matchcheck').matcherCheck({ showsDir });
//   ok       false when a self-test fails (the matcher is broken: do not run a bulk match)
//   warn     true when self-listed grids over a real TVmaze list still carry picks whose item title does not name the show, or junk
//   fallback { count, grids: [{ slug, show, picks, unnamed, share, junk }] }, share = picks whose item title does not name the show,
//            junk = picks whose item title or file name trips the junk test (walkthrough, recap, commentary, compilation...)
// Two more checks read the grids on disk, each returns { warn, detail, ... }; matcherLight() puts all three on the one light the doctor shows:
//   seTitleCheck({ showsDir })  CP-004: the share of S/E-plus-title picks that sit below LIVE (0.85). A healthy catalog is near zero (about 1%); the old scoring left 28%.
//   sameDayCheck({ showsDir })  CP-005: more than 20% of the grids carrying one matchedAt day means a run restamped them all; matchedAt should move only when a grid's content does.
const fs = require('fs');
const path = require('path');
const PROFILE = require('./profile');

function matcherCheck(opts = {}) {
  const M = require('../match.js');
  const problems = [];
  const expect = (cond, msg) => { if (!cond) problems.push(msg); };

  // 1. The junk tests must catch what they were written for. Two of the four once held a backspace byte instead of a word
  //    boundary, so a walkthrough or a format variant passed as an episode.
  expect(M.isJunkItem('Walkthrough PS2', []), 'the fallback junk test lets "Walkthrough PS2" through');
  expect(M.isJunkFile('Fullmetal_Alchemist_3_Kami_o_Tsugu_Shoujo_HD_Walkthrough_part_1_of_7', ['fullmetal alchemist']), 'the fallback file test lets an underscore-named walkthrough through');
  expect(M.variantKey('Show_Name_512kb.mp4') === M.variantKey('Show_Name.mp4'), 'a format variant of one file counts as a second episode');
  expect(M.variantKey('Show_Name_01.mp4') !== M.variantKey('Show_Name_02.mp4'), 'two different episodes count as one');
  expect(!M.isJunkItem('The Bad Road Show', []), 'the junk test rejects words that only contain "ad" or "mix"');

  // 2. A show called "The Season" must not make the word "Season" another show; a real other show must still be caught.
  const list = M.makeOtherShows([{ name: 'The Season' }, { name: 'Family' }, { name: 'Collection' }, { name: 'Breaking Bad' }]);
  expect(list.length === 1 && list[0].core === 'breaking bad', 'one-word list titles still count as other shows');
  expect(!M.namesOtherShow('Forensic Files S03E04 Season 3 720p', 'Forensic Files', [], list), '"Season" marks a correct file as another show');
  expect(M.namesOtherShow('Breaking Bad S01E01 720p', 'Better Call Saul', [], list), 'a file named for a different show is not caught');

  // 3. Self-listed grids over a real TVmaze list (tvmazeWeak): count them, and say how many of their picks come from an upload
  //    whose title does not name the show. A grid built by the current matcher has none; an older one may.
  const showsDir = opts.showsDir || path.join(PROFILE.catalogDir, 'shows');
  const grids = [];
  let scanned = 0;
  for (const f of fs.existsSync(showsDir) ? fs.readdirSync(showsDir) : []) {
    if (!f.endsWith('.json')) continue;
    scanned++;
    let text;
    try { text = fs.readFileSync(path.join(showsDir, f), 'utf8'); } catch (e) { continue; }
    if (!text.includes('"tvmazeWeak"')) continue; // cheap test before the parse: only a few hundred grids carry the key
    let g;
    try { g = JSON.parse(text); } catch (e) { continue; }
    if (!g.tvmazeWeak) continue;
    const cores = [M.norm(g.show).replace(/^the /, ''), ...(M.BUILTIN_ALIASES[g.slug] || []).map(M.norm)];
    const nets = g.tvmaze && typeof g.tvmaze.network === 'string' && M.norm(g.tvmaze.network) ? [M.norm(g.tvmaze.network)] : []; // the show's own network
    let picks = 0, unnamed = 0, junk = 0;
    for (const se of g.seasons || []) for (const e of se.episodes || []) {
      if (!e.file) continue;
      picks++;
      if (!M.namesTitle(e.file.itemTitle || '', cores, nets)) unnamed++;
      if (M.isJunkItem(e.file.itemTitle || '', cores) || M.isJunkFile(e.file.name || '', cores)) junk++;
    }
    grids.push({ slug: g.slug || f.slice(0, -5), show: g.show, picks, unnamed, share: picks ? +(unnamed / picks).toFixed(2) : 0, junk });
  }
  grids.sort((a, b) => b.share - a.share || b.picks - a.picks);
  const bad = grids.filter((x) => x.unnamed > 0 || x.junk > 0);

  const ok = problems.length === 0;
  const parts = [ok ? 'self-tests pass' : problems.join('; ')];
  parts.push(grids.length + ' fallback grid(s) over a TVmaze list' + (bad.length ? ', ' + bad.length + ' with picks from uploads whose title does not name the show or that read as junk: ' + bad.slice(0, 5).map((x) => `${x.show} ${Math.round(x.share * 100)}% unnamed, ${x.junk} junk, of ${x.picks}`).join('; ') + (bad.length > 5 ? '; ...' : '') : ''));
  return { ok, detail: parts.join('; '), warn: ok && bad.length > 0, problems, fallback: { count: grids.length, scanned, grids } };
}

const GRID_FILES = (dir) => { try { return fs.readdirSync(dir).filter((f) => f.endsWith('.json')); } catch (e) { return []; } };

// CP-004. Among the picks that came from "S/E in filename + title match" (a file whose number AND title both fit the episode), those that are playable,
// not language-flagged and still below 0.85 should be rare: the number and the title agree, so only a penalty (another show, a reaction) can hold one back.
// Before the fix the old scoring left 4,516 of 16,000 (28%) there. Yellow above 5%.
function seTitleCheck(opts = {}) {
  const dir = opts.showsDir || path.join(PROFILE.catalogDir, 'shows');
  const limit = opts.limit == null ? 0.05 : opts.limit;
  let total = 0, below = 0, scanned = 0;
  for (const f of GRID_FILES(dir)) {
    let text;
    try { text = fs.readFileSync(path.join(dir, f), 'utf8'); } catch (e) { continue; }
    scanned++;
    if (!text.includes('title match')) continue; // cheap test before the parse
    let g;
    try { g = JSON.parse(text); } catch (e) { continue; }
    if (g.selfListed) continue;
    for (const se of g.seasons || []) for (const e of se.episodes || []) {
      const p = e.file;
      if (!p || !/S\/E in filename \+ title match/.test(p.why || '') || !p.playable || p.langRisk) continue;
      total++;
      if (typeof p.conf === 'number' && p.conf < 0.85) below++;
    }
  }
  const share = total ? below / total : 0;
  const warn = total > 0 && share > limit;
  const pct = (share * 100).toFixed(1) + '%';
  return { warn, total, below, share: +share.toFixed(4), scanned, detail: total ? `${below} of ${total} S/E-plus-title picks sit below LIVE (${pct}${warn ? ', should be near zero: the scoring may have slipped' : ''})` : 'no S/E-plus-title picks to measure' };
}

// CP-005. A grid's matchedAt is the day its content last changed (writeIfChanged leaves the stamp alone otherwise), so one day should not hold most of the catalog.
// More than 20% of the grids on one day means a run restamped them. A day older than maxAgeDays (3) is history, not a rewrite: after the first run with the
// content-only writer most grids keep the old day for weeks, and that must not read as a fault. The stamp is read from the first bytes of each file, nothing is parsed.
function sameDayCheck(opts = {}) {
  const dir = opts.showsDir || path.join(PROFILE.catalogDir, 'shows');
  const now = opts.now == null ? Date.now() : +opts.now;
  const maxAgeDays = opts.maxAgeDays == null ? 3 : opts.maxAgeDays;
  const days = new Map(); let n = 0;
  const buf = Buffer.alloc(1200);
  for (const f of GRID_FILES(dir)) {
    let fd;
    try { fd = fs.openSync(path.join(dir, f), 'r'); const len = fs.readSync(fd, buf, 0, buf.length, 0); const m = /"matchedAt"\s*:\s*"(\d{4}-\d\d-\d\d)/.exec(buf.toString('utf8', 0, len)); if (m) { n++; days.set(m[1], (days.get(m[1]) || 0) + 1); } } catch (e) { /* unreadable: the catalog check says so */ } finally { if (fd !== undefined) try { fs.closeSync(fd); } catch (e) { /* closed */ } }
  }
  const top = [...days.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : -1))[0];
  if (!top) return { warn: false, grids: 0, days: 0, detail: 'no matchedAt stamps to measure' };
  const [day, count] = top;
  const share = count / n;
  const ageDays = Math.max(0, (now - Date.parse(day + 'T23:59:59Z')) / 864e5);
  const warn = share > 0.2 && ageDays <= maxAgeDays;
  return { warn, grids: n, days: days.size, day, count, share: +share.toFixed(3), ageDays: +ageDays.toFixed(1), sameDay: share > 0.2,
    detail: warn ? `${Math.round(share * 100)}% of the grids (${count} of ${n}) carry the matchedAt day ${day}: a run restamped them instead of leaving the unchanged ones alone` : `matchedAt spread over ${days.size} day(s), the most on ${day} (${Math.round(share * 100)}%)` };
}

// The doctor's "matcher" light in one call: red when a self-test fails, yellow when any of the three checks warns, green otherwise.
//   const { level, detail, fix } = require('./lib/matchcheck').matcherLight({ showsDir });
function matcherLight(opts = {}) {
  const m = matcherCheck(opts);
  if (!m.ok) return { level: 'red', detail: m.detail, fix: 'Run node --test tests/match.test.js; do not run a bulk match until the matcher passes.', ok: false, checks: { matcher: m } };
  const t = seTitleCheck(opts), d = sameDayCheck(opts);
  const fixes = [m.warn && 'Re-match the listed shows (HQ > Shows > Re-match now).',
    t.warn && 'Most picks with a number and a title that fit should be LIVE: the scoring may have slipped. Run node --test tests/match.test.js, then node tests/match-dryrun.js (docs/RUNBOOK.md, matcher).',
    d.warn && 'Most grids carry one matchedAt day: a run restamped them. Check that scripts/match.js writes through writeIfChanged (docs/RUNBOOK.md, matcher).'].filter(Boolean);
  return { level: fixes.length ? 'yellow' : 'green', detail: [m.detail, t.detail, d.warn ? d.detail : ''].filter(Boolean).join('; '), fix: fixes.length ? fixes.join(' ') : undefined, ok: true, checks: { matcher: m, seTitle: t, sameDay: d } };
}

module.exports = { matcherCheck, seTitleCheck, sameDayCheck, matcherLight };
