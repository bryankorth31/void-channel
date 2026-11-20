// Cheats (Bryan, 20 Nov 2026: "add toggle for cheats"). Run: node --test "play/test/*.test.js"
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const PLAY = path.join(__dirname, '..');
const Cards = require('../src/cards.js');
const cards = fs.readdirSync(path.join(PLAY, 'cards')).filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(fs.readFileSync(path.join(PLAY, 'cards', f), 'utf8')));

test('cheats (Bryan, 20 Nov 2026: "add toggle for cheats"): lists from libretro-database under CC BY-SA 4.0, a switch each in the pause menu, set through the engine', () => {
  const T = require('../tools/cheats.js');
  assert.equal(T.pickFile('Tetris (Game Boy)', ['Tetris (Japan).cht', 'Tetris (World) (Rev 1).cht', 'Tetris Blast (USA).cht']), 'Tetris (World) (Rev 1).cht');
  assert.equal(T.pickFile('Golden Axe', ['Golden Axe (Europe).cht', 'Golden Axe (USA).cht', 'Golden Axe Warrior (USA).cht']), 'Golden Axe (USA).cht');
  assert.deepEqual(T.parse('cheats = 2\ncheat0_desc = "Infinite Lives"\ncheat0_code = "7E0DBE09"\ncheat0_enable = false\ncheat1_desc = ""\ncheat1_code = "X"\n'),
    [{ name: 'Infinite Lives', code: '7E0DBE09' }]);
  const dir = path.join(PLAY, 'cheats');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    assert.equal(j.licence, 'CC-BY-SA-4.0', f);
    assert.match(j.source, /^https:\/\/github\.com\/libretro\/libretro-database\/blob\/master\/cht\//, f);
    assert.ok(cards.some((c) => c.id === j.game && Cards.isPad(c)), f + ' is for a console card');
    assert.ok(j.cheats.length >= 1 && j.cheats.length <= 40, f);
  }
  assert.match(fs.readFileSync(path.join(PLAY, 'core', 'host.c'), 'utf8'), /EMSCRIPTEN_KEEPALIVE void host_cheat_set\(unsigned index, int enabled, const char \*code\)/);
  for (const core of ['snes9x', 'fceumm', 'gambatte', 'genesis-plus-gx', 'mgba']) assert.ok(fs.readFileSync(path.join(PLAY, 'engine', core + '.js'), 'utf8').includes('host_cheat_set'), core + ' exports the cheat call');
  const js = fs.readFileSync(path.join(PLAY, 'src', 'play.js'), 'utf8');
  for (const bit of ["const CHEAT_CORES = ['snes9x', 'fceumm', 'gambatte', 'genesis-plus-gx', 'mgba'];", "runner.start(card, base, build.commit.slice(0, 12) + HOST_V);", "localStorage.setItem(cheatKey()"]) assert.ok(js.includes(bit), bit);
  const page = fs.readFileSync(path.join(PLAY, 'game.html'), 'utf8');
  assert.ok(page.includes('id="m-cheats"') && page.includes('CC BY-SA 4.0'), 'the menu has the switch and the credit');
  assert.ok(fs.readFileSync(path.join(PLAY, '..', 'scripts', 'site.js'), 'utf8').includes("for (const d of ['src', 'cards', 'engine', 'cheats'])"), 'the site build copies the cheat lists');
});

test('cheats audit: a code under two names goes, the useful ones come first, risky ones are marked; a pad reaches the switches; switches are kept by code', () => {
  const T = require('../tools/cheats.js');
  const cht = ['cheats = 5', 'cheat0_desc = "Nintendo Debug"', 'cheat0_code = "AAAA"', 'cheat1_desc = "Blocks give a mushroom"', 'cheat1_code = "7E0DB4DD"',
    'cheat2_desc = "Blocks give a flower"', 'cheat2_code = "7E0DB4DD"', 'cheat3_desc = "Infinite Lives"', 'cheat3_code = "7E0DBE09"', 'cheat4_desc = "Music mod"', 'cheat4_code = "7E0DDA00"'].join('\n');
  assert.deepEqual(T.parse(cht), [{ name: 'Infinite Lives', code: '7E0DBE09' }, { name: 'Music mod', code: '7E0DDA00' }, { name: 'Nintendo Debug', code: 'AAAA', risky: true }]);
  const js = fs.readFileSync(path.join(PLAY, 'src', 'play.js'), 'utf8');
  for (const bit of ["items.splice(at, 0, ...$('cheat-list').querySelectorAll('input'));", "if (cheatsOpen) { showCheats(false); go($('m-cheats')); }",
    'JSON.stringify([...cheatsOn].map((n) => cheatList[n].code))', "(ch.risky ? ' (can break the game)' : '')"]) assert.ok(js.includes(bit), bit);
});
