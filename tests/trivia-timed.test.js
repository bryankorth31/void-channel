// Trivia questions timed to a moment (plan C19, the clip chat's part of the Live TV strip). Run: node --test tests/trivia-timed.test.js
// Proves: a line splits into what is shown and what is finished; wrong endings come from other lines and never match the
// right one; a question is built only from an approved Line moment and checks back against it; the build reads moments,
// transcripts and the pool and skips what it must; the strip's pick takes the line just said, once; the marking page
// reads an episode's transcript. Uses a made-up catalog and temporary folders; no network.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'trivia-timed-'));
Object.assign(process.env, {
  TRIVIA_DB: path.join(TMP, 'voidtv.db'), TRIVIA_MOMENTS_DIR: path.join(TMP, 'moments'), TRIVIA_TRANSCRIPTS_DIR: path.join(TMP, 'transcripts'),
  TRIVIA_POOL: path.join(TMP, 'pool.json'), TRIVIA_TIMED_DIR: path.join(TMP, 'timed'),
});
const TQ = require('../scripts/trivia/timed');
const M = require('../scripts/trivia/moments');
const live = require('../trivia/src/timed');
const mark = require('../scripts/trivia/mark');

const URL1 = 'https://archive.org/download/bb/e1.mp4';
{
  const db = new DatabaseSync(process.env.TRIVIA_DB);
  db.exec(`create table shows (slug text primary key, name text, tmdb_id int, premiered text);
    create table episodes (show_slug text, season int, number int, name text, state text, item text, url text, seconds int, format text, playable int);
    create table movies (tmdb_id int primary key, title text, year int, state text, item text, url text, seconds int, format text, playable int);
    insert into shows values ('breaking-bad', 'Breaking Bad', 1396, '2008-01-20'), ('nopool', 'No Pool', 5, '2000-01-01');
    insert into episodes values ('breaking-bad', 1, 1, 'Pilot', 'LIVE', 'bb', '${URL1}', 3485, 'h.264', 1),
      ('nopool', 1, 1, 'One', 'LIVE', 'np', 'https://archive.org/download/np/1.mp4', 1300, 'h.264', 1);`);
  db.close();
  fs.writeFileSync(process.env.TRIVIA_POOL, JSON.stringify({ shows: [{ slug: 'breaking-bad', name: 'Breaking Bad', band: 'after-dark' }] }));
  const lines = Array.from({ length: 30 }, (_, i) => ({ start: i * 20, end: i * 20 + 3, text: ['We are going to need a much bigger boat today', 'I am the one who knocks on the door', 'Say my name if you really know it', 'You are goddamn right about that one'][i % 4] + ' ' + i }));
  lines.push({ start: 482.2, end: 486, text: "It's solution, dissolution, just over and over and over." });
  lines.sort((a, b) => a.start - b.start);
  fs.mkdirSync(path.join(process.env.TRIVIA_TRANSCRIPTS_DIR, 'breaking-bad'), { recursive: true });
  fs.writeFileSync(path.join(process.env.TRIVIA_TRANSCRIPTS_DIR, 'breaking-bad', 's1e1.json'), JSON.stringify({ url: URL1, source: { kind: 'whisper', model: 'large-v3' }, made: '2026-11-20T21:00:00Z', lines }));
  const at = '2026-11-20T22:00:00Z';
  const m = (o) => ({ ...o, id: M.momentId(o), item: 'bb', url: URL1, by: 'Bryan', at, approved: { by: 'Bryan', at } });
  M.save('breaking-bad', [
    m({ kind: 'line', show: 'breaking-bad', season: 1, number: 1, start: 481, end: 491, line: "It's solution, dissolution, just over and over and over." }),
    m({ kind: 'line', show: 'breaking-bad', season: 1, number: 1, start: 600, end: 610, line: 'Too short here' }),
    m({ kind: 'scene', show: 'breaking-bad', season: 1, number: 1, start: 700, end: 710 }),
    m({ kind: 'find', show: 'breaking-bad', season: 1, number: 1, start: 900, end: 912, find: 'the pink teddy bear' }),
    m({ kind: 'whodunit', show: 'breaking-bad', season: 1, number: 1, start: 1200, lock: 2400, end: 3000, q: 'Who made the blue meth?',
      choices: ['Walter White', 'Jesse Pinkman', 'Hank Schrader', 'Skyler White'], answer: 0 }),
    m({ kind: 'clue', show: 'breaking-bad', season: 1, number: 1, start: 1500, end: 1510, clue: 'the gas mask in the RV' }),
    m({ kind: 'clue', show: 'breaking-bad', season: 1, number: 1, start: 2000, end: 2012, clue: 'chalk dust on his sleeve' }),
    m({ kind: 'clue', show: 'breaking-bad', season: 1, number: 1, start: 2600, end: 2610, clue: 'too late to count' }),
  ]);
  M.save('nopool', [{ ...m({ kind: 'line', show: 'nopool', season: 1, number: 1, start: 10, end: 20, line: 'one two three four five six seven' }), item: 'np', url: 'https://archive.org/download/np/1.mp4' }]);
}

test('a line splits into what is shown and what is finished', () => {
  assert.deepEqual(TQ.split("It's solution, dissolution, just over and over and over."), { shown: "It's solution, dissolution, just", rest: 'over and over and over.', n: 5 });
  assert.equal(TQ.split('one two three — four five six seven').shown, 'one two three -'); // a long dash never reaches the screen
  assert.equal(TQ.split('Too short here'), null);
  assert.equal(TQ.split('one two three four five six').rest, 'four five six');
});

test('wrong endings come from other lines and never match the right one', () => {
  const others = ['we went over and over and over.', 'a b c d e f', 'g h i j k l', 'm n o p q r', 'one more line to end here', 'year 2014 was a good year'];
  const f = TQ.foils('over and over and over.', 5, others, 7);
  assert.equal(f.length, 3);
  assert.ok(!f.some((x) => /over and over/.test(x)));
  assert.equal(TQ.foils('x y z', 3, ['a b c d'], 1), null); // fewer than three to choose from
});

test('the build: approved lines only, in the pool only, each checked against its moment', () => {
  const { byShow, skipped } = TQ.build();
  assert.deepEqual(Object.keys(byShow), ['breaking-bad']);
  const q = byShow['breaking-bad'].find((x) => x.round === 'finish-line');
  assert.equal(q.round, 'finish-line');
  assert.equal(q.band, 'after-dark');
  assert.equal(q.at, 491);
  assert.equal(q.q, 'Finish the line: "It\'s solution, dissolution, just ..."');
  assert.equal(q.choices[q.answer], 'over and over and over.');
  assert.match(q.source.fact, /at 8:01: .*checked by Bryan/);
  assert.match(skipped.join('\n'), /too short/);
  assert.match(skipped.join('\n'), /nopool: not in the trivia pool/);
  const moment = M.load('breaking-bad').find((x) => x.id === q.about.moment);
  assert.deepEqual(TQ.problems(q, moment), []);
  assert.match(TQ.problems({ ...q, answer: (q.answer + 1) % 4 }, moment).join(), /not the rest of the line/);
  assert.match(TQ.problems(q, null).join(), /moment is gone/);
  const shows = TQ.write(byShow);
  const spot = byShow['breaking-bad'].find((x) => x.round === 'spot');
  assert.deepEqual([spot.q, spot.at, spot.open, spot.close], ['Spot it: the pink teddy bear', 895, 900, 912]);
  const who = byShow['breaking-bad'].find((x) => x.round === 'whodunit');
  assert.deepEqual([who.at, who.lock, who.reveal, who.choices[who.answer]], [1200, 2400, 3000, 'Walter White']);
  assert.ok(who.source.fact.endsWith('revealed at 50:00 (answer written by Bryan after watching)'), who.source.fact);
  for (const x of [spot, who]) assert.deepEqual(TQ.problems(x, M.load('breaking-bad').find((y) => y.id === x.about.moment)), []);
  assert.deepEqual(who.clues, [1500, 2000]);   // the clue after guesses close is not one players could use
  const clue = byShow['breaking-bad'].find((x) => x.round === 'clue' && x.at === 1500);
  assert.deepEqual([clue.q, clue.until], ['Clue: the gas mask in the RV', 1510]);
  assert.deepEqual(TQ.problems(clue, M.load('breaking-bad').find((y) => y.id === clue.about.moment)), []);
  assert.deepEqual(shows, { 'breaking-bad': 6 });
  assert.ok(fs.existsSync(path.join(process.env.TRIVIA_TIMED_DIR, 'index.json')));
  // The same questions again write nothing: the build time stays, so a night with nothing new leaves no changed file (24 Nov 2026).
  const idx = path.join(process.env.TRIVIA_TIMED_DIR, 'index.json');
  const before = fs.readFileSync(idx, 'utf8');
  const stamped = JSON.parse(before); stamped.builtAt = '2026-01-01T00:00:00.000Z'; fs.writeFileSync(idx, JSON.stringify(stamped) + '\n');
  assert.deepEqual(TQ.write(byShow), shows);
  assert.equal(JSON.parse(fs.readFileSync(idx, 'utf8')).builtAt, '2026-01-01T00:00:00.000Z');
  const fewer = { 'breaking-bad': byShow['breaking-bad'].slice(1) };
  TQ.write(fewer);
  assert.notEqual(JSON.parse(fs.readFileSync(idx, 'utf8')).builtAt, '2026-01-01T00:00:00.000Z', 'a change writes, with a new build time');
  TQ.write(byShow);
});

test('the strip takes the line just said, once', () => {
  const qs = [{ id: 'a', season: 1, number: 1, at: 100 }, { id: 'b', season: 1, number: 1, at: 120 }, { id: 'c', season: 1, number: 2, at: 120 }];
  assert.equal(live.pickTimed(qs, { season: 1, number: 1, at: 125 }).id, 'b');
  assert.equal(live.pickTimed(qs, { season: 1, number: 1, at: 99 }), null);            // not said yet
  assert.equal(live.pickTimed(qs, { season: 1, number: 1, at: 160 }), null);           // too long ago
  assert.equal(live.pickTimed(qs, { season: 1, number: 1, at: 125, asked: new Set(['b']) }).id, 'a');
});

test('each kind is offered only in its own window', () => {
  const spot = { id: 's', round: 'spot', season: 1, number: 1, at: 895, open: 900, close: 912 };
  const who = { id: 'w', round: 'whodunit', season: 1, number: 1, at: 1200, lock: 2400, reveal: 3000 };
  const P = ['finish-line', 'spot', 'whodunit'];
  assert.equal(live.pickTimed([spot, who], { season: 1, number: 1, at: 897 }), null);   // the Live TV strip asks for lines only
  assert.equal(live.pickTimed([spot], { season: 1, number: 1, at: 897, rounds: P }).id, 's');
  assert.equal(live.pickTimed([spot], { season: 1, number: 1, at: 901, rounds: P }), null);   // already showing: too late to ask
  assert.equal(live.pickTimed([who], { season: 1, number: 1, at: 1800, rounds: P }).id, 'w'); // a late joiner still gets to guess
  assert.equal(live.pickTimed([who], { season: 1, number: 1, at: 2500, rounds: P }), null);   // guesses closed
});

test('scoring: a spot tap while it shows, a whodunit guess locked in early', () => {
  const spot = { open: 900, close: 912 };
  assert.equal(live.spotPoints(899, spot), 0);      // before it shows
  assert.equal(live.spotPoints(900, spot), 1000);
  assert.equal(live.spotPoints(906, spot), 750);
  assert.equal(live.spotPoints(913, spot), 0);
  const who = { at: 1200, lock: 2400, answer: 0 };
  assert.equal(live.guessPoints(1200, 0, who), 1000);
  assert.equal(live.guessPoints(2400, 0, who), 500);
  assert.equal(live.guessPoints(1300, 2, who), 0);  // wrong suspect
  assert.equal(live.guessPoints(2500, 0, who), 0);  // after guesses closed
});

test('clues pop up only when asked for, while they show', () => {
  const clue = { id: 'c', round: 'clue', season: 1, number: 1, at: 1500, until: 1510 };
  assert.equal(live.pickTimed([clue], { season: 1, number: 1, at: 1505 }), null);   // the Live TV strip never gets one
  assert.equal(live.pickTimed([clue], { season: 1, number: 1, at: 1505, rounds: ['clue'] }).id, 'c');
  assert.equal(live.pickTimed([clue], { season: 1, number: 1, at: 1511, rounds: ['clue'] }), null);
});

test('whodunit results: right answers first, earliest first, each said against the clues', () => {
  const q = { at: 1200, lock: 2400, answer: 0, choices: ['Walter', 'Jesse', 'Hank', 'Skyler'], clues: [1500, 2000] };
  const r = live.whodunitResults(q, [
    { id: 1, name: 'Mom', pick: 0, lockedAt: 2100 },
    { id: 2, name: 'Bryan', pick: 0, lockedAt: 1300 },
    { id: 3, name: 'Dad', pick: 2, lockedAt: 1700 },
    { id: 4, name: 'Son', pick: 0, lockedAt: 1800 },
    { id: 5, name: 'Aunt', pick: null, lockedAt: null },
  ]);
  assert.deepEqual(r.rows.map((x) => x.name + ' ' + x.at + ' ' + x.when + ' ' + x.points),
    ['Bryan 21:40 before any clue 960', 'Son 30:00 before the second clue 750', 'Mom 35:00 after all 2 clues 630', 'Aunt  no guess 0', 'Dad 28:20 before the second clue 0']);
  assert.deepEqual([r.answer, r.right, r.of, r.first.name], ['Walter', 3, 5, 'Bryan']);
  const one = live.whodunitResults({ ...q, clues: [1500] }, [{ id: 1, name: 'A', pick: 0, lockedAt: 1600 }]);
  assert.equal(one.rows[0].when, 'after the clue');
  assert.equal(live.whodunitResults({ ...q, clues: [] }, [{ id: 1, name: 'A', pick: 0, lockedAt: 1600 }]).rows[0].when, 'with no clues in this episode');
});

test('the moment check knows the new kinds', () => {
  assert.deepEqual(M.problems({ show: 'x', season: 1, number: 1, url: 'u', by: 'Bryan', at: '2026-11-20T22:00:00Z', kind: 'clue', start: 1500, end: 1510, clue: 'the boots' }, { url: 'u', seconds: 3485 }), []);
  assert.match(M.problems({ show: 'x', season: 1, number: 1, url: 'u', by: 'Bryan', at: '2026-11-20T22:00:00Z', kind: 'clue', start: 1500, end: 1510 }, { url: 'u', seconds: 3485 }).join(), /what the clue is/);
  const base = { show: 'x', season: 1, number: 1, url: 'u', by: 'Bryan', at: '2026-11-20T22:00:00Z' };
  const file = { url: 'u', seconds: 3485 };
  assert.deepEqual(M.problems({ ...base, kind: 'find', start: 900, end: 912, find: 'the red phone' }, file), []);
  assert.match(M.problems({ ...base, kind: 'find', start: 900, end: 912 }, file).join(), /what to find/);
  const w = { ...base, kind: 'whodunit', start: 1200, lock: 2400, end: 3000, q: 'Who did it?', choices: ['A1', 'B1', 'C1', 'D1'], answer: 2 };
  assert.deepEqual(M.problems(w, file), []);
  assert.match(M.problems({ ...w, lock: 3100 }, file).join(), /in that order/);
  assert.match(M.problems({ ...w, lock: 1230 }, file).join(), /at least a minute/);
  assert.match(M.problems({ ...w, choices: ['A1', 'A1', 'C1', 'D1'] }, file).join(), /four different suspects/);
  assert.match(M.problems({ ...w, answer: null }, file).join(), /right answer/);
});

test('the marking page reads an episode transcript, and none for a film or a bad key', () => {
  assert.equal(mark.transcriptOf('breaking-bad', 1, 1).lines.length, 31);
  assert.deepEqual(mark.transcriptOf('breaking-bad', 9, 9), { lines: [] });
  assert.deepEqual(mark.transcriptOf('film-11', 1, 1), { lines: [] });
  assert.deepEqual(mark.transcriptOf('../x', 1, 1), { lines: [] });
});

// As in trivia-moments: retry, then leave a still-held temp folder to Windows rather than fail a parallel run.
test.after(() => {
  try { fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); }
  catch (e) { if (e.code !== 'EPERM' && e.code !== 'EBUSY') throw e; }
});
