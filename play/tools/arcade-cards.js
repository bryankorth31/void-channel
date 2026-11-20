// VoidTV PLAY: arcade cards from MAME's own inputs. Licence: GPL-2.0-or-later (play/LICENSE).
// Bryan picked the 245 most-played arcade games on the Internet Archive (20 Nov 2026); the assistant session built the
// engines, boot-tested each game and read every input's default keys from MAME itself. This tool turns that into cards:
//   node play/tools/arcade-cards.js [--write]
// It reads audit/play-mode/candidates/arcade-cards-data.json (the games) and arcade-inputs.json (their inputs, on this
// PC only), prints what it would write, and with --write writes play/cards/<id>.json. A hand-made card (one without
// "made": "arcade-cards") is never overwritten.
//
// The mapping, from MAME's input types:
//   joystick (or the left half of two)      -> the pad's arrows
//   the right half of two joysticks          -> Y A X B as up down left right (the usual twin-stick seat on a pad)
//   dial, paddle, trackball, analog stick    -> the arrows, through MAME's own keys for turning it (Tron: Z and X)
//   gas and brake pedals                     -> RT and LT, and A and B when they are free (a phone has no triggers)
//   buttons 1 to 6                           -> A B X Y LB RB, in that order, on the first ones free
//   coin and start                           -> Back and Start (Back and Start together still open the menu)
// Player 2's own keys go in gamepadSeats[2], so a second gamepad or phone plays player 2 on a two-player game.
'use strict';
const fs = require('fs');
const path = require('path');
const PLAY = path.join(__dirname, '..');
const DATA = path.join(PLAY, '..', 'audit', 'play-mode', 'candidates');

const slug = (s) => s.toLowerCase().replace(/&/g, ' and ').replace(/['’]/g, '').replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
// The games MAME says do not work are left out; a game whose id would clash takes its maker's name.
const LEAVE_OUT = { sbugger: 'MAME marks Space Bugger as not working' };
// (The Sega G80 vector machines were held back until the arcade audit found why they ignored a coin: it was held too long.
// The runner now sends every coin as an 80 ms pulse, so they are on the shelf.)
// Machines whose power-on tests run long after the first-boot reset; a coin put in before they finish is lost (audit).
const WARM = { defender: 48, mysticm: 48 };
// What a few machines need after the coin, as the audits found it on the real games (20 Nov 2026).
const AFTER = { colony7: 'then press Start, then Fire.', defender: 'then press Start; if the demo keeps playing, press Start again.' };

// The first key of a field (a one-key default), and the keys that turn an analog field up and down.
const one = (list) => { for (const k of list || []) if (k.dom && k.dom.length === 1) return k.dom[0]; return null; };
const keyOf = (f) => one(f.keys);
const incOf = (f) => one(f.inc), decOf = (f) => one(f.dec);
const base = (t) => t.replace(/^P[12]_/, '');

// A field's word for the touch key and the help: MAME's own name, without the player.
function word(f) {
  const t = base(f.type);
  if (t === 'PEDAL') return 'Gas';
  if (t === 'PEDAL2') return 'Brake';
  let n = String(f.name).replace(/^P[12] /, '').replace(/^Player [12] /, '').split('/')[0].trim();
  return n;
}

// Pure (tested): one player's gamepad map and the words for its keys.
function seatMap(fields, player) {
  const mine = fields.filter((f) => f.player === player && !/^(COIN|START)/.test(f.type));
  const map = {}, words = {};
  const put = (slot, key, w) => { if (key && !map[slot]) { map[slot] = key; if (w && !words[key]) words[key] = w; } };
  const by = (t) => mine.filter((f) => base(f.type) === t);
  for (const [t, slot] of [['JOYSTICK_UP', 'Up'], ['JOYSTICK_DOWN', 'Down'], ['JOYSTICK_LEFT', 'Left'], ['JOYSTICK_RIGHT', 'Right'],
    ['JOYSTICKLEFT_UP', 'Up'], ['JOYSTICKLEFT_DOWN', 'Down'], ['JOYSTICKLEFT_LEFT', 'Left'], ['JOYSTICKLEFT_RIGHT', 'Right']]) for (const f of by(t)) put(slot, keyOf(f));
  for (const [t, slot, w] of [['JOYSTICKRIGHT_UP', 'Y', 'Fire up'], ['JOYSTICKRIGHT_DOWN', 'A', 'Fire down'], ['JOYSTICKRIGHT_LEFT', 'X', 'Fire left'], ['JOYSTICKRIGHT_RIGHT', 'B', 'Fire right']]) for (const f of by(t)) put(slot, keyOf(f), w);
  // Analog: turned by MAME's own keys. X turns with Left and Right, Y with Up and Down (MAME's "increment" on Y is down).
  for (const t of ['DIAL', 'PADDLE', 'TRACKBALL_X', 'AD_STICK_X', 'LIGHTGUN_X']) for (const f of by(t)) { put('Left', decOf(f)); put('Right', incOf(f)); }
  for (const t of ['TRACKBALL_Y', 'AD_STICK_Y', 'LIGHTGUN_Y']) for (const f of by(t)) { put('Up', decOf(f)); put('Down', incOf(f)); }
  for (const f of by('AD_STICK_Z')) { put('LB', decOf(f), 'Slower'); put('RB', incOf(f), 'Faster'); }
  for (const f of by('PEDAL')) { put('RT', incOf(f), 'Gas'); put('A', incOf(f), 'Gas'); }
  for (const f of by('PEDAL2')) { put('LT', incOf(f), 'Brake'); put('B', incOf(f), 'Brake'); }
  const buttons = mine.filter((f) => /^BUTTON\d$/.test(base(f.type))).sort((a, b) => base(a.type).localeCompare(base(b.type)));
  for (const f of buttons) { const slot = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT'].find((s) => !map[s]); if (slot) put(slot, keyOf(f), word(f)); }
  // A one-button game: B does the same as A, so either thumb works (as on the Joust card).
  if (buttons.length === 1 && map.A && !map.B && !by('PEDAL2').length) map.B = map.A;
  return { map, words, buttons: buttons.map(keyOf).filter(Boolean) };
}

const coinKey = (fields, n) => keyOf(fields.find((f) => f.type === 'COIN' + n) || {});
// A start on a cocktail table is for its second side; an upright cabinet then starts with a button (Crystal Castles).
const startKey = (fields, n) => keyOf(fields.find((f) => f.type === 'START' + n && !/Cocktail/i.test(f.name)) || {});
// The word for moving, from what the machine has: a stick moves, a trackball rolls, a gun aims, a dial turns, a car steers.
function moveWord(fields) {
  const has = (re) => fields.some((f) => f.player === 1 && re.test(f.type));
  if (has(/JOYSTICK/)) return 'Move';
  if (has(/PEDAL/)) return 'Steer';
  if (has(/TRACKBALL/)) return 'Roll';
  if (has(/LIGHTGUN/)) return 'Aim';
  if (has(/DIAL|PADDLE/)) return 'Turn';
  return 'Move';
}

// Pure (tested): the card for one game.
function card(game, fields) {
  const p1 = seatMap(fields, 1), p2 = seatMap(fields, 2);
  // The data may name the start itself when it is not the start key (Colony 7: after a coin, Fire starts; the audit's A6).
  const named = !AFTER[game.driver] && game.startButton && fields.find((f) => f.name === game.startButton && !/^START/.test(f.type));
  const coin = coinKey(fields, 1), start = (named && keyOf(named)) || startKey(fields, 1) || p1.buttons[0] || p1.map.A;
  const players = startKey(fields, 2) || Object.keys(p2.map).length ? 2 : 1;
  const gamepad = Object.assign({}, p1.map, coin ? { Back: coin } : {}, start ? { Start: start } : {});
  const dirs = ['Up', 'Down', 'Left', 'Right'].filter((d) => gamepad[d]);
  const keys = [...new Set([coin, start, ...p1.buttons.slice(0, 4), ...['A', 'B', 'X', 'Y'].map((s) => p1.map[s])].filter(Boolean))].slice(0, 7);
  const labels = Object.assign({}, p1.words, coin ? { [coin]: 'Coin' } : {}, start && !p1.words[start] ? { [start]: 'Start' } : {});
  const analog = fields.some((f) => f.player === 1 && f.analog);
  const actions = [];
  if (coin) actions.push({ do: 'Put a coin in', press: coin });
  if (start && start === startKey(fields, 1)) actions.push({ do: 'Start', press: start });
  if (dirs.length) actions.push({ do: moveWord(fields), press: dirs.map((d) => gamepad[d]) });
  // Twin sticks (Robotron): the four fire directions are one thing to learn.
  const fire = fields.filter((f) => f.player === 1 && /JOYSTICKRIGHT/.test(f.type)).map(keyOf).filter(Boolean);
  if (fire.length) actions.push({ do: 'Fire', press: fire });
  for (const k of [...new Set(['A', 'B', 'X', 'Y', 'LB', 'RB', 'RT', 'LT'].map((s) => p1.map[s]).filter(Boolean))]) {
    if (fire.includes(k)) continue;
    if (actions.length >= 6) break;
    if (!dirs.some((d) => gamepad[d] === k)) actions.push({ do: labels[k] || 'Button', press: k });
  }
  const coins = /2 coins|two coins|more than one coin/.test(game.note || '') ? 'Put two coins in' : 'Put a coin in';
  if (actions[0] && actions[0].press === coin) actions[0].do = coins;
  const help = [game.maker && game.year ? 'An arcade game from ' + game.maker + ', ' + game.year + '.' : 'An arcade game.',
    coins + (AFTER[game.driver] ? ', ' + AFTER[game.driver] : start && start === startKey(fields, 1) ? ', then press Start.' : ', then press ' + (labels[start] || 'the button') + ' to start.'),
    /STAND BY|test patterns|PLEASE STAND BY/.test(game.note || '') ? 'It warms up for about half a minute every time it starts.' : '',
    /selection menu/.test(game.note || '') ? 'It opens on a menu of games: pick one with the stick and the button.' : '',
    WARM[game.driver] ? 'It tests itself for about ' + WARM[game.driver] + ' seconds when it starts: put the coin in once the game shows.' : '',
    /statistics key/.test(game.note || '') ? 'After the start it asks for a statistics key and then initials: press ' + (labels[p1.buttons[0]] || 'the first button') + ' to go past both.' : ''].filter(Boolean).join(' ');
  const out = {
    id: '', title: game.title.replace(/\s*\([^)]*\)\s*$/, ''), year: game.year || null, publisher: game.maker || '',
    system: 'arcade', core: 'mame', players, aspect: game.screen && game.screen.vertical ? 0.75 : 1.3333,
    archive: Object.assign({ item: game.archive.item, file: game.archive.file, size: game.archive.size, driver: game.driver, engine: game.engine },
      // A machine's samples.zip is not fetched: the page tells MAME to look for samples beside the games (-samplepath),
      // and an item that has them carries them in the game's own zip (Zaxxon; the arcade audit, a9d2182f9).
      (() => { const p = (game.archive.parents || []).filter((x) => x.file !== 'samples.zip'); return p.length ? { parents: p } : {}; })()),
    controls: Object.assign({ kind: 'dos-keys', keys, dpad: dirs.length > 0, labels }),
    gamepad,
    help, actions,
    made: 'arcade-cards',
  };
  if (players > 1 && Object.keys(p2.map).length) {
    const coin2 = coinKey(fields, 2) || coin, start2 = startKey(fields, 2);
    out.gamepadSeats = { 2: Object.assign({}, p2.map, coin2 ? { Back: coin2 } : {}, start2 ? { Start: start2 } : {}) };
  }
  if (game.firstBoot) out.firstBoot = game.firstBoot;
  return out;
}

function build() {
  const games = JSON.parse(fs.readFileSync(path.join(DATA, 'arcade-cards-data.json'), 'utf8'));
  const inputs = JSON.parse(fs.readFileSync(path.join(DATA, 'arcade-inputs.json'), 'utf8')).drivers;
  const ids = new Map(), out = [], left = [];
  for (const g of games) {
    if (LEAVE_OUT[g.driver]) { left.push(g.driver + ': ' + LEAVE_OUT[g.driver]); continue; }
    const f = inputs[g.driver];
    if (!f) { left.push(g.driver + ': no inputs read'); continue; }
    const c = card(g, f.fields || f);
    let id = slug(c.title) + '-arcade';
    if (ids.has(id) || games.some((o) => o !== g && slug(o.title.replace(/\s*\([^)]*\)\s*$/, '')) === slug(c.title))) id = slug(c.title) + '-' + slug(g.maker || g.driver) + '-arcade';
    c.id = id; ids.set(id, g.driver);
    out.push(c);
  }
  return { cards: out, left };
}

if (require.main === module) {
  const write = process.argv.includes('--write');
  const { cards, left } = build();
  let wrote = 0, kept = 0;
  for (const c of cards) {
    const f = path.join(PLAY, 'cards', c.id + '.json');
    const old = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
    if (old && old.made !== 'arcade-cards') { kept++; continue; }
    // What other tools added to a card (the facts tool's genre and source) stays when the card is written again.
    if (old) for (const k of ['facts', 'genre', 'genreBy', 'kids', 'cheats']) if (old[k] !== undefined && c[k] === undefined) c[k] = old[k];
    if (write) { fs.writeFileSync(f, JSON.stringify(c, null, 2) + '\n'); wrote++; }
  }
  console.log(cards.length + ' arcade cards' + (write ? ', ' + wrote + ' written' : '') + ', ' + kept + ' hand-made kept as they are');
  for (const l of left) console.log('left out: ' + l);
}

module.exports = { seatMap, card, word, slug, build };
