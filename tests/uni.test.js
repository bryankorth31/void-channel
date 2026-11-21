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
  for (const p of pages) assert.ok(live.has(p) || ['index', 'credits', '404'].includes(p), p + '.html is in the public copy but not live');
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
    needIt: 'When no one checks, you find out what you value.', why: 'Plato asks why we keep promises unseen.', outcome: 'Tell apart looking fair and being fair.', reachesYou: 'You meet this at the self checkout and on the tax form.', do: 'Notice one time this week when nobody is checking you.',
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

test('the draft gate does not fall over when the model hands back the wrong kind of thing', () => {
  const tr = { words: [{ w: 'a', raw: 'a', t: 0 }] };
  for (const raw of [null, [], 'text', { quiz: 'none', chapters: {}, crystal: 'x', scene: 'y' }, { quiz: [{ choices: 'a b' }], crystal: { partials: 5, decoys: {} }, scene: { says: 'one', idea: 3 } }]) {
    const g = uni.gateDraft(raw, tr);
    assert.strictEqual(g.ok, false);
    assert.ok(g.missing.length >= 4);
  }
});

// Classes from old books (19 Nov 2026, Bryan: "We can find and create \"courses\" or \"classes\"").
test('a unit drawn from a book chapter needs no lecture chapters, and its quiz still quotes the book word for word', () => {
  const said = 'dig the ground only when a handful of it crumbles apart in your hand and never while it is wet and sticky because wet ground packs hard and the seed will rot before it can sprout in the cold';
  const tr = { words: said.split(' ').map((w, i) => ({ w, raw: w, t: i })) };
  const g = uni.gateDraft({ needIt: 'x'.repeat(30), why: 'y'.repeat(30), outcome: 'z'.repeat(30), reachesYou: 'r'.repeat(30), do: 'd'.repeat(30), chapters: [],
    quiz: [{ q: 'When do you dig?', choices: ['When it crumbles', 'When wet', 'At night', 'Never'], a: 0, why: 'The book says so.', quote: 'dig the ground only when a handful of it crumbles apart in your hand' },
      { q: 'Why not wet?', choices: ['It packs hard', 'It smells', 'It is cold', 'It is heavy'], a: 0, why: 'The book says so.', quote: 'wet ground packs hard and the seed will rot before it can grow' }] }, tr, { reading: true });
  assert.strictEqual(g.unit.chapters, undefined);
  assert.ok(!g.missing.some((m) => /chapters/.test(m)));
  assert.strictEqual(g.unit.quiz.length, 1, 'the quote that changes the last word is dropped');
});
test('every class reads chapters that are really on the shelf, in plain English', () => {
  const fsx = require('fs');
  for (const f of fsx.readdirSync(path.join(uni.UNI, 'courses'))) {
    const c = JSON.parse(fsx.readFileSync(path.join(uni.UNI, 'courses', f), 'utf8'));
    if (c.size !== 'class') continue;
    for (const u of [...c.units, ...(c.todo || [])]) {
      assert.ok(u.reading, c.slug + ' unit ' + u.n + ' names its chapter');
      const b = JSON.parse(fsx.readFileSync(path.join(uni.UNI, 'shelf', u.reading.shelf + '.json'), 'utf8'));
      const ch = b.chapters.find((x) => x.n === u.reading.chapter);
      assert.ok(ch && ch.passages.some((x) => x.plain), c.slug + ' unit ' + u.n + ' reads a chapter that is in plain English');
    }
  }
});

test('the steps scene: three or four cards in a row that never touch, and the wrong count is refused', () => {
  for (const n of [3, 4]) {
    const steps = ['Measure', 'Mark', 'Cut', 'Fit'].slice(0, n);
    const r = uni.sceneFrom({ layout: 'steps', analogy: 'Wrapping a gift', steps, subs: steps.map(() => 'a short note'), line: 'Measure twice, cut once.', says: steps.map((x) => x + ' comes next.'), idea: { steps: steps.map((x) => x + '!'), line: 'Order matters.', say: 'Each step makes the next one possible.' } });
    assert.ok(r.scene, JSON.stringify(r.notes));
    const cards = r.scene.actors.filter((a) => a.type === 'card');
    assert.strictEqual(cards.length, n);
    for (let i = 1; i < cards.length; i++) assert.ok(cards[i - 1].x + cards[i - 1].w < cards[i].x, 'cards do not touch');
    assert.ok(cards[0].x >= 0 && cards[n - 1].x + cards[n - 1].w <= 800);
    assert.strictEqual(r.scene.beats.length, n + 1);
  }
  assert.strictEqual(uni.sceneFrom({ layout: 'steps', analogy: 'x', steps: ['One', 'Two'], subs: ['a', 'b'], says: ['a', 'b'], line: 'l', idea: { steps: ['a', 'b'], line: 'l', say: 's' } }).scene, null);
});

test('the public copy: a way back on every page, no empty area tiles, a not-found page, an offline Try again, no working notes', () => {
  build('--site');
  const read = (f) => fs.readFileSync(path.join(SITE, f), 'utf8');
  const pages = fs.readdirSync(SITE).filter((f) => f.endsWith('.html'));
  for (const p of pages) {
    const h = read(p);
    assert.match(h, /header\.top\{[^}]*position:sticky;top:0/, p + ': the header does not stay in reach');
    assert.match(h, /<header class="top">[\s\S]*?href="index\.html"/, p + ': no way to the front page in the header');
    assert.doesNotMatch(h, /Bryan's|\/\/ .*Bryan/, p + ': a working note is in the public page');
  }
  const home = read('index.html');
  assert.doesNotMatch(home, /<small>coming<\/small>|on the way/, 'the front page shows an area with nothing in it');
  for (const m of home.matchAll(/class="area has" href="#([a-z0-9-]+)"/g)) assert.ok(home.includes('id="' + m[1] + '"'), 'the ' + m[1] + ' tile opens nothing');
  assert.ok(fs.existsSync(path.join(SITE, '404.html')), 'no 404.html, but wrangler.jsonc serves one for a wrong address');
  assert.match(read('404.html'), /<base href="\/">/, 'the not-found page must link from the site root');
  assert.match(read('sw.js'), /Try again/, 'the offline note has no way to try again');
  for (const f of fs.readdirSync(SITE).filter((x) => x.endsWith('.js') && !/planck|sw\.js/.test(x))) assert.doesNotMatch(read(f), /^\s*\/\//m, f + ' ships with working notes in it');
});

test('live: one line puts a course on or off the public copy', () => {
  const before = list().courses.find((c) => c.slug === 'critical-thinking').live;
  assert.equal(uni.setLive('critical-thinking', before).live, before);
  assert.throws(() => uni.setLive('no-such-course', true));
});

test('the public pages carry no machine-made tells: no middle-dot strings, no capitals labels, and less motion when asked', () => {
  build('--site');
  for (const p of fs.readdirSync(SITE).filter((f) => f.endsWith('.html'))) {
    const h = fs.readFileSync(path.join(SITE, p), 'utf8');
    assert.doesNotMatch(h, /\u00b7/, p + ': a middle dot joins two things; say it in words');
    assert.equal((h.match(/text-transform:uppercase/g) || []).length, 1, p + ': only the crest wordmark is in capitals');
    assert.match(h, /prefers-reduced-motion:reduce/, p + ': no reduced-motion rule');
    assert.doesNotMatch(h, /class="kick"/, p + ': a label line sits over the headline');
    assert.equal((h.match(/fonts\.googleapis\.com\/css2/g) || []).length, 1, p + ': the public copy loads only the faces it uses');
  }
});

test('scale: every thing on a 3D stage has a real number and a source, and the page says the amounts in words', () => {
  const course = JSON.parse(fs.readFileSync(path.join(uni.UNI, 'courses', 'critical-thinking.json'), 'utf8'));
  const sc = uni.scalesOf(course.units.find((u) => u.scale))[0];
  assert.deepEqual(uni.scaleProblems(sc), []);
  const copy = () => JSON.parse(JSON.stringify(sc));
  let x = copy(); delete x.things[0].values.now;
  assert.match(uni.scaleProblems(x).join(' | '), /no measured number/);
  x = copy(); x.things[1].src = 'nobody';
  assert.match(uni.scaleProblems(x).join(' | '), /no source/);
  x = copy(); x.sources.baron.url = 'http://example.org/paper';
  assert.match(uni.scaleProblems(x).join(' | '), /https link/);
  x = copy(); x.kind = 'weight';
  assert.match(uni.scaleProblems(x).join(' | '), /kind must be/);
  x = copy(); x.guess.answer = 9;
  assert.match(uni.scaleProblems(x).join(' | '), /right answer/);
  // the numbers on the stage are the paper's own (Bar-On, Phillips and Milo 2018, Table 1), so a slip here is caught
  const now = Object.fromEntries(sc.things.map((t) => [t.name, t.values.now]));
  assert.deepEqual([now.Plants, now.Bacteria, now.Fungi, now.Livestock, now.People, now['Wild mammals'], now['Wild birds']], [450, 70, 12, 0.1, 0.06, 0.007, 0.002]);
  build();
  const prev = path.join(uni.UNI, 'site-preview');
  const page = fs.readFileSync(path.join(prev, 'critical-thinking.html'), 'utf8');
  assert.match(page, /450 billion tonnes of carbon/);
  assert.match(page, /60 million tonnes of carbon/);
  assert.match(page, /7 million tonnes of carbon/);
  assert.match(page, /no measured number for then/);
  assert.match(page, /europepmc\.org\/article\/PMC\/PMC6016768/, 'the source link is not on the card');
  for (const f of ['scale.js', 'three.module.min.js', 'three-LICENSE.txt']) assert.ok(fs.existsSync(path.join(prev, f)), f + ' is not beside the page that needs it');
  // the public copy carries a scale only once it is marked live, the same rule as a lab
  build('--site');
  const live = course.units.some((u) => uni.scalesOf(u).some((x) => x.live)) && list().courses.find((c) => c.slug === 'critical-thinking').live;
  assert.equal(fs.existsSync(path.join(SITE, 'scale.js')), !!live);
  if (!live) assert.doesNotMatch(fs.readFileSync(path.join(SITE, 'critical-thinking.html'), 'utf8'), /src="scale\.js"|data-scale=/);
});

test('scale, sizes: widths are in metres from their sources, said in the unit a person would use', () => {
  const course = JSON.parse(fs.readFileSync(path.join(uni.UNI, 'courses', 'critical-thinking.json'), 'utf8'));
  const sc = course.units.flatMap((u) => uni.scalesOf(u)).find((x) => x.kind === 'size');
  assert.deepEqual(uni.scaleProblems(sc), []);
  const m = Object.fromEntries(sc.things.map((t) => [t.name, t.values.now]));
  // NASA fact sheets: volumetric mean radius 1737.4, 6371.0, 69911 and 695700 km
  assert.deepEqual([m['The Moon'], m.Earth, m.Jupiter, m['The Sun']], [3474800, 12742000, 139822000, 1391400000]);
  assert.equal(Math.round(m['The Sun'] / m.Earth), 109, 'the guess says about 109 Earths across the Sun');
  let x = JSON.parse(JSON.stringify(sc)); x.things[0].shape = 'cube';
  assert.match(uni.scaleProblems(x).join(' | '), /shape must be/);
  x = JSON.parse(JSON.stringify(sc)); x.unit = { words: 'metres', per: 1 };
  assert.match(uni.scaleProblems(x).join(' | '), /measures length/);
  build();
  const page = fs.readFileSync(path.join(uni.UNI, 'site-preview', 'critical-thinking.html'), 'utf8');
  for (const words of ['8 thousandths of a millimetre across', '1.82 m tall', '490 m across', '3,470 km across', '12,700 km across', '1.39 million km across', '9.03 billion km across', '4.22 light years<', '100,000 light years across', '2.5 million light years<']) assert.ok(page.includes(words), 'the page does not say: ' + words);
});

test('backgrounds move the way voidtv.net moves its own: a column behind the front page, a fixed picture behind the rest', () => {
  build('--site');
  const read = (f) => fs.readFileSync(path.join(SITE, f), 'utf8');
  for (const f of ['archives.jpg', 'archives-m.jpg', 'desk.jpg', 'desk-m.jpg']) {
    const p = path.join(SITE, 'img', 'bg', f);
    assert.ok(fs.existsSync(p), f + ' is not in the public copy');
    assert.ok(fs.statSync(p).size < 500000, f + ' is too heavy for a page');
  }
  const home = read('index.html');
  assert.ok(home.includes('id="colhost"') && home.includes("c.className = 'column'"), 'the front page has no picture column');
  assert.ok(!home.includes('class="atmos"'), 'the front page should carry the column only, as on voidtv.net');
  const course = read('critical-thinking.html');
  assert.ok(course.includes('class="bgimg desk"'), 'a course page has no fixed picture');
  assert.ok(read('404.html').includes('class="bgimg archives"'), 'the not-found page has no fixed picture');
  for (const h of [home, course]) {
    assert.ok(h.includes('y*0.35'), 'the column should move at about a third of the scroll speed');
    assert.ok(h.includes('prefers-reduced-motion: reduce'), 'the movement must stop for people who ask for less motion');
  }
  assert.ok(!course.includes('pointer: coarse'), 'the fixed picture must drift on a tablet too, so touch screens are not left out');
  assert.ok(read('credits.html').includes('are our own'), 'the credits page does not say whose the backgrounds are');
});

test('a quiz answer gets a second try: the first wrong pick does not show the answer', () => {
  build();
  const dir = path.join(uni.UNI, 'site-preview');
  const page = fs.readdirSync(dir).filter((f) => f.endsWith('.html')).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).find((h) => h.includes('class="qq"'));
  assert.ok(page, 'no course page has a quiz');
  assert.ok(page.includes('class="qh" role="status" hidden>Not quite. You have one more try.'), 'the one more try line is not on the question');
  assert.ok(page.includes("if (j !== a && !q.classList.contains('tried'))"), 'a first wrong pick must not settle the question');
  assert.ok(page.includes('on the second try'), 'the score does not say how many took two tries');
});


test('make questions: the lecture words around a moment come in short lines, and a made question passes the same gate as a drafted one', () => {
  // a made-up lecture: 60 words, one every second, a sentence every ten words
  const said = [];
  for (let i = 0; i < 60; i++) said.push(['word' + i + (i % 10 === 9 ? '.' : ''), i, i + 0.5, 1]);
  const tr = { segments: [{ words: said }], words: said.map((w) => ({ w: w[0].replace('.', ''), raw: w[0], t: w[1] })) };
  const lines = uni.linesAt(tr, 34, 12, 3);
  assert.ok(lines.length >= 2 && lines.every((l) => l.b > l.a && l.text.length < 700), 'lines are short enough for one relay message');
  assert.strictEqual(lines.filter((l) => l.here).length, 1, 'exactly one line is the marked moment');
  const here = lines.find((l) => l.here);
  assert.ok(here.t <= 34 && said[here.b - 1][1] >= 34, 'the marked line holds second 34');
  assert.strictEqual(lines[0].a % 10, 0, 'the first line starts where a sentence starts');
  const good = { q: 'What is said here?', choices: ['Right', 'Wrong one', 'Wrong two', 'Wrong three'], a: 0, why: 'The lecture says it.', from: 20, to: 30 };
  const r = uni.madeQuestion(tr, [], good);
  assert.ok(r.item, r.error);
  assert.strictEqual(r.item.t, 20, 'the time is where the quote starts');
  assert.strictEqual(r.item.choices[r.item.a], 'Right', 'the right answer is still right after it moves');
  assert.ok(r.item.quote.startsWith('word20 ') && r.item.quote.endsWith('word29.'), 'the quote is the lecture word for word');
  const refused = (m, re) => assert.match(uni.madeQuestion(tr, [], { ...good, ...m }).error || '', re);
  refused({ from: 20, to: 25 }, /at least 8/);
  refused({ choices: ['Right', 'Same', 'Same', 'Other'] }, /three different wrong/);
  refused({ why: '' }, /why the answer is right/);
  refused({ from: 50, to: 999 }, /Pick the words/);
  refused({ q: 'x'.repeat(301) }, /too long/);
  assert.match(uni.madeQuestion(tr, [{ t: 22 }], good).error, /already quotes this moment/);
});

test('make questions: a device on the network gets the phone page and its room, nothing else; the public copy has no make button', () => {
  const serve = require('../profiles/university/serve.js');
  for (const p of ['/', '/index.html', '/human-nature.html', '/api/make/info', '/api/make/lines', '/api/make/save', '/api/make/rebuild', '/make/screen.js', '/make/qr.js', '/api/room/open', '/api/room/ABCDE']) {
    assert.strictEqual(serve.allowed(p, false), false, p + ' must not be given to a device that is not this computer');
    assert.strictEqual(serve.allowed(p, true), true);
  }
  for (const p of ['/join', '/make/phone.html', '/api/room/KX7P']) assert.strictEqual(serve.allowed(p, false), true, 'a phone needs ' + p);
  assert.ok(require('../play/rooms/room.js').KINDS.includes('lesson'), 'the phone relay has no lesson room');
  build();
  const prev = fs.readFileSync(path.join(uni.UNI, 'site-preview', 'human-nature.html'), 'utf8');
  assert.ok(prev.includes('class="makebar" hidden') && prev.includes('src="/make/screen.js"'), 'the preview lecture page has no make button');
  build('--site');
  for (const f of fs.readdirSync(SITE).filter((x) => x.endsWith('.html'))) {
    const h = fs.readFileSync(path.join(SITE, f), 'utf8');
    assert.ok(!h.includes('makebar') && !h.includes('/make/'), f + ' carries the make button into the public copy');
  }
  assert.ok(!fs.existsSync(path.join(SITE, 'make')), 'the make folder must never be in the public copy');
  const phone = fs.readFileSync(path.join(uni.UNI, 'make', 'phone.html'), 'utf8') + fs.readFileSync(path.join(uni.UNI, 'make', 'screen.js'), 'utf8');
  assert.ok(!/[—–]/.test(phone), 'no long dashes');
  assert.ok(!/Users|@gmail|bryan/i.test(phone), 'no personal details');
});
