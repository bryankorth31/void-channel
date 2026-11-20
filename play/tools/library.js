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

// Pure (tested): the cards for one system's rows, given the ids and items the hand-made cards already hold.
function build(rows, taken) {
  const ids = new Set(taken.ids), items = new Set(taken.items), out = [];
  for (const r of rows) {
    // The start-up check's answer: the assistant's rows carry it as boot: { ok, why, at }; a plain ok is read too.
    // The content screen (the assistant's content-screen.js; adult and abusive titles were found in the 2600 library):
    // a flagged game, adult or abusive, never reaches PLAY (Bryan, 20 Nov 2026: adult-themed games "Kept out entirely";
    // the abusive ones "are bad"), and neither does a row the screen has not read.
    if (!r || !('content' in r) || (r.content && r.content.flag)) continue;
    // Finished games only (Bryan, 20 Nov 2026: "Yes, that rule"): no unfinished homebrew, demos, prototypes, test
    // builds, hacks or picture cartridges. A doubtful game comes in only when Bryan kept it on his weed-down page.
    if (!finished(r)) continue;
    if (!(r.boot ? r.boot.ok : r.ok) || !r.item || !r.file || !Cons.MACHINES[r.system] || items.has(r.item)) continue;
    const c = Cons.card({ system: r.system, title: r.title, item: r.item, source: r.source },
      { name: r.file, size: r.size || 0, start: r.start || '' }, { year: r.year, creator: r.publisher });
    if (!c.archive.size) delete c.archive.size;
    if (c.year > (LAST[r.system] || 9999)) c.year = null;   // an upload's date, not the game's
    if (ids.has(c.id) || Cards.check(c).length) continue;
    c.added = 'Whole collections (Bryan, 20 Nov 2026: "Pull those shelves in"); started in the PLAY start-up check';
    ids.add(c.id); items.add(r.item); out.push(c);
  }
  return out.sort((a, b) => a.title.localeCompare(b.title));
}

// Pure (tested): whether a row is a finished game the shelf may take. Not: unfinished homebrew (WIP), demos,
// prototypes, betas, test builds, picture cartridges, hacks (the assistant's hack screen); and, until Bryan says,
// gambling and horror. Bryan's Keep on his weed-down page (r.weed === 'keep') lets a doubtful game in; Drop never.
const UNFINISHED = /\b(wip|demo|proto(type)?|beta|test|kernel|sample)\b|point-of-purchase|greeting cart|^image\b|\(hack\)|\bhack\b/i;
const HELD = /casino|poker|slots?\b|blackjack|black jack|roulette|gambl|halloween|chainsaw/i;   // gambling and horror: Bryan's call
// Each machine's last commercial year: a later date is a homebrew, a hack or an upload date (the audit).
const LAST = { a2600: 1992, nes: 1995, snes: 1999, gameboy: 2003, gbcolor: 2003, gba: 2008, lynx: 1995, genesis: 1998, sms: 1996, gamegear: 1997 };
const FAN = /\b(polish|translat\w*|unlocked|pirate|bootleg|among us|fan made|fanmade)\b/i;
function finished(r) {
  // The title, the Archive item and the file name, with _ - . read as spaces (the audit: "a-team_prototype" slipped by).
  const name = [r.title, r.item, r.file].join(' ').replace(/[_.\-]+/g, ' ');
  if (r.weed === 'drop') return false;
  if (r.weed === 'keep') return true;
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
module.exports = { build, bundles, topRows, PER };
