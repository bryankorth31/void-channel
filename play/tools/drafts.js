// VoidTV PLAY: draft cards in bulk from an Internet Archive collection (plan G3; Bryan, 20 Nov 2026: "Yes, add them").
// Licence: GPL-2.0-or-later (play/LICENSE).
//
//   node play/tools/drafts.js <collection> [--limit 50] [--system dos]
//   e.g. node play/tools/drafts.js softwarelibrary_kids        (the Kids learning games seed, T16)
//        node play/tools/drafts.js atari_2600_library --limit 40
//
// Nothing here puts a game on the shelf. Each item the Archive lists becomes a draft card in play/drafts/<collection>/,
// with what the Archive's own record says (title, year, maker, the file, its size, a DOS game's start program) and
// the machine's usual controls; a list of the drafts and what each still needs is written beside them. Bryan approves
// drafts one by one on the approve page (plan G4); an approved draft moves to play/cards. A DOS draft always needs a
// human look (its keys, whether it wants a mouse). Items for machines PLAY has no engine for are counted, not drafted.
// One polite request at a time, with a pause between. Nothing here needs AI to run (P11).
'use strict';
const fs = require('fs');
const path = require('path');

const PLAY = path.join(__dirname, '..');
const Cards = require('../src/cards.js');
const PAUSE_MS = 1200;
const UA = 'PLAY-drafts-tool/1.0 (one request at a time)';

// What the Archive's "emulator" field or the collection says about the machine, and the file kinds each takes.
const MACHINES = {
  dos: { emulators: ['dosbox'], files: /\.zip$/i },
  a2600: { emulators: ['atari2600', 'a2600'], collections: ['atari_2600_library'], files: /\.(a26|bin|zip)$/i },
  nes: { emulators: ['nes'], collections: ['nes_library', 'softwarelibrary_nes'], files: /\.(nes|zip)$/i },
  snes: { emulators: ['snes'], collections: ['softwarelibrary_snes'], files: /\.(sfc|smc|zip)$/i },
  genesis: { emulators: ['genesis', 'megadriv'], collections: ['sega_genesis_library', 'softwarelibrary_genesis'], files: /\.(md|gen|bin|zip)$/i },
  sms: { emulators: ['sms'], collections: ['sega_master_system_library'], files: /\.(sms|zip)$/i },
  gamegear: { emulators: ['gamegear'], collections: ['sega_game_gear_library'], files: /\.(gg|zip)$/i },
  gameboy: { emulators: ['gameboy'], collections: ['gameboy_library'], files: /\.(gb|zip)$/i },
  gbcolor: { emulators: ['gbcolor'], collections: ['gameboy_color_library'], files: /\.(gbc|zip)$/i },
  gba: { emulators: ['gba'], collections: ['consoledemos_gba', 'softwarelibrary_gba'], files: /\.(gba|zip)$/i },
  lynx: { emulators: ['lynx'], collections: ['lynx-library', 'softwarelibrary_lynx'], files: /\.(lnx|lyx|zip)$/i },
};
const CORE_FOR = Object.fromEntries(Object.entries(Cards.CORES).flatMap(([name, c]) => c.systems.map((s) => [s, name])));

// Pure (tested): which machine an Archive record is for, or null.
function machineOf(rec, collection) {
  const emu = String([].concat(rec.emulator || '')[0] || '').toLowerCase().split(/[\s-]/)[0];
  for (const [sys, m] of Object.entries(MACHINES)) if (m.emulators.includes(emu)) return sys;
  for (const [sys, m] of Object.entries(MACHINES)) if ((m.collections || []).includes(collection)) return sys;
  return null;
}

// A card id from a title: lower case, words joined by dashes, the year on the end ("number-munchers-1990").
const slug = (title, year) => (String(title).toLowerCase().replace(/&/g, ' and ').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
  + (year ? '-' + year : '')).replace(/-+/g, '-');
// "Oregon Trail, The" reads "The Oregon Trail"; the Archive's "(woz-a-day collection)" and the like go.
const cleanTitle = (t) => String(t).replace(/\s*\((?:[^)]*collection|\d{4}[^)]*)\)\s*/gi, ' ').replace(/^(.*), (The|A|An)$/, '$2 $1').trim();

// Pure (tested): a draft card from the Archive's record and its chosen file. needs: what a person must still look at.
function draft(rec, file, sys, collection) {
  const year = +String(rec.year || rec.date || '').slice(0, 4) || null;
  const title = cleanTitle(rec.title || rec.identifier);
  const card = {
    id: slug(title, year), title, year, publisher: String([].concat(rec.creator || rec.publisher || '')[0] || ''),
    system: sys, core: CORE_FOR[sys], players: 1,
    archive: { item: rec.identifier, file: file.name, size: +file.size || 0 },
  };
  const needs = [];
  if (sys === 'dos') {
    const start = String([].concat(rec.emulator_start || '')[0] || '');
    if (start) card.archive.start = start; else needs.push('start program');
    card.controls = { kind: 'dos-keys', keys: ['Enter', 'Escape', 'Space'], dpad: true, keyboard: true };
    card.actions = [{ do: 'Confirm', press: 'Enter' }, { do: 'Back out', press: 'Escape' }, { do: 'Go on', press: 'Space' }];
    card.vars = { dosbox_pure_aspect_correction: 'true' };
    needs.push('keys and mouse');
  } else {
    card.controls = { kind: 'pad', dpad: true, keys: ['P1:B', 'P1:A', 'P1:Select', 'P1:Start'] };
    card.actions = [{ do: 'Move', press: ['P1:Left', 'P1:Right', 'P1:Up', 'P1:Down'] }, { do: 'Start', press: 'P1:Start' }, { do: 'Main button', press: 'P1:A' }];
    needs.push('button words');
  }
  if (!year) needs.push('year');
  // A learning collection says what kind the games are (the Kids list is learning games, T16); elsewhere the facts
  // tool (G1) looks the genre up when the draft is approved, and the draft says to check it.
  if (/kids|edu/i.test(collection)) card.genre = ['educational video game']; else needs.push('genre');
  card.help = '';
  card.draft = { from: collection, needs, item: 'https://archive.org/details/' + rec.identifier };
  return card;
}

async function get(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error('The Archive answered ' + r.status);
  await new Promise((ok) => setTimeout(ok, PAUSE_MS));
  return r.json();
}

async function main() {
  const [collection] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (!collection || !/^[A-Za-z0-9._-]+$/.test(collection)) { console.error('Name an Archive collection, e.g. softwarelibrary_kids'); process.exit(1); }
  const opt = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
  const limit = +opt('limit', 200), only = opt('system', null);
  const q = 'https://archive.org/advancedsearch.php?q=' + encodeURIComponent('collection:' + collection)
    + ['identifier', 'title', 'year', 'date', 'creator', 'publisher', 'emulator', 'emulator_start'].map((f) => '&fl[]=' + f).join('')
    + '&rows=' + Math.min(limit, 1000) + '&sort[]=downloads+desc&output=json';
  const docs = (await get(q)).response.docs;
  const dir = path.join(PLAY, 'drafts', collection);
  fs.mkdirSync(dir, { recursive: true });
  const shelf = new Set(fs.readdirSync(path.join(PLAY, 'cards')).map((f) => JSON.parse(fs.readFileSync(path.join(PLAY, 'cards', f), 'utf8')).archive.item));
  const list = [], skipped = {};
  for (const rec of docs) {
    const sys = machineOf(rec, collection);
    if (!sys || !CORE_FOR[sys] || (only && sys !== only)) { const k = String([].concat(rec.emulator || 'unknown')[0]); skipped[k] = (skipped[k] || 0) + 1; continue; }
    if (shelf.has(rec.identifier)) { list.push({ item: rec.identifier, state: 'on the shelf' }); continue; }
    let files;
    try { files = (await get('https://archive.org/metadata/' + encodeURIComponent(rec.identifier) + '/files')).result || []; } catch (e) { list.push({ item: rec.identifier, state: 'could not read: ' + e.message }); continue; }
    const file = files.filter((f) => MACHINES[sys].files.test(f.name) && f.source === 'original').sort((a, b) => b.size - a.size)[0]
      || files.filter((f) => MACHINES[sys].files.test(f.name)).sort((a, b) => b.size - a.size)[0];
    if (!file) { list.push({ item: rec.identifier, state: 'no game file found' }); continue; }
    const card = draft(rec, file, sys, collection);
    const bad = Cards.check(card);
    fs.writeFileSync(path.join(dir, card.id + '.json'), JSON.stringify(card, null, 2) + '\n');
    list.push({ id: card.id, item: rec.identifier, title: card.title, system: sys, size: card.archive.size, needs: card.draft.needs, check: bad });
    console.log('draft  ' + card.id + '  (' + sys + ', ' + Math.round(card.archive.size / 1024) + ' KB; needs ' + card.draft.needs.join(', ') + ')');
  }
  fs.writeFileSync(path.join(PLAY, 'drafts', collection + '.json'), JSON.stringify({ collection, made: new Date().toISOString(), drafts: list, skipped }, null, 2) + '\n');
  console.log(list.filter((x) => x.id).length + ' drafts in play/drafts/' + collection + '/; not drafted (no engine yet): ' + JSON.stringify(skipped));
}

module.exports = { machineOf, draft, slug, cleanTitle, MACHINES };
if (require.main === module) main().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
