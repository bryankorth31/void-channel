// VoidTV PLAY: whole collections on the shelf (Bryan, 20 Nov 2026: "Yes, whole collections"; "pull in the Sega libraries
// and build the NES libraries as well"). Licence: GPL-2.0-or-later (play/LICENSE).
//
//   node play/tools/library.js        build play/library/<system>/<n>.json from the gathered, boot-checked rows
//
// Plan C2 and C6. The rows come from the PLAY assistant's gathering and start-up check, one row per game:
// audit/play-mode/collections/<system>.jsonl, each { item, file, system, title, year, publisher, size, source, ok, why }.
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

const PLAY = path.join(__dirname, '..');
const ROOT = path.join(PLAY, '..');
const ROWS = process.env.PLAY_ROWS || path.join(ROOT, 'audit', 'play-mode', 'collections');   // PLAY_ROWS: another folder, for a trial
const LIB = path.join(PLAY, 'library');
const PER = 500;

const collections = () => JSON.parse(fs.readFileSync(path.join(PLAY, 'collections.json'), 'utf8')).collections;

// Pure (tested): the cards for one system's rows, given the ids and items the hand-made cards already hold.
function build(rows, taken) {
  const ids = new Set(taken.ids), items = new Set(taken.items), out = [];
  for (const r of rows) {
    if (!r || !r.ok || !r.item || !r.file || !Cons.MACHINES[r.system] || items.has(r.item)) continue;
    const c = Cons.card({ system: r.system, title: r.title, item: r.item, source: r.source },
      { name: r.file, size: r.size || 0, start: r.start || '' }, { year: r.year, creator: r.publisher });
    if (!c.archive.size) delete c.archive.size;
    if (ids.has(c.id) || Cards.check(c).length) continue;
    c.added = 'Whole collections (Bryan, 20 Nov 2026: "Pull those shelves in"); started in the PLAY start-up check';
    ids.add(c.id); items.add(r.item); out.push(c);
  }
  return out.sort((a, b) => a.title.localeCompare(b.title));
}

// Pure (tested): bundles of PER cards, named <system>/<n>.
function bundles(system, cards) {
  const out = [];
  for (let i = 0; i < cards.length; i += PER) out.push({ name: system + '/' + (i / PER + 1), cards: cards.slice(i, i + PER) });
  return out;
}

function readRows(system) {
  const f = path.join(ROWS, system + '.jsonl');
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } });
}

function main() {
  const hand = fs.readdirSync(path.join(PLAY, 'cards')).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(PLAY, 'cards', f), 'utf8')));
  const taken = { ids: hand.map((c) => c.id), items: hand.map((c) => c.archive.item) };
  fs.rmSync(LIB, { recursive: true, force: true });
  let total = 0;
  for (const system of [...new Set(collections().map((c) => c.system))]) {
    const cards = build(readRows(system), taken);
    for (const c of cards) { taken.ids.push(c.id); taken.items.push(c.archive.item); }
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
module.exports = { build, bundles, PER };
