// The color code (B, 25 Oct 2026: shows, channels and guide blocks color coded, easy to understand). Run: node --test tests/colors.test.js
// Part 1: colorOf in scripts/lib/app.js puts a show in the right group. Part 2: catalog/colors.json is sound (every shelf has a home,
// colors are distinct, nothing points nowhere). Part 3: the page carries the groups. No network; nothing is written.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { colorOf, page } = require('../scripts/lib/app');

const REPO = path.join(__dirname, '..');
const C = JSON.parse(fs.readFileSync(path.join(REPO, 'catalog', 'colors.json'), 'utf8'));
const show = (over) => Object.assign({ slug: 'a-show', type: 'British and Beyond', tags: [], genres: [] }, over);

// ---- part 1: which group a show takes -------------------------------------------------------------------------------------------
test('a show takes its shelf\'s color', () => {
  assert.equal(colorOf(show({ type: '90s Sitcoms' }), C), 'comedy');
  assert.equal(colorOf(show({ type: 'Adult Swim' }), C), 'animation');
  assert.equal(colorOf(show({ type: 'Documentary & Geographic', genres: ['Comedy'] }), C), 'doc', 'the shelf wins over the genres');
  assert.equal(colorOf(show({ type: 'MTV' }), C), 'reality');
  assert.equal(colorOf(show({ slug: 'movie-12', type: 'TV Movies' }), C), 'movies');
  assert.equal(colorOf(show({ slug: 'movie-13', type: 'Specials' }), C), 'movies');
});

test('a show on a mixed shelf takes its own genres, in genreOrder', () => {
  assert.equal(colorOf(show({ genres: ['Crime', 'Drama'] }), C), 'drama');
  assert.equal(colorOf(show({ genres: ['Comedy', 'Animation'] }), C), 'animation', 'an animated comedy is animation');
  assert.equal(colorOf(show({ type: 'World TV', genres: ['Documentary', 'Comedy'] }), C), 'doc');
  assert.equal(colorOf(show({ type: 'Classic TV', genres: ['Sci-Fi & Fantasy', 'Drama'] }), C), 'scifi');
  assert.equal(colorOf(show({ type: 'Streaming Era', genres: ['Talk'] }), C), 'reality');
  assert.equal(colorOf(show({ genres: [] }), C), 'other');
  assert.equal(colorOf(null, C), 'other');
});

test('anything behind the 18+ door is late night, whatever its shelf', () => {
  assert.equal(colorOf(show({ type: 'Late Night' }), C), 'late');
  assert.equal(colorOf(show({ type: 'Drama', adult: true }), C), 'late', 'marked 18+ in HQ');
  assert.equal(colorOf(show({ type: '90s Sitcoms', tags: ['Late Night'] }), C), 'late');
});

// ---- part 2: the setting file ----------------------------------------------------------------------------------------------------
const MIXED = ['British and Beyond', 'World TV', 'Classic TV', 'Streaming Era'];
test('catalog/colors.json: every shelf of the show list has a color or is a mixed shelf placed by genre', () => {
  const list = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts', 'show-list.json'), 'utf8'));
  const have = new Set(C.groups.flatMap((g) => g.types));
  const types = new Set(list.shows.map((s) => s.type).concat(list.types || []));
  const homeless = [...types].filter((t) => t && !have.has(t) && !MIXED.includes(t));
  assert.deepEqual(homeless, []);
});

test('catalog/colors.json: keys and colors are distinct, colors are #rrggbb, genreOrder names real groups, one adult group', () => {
  const all = C.groups.concat([C.other]);
  assert.equal(new Set(all.map((g) => g.key)).size, all.length);
  assert.equal(new Set(all.map((g) => g.color.toLowerCase())).size, all.length);
  for (const g of all) assert.match(g.color, /^#[0-9a-f]{6}$/i, g.key);
  for (const k of C.genreOrder) assert.ok(C.groups.some((g) => g.key === k), k);
  assert.equal(C.groups.filter((g) => g.adult).length, 1);
  assert.doesNotMatch(fs.readFileSync(path.join(REPO, 'catalog', 'colors.json'), 'utf8'), new RegExp(String.fromCharCode(0x2014)));
});

// ---- part 3: the page --------------------------------------------------------------------------------------------------------------
test('the page carries the groups for the legend (split mode, as voidtv.net is built)', () => {
  const html = page({ data: { shows: [], people: {}, links: {}, types: [], colors: [{ k: 'comedy', n: 'Comedy', c: '#ffd23f' }] }, mode: 'split' });
  assert.ok(html.includes('const CG=[{"k":"comedy","n":"Comedy","c":"#ffd23f"}];'));
  assert.ok(html.includes('id="gdLegend"'), 'the legend row in the guide');
});
