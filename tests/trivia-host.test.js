// Trivia Nights host screen (plan T6). Run: node --test tests/trivia-host.test.js
// Picking a game (deck rules, no subject twice, kinds take turns, fresh questions first), the host's keys, the CASH line
// matching the project's one setting, and the page's own rules (no dashes, a back arrow, tips on controls, credit line).
// No network; nothing is written.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const G = require('../trivia/src/game');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

function bank() {
  const qs = [];
  let n = 0;
  for (const round of ['cast', 'episode', 'first-aired', 'network']) {
    for (let i = 0; i < 12; i++) qs.push({ id: 'q' + (n++), category: 'tv', round, band: i % 3 ? 'family' : 'after-dark', about: { show: 'show-' + (i % 6) + '-' + round }, choices: ['a', 'b', 'c', 'd'], answer: 0 });
  }
  for (let i = 0; i < 8; i++) qs.push({ id: 'g' + i, category: 'games', round: 'game-year', band: 'family', about: { card: 'c' + i }, choices: ['a', 'b', 'c', 'd'], answer: 0 });
  return qs;
}

test('a family game holds family questions only; after dark may hold both', () => {
  const fam = G.pickGame(bank(), { band: 'family', categories: ['tv', 'games'], count: 20 }, G.seeded(1));
  assert.ok(fam.every((q) => q.band === 'family'));
  const all = G.allowed(bank(), { band: 'after-dark', categories: ['tv'] });
  assert.ok(all.some((q) => q.band === 'after-dark'));
});

test('only the chosen topics, the right count, no subject twice', () => {
  const g = G.pickGame(bank(), { band: 'after-dark', categories: ['tv'], count: 15 }, G.seeded(2));
  assert.equal(g.length, 15);
  assert.ok(g.every((q) => q.category === 'tv'));
  assert.equal(new Set(g.map(G.subject)).size, g.length);
});

test('kinds of question take turns: never the same kind three times running', () => {
  const g = G.pickGame(bank(), { band: 'after-dark', categories: ['tv', 'games'], count: 20 }, G.seeded(3));
  for (let i = 2; i < g.length; i++) assert.ok(!(g[i].round === g[i - 1].round && g[i].round === g[i - 2].round), 'three in a row at ' + i);
});

test('questions shown in earlier games come back only when nothing fresh is left', () => {
  const qs = bank();
  const seen = new Set(qs.filter((q) => q.category === 'games').slice(0, 6).map((q) => q.id));
  const g = G.pickGame(qs, { band: 'family', categories: ['games'], count: 2, seen }, G.seeded(4));
  assert.ok(g.every((q) => !seen.has(q.id)));
  const all = G.pickGame(qs, { band: 'family', categories: ['games'], count: 8, seen }, G.seeded(4));
  assert.equal(all.length, 8, 'falls back to seen questions rather than a short game');
});

test('the same seed gives the same game (a test can replay one)', () => {
  const a = G.pickGame(bank(), { band: 'family', categories: ['tv'], count: 10 }, G.seeded(9)).map((q) => q.id);
  const b = G.pickGame(bank(), { band: 'family', categories: ['tv'], count: 10 }, G.seeded(9)).map((q) => q.id);
  assert.deepEqual(a, b);
});

test('host keys: keyboard, clicker and TV remote', () => {
  for (const key of ['Enter', ' ', 'PageDown', 'ArrowRight']) assert.equal(G.keyAction({ key }), 'next', key);
  assert.equal(G.keyAction({ key: 'p' }), 'pause');
  for (const key of ['Escape', 'Backspace', 'GoBack']) assert.equal(G.keyAction({ key }), 'back', key);
  assert.equal(G.keyAction({ key: 'Unidentified', keyCode: 461 }), 'back', 'webOS remote Back');
  assert.equal(G.keyAction({ key: 'Unidentified', keyCode: 10009 }), 'back', 'Tizen remote Back');
  assert.equal(G.keyAction({ key: 'x' }), null);
});

test('the CASH donation link is the project setting, with the standard line', () => {
  const app = read('scripts/lib/app.js').match(/const DONATE_URL = '([^']+)'/)[1];
  const host = read('trivia/src/host.js');
  assert.equal(host.match(/const DONATE_URL = '([^']+)'/)[1], app);
  assert.match(host, /If you found this service helpful, please think of donating to keep it running and to make more services like this possible\. Every donation goes to CASH \(cashvalues\.org\)/);
  assert.match(read('trivia/index.html'), /class="donate-line"/);
});

test('the page keeps the house rules: no dashes, a back arrow, a tip on every control, the TMDB credit', () => {
  const html = read('trivia/index.html');
  for (const f of ['trivia/index.html', 'trivia/src/host.js', 'trivia/src/game.js', 'trivia/trivia.css']) assert.ok(!/[\u2013\u2014]/.test(read(f)), f);
  assert.match(html, /id="back"[^>]*title=/);
  for (const m of html.matchAll(/<(button|label)\b[^>]*>/g)) assert.match(m[0], /title=/, m[0]);
  assert.match(html, /This product uses the TMDB API but is not endorsed or certified by TMDB/);
});

test('the built bank, when present, is what the page expects', () => {
  const idxFile = path.join(ROOT, 'trivia', 'bank', 'index.json');
  if (!fs.existsSync(idxFile)) return;
  const idx = JSON.parse(fs.readFileSync(idxFile, 'utf8'));
  assert.ok(idx.files.length && idx.total > 0);
  for (const f of idx.files) {
    assert.ok(G.CATEGORY_NAMES[f.category], f.category);
    const qs = JSON.parse(fs.readFileSync(path.join(ROOT, 'trivia', 'bank', f.file), 'utf8'));
    assert.equal(qs.length, f.count, f.file);
    for (const q of qs) assert.ok(G.ROUND_NAMES[q.round], q.round);
  }
});

// ---- Phones (plan T9) ----
const W = require('../trivia/src/words');

test('scoring: right and early scores most, right at the buzzer 500, wrong 0, no clock 1000', () => {
  assert.equal(G.points(true, 20000, 20000), 1000);
  assert.equal(G.points(true, 0, 20000), 500);
  assert.equal(G.points(true, 10000, 20000), 750);
  assert.equal(G.points(false, 20000, 20000), 0);
  assert.equal(G.points(true, 0, 0), 1000);
  assert.ok(G.points(true, 12345, 20000) % 10 === 0, 'rounded to tens');
});

test('standings: high score first, ties share a place, earlier seat first among ties', () => {
  const s = G.standings([{ seat: 3, score: 500 }, { seat: 1, score: 900 }, { seat: 2, score: 500 }, { seat: 4, score: 0 }]);
  assert.deepEqual(s.map((p) => [p.seat, p.place]), [[1, 1], [2, 2], [3, 2], [4, 4]]);
  assert.equal(G.ordinal(1), '1st'); assert.equal(G.ordinal(2), '2nd'); assert.equal(G.ordinal(3), '3rd');
  assert.equal(G.ordinal(11), '11th'); assert.equal(G.ordinal(22), '22nd'); assert.equal(G.ordinal(113), '113th');
});

test('a phone answer counts only for the current question and only as 0 to 3', () => {
  assert.equal(G.answerOf({ type: 't-a', n: 4, pick: 2 }, 4), 2);
  assert.equal(G.answerOf({ type: 't-a', n: 3, pick: 2 }, 4), null, 'an old question');
  assert.equal(G.answerOf({ type: 't-a', n: 4, pick: 7 }, 4), null);
  assert.equal(G.answerOf({ type: 't-a', n: 4, pick: '1' }, 4), null);
  assert.equal(G.answerOf({ type: 'pad', n: 4, pick: 1 }, 4), null);
  assert.equal(G.answerOf(null, 4), null);
});

test('nicknames: kept short and plain; slurs never; rough words not in family games; squashed spellings caught', () => {
  assert.equal(W.cleanName('Quiz Queen', 'family'), 'Quiz Queen');
  assert.equal(W.cleanName('  A   very long nickname indeed ', 'family'), 'A very long nick');
  assert.equal(W.cleanName('<b>Bob</b>', 'family'), 'bBobb');
  assert.equal(W.cleanName('', 'family'), null);
  assert.equal(W.cleanName('Sh1t Head', 'after-dark'), null);
  assert.equal(W.cleanName('s h i t', 'family'), null);
  assert.equal(W.cleanName('Damn Yankees', 'family'), null);
  assert.equal(W.cleanName('Damn Yankees', 'after-dark'), 'Damn Yankees');
  assert.equal(W.cleanName('Zoë', 'family'), 'Zoë');
});

test('the phone page carries the CASH line, a back arrow and tips; no dashes', () => {
  const app = read('scripts/lib/app.js').match(/const DONATE_URL = '([^']+)'/)[1];
  const phone = read('trivia/src/phone.js');
  assert.equal(phone.match(/const DONATE_URL = '([^']+)'/)[1], app);
  const html = read('trivia/phone.html');
  assert.match(html, /class="back"[^>]*title=/);
  for (const m of html.matchAll(/<button\b[^>]*>/g)) assert.match(m[0], /title=/, m[0]);
  for (const f of ['trivia/phone.html', 'trivia/src/phone.js', 'trivia/src/words.js']) assert.ok(!/[\u2013\u2014]/.test(read(f)), f);
});

test('the host opens a trivia room on the shared relay and loads the shared QR maker', () => {
  const host = read('trivia/src/host.js');
  assert.match(host, /\/api\/room\/open\?kind=trivia/);
  assert.match(read('trivia/index.html'), /src="\/play\/src\/qr\.js"/);
  assert.match(read('trivia/src/phone.js'), /\/api\/room\/' \+ code \+ '\/join\?t='/);
});

// ---- Clips, pictures and sound (plan T7) ----
test('clips: only when Clips is on, never on a public night, at most a quarter of a game', () => {
  const qs = bank();
  for (let i = 0; i < 30; i++) qs.push({ id: 'm' + i, category: 'tv', round: ['clip', 'still', 'listen'][i % 3], band: 'family', about: { show: 'media-' + i }, media: { kind: 'video', url: 'https://archive.org/download/x/y.mp4', start: 100, end: 110 }, pd: i % 2 === 0, choices: ['a', 'b', 'c', 'd'], answer: 0 });
  const home = G.pickGame(qs, { band: 'family', categories: ['tv'], count: 20, clips: true }, G.seeded(5));
  const media = home.filter((q) => q.media).length;
  assert.ok(media >= 1 && media <= 5, media + ' clips in 20');
  assert.equal(G.pickGame(qs, { band: 'family', categories: ['tv'], count: 20, clips: false }, G.seeded(5)).filter((q) => q.media).length, 0);
  assert.equal(G.pickGame(qs, { band: 'family', categories: ['tv'], count: 20, clips: true, publicNight: true }, G.seeded(5)).filter((q) => q.media).length, 0, 'not even items the Archive marks public domain');
  // Bryan, 20 Nov 2026: "i want it as a toggle to choose": the host may switch clips on for a public night.
  assert.ok(G.pickGame(qs, { band: 'family', categories: ['tv'], count: 20, clips: true, publicNight: true, publicClips: true }, G.seeded(5)).some((q) => q.media));
  assert.equal(G.pickGame(qs, { band: 'family', categories: ['tv'], count: 20, clips: false, publicNight: true, publicClips: true }, G.seeded(5)).filter((q) => q.media).length, 0, 'Clips off still means off');
});

test('the host plays clips from archive.org itself, waits for them before the clock, and has the Public night switch', () => {
  const host = read('trivia/src/host.js');
  assert.match(host, /vid\.src = m\.url \+ '#t=' \+ m\.start \+ ',' \+ m\.end;/);
  assert.match(host, /publicNight: val\('where'\) === 'public'/);
  assert.match(host, /clockWaiting/);
  const html = read('trivia/index.html');
  assert.match(html, /name="where" value="public"/);
  assert.match(html, /name="clips" value="on" checked/);
  assert.match(html, /id="pubclips-l" hidden title="[^"]+"><input type="checkbox" name="pubclips" value="on">/, 'off by default and shown only for a public night');
});

// ---- Audit round (20 Nov 2026): A20, A21 and the cross mark ----
test('A20: the host asks whether the room service is on and starts on Out loud when it is not', () => {
  const host = read('trivia/src/host.js');
  assert.match(host, /fetch\('\/api\/room', \{ cache: 'no-store' \}\)/, 'the plain question, no made-up room code');
  assert.doesNotMatch(host, /\/api\/room\/2222/, 'no lookup of a room that is not there (it leaves a red 404 in the console)');
  assert.match(host, /G\.roomsOn\(r\.ok, j\)/);
  assert.match(host, /if \(phonesIn\.checked\) loud\.checked = true;/);
  assert.match(read('trivia/index.html'), /id="phones-off" hidden> \(not switched on yet\)/);
});

test('red line: only 200 {on: true} counts as phone rooms on; every other answer is off', () => {
  assert.equal(G.roomsOn(true, { on: true }), true);
  assert.equal(G.roomsOn(false, { error: 'Phone rooms are not set up on this site yet' }), false, '503 not bound');
  assert.equal(G.roomsOn(false, { error: 'Phone rooms are not answering right now' }), false, '503 not answering');
  assert.equal(G.roomsOn(true, { error: 'No room by that code' }), false, 'a lookup answer is not an on');
  assert.equal(G.roomsOn(true, { on: 'yes' }), false);
  assert.equal(G.roomsOn(true, null), false, 'a plain page');
});

test('red line: the local room door answers the plain question with on, so the big screen offers phones here too', async () => {
  const http = require('http');
  const rooms = require('../play/rooms/local.js').createRooms();
  const server = http.createServer((req, res) => {
    const p = new URL(req.url, 'http://x').pathname;
    if (p === '/api/room' || p === '/api/room/') return rooms.status(req, res);
    res.writeHead(404); res.end();
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  try {
    const r = await fetch('http://127.0.0.1:' + server.address().port + '/api/room', { cache: 'no-store' });
    assert.equal(G.roomsOn(r.ok, await r.json()), true);
  } finally { server.close(); }
});

test('A21: the opening words follow the mode', () => {
  const host = read('trivia/src/host.js');
  assert.match(host, /Everyone scans a code with their phone and taps an answer/);
  assert.match(host, /Read each question out, let the room shout or write down answers/);
});

test('the CASH cross sits beside every donation line, from one setting, in a 44 px tap area with a tip', () => {
  for (const f of ['trivia/index.html', 'trivia/phone.html']) {
    const html = read(f);
    const lines = (html.match(/<span class="donate-line"><\/span>/g) || []).length;
    const crosses = (html.match(/<a class="donate-link cross-link"[^>]*title="Donate to CASH"[^>]*><img class="donate-cross"/g) || []).length;
    assert.ok(lines > 0 && crosses === lines, f + ': ' + crosses + ' crosses for ' + lines + ' lines');
  }
  for (const f of ['trivia/src/host.js', 'trivia/src/phone.js']) assert.match(read(f), /const CROSS = '\/assets\/brand\/cash-cross\.png';/, f);
  assert.match(read('trivia/trivia.css'), /\.cross-link\{[^}]*min-width:44px;min-height:44px/);
  assert.ok(fs.existsSync(path.join(ROOT, 'assets', 'brand', 'cash-cross.png')));
});

// ---- Our own formats (plan G3 Closest Without Going Over, G4 Higher or Lower; Bryan, 20 Nov 2026: "Yes, start those two") ----
const DATES = [
  { id: 'd-a', title: 'Show A', date: '1964-09-26', category: 'tv', band: 'family', source: { site: 'TVmaze', url: 'https://www.tvmaze.com/shows/1', fact: 'premiered 1964-09-26' } },
  { id: 'd-b', title: 'Show B', date: '1974-03-03', category: 'tv', band: 'family', source: { site: 'TVmaze', url: 'https://www.tvmaze.com/shows/2', fact: 'premiered 1974-03-03' } },
  { id: 'd-c', title: 'Show C', date: '1974-09-12', category: 'tv', band: 'family', source: { site: 'TVmaze', url: 'https://www.tvmaze.com/shows/3', fact: 'premiered 1974-09-12' } },
  { id: 'd-d', title: 'Show D', date: '1981-01-01', category: 'tv', band: 'after-dark', source: { site: 'TVmaze', url: 'https://www.tvmaze.com/shows/4', fact: 'premiered 1981-01-01' } },
  { id: 'd-e', title: 'Show E', date: '1990-05-05', category: 'tv', band: 'family', source: { site: 'TVmaze', url: 'https://www.tvmaze.com/shows/5', fact: 'premiered 1990-05-05' } },
  { id: 'd-f', title: 'Show F', date: '1999-01-04', category: 'tv', band: 'family', source: { site: 'TVmaze', url: 'https://www.tvmaze.com/shows/6', fact: 'premiered 1999-01-04' } },
  { id: 'd-g', title: 'Game G', date: '1982', category: 'games', band: 'family', source: { site: 'Internet Archive', url: 'https://archive.org/details/g', fact: 'year 1982' } },
  { id: 'd-h', title: 'Game H', date: '1982', category: 'games', band: 'family', source: { site: 'Internet Archive', url: 'https://archive.org/details/h', fact: 'year 1982' } },
];

test('order: a full date beats a full date in the same year; two bare years that match cannot be told apart', () => {
  assert.equal(G.order(DATES[1], DATES[2]), -1);
  assert.equal(G.order(DATES[2], DATES[1]), 1);
  assert.equal(G.order(DATES[6], DATES[7]), 0);
  assert.equal(G.order(DATES[0], DATES[5]), -1);
});

test('Higher or Lower: a run of linked steps, one kind of title, family only in a family game, every answer true to the dates', () => {
  for (let seed = 1; seed < 40; seed++) {
    const run = G.hlRun(DATES, { band: 'family', categories: ['tv', 'games'] }, 3, G.seeded(seed));
    if (!run.length) continue;
    assert.equal(run.length, 3);
    for (let i = 0; i < run.length; i++) {
      const q = run[i];
      assert.deepEqual(q.choices, ['Before', 'After']);
      const prev = DATES.find((d) => d.title === q.hl.prev.title), next = DATES.find((d) => d.title === q.hl.next.title);
      assert.notEqual(G.order(next, prev), 0, 'never a pair the records cannot tell apart');
      assert.equal(q.answer, G.order(next, prev) < 0 ? 0 : 1, 'the answer follows the dates');
      assert.equal(prev.category, next.category);
      assert.ok(prev.band === 'family' && next.band === 'family');
      if (i) assert.equal(q.hl.prev.title, run[i - 1].hl.next.title, 'each step starts from the title just revealed');
      assert.ok(q.source && q.source2);
    }
  }
});

test('Closest Without Going Over: exact wins 1000, else the closest not past it 600, past it or no guess 0', () => {
  const pts = G.yearPoints(new Map([[1, 1963], [2, 1960], [3, 1965], [4, null], [5, 1963]]), 1964);
  assert.deepEqual([...pts], [[1, 600], [2, 0], [3, 0], [4, 0], [5, 600]]);
  const exact = G.yearPoints(new Map([[1, 1964], [2, 1963]]), 1964);
  assert.deepEqual([...exact], [[1, 1000], [2, 0]]);
  const none = G.yearPoints(new Map([[1, 1970]]), 1964);
  assert.deepEqual([...none], [[1, 0]]);
});

test('year questions and phone guesses: inside the range, for the current question only', () => {
  const qs = G.yearQs(DATES, { band: 'family', categories: ['tv'] }, 2, G.seeded(2));
  assert.equal(qs.length, 2);
  for (const q of qs) {
    const d = DATES.find((x) => x.title === q.about.title);
    assert.equal(q.year, parseInt(d.date, 10));
    assert.ok(q.min <= q.year && q.year <= q.max);
    assert.equal(G.guessOf({ type: 't-a', n: 3, year: q.year }, 3, q), q.year);
    assert.equal(G.guessOf({ type: 't-a', n: 2, year: q.year }, 3, q), null, 'an old question');
    assert.equal(G.guessOf({ type: 't-a', n: 3, year: 1800 }, 3, q), null, 'outside the range');
    assert.equal(G.guessOf({ type: 't-a', n: 3, year: '1990' }, 3, q), null);
  }
});

test('compose: the run stays together, year guesses spread, nothing lost', () => {
  const reg = Array.from({ length: 10 }, (_, i) => ({ id: 'r' + i }));
  const run = [{ id: 'h1' }, { id: 'h2' }, { id: 'h3' }];
  const yrs = [{ id: 'y1' }, { id: 'y2' }];
  const out = G.compose(reg, run, yrs);
  assert.equal(out.length, 15);
  const at = out.findIndex((q) => q.id === 'h1');
  assert.deepEqual(out.slice(at, at + 3).map((q) => q.id), ['h1', 'h2', 'h3']);
  assert.ok(out.findIndex((q) => q.id === 'y1') < out.findIndex((q) => q.id === 'y2'));
});

test('the built dates file holds only dates the bank proved, each with a source', () => {
  const f = path.join(ROOT, 'trivia', 'bank', 'dates.json');
  if (!fs.existsSync(f)) return;
  const dates = JSON.parse(fs.readFileSync(f, 'utf8'));
  assert.ok(dates.length > 100);
  for (const d of dates) {
    assert.match(d.date, /^\d{4}(-\d\d-\d\d)?$/, d.id);
    assert.ok(d.title && d.source && /^https:\/\//.test(d.source.url), d.id);
    assert.ok(d.source.fact.includes(d.date.slice(0, 4)), d.id + ': the date is the source fact\'s own');
  }
});

// ---- The Shelf (plan G1; Bryan, 20 Nov 2026: "Yes, build The Shelf") ----
function shelfBank() {
  const qs = [];
  let n = 0;
  for (const round of ['cast', 'first-aired', 'network', 'episode', 'game-year', 'film-year']) {
    for (let i = 0; i < 8; i++) qs.push({ id: 's' + (n++), category: round === 'game-year' ? 'games' : round === 'film-year' ? 'movies' : 'tv', round, band: 'family', fame: (i + 1) * 100, about: { show: round + '-' + i }, choices: ['a', 'b', 'c', 'd'], answer: 0 });
  }
  qs.push({ id: 'h1', category: 'tv', round: 'higher-lower', band: 'family', about: { show: 'x' }, choices: ['Before', 'After'], answer: 0 });
  return qs;
}

test('The Shelf: five categories of four squares, best known on the cheapest, no subject twice, a final from the rest', () => {
  const b = G.buildShelf(shelfBank(), { band: 'family', categories: ['tv', 'movies', 'games'] }, G.seeded(3));
  assert.equal(b.cats.length, 5);
  const subjects = new Set();
  for (const c of b.cats) {
    assert.deepEqual(c.cells.map((x) => x.value), G.SHELF_VALUES);
    for (let i = 1; i < c.cells.length; i++) assert.ok((c.cells[i - 1].q.fame || 0) >= (c.cells[i].q.fame || 0), 'fame falls as the value rises');
    for (const x of c.cells) { assert.equal(x.q.round, c.round); assert.ok(!subjects.has(G.subject(x.q))); subjects.add(G.subject(x.q)); }
    assert.notEqual(c.round, 'higher-lower', 'only plain questions on the board');
  }
  assert.ok(b.final && !subjects.has(G.subject(b.final)), 'the final is a question not on the board');
  assert.ok(!b.final.media, 'never a clip for the final');
  assert.equal(G.buildShelf(shelfBank(), { band: 'family', categories: ['games'] }, G.seeded(3)), null, 'too few kinds of question: no board');
});

test('the final bet: 0 up to what you have, never below 0; right wins it, wrong loses it', () => {
  assert.equal(G.wagerOf({ type: 't-bet', amount: 400 }, 600), 400);
  assert.equal(G.wagerOf({ type: 't-bet', amount: 700 }, 600), null);
  assert.equal(G.wagerOf({ type: 't-bet', amount: -5 }, 600), null);
  assert.equal(G.wagerOf({ type: 't-bet', amount: 0 }, -200), 0, 'a player below 0 can still bet 0');
  assert.equal(G.wagerOf({ type: 't-bet', amount: '100' }, 600), null);
  assert.equal(G.settleWager(true, 300), 300);
  assert.equal(G.settleWager(false, 300), -300);
});

test('the host page offers The Shelf and the phone page takes a bet', () => {
  assert.match(read('trivia/index.html'), /name="format" value="shelf"/);
  assert.match(read('trivia/src/host.js'), /G\.buildShelf\(all/);
  assert.match(read('trivia/src/phone.js'), /type: 't-bet', amount: bet/);
});

test('built questions carry their fame (TMDB votes) for the board', () => {
  const f = path.join(ROOT, 'trivia', 'bank', 'tv-1.json');
  if (!fs.existsSync(f)) return;
  const qs = JSON.parse(fs.readFileSync(f, 'utf8'));
  assert.ok(qs.filter((q) => q.fame > 0).length / qs.length > 0.9);
});

test('between questions (Bryan, 22 Nov 2026: "the lag or wait time between questions is to long"): with a clock the answer and the scores count down and move on; No clock waits for Enter', () => {
  const s = read('trivia/src/host.js');
  const m = /const AFTER_S = \{ reveal: (\d+), board: (\d+) \};/.exec(s);
  assert.ok(m, 'the two waits are one setting');
  assert.ok(+m[1] >= 4 && +m[1] <= 8, 'the answer stays up long enough to read, and no longer: ' + m[1] + ' s');
  assert.ok(+m[2] >= 3 && +m[2] <= 6, 'the scores, briefly: ' + m[2] + ' s');
  assert.match(s, /function autoNext\(el, words\) \{\n    clearAfter\(\);\n    if \(!game \|\| game\.mode === 'shelf' \|\| !game\.opts\.secs\) return;/, 'only a game with a clock moves on by itself; the board game waits for its picker');
  assert.equal((s.match(/autoNext\(\$\('hint'\), revealWords\);/g) || []).length, 2, 'after a question and after a year guess');
  assert.match(s, /autoNext\(\$\('board-hint'\), /, 'after the scores');
  assert.match(s, /function next\(\) \{\n    clearAfter\(\);/, 'Enter (or a tap) goes on at once and stops the countdown');
  assert.match(s, /if \(after && \(phase === 'reveal' \|\| phase === 'board'\)\) \{/, 'P or Pause holds the countdown');
  assert.match(read('trivia/index.html'), /value="0"> No clock<\/label>/, 'No clock is still there for a host who wants to pace it');
});

// The "why" line under an answer (Bryan, 24 Nov 2026): one sentence from the question and its recorded fact, never guessed.
test('whyLine says why the answer is right, from the recorded fact only', () => {
  const mk = (round, q, ans, fact, about) => ({ round, q, choices: ['x', ans], answer: 1, about: about || {}, source: { fact } });
  assert.equal(G.whyLine(mk('cast', 'Who voiced The Doctor on Superjail!?', 'Christopher McCulloch', 'Christopher McCulloch as The Doctor (voice), 36 episodes')),
    'Christopher McCulloch voiced The Doctor in 36 episodes of Superjail!');
  assert.equal(G.whyLine(mk('cast', 'Who played Al Bundy on Married... with Children?', 'Ed O\'Neill', 'Ed O\'Neill as Al Bundy, 258 episodes')),
    'Ed O\'Neill played Al Bundy in 258 episodes of Married... with Children.');
  assert.equal(G.whyLine(mk('first-aired', 'What year did The A-Team first air?', '1983', 'premiered 1983-01-23', { title: 'The A-Team' })), 'The A-Team first aired on 23 January 1983.');
  assert.equal(G.whyLine(mk('network', 'On which network did 8 Simple Rules first air?', 'ABC', 'first aired on ABC, 2002-09-17')), '8 Simple Rules first aired on ABC, on 17 September 2002.');
  assert.equal(G.whyLine(mk('game-maker', 'Who made Great Guns?', 'Stern Electronics', 'publisher Stern Electronics on VoidTV PLAY\'s card for this item')), 'Great Guns was made by Stern Electronics.');
  assert.equal(G.whyLine(mk('game-maker', 'Who made Dora?', 'Nick Jr.', 'publisher Nick Jr.')), 'Dora was made by Nick Jr.', 'no doubled full stop');
  assert.equal(G.whyLine(mk('clip', 'Which show is this clip from?', 'Futurama', 'Futurama, season 3, episode 4 "Parasites Lost", at 14:29; the item is marked public domain on the Archive')),
    'This clip is from Futurama, season 3, episode 4 "Parasites Lost", 14:29 in.');
  assert.equal(G.whyLine(mk('cast', 'Who played X on Y?', 'Z', 'something else entirely')), null, 'a fact in a shape the round does not record gets no guessed line');
  assert.equal(G.whyLine(mk('year-guess', 'q', '1', 'f')), null);
});

test('every question in the bank gets a why line with no dashes, no PLAY card wording and no double stops', () => {
  const qs = [];
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (f.name.endsWith('.json') && f.name !== 'index.json') { const j = JSON.parse(fs.readFileSync(p, 'utf8')); for (const q of Array.isArray(j) ? j : (j.questions || [])) if (q.round && q.choices) qs.push(q); } } };
  walk(path.join(ROOT, 'trivia', 'bank'));
  assert.ok(qs.length > 1000);
  const none = qs.filter((q) => q.round !== 'year-guess' && q.round !== 'higher-lower' && !G.whyLine(q));
  assert.equal(none.length, 0, 'no question is left without a line: ' + none.slice(0, 2).map((q) => q.q));
  for (const q of qs) { const w = G.whyLine(q); if (!w) continue; assert.doesNotMatch(w, /[–—]|PLAY's card|\.\.$|[!?]\.$/, w); }
});

test('the host and the phone both show the why line', () => {
  assert.match(read('trivia/src/host.js'), /G\.whyLine\(q\)/);
  assert.match(read('trivia/src/host.js'), /why: why \? why\.slice\(0, 240\)/, 'phones get it in t-res, kept well under the 1 KB limit');
  assert.match(read('trivia/src/phone.js'), /res-why/);
  assert.match(read('trivia/index.html'), /id="why"/);
  assert.match(read('trivia/phone.html'), /id="res-why"/);
});

// The big screen on a phone (Voidverse sweep; Bryan, 24 Nov 2026: "Yes, phone overflow"): at 390 wide the one-line top bar ran
// about 500 wide and a picture question's answers ran off the edge. Under 560 wide the top bar wraps and a media question stacks.
test('on a phone the top bar wraps and a picture or sound question stacks, so nothing runs sideways', () => {
  const css = read('trivia/trivia.css');
  const m = css.match(/@media \(max-width:560px\)\{([\s\S]*?)\n\}/);
  assert.ok(m, 'a phone rule');
  assert.match(m[1], /\.bar\{flex-wrap:wrap;height:auto;min-height:52px/);
  assert.match(m[1], /\.where:empty\{display:none\}/);
  assert.match(m[1], /\.stage\.with-media \.body\{grid-template-columns:minmax\(0,1fr\)\}/);
});

// Motion off (Voidverse sweep, Trivia item 9; Bryan, 24 Nov 2026: "Yes, reduced motion"): every animation and transition in
// trivia.css is stilled under prefers-reduced-motion, and the pages have no other moving part of their own.
test('with motion turned off the Listen pulse stops and the answer cards do not move', () => {
  const css = read('trivia/trivia.css');
  const m = css.match(/@media \(prefers-reduced-motion:reduce\)\{([\s\S]*?)\n\}/);
  assert.ok(m, 'a reduced-motion rule');
  assert.match(m[1], /\.ear span\{animation:none/);
  assert.match(m[1], /\.a\{transition:none\}/);
  assert.match(m[1], /\.a\.right\{transform:none\}/);
  const outside = css.replace(m[0], '');
  assert.deepEqual((outside.match(/animation:[^;}]+/g) || []).map((s) => s.split(' ')[0]), ['animation:ear'], 'no other animation to still');
  for (const f of ['trivia/index.html', 'trivia/phone.html']) assert.ok(!/animation:|@keyframes/.test(read(f)), f + ' has no animation of its own');
});

// The 18+ door (Bryan, 25 Nov 2026: "Yes, add the door"; decision A7): After dark sits behind the home page's own door.
test('18+ door: open only when the site blob holds a time in adult; Close the door (0) shuts it', () => {
  assert.equal(G.adultOpen(null), false);
  assert.equal(G.adultOpen(JSON.stringify({ v: 1, list: {}, adult: 1764000000000 })), true);
  assert.equal(G.adultOpen(JSON.stringify({ v: 1, list: {}, adult: 0 })), false, 'the home page closes it with 0');
  assert.equal(G.adultOpen('not json'), false);
  assert.equal(G.adultOpen(JSON.stringify({ adult: 5 })), false, 'not the site blob');
});

test('18+ door: opening it writes only adult and keeps the list, likes and history; the home page reads it the same way', () => {
  const ME = require('../scripts/lib/app-me');
  const before = { v: 1, list: { 'the-x-files': 1 }, likes: { cheers: 1 }, history: { cheers: { se: 0, e: 3, at: 5, pos: 60 } }, reports: {}, extra: 'kept' };
  const out = JSON.parse(G.adultOpened(JSON.stringify(before), 1764000000000));
  assert.deepEqual(out, Object.assign({}, before, { adult: 1764000000000 }));
  const home = ME.meClean(out);
  assert.equal(home.adult, 1764000000000, 'the home page keeps the field');
  assert.deepEqual(home.list, before.list);
  const fresh = ME.meClean(JSON.parse(G.adultOpened(null, 7)));
  assert.equal(fresh.adult, 7, 'no blob yet: a fresh one the home page accepts');
  assert.equal(G.adultOpened('{broken', 7), null, 'a blob this page cannot read is left alone');
  assert.equal(G.adultOpened(JSON.stringify({ v: 2, list: {} }), 7), null, 'another blob version is left alone');
});

test('18+ door: the page carries the home page\'s own door and asks it before an After dark game', () => {
  const html = read('trivia/index.html'), host = read('trivia/src/host.js'), css = read('trivia/trivia.css'), app = read('scripts/lib/app.js');
  assert.match(html, /<div id="gate" hidden role="dialog" aria-modal="true"/);
  assert.match(html, /src="\/assets\/brand\/ui\/doors\/latenight\.png"/);
  assert.match(html, /By entering you confirm you are 18 or older\./);
  assert.match(html, /id="gate-yes"[^>]*>I am 18 or older, enter</);
  assert.match(html, /id="gate-no"[^>]*>Not now</);
  assert.ok(app.includes('assets/brand/ui/doors/latenight.png') && app.includes('I am 18 or older, enter'), 'the same picture and button as the home door');
  const look = (s) => (s.match(/#gate\{[^}]*\}/) || [''])[0];
  assert.equal(look(css), look(app), 'the same backdrop as the home door');
  assert.match(host, /ME_KEY = 'voidtv:me'/);
  assert.match(host, /value="after-dark"\]'\)\.addEventListener\('change', \(e\) => \{ if \(e\.target\.checked\) askDoor\(\); \}\)/, 'picking After dark asks');
  assert.match(host, /if \(isAfterDark\(\)\) askDoor\(\);/, 'a link that starts on After dark asks');
  assert.match(host, /async function start\(\) \{\n    if \(isAfterDark\(\) && !askDoor\(\)\) return;/, 'no After dark game while the door is shut');
  assert.match(host, /value="family"\]'\)\.checked = true;/, 'Not now picks Family again');
  assert.match(host, /if \(\$\('gate'\)\.hidden\) \$\('start'\)\.focus\(\);/, 'the bank loading late does not pull the focus off the door');
  assert.match(host, /e\.key === 'Enter' \|\| e\.key === ' '\) \{ e\.preventDefault\(\); shutDoor\(document\.activeElement !== \$\('gate-no'\)\);/, 'Enter or OK presses the door button in focus');
});

// The Theme row (Bryan, 26 Nov 2026: "A, Theme row"): a theme deck takes only questions and dates about shows on its list.
test('theme: Black TV takes only questions and dates tagged black-tv; Every show takes all', () => {
  const qs = [
    { id: 'a', category: 'tv', round: 'cast', band: 'family', groups: ['black-tv'] },
    { id: 'b', category: 'tv', round: 'cast', band: 'family' },
    { id: 'c', category: 'tv', round: 'cast', band: 'after-dark', groups: ['black-tv'] },
  ];
  const ids = (o) => G.allowed(qs, { categories: ['tv'], ...o }).map((q) => q.id);
  assert.deepEqual(ids({ band: 'after-dark', theme: null }), ['a', 'b', 'c']);
  assert.deepEqual(ids({ band: 'after-dark', theme: 'black-tv' }), ['a', 'c']);
  assert.deepEqual(ids({ band: 'family', theme: 'black-tv' }), ['a'], 'the crowd still holds inside a theme');
  assert.equal(G.inTheme({ groups: 'black-tv' }, { theme: 'black-tv' }), false, 'only a list of themes counts');
});

test('theme: the page has the Theme row, Every show first and checked, and the count reads the theme\'s own numbers', () => {
  const fs = require('fs'), path = require('path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'trivia', 'index.html'), 'utf8');
  const row = html.slice(html.indexOf('<span class="label">Theme</span>'), html.indexOf('<span class="label">Topics</span>'));
  assert.match(row, /value="all" checked> Every show[\s\S]*value="boomer"> Boomers[\s\S]*value="millennial"> Millennials[\s\S]*value="genz"> Gen Z[\s\S]*value="black-tv"> The Culture/);
  assert.ok(html.indexOf('name="band" value="after-dark"') < html.indexOf('name="theme"'), 'it sits under Crowd');
  const host = fs.readFileSync(path.join(__dirname, '..', 'trivia', 'src', 'host.js'), 'utf8');
  assert.match(host, /theme: val\('theme'\) && val\('theme'\) !== 'all' \? val\('theme'\) : null/);
  assert.match(host, /o\.theme \? \(f\.groups && f\.groups\[o\.theme\]\) \|\| null : f/);
});

test('theme: a theme is offered only when the bank holds questions for it', () => {
  assert.equal(G.themeInIndex({ files: [{ count: 9 }] }, 'black-tv'), false, 'a bank built before the list: hidden');
  assert.equal(G.themeInIndex({ files: [{ count: 9, groups: { 'black-tv': { count: 0 } } }] }, 'black-tv'), false);
  assert.equal(G.themeInIndex({ files: [{ count: 9 }, { count: 9, groups: { 'black-tv': { count: 4 } } }] }, 'black-tv'), true);
  assert.equal(G.themeInIndex(null, 'black-tv'), false);
  const host = require('fs').readFileSync(require('path').join(__dirname, '..', 'trivia', 'src', 'host.js'), 'utf8');
  assert.match(host, /index = j; themesInBank\(\); showAvailable\(\);/, 'checked as soon as the index loads, before the count');
});

// Phones apart (Bryan, 26 Nov 2026: "Yes" to phones that play the question and a clock that starts after the clip).
test('phones apart: a phone is sent the question\'s archive.org clip, picture or sound, and nothing else as media', () => {
  const fs = require('fs'), path = require('path');
  const host = fs.readFileSync(path.join(__dirname, '..', 'trivia', 'src', 'host.js'), 'utf8');
  const qm = host.slice(host.indexOf('function questionMsg('), host.indexOf('function ask('));
  assert.ok(qm.includes('archive\\.org\\/\/.test(q.media.url)) m.media = { kind: q.media.kind, url: q.media.url, start: q.media.start, end: q.media.end };'), 'archive.org media only, four fields');
  assert.ok(qm.indexOf('m.media =') < qm.indexOf('delete m.q'), 'the media goes in before the size trim, which drops the question text first');
  const phone = fs.readFileSync(path.join(__dirname, '..', 'trivia', 'src', 'phone.js'), 'utf8');
  assert.match(phone, /showMedia\(m\.n, m\.media\);/);
  assert.ok(phone.includes("archive\\.org\\/\/.test(m.url || '')) return;"), 'the phone plays archive.org only');
  assert.match(phone, /function only\(id\) \{ if \(id !== 'ask'\) dropMedia\(\);/, 'leaving the question stops it');
  assert.match(phone, /if \(media && media\.n === n\) return;/, 'a reconnect does not restart it');
  const html = fs.readFileSync(path.join(__dirname, '..', 'trivia', 'phone.html'), 'utf8');
  assert.match(html, /<video id="pv" playsinline preload="metadata"><\/video>/, 'plays inside the page on an iPhone');
  assert.match(html, /<button type="button" class="pplay" id="pplay" title="[^"]+">&#9654; Play here<\/button>/);
});

test('phones apart: a clip\'s or a sound\'s clock starts when it has played; a picture\'s when it shows', () => {
  assert.equal(G.clipSeconds({ start: 300, end: 310 }), 10);
  assert.equal(G.clipSeconds({ start: 5, end: 5 }), 10, 'a broken length falls back to the bank\'s 10');
  assert.equal(G.clipSeconds(null), 10);
  const host = require('fs').readFileSync(require('path').join(__dirname, '..', 'trivia', 'src', 'host.js'), 'utf8');
  const sm = host.slice(host.indexOf('function showMedia('), host.indexOf('function startClock('));
  assert.match(sm, /if \(m\.kind === 'still'\) return clockNow\(\);/);
  assert.match(sm, /setTimeout\(clockNow, \(G\.clipSeconds\(m\) \+ 3\) \* 1000\)/, 'a stalled clip still gets its clock');
  assert.match(sm, /vid\.currentTime >= m\.end\) \{ vid\.pause\(\); clockNow\(\); \}/, 'the clock starts as the clip ends');
  assert.ok(sm.includes('setTimeout(() => { if (!started) clockNow(); }, 15000)'), 'a file that never starts');
  assert.ok(sm.includes("if (!clockWaiting && clip === m && phase === 'ask') { stopClock(); clockWaiting = true; }"), 'a late start gives the full clock after it');
});
