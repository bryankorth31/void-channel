// VoidTV PLAY: cheat lists for console games, from libretro-database (CC-BY-SA 4.0). Licence: GPL-2.0-or-later (play/LICENSE).
// Bryan, 20 Nov 2026: "add toggle for cheats". libretro-database collects cheat codes for each console in plain .cht files
// (https://github.com/libretro/libretro-database, cht/), under Creative Commons Attribution-ShareAlike 4.0; the lists this
// tool writes keep that licence, name their source file, and are credited on the game page.
//   node play/tools/cheats.js            look up every console card, write play/cheats/<id>.json
// A game's file is found by its title among the system's .cht names ("Super Mario World (USA).cht"), preferring the USA,
// then World, then Europe release. Only cores that take cheats are looked up (Snes9x, FCEUmm, Gambatte, Genesis Plus GX,
// mGBA); the Atari 2600, Lynx, DOS and arcade games get none here.
'use strict';
const fs = require('fs');
const path = require('path');
const PLAY = path.join(__dirname, '..');
const Cards = require('../src/cards.js');
const UA = 'PLAY-cheats-tool/1.0 (cheat lists from libretro-database; one request at a time)';
const REPO = 'https://api.github.com/repos/libretro/libretro-database';
const RAW = 'https://raw.githubusercontent.com/libretro/libretro-database/master/';
const FOLDER = { nes: 'Nintendo - Nintendo Entertainment System', snes: 'Nintendo - Super Nintendo Entertainment System',
  genesis: 'Sega - Mega Drive - Genesis', sms: 'Sega - Master System - Mark III', gamegear: 'Sega - Game Gear',
  gameboy: 'Nintendo - Game Boy', gbcolor: 'Nintendo - Game Boy Color', gba: 'Nintendo - Game Boy Advance' };
const MAX = 40;   // a list longer than this is mostly one-level codes; the first forty are the useful ones

// Pure (tested): the title as the .cht names it, without our "(Game Gear)" and the like.
// Accents fold ("Pokémon" is "Pokemon"), and a trailing "Version" or "Edition" is the same game ("Pokemon - FireRed Version").
// "The" is left out on both sides: the files write "Legend of Zelda, The - A Link to the Past" and "Lion King, The".
const norm = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s*\([^)]*\)|\s*\[[^\]]*\]/g, '').toLowerCase()
  .replace(/\bthe\b/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '').replace(/(version|edition)$/, '');
// Pure (tested): the best file for a title among a folder's names.
function pickFile(title, names) {
  const want = norm(title);
  const same = names.filter((n) => n.endsWith('.cht') && norm(n.replace(/\.cht$/, '')) === want);
  const rank = (n) => (/\(USA/.test(n) ? 0 : /\(World/.test(n) ? 1 : /\(Europe/.test(n) ? 2 : 3) + (/\[|Beta|Proto|Hack/i.test(n) ? 10 : 0);
  return same.sort((a, b) => rank(a) - rank(b) || a.length - b.length)[0] || null;
}
// Pure (tested): a .cht file's cheats, { name, code }, in its own order; blank or unnamed ones go.
function parse(text) {
  const v = {};
  for (const line of String(text).split(/\r?\n/)) { const m = /^\s*([A-Za-z0-9_]+)\s*=\s*"?(.*?)"?\s*$/.exec(line); if (m) v[m[1]] = m[2]; }
  const all = [];
  for (let i = 0; i < (+v.cheats || 0); i++) {
    const name = (v['cheat' + i + '_desc'] || '').trim(), code = (v['cheat' + i + '_code'] || '').trim();
    if (name && code && code.length <= 200) all.push({ name: name.slice(0, 60), code });
  }
  // A code listed under different names is a slip in the file (Super Mario World gives one code for a mushroom, a flower
  // and a feather; the audit): it goes, under every name.
  const names = new Map();
  for (const c of all) { if (!names.has(c.code)) names.set(c.code, new Set()); names.get(c.code).add(c.name.toLowerCase()); }
  const sound = all.filter((c) => names.get(c.code).size === 1).filter((c, i, list) => list.findIndex((o) => o.code === c.code) === i);
  // The ones people look for come first; a game's list is cut at forty.
  const rank = (c) => (USEFUL.test(c.name) ? 0 : 1) + (RISKY.test(c.name) ? 2 : 0);
  return sound.map((c, i) => ({ c, i })).sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i).slice(0, MAX)
    .map(({ c }) => (RISKY.test(c.name) ? Object.assign({}, c, { risky: true }) : c));
}
const USEFUL = /infinite|unlimited|invinc|invulner|never|lives|health|energy|time|ammo|max|money|coins?\b|rupee|power|start with|have all|all (items|weapons|levels)/i;
// Cheats that jump about or open developer modes can spoil a run (and Continue keeps it): kept, marked for the player.
const RISKY = /debug|exit level|warp|level select|stage select|skip|walk through|moon ?jump|crash/i;

async function get(url, json) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: json ? 'application/vnd.github+json' : '*/*' } });
  if (!r.ok) throw new Error(url + ' answered ' + r.status);
  return json ? r.json() : r.text();
}

async function main() {
  const root = await get(REPO + '/contents/cht', true);
  const trees = {};
  const out = path.join(PLAY, 'cheats');
  fs.mkdirSync(out, { recursive: true });
  for (const f of fs.readdirSync(path.join(PLAY, 'cards')).filter((x) => x.endsWith('.json')).sort()) {
    const card = JSON.parse(fs.readFileSync(path.join(PLAY, 'cards', f), 'utf8'));
    const folder = FOLDER[card.system];
    if (!folder || !Cards.isPad(card)) continue;
    if (!trees[folder]) {
      const dir = root.find((d) => d.name === folder);
      trees[folder] = dir ? (await get(REPO + '/git/trees/' + dir.sha, true)).tree.map((t) => t.path) : [];
    }
    const file = pickFile(card.title, trees[folder]);
    if (!file) { console.log('none    ' + card.id); continue; }
    const src = 'cht/' + folder + '/' + file;
    const cheats = parse(await get(RAW + src.split('/').map(encodeURIComponent).join('/')));
    if (!cheats.length) { console.log('empty   ' + card.id + '  ' + file); continue; }
    fs.writeFileSync(path.join(out, card.id + '.json'), JSON.stringify({ game: card.id,
      source: 'https://github.com/libretro/libretro-database/blob/master/' + src.split('/').map(encodeURIComponent).join('/'),
      licence: 'CC-BY-SA-4.0', cheats }, null, 2) + '\n');
    console.log('cheats  ' + card.id + '  ' + cheats.length + '  ' + file);
    // The card says it has a list, so the game page asks only for lists that exist (no 404 in the console).
    if (!card.cheats) { card.cheats = true; fs.writeFileSync(path.join(PLAY, 'cards', f), JSON.stringify(card, null, 2) + '\n'); }
  }
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
module.exports = { norm, pickFile, parse, FOLDER };
