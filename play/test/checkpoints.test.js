// Picture checkpoints (Bryan, 20 Nov 2026, "Yes, ask the lead": Caitlin lost her last life on level 2 and was sent back
// to level 1). Run: node --test "play/test/*.test.js"
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/checkpoints.js');

const play = (minutes) => { let list = []; for (let t = 60; t <= minutes * 60; t += 60) { list.push({ at: t }); list = C.hold(list, t); } return list; };
const back = (list, now) => C.pick(list, now).map((c) => (now - c.at) / 60);

test('one save point a minute; after 20 minutes of play the menu offers 1, 2, 4, 7, 12 and 20 minutes back', () => {
  assert.deepEqual(back(play(30), 1800), [1, 2, 4, 7, 12, 20]);
  assert.deepEqual(back(play(5), 300), [1, 2, 4], 'early on, what there is');
  assert.ok(play(60).length <= C.HOLD_MIN + 1, 'never more than about 24 held');
});

test('plain words for how far back', () => {
  assert.equal(C.label(20), 'Just now');
  assert.equal(C.label(60), '1 minute back');
  assert.equal(C.label(7 * 60 + 10), '7 minutes back');
});

test('the page: console games take one a minute of play, the pause menu shows them with pictures, a tap goes back with Undo', () => {
  const fs = require('fs'), path = require('path');
  const js = fs.readFileSync(path.join(__dirname, '..', 'src', 'play.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'game.html'), 'utf8');
  assert.ok(js.includes('if (!PlayCards.isPad(card) || !window.PlayCheckpoints) return;'), 'console games only');
  assert.ok(js.includes('if (!started || paused || (document.hidden && !pip) || !runner) return;'), 'paused or hidden time does not count, except while the game is popped out');
  assert.ok(js.includes("toast(ok ? 'Back ' + words.replace(' back', '') : 'That checkpoint would not load', ok ? undo : null);"), 'with Undo');
  assert.ok(html.includes('<div id="cp-list" class="menu-row cp-list"></div>'), 'in a menu row, so a gamepad reaches them');
  assert.ok(html.includes('<script src="src/checkpoints.js"></script>'));
});
