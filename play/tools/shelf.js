// VoidTV PLAY: the shelf's list of games, and the nightly check that every game's file still answers at the Internet
// Archive (plan T14, T26). Licence: GPL-2.0-or-later (play/LICENSE).
//
//   node play/tools/shelf.js            rebuild play/shelf/index.json from the cards and the last check
//   node play/tools/shelf.js --check    ask the Archive for each game's file first (one at a time, a pause between)
//   node play/tools/shelf.js --plays    ask the Archive how often each game has been played (50 games an ask)
//
// Self-pruning like Live TV (DECISIONS L10): a game whose file the Archive says is gone (404, 403, 410) leaves the
// shelf by itself and comes back by itself when the file answers again. A network hiccup or a busy Archive (5xx,
// timeout) changes nothing: the game keeps its last known state, so one bad night never empties the shelf.
// Nothing is downloaded: each ask reads the first 16 bytes of the file. Nothing here needs AI to run (P11).
'use strict';
const fs = require('fs');
const path = require('path');

const PLAY = path.join(__dirname, '..');
const CARDS = path.join(PLAY, 'cards');
const SHELF = path.join(PLAY, 'shelf');
const STATUS = path.join(SHELF, 'status.json');
const INDEX = path.join(SHELF, 'index.json');
const STREAM = path.join(SHELF, 'stream.js');
// How often each game has been played at the Internet Archive (its item's downloads), item to count. The front page
// sorts its rows by it (Bryan, 20 Nov 2026: "filter towards the most popular"). --plays refreshes it; a game the ask
// misses keeps its last count, so one bad night changes nothing.
const PLAYS = path.join(SHELF, 'plays.json');
const Cards = require('../src/cards.js');
const Shelf = require('../src/shelf.js');
const PAUSE_MS = 1500;

// The hand-made cards, then the whole collections' cards from their bundles (play/library/<system>/<n>.json, written by
// play/tools/library.js), each marked with the bundle that holds it.
const LIBRARY = path.join(PLAY, 'library');
function loadCards() {
  const hand = fs.readdirSync(CARDS).filter((f) => f.endsWith('.json')).sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(CARDS, f), 'utf8')));
  const lib = [];
  if (fs.existsSync(LIBRARY)) for (const s of fs.readdirSync(LIBRARY).sort()) {
    for (const f of fs.readdirSync(path.join(LIBRARY, s)).filter((x) => x.endsWith('.json')).sort((a, b) => parseInt(a, 10) - parseInt(b, 10))) {
      const b = JSON.parse(fs.readFileSync(path.join(LIBRARY, s, f), 'utf8'));
      for (const c of b.cards) lib.push(Object.assign(c, { __b: b.bundle }));
    }
  }
  return hand.concat(lib);
}

function loadPlays() {
  try { return JSON.parse(fs.readFileSync(PLAYS, 'utf8')).plays || {}; } catch (e) { return {}; }
}
const playsText = (plays) => '{"from":"the Internet Archive\'s download count of each game\'s item (node play/tools/shelf.js --plays)","plays":{\n'
  + Object.keys(plays).sort().map((k) => JSON.stringify(k) + ':' + plays[k]).join(',\n') + '\n}}\n';

// One ask per 50 games to the Archive's search, which gives each item's downloads. Nothing is downloaded but the counts.
async function askPlays(items, before) {
  const plays = Object.assign({}, before);
  for (let i = 0; i < items.length; i += 50) {
    const part = items.slice(i, i + 50);
    const q = 'identifier:(' + part.map((x) => '"' + x.replace(/"/g, '') + '"').join(' OR ') + ')';
    const url = 'https://archive.org/advancedsearch.php?' + new URLSearchParams([['q', q], ['fl[]', 'identifier'], ['fl[]', 'downloads'], ['rows', '100'], ['output', 'json']]);
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error('the Archive answered ' + r.status);
      for (const d of (await r.json()).response.docs) if (part.includes(d.identifier)) plays[d.identifier] = Number(d.downloads) || 0;
      console.log('plays: ' + Math.min(i + 50, items.length) + ' of ' + items.length);
    } catch (e) { console.log('plays: ' + (i + 1) + ' to ' + (i + part.length) + ' kept their last count (' + (e.message || e) + ')'); }
    await new Promise((ok) => setTimeout(ok, PAUSE_MS));
  }
  return plays;
}

function loadStatus() {
  try { return JSON.parse(fs.readFileSync(STATUS, 'utf8')); } catch (e) { return { checked: null, games: {} }; }
}

// What the shelf needs from each card, in shelf order (oldest first), with the games the Archive no longer has left out.
function buildIndex(cards, status, plays = loadPlays()) {
  const games = cards.filter((c) => !Cards.check(c).length)
    .filter((c) => !(status.games[c.id] && status.games[c.id].gone))
    // Plan C4: a collection's game carries only what a box shows, and the bundle that holds its card; how it plays is
    // its machine's (libHow, once per machine), so thousands of games keep the list small.
    .map((c) => c.__b ? { id: c.id, title: c.title, year: c.year || null, publisher: c.publisher || '', system: c.system,
      players: c.players || 1, item: c.archive.item, plays: plays[c.archive.item] || c.plays || 0, b: c.__b, genres: Shelf.genresOf(c.genre || (c.facts && c.facts.genre)) }
      : ({ id: c.id, title: c.title, year: c.year || null, publisher: c.publisher || '', system: c.system,
      players: c.players || 1, item: c.archive.item, plays: plays[c.archive.item] || 0, help: c.help || '',
      // Plan G1 and G2: the card's own genre wins over Wikidata's facts; the shelf files both under its plain genres.
      mouse: !!(c.controls && c.controls.mouse),
      // T16 (B, 20 Nov 2026: "kids learning ames"): a card Bryan approved for the Kids learning list.
      kids: !!c.kids,
      genres: Shelf.genresOf(c.genre || (c.facts && c.facts.genre)),
      // Audit S5: the back of the box teaches the game: its first three actions on each input.
      how: Object.fromEntries(['pad', 'keyboard', 'touch'].map((d) => [d, Cards.actionLines(c, d).filter((l) => l.how).slice(0, 3).map((l) => [l.do, l.how])])) }))
    .sort((a, b) => (a.year || 9999) - (b.year || 9999) || a.title.localeCompare(b.title));
  // How a collection's games play, once per machine: the first collection card of each machine speaks for all of them.
  const libHow = {};
  for (const c of cards) if (c.__b && !libHow[c.system]) {
    libHow[c.system] = { help: (c.help || '').replace(/ This copy is a personal upload.*$/, ''),
      how: Object.fromEntries(['pad', 'keyboard', 'touch'].map((d) => [d, Cards.actionLines(c, d).filter((l) => l.how).slice(0, 3).map((l) => [l.do, l.how])])) };
  }
  return Object.keys(libHow).length ? { built: status.checked, libHow, games } : { built: status.checked, games };
}

// The big games the voidtv.net pass-through may read in pieces (plan T21, functions/api/piece.js): a card marks
// "archive.stream": true and records its file's size. A game off the shelf is off this list too.
function buildStream(cards, status) {
  const out = {};
  for (const c of cards) {
    if (!c.archive || !c.archive.stream || Cards.check(c).length || !(c.archive.size > 0)) continue;
    if (status.games[c.id] && status.games[c.id].gone) continue;
    out[c.id] = { item: c.archive.item, file: c.archive.file, size: c.archive.size };
  }
  return out;
}
const streamModule = (list) => '// Written by play/tools/shelf.js from the cards; do not edit by hand. Read by functions/api/piece.js.\n'
  + 'export default ' + JSON.stringify(list, null, 2) + ';\n';

// One polite ask: the first 16 bytes. Returns 'ok', 'gone' or 'unsure'.
async function ask(card) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 30000);
  try {
    const r = await fetch(Cards.gameUrl(card), { headers: { Range: 'bytes=0-15', 'Accept-Encoding': 'identity', Origin: 'https://voidtv.net' }, signal: ctl.signal });
    if (r.body) await r.body.cancel();
    // The same file, not just a file: the Archive's /cors/ address ignores the range and answers 200 with the whole
    // file's length when asked for it uncompressed (a 206 would carry it as bytes 0-15/<size>). A card that records its
    // file's size (archive.size) and gets a different one has been replaced at the Archive: it leaves the shelf until
    // someone looks. A packed or missing length proves nothing, so that counts as ok.
    const range = /\/(\d+)\s*$/.exec(r.headers.get('content-range') || '');
    const total = range ? +range[1] : (r.status === 200 && !r.headers.get('content-encoding') ? +r.headers.get('content-length') || 0 : 0);
    if (card.archive.size && total && total !== card.archive.size) return { state: 'changed', code: total };
    if (r.status === 200 || r.status === 206) return { state: 'ok', code: r.status };
    if ([403, 404, 410].includes(r.status)) return { state: 'gone', code: r.status };
    return { state: 'unsure', code: r.status };
  } catch (e) {
    return { state: 'unsure', code: String(e.name || e) };
  } finally { clearTimeout(timer); }
}

async function check(cards, status) {
  const now = new Date().toISOString();
  for (const c of cards) {
    const a = await ask(c);
    const before = status.games[c.id] || {};
    // A replaced file ('changed') leaves the shelf like a gone one; it comes back when the card's size is updated.
    const gone = a.state === 'gone' || a.state === 'changed' ? true : a.state === 'ok' ? false : !!before.gone;
    status.games[c.id] = { gone, last: a.state, code: a.code, at: now };
    console.log((gone ? 'GONE  ' : 'ok    ') + c.id + '  (' + a.state + ' ' + a.code + ')');
    await new Promise((r) => setTimeout(r, PAUSE_MS));
  }
  for (const id of Object.keys(status.games)) if (!cards.some((c) => c.id === id)) delete status.games[id];
  status.checked = now;
  return status;
}

async function main() {
  const cards = loadCards();
  let status = loadStatus();
  if (process.argv.includes('--check')) {
    status = await check(cards, status);
    fs.writeFileSync(STATUS, JSON.stringify(status, null, 2) + '\n');
  }
  if (process.argv.includes('--plays')) {
    const items = [...new Set(cards.map((c) => c.archive && c.archive.item).filter(Boolean))];
    fs.writeFileSync(PLAYS, playsText(await askPlays(items, loadPlays())));
  }
  const index = buildIndex(cards, status);
  fs.writeFileSync(INDEX, indexText(index));
  fs.writeFileSync(STREAM, streamModule(buildStream(cards, status)));
  const gone = Object.values(status.games).filter((g) => g.gone).length;
  console.log('Shelf: ' + index.games.length + ' games' + (gone ? ', ' + gone + ' left off (the Archive no longer has them)' : ''));
}

// One game a line: small enough for thousands, and a change reads as one line in a diff.
const indexText = (index) => '{' + Object.entries(index).filter(([k]) => k !== 'games').map(([k, v]) => JSON.stringify(k) + ':' + JSON.stringify(v)).join(',')
  + ',"games":[\n' + index.games.map((g) => JSON.stringify(g)).join(',\n') + '\n]}\n';

module.exports = { indexText, buildIndex, buildStream, streamModule, loadCards, ask, loadPlays, playsText };
if (require.main === module) main().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
