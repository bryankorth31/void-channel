// VoidTV PLAY: console batch 2 (Game Boy Advance on mGBA, Atari Lynx on Handy). Licence: GPL-2.0-or-later (play/LICENSE).
// Bryan, 20 Nov 2026: "lets now build it out". The cards wait in play/test/staged-cards/ until the player lists the
// engines, then move to play/cards/; these checks hold in either place.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '..');
const RECIPES = require(path.join(ROOT, 'core', 'cores.js'));
const Cards = require(path.join(ROOT, 'src', 'cards.js'));
const BATCH = {
  mgba: { system: 'gba', card: 'kirby-amazing-mirror-gba', licence: /^MPL-2\.0/, licenceFile: /Mozilla Public License Version 2\.0/ },
  handy: { system: 'lynx', card: 'ms-pac-man-lynx', licence: /^zlib/, licenceFile: /Permission is granted to anyone to use this software/ },
};
const PAD_BUTTON = /^P[12]:(B|Y|Select|Start|Up|Down|Left|Right|A|X|L|R|L2|R2|L3|R3)$/;

function findCard(id) {
  for (const dir of [path.join(ROOT, 'cards'), path.join(__dirname, 'staged-cards')]) {
    const f = path.join(dir, id + '.json');
    if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  }
  return null;
}

for (const [name, want] of Object.entries(BATCH)) {
  test(name + ': the recipe names its exact source, licence and system', () => {
    const r = RECIPES[name];
    assert.ok(r, 'a recipe in core/cores.js');
    assert.match(r.repo, /^https:\/\/github\.com\/libretro\//, 'from libretro on GitHub');
    assert.match(r.commit, /^[0-9a-f]{40}$/);
    assert.match(r.licence, want.licence);
    assert.deepEqual(r.systems, [want.system]);
    assert.ok(r.files.length > 0 && r.include.length > 0);
  });

  test(name + ': both engine files are built, and the script says what it is and where its source is', () => {
    const r = RECIPES[name];
    for (const ext of ['.js', '.wasm']) assert.ok(fs.existsSync(path.join(ROOT, 'engine', name + ext)), name + ext);
    const first = fs.readFileSync(path.join(ROOT, 'engine', name + '.js'), 'utf8').split('\n')[0];
    assert.ok(first.startsWith('/* ' + r.title + ', a libretro core built unchanged by voidtv.net'), first.slice(0, 80));
    assert.ok(first.includes(r.repo + '/tree/' + r.commit), 'the exact source');
    assert.ok(first.includes('Licence: ' + r.licence), 'the licence');
  });

  test(name + ': its licence travels beside it, unchanged', () => {
    const f = path.join(ROOT, 'engine', name + '.LICENSE.txt');
    assert.ok(fs.existsSync(f));
    assert.match(fs.readFileSync(f, 'utf8'), want.licenceFile);
  });

  test(name + ': the papers name the same commit (core/README.md, SOURCES.md)', () => {
    const readme = fs.readFileSync(path.join(ROOT, 'core', 'README.md'), 'utf8');
    const sources = fs.readFileSync(path.join(ROOT, 'SOURCES.md'), 'utf8');
    assert.ok(readme.includes(RECIPES[name].commit), 'core/README.md');
    assert.ok(sources.includes(RECIPES[name].repo), 'SOURCES.md');
  });

  test(name + ': its card is a good console card that plays from the Archive', () => {
    const card = findCard(want.card);
    assert.ok(card, want.card + '.json in play/cards or play/test/staged-cards');
    assert.equal(card.core, name);
    assert.equal(card.system, want.system);
    assert.equal(card.controls.kind, 'pad');
    assert.match(card.archive.item, /^[A-Za-z0-9._-]+$/);
    assert.ok(Number.isInteger(card.archive.size) && card.archive.size > 0, 'archive.size recorded');
    for (const k of card.controls.keys) assert.match(k, PAD_BUTTON, k);
    for (const k of Object.keys(card.controls.labels || {})) assert.ok(card.controls.keys.includes(k), 'label for a drawn key: ' + k);
    assert.ok(card.actions.length >= 3 && card.actions.length <= 6, '3 to 6 actions');
    for (const a of card.actions) {
      assert.ok(a.do, 'each action says what it does');
      for (const k of [].concat(a.press)) assert.match(k, PAD_BUTTON, a.do + ': ' + k);
    }
    // Once the player lists the engine, the card passes the player's own check too.
    if (Cards.CORES[name]) assert.deepEqual(Cards.check(card), []);
    assert.match(Cards.gameUrl(Object.assign({}, card)), /^https:\/\/archive\.org\/cors\//);
  });
}

test('no game file and no BIOS ships with the engines', () => {
  const files = fs.readdirSync(path.join(ROOT, 'engine'));
  for (const f of files) assert.doesNotMatch(f, /\.(gba|gb|gbc|lnx|lyx|img|rom|bin|zip)$/i, f);
});
