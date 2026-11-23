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
  for (const p of pages) assert.ok(live.has(p) || ['index', 'credits', '404', 'join', 'ifttt', 'study'].includes(p), p + '.html is in the public copy but not live');
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
  const pages = fs.readdirSync(SITE).filter((f) => f.endsWith('.html') && f !== 'join.html');
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
  // on a throwaway copy: the real list.json is never written by a test
  const real = path.join(uni.UNI, 'list.json'), was = fs.readFileSync(real);
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'uni-live-')), copy = path.join(dir, 'list.json');
  fs.writeFileSync(copy, was);
  const read = () => JSON.parse(fs.readFileSync(copy, 'utf8'));
  const course = (slug) => read().courses.find((c) => c.slug === slug).live;
  assert.equal(uni.setLive('critical-thinking', false, copy).live, false);
  assert.equal(course('critical-thinking'), false);
  assert.equal(uni.setLive('critical-thinking', true, copy).live, true);
  assert.equal(course('critical-thinking'), true);
  // a course built on a practice site takes that site's card with it, both ways
  const card = () => read().practice.find((g) => g.course === 'the-body').live;
  uni.setLive('the-body', false, copy); assert.deepEqual([course('the-body'), card()], [false, false]);
  uni.setLive('the-body', true, copy); assert.deepEqual([course('the-body'), card()], [true, true]);
  assert.throws(() => uni.setLive('no-such-course', true, copy));
  fs.rmSync(dir, { recursive: true, force: true });
  assert.ok(fs.readFileSync(real).equals(was), 'the test changed the real list.json');
});

test('the public pages carry no machine-made tells: no middle-dot strings, no capitals labels, and less motion when asked', () => {
  build('--site');
  for (const p of fs.readdirSync(SITE).filter((f) => f.endsWith('.html') && f !== 'join.html')) {
    const h = fs.readFileSync(path.join(SITE, p), 'utf8');
    assert.doesNotMatch(h, /\u00b7/, p + ': a middle dot joins two things; say it in words');
    assert.equal((h.match(/text-transform:uppercase/g) || []).length, 1, p + ': only the crest wordmark is in capitals');
    assert.match(h, /prefers-reduced-motion:reduce/, p + ': no reduced-motion rule');
    assert.doesNotMatch(h, /class="kick"/, p + ': a label line sits over the headline');
    assert.equal((h.match(/<link href="fonts\/[a-z]+\.css" rel="stylesheet">/g) || []).length, 1, p + ': the public copy loads only the faces it uses');
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

test('backgrounds are the one every Void area shares: all four pictures behind the front page, one behind the rest', () => {
  build('--site');
  const read = (f) => fs.readFileSync(path.join(SITE, f), 'utf8');
  for (const f of ['academy.jpg', 'academy-m.jpg', 'hall.jpg', 'hall-m.jpg', 'archives.jpg', 'archives-m.jpg', 'desk.jpg', 'desk-m.jpg']) {
    const p = path.join(SITE, 'img', 'bg', f);
    assert.ok(fs.existsSync(p), f + ' is not in the public copy');
    assert.ok(fs.statSync(p).size < 500000, f + ' is too heavy for a page');
  }
  const home = read('index.html');
  // B, 19 Nov 2026: "i want these used in the same ways as as vtv. the way the bg moves". It is voidtv.net's own file, loaded from there
  // as the menu is, with this site's pictures; VoidTV's lightning static comes with it, so the copies kept here are gone.
  const tag = (far, fit) => new RegExp('<script src="https://voidtv\\.net/assets/brand/atmos/atmos\\.js\\?v=[0-9a-f]{10}" defer data-base="img/bg/" data-far="' + far + '"' + (fit ? ' data-fit="cover"' : '') + '></script>');
  assert.match(home, tag('hall.jpg,academy.jpg,archives.jpg,desk.jpg', false), 'the front page has all four pictures, each whole');
  const course = read('critical-thinking.html');
  assert.match(course, tag('academy.jpg', true), 'a course page has the academy behind it');
  assert.match(read('404.html'), tag('hall.jpg', true), 'the not-found page has the hall behind it');
  for (const h of [home, course]) {
    assert.ok(!h.includes('class="bgimg') && !h.includes("c.className = 'column'") && !h.includes('y*0.35'), 'no copy of the layer of its own');
    assert.ok(h.includes('html:not([data-look="bright"]) .vatm{display:none}'), 'only the bright look has the background');
    assert.ok(h.includes('.vatm~*:where(:not(.vatm)){position:relative;z-index:1}'), 'the page sits over it, and the sticky header keeps its place');
  }
  assert.ok(!fs.existsSync(path.join(SITE, 'img', 'bg', 'static-bolt.jpg')) && !fs.existsSync(path.join(SITE, 'img', 'bg', 'noise.png')), 'the lightning static and noise are not copied here any more');
  // That it drifts on a tablet (B, 19 Nov 2026: "make the background drift on my tablet too") and stops for less motion: tests/atmos.test.js.
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

test('Body Atlas sits in the University as a practice site: its lessons open from units, and a quiz quote must be the lesson word for word', () => {
  const L = list();
  const g = L.practice.find((x) => x.name === 'Body Atlas');
  assert.ok(g && g.area === 'Body' && g.course === 'the-body' && /^https:/.test(g.url), 'Body Atlas is not in the practice list');
  const course = JSON.parse(fs.readFileSync(path.join(uni.UNI, 'courses', 'the-body.json'), 'utf8'));
  const rooms = new Set(g.rooms.map((r) => r.id));
  for (const u of course.units) {
    assert.deepEqual(uni.unitNeeds(u, course), [], 'unit ' + u.n + ' is not whole');
    assert.ok(u.main.role === 'train' && rooms.has(u.main.room), 'unit ' + u.n + ' opens no Body Atlas lesson');
    assert.ok(u.quiz.length >= 4, 'unit ' + u.n + ' has under 4 questions');
    for (const q of u.quiz) assert.ok(q.lesson === u.main.room && q.step && new Set(q.choices).size === 4 && q.a >= 0 && q.a < 4, 'a quiz line of unit ' + u.n + ' is not keyed to its lesson');
  }
  // the quote check, on a made-up lesson
  const lesson = { chapters: [{ steps: [{ id: 's1', say: 'The spleen sits high on the left of the belly, behind the ribs.', src: ['a paper'] }, { id: 's2', say: 'It is found more often in skiing, soccer and basketball players.', src: ['StatPearls, some chapter'] }] }] };
  assert.strictEqual(uni.lessonQuoteProblem(lesson, { step: 's1', quote: 'sits high on the left of the belly, behind the ribs.' }), '');
  assert.match(uni.lessonQuoteProblem(lesson, { step: 's1', quote: 'sits low on the left of the belly, behind the ribs.' }), /no longer says this word for word/);
  assert.match(uni.lessonQuoteProblem(lesson, { step: 's9', quote: 'sits high on the left of the belly, behind the ribs.' }), /no step/);
  assert.match(uni.lessonQuoteProblem(lesson, { step: 's1', quote: 'behind the ribs.' }), /under 8 words/);
  assert.match(uni.lessonQuoteProblem(lesson, { step: 's2', quote: 'It is found more often in skiing, soccer and basketball players.' }), /source the University does not use/);
  build();
  const page = fs.readFileSync(path.join(uni.UNI, 'site-preview', 'the-body.html'), 'utf8');
  assert.ok(page.includes('href="https://body.bspokevisuals.com/?lesson=shoulder&amp;from=university&amp;unit=1"'), 'the shoulder unit does not open its lesson with the way back');
  assert.ok(page.includes('>Open the lesson</a>') && page.includes('See it in 3D') && page.includes('each answer quotes the lesson') && page.includes('From the lesson: open it'), 'the lesson piece or its quiz is not worded for a lesson');
  // Mind Gym rooms still open the old way
  assert.ok(fs.readFileSync(path.join(uni.UNI, 'site-preview', 'critical-thinking.html'), 'utf8').includes('rooms/hole-finder/" target="_blank" rel="noopener">Open the room</a>'), 'a Mind Gym room no longer opens');
  // the public copy carries the course and the card only once both are marked live
  build('--site');
  const live = L.courses.find((c) => c.slug === 'the-body').live;
  assert.strictEqual(!!g.live, !!live, 'the course and its practice card must go live together');
  assert.strictEqual(fs.existsSync(path.join(SITE, 'the-body.html')), !!live);
});

test('answer on your phones: each question has the second its line ends, and the phone page takes a lesson with two tries', () => {
  // a made-up lecture, one word a second: nothing here reads a heard lecture, which is kept out of git
  const said = [];
  for (let i = 0; i < 60; i++) said.push({ w: 'word' + i, raw: 'word' + i + (i % 10 === 9 ? '.' : ''), t: i });
  const quote = said.slice(20, 30).map((x) => x.raw).join(' ');
  const quiz = [{ t: 20, quote }, { quote: 'a book question has no time' }, { t: 40, quote: 'these words are not in the lecture at all, not one' }];
  assert.deepEqual(uni.endsFor(quiz, { words: said }), [{ t: 20, e: 30, heard: true }, null, { t: 40, e: 46, heard: false }], 'asked a second after the last quoted word; estimated when the words are not found');
  assert.deepEqual(uni.endsFor(quiz, null)[0], { t: 20, e: 26, heard: false }, 'a lecture not heard yet is timed by reading speed');
  assert.deepEqual(uni.quizEnds('no-such-course', 1), []);
  assert.deepEqual(uni.quizEnds('the-body', 1), [null, null, null, null, null], 'a lesson quiz has no lecture time, so it is not asked by the clock');
  const dir = path.join(uni.UNI, 'make');
  const phone = fs.readFileSync(path.join(dir, 'phone.html'), 'utf8'), screen = fs.readFileSync(path.join(dir, 'answer-screen.js'), 'utf8');
  for (const t of ['ask', 'choice', 'go', 'result', 'why', 'quote', 'over']) {
    assert.ok(screen.includes("type: '" + t + "'"), 'the screen never sends ' + t);
    assert.ok(phone.includes("m.type === '" + t + "'"), 'the phone does not understand ' + t);
  }
  assert.ok(phone.includes("type: 'pick'") && screen.includes("x.type === 'pick'"), 'a tap on the phone is not heard by the screen');
  assert.ok(screen.includes('tries < 2') && phone.includes('You have one more try.'), 'a learner gets a second try, as on the page');
  assert.ok(!/[\u2014\u2013]/.test(screen) && !/Users|@gmail|bryan/i.test(screen), 'no long dashes or personal details');
  const serve = require('../profiles/university/serve.js');
  assert.strictEqual(serve.allowed('/api/make/ends', false), false, 'question times stay on this computer');
  assert.strictEqual(serve.allowed('/make/answer-screen.js', false), false);
  build('--site');
  for (const f of fs.readdirSync(SITE).filter((x) => x.endsWith('.html'))) assert.ok(!fs.readFileSync(path.join(SITE, f), 'utf8').includes('answer-screen'), f + ' names a preview file in the public copy');
});

test('public pages name no workers.dev address and ask Google for nothing: Mind Gym at its own address, fonts kept on the site', () => {
  const gym = list().practice.find((g) => g.name === 'Mind Gym');
  assert.strictEqual(gym.url, 'https://gym.bspokevisuals.com/');
  build(); build('--site');
  const type = JSON.parse(fs.readFileSync(path.join(uni.UNI, 'profile.json'), 'utf8')).type || 'inter';
  for (const dir of [SITE, path.join(uni.UNI, 'site-preview')]) {
    for (const f of fs.readdirSync(dir).filter((x) => /\.(html|js|css|json)$/.test(x) && !/three\.module|planck/.test(x))) {
      const h = fs.readFileSync(path.join(dir, f), 'utf8');
      assert.ok(!/workers\.dev/.test(h), f + ' carries a workers.dev address');
      assert.ok(!/fonts\.googleapis|fonts\.gstatic/.test(h), f + ' asks Google for a font');
    }
  }
  assert.ok(fs.readFileSync(path.join(SITE, 'critical-thinking.html'), 'utf8').includes('href="https://gym.bspokevisuals.com/rooms/hole-finder/"'), 'a Train it piece does not open its room at the new address');
  const page = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  assert.ok(page.includes('<link href="fonts/' + type + '.css" rel="stylesheet">'), 'the page does not load its own font sheet');
  const css = fs.readFileSync(path.join(SITE, 'fonts', type + '.css'), 'utf8');
  const files = [...new Set([...css.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1]))];
  assert.ok(files.length >= 2 && files.every((x) => /^[a-z0-9-]+\.woff2$/.test(x) && fs.existsSync(path.join(SITE, 'fonts', x))), 'a font file the sheet names is not on the site');
  // ...and, beside scenes, the two faces printed on the things on the lit table (scene.js), also from the site itself
  // (and the hand on the crystal's slips, crystal-bottle.js)
  const table = (fs.existsSync(path.join(SITE, 'scene.js')) ? ['bricolage-grotesque-latin.woff2', 'fraunces-latin.woff2'] : []).concat(fs.existsSync(path.join(SITE, 'crystal-bottle.js')) ? ['fraunces-latin.woff2'] : []);
  assert.deepEqual(fs.readdirSync(path.join(SITE, 'fonts')).filter((x) => x.endsWith('.woff2')).sort(), [...new Set(files.concat(table))].sort(), 'the public copy carries only the chosen typeface');
});

test('the preview server answers only to this computer\'s own names, so a page under a borrowed name cannot use it', () => {
  const serve = require('../profiles/university/serve.js');
  const port = serve.PORT;
  for (const h of ['127.0.0.1:' + port, 'localhost:' + port, 'LOCALHOST:' + port, ...serve.addresses().map((a) => a + ':' + port)]) assert.strictEqual(serve.hostOk(h), true, h + ' is this computer');
  for (const h of ['evil.example:' + port, 'evil.example', '127.0.0.1.evil.example:' + port, '127.0.0.1:1', '', undefined, 'localhost']) assert.strictEqual(serve.hostOk(h), false, String(h) + ' must be refused');
});

test('answer on your phones is on the live site: exact question times on the page, rooms on voidtv.net, the phone page at /join', () => {
  // a made-up course: stampEnds is the same arithmetic as endsFor, which the test above pins down
  build('--site');
  const read = (f) => fs.readFileSync(path.join(SITE, f), 'utf8');
  const withLecture = list().courses.filter((c) => c.live).map((c) => JSON.parse(fs.readFileSync(path.join(uni.UNI, 'courses', c.slug + '.json'), 'utf8')))
    .filter((c) => c.units.some((u) => u.main && u.main.item && (u.quiz || []).some((q) => typeof q.t === 'number')));
  assert.ok(withLecture.length, 'no live course has a lecture with timed questions');
  for (const c of withLecture) {
    const h = read(c.slug + '.html');
    assert.ok(h.includes('<script src="qr.js"></script><script src="answer.js"></script>'), c.slug + ' does not load the answer script');
    for (const u of c.units) for (const q of u.quiz || []) if (typeof q.e === 'number') {
      assert.ok(q.e > q.t && q.e - q.t < 90, c.slug + ' unit ' + u.n + ': a question is asked long after its line');
      assert.ok(h.includes('data-t="' + q.t + '" data-e="' + q.e + '"'), c.slug + ' unit ' + u.n + ': the page does not carry the second the line ends');
    }
    assert.ok(c.units.some((u) => (u.quiz || []).some((q) => typeof q.e === 'number')), c.slug + ' has no exact question time; run: node scripts/uni.js ends ' + c.slug);
  }
  // a course with no lecture on the page (The body) does not load it
  assert.ok(!read('the-body.html').includes('answer.js'), 'a course with nothing to answer by the clock loads the answer script');
  for (const f of ['answer.js', 'qr.js', 'join.html']) assert.ok(fs.existsSync(path.join(SITE, f)), f + ' is not in the public copy');
  const screen = read('answer.js'), phone = read('join.html');
  for (const x of [screen, phone]) assert.ok(x.includes("'wss://voidtv.net'") && x.includes('voidtv\\.net$/.test(location.hostname)'), 'on the live site the rooms must be voidtv.net\'s');
  assert.ok(screen.includes("location.origin + '/join?r='"), 'the code on the live screen must lead to this site\'s own /join');
  assert.ok(screen.includes("if (!LIVE_SITE) fetch('/api/make/ends") && screen.includes('if (LIVE_SITE) addButtons();'), 'the live page must not ask for a server it does not have');
  assert.ok(phone.includes('Donate to CASH') && phone.includes('href="index.html"') && phone.includes('prefers-reduced-motion:reduce'), 'the live phone page needs the donation line, a way home and the reduced-motion rule');
  assert.ok(!phone.includes('<!--') && !/Users|@gmail|bryan/i.test(phone + screen), 'no leftover marker or personal detail on the live phone page');
  // making questions never ships: it writes course files
  assert.ok(!fs.existsSync(path.join(SITE, 'screen.js')) && !fs.readdirSync(SITE).some((f) => /make/.test(f)), 'the make side is in the public copy');
});

test('remodel: no stock photo is shown or shipped, every area has its hue, and the header is one row', () => {
  build('--site');
  const read = (f) => fs.readFileSync(path.join(SITE, f), 'utf8');
  const stock = JSON.parse(fs.readFileSync(path.join(uni.UNI, 'img', 'images.json'), 'utf8'));
  const notOurs = Object.values(stock).filter((x) => !/^our own/i.test(x.license || '')).map((x) => x.file.replace(/^img\//, ''));
  assert.ok(notOurs.length > 10, 'the test expects the old stock list to still be recorded');
  for (const f of fs.readdirSync(SITE).filter((x) => x.endsWith('.html'))) {
    const h = read(f);
    for (const p of notOurs) assert.ok(!h.includes('img/' + p), f + ' shows the stock photo ' + p);
    assert.ok(!/<img[^>]* src=""/.test(h), f + ' has a picture with no file');
  }
  for (const p of notOurs) assert.ok(!fs.existsSync(path.join(SITE, 'img', p)), 'the public copy carries the stock photo ' + p);
  // a hue for every area in the list, all different
  const src = fs.readFileSync(path.join(uni.UNI, 'build.js'), 'utf8');
  const hues = list().types.map((t) => { const m = new RegExp("['\"]?" + t + "['\"]?: '(#[0-9a-f]{6})'").exec(src); assert.ok(m, 'no hue for the area ' + t); return m[1]; });
  assert.strictEqual(new Set(hues).size, hues.length, 'two areas share a hue');
  const body = read('the-body.html'), money = read('your-money-plainly.html'), home = read('index.html');
  assert.ok(body.includes('<style>html[data-look]{--area:#ff6b8b}</style>') && money.includes('{--area:#f2a93b}'), 'a course page does not carry its area hue');
  assert.ok(home.includes('class="ph face"><span>Like '), 'a course card with no picture should show its own everyday line');
  // one row: the way home, this page, one Courses menu; no link per course in the bar
  const nav = /<nav class="nav">([\s\S]*?)<\/nav>/.exec(body)[1];
  const bar = nav.slice(0, nav.indexOf('<details'));
  assert.strictEqual((bar.match(/<a /g) || []).length, 2, 'the bar holds Home and this page only');
  assert.ok(nav.includes('<summary title="Every course, by area">Courses</summary>') && nav.includes('id="inst"'), 'the Courses menu and Install inside it');
  assert.ok(/header\.top\{[^}]*flex-wrap:nowrap/.test(body), 'the header may wrap to a second row');
});

// Explainers (22 Nov 2026): a real system as stores, flows and the learner's choices, built from measured years.
const explainCourse = () => JSON.parse(fs.readFileSync(path.join(uni.UNI, 'courses', 'our-climate-plainly.json'), 'utf8'));
const MODEL = require(path.join(uni.UNI, 'explain-model.js'));

test('explainer: every number is measured with its source, and a part with no words, a fader with no tip or a rate with missing years is refused', () => {
  const ex = explainCourse().units[0].explainer;
  assert.deepEqual(uni.explainerProblems(ex), []);
  const bad = (change, want) => { const x = JSON.parse(JSON.stringify(ex)); change(x); assert.match(uni.explainerProblems(x).join(' | '), want); };
  bad((x) => { x.flows[0].src = ['nowhere']; }, /flow fossil has no source/);
  bad((x) => { delete x.stores[0].words; }, /store air has no words/);
  bad((x) => { delete x.choices[0].tip; }, /choice fossil has no hover tip/);
  bad((x) => { delete x.history.stores.air['2019']; }, /cannot be worked out/);
  bad((x) => { x.history.periods.pop(); }, /needs exactly one measured period/);
  bad((x) => { x.stores[0].start = 400; }, /measured value for 2025 is 427\.35/);
  bad((x) => { x.say.run += ' {nothing}'; }, /names \{nothing\}/);
  bad((x) => { x.rules[0].when = {}; }, /can never be found/);
  // the numbers are the sources' own: Global Carbon Budget 2025 Table 7 and NOAA's Mauna Loa annual means
  const p = Object.fromEntries(ex.history.periods.map((x) => [x.name, x.flows]));
  assert.deepEqual(p['the 2015 to 2024 mean'], { fossil: 9.8, landuse: 1.4, ocean: 3.2, land: 2.4 });
  assert.deepEqual(p['2024'], { fossil: 10.3, landuse: 1.3, ocean: 3.4, land: 1.9 });
  assert.equal(ex.history.stores.air['1959'], 315.98);
  assert.equal(ex.history.stores.air['2025'], 427.35);
});

test('explainer model: the rates come from the measured years, and the store behaves as the research says', () => {
  const ex = explainCourse().units[0].explainer, m = MODEL.make(ex);
  // at the mean of the measured years it was fitted on, each sink takes back exactly its measured amount
  let sum = 0; for (let y = 2015; y <= 2024; y++) sum += ex.history.stores.air[String(y)];
  const at = { year: 2020, level: { air: (sum / 10) * 2.124 } };
  const fl = m.flows(at, { fossil: 0, landuse: 0 });
  assert.ok(Math.abs(fl.ocean - 3.2) < 1e-9 && Math.abs(fl.land - 2.4) < 1e-9, 'the sinks are not the measured ones at the fit');
  // emissions held where they are: the air keeps filling every single year (Sterman and Booth Sweeney 2007)
  const held = m.run({ fossil: 10.4, landuse: 1.1 }, 50, 'air');
  for (let i = 1; i < held.length; i++) assert.ok(held[i].value > held[i - 1].value, 'the air stopped rising in ' + held[i].year);
  assert.ok(Math.abs(held[50].value - 506.8) < 0.5, 'held at today it ends at ' + held[50].value);
  // emissions equal to what comes out: the air holds
  const hold = m.holding('air'), tot = hold.fossil + hold.landuse;
  assert.ok(tot > 0.5 * 11.5 && tot < 0.6 * 11.5, 'holding needs about half of today: ' + tot);
  const flat = m.run(hold, 30, 'air'); assert.ok(Math.abs(flat[30].value - 427.35) < 0.01);
  // no emissions: it falls, a few ppm a year, not all at once
  const none = m.run({ fossil: 0, landuse: 0 }, 10, 'air');
  assert.ok(none[1].value < 427.35 && none[1].value > 420 && none[10].value > 380);
  // the line under the stage fills from the world and says nothing it was not given
  assert.equal(MODEL.say('{year}: {air} ppm, {nope}', { year: '2030', air: 441.2 }), '2030: 441 ppm, {nope}');
});

test('explainer on the page: the preview shows it with its scripts and pictures beside it; the public copy carries it only once live', () => {
  build();
  const prev = path.join(uni.UNI, 'site-preview');
  const page = fs.readFileSync(path.join(prev, 'our-climate-plainly.html'), 'utf8');
  assert.match(page, /data-ex=/);
  assert.match(page, /<script src="explain-model\.js"><\/script><script type="module" src="explain\.js"><\/script>/);
  assert.match(page, /essd\.copernicus\.org\/articles\/18\/3211\/2026/, 'the source link is not on the card');
  for (const f of ['explain.js', 'explain-model.js', 'three.module.min.js', 'img/explain/earth.jpg', 'img/explain/land.png']) assert.ok(fs.existsSync(path.join(prev, f)), f + ' is not beside the page that needs it');
  // every fader and button the block writes has a hover tip
  const block = page.slice(page.indexOf('<div class="ex"'), page.indexOf('<div class="ex-rules">'));
  for (const m of block.matchAll(/<(button|input)\b[^>]*>/g)) assert.match(m[0], /title="[^"]+"/, 'no hover tip: ' + m[0].slice(0, 80));
  build('--site');
  const ex = explainCourse().units[0].explainer, live = ex.live && list().courses.find((c) => c.slug === 'our-climate-plainly').live;
  assert.equal(fs.existsSync(path.join(SITE, 'explain.js')), !!live);
  if (!live) assert.ok(!fs.existsSync(path.join(SITE, 'our-climate-plainly.html')));
});

test('If this, then that: every rule from every lab and explainer is on the page once, and each opens a unit that has it', () => {
  build();
  const prev = path.join(uni.UNI, 'site-preview');
  const page = fs.readFileSync(path.join(prev, 'ifttt.html'), 'utf8');
  // every rule that ships, counted straight from the course files
  const want = [];
  for (const f of fs.readdirSync(path.join(uni.UNI, 'courses'))) {
    const c = JSON.parse(fs.readFileSync(path.join(uni.UNI, 'courses', f), 'utf8'));
    for (const u of c.units) {
      if (u.lab) (u.lab.rules || []).forEach((r, i) => want.push(c.slug + '/' + u.n + '/lab/' + i));
      if (u.explainer) (u.explainer.rules || []).forEach((r, i) => want.push(c.slug + '/' + u.n + '/ex/' + i));
    }
  }
  const keys = [...page.matchAll(/<li data-key="([^"]+)">/g)].map((m) => m[1]);
  assert.deepEqual([...keys].sort(), [...want].sort(), 'the page and the course files list different rules');
  assert.equal(new Set(keys).size, keys.length, 'a rule is listed twice');
  // each place links to a page that exists, whose unit carries a lab or explainer with the same key the rules use
  for (const m of page.matchAll(/<a class="go" href="([a-z0-9-]+)\.html#u(\d+)"/g)) {
    const f = path.join(prev, m[1] + '.html');
    assert.ok(fs.existsSync(f), m[1] + '.html is not built');
    const html = fs.readFileSync(f, 'utf8');
    assert.match(html, new RegExp('id="u' + m[2] + '"'), m[1] + ' has no unit ' + m[2]);
    assert.match(html, new RegExp('data-key="' + m[1] + '/' + m[2] + '/(lab|ex)"'), m[1] + ' unit ' + m[2] + ' has no lab or explainer that remembers its rules');
  }
  // a then stays hidden until found; every control has a hover tip; the way home is on the page
  assert.doesNotMatch(page, /<span class="th">/);
  for (const m of page.matchAll(/<(button|input)\b[^>]*>/g)) if (!/id="(inst|instok|lookpick|typepick)"/.test(m[0])) assert.match(m[0], /title="[^"]+"/, 'no hover tip: ' + m[0].slice(0, 80));
  assert.match(page, /&#8592; Home/);
  assert.match(fs.readFileSync(path.join(prev, 'index.html'), 'utf8'), /class="ruleslink" href="ifttt\.html"/);
});

test('explainer, the Colorado River: Reclamation\'s own records close the books, the lakes empty under the deals, and the basin files are there', () => {
  const ex = explainCourse().units.find((u) => u.n === 2).explainer, m = MODEL.make(ex);
  assert.deepEqual(uni.explainerProblems(ex), []);
  // the measured years: river in, minus releases and evaporation, gives Lake Powell's measured change, year by year
  let gap = 0;
  for (let y = 2001; y <= 2026; y++) {
    const p = m.period(y).flows, s0 = ex.history.stores.powell[String(y - 1)], s1 = ex.history.stores.powell[String(y)];
    gap += s1 - s0 - (p.river - p.release - p.evap);
  }
  assert.ok(Math.abs(gap / 26) < 0.05, 'Lake Powell\'s books do not close: ' + gap / 26);
  // what the deals promise (9 out of Hoover) against the recent river: Lake Mead falls every year to nothing
  const g = m.run({ river: 8.2, release: 8.23, deliver: 9 }, 20, 'mead');
  for (let i = 1; i < g.length; i++) assert.ok(g[i].value < g[i - 1].value || g[i].value === 0);
  assert.equal(g[20].value, 0);
  // an empty lake lets out only what comes in
  const s = m.start(); for (let i = 0; i < 12; i++) m.step(s, { river: 8.2, release: 8.23, deliver: 9 }, 1);
  assert.ok(Math.abs(m.flows(s, { river: 8.2, release: 8.23, deliver: 9 }).deliver - 8.23) < 1e-9);
  // hold: Hoover lets go what Glen Canyon lets through
  assert.ok(Math.abs(m.holding('mead', ['deliver'], { river: 8.2, release: 8.23, deliver: 9 }).deliver - 8.23) < 1e-9);
  // levels read straight off Reclamation's measured pairs, and say when they go below anything measured
  assert.equal(m.level('mead', 6.83), '1,038 feet');
  assert.match(m.level('mead', 3), /lower than any level measured/);
  for (const st of ex.stores) { const c = st.level.curve.slice().sort((a, b) => a[0] - b[0]); for (let i = 1; i < c.length; i++) assert.ok(c[i][1] > c[i - 1][1], st.id + ' level curve does not rise with storage'); }
  // the basin's files: heights, colour, rivers and both lakes, each lake the size Reclamation measured when full
  const dir = path.join(uni.UNI, ex.map.dir), b = JSON.parse(fs.readFileSync(path.join(dir, 'basin.json'), 'utf8'));
  for (const f of ['height.png', 'color.jpg']) assert.ok(fs.existsSync(path.join(dir, f)), f);
  assert.ok(b.rivers.length > 20 && b.lakes.powell.cells.length > 150 && b.lakes.mead.cells.length > 150);
});

test('the front page door (Option A): a real question to guess, Remember it from finished lessons, the questions people get wrong, and only live pieces in the public copy', () => {
  build();
  const prev = path.join(uni.UNI, 'site-preview'), page = fs.readFileSync(path.join(prev, 'index.html'), 'utf8');
  const door = JSON.parse(/var DOORQ = (\[.*?\]), RULESN = (\d+);/.exec(page)[1]);
  assert.ok(door.length >= 2, 'no questions for the door');
  for (const q of door) {
    assert.ok(q.q && q.options.length >= 2 && q.answer >= 0 && q.answer < q.options.length && q.after, 'a door question is not whole');
    const [slug, n] = q.href.split('.html#u');
    assert.match(fs.readFileSync(path.join(prev, slug + '.html'), 'utf8'), new RegExp('id="u' + n + '"'), q.href + ' does not open a unit');
    assert.doesNotMatch(q.after, /\{[a-z]+\}/, 'the gap line was not filled: ' + q.after);
  }
  // the explainer's gap is worked out by the same model the page runs: held at today's rate, 427 to 507
  assert.ok(door.some((q) => /from 427 to 507 ppm/.test(q.after)));
  // Remember it reads recall.json: every quiz question of every lesson on the site, by course and unit
  const bank = JSON.parse(fs.readFileSync(path.join(prev, 'recall.json'), 'utf8'));
  assert.equal(bank['your-money-plainly/1'].q.length, JSON.parse(fs.readFileSync(path.join(uni.UNI, 'courses', 'your-money-plainly.json'), 'utf8')).units.find((u) => u.n === 1).quiz.length);
  // the questions people get wrong each open their unit; every button on the door has a hover tip in its script
  for (const m of page.matchAll(/<a class="qcard"[^>]*href="([a-z0-9-]+)\.html#u(\d+)"/g)) assert.match(fs.readFileSync(path.join(prev, m[1] + '.html'), 'utf8'), new RegExp('id="u' + m[2] + '"'));
  assert.match(page, /b\.title = 'Choose this answer'/);
  // a lesson marked done remembers when, so its questions come back a day later
  assert.match(fs.readFileSync(path.join(prev, 'critical-thinking.html'), 'utf8'), /vu:doneAt/);
  // the public copy: only live pieces at the door and in Remember it
  build('--site');
  const pub = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8'), live = new Set(list().courses.filter((c) => c.live).map((c) => c.slug));
  for (const q of JSON.parse(/var DOORQ = (\[.*?\]), RULESN/.exec(pub)[1])) assert.ok(live.has(q.href.split('.html')[0]), q.href + ' is at the public door but its course is not live');
  for (const k of Object.keys(JSON.parse(fs.readFileSync(path.join(SITE, 'recall.json'), 'utf8')))) assert.ok(live.has(k.split('/')[0]), k + ' is in the public Remember it but not live');
});

test('Study together and the Tools row: the room page, its sets with their sources, the phone\'s study mode, and a way to the tools from every page', () => {
  build();
  const prev = path.join(uni.UNI, 'site-preview');
  const page = fs.readFileSync(path.join(prev, 'study.html'), 'utf8');
  assert.match(page, /<script src="make\/qr\.js"><\/script><script src="study\.js"><\/script>/);
  assert.match(page, /&#8592; Home/, 'no way back from the study room');
  for (const m of page.matchAll(/<(button|input)\b[^>]*>/g)) if (!/id="(inst|instok|lookpick|typepick)"/.test(m[0])) assert.match(m[0], /title="[^"]+"/, 'no hover tip: ' + m[0].slice(0, 80));
  assert.ok(fs.existsSync(path.join(prev, 'study.js')));
  // every question in a set carries its quote and where it is from, for the shared screen
  const bank = JSON.parse(fs.readFileSync(path.join(prev, 'recall.json'), 'utf8'));
  assert.equal(bank['our-climate-plainly/1'].q[0].from, 'Sterman and Booth Sweeney, 2007');
  for (const b of Object.values(bank)) for (const q of b.q) assert.ok(q.from, b.title + ': a question with no source line');
  // the phone page knows the study room: a private guess, the source said as a fact, no score
  const phone = fs.readFileSync(path.join(uni.UNI, 'make', 'phone.html'), 'utf8');
  assert.match(phone, /m\.mode === 'study'/);
  assert.match(phone, /The source says something else/);
  // the Tools row and the header link on every page
  const home = fs.readFileSync(path.join(prev, 'index.html'), 'utf8');
  assert.match(home, /<section class="tools" id="tools">[\s\S]*href="study\.html"[\s\S]*href="ifttt\.html"/);
  for (const f of fs.readdirSync(prev).filter((x) => x.endsWith('.html'))) assert.match(fs.readFileSync(path.join(prev, f), 'utf8'), /href="index\.html#tools"/, f + ': no way to the tools');
  // the public copy carries the room, the phone page at /join and the QR maker
  build('--site');
  for (const f of ['study.html', 'study.js', 'join.html', 'qr.js', 'recall.json']) assert.ok(fs.existsSync(path.join(SITE, f)), f + ' is not in the public copy');
  assert.match(fs.readFileSync(path.join(SITE, 'study.html'), 'utf8'), /<script src="qr\.js"><\/script>/);
});

test('Pattern Eater together: every lesson crystal is a set the room can build, and the phone holds and sends pieces', () => {
  build();
  const prev = path.join(uni.UNI, 'site-preview');
  const bank = JSON.parse(fs.readFileSync(path.join(prev, 'recall.json'), 'utf8'));
  const cr = bank['critical-thinking/1'].crystal;
  const src = JSON.parse(fs.readFileSync(path.join(uni.UNI, 'courses', 'critical-thinking.json'), 'utf8')).units.find((u) => u.n === 1).crystal;
  assert.deepEqual(cr.partials, src.partials);
  assert.equal(cr.key, src.key);
  assert.deepEqual(cr.decoys.map((d) => d.text), src.decoys.map((d) => d.text));
  const page = fs.readFileSync(path.join(prev, 'study.html'), 'utf8');
  for (const id of ['howguess', 'howeat', 'gem', 'showidea', 'redeal']) assert.match(page, new RegExp('id="' + id + '"[^>]*'), id);
  const js = fs.readFileSync(path.join(prev, 'study.js'), 'utf8');
  assert.match(js, /type: 'piece'/); assert.match(js, /type: 'set'/);
  const phone = fs.readFileSync(path.join(uni.UNI, 'make', 'phone.html'), 'utf8');
  assert.match(phone, /m\.type === 'eat'/); assert.match(phone, /type: 'give'/); assert.match(phone, /id="eat"/);
});

test('Say it another way in the study room: write privately, cards show only when all are in, no names, your own cannot be picked', () => {
  build();
  const prev = path.join(uni.UNI, 'site-preview');
  const page = fs.readFileSync(path.join(prev, 'study.html'), 'utf8');
  for (const id of ['howsay', 'eatsay', 'saybox', 'cards', 'showcards']) assert.match(page, new RegExp('id="' + id + '"'), id);
  const js = fs.readFileSync(path.join(prev, 'study.js'), 'utf8');
  assert.match(js, /if \(!S\.say\.shown && n && w === n\) showCards\(\)/, 'cards must wait until everyone has written');
  assert.match(js, /S\.say\.cards\[x\.i\]\.from !== String\(m\.from\)/, 'a phone must not pick its own card');
  const phone = fs.readFileSync(path.join(uni.UNI, 'make', 'phone.html'), 'utf8');
  assert.match(phone, /m\.type === 'say'/); assert.match(phone, /type: 'said'/); assert.match(phone, /if \(m\.mine\) \{ cb\.disabled = true/);
});

test('the public copy carries no flip side unless a unit is marked "flip": true', () => {
  const marked = fs.readdirSync(path.join(uni.UNI, 'courses')).filter((f) => f.endsWith('.json'))
    .some((f) => JSON.parse(fs.readFileSync(path.join(uni.UNI, 'courses', f), 'utf8')).units.some((u) => u.flip === true));
  build('--site');
  const has = fs.readdirSync(SITE).some((f) => /^flip/.test(f)) || fs.readdirSync(SITE).filter((f) => f.endsWith('.html')).some((f) => /class="flip"/.test(fs.readFileSync(path.join(SITE, f), 'utf8')));
  if (!marked) assert.ok(!has, 'a flip side reached the public copy with no unit marked for it');
});

// The lit table (Bryan, 22 Nov 2026: "A, lit table"): every unit's existing scene block is acted out with real things
// on a lit table (scene.js on three.js), by the rules in scene-plan.js, which the page and these tests share.
const scenePlan = require(path.join(uni.UNI, 'scene-plan.js'));
const allScenes = () => fs.readdirSync(path.join(uni.UNI, 'courses')).filter((f) => f.endsWith('.json')).flatMap((f) => {
  const c = JSON.parse(fs.readFileSync(path.join(uni.UNI, 'courses', f), 'utf8'));
  return c.units.filter((u) => u.scene).map((u) => ({ where: c.slug + ' unit ' + u.n, sc: u.scene }));
});

test('the lit table: every piece of every scene becomes a thing on the table, and a renamed piece turns over', () => {
  const scenes = allScenes();
  assert.ok(scenes.length >= 38, 'fewer scenes than the 38 the lit table was built for');
  const KINDS = ['card', 'tag', 'bar', 'sticker', 'ball', 'slip', 'tape', 'thread', 'prop', 'label'];
  for (const { where, sc } of scenes) {
    const p = scenePlan.plan(sc);
    assert.strictEqual(p.states.length, sc.beats.length, where);
    for (const a of sc.actors) {
      assert.ok(KINDS.includes(p.kind[a.id]), where + ': ' + a.id + ' is not a thing on the table');
      p.faces[a.id].forEach((f, i) => {
        const A = p.states[i].from[a.id], B = p.states[i].to[a.id];
        // a piece turns over only when it is on the table and its words change; a bar measures, it never turns
        if (f.turned) {
          assert.ok(A.o >= 0.5 && (A.label || A.sub) && (B.label || B.sub), where + ': ' + a.id + ' turns over off the table or blank, step ' + (i + 1));
          assert.notStrictEqual(f.face, f.from, where + ': a turn that lands on the same face');
          assert.notStrictEqual(p.kind[a.id], 'bar', where + ': a bar turned over');
        } else assert.strictEqual(f.face, f.from, where + ': ' + a.id + ' changed face without turning');
      });
    }
    // the camera keeps every piece that is on the table in frame at the end of every step
    p.states.forEach((s, i) => {
      const box = p.frame(i).box;
      for (const id in s.to) {
        if (!scenePlan.shown(s.to[id], p.kind[id])) continue;
        const e = scenePlan.extent(s.to[id], p.kind[id]);
        assert.ok(e[0] >= box[0] - 0.01 && e[1] >= box[1] - 0.01 && e[2] <= box[2] + 0.01 && e[3] <= box[3] + 0.01, where + ': ' + id + ' out of frame at step ' + (i + 1));
      }
    });
  }
  // the lesson Bryan picked from: the price cards are hang tags, the sale is a sticker, the arrows are threads, and the
  // three tags turn over to the idea's names together, on the step that renames them
  const sale = scenes.find((x) => x.sc.analogy === 'A sale price after the price went up');
  const p = scenePlan.plan(sale.sc);
  assert.deepStrictEqual(['t1', 't2', 't3', 'big', 'r1', 'r2'].map((id) => p.kind[id]), ['tag', 'tag', 'tag', 'sticker', 'thread', 'thread']);
  const turnAt = (id) => p.faces[id].map((f, i) => (f.turned ? i + 1 : 0)).filter(Boolean);
  assert.deepStrictEqual(['t1', 't2', 't3', 'big'].map(turnAt), [[5], [5], [5], [5]]);
  // a stamp that never has words is a ball (the cup-and-ball game); a card that grows is a strip of paper
  const cups = scenePlan.plan(scenes.find((x) => /cup-and-ball/.test(x.sc.analogy)).sc);
  assert.strictEqual(cups.kind.ball, 'ball');
  const paint = scenePlan.plan(scenes.find((x) => /Painting the room/.test(x.sc.analogy)).sc);
  assert.strictEqual(paint.kind.bar, 'bar');
});

test('the lit table ships with every page that has a scene: the engine, its rules, three.js and its two typefaces', () => {
  const src = fs.readFileSync(path.join(uni.UNI, 'scene.js'), 'utf8');
  assert.ok(/import \* as THREE from '\.\/three\.module\.min\.js'/.test(src), 'scene.js no longer draws with three.js');
  assert.ok(!/createElementNS|<svg|'svg'/.test(src), 'scene.js draws flat SVG boxes again');
  assert.ok(/new THREE\.WebGLRenderer/.test(src) && (src.match(/new THREE\.WebGLRenderer/g) || []).length === 1, 'one renderer for the page, not one per scene');
  for (const flag of [[], ['--site']]) {
    build(...flag);
    const out = path.join(uni.UNI, flag.length ? 'site' : 'site-preview');
    const pages = fs.readdirSync(out).filter((f) => f.endsWith('.html')).map((f) => ({ f, h: fs.readFileSync(path.join(out, f), 'utf8') }));
    const withScene = pages.filter((x) => x.h.includes('class="sc" data-scene='));
    for (const { f, h } of pages) {
      const has = withScene.some((x) => x.f === f);
      assert.strictEqual(h.includes('<script src="scene-plan.js"></script><script type="module" src="scene.js"></script>'), has, f + (has ? ' has a scene but no lit table' : ' loads the lit table with no scene'));
    }
    if (withScene.length) for (const need of ['scene.js', 'scene-plan.js', 'scene-props.js', 'three.module.min.js', 'three-LICENSE.txt', 'fonts/bricolage-grotesque-latin.woff2', 'fonts/fraunces-latin.woff2']) assert.ok(fs.existsSync(path.join(out, need)), need + ' is not shipped beside the scenes in ' + path.basename(out));
  }
});

test('the crystal is a bottle of supercooled water on the lit table, shipped with every page that has a crystal', () => {
  // Bryan, 23 Nov 2026: "still simple" about the flat crystal, then "A, the bottle".
  const lib = fs.readFileSync(path.join(uni.UNI, 'crystal-bottle.js'), 'utf8'), cx = fs.readFileSync(path.join(uni.UNI, 'crystal.js'), 'utf8');
  assert.ok(lib.includes("import * as THREE from './three.module.min.js'") && lib.includes('LatheGeometry'), 'the bottle is no longer turned glass drawn with three.js');
  assert.strictEqual(lib.split('new THREE.WebGLRenderer').length - 1, 1, 'one renderer for all the crystals on a page');
  assert.ok(lib.includes('export async function bottleView') && cx.includes("'crystal-bottle.js'"), 'crystal.js does not load the bottle');
  // the growth rules stay in crystal.js; the bottle only draws what they say
  for (const k of ['function grow()', 'function heat()', 'function heatStep()', 'function finish()']) assert.ok(cx.includes(k), 'crystal.js lost ' + k);
  for (const k of ['wrong', 'inc', 'bnd', 'aha', 'broken', 'picked', 'heating']) assert.ok(lib.includes(k), 'the bottle does not show ' + k);
  for (const flag of [[], ['--site']]) {
    build(...flag);
    const out = path.join(uni.UNI, flag.length ? 'site' : 'site-preview');
    const any = fs.readdirSync(out).filter((f) => f.endsWith('.html')).some((f) => fs.readFileSync(path.join(out, f), 'utf8').includes('class="cx" data-cfg='));
    if (any) for (const need of ['crystal-bottle.js', 'three.module.min.js', 'three-LICENSE.txt', 'fonts/fraunces-latin.woff2']) assert.ok(fs.existsSync(path.join(out, need)), need + ' does not go with the crystals in ' + path.basename(out));
    else assert.ok(!fs.existsSync(path.join(out, 'crystal-bottle.js')), 'the bottle ships with no crystal in ' + path.basename(out));
    if (any) assert.ok(fs.readFileSync(path.join(out, 'credits.html'), 'utf8').includes('the bottle in Make it set are drawn with three.js'), 'the credits do not name three.js for the bottle');
  }
});

test('draft lessons get real objects too: every object a draft scene names is in the library', () => {
  // Bryan, 23 Nov 2026: "Yes, drafts next". The drafts given objects so far; each names only objects the library has.
  const lib = fs.readFileSync(path.join(uni.UNI, 'scene-props.js'), 'utf8'), dir = path.join(uni.UNI, 'drafts');
  const done = ['human-nature-1', 'human-nature-3', 'human-nature-4', 'human-nature-5', 'human-nature-6', 'human-nature-7', 'human-nature-8', 'human-nature-9', 'human-nature-10', 'human-nature-12', 'human-nature-13', 'human-nature-14', 'human-nature-15', 'human-nature-16', 'human-nature-17'];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const sc = (JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).unit || {}).scene; if (!sc) continue;
    const props = sc.actors.filter((a) => a.prop);
    for (const a of props) assert.ok(new RegExp('\n  ' + a.prop + ': \{').test(lib), f + ': no object called ' + a.prop);
    for (const a of sc.actors.filter((x) => x.tie)) assert.ok(props.some((p) => p.id === String(a.tie).split('.')[0]), f + ': ' + a.id + ' is tied to nothing');
    if (done.includes(f.replace('.json', ''))) { assert.ok(props.length >= 2, f + ' is still on paper'); assert.ok(!sc.actors.some((a) => a.type === 'stamp' || a.type === 'arrow'), f + ' still has flat stamps or arrows'); }
  }
});

test('real objects on the lit table: every object a scene names is in the library, tied and rested on real objects', () => {
  // Bryan, 22 Nov 2026: "A, objects with tags". The objects are modelled in scene-props.js; a scene names them.
  const lib = fs.readFileSync(path.join(uni.UNI, 'scene-props.js'), 'utf8');
  const names = new Set([...lib.slice(lib.indexOf('export const PROPS')).matchAll(/^  '?([a-z][a-z-]*)'?: \{$/gm)].map((m) => m[1]));
  assert.ok(names.has('golf-ball') && names.has('tee') && names.has('cup'), 'the object library lost an object');
  assert.ok(!/fetch\(|GLTFLoader|\.glb|\.gltf|\.obj['"]/.test(lib), 'an object is loaded from a file instead of modelled in code');
  for (const { where, sc } of allScenes()) {
    const p = scenePlan.plan(sc), ids = new Set(sc.actors.map((a) => a.id));
    const isProp = (id) => p.kind[id] === 'prop';
    for (const a of sc.actors) {
      if (a.prop && a.prop !== 'tag') assert.ok(names.has(a.prop), where + ': ' + a.id + ' names an object the library does not have: ' + a.prop);
      if (a.tie) assert.ok(isProp(String(a.tie).split('.')[0]), where + ': ' + a.id + ' is tied to something that is not an object');
    }
    p.states.forEach((s, i) => { for (const id in s.to) if (s.to[id].on) assert.ok(ids.has(s.to[id].on) && isProp(s.to[id].on) && isProp(id), where + ': ' + id + ' rests on something that is not an object, step ' + (i + 1)); });
  }
  // the golf ball lesson: the tee chips on step 2, the ball leaves the tee on step 4, and the tags turn on step 5
  const golf = allScenes().find((x) => /golf ball on a tee/.test(x.sc.analogy)).sc, g = scenePlan.plan(golf);
  assert.deepStrictEqual(['left', 'right', 'thing'].map((id) => g.kind[id]), ['prop', 'prop', 'label']);
  assert.deepStrictEqual(g.states.map((s) => !!s.to.right.chipped), [false, true, true, true, true]);
  assert.deepStrictEqual(g.states.map((s) => s.to.left.on || null), ['right', 'right', 'right', null, null]);
  assert.deepStrictEqual(['left', 'right', 'thing'].map((id) => g.faces[id].map((f, i) => (f.turned ? i + 1 : 0)).filter(Boolean)), [[5], [5], [5]]);
  // the cup game: three brass cups; the one you point to lifts empty, and the ball is under the other
  const cups = scenePlan.plan(allScenes().find((x) => /cup-and-ball/.test(x.sc.analogy)).sc);
  assert.deepStrictEqual(['a', 'b', 'c'].map((id) => cups.kind[id]), ['prop', 'prop', 'prop']);
  assert.ok(cups.states[3].to.c.lifted && !cups.states[3].to.b.lifted && cups.states[5].to.b.lifted && !cups.states[5].to.c.lifted);
  // The body 2 to 4 (Bryan, 22 Nov 2026: "Yes, next three"): each analogy is acted by its own objects
  const body = (re) => scenePlan.plan(allScenes().find((x) => re.test(x.sc.analogy)).sc);
  const kinds = (p, ids) => ids.map((id) => p.kind[id]);
  const hose = body(/garden hose/), gate = body(/gate held by a latch/), bench = body(/small bench/);
  assert.deepStrictEqual(kinds(hose, ['left', 'right', 'thing', 'tyre']), ['prop', 'prop', 'prop', 'prop']);
  assert.ok(hose.states[1].to.thing.pinched && hose.states[1].to.tyre.o === 1 && !hose.states[2].to.right.wilted && hose.states[3].to.right.wilted);
  assert.deepStrictEqual(kinds(gate, ['left', 'right', 'thing']), ['prop', 'prop', 'label']);
  assert.deepStrictEqual(gate.states.map((s) => [s.to.left.open || 0, !!s.to.left.snapped]), [[0, false], [-0.55, true], [0, true], [1, true], [0, true]]);
  assert.deepStrictEqual(kinds(bench, ['left', 'right', 'thing']), ['prop', 'prop', 'prop']);
  assert.ok(bench.states[0].to.left.on === 'thing' && bench.states[0].to.right.on === 'thing' && bench.states[1].to.left.swell && bench.states[3].to.right.squeezed);
  // Your money, plainly (Bryan, 22 Nov 2026: "Yes, money lessons"): the lessons whose analogy is a thing act with it
  const money = (re) => scenePlan.plan(allScenes().find((x) => re.test(x.sc.analogy)).sc);
  const jar = money(/shared jar/);
  assert.deepStrictEqual(jar.states.map((s) => [s.to.jar.coins || 0, !!s.to.h3.burnt, !!s.to.h3.rebuilt]), [[0, false, false], [20, false, false], [20, true, false], [0, true, true], [0, true, true]]);
  const pizza = money(/slices of a pizza/);
  assert.deepStrictEqual(pizza.states.map((s) => [s.to.pizza.slices, s.to.pizza.mine]), [[8, 2], [16, 4], [16, 4], [20, 4], [20, 4]]);
  assert.ok(money(/coin flip/).states[1].to.coin.up && !money(/coin flip/).states[2].to.coin.up);
  assert.deepStrictEqual(money(/classroom/).states.map((s) => s.to.tch.coins), [10, 10, 1, 1, 1, 1]);
  assert.ok(money(/Two boxes/).states[2].to.a.turned && !money(/Two boxes/).states[1].to.a.turned);
  assert.deepStrictEqual(['basket', 'jar'].map((n) => money(/groceries go up/).kind[n === 'basket' ? 'bas' : 'jar']), ['prop', 'prop']);
  // Mind and human nature, batch 1 (Bryan, 22 Nov 2026: "Yes, mind lessons")
  const flip = money(/last slice of pizza/);
  assert.deepStrictEqual(flip.states.map((s) => [!!s.to.coin.up, s.to.coin.face || 'heads']), [[false, 'heads'], [true, 'heads'], [false, 'tails'], [false, 'heads'], [false, 'heads'], [false, 'heads'], [false, 'heads']]);
  assert.strictEqual(flip.kind.mirror, 'prop');
  assert.deepStrictEqual(money(/5:30 alarm/).states.map((s) => s.to.clock.time), [23, 5.5, 5.67, 5.67, 5.5]);
  assert.deepStrictEqual(['A', 'B'].map((id) => money(/fat free/).kind[id]), ['prop', 'prop']);
  assert.ok(money(/free sample/).states[1].to.smp.eaten && money(/free sample/).kind.big === 'prop' && money(/Painting the room/).kind.plan === 'prop');
  // Mind lessons, batch 2 (Bryan, 23 Nov 2026: "Yes, next batch")
  const movie = money(/bad movie/);
  assert.deepStrictEqual(movie.states.map((s) => [!!s.to.tk.torn, !!s.to.exit.open]), [[false, false], [false, false], [false, false], [true, false], [true, false], [true, true], [true, true], [true, true]]);
  assert.deepStrictEqual(kinds(movie, ['tk', 'exit']), ['prop', 'prop']);
  const keys = money(/your keys/);
  assert.ok(keys.kind.keys === 'prop' && keys.states[2].to.keys.o === 0 && keys.states[3].to.keys.o === 1);
  const car = money(/sticker on a car/);
  assert.deepStrictEqual(kinds(car, ['stk', 'deal', 'worth']), ['prop', 'tag', 'tag']);
  assert.deepStrictEqual(kinds(money(/Finding \$20/), ['find', 'lose', 'lb']), ['prop', 'prop', 'bar']);
  const line = money(/restaurant with the line/), sc = allScenes().find((x) => /restaurant with the line/.test(x.sc.analogy)).sc;
  assert.deepStrictEqual(kinds(line, ['A', 'B', 'p0', 'p1', 'p2', 'p3', 'you']), Array(7).fill('prop'));
  assert.ok(['p0', 'p1', 'p2', 'p3', 'you'].every((id) => sc.actors.find((a) => a.id === id).pose === 'stand'), 'the people in the line stand');
  // the four who queue stand in a line at A's door, and you end up beside B
  const ends = ['p0', 'p1', 'p2', 'p3'].map((id) => line.states[2].to[id]);
  assert.ok(ends.every((v, i) => v.o === 1 && (i === 0 || v.x < ends[i - 1].x)), 'the line runs out from A');
  assert.ok(line.states[3].to.you.x < ends[3].x && line.states[6].to.you.x > 400, 'you join the end of the line, then go to B');
  // Mind lessons, batch 3 (Bryan, 23 Nov 2026: "Yes, next batch")
  assert.deepStrictEqual(kinds(money(/Afraid of sharks/), ['sh', 'cr', 'sf', 'cf']), ['prop', 'prop', 'bar', 'bar']);
  assert.strictEqual(money(/lab coat/).kind.pill, 'prop');
  assert.strictEqual(money(/Only 2 left/).kind.shelf, 'prop');
  assert.strictEqual(money(/after the game/).kind.score, 'prop');
  const slot = money(/slot machine/);
  // three pulls: nothing, nothing, three sevens and the lamp; then it keeps spinning to nothing
  assert.deepStrictEqual(slot.states.map((s) => [s.to.slot.stop.join(''), !!s.to.slot.win]), [['142', false], ['263', false], ['000', true], ['514', false], ['514', false], ['514', false], ['514', false]]);
  assert.deepStrictEqual(slot.states.map((s) => s.to.phone.screen), ['feed', 'feed', 'feed', 'feed', 'likes', 'likes', 'quiet']);
  // Batch 4 (Bryan, 23 Nov 2026: "Yes, next batch")
  assert.deepStrictEqual(kinds(money(/bill and its receipt/), ['bill', 'rec', 'slot']), ['prop', 'prop', 'tape']);
  const gps = money(/recalculating/);
  assert.deepStrictEqual(kinds(gps, ['car', 'blk', 'home']), ['prop', 'prop', 'prop']);
  assert.ok(gps.states[3].to.car.y > gps.states[2].to.car.y && gps.states[5].to.car.x > gps.states[3].to.car.x, 'the car takes the new road, then drives on toward home');
  assert.strictEqual(money(/shoes that pinch/).kind.shoe, 'prop');
  assert.deepStrictEqual(money(/phone plan/).states.map((s) => s.to.old.screen), ['note', 'note', 'note', 'note', 'note', 'note', 'call']);
  // the new driver's STUDENT DRIVER board: on in week one, off by year five, on again for any new skill
  assert.deepStrictEqual(money(/new driver/).states.map((s) => s.to.drv.learner), [true, true, true, false, true, true]);
  // The last four (Bryan, 23 Nov 2026: "Yes, last four")
  const lift = money(/closing elevator/);
  assert.deepStrictEqual(kinds(lift, ['cab', 'dl', 'dr', 'you']), ['prop', 'label', 'label', 'prop']);
  assert.deepStrictEqual(lift.states.map((s) => [s.to.cab.shut, s.to.cab.dir || '']), [[0.3, ''], [0.3, ''], [1, 'up'], [1, 'up'], [1, 'up'], [0, '']]);
  assert.ok(lift.states[1].to.you.y < 60 && lift.states[5].to.you.y > 150, 'you step into the cab, and back out for the next one');
  const halo = money(/salesperson/);
  assert.ok(halo.kind.sp === 'prop' && halo.kind.glow === 'prop' && halo.states[1].to.glow.on === 'sp', 'the halo rests over the salesperson');
  assert.deepStrictEqual(halo.states.map((s) => s.to.glow.o), [0, 1, 1, 1, 1, 0]);
  assert.strictEqual(money(/movie trailer/).kind.tl, 'prop');
  assert.deepStrictEqual(kinds(money(/rumor at work/), ['you', 'c3', 'c2', 'c1']), ['prop', 'prop', 'prop', 'prop']);
  // every lesson is now acted with real objects, but the two about numbers, not things, and the sale price, whose
  // objects are the hang tags themselves
  const paper = allScenes().filter(({ sc }) => !sc.actors.some((a) => a.prop && a.prop !== 'tag')).map(({ sc }) => sc.analogy).sort();
  // the tent (The body, a lesson that reached master after the lit table was built) waits for its objects
  assert.deepStrictEqual(paper, ['A gym with a cheap first two months', 'A sale price after the price went up', 'A tent in the wind when the first guy rope snaps', 'One student, or a whole school'], 'lessons still on paper: ' + paper.join('; '));
});
