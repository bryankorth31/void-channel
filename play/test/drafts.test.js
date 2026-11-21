// PLAY G3 and G4: draft cards in bulk from an Archive collection, and the approve page where Bryan decides each one.
// Run: node --test "play/test/*.test.js"
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const PLAY = path.join(__dirname, '..');
const D = require('../tools/drafts.js');
const Cards = require('../src/cards.js');

test('G3: the machine comes from the Archive record or the collection, and only machines PLAY has an engine for are drafted', () => {
  assert.equal(D.machineOf({ emulator: 'dosbox' }, 'softwarelibrary_kids'), 'dos');
  assert.equal(D.machineOf({}, 'atari_2600_library'), 'a2600');
  assert.equal(D.machineOf({ emulator: 'apple2ee' }, 'softwarelibrary_kids'), null, 'no Apple II engine yet');
});

test('G3: a DOS draft carries the Archive facts and its start program, passes the card check, and says what a person must look at', () => {
  const rec = { identifier: 'msdos_Number_Munchers_1990', title: 'Number Munchers', year: '1990', creator: 'MECC', emulator: 'dosbox', emulator_start: 'NUMBERM/NM.EXE' };
  const c = D.draft(rec, { name: 'Number_Munchers_1990.zip', size: '281000' }, 'dos', 'softwarelibrary_kids');
  assert.equal(c.id, 'number-munchers-1990');
  assert.equal(c.archive.start, 'NUMBERM/NM.EXE');
  assert.equal(c.archive.size, 281000);
  assert.deepEqual(Cards.check(c), []);
  assert.deepEqual(c.genre, ['educational video game'], 'a learning collection says its kind');
  assert.deepEqual(c.draft.needs, ['keys and mouse']);
  const other = D.draft({ identifier: 'x', title: 'Pitfall II' }, { name: 'p.a26', size: 8192 }, 'a2600', 'atari_2600_library');
  assert.deepEqual(other.draft.needs, ['button words', 'year', 'genre']);
  assert.deepEqual(Cards.check(other), []);
});

test('G3: titles read naturally and ids are plain', () => {
  assert.equal(D.cleanTitle('Oregon Trail, The'), 'The Oregon Trail');
  assert.equal(D.cleanTitle('Math Shop Jr. (woz-a-day collection)'), 'Math Shop Jr.');
  assert.equal(D.slug("Reader Rabbit's Ready for Letters", 1992), 'reader-rabbits-ready-for-letters-1992');
});

test('G4: the approve page and the drafts stay on this PC, only a page from the same server may decide, and Try it plays a draft', () => {
  const site = fs.readFileSync(path.join(PLAY, '..', 'scripts', 'site.js'), 'utf8');
  assert.ok(site.includes("for (const d of ['src', 'cards', 'engine', 'cheats', 'library', 'skin']"), 'the site copies only these folders, never tools or drafts');
  const serve = fs.readFileSync(path.join(PLAY, 'serve.js'), 'utf8');
  for (const bit of ["if (req.method !== 'POST' || req.headers['sec-fetch-site'] !== 'same-origin')", "['shelf', 'kids', 'skip'].includes(d.decision)",
    "if (d.decision === 'kids') card.kids = true;", "const safeName = (x) => typeof x === 'string' && /^[A-Za-z0-9._-]{1,120}$/.test(x);"]) assert.ok(serve.includes(bit), bit);
  assert.ok(fs.readFileSync(path.join(PLAY, 'src', 'play.js'), 'utf8').includes("fetch((/^[A-Za-z0-9._-]+$/.test(q.get('draft') || '') ? 'drafts/' + q.get('draft') + '/' : 'cards/')"));
  const html = fs.readFileSync(path.join(PLAY, 'tools', 'approve.html'), 'utf8');
  for (const label of ['Try it', 'Shelf and Kids', 'Skip']) assert.ok(html.includes("'" + label + "'"), label);
});

test('audit D-1, D-2 and the boot results: the approve API answers this computer\'s own address only, shows the boot checks, and a slow DOS start says so', () => {
  const serve = fs.readFileSync(path.join(PLAY, 'serve.js'), 'utf8');
  assert.ok(serve.includes(String.raw`if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host || '')) return send(res, 403, { error: 'This computer only' });`));
  assert.ok(serve.includes("'audit', 'play-mode', 'drafts-boot', col + '.json'"));
  assert.ok(fs.readFileSync(path.join(PLAY, 'tools', 'approve.html'), 'utf8').includes("'Boots: first picture at '"));
  const js = fs.readFileSync(path.join(PLAY, 'src', 'play.js'), 'utf8');
  assert.ok(js.includes("if (!PlayCards.isPad(card) && !isFlash()) blankWatch();"));
  assert.ok(js.includes("toast('Older games can take half a minute to start')"));
});

test('G3 (audit, 20 Nov 2026): a maker field that holds a piece of the description comes out blank', () => {
  assert.equal(D.makerOf({ creator: 'games, SS is a painstakingly detailed spaceflight simulator that allows' }), '');
  assert.equal(D.makerOf({ creator: 'MECC' }), 'MECC');
  assert.equal(D.makerOf({ creator: 'Sierra On-Line, Inc.' }), 'Sierra On-Line, Inc.');
  assert.equal(D.makerOf({ creator: ['a long sentence that is not a name at all'], publisher: 'Microsoft' }), 'Microsoft');
  assert.equal(D.makerOf({}), '');
});

test('G3 (audit, 20 Nov 2026): a drafted DOS game has the mouse on, and the Archive spelling Bro/derbund reads Brøderbund', () => {
  const c = D.draft({ identifier: 'x', title: 'X', year: 1991 }, { name: 'x.zip', size: 1 }, 'dos', 'softwarelibrary_kids');
  assert.equal(c.controls.mouse, true);
  assert.match(c.help, /mouse/);
  assert.equal(D.makerOf({ creator: 'Bro/derbund Software, Inc.' }), 'Brøderbund Software, Inc.');
});
