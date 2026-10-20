// Shows kept off Live TV (catalog/live-tv-off.json): they leave the mixed channels but stay on their own network.
// Run: node --test tests/live-tv-off.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { channelLists } = require('../scripts/lib/app');

const show = (slug, over) => Object.assign({ slug, show: slug, type: 'Comedy', network: 'Net A', tags: ['Sketch'], eps: 20 }, over);
const SHOWS = [
  show('keep-1'), show('keep-2'), show('off-1'), show('off-2', { network: 'Net B' }), show('off-3', { network: 'Net B' }),
  show('late-off', { type: 'Late Night' }), show('late-on', { type: 'Late Night' }), show('movie-off', { network: '' }), show('movie-on', { network: '' }),
];
const OFF = new Set(['off-1', 'off-2', 'off-3', 'late-off', 'movie-off']);
const byId = (r) => Object.fromEntries(r.lists.map((L) => [L.id, L.list.map((s) => s.slug)]));

test('a show kept off Live TV leaves The Void, the rows, the collections, movies and Late Night', () => {
  const ch = byId(channelLists(SHOWS, ['Comedy'], OFF));
  for (const id of ['void', 'row-comedy', 'tag-sketch']) for (const s of OFF) assert.ok(!ch[id].includes(s), s + ' is not on ' + id);
  assert.deepEqual(ch['movies'], ['movie-on']);
  assert.deepEqual(ch['row-late-night'], ['late-on']);
});

test('it stays on its own network, so a network made only of such shows keeps its channel', () => {
  const ch = byId(channelLists(SHOWS, ['Comedy'], OFF));
  assert.deepEqual(ch['net-net-a'], ['keep-1', 'keep-2', 'off-1']);
  assert.deepEqual(ch['net-net-b'], ['off-2', 'off-3']);
});

test('the places the page indexes do not move when shows are kept off', () => {
  const a = channelLists(SHOWS, ['Comedy'], OFF).idx, b = channelLists(SHOWS, ['Comedy'], new Set()).idx;
  assert.deepEqual([...a], [...b]);
});

test('with no list, every channel is as before', () => {
  assert.deepEqual(byId(channelLists(SHOWS, ['Comedy'])), byId(channelLists(SHOWS, ['Comedy'], new Set())));
});
