// VoidTV PLAY: console cards for a list of Archive items. Licence: GPL-2.0-or-later (play/LICENSE).
// Bryan, 20 Nov 2026 (in the arcade audit chat): "All of the list" (audit/play-mode/MORE-GAMES-2026-11-20.json, 92 games;
// the arcade ones are made by arcade-cards.js). For each console item this reads the item's file list from the Archive,
// takes its game file (never a zip: the console engines read the file itself), and writes a card with that machine's
// usual buttons and words. A card that exists already is never overwritten.
//   node play/tools/console-cards.js [list.json] [--write]
'use strict';
const fs = require('fs');
const path = require('path');
const PLAY = path.join(__dirname, '..');
const LIST = path.join(PLAY, '..', 'audit', 'play-mode', 'MORE-GAMES-2026-11-20.json');
const UA = 'PLAY-cards-tool/1.0 (one request at a time)';

// Per machine: the core, the game file's endings, the name the core needs (Master System and Game Gear files on the
// Archive end in .bin), the buttons on the touch pad, their words, the card id's ending, and a line for the help.
const MACHINES = {
  genesis: { core: 'genesis-plus-gx', ext: /\.(bin|md|gen|smd)$/i, end: 'genesis', keys: ['P1:Y', 'P1:B', 'P1:A', 'P1:Start'],
    labels: { 'P1:Y': 'A', 'P1:B': 'B', 'P1:A': 'C' }, buttons: [['P1:Y', 'Button A'], ['P1:B', 'Button B'], ['P1:A', 'Button C']],
    how: 'A, B and C are the game\'s three buttons; Start pauses.' },
  sms: { core: 'genesis-plus-gx', ext: /\.(sms|bin)$/i, as: '.sms', end: 'sms', keys: ['P1:B', 'P1:A', 'P1:Start'],
    labels: { 'P1:B': '1', 'P1:A': '2', 'P1:Start': 'Pause' }, buttons: [['P1:B', 'Button 1'], ['P1:A', 'Button 2']],
    how: 'Buttons 1 and 2 are the game\'s two buttons; Start is the console\'s pause button.' },
  gamegear: { core: 'genesis-plus-gx', ext: /\.(gg|bin)$/i, as: '.gg', end: 'game-gear', keys: ['P1:B', 'P1:A', 'P1:Start'],
    labels: { 'P1:B': '1', 'P1:A': '2' }, buttons: [['P1:B', 'Button 1'], ['P1:A', 'Button 2']],
    how: 'Buttons 1 and 2 are the game\'s two buttons; Start begins and pauses.' },
  nes: { core: 'fceumm', ext: /\.nes$/i, end: 'nes', keys: ['P1:B', 'P1:A', 'P1:Select', 'P1:Start'],
    buttons: [['P1:A', 'A button'], ['P1:B', 'B button']], how: 'A and B are the game\'s two buttons; Start begins and pauses.' },
  snes: { core: 'snes9x', ext: /\.(sfc|smc)$/i, end: 'snes', keys: ['P1:Y', 'P1:X', 'P1:B', 'P1:A', 'P1:L', 'P1:R', 'P1:Select', 'P1:Start'],
    buttons: [['P1:B', 'B button'], ['P1:A', 'A button'], ['P1:Y', 'Y button']], how: 'A, B, X, Y and the shoulder buttons are the game\'s own; Start begins and pauses.' },
  gameboy: { core: 'gambatte', ext: /\.gbc?$/i, end: 'game-boy', keys: ['P1:B', 'P1:A', 'P1:Select', 'P1:Start'],
    buttons: [['P1:A', 'A button'], ['P1:B', 'B button']], how: 'A and B are the game\'s two buttons; Start begins and pauses.' },
  gbcolor: { core: 'gambatte', ext: /\.gbc$/i, end: 'game-boy-color', keys: ['P1:B', 'P1:A', 'P1:Select', 'P1:Start'],
    buttons: [['P1:A', 'A button'], ['P1:B', 'B button']], how: 'A and B are the game\'s two buttons; Start begins and pauses.' },
  gba: { core: 'mgba', ext: /\.gba$/i, end: 'gba', keys: ['P1:B', 'P1:A', 'P1:L', 'P1:R', 'P1:Select', 'P1:Start'],
    buttons: [['P1:A', 'A button'], ['P1:B', 'B button']], how: 'A and B are the game\'s main buttons, L and R the shoulders; Start opens the menu.' },
};

const slug = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/['’]/g, '')
  .replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// Pure (tested): the game file among an item's files: the machine's own ending, not a zip, the largest if several (a
// demo or a patch is smaller), and never a "(Beta)" or "[h" hack when a clean one is there.
function pickFile(files, m) {
  const ok = files.filter((f) => m.ext.test(f.name) && !/\/|^__ia/.test(f.name) && +f.size > 0);
  const clean = ok.filter((f) => !/\(beta|\(proto|\[h|\[b|hack/i.test(f.name));
  return (clean.length ? clean : ok).sort((a, b) => +b.size - +a.size)[0] || null;
}

// Pure (tested): a list title as a box would print it: no "(USA)", "Rev 1", "SNES ROM" or the year and maker some
// Master System items carry, and the few that need their colon or "The" put back by hand.
const TITLES = { 'legend of zelda, the a link to the past': 'The Legend of Zelda: A Link to the Past', 'contra - hard corps': 'Contra: Hard Corps',
  'teenage mutant ninja turtles return of the shredder': 'Teenage Mutant Ninja Turtles: Return of the Shredder',
  'teenage mutant ninja turtles the hyperstone heist': 'Teenage Mutant Ninja Turtles: The Hyperstone Heist',
  'shinobi iii return of the ninja master': 'Shinobi III: Return of the Ninja Master',
  'the simpsons bart vs. the space mutants': 'The Simpsons: Bart vs. the Space Mutants', 'super punch out!!': 'Super Punch-Out!!',
  'metroid ii: return of samus': 'Metroid II: Return of Samus' };
function cleanTitle(t) {
  const s = String(t).replace(/\(\s*[^)]*\)/g, ' ').replace(/\s+SNES(\s+ROM)?\b.*$/i, '').replace(/\s+Rev\s*\d+\b.*$/i, '')
    .replace(/\s+(19|20)\d\d\b.*$/, '').replace(/\s+/g, ' ').trim();
  return TITLES[s.toLowerCase()] || s;
}

// Games that use a second controller (Bryan, 20 Nov 2026: "Can two players play this with controllers"; the PLAY audit).
// Only the home machines with two controller ports; a handheld's second player needed a link cable. Checked by hand,
// since Wikidata gives a player count for almost none of them. Turns taken in a row (Mario, Paperboy) count: the second
// player plays on the second controller.
const TWO_PLAYER = new Set(['altered-beast-genesis', 'contra-hard-corps-genesis', 'golden-axe-genesis', 'kid-chameleon-genesis', 'mortal-kombat-genesis', 'mortal-kombat-ii-genesis', 'ultimate-mortal-kombat-3-genesis', 'paperboy-genesis', 'road-rash-genesis', 'sonic-classics-genesis', 'sonic-the-hedgehog-3-and-knuckles-genesis', 'streets-of-rage-genesis', 'streets-of-rage-2-genesis', 'sunset-riders-genesis', 'tetris-genesis', 'toejam-and-earl-genesis', 'toejam-and-earl-in-panic-on-funkotron-genesis', 'wiz-n-liz-genesis', 'x-men-genesis', 'zombies-ate-my-neighbors-genesis', 'teenage-mutant-ninja-turtles-return-of-the-shredder-genesis', 'teenage-mutant-ninja-turtles-the-hyperstone-heist-genesis', 'donkey-kong-country-snes', 'kirby-super-star-snes', 'super-mario-all-stars-snes', 'super-mario-kart-snes', 'super-mario-world', 'mario-bros-nes', 'super-mario-bros-3-nes', 'bubble-bobble-sms', 'double-dragon-sms', 'ms-pac-man-sms']);

// Pure (tested): the card for one item.
function card(row, file, meta) {
  const m = MACHINES[row.system];
  const year = +String(meta.year || meta.date || '').slice(0, 4) || +((/\b(19[789]\d|200\d)\b/.exec(row.title) || [])[1]) || null;
  const title = cleanTitle(row.title);
  const c = { id: slug(title) + '-' + m.end, title, year, publisher: String([].concat(meta.creator || meta.publisher || '')[0] || '').split(/[;,]/)[0].trim(),
    system: row.system, core: m.core, players: TWO_PLAYER.has(slug(title) + '-' + m.end) ? 2 : 1,
    archive: Object.assign({ item: row.item, file: file.name }, file.start ? { start: file.start } : m.as ? { as: slug(title) + m.as } : {}, { size: +file.size }),
    controls: Object.assign({ kind: 'pad', dpad: true, keys: m.keys }, m.labels ? { labels: m.labels } : {}),
    help: m.how + (row.source === 'personal' ? ' This copy is a personal upload on the Internet Archive and may not stay there.' : ''),
    actions: [{ do: 'Move', press: ['P1:Up', 'P1:Down', 'P1:Left', 'P1:Right'] }, ...m.buttons.map(([press, d]) => ({ do: d, press })), { do: 'Start and pause', press: 'P1:Start' }],
    added: 'Bryan, 20 Nov 2026: "All of the list"' };
  return c;
}

async function meta(item) {
  const r = await fetch('https://archive.org/metadata/' + encodeURIComponent(item), { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(item + ' answered ' + r.status);
  return r.json();
}

async function main() {
  const listFile = process.argv.slice(2).find((a) => !a.startsWith('--')) || LIST;
  const write = process.argv.includes('--write');
  const rows = JSON.parse(fs.readFileSync(listFile, 'utf8')).games.filter((r) => MACHINES[r.system]);
  let made = 0;
  for (const row of rows) {
    let j;
    try { j = await meta(row.item); } catch (e) { console.log('error   ' + row.item + '  ' + e.message); continue; }
    let file = pickFile(j.files || [], MACHINES[row.system]);
    // Only a zip: the worker unpacks it and opens the game file inside, which the Archive's zip listing names.
    if (!file) {
      const zip = (j.files || []).filter((f) => /\.zip$/i.test(f.name) && !/\//.test(f.name)).sort((a, b) => +b.size - +a.size)[0];
      if (zip) {
        const r = await fetch('https://archive.org/download/' + encodeURIComponent(row.item) + '/' + encodeURIComponent(zip.name) + '/', { headers: { 'User-Agent': UA } });
        const inner = r.ok ? [...(await r.text()).matchAll(/<a href="[^"]*\/([^"/]+)">/g)].map((x) => decodeURIComponent(x[1])).filter((n) => MACHINES[row.system].ext.test(n)) : [];
        if (inner.length) file = { name: zip.name, size: zip.size, start: inner[0] };
      }
    }
    if (!file) { console.log('nofile  ' + row.system + '  ' + row.item + '  (' + (j.files || []).filter((f) => !/\.(xml|sqlite|torrent|jpg|png|gif|txt)$/i.test(f.name)).map((f) => f.name).slice(0, 4).join(', ') + ')'); continue; }
    const c = card(row, file, j.metadata || {});
    const to = path.join(PLAY, 'cards', c.id + '.json');
    if (fs.existsSync(to)) { console.log('exists  ' + c.id); continue; }
    if (write) fs.writeFileSync(to, JSON.stringify(c, null, 2) + '\n');
    made++;
    console.log((write ? 'wrote   ' : 'would   ') + c.id + '  ' + file.name + '  ' + file.size);
  }
  console.log(made + ' cards' + (write ? ' written' : ''));
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
module.exports = { TWO_PLAYER, MACHINES, pickFile, card, slug, cleanTitle };
