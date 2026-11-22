// PLAY's moment rows (play/src/moments-shelf.js over the shared engine assets/brand/moments/moments.js; docs/MOMENTS.md).
// Run: node --test "play/test/*.test.js"
// 1. The GTA moment (catalog/moments.json) on this shelf: every Grand Theft Auto carded here, in the moment's order, two
//    copies of the same name both kept, nothing from Kids, the row only once it has its 2 games.
// 2. The page: the engine and moments-shelf load before shelf.js, and shelf.js calls place() once, from the home branch.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const engine = require('../../assets/brand/moments/moments.js');
const PM = require('../src/moments-shelf.js');

const REPO = path.join(__dirname, '..', '..');
const shelf = JSON.parse(fs.readFileSync(path.join(REPO, 'play', 'shelf', 'index.json'), 'utf8')).games;
const moments = JSON.parse(fs.readFileSync(path.join(REPO, 'catalog', 'moments.json'), 'utf8')).moments;
const now = new Date('2026-11-23T12:00:00');

test('the GTA moment picks every first Grand Theft Auto on the shelf, in its order, and shows only with two', () => {
  const gta = moments.find((m) => m.id === 'gta');
  const want = gta.areas.play.order.filter((item) => shelf.some((g) => g.item === item));
  const rows = PM.rowsFrom(moments, shelf, { engine, now });
  if (want.length < 2) { assert.equal(rows.length, 0, 'one game on the shelf: no row yet'); return; }
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, 'The first Grand Theft Autos');
  assert.deepEqual(rows[0].games.map((g) => g.item).filter((i) => want.includes(i)), want);
  assert.ok(rows[0].games.every((g) => /grand theft auto/i.test(g.title) && g.year >= 1997 && g.year <= 2004));
});

test('two games with the same name are both kept, and the shelf game itself comes back', () => {
  const games = [
    { id: 'gta-pc', item: 'grand-theft-auto-1997-dma-design', title: 'Grand Theft Auto', year: 1997, system: 'dos' },
    { id: 'gta-gbc', item: 'grand-theft-auto-game-boy-gbc-enhanced', title: 'Grand Theft Auto', year: 1999, system: 'gbcolor' },
  ];
  const rows = PM.rowsFrom(moments, games, { engine, now });
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].games.map((g) => g.id), ['gta-pc', 'gta-gbc']);
  assert.equal(rows[0].games[0], games[0], 'the shelf game itself, so its box opens it');
  assert.equal(PM.rowsFrom(moments, games, { engine, now, kids: true }).length, 0, 'never on Kids');
  assert.equal(PM.rowsFrom(moments, games, { engine, now: new Date('2027-02-01T12:00:00') }).length, 0, 'over after its end');
});

test('the page loads the engine and moments-shelf before the shelf, and the shelf calls place() once, at home', () => {
  const html = fs.readFileSync(path.join(REPO, 'play', 'index.html'), 'utf8');
  const at = (s) => html.indexOf('src="' + s + '"');
  assert.ok(at('/assets/brand/moments/moments.js') > 0 && at('/assets/brand/moments/moments.js') < at('src/moments-shelf.js'));
  assert.ok(at('src/moments-shelf.js') < at('src/shelf.js'));
  const js = fs.readFileSync(path.join(REPO, 'play', 'src', 'shelf.js'), 'utf8');
  assert.equal(js.split('PlayMoments.place(').length, 2, 'one call point');
  const home = js.slice(js.indexOf('if (home) {'), js.indexOf('let games = shelfGames.filter'));
  assert.ok(home.includes('PlayMoments.place(rows, shelfGames, rowSection'), 'from the home branch, with every game on the shelf');
});

test('layout B (Bryan, 22 Nov 2026): the banner opens on the moment, in our own look, and its button goes to the row', () => {
  const games = shelf.filter((g) => /grand theft auto/i.test(g.title));
  const s = PM.slidesFrom(moments, games, { engine, now });
  const gta = moments.find((m) => m.id === 'gta');
  if (PM.rowsFrom(moments, games, { engine, now }).length === 0) { assert.equal(s.length, 0, 'no row, no slide'); return; }
  assert.equal(s.length, 1);
  assert.equal(s[0].title, gta.ad.line, "Bryan's line, big");
  assert.equal(s[0].go, gta.ad.go);
  assert.equal(s[0].to, '[data-moment="gta"]', 'the button goes to the moment row');
  assert.match(s[0].line, /^The first Grand Theft Autos, 1997 to 2004, free to play here\.$/);
  assert.equal(s[0].g, undefined, 'no game behind it: no picture, no lettering');
  assert.equal(PM.slidesFrom(moments, games, { engine, now, kids: true }).length, 0);
  const noAd = moments.map((m) => ({ ...m, ad: undefined }));
  assert.equal(PM.slidesFrom(noAd, games, { engine, now }).length, 0, 'a moment with no ad line keeps the usual banner');
  const js = fs.readFileSync(path.join(REPO, 'play', 'src', 'shelf.js'), 'utf8');
  assert.ok(js.includes('heroList = (root.PlayMoments ? root.PlayMoments.slides(shelfGames) : []).concat(heroSlides(shelfGames))'), 'added at run time, first');
  assert.ok(/if \(s\.moment\) \{ slides\.append\(el\('div', 's moment'\)\); continue; \}/.test(js), 'the moment slide has no picture');
  assert.ok(js.includes('root.PlayMoments.wait(1500)'), 'the first draw waits for the moments at most 1.5 s');
  assert.ok(!/front-picks/.test(fs.readFileSync(path.join(REPO, 'play', 'src', 'moments-shelf.js'), 'utf8').replace(/\/\/.*$/gm, '')), 'moments-shelf never touches the banner list');
});
