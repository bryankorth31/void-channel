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

const PLAY = path.join(__dirname, '..');
const ROOT = path.join(PLAY, '..');
const ROWS = process.env.PLAY_ROWS || path.join(ROOT, 'audit', 'play-mode', 'collections');   // PLAY_ROWS: another folder, for a trial
const LIB = path.join(PLAY, 'library');
const PER = 500;

const collections = () => JSON.parse(fs.readFileSync(path.join(PLAY, 'collections.json'), 'utf8')).collections;

// Pure (tested): the cards for one system's rows, given the ids and items the hand-made cards already hold. adult: the
// 18+ shelf's cards instead (Bryan, 20 Nov 2026: adult-themed games behind a gate; the abusive ones "are bad": never).
function build(rows, taken, adult) {
  const ids = new Set(taken.ids), items = new Set(taken.items), out = [];
  for (const r of rows) {
    // The start-up check's answer: the assistant's rows carry it as boot: { ok, why, at }; a plain ok is read too.
    // The content screen (the assistant's content-screen.js; adult and abusive titles were found in the 2600 library):
    // a flagged game never reaches the shelf, and neither does a row the screen has not read.
    if (!r || !('content' in r)) continue;
    const kind = r.content && r.content.flag ? r.content.kind : null;
    if (kind === 'abusive' || (r.content && r.content.flag && kind !== 'adult')) continue;
    if (adult ? kind !== 'adult' : kind) continue;
    // Finished games only (Bryan, 20 Nov 2026: "Yes, that rule"): no unfinished homebrew, demos, prototypes, test
    // builds, hacks or picture cartridges. A doubtful game comes in only when Bryan kept it on his weed-down page.
    if (!finished(r)) continue;   // the 18+ shelf too (the audit: picture carts of real named women must go nowhere)
    // The adult titles whose kind a person must read first (the audit: some "adult" ones are sexual assault in all but
    // name): none goes on the 18+ shelf until Bryan has read the list.
    if (adult && READ_FIRST.test((r.title || '') + ' ' + (r.item || ''))) continue;
    if (!(r.boot ? r.boot.ok : r.ok) || !r.item || !r.file || !Cons.MACHINES[r.system] || items.has(r.item)) continue;
    const c = Cons.card({ system: r.system, title: r.title, item: r.item, source: r.source },
      { name: r.file, size: r.size || 0, start: r.start || '' }, { year: r.year, creator: r.publisher });
    if (!c.archive.size) delete c.archive.size;
    if (ids.has(c.id) || Cards.check(c).length) continue;
    c.added = 'Whole collections (Bryan, 20 Nov 2026: "Pull those shelves in"); started in the PLAY start-up check';
    if (adult) { c.adult = true; c.adultWhy = r.content.reason || 'adult'; }
    ids.add(c.id); items.add(r.item); out.push(c);
  }
  return out.sort((a, b) => a.title.localeCompare(b.title));
}

// Pure (tested): whether a row is a finished game the shelf may take. Not: unfinished homebrew (WIP), demos,
// prototypes, betas, test builds, picture cartridges, hacks (the assistant's hack screen); and, until Bryan says,
// gambling and horror. Bryan's Keep on his weed-down page (r.weed === 'keep') lets a doubtful game in; Drop never.
const UNFINISHED = /\b(wip|demo|proto(type)?|beta|test|kernel|sample)\b|point-of-purchase|greeting cart|^image\b|\(hack\)|\bhack\b/i;
const HELD = /casino|poker|slots?\b|blackjack|black jack|roulette|gambl|halloween|chainsaw/i;   // gambling and horror: Bryan's call
const READ_FIRST = /beat 'em|beat em|philly flasher|knight on the town|x-man|custer|bachelor|harem|porky|cathouse|gigolo|jungle fever|burning desire|lady in wading/i;
function finished(r) {
  const name = (r.title || '') + ' ' + (r.item || '');
  if (r.weed === 'drop') return false;
  if (UNFINISHED.test(name) || HELD.test(name)) return false;
  if (r.likelyHack && r.weed !== 'keep') return false;
  return true;
}

// Pure (tested): bundles of PER cards, named <system>/<n>.
function bundles(system, cards) {
  const out = [];
  for (let i = 0; i < cards.length; i += PER) out.push({ name: system + '/' + (i / PER + 1), cards: cards.slice(i, i + PER) });
  return out;
}

// The top 150 a machine (Bryan, 20 Nov 2026: "im more of the mind to have top 150"): the assistant's start-checked batch,
// one file for every machine. A game there started (it is in rows, not in failed); DOS waits for Bryan's content screen,
// and a likely hack waits for his weed-down. Pure (tested).
const TOP = path.join(ROOT, 'audit', 'play-mode', 'consoles', 'console-rows.json');
function topRows(system, list, weed) {
  const w = weed || { keep: [], drop: [] };
  return (list || []).filter((r) => r.system === system && r.system !== 'dos')
    .map((r) => Object.assign({}, r, { publisher: r.maker, boot: { ok: true, from: 'top-150 start-up check' },
      weed: (w.drop || []).includes(r.item) ? 'drop' : (w.keep || []).includes(r.item) ? 'keep' : undefined }));
}
// Bryan's choices from his weed-down page (audit/play-mode/weed/<system>.html, "Copy my choices"), saved as
// audit/play-mode/weed/choices-<system>.json: { system, keep: [items], drop: [items] }.
const readWeed = (system) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'audit', 'play-mode', 'weed', 'choices-' + system + '.json'), 'utf8')); } catch (e) { return null; } };
const readTop = () => { try { return JSON.parse(fs.readFileSync(process.env.PLAY_TOP || TOP, 'utf8')).rows || []; } catch (e) { return []; } };

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
  const top = readTop();
  for (const system of [...new Set(collections().map((c) => c.system))]) {
    // A collection's own rows first (the Archive's curated libraries), then the top 150 for the same machine.
    const fromTop = collections().some((c) => c.system === system && c.from === 'top150');
    const cards = build(readRows(system).concat(fromTop ? topRows(system, top, readWeed(system)) : []), taken);
    for (const c of cards) { taken.ids.push(c.id); taken.items.push(c.archive.item); }
    // The 18+ shelf's games for this machine, in their own bundles (adult-<machine>/<n>), never on the main shelf.
    const adult = build(readRows(system).concat(fromTop ? topRows(system, top, readWeed(system)) : []), taken, true);
    for (const c of adult) { taken.ids.push(c.id); taken.items.push(c.archive.item); }
    for (const b of bundles(system, cards).concat(bundles('adult-' + system, adult))) {
      const f = path.join(LIB, b.name + '.json');
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, JSON.stringify({ bundle: b.name, cards: b.cards }) + '\n');
    }
    total += cards.length;
    console.log('library  ' + system + '  ' + cards.length + ' games' + (adult.length ? ', ' + adult.length + ' on the 18+ shelf' : ''));
  }
  console.log('Library: ' + total + ' games. Now run: node play/tools/shelf.js');
}

if (require.main === module) main();
module.exports = { build, bundles, topRows, PER };
