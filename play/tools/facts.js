// VoidTV PLAY: facts per game from Wikidata (plan G1; Bryan, 20 Nov 2026: "Yes, add them"). Licence: GPL-2.0-or-later.
//
//   node play/tools/facts.js            look up every card without facts and write what it finds onto the card
//   node play/tools/facts.js --again    look up every card again
//
// Wikidata's facts are CC0 (free of any terms): genre (P136), most players (P1873), platform (P400), date (P577). The
// tool searches by the card's title and keeps only a video game that carries that same title, on the card's own
// machine, preferring the one whose year is nearest. A wrong fact is worse than none: no match leaves the card alone.
// It writes card.facts = { genre: [...], players, source } and never touches a card's own "genre" or "players", which
// win over the facts (a card can always say it by hand). No other site is read: MobyGames and IGDB have terms against
// this. One query per card to Wikidata's query service, with Wikidata's own search inside it, a pause between, and
// polite retries when it is busy. Nothing here needs AI to run (P11).
'use strict';
const fs = require('fs');
const path = require('path');

const CARDS = path.join(__dirname, '..', 'cards');
const SPARQL = 'https://query.wikidata.org/sparql';
const UA = 'PLAY-facts-tool/1.0 (game facts lookup; one request at a time)';
const PAUSE_MS = 2000;
const VIDEO_GAME = 'Q7889';
// A single game first; a game series only when Wikidata files the first game on its series item (Golden Axe does).
const SERIES = 'Q7058673';
// Each machine's Wikidata item (checked against Wikidata, 20 Nov 2026), so a game's platforms match by id: some platform
// items carry no plain English label. The Lynx is Q753657 (Q753600 is the Atari 7800).
const PLATFORM = {
  dos: ['Q170434'], a2600: ['Q206261'], nes: ['Q172742'], snes: ['Q183259'], genesis: ['Q10676'], sms: ['Q209868'],
  gamegear: ['Q751719'], gameboy: ['Q186437'], gbcolor: ['Q203992'], gba: ['Q188642'], lynx: ['Q753657'],
};

async function query(text) {
  for (let tries = 0; ; tries++) {
    const r = await fetch(SPARQL + '?format=json&query=' + encodeURIComponent(text), { headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' } });
    if ((r.status === 429 || r.status >= 500) && tries < 4) {
      await new Promise((ok) => setTimeout(ok, Math.max(+r.headers.get('retry-after') || 0, 5 * (tries + 1)) * 1000));
      continue;
    }
    if (!r.ok) throw new Error('Wikidata answered ' + r.status);
    await new Promise((ok) => setTimeout(ok, PAUSE_MS));
    return (await r.json()).results.bindings;
  }
}
const qid = (uri) => String(uri).split('/').pop();

// The title as a search finds it: "Ms. Pac-Man (Lynx)" searches "Ms. Pac-Man"; "Pitfall!" stays.
const searchTitle = (t) => t.replace(/\s*\([^)]*\)\s*$/, '').trim();
// Two titles are the same game's when they match without case, punctuation or a trailing "(...)": "Kirby & The Amazing
// Mirror" is "Kirby and the Amazing Mirror"; "Golden Axe Warrior" is not "Golden Axe".
const norm = (t) => searchTitle(String(t)).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');

// Pure (tested): from the candidates, each { id, labels: [..], inst: [Q..], platforms: [Q..], genres: [label],
// players, year }, the best game for this card, or null.
function pick(card, found) {
  const want = PLATFORM[card.system] || [];
  const same = found.filter((e) => e.labels.some((l) => norm(l) === norm(card.title)));
  const onMachine = same.filter((e) => e.platforms.some((p) => want.includes(p)));
  const games = onMachine.filter((e) => e.inst.includes(VIDEO_GAME));
  const fits = games.length ? games : onMachine.filter((e) => e.inst.includes(SERIES));
  if (!fits.length) return null;
  fits.sort((a, b) => Math.abs((a.year || 9999) - (card.year || 0)) - Math.abs((b.year || 9999) - (card.year || 0)));
  const e = fits[0];
  const out = { genre: e.genres.slice().sort(), players: e.players || null, source: 'https://www.wikidata.org/wiki/' + e.id };
  if (!games.length) out.note = 'from the series item; Wikidata has no separate item for this game';
  return out;
}

// Rows from the query fold into one candidate per item.
function fold(rows) {
  const by = new Map();
  const add = (list, v) => { if (v && !list.includes(v)) list.push(v); };
  for (const b of rows) {
    const id = qid(b.g.value);
    if (!by.has(id)) by.set(id, { id, labels: [], inst: [], platforms: [], genres: [], players: null, year: null });
    const e = by.get(id);
    if (b.lab) add(e.labels, b.lab.value);
    add(e.inst, qid(b.inst.value)); add(e.platforms, qid(b.p.value));
    if (b.genreLabel && !/^Q\d+$/.test(b.genreLabel.value)) add(e.genres, b.genreLabel.value);
    if (b.max && +b.max.value) e.players = Math.max(e.players || 0, +b.max.value);
    if (b.date) { const y = +b.date.value.slice(0, 4); if (y && (!e.year || y < e.year)) e.year = y; }
  }
  return [...by.values()];
}

async function lookUp(card) {
  const text = [
    'SELECT ?g ?lab ?inst ?p ?genreLabel ?max ?date WHERE {',
    '  SERVICE wikibase:mwapi { bd:serviceParam wikibase:api "EntitySearch"; wikibase:endpoint "www.wikidata.org";',
    '    mwapi:search ' + JSON.stringify(searchTitle(card.title)) + '; mwapi:language "en"; mwapi:limit "15". ?g wikibase:apiOutputItem mwapi:item. }',
    '  ?g wdt:P31 ?inst . FILTER(?inst IN (wd:' + VIDEO_GAME + ', wd:' + SERIES + '))',
    '  ?g wdt:P400 ?p .',
    '  { ?g rdfs:label ?lab } UNION { ?g skos:altLabel ?lab } FILTER(LANG(?lab) IN ("en", "mul"))',
    '  OPTIONAL { ?g wdt:P136 ?genre } OPTIONAL { ?g wdt:P1873 ?max } OPTIONAL { ?g wdt:P577 ?date }',
    '  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". } }'].join('\n');
  return pick(card, fold(await query(text)));
}

async function main() {
  const again = process.argv.includes('--again');
  for (const f of fs.readdirSync(CARDS).filter((x) => x.endsWith('.json')).sort()) {
    const file = path.join(CARDS, f);
    const card = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (card.facts && !again) { console.log('kept   ' + card.id); continue; }
    let facts = null;
    try { facts = await lookUp(card); } catch (e) { console.log('error  ' + card.id + '  ' + e.message); continue; }
    if (!facts) {
      if (card.facts) { delete card.facts; fs.writeFileSync(file, JSON.stringify(card, null, 2) + '\n'); }
      console.log('none   ' + card.id + '  (no video game by that title on this machine; set "genre" on the card by hand)');
      continue;
    }
    card.facts = facts;
    fs.writeFileSync(file, JSON.stringify(card, null, 2) + '\n');
    console.log('facts  ' + card.id + '  ' + (facts.genre.join(', ') || 'no genre') + (facts.players ? ', ' + facts.players + ' players' : '') + '  ' + facts.source + (facts.note ? '  (' + facts.note + ')' : ''));
  }
}

module.exports = { pick, fold, norm, searchTitle, PLATFORM };
if (require.main === module) main().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
