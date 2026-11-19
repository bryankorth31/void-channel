// Void University engine and build (audit, 16 Nov 2026). Run: node tests/uni.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const uni = require('../scripts/lib/uni');

const SITE = path.join(uni.UNI, 'site');
const build = (...a) => execFileSync(process.execPath, [path.join(uni.UNI, 'build.js'), ...a], { stdio: 'pipe' });
const list = () => JSON.parse(fs.readFileSync(path.join(uni.UNI, 'list.json'), 'utf8'));

test('a brief only takes a plain course slug, never a path', () => {
  for (const bad of ['../list', '..\\list', 'a/b', 'A B', '', 'x.json']) assert.throws(() => uni.brief(bad, 1), /Not a course slug/);
  assert.match(uni.brief('human-nature', 2), /UNIT 2/);
});

test('the overview lists every area in list.json', () => {
  const o = uni.overview();
  assert.deepStrictEqual(o.areas.map((a) => a.area), list().types);
});

test('the public copy carries only live courses, and no lab unless a lab is live', () => {
  fs.mkdirSync(SITE, { recursive: true });
  fs.writeFileSync(path.join(SITE, 'stale-page.html'), 'left from an older build');
  build('--site');
  assert.ok(!fs.existsSync(path.join(SITE, 'stale-page.html')), 'a page from an earlier build was left in site/');
  const live = new Set(list().courses.filter((c) => c.live).map((c) => c.slug));
  const pages = fs.readdirSync(SITE).filter((f) => f.endsWith('.html')).map((f) => f.replace(/\.html$/, ''));
  for (const p of pages) assert.ok(live.has(p) || ['index', 'credits'].includes(p), p + '.html is in the public copy but not live');
  const anyLiveLab = fs.readdirSync(path.join(uni.UNI, 'courses')).some((f) => {
    const c = JSON.parse(fs.readFileSync(path.join(uni.UNI, 'courses', f), 'utf8'));
    return live.has(c.slug) && c.units.some((u) => u.lab && u.lab.live);
  });
  if (!anyLiveLab) {
    assert.ok(!fs.existsSync(path.join(SITE, 'lab.js')), 'lab.js shipped with no live lab');
    for (const p of pages) assert.doesNotMatch(fs.readFileSync(path.join(SITE, p + '.html'), 'utf8'), /lab\.js|planck/, p + ' asks for a lab script that is not shipped');
  }
});

test('lecture counts look like lectures, not every file in an item (run node scripts/uni.js media after a gather)', () => {
  for (const f of fs.readdirSync(uni.SRC).filter((f) => f.endsWith('.json') && f !== 'check.json')) for (const s of JSON.parse(fs.readFileSync(path.join(uni.SRC, f), 'utf8')).sources || []) {
    assert.ok(!(s.video && s.audio), f + ' ' + s.id + ' has both video and audio');
    for (const m of [s.video, s.audio]) if (m) assert.ok(Number.isInteger(m.files) && m.files > 0 && m.files <= 120, f + ' ' + s.id + ' counts ' + m.files + ' lectures');
  }
});

test('no em or en dash in any course, source list or built page', () => {
  const files = [...fs.readdirSync(path.join(uni.UNI, 'courses')).map((f) => path.join(uni.UNI, 'courses', f)),
    ...fs.readdirSync(uni.SRC).filter((f) => f.endsWith('.json') && f !== 'check.json').map((f) => path.join(uni.SRC, f)),
    ...fs.readdirSync(SITE).filter((f) => f.endsWith('.html')).map((f) => path.join(SITE, f))];
  for (const f of files) assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /[–—]/, path.basename(f) + ' has a dash');
});

// The local draft's gate (19 Nov 2026): a local model writes, the gate keeps only what the lecture really says.
test('the draft gate keeps a quiz quote only when it is said word for word, and takes the time from the lecture', () => {
  const said = 'so today we ask why a person keeps a promise when nobody is watching them at all and the answer that plato gives is that a good life is its own reward for the one who lives it and next we turn to the test that batson ran with a coin and a mirror in his lab many years later';
  const tr = { words: said.split(' ').map((w, i) => ({ w, raw: w, t: i * 2 })) };
  const q = (quote, more = {}) => ({ q: 'What does Plato answer?', choices: ['A good life is its own reward', 'Fear of the law', 'Money', 'Luck'], a: 0, why: 'He says so in the lecture.', quote, ...more });
  const g = uni.gateDraft({
    needIt: 'When no one checks, you find out what you value.', why: 'Plato asks why we keep promises unseen.', outcome: 'Tell apart looking fair and being fair.',
    chapters: [{ title: 'The question', words: 'so today we ask why a person keeps' }, { title: 'Made up', words: 'these words were never spoken in the room' }],
    quiz: [
      q('The answer that Plato gives is that a good life is its own reward'),
      q('Plato says that being good always pays off in money and fame'),
      q('next we turn to the test that batson ran with a coin', { choices: ['A coin', 'A coin', 'A die', 'A card'] }),
    ],
    crystal: { partials: ['a', 'b', 'c', 'd', 'e'], key: 'k', decoys: [{ text: 'x', why: 'y' }, { text: 'x2', why: 'y2' }], aha: 'z' },
  }, tr);
  assert.strictEqual(g.unit.quiz.length, 1, 'only the word for word quote with four different choices is kept');
  assert.strictEqual(g.unit.quiz[0].t, 36, 'the time is where the quote starts in the lecture (word 18, 2 s a word)');
  assert.strictEqual(g.unit.quiz[0].choices[g.unit.quiz[0].a], 'A good life is its own reward', 'the right answer is still the right answer after it moves');
  assert.strictEqual(g.unit.chapters.length, 1, 'a chapter whose opening words are not said is dropped');
  assert.ok(g.unit.crystal, 'a whole crystal is kept');
  assert.strictEqual(g.ok, false, 'one question and one chapter is not a whole unit');
  assert.ok(g.missing.some((m) => /quiz/.test(m)) && g.notes.length >= 3, 'what is missing and what was dropped are said plainly');
});

test('a draft is not kept in a course while it still needs something', () => {
  assert.throws(() => uni.keepDraft('human-nature', 999), /No draft/);
  assert.throws(() => uni.keepDraft('../x', 1), /Not a course slug/);
});

// The scene from words (19 Nov 2026): the local model gives words, the code gives places that never touch.
test('a scene is laid out from words, and a word too long for its place is refused, not squeezed in', () => {
  const words = { analogy: 'Two kids and the last cookie', left: 'One kid', right: 'The other kid', thing: 'cookie', act: 'grab', leftEnd: 'eats it all', rightEnd: 'gets nothing', line: 'I only took what was mine.',
    says: ['One cookie is left.', 'One kid grabs it.', 'The other kid gets nothing.', 'The grabber still feels fair.'],
    idea: { left: 'Seeming fair', right: 'Being fair', thing: 'the prize', act: 'cheat', line: 'I acted morally.', say: 'People want to seem fair more than to be fair.' } };
  const ok = uni.sceneFrom(words);
  assert.ok(ok.scene && ok.scene.beats.length === 5 && ok.scene.actors.length === 5);
  const box = (a) => (a.type === 'text' ? { x: 0, y: a.y - 20, w: 800, h: 40 } : { x: a.x, y: a.y, w: a.w, h: a.h || a.w });
  const A = ok.scene.actors.map(box);
  for (let i = 0; i < A.length; i++) for (let j = i + 1; j < A.length; j++) assert.ok(A[i].x + A[i].w <= A[j].x || A[j].x + A[j].w <= A[i].x || A[i].y + A[i].h <= A[j].y || A[j].y + A[j].h <= A[i].y, 'actors ' + i + ' and ' + j + ' do not touch');
  for (const a of A) assert.ok(a.x >= 0 && a.y >= 0 && a.x + a.w <= 800 && a.y + a.h <= 360, 'every actor is inside the 800 by 360 stage');
  const long = uni.sceneFrom({ ...words, thing: 'the very last chocolate cookie' });
  assert.strictEqual(long.scene, null);
  assert.ok(long.notes.some((n) => /thing is over 11 letters/.test(n)));
  assert.strictEqual(uni.sceneFrom({ ...words, says: ['only one'] }).scene, null);
});

// The old-knowledge shelf (19 Nov 2026).
test('shelf: chapters come from capital headings, without the running title or the contents page', () => {
  const para = 'Dig the ground when it is dry enough to crumble in the hand and not before that day comes. ';
  const text = ['MY OLD BOOK', 'CONTENTS', 'FIRST THINGS . . 1', 'SECOND THINGS . . 9', '', 'FIRST THINGS', para.repeat(12), 'MY OLD BOOK', '12', para.repeat(10), 'SECOND THINGS', para.repeat(15), 'SECOND THINGS', para.repeat(6)].join('\n');
  const ch = uni.shelfChapters(text, 'My old book');
  assert.deepStrictEqual(ch.map((c) => c.title), ['First things', 'Second things']);
  assert.ok(ch[0].passages.length >= 2 && ch[0].passages.every((p) => p.old.split(' ').length >= 40), 'passages are whole sentences in readable pieces');
  assert.ok(!ch[0].passages.some((p) => /MY OLD BOOK|\b12\b/.test(p.old)), 'running heads and page numbers are not in the text');
});
test('shelf: a rewrite that is empty, far shorter or far longer than the passage is left out', () => {
  const old = 'word '.repeat(100).trim();
  assert.strictEqual(uni.gatePlain(old, '').plain, null);
  assert.strictEqual(uni.gatePlain(old, 'too short').plain, null);
  assert.strictEqual(uni.gatePlain(old, 'w '.repeat(200)).plain, null);
  assert.ok(uni.gatePlain(old, 'plain '.repeat(80)).plain);
});
test('shelf: the public copy carries a shelf book only when it is marked live', () => {
  build('--site');
  const liveIds = new Set((list().shelf || []).filter((x) => x.live).map((x) => x.id));
  for (const f of fs.readdirSync(SITE).filter((x) => x.startsWith('shelf-'))) assert.ok(liveIds.has(f.slice(6, -5)), f + ' is public but not marked live');
});
