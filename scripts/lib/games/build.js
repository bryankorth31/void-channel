// KIDS GAMES build: computer games that teach, played in PLAY's own player (play/, voidtv.net/play), on the kids site.
// Bryan, 20 Nov 2026: "we should be able to easily have teaching games etc and appropriate games use the same system we
// are making in play ie oregon trail typing games we may have etc".
//   <out>/games/index.html   the shelf, in the Play and Learn sticker look, with the kids top bar
//   <out>/games/game.html    a kids copy of play/game.html (<html data-kids>): no donation, no phone pad, no links out
//   <out>/games/cards/       ONLY the cards marked "kids": true, so no other game can be opened here at all
//   <out>/games/src, engine  PLAY's scripts and only the engines those cards use
// The pictures are our own copies (profiles/kids/site-assets/games/<id>.jpg), because a kids page loads no outside
// images. The game file itself still comes from the Internet Archive when Play is pressed, as every kids video does.
// The engine's source offer (GPL) sits on the For grown-ups page, behind the grown-up check.
// The kids worker (workers/kids/worker.js) gives /games/ the two cross-origin isolation headers the engine needs.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const NAV = require('../kids-nav');

// Where PLAY lives: PLAY_DIR, this checkout's play/ once kids has master's PLAY, else the main checkout beside it.
function playDir(root) {
  const c = [process.env.PLAY_DIR, path.join(root, 'play'), path.join(root, '..', 'void-channel', 'play')].filter(Boolean);
  return c.find((d) => fs.existsSync(path.join(d, 'game.html')) && fs.existsSync(path.join(d, 'cards'))) || null;
}

// Rows on the shelf, and a few words each (kids copy: the vibe, not a feature list). A kids card not named here still
// shows, under "More games", so a game Bryan marks kids on PLAY's approve page appears with no change here.
const ROWS = [
  ['little', 'For little ones'], ['words', 'Reading and words'], ['numbers', 'Numbers'],
  ['world', 'The world and long ago'], ['science', 'Science and nature'], ['think', 'Puzzles and thinking'], ['make', 'Make things'], ['more', 'More games'],
];
const GAMES = {
  'reader-rabbits-ready-for-letters-1992': ['little', 'Letters and first words', "Reader Rabbit's Ready for Letters"],
  'mixed-up-mother-goose-1991': ['little', 'Find the lost rhymes'],
  'a-j-s-world-of-discovery-1992': ['little', 'Letters, numbers and shapes'],
  'dino-sorcerer-1990': ['little', 'Match and mix'],
  'reader-rabbit-3-1993': ['words', 'Write the news'],
  'mind-castle-1993': ['words', 'Word puzzles in a castle'],
  'number-munchers-1990': ['numbers', 'Munch the right numbers'],
  'super-munchers-the-challenge-continues-1991': ['numbers', 'Munch the right answers', 'Super Munchers'],
  'fraction-fever-1984': ['numbers', 'Catch the fractions'],
  'the-oregon-trail-deluxe-1992': ['world', 'Lead a wagon west'],
  'amazon-trail-1993': ['world', 'Paddle up the Amazon'],
  'jenny-of-the-prairie-1985': ['world', 'Live on the prairie'],
  'where-in-the-world-is-carmen-sandiego-deluxe-1990': ['world', 'Chase a thief around the world', 'Carmen Sandiego Deluxe'],
  'where-in-the-world-is-carmen-sandiego-enhanced-1989': ['world', 'Chase a thief around the world', 'Carmen Sandiego'],
  'alfs-u-s-geography-1993': ['world', 'Learn the states'],
  'simant-the-electronic-ant-colony-1991': ['science', 'Run an ant colony', 'SimAnt'],
  'simearth-the-living-planet-1990': ['science', 'Grow a living planet', 'SimEarth'],
  'super-solvers-gizmos-and-gadgets-1993': ['science', 'Build machines that work', 'Gizmos and Gadgets'],
  'museum-madness-1994': ['science', 'Fix the museum'],
  'microsoft-space-simulator-1994': ['science', 'Fly in space', 'Space Simulator'],
  'castle-of-dr-brain-1991': ['think', 'Puzzles in a castle'],
  'bobby-fischer-teaches-chess-1994': ['think', 'Learn to play chess'],
  'tetris-game-boy': ['think', 'Fit the falling blocks', 'Tetris'],   // Bryan, 20 Nov 2026: "also tetris"
  // From PLAY's console shelves (Bryan, 20 Nov 2026: "nintendo super nintendo gameboy color that had a bunch of learning
  // kids games. magic school bus, arthur, sesame street, etc."):
  'sesame-street-abc-nes': ['little', 'Letters with Ernie and Bert', 'Sesame Street ABC'],
  'big-birds-hide-and-speak-nes': ['little', 'Find the letters with Big Bird', "Big Bird's Hide and Speak"],
  'elmos-abcs-game-boy-color': ['little', 'Letters with Elmo', "Elmo's ABCs"],
  'sesame-street-sports-game-boy-color': ['little', 'Run, jump and count', 'Sesame Street Sports'],
  'big-birds-egg-catch-2600': ['little', 'Catch the eggs', "Big Bird's Egg Catch"],
  'strawberry-shortcake-musical-match-ups-2600': ['little', 'Match the music', 'Strawberry Shortcake Match-ups'],
  'bear-in-the-big-blue-house-game-boy-color': ['little', 'A day with Bear', 'Bear in the Big Blue House'],
  'dragon-tales-dragon-adventures-game-boy-color': ['little', 'Adventures in Dragon Land', 'Dragon Tales: Dragon Adventures'],
  'dragon-tales-dragon-wings-game-boy-color': ['little', 'Fly with the dragons', 'Dragon Tales: Dragon Wings'],
  'curious-george-gba': ['little', 'Explore with George', 'Curious George'],
  'thomas-the-tank-engine-snes': ['little', 'Ride the rails', 'Thomas the Tank Engine'],
  'extreme-sports-with-the-berenstain-bears-game-boy-color': ['little', 'Race with the Bears', 'Berenstain Bears Sports'],
  'arthurs-absolutely-fun-day-game-boy-color': ['words', 'A fun day with Arthur', "Arthur's Absolutely Fun Day!"],
  'mickeys-safari-in-letterland-nes': ['words', 'Find the letters on safari', "Mickey's Safari in Letterland"],
  'green-eggs-and-ham-gba': ['words', 'Dr. Seuss puzzles', 'Green Eggs and Ham'],
  'donkey-kong-jr-math-nes': ['numbers', 'Climb to the answer', 'Donkey Kong Jr. Math'],
  'mickeys-adventures-in-numberland-nes': ['numbers', 'Numbers with Mickey', "Mickey's Numberland"],
  'mario-is-missing-snes': ['world', 'Find famous places', 'Mario is Missing! (Super Nintendo)'],
  'mario-is-missing-nes': ['world', 'Find famous places', 'Mario is Missing! (NES)'],
  'the-magic-school-bus-space-exploration-game-genesis': ['science', 'Fly through space', 'The Magic School Bus'],
  'the-chessmaster-game-gear': ['think', 'Play chess', 'The Chessmaster'],
  'checkers-2600': ['think', 'Play checkers', 'Checkers'],
  'mario-paint-snes': ['make', 'Draw, stamp and make music', 'Mario Paint'],
  // Flash and Windows 3.1 (Bryan, 20 Nov 2026: "we need to be able to play these formats"; the play-new-formats branch):
  'sesame-street-journey-to-ernie-flash-2002': ['little', 'Find Ernie', 'Journey to Ernie'],
  'sesame-street-letters-to-big-bird-flash': ['little', 'Letters for Big Bird', 'Letters to Big Bird'],
  'sesame-street-elmo-goes-to-the-doctor-flash': ['little', 'A visit to the doctor', 'Elmo Goes to the Doctor'],
  'dora-the-explorer-find-boots-flash-2000': ['little', 'Help find Boots', 'Dora: Find Boots'],
  'reader-rabbit-1-windows-1997': ['words', 'Build words in the factory', 'Reader Rabbit 1'],
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Kids cards held off the Kids shelf until a fault is fixed (Bryan's call each time; the card stays kids on PLAY).
// Reader Rabbit 1 (Windows) was held for its 90-second display test at every start (Bryan, 20 Nov 2026); lifted once
// PLAY wrote WinG's answer into WIN.INI (play-new-formats 7590a3abe) and its title came up within 20 seconds.
const HOLD = {};
// True once workers/kids/worker.js answers /api/piece for the kids games (PLAY's functions/api/piece.js, with the list of
// games that stream: play/shelf/stream.js cut to kids cards). Until then, streamed cards stay off Kids.
const PIECES = false;

// Only a card that says kids: true, is not held, plays on an engine we serve, and has our own picture.
function kidsCards(play, artDir) {
  const out = [];
  for (const f of fs.readdirSync(path.join(play, 'cards')).filter((x) => x.endsWith('.json')).sort()) {
    let c; try { c = JSON.parse(fs.readFileSync(path.join(play, 'cards', f), 'utf8')); } catch (e) { continue; }
    if (c.kids !== true || !c.id || !/^[a-z0-9-]+$/.test(c.id) || !c.core) continue;
    if (HOLD[c.id]) { console.warn('Kids games: ' + c.id + ' held off Kids (' + HOLD[c.id] + ')'); continue; }
    // A game read in pieces through /api/piece (big CD-ROM discs, "archive.stream": true) needs that path on this site;
    // the kids Worker does not answer it yet, so such a card would never start. Held until PIECES is turned on.
    if (c.archive && c.archive.stream && !PIECES) { console.warn('Kids games: ' + c.id + ' held off Kids (read in pieces; the kids Worker has no /api/piece yet)'); continue; }
    out.push({ card: c, art: artDir && fs.existsSync(path.join(artDir, c.id + '.jpg')) });
  }
  return out;
}

// The kids copy of PLAY's game page. Each change must find its spot, so a change to play/game.html stops the build here
// instead of quietly letting a link out or the donation back in front of a child.
function kidsGamePage(html, version) {
  const swaps = [
    ['<html lang="en">', '<html lang="en" data-kids>'],
    ['<head>', '<head>\n<meta name="play-build" content="' + version + '">'],
    ['<meta name="theme-color" content="#07080c">', '<meta name="theme-color" content="#fff8e7">'],
    ['content="PLAY">', 'content="Kids games">'],
    ['<link rel="manifest" href="manifest.webmanifest"><link rel="apple-touch-icon" href="/assets/brand/apple-touch-icon.png">', '<link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="/assets/kids/apple-touch-icon.png">'],
    ['<title>PLAY | voidtv.net</title>', '<title>Games | voidtv.net kids</title>'],
    ['<link rel="icon" href="/favicon.ico">', '<link rel="icon" href="/assets/kids/mark.svg" type="image/svg+xml">'],
    ['<link rel="stylesheet" href="play.css">', '<link rel="stylesheet" href="play.css?v=' + version + '"><link rel="stylesheet" href="kids.css?v=' + version + '">'],
    [/<a class="mark" href="\/"[^>]*>[\s\S]*?<\/a>/, '<a class="mark" href="/" aria-label="voidtv.net kids home"><img src="/assets/kids/mark.svg" alt=""><span class="v">voidtv.net</span> <span class="n">kids</span></a>'],
    ['<span class="tag">PLAY</span>', '<span class="tag">Games</span>'],
    // The donation: none in front of a child (Bryan, 17 Nov 2026); it lives behind the grown-up check.
    [/\s*<button type="button" id="give"[\s\S]*?<\/button>/, ''],
    [/\s*<div id="give-card"[\s\S]*?<\/div>/, ''],
    [/\s*<p class="donate">[\s\S]*?<\/p>/, ''],
    // The credits: the Archive named in words; the engine's source offer is on For grown-ups. The ids stay as empty
    // spans, so PLAY's script can fill them and nothing it sets is a link.
    [/<p id="credits" class="credits">[\s\S]*?<\/p>/, '<p id="credits" class="credits"><span id="from">The game plays straight from the Internet Archive.</span>'
      + '<span hidden><span id="core-name"></span><span id="core-licence"></span><span id="src-core"></span><span id="core-terms"><span id="core-terms-link"></span></span></span></p>'],
    [/<p class="cheat-src">[\s\S]*?<\/p>/, '<p class="cheat-src"><span id="cheat-src"></span></p>'],
    // Scripts carry this build, so a new build reaches a browser at once (as voidtv.net's site build does).
    [/(src="src\/[a-z0-9-]+\.js)"/g, '$1?v=' + version + '"'],
  ];
  for (const [from, to] of swaps) {
    const hit = typeof from === 'string' ? html.includes(from) : from.test(html);
    if (!hit) throw new Error('kids games: play/game.html changed, cannot find ' + String(from).slice(0, 80));
    if (from instanceof RegExp) from.lastIndex = 0;
    html = typeof from === 'string' ? html.replace(from, to) : html.replace(from, to);
  }
  // Nothing left that leaves the site: every href is on this site, and no target=_blank remains.
  const out = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]).filter((h) => /^(https?:)?\/\//i.test(h));
  if (out.length || /target="_blank"/.test(html)) throw new Error('kids games: a link out is left in the game page: ' + out.join(' '));
  return html;
}

// The kids look on the game page: paper and ink around the picture, sticker buttons; the picture stays black. The
// phone pad (other phones joining by a code) is off on kids.
const KIDS_CSS = `:root{--bg:#fff8e7;--panel:#fff;--line:#1b1f3b;--fg:#1b1f3b;--dim:#3a3f66;--acc:#1b1f3b;--pink:#ff5fa2;--blue:#2ec4b6;--gold:#1b1f3b}
html[data-kids] #b-phones,html[data-kids] #cover-phone,html[data-kids] #m-phones,html[data-kids] #phones,html[data-kids] .donate,html[data-kids] .give{display:none!important}
.bar{background:#fff8e7;border-bottom:4px solid #1b1f3b;height:56px}
.mark{display:flex;align-items:center;gap:8px;font-weight:800}.mark img{width:34px;height:34px}.mark .v{color:#ff5fa2}.mark .n{color:#2ec4b6}
.tag{color:#1b1f3b;border:3px solid #1b1f3b;background:#ffd23f;border-radius:999px;padding:2px 10px;font-size:12px}
.title{color:#1b1f3b}
.tool{background:#fff;color:#1b1f3b;border:3px solid #1b1f3b;border-radius:999px;font-weight:700;box-shadow:3px 3px 0 #1b1f3b}
.tool:active{box-shadow:1px 1px 0 #1b1f3b;transform:translate(2px,2px)}
a.tool{color:#1b1f3b}a.tool:hover{color:#1b1f3b;background:#ffd23f}
.tool[aria-pressed=true]{background:#ffd23f;border-color:#1b1f3b;color:#1b1f3b}
.pk{color:#fff}
@media (max-width:430px){.bar .mark .n{display:inline}.bar .mark .v{display:none}}
.cover{color:#fff;--fg:#fff;--dim:#d4d6e8;--acc:#ffd23f}.cover .credits{color:#e8e8ee}
.toast,.zone,.over,.phones{color:#fff;--fg:#fff;--dim:#d4d6e8;--acc:#ffd23f;--line:#2a3046;--panel:#141826}
.play{background:#ffd23f;color:#1b1f3b;border:5px solid #1b1f3b;border-radius:999px;box-shadow:5px 5px 0 #1b1f3b;font-weight:800}
.menu{background:#fff;color:#1b1f3b;border:5px solid #1b1f3b;border-radius:26px;box-shadow:6px 6px 0 #1b1f3b}
.menu a{color:#1b1f3b}
`;

const SHELF_CSS = `
.kg-hello{text-align:center;margin:4px 0 20px}.kg-hello p{margin:0;font-size:22px;font-weight:700;color:var(--dim)}
.kg-row{margin:0 0 30px}.kg-row h2{font-family:Unbounded,system-ui,sans-serif;font-size:24px;margin:0 0 14px}
.kg-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:20px}
.kg-game{display:flex;flex-direction:column;background:#fff;border:5px solid var(--ink);border-radius:24px;box-shadow:6px 6px 0 var(--ink);overflow:hidden;color:var(--ink);text-decoration:none}
.kg-game:active{box-shadow:2px 2px 0 var(--ink);transform:translate(4px,4px)}
.kg-game img{display:block;width:100%;height:auto;aspect-ratio:8/5;object-fit:contain;background:#1b1f3b;border-bottom:5px solid var(--ink)}
.kg-game b{font-size:20px;line-height:1.2;padding:10px 14px 2px}.kg-game span{font-size:17px;color:var(--dim);padding:0 14px 14px;font-weight:600}
.kg-row[data-row=little] .kg-game{background:#fff6d6}.kg-row[data-row=words] .kg-game{background:#ffe9f3}.kg-row[data-row=numbers] .kg-game{background:#e5f6fd}
.kg-row[data-row=world] .kg-game{background:#e3f7f5}.kg-row[data-row=science] .kg-game{background:#eef9e0}.kg-row[data-row=think] .kg-game{background:#f1ebff}
.kg-grown{max-width:720px;margin:34px auto 0;background:#fff;border:4px dashed var(--ink);border-radius:20px;padding:14px 18px;font-size:17px}
.kg-grown h3{margin:0 0 6px;font-family:Unbounded,system-ui,sans-serif;font-size:18px}.kg-grown p{margin:6px 0}
@media(max-width:520px){.kg-list{grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.kg-game b{font-size:17px;padding:8px 10px 2px}.kg-game span{font-size:15px;padding:0 10px 10px}.kg-row h2{font-size:20px}}
`;

function shelfPage(games, { preview }) {
  const css = fs.readFileSync(path.join(__dirname, '..', 'play', 'play.css'), 'utf8');
  const rows = ROWS.map(([key, name]) => {
    const here = games.filter((g) => ((GAMES[g.card.id] || [])[0] || 'more') === key);
    if (!here.length) return '';
    return '<section class="kg-row" data-row="' + key + '"><h2>' + esc(name) + '</h2><div class="kg-list">' + here.map((g) => {
      const [, line, short] = GAMES[g.card.id] || [];
      const title = short || g.card.title;
      return '<a class="kg-game" href="game.html?game=' + encodeURIComponent(g.card.id) + '"><img src="art/' + esc(g.card.id) + '.jpg" alt="" loading="lazy" width="480" height="300">'
        + '<b>' + esc(title) + '</b>' + (line ? '<span>' + esc(line) + '</span>' : '') + '</a>';
    }).join('') + '</div></section>';
  }).join('');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>Computer games | voidtv.net kids</title><meta name="description" content="Computer games from long ago that make you think.">' + (preview ? '<meta name="robots" content="noindex">' : '')
    + '<link rel="icon" href="/assets/kids/mark.svg" type="image/svg+xml"><meta name="theme-color" content="#fff8e7">'
    + "<style>@font-face{font-family:'Unbounded';font-style:normal;font-weight:200 900;font-display:swap;src:url(/assets/brand/fonts/unbounded-latin.woff2) format('woff2')}\n" + css + SHELF_CSS + NAV.CSS + '</style></head><body>'
    + NAV.bar('games')
    + '<main><h1 class="pl-h">Computer games</h1><div class="kg-hello"><p>Games from long ago that make you think.</p></div>' + rows
    + '<section class="kg-grown"><h3>For grown-ups</h3><p>These are computer games from the 1980s and 90s, each picked by a person, played straight from the Internet Archive. Most need reading and a keyboard or mouse, so the first time goes best side by side.</p>'
    + '<p>Progress saves in this browser only. Nothing about your child is sent anywhere.</p></section></main>'
    + '<script>' + NAV.SCRIPT + '</script></body></html>';
}

function buildGames(out, root, opts = {}) {
  const play = playDir(root);
  if (!play) { console.warn('Kids games: PLAY not found (set PLAY_DIR), so no /games/'); return { games: 0 }; }
  const artDir = opts.artDir;
  const all = kidsCards(play, artDir);
  const noArt = all.filter((g) => !g.art).map((g) => g.card.id);
  if (noArt.length) console.warn('Kids games: no picture yet, left out: ' + noArt.join(', ') + ' (add profiles/kids/site-assets/games/<id>.jpg)');
  const games = all.filter((g) => g.art);
  const dst = path.join(out, 'games');
  fs.rmSync(dst, { recursive: true, force: true });
  fs.mkdirSync(path.join(dst, 'cards'), { recursive: true });
  // The engines those cards use, read from PLAY's own list of cores.
  // PLAY's player must know a kids page (play.js with <html data-kids>: only kids cards, no donation, no phone controller,
  // no cheats, no links out). An older PLAY without it is refused rather than served to children.
  if (!fs.readFileSync(path.join(play, 'src', 'play.js'), 'utf8').includes("const KIDS = document.documentElement.hasAttribute('data-kids');")) throw new Error('kids games: PLAY at ' + play + ' has no kids page mode in src/play.js');
  const cardsJs = fs.readFileSync(path.join(play, 'src', 'cards.js'), 'utf8');
  const engines = new Set();
  for (const g of games) {
    const name = g.card.core.replace(/[-.]/g, '\\$&');
    const m = new RegExp("(?:'" + name + "'|\\b" + name + "):\\s*\\{[^}]*?engine:\\s*'engine/([a-z0-9./{}_-]+)\\.js'").exec(cardsJs);
    if (!m || m[1].includes('{') || m[1].includes('..')) throw new Error('kids games: no single engine file for core ' + g.card.core + ' (' + g.card.id + ')');
    // An engine in its own folder (Ruffle: engine/ruffle/, its WebAssembly under a hashed name) goes as the whole folder.
    engines.add(m[1].includes('/') ? m[1].split('/')[0] + '/' : m[1]);
  }
  // The build stamp: the files a visitor loads, so the same PLAY gives the same stamp.
  const hash = crypto.createHash('sha1');
  const srcFiles = fs.readdirSync(path.join(play, 'src')).filter((f) => f.endsWith('.js')).sort();
  for (const f of ['game.html', 'play.css'].concat(srcFiles.map((f) => 'src/' + f))) hash.update(fs.readFileSync(path.join(play, f)));
  hash.update(KIDS_CSS);
  const version = hash.digest('hex').slice(0, 12);
  fs.cpSync(path.join(play, 'src'), path.join(dst, 'src'), { recursive: true, filter: (p) => fs.statSync(p).isDirectory() || p.endsWith('.js') });
  fs.mkdirSync(path.join(dst, 'engine'), { recursive: true });
  // Each engine, and its licence text where the engine is not GPL (PLAY serves it beside the engine: snes9x, mGBA,
  // Genesis Plus GX, Handy).
  for (const e of [...engines].filter((x) => x.endsWith('/'))) {
    const d = path.join(play, 'engine', e);
    if (!fs.existsSync(d)) throw new Error('kids games: engine folder missing: ' + d);
    fs.cpSync(d, path.join(dst, 'engine', e), { recursive: true });
  }
  for (const e of [...engines].filter((x) => !x.endsWith('/'))) for (const ext of ['.js', '.wasm', '.LICENSE.txt']) {
    const f = path.join(play, 'engine', e + ext);
    if (fs.existsSync(f)) fs.copyFileSync(f, path.join(dst, 'engine', e + ext));
    else if (ext !== '.LICENSE.txt') throw new Error('kids games: engine file missing: ' + f);
  }
  if (fs.existsSync(path.join(play, 'skin'))) fs.cpSync(path.join(play, 'skin'), path.join(dst, 'skin'), { recursive: true });
  fs.copyFileSync(path.join(play, 'play.css'), path.join(dst, 'play.css'));
  fs.copyFileSync(path.join(play, 'LICENSE'), path.join(dst, 'LICENSE.txt'));
  fs.writeFileSync(path.join(dst, 'kids.css'), KIDS_CSS);
  fs.writeFileSync(path.join(dst, 'game.html'), kidsGamePage(fs.readFileSync(path.join(play, 'game.html'), 'utf8'), version));
  for (const g of games) fs.writeFileSync(path.join(dst, 'cards', g.card.id + '.json'), JSON.stringify(g.card, null, 1));
  // The nightly check's list, cut to these games: a game whose Archive file is gone says so instead of failing.
  const st = path.join(play, 'shelf', 'status.json');
  if (fs.existsSync(st)) {
    let s = {}; try { s = JSON.parse(fs.readFileSync(st, 'utf8')); } catch (e) { s = {}; }
    const keep = {}; for (const g of games) if (s.games && s.games[g.card.id]) keep[g.card.id] = s.games[g.card.id];
    fs.mkdirSync(path.join(dst, 'shelf'), { recursive: true });
    fs.writeFileSync(path.join(dst, 'shelf', 'status.json'), JSON.stringify({ games: keep }));
  }
  // Our own pictures, only for the games in this build.
  // At /games/art/<id>.jpg, where PLAY's kids page looks for its start picture (play.js, data-kids).
  const artOut = path.join(dst, 'art');
  fs.mkdirSync(artOut, { recursive: true });
  for (const g of games) fs.copyFileSync(path.join(artDir, g.card.id + '.jpg'), path.join(artOut, g.card.id + '.jpg'));
  fs.writeFileSync(path.join(dst, 'index.html'), shelfPage(games, { preview: !!opts.preview }));
  return { games: games.length, engines: [...engines], version, play };
}

module.exports = { buildGames, kidsGamePage, kidsCards, playDir, GAMES, ROWS, HOLD };
if (require.main === module) {
  const a = process.argv.slice(2);
  if (!a[0]) { console.error('usage: node scripts/lib/games/build.js <out dir> [<art dir>]'); process.exit(1); }
  console.log(buildGames(a[0], path.join(__dirname, '..', '..', '..'), { artDir: a[1] || path.join(__dirname, '..', '..', '..', 'profiles', 'kids', 'site-assets', 'games') }));
}
