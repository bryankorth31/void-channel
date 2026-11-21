// VoidTV PLAY: tests for the kids page mode (<html data-kids>, kids.voidtv.net/games/; Bryan, 20 Nov 2026). The kids
// site builds its own copy of game.html with that mark; these hold play.js to the Kids rules. Licence: GPL-2.0-or-later.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const play = fs.readFileSync(path.join(__dirname, '..', 'src', 'play.js'), 'utf8');

test('the kids page is known by its own mark, read once', () => {
  assert.match(play, /const KIDS = document\.documentElement\.hasAttribute\('data-kids'\);/);
});

test('kids: no donation in front of a child, no phone controller, no cheats, and the way back is the kids games', () => {
  const block = play.slice(play.indexOf('if (KIDS) {'), play.indexOf('}', play.indexOf('if (KIDS) {')) + 1);
  assert.match(block, /querySelectorAll\('\.donate, #give, #give-card'\)\) e\.remove\(\)/, 'the cross, its card and the menu line go');
  for (const id of ['b-phones', 'cover-phone', 'm-phones', 'phones', 'm-cheats', 'cheats']) assert.match(block, new RegExp("'" + id + "'"), id + ' is hidden');
  assert.match(block, /a\.mark'\)\) a\.href = '\/'/, 'the mark goes to the kids home');
  assert.match(block, /#b-games, \.menu a\[href="\.\/"\]'\)\) a\.href = '\/games\/'/, 'back goes to the kids games');
  assert.match(play, /function showPhones\(open\) \{\s*if \(KIDS\) return;/, 'no phone room is ever opened');
  assert.match(play, /if \(!KIDS && PlayPhones\.kept\(\)\)/, 'no kept phone room is taken back');
  assert.match(play, /if \(\$\('cover-phone'\) && !KIDS\)/, 'the layout never shows the start screen\'s phone offer');
  assert.match(play, /function loadCheats\(c\) \{\s*if \(KIDS \|\|/, 'no cheats are fetched, so the handheld Cheats key never shows');
});

test('kids: only a card marked kids plays, and only from the kids cards (no bundle, draft or shelf list)', () => {
  assert.match(play, /if \(KIDS && c\.kids !== true\) throw new Error\('That game is not on Kids\. Pick one from the games\.'\);/);
  assert.match(play, /if \(KIDS\) \{\s*q\.delete\('b'\); q\.delete\('draft'\);/, 'no bundle and no draft, dropped before anything is read');
  assert.match(play, /r\.status === 404 && !q\.get\('draft'\) && !KIDS\) return fetch\('shelf\/index\.json'\)/, 'no shelf list');
});

test('kids: nothing leaves the site: the Archive credit is words, and the start picture is the kids site\'s own copy', () => {
  assert.match(play, /if \(KIDS\) \$\('from'\)\.textContent = 'The game plays straight from the Internet Archive\.';/);
  assert.match(play, /if \(KIDS\) art\.src = 'art\/' \+ encodeURIComponent\(c\.id\) \+ '\.jpg';\s*else art\.src = 'https:\/\/archive\.org\/cors\//);
  assert.match(play, /document\.title = c\.title \+ \(KIDS \? ' \| Games \| voidtv\.net kids' : ' \| PLAY \| voidtv\.net'\);/);
});

test('every Kids card is a single-player game the kids page can run (a console or DOS card, never an arcade cabinet)', () => {
  const dir = path.join(__dirname, '..', 'cards');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const c = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (c.kids !== true) continue;
    assert.notEqual(c.system, 'arcade', f + ': arcade games need coins and run attract screens, so they stay off Kids');
  }
});
