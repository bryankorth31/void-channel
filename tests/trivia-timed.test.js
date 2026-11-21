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
  const [q] = byShow['breaking-bad'];
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
  assert.deepEqual(shows, { 'breaking-bad': 1 });
  assert.ok(fs.existsSync(path.join(process.env.TRIVIA_TIMED_DIR, 'index.json')));
});

test('the strip takes the line just said, once', () => {
  const qs = [{ id: 'a', season: 1, number: 1, at: 100 }, { id: 'b', season: 1, number: 1, at: 120 }, { id: 'c', season: 1, number: 2, at: 120 }];
  assert.equal(live.pickTimed(qs, { season: 1, number: 1, at: 125 }).id, 'b');
  assert.equal(live.pickTimed(qs, { season: 1, number: 1, at: 99 }), null);            // not said yet
  assert.equal(live.pickTimed(qs, { season: 1, number: 1, at: 160 }), null);           // too long ago
  assert.equal(live.pickTimed(qs, { season: 1, number: 1, at: 125, asked: new Set(['b']) }).id, 'a');
});

test('the marking page reads an episode transcript, and none for a film or a bad key', () => {
  assert.equal(mark.transcriptOf('breaking-bad', 1, 1).lines.length, 31);
  assert.deepEqual(mark.transcriptOf('breaking-bad', 9, 9), { lines: [] });
  assert.deepEqual(mark.transcriptOf('film-11', 1, 1), { lines: [] });
  assert.deepEqual(mark.transcriptOf('../x', 1, 1), { lines: [] });
});

test.after(() => fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));
