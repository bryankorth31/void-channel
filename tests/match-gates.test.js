// The matcher's gates (audit 25 Oct 2026, batch C2; B, 26 Oct: "Go batch C2"). Run: node --test tests/match-gates.test.js
// 1. Hate and extremist material is a hard exclude everywhere (DECISIONS.md M19). The list names the material, not the topic, so history
//    documentaries about the Nazis or the Klan stay (B approved the draft list, 26 Oct, audit/2026-10-25/C2-hate-list-draft.md, groups 1 to 3).
// 2. News, politics and government are a hard exclude for TV series too, read by words (B, 26 Oct: "By words"): an upload that says news,
//    election, hearing, C-SPAN, committee and the like is refused, after the show's own name and the episode's own guide name are set aside;
//    a C-SPAN or government collection is refused; a TV News Archive recording of a documentary or a comedy is not.
// 3. A file named only by its upload's description never matches (M4): a gate, not a penalty.
// 4. A dub is never LIVE, and an English copy of the same episode is offered first (M5).
// 5. A file B accepted in HQ ships LIVE on a show listed from its own files, even when the self-list would have passed it over (M12).
// Each test fails on the matcher before this change. Nothing here touches the catalog or the disk.
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../scripts/match.js');
const { hardExclude } = require('../scripts/lib/hardexclude');

let uid = 0;
const file = (name, o = {}) => ({ name, file: name + '.mp4', format: 'h.264', playable: true, seconds: 1500, band: 'episode', sizeMB: 200, nameHit: true, ep: null, url: 'https://example.invalid/g' + (uid++), ...o });
const se = (season, episode) => ({ season, episode });
const WORDS = ['Quokka Parade', 'The Election', 'Marble Harvest', 'Copper Lantern'];
const tv = () => ({ id: 7, name: 'Zork Show', runtime: 25, premiered: '2000-01-01', network: 'Nowhere', episodes: WORDS.map((w, i) => ({ season: 1, number: i + 1, name: w, airdate: '2000-02-0' + (i + 1) })) });
const ENTRY = { name: 'Zork Show', type: 'Comedy', network: 'Nowhere' };
const grid = (items, ov = {}) => M.gridFor(ENTRY, { items }, tv(), { ov });
const ep = (g, n) => g.seasons[0].episodes.find((e) => e.number === n);

test('hate list: a Red Ice Radio upload is refused; history documentaries about the Nazis or the Klan are not', () => {
  const hit = hardExclude({ title: 'The Ancient Giants Who Ruled America - Richard J. Dewhurst with Red Ice Radio (January 27, 2014)' });
  assert.ok(hit && hit.kind === 'hate', 'Red Ice is refused as hate material');
  assert.equal(hardExclude({ title: 'Stefan Molyneux archive (Greatest hits)' }).kind, 'hate');
  for (const t of ["Hitler's Henchmen 1-12 Hess the Deputy 480p", 'Klansville U.S.A. (American Experience)', 'Frontline: Return of ISIS', 'The World at War']) assert.equal(hardExclude({ title: t }), null, t);
});

test('series news gate: an "Election Night Coverage" upload is refused, a sitcom episode called "The Election" is not', () => {
  const news = { id: 'zork-show-election-night', title: 'Zork Show Election Night Coverage', files: [file('Zork Show S01E01 Quokka Parade', { ep: se(1, 1) })] };
  const sitcom = { id: 'zork-show-season-1', title: 'Zork Show Season 1', files: [file('Zork Show S01E02 The Election', { ep: se(1, 2) })] };
  const g = grid([news, sitcom]);
  assert.equal(ep(g, 1).file, null, 'the election-night upload places nothing');
  assert.equal(ep(g, 2).file && ep(g, 2).file.item, 'zork-show-season-1', 'the episode named The Election keeps its file');
});

test('series news gate: a C-SPAN collection is refused; a TV News Archive recording of a documentary is not', () => {
  const cspan = { id: 'zork-show-s1', title: 'Zork Show Season 1', collection: ['cspan'], files: [file('Zork Show S01E03 Marble Harvest', { ep: se(1, 3) })] };
  assert.equal(ep(grid([cspan]), 3).file, null);
  const doc = { id: 'DW_20230524_141500_Zork_Show', title: 'Zork Show : DW : May 24, 2023 2:15pm-3:00pm CEST', collection: ['tvnews'], files: [file('Zork Show S01E04 Copper Lantern', { ep: se(1, 4) })] };
  assert.equal(ep(grid([doc]), 4).file && ep(grid([doc]), 4).file.item, 'DW_20230524_141500_Zork_Show', 'a documentary recorded off a news channel stays (B, 26 Oct)');
});

test('description-only naming is a gate: an upload whose title, identifier and file name never name the show places nothing', () => {
  const dump = { id: 'random-upload-77', title: 'Random Upload 77', description: 'some episodes of Zork Show and other things', files: [file('S01E01 Quokka Parade', { ep: se(1, 1), nameHit: false })] };
  assert.equal(ep(grid([dump]), 1).file, null);
  // B accepted it in HQ: his word stands
  assert.equal(ep(grid([dump], { acceptFiles: ['random-upload-77|S01E01 Quokka Parade'] }), 1).file.item, 'random-upload-77');
});

test('a dub is never LIVE, and an English copy of the same episode comes first', () => {
  const fr = { id: 'zork-show-vf', title: 'Zork Show', files: [file('Zork Show S01E01 Quokka Parade FRENCH', { ep: se(1, 1) })] };
  const alone = ep(grid([fr]), 1);
  assert.equal(alone.file.langRisk, true);
  assert.notEqual(alone.state, 'LIVE', 'a dub alone is REVIEW at most');
  const en = { id: 'zork-show-en', title: 'Zork Show', files: [file('Zork Show S01E01 Quokka Parade', { ep: se(1, 1), sizeMB: 50 })] };
  const both = ep(grid([fr, en]), 1);
  assert.equal(both.file.item, 'zork-show-en', 'the English file is the one that plays');
});

test('a file accepted in HQ ships LIVE on a self-listed show, even one the self-list would have passed over', () => {
  const entry = { name: 'Blorp Hour', type: 'Comedy', network: 'Nowhere' };
  const item = { id: 'blorp-hour-complete', title: 'Blorp Hour Complete', files: [1, 2, 3].map((n) => file(`Blorp Hour S01E0${n}`, { ep: se(1, n) })).concat([file('Blorp Hour S01E04 FRENCH', { ep: se(1, 4) })]) };
  const accept = ['blorp-hour-complete|Blorp Hour S01E01', 'blorp-hour-complete|Blorp Hour S01E04 FRENCH'];
  const g = M.gridFor(entry, { items: [item] }, null, { ov: { acceptFiles: accept } });
  assert.ok(g.selfListed, 'listed from its own files');
  const e1 = g.seasons[0].episodes.find((e) => e.number === 1), e4 = g.seasons[0].episodes.find((e) => e.number === 4), e2 = g.seasons[0].episodes.find((e) => e.number === 2);
  assert.equal(e1.state, 'LIVE', 'the accepted episode is LIVE');
  assert.ok(e4 && e4.file && e4.state === 'LIVE', 'the accepted dub is kept, as B chose');
  assert.equal(e2.state, 'REVIEW', 'the rest stay REVIEW');
});
