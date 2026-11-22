// VoidTV PLAY: whole collections on the shelf (Bryan, 20 Nov 2026: "Yes, whole collections"; "pull in the Sega libraries
// and build the NES libraries as well"). Licence: GPL-2.0-or-later (play/LICENSE).
//
//   node play/tools/library.js        build play/library/<system>/<n>.json from the gathered, boot-checked rows
//
// Plan C2 and C6. The rows come from the PLAY assistant's gathering and start-up check, one row per game:
// audit/play-mode/collections/<system>.jsonl, each { item, file, system, title, year, publisher, size, source, boot: { ok, why, at } }.
// Only a row whose game started (ok) becomes a card; only a system whose collection Bryan approved (play/collections.json,
// plan C1) is read. Cards are made by console-cards.js's rules (the machine's own default controls and help). A
// hand-made card wins over a drafted one for the same Archive item or the same id (C6), and two rows that make the same
// id keep the first. Cards ship in bundles of up to 500 (Cloudflare Pages takes 20,000 files a deploy; one file a
// card would pass that), and play/tools/shelf.js lists them on the shelf. Nothing here needs AI to run (HQ manual mode).
'use strict';
const fs = require('fs');
const path = require('path');
const Cons = require('./console-cards.js');
const Cards = require('../src/cards.js');
const Drafts = require('./drafts.js');

const PLAY = path.join(__dirname, '..');
const ROOT = path.join(PLAY, '..');
// PLAY_AUDIT: the audit folder (not in git, so a worktree points this at the main checkout's).
const AUDIT = process.env.PLAY_AUDIT || path.join(ROOT, 'audit');
const ROWS = process.env.PLAY_ROWS || path.join(AUDIT, 'play-mode', 'collections');   // PLAY_ROWS: another folder, for a trial
const LIB = path.join(PLAY, 'library');
const PER = 500;

const collections = () => JSON.parse(fs.readFileSync(path.join(PLAY, 'collections.json'), 'utf8')).collections;

// Pure (tested): the cards for one system's rows, given the ids and items the hand-made cards already hold.
function build(rows, taken) {
  const ids = new Set(taken.ids), items = new Set(taken.items), out = [];
  // A game the shelf has by name already (another upload of it) is a second copy: the first card stays.
  const names = new Set(taken.names || []);   // '<system> <nameKey(title)>'
  for (const r of rows) {
    // The start-up check's answer: the assistant's rows carry it as boot: { ok, why, at }; a plain ok is read too.
    // The content screen (the assistant's content-screen.js; adult and abusive titles were found in the 2600 library):
    // a flagged game, adult or abusive, never reaches PLAY (Bryan, 20 Nov 2026: adult-themed games "Kept out entirely";
    // the abusive ones "are bad"), and neither does a row the screen has not read.
    if (!r || !('content' in r) || (r.content && r.content.flag)) continue;
    // Finished games only (Bryan, 20 Nov 2026: "Yes, that rule"): no unfinished homebrew, demos, prototypes, test
    // builds, hacks or picture cartridges. A doubtful game comes in only when Bryan kept it on his weed-down page.
    if (!finished(r) || LEAVE[r.item]) continue;
    if (!(r.boot ? r.boot.ok : r.ok) || !r.item || !r.file || !(Cons.MACHINES[r.system] || r.system === 'dos') || items.has(r.item)) continue;
    // A PC (DOS) game needs its start program, which the start-up check found (or repaired); it gets the hand-made DOS
    // cards' keys, keyboard and mouse, by the drafts tool's rule.
    if (r.system === 'dos' && !r.start) continue;
    const c = r.system === 'dos' ? dosCard(r) : Cons.card({ system: r.system, title: r.title, item: r.item, source: r.source },
      { name: r.file, size: r.size || 0, start: r.start || '' }, { year: r.year, creator: r.publisher });
    if (!c.archive.size) delete c.archive.size;
    if (c.year > (LAST[r.system] || 9999)) c.year = null;   // an upload's date, not the game's
    // The Archive's play count from the gathering (its search does not return some libraries' items; plays.json wins).
    if (r.plays > 0) c.plays = r.plays;
    if (ids.has(c.id) || names.has(c.system + ' ' + nameKey(c.title)) || Cards.check(c).length) continue;
    c.added = 'Whole collections (Bryan, 20 Nov 2026: "Pull those shelves in"); started in the PLAY start-up check';
    ids.add(c.id); items.add(r.item); names.add(c.system + ' ' + nameKey(c.title)); out.push(c);
  }
  return out.sort((a, b) => a.title.localeCompare(b.title));
}

// A game's name for spotting a second copy: no case, no spaces or marks, no machine word, "The" not counted.
const nameKey = (t) => String(t).toLowerCase().replace(/\b(ms-?dos|dos|the)\b/g, '').replace(/[^a-z0-9]+/g, '');

// Items kept off by name, read by the PLAY lead from the games-to-add batch (22 Nov 2026), each with its reason. Fan
// works and copies of games the shelf already has fail the finished-games rule; a game with adult content waits on
// Bryan's word, as gambling and horror do.
const LEAVE = {
  fluttershy_bin: 'a Sonic 3 hack', '3Dblastdirectorscut': 'a Sonic 3D Blast hack', wolf_bin: 'a fan port of Wolfenstein 3D to the Genesis',
  msdos_ASCII_DOOM_1999: 'a fan game', 'msdos_Doom_-_The_Roguelike_2005': 'a fan game', doomeng_dos: 'a DOOM engine build, not a game',
  'msdos_Commander_Keen_7_-_The_Keys_of_Krodacia_2006': 'a fan-made Keen', 'msdos_Commander_Keen_8_-_Dead_in_the_Desert_2009': 'a fan-made Keen',
  'msdos_Commander_Keen_9_-_Battle_of_the_Brains_2011': 'a fan-made Keen', msdos_The_Lost_Episodes_of_Doom_1995: 'a DOOM level pack',
  msdos_Wolfendoom_2000: 'a DOOM mod', xmaswolf: 'a Wolfenstein 3D mod', gayblade: 'a Windows 3.1 game, not DOS', micro95_3mb: 'a Windows 95 program',
  doomII: 'a second copy of Doom II (Doom-2 stays)', 'WOLF3D-MS-DOS': 'a second copy of Wolfenstein 3D (msdos_Wolfenstein_3D_1992 stays)',
  freedos_edit_09a_: 'a text editor, not a game', DUKE1EXT: 'a level add-on for Duke Nukem', Dos_Mario: 'a fan-made Mario clone (Wiering, 1994)',
  duke_bin: 'Duke Nukem 3D on the Genesis (held with Duke Nukem 3D)',
  checkit_30: 'a PC test program, not a game (the auditor, 22 Nov)', msdos_Beyond_Castle_Wolfenstein_1985: 'its program ends at once in our player (the auditor, 22 Nov)',
  msdos_Duke_Nukems_Penthouse_Paradise_1997: 'adult content: kept out entirely',
  msdos_Duke_Assault_1997: 'a Duke Nukem 3D add-on (held with Duke Nukem 3D)', 'msdos_Duke_it_out_in_D.C._1997': 'a Duke Nukem 3D add-on (held with Duke Nukem 3D)',
  DUKE3D_DOS: 'held: adult content (Bryan\'s call)', 'grand-theft-auto-1997-dma-design': 'held: crime and adult themes (Bryan\'s call)',
};

// Pure (tested): a PC game's card from its row: the drafts tool's DOS card, with the start program the check used.
function dosCard(r) {
  // The machine is said by the shelf, not the name: "Doom 2 (MS-DOS)", "MS-DOS: Stunts (VGA Graphics and SoundBlaster)",
  // "Duke Nukem 3D (DOS)", "Antarctic Adventure [MS-DOS]" read as a box would print them.
  const title = String(r.title).replace(/^MS-DOS:\s*/i, '').replace(/\s*[([](MS-)?DOS[)\]]/gi, '').replace(/\s+-\s+(MS-)?DOS$/i, '')
    .replace(/\s*\((EGA|CGA|VGA)[^)]*\)\s*$/i, '').trim();
  const c = Drafts.draft({ identifier: r.item, title, year: r.year, creator: r.publisher }, { name: r.file, size: r.size || 0 }, 'dos', 'top');
  c.archive.start = r.start;
  delete c.draft;
  return c;
}

// Pure (tested): whether a row is a finished game the shelf may take. Not: unfinished homebrew (WIP), demos,
// prototypes, betas, test builds, picture cartridges, hacks (the assistant's hack screen); and, until Bryan says,
// gambling and horror. Bryan's Keep on his weed-down page (r.weed === 'keep') lets a doubtful game in; Drop never.
const UNFINISHED = /\b(wip|demo|beta|test|kernel|sample|pd|pda)\b|proto(type)?\b|\bv0 \d|\b19xx\b|point-of-purchase|greeting cart|^image\b|\(hack\)|\bhack\b/i;
const HELD = /casino|poker|slots?\b|blackjack|black jack|roulette|gambl|halloween|chainsaw/i;   // gambling and horror: Bryan's call
// Each machine's last commercial year: a later date is a homebrew, a hack or an upload date (the audit).
const LAST = { a2600: 1992, nes: 1995, snes: 1999, gameboy: 2003, gbcolor: 2003, gba: 2008, lynx: 1995, genesis: 1998, sms: 1998, gamegear: 1997, dos: 1999 };   // DOS: a later date is homebrew or a fan port (Super Mario 64 MS-DOS Port, 2020)   // the Master System lived on in Brazil (Tec Toy) to 1998
// Mods, patches and level packs of another game are not finished games of their own (the games-to-add batch, 21 Nov
// 2026: "Sonic Doom - Doom 2 Mod", a Wolfenstein "Lost Episode" patch, a DOOM level); nor are the Sonic.exe fan games.
const FAN = /\b(polish|translat\w*|unlocked|pirate|bootleg|among us|fan made|fanmade|mod|patch|wads?|level pack|megawad|total conversion|doom level|fan port|ms-?dos port|pc port)\b|\.wad\b|\.exe\b|\bexe\b/i;
function finished(r) {
  // The title, the Archive item and the file name, with _ - . read as spaces (the audit: "a-team_prototype" slipped by).
  const name = [r.title, r.item, r.file].join(' ').replace(/[_.\-]+/g, ' ');
  if (r.weed === 'drop') return false;
  if (r.weed === 'keep') return true;
  if (r.held) return false;   // horror or gambling, marked by the assistant's screen: Bryan's call
  if (UNFINISHED.test(name) || HELD.test(name) || FAN.test(name)) return false;
  if (r.likelyHack) return false;
  // The content screen's words, read again from the title itself (the audit: NBA Jam XXX), and a personal upload with
  // no year and no maker (half of those were hacks: Pokemon Prism, SMB 3 MIX); Bryan's weed-down keeps the real ones.
  if (/\b(xxx|porn\w*|hentai|nude|naked|sex\w*|erotic|blowjob|fuck\w*)\b/i.test(name)) return false;
  if (r.source !== 'curated' && !r.year && !String(r.maker || r.publisher || '').trim()) return false;
  // Dated after its machine's life: doubtful, unless Wikidata knows it as a game on that machine (then the date is the
  // upload's, and the card leaves the year empty rather than put the game in the wrong decade).
  // Wikidata's match is by name ("dk2" matched Donkey Kong 2), so a late date also needs a real dump's region tag.
  const year = r.year || +(/\b(19[789]\d|20[0-3]\d)\b/.exec(name) || [])[1] || 0;   // or the year in its name
  if (year > (LAST[r.system] || 9999) && !(r.wikidata === true && REGION.test(String(r.file) + ' ' + String(r.title)))) return false;
  return true;
}
const REGION = /\((u|usa|e|eu|europe|j|japan|w|world|ue|ju|jue|us)\)|\(\s*u\s*\)|\[!\]|\(usa, europe\)/i;

// Pure (tested): bundles of PER cards, named <system>/<n>.
function bundles(system, cards) {
  const out = [];
  for (let i = 0; i < cards.length; i += PER) out.push({ name: system + '/' + (i / PER + 1), cards: cards.slice(i, i + PER) });
  return out;
}

// The top 150 a machine (Bryan, 20 Nov 2026: "im more of the mind to have top 150"): the assistant's start-checked batch,
// one file for every machine, and the games to add after it (Bryan, 21 Nov 2026: "start adding more of the games from
// all of the consoles including dos, that were based on popularity and review"; "keep all of them, go ahead"), in
// consoles/more-rows.json. A game there started (it is in rows, not in failed); a likely hack waits for his weed-down;
// a row the content screen has not read stays off (build). Pure (tested).
const TOP = path.join(AUDIT, 'play-mode', 'consoles', 'console-rows.json');
const MORE = path.join(AUDIT, 'play-mode', 'consoles', 'more-rows.json');
// The clean Genesis copies from the variations shelf (Bryan, 22 Nov 2026: "Yes, fetch them"): a region mark and no
// altered mark, one copy a game; the doubtful ones are likelyHack and wait for his weed-down like the rest.
const GENVAR = path.join(AUDIT, 'play-mode', 'consoles', 'genvar-rows.json');
function topRows(system, list, weed) {
  const w = weed || { keep: [], drop: [] };
  return (list || []).filter((r) => r.system === system)
    .map((r) => Object.assign({}, r, { publisher: r.maker, boot: { ok: true, from: 'top-150 start-up check' },
      weed: (w.drop || []).includes(r.item) ? 'drop' : (w.keep || []).includes(r.item) ? 'keep' : undefined }));
}
// Bryan's choices from his weed-down page (audit/play-mode/weed/<system>.html, "Copy my choices"), saved as
// audit/play-mode/weed/choices-<system>.json: { system, keep: [items], drop: [items] }.
const readWeed = (system) => { try { return JSON.parse(fs.readFileSync(path.join(AUDIT, 'play-mode', 'weed', 'choices-' + system + '.json'), 'utf8')); } catch (e) { return null; } };
const readList = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')).rows || []; } catch (e) { return []; } };
const readTop = () => readList(process.env.PLAY_TOP || TOP);
const readMore = () => readList(process.env.PLAY_MORE || MORE);
const readGenvar = () => readList(process.env.PLAY_GENVAR || GENVAR);

function readRows(system) {
  const f = path.join(ROWS, system + '.jsonl');
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } });
}

function main() {
  const hand = fs.readdirSync(path.join(PLAY, 'cards')).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(PLAY, 'cards', f), 'utf8')));
  const taken = { ids: hand.map((c) => c.id), items: hand.map((c) => c.archive.item), names: hand.map((c) => c.system + ' ' + nameKey(c.title)) };
  fs.rmSync(LIB, { recursive: true, force: true });
  let total = 0;
  const top = readTop(), more = readMore(), genvar = readGenvar();
  for (const system of [...new Set(collections().map((c) => c.system))]) {
    // A collection's own rows first (the Archive's curated libraries), then the start-checked batches its lines name:
    // "top150" the top 150, "more" the games to add (21 Nov 2026), "top150+more" both, "genvar" the clean Genesis copies.
    const from = collections().filter((c) => c.system === system).map((c) => c.from || '').join(' ');
    const weed = readWeed(system);
    const cards = build(readRows(system).concat(/top150/.test(from) ? topRows(system, top, weed) : [],
      /more/.test(from) ? topRows(system, more, weed) : [], /genvar/.test(from) ? topRows(system, genvar, weed) : []), taken);
    for (const c of cards) { taken.ids.push(c.id); taken.items.push(c.archive.item); taken.names.push(c.system + ' ' + nameKey(c.title)); }
    for (const b of bundles(system, cards)) {
      const f = path.join(LIB, b.name + '.json');
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, JSON.stringify({ bundle: b.name, cards: b.cards }) + '\n');
    }
    total += cards.length;
    console.log('library  ' + system + '  ' + cards.length + ' games');
  }
  console.log('Library: ' + total + ' games. Now run: node play/tools/shelf.js');
}

if (require.main === module) main();
module.exports = { build, bundles, topRows, dosCard, finished, LEAVE, PER };
