// MATCHER SELF-TEST: the doctor's "matcher" check. It catches the matcher's known failure modes before a bulk match runs, and
// counts the grids an earlier, looser matcher left behind. Reads only; writes nothing.
//   const { ok, detail, warn, fallback } = require('./lib/matchcheck').matcherCheck({ showsDir });
//   ok       false when a self-test fails (the matcher is broken: do not run a bulk match)
//   warn     true when self-listed grids over a real TVmaze list still carry picks whose item title does not name the show, or junk
//   fallback { count, grids: [{ slug, show, picks, unnamed, share, junk }] }, share = picks whose item title does not name the show,
//            junk = picks whose item title or file name trips the junk test (walkthrough, recap, commentary, compilation...)
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
    let picks = 0, unnamed = 0, junk = 0;
    for (const se of g.seasons || []) for (const e of se.episodes || []) {
      if (!e.file) continue;
      picks++;
      const title = M.norm(e.file.itemTitle || '');
      if (!cores.some((c) => title.includes(c))) unnamed++;
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

module.exports = { matcherCheck };
