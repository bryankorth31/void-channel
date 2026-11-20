// VoidTV PLAY: the shelf's list of games, and the nightly check that every game's file still answers at the Internet
// Archive (plan T14, T26). Licence: GPL-2.0-or-later (play/LICENSE).
//
//   node play/tools/shelf.js            rebuild play/shelf/index.json from the cards and the last check
//   node play/tools/shelf.js --check    ask the Archive for each game's file first (one at a time, a pause between)
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
const Cards = require('../src/cards.js');
const PAUSE_MS = 1500;

function loadCards() {
  return fs.readdirSync(CARDS).filter((f) => f.endsWith('.json')).sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(CARDS, f), 'utf8')));
}

function loadStatus() {
  try { return JSON.parse(fs.readFileSync(STATUS, 'utf8')); } catch (e) { return { checked: null, games: {} }; }
}

// What the shelf needs from each card, in shelf order (oldest first), with the games the Archive no longer has left out.
function buildIndex(cards, status) {
  const games = cards.filter((c) => !Cards.check(c).length)
    .filter((c) => !(status.games[c.id] && status.games[c.id].gone))
    .map((c) => ({ id: c.id, title: c.title, year: c.year || null, publisher: c.publisher || '', system: c.system,
      players: c.players || 1, item: c.archive.item, help: c.help || '' }))
    .sort((a, b) => (a.year || 9999) - (b.year || 9999) || a.title.localeCompare(b.title));
  return { built: status.checked, games };
}

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
  const index = buildIndex(cards, status);
  fs.writeFileSync(INDEX, JSON.stringify(index, null, 2) + '\n');
  const gone = Object.values(status.games).filter((g) => g.gone).length;
  console.log('Shelf: ' + index.games.length + ' games' + (gone ? ', ' + gone + ' left off (the Archive no longer has them)' : ''));
}

module.exports = { buildIndex, loadCards, ask };
if (require.main === module) main().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
