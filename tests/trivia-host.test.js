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
