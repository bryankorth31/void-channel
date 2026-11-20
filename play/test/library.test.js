// Whole collections (plan C1, C2, C4, C6; Bryan, 20 Nov 2026: "Yes that's right ... pull in the Sega libraries and build
// the NES libraries as well"). Run: node --test "play/test/*.test.js"
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Lib = require('../tools/library.js');
const ShelfTool = require('../tools/shelf.js');

const row = (o) => Object.assign({ system: 'sms', title: 'Fantasy Zone (USA, Europe)', item: 'fz-item', file: 'Fantasy Zone (USA, Europe).sms', size: 131072, year: 1986, publisher: 'Sega', source: 'curated', ok: true }, o);

test('C1: only Bryan\'s approved collections, each naming its machine and his words', () => {
  const list = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'collections.json'), 'utf8')).collections;
  assert.deepEqual([...new Set(list.map((c) => c.system))].sort(), ['a2600', 'gamegear', 'genesis', 'nes', 'sms']);
  for (const c of list) assert.match(c.approvedBy, /^Bryan, 20 Nov 2026/);
  assert.deepEqual(list.find((c) => c.system === 'genesis').leaveOut, ['genesisvariations', 'sonicromhacks']);
  assert.ok(!list.some((c) => c.system === 'dos'), 'DOS waits for the content screen');
});

test('C2: a game that started becomes a card with its machine\'s controls; one that did not stays off', () => {
  const cards = Lib.build([row(), row({ item: 'bad', title: 'Broken', ok: false, why: 'black' })], { ids: [], items: [] });
  assert.equal(cards.length, 1);
  const c = cards[0];
  assert.equal(c.id, 'fantasy-zone-sms'); assert.equal(c.title, 'Fantasy Zone'); assert.equal(c.core, 'genesis-plus-gx');
  assert.equal(c.controls.kind, 'pad'); assert.match(c.added, /Whole collections/);
  const a26 = Lib.build([row({ system: 'a2600', title: 'Combat', item: 'combat', file: 'Combat.bin', size: 2048 })], { ids: [], items: [] })[0];
  assert.equal(a26.core, 'stella2014'); assert.ok(a26.actions.some((x) => x.do === 'New game (Reset)'));
});

test('C6: a hand-made card wins (same item or same id), and two rows making the same id keep the first', () => {
  assert.equal(Lib.build([row()], { ids: [], items: ['fz-item'] }).length, 0);
  assert.equal(Lib.build([row()], { ids: ['fantasy-zone-sms'], items: [] }).length, 0);
  assert.equal(Lib.build([row(), row({ item: 'fz-2' })], { ids: [], items: [] }).length, 1);
});

test('C2: bundles of 500, named <machine>/<n> (Cloudflare takes 20,000 files a deploy)', () => {
  const many = Array.from({ length: 1201 }, (_, i) => ({ id: 'g' + i }));
  assert.deepEqual(Lib.bundles('genesis', many).map((b) => [b.name, b.cards.length]), [['genesis/1', 500], ['genesis/2', 500], ['genesis/3', 201]]);
});

test('C4: a collection\'s game is a short line on the shelf with its bundle; how it plays is said once per machine', () => {
  const c = Object.assign(Lib.build([row()], { ids: [], items: [] })[0], { __b: 'sms/1' });
  const ix = ShelfTool.buildIndex([c], { checked: null, games: {} });
  const g = ix.games[0];
  assert.equal(g.b, 'sms/1'); assert.ok(!('how' in g) && !('help' in g));
  assert.ok(ix.libHow.sms.how.keyboard.length && ix.libHow.sms.help);
  const text = ShelfTool.indexText(ix);
  assert.deepEqual(JSON.parse(text), ix); assert.equal(text.split('\n').length, 4, 'one game a line');
});

test('C4: the shelf links carry the bundle, shows a page at a time, and the game page reads a bundle', () => {
  const shelf = fs.readFileSync(path.join(__dirname, '..', 'src', 'shelf.js'), 'utf8');
  assert.ok(shelf.includes("(g.b ? '&b=' + encodeURIComponent(g.b) : '')"));
  assert.ok(shelf.includes('const PAGE_FIRST = 24, PAGE_MORE = 48;'));
  const play = fs.readFileSync(path.join(__dirname, '..', 'src', 'play.js'), 'utf8');
  assert.ok(play.includes("fetch('library/' + b + '.json')") && play.includes("fromBundle(id, q.get('b'))"));
});

test('C2: the assistant\'s rows carry the start-up check as boot: { ok }', () => {
  const r = row(); delete r.ok;
  assert.equal(Lib.build([Object.assign({}, r, { boot: { ok: true, at: '2026-11-20' } })], { ids: [], items: [] }).length, 1);
  assert.equal(Lib.build([Object.assign({}, r, { boot: { ok: false, why: 'one flat colour' } })], { ids: [], items: [] }).length, 0);
  assert.equal(Lib.build([r], { ids: [], items: [] }).length, 0, 'not checked: not on the shelf');
});
